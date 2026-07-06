import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { spawnSync } from "node:child_process";
import {
  assertLaunchReadinessReport,
  buildLaunchReadinessReport,
  readLiveServiceReportTemplate,
  validateLiveServiceReports,
  writeLiveServiceReport,
} from "../lib/launch-readiness.mjs";
import { renderLaunchInputChecklist } from "../lib/launch-inputs.mjs";
import { fromRoot } from "../lib/paths.mjs";

function readJson(path) {
  return JSON.parse(fs.readFileSync(fromRoot(...path), "utf8"));
}

const readyLiveServices = [
  { source: "typesense_meilisearch_sync", status: "pass", path: "production/data/search-engine-sync-report.json", summary: {} },
  { source: "typesense_meilisearch_query", status: "pass", path: "production/data/search-engine-query-report.json", summary: {} },
  { source: "hermes_draft_worker", status: "pass", path: "production/data/hermes-draft-worker-report.json", summary: {} },
];
const readyListingQualityReview = {
  status: "pass",
  path: "migration/reviews/listing-quality.csv",
  summary: { review_rows: 7, facts_review_rows: 0, media_review_rows: 7 },
};

function writeLiveReportFixtures(dir) {
  const syncReportPath = `${dir}/search-engine-sync-report.json`;
  const queryReportPath = `${dir}/search-engine-query-report.json`;
  const hermesReportPath = `${dir}/hermes-draft-worker-report.json`;
  fs.writeFileSync(
    syncReportPath,
    `${JSON.stringify({
      summary: { engines: 2, documents_per_engine: [167, 167], total_operations: 4 },
      engines: [
        { engine: "typesense", documents: 167, operations: [{ bytes: 1 }, { bytes: 1 }] },
        { engine: "meilisearch", documents: 167, operations: [{ bytes: 1 }, { bytes: 1 }] },
      ],
    })}\n`,
  );
  fs.writeFileSync(
    queryReportPath,
    `${JSON.stringify({
      summary: { engines: 2, total_hits: 2, first_hit_ids: ["MS-CRAWL-0001:bg", "MS-CRAWL-0001:bg"] },
      engines: [
        { engine: "typesense", total: 1, hits: [{ id: "MS-CRAWL-0001:bg", locale: "bg" }] },
        { engine: "meilisearch", total: 1, hits: [{ id: "MS-CRAWL-0001:bg", locale: "bg" }] },
      ],
    })}\n`,
  );
  fs.writeFileSync(
    hermesReportPath,
    `${JSON.stringify({
      summary: { attempted: 1, persisted: 1, rejected: 0 },
      persisted: [{ status: "hermes_drafted", public_indexable: false }],
      rejected: [],
    })}\n`,
  );
  return { syncReportPath, queryReportPath, hermesReportPath };
}

test("launch readiness stays blocked until production launch blockers are cleared", () => {
  const report = buildLaunchReadinessReport({ generatedAt: "2026-07-05T00:00:00Z" });
  assert.equal(assertLaunchReadinessReport(report), true);
  assert.equal(report.launch_ready, false);
  assert.deepEqual(report.blockers, ["external_seo_exports", "listing_quality_review", "live_services"]);
  assert.equal(report.gates.find((gate) => gate.id === "redirect_reviews").status, "pass");
  assert.equal(report.gates.find((gate) => gate.id === "listing_quality_review").status, "blocked");
  assert.equal(report.gates.find((gate) => gate.id === "live_services").status, "blocked");
  assert.equal(report.live_services.every((item) => item.status === "missing_report"), true);
  assert.equal(report.gates.find((gate) => gate.id === "monitoring_rollback").status, "pass");
  assert.deepEqual(report.warnings.find((warning) => warning.id === "listing_quality.thin_public_gallery"), {
    id: "listing_quality.thin_public_gallery",
    count: 7,
  });
  assert.ok(report.rollback_plan.length >= 3);
});

