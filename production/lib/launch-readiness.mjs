import fs from "node:fs";
import path from "node:path";
import {
  assertSearchEngineQueryReport,
  assertSearchEngineSyncReport,
  DEFAULT_SEARCH_ENGINE_QUERY_REPORT,
  DEFAULT_SEARCH_ENGINE_SYNC_REPORT,
  writeSearchEngineQueryReport,
  writeSearchEngineSyncReport,
} from "./search-engine-sync.mjs";
import {
  assertHermesDraftWorkerReport,
  DEFAULT_HERMES_DRAFT_WORKER_REPORT_PATH,
  writeHermesDraftWorkerReport,
} from "./hermes-draft-worker.mjs";
import { assertHermesChatCompletionsEndpoint } from "./hermes-provider-provisioning.mjs";
import { DEFAULT_LISTING_QUALITY_REVIEW_INPUT, validateListingQualityReviewCsv } from "./listing-quality.mjs";
import {
  assertPayloadRuntimeReport,
  assertProductionDatabaseHost,
  DEFAULT_PAYLOAD_RUNTIME_REPORT,
} from "./payload-runtime.mjs";
import {
  REQUIRED_EXPORTS,
  assertSeoEvidence,
  assertSeoSourceSummary,
  missingRequiredExport,
  missingRequiredSources,
} from "./seo-evidence-contract.mjs";
import { fromRoot } from "./paths.mjs";

export const DEFAULT_LAUNCH_READINESS_OUTPUT = fromRoot("production", "data", "launch-readiness.json");
export const DEFAULT_LIVE_SERVICE_PREFLIGHT_REPORT = fromRoot("production", "data", "live-service-preflight-report.json");

const LIVE_SERVICE_REPORT_TEMPLATES = {
  typesense_meilisearch_sync: "search-engine-sync-report.json.example",
  typesense_meilisearch_query: "search-engine-query-report.json.example",
  hermes_draft_worker: "hermes-draft-worker-report.json.example",
};

