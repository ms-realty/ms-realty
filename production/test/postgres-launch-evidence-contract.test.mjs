import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {
  DEFAULT_POSTGRES_SEARCH_QUERY_REPORT,
  DEFAULT_POSTGRES_SEARCH_SYNC_REPORT,
} from "../lib/search-engine-sync.mjs";
import {
  liveServiceReports,
  readLiveServiceReportTemplate,
} from "../lib/launch-readiness.mjs";
import {
  assertLiveServiceProvisioningReport,
  buildLiveServiceProvisioningReport,
} from "../lib/live-service-provisioning.mjs";
import { buildLaunchServiceRequirements, HERMES_LAUNCH_REQUIRED } from "../lib/launch-service-contract.mjs";

function healthyHermesFetch(url) {
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

test("canonical live search evidence names Postgres explicitly", () => {
  assert.equal(path.basename(DEFAULT_POSTGRES_SEARCH_SYNC_REPORT), "postgres-search-sync-report.json");
  assert.equal(path.basename(DEFAULT_POSTGRES_SEARCH_QUERY_REPORT), "postgres-search-query-report.json");
  assert.deepEqual(
    liveServiceReports().map((report) => report.source),
    ["postgres_search_sync", "postgres_search_query", "hermes_draft_worker"],
  );

  const canonical = readLiveServiceReportTemplate("postgres_search_sync");
  const legacy = readLiveServiceReportTemplate("typesense_meilisearch_sync");
  assert.equal(canonical.source, "postgres_search_sync");
  assert.equal(canonical.filename, "postgres-search-sync-report.json.example");
  assert.equal(legacy.source, canonical.source);
  assert.equal(legacy.filename, canonical.filename);
});

test("Hermes remains an explicit, isolated launch decision", () => {
  assert.equal(HERMES_LAUNCH_REQUIRED, true);
  assert.deepEqual(buildLaunchServiceRequirements({ hermesRequired: false }), {
    reportSources: ["postgres_search_sync", "postgres_search_query"],
    provisioningChecks: ["database_url", "payload_secret", "search_engine", "postgres_database_target"],
    provisioningServices: ["postgres_search"],
  });
});

test("live provisioning requires Postgres and Hermes without Typesense or Meilisearch", async () => {
  const blocked = await buildLiveServiceProvisioningReport({
    env: {},
    fetchImpl: async () => {
      throw new Error("fetch should not run without Hermes configuration");
    },
    generatedAt: "2026-08-13T00:00:00.000Z",
  });

  assert.equal(assertLiveServiceProvisioningReport(blocked), true);
  assert.deepEqual(blocked.summary.services, ["postgres_search", "hermes"]);
  assert.ok(blocked.summary.missing_env.includes("DATABASE_URL"));
  assert.ok(blocked.summary.missing_env.includes("PAYLOAD_SECRET"));
  assert.ok(blocked.summary.missing_env.includes("MS_REALTY_SEARCH_ENGINE"));
  assert.equal(blocked.summary.missing_env.some((name) => /TYPESENSE|MEILI/.test(name)), false);
  assert.equal(blocked.checks.some((check) => /typesense|meili/i.test(check.id)), false);

  const ready = await buildLiveServiceProvisioningReport({
    env: {
      DATABASE_URL: "postgresql://ms_realty:secret@ep-late-river.eu-central-1.aws.neon.tech/ms_realty?sslmode=require",
      PAYLOAD_SECRET: "payload-secret-value",
      MS_REALTY_SEARCH_ENGINE: "postgres",
      HERMES_CHAT_COMPLETIONS_URL: "https://hermes.ms-realty.bg/v1/chat/completions",
      HERMES_API_KEY: "hermes-secret",
    },
    fetchImpl: healthyHermesFetch,
    generatedAt: "2026-08-13T00:00:00.000Z",
  });

  assert.equal(assertLiveServiceProvisioningReport(ready), true);
  assert.equal(ready.ready, true);
  assert.equal(ready.checks.find((check) => check.id === "postgres_database_target")?.database_target,
    "postgresql://ep-late-river.eu-central-1.aws.neon.tech:5432/ms_realty");
  assert.equal(JSON.stringify(ready).includes("ms_realty:secret"), false);
});

test("live provisioning cannot be ready when production search selects a legacy engine", async () => {
  const report = await buildLiveServiceProvisioningReport({
    env: {
      DATABASE_URL: "postgresql://ms_realty:secret@ep-late-river.eu-central-1.aws.neon.tech/ms_realty?sslmode=require",
      PAYLOAD_SECRET: "payload-secret-value",
      MS_REALTY_SEARCH_ENGINE: "typesense",
      TYPESENSE_URL: "https://legacy-search.invalid",
      TYPESENSE_API_KEY: "legacy-secret",
      HERMES_CHAT_COMPLETIONS_URL: "https://hermes.ms-realty.bg/v1/chat/completions",
      HERMES_API_KEY: "hermes-secret",
    },
    fetchImpl: healthyHermesFetch,
    generatedAt: "2026-08-13T00:00:00.000Z",
  });

  assert.equal(report.ready, false);
  assert.equal(report.status, "blocked");
  assert.deepEqual(report.checks.find((check) => check.id === "search_engine"), {
    id: "search_engine",
    env: "MS_REALTY_SEARCH_ENGINE",
    status: "fail",
    error: "MS_REALTY_SEARCH_ENGINE must be postgres in production",
  });
  assert.equal(report.checks.some((check) => /typesense|meili/i.test(check.id)), false);
});
