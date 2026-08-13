import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import {
  R2_RECOVERY_BUCKET,
  assertR2RecoveryManifest,
  assertSafeBackupId,
  buildProductionRecoveryReport,
  buildRestoreDrillResult,
  createR2RecoveryManifest,
  mappedTableNames,
  readRecoveryComponentMap,
  sha256File,
  writePrivateJson,
} from "../lib/r2-production-recovery.mjs";
import {
  DEFAULT_PRODUCTION_RECOVERY_REPORT,
  writeProductionRecoveryReport,
} from "../lib/production-recovery.mjs";
import { fromRoot } from "../lib/paths.mjs";

const POSTGRES_IMAGE = "postgres:18-alpine";
const DEFAULT_COMPONENT_MAP = fromRoot("production", "data", "production-recovery-component-map.json");
const DEFAULT_WORK_ROOT = fromRoot(".recovery-work");
const DATABASE_NAME = "ms_realty_restore";

function required(env, key) {
  const value = String(env[key] || "").trim();
  if (!value) throw new Error(`${key} is required`);
  return value;
}

function hasFlag(flag) {
  return process.argv.slice(2).includes(flag);
}

function redact(value, secrets = []) {
  let result = String(value || "").replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[REDACTED_DATABASE_URL]");
  for (const secret of secrets.filter(Boolean)) result = result.split(secret).join("[REDACTED]");
  return result;
}

async function run(command, args, { env = process.env, outputFile, secrets = [] } = {}) {
  let stderr = "";
  let stdout = "";
  const output = outputFile ? fs.openSync(outputFile, "wx", 0o600) : "pipe";
  const child = spawn(command, args, { env, stdio: ["ignore", output, "pipe"] });
  if (!outputFile) child.stdout.on("data", (chunk) => {
    if (stdout.length < 16 * 1024 * 1024) stdout += chunk.toString("utf8");
  });
  child.stderr.on("data", (chunk) => {
    if (stderr.length < 1024 * 1024) stderr += chunk.toString("utf8");
  });
  let exit;
  try {
    exit = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code, signal) => resolve({ code, signal }));
    });
  } finally {
    if (outputFile) fs.closeSync(output);
  }
  if (exit.code !== 0) {
    if (outputFile) fs.rmSync(outputFile, { force: true });
    throw new Error(`${command} failed (${exit.signal || exit.code}): ${redact(stderr, secrets).trim() || "no error output"}`);
  }
  return { stdout, stderr };
}

function connectionConfig(databaseUrl) {
  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL_DIRECT must be a valid PostgreSQL URL");
  }
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    throw new Error("DATABASE_URL_DIRECT must use the PostgreSQL protocol");
  }
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (!parsed.hostname || !database || !parsed.username) throw new Error("DATABASE_URL_DIRECT is incomplete");
  return {
    host: parsed.hostname,
    port: parsed.port || "5432",
    database,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    sslmode: parsed.searchParams.get("sslmode") || "require",
    channelBinding: parsed.searchParams.get("channel_binding") || "prefer",
  };
}

function pgpassValue(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/:/g, "\\:");
}

function createPgpass(directory, config) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  fs.chmodSync(directory, 0o700);
  const pgpassPath = path.join(directory, ".pgpass");
  const fields = [config.host, config.port, config.database, config.user, config.password].map(pgpassValue);
  fs.writeFileSync(pgpassPath, `${fields.join(":")}\n`, { mode: 0o600, flag: "wx" });
  return pgpassPath;
}

function sourceClientArgs(config, postgresCommand, commandArgs) {
  return [
    "run", "--rm",
    "--volume", `${config.secretDirectory}:/run/ms-realty-recovery:ro`,
    "--env", "PGPASSFILE=/run/ms-realty-recovery/.pgpass",
    "--env", `PGSSLMODE=${config.sslmode}`,
    "--env", `PGCHANNELBINDING=${config.channelBinding}`,
    POSTGRES_IMAGE,
    postgresCommand,
    "--host", config.host,
    "--port", config.port,
    "--username", config.user,
    "--dbname", config.database,
    ...commandArgs,
  ];
}

function quoteIdentifier(identifier) {
  return identifier.split(".").map((part) => `"${part.replaceAll('"', '""')}"`).join(".");
}

function countsSql(tables) {
  const rows = tables.map((table) =>
    `SELECT '${table.replaceAll("'", "''")}'::text AS name, count(*)::bigint::text AS value FROM ${quoteIdentifier(table)}`,
  );
  rows.push("SELECT '__latest_migration__'::text, coalesce((SELECT name FROM public.payload_migrations ORDER BY id DESC LIMIT 1), '')::text");
  return rows.join(" UNION ALL ");
}

