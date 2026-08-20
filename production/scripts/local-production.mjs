import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  buildLaunchReadinessReport,
  materializeLocalLaunchReadiness,
  writeLaunchReadinessReport,
} from "../lib/launch-readiness.mjs";
import { launchReadinessInputsFromEnv } from "./launch-readiness-env.mjs";
import {
  LOCAL_BACKUP_COMPONENTS,
  assertSafeArchiveEntries,
  createLocalBackupManifest,
  validateLocalBackup,
  writeLocalBackupManifest,
} from "../lib/local-backup.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const composeFile = path.join(root, "production", "docker-compose.local-production.yml");
const composeOverride = String(process.env.MS_REALTY_COMPOSE_OVERRIDE || "").trim();
const composeFiles = [composeFile, ...(composeOverride ? [path.resolve(root, composeOverride)] : [])];
const composeFileArgs = composeFiles.flatMap((file) => ["-f", file]);
const envFile = path.resolve(root, process.env.MS_REALTY_ENV_FILE || ".env.local-production");
const command = process.argv[2] || "status";
const commandArgs = process.argv.slice(3);
const HERMES_AGENT_ENV_KEYS = ["HERMES_AGENT_API_SERVER_KEY", "HERMES_AGENT_MODEL", "HERMES_AGENT_LLM_BASE_URL", "HERMES_AGENT_LLM_API_KEY"];
const LOCAL_READINESS_MATERIALIZE_FLAG = "MS_REALTY_LOCAL_READINESS_MATERIALIZE";
const LOCAL_BACKUP_ROOT = path.resolve(root, process.env.MS_REALTY_LOCAL_BACKUP_ROOT || ".local-backups");

function secret(bytes = 32) {
  return crypto.randomBytes(bytes).toString("hex");
}

function ensureEnvFile() {
  if (!fs.existsSync(envFile)) {
    const contents = [
      "# Generated for the loopback-only Docker preview. Do not commit this file.",
      "MS_REALTY_APP_PORT=3200",
      "MS_REALTY_POSTGRES_PORT=55432",
      "MS_REALTY_TYPESENSE_PORT=8108",
      "MS_REALTY_MEILI_PORT=7700",
      `MS_REALTY_POSTGRES_PASSWORD=${secret()}`,
      `PAYLOAD_SECRET=${secret(48)}`,
      `MS_REALTY_ADMIN_TOKEN=local-${secret(24)}`,
      `MS_REALTY_LEAD_CONTACT_KEY=${secret(48)}`,
      `TYPESENSE_API_KEY=${secret()}`,
      `MEILI_MASTER_KEY=${secret()}`,
      "HERMES_CHAT_COMPLETIONS_URL=",
      "HERMES_API_KEY=",
      "HERMES_MODEL=",
      `HERMES_AGENT_API_SERVER_KEY=local-${secret(24)}`,
      "HERMES_AGENT_MODEL=",
      "HERMES_AGENT_LLM_BASE_URL=",
      "HERMES_AGENT_LLM_API_KEY=",
      "",
    ].join("\n");
    fs.writeFileSync(envFile, contents, { encoding: "utf8", mode: 0o600, flag: "wx" });
  }
  fs.chmodSync(envFile, 0o600);
  const existing = fs.readFileSync(envFile, "utf8");
  const parsed = parseEnv(existing);
  const missing = [
    ...(Object.hasOwn(parsed, "MS_REALTY_LEAD_CONTACT_KEY") ? [] : [`MS_REALTY_LEAD_CONTACT_KEY=${secret(48)}`]),
    ...(Object.hasOwn(parsed, "HERMES_AGENT_API_SERVER_KEY") ? [] : [`HERMES_AGENT_API_SERVER_KEY=local-${secret(24)}`]),
    ...(Object.hasOwn(parsed, "HERMES_AGENT_MODEL") ? [] : ["HERMES_AGENT_MODEL="]),
    ...(Object.hasOwn(parsed, "HERMES_AGENT_LLM_BASE_URL") ? [] : ["HERMES_AGENT_LLM_BASE_URL="]),
    ...(Object.hasOwn(parsed, "HERMES_AGENT_LLM_API_KEY") ? [] : ["HERMES_AGENT_LLM_API_KEY="]),
  ];
  if (missing.length) fs.appendFileSync(envFile, `${existing.endsWith("\n") ? "" : "\n"}${missing.join("\n")}\n`, "utf8");
  return parseEnv(fs.readFileSync(envFile, "utf8"));
}

