// Local packaging proof only: one disposable database and exactly two named containers.
// No provider credentials, network delivery, deployment or release approval is supplied.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import postgres from "postgres";

const source = new URL(process.env.TEST_DATABASE_URL || "postgres://invalid");
assert(
  ["127.0.0.1", "localhost", "[::1]"].includes(source.hostname),
  "Local disposable PostgreSQL is required",
);
const image = process.argv[2] || "msr-delivery:local";
const hostFlags =
  process.platform === "linux" ? ["--add-host", "host.docker.internal:host-gateway"] : [];
const id = randomUUID().replaceAll("-", "");
const database = `msr_container_${id}`;
const webName = `msr-smoke-web-${id}`;
const workerName = `msr-smoke-worker-${id}`;
const temporary = await mkdtemp(join(tmpdir(), "msr-container-smoke-"));
const root = postgres(source.toString(), { max: 1, onnotice: () => {} });
const localDatabase = new URL(source);
localDatabase.pathname = `/${database}`;
const containerDatabase = new URL(localDatabase);
containerDatabase.hostname = "host.docker.internal";
const db = postgres(localDatabase.toString(), { max: 1, onnotice: () => {} });
const originSecret = randomBytes(32).toString("hex");
const common = {
  DATABASE_URL: containerDatabase.toString(),
  AUTH_SECRET: randomBytes(32).toString("hex"),
  HERMES_ENABLED: "0",
  WORKER_HEARTBEAT_URL: "",
};
const docker = (...args) =>
  execFileSync("docker", args, {
    encoding: "utf8",
    timeout: 60_000,
    maxBuffer: 1024 * 1024,
  }).trim();
