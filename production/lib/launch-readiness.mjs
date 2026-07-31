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
import { liveServiceProvisioningState } from "./live-service-provisioning.mjs";
import { buildListingQualityPreflightReport, DEFAULT_LISTING_QUALITY_REVIEW_INPUT } from "./listing-quality.mjs";
import {
  assertPayloadRuntimeReport,
  assertProductionDatabaseHost,
  DEFAULT_PAYLOAD_RUNTIME_REPORT,
} from "./payload-runtime.mjs";
import { assertProductionRecoveryReport, productionRecoveryState } from "./production-recovery.mjs";
import { assertMonitoringRollbackReport, monitoringRollbackState } from "./monitoring-rollback.mjs";
import {
  REQUIRED_EXPORTS,
  assertSeoEvidence,
  assertSeoSourceSummary,
  buildSeoEvidencePreflightReportFromEvidence,
  missingRequiredExport,
  missingRequiredSources,
} from "./seo-evidence-contract.mjs";
import {
  summarizeDeployableRedirects,
  summarizeLegacyRouteDecisions,
  validateLegacyRouteDecisionArtifact,
} from "./redirect-approvals.mjs";
import { fromRoot, repoRelativePath } from "./paths.mjs";

export const DEFAULT_LAUNCH_READINESS_OUTPUT = fromRoot("production", "data", "launch-readiness.json");
export const DEFAULT_LIVE_SERVICE_PREFLIGHT_REPORT = fromRoot("production", "data", "live-service-preflight-report.json");
export const DEFAULT_LOCAL_READINESS_MAX_AGE_MS = 15 * 60 * 1000;

const LOCAL_PREVIEW_GATE_ID = "local_preview_only";
const LOCAL_PREVIEW_GATE_NEXT_ACTIONS = [
  "Treat this Docker-only report as local verification, not production launch evidence.",
  "Complete the external SEO, human-review, and live production evidence gates before launch.",
];

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
const REQUIRED_LIVE_SERVICE_PROVISIONING_CHECK_IDS = [
  "typesense_url",
  "typesense_api_key",
  "meili_url",
  "meili_api_key",
  "typesense_health",
  "meilisearch_health",
  "hermes_provider",
];
const REQUIRED_PAYLOAD_RUNTIME_ROUTE_FILES = [
  "app/(payload)/payload-admin/[[...segments]]/page.js",
  "app/(payload)/api/[...slug]/route.js",
  "app/(payload)/graphql/route.js",
  "app/(payload)/graphql-playground/route.js",
];
const REQUIRED_PAYLOAD_RUNTIME_CHECK_IDS = [
  "payload_secret",
  "database_url",
  ...REQUIRED_PAYLOAD_RUNTIME_ROUTE_FILES.map((file) => `route:${file}`),
  "payload_config_import",
  "database_tcp",
];
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
  "production_recovery",
];
const BLOCKED_GATE_NEXT_ACTIONS = {
  crawl_inventory: [
    "Run npm run migration:build and confirm both makler-realty.com and makler-realty.ru inventories are complete.",
    "Regenerate production/data/migration-records.json before rebuilding launch readiness.",
  ],
  redirect_reviews: [
    "Review every unresolved legacy URL in /admin/migration/review; retain equivalent content, map one-hop 301s, or approve a 410 individually.",
    "Download /api/admin/redirect-approval-workbook?pending=1, record a terminal decision for each row, then import it through /api/admin/redirect-approvals/import.",
  ],
  localized_sitemap: [
    "Run npm run sitemap:build after approved locale routes are generated.",
    "Review the generated localized sitemap for approved listing, location, seller, contact, and guide routes.",
  ],
  structured_data: [
    "Run npm run structured:data and fix any failing schema entries before launch.",
    "Confirm schema text is sourced from approved CMS/listing content only.",
  ],
  external_seo_exports: [
    "Import Search Console, Yandex Webmaster, and backlink CSV exports through /api/admin/seo-evidence/import.",
    "Run npm run seo:preflight, npm run seo:evidence, and npm run seo:preflight:report after import.",
  ],
  listing_quality_review: [
    "Review listings one at a time in /admin/migration/review; each human sign-off is validated, persisted, and audited before the queue advances.",
    "Download /api/admin/listing-quality-review-packet or /api/admin/listing-quality-review-draft.",
    "Import a complete human-reviewed CSV through /api/admin/listing-quality/import, then run npm run listing:preflight.",
  ],
  live_services: [
    "Run npm run live:provisioning:preflight, then npm run live:capture against real Typesense, Meilisearch, and Hermes services.",
    "Import or mount the three live service reports, then run npm run live:preflight before launch.",
  ],
  runtime_smoke: [
    "Run npm run runtime:build and npm run server:smoke against the production Node adapter and HTTP listing route.",
    "Fix any failing route status evidence before launch readiness is rebuilt.",
  ],
  monitoring_rollback: [
    "Import Search Console, Yandex Webmaster, and backlink evidence for post-launch monitoring.",
    "Mount a current redacted monitoring and rollback report, then run npm run monitoring:preflight.",
    "Confirm the automated rollback policy, canary, and isolated drill cover disable, revert, cache purge, sitemap resubmit, and lead intake fallback.",
  ],
  production_app_layer: [
    "Keep the production Node adapter wired and rebuild the app layer readiness report.",
    "Do not clear launch readiness until the production app route evidence is present.",
  ],
  payload_runtime: [
    "Use /api/admin/payload-runtime-bootstrap to provision the private env and Postgres runtime.",
    "Run npm run payload:runtime, import the redacted report through /api/admin/payload-runtime/import, then run npm run payload:preflight.",
  ],
  production_recovery: [
    "Complete an encrypted off-site backup and isolated restore drill using production data stores.",
    "Download /api/admin/production-recovery-template, complete it with real evidence, and import it through /api/admin/production-recovery/import.",
  ],
};

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
  return parsed;
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
      const origins = new Set(urls.map((url) => assertLaunchServiceUrl(url, `${engine.engine} sync report`).origin));
      if (origins.size !== 1) throw new Error(`${engine.engine} sync report operations must use one service origin`);
    }
    return;
  }
  if (source === "typesense_meilisearch_query") {
    for (const engine of report.engines || []) {
      const serviceOrigin = assertLaunchServiceUrl(engine.service_url, `${engine.engine} query report`).origin;
      const operationOrigin = assertLaunchServiceUrl(engine.operation?.url, `${engine.engine} query operation`).origin;
      if (operationOrigin !== serviceOrigin) {
        throw new Error(`${engine.engine} query operation must use the reported service origin`);
      }
    }
    return;
  }
  if (source === "hermes_draft_worker") {
    assertLaunchServiceUrl(report.provider?.endpoint, "Hermes worker report");
    assertHermesChatCompletionsEndpoint(report.provider.endpoint, "Hermes worker report endpoint");
    if (report.provider?.mode !== "self_hosted" || report.provider?.sensitive_data_allowed !== true) {
      throw new Error("Hermes worker launch evidence must use the self-hosted sensitive-data provider");
    }
    if (!report.audit_log_path || report.audit_log_rows !== report.summary?.attempted) {
      throw new Error("Hermes worker launch evidence audit log must cover every attempted model call");
    }
  }
}

