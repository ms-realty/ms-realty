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

function healthyFetch(url, options = {}) {
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

test("live service provisioning report fails closed until service env is configured", async () => {
  const report = await buildLiveServiceProvisioningReport({
    env: {},
    fetchImpl: async () => {
      throw new Error("fetch should not be called without URLs and API keys");
    },
    generatedAt: "2026-07-06T00:00:00Z",
  });

  assert.equal(assertLiveServiceProvisioningReport(report), true);
  assert.equal(report.ready, false);
  assert.equal(report.status, "blocked");
  assert.deepEqual(report.summary.services, ["typesense", "meilisearch", "hermes"]);
  assert.deepEqual(report.summary.placeholder_env, []);
  assert.ok(report.summary.missing_env.includes("TYPESENSE_URL"));
  assert.ok(report.summary.missing_env.includes("TYPESENSE_API_KEY"));
  assert.ok(report.summary.missing_env.includes("MEILI_URL"));
  assert.ok(report.summary.missing_env.includes("MEILI_API_KEY"));
  assert.ok(report.summary.missing_env.includes("HERMES_CHAT_COMPLETIONS_URL"));
  assert.ok(report.summary.missing_env.includes("HERMES_API_KEY"));
  assert.equal(report.checks.find((check) => check.id === "typesense_health").status, "missing_env");
  assert.equal(report.checks.find((check) => check.id === "meilisearch_health").status, "missing_env");
  assert.equal(report.hermes.official_url, "https://hermes-agent.nousresearch.com/");
  assert.match(report.hermes.install_command, /hermes-agent\.nousresearch\.com\/install\.sh/);
  assert.ok(report.hermes.setup_commands.includes("hermes setup --portal"));
  assert.equal(report.hermes.gateway_setup_command, "hermes gateway setup");
  assert.deepEqual(report.hermes.vllm.launch_command.slice(-3), ["--enable-auto-tool-choice", "--tool-call-parser", "hermes"]);
  assert.equal(report.hermes.vllm.chat_completions_path, "/v1/chat/completions");
  assert.equal(report.hermes.safety.can_publish, false);
  assert.ok(report.hermes.next_actions.some((action) => action.includes("Install Hermes Agent")));
  assert.ok(report.next_actions.some((action) => action.includes("live:provisioning")));
});

test("live service provisioning report verifies live endpoints without persisting secrets", async () => {
  const calls = [];
  const report = await buildLiveServiceProvisioningReport({
    env: {
      TYPESENSE_URL: "https://user:pass@typesense.internal?token=secret",
      TYPESENSE_API_KEY: "typesense-test-secret",
      MEILI_URL: "https://user:pass@meili.internal?token=secret",
      MEILI_API_KEY: "meili-test-secret",
      HERMES_CHAT_COMPLETIONS_URL: "https://hermes.ms-realty.bg/v1/chat/completions",
      HERMES_API_KEY: "hermes-test-secret",
    },
    fetchImpl: async (url, options) => {
      calls.push({ url, headers: options.headers });
      return healthyFetch(url, options);
    },
    generatedAt: "2026-07-06T00:00:00Z",
  });

  assert.equal(assertLiveServiceProvisioningReport(report), true);
  assert.equal(report.ready, true);
  assert.equal(report.status, "ready");
  assert.equal(report.summary.missing_env.length, 0);
  assert.equal(report.summary.placeholder_env.length, 0);
  assert.equal(report.checks.find((check) => check.id === "typesense_health").redacted_url, "https://typesense.internal");
  assert.equal(report.checks.find((check) => check.id === "meilisearch_health").redacted_url, "https://meili.internal");
  assert.equal(calls.length, 4);
  assert.equal(calls[3].headers.authorization, "Bearer hermes-test-secret");
  const serialized = JSON.stringify(report);
  assert.equal(serialized.includes("typesense-test-secret"), false);
  assert.equal(serialized.includes("meili-test-secret"), false);
  assert.equal(serialized.includes("user:pass"), false);
  assert.equal(serialized.includes("token=secret"), false);
});

test("live service provisioning rejects copied placeholder env values before health checks", async () => {
  const report = await buildLiveServiceProvisioningReport({
    env: {
      TYPESENSE_URL: "https://example.com",
      TYPESENSE_API_KEY: "replace-with-typesense-key",
      MEILI_URL: "https://meili.internal",
      MEILI_API_KEY: "meili-key",
      HERMES_CHAT_COMPLETIONS_URL: "https://hermes.ms-realty.bg/v1/chat/completions",
      HERMES_API_KEY: "hermes-key",
    },
    fetchImpl: async (url) => {
      assert.equal(
        String(url).startsWith("https://meili.internal") || String(url).startsWith("https://hermes.ms-realty.bg"),
        true,
      );
      return healthyFetch(url);
    },
    generatedAt: "2026-07-06T00:00:00Z",
  });

  assert.equal(assertLiveServiceProvisioningReport(report), true);
  assert.equal(report.ready, false);
  assert.deepEqual(report.summary.placeholder_env, ["TYPESENSE_URL", "TYPESENSE_API_KEY"]);
  assert.equal(report.checks.find((check) => check.id === "typesense_health").status, "missing_env");
});

test("live service provisioning preflight CLI explains blocked remediation", async () => {
  const dir = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-live-provisioning-preflight-`);
  const reportPath = `${dir}/live-service-provisioning-report.json`;
  writeLiveServiceProvisioningReport(
    await buildLiveServiceProvisioningReport({
      env: {},
      fetchImpl: async () => {
        throw new Error("fetch should not be called without URLs and API keys");
      },
      generatedAt: "2026-07-06T00:00:00Z",
    }),
    reportPath,
  );
  const result = spawnSync(process.execPath, [fromRoot("production", "scripts", "validate-live-service-provisioning-report.mjs")], {
    cwd: fromRoot(),
    encoding: "utf8",
    env: { ...process.env, MS_REALTY_LIVE_SERVICE_PROVISIONING_REPORT_PATH: reportPath },
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /LIVE SERVICE PROVISIONING FAILED/);
  assert.match(result.stderr, /Next: set TYPESENSE_URL, TYPESENSE_API_KEY, MEILI_URL, MEILI_API_KEY, HERMES_CHAT_COMPLETIONS_URL, and HERMES_API_KEY/);
});

test("live service provisioning rejects local service URLs before capture", async () => {
  const calls = [];
  const report = await buildLiveServiceProvisioningReport({
    env: {
      TYPESENSE_URL: "http://127.0.0.1:8108",
      TYPESENSE_API_KEY: "typesense-key",
      MEILI_URL: "https://meili.internal",
      MEILI_API_KEY: "meili-key",
      HERMES_CHAT_COMPLETIONS_URL: "http://localhost:8000/v1/chat/completions",
      HERMES_API_KEY: "hermes-key",
    },
    fetchImpl: async (url) => {
      calls.push(String(url));
      return { ok: true, status: 200 };
    },
    generatedAt: "2026-07-06T00:00:00Z",
  });

  assert.equal(assertLiveServiceProvisioningReport(report), true);
  assert.equal(report.ready, false);
  assert.equal(report.checks.find((check) => check.id === "typesense_health").status, "fail");
  assert.match(report.checks.find((check) => check.id === "typesense_health").error, /localhost or placeholder/);
  assert.equal(report.checks.find((check) => check.id === "hermes_provider").status, "fail");
  assert.match(report.checks.find((check) => check.id === "hermes_provider").error, /localhost or placeholder/);
  assert.deepEqual(calls, ["https://meili.internal/health"]);
});

test("live service provisioning rejects non-chat Hermes endpoints before capture", async () => {
  const report = await buildLiveServiceProvisioningReport({
    env: {
      TYPESENSE_URL: "https://typesense.internal",
      TYPESENSE_API_KEY: "typesense-key",
      MEILI_URL: "https://meili.internal",
      MEILI_API_KEY: "meili-key",
      HERMES_CHAT_COMPLETIONS_URL: "https://hermes.ms-realty.bg/v1/models",
      HERMES_API_KEY: "hermes-key",
    },
    fetchImpl: healthyFetch,
    generatedAt: "2026-07-06T00:00:00Z",
  });

  assert.equal(assertLiveServiceProvisioningReport(report), true);
  assert.equal(report.ready, false);
  assert.equal(report.status, "blocked");
  assert.equal(report.checks.find((check) => check.id === "hermes_provider").status, "fail");
  assert.match(report.checks.find((check) => check.id === "hermes_provider").error, /\/v1\/chat\/completions/);
});

test("live service provisioning report requires complete evidence shape", async () => {
  const report = await buildLiveServiceProvisioningReport({
    env: {},
    fetchImpl: async () => {
      throw new Error("fetch should not be called without URLs and API keys");
    },
    generatedAt: "2026-07-06T00:00:00Z",
  });

  assert.throws(() => assertLiveServiceProvisioningReport({ ...report, generated_at: "" }), /valid generated_at/);
  assert.throws(
    () => assertLiveServiceProvisioningReport({ ...report, checks: report.checks.filter((check) => check.id !== "typesense_health") }),
    /missing required check typesense_health/,
  );
  assert.throws(
    () => assertLiveServiceProvisioningReport({ ...report, checks: [...report.checks, report.checks[0]] }),
    /duplicate check typesense_url/,
  );
  assert.throws(
    () =>
      assertLiveServiceProvisioningReport({
        ...report,
        checks: report.checks.map((check) => (check.id === "typesense_health" ? { ...check, status: "skipped" } : check)),
      }),
    /unknown status/,
  );
  for (const [id, env] of [
    ["typesense_url", "TYPESENSE_URL"],
    ["typesense_api_key", "TYPESENSE_API_KEY"],
    ["meili_url", "MEILI_URL"],
    ["meili_api_key", "MEILI_API_KEY"],
  ]) {
    assert.throws(
      () =>
        assertLiveServiceProvisioningReport({
          ...report,
          checks: report.checks.map((check) => (check.id === id ? { ...check, env: "WRONG_ENV" } : check)),
        }),
      new RegExp(`${id} check must reference ${env}`),
    );
  }
  assert.throws(
    () => assertLiveServiceProvisioningReport({ ...report, summary: { ...report.summary, services: ["typesense"] } }),
    /required services/,
  );
  assert.throws(
    () => assertLiveServiceProvisioningReport({ ...report, summary: { ...report.summary, missing_env: [] } }),
    /missing env summary/,
  );
  assert.throws(
    () => assertLiveServiceProvisioningReport({ ...report, summary: { ...report.summary, placeholder_env: ["TYPESENSE_URL"] } }),
    /placeholder env summary/,
  );
  assert.throws(
    () =>
      assertLiveServiceProvisioningReport({
        ...report,
        summary: {
          ...report.summary,
          missing_env: report.summary.missing_env.filter((env) => !env.startsWith("HERMES_")),
        },
        checks: report.checks.map((check) =>
          check.id === "hermes_provider" ? { id: "hermes_provider", status: "missing_env", mode: check.mode } : check,
        ),
      }),
    /Hermes check must include missing env labels/,
  );
  assert.throws(
    () =>
      assertLiveServiceProvisioningReport({
        ...report,
        summary: {
          ...report.summary,
          missing_env: report.summary.missing_env.filter((env) => !env.startsWith("HERMES_")),
        },
        checks: report.checks.map((check) =>
          check.id === "hermes_provider" ? { ...check, missing: [] } : check,
        ),
      }),
    /Hermes check must explain missing env labels/,
  );
  assert.throws(
    () =>
      assertLiveServiceProvisioningReport({
        ...report,
        summary: {
          ...report.summary,
          missing_env: report.summary.missing_env
            .filter((env) => env !== "HERMES_API_KEY")
            .map((env) => (env === "HERMES_CHAT_COMPLETIONS_URL" ? "HERMES_URL" : env)),
        },
        checks: report.checks.map((check) =>
          check.id === "hermes_provider" ? { ...check, missing: ["HERMES_URL"] } : check,
        ),
      }),
    /canonical env label/,
  );
  assert.throws(
    () => assertLiveServiceProvisioningReport({ ...report, hermes: { ...report.hermes, next_actions: [] } }),
    /next actions/,
  );
  assert.throws(
    () => assertLiveServiceProvisioningReport({ ...report, next_actions: [] }),
    /next actions/,
  );
  assert.throws(
    () => assertLiveServiceProvisioningReport({ ...report, next_actions: ["Set service env."] }),
    /live:provisioning/,
  );
  assert.throws(
    () =>
      assertLiveServiceProvisioningReport({
        ...report,
        hermes: { ...report.hermes, safety: { ...report.hermes.safety, can_publish: true } },
      }),
    /draft-only safety/,
  );
});

test("live service provisioning ready report requires endpoint evidence", async () => {
  const report = await buildLiveServiceProvisioningReport({
    env: {
      TYPESENSE_URL: "https://typesense.internal",
      TYPESENSE_API_KEY: "typesense-key",
      MEILI_URL: "https://meili.internal",
      MEILI_API_KEY: "meili-key",
      HERMES_CHAT_COMPLETIONS_URL: "https://hermes.ms-realty.bg/v1/chat/completions",
      HERMES_API_KEY: "hermes-key",
    },
    fetchImpl: healthyFetch,
    generatedAt: "2026-07-06T00:00:00Z",
  });
  const withoutEndpointEvidence = {
    ...report,
    checks: report.checks.map((check) =>
      check.id === "typesense_health" ? { id: "typesense_health", status: "pass" } : check,
    ),
  };
  const withoutHermesEndpoint = {
    ...report,
    hermes: { ...report.hermes, endpoint: null },
  };

  assert.ok(
    report.next_actions.some((action) =>
      ["live:provisioning:preflight", "live:capture", "live:preflight"].every((term) => action.includes(term)),
    ),
  );
  assert.throws(
    () =>
      assertLiveServiceProvisioningReport({
        ...report,
        next_actions: ["Run npm run live:preflight."],
      }),
    /provisioning preflight, capture, and live preflight/,
  );
  assert.throws(
    () => assertLiveServiceProvisioningReport(withoutEndpointEvidence),
    /typesense_health must include successful endpoint evidence/,
  );
  assert.throws(
    () => assertLiveServiceProvisioningReport(withoutHermesEndpoint),
    /Hermes endpoint evidence/,
  );
  assert.throws(
    () =>
      assertLiveServiceProvisioningReport({
        ...report,
        hermes: { ...report.hermes, endpoint: "https://hermes.ms-realty.bg/v1/models" },
      }),
    /\/v1\/chat\/completions/,
  );
  assert.throws(
    () =>
      assertLiveServiceProvisioningReport({
        ...report,
        checks: report.checks.map((check) =>
          check.id === "typesense_health" ? { ...check, redacted_url: "http://127.0.0.1:8108" } : check,
        ),
      }),
    /localhost or placeholder/,
  );
  assert.throws(
    () =>
      assertLiveServiceProvisioningReport({
        ...report,
        hermes: { ...report.hermes, endpoint: "http://localhost:8000/v1/chat/completions" },
      }),
    /localhost or placeholder/,
  );
});

test("live service provisioning writer and CLI do not persist secrets", async () => {
  const dir = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-live-provisioning-`);
  const outPath = `${dir}/live-service-provisioning-report.json`;
  const report = await buildLiveServiceProvisioningReport({
    env: {
      TYPESENSE_URL: "https://typesense.internal",
      TYPESENSE_API_KEY: "typesense-test-secret",
      MEILI_URL: "https://meili.internal",
      MEILI_API_KEY: "meili-test-secret",
      HERMES_CHAT_COMPLETIONS_URL: "https://hermes.ms-realty.bg/v1/chat/completions",
      HERMES_API_KEY: "hermes-test-secret",
    },
    fetchImpl: healthyFetch,
    generatedAt: "2026-07-06T00:00:00Z",
  });
  writeLiveServiceProvisioningReport(report, outPath);

  const written = fs.readFileSync(outPath, "utf8");
  assert.equal(written.includes("typesense-test-secret"), false);
  assert.equal(written.includes("meili-test-secret"), false);
  assert.equal(assertLiveServiceProvisioningReport(JSON.parse(written)), true);
  assert.equal(liveServiceProvisioningState(outPath).status, "pass");
  assert.ok(liveServiceProvisioningState(outPath).next_actions.some((action) => action.includes("live:provisioning:preflight")));
  assert.ok(liveServiceProvisioningState(outPath).next_actions.some((action) => action.includes("live:capture")));
  const missingState = liveServiceProvisioningState(`${dir}/missing.json`);
  assert.equal(missingState.status, "missing_report");
  assert.ok(missingState.next_actions.some((action) => action.includes("live:provisioning")));
  fs.writeFileSync(`${dir}/invalid.json`, "{}\n");
  const invalidState = liveServiceProvisioningState(`${dir}/invalid.json`);
  assert.equal(invalidState.status, "invalid_report");
  assert.ok(invalidState.next_actions.some((action) => action.includes("live:provisioning")));

  const cliOutPath = `${dir}/cli-live-service-provisioning-report.json`;
  const cli = spawnSync(process.execPath, [fromRoot("production", "scripts", "build-live-service-provisioning-report.mjs")], {
    cwd: fromRoot(),
    encoding: "utf8",
    env: {
      PATH: process.env.PATH,
      MS_REALTY_GENERATED_AT: "2026-07-08T12:00:00Z",
      MS_REALTY_LIVE_SERVICE_PROVISIONING_REPORT_PATH: cliOutPath,
    },
  });

  assert.equal(cli.status, 0, cli.stderr);
  assert.match(cli.stdout, /Live service provisioning blocked: typesense_url, typesense_api_key, meili_url, meili_api_key, typesense_health, meilisearch_health, hermes_provider, hermes_agent_health, hermes_agent_capabilities/);
  assert.match(cli.stdout, /Missing env: TYPESENSE_URL, TYPESENSE_API_KEY, MEILI_URL, MEILI_API_KEY, HERMES_CHAT_COMPLETIONS_URL, HERMES_API_KEY/);
  assert.match(cli.stdout, /Next: set real Typesense, Meilisearch, and Hermes provider env/);
  assert.equal(fs.readFileSync(cliOutPath, "utf8").includes("typesense-test-secret"), false);
  const cliReport = JSON.parse(fs.readFileSync(cliOutPath, "utf8"));
  assert.equal(cliReport.generated_at, "2026-07-08T12:00:00Z");
  assert.equal(assertLiveServiceProvisioningReport(cliReport), true);
});
