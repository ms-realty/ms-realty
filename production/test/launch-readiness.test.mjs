import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
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
  payloadRuntimeState,
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
import {
  approvedLaunchFreezeRouteArtifact,
  summarizeDeployableRedirects,
  summarizeLegacyRouteDecisions,
} from "../lib/redirect-approvals.mjs";
import { signProductionRecoveryReport } from "../lib/production-recovery.mjs";

const RECOVERY_KEYPAIR = crypto.generateKeyPairSync("ed25519");
process.env.MS_REALTY_RECOVERY_SIGNING_PUBLIC_KEY = RECOVERY_KEYPAIR.publicKey
  .export({ format: "der", type: "spki" })
  .toString("base64");

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

function completeTerminalDecisions(routeMap, deployableRedirects) {
  const existing = new Map((deployableRedirects.decisions || deployableRedirects.redirects || []).map((row) => [row.old_url, row]));
  const decisions = routeMap.routes.map((route) =>
    existing.get(route.old_url) || {
      old_url: route.old_url,
      source_domain: route.source_domain,
      url_type: route.url_type,
      target_locale: null,
      target_path: null,
      decision: "approved_410",
      planned_status: 410,
      status: 410,
      reviewer: "fixture_seo_editor",
      approved_at: "2026-07-05T00:00:00Z",
      equivalent_content: false,
      deployable: true,
      reason: "Test-only terminal review fixture.",
    },
  );
  const decisionSummary = summarizeLegacyRouteDecisions(decisions);
  Object.assign(deployableRedirects, { decisions, decision_summary: decisionSummary });
  return deployableRedirects;
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
      input_path: `fixture/${source}.csv`,
      input_bytes: 64,
      input_sha256: "a".repeat(64),
      template_copy: false,
      verified_zero_result: false,
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
    "area_sqm",
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
    const needsFacts = fields.some((field) => ["price_eur", "area_sqm", "bedrooms", "location", "description"].includes(field));
    const needsMedia = fields.some((field) =>
      ["media_review", "media_alt_text", "public_gallery", "tour_review"].includes(field),
    );
    return [
      row.listing_id,
      fields.includes("price_eur") ? row.price_eur || 123000 : "",
      fields.includes("area_sqm") ? row.area_sqm || 85 : "",
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
    "area_sqm",
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
        "85",
        "",
        "",
        "",
        "editor_bg",
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
    source: "postgres_search_sync",
    status: "pass",
    generated_at: "2026-07-05T00:00:00.000Z",
    path: "production/data/postgres-search-sync-report.json",
    summary: {
      engines: 1,
      targets: { postgres: "ms_realty_public_search_documents" },
      documents_per_engine: [1],
      total_operations: 1,
      database_target: "postgres://db.ms-realty.bg:5432/ms_realty",
    },
    evidence: {
      evidence_scope: "live",
      source: {
        kind: "payload_postgres",
        authoritative: true,
        projected_documents: 1,
        digest: "a".repeat(64),
      },
      engines: [
        {
          engine: "postgres",
          target: "ms_realty_public_search_documents",
          database_target: "postgres://db.ms-realty.bg:5432/ms_realty",
          operations: [
            { method: "SELECT", url: "postgres://db.ms-realty.bg:5432/ms_realty", status: 200, rows: 1 },
          ],
        },
      ],
    },
  },
  {
    source: "postgres_search_query",
    status: "pass",
    generated_at: "2026-07-05T00:00:00.000Z",
    path: "production/data/postgres-search-query-report.json",
    summary: {
      engines: 1,
      targets: { postgres: "ms_realty_public_search_documents" },
      total_hits: 1,
      first_hit_ids: ["MS-CURRENT-0001:bg"],
      database_target: "postgres://db.ms-realty.bg:5432/ms_realty",
    },
    evidence: {
      evidence_scope: "live",
      source: {
        kind: "payload_postgres",
        authoritative: true,
        projected_documents: 1,
        digest: "a".repeat(64),
      },
      expectation: {
        projected_documents: 1,
        sample_document_id: "MS-CURRENT-0001:bg",
      },
      engines: [
        {
          engine: "postgres",
          target: "ms_realty_public_search_documents",
          database_target: "postgres://db.ms-realty.bg:5432/ms_realty",
          operation: {
            method: "SELECT",
            url: "postgres://db.ms-realty.bg:5432/ms_realty",
            status: 200,
            rows: 1,
          },
        },
      ],
    },
  },
  {
    source: "hermes_draft_worker",
    status: "pass",
    generated_at: "2026-07-05T00:00:00.000Z",
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
  summary: { checks: 7, missing_env: [], placeholder_env: [], services: ["postgres_search", "hermes"] },
  checks: [
    { id: "database_url", env: "DATABASE_URL", status: "pass" },
    { id: "payload_secret", env: "PAYLOAD_SECRET", status: "pass" },
    { id: "search_engine", env: "MS_REALTY_SEARCH_ENGINE", engine: "postgres", status: "pass" },
    { id: "postgres_database_target", database_target: "postgres://db.ms-realty.bg:5432/ms_realty", status: "pass" },
    { id: "hermes_provider", missing: [], mode: "self_hosted", status: "pass" },
    { id: "hermes_agent_health", status: "pass", status_code: 200 },
    { id: "hermes_agent_capabilities", status: "pass", status_code: 200 },
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
  generated_at: "2026-07-05T00:00:00.000Z",
  path: "production/data/payload-runtime-report.json",
  summary: {
    admin_route: "/admin",
    checks: 12,
    identity_collection: "admins",
    missing_env: [],
    payload_admin_ui: "edge_hidden",
    payload_identity_rest: "edge_hidden",
    placeholder_env: [],
    weak_env: [],
    route_files: 6,
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
    { id: "route:app/admin/route.js", status: "pass" },
    { id: "route:app/admin/login/route.js", status: "pass" },
    { id: "route:app/admin/logout/route.js", status: "pass" },
    { id: "route:app/admin/team/route.js", status: "pass" },
    { id: "route:app/api/admin/team/route.js", status: "pass" },
    { id: "route:app/(payload)/api/[...slug]/route.js", status: "pass" },
    { id: "payload_edge_boundary", status: "pass" },
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
const readyProductionRecovery = {
  status: "pass",
  path: "production/data/production-recovery-report.json",
  report: signProductionRecoveryReport({
    schema_version: 2,
    generated_at: "2026-07-05T00:00:00.000Z",
    environment: "production",
    ready: true,
    policy: {
      provider: "eu-backup-provider",
      offsite: true,
      encrypted_at_rest: true,
      encrypted_in_transit: true,
      retention_days: 30,
      rpo_hours: 24,
      rto_hours: 8,
    },
    backup: {
      backup_id: "backup-20260704-001",
      completed_at: "2026-07-04T23:00:00.000Z",
      checksum_verified: true,
      ciphertext_sha256: "1".repeat(64),
      manifest_sha256: "2".repeat(64),
      monitoring_rollback_report_sha256: "4".repeat(64),
      release_id: "a".repeat(40),
      components: ["payload_postgres", "runtime_data", "runtime_evidence"],
    },
    restore_drill: {
      drill_id: "drill-20260704-001",
      source_backup_id: "backup-20260704-001",
      completed_at: "2026-07-04T23:15:00.000Z",
      target: "isolated",
      status: "pass",
      checksum_verified: true,
      rollback_procedure_verified: true,
      ciphertext_sha256: "1".repeat(64),
      manifest_sha256: "2".repeat(64),
      result_sha256: "3".repeat(64),
      monitoring_rollback_report_sha256: "4".repeat(64),
      release_id: "a".repeat(40),
      components_verified: ["payload_postgres", "runtime_data", "runtime_evidence"],
      operator: "operations_manager",
    },
    approval: {
      status: "approved",
      approval_id: "recovery-approval-20260704-001",
      reviewer: "agency_owner",
      approved_at: "2026-07-04T23:30:00.000Z",
      artifact_sha256: "5".repeat(64),
      ciphertext_sha256: "1".repeat(64),
      manifest_sha256: "2".repeat(64),
      restore_drill_sha256: "3".repeat(64),
      monitoring_rollback_report_sha256: "4".repeat(64),
      release_id: "a".repeat(40),
    },
  }, { privateKey: RECOVERY_KEYPAIR.privateKey }),
};
const readyMonitoringRollback = {
  status: "pass",
  path: "production/data/monitoring-rollback-report.json",
  report: {
    schema_version: 2,
    generated_at: "2026-07-05T00:00:00.000Z",
    environment: "production",
    ready: true,
    release_id: "a".repeat(40),
    monitoring: {
      provider: "github-actions-cloudflare-workers",
      provider_run_id: "31485358241",
      provider_run_attempt: "1",
      repository: "ms-realty/ms-realty",
      workflow_ref: "ms-realty/ms-realty/.github/workflows/monitoring-drill.yml@refs/heads/main",
      run_url: "https://github.com/ms-realty/ms-realty/actions/runs/31485358241/attempts/1",
      correlation_id: "ms-realty/ms-realty:monitoring-drill:31485358241:1",
      machine_artifact_name: "monitoring-drill-machine-evidence-31485358241-1",
      endpoints: [
        {
          url: "https://status.ms-realty.bg/health",
          status: "pass",
          checked_at: "2026-07-04T23:55:00.000Z",
          build_marker: "a".repeat(40),
          probe: "production/scripts/probe-production-journeys.mjs",
        },
      ],
    },
    dispatch_confirmation: {
      mechanism: "workflow_dispatch_typed_confirmation",
      actor: "ivan-peychev",
      triggering_actor: "ivan-peychev",
    },
    alert_delivery: {
      status: "pass",
      provider: "github-actions-email",
      receipt_id: "message-id-31485358241-1",
      correlation_id: "ms-realty/ms-realty:monitoring-drill:31485358241:1",
      provider_run_id: "31485358241",
      provider_run_attempt: "1",
      repository: "ms-realty/ms-realty",
      run_url: "https://github.com/ms-realty/ms-realty/actions/runs/31485358241/attempts/1",
      triggered_at: "2026-07-04T23:55:30.000Z",
      delivered_at: "2026-07-04T23:56:00.000Z",
    },
    rollback: {
      automatic_policy_id: "rollback-policy-prod-001",
      canary: {
        run_id: "msr-monitoring-drill-31485358241-1:11111111-1111-4111-8111-111111111111",
        release_id: "a".repeat(40),
        worker: "msr-monitoring-drill-31485358241-1",
        url: "https://msr-monitoring-drill-31485358241-1.ms-realty-bg.workers.dev",
        version_id: "11111111-1111-4111-8111-111111111111",
        build_marker: "a".repeat(40),
        probe: "production/scripts/probe-production-journeys.mjs",
        status: "pass",
        checked_at: "2026-07-04T23:57:00.000Z",
      },
      drill: {
        drill_id: "ms-realty/ms-realty:monitoring-drill:31485358241:1",
        release_id: "a".repeat(40),
        worker: "msr-monitoring-drill-31485358241-1",
        url: "https://msr-monitoring-drill-31485358241-1.ms-realty-bg.workers.dev",
        baseline_version_id: "11111111-1111-4111-8111-111111111111",
        fault_version_id: "22222222-2222-4222-8222-222222222222",
        restored_version_id: "11111111-1111-4111-8111-111111111111",
        restored_build_marker: "a".repeat(40),
        failure_surface: "production_journey_probe",
        probe: "production/scripts/probe-production-journeys.mjs",
        status: "pass",
        target: "isolated",
        rollback_procedure_verified: true,
        verified_at: "2026-07-04T23:58:00.000Z",
      },
    },
  },
};

function writeProductionRecoveryFixture(dir, generatedAt = new Date().toISOString()) {
  const reportPath = `${dir}/production-recovery-report.json`;
  const report = structuredClone(readyProductionRecovery.report);
  report.generated_at = generatedAt;
  report.backup.completed_at = generatedAt;
  report.restore_drill.completed_at = generatedAt;
  report.approval.approved_at = generatedAt;
  writeJson(reportPath, signProductionRecoveryReport(report, { privateKey: RECOVERY_KEYPAIR.privateKey }));
  return reportPath;
}

function writeMonitoringRollbackFixture(dir, generatedAt = new Date().toISOString()) {
  const reportPath = `${dir}/monitoring-rollback-report.json`;
  const report = structuredClone(readyMonitoringRollback.report);
  report.generated_at = generatedAt;
  report.monitoring.endpoints[0].checked_at = generatedAt;
  report.alert_delivery.triggered_at = generatedAt;
  report.alert_delivery.delivered_at = generatedAt;
  report.rollback.canary.checked_at = generatedAt;
  report.rollback.drill.verified_at = generatedAt;
  writeJson(reportPath, report);
  return reportPath;
}

function writeLiveReportFixtures(dir, generatedAt = new Date().toISOString()) {
  const syncReportPath = `${dir}/postgres-search-sync-report.json`;
  const queryReportPath = `${dir}/postgres-search-query-report.json`;
  const hermesReportPath = `${dir}/hermes-draft-worker-report.json`;
  const databaseTarget = "postgres://db.ms-realty.bg:5432/ms_realty";
  const postgresTarget = "ms_realty_public_search_documents";
  fs.writeFileSync(
    syncReportPath,
    `${JSON.stringify({
      evidence_scope: "live",
      generated_at: generatedAt,
      source: {
        kind: "payload_postgres",
        authoritative: true,
        listing_rows: 1,
        eligible_translation_rows: 1,
        projected_documents: 1,
        locale_codes: ["bg"],
        digest: "a".repeat(64),
      },
      summary: {
        engines: 1,
        targets: { postgres: postgresTarget },
        documents_per_engine: [1],
        total_operations: 1,
        database_target: databaseTarget,
      },
      engines: [
        {
          engine: "postgres",
          target: postgresTarget,
          documents: 1,
          digest: "a".repeat(64),
          locale_codes: ["bg"],
          operations: [
            { method: "SELECT", url: databaseTarget, status: 200, rows: 1 },
          ],
        },
      ],
    })}\n`,
  );
  fs.writeFileSync(
    queryReportPath,
    `${JSON.stringify({
      evidence_scope: "live",
      generated_at: generatedAt,
      source: {
        kind: "payload_postgres",
        authoritative: true,
        listing_rows: 1,
        eligible_translation_rows: 1,
        projected_documents: 1,
        locale_codes: ["bg"],
        digest: "a".repeat(64),
      },
      expectation: {
        projected_documents: 1,
        sample_document_id: "MS-CURRENT-0001:bg",
      },
      summary: {
        engines: 1,
        targets: { postgres: postgresTarget },
        total_hits: 1,
        first_hit_ids: ["MS-CURRENT-0001:bg"],
        database_target: databaseTarget,
      },
      engines: [
        {
          engine: "postgres",
          target: postgresTarget,
          database_target: databaseTarget,
          query: "MS-CURRENT-0001",
          operation: {
            method: "SELECT",
            url: databaseTarget,
            status: 200,
            rows: 1,
          },
          total: 1,
          hits: [{ id: "MS-CURRENT-0001:bg", locale: "bg" }],
        },
      ],
    })}\n`,
  );
  fs.writeFileSync(
    hermesReportPath,
    `${JSON.stringify({
      generated_at: generatedAt,
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

async function writeLiveProvisioningFixture(dir, generatedAt = new Date().toISOString()) {
  const reportPath = `${dir}/live-service-provisioning-report.json`;
  const report = await buildLiveServiceProvisioningReport({
    env: {
      DATABASE_URL: "postgres://ms_realty:database-password@db.ms-realty.bg:5432/ms_realty",
      PAYLOAD_SECRET: "payload-runtime-secret",
      MS_REALTY_SEARCH_ENGINE: "postgres",
      HERMES_CHAT_COMPLETIONS_URL: "https://hermes.ms-realty.bg/v1/chat/completions",
      HERMES_API_KEY: "hermes-key",
    },
    fetchImpl: healthyHermesAgentFetch,
    generatedAt,
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
  assert.deepEqual(report.blockers, [
    "live_services",
    "monitoring_rollback",
    "payload_runtime",
    "production_recovery",
  ]);
  const redirectGate = report.gates.find((gate) => gate.id === "redirect_reviews");
  assert.equal(redirectGate.status, "pass");
  assert.deepEqual(redirectGate.evidence, {
    total_legacy_urls: 457,
    resolved_legacy_urls: 457,
    unresolved_legacy_urls: 0,
    unresolved_by_type: {},
    terminal_decisions: 457,
    invalid_terminal_decisions: 0,
    decision_artifact_valid: true,
    deployed_redirect_export_matches: true,
    decision_statuses: { 200: 10, 301: 179, 410: 268 },
    mapped_listings: 165,
    deployable_redirects: 179,
    homepage_targets: 5,
    decision_homepage_targets: 15,
    preservation_contract_valid: true,
    preservation_contract: {
      locked: true,
      artifact_id: "20260817-deterministic-launch-freeze",
      approval_id: "MSR-LAUNCH-FREEZE-1",
      based_on_commit: "aea10e1d7a7b6d4ba1c7183ecbd54be40db5d720",
      source_sha256: "38b34064a8f37e2281ff97bd9b804b5e685984462709c56464de0a5be959158f",
      approved_homepage_redirects: 5,
      approved_homepage_decisions: 15,
    },
    duplicate_old_urls: 0,
  });
  const seoGate = report.gates.find((gate) => gate.id === "external_seo_exports");
  const listingGate = report.gates.find((gate) => gate.id === "listing_quality_review");
  const liveGate = report.gates.find((gate) => gate.id === "live_services");
  const seoEvidence = readJson(["production", "data", "seo-evidence.json"]);
  assert.equal(seoGate.evidence.crawl_urls, 457);
  assert.deepEqual(seoGate.evidence.url_types, { page: 104, post: 42, taxonomy: 146, listing: 165 });
  assert.equal(seoGate.evidence.urls_with_any_evidence, seoEvidence.summary.urls_with_any_evidence);
  assert.ok(seoGate.evidence.next_actions.some((action) => action.includes("seo:preflight")));
  assert.equal(seoGate.status, "deferred");
  assert.match(seoGate.message, /Production-Live, not Production-Ready/);
  assert.equal(listingGate.status, "pass");
  assert.equal(listingGate.evidence.mode, "approved_launch_freeze_preservation");
  assert.equal(listingGate.evidence.approval_id, "MSR-LAUNCH-FREEZE-1");
  assert.deepEqual(listingGate.evidence.summary, {
    expected_review_rows: 165,
    review_rows: 165,
    missing_review_rows: 0,
    facts_review_rows: 30,
    media_review_rows: 0,
    active_listings: 30,
    archived_listings: 135,
    publish_ready: 0,
    publication_approvals: 0,
    public_listing_entries: 0,
  });
  assert.equal(liveGate.status, "blocked");
  assert.equal(liveGate.evidence.provisioning.status, "blocked_report");
  assert.ok(liveGate.evidence.provisioning.summary.missing_env.includes("DATABASE_URL"));
  assert.match(liveGate.next_actions.join(" "), /npm run live:preflight/);
  assert.equal(report.live_services.every((item) => item.status === "missing_report"), true);
  assert.match(report.gates.find((gate) => gate.id === "payload_runtime").next_actions.join(" "), /npm run payload:preflight/);
  for (const id of [
    "live_services",
    "monitoring_rollback",
    "payload_runtime",
    "production_recovery",
  ]) {
    const blockedGate = report.gates.find((gate) => gate.id === id);
    assert.ok(blockedGate.next_actions.length > 0);
  }
  assert.equal(report.gates.find((gate) => gate.id === "monitoring_rollback").status, "blocked");
  assert.deepEqual(report.warnings.find((warning) => warning.id === "listing_quality.thin_public_gallery"), {
    id: "listing_quality.thin_public_gallery",
    count: 18,
  });
  assert.ok(report.rollback_plan.length >= 3);

  const publicPayload = publicLaunchReadinessPayload(report);
  assert.deepEqual(
    publicPayload.blocked_gates.map((gate) => gate.id),
    [
      "live_services",
      "monitoring_rollback",
      "payload_runtime",
      "production_recovery",
    ],
  );
  assert.match(publicPayload.blocked_gates.find((gate) => gate.id === "live_services").message, /Postgres sync\/query/);
  assert.equal("next_actions" in publicPayload.blocked_gates.find((gate) => gate.id === "live_services"), false);
  assert.deepEqual(publicLaunchReadinessHeaders(report), { "cache-control": "no-store", "retry-after": "60" });
});

test("launch readiness validator accepts ready state after required gates are cleared", () => {
  const routeMap = completeRouteMap();
  const deployableRedirects = readJson(["production", "data", "deployable-redirects.json"]);
  const seoEvidence = readySeoEvidenceFixture();

  deployableRedirects.summary.total = routeMap.summary.mappedListings;
  completeTerminalDecisions(routeMap, deployableRedirects);

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
    productionRecovery: readyProductionRecovery,
    monitoringRollback: readyMonitoringRollback,
  });

  assert.equal(assertLaunchReadinessReport(report), true);
  assert.equal(report.launch_ready, true);
  assert.equal(report.status, "ready");
  assert.deepEqual(report.blockers, []);
  assert.deepEqual(publicLaunchReadinessPayload(report).blocked_gates, []);
  assert.deepEqual(publicLaunchReadinessHeaders(report), { "cache-control": "no-store" });
});

test("launch readiness validator rejects legacy schema-v1 production recovery evidence", () => {
  const routeMap = completeRouteMap();
  const deployableRedirects = readJson(["production", "data", "deployable-redirects.json"]);
  deployableRedirects.summary.total = routeMap.summary.mappedListings;
  completeTerminalDecisions(routeMap, deployableRedirects);
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
    productionRecovery: structuredClone(readyProductionRecovery),
    monitoringRollback: readyMonitoringRollback,
  });
  const recoveryGate = report.gates.find((gate) => gate.id === "production_recovery");
  recoveryGate.evidence.report.schema_version = 1;

  assert.throws(() => assertLaunchReadinessReport(report), /schema v2/);
});

test("launch readiness rejects unsigned and tampered schema-v2 recovery evidence", () => {
  for (const mutate of [
    (report) => { delete report.provenance; },
    (report) => { report.backup.backup_id = "handwritten-backup-9999"; },
  ]) {
    const productionRecovery = structuredClone(readyProductionRecovery);
    mutate(productionRecovery.report);
    assert.throws(
      () => buildLaunchReadinessReport({
        generatedAt: "2026-07-05T00:00:00Z",
        productionRecovery,
      }),
      /Ed25519 provenance|signature is invalid/,
    );
  }
});

test("launch readiness fail-closes stale and future mounted runtime evidence", () => {
  const generatedAt = "2026-08-10T12:00:00.000Z";
  const staleAt = "2026-07-10T11:59:59.999Z";
  const futureAt = "2026-08-10T12:01:00.001Z";
  const recoveryAt = (timestamp) => ({
    ...readyProductionRecovery,
    report: signProductionRecoveryReport({
      ...readyProductionRecovery.report,
      provenance: undefined,
      generated_at: timestamp,
      backup: { ...readyProductionRecovery.report.backup, completed_at: timestamp },
      restore_drill: { ...readyProductionRecovery.report.restore_drill, completed_at: timestamp },
      approval: { ...readyProductionRecovery.report.approval, approved_at: timestamp },
    }, { privateKey: RECOVERY_KEYPAIR.privateKey }),
  });
  const freshEvidence = () => ({
    liveServices: readyLiveServices.map((item) => ({ ...item, generated_at: generatedAt })),
    payloadRuntime: { ...readyPayloadRuntime, generated_at: generatedAt },
    productionRecovery: recoveryAt(generatedAt),
  });

  for (const [timestamp, expectedFreshness] of [
    [staleAt, "stale"],
    [futureAt, "invalid"],
  ]) {
    for (const gateId of ["live_services", "payload_runtime", "production_recovery"]) {
      const evidence = freshEvidence();
      if (gateId === "live_services") {
        evidence.liveServices = evidence.liveServices.map((item) => ({ ...item, generated_at: timestamp }));
      } else if (gateId === "payload_runtime") {
        evidence.payloadRuntime.generated_at = timestamp;
      } else {
        evidence.productionRecovery = recoveryAt(timestamp);
      }

      const report = buildLaunchReadinessReport({
        generatedAt,
        ...evidence,
        liveServiceProvisioning: readyLiveServiceProvisioning,
        appState: readyAppState,
      });
      const gate = report.gates.find((item) => item.id === gateId);
      assert.equal(gate.status, "blocked", `${gateId} must block ${expectedFreshness} evidence`);
      const freshness = gateId === "live_services" ? gate.evidence.reports[0].freshness : gate.evidence.freshness;
      assert.equal(freshness.status, expectedFreshness);
      assert.equal(assertLaunchReadinessReport(report), true);
    }
  }
});

test("launch readiness validator rejects a hand-cleared stale runtime gate", () => {
  const generatedAt = "2026-08-10T12:00:00.000Z";
  const evidence = {
    liveServices: readyLiveServices.map((item) => ({ ...item, generated_at: generatedAt })),
    payloadRuntime: { ...readyPayloadRuntime, generated_at: generatedAt },
    productionRecovery: {
      ...readyProductionRecovery,
      report: signProductionRecoveryReport({ ...readyProductionRecovery.report, provenance: undefined, generated_at: generatedAt }, {
        privateKey: RECOVERY_KEYPAIR.privateKey,
      }),
    },
  };
  const report = buildLaunchReadinessReport({
    generatedAt,
    ...evidence,
    liveServiceProvisioning: readyLiveServiceProvisioning,
    appState: readyAppState,
  });
  const payloadGate = report.gates.find((item) => item.id === "payload_runtime");
  payloadGate.evidence.generated_at = "2026-08-01T12:00:00.000Z";

  assert.throws(() => assertLaunchReadinessReport(report), /fresh payload_runtime evidence/);
});

test("launch readiness blocks forged terminal-decision summaries when rows lack human review", () => {
  const routeMap = completeRouteMap();
  const decisions = routeMap.routes.map((route) => ({
    old_url: route.old_url,
    source_domain: route.source_domain,
    url_type: route.url_type,
    target_locale: null,
    target_path: null,
    decision: "approved_410",
    planned_status: 410,
    status: 410,
    reviewer: "",
    approved_at: "2026-07-05T00:00:00Z",
    equivalent_content: false,
    deployable: false,
    reason: "",
  }));
  const deployableRedirects = {
    summary: summarizeDeployableRedirects([]),
    decision_summary: summarizeLegacyRouteDecisions(decisions),
    redirects: [],
    decisions,
  };

  const report = buildLaunchReadinessReport({
    generatedAt: "2026-07-05T00:00:00Z",
    routeMap,
    deployableRedirects,
  });
  const redirectGate = report.gates.find((gate) => gate.id === "redirect_reviews");

  assert.equal(redirectGate.status, "blocked");
  assert.equal(redirectGate.evidence.invalid_terminal_decisions, 457);
  assert.equal(redirectGate.evidence.decision_artifact_valid, false);
});

test("launch readiness validator requires blocked gate next actions", () => {
  for (const nextActions of [undefined, [], [""]]) {
    const report = buildLaunchReadinessReport({ generatedAt: "2026-07-05T00:00:00Z" });
    const gate = report.gates.find((item) => item.id === "live_services");
    if (nextActions === undefined) {
      delete gate.next_actions;
    } else {
      gate.next_actions = nextActions;
    }

    assert.throws(
      () => assertLaunchReadinessReport(report),
      /Launch readiness blocked gate live_services must include next actions/,
    );
  }
});

test("launch readiness rejects hand-cleared external SEO blockers", () => {
  const routeMap = completeRouteMap();
  const deployableRedirects = readJson(["production", "data", "deployable-redirects.json"]);
  const seoEvidence = readJson(["production", "data", "seo-evidence.json"]);

  deployableRedirects.summary.total = routeMap.summary.mappedListings;
  completeTerminalDecisions(routeMap, deployableRedirects);
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
        productionRecovery: readyProductionRecovery,
      }),
    /SEO evidence missing required sources must match source evidence/,
  );
});

test("launch readiness validator rejects weak external SEO pass evidence", () => {
  const routeMap = completeRouteMap();
  const deployableRedirects = readJson(["production", "data", "deployable-redirects.json"]);
  deployableRedirects.summary.total = routeMap.summary.mappedListings;
  completeTerminalDecisions(routeMap, deployableRedirects);

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
    productionRecovery: readyProductionRecovery,
    monitoringRollback: readyMonitoringRollback,
  });
  const seoGate = report.gates.find((gate) => gate.id === "external_seo_exports");
  seoGate.evidence.sources.search_console.input_sha256 = "not-a-digest";

  assert.throws(() => assertLaunchReadinessReport(report), /input hash/);
  seoGate.evidence.sources.search_console.input_sha256 = "a".repeat(64);
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
  completeTerminalDecisions(routeMap, deployableRedirects);
  for (const patch of [
    { terminal_decisions: 0 },
    { decision_statuses: { 200: 0, 301: 164, 410: 292 } },
    { homepage_targets: 1 },
    { duplicate_old_urls: 1 },
  ]) {
    const report = buildLaunchReadinessReport({ generatedAt: "2026-07-05T00:00:00Z", routeMap, deployableRedirects });
    const redirectGate = report.gates.find((gate) => gate.id === "redirect_reviews");
    Object.assign(redirectGate.evidence, patch);

    assert.throws(() => assertLaunchReadinessReport(report), /terminal route decision/);
  }
});

test("launch readiness validator rejects weak sitemap pass evidence", () => {
  const report = buildLaunchReadinessReport({ generatedAt: "2026-07-05T00:00:00Z" });
  const sitemapGate = report.gates.find((gate) => gate.id === "localized_sitemap");
  sitemapGate.evidence.listing_entries = 165;

  assert.throws(() => assertLaunchReadinessReport(report), /complete approved route evidence/);
});

test("launch readiness validator rejects sitemap evidence without a truthful public view", () => {
  for (const patch of [
    { public: undefined },
    { public: { home_pages: 7, listing_entries: 0, location_pages: 0, seller_pages: 7, contact_pages: 7, guide_pages: 5, entries: 27 } },
    { public: { home_pages: 7, listing_entries: 200, location_pages: 0, seller_pages: 7, contact_pages: 7, guide_pages: 5, entries: 226 } },
  ]) {
    const report = buildLaunchReadinessReport({ generatedAt: "2026-07-05T00:00:00Z" });
    const sitemapGate = report.gates.find((gate) => gate.id === "localized_sitemap");
    Object.assign(sitemapGate.evidence, patch);

    assert.throws(() => assertLaunchReadinessReport(report), /runtime-public route evidence/);
  }
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
  assert.throws(
    () => assertLaunchReadinessReport({ ...report, gates: report.gates.filter((gate) => gate.id !== "production_recovery") }),
    /missing required gate production_recovery/,
  );
});

test("launch readiness validator rejects weak runtime smoke pass evidence", () => {
  const routeMap = completeRouteMap();
  const deployableRedirects = readJson(["production", "data", "deployable-redirects.json"]);
  deployableRedirects.summary.total = routeMap.summary.mappedListings;
  completeTerminalDecisions(routeMap, deployableRedirects);

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
    productionRecovery: readyProductionRecovery,
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
  completeTerminalDecisions(routeMap, deployableRedirects);

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
    productionRecovery: readyProductionRecovery,
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
  completeTerminalDecisions(routeMap, deployableRedirects);

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
  completeTerminalDecisions(routeMap, deployableRedirects);

  const report = buildLaunchReadinessReport({
    generatedAt: "2026-07-05T00:00:00Z",
    routeMap,
    deployableRedirects,
    seoEvidence: readySeoEvidenceFixture(),
    listingQualityReview: readyListingQualityReview,
    liveServices: readyLiveServices.map((item) =>
      item.source === "postgres_search_sync" ? { ...item, summary: { ...item.summary, total_operations: 0 } } : item,
    ),
    liveServiceProvisioning: readyLiveServiceProvisioning,
    appState: readyAppState,
    payloadRuntime: readyPayloadRuntime,
    productionRecovery: readyProductionRecovery,
  });

  assert.throws(() => assertLaunchReadinessReport(report), /search sync summary evidence/);
});

test("launch readiness validator rejects weak live service operation evidence", () => {
  const routeMap = completeRouteMap();
  const deployableRedirects = readJson(["production", "data", "deployable-redirects.json"]);
  const seoEvidence = readySeoEvidenceFixture();
  deployableRedirects.summary.total = routeMap.summary.mappedListings;
  completeTerminalDecisions(routeMap, deployableRedirects);

  const withoutQueryOperation = buildLaunchReadinessReport({
    generatedAt: "2026-07-05T00:00:00Z",
    routeMap,
    deployableRedirects,
    seoEvidence,
    listingQualityReview: readyListingQualityReview,
    liveServices: readyLiveServices.map((item) =>
      item.source === "postgres_search_query" ? { ...item, evidence: { ...item.evidence, engines: [] } } : item,
    ),
    liveServiceProvisioning: readyLiveServiceProvisioning,
    appState: readyAppState,
    payloadRuntime: readyPayloadRuntime,
    productionRecovery: readyProductionRecovery,
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
    productionRecovery: readyProductionRecovery,
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
    productionRecovery: readyProductionRecovery,
  });
  const weakSyncOperation = buildLaunchReadinessReport({
    generatedAt: "2026-07-05T00:00:00Z",
    routeMap,
    deployableRedirects,
    seoEvidence,
    listingQualityReview: readyListingQualityReview,
    liveServices: readyLiveServices.map((item) =>
      item.source === "postgres_search_sync"
        ? {
            ...item,
            evidence: {
              ...item.evidence,
              engines: item.evidence.engines.map((engine) =>
                engine.engine === "postgres"
                  ? { ...engine, operations: engine.operations.map((operation) => ({ ...operation, rows: -1 })) }
                  : engine,
              ),
            },
          }
        : item,
    ),
    liveServiceProvisioning: readyLiveServiceProvisioning,
    appState: readyAppState,
    payloadRuntime: readyPayloadRuntime,
    productionRecovery: readyProductionRecovery,
  });
  const wrongSyncPath = buildLaunchReadinessReport({
    generatedAt: "2026-07-05T00:00:00Z",
    routeMap,
    deployableRedirects,
    seoEvidence,
    listingQualityReview: readyListingQualityReview,
    liveServices: readyLiveServices.map((item) =>
      item.source === "postgres_search_sync"
        ? {
            ...item,
            evidence: {
              ...item.evidence,
              engines: item.evidence.engines.map((engine) =>
                engine.engine === "postgres"
                  ? {
                      ...engine,
                      operations: engine.operations.map((operation) =>
                        operation.method === "SELECT" ? { ...operation, method: "POST" } : operation,
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
    productionRecovery: readyProductionRecovery,
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
  completeTerminalDecisions(routeMap, deployableRedirects);

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
      checks: readyLiveServiceProvisioning.checks.filter((check) => check.id !== "postgres_database_target"),
    },
    appState: readyAppState,
    payloadRuntime: readyPayloadRuntime,
    productionRecovery: readyProductionRecovery,
  });

  assert.throws(() => assertLaunchReadinessReport(report), /provisioning check postgres_database_target/);
});

test("launch readiness blocks live services until provisioning passes", () => {
  const routeMap = completeRouteMap();
  const deployableRedirects = readJson(["production", "data", "deployable-redirects.json"]);
  deployableRedirects.summary.total = routeMap.summary.mappedListings;
  completeTerminalDecisions(routeMap, deployableRedirects);

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
      summary: { checks: 3, missing_env: ["DATABASE_URL"], placeholder_env: [], services: ["postgres_search", "hermes"] },
      checks: [{ id: "database_url", env: "DATABASE_URL", status: "missing_env" }],
      next_actions: ["Run npm run live:provisioning until all service checks pass."],
    },
    appState: readyAppState,
    payloadRuntime: readyPayloadRuntime,
    productionRecovery: readyProductionRecovery,
    monitoringRollback: readyMonitoringRollback,
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
  const routeMap = completeRouteMap();
  const deployableRedirects = readJson(["production", "data", "deployable-redirects.json"]);
  deployableRedirects.summary.total = routeMap.summary.mappedListings;
  completeTerminalDecisions(routeMap, deployableRedirects);
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
    productionRecovery: readyProductionRecovery,
    monitoringRollback: readyMonitoringRollback,
  });
  const monitoringGate = report.gates.find((gate) => gate.id === "monitoring_rollback");
  monitoringGate.evidence.machine_evidence = {
    ...readyMonitoringRollback,
    report: { ...readyMonitoringRollback.report, rollback: { ...readyMonitoringRollback.report.rollback, canary: { status: "fail" } } },
  };

  assert.throws(() => assertLaunchReadinessReport(report), /passing canary run/);
});

test("launch readiness validator binds listing preservation to the exact approved freeze", () => {
  const routeMap = completeRouteMap();
  const deployableRedirects = readJson(["production", "data", "deployable-redirects.json"]);
  deployableRedirects.summary.total = routeMap.summary.mappedListings;
  completeTerminalDecisions(routeMap, deployableRedirects);

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
    productionRecovery: readyProductionRecovery,
    monitoringRollback: readyMonitoringRollback,
  });

  const listingGate = report.gates.find((gate) => gate.id === "listing_quality_review");
  assert.equal(listingGate.status, "pass");
  assert.equal(listingGate.evidence.mode, "approved_launch_freeze_preservation");
  listingGate.evidence.artifact_sha256 = "0".repeat(64);
  assert.throws(() => assertLaunchReadinessReport(report), /approved launch-freeze preservation evidence/);
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

test("launch readiness accepts imported analytics before canonical SEO evidence exists", () => {
  const routeMap = completeRouteMap();
  const deployableRedirects = readJson(["production", "data", "deployable-redirects.json"]);
  const seoEvidence = readySeoEvidenceFixture();

  deployableRedirects.summary.total = routeMap.summary.mappedListings;
  completeTerminalDecisions(routeMap, deployableRedirects);
  Object.assign(seoEvidence.summary.sources.analytics_export, {
    status: "imported",
    input_bytes: 32,
    input_sha256: "b".repeat(64),
    template_copy: false,
    verified_zero_result: true,
  });
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
    productionRecovery: readyProductionRecovery,
    monitoringRollback: readyMonitoringRollback,
  });

  assert.equal(report.gates.find((gate) => gate.id === "monitoring_rollback").status, "pass");
  assert.equal(report.gates.find((gate) => gate.id === "external_seo_exports").status, "pass");
  assert.equal(assertLaunchReadinessReport(report), true);
  assert.deepEqual(report.blockers, []);
});

test("launch readiness blocks broad or duplicate deployable redirect exports", () => {
  const routeMap = completeRouteMap();
  const deployableRedirects = readJson(["production", "data", "deployable-redirects.json"]);
  const seoEvidence = readySeoEvidenceFixture();

  deployableRedirects.summary.total = routeMap.summary.mappedListings;
  completeTerminalDecisions(routeMap, deployableRedirects);
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
    productionRecovery: readyProductionRecovery,
    monitoringRollback: readyMonitoringRollback,
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
    productionRecovery: readyProductionRecovery,
    monitoringRollback: readyMonitoringRollback,
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
  const startedAt = Date.now();
  const result = spawnSync(process.execPath, [fromRoot("production", "scripts", "build-launch-readiness.mjs")], {
    cwd: fromRoot(),
    encoding: "utf8",
    env: { ...process.env, MS_REALTY_GENERATED_AT: "", MS_REALTY_LAUNCH_READINESS_OUTPUT_PATH: outputPath },
  });
  const completedAt = Date.now();

  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes(`Wrote launch readiness report to ${outputPath}`));
  const report = JSON.parse(fs.readFileSync(outputPath, "utf8"));
  assert.equal(assertLaunchReadinessReport(report), true);
  assert.ok(Date.parse(report.generated_at) >= startedAt && Date.parse(report.generated_at) <= completedAt);
  assert.deepEqual(report.blockers, [
    "live_services",
    "monitoring_rollback",
    "payload_runtime",
    "production_recovery",
  ]);
});

test("launch readiness build honors an explicit generated timestamp", () => {
  const outputPath = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-launch-readiness-time-`)}/launch-readiness.json`;
  const generatedAt = "2026-08-10T12:00:00.000Z";
  const result = spawnSync(process.execPath, [fromRoot("production", "scripts", "build-launch-readiness.mjs")], {
    cwd: fromRoot(),
    encoding: "utf8",
    env: {
      ...process.env,
      MS_REALTY_GENERATED_AT: generatedAt,
      MS_REALTY_LAUNCH_READINESS_OUTPUT_PATH: outputPath,
    },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(fs.readFileSync(outputPath, "utf8")).generated_at, generatedAt);
});

test("local readiness materializer promotes only fresh local Payload proof and preserves external blockers", async () => {
  const directory = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-local-readiness-`);
  const sourcePath = fromRoot("production", "data", "launch-readiness.json");
  const source = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
  const generatedAt = "2026-07-10T12:00:00.000Z";
  const syncPath = `${directory}/postgres-search-sync-report.json`;
  const queryPath = `${directory}/postgres-search-query-report.json`;
  const payloadPath = `${directory}/payload-runtime-report.json`;
  const outputPath = `${directory}/local-launch-readiness.json`;
  const sync = readJson(["production", "data", "postgres-search-sync-report.json.example"]);
  const query = readJson(["production", "data", "postgres-search-query-report.json.example"]);
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
  assert.deepEqual(result.report.blockers, [
    ...source.blockers.filter((id) => id !== "payload_runtime"),
    "local_preview_only",
  ]);
  assert.equal(result.report.gates.find((gate) => gate.id === "payload_runtime").status, "pass");
  assert.equal(result.report.gates.find((gate) => gate.id === "local_preview_only").status, "blocked");
  assert.deepEqual(
    result.report.local_preview.reports.map((report) => [report.id, report.status]),
    [
      ["postgres_search_sync", "pass"],
      ["postgres_search_query", "pass"],
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
  const payloadRuntimeReportPath = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-launch-payload-runtime-`)}/payload-runtime-report.json`;
  writeJson(payloadRuntimeReportPath, await buildPayloadRuntimeReport({ env: {}, generatedAt: "2026-07-05T00:00:00Z" }));
  const preflightEnv = {
    ...process.env,
    MS_REALTY_LISTING_QUALITY_REVIEW_PATH: "",
    MS_REALTY_PAYLOAD_RUNTIME_REPORT_PATH: payloadRuntimeReportPath,
  };
  const result = spawnSync(process.execPath, [fromRoot("production", "scripts", "launch-preflight.mjs")], {
    cwd: fromRoot(),
    encoding: "utf8",
    env: preflightEnv,
  });

  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /LAUNCH BLOCKED: live_services, monitoring_rollback, payload_runtime, production_recovery/,
  );
  assert.match(result.stderr, /postgres_search_sync: missing_report .*postgres-search-sync-report\.json/);
  assert.match(result.stderr, /hermes_draft_worker: missing_report .*hermes-draft-worker-report\.json/);
  assert.match(result.stderr, /payload_runtime: blocked_report .*payload-runtime-report\.json.*missing PAYLOAD_SECRET, DATABASE_URL/);
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
    env: { ...preflightEnv, MS_REALTY_LISTING_QUALITY_REVIEW_PATH: partialReviewPath },
  });

  assert.notEqual(withPartialReviewPath.status, 0);
  assert.doesNotMatch(withPartialReviewPath.stderr, /listing_quality_review/);

  const dir = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-launch-listing-review-`);
  const reviewPath = writeListingQualityReviewFixture(dir);
  const withReviewPath = spawnSync(process.execPath, [fromRoot("production", "scripts", "launch-preflight.mjs")], {
    cwd: fromRoot(),
    encoding: "utf8",
    env: { ...preflightEnv, MS_REALTY_LISTING_QUALITY_REVIEW_PATH: reviewPath },
  });

  assert.notEqual(withReviewPath.status, 0);
  assert.match(
    withReviewPath.stderr,
    /LAUNCH BLOCKED: live_services, monitoring_rollback, payload_runtime, production_recovery/,
  );
  assert.doesNotMatch(withReviewPath.stderr, /listing_quality_review/);
  assert.doesNotMatch(withReviewPath.stderr, /listing_quality_review next:/);

  const seoDir = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-launch-seo-evidence-`);
  writeCompleteSeoInputFixture(seoDir);
  const liveDir = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-launch-live-reports-`);
  const livePaths = writeLiveReportFixtures(liveDir);
  const liveProvisioningPath = await writeLiveProvisioningFixture(liveDir);
  const productionRecoveryPath = writeProductionRecoveryFixture(liveDir);
  const monitoringRollbackPath = writeMonitoringRollbackFixture(liveDir);
  const ready = spawnSync(process.execPath, [fromRoot("production", "scripts", "launch-preflight.mjs")], {
    cwd: fromRoot(),
    encoding: "utf8",
    env: {
      ...preflightEnv,
      MS_REALTY_LISTING_QUALITY_REVIEW_PATH: reviewPath,
      MS_REALTY_SEO_EVIDENCE_INPUT_DIR: seoDir,
      MS_REALTY_POSTGRES_SEARCH_SYNC_REPORT_PATH: livePaths.syncReportPath,
      MS_REALTY_POSTGRES_SEARCH_QUERY_REPORT_PATH: livePaths.queryReportPath,
      MS_REALTY_HERMES_WORKER_REPORT_PATH: livePaths.hermesReportPath,
      MS_REALTY_LIVE_SERVICE_PROVISIONING_REPORT_PATH: liveProvisioningPath,
      MS_REALTY_PRODUCTION_RECOVERY_REPORT_PATH: productionRecoveryPath,
      MS_REALTY_MONITORING_ROLLBACK_REPORT_PATH: monitoringRollbackPath,
    },
  });

  assert.notEqual(ready.status, 0);
  assert.match(ready.stderr, /LAUNCH BLOCKED: payload_runtime/);

  const seoOutputPath = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-launch-seo-output-`)}/seo-evidence.json`;
  const seoBuild = spawnSync(process.execPath, [fromRoot("production", "scripts", "build-seo-evidence.mjs")], {
    cwd: fromRoot(),
    encoding: "utf8",
    env: {
      ...preflightEnv,
      MS_REALTY_SEO_EVIDENCE_INPUT_DIR: seoDir,
      MS_REALTY_SEO_EVIDENCE_OUTPUT_PATH: seoOutputPath,
    },
  });
  assert.equal(seoBuild.status, 0, seoBuild.stderr);

  const readyFromSeoOutput = spawnSync(process.execPath, [fromRoot("production", "scripts", "launch-preflight.mjs")], {
    cwd: fromRoot(),
    encoding: "utf8",
    env: {
      ...preflightEnv,
      MS_REALTY_LISTING_QUALITY_REVIEW_PATH: reviewPath,
      MS_REALTY_SEO_EVIDENCE_OUTPUT_PATH: seoOutputPath,
      MS_REALTY_POSTGRES_SEARCH_SYNC_REPORT_PATH: livePaths.syncReportPath,
      MS_REALTY_POSTGRES_SEARCH_QUERY_REPORT_PATH: livePaths.queryReportPath,
      MS_REALTY_HERMES_WORKER_REPORT_PATH: livePaths.hermesReportPath,
      MS_REALTY_LIVE_SERVICE_PROVISIONING_REPORT_PATH: liveProvisioningPath,
      MS_REALTY_PRODUCTION_RECOVERY_REPORT_PATH: productionRecoveryPath,
      MS_REALTY_MONITORING_ROLLBACK_REPORT_PATH: monitoringRollbackPath,
    },
  });
  assert.notEqual(readyFromSeoOutput.status, 0);
  assert.match(readyFromSeoOutput.stderr, /LAUNCH BLOCKED: payload_runtime/);
});

test("launch preflight keeps the approved freeze authoritative over editable redirect exports", async () => {
  const generatedAt = new Date().toISOString();
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
  assert.doesNotMatch(blocked.stderr, /redirect_reviews/);

  const reviewPath = writeListingQualityReviewFixture(fs.mkdtempSync(`${os.tmpdir()}/ms-realty-launch-input-review-`));
  const seoDir = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-launch-input-seo-`);
  writeCompleteSeoInputFixture(seoDir);
  const liveDir = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-launch-input-live-`);
  const livePaths = writeLiveReportFixtures(liveDir, generatedAt);
  const liveProvisioningPath = await writeLiveProvisioningFixture(liveDir, generatedAt);
  const productionRecoveryPath = writeProductionRecoveryFixture(liveDir, generatedAt);
  const monitoringRollbackPath = writeMonitoringRollbackFixture(liveDir, generatedAt);
  const checklistPath = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-launch-input-checklist-`)}/launch-inputs.md`;
  const ready = spawnSync(process.execPath, [fromRoot("production", "scripts", "build-launch-input-checklist.mjs")], {
    cwd: fromRoot(),
    encoding: "utf8",
    env: {
      ...process.env,
      MS_REALTY_GENERATED_AT: generatedAt,
      MS_REALTY_LISTING_QUALITY_REVIEW_PATH: reviewPath,
      MS_REALTY_SEO_EVIDENCE_INPUT_DIR: seoDir,
      MS_REALTY_POSTGRES_SEARCH_SYNC_REPORT_PATH: livePaths.syncReportPath,
      MS_REALTY_POSTGRES_SEARCH_QUERY_REPORT_PATH: livePaths.queryReportPath,
      MS_REALTY_HERMES_WORKER_REPORT_PATH: livePaths.hermesReportPath,
      MS_REALTY_LIVE_SERVICE_PROVISIONING_REPORT_PATH: liveProvisioningPath,
      MS_REALTY_PRODUCTION_RECOVERY_REPORT_PATH: productionRecoveryPath,
      MS_REALTY_MONITORING_ROLLBACK_REPORT_PATH: monitoringRollbackPath,
      MS_REALTY_LAUNCH_INPUT_CHECKLIST_OUTPUT_PATH: checklistPath,
    },
  });
  const markdown = fs.readFileSync(checklistPath, "utf8");

  assert.equal(ready.status, 0, ready.stderr);
  assert.match(markdown, /Status: blocked/);
  assert.match(markdown, new RegExp(`Generated: ${generatedAt.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  assert.match(markdown, /Blockers: payload_runtime/);
  assert.match(markdown, /MS_REALTY_LAUNCH_INPUT_CHECKLIST_OUTPUT_PATH/);
});

