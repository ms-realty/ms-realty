import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_BROKER_CONTACT_LEDGER_PATH } from "./lib/broker-contacts.mjs";
import { createHttpApp } from "./lib/http.mjs";
import { DEFAULT_LANGUAGE_REQUEST_LEDGER_PATH } from "./lib/language-requests.mjs";
import { DEFAULT_LEAD_LEDGER_PATH } from "./lib/lead-ledger.mjs";
import { DEFAULT_REPLY_OUTBOX_PATH } from "./lib/lead-replies.mjs";
import { DEFAULT_LISTING_EDIT_LEDGER_PATH } from "./lib/listing-edits.mjs";
import { createNodeServer, listen, close } from "./lib/node-server.mjs";
import { DEFAULT_EVENT_LEDGER_PATH } from "./lib/events.mjs";
import { DEFAULT_DEAL_LEDGER_PATH } from "./lib/deal-ledger.mjs";
import { fromRoot } from "./lib/paths.mjs";
import { DEFAULT_SAVED_SEARCH_LEDGER_PATH } from "./lib/saved-searches.mjs";
import { DEFAULT_SELLER_PIPELINE_PATH } from "./lib/seller-pipeline.mjs";
import { DEFAULT_SLUG_HISTORY_PATH } from "./lib/slug-history.mjs";
import { DEFAULT_TOUR_APPROVAL_LEDGER_PATH } from "./lib/tours.mjs";
import { DEFAULT_TRANSLATION_LEDGER_PATH } from "./lib/translation-ledger.mjs";
import { DEFAULT_VIEWING_LEDGER_PATH } from "./lib/viewing-ledger.mjs";

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

function hostFrom(value) {
  const host = value === undefined || value === "" ? "0.0.0.0" : String(value);
  if (host.trim() !== host || host === "") throw new Error("HOST must be a non-empty hostname or IP address");
  return host;
}

export function productionServerConfig(env = process.env) {
  return {
    host: hostFrom(env.MS_REALTY_HOST || env.HOST),
    port: portFrom(env.MS_REALTY_PORT || env.PORT),
    maxBodyBytes: bytesFrom(env.MS_REALTY_MAX_BODY_BYTES),
    eventLedgerPath: env.MS_REALTY_EVENT_LEDGER_PATH || DEFAULT_EVENT_LEDGER_PATH,
    leadLedgerPath: env.MS_REALTY_LEAD_LEDGER_PATH || DEFAULT_LEAD_LEDGER_PATH,
    replyOutboxPath: env.MS_REALTY_REPLY_OUTBOX_PATH || DEFAULT_REPLY_OUTBOX_PATH,
    languageRequestPath: env.MS_REALTY_LANGUAGE_REQUEST_LEDGER_PATH || DEFAULT_LANGUAGE_REQUEST_LEDGER_PATH,
    translationLedgerPath: env.MS_REALTY_TRANSLATION_LEDGER_PATH || DEFAULT_TRANSLATION_LEDGER_PATH,
    listingEditLedgerPath: env.MS_REALTY_LISTING_EDIT_LEDGER_PATH || DEFAULT_LISTING_EDIT_LEDGER_PATH,
    viewingLedgerPath: env.MS_REALTY_VIEWING_LEDGER_PATH || DEFAULT_VIEWING_LEDGER_PATH,
    savedSearchLedgerPath: env.MS_REALTY_SAVED_SEARCH_LEDGER_PATH || DEFAULT_SAVED_SEARCH_LEDGER_PATH,
    sellerPipelinePath: env.MS_REALTY_SELLER_PIPELINE_PATH || DEFAULT_SELLER_PIPELINE_PATH,
    dealLedgerPath: env.MS_REALTY_DEAL_LEDGER_PATH || DEFAULT_DEAL_LEDGER_PATH,
    slugHistoryPath: env.MS_REALTY_SLUG_HISTORY_PATH || DEFAULT_SLUG_HISTORY_PATH,
    brokerContactLedgerPath: env.MS_REALTY_BROKER_CONTACT_LEDGER_PATH || DEFAULT_BROKER_CONTACT_LEDGER_PATH,
    tourApprovalLedgerPath: env.MS_REALTY_TOUR_APPROVAL_LEDGER_PATH || DEFAULT_TOUR_APPROVAL_LEDGER_PATH,
    localeRegistryPath: env.MS_REALTY_LOCALE_REGISTRY_PATH || fromRoot("locales", "registry.json"),
    searchSyncReportPath: env.MS_REALTY_SEARCH_SYNC_REPORT_PATH,
    searchQueryReportPath: env.MS_REALTY_SEARCH_QUERY_REPORT_PATH,
    hermesWorkerReportPath: env.MS_REALTY_HERMES_WORKER_REPORT_PATH,
  };
}

export function createProductionHttpApp(config = productionServerConfig()) {
  return createHttpApp({
    eventLedgerPath: config.eventLedgerPath,
    leadLedgerPath: config.leadLedgerPath,
    replyOutboxPath: config.replyOutboxPath,
    languageRequestPath: config.languageRequestPath,
    translationLedgerPath: config.translationLedgerPath,
    listingEditLedgerPath: config.listingEditLedgerPath,
    viewingLedgerPath: config.viewingLedgerPath,
    savedSearchLedgerPath: config.savedSearchLedgerPath,
    sellerPipelinePath: config.sellerPipelinePath,
    dealLedgerPath: config.dealLedgerPath,
    slugHistoryPath: config.slugHistoryPath,
    brokerContactLedgerPath: config.brokerContactLedgerPath,
    tourApprovalLedgerPath: config.tourApprovalLedgerPath,
    localeRegistryPath: config.localeRegistryPath,
    searchSyncReportPath: config.searchSyncReportPath,
    searchQueryReportPath: config.searchQueryReportPath,
    hermesWorkerReportPath: config.hermesWorkerReportPath,
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
