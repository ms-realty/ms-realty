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
  assert.ok(report.summary.missing_env.includes("TYPESENSE_URL"));
  assert.ok(report.summary.missing_env.includes("TYPESENSE_API_KEY"));
  assert.ok(report.summary.missing_env.includes("MEILI_URL"));
  assert.ok(report.summary.missing_env.includes("MEILI_API_KEY"));
  assert.ok(report.summary.missing_env.includes("HERMES_CHAT_COMPLETIONS_URL"));
  assert.equal(report.checks.find((check) => check.id === "typesense_health").status, "missing_env");
  assert.equal(report.checks.find((check) => check.id === "meilisearch_health").status, "missing_env");
});

test("live service provisioning report verifies live endpoints without persisting secrets", async () => {
  const calls = [];
  const report = await buildLiveServiceProvisioningReport({
    env: {
      TYPESENSE_URL: "https://user:pass@typesense.internal?token=secret",
      TYPESENSE_API_KEY: "typesense-test-secret",
      MEILI_URL: "https://user:pass@meili.internal?token=secret",
      MEILI_API_KEY: "meili-test-secret",
      HERMES_CHAT_COMPLETIONS_URL: "http://127.0.0.1:8000/v1/chat/completions",
    },
    fetchImpl: async (url, options) => {
      calls.push({ url, headers: options.headers });
      return { ok: true, status: 200 };
    },
    generatedAt: "2026-07-06T00:00:00Z",
  });

  assert.equal(assertLiveServiceProvisioningReport(report), true);
  assert.equal(report.ready, true);
  assert.equal(report.status, "ready");
  assert.equal(report.summary.missing_env.length, 0);
  assert.equal(report.checks.find((check) => check.id === "typesense_health").redacted_url, "https://typesense.internal");
  assert.equal(report.checks.find((check) => check.id === "meilisearch_health").redacted_url, "https://meili.internal");
  assert.equal(calls.length, 2);
  const serialized = JSON.stringify(report);
  assert.equal(serialized.includes("typesense-test-secret"), false);
  assert.equal(serialized.includes("meili-test-secret"), false);
  assert.equal(serialized.includes("user:pass"), false);
  assert.equal(serialized.includes("token=secret"), false);
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
      HERMES_CHAT_COMPLETIONS_URL: "http://127.0.0.1:8000/v1/chat/completions",
    },
    fetchImpl: async () => ({ ok: true, status: 200 }),
    generatedAt: "2026-07-06T00:00:00Z",
  });
  writeLiveServiceProvisioningReport(report, outPath);

  const written = fs.readFileSync(outPath, "utf8");
  assert.equal(written.includes("typesense-test-secret"), false);
  assert.equal(written.includes("meili-test-secret"), false);
  assert.equal(assertLiveServiceProvisioningReport(JSON.parse(written)), true);
  assert.equal(liveServiceProvisioningState(outPath).status, "pass");
  assert.equal(liveServiceProvisioningState(`${dir}/missing.json`).status, "missing_report");

  const cliOutPath = `${dir}/cli-live-service-provisioning-report.json`;
  const cli = spawnSync(process.execPath, [fromRoot("production", "scripts", "build-live-service-provisioning-report.mjs")], {
    cwd: fromRoot(),
    encoding: "utf8",
    env: {
      PATH: process.env.PATH,
      MS_REALTY_LIVE_SERVICE_PROVISIONING_REPORT_PATH: cliOutPath,
    },
  });

  assert.equal(cli.status, 0, cli.stderr);
  assert.equal(fs.readFileSync(cliOutPath, "utf8").includes("typesense-test-secret"), false);
  assert.equal(assertLiveServiceProvisioningReport(JSON.parse(fs.readFileSync(cliOutPath, "utf8"))), true);
});
