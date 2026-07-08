import fs from "node:fs";
import path from "node:path";
import { fromRoot } from "./paths.mjs";

export const DEFAULT_PAYLOAD_RUNTIME_ENV_EXAMPLE = fromRoot("production", "data", "payload-runtime.env.example");
export const DEFAULT_PAYLOAD_RUNTIME_COMPOSE_FILE = fromRoot("production", "docker-compose.payload.yml");

export function payloadRuntimeEnvExample() {
  return [
    "# Copy to a private env file before use. Do not commit real values.",
    "PAYLOAD_SECRET=replace-with-output-of-openssl-rand-base64-32",
    "PAYLOAD_POSTGRES_USER=ms_realty_payload",
    "PAYLOAD_POSTGRES_PASSWORD=replace-with-postgres-password",
    "PAYLOAD_POSTGRES_DB=ms_realty_payload",
    "PAYLOAD_POSTGRES_HOST=127.0.0.1",
    "PAYLOAD_POSTGRES_PORT=5432",
    "DATABASE_URL=postgres://ms_realty_payload:replace-with-postgres-password@127.0.0.1:5432/ms_realty_payload",
    "MS_REALTY_PAYLOAD_RUNTIME_REPORT_PATH=production/data/payload-runtime-report.json",
    "",
  ].join("\n");
}

export function payloadRuntimeComposeFile() {
  return [
    "services:",
    "  payload-postgres:",
    "    image: postgres:16-alpine",
    "    restart: unless-stopped",
    "    environment:",
    "      POSTGRES_USER: ${PAYLOAD_POSTGRES_USER:-ms_realty_payload}",
    "      POSTGRES_PASSWORD: ${PAYLOAD_POSTGRES_PASSWORD:?set PAYLOAD_POSTGRES_PASSWORD in the private Payload env file}",
    "      POSTGRES_DB: ${PAYLOAD_POSTGRES_DB:-ms_realty_payload}",
    "    ports:",
    "      - \"${PAYLOAD_POSTGRES_HOST:-127.0.0.1}:${PAYLOAD_POSTGRES_PORT:-5432}:5432\"",
    "    volumes:",
    "      - payload-postgres-data:/var/lib/postgresql/data",
    "    healthcheck:",
    "      test: [\"CMD-SHELL\", \"pg_isready -U $${POSTGRES_USER} -d $${POSTGRES_DB}\"]",
    "      interval: 5s",
    "      timeout: 5s",
    "      retries: 20",
    "",
    "volumes:",
    "  payload-postgres-data:",
    "",
  ].join("\n");
}

export function payloadRuntimeBootstrapChecklist() {
  return [
    "1. Copy `production/data/payload-runtime.env.example` to a private env file such as `.env.payload-runtime`.",
    "2. Replace `PAYLOAD_SECRET` with `openssl rand -base64 32` output and replace the Postgres password placeholders.",
    "3. Start Postgres with `docker compose --env-file .env.payload-runtime -f production/docker-compose.payload.yml up -d payload-postgres`.",
    "4. Export or source the same private env file in the application runtime.",
    "5. Run `npm run payload:runtime`, then `npm run payload:preflight`, then `npm run launch:preflight`.",
  ];
}

export function payloadRuntimeBootstrapPayload() {
  return {
    kind: "admin_payload_runtime_bootstrap",
    env_example: payloadRuntimeEnvExample(),
    compose_file: payloadRuntimeComposeFile(),
    checklist: payloadRuntimeBootstrapChecklist(),
  };
}

export function assertPayloadRuntimeBootstrap({ compose = payloadRuntimeComposeFile(), envExample = payloadRuntimeEnvExample() } = {}) {
  for (const key of ["PAYLOAD_SECRET", "DATABASE_URL", "PAYLOAD_POSTGRES_PASSWORD"]) {
    if (!envExample.includes(`${key}=`)) throw new Error(`Payload runtime env example must include ${key}`);
  }
  if (!compose.includes("postgres:16-alpine")) throw new Error("Payload runtime compose file must pin the Postgres image");
  if (!compose.includes("payload-postgres-data")) throw new Error("Payload runtime compose file must persist Postgres data");
  if (!compose.includes("127.0.0.1")) throw new Error("Payload runtime compose file must bind Postgres to localhost by default");
  return true;
}

export function writePayloadRuntimeBootstrap({
  composePath = DEFAULT_PAYLOAD_RUNTIME_COMPOSE_FILE,
  envExamplePath = DEFAULT_PAYLOAD_RUNTIME_ENV_EXAMPLE,
} = {}) {
  const envExample = payloadRuntimeEnvExample();
  const compose = payloadRuntimeComposeFile();
  assertPayloadRuntimeBootstrap({ compose, envExample });
  fs.mkdirSync(path.dirname(envExamplePath), { recursive: true });
  fs.mkdirSync(path.dirname(composePath), { recursive: true });
  fs.writeFileSync(envExamplePath, envExample);
  fs.writeFileSync(composePath, compose);
  return { composePath, envExamplePath };
}
