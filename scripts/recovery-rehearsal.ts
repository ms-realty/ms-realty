// Synthetic local PG18 dump/restore. Owns both randomly named databases; never consumes an
// operator archive, resets an existing destination, contacts a provider, or seals a point.
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { runMigrations } from "../src/db/migrate";
import * as schema from "../src/db/schema";
import { readSession } from "../src/server/auth/sessions";
import { dispatchMessage } from "../src/server/jobs/outbox";
import { TestMessageProvider } from "../src/server/jobs/provider";
import { JobQueue } from "../src/server/jobs/queue";
import { assertRecoveryOpen, quarantineRestoredDatabase } from "../src/server/recovery/quarantine";
import { recoveryFixture } from "../src/server/recovery/testing";

const base = new URL(process.env.TEST_DATABASE_URL ?? "invalid:");
assert(
  ["postgres:", "postgresql:"].includes(base.protocol) &&
    ["127.0.0.1", "localhost", "[::1]"].includes(base.hostname) &&
    !base.search,
  "Use a loopback disposable TEST_DATABASE_URL without connection overrides.",
);
const bin = process.env.PG_BIN ?? "";
const exec = promisify(execFile);
async function pg(tool: "pg_dump" | "pg_restore", args: string[], database: string) {
  const pgPass = decodeURIComponent(base.password);
  return exec(bin ? join(bin, tool) : tool, args, {
    timeout: 60000,
    env: {
      NODE_ENV: "test",
      PATH: process.env.PATH,
      PGHOST: base.hostname.replace(/^\[|\]$/g, ""),
      PGPORT: base.port || "5432",
      PGUSER: decodeURIComponent(base.username),
      PGPASSWORD: pgPass,
      PGDATABASE: database,
      PGCONNECT_TIMEOUT: "10",
    },
  });
}
for (const tool of ["pg_dump", "pg_restore"] as const)
  assert.match((await pg(tool, ["--version"], "postgres")).stdout, /\b18\./);

const admin = postgres(base.toString(), { max: 1, onnotice: () => {} });
const sourceName = `msr_restore_${randomUUID().replaceAll("-", "")}`;
const destinationName = `msr_restore_${randomUUID().replaceAll("-", "")}`;
const created: string[] = [];
const clients: postgres.Sql[] = [];
const directory = await mkdtemp(join(tmpdir(), "msr-recovery-"));
let queue: JobQueue | undefined;
function connect(name: string) {
  const url = new URL(base);
  url.pathname = `/${name}`;
  const sql = postgres(url.toString(), { max: 2, onnotice: () => {} });
  clients.push(sql);
  return { url: url.toString(), sql, db: drizzle(sql, { schema }) };
}
async function tableCounts(sql: postgres.Sql) {
  const tables = await sql<{ schemaname: string; tablename: string }[]>`
    select schemaname, tablename from pg_tables
    where schemaname in ('public', 'drizzle', 'pgboss') order by schemaname, tablename`;
  const counts: Record<string, number> = {};
  for (const table of tables) {
    const [row] =
      await sql`select count(*)::int as count from ${sql(table.schemaname)}.${sql(table.tablename)}`;
    assert(row);
    counts[`${table.schemaname}.${table.tablename}`] = row.count;
  }
  return counts;
}
async function webStartup(url: string, shouldOpen: boolean) {
  const dist = process.env.RECOVERY_NEXT_DIST_DIR;
  assert(dist, "RECOVERY_NEXT_DIST_DIR must name this revision's production build.");
  const socket = createServer();
  await new Promise<void>((resolve, reject) => {
    socket.once("error", reject);
    socket.listen(0, "127.0.0.1", resolve);
  });
  const address = socket.address();
  assert(address && typeof address !== "string");
  const port = address.port;
  await new Promise<void>((resolve) => socket.close(() => resolve()));
  const child = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)],
    {
      env: {
        ...process.env,
        NODE_ENV: "production",
        NEXT_DIST_DIR: dist,
        DATABASE_URL: url,
        PUBLIC_ORIGIN: `http://localhost:${port}`,
        APP_ORIGIN: `http://localhost:${port}`,
        CLIENT_ORIGIN: `http://my.localhost:${port}`,
        STAFF_ORIGIN: `http://app.localhost:${port}`,
        HERMES_ENABLED: "0",
        CASE_INBOUND_ENABLED: "0",
        ENABLE_TEST_OUTBOX: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  child.stdout.on("data", (s) => {
    output += String(s);
  });
  child.stderr.on("data", (s) => {
    output += String(s);
  });
  const ended = new Promise<number | null>((resolve, reject) => {
    child.once("exit", resolve);
    child.once("error", reject);
  });
  try {
    const until = Date.now() + 20000;
    if (shouldOpen) {
      // Next 16.3 prints Ready before loading configuration/instrumentation. Probe actual HTTP.
      while (Date.now() < until && child.exitCode === null) {
        const ready = await fetch(`http://127.0.0.1:${port}/api/health`, {
          signal: AbortSignal.timeout(1000),
        }).then(
          (response) => response.status === 200,
          () => false,
        );
        if (ready) return;
        await delay(100);
      }
      assert.equal(child.exitCode, null, "Unfenced production server must start");
      assert.fail("Unfenced production server did not answer health");
    } else {
      while (Date.now() < until && child.exitCode === null) await delay(100);
      assert.equal(
        child.exitCode,
        1,
        `Quarantined production server must exit before readiness: ${output}`,
      );
      assert.match(output, /Recovery quarantine/);
      await assert.rejects(
        fetch(`http://127.0.0.1:${port}/bg/properties`, {
          signal: AbortSignal.timeout(1000),
        }),
      );
    }
  } finally {
    if (child.exitCode === null) child.kill("SIGTERM");
    const kill = setTimeout(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
    }, 3000);
    try {
      await ended;
    } finally {
      clearTimeout(kill);
    }
  }
}