function parseEnv(contents) {
  return Object.fromEntries(
    contents
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );
}

function compose(args, { allowFailure = false, envOverrides = {} } = {}) {
  const result = spawnSync(
    "docker",
    ["compose", "--env-file", envFile, ...composeFileArgs, ...args],
    { cwd: root, stdio: "inherit", env: { ...process.env, ...envOverrides } },
  );
  if (result.error) throw result.error;
  if (!allowFailure && result.status !== 0) process.exit(result.status ?? 1);
  return result.status ?? 1;
}

function composeCapture(args, { input, encoding = "utf8", envOverrides = {} } = {}) {
  const result = spawnSync(
    "docker",
    ["compose", "--env-file", envFile, ...composeFileArgs, ...args],
    {
      cwd: root,
      env: { ...process.env, ...envOverrides },
      input,
      encoding,
      maxBuffer: 512 * 1024 * 1024,
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const stderr = Buffer.isBuffer(result.stderr) ? result.stderr.toString("utf8") : String(result.stderr || "");
    throw new Error(`docker compose ${args[0] || "command"} failed: ${stderr.trim() || `exit ${result.status}`}`);
  }
  return result.stdout;
}

function configured(value) {
  return Boolean(String(value || "").trim()) && !/replace-with|change-me|example/i.test(String(value));
}

function hermesAgentEnvironment(env) {
  return {
    ...env,
    ...Object.fromEntries(
      HERMES_AGENT_ENV_KEYS.filter((key) => Object.hasOwn(process.env, key)).map((key) => [key, process.env[key]]),
    ),
  };
}

function hermesAgentAppEnv(env) {
  const missing = HERMES_AGENT_ENV_KEYS.filter((key) => !configured(env[key]));
  if (missing.length) {
    throw new Error(`docker:hermes:up requires ${missing.join(", ")} in .env.local-production or the process environment`);
  }
  if (String(env.HERMES_AGENT_API_SERVER_KEY).trim().length < 32) {
    throw new Error("HERMES_AGENT_API_SERVER_KEY must be at least 32 characters");
  }
  return {
    HERMES_CHAT_COMPLETIONS_URL: "http://hermes-agent:8642/v1/chat/completions",
    HERMES_API_KEY: String(env.HERMES_AGENT_API_SERVER_KEY).trim(),
    HERMES_MODEL: "hermes-agent",
    HERMES_PROVIDER_MODE: "self_hosted",
    MS_REALTY_HERMES_AGENT_EVIDENCE_SCOPE: "local",
  };
}

function localReadinessMaxAgeMs(env) {
  const seconds = Number(env.MS_REALTY_LOCAL_READINESS_MAX_AGE_SECONDS || "900");
  if (!Number.isInteger(seconds) || seconds < 1) {
    throw new Error("MS_REALTY_LOCAL_READINESS_MAX_AGE_SECONDS must be a positive integer");
  }
  return seconds * 1000;
}

function materializeLocalReadiness(env = process.env) {
  const sourceReadinessPath = String(env.MS_REALTY_LOCAL_READINESS_SOURCE_PATH || "").trim();
  const outPath = String(env.MS_REALTY_LAUNCH_READINESS_OUTPUT_PATH || "").trim();
  if (!sourceReadinessPath || !outPath) {
    throw new Error("local readiness materialization requires MS_REALTY_LOCAL_READINESS_SOURCE_PATH and MS_REALTY_LAUNCH_READINESS_OUTPUT_PATH");
  }
  return materializeLocalLaunchReadiness({
    sourceReadinessPath,
    outPath,
    syncReportPath: env.MS_REALTY_POSTGRES_SEARCH_SYNC_REPORT_PATH || env.MS_REALTY_SEARCH_SYNC_REPORT_PATH,
    queryReportPath: env.MS_REALTY_POSTGRES_SEARCH_QUERY_REPORT_PATH || env.MS_REALTY_SEARCH_QUERY_REPORT_PATH,
    hermesReportPath: env.MS_REALTY_HERMES_WORKER_REPORT_PATH,
    payloadRuntimeReportPath: env.MS_REALTY_PAYLOAD_RUNTIME_REPORT_PATH,
    maxReportAgeMs: localReadinessMaxAgeMs(env),
  });
}

function materializeReadiness(env = process.env) {
  if (env.MS_REALTY_DEPLOYMENT_SCOPE !== "production") return materializeLocalReadiness(env);
  const outPath = String(env.MS_REALTY_LAUNCH_READINESS_OUTPUT_PATH || "").trim();
  if (!outPath) throw new Error("production readiness materialization requires MS_REALTY_LAUNCH_READINESS_OUTPUT_PATH");
  const generatedAt = env.MS_REALTY_GENERATED_AT || new Date().toISOString();
  const report = buildLaunchReadinessReport({ ...launchReadinessInputsFromEnv(env), generatedAt });
  return { outPath: writeLaunchReadinessReport(report, outPath), report };
}

function materializeLocalReadinessInApp(envOverrides = {}) {
  compose(
    [
      "exec",
      "-T",
      "-e",
      `${LOCAL_READINESS_MATERIALIZE_FLAG}=1`,
      "app",
      "node",
      "production/scripts/local-production.mjs",
      "materialize-readiness",
    ],
    { envOverrides },
  );
}

async function waitFor(url, { headers = {}, timeoutMs = 90_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastError = "service did not answer";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(3_000) });
      if (response.ok) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error.message;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError}`);
}

function localBackupId(prefix = "backup", now = new Date()) {
  const timestamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z").toLowerCase();
  return `${prefix}-${timestamp}-${crypto.randomBytes(3).toString("hex")}`;
}

function runningComposeServices() {
  return new Set(
    String(composeCapture(["ps", "--status", "running", "--services"]))
      .split(/\r?\n/)
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

function quiescePublicWrites() {
  const running = runningComposeServices();
  const stopped = ["edge", "app"].filter((service) => running.has(service));
  if (stopped.length) compose(["stop", ...stopped]);
  return stopped;
}

async function resumePublicWrites(stopped, env) {
  if (!stopped.length) return;
  if (stopped.includes("app")) compose(["up", "--detach", "--wait", "--no-deps", "app"]);
  if (stopped.includes("edge")) compose(["up", "--detach", "--wait", "--no-deps", "edge"]);
  if (stopped.includes("edge")) await waitFor(`http://127.0.0.1:${env.MS_REALTY_APP_PORT}/api/health`);
}

