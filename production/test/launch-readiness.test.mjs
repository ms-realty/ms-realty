import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import { spawn, spawnSync } from "node:child_process";
import {
  assertLaunchReadinessReport,
  assertLiveServicePreflightReport,
  buildLiveServicePreflightReport,
  buildLaunchReadinessReport,
  liveServiceImportSummary,
  materializeLocalLaunchReadiness,
  publicLaunchReadinessHeaders,
  publicLaunchReadinessPayload,
  readLiveServiceReportTemplate,
  validateLiveServiceReports,
  writeLiveServiceReport,
} from "../lib/launch-readiness.mjs";
import { renderLaunchInputChecklist } from "../lib/launch-inputs.mjs";
import {
  HERMES_AGENT_MESSAGING_PLATFORMS,
  HERMES_AGENT_TERMINAL_BACKENDS,
  HERMES_AGENT_REQUIRED_CAPABILITIES,
  HERMES_AGENT_TOOL_GATEWAY_TOOLS,
} from "../lib/hermes-provider-provisioning.mjs";
import {
  buildLiveServiceProvisioningReport,
  writeLiveServiceProvisioningReport,
} from "../lib/live-service-provisioning.mjs";
import { buildPayloadRuntimeReport } from "../lib/payload-runtime.mjs";
import { summarizeLegacyRouteMap } from "../lib/migration.mjs";
import { fromRoot } from "../lib/paths.mjs";

function healthyHermesAgentFetch(url) {
  if (String(url).endsWith("/v1/capabilities")) {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        platform: "hermes-agent",
        model: "hermes-agent",
        auth: { type: "bearer", required: true },
        features: { chat_completions: true, responses_api: true, run_submission: true },
      }),
    };
  }
  return { ok: true, status: 200 };
}

function readJson(path) {
  return JSON.parse(fs.readFileSync(fromRoot(...path), "utf8"));
}

function completeRouteMap() {
  const routeMap = readJson(["production", "data", "legacy-route-map.json"]);
  routeMap.routes = routeMap.routes.map((route) =>
    route.target_path
      ? route
      : {
          ...route,
          target_locale: "bg",
          target_path: "/bg/guides/foreign-buyers",
          planned_status: 301,
          reason: "Reviewed fixture route for launch-readiness coverage validation.",
        },
  );
  routeMap.summary = summarizeLegacyRouteMap(routeMap.routes);
  return routeMap;
}

function writeJson(path, value) {
  fs.writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function localPayloadRuntimeReport(generatedAt) {
  return buildPayloadRuntimeReport({
    databaseProbe: async () => ({ error: "", status: "pass" }),
    env: {
      DATABASE_URL: "postgresql://ms_realty_payload:local-password@postgres:5432/ms_realty_payload",
      MS_REALTY_ALLOW_PRIVATE_DATABASE_HOST: "1",
      PAYLOAD_SECRET: "local-payload-runtime-secret-that-is-long-enough",
    },
    generatedAt,
  });
}

function writeCompleteSeoInputFixture(dir) {
  const records = readJson(["production", "data", "migration-records.json"]).records;
  const com = records.find((row) => row.source_domain === "makler-realty.com");
  const ru = records.find((row) => row.source_domain === "makler-realty.ru");
  assert.ok(com?.old_url);
  assert.ok(ru?.old_url);
  fs.writeFileSync(`${dir}/search-console.csv`, `url,clicks,impressions,position\n${com.old_url},3,30,7\n${ru.old_url},2,20,8\n`);
  fs.writeFileSync(`${dir}/yandex-webmaster.csv`, `url,indexed,issue\n${com.old_url},yes,\n${ru.old_url},yes,\n`);
  fs.writeFileSync(`${dir}/backlinks.csv`, `target_url,source_url\n${com.old_url},https://regionalbroker.bg/a\n${ru.old_url},https://partnerrealty.de/b\n`);
}

function readySeoEvidenceFixture() {
  const seoEvidence = readJson(["production", "data", "seo-evidence.json"]);
  seoEvidence.summary.missing_required_sources = [];
  for (const source of ["search_console", "yandex_webmaster", "backlinks"]) {
    seoEvidence.summary.sources[source] = {
      ...seoEvidence.summary.sources[source],
      status: "imported",
      row_count: 2,
      matched_rows: 2,
      unmatched_rows: 0,
      duplicate_rows: 0,
      signal_rows: 2,
      placeholder_rows: 0,
      matched_source_domains: ["makler-realty.com", "makler-realty.ru"],
      signal_source_domains: ["makler-realty.com", "makler-realty.ru"],
    };
  }
  return seoEvidence;
}

function csvCell(value) {
  const text = Array.isArray(value) ? value.join("|") : String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll("\"", "\"\"")}"` : text;
}

function writeListingQualityReviewFixture(dir) {
  const listingQuality = readJson(["production", "data", "listing-quality-report.json"]);
  const headers = [
    "listing_id",
    "price_eur",
    "bedrooms",
    "location",
    "description",
    "facts_reviewer",
    "media_reviewer",
    "review_notes",
    "editor_path",
    "review_status",
    "issues",
    "required_editor_fields",
    "public_gallery_assets",
    "public_gallery_sample",
    "missing_alt_text_assets",
  ];
  const reviewPath = `${dir}/listing-quality.csv`;
  const rows = listingQuality.rows.map((row) => {
    const fields = row.required_editor_fields || [];
    const needsFacts = fields.some((field) => ["price_eur", "bedrooms", "location", "description"].includes(field));
    const needsMedia = fields.some((field) =>
      ["media_review", "media_alt_text", "public_gallery", "tour_review"].includes(field),
    );
    return [
      row.listing_id,
      fields.includes("price_eur") ? row.price_eur || 123000 : "",
      fields.includes("bedrooms") ? row.bedrooms ?? 2 : "",
      fields.includes("location") ? row.location || "Sandanski" : "",
      fields.includes("description") ? "Reviewed listing description" : "",
      needsFacts ? "editor_bg" : "",
      needsMedia ? "media_editor" : "",
      "Reviewed from source evidence",
      row.editor_path,
      row.review_status,
      row.issues,
      row.required_editor_fields,
      row.public_gallery_assets,
      row.public_gallery_sample,
      row.missing_alt_text_assets,
    ].map(csvCell).join(",");
  });
  fs.writeFileSync(
    reviewPath,
    [
      headers.join(","),
      ...rows,
      "",
    ].join("\n"),
  );
  return reviewPath;
}

function writePartialListingQualityReviewFixture(dir) {
  const listingQuality = readJson(["production", "data", "listing-quality-report.json"]);
  const headers = [
    "listing_id",
    "price_eur",
    "bedrooms",
    "location",
    "description",
    "facts_reviewer",
    "media_reviewer",
    "review_notes",
    "editor_path",
    "review_status",
    "issues",
    "required_editor_fields",
    "public_gallery_assets",
    "public_gallery_sample",
    "missing_alt_text_assets",
  ];
  const row = listingQuality.rows.find((candidate) => candidate.review_status.includes("media"));
  assert.ok(row, "expected a listing quality row that still requires media review");
  const reviewPath = `${dir}/listing-quality.csv`;
  fs.writeFileSync(
    reviewPath,
    [
      headers.join(","),
      [
        row.listing_id,
        "",
        "",
        "",
        "",
        "",
        "media_editor",
        "Reviewed public gallery selection",
        row.editor_path,
        row.review_status,
        row.issues,
        row.required_editor_fields,
        row.public_gallery_assets,
        row.public_gallery_sample,
        row.missing_alt_text_assets,
      ].map(csvCell).join(","),
      "",
    ].join("\n"),
  );
  return reviewPath;
}

const readyLiveServices = [
  {
    source: "typesense_meilisearch_sync",
    status: "pass",
    path: "production/data/search-engine-sync-report.json",
    summary: {
      engines: 2,
      targets: { typesense: "ms_realty_listings", meilisearch: "ms_realty_listings" },
      documents_per_engine: [167, 167],
      total_operations: 4,
    },
    evidence: {
      engines: [
        {
          engine: "typesense",
          target: "ms_realty_listings",
          operations: [
            { method: "POST", url: "https://typesense.ms-realty.bg/collections", status: 201, bytes: 1 },
            {
              method: "POST",
              url: "https://typesense.ms-realty.bg/collections/ms_realty_listings/documents/import?action=upsert",
              status: 200,
              bytes: 1,
            },
          ],
        },
        {
          engine: "meilisearch",
          target: "ms_realty_listings",
          operations: [
            { method: "PATCH", url: "https://meili.ms-realty.bg/indexes/ms_realty_listings/settings", status: 202, bytes: 1 },
            {
              method: "POST",
              url: "https://meili.ms-realty.bg/indexes/ms_realty_listings/documents?primaryKey=meili_id",
              status: 202,
              bytes: 1,
            },
          ],
        },
      ],
    },
  },
  {
    source: "typesense_meilisearch_query",
    status: "pass",
    path: "production/data/search-engine-query-report.json",
    summary: {
      engines: 2,
      targets: { typesense: "ms_realty_listings", meilisearch: "ms_realty_listings" },
      total_hits: 2,
      first_hit_ids: ["MS-CRAWL-0001:bg", "MS-CRAWL-0001:bg"],
    },
    evidence: {
      engines: [
        {
          engine: "typesense",
          target: "ms_realty_listings",
          operation: {
            method: "GET",
            url: "https://typesense.ms-realty.bg/collections/ms_realty_listings/documents/search?q=Sandanski&filter_by=translation_indexable%3A%3Dtrue+%26%26+locale%3A%3Dbg+%26%26+source_listing_id%3A%3DMS-CRAWL-0001",
            status: 200,
          },
        },
        {
          engine: "meilisearch",
          target: "ms_realty_listings",
          operation: {
            method: "POST",
            url: "https://meili.ms-realty.bg/indexes/ms_realty_listings/search",
            status: 200,
          },
        },
      ],
    },
  },
  {
    source: "hermes_draft_worker",
    status: "pass",
    path: "production/data/hermes-draft-worker-report.json",
    summary: { attempted: 1, persisted: 1, rejected: 0 },
    evidence: {
      provider: {
        mode: "self_hosted",
        model: "NousResearch/Hermes-4-14B",
        endpoint: "https://hermes.ms-realty.bg/v1/chat/completions",
        tool_call_parser: "hermes",
        sensitive_data_allowed: true,
      },
      audit_log_rows: 1,
    },
  },
];
const readyLiveServiceProvisioning = {
  status: "pass",
  path: "production/data/live-service-provisioning-report.json",
  summary: { checks: 7, missing_env: [], placeholder_env: [], services: ["typesense", "meilisearch", "hermes"] },
  checks: [
    { id: "typesense_url", env: "TYPESENSE_URL", status: "pass" },
    { id: "typesense_api_key", env: "TYPESENSE_API_KEY", status: "pass" },
    { id: "meili_url", env: "MEILI_URL", status: "pass" },
    { id: "meili_api_key", env: "MEILI_API_KEY", status: "pass" },
    { id: "typesense_health", redacted_url: "https://typesense.ms-realty.bg", status: "pass", status_code: 200 },
    { id: "meilisearch_health", redacted_url: "https://meili.ms-realty.bg", status: "pass", status_code: 200 },
    { id: "hermes_provider", missing: [], mode: "self_hosted", status: "pass" },
  ],
  hermes: { ready: true, endpoint: "https://hermes.ms-realty.bg/v1/chat/completions" },
  next_actions: ["Run npm run live:capture, then npm run live:preflight."],
};
const readyListingQualityReview = {
  status: "pass",
  path: "migration/reviews/listing-quality.csv",
  summary: { expected_review_rows: 7, review_rows: 7, missing_review_rows: 0, facts_review_rows: 0, media_review_rows: 7 },
};
const readyAppState = {
  start_script: "node production/server.mjs",
  production_server_entrypoint: true,
  payload_dependency: true,
  payload_config: true,
  payload_collection_export: true,
  payload_secret_configured: true,
  payload_database_url_configured: true,
};
const readyPayloadRuntime = {
  status: "pass",
  path: "production/data/payload-runtime-report.json",
  summary: {
    checks: 9,
    missing_env: [],
    placeholder_env: [],
    weak_env: [],
    route_files: 4,
    database: {
      status: "pass",
      credentials_configured: true,
      database: "ms_realty",
      host: "db.ms-realty.bg",
      network_scope: "public_dns",
      port: 5432,
      private_network_allowed: false,
    },
  },
  checks: [
    { id: "payload_secret", status: "pass" },
    { id: "database_url", status: "pass" },
    { id: "route:app/(payload)/payload-admin/[[...segments]]/page.js", status: "pass" },
    { id: "route:app/(payload)/api/[...slug]/route.js", status: "pass" },
    { id: "route:app/(payload)/graphql/route.js", status: "pass" },
    { id: "route:app/(payload)/graphql-playground/route.js", status: "pass" },
    { id: "payload_config_import", status: "pass" },
    {
      id: "database_network_scope",
      status: "pass",
      host: "db.ms-realty.bg",
      network_scope: "public_dns",
      private_network_allowed: false,
    },
    {
      id: "database_tcp",
      status: "pass",
      credentials_configured: true,
      database: "ms_realty",
      host: "db.ms-realty.bg",
      network_scope: "public_dns",
      port: 5432,
    },
  ],
};