test("live service report preflight fails missing reports and passes valid reports", () => {
  const missingDir = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-missing-live-reports-`);
  const missingEnv = {
    ...process.env,
    MS_REALTY_POSTGRES_SEARCH_SYNC_REPORT_PATH: `${missingDir}/postgres-search-sync-report.json`,
    MS_REALTY_POSTGRES_SEARCH_QUERY_REPORT_PATH: `${missingDir}/postgres-search-query-report.json`,
    MS_REALTY_HERMES_WORKER_REPORT_PATH: `${missingDir}/hermes-draft-worker-report.json`,
  };
  const missing = spawnSync(process.execPath, [fromRoot("production", "scripts", "validate-live-service-reports.mjs")], {
    cwd: fromRoot(),
    encoding: "utf8",
    env: missingEnv,
  });

  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /postgres_search_sync: missing_report/);
  assert.match(missing.stderr, /LIVE SERVICE PREFLIGHT FAILED/);
  assert.match(missing.stderr, /Next: run `npm run live:provisioning:preflight`/);

  const validDir = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-valid-live-reports-`);
  const generatedAt = new Date().toISOString();
  const paths = writeLiveReportFixtures(validDir, generatedAt);
  const result = validateLiveServiceReports(paths);
  assert.equal(result.ready, true);
  assert.equal(result.reports.every((report) => report.status === "pass"), true);

  const mismatchedDatabaseDir = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-mismatched-database-live-reports-`);
  const mismatchedDatabasePaths = writeLiveReportFixtures(mismatchedDatabaseDir, generatedAt);
  const mismatchedDatabaseQuery = JSON.parse(fs.readFileSync(mismatchedDatabasePaths.queryReportPath, "utf8"));
  const mismatchedDatabaseTarget = "postgres://db-b.ms-realty.bg:5432/ms_realty";
  mismatchedDatabaseQuery.summary.database_target = mismatchedDatabaseTarget;
  mismatchedDatabaseQuery.engines[0].database_target = mismatchedDatabaseTarget;
  mismatchedDatabaseQuery.engines[0].operation.url = mismatchedDatabaseTarget;
  fs.writeFileSync(mismatchedDatabasePaths.queryReportPath, `${JSON.stringify(mismatchedDatabaseQuery)}\n`);
  const mismatchedDatabaseResult = validateLiveServiceReports(mismatchedDatabasePaths);
  assert.equal(mismatchedDatabaseResult.ready, false);
  assert.equal(
    mismatchedDatabaseResult.reports.find((report) => report.source === "postgres_search_query").status,
    "invalid_report",
  );
  assert.match(
    mismatchedDatabaseResult.reports.find((report) => report.source === "postgres_search_query").error,
    /same canonical Postgres database identity/,
  );

  const expiredAt = new Date(Date.parse(generatedAt) + 7 * 24 * 60 * 60 * 1000 + 1).toISOString();
  const expired = validateLiveServiceReports({ ...paths, now: expiredAt });
  assert.equal(expired.ready, false);
  assert.equal(expired.reports.every((report) => report.status === "expired_report"), true);
  assert.equal(expired.reports[0].freshness.max_age_ms, 7 * 24 * 60 * 60 * 1000);
  const future = validateLiveServiceReports({
    ...paths,
    now: new Date(Date.parse(generatedAt) - 60_001).toISOString(),
  });
  assert.equal(future.reports.every((report) => report.status === "invalid_report"), true);

  const readyReport = buildLiveServicePreflightReport({ generatedAt, ...paths });
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
      index === 2 ? { ...report, source: "postgres_search_query" } : report,
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
  const expiredReport = buildLiveServicePreflightReport({ generatedAt: expiredAt, ...paths });
  assert.equal(assertLiveServicePreflightReport(expiredReport), true);
  assert.equal(expiredReport.summary.expired_report, 3);
  readyReport.reports.find((report) => report.source === "postgres_search_sync").summary.total_operations = 0;
  assert.throws(() => assertLiveServicePreflightReport(readyReport), /search sync summary evidence/);

  const valid = spawnSync(process.execPath, [fromRoot("production", "scripts", "validate-live-service-reports.mjs")], {
    cwd: fromRoot(),
    encoding: "utf8",
    env: {
      ...process.env,
      MS_REALTY_POSTGRES_SEARCH_SYNC_REPORT_PATH: paths.syncReportPath,
      MS_REALTY_POSTGRES_SEARCH_QUERY_REPORT_PATH: paths.queryReportPath,
      MS_REALTY_HERMES_WORKER_REPORT_PATH: paths.hermesReportPath,
    },
  });

  assert.equal(valid.status, 0, valid.stderr);
  assert.match(valid.stdout, /postgres_search_sync: pass/);
  assert.match(valid.stdout, /Live service reports valid/);

  const localDir = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-local-live-reports-`);
  const localPaths = writeLiveReportFixtures(localDir);
  const localSync = JSON.parse(fs.readFileSync(localPaths.syncReportPath, "utf8"));
  localSync.engines[0].operations[0].url = "http://127.0.0.1:8108/collections";
  fs.writeFileSync(localPaths.syncReportPath, `${JSON.stringify(localSync)}\n`);
  const localResult = validateLiveServiceReports(localPaths);
  assert.equal(localResult.ready, false);
  assert.equal(localResult.reports.find((report) => report.source === "postgres_search_sync").status, "invalid_report");
  assert.match(
    localResult.reports.find((report) => report.source === "postgres_search_sync").error,
    /database target/,
  );

  const mixedOriginDir = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-mixed-origin-live-reports-`);
  const mixedOriginPaths = writeLiveReportFixtures(mixedOriginDir);
  const mixedOriginSync = JSON.parse(fs.readFileSync(mixedOriginPaths.syncReportPath, "utf8"));
  mixedOriginSync.engines[0].operations.push({
    method: "SELECT",
    url: "postgres://staging-db.ms-realty.bg:5432/ms_realty",
    status: 200,
    rows: 1,
  });
  mixedOriginSync.summary.total_operations = 2;
  fs.writeFileSync(mixedOriginPaths.syncReportPath, `${JSON.stringify(mixedOriginSync)}\n`);
  const mixedOriginResult = validateLiveServiceReports(mixedOriginPaths);
  assert.equal(mixedOriginResult.ready, false);
  assert.equal(mixedOriginResult.reports.find((report) => report.source === "postgres_search_sync").status, "invalid_report");
  assert.match(
    mixedOriginResult.reports.find((report) => report.source === "postgres_search_sync").error,
    /authoritative Postgres snapshot operation/,
  );

  const mixedQueryOriginDir = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-mixed-query-origin-live-reports-`);
  const mixedQueryOriginPaths = writeLiveReportFixtures(mixedQueryOriginDir);
  const mixedQueryOrigin = JSON.parse(fs.readFileSync(mixedQueryOriginPaths.queryReportPath, "utf8"));
  mixedQueryOrigin.engines[0].operation.url = "postgres://staging-db.ms-realty.bg:5432/ms_realty";
  fs.writeFileSync(mixedQueryOriginPaths.queryReportPath, `${JSON.stringify(mixedQueryOrigin)}\n`);
  const mixedQueryOriginResult = validateLiveServiceReports(mixedQueryOriginPaths);
  assert.equal(mixedQueryOriginResult.ready, false);
  assert.equal(mixedQueryOriginResult.reports.find((report) => report.source === "postgres_search_query").status, "invalid_report");
  assert.match(
    mixedQueryOriginResult.reports.find((report) => report.source === "postgres_search_query").error,
    /database targets must match exactly/,
  );

  const reservedDir = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-reserved-live-reports-`);
  const reservedPaths = writeLiveReportFixtures(reservedDir);
  const reservedQuery = JSON.parse(fs.readFileSync(reservedPaths.queryReportPath, "utf8"));
  reservedQuery.summary.database_target = "postgres://example.com:5432/ms_realty";
  reservedQuery.engines[0].database_target = reservedQuery.summary.database_target;
  reservedQuery.engines[0].operation.url = reservedQuery.summary.database_target;
  fs.writeFileSync(reservedPaths.queryReportPath, `${JSON.stringify(reservedQuery)}\n`);
  const reservedHermes = JSON.parse(fs.readFileSync(reservedPaths.hermesReportPath, "utf8"));
  reservedHermes.provider.endpoint = "https://hermes.invalid/v1/chat/completions";
  fs.writeFileSync(reservedPaths.hermesReportPath, `${JSON.stringify(reservedHermes)}\n`);
  const reservedResult = validateLiveServiceReports(reservedPaths);
  assert.equal(reservedResult.ready, false);
  assert.equal(reservedResult.reports.find((report) => report.source === "postgres_search_query").status, "invalid_report");
  assert.equal(reservedResult.reports.find((report) => report.source === "hermes_draft_worker").status, "invalid_report");
  assert.match(
    reservedResult.reports.find((report) => report.source === "postgres_search_query").error,
    /localhost or placeholder database targets/,
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
            postgres_search_sync: "/tmp/wrong-postgres-search-sync-report.json",
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
        postgres_search_sync: "/tmp/postgres-search-sync-report.json",
      },
    },
    reports: report.reports.map((item) =>
      item.source === "postgres_search_sync"
        ? {
            ...item,
            status: "pass",
            path: "/tmp/postgres-search-sync-report.json",
            summary: { engines: 1, documents_per_engine: [167], total_operations: 0 },
          }
        : item,
    ),
  };
  assert.throws(() => assertLiveServicePreflightReport(partialPassReport), /search sync summary evidence/);
  report.summary.pass = 3;

  assert.throws(() => assertLiveServicePreflightReport(report), /status counts must match reports/);
});

test("live service evidence command refuses an unprovisioned production database target", async () => {
  await withLiveServiceServer(async (baseUrl) => {
    const dir = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-live-capture-`);
    const paths = {
      syncReportPath: `${dir}/postgres-search-sync-report.json`,
      queryReportPath: `${dir}/postgres-search-query-report.json`,
      hermesReportPath: `${dir}/hermes-draft-worker-report.json`,
    };
    const result = await runScript("run-live-service-evidence.mjs", {
      ...process.env,
      DATABASE_URL: "postgres://user:password@localhost/ms_realty",
      PAYLOAD_SECRET: "payload-runtime-secret",
      MS_REALTY_SEARCH_ENGINE: "postgres",
      HERMES_CHAT_COMPLETIONS_URL: `${baseUrl}/v1/chat/completions`,
      HERMES_API_KEY: "hermes-test",
      HERMES_DRAFT_LIMIT: "1",
      MS_REALTY_POSTGRES_SEARCH_SYNC_REPORT_PATH: paths.syncReportPath,
      MS_REALTY_POSTGRES_SEARCH_QUERY_REPORT_PATH: paths.queryReportPath,
      MS_REALTY_HERMES_WORKER_REPORT_PATH: paths.hermesReportPath,
      MS_REALTY_TRANSLATION_LEDGER_PATH: `${dir}/translation-tasks.jsonl`,
      MS_REALTY_HERMES_AUDIT_PATH: `${dir}/hermes-audit.jsonl`,
      MS_REALTY_AUDIT_LOG_PATH: `${dir}/audit-log.jsonl`,
    });

    assert.notEqual(result.status, 0);
    assert.match(
      result.stderr,
      /LIVE SERVICE EVIDENCE FAILED: live service provisioning must pass before capture: postgres_database_target, hermes_provider/,
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
    syncReportPath: `${missingDir}/postgres-search-sync-report.json`,
    queryReportPath: `${missingDir}/postgres-search-query-report.json`,
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
      MS_REALTY_POSTGRES_SEARCH_SYNC_REPORT_PATH: `${missingDir}/postgres-search-sync-report.json`,
      MS_REALTY_POSTGRES_SEARCH_QUERY_REPORT_PATH: `${missingDir}/postgres-search-query-report.json`,
      MS_REALTY_HERMES_WORKER_REPORT_PATH: `${missingDir}/hermes-draft-worker-report.json`,
      MS_REALTY_LIVE_SERVICE_PREFLIGHT_REPORT_PATH: missingOutputPath,
      MS_REALTY_GENERATED_AT: "2026-07-08T12:00:00Z",
    },
  });

  assert.equal(missingResult.status, 0, missingResult.stderr);
  assert.match(missingResult.stdout, /Live service reports blocked: postgres_search_sync, postgres_search_query, hermes_draft_worker/);
  assert.match(missingResult.stdout, /Missing reports: 3/);
  assert.match(missingResult.stdout, /Next: run `npm run live:provisioning:preflight`/);
  assert.equal(JSON.parse(fs.readFileSync(missingOutputPath, "utf8")).generated_at, "2026-07-08T12:00:00Z");

  const validDir = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-live-preflight-report-valid-`);
  const generatedAt = "2026-07-08T12:00:00Z";
  const paths = writeLiveReportFixtures(validDir, generatedAt);
  const outputPath = `${validDir}/live-service-preflight-report.json`;
  const result = spawnSync(process.execPath, [fromRoot("production", "scripts", "build-live-service-preflight-report.mjs")], {
    cwd: fromRoot(),
    encoding: "utf8",
    env: {
      ...process.env,
      MS_REALTY_POSTGRES_SEARCH_SYNC_REPORT_PATH: paths.syncReportPath,
      MS_REALTY_POSTGRES_SEARCH_QUERY_REPORT_PATH: paths.queryReportPath,
      MS_REALTY_HERMES_WORKER_REPORT_PATH: paths.hermesReportPath,
      MS_REALTY_LIVE_SERVICE_PREFLIGHT_REPORT_PATH: outputPath,
      MS_REALTY_GENERATED_AT: generatedAt,
    },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, new RegExp(outputPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  const readyReport = JSON.parse(fs.readFileSync(outputPath, "utf8"));
  assert.equal(readyReport.generated_at, generatedAt);
  assert.equal(assertLiveServicePreflightReport(readyReport), true);
  assert.equal(readyReport.ready, true);
  assert.equal(readyReport.summary.pass, 3);
});

test("live service report examples are templates, not launch evidence", () => {
  const result = validateLiveServiceReports({
    syncReportPath: fromRoot("production", "data", "postgres-search-sync-report.json.example"),
    queryReportPath: fromRoot("production", "data", "postgres-search-query-report.json.example"),
    hermesReportPath: fromRoot("production", "data", "hermes-draft-worker-report.json.example"),
  });

  assert.equal(result.ready, false);
  assert.equal(result.reports.every((report) => report.status === "example_report"), true);
  assert.match(fs.readFileSync(fromRoot(".gitignore"), "utf8"), /production\/data\/postgres-search-sync-report\.json/);
  assert.match(fs.readFileSync(fromRoot(".gitignore"), "utf8"), /production\/data\/postgres-search-query-report\.json/);
  assert.match(fs.readFileSync(fromRoot(".gitignore"), "utf8"), /production\/data\/hermes-draft-worker-report\.json/);

  const template = readLiveServiceReportTemplate("postgres_search_query");
  assert.equal(template.filename, "postgres-search-query-report.json.example");
  assert.equal(JSON.parse(template.json).example, true);
  assert.equal(JSON.parse(template.json).summary.engines, 1);
  assert.throws(() => readLiveServiceReportTemplate("../bad"), /Unknown live service report source/);
});

test("live service report import writes only validated source reports", () => {
  const dir = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-import-live-reports-`);
  const paths = writeLiveReportFixtures(dir);
  const queryReport = JSON.parse(fs.readFileSync(paths.queryReportPath, "utf8"));
  const outPath = `${dir}/imported-query-report.json`;

  const imported = writeLiveServiceReport("postgres_search_query", queryReport, { queryReportPath: outPath });
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
  assert.equal(importSummary.importedSource, "postgres_search_query");
  assert.equal(importSummary.importedReportStatus, "pass");
  const readyImportSummary = liveServiceImportSummary(imported, buildLiveServicePreflightReport(paths));
  assert.equal(readyImportSummary.ready, true);
  assert.match(readyImportSummary.nextActions.join(" "), /npm run live:preflight/);
  assert.deepEqual(
    importSummary.blockedReports.map((report) => report.source),
    ["postgres_search_sync", "hermes_draft_worker"],
  );
  assert.equal(JSON.parse(fs.readFileSync(outPath, "utf8")).summary.engines, 1);
  assert.throws(
    () => writeLiveServiceReport("postgres_search_query", { ...queryReport, example: true }, { queryReportPath: outPath }),
    /Example live service reports cannot be imported/,
  );
  assert.throws(
    () => writeLiveServiceReport("postgres_search_query", { ...queryReport, generated_at: "" }, { queryReportPath: outPath }),
    /valid generated_at/,
  );
  assert.throws(
    () =>
      writeLiveServiceReport(
        "postgres_search_query",
        { ...queryReport, api_key: "test-secret-key" },
        { queryReportPath: outPath },
      ),
    /must not persist secrets/,
  );
  assert.throws(
    () =>
      writeLiveServiceReport(
        "postgres_search_query",
        { ...queryReport, engines: [{ ...queryReport.engines[0], database_target: "postgres://typesense.local:5432/ms_realty" }] },
        { queryReportPath: outPath },
      ),
    /localhost or placeholder/,
  );
  assert.throws(
    () =>
      writeLiveServiceReport(
        "postgres_search_query",
        {
          evidence_scope: "live",
          generated_at: "2026-07-06T00:00:00Z",
          source: queryReport.source,
          summary: { engines: 1 },
          engines: [],
        },
        { queryReportPath: outPath },
      ),
    /exactly one Postgres engine/,
  );
  assert.throws(() => writeLiveServiceReport("../bad", queryReport), /Unknown live service report source/);
});