const LIVE_SERVICE_REPORT_WRITERS = {
  typesense_meilisearch_sync: { write: writeSearchEngineSyncReport, pathKey: "syncReportPath" },
  typesense_meilisearch_query: { write: writeSearchEngineQueryReport, pathKey: "queryReportPath" },
  hermes_draft_worker: { write: writeHermesDraftWorkerReport, pathKey: "hermesReportPath" },
};
const REQUIRED_LAUNCH_GATE_IDS = [
  "crawl_inventory",
  "redirect_reviews",
  "localized_sitemap",
  "structured_data",
  "external_seo_exports",
  "listing_quality_review",
  "runtime_smoke",
  "live_services",
  "monitoring_rollback",
  "production_app_layer",
  "payload_runtime",
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function assertLiveServiceReportTimestamp(report) {
  if (!report.generated_at || Number.isNaN(Date.parse(report.generated_at))) {
    throw new Error("Live service report must include valid generated_at");
  }
}

function assertLaunchServiceUrl(value, label) {
  if (!value) throw new Error(`${label} must include service URL evidence`);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must include valid service URL evidence`);
  }
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error(`${label} must use http or https`);
  if (parsed.username || parsed.password) throw new Error(`${label} must not include URL credentials`);
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const reservedHosts = ["example.com", "example.net", "example.org", "localhost", "127.0.0.1", "0.0.0.0", "::1"];
  const reservedSuffixes = [".example", ".example.com", ".example.net", ".example.org", ".invalid", ".localhost", ".local", ".test"];
  if (reservedHosts.includes(host) || reservedSuffixes.some((suffix) => host.endsWith(suffix))) {
    throw new Error(`${label} must not use localhost or placeholder service URLs`);
  }
}

function assertLiveServiceReportHasNoSecrets(report) {
  if (/Bearer\s+|api[_-]?key|x-typesense-api-key|:\/\/[^/@\s]+:[^/@\s]+@/i.test(JSON.stringify(report))) {
    throw new Error("Live service reports must not persist secrets");
  }
}

function assertLaunchLiveServiceEvidence(source, report) {
  if (source === "typesense_meilisearch_sync") {
    for (const engine of report.engines || []) {
      const urls = (engine.operations || []).map((operation) => operation.url);
      if (!urls.length) throw new Error(`${engine.engine} sync report must include operation URL evidence`);
      for (const url of urls) assertLaunchServiceUrl(url, `${engine.engine} sync report`);
    }
    return;
  }
  if (source === "typesense_meilisearch_query") {
    for (const engine of report.engines || []) {
      assertLaunchServiceUrl(engine.service_url, `${engine.engine} query report`);
    }
    return;
  }
  if (source === "hermes_draft_worker") {
    assertLaunchServiceUrl(report.provider?.endpoint, "Hermes worker report");
    assertHermesChatCompletionsEndpoint(report.provider.endpoint, "Hermes worker report endpoint");
  }
}

function packageState(filePath = fromRoot("package.json")) {
  const pkg = readJson(filePath);
  const hasPayload = Boolean(pkg.dependencies?.payload || pkg.devDependencies?.payload);
  const hasPayloadConfig = ["payload.config.ts", "payload.config.js", "src/payload.config.ts"].some((file) =>
    fs.existsSync(fromRoot(file)),
  );
  return {
    start_script: pkg.scripts?.start || "",
    production_server_entrypoint: fs.existsSync(fromRoot("production", "server.mjs")),
    payload_dependency: hasPayload,
    payload_config: hasPayloadConfig,
    payload_collection_export: fs.existsSync(fromRoot("production", "data", "payload-collections.json")),
    payload_secret_configured: Boolean(process.env.PAYLOAD_SECRET),
    payload_database_url_configured: Boolean(process.env.DATABASE_URL),
  };
}

function gate(id, status, evidence, message = "") {
  return { id, status, message, evidence };
}

function blockersFrom(gates) {
  return gates.filter((item) => item.status === "blocked").map((item) => item.id);
}

function gateById(report, id) {
  return report.gates.find((item) => item.id === id);
}

function assertPassCrawlInventoryEvidence(report) {
  const crawl = gateById(report, "crawl_inventory");
  if (crawl?.status !== "pass") return;
  const evidence = crawl.evidence || {};
  if (
    evidence.total !== 457 ||
    evidence.byDomain?.["makler-realty.com"] !== 278 ||
    evidence.byDomain?.["makler-realty.ru"] !== 179 ||
    evidence.byStatus?.["200"] !== 457
  ) {
    throw new Error("Launch readiness crawl inventory requires exact source URL evidence");
  }
}

function assertPassRedirectReviewEvidence(report) {
  const redirects = gateById(report, "redirect_reviews");
  if (redirects?.status !== "pass") return;
  const evidence = redirects.evidence || {};
  if (
    !Number.isInteger(evidence.mapped_listings) ||
    !Number.isInteger(evidence.deployable_redirects) ||
    evidence.mapped_listings < 1 ||
    evidence.deployable_redirects < evidence.mapped_listings ||
    evidence.homepage_targets !== 0 ||
    evidence.duplicate_old_urls !== 0
  ) {
    throw new Error("Launch readiness redirect reviews require complete same-content redirect evidence");
  }
}

function assertPassLocalizedSitemapEvidence(report) {
  const sitemap = gateById(report, "localized_sitemap");
  if (sitemap?.status !== "pass") return;
  const evidence = sitemap.evidence || {};
  const entries =
    evidence.home_pages +
    evidence.listing_entries +
    evidence.location_pages +
    evidence.seller_pages +
    evidence.contact_pages +
    evidence.guide_pages;
  if (
    evidence.home_pages !== 7 ||
    evidence.listing_entries !== 167 ||
    evidence.location_pages < 6 ||
    evidence.seller_pages !== 7 ||
    evidence.contact_pages !== 7 ||
    evidence.guide_pages !== 2 ||
    evidence.entries !== entries
  ) {
    throw new Error("Launch readiness localized sitemap requires complete approved route evidence");
  }
}

function assertPassStructuredDataEvidence(report) {
  const structuredData = gateById(report, "structured_data");
  if (structuredData?.status !== "pass") return;
  if (structuredData.evidence?.failing_entries !== 0) {
    throw new Error("Launch readiness structured data requires zero failing entries");
  }
}

function hasCompleteListingQualityEvidence(evidence) {
  const summary = evidence?.summary;
  const countKeys = ["expected_review_rows", "review_rows", "missing_review_rows", "facts_review_rows", "media_review_rows"];
  return (
    evidence?.status === "pass" &&
    Boolean(evidence?.path) &&
    !evidence.path.endsWith(".example") &&
    countKeys.every((key) => Number.isInteger(summary?.[key]) && summary[key] >= 0) &&
    summary.expected_review_rows >= 1 &&
    summary.review_rows === summary.expected_review_rows &&
    summary.missing_review_rows === 0 &&
    summary.facts_review_rows <= summary.review_rows &&
    summary.media_review_rows <= summary.review_rows &&
    summary.expected_review_rows === summary.review_rows + summary.missing_review_rows
  );
}

function assertPassListingQualityEvidence(report) {
  const review = gateById(report, "listing_quality_review");
  if (review?.status !== "pass") return;
  if (!hasCompleteListingQualityEvidence(review.evidence)) {
    throw new Error("Launch readiness listing quality requires complete non-example review evidence");
  }
}

function assertPassExternalSeoEvidence(report) {
  const seo = gateById(report, "external_seo_exports");
  if (seo?.status !== "pass") return;
  const evidence = seo.evidence || {};
  const sourceSummaries = {
    ...(evidence.sources || {}),
    ...(evidence.analytics_export ? { analytics_export: evidence.analytics_export } : {}),
    ...(evidence.privacy_events ? { privacy_events: evidence.privacy_events } : {}),
  };
  if (sourceSummaries.analytics_export?.status === "imported") {
    assertSeoSourceSummary(sourceSummaries.analytics_export, "analytics_export");
  }
  for (const source of REQUIRED_EXPORTS) {
    const sourceSummary = sourceSummaries[source];
    assertSeoSourceSummary(sourceSummary, source);
    if (missingRequiredExport(sourceSummary)) {
      throw new Error(`Launch readiness external SEO requires complete ${source} evidence`);
    }
  }
  const expectedMissing = missingRequiredSources(sourceSummaries);
  if (
    !Array.isArray(evidence.missing_required_sources) ||
    JSON.stringify(evidence.missing_required_sources) !== JSON.stringify(expectedMissing) ||
    expectedMissing.length !== 0
  ) {
    throw new Error("Launch readiness external SEO requires imported privacy or analytics evidence and no missing sources");
  }
}

function assertPassRuntimeSmokeEvidence(report) {
  const smoke = gateById(report, "runtime_smoke");
  if (smoke?.status !== "pass") return;
  const evidence = smoke.evidence || {};
  if (
    evidence.http_listing_status !== 200 ||
    evidence.node_listing_status !== 200 ||
    evidence.node_server_port_observed !== true
  ) {
    throw new Error("Launch readiness runtime smoke requires HTTP and Node listing evidence");
  }
}

function assertLiveServiceSummaryEvidence(item) {
  const summary = item.summary || {};
  const hasSearchTargets =
    typeof summary.targets?.typesense === "string" &&
    summary.targets.typesense.trim() &&
    typeof summary.targets?.meilisearch === "string" &&
    summary.targets.meilisearch.trim();
  if (
    item.source === "typesense_meilisearch_sync" &&
    (summary.engines !== 2 ||
      !hasSearchTargets ||
      !Array.isArray(summary.documents_per_engine) ||
      summary.documents_per_engine.length !== 2 ||
      summary.documents_per_engine.some((count) => !Number.isInteger(count) || count < 167) ||
      !Number.isInteger(summary.total_operations) ||
      summary.total_operations < 4)
  ) {
    throw new Error("Launch readiness live services require search sync summary evidence");
  }
  if (
    item.source === "typesense_meilisearch_query" &&
    (summary.engines !== 2 ||
      !hasSearchTargets ||
      !Number.isInteger(summary.total_hits) ||
      summary.total_hits < 1 ||
      !Array.isArray(summary.first_hit_ids) ||
      summary.first_hit_ids.length < 2)
  ) {
    throw new Error("Launch readiness live services require search query summary evidence");
  }
  if (
    item.source === "hermes_draft_worker" &&
    (!Number.isInteger(summary.attempted) ||
      !Number.isInteger(summary.persisted) ||
      !Number.isInteger(summary.rejected) ||
      summary.attempted < 1 ||
      summary.persisted < 1 ||
      summary.attempted !== summary.persisted + summary.rejected)
  ) {
    throw new Error("Launch readiness live services require Hermes worker summary evidence");
  }
}

function assertLiveServiceReportPassEvidence(item) {
  if (item.status !== "pass" || !item.path || item.path.endsWith(".example")) {
    throw new Error("Launch readiness live services require validated non-example reports");
  }
  assertLiveServiceSummaryEvidence(item);
}

function assertPassRuntimeEvidence(report) {
  const liveServices = gateById(report, "live_services");
  if (liveServices?.status === "pass") {
    const reports = liveServices.evidence?.reports || [];
    const sources = new Set(reports.map((item) => item.source));
    for (const source of Object.keys(LIVE_SERVICE_REPORT_TEMPLATES)) {
      if (!sources.has(source)) throw new Error(`Launch readiness live services missing ${source} evidence`);
    }
    for (const item of reports) {
      assertLiveServiceReportPassEvidence(item);
    }
  }

  const payload = gateById(report, "payload_runtime");
  if (payload?.status === "pass") {
    const databaseTcp = payload.evidence?.checks?.find((item) => item.id === "database_tcp");
    const database = payload.evidence?.summary?.database;
    const databaseTargetMatches =
      databaseTcp?.database === database?.database &&
      databaseTcp?.host === database?.host &&
      databaseTcp?.port === database?.port &&
      databaseTcp?.credentials_configured === database?.credentials_configured;
    if (
      payload.evidence?.status !== "pass" ||
      database?.status !== "pass" ||
      !database.database ||
      !database.host ||
      !Number.isInteger(database.port) ||
      database.credentials_configured !== true ||
      databaseTcp?.status !== "pass" ||
      !databaseTcp.database ||
      !databaseTcp.host ||
      !Number.isInteger(databaseTcp.port) ||
      databaseTcp.credentials_configured !== true ||
      !databaseTargetMatches
    ) {
      throw new Error("Launch readiness payload runtime requires database TCP target evidence");
    }
    assertProductionDatabaseHost(database.host);
    assertProductionDatabaseHost(databaseTcp.host);
  }
}

function assertPassAppLayerEvidence(report) {
  const app = gateById(report, "production_app_layer");
  if (app?.status !== "pass") return;
  if (app.evidence?.start_script !== "node production/server.mjs" || app.evidence?.production_server_entrypoint !== true) {
    throw new Error("Launch readiness production app layer requires Node adapter evidence");
  }
}

function assertPassMonitoringRollbackEvidence(report) {
  const monitoring = gateById(report, "monitoring_rollback");
  if (monitoring?.status !== "pass") return;
  const sources = new Set(monitoring.evidence?.monitoring_sources || []);
  for (const source of ["privacy_events", "search_console", "yandex_webmaster", "backlinks"]) {
    if (!sources.has(source)) throw new Error("Launch readiness monitoring rollback requires source evidence");
  }
  if (
    monitoring.evidence?.privacy_events_status !== "imported" ||
    !Number.isInteger(monitoring.evidence?.rollback_steps) ||
    monitoring.evidence.rollback_steps < 3
  ) {
    throw new Error("Launch readiness monitoring rollback requires privacy monitoring and rollback evidence");
  }
}

function warningsFrom(structuredData, listingQuality) {
  const warnings = {
    ...Object.fromEntries(
      Object.entries(structuredData.summary.warnings || {}).map(([id, count]) => [`structured_data.${id}`, count]),
    ),
    ...Object.fromEntries(
      Object.entries(listingQuality.summary.issue_counts || {}).map(([id, count]) => [`listing_quality.${id}`, count]),
    ),
  };
  return Object.entries(warnings)
    .filter(([, count]) => count > 0)
    .map(([id, count]) => ({ id, count }));
}

function seoLaunchSourceSummaries(sourceSummaries) {
  return Object.fromEntries(
    [...REQUIRED_EXPORTS, "analytics_export", "privacy_events"]
      .filter((source) => sourceSummaries[source])
      .map((source) => [source, sourceSummaries[source]]),
  );
}

export function publicLaunchReadinessPayload(report) {
  const blockedGates = (report.gates || [])
    .filter((item) => item.status === "blocked")
    .map((item) => ({
      id: item.id,
      status: item.status,
      message: item.message || "",
    }));
  return {
    kind: "readiness",
    service: "ms-realty",
    status: report.launch_ready ? "ready" : "blocked",
    launch_ready: report.launch_ready,
    blockers: report.blockers || blockedGates.map((item) => item.id),
    blocked_gates: blockedGates,
  };
}

export function publicLaunchReadinessHeaders(report) {
  return {
    "cache-control": "no-store",
    ...(report.launch_ready ? {} : { "retry-after": "60" }),
  };
}

function listingQualityReviewState(listingQuality, reviewPath = DEFAULT_LISTING_QUALITY_REVIEW_INPUT) {
  if (!fs.existsSync(reviewPath)) return { status: "missing_review", path: reviewPath };
  try {
    return {
      status: "pass",
      path: reviewPath,
      summary: validateListingQualityReviewCsv(listingQuality, fs.readFileSync(reviewPath, "utf8"), {
        allowExtraRows: true,
        requireComplete: true,
      }).summary,
    };
  } catch (error) {
    return { status: "invalid_review", path: reviewPath, error: error.message };
  }
}

function reportStatus(source, filePath, assertReport) {
  if (!fs.existsSync(filePath)) return { source, status: "missing_report", path: filePath };
  try {
    const report = readJson(filePath);
    assertReport(report);
    assertLiveServiceReportHasNoSecrets(report);
    if (report.example === true || filePath.endsWith(".example")) {
      return { source, status: "example_report", path: filePath, summary: report.summary };
    }
    assertLiveServiceReportTimestamp(report);
    assertLaunchLiveServiceEvidence(source, report);
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

export function payloadRuntimeState(reportPath = DEFAULT_PAYLOAD_RUNTIME_REPORT) {
  if (!fs.existsSync(reportPath)) return { status: "missing_report", path: reportPath };
  try {
    const report = readJson(reportPath);
    assertPayloadRuntimeReport(report);
    return {
      status: report.ready ? "pass" : "blocked_report",
      path: reportPath,
      summary: report.summary,
      checks: report.checks,
    };
  } catch (error) {
    return { status: "invalid_report", path: reportPath, error: error.message };
  }
}

export function validateLiveServiceReports(options = {}) {
  const reports = liveServiceReports(options);
  return {
    ready: reports.every((item) => item.status === "pass"),
    reports,
  };
}

function liveServiceStatusCounts(reports) {
  return reports.reduce((counts, report) => {
    counts[report.status] = (counts[report.status] || 0) + 1;
    return counts;
  }, {});
}

const LIVE_SERVICE_REPORT_STATUSES = new Set(["pass", "missing_report", "invalid_report", "example_report"]);

export function buildLiveServicePreflightReport({ generatedAt = new Date().toISOString(), ...options } = {}) {
  const result = validateLiveServiceReports(options);
  const statusCounts = liveServiceStatusCounts(result.reports);
  return {
    generated_at: generatedAt,
    ready: result.ready,
    status: result.ready ? "ready" : "blocked",
    summary: {
      report_count: result.reports.length,
      pass: statusCounts.pass || 0,
      missing_report: statusCounts.missing_report || 0,
      invalid_report: statusCounts.invalid_report || 0,
      example_report: statusCounts.example_report || 0,
      configured_paths: Object.fromEntries(result.reports.map((report) => [report.source, report.path])),
    },
    reports: result.reports,
    next_actions: result.ready
      ? ["Run npm run launch:preflight with the same mounted live report paths."]
      : [
          "Provision Typesense, Meilisearch, and Hermes provider credentials.",
          "Run npm run search:sync && npm run search:query.",
          "Run npm run hermes:provisioning to verify the self-hosted Hermes/vLLM provider settings.",
          "Run npm run hermes:worker.",
          "Run npm run live:preflight before launch:preflight.",
        ],
  };
}

export function assertLiveServicePreflightReport(report) {
  if (!report.generated_at || Number.isNaN(Date.parse(report.generated_at))) {
    throw new Error("Live service preflight report must include valid generated_at");
  }
  if (!Array.isArray(report.reports) || report.reports.length !== 3) {
    throw new Error("Live service preflight report must include three service reports");
  }
  const ready = report.reports.every((item) => item.status === "pass");
  if (report.ready !== ready) throw new Error("Live service preflight ready flag must match reports");
  if (report.status !== (ready ? "ready" : "blocked")) throw new Error("Live service preflight status must match ready flag");
  if (report.summary.report_count !== report.reports.length) {
    throw new Error("Live service preflight summary must count reports");
  }
  for (const item of report.reports) {
    assertLiveServiceReportHasNoSecrets(item);
    if (!LIVE_SERVICE_REPORT_STATUSES.has(item.status)) {
      throw new Error("Live service preflight report statuses must be known");
    }
  }
  const statusCounts = liveServiceStatusCounts(report.reports);
  for (const status of ["pass", "missing_report", "invalid_report", "example_report"]) {
    if (report.summary[status] !== (statusCounts[status] || 0)) {
      throw new Error("Live service preflight summary status counts must match reports");
    }
  }
  const sources = new Set(report.reports.map((item) => item.source));
  if (sources.size !== report.reports.length) {
    throw new Error("Live service preflight report sources must be unique");
  }
  for (const source of Object.keys(LIVE_SERVICE_REPORT_TEMPLATES)) {
    if (!sources.has(source)) throw new Error(`Live service preflight missing ${source} evidence`);
  }
  for (const item of report.reports) {
    if (report.summary.configured_paths?.[item.source] !== item.path) {
      throw new Error("Live service preflight configured paths must match reports");
    }
    if (item.status === "pass") assertLiveServiceReportPassEvidence(item);
  }
  if (ready) {
    for (const item of report.reports) assertLiveServiceReportPassEvidence(item);
  }
  return true;
}

export function writeLiveServicePreflightReport(report, outPath = DEFAULT_LIVE_SERVICE_PREFLIGHT_REPORT) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  assertLiveServicePreflightReport(report);
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
  return outPath;
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

export function writeLiveServiceReport(source, report, options = {}) {
  const writer = LIVE_SERVICE_REPORT_WRITERS[source];
  if (!writer) throw new Error(`Unknown live service report source: ${source}`);
  if (report.example === true) throw new Error("Example live service reports cannot be imported as launch evidence");
  assertLiveServiceReportTimestamp(report);
  assertLiveServiceReportHasNoSecrets(report);
  assertLaunchLiveServiceEvidence(source, report);
  const outPath = writer.write(report, options[writer.pathKey]);
  return { source, outPath, summary: report.summary };
}

export function buildLaunchReadinessReport({
  generatedAt = new Date().toISOString(),
  migration = readJson(fromRoot("production", "data", "migration-records.json")),
  routeMap = readJson(fromRoot("production", "data", "legacy-route-map.json")),
  deployableRedirects = readJson(fromRoot("production", "data", "deployable-redirects.json")),
  sitemap = readJson(fromRoot("production", "data", "localized-sitemap.json")),
  structuredData = readJson(fromRoot("production", "data", "structured-data-report.json")),
  listingQuality = readJson(fromRoot("production", "data", "listing-quality-report.json")),
  listingQualityReviewPath = DEFAULT_LISTING_QUALITY_REVIEW_INPUT,
  listingQualityReview = listingQualityReviewState(listingQuality, listingQualityReviewPath),
  seoEvidence = readJson(fromRoot("production", "data", "seo-evidence.json")),
  httpSmoke = readJson(fromRoot("production", "data", "http-smoke.json")),
  nodeServerSmoke = readJson(fromRoot("production", "data", "node-server-smoke.json")),
  liveServices = liveServiceReports(),
  appState = packageState(),
  payloadRuntime = payloadRuntimeState(),
} = {}) {
  assertSeoEvidence(seoEvidence);

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
  const listingQualityReady = hasCompleteListingQualityEvidence(listingQualityReview);
  const liveServicesReady = liveServices.every((item) => item.status === "pass");
  const appLayerReady = appState.production_server_entrypoint && appState.start_script === "node production/server.mjs";
  const payloadRuntimeReady = payloadRuntime.status === "pass";
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
    sitemap.summary.contact_pages +
    sitemap.summary.guide_pages;
  const localizedSitemapReady =
    sitemap.summary.home_pages === 7 &&
    sitemap.summary.listing_entries === 167 &&
    sitemap.summary.location_pages >= 6 &&
    sitemap.summary.seller_pages === 7 &&
    sitemap.summary.contact_pages === 7 &&
    sitemap.summary.guide_pages === 2 &&
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
        analytics_export: seoEvidence.summary.sources.analytics_export,
        sources: seoLaunchSourceSummaries(seoEvidence.summary.sources),
      },
      seoExportsReady ? "" : "Search Console, Yandex, and backlink exports are required before launch.",
    ),
    gate(
      "listing_quality_review",
      listingQualityReady ? "pass" : "blocked",
      listingQualityReview,
      listingQualityReady ? "" : "Human listing quality review CSV is required before launch.",
    ),
    gate(
      "runtime_smoke",
      httpSmoke.listing?.status === 200 && nodeServerSmoke.listing?.status === 200 ? "pass" : "blocked",
      {
        http_listing_status: httpSmoke.listing?.status,
        node_listing_status: nodeServerSmoke.listing?.status,
        node_server_port_observed: nodeServerSmoke.server?.port_observed === true,
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
    gate(
      "payload_runtime",
      payloadRuntimeReady ? "pass" : "blocked",
      payloadRuntime,
      payloadRuntimeReady
        ? "Payload runtime report proves config, routes, env, and database reachability."
        : "Payload runtime report must pass before final production readiness.",
    ),
  ];

  const blockers = blockersFrom(gates);
  return {
    generated_at: generatedAt,
    launch_ready: blockers.length === 0,
    status: blockers.length ? "blocked" : "ready",
    blockers,
    warnings: warningsFrom(structuredData, listingQuality),
    gates,
    live_services: liveServices,
    monitoring_plan: monitoringPlan,
    rollback_plan: rollbackPlan,
  };
}

export function assertLaunchReadinessReport(report) {
  if (!Array.isArray(report.gates) || report.gates.length < 7) throw new Error("Launch readiness report must include core gates");
  const gateIds = new Set(report.gates.map((item) => item.id));
  for (const id of REQUIRED_LAUNCH_GATE_IDS) {
    if (!gateIds.has(id)) throw new Error(`Launch readiness missing required gate ${id}`);
  }
  const gateBlockers = blockersFrom(report.gates);
  if (JSON.stringify(report.blockers || []) !== JSON.stringify(gateBlockers)) {
    throw new Error("Launch readiness blockers must match blocked gates");
  }
  if (report.launch_ready !== (gateBlockers.length === 0)) throw new Error("Launch readiness flag must match blockers");
  if (report.status !== (report.launch_ready ? "ready" : "blocked")) throw new Error("Launch readiness status must match blockers");
  if (report.blockers.includes("production_app_layer")) throw new Error("Production app layer should be covered by the Node adapter");
  if (!report.gates.some((item) => item.id === "live_services")) {
    throw new Error("Launch readiness must include live service provisioning gate");
  }
  assertPassCrawlInventoryEvidence(report);
  assertPassRedirectReviewEvidence(report);
  assertPassLocalizedSitemapEvidence(report);
  assertPassStructuredDataEvidence(report);
  assertPassExternalSeoEvidence(report);
  assertPassListingQualityEvidence(report);
  assertPassRuntimeSmokeEvidence(report);
  assertPassRuntimeEvidence(report);
  assertPassAppLayerEvidence(report);
  assertPassMonitoringRollbackEvidence(report);
  if (report.launch_ready && !report.monitoring_plan.some((item) => item.source === "privacy_events" && item.status === "imported")) {
    throw new Error("Launch readiness must include privacy analytics monitoring");
  }
  if (!Array.isArray(report.rollback_plan) || report.rollback_plan.length < 3) {
    throw new Error("Launch readiness must include a rollback plan");
  }
  if (report.launch_ready && !report.gates.some((item) => item.id === "monitoring_rollback" && item.status === "pass")) {
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