function createPrivateDirectory(directory) {
  fs.mkdirSync(directory, { recursive: false, mode: 0o700 });
  fs.chmodSync(directory, 0o700);
}

function writePrivateFile(filePath, contents) {
  fs.writeFileSync(filePath, contents, { mode: 0o600, flag: "wx" });
  fs.chmodSync(filePath, 0o600);
}

function archiveRuntimeVolume(backupDir, sourceDirectory, component) {
  compose([
    "run",
    "--rm",
    "--no-deps",
    "--volume",
    `${backupDir}:/backup`,
    "--entrypoint",
    "sh",
    "runtime-init",
    "-ec",
    `umask 077; tar -czf /backup/${component.file} -C ${sourceDirectory} .`,
  ]);
  fs.chmodSync(path.join(backupDir, component.file), 0o600);
}

async function captureLocalBackup(env, { prefix = "backup", keepQuiesced = false } = {}) {
  fs.mkdirSync(LOCAL_BACKUP_ROOT, { recursive: true, mode: 0o700 });
  fs.chmodSync(LOCAL_BACKUP_ROOT, 0o700);
  const backupId = localBackupId(prefix);
  const backupDir = path.join(LOCAL_BACKUP_ROOT, backupId);
  createPrivateDirectory(backupDir);

  compose(["up", "--detach", "--wait", "postgres"]);
  const stopped = quiescePublicWrites();
  let completed = false;
  try {
    const postgresDump = composeCapture(
      ["exec", "-T", "postgres", "pg_dump", "-U", "ms_realty_payload", "-d", "ms_realty_payload", "-Fc"],
      { encoding: null },
    );
    writePrivateFile(path.join(backupDir, LOCAL_BACKUP_COMPONENTS.payload_postgres.file), postgresDump);
    archiveRuntimeVolume(backupDir, "/runtime-data", LOCAL_BACKUP_COMPONENTS.runtime_data);
    archiveRuntimeVolume(backupDir, "/runtime-evidence", LOCAL_BACKUP_COMPONENTS.runtime_evidence);

    const manifest = createLocalBackupManifest({ backupDir, backupId, env });
    writeLocalBackupManifest({ backupDir, manifest });
    validateLocalBackup({ backupDir, env });
    completed = true;
    process.stdout.write(`Local recovery backup created: ${backupDir}\n`);
    return { backupDir, manifest, stoppedServices: stopped };
  } finally {
    if (!completed || !keepQuiesced) await resumePublicWrites(stopped, env);
    if (!completed) fs.rmSync(backupDir, { recursive: true, force: true });
  }
}

