import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { spawnSync } from "node:child_process";
import {
  assertLiveServiceProvisioningReport,
  buildLiveServiceProvisioningReport,
  liveServiceProvisioningState,
  writeLiveServiceProvisioningReport,
} from "../lib/live-service-provisioning.mjs";
import { fromRoot } from "../lib/paths.mjs";

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

const readyEnv = {
  DATABASE_URL: "postgresql://ms_realty:database-password@ep-late-river.eu-central-1.aws.neon.tech/ms_realty?sslmode=require",
  PAYLOAD_SECRET: "payload-runtime-secret",
  MS_REALTY_SEARCH_ENGINE: "postgres",
  HERMES_CHAT_COMPLETIONS_URL: "https://hermes.ms-realty.bg/v1/chat/completions",
  HERMES_API_KEY: "hermes-test-key",
};

test("live service provisioning fails closed on Postgres/Payload and Hermes env", async () => {
  const report = await buildLiveServiceProvisioningReport({
    env: {},
    fetchImpl: async () => {
      throw new Error("fetch should not run without Hermes configuration");
    },
    generatedAt: "2026-08-13T00:00:00.000Z",
  });

  assert.equal(assertLiveServiceProvisioningReport(report), true);
  assert.equal(report.ready, false);
  assert.deepEqual(report.summary.services, ["postgres_search", "hermes"]);
  assert.deepEqual(report.summary.placeholder_env, []);
  assert.deepEqual(report.summary.missing_env, [
    "DATABASE_URL",
    "PAYLOAD_SECRET",
    "MS_REALTY_SEARCH_ENGINE",
    "HERMES_CHAT_COMPLETIONS_URL",
    "HERMES_API_KEY",
  ]);
  assert.equal(report.checks.find((check) => check.id === "postgres_database_target").status, "missing_env");
  assert.equal(report.checks.some((check) => /typesense|meili/i.test(check.id)), false);
  assert.equal(report.hermes.safety.can_publish, false);
  assert.equal(report.hermes.safety.can_send_customer_messages, false);
  assert.ok(report.next_actions.some((action) => action.includes("live:provisioning")));
});

test("live service provisioning records a redacted Neon target and authenticated Hermes health", async () => {
  const calls = [];
  const report = await buildLiveServiceProvisioningReport({
    env: readyEnv,
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      return healthyHermesFetch(url);
    },
    generatedAt: "2026-08-13T00:00:00.000Z",
  });

  assert.equal(assertLiveServiceProvisioningReport(report), true);
  assert.equal(report.ready, true);
  assert.equal(report.status, "ready");
  assert.equal(report.checks.find((check) => check.id === "postgres_database_target").database_target,
    "postgresql://ep-late-river.eu-central-1.aws.neon.tech:5432/ms_realty");
  assert.equal(calls.length, 2);
  assert.equal(calls.at(-1).options.headers.authorization, "Bearer hermes-test-key");
  const serialized = JSON.stringify(report);
  assert.equal(serialized.includes("database-password"), false);
  assert.equal(serialized.includes("payload-runtime-secret"), false);
  assert.equal(serialized.includes("hermes-test-key"), false);
});

test("live service provisioning permits only the private production Hermes HTTP service", async () => {
  const internal = await buildLiveServiceProvisioningReport({
    env: { ...readyEnv, HERMES_CHAT_COMPLETIONS_URL: "http://hermes-agent:8642/v1/chat/completions" },
    fetchImpl: healthyHermesFetch,
  });
  const external = await buildLiveServiceProvisioningReport({
    env: { ...readyEnv, HERMES_CHAT_COMPLETIONS_URL: "http://hermes.ms-realty.bg/v1/chat/completions" },
    fetchImpl: healthyHermesFetch,
  });

  assert.equal(internal.ready, true);
  assert.equal(external.ready, false);
  assert.match(external.checks.find((check) => check.id === "hermes_provider").error, /must use HTTPS/);
});

test("live service provisioning rejects placeholder, local, and credential-free database targets", async () => {
  const placeholder = await buildLiveServiceProvisioningReport({
    env: { ...readyEnv, DATABASE_URL: "postgresql://user:pass@example.com/database" },
    fetchImpl: healthyHermesFetch,
  });
  const local = await buildLiveServiceProvisioningReport({
    env: { ...readyEnv, DATABASE_URL: "postgresql://user:pass@localhost/database" },
    fetchImpl: healthyHermesFetch,
  });
  const noCredentials = await buildLiveServiceProvisioningReport({
    env: { ...readyEnv, DATABASE_URL: "postgresql://ep-late-river.eu-central-1.aws.neon.tech/database" },
    fetchImpl: healthyHermesFetch,
  });

  assert.deepEqual(placeholder.summary.placeholder_env, ["DATABASE_URL"]);
  assert.equal(placeholder.checks.find((check) => check.id === "postgres_database_target").status, "missing_env");
  assert.match(local.checks.find((check) => check.id === "postgres_database_target").error, /localhost or placeholder/);
  assert.match(noCredentials.checks.find((check) => check.id === "postgres_database_target").error, /credentials/);
});