test("launch readiness validator accepts ready state after required gates are cleared", () => {
  const routeMap = readJson(["production", "data", "legacy-route-map.json"]);
  const deployableRedirects = readJson(["production", "data", "deployable-redirects.json"]);
  const seoEvidence = readJson(["production", "data", "seo-evidence.json"]);
  const sources = seoEvidence.summary.sources;

  deployableRedirects.summary.total = routeMap.summary.mappedListings;
  seoEvidence.summary.missing_required_sources = [];
  for (const source of ["search_console", "yandex_webmaster", "backlinks"]) {
    sources[source] = {
      ...sources[source],
      status: "imported",
      row_count: 2,
      matched_rows: 2,
      unmatched_rows: 0,
      matched_source_domains: ["makler-realty.com", "makler-realty.ru"],
    };
  }

  const report = buildLaunchReadinessReport({
    generatedAt: "2026-07-05T00:00:00Z",
    routeMap,
    deployableRedirects,
    seoEvidence,
    listingQualityReview: readyListingQualityReview,
    liveServices: readyLiveServices,
  });

  assert.equal(assertLaunchReadinessReport(report), true);
  assert.equal(report.launch_ready, true);
  assert.equal(report.status, "ready");
  assert.deepEqual(report.blockers, []);
});

test("launch readiness accepts reviewed location page growth", () => {
  const sitemap = readJson(["production", "data", "localized-sitemap.json"]);
  sitemap.summary = {
    ...sitemap.summary,
    location_pages: sitemap.summary.location_pages + 1,
    entries: sitemap.summary.entries + 1,
    byLocale: { ...sitemap.summary.byLocale, bg: sitemap.summary.byLocale.bg + 1 },
  };

  const report = buildLaunchReadinessReport({ generatedAt: "2026-07-05T00:00:00Z", sitemap });

  assert.equal(report.gates.find((gate) => gate.id === "localized_sitemap").status, "pass");
});

test("launch readiness blocks incomplete monitoring configuration", () => {
  const routeMap = readJson(["production", "data", "legacy-route-map.json"]);
  const deployableRedirects = readJson(["production", "data", "deployable-redirects.json"]);
  const seoEvidence = readJson(["production", "data", "seo-evidence.json"]);

  deployableRedirects.summary.total = routeMap.summary.mappedListings;
  seoEvidence.summary.missing_required_sources = [];
  seoEvidence.summary.sources.privacy_events.status = "";

  const report = buildLaunchReadinessReport({
    generatedAt: "2026-07-05T00:00:00Z",
    routeMap,
    deployableRedirects,
    seoEvidence,
    listingQualityReview: readyListingQualityReview,
    liveServices: readyLiveServices,
  });

  assert.equal(report.gates.find((gate) => gate.id === "monitoring_rollback").status, "blocked");
  assert.deepEqual(report.blockers, ["monitoring_rollback"]);
});

test("launch readiness blocks broad or duplicate deployable redirect exports", () => {
  const routeMap = readJson(["production", "data", "legacy-route-map.json"]);
  const deployableRedirects = readJson(["production", "data", "deployable-redirects.json"]);
  const seoEvidence = readJson(["production", "data", "seo-evidence.json"]);

  deployableRedirects.summary.total = routeMap.summary.mappedListings;
  deployableRedirects.summary.homepageTargets = 1;
  deployableRedirects.summary.duplicateOldUrls = 0;
  seoEvidence.summary.missing_required_sources = [];

  const homepageReport = buildLaunchReadinessReport({
    generatedAt: "2026-07-05T00:00:00Z",
    routeMap,
    deployableRedirects,
    seoEvidence,
    listingQualityReview: readyListingQualityReview,
    liveServices: readyLiveServices,
  });
  assert.equal(homepageReport.gates.find((gate) => gate.id === "redirect_reviews").status, "blocked");
  assert.deepEqual(homepageReport.blockers, ["redirect_reviews"]);

  deployableRedirects.summary.homepageTargets = 0;
  deployableRedirects.summary.duplicateOldUrls = 1;
  const duplicateReport = buildLaunchReadinessReport({
    generatedAt: "2026-07-05T00:00:00Z",
    routeMap,
    deployableRedirects,
    seoEvidence,
    listingQualityReview: readyListingQualityReview,
    liveServices: readyLiveServices,
  });
  assert.equal(duplicateReport.gates.find((gate) => gate.id === "redirect_reviews").status, "blocked");
  assert.deepEqual(duplicateReport.blockers, ["redirect_reviews"]);
});

test("generated launch readiness report is valid when present", () => {
  const file = fromRoot("production", "data", "launch-readiness.json");
  if (!fs.existsSync(file)) return;
  const report = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.equal(assertLaunchReadinessReport(report), true);
});

