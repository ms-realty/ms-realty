import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import {
  R2_RECOVERY_BUCKET,
  assertFileSha256,
  assertRecoveryReleaseId,
  assertR2RecoveryManifest,
  assertSafeBackupId,
  buildR2UploadPlan,
  buildProductionRecoveryReport,
  buildRestoreDrillResult,
  buildRuntimeAuthorityEvidence,
  createR2RecoveryManifest,
  mappedTableNames,
  optionalDockerNetwork,
  readImmutableJson,
  readRecoveryComponentMap,
  recoveryCommandEnvironment,
  sha256File,
  trustedManifestDigest,
  updateR2UploadPlan,
  withPlaintextCleanup,
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

async function run(command, args, { env = recoveryCommandEnvironment(process.env), outputFile, secrets = [] } = {}) {
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
  const text = String(value);
  if (/[\r\n\0]/.test(text)) throw new Error("PostgreSQL connection fields cannot contain control characters");
  return text.replace(/\\/g, "\\\\").replace(/:/g, "\\:");
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
    ...(config.dockerNetwork ? ["--network", config.dockerNetwork] : []),
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

async function querySource(config, tables, snapshotId, secrets) {
  if (!/^[a-z0-9-]+$/i.test(snapshotId)) throw new Error("PostgreSQL exported snapshot ID is invalid");
  const query = [
    "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
    `SET TRANSACTION SNAPSHOT '${snapshotId}'`,
    countsSql(tables),
    "COMMIT",
  ].join("; ");
  const result = await run("docker", sourceClientArgs(config, "psql", [
    "--no-psqlrc", "--quiet", "--tuples-only", "--no-align", "--field-separator", "\t", "--command", query,
  ]), { secrets });
  return parseCounts(result.stdout, tables);
}

async function exportedSnapshot(config, secrets) {
  const snapshotPath = path.join(config.secretDirectory, "snapshot-id");
  const snapshotSqlPath = path.join(config.secretDirectory, "export-snapshot.sql");
  fs.rmSync(snapshotPath, { force: true });
  fs.writeFileSync(snapshotSqlPath, [
    "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;",
    "\\o /run/ms-realty-recovery/snapshot-id",
    "SELECT pg_export_snapshot();",
    "\\o",
    "SELECT pg_sleep(600);",
  ].join("\n"), { mode: 0o600 });
  const container = `msr-recovery-snapshot-${crypto.randomBytes(6).toString("hex")}`;
  await run("docker", [
    "run", "--detach", "--rm", "--name", container,
    ...(config.dockerNetwork ? ["--network", config.dockerNetwork] : []),
    "--volume", `${config.secretDirectory}:/run/ms-realty-recovery:rw`,
    "--env", "PGPASSFILE=/run/ms-realty-recovery/.pgpass",
    "--env", `PGSSLMODE=${config.sslmode}`,
    "--env", `PGCHANNELBINDING=${config.channelBinding}`,
    "--env", `PGHOST=${config.host}`,
    "--env", `PGPORT=${config.port}`,
    "--env", `PGUSER=${config.user}`,
    "--env", `PGDATABASE=${config.database}`,
    POSTGRES_IMAGE, "psql", "--no-psqlrc", "--quiet", "--tuples-only", "--no-align",
    "--file", "/run/ms-realty-recovery/export-snapshot.sql",
  ], { secrets });
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (fs.existsSync(snapshotPath)) {
      const snapshotId = fs.readFileSync(snapshotPath, "utf8").trim();
      if (/^[a-z0-9-]+$/i.test(snapshotId)) return { container, snapshotId };
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  try { await run("docker", ["stop", "--time", "5", container], { secrets }); } catch { /* report the snapshot failure */ }
  throw new Error("PostgreSQL 18 could not export a consistent backup snapshot within 30 seconds");
}

function r2Environment(env) {
  return {
    ...recoveryCommandEnvironment(env),
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
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`Recovery work path is unsafe: ${directory}`);
  fs.chmodSync(directory, 0o700);
  return directory;
}

function workRoot() {
  return privateDirectory(DEFAULT_WORK_ROOT);
}

function backupDirectory(backupId) {
  return privateDirectory(path.join(workRoot(), assertSafeBackupId(backupId)));
}

function backupId(now = new Date()) {
  return `ms-realty-${now.toISOString().replace(/[-:.]/g, "").replace("Z", "z")}-${crypto.randomBytes(8).toString("hex")}`;
}

function readManifest(filePath, componentMap, expectedBackupId) {
  const stat = fs.lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Recovery manifest must be a regular file");
  const manifest = JSON.parse(fs.readFileSync(filePath, "utf8"));
  assertR2RecoveryManifest(manifest, componentMap, expectedBackupId);
  return manifest;
}

function readRegularJson(filePath, label) {
  const stat = fs.lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${label} must be a regular file`);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
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
  const releaseId = assertRecoveryReleaseId(required(env, "MS_REALTY_RELEASE_ID"));
  const secrets = [databaseUrl, env.AWS_ACCESS_KEY_ID, env.AWS_SECRET_ACCESS_KEY];
  const id = backupId();
  const directory = backupDirectory(id);
  const secretDirectory = privateDirectory(path.join(directory, ".postgres-client"));
  const plaintextFile = path.join(directory, "neon-postgres.dump");
  const encryptedFile = path.join(directory, "neon-postgres.dump.age");
  const manifestPath = path.join(directory, "manifest.json");
  const uploadPlanPath = path.join(directory, "r2-upload-plan.json");
  const componentMap = readRecoveryComponentMap(DEFAULT_COMPONENT_MAP);
  const tables = mappedTableNames(componentMap);
  const config = {
    ...connectionConfig(databaseUrl),
    secretDirectory,
    dockerNetwork: optionalDockerNetwork(env.MS_REALTY_RECOVERY_SOURCE_DOCKER_NETWORK),
  };
  createPgpass(secretDirectory, config);

  let completed = false;
  let snapshot;
  try {
    snapshot = await exportedSnapshot(config, secrets);
    const source = await querySource(config, tables, snapshot.snapshotId, secrets);
    await run("docker", sourceClientArgs(config, "pg_dump", [
      "--format=custom", "--no-owner", "--no-privileges", `--snapshot=${snapshot.snapshotId}`,
    ]), { outputFile: plaintextFile, secrets });
    await run("docker", ["stop", "--time", "5", snapshot.container], { secrets });
    snapshot = null;
    await run("age", ["--encrypt", "--recipient", ageRecipient, "--output", encryptedFile, plaintextFile], { secrets });
    fs.chmodSync(encryptedFile, 0o600);
    const manifest = createR2RecoveryManifest({
      backupId: id,
      releaseId,
      completedAt: new Date().toISOString(),
      encryptedFile,
      plaintextFile,
      componentMap,
      tableCounts: source.tableCounts,
      latestMigration: source.latestMigration,
      runtimeAuthorityEvidence: buildRuntimeAuthorityEvidence({ releaseId }),
    });
    assertR2RecoveryManifest(manifest, componentMap, id);
    writePrivateJson(manifestPath, manifest);
    fs.chmodSync(manifestPath, 0o400);
    let uploadPlan = buildR2UploadPlan(manifest);
    writePrivateJson(uploadPlanPath, uploadPlan);
    try {
      uploadPlan = updateR2UploadPlan(uploadPlan, { event: "attempted", objectKey: manifest.artifact.object_key });
      writePrivateJson(uploadPlanPath, uploadPlan);
      await uploadFile(env, encryptedFile, manifest.artifact.object_key, secrets);
      uploadPlan = updateR2UploadPlan(uploadPlan, { event: "uploaded", objectKey: manifest.artifact.object_key });
      writePrivateJson(uploadPlanPath, uploadPlan);

      uploadPlan = updateR2UploadPlan(uploadPlan, { event: "attempted", objectKey: manifest.manifest_object_key });
      writePrivateJson(uploadPlanPath, uploadPlan);
      await uploadFile(env, manifestPath, manifest.manifest_object_key, secrets);
      uploadPlan = updateR2UploadPlan(uploadPlan, { event: "uploaded", objectKey: manifest.manifest_object_key });
      uploadPlan = updateR2UploadPlan(uploadPlan, { event: "committed", at: new Date().toISOString() });
      writePrivateJson(uploadPlanPath, uploadPlan);
    } catch (error) {
      uploadPlan = updateR2UploadPlan(uploadPlan, {
        event: "partial",
        at: new Date().toISOString(),
        error: redact(error.message, secrets),
      });
      writePrivateJson(uploadPlanPath, uploadPlan);
      throw new Error(`${error.message}; non-destructive cleanup plan: ${uploadPlanPath}`);
    }
    completed = true;
    process.stdout.write(`${JSON.stringify({
      status: "uploaded",
      backup_id: id,
      bucket: R2_RECOVERY_BUCKET,
      manifest_object_key: manifest.manifest_object_key,
      upload_plan: uploadPlanPath,
      uncovered_components: Object.entries(manifest.component_coverage)
        .filter(([, coverage]) => coverage.status !== "covered")
        .map(([component]) => component),
      next: `npm run recovery:r2:restore -- ${id} --confirm-isolated-restore-drill`,
    }, null, 2)}\n`);
  } finally {
    if (snapshot) {
      try { await run("docker", ["stop", "--time", "5", snapshot.container], { secrets }); } catch { /* original failure remains authoritative */ }
    }
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
  const directory = backupDirectory(id);
  const localManifestPath = path.join(directory, "manifest.json");
  const manifestPath = path.join(directory, "manifest.downloaded.json");
  const encryptedFile = path.join(directory, "neon-postgres.dump.age");
  const plaintextFile = path.join(directory, "neon-postgres.restore.dump");
  const drillPath = path.join(directory, "restore-drill-result.json");
  const componentMap = readRecoveryComponentMap(DEFAULT_COMPONENT_MAP);
  const expectedManifestSha256 = trustedManifestDigest({
    localManifestPath,
    recoveryReportPath: String(env.MS_REALTY_RECOVERY_TRUSTED_REPORT_FILE || "").trim() || null,
    backupId: id,
    publicKey: env.MS_REALTY_RECOVERY_SIGNING_PUBLIC_KEY,
  });
  await downloadFile(env, `backups/${id}/manifest.json`, manifestPath, secrets);
  assertFileSha256(manifestPath, expectedManifestSha256, "Downloaded R2 manifest");
  const manifest = readManifest(manifestPath, componentMap, id);
  const manifestSha256 = sha256File(manifestPath);
  const monitoringRollbackReportPath = String(env.MS_REALTY_MONITORING_ROLLBACK_REPORT_PATH || "").trim();
  const monitoringRollbackReport = monitoringRollbackReportPath
    ? readImmutableJson(monitoringRollbackReportPath, "Monitoring rollback report")
    : null;
  const monitoringRollbackReportSha256 = monitoringRollbackReportPath
    ? sha256File(path.resolve(monitoringRollbackReportPath))
    : null;
  await downloadFile(env, manifest.artifact.object_key, encryptedFile, secrets);
  assertFileSha256(encryptedFile, manifest.artifact.sha256, "Downloaded R2 ciphertext");
  let restored;
  let restoreCompletedAt;
  let cleanupVerified = false;
  await withPlaintextCleanup(plaintextFile, async () => {
    await run("age", ["--decrypt", "--identity", identityFile, "--output", plaintextFile, encryptedFile], { secrets });
    fs.chmodSync(plaintextFile, 0o600);
    assertFileSha256(plaintextFile, manifest.artifact.plaintext_sha256, "Decrypted PostgreSQL dump");

    const suffix = crypto.randomBytes(6).toString("hex");
    const network = `msr-recovery-${suffix}`;
    const container = `msr-recovery-postgres-${suffix}`;
    let networkCreated = false;
    let containerCreated = false;
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
        try { await run("docker", ["stop", "--time", "5", container], { secrets }); } catch { cleanupFailed = true; }
      }
      if (networkCreated) {
        try { await run("docker", ["network", "rm", network], { secrets }); } catch { cleanupFailed = true; }
      }
      cleanupVerified = !cleanupFailed;
    }
  });

  const drill = buildRestoreDrillResult({
    manifest,
    componentMap,
    restoredTableCounts: restored.tableCounts,
    restoredLatestMigration: restored.latestMigration,
    completedAt: restoreCompletedAt,
    operator,
    checksumVerified: true,
    cleanupVerified,
    monitoringRollbackReport,
    monitoringRollbackReportSha256,
    manifestSha256,
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
      ? `Provide immutable approval and monitoring rollback report files, then run npm run recovery:r2:approve -- ${id} --confirm-reviewed-recovery-evidence`
      : monitoringRollbackReport
        ? "Move every uncovered runtime/evidence authority to mapped PostgreSQL tables, then repeat backup and restore."
        : "Provide MS_REALTY_MONITORING_ROLLBACK_REPORT_PATH as immutable machine-generated exact-release evidence, then repeat the restore drill.",
  }, null, 2)}\n`);
  if (drill.status !== "pass") process.exitCode = 2;
}

function approveDrill(env, requestedBackupId) {
  if (!hasFlag("--confirm-reviewed-recovery-evidence")) {
    throw new Error("approval requires --confirm-reviewed-recovery-evidence from the named human reviewer");
  }
  const id = assertSafeBackupId(requestedBackupId);
  const directory = backupDirectory(id);
  const componentMap = readRecoveryComponentMap(DEFAULT_COMPONENT_MAP);
  const manifestPath = fs.existsSync(path.join(directory, "manifest.downloaded.json"))
    ? path.join(directory, "manifest.downloaded.json")
    : path.join(directory, "manifest.json");
  const drillPath = path.join(directory, "restore-drill-result.json");
  const manifest = readManifest(manifestPath, componentMap, id);
  const drill = readRegularJson(drillPath, "Restore drill result");
  const monitoringRollbackReportPath = path.resolve(required(env, "MS_REALTY_MONITORING_ROLLBACK_REPORT_PATH"));
  const approvalPath = path.resolve(required(env, "MS_REALTY_RECOVERY_APPROVAL_FILE"));
  const signingPrivateKeyPath = path.resolve(required(env, "MS_REALTY_RECOVERY_SIGNING_PRIVATE_KEY_FILE"));
  const signingPrivateKeyStat = fs.lstatSync(signingPrivateKeyPath);
  if (!signingPrivateKeyStat.isFile() || signingPrivateKeyStat.isSymbolicLink()) {
    throw new Error("Recovery signing private key must be a regular file");
  }
  if ((signingPrivateKeyStat.mode & 0o077) !== 0) {
    throw new Error("Recovery signing private key must not be group/world accessible");
  }
  const signingPrivateKey = fs.readFileSync(signingPrivateKeyPath);
  const signingPublicKey = required(env, "MS_REALTY_RECOVERY_SIGNING_PUBLIC_KEY");
  const monitoringRollbackReport = readImmutableJson(monitoringRollbackReportPath, "Monitoring rollback report");
  const approval = readImmutableJson(approvalPath, "Recovery approval");
  const manifestSha256 = sha256File(manifestPath);
  const restoreDrillSha256 = sha256File(drillPath);
  const monitoringRollbackReportSha256 = sha256File(monitoringRollbackReportPath);
  const approvalArtifactSha256 = sha256File(approvalPath);
  const now = new Date().toISOString();
  const report = buildProductionRecoveryReport({
    manifest,
    componentMap,
    drill,
    monitoringRollbackReport,
    monitoringRollbackReportSha256,
    approval,
    manifestSha256,
    restoreDrillSha256,
    approvalArtifactSha256,
    signingPrivateKey,
    generatedAt: now,
  });
  const reportPath = path.resolve(env.MS_REALTY_PRODUCTION_RECOVERY_REPORT_PATH || DEFAULT_PRODUCTION_RECOVERY_REPORT);
  writeProductionRecoveryReport(report, reportPath, { publicKey: signingPublicKey });
  process.stdout.write(`${JSON.stringify({
    status: "approved",
    backup_id: id,
    report_path: reportPath,
    approval_artifact_sha256: approvalArtifactSha256,
  }, null, 2)}\n`);
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