function parseCounts(output, expectedTables) {
  const rows = Object.fromEntries(String(output).trim().split("\n").filter(Boolean).map((line) => {
    const separator = line.indexOf("\t");
    if (separator < 1) throw new Error("PostgreSQL recovery count output is malformed");
    return [line.slice(0, separator), line.slice(separator + 1)];
  }));
  const latestMigration = String(rows.__latest_migration__ || "").trim();
  if (!latestMigration) throw new Error("Source database has no Payload migration registry entry");
  const tableCounts = {};
  for (const table of expectedTables) {
    const count = Number(rows[table]);
    if (!Number.isSafeInteger(count) || count < 0) throw new Error(`PostgreSQL recovery count missing for ${table}`);
    tableCounts[table] = count;
  }
  return { tableCounts, latestMigration };
}

async function querySource(config, tables, secrets) {
  const result = await run("docker", sourceClientArgs(config, "psql", [
    "--no-psqlrc", "--tuples-only", "--no-align", "--field-separator", "\t", "--command", countsSql(tables),
  ]), { secrets });
  return parseCounts(result.stdout, tables);
}

function r2Environment(env) {
  return {
    ...env,
    AWS_REGION: "auto",
    AWS_DEFAULT_REGION: "auto",
    AWS_EC2_METADATA_DISABLED: "true",
    AWS_ACCESS_KEY_ID: required(env, "AWS_ACCESS_KEY_ID"),
    AWS_SECRET_ACCESS_KEY: required(env, "AWS_SECRET_ACCESS_KEY"),
  };
}

function r2Endpoint(env) {
  const accountId = required(env, "CLOUDFLARE_ACCOUNT_ID");
  if (!/^[a-f0-9]{32}$/i.test(accountId)) throw new Error("CLOUDFLARE_ACCOUNT_ID must be a 32-character account ID");
  return `https://${accountId}.eu.r2.cloudflarestorage.com`;
}

function privateDirectory(directory) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  fs.chmodSync(directory, 0o700);
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`Recovery work path is unsafe: ${directory}`);
  return directory;
}

function workRoot(env) {
  return privateDirectory(path.resolve(env.MS_REALTY_RECOVERY_WORK_ROOT || DEFAULT_WORK_ROOT));
}

function backupDirectory(env, backupId) {
  return privateDirectory(path.join(workRoot(env), assertSafeBackupId(backupId)));
}

function backupId(now = new Date()) {
  return `ms-realty-${now.toISOString().replace(/[-:.]/g, "").replace("Z", "z")}-${crypto.randomBytes(4).toString("hex")}`;
}

function readManifest(filePath) {
  const stat = fs.lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Recovery manifest must be a regular file");
  const manifest = JSON.parse(fs.readFileSync(filePath, "utf8"));
  assertR2RecoveryManifest(manifest);
  return manifest;
}

async function uploadFile(env, filePath, objectKey, secrets) {
  await run("aws", [
    "s3", "cp", filePath, `s3://${R2_RECOVERY_BUCKET}/${objectKey}`,
    "--endpoint-url", r2Endpoint(env), "--only-show-errors", "--no-progress",
  ], { env: r2Environment(env), secrets });
}

async function downloadFile(env, objectKey, filePath, secrets) {
  fs.rmSync(filePath, { force: true });
  await run("aws", [
    "s3", "cp", `s3://${R2_RECOVERY_BUCKET}/${objectKey}`, filePath,
    "--endpoint-url", r2Endpoint(env), "--only-show-errors", "--no-progress",
  ], { env: r2Environment(env), secrets });
  fs.chmodSync(filePath, 0o600);
}

