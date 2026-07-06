import fs from "node:fs";
import path from "node:path";
import {
  assertSearchEngineQueryReport,
  assertSearchEngineSyncReport,
  DEFAULT_SEARCH_ENGINE_QUERY_REPORT,
  DEFAULT_SEARCH_ENGINE_SYNC_REPORT,
} from "./search-engine-sync.mjs";
import {
  assertHermesDraftWorkerReport,
  DEFAULT_HERMES_DRAFT_WORKER_REPORT_PATH,
} from "./hermes-draft-worker.mjs";
import { fromRoot } from "./paths.mjs";

export const DEFAULT_LAUNCH_READINESS_OUTPUT = fromRoot("production", "data", "launch-readiness.json");

const LIVE_SERVICE_REPORT_TEMPLATES = {
  typesense_meilisearch_sync: "search-engine-sync-report.json.example",
  typesense_meilisearch_query: "search-engine-query-report.json.example",
  hermes_draft_worker: "hermes-draft-worker-report.json.example",
};

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function packageState(filePath = fromRoot("package.json")) {
  const pkg = readJson(filePath);
  return {
    start_script: pkg.scripts?.start || "",
    production_server_entrypoint: fs.existsSync(fromRoot("production", "server.mjs")),
  };
}

function gate(id, status, evidence, message = "") {
  return { id, status, message, evidence };
}

function blockersFrom(gates) {
  return gates.filter((item) => item.status === "blocked").map((item) => item.id);
}

function warningsFrom(structuredData) {
  return Object.entries(structuredData.summary.warnings || {})
    .filter(([, count]) => count > 0)
    .map(([id, count]) => ({ id, count }));
}

function reportStatus(source, filePath, assertReport) {
  if (!fs.existsSync(filePath)) return { source, status: "missing_report", path: filePath };
  try {
    const report = readJson(filePath);
    assertReport(report);
    return { source, status: "pass", path: filePath, summary: report.summary };
  } catch (error) {
    return { source, status: "invalid_report", path: filePath, error: error.message };
  }
}

export function liveServiceReports({
  syncReportPath = DEFAULT_SEARCH_ENGINE_SYNC_REPORT,
  queryReportPath = DEFAULT_SEARCH_ENGINE_QUERY_REPORT,
  hermesReportPath = DEFAULT_HERMES_DRAFT_WORKER_REPORT_PATH,
} = {}) {
  return [
    reportStatus("typesense_meilisearch_sync", syncReportPath, assertSearchEngineSyncReport),
    reportStatus("typesense_meilisearch_query", queryReportPath, assertSearchEngineQueryReport),
    reportStatus("hermes_draft_worker", hermesReportPath, assertHermesDraftWorkerReport),
  ];
}

export function validateLiveServiceReports(options = {}) {
  const reports = liveServiceReports(options);
  return {
    ready: reports.every((item) => item.status === "pass"),
    reports,
  };
}

export function readLiveServiceReportTemplate(source) {
  const filename = LIVE_SERVICE_REPORT_TEMPLATES[source];
  if (!filename) throw new Error(`Unknown live service report source: ${source}`);
  return {
    source,
    filename,
    json: fs.readFileSync(fromRoot("production", "data", filename), "utf8"),
  };
}