function validateArchiveInApp(backupDir, component, label) {
  const listing = composeCapture([
    "run",
    "--rm",
    "--no-deps",
    "--volume",
    `${backupDir}:/backup:ro`,
    "--entrypoint",
    "tar",
    "runtime-init",
    "-tzf",
    `/backup/${component.file}`,
  ]);
  assertSafeArchiveEntries(String(listing).split(/\r?\n/), label);
}

function restoreRuntimeVolume(backupDir, targetDirectory, component) {
  compose([
    "run",
    "--rm",
    "--no-deps",
    "--volume",
    `${backupDir}:/backup:ro`,
    "--entrypoint",
    "sh",
    "runtime-init",
    "-ec",
    `find ${targetDirectory} -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +; tar -xzf /backup/${component.file} -C ${targetDirectory}`,
  ]);
}

async function restoreLocalBackup(env, backupPath, { confirmed = false } = {}) {
  if (!confirmed) {
    throw new Error("restore requires --confirm-replace-local-data because it replaces the local database and CRM/CMS ledgers");
  }
  if (!backupPath) throw new Error("restore requires a backup directory path");

  const target = validateLocalBackup({ backupDir: path.resolve(root, backupPath), env });
  compose(["up", "--detach", "--wait", "postgres"]);
  validateArchiveInApp(target.backupDir, LOCAL_BACKUP_COMPONENTS.runtime_data, "runtime data");
  validateArchiveInApp(target.backupDir, LOCAL_BACKUP_COMPONENTS.runtime_evidence, "runtime evidence");

  const safety = await captureLocalBackup(env, { prefix: "pre-restore", keepQuiesced: true });
  try {
    compose([
      "exec",
      "-T",
      "postgres",
      "psql",
      "-U",
      "ms_realty_payload",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      "DROP DATABASE IF EXISTS ms_realty_payload WITH (FORCE);",
      "-c",
      "CREATE DATABASE ms_realty_payload OWNER ms_realty_payload;",
    ]);
    composeCapture(
      [
        "exec",
        "-T",
        "postgres",
        "pg_restore",
        "-U",
        "ms_realty_payload",
        "-d",
        "ms_realty_payload",
        "--no-owner",
        "--no-privileges",
      ],
      {
        input: fs.readFileSync(path.join(target.backupDir, LOCAL_BACKUP_COMPONENTS.payload_postgres.file)),
        encoding: null,
      },
    );
    restoreRuntimeVolume(target.backupDir, "/runtime-data", LOCAL_BACKUP_COMPONENTS.runtime_data);
    restoreRuntimeVolume(target.backupDir, "/runtime-evidence", LOCAL_BACKUP_COMPONENTS.runtime_evidence);
    compose(["run", "--rm", "payload-migrate"]);
    compose(["up", "--detach", "--wait", "--no-deps", "app"]);
    compose(["up", "--detach", "--wait", "--no-deps", "edge"]);
    await waitFor(`http://127.0.0.1:${env.MS_REALTY_APP_PORT}/api/health`);
    compose(["--profile", "tools", "run", "--rm", "search-seed"]);
    compose(["exec", "-T", "app", "npm", "run", "payload:runtime"]);
    materializeLocalReadinessInApp();
    process.stdout.write(
      `Local recovery restore completed from ${target.backupDir}\nRollback backup retained at ${safety.backupDir}\n`,
    );
  } catch (error) {
    throw new Error(`${error.message}; services were left quiesced and rollback backup is ${safety.backupDir}`);
  }
}