async function environment(name, values) {
  const path = join(temporary, name);
  await writeFile(
    path,
    Object.entries({ ...common, ...values })
      .map(([key, value]) => `${key}=${value}`)
      .join("\n"),
    { mode: 0o600 },
  );
  return path;
}
async function until(check, message) {
  const deadline = Date.now() + 30_000;
  do {
    try {
      if (await check()) return;
    } catch {
      /* A starting process may not listen yet. */
    }
    await setTimeout(250);
  } while (Date.now() < deadline);
  throw new Error(message);
}
const passed = [];
try {
  await root.unsafe(`CREATE DATABASE "${database}"`);
  const migrationEnv = await environment("migration.env", {});
  docker(
    "run",
    ...hostFlags,
    "--rm",
    "--env-file",
    migrationEnv,
    image,
    "node",
    "--conditions=react-server",
    "dist-runtime/migrate.mjs",
  );
  const [{ count }] = await db`select count(*)::int as count from drizzle.__drizzle_migrations`;
  assert(count > 0);
  docker(
    "run",
    ...hostFlags,
    "--rm",
    "--env-file",
    migrationEnv,
    image,
    "node",
    "--conditions=react-server",
    "dist-runtime/migrate.mjs",
  );
  assert.equal(
    (await db`select count(*)::int as count from drizzle.__drizzle_migrations`)[0].count,
    count,
  );
  passed.push("bundled migrations apply and replay without duplication");
  const webEnv = await environment("web.env", {
    APP_ORIGIN: "https://app.msr-smoke.invalid",
    PUBLIC_ORIGIN: "https://msr-smoke.invalid",
    CANONICAL_ORIGIN: "https://msr-smoke.invalid",
    CLIENT_ORIGIN: "https://my.msr-smoke.invalid",
    STAFF_ORIGIN: "https://app.msr-smoke.invalid",
    MEDIA_PUBLIC_BASE_URL: "https://msr-smoke.invalid/api/media",
    ORIGIN_VERIFY_SECRET: originSecret,
  });
  docker(
    "run",
    ...hostFlags,
    "-d",
    "--name",
    webName,
    "-p",
    "127.0.0.1::3000",
    "--env-file",
    webEnv,
    image,
  );
  const port = docker("port", webName, "3000/tcp").split(":").at(-1);
  const base = `http://127.0.0.1:${port}`;
  await until(
    async () => (await fetch(`${base}/api/health`)).ok,
    "Container web did not become healthy",
  );
  const health = await (await fetch(`${base}/api/health`)).json();
  assert.equal(health.status, "ok");
  assert.equal((await fetch(`${base}/en`)).status, 404);
  assert.equal(
    (
      await fetch(`${base}/en`, {
        headers: { "x-msr-origin-token": originSecret, "x-msr-public-host": "foreign.invalid" },
      })
    ).status,
    404,
  );
  passed.push("untrusted origin and foreign-host requests are denied");
  for (const [host, path, expected] of [
    ["msr-smoke.invalid", "/en", 200],
    ["my.msr-smoke.invalid", "/en/access", 200],
    ["app.msr-smoke.invalid", "/en/access", 200],
    ["app.msr-smoke.invalid", "/brand/logo-ms-realty.png", 200],
    ["msr-smoke.invalid", "/staff/en/today", 404],
  ]) {
    const response = await fetch(`${base}${path}`, {
      redirect: "manual",
      headers: {
        "x-msr-origin-token": originSecret,
        "x-msr-public-host": host,
        "x-middleware-subrequest": "proxy:proxy:proxy:proxy:proxy",
        "x-app-surface": "staff",
      },
    });
    assert.equal(response.status, expected, `${host}${path}`);
    const body = await response.text();
    assert(!body.includes(originSecret), "Origin secret appeared in response body");
    assert(
      !JSON.stringify([...response.headers]).includes(originSecret),
      "Origin secret appeared in response headers",
    );
  }
  passed.push(
    "three production host contexts and brand asset render through the origin boundary without secret leakage",
  );
  const workerEnv = await environment("worker.env", {
    APP_ORIGIN: "http://app.localhost:3000",
    PUBLIC_ORIGIN: "http://localhost:3000",
    CANONICAL_ORIGIN: "http://localhost:3000",
    CLIENT_ORIGIN: "http://my.localhost:3000",
    STAFF_ORIGIN: "http://app.localhost:3000",
    MEDIA_PUBLIC_BASE_URL: "http://localhost:3000/api/media",
    ENABLE_TEST_OUTBOX: "1",
    BUILD_SHA: "container-local-proof",
  });
  docker(
    "run",
    ...hostFlags,
    "-d",
    "--name",
    workerName,
    "--env-file",
    workerEnv,
    image,
    "node",
    "--conditions=react-server",
    "dist-runtime/worker.mjs",
  );
  await until(
    async () =>
      Boolean(
        (
          await db`select key from worker_progress where key='queue-worker' and build_sha='container-local-proof'`
        )[0],
      ),
    "Bundled worker did not record queue progress",
  );
  docker("stop", "--time", "20", workerName);
  assert.equal(docker("inspect", "--format", "{{.State.ExitCode}}", workerName), "0");
  passed.push(
    "bundled pg-boss worker executes a real job and exits cleanly on SIGTERM using loopback-only fake mail",
  );
  assert.equal(docker("exec", webName, "id", "-u"), "1000");
  passed.push("web runs as unprivileged uid 1000");
  // Both owned runtimes are offline before setting this synthetic restored-state marker.
  // Credential invalidation is exercised by the native restore/integration tests; this probe
  // verifies that the packaged web and bundled worker actually include their startup fence.
  docker("stop", "--time", "20", webName);
  const [heartbeat] = await db`select completed_at from worker_progress where key='queue-worker'`;
  await db`update recovery_control set state='quarantined', restore_id=${randomUUID()},
    snapshot_digest=${"0".repeat(64)}, quarantined_at=now(), invalidated='{}'::jsonb
    where key='runtime'`;
  docker("start", webName, workerName);
  for (const name of [webName, workerName]) {
    await until(
      () => docker("inspect", "--format", "{{.State.Status}}", name) === "exited",
      "Packaged runtime did not exit for the quarantined database",
    );
    assert.equal(docker("inspect", "--format", "{{.State.ExitCode}}", name), "1");
  }
  assert.deepEqual(
    (await db`select completed_at from worker_progress where key='queue-worker'`)[0],
    heartbeat,
  );
  passed.push("packaged web and worker exit before serving or processing a quarantined database");
  console.log(
    JSON.stringify(
      {
        kind: "local-container-proof",
        image,
        imageId: docker("image", "inspect", "--format", "{{.Id}}", image),
        migrationCount: count,
        passed,
        liveProvidersQualified: false,
      },
      null,
      2,
    ),
  );
} finally {
  for (const name of [workerName, webName]) {
    try {
      docker("rm", "-f", name);
    } catch {
      /* Only this run's exact names are removed. */
    }
  }
  await db.end();
  await root.unsafe(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
  await root.end();
  await rm(temporary, { recursive: true, force: true });
}