try {
  const [version] = await admin`select current_setting('server_version_num')::int as version`;
  assert(version && version.version >= 180000 && version.version < 190000, "Use PostgreSQL 18");
  for (const name of [sourceName, destinationName]) {
    await admin`create database ${admin(name)}`;
    created.push(name);
  }
  const source = connect(sourceName),
    destination = connect(destinationName);
  await runMigrations(source.url);
  const fixture = await recoveryFixture(source.db);
  queue = new JobQueue(source.url, { producer: true });
  await queue.start();
  await queue.send("outbox.dispatch", { outboxId: fixture.queued.id });
  await queue.stop();
  queue = undefined;
  const counts = await tableCounts(source.sql);
  const journal = await source.db.select().from(schema.externalActions);
  const work = await source.db.select().from(schema.cases);
  await webStartup(source.url, true);
  const archive = join(directory, "synthetic.dump");
  const snapshotStartedAt = new Date().toISOString();
  await pg("pg_dump", ["--format=custom", "--no-owner", "--no-acl", "--file", archive], sourceName);
  const digest = createHash("sha256")
    .update(await readFile(archive))
    .digest("hex");
  await pg(
    "pg_restore",
    [
      "--exit-on-error",
      "--single-transaction",
      "--no-owner",
      "--no-acl",
      "--dbname",
      destinationName,
      archive,
    ],
    destinationName,
  );
  assert.deepEqual(
    await tableCounts(destination.sql),
    counts,
    "Every restored table retains its row count",
  );
  assert.deepEqual(await destination.db.select().from(schema.externalActions), journal);
  assert.deepEqual(await destination.db.select().from(schema.cases), work);
  const restored = await quarantineRestoredDatabase(destination.db, {
    restoreId: randomUUID(),
    snapshotDigest: digest,
  });
  assert.equal(await readSession(destination.db, fixture.client.token), null);
  assert.equal(await readSession(destination.db, fixture.staff.token), null);
  await assert.rejects(assertRecoveryOpen(destination.db), /Recovery quarantine/);
  const provider = new TestMessageProvider();
  await assert.rejects(
    dispatchMessage(destination.db, provider, fixture.queued.id),
    /Recovery quarantine/,
  );
  assert.equal(provider.sent.length, 0);
  assert.deepEqual(await destination.db.select().from(schema.externalActions), journal);
  assert.deepEqual(await destination.db.select().from(schema.cases), work);
  const after = await tableCounts(destination.sql);
  for (const key of Object.keys(counts).filter((name) => name.startsWith("pgboss.")))
    assert.equal(after[key], counts[key]);
  await webStartup(destination.url, false);
  console.log(
    JSON.stringify(
      {
        kind: "local_synthetic_restore_rehearsal",
        passed: true,
        observedAt: new Date().toISOString(),
        postgresMajor: 18,
        snapshotStartedAt,
        snapshotDigest: digest,
        restoredTables: Object.keys(counts).length,
        invalidated: restored.invalidated,
        pendingProviderCalls: provider.sent.length,
        checks: [
          "normal_production_server_starts",
          "pg_dump_pg_restore",
          "all_table_counts",
          "case_and_external_action_readback",
          "restored_sessions_rejected",
          "queue_preserved",
          "mail_dispatch_denied",
          "production_server_quarantine_exit",
        ],
        sealedRecoveryPoint: false,
        independentSafetyTail: "not_available",
        objectArchive: "not_exercised",
        operatorReview: "not_performed",
        rpoRto: "not_qualified",
        launchReady: false,
      },
      null,
      2,
    ),
  );
} finally {
  await queue?.stop();
  for (const client of clients) await client.end();
  for (const name of created) await admin`drop database ${admin(name)} with (force)`;
  await admin.end();
  await rm(directory, { recursive: true, force: true });
}