function writeLiveReportFixtures(dir) {
  const syncReportPath = `${dir}/search-engine-sync-report.json`;
  const queryReportPath = `${dir}/search-engine-query-report.json`;
  const hermesReportPath = `${dir}/hermes-draft-worker-report.json`;
  fs.writeFileSync(
    syncReportPath,
    `${JSON.stringify({
      generated_at: "2026-07-06T00:00:00Z",
      summary: {
        engines: 2,
        targets: { typesense: "ms_realty_listings", meilisearch: "ms_realty_listings" },
        documents_per_engine: [167, 167],
        total_operations: 4,
      },
      engines: [
        {
          engine: "typesense",
          collection: "ms_realty_listings",
          documents: 167,
          operations: [
            { method: "POST", url: "https://typesense.ms-realty.bg/collections", status: 201, bytes: 1 },
            { method: "POST", url: "https://typesense.ms-realty.bg/collections/ms_realty_listings/documents/import?action=upsert", status: 200, bytes: 1 },
          ],
        },
        {
          engine: "meilisearch",
          index: "ms_realty_listings",
          documents: 167,
          operations: [
            { method: "PATCH", url: "https://meili.ms-realty.bg/indexes/ms_realty_listings/settings", status: 202, bytes: 1 },
            { method: "POST", url: "https://meili.ms-realty.bg/indexes/ms_realty_listings/documents?primaryKey=meili_id", status: 202, bytes: 1 },
          ],
        },
      ],
    })}\n`,
  );
  fs.writeFileSync(
    queryReportPath,
    `${JSON.stringify({
      generated_at: "2026-07-06T00:00:00Z",
      summary: {
        engines: 2,
        targets: { typesense: "ms_realty_listings", meilisearch: "ms_realty_listings" },
        total_hits: 2,
        first_hit_ids: ["MS-CRAWL-0001:bg", "MS-CRAWL-0001:bg"],
      },
      engines: [
        {
          engine: "typesense",
          service_url: "https://typesense.ms-realty.bg",
          collection: "ms_realty_listings",
          query: "Sandanski",
          filter: "translation_indexable:=true && locale:=bg && source_listing_id:=MS-CRAWL-0001",
          operation: {
            method: "GET",
            url: "https://typesense.ms-realty.bg/collections/ms_realty_listings/documents/search?q=Sandanski&filter_by=translation_indexable%3A%3Dtrue+%26%26+locale%3A%3Dbg+%26%26+source_listing_id%3A%3DMS-CRAWL-0001",
            status: 200,
          },
          total: 1,
          hits: [{ id: "MS-CRAWL-0001:bg", locale: "bg" }],
        },
        {
          engine: "meilisearch",
          service_url: "https://meili.ms-realty.bg",
          index: "ms_realty_listings",
          query: "Sandanski",
          filter: 'translation_indexable = true AND locale = bg AND source_listing_id = "MS-CRAWL-0001"',
          operation: {
            method: "POST",
            url: "https://meili.ms-realty.bg/indexes/ms_realty_listings/search",
            status: 200,
          },
          total: 1,
          hits: [{ id: "MS-CRAWL-0001:bg", locale: "bg" }],
        },
      ],
    })}\n`,
  );
  fs.writeFileSync(
    hermesReportPath,
    `${JSON.stringify({
      generated_at: "2026-07-06T00:00:00Z",
      agent_runtime: {
        product: "Nous Hermes Agent",
        license: "MIT",
        official_url: "https://hermes-agent.nousresearch.com/",
        project_context_file: "AGENTS.md",
        required_capabilities: HERMES_AGENT_REQUIRED_CAPABILITIES,
        messaging_platforms: HERMES_AGENT_MESSAGING_PLATFORMS,
        tool_gateway: {
          required_tools: HERMES_AGENT_TOOL_GATEWAY_TOOLS,
        },
        terminal_backends: HERMES_AGENT_TERMINAL_BACKENDS,
      },
      summary: { attempted: 1, persisted: 1, rejected: 0 },
      provider: {
        mode: "self_hosted",
        model: "NousResearch/Hermes-4-14B",
        endpoint: "https://hermes.ms-realty.bg/v1/chat/completions",
        tool_call_parser: "hermes",
        sensitive_data_allowed: true,
      },
      audit_log_path: `${dir}/audit-log.jsonl`,
      audit_log_rows: 1,
      persisted: [{ status: "hermes_drafted", public_indexable: false }],
      rejected: [],
    })}\n`,
  );
  return { syncReportPath, queryReportPath, hermesReportPath };
}

async function writeLiveProvisioningFixture(dir) {
  const reportPath = `${dir}/live-service-provisioning-report.json`;
  const report = await buildLiveServiceProvisioningReport({
    env: {
      TYPESENSE_URL: "https://typesense.ms-realty.bg",
      TYPESENSE_API_KEY: "typesense-key",
      MEILI_URL: "https://meili.ms-realty.bg",
      MEILI_API_KEY: "meili-key",
      HERMES_CHAT_COMPLETIONS_URL: "https://hermes.ms-realty.bg/v1/chat/completions",
      HERMES_API_KEY: "hermes-key",
    },
    fetchImpl: healthyHermesAgentFetch,
    generatedAt: "2026-07-06T00:00:00Z",
  });
  return writeLiveServiceProvisioningReport(report, reportPath);
}