async function captureBackup(env) {
  if (!hasFlag("--confirm-upload-encrypted-production-backup")) {
    throw new Error("backup requires --confirm-upload-encrypted-production-backup after exact human approval");
  }
  const databaseUrl = required(env, "DATABASE_URL_DIRECT");
  const ageRecipient = required(env, "MS_REALTY_RECOVERY_AGE_RECIPIENT");
  const secrets = [databaseUrl, env.AWS_ACCESS_KEY_ID, env.AWS_SECRET_ACCESS_KEY];
  const id = backupId();
  const directory = backupDirectory(env, id);
  const secretDirectory = privateDirectory(path.join(directory, ".postgres-client"));
  const plaintextFile = path.join(directory, "neon-postgres.dump");
  const encryptedFile = path.join(directory, "neon-postgres.dump.age");
  const manifestPath = path.join(directory, "manifest.json");
  const componentMap = readRecoveryComponentMap(env.MS_REALTY_RECOVERY_COMPONENT_MAP_PATH || DEFAULT_COMPONENT_MAP);
  const tables = mappedTableNames(componentMap);
  const config = { ...connectionConfig(databaseUrl), secretDirectory };
  createPgpass(secretDirectory, config);

  let completed = false;
  try {
    const source = await querySource(config, tables, secrets);
    await run("docker", sourceClientArgs(config, "pg_dump", [
      "--format=custom", "--no-owner", "--no-privileges",
    ]), { outputFile: plaintextFile, secrets });
    await run("age", ["--encrypt", "--recipient", ageRecipient, "--output", encryptedFile, plaintextFile], { secrets });
    fs.chmodSync(encryptedFile, 0o600);
    const manifest = createR2RecoveryManifest({
      backupId: id,
      completedAt: new Date().toISOString(),
      encryptedFile,
      plaintextFile,
      componentMap,
      tableCounts: source.tableCounts,
      latestMigration: source.latestMigration,
    });
    assertR2RecoveryManifest(manifest);
    writePrivateJson(manifestPath, manifest);

    await uploadFile(env, encryptedFile, manifest.artifact.object_key, secrets);
    await uploadFile(env, manifestPath, manifest.manifest_object_key, secrets);
    completed = true;
    process.stdout.write(`${JSON.stringify({
      status: "uploaded",
      backup_id: id,
      bucket: R2_RECOVERY_BUCKET,
      manifest_object_key: manifest.manifest_object_key,
      uncovered_components: Object.entries(manifest.component_coverage)
        .filter(([, coverage]) => coverage.status !== "covered")
        .map(([component]) => component),
      next: `npm run recovery:r2:restore -- ${id} --confirm-isolated-restore-drill`,
    }, null, 2)}\n`);
  } finally {
    fs.rmSync(plaintextFile, { force: true });
    fs.rmSync(secretDirectory, { recursive: true, force: true });
    if (!completed) fs.rmSync(encryptedFile, { force: true });
  }
}

async function waitForPostgres(container, secrets) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      await run("docker", ["exec", container, "pg_isready", "--username", "postgres", "--dbname", DATABASE_NAME], { secrets });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw new Error("Isolated PostgreSQL 18 did not become ready within 60 seconds");
}

async function queryRestored(container, tables, secrets) {
  const result = await run("docker", [
    "exec", container, "psql", "--username", "postgres", "--dbname", DATABASE_NAME,
    "--no-psqlrc", "--tuples-only", "--no-align", "--field-separator", "\t", "--command", countsSql(tables),
  ], { secrets });
  return parseCounts(result.stdout, tables);
}