export function buildLaunchReadinessReport({
  generatedAt = new Date().toISOString(),
  migration = readJson(fromRoot("production", "data", "migration-records.json")),
  routeMap = readJson(fromRoot("production", "data", "legacy-route-map.json")),
  deployableRedirects = readJson(fromRoot("production", "data", "deployable-redirects.json")),
  sitemap = readJson(fromRoot("production", "data", "localized-sitemap.json")),
  structuredData = readJson(fromRoot("production", "data", "structured-data-report.json")),
  seoEvidence = readJson(fromRoot("production", "data", "seo-evidence.json")),
  httpSmoke = readJson(fromRoot("production", "data", "http-smoke.json")),
  nodeServerSmoke = readJson(fromRoot("production", "data", "node-server-smoke.json")),
  liveServices = liveServiceReports(),
  appState = packageState(),
} = {}) {
  const crawlPass =
    migration.summary.total === 457 &&
    migration.summary.byDomain?.["makler-realty.com"] === 278 &&
    migration.summary.byDomain?.["makler-realty.ru"] === 179 &&
    migration.summary.byStatus?.["200"] === 457;
  const redirectsReviewed =
    deployableRedirects.summary.total >= routeMap.summary.mappedListings &&
    deployableRedirects.summary.homepageTargets === 0 &&
    deployableRedirects.summary.duplicateOldUrls === 0;
  const seoExportsReady = (seoEvidence.summary.missing_required_sources || []).length === 0;
  const liveServicesReady = liveServices.every((item) => item.status === "pass");
  const appLayerReady = appState.production_server_entrypoint && appState.start_script === "node production/server.mjs";
  const monitoringPlan = [
    { source: "privacy_events", status: seoEvidence.summary.sources.privacy_events.status },
    { source: "search_console", status: seoEvidence.summary.sources.search_console.status },
    { source: "yandex_webmaster", status: seoEvidence.summary.sources.yandex_webmaster.status },
    { source: "backlinks", status: seoEvidence.summary.sources.backlinks.status },
  ];
  const rollbackPlan = [
    "Keep legacy DNS/origin rollback available until post-launch crawl is stable.",
    "Disable reviewed redirect deployment before changing content routes if crawl parity fails.",
    "Republish previous sitemap and robots files if indexable route coverage regresses.",
    "Use migration review queue owners to triage failed old URLs before broad redirects.",
  ];
  const monitoringReady = monitoringPlan.every((item) => item.source && item.status);
  const rollbackReady = rollbackPlan.length >= 3;
  const expectedSitemapEntries =
    sitemap.summary.home_pages +
    sitemap.summary.listing_entries +
    sitemap.summary.location_pages +
    sitemap.summary.seller_pages +
    sitemap.summary.contact_pages;
  const localizedSitemapReady =
    sitemap.summary.home_pages === 7 &&
    sitemap.summary.listing_entries === 167 &&
    sitemap.summary.location_pages >= 6 &&
    sitemap.summary.seller_pages === 7 &&
    sitemap.summary.contact_pages === 7 &&
    sitemap.summary.entries === expectedSitemapEntries;

  const gates = [
    gate("crawl_inventory", crawlPass ? "pass" : "blocked", migration.summary),
    gate(
      "redirect_reviews",
      redirectsReviewed ? "pass" : "blocked",
      {
        mapped_listings: routeMap.summary.mappedListings,
        deployable_redirects: deployableRedirects.summary.total,
        homepage_targets: deployableRedirects.summary.homepageTargets,
        duplicate_old_urls: deployableRedirects.summary.duplicateOldUrls,
      },
      redirectsReviewed ? "" : "Only reviewed same-content redirects with no homepage targets or duplicate old URLs may launch.",
    ),
    gate("localized_sitemap", localizedSitemapReady ? "pass" : "blocked", sitemap.summary),
    gate(
      "structured_data",
      structuredData.summary.failing_entries === 0 ? "pass" : "blocked",
      structuredData.summary,
      "Schema can pass while content warnings remain separate.",
    ),
    gate(
      "external_seo_exports",
      seoExportsReady ? "pass" : "blocked",
      {
        missing_required_sources: seoEvidence.summary.missing_required_sources,
        privacy_events: seoEvidence.summary.sources.privacy_events,
      },
      seoExportsReady ? "" : "Search Console, Yandex, and backlink exports are required before launch.",
    ),
    gate(
      "runtime_smoke",
      httpSmoke.listing?.status === 200 && nodeServerSmoke.listing?.status === 200 ? "pass" : "blocked",
      {
        http_listing_status: httpSmoke.listing?.status,
        node_listing_status: nodeServerSmoke.listing?.status,
        node_server_port: nodeServerSmoke.server?.port || null,
      },
    ),
    gate(
      "live_services",
      liveServicesReady ? "pass" : "blocked",
      { reports: liveServices },
      liveServicesReady
        ? ""
        : "Run live Typesense/Meilisearch sync/query and Hermes draft worker commands after provisioning.",
    ),
    gate(
      "monitoring_rollback",
      monitoringReady && rollbackReady ? "pass" : "blocked",
      {
        monitoring_sources: monitoringPlan.map((item) => item.source),
        privacy_events_status: monitoringPlan.find((item) => item.source === "privacy_events")?.status,
        rollback_steps: rollbackPlan.length,
      },
      monitoringReady && rollbackReady ? "" : "Monitoring evidence and rollback steps are required before launch.",
    ),
    gate(
      "production_app_layer",
      appLayerReady ? "pass" : "blocked",
      appState,
      appLayerReady ? "Node production adapter is present; framework migration can consume the same contract later." : "Production app adapter is not present.",
    ),
  ];

  const blockers = blockersFrom(gates);
  return {
    generated_at: generatedAt,
    launch_ready: blockers.length === 0,
    status: blockers.length ? "blocked" : "ready",
    blockers,
    warnings: warningsFrom(structuredData),
    gates,
    live_services: liveServices,
    monitoring_plan: monitoringPlan,
    rollback_plan: rollbackPlan,
  };
}

export function assertLaunchReadinessReport(report) {
  if (!Array.isArray(report.gates) || report.gates.length < 7) throw new Error("Launch readiness report must include core gates");
  const gateBlockers = blockersFrom(report.gates);
  if (JSON.stringify(report.blockers || []) !== JSON.stringify(gateBlockers)) {
    throw new Error("Launch readiness blockers must match blocked gates");
  }
  if (report.launch_ready !== (gateBlockers.length === 0)) throw new Error("Launch readiness flag must match blockers");
  if (report.status !== (report.launch_ready ? "ready" : "blocked")) throw new Error("Launch readiness status must match blockers");
  if (report.blockers.includes("production_app_layer")) throw new Error("Production app layer should be covered by the Node adapter");
  if (!report.gates.find((item) => item.id === "crawl_inventory" && item.status === "pass")) {
    throw new Error("Launch readiness must prove crawl inventory passed");
  }
  if (!report.gates.some((item) => item.id === "live_services")) {
    throw new Error("Launch readiness must include live service provisioning gate");
  }
  if (!report.monitoring_plan.some((item) => item.source === "privacy_events" && item.status === "imported")) {
    throw new Error("Launch readiness must include privacy analytics monitoring");
  }
  if (!Array.isArray(report.rollback_plan) || report.rollback_plan.length < 3) {
    throw new Error("Launch readiness must include a rollback plan");
  }
  if (!report.gates.some((item) => item.id === "monitoring_rollback" && item.status === "pass")) {
    throw new Error("Launch readiness must prove monitoring and rollback gate passed");
  }
  return true;
}

export function writeLaunchReadinessReport(report, outPath = DEFAULT_LAUNCH_READINESS_OUTPUT) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  assertLaunchReadinessReport(report);
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
  return outPath;
}