function runScript(script, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [fromRoot("production", "scripts", script)], {
      cwd: fromRoot(),
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

async function withLiveServiceServer(fn) {
  const hit = {
    id: "MS-CRAWL-0001:bg",
    source_listing_id: "MS-CRAWL-0001",
    locale: "bg",
    locale_path: "/bg/imoti/MS-CRAWL-0001",
    title: "Reviewed listing",
  };
  const draft = {
    title: "MS-CRAWL-0001 Sandanski commercial rent",
    body: "MS-CRAWL-0001 Sandanski commercial rent draft",
    seo_title: "MS-CRAWL-0001 Sandanski commercial rent",
    meta_description: "MS-CRAWL-0001 Sandanski commercial rent draft",
    citations: [{ source: "cms_seed", object_id: "MS-CRAWL-0001" }],
  };
  const server = http.createServer((request, response) => {
    request.resume();
    request.on("end", () => {
      response.setHeader("content-type", "application/json");
      if (request.url.includes("/documents/search?")) {
        response.end(JSON.stringify({ found: 1, hits: [{ document: hit }] }));
      } else if (request.url.endsWith("/search")) {
        response.end(JSON.stringify({ estimatedTotalHits: 1, hits: [hit] }));
      } else if (request.url === "/v1/chat/completions") {
        response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(draft) } }] }));
      } else {
        response.statusCode = 201;
        response.end(JSON.stringify({ ok: true }));
      }
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  try {
    await fn(`http://${address.address}:${address.port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("launch readiness stays blocked until production launch blockers are cleared", () => {
  const report = buildLaunchReadinessReport({ generatedAt: "2026-07-05T00:00:00Z" });
  assert.equal(assertLaunchReadinessReport(report), true);
  assert.equal(report.launch_ready, false);
  assert.deepEqual(report.blockers, ["redirect_reviews", "external_seo_exports", "listing_quality_review", "live_services", "payload_runtime"]);
  const redirectGate = report.gates.find((gate) => gate.id === "redirect_reviews");
  assert.equal(redirectGate.status, "blocked");
  assert.deepEqual(redirectGate.evidence, {
    total_legacy_urls: 457,
    resolved_legacy_urls: 165,
    unresolved_legacy_urls: 292,
    unresolved_by_type: { page: 104, post: 42, taxonomy: 146 },
    mapped_listings: 165,
    deployable_redirects: 165,
    homepage_targets: 0,
    duplicate_old_urls: 0,
  });
  const seoGate = report.gates.find((gate) => gate.id === "external_seo_exports");
  const listingGate = report.gates.find((gate) => gate.id === "listing_quality_review");
  const liveGate = report.gates.find((gate) => gate.id === "live_services");
  assert.equal(seoGate.evidence.crawl_urls, 457);
  assert.deepEqual(seoGate.evidence.url_types, { page: 104, post: 42, taxonomy: 146, listing: 165 });
  assert.equal(seoGate.evidence.urls_with_any_evidence, 2);
  assert.ok(seoGate.evidence.next_actions.some((action) => action.includes("seo:preflight")));
  assert.equal(listingGate.status, "blocked");
  assert.ok(listingGate.evidence.next_actions.some((action) => action.includes("listing:preflight")));
  assert.match(listingGate.next_actions.join(" "), /npm run listing:preflight/);
  assert.deepEqual(listingGate.evidence.summary, {
    expected_review_rows: 7,
    review_rows: 0,
    missing_review_rows: 7,
    facts_review_rows: 0,
    media_review_rows: 0,
  });
  assert.equal(listingGate.evidence.pending_review_sample.length, 7);
  assert.deepEqual(listingGate.evidence.pending_review_sample[0], {
    listing_id: "MS-CRAWL-0006",
    target_path: "/bg/imoti/MS-CRAWL-0006",
    editor_path: "/admin/listings/edit?listingId=MS-CRAWL-0006",
    issues: ["thin_public_gallery"],
    required_editor_fields: ["public_gallery"],
    public_gallery_assets: 1,
    public_gallery_sample: [
      "https://makler-realty.com/wp-content/uploads/2025/04/DJI_0696-680x383.jpg [alt: Дава под наем промишлена сграда в Сандански]",
    ],
  });
  assert.equal(liveGate.status, "blocked");
  assert.equal(liveGate.evidence.provisioning.status, "blocked_report");
  assert.ok(liveGate.evidence.provisioning.summary.missing_env.includes("TYPESENSE_URL"));
  assert.match(liveGate.next_actions.join(" "), /npm run live:preflight/);
  assert.equal(report.live_services.every((item) => item.status === "missing_report"), true);
  assert.match(report.gates.find((gate) => gate.id === "payload_runtime").next_actions.join(" "), /npm run payload:preflight/);
  for (const id of ["redirect_reviews", "external_seo_exports", "listing_quality_review", "live_services", "payload_runtime"]) {
    const blockedGate = report.gates.find((gate) => gate.id === id);
    assert.ok(blockedGate.next_actions.length > 0);
  }
  assert.ok(report.gates.find((gate) => gate.id === "redirect_reviews").next_actions.length > 0);
  assert.equal(report.gates.find((gate) => gate.id === "monitoring_rollback").status, "pass");
  assert.deepEqual(report.warnings.find((warning) => warning.id === "listing_quality.thin_public_gallery"), {
    id: "listing_quality.thin_public_gallery",
    count: 7,
  });
  assert.ok(report.rollback_plan.length >= 3);

  const publicPayload = publicLaunchReadinessPayload(report);
  assert.deepEqual(
    publicPayload.blocked_gates.map((gate) => gate.id),
    ["redirect_reviews", "external_seo_exports", "listing_quality_review", "live_services", "payload_runtime"],
  );
  assert.match(publicPayload.blocked_gates.find((gate) => gate.id === "live_services").message, /Typesense\/Meilisearch/);
  assert.equal("next_actions" in publicPayload.blocked_gates.find((gate) => gate.id === "live_services"), false);
  assert.deepEqual(publicLaunchReadinessHeaders(report), { "cache-control": "no-store", "retry-after": "60" });
});

test("launch readiness validator accepts ready state after required gates are cleared", () => {
  const routeMap = completeRouteMap();
  const deployableRedirects = readJson(["production", "data", "deployable-redirects.json"]);
  const seoEvidence = readySeoEvidenceFixture();

  deployableRedirects.summary.total = routeMap.summary.mappedListings;

  const report = buildLaunchReadinessReport({
    generatedAt: "2026-07-05T00:00:00Z",
    routeMap,
    deployableRedirects,
    seoEvidence,
    listingQualityReview: readyListingQualityReview,
    liveServices: readyLiveServices,
    liveServiceProvisioning: readyLiveServiceProvisioning,
    appState: readyAppState,
    payloadRuntime: readyPayloadRuntime,
  });

  assert.equal(assertLaunchReadinessReport(report), true);
  assert.equal(report.launch_ready, true);
  assert.equal(report.status, "ready");
  assert.deepEqual(report.blockers, []);
  assert.deepEqual(publicLaunchReadinessPayload(report).blocked_gates, []);
  assert.deepEqual(publicLaunchReadinessHeaders(report), { "cache-control": "no-store" });
});

test("launch readiness validator requires blocked gate next actions", () => {
  for (const nextActions of [undefined, [], [""]]) {
    const report = buildLaunchReadinessReport({ generatedAt: "2026-07-05T00:00:00Z" });
    const gate = report.gates.find((item) => item.id === "external_seo_exports");
    if (nextActions === undefined) {
      delete gate.next_actions;
    } else {
      gate.next_actions = nextActions;
    }

    assert.throws(
      () => assertLaunchReadinessReport(report),
      /Launch readiness blocked gate external_seo_exports must include next actions/,
    );
  }
});

test("launch readiness rejects hand-cleared external SEO blockers", () => {
  const routeMap = completeRouteMap();
  const deployableRedirects = readJson(["production", "data", "deployable-redirects.json"]);
  const seoEvidence = readJson(["production", "data", "seo-evidence.json"]);

  deployableRedirects.summary.total = routeMap.summary.mappedListings;
  seoEvidence.summary.missing_required_sources = [];

  assert.throws(
    () =>
      buildLaunchReadinessReport({
        generatedAt: "2026-07-05T00:00:00Z",
        routeMap,
        deployableRedirects,
        seoEvidence,
        listingQualityReview: readyListingQualityReview,
        liveServices: readyLiveServices,
        appState: readyAppState,
        payloadRuntime: readyPayloadRuntime,
      }),
    /SEO evidence missing required sources must match source evidence/,
  );
});

test("launch readiness validator rejects weak external SEO pass evidence", () => {
  const routeMap = completeRouteMap();
  const deployableRedirects = readJson(["production", "data", "deployable-redirects.json"]);
  deployableRedirects.summary.total = routeMap.summary.mappedListings;

  const report = buildLaunchReadinessReport({
    generatedAt: "2026-07-05T00:00:00Z",
    routeMap,
    deployableRedirects,
    seoEvidence: readySeoEvidenceFixture(),
    listingQualityReview: readyListingQualityReview,
    liveServices: readyLiveServices,
    liveServiceProvisioning: readyLiveServiceProvisioning,
    appState: readyAppState,
    payloadRuntime: readyPayloadRuntime,
  });
  const seoGate = report.gates.find((gate) => gate.id === "external_seo_exports");
  seoGate.evidence.sources.search_console.signal_rows = 0;
  seoGate.evidence.sources.search_console.signal_source_domains = [];

  assert.throws(() => assertLaunchReadinessReport(report), /complete search_console evidence/);
  seoGate.evidence.sources.search_console.signal_rows = 1;
  seoGate.evidence.sources.search_console.row_count = 99;
  assert.throws(() => assertLaunchReadinessReport(report), /row counts/);
});

test("launch readiness validator rejects weak crawl inventory pass evidence", () => {
  const report = buildLaunchReadinessReport({ generatedAt: "2026-07-05T00:00:00Z" });
  const crawlGate = report.gates.find((gate) => gate.id === "crawl_inventory");
  crawlGate.evidence.total = 456;

  assert.throws(() => assertLaunchReadinessReport(report), /exact source URL evidence/);
});

test("launch readiness validator rejects weak redirect review pass evidence", () => {
  const routeMap = completeRouteMap();
  const deployableRedirects = readJson(["production", "data", "deployable-redirects.json"]);
  deployableRedirects.summary.total = routeMap.summary.mappedListings;
  for (const patch of [{ deployable_redirects: 0 }, { homepage_targets: 1 }, { duplicate_old_urls: 1 }]) {
    const report = buildLaunchReadinessReport({ generatedAt: "2026-07-05T00:00:00Z", routeMap, deployableRedirects });
    const redirectGate = report.gates.find((gate) => gate.id === "redirect_reviews");
    Object.assign(redirectGate.evidence, patch);

    assert.throws(() => assertLaunchReadinessReport(report), /terminal route decision/);
  }
});

test("launch readiness validator rejects weak sitemap pass evidence", () => {
  const report = buildLaunchReadinessReport({ generatedAt: "2026-07-05T00:00:00Z" });
  const sitemapGate = report.gates.find((gate) => gate.id === "localized_sitemap");
  sitemapGate.evidence.listing_entries = 166;

  assert.throws(() => assertLaunchReadinessReport(report), /complete approved route evidence/);
});

test("launch readiness validator rejects weak structured data pass evidence", () => {
  const report = buildLaunchReadinessReport({ generatedAt: "2026-07-05T00:00:00Z" });
  const structuredDataGate = report.gates.find((gate) => gate.id === "structured_data");
  structuredDataGate.evidence.failing_entries = 1;

  assert.throws(() => assertLaunchReadinessReport(report), /zero failing entries/);
});

test("launch readiness validator requires every production gate", () => {
  const report = buildLaunchReadinessReport({ generatedAt: "2026-07-05T00:00:00Z" });

  assert.throws(
    () => assertLaunchReadinessReport({ ...report, gates: report.gates.filter((gate) => gate.id !== "payload_runtime") }),
    /missing required gate payload_runtime/,
  );
  assert.throws(
    () => assertLaunchReadinessReport({ ...report, gates: report.gates.filter((gate) => gate.id !== "live_services") }),
    /missing required gate live_services/,
  );
});

test("launch readiness validator rejects weak runtime smoke pass evidence", () => {
  const routeMap = completeRouteMap();
  const deployableRedirects = readJson(["production", "data", "deployable-redirects.json"]);
  deployableRedirects.summary.total = routeMap.summary.mappedListings;

  const report = buildLaunchReadinessReport({
    generatedAt: "2026-07-05T00:00:00Z",
    routeMap,
    deployableRedirects,
    seoEvidence: readySeoEvidenceFixture(),
    listingQualityReview: readyListingQualityReview,
    liveServices: readyLiveServices,
    liveServiceProvisioning: readyLiveServiceProvisioning,
    appState: readyAppState,
    payloadRuntime: readyPayloadRuntime,
  });
  const smokeGate = report.gates.find((gate) => gate.id === "runtime_smoke");
  smokeGate.evidence.node_server_port_observed = false;

  assert.throws(() => assertLaunchReadinessReport(report), /runtime smoke requires HTTP and Node listing evidence/);
});

test("launch readiness validator rejects weak runtime pass evidence", () => {
  const routeMap = completeRouteMap();
  const deployableRedirects = readJson(["production", "data", "deployable-redirects.json"]);
  const seoEvidence = readySeoEvidenceFixture();
  deployableRedirects.summary.total = routeMap.summary.mappedListings;

  const weakPayload = buildLaunchReadinessReport({
    generatedAt: "2026-07-05T00:00:00Z",
    routeMap,
    deployableRedirects,
    seoEvidence,
    listingQualityReview: readyListingQualityReview,
    liveServices: readyLiveServices,
    liveServiceProvisioning: readyLiveServiceProvisioning,
    appState: readyAppState,
    payloadRuntime: { ...readyPayloadRuntime, summary: { ...readyPayloadRuntime.summary, database: { status: "pass" } } },
  });
  const weakLiveServices = buildLaunchReadinessReport({
    generatedAt: "2026-07-05T00:00:00Z",
    routeMap,
    deployableRedirects,
    seoEvidence,
    listingQualityReview: readyListingQualityReview,
    liveServices: readyLiveServices.map((item) =>
      item.source === "hermes_draft_worker" ? { ...item, path: "production/data/hermes-draft-worker-report.json.example" } : item,
    ),
    liveServiceProvisioning: readyLiveServiceProvisioning,
    appState: readyAppState,
    payloadRuntime: readyPayloadRuntime,
  });
  const weakPayloadCredentials = buildLaunchReadinessReport({
    generatedAt: "2026-07-05T00:00:00Z",
    routeMap,
    deployableRedirects,
    seoEvidence,
    listingQualityReview: readyListingQualityReview,
    liveServices: readyLiveServices,
    liveServiceProvisioning: readyLiveServiceProvisioning,
    appState: readyAppState,
    payloadRuntime: {
      ...readyPayloadRuntime,
      checks: readyPayloadRuntime.checks.map((check) =>
        check.id === "database_tcp" ? { ...check, credentials_configured: false } : check,
      ),
    },
  });
  const weakPayloadTcpTarget = buildLaunchReadinessReport({
    generatedAt: "2026-07-05T00:00:00Z",
    routeMap,
    deployableRedirects,
    seoEvidence,
    listingQualityReview: readyListingQualityReview,
    liveServices: readyLiveServices,
    liveServiceProvisioning: readyLiveServiceProvisioning,
    appState: readyAppState,
    payloadRuntime: {
      ...readyPayloadRuntime,
      checks: readyPayloadRuntime.checks.map((check) =>
        check.id === "database_tcp" ? { ...check, host: "other-db.ms-realty.bg", port: "5432" } : check,
      ),
    },
  });
  const weakPayloadPlaceholderHost = buildLaunchReadinessReport({
    generatedAt: "2026-07-05T00:00:00Z",
    routeMap,
    deployableRedirects,
    seoEvidence,
    listingQualityReview: readyListingQualityReview,
    liveServices: readyLiveServices,
    liveServiceProvisioning: readyLiveServiceProvisioning,
    appState: readyAppState,
    payloadRuntime: {
      ...readyPayloadRuntime,
      summary: {
        ...readyPayloadRuntime.summary,
        database: { ...readyPayloadRuntime.summary.database, host: "127.0.0.1" },
      },
      checks: readyPayloadRuntime.checks.map((check) =>
        check.id === "database_tcp" ? { ...check, host: "127.0.0.1" } : check,
      ),
    },
  });

  assert.throws(() => assertLaunchReadinessReport(weakPayload), /Payload runtime requires database TCP target evidence/i);
  assert.throws(() => assertLaunchReadinessReport(weakPayloadCredentials), /Payload runtime requires database TCP target evidence/i);
  assert.throws(() => assertLaunchReadinessReport(weakPayloadTcpTarget), /Payload runtime requires database TCP target evidence/i);
  assert.throws(() => assertLaunchReadinessReport(weakPayloadPlaceholderHost), /localhost or placeholder/);
  assert.throws(() => assertLaunchReadinessReport(weakLiveServices), /non-example reports/);
});

test("launch readiness validator rejects weak payload runtime pass evidence", () => {
  const routeMap = completeRouteMap();
  const deployableRedirects = readJson(["production", "data", "deployable-redirects.json"]);
  const seoEvidence = readySeoEvidenceFixture();
  deployableRedirects.summary.total = routeMap.summary.mappedListings;

  const report = buildLaunchReadinessReport({
    generatedAt: "2026-07-05T00:00:00Z",
    routeMap,
    deployableRedirects,
    seoEvidence,
    listingQualityReview: readyListingQualityReview,
    liveServices: readyLiveServices,
    liveServiceProvisioning: readyLiveServiceProvisioning,
    appState: readyAppState,
    payloadRuntime: {
      ...readyPayloadRuntime,
      summary: { ...readyPayloadRuntime.summary, checks: readyPayloadRuntime.summary.checks - 1 },
      checks: readyPayloadRuntime.checks.filter((check) => check.id !== "payload_config_import"),
    },
  });

  assert.throws(() => assertLaunchReadinessReport(report), /payload runtime requires check payload_config_import/);
});

test("launch readiness validator rejects weak live service pass summaries", () => {
  const routeMap = completeRouteMap();
  const deployableRedirects = readJson(["production", "data", "deployable-redirects.json"]);
  deployableRedirects.summary.total = routeMap.summary.mappedListings;

  const report = buildLaunchReadinessReport({
    generatedAt: "2026-07-05T00:00:00Z",
    routeMap,
    deployableRedirects,
    seoEvidence: readySeoEvidenceFixture(),
    listingQualityReview: readyListingQualityReview,
    liveServices: readyLiveServices.map((item) =>
      item.source === "typesense_meilisearch_sync" ? { ...item, summary: { ...item.summary, total_operations: 0 } } : item,
    ),
    liveServiceProvisioning: readyLiveServiceProvisioning,
    appState: readyAppState,
    payloadRuntime: readyPayloadRuntime,
  });

  assert.throws(() => assertLaunchReadinessReport(report), /search sync summary evidence/);
});

test("launch readiness validator rejects weak live service operation evidence", () => {
  const routeMap = completeRouteMap();
  const deployableRedirects = readJson(["production", "data", "deployable-redirects.json"]);
  const seoEvidence = readySeoEvidenceFixture();
  deployableRedirects.summary.total = routeMap.summary.mappedListings;

  const withoutQueryOperation = buildLaunchReadinessReport({
    generatedAt: "2026-07-05T00:00:00Z",
    routeMap,
    deployableRedirects,
    seoEvidence,
    listingQualityReview: readyListingQualityReview,
    liveServices: readyLiveServices.map((item) =>
      item.source === "typesense_meilisearch_query" ? { ...item, evidence: { engines: [] } } : item,
    ),
    liveServiceProvisioning: readyLiveServiceProvisioning,
    appState: readyAppState,
    payloadRuntime: readyPayloadRuntime,
  });
  const weakHermesProvider = buildLaunchReadinessReport({
    generatedAt: "2026-07-05T00:00:00Z",
    routeMap,
    deployableRedirects,
    seoEvidence,
    listingQualityReview: readyListingQualityReview,
    liveServices: readyLiveServices.map((item) =>
      item.source === "hermes_draft_worker"
        ? { ...item, evidence: { provider: { ...item.evidence.provider, mode: "openrouter", sensitive_data_allowed: false } } }
        : item,
    ),
    liveServiceProvisioning: readyLiveServiceProvisioning,
    appState: readyAppState,
    payloadRuntime: readyPayloadRuntime,
  });
  const weakHermesAudit = buildLaunchReadinessReport({
    generatedAt: "2026-07-05T00:00:00Z",
    routeMap,
    deployableRedirects,
    seoEvidence,
    listingQualityReview: readyListingQualityReview,
    liveServices: readyLiveServices.map((item) =>
      item.source === "hermes_draft_worker" ? { ...item, evidence: { ...item.evidence, audit_log_rows: 0 } } : item,
    ),
    liveServiceProvisioning: readyLiveServiceProvisioning,
    appState: readyAppState,
    payloadRuntime: readyPayloadRuntime,
  });
  const weakSyncOperation = buildLaunchReadinessReport({
    generatedAt: "2026-07-05T00:00:00Z",
    routeMap,
    deployableRedirects,
    seoEvidence,
    listingQualityReview: readyListingQualityReview,
    liveServices: readyLiveServices.map((item) =>
      item.source === "typesense_meilisearch_sync"
        ? {
            ...item,
            evidence: {
              engines: item.evidence.engines.map((engine) =>
                engine.engine === "typesense"
                  ? { ...engine, operations: engine.operations.map((operation) => ({ ...operation, bytes: 0 })) }
                  : engine,
              ),
            },
          }
        : item,
    ),
    liveServiceProvisioning: readyLiveServiceProvisioning,
    appState: readyAppState,
    payloadRuntime: readyPayloadRuntime,
  });
  const wrongSyncPath = buildLaunchReadinessReport({
    generatedAt: "2026-07-05T00:00:00Z",
    routeMap,
    deployableRedirects,
    seoEvidence,
    listingQualityReview: readyListingQualityReview,
    liveServices: readyLiveServices.map((item) =>
      item.source === "typesense_meilisearch_sync"
        ? {
            ...item,
            evidence: {
              engines: item.evidence.engines.map((engine) =>
                engine.engine === "meilisearch"
                  ? {
                      ...engine,
                      operations: engine.operations.map((operation) =>
                        operation.method === "PATCH" ? { ...operation, url: "https://meili.ms-realty.bg/indexes/wrong/settings" } : operation,
                      ),
                    }
                  : engine,
              ),
            },
          }
        : item,
    ),
    liveServiceProvisioning: readyLiveServiceProvisioning,
    appState: readyAppState,
    payloadRuntime: readyPayloadRuntime,
  });

  assert.throws(() => assertLaunchReadinessReport(withoutQueryOperation), /search query operation evidence/);
  assert.throws(() => assertLaunchReadinessReport(weakHermesProvider), /self-hosted Hermes provider evidence/);
  assert.throws(() => assertLaunchReadinessReport(weakHermesAudit), /Hermes audit coverage evidence/);
  assert.throws(() => assertLaunchReadinessReport(weakSyncOperation), /search sync operation evidence/);
  assert.throws(() => assertLaunchReadinessReport(wrongSyncPath), /search sync operation evidence/);
});

test("launch readiness validator rejects weak live provisioning pass evidence", () => {
  const routeMap = completeRouteMap();
  const deployableRedirects = readJson(["production", "data", "deployable-redirects.json"]);
  deployableRedirects.summary.total = routeMap.summary.mappedListings;

  const report = buildLaunchReadinessReport({
    generatedAt: "2026-07-05T00:00:00Z",
    routeMap,
    deployableRedirects,
    seoEvidence: readySeoEvidenceFixture(),
    listingQualityReview: readyListingQualityReview,
    liveServices: readyLiveServices,
    liveServiceProvisioning: {
      ...readyLiveServiceProvisioning,
      summary: { ...readyLiveServiceProvisioning.summary, checks: readyLiveServiceProvisioning.summary.checks - 1 },
      checks: readyLiveServiceProvisioning.checks.filter((check) => check.id !== "meilisearch_health"),
    },
    appState: readyAppState,
    payloadRuntime: readyPayloadRuntime,
  });

  assert.throws(() => assertLaunchReadinessReport(report), /provisioning check meilisearch_health/);
});

test("launch readiness blocks live services until provisioning passes", () => {
  const routeMap = completeRouteMap();
  const deployableRedirects = readJson(["production", "data", "deployable-redirects.json"]);
  deployableRedirects.summary.total = routeMap.summary.mappedListings;

  const report = buildLaunchReadinessReport({
    generatedAt: "2026-07-05T00:00:00Z",
    routeMap,
    deployableRedirects,
    seoEvidence: readySeoEvidenceFixture(),
    listingQualityReview: readyListingQualityReview,
    liveServices: readyLiveServices,
    liveServiceProvisioning: {
      status: "blocked_report",
      path: "production/data/live-service-provisioning-report.json",
      summary: { checks: 7, missing_env: ["TYPESENSE_URL"], placeholder_env: [], services: ["typesense", "meilisearch", "hermes"] },
      checks: [{ id: "typesense_health", status: "missing_env" }],
      next_actions: ["Run npm run live:provisioning until all service checks pass."],
    },
    appState: readyAppState,
    payloadRuntime: readyPayloadRuntime,
  });

  const liveGate = report.gates.find((gate) => gate.id === "live_services");
  assert.equal(assertLaunchReadinessReport(report), true);
  assert.equal(liveGate.status, "blocked");
  assert.deepEqual(report.blockers, ["live_services"]);
});

test("launch readiness validator rejects weak production app layer pass evidence", () => {
  const report = buildLaunchReadinessReport({ generatedAt: "2026-07-05T00:00:00Z" });
  const appGate = report.gates.find((gate) => gate.id === "production_app_layer");
  appGate.evidence.start_script = "next start";

  assert.throws(() => assertLaunchReadinessReport(report), /Node adapter evidence/);
});

test("launch readiness validator rejects weak monitoring rollback pass evidence", () => {
  const report = buildLaunchReadinessReport({ generatedAt: "2026-07-05T00:00:00Z" });
  const monitoringGate = report.gates.find((gate) => gate.id === "monitoring_rollback");
  monitoringGate.evidence.privacy_events_status = "missing";

  assert.throws(() => assertLaunchReadinessReport(report), /privacy monitoring and rollback evidence/);
});

test("launch readiness validator rejects weak listing quality pass evidence", () => {
  const routeMap = completeRouteMap();
  const deployableRedirects = readJson(["production", "data", "deployable-redirects.json"]);
  deployableRedirects.summary.total = routeMap.summary.mappedListings;

  const report = buildLaunchReadinessReport({
    generatedAt: "2026-07-05T00:00:00Z",
    routeMap,
    deployableRedirects,
    seoEvidence: readySeoEvidenceFixture(),
    listingQualityReview: {
      ...readyListingQualityReview,
      summary: { ...readyListingQualityReview.summary, review_rows: 6, missing_review_rows: 1 },
    },
    liveServices: readyLiveServices,
    liveServiceProvisioning: readyLiveServiceProvisioning,
    appState: readyAppState,
    payloadRuntime: readyPayloadRuntime,
  });

  const listingGate = report.gates.find((gate) => gate.id === "listing_quality_review");
  assert.equal(listingGate.status, "blocked");
  listingGate.status = "pass";
  report.blockers = [];
  report.launch_ready = true;
  report.status = "ready";
  assert.throws(() => assertLaunchReadinessReport(report), /complete non-example review evidence/);
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
  const routeMap = completeRouteMap();
  const deployableRedirects = readJson(["production", "data", "deployable-redirects.json"]);
  const seoEvidence = readySeoEvidenceFixture();

  deployableRedirects.summary.total = routeMap.summary.mappedListings;
  seoEvidence.summary.sources.analytics_export.status = "imported";
  seoEvidence.summary.sources.privacy_events.status = "";

  const report = buildLaunchReadinessReport({
    generatedAt: "2026-07-05T00:00:00Z",
    routeMap,
    deployableRedirects,
    seoEvidence,
    listingQualityReview: readyListingQualityReview,
    liveServices: readyLiveServices,
    liveServiceProvisioning: readyLiveServiceProvisioning,
    appState: readyAppState,
    payloadRuntime: readyPayloadRuntime,
  });

  assert.equal(report.gates.find((gate) => gate.id === "monitoring_rollback").status, "blocked");
  assert.equal(report.gates.find((gate) => gate.id === "external_seo_exports").status, "pass");
  assert.equal(assertLaunchReadinessReport(report), true);
  assert.deepEqual(report.blockers, ["monitoring_rollback"]);
});

test("launch readiness blocks broad or duplicate deployable redirect exports", () => {
  const routeMap = completeRouteMap();
  const deployableRedirects = readJson(["production", "data", "deployable-redirects.json"]);
  const seoEvidence = readySeoEvidenceFixture();

  deployableRedirects.summary.total = routeMap.summary.mappedListings;
  deployableRedirects.summary.homepageTargets = 1;
  deployableRedirects.summary.duplicateOldUrls = 0;

  const homepageReport = buildLaunchReadinessReport({
    generatedAt: "2026-07-05T00:00:00Z",
    routeMap,
    deployableRedirects,
    seoEvidence,
    listingQualityReview: readyListingQualityReview,
    liveServices: readyLiveServices,
    liveServiceProvisioning: readyLiveServiceProvisioning,
    appState: readyAppState,
    payloadRuntime: readyPayloadRuntime,
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
    liveServiceProvisioning: readyLiveServiceProvisioning,
    appState: readyAppState,
    payloadRuntime: readyPayloadRuntime,
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

test("launch readiness build honors output path override", () => {
  const outputPath = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-launch-readiness-output-`)}/launch-readiness.json`;
  const result = spawnSync(process.execPath, [fromRoot("production", "scripts", "build-launch-readiness.mjs")], {
    cwd: fromRoot(),
    encoding: "utf8",
    env: { ...process.env, MS_REALTY_LAUNCH_READINESS_OUTPUT_PATH: outputPath },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes(`Wrote launch readiness report to ${outputPath}`));
  const report = JSON.parse(fs.readFileSync(outputPath, "utf8"));
  assert.equal(assertLaunchReadinessReport(report), true);
  assert.deepEqual(report.blockers, ["redirect_reviews", "external_seo_exports", "listing_quality_review", "live_services", "payload_runtime"]);
});

test("local readiness materializer promotes only fresh local Payload proof and preserves external blockers", async () => {
  const directory = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-local-readiness-`);
  const sourcePath = fromRoot("production", "data", "launch-readiness.json");
  const source = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
  const generatedAt = "2026-07-10T12:00:00.000Z";
  const syncPath = `${directory}/search-engine-sync-report.json`;
  const queryPath = `${directory}/search-engine-query-report.json`;
  const payloadPath = `${directory}/payload-runtime-report.json`;
  const outputPath = `${directory}/local-launch-readiness.json`;
  const sync = readJson(["production", "data", "search-engine-sync-report.json.example"]);
  const query = readJson(["production", "data", "search-engine-query-report.json.example"]);
  delete sync.example;
  delete query.example;
  sync.generated_at = "2026-07-10T11:59:00.000Z";
  query.generated_at = "2026-07-10T11:59:30.000Z";
  writeJson(syncPath, sync);
  writeJson(queryPath, query);
  const payload = await localPayloadRuntimeReport("2026-07-10T11:59:45.000Z");
  writeJson(payloadPath, payload);

  const result = materializeLocalLaunchReadiness({
    sourceReadinessPath: sourcePath,
    outPath: outputPath,
    syncReportPath: syncPath,
    queryReportPath: queryPath,
    hermesReportPath: `${directory}/hermes-draft-worker-report.json`,
    payloadRuntimeReportPath: payloadPath,
    generatedAt,
    maxReportAgeMs: 15 * 60 * 1000,
  });

  assert.equal(result.outPath, outputPath);
  assert.equal(assertLaunchReadinessReport(result.report), true);
  assert.equal(result.report.launch_ready, false);
  assert.deepEqual(result.report.blockers, ["redirect_reviews", "external_seo_exports", "listing_quality_review", "live_services", "local_preview_only"]);
  assert.equal(result.report.gates.find((gate) => gate.id === "payload_runtime").status, "pass");
  assert.equal(result.report.gates.find((gate) => gate.id === "local_preview_only").status, "blocked");
  assert.deepEqual(
    result.report.local_preview.reports.map((report) => [report.id, report.status]),
    [
      ["typesense_meilisearch_sync", "pass"],
      ["typesense_meilisearch_query", "pass"],
      ["hermes_draft_worker", "missing_report"],
      ["payload_runtime", "pass"],
    ],
  );
  for (const sourceGate of source.gates.filter((gate) => gate.id !== "payload_runtime")) {
    assert.deepEqual(result.report.gates.find((gate) => gate.id === sourceGate.id), sourceGate);
  }
  assert.deepEqual(JSON.parse(fs.readFileSync(outputPath, "utf8")), result.report);

  payload.generated_at = "2026-07-10T11:40:00.000Z";
  writeJson(payloadPath, payload);
  const stale = materializeLocalLaunchReadiness({
    sourceReadinessPath: sourcePath,
    outPath: `${directory}/stale-local-launch-readiness.json`,
    syncReportPath: syncPath,
    queryReportPath: queryPath,
    hermesReportPath: `${directory}/hermes-draft-worker-report.json`,
    payloadRuntimeReportPath: payloadPath,
    generatedAt,
    maxReportAgeMs: 15 * 60 * 1000,
  });
  assert.equal(stale.report.gates.find((gate) => gate.id === "payload_runtime").status, "blocked");
  assert.equal(stale.report.local_preview.reports.find((report) => report.id === "payload_runtime").status, "stale_report");
  assert.equal(stale.report.launch_ready, false);
});

