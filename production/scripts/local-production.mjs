import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const composeFile = path.join(root, "production", "docker-compose.local-production.yml");
const envFile = path.join(root, ".env.local-production");
const command = process.argv[2] || "status";
const HERMES_AGENT_ENV_KEYS = ["HERMES_AGENT_API_SERVER_KEY", "HERMES_AGENT_MODEL", "HERMES_AGENT_LLM_BASE_URL", "HERMES_AGENT_LLM_API_KEY"];

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
    ["compose", "--env-file", envFile, "-f", composeFile, ...args],
    { cwd: root, stdio: "inherit", env: { ...process.env, ...envOverrides } },
  );
  if (result.error) throw result.error;
  if (!allowFailure && result.status !== 0) process.exit(result.status ?? 1);
  return result.status ?? 1;
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

async function start(env, { withHermes = false } = {}) {
  const hermesEnv = withHermes ? hermesAgentEnvironment(env) : env;
  const envOverrides = withHermes ? hermesAgentAppEnv(hermesEnv) : {};
  const profile = withHermes ? ["--profile", "hermes"] : [];
  if (withHermes) compose([...profile, "run", "--rm", "hermes-agent-bootstrap"], { envOverrides });
  compose([
    ...profile,
    "up",
    "--build",
    "--detach",
    "--wait",
    "postgres",
    "typesense",
    "meilisearch",
    "payload-migrate",
    ...(withHermes ? ["hermes-agent"] : []),
    "app",
    "edge",
  ], { envOverrides });

  await Promise.all([
    waitFor(`http://127.0.0.1:${env.MS_REALTY_APP_PORT}/api/health`),
    waitFor(`http://127.0.0.1:${env.MS_REALTY_TYPESENSE_PORT}/health`),
    waitFor(`http://127.0.0.1:${env.MS_REALTY_MEILI_PORT}/health`),
  ]);

  compose(["--profile", "tools", "run", "--rm", "runtime-init"], { envOverrides });
  compose(["--profile", "tools", "run", "--rm", "search-seed"], { envOverrides });
  compose(["exec", "-T", "app", "npm", "run", "payload:runtime"], { envOverrides });
  if (withHermes) compose([...profile, "exec", "-T", "app", "npm", "run", "hermes:runtime"], { envOverrides });

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
      "",
    ].join("\n"),
  );
}

try {
  const env = ensureEnvFile();

  switch (command) {
    case "up":
      await start(env);
      break;
    case "hermes:up":
      await start(env, { withHermes: true });
      break;
    case "seed":
      compose(["--profile", "tools", "run", "--rm", "runtime-init"]);
      compose(["--profile", "tools", "run", "--rm", "search-seed"]);
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
} catch (error) {
  process.stderr.write(`LOCAL PRODUCTION COMMAND FAILED: ${error.message}\n`);
  process.exitCode = 1;
}