test("launch preflight fails closed while launch blockers remain", () => {
  const result = spawnSync(process.execPath, [fromRoot("production", "scripts", "launch-preflight.mjs")], {
    cwd: fromRoot(),
    encoding: "utf8",
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /LAUNCH BLOCKED: external_seo_exports, listing_quality_review, live_services/);
  assert.match(result.stderr, /external_seo_exports missing: search_console, yandex_webmaster, backlinks/);
  assert.match(result.stderr, /listing_quality_review: missing_review .*migration\/reviews\/listing-quality\.csv/);
  assert.match(result.stderr, /typesense_meilisearch_sync: missing_report .*search-engine-sync-report\.json/);
  assert.match(result.stderr, /hermes_draft_worker: missing_report .*hermes-draft-worker-report\.json/);
  assert.match(result.stderr, /npm run launch:inputs/);
});

test("live service report preflight fails missing reports and passes valid reports", () => {
  const missingDir = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-missing-live-reports-`);
  const missingEnv = {
    ...process.env,
    MS_REALTY_SEARCH_SYNC_REPORT_PATH: `${missingDir}/search-engine-sync-report.json`,
    MS_REALTY_SEARCH_QUERY_REPORT_PATH: `${missingDir}/search-engine-query-report.json`,
    MS_REALTY_HERMES_WORKER_REPORT_PATH: `${missingDir}/hermes-draft-worker-report.json`,
  };
  const missing = spawnSync(process.execPath, [fromRoot("production", "scripts", "validate-live-service-reports.mjs")], {
    cwd: fromRoot(),
    encoding: "utf8",
    env: missingEnv,
  });

  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /typesense_meilisearch_sync: missing_report/);
  assert.match(missing.stderr, /LIVE SERVICE PREFLIGHT FAILED/);

  const validDir = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-valid-live-reports-`);
  const paths = writeLiveReportFixtures(validDir);
  const result = validateLiveServiceReports(paths);
  assert.equal(result.ready, true);
  assert.equal(result.reports.every((report) => report.status === "pass"), true);

  const valid = spawnSync(process.execPath, [fromRoot("production", "scripts", "validate-live-service-reports.mjs")], {
    cwd: fromRoot(),
    encoding: "utf8",
    env: {
      ...process.env,
      MS_REALTY_SEARCH_SYNC_REPORT_PATH: paths.syncReportPath,
      MS_REALTY_SEARCH_QUERY_REPORT_PATH: paths.queryReportPath,
      MS_REALTY_HERMES_WORKER_REPORT_PATH: paths.hermesReportPath,
    },
  });

  assert.equal(valid.status, 0, valid.stderr);
  assert.match(valid.stdout, /typesense_meilisearch_sync: pass/);
  assert.match(valid.stdout, /Live service reports valid/);
});

test("live service report examples validate but do not replace real launch evidence", () => {
  const result = validateLiveServiceReports({
    syncReportPath: fromRoot("production", "data", "search-engine-sync-report.json.example"),
    queryReportPath: fromRoot("production", "data", "search-engine-query-report.json.example"),
    hermesReportPath: fromRoot("production", "data", "hermes-draft-worker-report.json.example"),
  });

  assert.equal(result.ready, true);
  assert.equal(result.reports.every((report) => report.status === "pass"), true);
  assert.match(fs.readFileSync(fromRoot(".gitignore"), "utf8"), /production\/data\/search-engine-sync-report\.json/);
  assert.match(fs.readFileSync(fromRoot(".gitignore"), "utf8"), /production\/data\/search-engine-query-report\.json/);
  assert.match(fs.readFileSync(fromRoot(".gitignore"), "utf8"), /production\/data\/hermes-draft-worker-report\.json/);

  const template = readLiveServiceReportTemplate("typesense_meilisearch_query");
  assert.equal(template.filename, "search-engine-query-report.json.example");
  assert.equal(JSON.parse(template.json).summary.engines, 2);
  assert.throws(() => readLiveServiceReportTemplate("../bad"), /Unknown live service report source/);
});

