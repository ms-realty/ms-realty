import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { spawnSync } from "node:child_process";
import {
  assertHermesProviderProvisioningReport,
  buildHermesProviderProvisioningReport,
  writeHermesProviderProvisioningReport,
} from "../lib/hermes-provider-provisioning.mjs";
import { fromRoot } from "../lib/paths.mjs";

test("Hermes provisioning report fails closed until a self-hosted endpoint is configured", () => {
  const report = buildHermesProviderProvisioningReport({ env: {}, generatedAt: "2026-07-06T00:00:00Z" });

  assert.equal(assertHermesProviderProvisioningReport(report), true);
  assert.equal(report.ready, false);
  assert.equal(report.status, "blocked");
  assert.deepEqual(report.missing, ["HERMES_CHAT_COMPLETIONS_URL"]);
  assert.equal(report.provider.mode, "self_hosted");
  assert.equal(report.provider.sensitive_data_allowed, true);
  assert.equal(report.vllm.tool_call_parser, "hermes");
  assert.equal(report.vllm.enable_auto_tool_choice, true);
  assert.deepEqual(report.vllm.launch_command.slice(-3), ["--enable-auto-tool-choice", "--tool-call-parser", "hermes"]);
});

test("Hermes provisioning report redacts self-hosted credentials and keeps sensitive data local", () => {
  const report = buildHermesProviderProvisioningReport({
    env: {
      HERMES_CHAT_COMPLETIONS_URL: "http://user:pass@127.0.0.1:8000/v1/chat/completions?token=secret",
      HERMES_API_KEY: "test-secret-key",
      HERMES_MODEL: "NousResearch/Hermes-4-14B",
      HERMES_ENDPOINT_REQUIRES_AUTH: "1",
    },
    generatedAt: "2026-07-06T00:00:00Z",
  });

  assert.equal(assertHermesProviderProvisioningReport(report), true);
  assert.equal(report.ready, true);
  assert.equal(report.status, "configured");
  assert.equal(report.provider.endpoint, "http://127.0.0.1:8000/v1/chat/completions");
  assert.equal(report.provider.api_key_configured, true);
  assert.equal(report.provider.sensitive_data_allowed, true);
  assert.equal(JSON.stringify(report).includes("test-secret-key"), false);
  assert.equal(JSON.stringify(report).includes("user:pass"), false);
});

test("Hermes hosted fallback is configured as non-sensitive only", () => {
  const report = buildHermesProviderProvisioningReport({
    env: {
      HERMES_PROVIDER_MODE: "openrouter",
      HERMES_API_KEY: "test-secret-key",
      HERMES_MODEL: "NousResearch/Hermes-4-14B",
    },
    generatedAt: "2026-07-06T00:00:00Z",
  });

  assert.equal(assertHermesProviderProvisioningReport(report), true);
  assert.equal(report.ready, true);
  assert.equal(report.provider.endpoint, "https://openrouter.ai/api/v1/chat/completions");
  assert.equal(report.provider.sensitive_data_allowed, false);
  assert.equal(report.provider.hosted_fallback_allowed_for_sensitive_data, false);
});

test("Hermes provisioning report rejects incomplete ready endpoint evidence", () => {
  const report = buildHermesProviderProvisioningReport({
    env: { HERMES_CHAT_COMPLETIONS_URL: "http://127.0.0.1:8000/v1/chat/completions" },
    generatedAt: "2026-07-06T00:00:00Z",
  });

  assert.throws(
    () => assertHermesProviderProvisioningReport({ ...report, generated_at: "" }),
    /valid generated_at/,
  );
  assert.throws(
    () => assertHermesProviderProvisioningReport({ ...report, provider: { ...report.provider, endpoint: null } }),
    /endpoint evidence/,
  );
  assert.throws(
    () => assertHermesProviderProvisioningReport({ ...report, provider: { ...report.provider, openai_compatible: false } }),
    /endpoint evidence/,
  );
  assert.throws(
    () => assertHermesProviderProvisioningReport({ ...report, provider: { ...report.provider, model: " " } }),
    /provider model/,
  );
});

test("Hermes provisioning report rejects publish-capable safety flags", () => {
  const report = buildHermesProviderProvisioningReport({
    env: { HERMES_CHAT_COMPLETIONS_URL: "http://127.0.0.1:8000/v1/chat/completions" },
    generatedAt: "2026-07-06T00:00:00Z",
  });

  assert.throws(
    () => assertHermesProviderProvisioningReport({ ...report, safety: { ...report.safety, can_publish: true } }),
    /draft-only/,
  );
});

test("Hermes provisioning report writer and CLI do not persist secrets", () => {
  const dir = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-hermes-provisioning-`);
  const outPath = `${dir}/hermes-provider-provisioning-report.json`;
  const report = buildHermesProviderProvisioningReport({
    env: { HERMES_CHAT_COMPLETIONS_URL: "http://127.0.0.1:8000/v1/chat/completions", HERMES_API_KEY: "test-secret-key" },
    generatedAt: "2026-07-06T00:00:00Z",
  });
  writeHermesProviderProvisioningReport(report, outPath);

  const written = fs.readFileSync(outPath, "utf8");
  assert.equal(written.includes("test-secret-key"), false);
  assert.equal(assertHermesProviderProvisioningReport(JSON.parse(written)), true);

  const cliOutPath = `${dir}/cli-hermes-provider-provisioning-report.json`;
  const cli = spawnSync(process.execPath, [fromRoot("production", "scripts", "build-hermes-provider-provisioning-report.mjs")], {
    cwd: fromRoot(),
    encoding: "utf8",
    env: {
      ...process.env,
      HERMES_CHAT_COMPLETIONS_URL: "http://127.0.0.1:8000/v1/chat/completions",
      HERMES_API_KEY: "test-secret-key",
      MS_REALTY_HERMES_PROVIDER_PROVISIONING_REPORT_PATH: cliOutPath,
    },
  });

  assert.equal(cli.status, 0, cli.stderr);
  assert.equal(fs.readFileSync(cliOutPath, "utf8").includes("test-secret-key"), false);
});