function operationSnapshot(operation = {}) {
  return {
    method: operation.method,
    url: operation.url,
    status: operation.status,
    ...(Number.isInteger(operation.bytes) ? { bytes: operation.bytes } : {}),
  };
}

function liveServiceEvidenceSnapshot(source, report) {
  if (source === "typesense_meilisearch_sync") {
    return {
      engines: (report.engines || []).map((engine) => ({
        engine: engine.engine,
        target: engine.collection || engine.index,
        operations: (engine.operations || []).map(operationSnapshot),
      })),
    };
  }
  if (source === "typesense_meilisearch_query") {
    return {
      engines: (report.engines || []).map((engine) => ({
        engine: engine.engine,
        target: engine.collection || engine.index,
        operation: operationSnapshot(engine.operation),
      })),
    };
  }
  if (source === "hermes_draft_worker") {
    return {
      provider: {
        mode: report.provider?.mode,
        endpoint: report.provider?.endpoint,
        model: report.provider?.model,
        tool_call_parser: report.provider?.tool_call_parser,
        sensitive_data_allowed: report.provider?.sensitive_data_allowed,
      },
      audit_log_rows: Number.isInteger(report.audit_log_rows) ? report.audit_log_rows : null,
    };
  }
  return {};
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
  const nextActions = status === "blocked" ? BLOCKED_GATE_NEXT_ACTIONS[id] : null;
  return { id, status, message, evidence, ...(nextActions ? { next_actions: nextActions } : {}) };
}

function blockersFrom(gates) {
  return gates.filter((item) => item.status === "blocked").map((item) => item.id);
}