test("launch preflight fails closed while launch blockers remain", async () => {
  const result = spawnSync(process.execPath, [fromRoot("production", "scripts", "launch-preflight.mjs")], {
    cwd: fromRoot(),
    encoding: "utf8",
    env: { ...process.env, MS_REALTY_LISTING_QUALITY_REVIEW_PATH: "" },
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /LAUNCH BLOCKED: redirect_reviews, external_seo_exports, listing_quality_review, live_services, payload_runtime/);
  assert.match(result.stderr, /external_seo_exports missing: search_console, yandex_webmaster, backlinks/);
  assert.match(result.stderr, /listing_quality_review: missing_review .*migration\/reviews\/listing-quality\.csv/);
  assert.match(result.stderr, /typesense_meilisearch_sync: missing_report .*search-engine-sync-report\.json/);
  assert.match(result.stderr, /hermes_draft_worker: missing_report .*hermes-draft-worker-report\.json/);
  assert.match(result.stderr, /payload_runtime: blocked_report .*payload-runtime-report\.json.*missing PAYLOAD_SECRET, DATABASE_URL/);
  assert.match(result.stderr, /external_seo_exports next: Import Search Console/);
  assert.match(result.stderr, /listing_quality_review next: Download \/api\/admin\/listing-quality-review-packet/);
  assert.match(result.stderr, /live_services next: Run npm run live:provisioning:preflight/);
  assert.match(result.stderr, /payload_runtime next: Use \/api\/admin\/payload-runtime-bootstrap/);
  assert.match(result.stderr, /production\/data\/launch-input-checklist\.md/);
  assert.match(result.stderr, /npm run launch:inputs/);

  const partialReviewPath = writePartialListingQualityReviewFixture(
    fs.mkdtempSync(`${os.tmpdir()}/ms-realty-launch-partial-listing-review-`),
  );
  const withPartialReviewPath = spawnSync(process.execPath, [fromRoot("production", "scripts", "launch-preflight.mjs")], {
    cwd: fromRoot(),
    encoding: "utf8",
    env: { ...process.env, MS_REALTY_LISTING_QUALITY_REVIEW_PATH: partialReviewPath },
  });

  assert.notEqual(withPartialReviewPath.status, 0);
  assert.match(withPartialReviewPath.stderr, /listing_quality_review: invalid_review/);
  assert.match(withPartialReviewPath.stderr, /incomplete/);

  const dir = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-launch-listing-review-`);
  const reviewPath = writeListingQualityReviewFixture(dir);
  const withReviewPath = spawnSync(process.execPath, [fromRoot("production", "scripts", "launch-preflight.mjs")], {
    cwd: fromRoot(),
    encoding: "utf8",
    env: { ...process.env, MS_REALTY_LISTING_QUALITY_REVIEW_PATH: reviewPath },
  });

  assert.notEqual(withReviewPath.status, 0);
  assert.match(withReviewPath.stderr, /LAUNCH BLOCKED: redirect_reviews, external_seo_exports, live_services, payload_runtime/);
  assert.doesNotMatch(withReviewPath.stderr, /listing_quality_review/);
  assert.doesNotMatch(withReviewPath.stderr, /listing_quality_review next:/);

  const seoDir = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-launch-seo-evidence-`);
  writeCompleteSeoInputFixture(seoDir);
  const liveDir = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-launch-live-reports-`);
  const livePaths = writeLiveReportFixtures(liveDir);
  const liveProvisioningPath = await writeLiveProvisioningFixture(liveDir);
  const ready = spawnSync(process.execPath, [fromRoot("production", "scripts", "launch-preflight.mjs")], {
    cwd: fromRoot(),
    encoding: "utf8",
    env: {
      ...process.env,
      MS_REALTY_LISTING_QUALITY_REVIEW_PATH: reviewPath,
      MS_REALTY_SEO_EVIDENCE_INPUT_DIR: seoDir,
      MS_REALTY_SEARCH_SYNC_REPORT_PATH: livePaths.syncReportPath,
      MS_REALTY_SEARCH_QUERY_REPORT_PATH: livePaths.queryReportPath,
      MS_REALTY_HERMES_WORKER_REPORT_PATH: livePaths.hermesReportPath,
      MS_REALTY_LIVE_SERVICE_PROVISIONING_REPORT_PATH: liveProvisioningPath,
    },
  });

  assert.notEqual(ready.status, 0);
  assert.match(ready.stderr, /LAUNCH BLOCKED: redirect_reviews, payload_runtime/);

  const seoOutputPath = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-launch-seo-output-`)}/seo-evidence.json`;
  const seoBuild = spawnSync(process.execPath, [fromRoot("production", "scripts", "build-seo-evidence.mjs")], {
    cwd: fromRoot(),
    encoding: "utf8",
    env: {
      ...process.env,
      MS_REALTY_SEO_EVIDENCE_INPUT_DIR: seoDir,
      MS_REALTY_SEO_EVIDENCE_OUTPUT_PATH: seoOutputPath,
    },
  });
  assert.equal(seoBuild.status, 0, seoBuild.stderr);

  const readyFromSeoOutput = spawnSync(process.execPath, [fromRoot("production", "scripts", "launch-preflight.mjs")], {
    cwd: fromRoot(),
    encoding: "utf8",
    env: {
      ...process.env,
      MS_REALTY_LISTING_QUALITY_REVIEW_PATH: reviewPath,
      MS_REALTY_SEO_EVIDENCE_OUTPUT_PATH: seoOutputPath,
      MS_REALTY_SEARCH_SYNC_REPORT_PATH: livePaths.syncReportPath,
      MS_REALTY_SEARCH_QUERY_REPORT_PATH: livePaths.queryReportPath,
      MS_REALTY_HERMES_WORKER_REPORT_PATH: livePaths.hermesReportPath,
      MS_REALTY_LIVE_SERVICE_PROVISIONING_REPORT_PATH: liveProvisioningPath,
    },
  });
  assert.notEqual(readyFromSeoOutput.status, 0);
  assert.match(readyFromSeoOutput.stderr, /LAUNCH BLOCKED: redirect_reviews, payload_runtime/);
});

test("launch preflight and input checklist honor env-mounted redirect and evidence paths", async () => {
  const emptyRedirectsPath = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-empty-redirects-`)}/deployable-redirects.json`;
  fs.writeFileSync(
    emptyRedirectsPath,
    `${JSON.stringify({ summary: { total: 0, homepageTargets: 0, duplicateOldUrls: 0 }, redirects: [] })}\n`,
  );
  const blocked = spawnSync(process.execPath, [fromRoot("production", "scripts", "launch-preflight.mjs")], {
    cwd: fromRoot(),
    encoding: "utf8",
    env: { ...process.env, MS_REALTY_DEPLOYABLE_REDIRECTS_OUTPUT_PATH: emptyRedirectsPath },
  });

  assert.notEqual(blocked.status, 0);
  assert.match(blocked.stderr, /LAUNCH BLOCKED: redirect_reviews/);
  assert.match(blocked.stderr, /redirect_reviews next: Review every unresolved legacy URL in \/admin\/migration\/review/);

  const reviewPath = writeListingQualityReviewFixture(fs.mkdtempSync(`${os.tmpdir()}/ms-realty-launch-input-review-`));
  const seoDir = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-launch-input-seo-`);
  writeCompleteSeoInputFixture(seoDir);
  const liveDir = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-launch-input-live-`);
  const livePaths = writeLiveReportFixtures(liveDir);
  const liveProvisioningPath = await writeLiveProvisioningFixture(liveDir);
  const checklistPath = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-launch-input-checklist-`)}/launch-inputs.md`;
  const ready = spawnSync(process.execPath, [fromRoot("production", "scripts", "build-launch-input-checklist.mjs")], {
    cwd: fromRoot(),
    encoding: "utf8",
    env: {
      ...process.env,
      MS_REALTY_LISTING_QUALITY_REVIEW_PATH: reviewPath,
      MS_REALTY_SEO_EVIDENCE_INPUT_DIR: seoDir,
      MS_REALTY_SEARCH_SYNC_REPORT_PATH: livePaths.syncReportPath,
      MS_REALTY_SEARCH_QUERY_REPORT_PATH: livePaths.queryReportPath,
      MS_REALTY_HERMES_WORKER_REPORT_PATH: livePaths.hermesReportPath,
      MS_REALTY_LIVE_SERVICE_PROVISIONING_REPORT_PATH: liveProvisioningPath,
      MS_REALTY_LAUNCH_INPUT_CHECKLIST_OUTPUT_PATH: checklistPath,
    },
  });
  const markdown = fs.readFileSync(checklistPath, "utf8");

  assert.equal(ready.status, 0, ready.stderr);
  assert.match(markdown, /Status: blocked/);
  assert.match(markdown, /Blockers: redirect_reviews, payload_runtime/);
  assert.match(markdown, /MS_REALTY_LAUNCH_INPUT_CHECKLIST_OUTPUT_PATH/);
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
  assert.match(missing.stderr, /Next: run `npm run live:provisioning:preflight`/);

  const validDir = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-valid-live-reports-`);
  const paths = writeLiveReportFixtures(validDir);
  const result = validateLiveServiceReports(paths);
  assert.equal(result.ready, true);
  assert.equal(result.reports.every((report) => report.status === "pass"), true);

  const readyReport = buildLiveServicePreflightReport({ generatedAt: "2026-07-06T00:00:00Z", ...paths });
  assert.equal(assertLiveServicePreflightReport(readyReport), true);
  assert.ok(
    readyReport.next_actions.some((action) => action.includes("live:preflight") && action.includes("launch:preflight")),
  );
  assert.throws(
    () =>
      assertLiveServicePreflightReport({
        ...readyReport,
        next_actions: ["Run npm run launch:preflight with the same mounted live report paths."],
      }),
    /live:preflight before launch:preflight/,
  );
  const duplicateSourceReport = {
    ...readyReport,
    reports: readyReport.reports.map((report, index) =>
      index === 2 ? { ...report, source: "typesense_meilisearch_query" } : report,
    ),
  };
  assert.throws(() => assertLiveServicePreflightReport(duplicateSourceReport), /sources must be unique/);
  assert.throws(
    () =>
      assertLiveServicePreflightReport({
        ...readyReport,
        reports: readyReport.reports.map((report, index) =>
          index === 2 ? { ...report, source: "unknown_live_service" } : report,
        ),
      }),
    /missing hermes_draft_worker evidence/,
  );
  readyReport.reports.find((report) => report.source === "typesense_meilisearch_sync").summary.total_operations = 0;
  assert.throws(() => assertLiveServicePreflightReport(readyReport), /search sync summary evidence/);

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

  const localDir = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-local-live-reports-`);
  const localPaths = writeLiveReportFixtures(localDir);
  const localSync = JSON.parse(fs.readFileSync(localPaths.syncReportPath, "utf8"));
  localSync.engines[0].operations[0].url = "http://127.0.0.1:8108/collections";
  fs.writeFileSync(localPaths.syncReportPath, `${JSON.stringify(localSync)}\n`);
  const localResult = validateLiveServiceReports(localPaths);
  assert.equal(localResult.ready, false);
  assert.equal(localResult.reports.find((report) => report.source === "typesense_meilisearch_sync").status, "invalid_report");
  assert.match(
    localResult.reports.find((report) => report.source === "typesense_meilisearch_sync").error,
    /localhost or placeholder/,
  );

  const mixedOriginDir = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-mixed-origin-live-reports-`);
  const mixedOriginPaths = writeLiveReportFixtures(mixedOriginDir);
  const mixedOriginSync = JSON.parse(fs.readFileSync(mixedOriginPaths.syncReportPath, "utf8"));
  mixedOriginSync.engines[0].operations[1].url =
    "https://staging-typesense.ms-realty.bg/collections/ms_realty_listings/documents/import?action=upsert";
  fs.writeFileSync(mixedOriginPaths.syncReportPath, `${JSON.stringify(mixedOriginSync)}\n`);
  const mixedOriginResult = validateLiveServiceReports(mixedOriginPaths);
  assert.equal(mixedOriginResult.ready, false);
  assert.equal(mixedOriginResult.reports.find((report) => report.source === "typesense_meilisearch_sync").status, "invalid_report");
  assert.match(
    mixedOriginResult.reports.find((report) => report.source === "typesense_meilisearch_sync").error,
    /one service origin/,
  );

  const mixedQueryOriginDir = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-mixed-query-origin-live-reports-`);
  const mixedQueryOriginPaths = writeLiveReportFixtures(mixedQueryOriginDir);
  const mixedQueryOrigin = JSON.parse(fs.readFileSync(mixedQueryOriginPaths.queryReportPath, "utf8"));
  mixedQueryOrigin.engines[0].operation.url =
    "https://staging-typesense.ms-realty.bg/collections/ms_realty_listings/documents/search?q=Sandanski&filter_by=translation_indexable%3A%3Dtrue+%26%26+locale%3A%3Dbg+%26%26+source_listing_id%3A%3DMS-CRAWL-0001";
  fs.writeFileSync(mixedQueryOriginPaths.queryReportPath, `${JSON.stringify(mixedQueryOrigin)}\n`);
  const mixedQueryOriginResult = validateLiveServiceReports(mixedQueryOriginPaths);
  assert.equal(mixedQueryOriginResult.ready, false);
  assert.equal(mixedQueryOriginResult.reports.find((report) => report.source === "typesense_meilisearch_query").status, "invalid_report");
  assert.match(
    mixedQueryOriginResult.reports.find((report) => report.source === "typesense_meilisearch_query").error,
    /reported service origin/,
  );

  const reservedDir = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-reserved-live-reports-`);
  const reservedPaths = writeLiveReportFixtures(reservedDir);
  const reservedQuery = JSON.parse(fs.readFileSync(reservedPaths.queryReportPath, "utf8"));
  reservedQuery.engines[0].service_url = "https://example.com";
  reservedQuery.engines[1].service_url = "https://typesense.example";
  fs.writeFileSync(reservedPaths.queryReportPath, `${JSON.stringify(reservedQuery)}\n`);
  const reservedHermes = JSON.parse(fs.readFileSync(reservedPaths.hermesReportPath, "utf8"));
  reservedHermes.provider.endpoint = "https://hermes.invalid/v1/chat/completions";
  fs.writeFileSync(reservedPaths.hermesReportPath, `${JSON.stringify(reservedHermes)}\n`);
  const reservedResult = validateLiveServiceReports(reservedPaths);
  assert.equal(reservedResult.ready, false);
  assert.equal(reservedResult.reports.find((report) => report.source === "typesense_meilisearch_query").status, "invalid_report");
  assert.equal(reservedResult.reports.find((report) => report.source === "hermes_draft_worker").status, "invalid_report");
  assert.match(
    reservedResult.reports.find((report) => report.source === "typesense_meilisearch_query").error,
    /localhost or placeholder/,
  );
  assert.match(
    reservedResult.reports.find((report) => report.source === "hermes_draft_worker").error,
    /localhost or placeholder/,
  );

  const wrongHermesPathDir = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-wrong-hermes-path-`);
  const wrongHermesPathReports = writeLiveReportFixtures(wrongHermesPathDir);
  const wrongHermesPath = JSON.parse(fs.readFileSync(wrongHermesPathReports.hermesReportPath, "utf8"));
  wrongHermesPath.provider.endpoint = "https://hermes.ms-realty.bg/v1/models";
  fs.writeFileSync(wrongHermesPathReports.hermesReportPath, `${JSON.stringify(wrongHermesPath)}\n`);
  const wrongHermesPathResult = validateLiveServiceReports(wrongHermesPathReports);
  assert.equal(wrongHermesPathResult.ready, false);
  assert.equal(wrongHermesPathResult.reports.find((report) => report.source === "hermes_draft_worker").status, "invalid_report");
  assert.match(
    wrongHermesPathResult.reports.find((report) => report.source === "hermes_draft_worker").error,
    /\/v1\/chat\/completions/,
  );

  const hostedHermesDir = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-hosted-hermes-`);
  const hostedHermesReports = writeLiveReportFixtures(hostedHermesDir);
  const hostedHermes = JSON.parse(fs.readFileSync(hostedHermesReports.hermesReportPath, "utf8"));
  hostedHermes.provider.mode = "openrouter";
  hostedHermes.provider.endpoint = "https://openrouter.ai/api/v1/chat/completions";
  hostedHermes.provider.sensitive_data_allowed = false;
  fs.writeFileSync(hostedHermesReports.hermesReportPath, `${JSON.stringify(hostedHermes)}\n`);
  const hostedHermesResult = validateLiveServiceReports(hostedHermesReports);
  assert.equal(hostedHermesResult.ready, false);
  assert.equal(hostedHermesResult.reports.find((report) => report.source === "hermes_draft_worker").status, "invalid_report");
  assert.match(
    hostedHermesResult.reports.find((report) => report.source === "hermes_draft_worker").error,
    /self-hosted sensitive-data provider/,
  );
});