test("live service provisioning keeps Hermes draft-only and rejects non-chat endpoints", async () => {
  const report = await buildLiveServiceProvisioningReport({
    env: { ...readyEnv, HERMES_CHAT_COMPLETIONS_URL: "https://hermes.ms-realty.bg/v1/models" },
    fetchImpl: healthyHermesFetch,
  });

  assert.equal(report.ready, false);
  assert.equal(report.checks.find((check) => check.id === "hermes_provider").status, "fail");
  assert.match(report.checks.find((check) => check.id === "hermes_provider").error, /\/v1\/chat\/completions/);
  assert.equal(report.hermes.safety.draft_only, true);
  assert.equal(report.hermes.safety.human_approval_required, true);
});

test("live service provisioning validator requires the canonical shape", async () => {
  const blocked = await buildLiveServiceProvisioningReport({ env: {}, generatedAt: "2026-08-13T00:00:00.000Z" });
  const ready = await buildLiveServiceProvisioningReport({
    env: readyEnv,
    fetchImpl: healthyHermesFetch,
    generatedAt: "2026-08-13T00:00:00.000Z",
  });

  assert.throws(() => assertLiveServiceProvisioningReport({ ...blocked, generated_at: "" }), /valid generated_at/);
  assert.throws(
    () => assertLiveServiceProvisioningReport({ ...blocked, checks: blocked.checks.filter((check) => check.id !== "database_url") }),
    /missing required check database_url/,
  );
  assert.throws(
    () => assertLiveServiceProvisioningReport({ ...blocked, checks: [...blocked.checks, blocked.checks[0]] }),
    /duplicate check database_url/,
  );
  assert.throws(
    () => assertLiveServiceProvisioningReport({ ...blocked, summary: { ...blocked.summary, services: ["hermes"] } }),
    /required services/,
  );
  assert.throws(
    () => assertLiveServiceProvisioningReport({ ...blocked, summary: { ...blocked.summary, missing_env: [] } }),
    /missing env summary/,
  );
  assert.throws(
    () => assertLiveServiceProvisioningReport({ ...ready, checks: ready.checks.map((check) =>
      check.id === "postgres_database_target" ? { ...check, database_target: readyEnv.DATABASE_URL } : check) }),
    /redacted/,
  );
  for (const suffix of ["?sslpassword=secret", "#secret-fragment"]) {
    assert.throws(
      () => assertLiveServiceProvisioningReport({ ...ready, checks: ready.checks.map((check) =>
        check.id === "postgres_database_target" ? { ...check, database_target: `${check.database_target}${suffix}` } : check) }),
      /exact redacted Postgres target/,
    );
  }
  assert.throws(
    () => assertLiveServiceProvisioningReport({ ...ready, hermes: { ...ready.hermes, safety: { ...ready.hermes.safety, can_publish: true } } }),
    /draft-only safety/,
  );
  assert.throws(() => assertLiveServiceProvisioningReport({ ...ready, next_actions: [] }), /next actions/);
});

test("live service provisioning writer and CLIs preserve redacted evidence", async () => {
  const dir = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-live-provisioning-`);
  const reportPath = `${dir}/live-service-provisioning-report.json`;
  const report = await buildLiveServiceProvisioningReport({
    env: readyEnv,
    fetchImpl: healthyHermesFetch,
    generatedAt: "2026-08-13T00:00:00.000Z",
  });
  writeLiveServiceProvisioningReport(report, reportPath);

  const written = fs.readFileSync(reportPath, "utf8");
  assert.equal(written.includes("database-password"), false);
  assert.equal(written.includes("hermes-test-key"), false);
  assert.equal(liveServiceProvisioningState(reportPath).status, "pass");
  assert.equal(liveServiceProvisioningState(`${dir}/missing.json`).status, "missing_report");
  fs.writeFileSync(`${dir}/invalid.json`, "{}\n");
  assert.equal(liveServiceProvisioningState(`${dir}/invalid.json`).status, "invalid_report");

  const preflight = spawnSync(process.execPath, [fromRoot("production", "scripts", "validate-live-service-provisioning-report.mjs")], {
    cwd: fromRoot(),
    encoding: "utf8",
    env: { ...process.env, MS_REALTY_LIVE_SERVICE_PROVISIONING_REPORT_PATH: reportPath },
  });
  assert.equal(preflight.status, 0, preflight.stderr);
  assert.match(preflight.stdout, /Live service provisioning report valid/);

  const cliPath = `${dir}/blocked.json`;
  const build = spawnSync(process.execPath, [fromRoot("production", "scripts", "build-live-service-provisioning-report.mjs")], {
    cwd: fromRoot(),
    encoding: "utf8",
    env: {
      PATH: process.env.PATH,
      MS_REALTY_GENERATED_AT: "2026-08-13T00:00:00.000Z",
      MS_REALTY_LIVE_SERVICE_PROVISIONING_REPORT_PATH: cliPath,
    },
  });
  assert.equal(build.status, 0, build.stderr);
  assert.match(build.stdout, /Live service provisioning blocked: database_url, payload_secret, search_engine, postgres_database_target/);
  assert.match(build.stdout, /Missing env: DATABASE_URL, PAYLOAD_SECRET, MS_REALTY_SEARCH_ENGINE/);
  assert.match(build.stdout, /Next: set real Postgres\/Payload and Hermes provider env/);
  assert.equal(assertLiveServiceProvisioningReport(JSON.parse(fs.readFileSync(cliPath, "utf8"))), true);
});