test("launch input checklist names remaining operator-owned blockers", async () => {
  const payloadRuntimeReportPath = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-checklist-payload-runtime-`)}/payload-runtime-report.json`;
  writeJson(payloadRuntimeReportPath, await buildPayloadRuntimeReport({ env: {}, generatedAt: "2026-07-05T00:00:00Z" }));
  const seoEvidence = readJson(["production", "data", "seo-evidence.json"]);
  const markdown = renderLaunchInputChecklist({
    generatedAt: "2026-07-05T00:00:00Z",
    launchReadiness: buildLaunchReadinessReport({
      generatedAt: "2026-07-05T00:00:00Z",
      payloadRuntime: payloadRuntimeState(payloadRuntimeReportPath),
    }),
    seoEvidence,
    redirectWorkbookCsv: fs.readFileSync(fromRoot("production", "data", "redirect-approval-workbook.csv"), "utf8"),
    deployableRedirects: approvedLaunchFreezeRouteArtifact(),
    routeMap: readJson(["production", "data", "legacy-route-map.json"]),
  });

  assert.match(markdown, /Status: blocked/);
  assert.match(markdown, /## Blocked Gate Actions/);
  assert.doesNotMatch(markdown, /external_seo_exports: Import Search Console/);
  assert.doesNotMatch(markdown, /listing_quality_review: Download \/api\/admin\/listing-quality-review-packet/);
  assert.match(markdown, /live_services: Run npm run live:provisioning:preflight/);
  assert.match(markdown, /payload_runtime: Run npm run payload:runtime/);
  assert.match(markdown, /production_recovery: Complete an encrypted off-site backup/);
  assert.match(markdown, /MS_REALTY_PRODUCTION_RECOVERY_REPORT_PATH/);
  assert.match(markdown, /Reviewed one-hop 301 redirects: 179/);
  assert.match(markdown, /Terminal route decisions: 457\/457 \(200: 10, 301: 179, 410: 268\)/);
  assert.match(markdown, /Remaining terminal route decisions: 0/);
  assert.match(markdown, /Legacy route coverage: 457\/457/);
  assert.match(markdown, /Unresolved legacy URLs: 0 \(none\)/);
  assert.match(markdown, /migration\/reviews\/redirect-approvals\.csv/);
  assert.match(markdown, /POST \/api\/admin\/redirect-approvals\/import/);
  assert.match(markdown, /MS_REALTY_REDIRECT_APPROVALS_PATH/);
  assert.match(markdown, /MS_REALTY_DEPLOYABLE_REDIRECTS_OUTPUT_PATH/);
  assert.match(markdown, /decision/);
  assert.match(markdown, /target_listing_id/);
  assert.match(markdown, /same_content_checklist/);
  assert.match(markdown, /Approval import columns: `old_url`, `decision`, `target_path`, `equivalent_content`, `reviewer`/);
  assert.match(markdown, /Missing required sources: search_console, yandex_webmaster, backlinks/);
  assert.match(
    markdown,
    new RegExp(`Crawl coverage: 457 URLs \\(page 104, post 42, taxonomy 146, listing 165\\); URLs with any evidence: ${seoEvidence.summary.urls_with_any_evidence}`),
  );
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
  assert.match(markdown, /postgres_search_sync: missing_report .*postgres-search-sync-report\.json/);
  assert.match(markdown, /postgres_search_query: missing_report .*postgres-search-query-report\.json/);
  assert.match(markdown, /hermes_draft_worker: missing_report .*hermes-draft-worker-report\.json/);
  assert.match(markdown, /blocked_report .*live-service-provisioning-report\.json.*missing DATABASE_URL, PAYLOAD_SECRET, MS_REALTY_SEARCH_ENGINE, HERMES_CHAT_COMPLETIONS_URL, HERMES_API_KEY/);
  assert.match(markdown, /DATABASE_URL/);
  assert.match(markdown, /PAYLOAD_SECRET/);
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
  assert.match(markdown, /postgres-search-sync-report\.json\.example/);
  assert.match(markdown, /live-service-report-template\?source=postgres_search_sync/);
  assert.match(markdown, /live-service-reports\/import\?source=postgres_search_sync/);
  assert.match(markdown, /MS_REALTY_POSTGRES_SEARCH_SYNC_REPORT_PATH/);
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
  assert.match(markdown, /Client admin routes: `\/admin\/login`/);
  assert.match(markdown, /`\/admin\/team`/);
  assert.match(markdown, /Payload collection `admins` with database-backed sessions/);
  assert.match(markdown, /internal `\/payload-admin` UI and direct `\/api\/admins\/\*` identity REST routes are hidden/);
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
  assert.match(markdown, /custom `\/admin` session, edge-boundary, Payload identity\/config, and database evidence must all pass/);
  assert.match(markdown, /hidden Payload Admin UI is not a launch requirement/);
  assert.match(markdown, /production\/data\/listing-quality-workbook\.csv/);
  assert.match(markdown, /Current review evidence/);
  assert.match(markdown, /pass .*production\/data\/launch-freeze\.json.*expected 165.*reviewed 165.*missing 0/);
  assert.match(markdown, /Pending review sample:\n- none/);
  assert.match(markdown, /production\/data\/listing-quality-review-packet\.json/);
  assert.match(markdown, /production\/data\/listing-quality-review-draft\.csv/);
  assert.match(markdown, /listing_quality\.thin_public_gallery: 18/);
  assert.match(markdown, /listing_quality\.missing_area: 165/);
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
  assert.match(markdown, /Manual Source Audit \(Non-Approval Evidence\)/);
  assert.match(markdown, /Coverage: 165\/165 source rows \(pass: 30, review: 75, hold: 52, source unavailable: 8\)/);
  assert.match(markdown, /Broker approvals in this artifact: 0; broker confirmations still required: 165/);
  assert.match(markdown, /30 candidates, 0 publish-ready; selection: manual_source_pass_then_live_selection_score; overlap with prior automatic shortlist: 6/);
  assert.match(markdown, /does not clear `listing_quality_review`/);
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