async function restoreDrill(env, requestedBackupId) {
  if (!hasFlag("--confirm-isolated-restore-drill")) {
    throw new Error("restore requires --confirm-isolated-restore-drill after exact human approval");
  }
  const id = assertSafeBackupId(requestedBackupId);
  const operator = required(env, "MS_REALTY_RECOVERY_OPERATOR");
  const identityFile = path.resolve(required(env, "MS_REALTY_RECOVERY_AGE_IDENTITY_FILE"));
  const identityStat = fs.lstatSync(identityFile);
  if (!identityStat.isFile() || identityStat.isSymbolicLink()) throw new Error("Age identity must be a regular file");
  if ((identityStat.mode & 0o077) !== 0) throw new Error("Age identity file must not be group/world accessible");

  const secrets = [env.AWS_ACCESS_KEY_ID, env.AWS_SECRET_ACCESS_KEY];
  const directory = backupDirectory(env, id);
  const manifestPath = path.join(directory, "manifest.json");
  const encryptedFile = path.join(directory, "neon-postgres.dump.age");
  const plaintextFile = path.join(directory, "neon-postgres.restore.dump");
  const drillPath = path.join(directory, "restore-drill-result.json");
  await downloadFile(env, `backups/${id}/manifest.json`, manifestPath, secrets);
  const manifest = readManifest(manifestPath);
  await downloadFile(env, manifest.artifact.object_key, encryptedFile, secrets);
  if (sha256File(encryptedFile) !== manifest.artifact.sha256) throw new Error("Downloaded R2 ciphertext checksum mismatch");
  await run("age", ["--decrypt", "--identity", identityFile, "--output", plaintextFile, encryptedFile], { secrets });
  fs.chmodSync(plaintextFile, 0o600);
  if (sha256File(plaintextFile) !== manifest.artifact.plaintext_sha256) throw new Error("Decrypted PostgreSQL dump checksum mismatch");

  const suffix = crypto.randomBytes(6).toString("hex");
  const network = `msr-recovery-${suffix}`;
  const container = `msr-recovery-postgres-${suffix}`;
  let networkCreated = false;
  let containerCreated = false;
  let restored;
  let restoreCompletedAt;
  let cleanupVerified = false;
  try {
    await run("docker", ["network", "create", "--internal", network], { secrets });
    networkCreated = true;
    await run("docker", [
      "run", "--detach", "--rm", "--name", container, "--network", network,
      "--env", "POSTGRES_HOST_AUTH_METHOD=trust", "--env", `POSTGRES_DB=${DATABASE_NAME}`,
      POSTGRES_IMAGE,
    ], { secrets });
    containerCreated = true;
    await waitForPostgres(container, secrets);
    await run("docker", ["cp", plaintextFile, `${container}:/tmp/neon-postgres.dump`], { secrets });
    await run("docker", ["exec", container, "pg_restore", "--list", "/tmp/neon-postgres.dump"], { secrets });
    await run("docker", [
      "exec", container, "pg_restore", "--username", "postgres", "--dbname", DATABASE_NAME,
      "--no-owner", "--no-privileges", "--exit-on-error", "/tmp/neon-postgres.dump",
    ], { secrets });
    restored = await queryRestored(container, Object.keys(manifest.database.table_counts), secrets);
    restoreCompletedAt = new Date().toISOString();
  } finally {
    let cleanupFailed = false;
    if (containerCreated) {
      try { await run("docker", ["rm", "--force", container], { secrets }); } catch { cleanupFailed = true; }
    }
    if (networkCreated) {
      try { await run("docker", ["network", "rm", network], { secrets }); } catch { cleanupFailed = true; }
    }
    cleanupVerified = !cleanupFailed;
    fs.rmSync(plaintextFile, { force: true });
  }

  const drill = buildRestoreDrillResult({
    manifest,
    restoredTableCounts: restored.tableCounts,
    restoredLatestMigration: restored.latestMigration,
    completedAt: restoreCompletedAt,
    operator,
    checksumVerified: true,
    cleanupVerified,
  });
  writePrivateJson(drillPath, drill);
  process.stdout.write(`${JSON.stringify({
    status: drill.status,
    backup_id: id,
    drill_result: drillPath,
    components_verified: drill.components_verified,
    uncovered_components: drill.uncovered_components,
    blockers: drill.blockers,
    next: drill.status === "pass"
      ? `npm run recovery:r2:approve -- ${id} --confirm-reviewed-recovery-evidence`
      : "Move every uncovered runtime/evidence authority to mapped Postgres tables or a separately restorable encrypted component, then repeat backup and restore.",
  }, null, 2)}\n`);
  if (drill.status !== "pass") process.exitCode = 2;
}

function approveDrill(env, requestedBackupId) {
  if (!hasFlag("--confirm-reviewed-recovery-evidence")) {
    throw new Error("approval requires --confirm-reviewed-recovery-evidence from the named human reviewer");
  }
  const id = assertSafeBackupId(requestedBackupId);
  const directory = backupDirectory(env, id);
  const manifest = readManifest(path.join(directory, "manifest.json"));
  const drill = JSON.parse(fs.readFileSync(path.join(directory, "restore-drill-result.json"), "utf8"));
  const now = new Date().toISOString();
  const report = buildProductionRecoveryReport({
    manifest,
    drill,
    reviewer: required(env, "MS_REALTY_RECOVERY_REVIEWER"),
    approvedAt: now,
    generatedAt: now,
  });
  const reportPath = path.resolve(env.MS_REALTY_PRODUCTION_RECOVERY_REPORT_PATH || DEFAULT_PRODUCTION_RECOVERY_REPORT);
  writeProductionRecoveryReport(report, reportPath);
  process.stdout.write(`${JSON.stringify({ status: "approved", backup_id: id, report_path: reportPath }, null, 2)}\n`);
}

async function main() {
  const [command, value] = process.argv.slice(2).filter((argument) => !argument.startsWith("--"));
  if (command === "backup") return captureBackup(process.env);
  if (command === "restore") return restoreDrill(process.env, value);
  if (command === "approve") return approveDrill(process.env, value);
  throw new Error("Usage: r2-production-recovery.mjs backup|restore <backup-id>|approve <backup-id> [confirmation flag]");
}

try {
  await main();
} catch (error) {
  process.stderr.write(`Recovery workflow failed: ${redact(error.message, [
    process.env.DATABASE_URL_DIRECT,
    process.env.AWS_ACCESS_KEY_ID,
    process.env.AWS_SECRET_ACCESS_KEY,
  ])}\n`);
  process.exitCode = 1;
}
