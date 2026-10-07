#!/usr/bin/env node
// CI-only ClamAV lifecycle. Image updates still require normal CVD verification, and the
// application adapter must prove freshness plus a real byte scan before tests can run.
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { freemem, totalmem } from "node:os";

const image =
  "clamav/clamav@sha256:0e31ce089574268aefa0b543767d66b70240ab51ed49eec53e07f18d5629d817";
const name = `ci-clamav-${randomUUID().slice(0, 8)}`;
const port = Number(process.env.CI_CLAMAV_PORT ?? 53317);
const [command, ...args] = process.argv.slice(2);
if (!command || !Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(
    "Usage: node scripts/ci-clamav.mjs <command> [args…]; CI_CLAMAV_PORT must be a valid port",
  );
  process.exit(2);
}

let containerId;
let activeChild;
let interrupted;
let exitCode = 1;

function terminateChild(signal) {
  if (!activeChild?.pid) return;
  try {
    // Only this script's detached child group, never another task or the Docker daemon.
    if (process.platform === "win32") activeChild.kill(signal);
    else process.kill(-activeChild.pid, signal);
  } catch {
    /* The child may have just exited. */
  }
}
for (const [signal, code] of [
  ["SIGINT", 130],
  ["SIGTERM", 143],
]) {
  process.on(signal, () => {
    interrupted ??= code;
    terminateChild(signal);
  });
}

function docker(args, { timeout = 10_000, required = false } = {}) {
  const result = spawnSync("docker", args, { encoding: "utf8", timeout, maxBuffer: 128 * 1024 });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error)
    console.error(`docker ${args[0]}: ${result.error.code ?? result.error.message}`);
  if (required && (result.error || result.status !== 0))
    throw new Error(
      `docker ${args[0]} failed (${result.status ?? result.signal ?? "spawn error"})`,
    );
  return result;
}

function run(program, arguments_, env, timeoutMs) {
  if (interrupted) return Promise.resolve(interrupted);
  return new Promise((resolve) => {
    const child = spawn(program, arguments_, {
      env,
      stdio: "inherit",
      detached: process.platform !== "win32",
    });
    activeChild = child;
    let timedOut = false;
    let killTimer;
    const timer = setTimeout(() => {
      timedOut = true;
      console.error(`CI scanner command exceeded ${timeoutMs}ms`);
      terminateChild("SIGTERM");
      killTimer = setTimeout(() => terminateChild("SIGKILL"), 5000);
    }, timeoutMs);
    const finish = (code) => {
      clearTimeout(timer);
      clearTimeout(killTimer);
      activeChild = undefined;
      resolve(interrupted ?? (timedOut ? 124 : code));
    };
    child.once("error", (error) => {
      console.error(`Could not start scanner command: ${error.code ?? "spawn error"}`);
      finish(1);
    });
    child.once("close", (code, signal) => finish(code ?? (signal === "SIGINT" ? 130 : 143)));
  });
}

function diagnostics() {
  console.error("::group::ClamAV failure diagnostics (bounded; no environment dump)");
  console.error(
    `image=${image} container=${containerId ?? "not created"} hostMemory=${freemem()}/${totalmem()}`,
  );
  docker(["info", "--format", "Docker memory bytes={{.MemTotal}} CPUs={{.NCPU}}"]);
  if (containerId) {
    docker([
      "inspect",
      "--format",
      "State={{json .State}} MemoryLimit={{.HostConfig.Memory}} SwapLimit={{.HostConfig.MemorySwap}} Ports={{json .NetworkSettings.Ports}}",
      containerId,
    ]);
    docker(["logs", "--timestamps", "--tail", "200", containerId]);
    docker([
      "stats",
      "--no-stream",
      "--format",
      "{{.Name}} CPU={{.CPUPerc}} Memory={{.MemUsage}} PIDs={{.PIDs}}",
      containerId,
    ]);
    docker(["top", containerId, "-eo", "pid,ppid,stat,rss,comm"]);
    docker([
      "exec",
      containerId,
      "sh",
      "-c",
      "cat /sys/fs/cgroup/memory.events 2>/dev/null || true; tail -n 80 /var/log/clamav/freshclam.log /var/log/clamav/clamd.log 2>/dev/null || true",
    ]);
  }
  console.error("::endgroup::");
}

try {
  console.log(`Starting CI scanner ${name} from ${image}`);
  docker(["pull", image], { required: true, timeout: 120_000 });
  if (interrupted) throw new Error("Interrupted before scanner creation");
  const created = docker(
    [
      "create",
      "--pull=never",
      "--name",
      name,
      "--memory=6g",
      "--memory-swap=6g",
      "-e",
      "TZ=UTC",
      "-e",
      "CLAMD_STARTUP_TIMEOUT=240",
      "-e",
      "CLAMAV_NO_FRESHCLAMD=true",
      "-p",
      `127.0.0.1:${port}:3310`,
      "--entrypoint",
      "/bin/sh",
      image,
      "-ec",
      "echo 'Updating and validating ClamAV signatures before daemon startup'; freshclam --foreground --stdout; echo 'Signature update succeeded; starting clamd'; exec /init",
    ],
    { required: true, timeout: 30_000 },
  );
  const createdId = created.stdout.trim();
  if (!/^[a-f0-9]{64}$/.test(createdId))
    throw new Error("Docker returned an invalid container identity");
  containerId = createdId;
  docker(["start", containerId], { required: true, timeout: 30_000 });
  const env = {
    ...process.env,
    CLAMAV_HOST: "127.0.0.1",
    CLAMAV_PORT: String(port),
    REAL_CLAMAV_PORT: String(port),
    E2E_REAL_SCAN: "1",
  };
  exitCode = await run(
    process.execPath,
    ["--conditions=react-server", "--import", "tsx", "scripts/wait-clamav.ts"],
    env,
    310_000,
  );
  if (exitCode === 0) exitCode = await run(command, args, env, 45 * 60_000);
} catch (error) {
  console.error(error instanceof Error ? error.message : "CI scanner setup failed");
  exitCode = interrupted ?? 1;
} finally {
  if (exitCode !== 0 || interrupted) diagnostics();
  if (containerId) {
    // Remove only the exact container created above; retain the original failing exit code.
    const cleanup = docker(["rm", "--force", "--volumes", containerId], { timeout: 20_000 });
    if ((cleanup.error || cleanup.status !== 0) && exitCode === 0) exitCode = 1;
  }
}
process.exitCode = interrupted ?? exitCode;
