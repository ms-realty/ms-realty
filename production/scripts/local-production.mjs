import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const composeFile = path.join(root, "production", "docker-compose.local-production.yml");
const envFile = path.join(root, ".env.local-production");
const command = process.argv[2] || "status";

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
      "",
    ].join("\n");
    fs.writeFileSync(envFile, contents, { encoding: "utf8", mode: 0o600, flag: "wx" });
  }
  fs.chmodSync(envFile, 0o600);
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

function compose(args, { allowFailure = false } = {}) {
  const result = spawnSync(
    "docker",
    ["compose", "--env-file", envFile, "-f", composeFile, ...args],
    { cwd: root, stdio: "inherit" },
  );
  if (result.error) throw result.error;
  if (!allowFailure && result.status !== 0) process.exit(result.status ?? 1);
  return result.status ?? 1;
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

async function start(env) {
  compose([
    "up",
    "--build",
    "--detach",
    "--wait",
    "postgres",
    "typesense",
    "meilisearch",
    "payload-migrate",
    "app",
    "edge",
  ]);

  await Promise.all([
    waitFor(`http://127.0.0.1:${env.MS_REALTY_APP_PORT}/api/health`),
    waitFor(`http://127.0.0.1:${env.MS_REALTY_TYPESENSE_PORT}/health`),
    waitFor(`http://127.0.0.1:${env.MS_REALTY_MEILI_PORT}/health`),
  ]);

  compose(["--profile", "tools", "run", "--rm", "runtime-init"]);
  compose(["--profile", "tools", "run", "--rm", "search-seed"]);
  compose(["exec", "-T", "app", "npm", "run", "payload:runtime"]);

  process.stdout.write(
    [
      "",
      "MS Realty local production stack is ready:",
      `- Website and operator workbenches: http://127.0.0.1:${env.MS_REALTY_APP_PORT}/ru/`,
      `- Payload CMS: http://127.0.0.1:${env.MS_REALTY_APP_PORT}/payload-admin`,
      `- Typesense health: http://127.0.0.1:${env.MS_REALTY_TYPESENSE_PORT}/health`,
      `- Meilisearch health: http://127.0.0.1:${env.MS_REALTY_MEILI_PORT}/health`,
      "- Hermes remains external unless its endpoint and API key are added to .env.local-production.",
      "",
    ].join("\n"),
  );
}

const env = ensureEnvFile();

switch (command) {
  case "up":
    await start(env);
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
    process.exit(2);
}
