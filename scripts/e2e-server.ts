// One freshly migrated database per browser run. Playwright owns this process and stops it
// after the suite; the finally block drops only the generated msr_e2e_* database.
import { type ChildProcess, spawn } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import postgres from "postgres";
import { mapFixtureRelease, writeMapFixture } from "../e2e/support/map-fixture.mjs";
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
const admin = postgres(adminUrl, { max: 1, onnotice: () => {} });
let child: ChildProcess | undefined;
let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    stopping = true;
    child?.kill(signal);
  });
}

async function next(args: string[]): Promise<number> {
  if (stopping) return 0;
  const profile = process.env.MSR_LOAD_PROFILE === "1" && args[0] === "start";
  const profileDirectory = join(process.cwd(), "test-results", database.slice("msr_e2e_".length));
  if (profile) await mkdir(profileDirectory, { recursive: true });
  return new Promise((resolve, reject) => {
    // Keep localhost on IPv4 for Next's internal redirect fetch as well as its listener.
    // Linux may otherwise bind ::1 while the action redirect targets 127.0.0.1.
    child = spawn(
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
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? (stopping ? 0 : 1)));
  });
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
  const built = process.env.CI || process.env.E2E_SKIP_BUILD === "1" ? 0 : await next(["build"]);
  process.exitCode =
    built ||
    (await next(["start", "--hostname", "localhost", "--port", process.env.E2E_PORT ?? "3100"]));
} finally {
  if (created) await admin.unsafe(`drop database if exists "${database}" with (force)`);
  await admin.end();
  const ownFiles = join(tmpdir(), `msr-e2e-files-${database.slice("msr_e2e_".length)}`);
  if (process.env.E2E_FILE_STORAGE_ROOT === ownFiles)
    await rm(ownFiles, { recursive: true, force: true });
}