test("live service report import writes only validated source reports", () => {
  const dir = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-import-live-reports-`);
  const paths = writeLiveReportFixtures(dir);
  const queryReport = JSON.parse(fs.readFileSync(paths.queryReportPath, "utf8"));
  const outPath = `${dir}/imported-query-report.json`;

  const imported = writeLiveServiceReport("typesense_meilisearch_query", queryReport, { queryReportPath: outPath });

  assert.equal(imported.outPath, outPath);
  assert.equal(JSON.parse(fs.readFileSync(outPath, "utf8")).summary.engines, 2);
  assert.throws(() => writeLiveServiceReport("typesense_meilisearch_query", { summary: { engines: 1 }, engines: [] }, { queryReportPath: outPath }), /cover Typesense and Meilisearch/);
  assert.throws(() => writeLiveServiceReport("../bad", queryReport), /Unknown live service report source/);
});

test("launch input checklist names remaining operator-owned blockers", () => {
  const markdown = renderLaunchInputChecklist({
    generatedAt: "2026-07-05T00:00:00Z",
    launchReadiness: buildLaunchReadinessReport({ generatedAt: "2026-07-05T00:00:00Z" }),
    seoEvidence: readJson(["production", "data", "seo-evidence.json"]),
    redirectWorkbookCsv: fs.readFileSync(fromRoot("production", "data", "redirect-approval-workbook.csv"), "utf8"),
    deployableRedirects: readJson(["production", "data", "deployable-redirects.json"]),
    routeMap: readJson(["production", "data", "legacy-route-map.json"]),
  });

  assert.match(markdown, /Status: blocked/);
  assert.match(markdown, /Remaining approvals required: 0/);
  assert.match(markdown, /migration\/reviews\/redirect-approvals\.csv/);
  assert.match(markdown, /POST \/api\/admin\/redirect-approvals\/import/);
  assert.match(markdown, /MS_REALTY_REDIRECT_APPROVALS_PATH/);
  assert.match(markdown, /MS_REALTY_DEPLOYABLE_REDIRECTS_OUTPUT_PATH/);
  assert.match(markdown, /target_listing_id/);
  assert.match(markdown, /same_content_checklist/);
  assert.match(markdown, /Approval import columns: `old_url`, `equivalent_content`, `reviewer`/);
  assert.match(markdown, /migration\/external\/seo\/search-console\.csv`: missing_export/);
  assert.match(markdown, /migration\/external\/seo\/yandex-webmaster\.csv`: missing_export/);
  assert.match(markdown, /migration\/external\/seo\/backlinks\.csv`: missing_export/);
  assert.match(markdown, /Minimum required domain coverage/);
  assert.match(markdown, /makler-realty\.com: `https:\/\/makler-realty\.com/);
  assert.match(markdown, /makler-realty\.ru: `https:\/\/makler-realty\.ru/);
  assert.match(markdown, /POST \/api\/admin\/seo-evidence\/import\?source=search_console`: `url,clicks,impressions,position/);
  assert.match(markdown, /POST \/api\/admin\/seo-evidence\/import\?source=yandex_webmaster`: `url,indexed,issue/);
  assert.match(markdown, /POST \/api\/admin\/seo-evidence\/import\?source=backlinks`: `target_url,source_url,referring_domain/);
  assert.match(markdown, /GET \/api\/admin\/seo-evidence\/template\?source=search_console/);
  assert.match(markdown, /MS_REALTY_SEO_EVIDENCE_INPUT_DIR/);
  assert.match(markdown, /MS_REALTY_LAUNCH_READINESS_OUTPUT_PATH/);
  assert.match(markdown, /Live Service Provisioning/);
  assert.match(markdown, /TYPESENSE_URL/);
  assert.match(markdown, /MEILI_API_KEY/);
  assert.match(markdown, /HERMES_CHAT_COMPLETIONS_URL/);
  assert.match(markdown, /npm run search:sync && npm run search:query/);
  assert.match(markdown, /npm run hermes:worker/);
  assert.match(markdown, /npm run live:preflight/);
  assert.match(markdown, /search-engine-sync-report\.json\.example/);
  assert.match(markdown, /live-service-report-template\?source=typesense_meilisearch_sync/);
  assert.match(markdown, /live-service-reports\/import\?source=typesense_meilisearch_sync/);
  assert.match(markdown, /MS_REALTY_SEARCH_SYNC_REPORT_PATH/);
  assert.match(markdown, /MS_REALTY_HERMES_WORKER_REPORT_PATH/);
  assert.match(markdown, /examples do not count as launch evidence/);
  assert.match(markdown, /checked-in smoke commands remain local contract tests only/);
  assert.match(markdown, /production\/data\/listing-quality-workbook\.csv/);
  assert.match(markdown, /listing_quality\.thin_public_gallery: 7/);
  assert.match(markdown, /review_status/);
  assert.match(markdown, /required_editor_fields/);
  assert.match(markdown, /POST \/api\/admin\/listings\/edit/);
  assert.match(markdown, /Broker Verification/);
  assert.match(markdown, /production\/data\/listing-verification-report\.json/);
  assert.match(markdown, /Broker verification tasks: 165/);
  assert.match(markdown, /High priority tasks: 74/);
  assert.match(markdown, /broker_bg: 113, broker_ru: 52/);
  assert.match(markdown, /npm run launch:inputs/);
  assert.match(markdown, /npm run launch:preflight/);
});