function assertBlockedGateNextActions(report) {
  for (const item of report.gates || []) {
    if (item.status !== "blocked") continue;
    const actions = Array.isArray(item.next_actions)
      ? item.next_actions.filter((action) => typeof action === "string" && action.trim())
      : [];
    if (!actions.length) throw new Error(`Launch readiness blocked gate ${item.id} must include next actions`);
  }
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

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function redirectRowsFromDecisions(decisions) {
  return decisions
    .filter((decision) => decision.status === 301)
    .map((decision) => ({
      old_url: decision.old_url,
      target_path: decision.target_path,
      status: 301,
      source_domain: decision.source_domain,
      target_locale: decision.target_locale,
      url_type: decision.url_type,
      reviewer: decision.reviewer,
      approved_at: decision.approved_at,
    }));
}

function redirectRowsMatchDecisions(rows, decisions) {
  if (!Array.isArray(rows) || rows.length !== decisions.length) return false;
  const expected = new Map(decisions.map((decision) => [decision.old_url, decision]));
  const seen = new Set();
  return rows.every((row) => {
    const decision = expected.get(row.old_url);
    if (!decision || seen.has(row.old_url)) return false;
    seen.add(row.old_url);
    return (
      row.status === decision.status &&
      row.target_path === decision.target_path &&
      row.source_domain === decision.source_domain &&
      row.target_locale === decision.target_locale &&
      row.url_type === decision.url_type &&
      row.reviewer === decision.reviewer &&
      row.approved_at === decision.approved_at
    );
  });
}

function legacyRouteReviewState(routeMap, deployableRedirects) {
  const routes = Array.isArray(routeMap.routes) ? routeMap.routes : [];
  const routeMapSummary = routeMap.summary || {};
  const total = routes.length || (Number.isInteger(routeMapSummary.total) ? routeMapSummary.total : 0);
  const hasDecisionArtifact = Array.isArray(deployableRedirects.decisions);
  const artifactDecisions = hasDecisionArtifact
    ? deployableRedirects.decisions
    : Array.isArray(deployableRedirects.redirects)
      ? deployableRedirects.redirects
      : [];
  const validation = validateLegacyRouteDecisionArtifact(routes, artifactDecisions, {
    requireExplicitDecision: hasDecisionArtifact,
  });
  const decisions = validation.decisions;
  const decisionSummary = summarizeLegacyRouteDecisions(decisions);
  const redirects = redirectRowsFromDecisions(decisions);
  const redirectSummary = summarizeDeployableRedirects(redirects);
  const terminal = new Set(decisions.map((decision) => decision.old_url));
  const unresolvedByType = {};
  if (routes.length) {
    for (const route of routes) {
      if (terminal.has(route.old_url)) continue;
      unresolvedByType[route.url_type] = (unresolvedByType[route.url_type] || 0) + 1;
    }
  } else {
    Object.assign(
      unresolvedByType,
      Object.fromEntries(
        Object.entries(routeMapSummary.unmappedByType || {}).filter(([, count]) => Number.isInteger(count) && count > 0),
      ),
    );
  }
  const unresolved = Object.values(unresolvedByType).reduce((count, value) => count + value, 0);
  return {
    total,
    hasFullRouteMap: routes.length === total && total > 0,
    hasDecisionArtifact,
    terminalDecisions: terminal.size,
    unresolved,
    unresolvedByType,
    decisionSummary,
    redirectSummary,
    invalidDecisionCount: validation.errors.length,
    decisionSummaryMatches: sameJson(deployableRedirects.decision_summary, decisionSummary),
    redirectSummaryMatches: sameJson(deployableRedirects.summary, redirectSummary),
    redirectRowsMatch: redirectRowsMatchDecisions(deployableRedirects.redirects, redirects),
  };
}

function assertPassRedirectReviewEvidence(report) {
  const redirects = gateById(report, "redirect_reviews");
  if (redirects?.status !== "pass") return;
  const evidence = redirects.evidence || {};
  const unresolvedByType = evidence.unresolved_by_type;
  if (
    evidence.total_legacy_urls !== 457 ||
    evidence.resolved_legacy_urls !== evidence.total_legacy_urls ||
    evidence.unresolved_legacy_urls !== 0 ||
    evidence.terminal_decisions !== evidence.total_legacy_urls ||
    evidence.invalid_terminal_decisions !== 0 ||
    evidence.decision_artifact_valid !== true ||
    evidence.deployed_redirect_export_matches !== true ||
    !unresolvedByType ||
    Object.values(unresolvedByType).some((count) => !Number.isInteger(count) || count !== 0) ||
    !Number.isInteger(evidence.mapped_listings) ||
    !Number.isInteger(evidence.deployable_redirects) ||
    !evidence.decision_statuses ||
    ![200, 301, 410].every((status) => Number.isInteger(evidence.decision_statuses[status]) && evidence.decision_statuses[status] >= 0) ||
    evidence.decision_statuses[200] + evidence.decision_statuses[301] + evidence.decision_statuses[410] !== evidence.total_legacy_urls ||
    evidence.homepage_targets !== 0 ||
    evidence.duplicate_old_urls !== 0
  ) {
    throw new Error("Launch readiness redirect reviews require a terminal route decision for every legacy URL");
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
    evidence.listing_entries !== 166 ||
    evidence.location_pages < 6 ||
    evidence.seller_pages !== 7 ||
    evidence.contact_pages !== 7 ||
    evidence.guide_pages !== 5 ||
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
  assertLiveServiceReportDetailedEvidence(item);
}

function assertLiveServiceEngineEvidence(item, expectedMessage) {
  const engines = item.evidence?.engines || [];
  if (engines.length !== 2) throw new Error(expectedMessage);
  const engineNames = engines.map((engine) => engine.engine).sort().join("|");
  if (engineNames !== "meilisearch|typesense") throw new Error(expectedMessage);
  for (const engine of engines) {
    const target = item.summary?.targets?.[engine.engine];
    if (!target || engine.target !== target) throw new Error(expectedMessage);
  }
  return engines;
}

function assertLiveServiceSyncOperationEvidence(item) {
  const engines = assertLiveServiceEngineEvidence(item, "Launch readiness live services require search sync operation evidence");
  const operations = engines.flatMap((engine) => (engine.operations || []).map((operation) => ({ engine: engine.engine, operation })));
  if (operations.length !== item.summary.total_operations) {
    throw new Error("Launch readiness live services require search sync operation evidence");
  }
  for (const { engine, operation } of operations) {
    assertLaunchServiceUrl(operation.url, `${engine} sync operation`);
    if (!["PATCH", "POST"].includes(operation.method) || ![200, 201, 202, 409].includes(operation.status)) {
      throw new Error("Launch readiness live services require search sync operation evidence");
    }
    if (!Number.isInteger(operation.bytes) || operation.bytes <= 0) {
      throw new Error("Launch readiness live services require search sync operation evidence");
    }
  }
  for (const engine of engines) {
    const encoded = encodeURIComponent(engine.target);
    if (engine.engine === "typesense") {
      if (
        !hasLiveServiceOperation(engine, { method: "POST", path: "/collections", statuses: [200, 201, 409] }) ||
        !hasLiveServiceOperation(engine, {
          method: "POST",
          path: `/collections/${encoded}/documents/import`,
          searchParam: { key: "action", value: "upsert" },
          statuses: [200, 201, 202],
        })
      ) {
        throw new Error("Launch readiness live services require search sync operation evidence");
      }
    }
    if (engine.engine === "meilisearch") {
      if (
        !hasLiveServiceOperation(engine, { method: "PATCH", path: `/indexes/${encoded}/settings`, statuses: [200, 201, 202] }) ||
        !hasLiveServiceOperation(engine, {
          method: "POST",
          path: `/indexes/${encoded}/documents`,
          searchParam: { key: "primaryKey", value: "meili_id" },
          statuses: [200, 201, 202],
        })
      ) {
        throw new Error("Launch readiness live services require search sync operation evidence");
      }
    }
  }
}

function assertLiveServiceQueryOperationEvidence(item) {
  const engines = assertLiveServiceEngineEvidence(item, "Launch readiness live services require search query operation evidence");
  for (const engine of engines) {
    const operation = engine.operation || {};
    assertLaunchServiceUrl(operation.url, `${engine.engine} query operation`);
    const parsed = new URL(operation.url);
    const encoded = encodeURIComponent(engine.target);
    if (
      engine.engine === "typesense" &&
      (operation.method !== "GET" ||
        operation.status !== 200 ||
        parsed.pathname !== `/collections/${encoded}/documents/search` ||
        !parsed.searchParams.get("q") ||
        !parsed.searchParams.get("filter_by"))
    ) {
      throw new Error("Launch readiness live services require search query operation evidence");
    }
    if (
      engine.engine === "meilisearch" &&
      (operation.method !== "POST" || operation.status !== 200 || parsed.pathname !== `/indexes/${encoded}/search`)
    ) {
      throw new Error("Launch readiness live services require search query operation evidence");
    }
  }
}

function hasLiveServiceOperation(engine, { method, path: operationPath, searchParam = null, statuses }) {
  return (engine.operations || []).some((operation) => {
    let parsed;
    try {
      parsed = new URL(operation.url);
    } catch {
      return false;
    }
    return (
      operation.method === method &&
      parsed.pathname === operationPath &&
      (!searchParam || parsed.searchParams.get(searchParam.key) === searchParam.value) &&
      statuses.includes(operation.status)
    );
  });
}

function assertLiveServiceHermesProviderEvidence(item) {
  const provider = item.evidence?.provider || {};
  assertLaunchServiceUrl(provider.endpoint, "Hermes worker launch evidence");
  assertHermesChatCompletionsEndpoint(provider.endpoint, "Hermes worker launch evidence endpoint");
  if (
    provider.mode !== "self_hosted" ||
    provider.tool_call_parser !== "hermes" ||
    provider.sensitive_data_allowed !== true
  ) {
    throw new Error("Launch readiness live services require self-hosted Hermes provider evidence");
  }
  if (item.evidence?.audit_log_rows !== item.summary?.attempted) {
    throw new Error("Launch readiness live services require Hermes audit coverage evidence");
  }
}

function assertLiveServiceReportDetailedEvidence(item) {
  if (item.source === "typesense_meilisearch_sync") assertLiveServiceSyncOperationEvidence(item);
  if (item.source === "typesense_meilisearch_query") assertLiveServiceQueryOperationEvidence(item);
  if (item.source === "hermes_draft_worker") assertLiveServiceHermesProviderEvidence(item);
}

function assertLiveServiceProvisioningPassEvidence(provisioning) {
  if (provisioning.status !== "pass" || !provisioning.path || !provisioning.summary || !Array.isArray(provisioning.checks)) {
    throw new Error("Launch readiness live services require provisioning pass evidence");
  }
  if (
    provisioning.summary.checks !== provisioning.checks.length ||
    provisioning.summary.missing_env?.length !== 0 ||
    provisioning.summary.placeholder_env?.length !== 0 ||
    JSON.stringify(provisioning.summary.services) !== JSON.stringify(["typesense", "meilisearch", "hermes"])
  ) {
    throw new Error("Launch readiness live services require complete provisioning summary evidence");
  }
  const checks = new Map(provisioning.checks.map((check) => [check.id, check]));
  for (const id of REQUIRED_LIVE_SERVICE_PROVISIONING_CHECK_IDS) {
    if (checks.get(id)?.status !== "pass") throw new Error(`Launch readiness live services require provisioning check ${id}`);
  }
  for (const id of ["typesense_health", "meilisearch_health"]) {
    const check = checks.get(id);
    if (!check.redacted_url || !Number.isInteger(check.status_code) || check.status_code < 200 || check.status_code > 299) {
      throw new Error(`Launch readiness live services require ${id} endpoint evidence`);
    }
    assertLaunchServiceUrl(check.redacted_url, id);
  }
  if (provisioning.hermes?.ready !== true || !provisioning.hermes.endpoint) {
    throw new Error("Launch readiness live services require Hermes provisioning endpoint evidence");
  }
  assertLaunchServiceUrl(provisioning.hermes.endpoint, "Live service provisioning Hermes endpoint");
  assertHermesChatCompletionsEndpoint(provisioning.hermes.endpoint, "Live service provisioning Hermes endpoint");
}

function assertPassRuntimeEvidence(report) {
  const liveServices = gateById(report, "live_services");
  if (liveServices?.status === "pass") {
    const reports = liveServices.evidence?.reports || [];
    assertLiveServiceProvisioningPassEvidence(liveServices.evidence?.provisioning || {});
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
    const checks = new Map((payload.evidence?.checks || []).map((check) => [check.id, check]));
    const databaseTcp = payload.evidence?.checks?.find((item) => item.id === "database_tcp");
    const database = payload.evidence?.summary?.database;
    const databaseTargetMatches =
      databaseTcp?.database === database?.database &&
      databaseTcp?.host === database?.host &&
      databaseTcp?.port === database?.port &&
      databaseTcp?.credentials_configured === database?.credentials_configured;
    if (
      payload.evidence?.summary?.checks !== payload.evidence?.checks?.length ||
      payload.evidence?.summary?.missing_env?.length !== 0 ||
      payload.evidence?.summary?.placeholder_env?.length !== 0 ||
      payload.evidence?.summary?.weak_env?.length !== 0 ||
      payload.evidence?.summary?.route_files !== REQUIRED_PAYLOAD_RUNTIME_ROUTE_FILES.length
    ) {
      throw new Error("Launch readiness payload runtime requires complete runtime summary evidence");
    }
    for (const id of REQUIRED_PAYLOAD_RUNTIME_CHECK_IDS) {
      if (checks.get(id)?.status !== "pass") throw new Error(`Launch readiness payload runtime requires check ${id}`);
    }
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
  const sourceStatuses = monitoring.evidence?.monitoring_source_statuses || {};
  for (const source of ["privacy_events", "search_console", "yandex_webmaster", "backlinks"]) {
    if (!sources.has(source)) throw new Error("Launch readiness monitoring rollback requires source evidence");
    if (sourceStatuses[source] !== "imported") {
      throw new Error("Launch readiness monitoring rollback requires imported source evidence");
    }
  }
  if (
    monitoring.evidence?.privacy_events_status !== "imported" ||
    !Number.isInteger(monitoring.evidence?.rollback_steps) ||
    monitoring.evidence.rollback_steps < 3
  ) {
    throw new Error("Launch readiness monitoring rollback requires privacy monitoring and rollback evidence");
  }
  const machineEvidence = monitoring.evidence?.machine_evidence;
  if (machineEvidence?.status !== "pass" || !machineEvidence.path || !machineEvidence.report) {
    throw new Error("Launch readiness monitoring rollback requires a current machine evidence report");
  }
  assertMonitoringRollbackReport(machineEvidence.report);
}

function assertPassProductionRecoveryEvidence(report) {
  const recovery = gateById(report, "production_recovery");
  if (recovery?.status === "pass") assertProductionRecoveryReport(recovery.evidence?.report);
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

export function launchBlockerSummary(report) {
  const blockedGates = (report.gates || []).filter((item) => item.status === "blocked");
  return {
    status: report.launch_ready ? "ready" : "blocked",
    launch_ready: report.launch_ready,
    blockers: report.blockers || blockedGates.map((item) => item.id),
    blocked_gates: blockedGates.map((item) => ({
      id: item.id,
      message: item.message || "",
      next_actions: item.next_actions || [],
    })),
  };
}

export function publicLaunchReadinessHeaders(report) {
  return {
    "cache-control": "no-store",
    ...(report.launch_ready ? {} : { "retry-after": "60" }),
  };
}

function listingQualityReviewState(listingQuality, reviewPath = DEFAULT_LISTING_QUALITY_REVIEW_INPUT) {
  const report = buildListingQualityPreflightReport({
    report: listingQuality,
    reviewPath,
  });
  const { status, path: reportPath, summary, error, pending_review_sample: pendingReviewSample } = report.review;
  return {
    status,
    path: repoRelativePath(reportPath),
    ...(summary ? { summary } : {}),
    ...(error ? { error } : {}),
    ...(pendingReviewSample ? { pending_review_sample: pendingReviewSample } : {}),
    next_actions: report.next_actions,
  };
}

function reportStatus(source, filePath, assertReport) {
  if (!fs.existsSync(filePath)) return { source, status: "missing_report", path: repoRelativePath(filePath) };
  try {
    const report = readJson(filePath);
    assertReport(report);
    assertLiveServiceReportHasNoSecrets(report);
    if (report.example === true || filePath.endsWith(".example")) {
      return { source, status: "example_report", path: repoRelativePath(filePath), summary: report.summary };
    }
    assertLiveServiceReportTimestamp(report);
    assertLaunchLiveServiceEvidence(source, report);
    return {
      source,
      status: "pass",
      path: repoRelativePath(filePath),
      summary: report.summary,
      evidence: liveServiceEvidenceSnapshot(source, report),
    };
  } catch (error) {
    return { source, status: "invalid_report", path: repoRelativePath(filePath), error: error.message };
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

const PAYLOAD_RUNTIME_MISSING_REPORT_ACTIONS = [
  "Run npm run payload:bootstrap and configure a private env with PAYLOAD_SECRET and DATABASE_URL.",
  "Run npm run payload:runtime, then npm run payload:preflight.",
];
const PAYLOAD_RUNTIME_INVALID_REPORT_ACTIONS = [
  "Regenerate the Payload runtime report with npm run payload:runtime.",
  "Run npm run payload:preflight before launch:preflight.",
];

export function payloadRuntimeState(reportPath = DEFAULT_PAYLOAD_RUNTIME_REPORT) {
  if (!fs.existsSync(reportPath)) {
    return { status: "missing_report", path: repoRelativePath(reportPath), next_actions: PAYLOAD_RUNTIME_MISSING_REPORT_ACTIONS };
  }
  try {
    const report = readJson(reportPath);
    assertPayloadRuntimeReport(report);
    return {
      status: report.ready ? "pass" : "blocked_report",
      path: repoRelativePath(reportPath),
      summary: report.summary,
      checks: report.checks,
      next_actions: report.next_actions,
    };
  } catch (error) {
    return {
      status: "invalid_report",
      path: repoRelativePath(reportPath),
      error: error.message,
      next_actions: PAYLOAD_RUNTIME_INVALID_REPORT_ACTIONS,
    };
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
      ? ["Run npm run live:preflight, then npm run launch:preflight with the same mounted live report paths."]
      : [
          "Provision Typesense, Meilisearch, and Hermes provider credentials.",
          "Run npm run search:sync && npm run search:query.",
          "Run npm run hermes:provisioning to verify the self-hosted Hermes/vLLM provider settings.",
          "Run npm run hermes:worker.",
          "Run npm run live:capture to generate the three live service reports.",
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
  if (!Array.isArray(report.next_actions) || report.next_actions.length === 0) {
    throw new Error("Live service preflight report must include next actions");
  }
  if (!ready && !report.next_actions.some((action) => action.includes("live:preflight"))) {
    throw new Error("Live service preflight blocked report must point to live:preflight");
  }
  if (
    ready &&
    !report.next_actions.some((action) => action.includes("live:preflight") && action.includes("launch:preflight"))
  ) {
    throw new Error("Live service preflight ready report must point to live:preflight before launch:preflight");
  }
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
  return { source, outPath, summary: report.summary, evidence: liveServiceEvidenceSnapshot(source, report) };
}

export function liveServiceImportSummary(imported, preflight) {
  const blockedReports = preflight.reports
    .filter((report) => report.status !== "pass")
    .map((report) => ({ source: report.source, status: report.status, path: report.path }));
  const importedReport = preflight.reports.find((report) => report.source === imported.source);
  return {
    ready: preflight.ready,
    status: preflight.status,
    importedSource: imported.source,
    importedReportStatus: importedReport?.status || "unknown",
    blockedReports,
    nextActions: preflight.next_actions,
  };
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
  liveServiceProvisioning = liveServiceProvisioningState(),
  appState = packageState(),
  payloadRuntime = payloadRuntimeState(),
  productionRecovery = productionRecoveryState(),
  monitoringRollback = monitoringRollbackState(),
} = {}) {
  assertSeoEvidence(seoEvidence);
  const seoPreflight = buildSeoEvidencePreflightReportFromEvidence(seoEvidence);

  const crawlPass =
    migration.summary.total === 457 &&
    migration.summary.byDomain?.["makler-realty.com"] === 278 &&
    migration.summary.byDomain?.["makler-realty.ru"] === 179 &&
    migration.summary.byStatus?.["200"] === 457;
  const routeMapSummary = routeMap.summary || {};
  const routeReview = legacyRouteReviewState(routeMap, deployableRedirects);
  const routeMapTotal = routeReview.total;
  const unresolvedByType = routeReview.unresolvedByType;
  const unresolvedLegacyUrls = routeReview.unresolved;
  const resolvedLegacyUrls = routeMapTotal - unresolvedLegacyUrls;
  const redirectsReviewed =
    routeMapTotal === migration.summary.total &&
    routeReview.hasFullRouteMap &&
    routeReview.hasDecisionArtifact &&
    resolvedLegacyUrls === routeMapTotal &&
    unresolvedLegacyUrls === 0 &&
    routeReview.terminalDecisions === routeMapTotal &&
    routeReview.invalidDecisionCount === 0 &&
    routeReview.decisionSummaryMatches &&
    routeReview.redirectSummaryMatches &&
    routeReview.redirectRowsMatch &&
    routeReview.redirectSummary.homepageTargets === 0 &&
    routeReview.redirectSummary.duplicateOldUrls === 0 &&
    routeReview.decisionSummary.homepageTargets === 0 &&
    routeReview.decisionSummary.duplicateOldUrls === 0;
  const seoExportsReady = (seoEvidence.summary.missing_required_sources || []).length === 0;
  const listingQualityReady = hasCompleteListingQualityEvidence(listingQualityReview);
  const liveServicesReady = liveServices.every((item) => item.status === "pass") && liveServiceProvisioning.status === "pass";
  const appLayerReady = appState.production_server_entrypoint && appState.start_script === "node production/server.mjs";
  const payloadRuntimeReady = payloadRuntime.status === "pass";
  const productionRecoveryReady = productionRecovery.status === "pass";
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
  const monitoringReady = monitoringPlan.every((item) => item.status === "imported");
  const monitoringRollbackReady = monitoringRollback.status === "pass";
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
    sitemap.summary.listing_entries === 166 &&
    sitemap.summary.location_pages >= 6 &&
    sitemap.summary.seller_pages === 7 &&
    sitemap.summary.contact_pages === 7 &&
    sitemap.summary.guide_pages === 5 &&
    sitemap.summary.entries === expectedSitemapEntries;

  const gates = [
    gate("crawl_inventory", crawlPass ? "pass" : "blocked", migration.summary),
    gate(
      "redirect_reviews",
      redirectsReviewed ? "pass" : "blocked",
      {
        total_legacy_urls: routeMapTotal,
        resolved_legacy_urls: resolvedLegacyUrls,
        unresolved_legacy_urls: unresolvedLegacyUrls,
        unresolved_by_type: unresolvedByType,
        terminal_decisions: routeReview.terminalDecisions,
        invalid_terminal_decisions: routeReview.invalidDecisionCount,
        decision_artifact_valid:
          routeReview.hasDecisionArtifact &&
          routeReview.invalidDecisionCount === 0 &&
          routeReview.decisionSummaryMatches &&
          routeReview.redirectSummaryMatches,
        deployed_redirect_export_matches: routeReview.redirectRowsMatch,
        decision_statuses: routeReview.decisionSummary.byStatus,
        mapped_listings: routeMapSummary.mappedListings,
        deployable_redirects: routeReview.redirectSummary.total,
        homepage_targets: routeReview.redirectSummary.homepageTargets,
        duplicate_old_urls: routeReview.redirectSummary.duplicateOldUrls,
      },
      redirectsReviewed
        ? ""
        : "Every legacy URL needs a deliberate retained route, reviewed one-hop redirect, or approved 410; homepage and search fallbacks are prohibited.",
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
        crawl_urls: seoEvidence.summary.crawl_urls,
        url_types: seoEvidence.summary.url_types,
        urls_with_any_evidence: seoEvidence.summary.urls_with_any_evidence,
        missing_required_sources: seoEvidence.summary.missing_required_sources,
        privacy_events: seoEvidence.summary.sources.privacy_events,
        analytics_export: seoEvidence.summary.sources.analytics_export,
        sources: seoLaunchSourceSummaries(seoEvidence.summary.sources),
        next_actions: seoPreflight.next_actions,
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
      { reports: liveServices, provisioning: liveServiceProvisioning },
      liveServicesReady
        ? ""
        : "Run live Typesense/Meilisearch sync/query and Hermes draft worker commands after provisioning.",
    ),
    gate(
      "monitoring_rollback",
      monitoringReady && rollbackReady && monitoringRollbackReady ? "pass" : "blocked",
      {
        monitoring_sources: monitoringPlan.map((item) => item.source),
        monitoring_source_statuses: Object.fromEntries(monitoringPlan.map((item) => [item.source, item.status])),
        privacy_events_status: monitoringPlan.find((item) => item.source === "privacy_events")?.status,
        rollback_steps: rollbackPlan.length,
        machine_evidence: monitoringRollback,
      },
      monitoringReady && rollbackReady && monitoringRollbackReady
        ? ""
        : "Monitoring evidence, an automated rollback report, and rollback steps are required before launch.",
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
    gate(
      "production_recovery",
      productionRecoveryReady ? "pass" : "blocked",
      productionRecovery,
      productionRecoveryReady
        ? "Encrypted off-site backup and isolated restore evidence passed."
        : "Encrypted off-site backup and isolated production restore evidence are required before launch.",
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
  assertBlockedGateNextActions(report);
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
  assertPassProductionRecoveryEvidence(report);
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

function localReportSnapshot({ id, path: reportPath, assertReport, generatedAtMs, maxReportAgeMs, requiresReady = false }) {
  if (!reportPath || !fs.existsSync(reportPath)) return { id, status: "missing_report", path: reportPath || null };
  try {
    const report = readJson(reportPath);
    assertReport(report);
    if (report.example === true || reportPath.endsWith(".example")) {
      throw new Error("Example reports cannot be materialized as local runtime evidence");
    }
    const reportedAtMs = Date.parse(report.generated_at);
    if (Number.isNaN(reportedAtMs)) throw new Error("Report must include valid generated_at");
    if (reportedAtMs > generatedAtMs + 60_000) throw new Error("Report generated_at is in the future");
    const ageMs = Math.max(0, generatedAtMs - reportedAtMs);
    if (ageMs > maxReportAgeMs) {
      return {
        id,
        status: "stale_report",
        path: reportPath,
        generated_at: report.generated_at,
        age_seconds: Math.floor(ageMs / 1000),
      };
    }
    if (requiresReady && report.ready !== true) {
      return {
        id,
        status: "blocked_report",
        path: reportPath,
        generated_at: report.generated_at,
        age_seconds: Math.floor(ageMs / 1000),
      };
    }
    return {
      id,
      status: "pass",
      path: reportPath,
      generated_at: report.generated_at,
      age_seconds: Math.floor(ageMs / 1000),
    };
  } catch (error) {
    return { id, status: "invalid_report", path: reportPath, error: error.message };
  }
}

function writeJsonAtomically(report, outPath) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const tempPath = path.join(path.dirname(outPath), `.${path.basename(outPath)}.${process.pid}.${Date.now()}.tmp`);
  let fileDescriptor;
  try {
    fileDescriptor = fs.openSync(tempPath, "wx", 0o600);
    fs.writeFileSync(fileDescriptor, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    fs.closeSync(fileDescriptor);
    fileDescriptor = null;
    fs.renameSync(tempPath, outPath);
  } finally {
    if (fileDescriptor !== undefined && fileDescriptor !== null) fs.closeSync(fileDescriptor);
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
  }
  return outPath;
}

function localPayloadRuntimeGate(sourceGate, snapshot) {
  const runtime = snapshot.status === "pass" ? payloadRuntimeState(snapshot.path) : null;
  if (runtime?.status === "pass") {
    return {
      id: "payload_runtime",
      status: "pass",
      message: "Current local Docker Payload runtime report passed; it remains local verification only.",
      evidence: {
        ...runtime,
        local_preview: { scope: "local_docker_preview", report: snapshot },
      },
    };
  }
  return {
    id: "payload_runtime",
    status: "blocked",
    message: "Current local Docker Payload runtime evidence is missing, invalid, stale, or blocked.",
    evidence: {
      ...(sourceGate?.evidence || {}),
      local_preview: { scope: "local_docker_preview", report: snapshot },
    },
    next_actions: [
      "Run npm run docker:up or npm run docker:seed to regenerate the local Payload runtime report.",
      "Use production Payload evidence and launch preflight before treating this as a launch gate.",
    ],
  };
}

function localPreviewGate(localPreview) {
  return {
    id: LOCAL_PREVIEW_GATE_ID,
    status: "blocked",
    message: "Local Docker preview evidence is deliberately excluded from production launch readiness.",
    evidence: localPreview,
    next_actions: LOCAL_PREVIEW_GATE_NEXT_ACTIONS,
  };
}

/**
 * Materialize fresh local Docker reports without allowing them to clear external launch gates.
 * The extra local-preview gate is intentionally always blocked, so this manifest can never make
 * /api/ready report production readiness.
 */
export function materializeLocalLaunchReadiness({
  sourceReadinessPath = DEFAULT_LAUNCH_READINESS_OUTPUT,
  outPath,
  syncReportPath = DEFAULT_SEARCH_ENGINE_SYNC_REPORT,
  queryReportPath = DEFAULT_SEARCH_ENGINE_QUERY_REPORT,
  hermesReportPath = DEFAULT_HERMES_DRAFT_WORKER_REPORT_PATH,
  payloadRuntimeReportPath = DEFAULT_PAYLOAD_RUNTIME_REPORT,
  generatedAt = new Date().toISOString(),
  maxReportAgeMs = DEFAULT_LOCAL_READINESS_MAX_AGE_MS,
} = {}) {
  if (!outPath) throw new Error("Local readiness materialization requires an output path");
  if (path.resolve(sourceReadinessPath) === path.resolve(outPath)) {
    throw new Error("Local readiness materialization output must not replace its source report");
  }
  if (!Number.isInteger(maxReportAgeMs) || maxReportAgeMs < 1) {
    throw new Error("Local readiness materialization maxReportAgeMs must be a positive integer");
  }
  const generatedAtMs = Date.parse(generatedAt);
  if (Number.isNaN(generatedAtMs)) throw new Error("Local readiness materialization requires valid generatedAt");

  const source = readJson(sourceReadinessPath);
  assertLaunchReadinessReport(source);
  if (source.gates.some((gate) => gate.id === LOCAL_PREVIEW_GATE_ID)) {
    throw new Error("Local readiness materialization source must be the non-local launch readiness report");
  }

  const reports = [
    localReportSnapshot({
      id: "typesense_meilisearch_sync",
      path: syncReportPath,
      assertReport: assertSearchEngineSyncReport,
      generatedAtMs,
      maxReportAgeMs,
    }),
    localReportSnapshot({
      id: "typesense_meilisearch_query",
      path: queryReportPath,
      assertReport: assertSearchEngineQueryReport,
      generatedAtMs,
      maxReportAgeMs,
    }),
    localReportSnapshot({
      id: "hermes_draft_worker",
      path: hermesReportPath,
      assertReport: assertHermesDraftWorkerReport,
      generatedAtMs,
      maxReportAgeMs,
    }),
    localReportSnapshot({
      id: "payload_runtime",
      path: payloadRuntimeReportPath,
      assertReport: assertPayloadRuntimeReport,
      generatedAtMs,
      maxReportAgeMs,
      requiresReady: true,
    }),
  ];
  const payloadSnapshot = reports.find((report) => report.id === "payload_runtime");
  const localPreview = {
    scope: "local_docker_preview",
    production_launch_evidence: false,
    generated_at: generatedAt,
    expires_at: new Date(generatedAtMs + maxReportAgeMs).toISOString(),
    max_report_age_seconds: Math.floor(maxReportAgeMs / 1000),
    source_launch_readiness: { path: sourceReadinessPath, generated_at: source.generated_at },
    reports,
  };
  const gates = source.gates.map((gate) => (gate.id === "payload_runtime" ? localPayloadRuntimeGate(gate, payloadSnapshot) : gate));
  gates.push(localPreviewGate(localPreview));
  const report = {
    ...source,
    generated_at: generatedAt,
    launch_ready: false,
    status: "blocked",
    blockers: blockersFrom(gates),
    gates,
    local_preview: localPreview,
  };
  assertLaunchReadinessReport(report);
  return { outPath: writeJsonAtomically(report, outPath), report };
}
