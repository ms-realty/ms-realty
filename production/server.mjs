import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHttpApp } from "./lib/http.mjs";
import { createNodeServer, listen, close } from "./lib/node-server.mjs";
import { DEFAULT_EVENT_LEDGER_PATH } from "./lib/events.mjs";
import { fromRoot } from "./lib/paths.mjs";

function portFrom(value) {
  const raw = value === undefined || value === "" ? "3000" : String(value);
  if (!/^\d+$/.test(raw)) throw new Error("PORT must be an integer from 0 to 65535");
  const port = Number(raw);
  if (port > 65535) throw new Error("PORT must be an integer from 0 to 65535");
  return port;
}

function bytesFrom(value) {
  const raw = value === undefined || value === "" ? String(10 * 1024 * 1024) : String(value);
  if (!/^\d+$/.test(raw)) throw new Error("MS_REALTY_MAX_BODY_BYTES must be a positive integer");
  const bytes = Number(raw);
  if (bytes < 1) throw new Error("MS_REALTY_MAX_BODY_BYTES must be a positive integer");
  return bytes;
}

export function productionServerConfig(env = process.env) {
  return {
    host: env.MS_REALTY_HOST || env.HOST || "0.0.0.0",
    port: portFrom(env.MS_REALTY_PORT || env.PORT),
    maxBodyBytes: bytesFrom(env.MS_REALTY_MAX_BODY_BYTES),
    eventLedgerPath: env.MS_REALTY_EVENT_LEDGER_PATH || DEFAULT_EVENT_LEDGER_PATH,
    localeRegistryPath: env.MS_REALTY_LOCALE_REGISTRY_PATH || fromRoot("locales", "registry.json"),
  };
}

export function createProductionHttpApp(config = productionServerConfig()) {
  return createHttpApp({
    eventLedgerPath: config.eventLedgerPath,
    localeRegistryPath: config.localeRegistryPath,
  });
}

export function createProductionServer(config = productionServerConfig()) {
  return createNodeServer(createProductionHttpApp(config), { maxBodyBytes: config.maxBodyBytes });
}

export async function startProductionServer(config = productionServerConfig()) {
  const server = createProductionServer(config);
  const address = await listen(server, config.port, config.host);
  console.log(JSON.stringify({ kind: "ms_realty_server", status: "listening", address }));

  const shutdown = async () => {
    await close(server);
    process.exit(0);
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
  return { server, address };
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) startProductionServer().catch((error) => {
  console.error(error);
  process.exit(1);
});