test("live service preflight report rejects hand-edited status counts", () => {
  const report = buildLiveServicePreflightReport({ generatedAt: "2026-07-06T00:00:00Z" });
  assert.throws(() => assertLiveServicePreflightReport({ ...report, generated_at: "" }), /valid generated_at/);
  assert.throws(() => assertLiveServicePreflightReport({ ...report, next_actions: [] }), /next actions/);
  assert.throws(
    () => assertLiveServicePreflightReport({ ...report, next_actions: ["Provision services."] }),
    /live:preflight/,
  );
  assert.throws(
    () =>
      assertLiveServicePreflightReport({
        ...report,
        reports: report.reports.map((item, index) => (index === 0 ? { ...item, status: "skipped" } : item)),
      }),
    /statuses must be known/,
  );
  assert.throws(
    () =>
      assertLiveServicePreflightReport({
        ...report,
        reports: report.reports.map((item, index) => (index === 0 ? { ...item, api_key: "test-secret-key" } : item)),
      }),
    /must not persist secrets/,
  );
  assert.throws(
    () =>
      assertLiveServicePreflightReport({
        ...report,
        summary: {
          ...report.summary,
          configured_paths: {
            ...report.summary.configured_paths,
            typesense_meilisearch_sync: "/tmp/wrong-search-engine-sync-report.json",
          },
        },
      }),
    /configured paths/,
  );
  const partialPassReport = {
    ...report,
    summary: {
      ...report.summary,
      pass: 1,
      missing_report: 2,
      configured_paths: {
        ...report.summary.configured_paths,
        typesense_meilisearch_sync: "/tmp/search-engine-sync-report.json",
      },
    },
    reports: report.reports.map((item) =>
      item.source === "typesense_meilisearch_sync"
        ? {
            ...item,
            status: "pass",
            path: "/tmp/search-engine-sync-report.json",
            summary: { engines: 2, documents_per_engine: [167, 167], total_operations: 0 },
          }
        : item,
    ),
  };
  assert.throws(() => assertLiveServicePreflightReport(partialPassReport), /search sync summary evidence/);
  report.summary.pass = 3;

  assert.throws(() => assertLiveServicePreflightReport(report), /status counts must match reports/);
});

