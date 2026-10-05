// One freshly migrated database per browser run. Playwright owns this process and stops it
// after the suite; the finally block drops only the generated msr_e2e_* database.
import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import postgres from "postgres";
import { mapFixtureRelease, writeMapFixture } from "../e2e/support/map-fixture.mjs";
import { localLoadBalancer } from "../load/local-balancer";
import { runMigrations } from "../src/db/migrate";
import { installMapRelease } from "./map-release.mjs";

const adminUrl = process.env.TEST_DATABASE_URL;
const databaseUrl = process.env.E2E_DATABASE_URL;
if (!adminUrl || !databaseUrl) throw new Error("E2E requires a disposable TEST_DATABASE_URL.");
const target = new URL(databaseUrl);
const source = new URL(adminUrl);
const database = target.pathname.slice(1);
if (
  !/^msr_e2e_[a-f0-9]{32}$/.test(database) ||
  target.host !== source.host ||
  target.protocol !== source.protocol ||
  target.username !== source.username ||
  target.password !== source.password
) {
  throw new Error("Refusing an E2E database outside the generated disposable-test scope.");
}
const replicas = Number(process.env.LOAD_REPLICAS ?? 1);
if (
  ![1, 2].includes(replicas) ||
  (replicas === 2 &&
    (process.env.MSR_LOAD_SCOPE !== "local-synthetic" ||
      !["localhost", "127.0.0.1", "[::1]", "host.docker.internal"].includes(source.hostname)))
)
  throw new Error("Replica mode requires the explicitly local disposable load configuration.");
const admin = postgres(adminUrl, { max: 1, onnotice: () => {} });
const children = new Set<ChildProcess>();
let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    stopping = true;
    for (const child of children) child.kill(signal);
  });
}

async function launchNext(args: string[]) {
  if (stopping) return 0;
  const profile = process.env.MSR_LOAD_PROFILE === "1" && args[0] === "start";
  const profileDirectory = join(process.cwd(), "test-results", database.slice("msr_e2e_".length));
  if (profile) await mkdir(profileDirectory, { recursive: true });
  if (stopping) return 0;
  const completion = new Promise<number>((resolve, reject) => {
    // Keep localhost on IPv4 for Next's internal redirect fetch as well as its listener.
    // Linux may otherwise bind ::1 while the action redirect targets 127.0.0.1.
    const child = spawn(
      process.execPath,
      [
        "--dns-result-order=ipv4first",
        ...(profile
          ? [
              "--cpu-prof",
              `--cpu-prof-dir=${profileDirectory}`,
              "--import",
              "./scripts/load-runtime-metrics.mjs",
            ]
          : []),
        "node_modules/next/dist/bin/next",
        ...args,
      ],
      {
        stdio: "inherit",
        env: { ...process.env, DATABASE_URL: databaseUrl },
      },
    );
    children.add(child);
    child.once("error", (error) => {
      children.delete(child);
      reject(error);
    });
    child.once("exit", (code) => {
      children.delete(child);
      resolve(code ?? (stopping ? 0 : 1));
    });
  });
  return completion;
}
async function next(args: string[]): Promise<number> {
  return stopping ? 0 : launchNext(args);
}

async function replicatedNext(): Promise<number> {
  const port = Number(process.env.E2E_PORT ?? "3100");
  if (!Number.isInteger(port) || port < 1 || port > 65533)
    throw new Error("Invalid disposable load port");
  const ports = [port + 1, port + 2];
  const balancer = localLoadBalancer(ports);
  const completions = ports.map((backend) =>
    launchNext(["start", "--hostname", "localhost", "--port", String(backend)]),
  );
  let ended = false;
  const completion = Promise.race(completions).then(
    (code) => {
      ended = true;
      return { code, error: undefined };
    },
    (error: unknown) => {
      ended = true;
      return { code: 1, error };
    },
  );
  try {
    await Promise.all(
      ports.map(async (backend) => {
        const deadline = Date.now() + 120_000;
        while (!stopping && !ended && Date.now() < deadline) {
          try {
            // The app accepts the localhost health host; 127.0.0.1 is a different host and
            // receives the deliberate public-route 404 even after Next has started.
            const response = await fetch(`http://localhost:${backend}/api/health`, {
              signal: AbortSignal.timeout(1000),
            });
            await response.body?.cancel();
            if (response.ok) return;
          } catch {
            // Still starting; a child exit or bounded deadline fails the whole cohort.
          }
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        throw new Error("Load replica did not become ready");
      }),
    );
    if (stopping || ended) throw new Error("Load replica stopped before listening");
    await new Promise<void>((resolve, reject) => {
      balancer.server.once("error", reject);
      balancer.server.listen(port, "127.0.0.1", resolve);
    });
    console.log("Local synthetic load: two web processes share one build and disposable database.");
    const result = await completion;
    if (result.error) throw result.error;
    return stopping ? 0 : result.code || 1;
  } finally {
    await balancer.close();
    for (const child of children) child.kill("SIGTERM");
    await Promise.allSettled(completions);
  }
}

let created = false;
try {
  await admin.unsafe(`create database "${database}"`);
  created = true;
  await runMigrations(databaseUrl);
  console.log("Fresh disposable browser database migrated.");
  if (process.env.E2E_MAP_ASSETS_DIR) {
    process.env.MAP_RELEASE_ID = await installMapRelease(
      process.env.E2E_MAP_ASSETS_DIR,
      join(process.cwd(), "public/maps"),
    );
    console.log(`Using verified local atlas ${process.env.MAP_RELEASE_ID}; not live R2 evidence.`);
  } else {
    await writeMapFixture();
    process.env.MAP_RELEASE_ID = mapFixtureRelease;
  }
  // This harness invokes Next directly, so npm's prebuild hook does not run. Prepare the
  // pinned same-origin worker for fresh and previously compiled candidates alike.
  const mapRuntime = spawnSync(process.execPath, ["scripts/map-runtime.mjs"], { stdio: "inherit" });
  if (mapRuntime.error) throw mapRuntime.error;
  if (mapRuntime.status !== 0) throw new Error("Map runtime preparation failed");
  const built = process.env.CI || process.env.E2E_SKIP_BUILD === "1" ? 0 : await next(["build"]);
  process.exitCode =
    built ||
    (replicas === 2
      ? await replicatedNext()
      : await next(["start", "--hostname", "localhost", "--port", process.env.E2E_PORT ?? "3100"]));
} finally {
  if (created) await admin.unsafe(`drop database if exists "${database}" with (force)`);
  await admin.end();
  const ownFiles = join(tmpdir(), `msr-e2e-files-${database.slice("msr_e2e_".length)}`);
  if (process.env.E2E_FILE_STORAGE_ROOT === ownFiles)
    await rm(ownFiles, { recursive: true, force: true });
}