async function start(env, { withHermes = false } = {}) {
  const hermesEnv = withHermes ? hermesAgentEnvironment(env) : env;
  const envOverrides = withHermes ? hermesAgentAppEnv(hermesEnv) : {};
  const profile = withHermes ? ["--profile", "hermes"] : [];
  if (withHermes) compose([...profile, "run", "--rm", "hermes-agent-bootstrap"], { envOverrides });
  // payload-migrate and runtime-init share the app image but do not have a
  // build stanza themselves. Build it before Compose starts either service.
  compose([...profile, "build", "app"], { envOverrides });
  compose([
    ...profile,
    "up",
    "--detach",
    "--wait",
    "postgres",
    "typesense",
    "meilisearch",
    ...(withHermes ? ["hermes-agent"] : []),
  ], { envOverrides });
  compose(["run", "--rm", "runtime-init"], { envOverrides });
  compose(["run", "--rm", "payload-migrate"], { envOverrides });

  // A rebuilt tag alone does not make Compose replace an already-running app
  // container. Recreate it explicitly so local verification uses this build.
  compose([...profile, "up", "--detach", "--wait", "--no-deps", "--force-recreate", "app"], { envOverrides });

  // Caddy resolves the app service address when it starts. Recreate only the
  // edge after an app rebuild so its upstream cannot retain a retired container IP.
  compose(["up", "--detach", "--wait", "--no-deps", "--force-recreate", "edge"], { envOverrides });

  await Promise.all([
    waitFor(`http://127.0.0.1:${env.MS_REALTY_APP_PORT}/api/health`),
    waitFor(`http://127.0.0.1:${env.MS_REALTY_TYPESENSE_PORT}/health`),
    waitFor(`http://127.0.0.1:${env.MS_REALTY_MEILI_PORT}/health`),
  ]);

  compose(["exec", "-T", "app", "npm", "run", "payload:cms:import", "--", "--skip-if-initialized"], { envOverrides });
  compose(["--profile", "tools", "run", "--rm", "search-seed"], { envOverrides });
  compose(["exec", "-T", "app", "npm", "run", "payload:runtime"], { envOverrides });
  if (withHermes) {
    compose([...profile, "exec", "-T", "app", "npm", "run", "hermes:runtime"], { envOverrides });
    compose([...profile, "exec", "-T", "app", "npm", "run", "live:provisioning"], { envOverrides });
    compose([...profile, "exec", "-T", "app", "npm", "run", "live:provisioning:preflight"], { envOverrides });
    compose([...profile, "exec", "-T", "app", "npm", "run", "live:capture"], { envOverrides });
    compose([...profile, "exec", "-T", "app", "npm", "run", "live:preflight"], { envOverrides });
  }
  materializeLocalReadinessInApp(envOverrides);

  process.stdout.write(
    [
      "",
      "MS Realty local production stack is ready:",
      `- Website and operator workbenches: http://127.0.0.1:${env.MS_REALTY_APP_PORT}/ru/`,
      `- Payload CMS: http://127.0.0.1:${env.MS_REALTY_APP_PORT}/payload-admin`,
      `- Typesense health: http://127.0.0.1:${env.MS_REALTY_TYPESENSE_PORT}/health`,
      `- Meilisearch health: http://127.0.0.1:${env.MS_REALTY_MEILI_PORT}/health`,
      withHermes
        ? "- Hermes Agent: internal, authenticated API; local runtime proof was captured without a customer-facing port."
        : "- Hermes remains external unless its endpoint and API key are added to .env.local-production.",
      "- Local CRM/CMS preview data survives app rebuilds in a named Docker volume until npm run docker:reset.",
      "- Local runtime evidence is materialized atomically, but /api/ready remains blocked until production launch gates are complete.",
      "",
    ].join("\n"),
  );
}

try {
  if (process.env[LOCAL_READINESS_MATERIALIZE_FLAG] === "1") {
    if (command !== "materialize-readiness") throw new Error("Local readiness materializer only accepts materialize-readiness");
    const result = materializeReadiness();
    process.stdout.write(`Materialized readiness to ${result.outPath}; production blockers: ${result.report.blockers.join(", ")}\n`);
  } else {
    const env = ensureEnvFile();
    switch (command) {
      case "up":
        await start(env);
        break;
      case "hermes:up":
        await start(env, { withHermes: true });
        break;
      case "seed":
        compose(["run", "--rm", "runtime-init"]);
        compose(["--profile", "tools", "run", "--rm", "search-seed"]);
        compose(["exec", "-T", "app", "npm", "run", "payload:runtime"]);
        materializeLocalReadinessInApp();
        break;
      case "backup":
        await captureLocalBackup(env);
        break;
      case "restore":
        await restoreLocalBackup(env, commandArgs.find((argument) => !argument.startsWith("--")), {
          confirmed: commandArgs.includes("--confirm-replace-local-data"),
        });
        break;
      case "status":
        compose(["ps"], { allowFailure: true });
        break;
      case "logs":
        compose(["logs", "--tail", "200", "app", "edge", "postgres", "payload-migrate", "typesense", "meilisearch"]);
        break;
      case "down":
        compose(["down", "--remove-orphans"]);
        break;
      case "reset":
        compose(["down", "--volumes", "--remove-orphans"]);
        break;
      default:
        process.stderr.write(`Unknown command: ${command}\n`);
        process.exitCode = 2;
    }
  }
} catch (error) {
  process.stderr.write(`LOCAL PRODUCTION COMMAND FAILED: ${error.message}\n`);
  process.exitCode = 1;
}