test("live service evidence command refuses localhost launch evidence", async () => {
  await withLiveServiceServer(async (baseUrl) => {
    const dir = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-live-capture-`);
    const paths = {
      syncReportPath: `${dir}/search-engine-sync-report.json`,
      queryReportPath: `${dir}/search-engine-query-report.json`,
      hermesReportPath: `${dir}/hermes-draft-worker-report.json`,
    };
    const result = await runScript("run-live-service-evidence.mjs", {
      ...process.env,
      TYPESENSE_URL: baseUrl,
      TYPESENSE_API_KEY: "typesense-test",
      MEILI_URL: baseUrl,
      MEILI_API_KEY: "meili-test",
      HERMES_CHAT_COMPLETIONS_URL: `${baseUrl}/v1/chat/completions`,
      HERMES_API_KEY: "hermes-test",
      HERMES_DRAFT_LIMIT: "1",
      MS_REALTY_SEARCH_SYNC_REPORT_PATH: paths.syncReportPath,
      MS_REALTY_SEARCH_QUERY_REPORT_PATH: paths.queryReportPath,
      MS_REALTY_HERMES_WORKER_REPORT_PATH: paths.hermesReportPath,
      MS_REALTY_TRANSLATION_LEDGER_PATH: `${dir}/translation-tasks.jsonl`,
      MS_REALTY_HERMES_AUDIT_PATH: `${dir}/hermes-audit.jsonl`,
      MS_REALTY_AUDIT_LOG_PATH: `${dir}/audit-log.jsonl`,
    });

    assert.notEqual(result.status, 0);
    assert.match(
      result.stderr,
      /LIVE SERVICE EVIDENCE FAILED: live service provisioning must pass before capture: typesense_health, meilisearch_health, hermes_provider/,
    );
    assert.match(result.stderr, /Next: run `npm run live:provisioning:preflight`/);
    const validation = validateLiveServiceReports(paths);
    assert.equal(validation.ready, false);
    assert.equal(validation.reports.every((report) => report.status === "missing_report"), true);
  });
});

test("live service preflight report records blockers without clearing the gate", () => {
  const missingDir = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-live-preflight-report-missing-`);
  const missingReport = buildLiveServicePreflightReport({
    generatedAt: "2026-07-06T00:00:00Z",
    syncReportPath: `${missingDir}/search-engine-sync-report.json`,
    queryReportPath: `${missingDir}/search-engine-query-report.json`,
    hermesReportPath: `${missingDir}/hermes-draft-worker-report.json`,
  });

  assert.equal(assertLiveServicePreflightReport(missingReport), true);
  assert.equal(missingReport.ready, false);
  assert.equal(missingReport.status, "blocked");
  assert.equal(missingReport.summary.missing_report, 3);
  assert.match(missingReport.next_actions.join(" "), /npm run hermes:provisioning/);
  assert.match(missingReport.next_actions.join(" "), /npm run live:capture/);
  assert.match(missingReport.next_actions.join(" "), /npm run live:preflight/);
  const missingOutputPath = `${missingDir}/live-service-preflight-report.json`;
  const missingResult = spawnSync(process.execPath, [fromRoot("production", "scripts", "build-live-service-preflight-report.mjs")], {
    cwd: fromRoot(),
    encoding: "utf8",
    env: {
      ...process.env,
      MS_REALTY_SEARCH_SYNC_REPORT_PATH: `${missingDir}/search-engine-sync-report.json`,
      MS_REALTY_SEARCH_QUERY_REPORT_PATH: `${missingDir}/search-engine-query-report.json`,
      MS_REALTY_HERMES_WORKER_REPORT_PATH: `${missingDir}/hermes-draft-worker-report.json`,
      MS_REALTY_LIVE_SERVICE_PREFLIGHT_REPORT_PATH: missingOutputPath,
      MS_REALTY_GENERATED_AT: "2026-07-08T12:00:00Z",
    },
  });

  assert.equal(missingResult.status, 0, missingResult.stderr);
  assert.match(missingResult.stdout, /Live service reports blocked: typesense_meilisearch_sync, typesense_meilisearch_query, hermes_draft_worker/);
  assert.match(missingResult.stdout, /Missing reports: 3/);
  assert.match(missingResult.stdout, /Next: run `npm run live:provisioning:preflight`/);
  assert.equal(JSON.parse(fs.readFileSync(missingOutputPath, "utf8")).generated_at, "2026-07-08T12:00:00Z");

  const validDir = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-live-preflight-report-valid-`);
  const paths = writeLiveReportFixtures(validDir);
  const outputPath = `${validDir}/live-service-preflight-report.json`;
  const result = spawnSync(process.execPath, [fromRoot("production", "scripts", "build-live-service-preflight-report.mjs")], {
    cwd: fromRoot(),
    encoding: "utf8",
    env: {
      ...process.env,
      MS_REALTY_SEARCH_SYNC_REPORT_PATH: paths.syncReportPath,
      MS_REALTY_SEARCH_QUERY_REPORT_PATH: paths.queryReportPath,
      MS_REALTY_HERMES_WORKER_REPORT_PATH: paths.hermesReportPath,
      MS_REALTY_LIVE_SERVICE_PREFLIGHT_REPORT_PATH: outputPath,
      MS_REALTY_GENERATED_AT: "2026-07-08T12:00:00Z",
    },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, new RegExp(outputPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  const readyReport = JSON.parse(fs.readFileSync(outputPath, "utf8"));
  assert.equal(readyReport.generated_at, "2026-07-08T12:00:00Z");
  assert.equal(assertLiveServicePreflightReport(readyReport), true);
  assert.equal(readyReport.ready, true);
  assert.equal(readyReport.summary.pass, 3);
});

test("live service report examples are templates, not launch evidence", () => {
  const result = validateLiveServiceReports({
    syncReportPath: fromRoot("production", "data", "search-engine-sync-report.json.example"),
    queryReportPath: fromRoot("production", "data", "search-engine-query-report.json.example"),
    hermesReportPath: fromRoot("production", "data", "hermes-draft-worker-report.json.example"),
  });

  assert.equal(result.ready, false);
  assert.equal(result.reports.every((report) => report.status === "example_report"), true);
  assert.match(fs.readFileSync(fromRoot(".gitignore"), "utf8"), /production\/data\/search-engine-sync-report\.json/);
  assert.match(fs.readFileSync(fromRoot(".gitignore"), "utf8"), /production\/data\/search-engine-query-report\.json/);
  assert.match(fs.readFileSync(fromRoot(".gitignore"), "utf8"), /production\/data\/hermes-draft-worker-report\.json/);

  const template = readLiveServiceReportTemplate("typesense_meilisearch_query");
  assert.equal(template.filename, "search-engine-query-report.json.example");
  assert.equal(JSON.parse(template.json).example, true);
  assert.equal(JSON.parse(template.json).summary.engines, 2);
  assert.throws(() => readLiveServiceReportTemplate("../bad"), /Unknown live service report source/);
});

test("live service report import writes only validated source reports", () => {
  const dir = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-import-live-reports-`);
  const paths = writeLiveReportFixtures(dir);
  const queryReport = JSON.parse(fs.readFileSync(paths.queryReportPath, "utf8"));
  const outPath = `${dir}/imported-query-report.json`;

  const imported = writeLiveServiceReport("typesense_meilisearch_query", queryReport, { queryReportPath: outPath });
  const importSummary = liveServiceImportSummary(
    imported,
    buildLiveServicePreflightReport({
      queryReportPath: outPath,
      syncReportPath: `${dir}/missing-sync-report.json`,
      hermesReportPath: `${dir}/missing-hermes-report.json`,
    }),
  );

  assert.equal(imported.outPath, outPath);
  assert.equal(importSummary.ready, false);
  assert.equal(importSummary.status, "blocked");
  assert.equal(importSummary.importedSource, "typesense_meilisearch_query");
  assert.equal(importSummary.importedReportStatus, "pass");
  const readyImportSummary = liveServiceImportSummary(imported, buildLiveServicePreflightReport(paths));
  assert.equal(readyImportSummary.ready, true);
  assert.match(readyImportSummary.nextActions.join(" "), /npm run live:preflight/);
  assert.deepEqual(
    importSummary.blockedReports.map((report) => report.source),
    ["typesense_meilisearch_sync", "hermes_draft_worker"],
  );
  assert.equal(JSON.parse(fs.readFileSync(outPath, "utf8")).summary.engines, 2);
  assert.throws(
    () => writeLiveServiceReport("typesense_meilisearch_query", { ...queryReport, example: true }, { queryReportPath: outPath }),
    /Example live service reports cannot be imported/,
  );
  assert.throws(
    () => writeLiveServiceReport("typesense_meilisearch_query", { ...queryReport, generated_at: "" }, { queryReportPath: outPath }),
    /valid generated_at/,
  );
  assert.throws(
    () =>
      writeLiveServiceReport(
        "typesense_meilisearch_query",
        { ...queryReport, api_key: "test-secret-key" },
        { queryReportPath: outPath },
      ),
    /must not persist secrets/,
  );
  assert.throws(
    () =>
      writeLiveServiceReport(
        "typesense_meilisearch_query",
        { ...queryReport, engines: [{ ...queryReport.engines[0], service_url: "http://typesense.local" }, queryReport.engines[1]] },
        { queryReportPath: outPath },
      ),
    /localhost or placeholder/,
  );
  assert.throws(
    () =>
      writeLiveServiceReport(
        "typesense_meilisearch_query",
        { generated_at: "2026-07-06T00:00:00Z", summary: { engines: 1 }, engines: [] },
        { queryReportPath: outPath },
      ),
    /cover Typesense and Meilisearch/,
  );
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
  assert.match(markdown, /## Blocked Gate Actions/);
  assert.match(markdown, /external_seo_exports: Import Search Console/);
  assert.match(markdown, /listing_quality_review: Download \/api\/admin\/listing-quality-review-packet/);
  assert.match(markdown, /live_services: Run npm run live:provisioning:preflight/);
  assert.match(markdown, /payload_runtime: Run npm run payload:runtime/);
  assert.match(markdown, /redirect_reviews: Review every unresolved legacy URL/);
  assert.match(markdown, /Remaining mapped-listing approvals: 0/);
  assert.match(markdown, /Legacy route coverage: 165\/457/);
  assert.match(markdown, /Unresolved legacy URLs: 292 \(page 104, post 42, taxonomy 146\)/);
  assert.match(markdown, /migration\/reviews\/redirect-approvals\.csv/);
  assert.match(markdown, /POST \/api\/admin\/redirect-approvals\/import/);
  assert.match(markdown, /MS_REALTY_REDIRECT_APPROVALS_PATH/);
  assert.match(markdown, /MS_REALTY_DEPLOYABLE_REDIRECTS_OUTPUT_PATH/);
  assert.match(markdown, /target_listing_id/);
  assert.match(markdown, /same_content_checklist/);
  assert.match(markdown, /Approval import columns: `old_url`, `equivalent_content`, `reviewer`/);
  assert.match(markdown, /Missing required sources: search_console, yandex_webmaster, backlinks/);
  assert.match(markdown, /Crawl coverage: 457 URLs \(page 104, post 42, taxonomy 146, listing 165\); URLs with any evidence: 2/);
  assert.match(markdown, /migration\/external\/seo\/search-console\.csv`: missing_export/);
  assert.match(markdown, /rows 0, matched 0, signal 0, unmatched 0, duplicates 0, placeholders 0/);
  assert.match(markdown, /migration\/external\/seo\/yandex-webmaster\.csv`: missing_export/);
  assert.match(markdown, /migration\/external\/seo\/backlinks\.csv`: missing_export/);
  assert.match(markdown, /Minimum required domain coverage/);
  assert.match(markdown, /makler-realty\.com: `https:\/\/makler-realty\.com/);
  assert.match(markdown, /makler-realty\.ru: `https:\/\/makler-realty\.ru/);
  assert.match(markdown, /POST \/api\/admin\/seo-evidence\/import\?source=search_console`: `url,clicks,impressions,position/);
  assert.match(markdown, /POST \/api\/admin\/seo-evidence\/import\?source=yandex_webmaster`: `url,indexed,issue/);
  assert.match(markdown, /POST \/api\/admin\/seo-evidence\/import\?source=backlinks`: `target_url,source_url,referring_domain/);
  assert.match(markdown, /GET \/api\/admin\/seo-evidence\/template\?source=search_console/);
  assert.match(markdown, /GET \/api\/admin\/seo-evidence\/export/);
  assert.match(markdown, /MS_REALTY_SEO_EVIDENCE_INPUT_DIR/);
  assert.match(markdown, /npm run seo:preflight:report/);
  assert.match(markdown, /GET \/api\/admin\/seo-preflight/);
  assert.match(markdown, /MS_REALTY_SEO_PREFLIGHT_REPORT_PATH/);
  assert.match(markdown, /MS_REALTY_LAUNCH_READINESS_OUTPUT_PATH/);
  assert.match(markdown, /Live Service Provisioning/);
  assert.match(markdown, /typesense_meilisearch_sync: missing_report .*search-engine-sync-report\.json/);
  assert.match(markdown, /typesense_meilisearch_query: missing_report .*search-engine-query-report\.json/);
  assert.match(markdown, /hermes_draft_worker: missing_report .*hermes-draft-worker-report\.json/);
  assert.match(markdown, /blocked_report .*live-service-provisioning-report\.json.*missing TYPESENSE_URL, TYPESENSE_API_KEY, MEILI_URL, MEILI_API_KEY, HERMES_CHAT_COMPLETIONS_URL, HERMES_API_KEY/);
  assert.match(markdown, /TYPESENSE_URL/);
  assert.match(markdown, /MEILI_API_KEY/);
  assert.match(markdown, /HERMES_CHAT_COMPLETIONS_URL/);
  assert.match(markdown, /npm run hermes:runtime/);
  assert.match(markdown, /private OpenAI-compatible model provider/);
  assert.match(markdown, /tools and persistent memory are disabled/);
  assert.match(markdown, /npm run hermes:provisioning/);
  assert.match(markdown, /hermes-provider-provisioning-report\.json/);
  assert.match(markdown, /npm run live:capture/);
  assert.match(markdown, /npm run search:sync/);
  assert.match(markdown, /npm run hermes:worker/);
  assert.match(markdown, /npm run live:report/);
  assert.match(markdown, /npm run live:preflight/);
  assert.match(markdown, /GET \/api\/admin\/live-services/);
  assert.match(markdown, /GET \/api\/admin\/live-service-provisioning/);
  assert.match(markdown, /search-engine-sync-report\.json\.example/);
  assert.match(markdown, /live-service-report-template\?source=typesense_meilisearch_sync/);
  assert.match(markdown, /live-service-reports\/import\?source=typesense_meilisearch_sync/);
  assert.match(markdown, /MS_REALTY_SEARCH_SYNC_REPORT_PATH/);
  assert.match(markdown, /MS_REALTY_HERMES_WORKER_REPORT_PATH/);
  assert.match(markdown, /MS_REALTY_LIVE_SERVICE_PREFLIGHT_REPORT_PATH/);
  assert.match(markdown, /MS_REALTY_HERMES_AUDIT_PATH/);
  assert.match(markdown, /MS_REALTY_AUDIT_LOG_PATH/);
  assert.match(markdown, /examples do not count as launch evidence/);
  assert.match(markdown, /checked-in smoke commands remain local contract tests only/);
  assert.match(markdown, /Payload Runtime/);
  assert.match(markdown, /Current gate: blocked/);
  assert.match(markdown, /Current check evidence/);
  assert.match(markdown, /payload_secret: missing_env \(env PAYLOAD_SECRET\)/);
  assert.match(markdown, /database_url: missing_env \(env DATABASE_URL\)/);
  assert.match(markdown, /production\/data\/payload-runtime-report\.json/);
  assert.match(markdown, /production\/data\/payload-runtime-report\.json\.example/);
  assert.match(markdown, /production\/data\/payload-collections\.json/);
  assert.match(markdown, /\/payload-admin/);
  assert.match(markdown, /Required env: `PAYLOAD_SECRET`, `DATABASE_URL`; currently missing: `PAYLOAD_SECRET`, `DATABASE_URL`/);
  assert.match(markdown, /Secret strength: `PAYLOAD_SECRET` must be at least 32 bytes/);
  assert.match(markdown, /payload\.config\.js/);
  assert.match(markdown, /npm run payload:runtime/);
  assert.match(markdown, /npm run payload:preflight/);
  assert.match(markdown, /GET \/api\/admin\/payload-runtime-bootstrap/);
  assert.match(markdown, /GET \/api\/admin\/payload-runtime/);
  assert.match(markdown, /POST \/api\/admin\/payload-runtime\/import/);
  assert.match(markdown, /MS_REALTY_PAYLOAD_RUNTIME_REPORT_PATH/);
  assert.match(markdown, /Real Payload runtime reports stay local and ignored/);
  assert.match(markdown, /examples do not count as launch evidence/);
  assert.match(markdown, /interim admin workbenches do not count/);
  assert.match(markdown, /production\/data\/listing-quality-workbook\.csv/);
  assert.match(markdown, /Current review evidence/);
  assert.match(markdown, /missing_review .*migration\/reviews\/listing-quality\.csv.*expected 7.*reviewed 0.*missing 7/);
  assert.match(markdown, /Pending review sample/);
  assert.match(markdown, /MS-CRAWL-0006: public_gallery \(thin_public_gallery\) \/admin\/listings\/edit\?listingId=MS-CRAWL-0006/);
  assert.match(markdown, /MS-CRAWL-0112: public_gallery \(thin_public_gallery\) \/admin\/listings\/edit\?listingId=MS-CRAWL-0112/);
  assert.match(markdown, /production\/data\/listing-quality-review-packet\.json/);
  assert.match(markdown, /production\/data\/listing-quality-review-draft\.csv/);
  assert.match(markdown, /listing_quality\.thin_public_gallery: 7/);
  assert.match(markdown, /MS_REALTY_LISTING_QUALITY_REVIEW_PATH/);
  assert.match(markdown, /npm run listing:preflight:report/);
  assert.match(markdown, /Draft and example rows intentionally leave reviewer fields blank/);
  assert.match(markdown, /npm run listing:review-pack/);
  assert.match(markdown, /GET \/api\/admin\/listing-quality-review-packet/);
  assert.match(markdown, /GET \/api\/admin\/listing-quality-review-draft/);
  assert.match(markdown, /GET \/api\/admin\/listing-quality/);
  assert.match(markdown, /MS_REALTY_LISTING_EDIT_LEDGER_PATH/);
  assert.match(markdown, /MS_REALTY_LISTING_QUALITY_WORKBOOK_PATH/);
  assert.match(markdown, /MS_REALTY_LISTING_QUALITY_PREFLIGHT_REPORT_PATH/);
  assert.match(markdown, /review_status/);
  assert.match(markdown, /required_editor_fields/);
  assert.match(markdown, /Launch review CSVs must retain draft snapshot columns/);
  assert.match(markdown, /public_gallery_sample/);
  assert.match(markdown, /POST \/api\/admin\/listings\/edit/);
  assert.match(markdown, /one valid row for every workbook row/);
  assert.match(markdown, /Broker Verification/);
  assert.match(markdown, /production\/data\/listing-verification-report\.json/);
  assert.match(markdown, /Broker verification tasks: 165/);
  assert.match(markdown, /High priority tasks: 74/);
  assert.match(markdown, /broker_bg: 113, broker_ru: 52/);
  assert.match(markdown, /MS_REALTY_LISTING_PUBLICATION_REPORT_PATH/);
  assert.match(markdown, /MS_REALTY_LISTING_VERIFICATION_REPORT_PATH/);
  assert.match(markdown, /Monitoring And Rollback/);
  assert.match(markdown, /GET \/api\/admin\/launch-readiness/);
  assert.match(markdown, /privacy_events: imported/);
  assert.match(markdown, /search_console: missing_export/);
  assert.match(markdown, /Rollback steps: 4/);
  assert.match(markdown, /GET \/api\/admin\/preflight-reports/);
  assert.match(
    markdown,
    /## Validate After Inputs[\s\S]*npm run seo:preflight:report[\s\S]*npm run live:provisioning[\s\S]*npm run live:capture[\s\S]*npm run live:report[\s\S]*npm run payload:runtime[\s\S]*npm run launch:preflight/,
  );
  assert.match(markdown, /npm run launch:inputs/);
  assert.match(markdown, /npm run launch:preflight/);
});
