import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import {
  assertHermesAgentRuntimeReport,
  probeHermesAgentRuntime,
  writeHermesAgentRuntimeReport,
} from "../lib/hermes-agent-runtime.mjs";
import { fromRoot } from "../lib/paths.mjs";

function capableHermesResponse(url, options = {}) {
  if (String(url).endsWith("/v1/capabilities")) {
    assert.equal(options.headers.authorization, "Bearer hermes-test-secret");
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

test("Hermes Agent runtime proof fails closed when endpoint credentials are absent", async () => {
  const report = await probeHermesAgentRuntime({
    endpoint: "",
    apiKey: "",
    evidenceScope: "local",
    fetchImpl: async () => {
      throw new Error("fetch must not be called without Hermes env");
    },
    generatedAt: "2026-07-10T10:00:00Z",
  });

  assert.equal(assertHermesAgentRuntimeReport(report), true);
  assert.equal(report.ready, false);
  assert.deepEqual(report.missing, ["HERMES_CHAT_COMPLETIONS_URL", "HERMES_API_KEY"]);
  assert.deepEqual(report.checks.map((check) => check.status), ["missing_env", "missing_env"]);
});

test("Hermes Agent runtime proof verifies authenticated API capabilities without persisting credentials", async () => {
  const calls = [];
  const report = await probeHermesAgentRuntime({
    endpoint: "https://user:pass@hermes.ms-realty.bg/v1/chat/completions?token=secret",
    apiKey: "hermes-test-secret",
    evidenceScope: "live",
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), headers: options.headers || {} });
      return capableHermesResponse(url, options);
    },
    generatedAt: "2026-07-10T10:00:00Z",
  });

  assert.equal(assertHermesAgentRuntimeReport(report), true);
  assert.equal(report.ready, true);
  assert.equal(report.endpoint, "https://hermes.ms-realty.bg/v1/chat/completions");
  assert.equal(report.model, "hermes-agent");
  assert.deepEqual(calls.map((call) => call.url), ["https://user:pass@hermes.ms-realty.bg/health", "https://user:pass@hermes.ms-realty.bg/v1/capabilities"]);
  assert.equal(calls[1].headers.authorization, "Bearer hermes-test-secret");
  const serialized = JSON.stringify(report);
  assert.equal(serialized.includes("hermes-test-secret"), false);
  assert.equal(serialized.includes("user:pass"), false);
  assert.equal(serialized.includes("token=secret"), false);
});

test("Hermes Agent runtime proof rejects a non-Hermes capability endpoint", async () => {
  const report = await probeHermesAgentRuntime({
    endpoint: "http://hermes-agent:8642/v1/chat/completions",
    apiKey: "hermes-test-secret",
    evidenceScope: "local",
    fetchImpl: async (url, options) => {
      if (String(url).endsWith("/v1/capabilities")) {
        assert.equal(options.headers.authorization, "Bearer hermes-test-secret");
        return { ok: true, status: 200, json: async () => ({ platform: "other" }) };
      }
      return { ok: true, status: 200 };
    },
    generatedAt: "2026-07-10T10:00:00Z",
  });

  assert.equal(assertHermesAgentRuntimeReport(report), true);
  assert.equal(report.ready, false);
  assert.equal(report.checks[1].error, "unexpected_capabilities");
});

test("Hermes Agent runtime proof writer keeps local scope separate from launch evidence", async () => {
  const report = await probeHermesAgentRuntime({
    endpoint: "http://hermes-agent:8642/v1/chat/completions",
    apiKey: "hermes-test-secret",
    evidenceScope: "local",
    fetchImpl: capableHermesResponse,
    generatedAt: "2026-07-10T10:00:00Z",
  });
  const filePath = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-hermes-agent-runtime-`)}/runtime.json`;
  writeHermesAgentRuntimeReport(report, filePath);

  const written = JSON.parse(fs.readFileSync(filePath, "utf8"));
  assert.equal(written.evidence_scope, "local");
  assert.equal(assertHermesAgentRuntimeReport(written), true);
});

test("managed Hermes Agent profile uses a self-hosted model and exposes no toolsets", () => {
  const config = fs.readFileSync(fromRoot("production", "hermes-agent", "config.yaml"), "utf8");
  const soul = fs.readFileSync(fromRoot("production", "hermes-agent", "SOUL.md"), "utf8");

  assert.match(config, /provider: custom/);
  assert.match(config, /base_url: "\$\{HERMES_AGENT_LLM_BASE_URL\}"/);
  assert.match(config, /api_key: "\$\{HERMES_AGENT_LLM_API_KEY\}"/);
  assert.doesNotMatch(config, /openrouter/i);
  for (const toolset of [
    "browser",
    "code_execution",
    "computer_use",
    "context_engine",
    "file",
    "memory",
    "messaging",
    "skills",
    "terminal",
    "video_gen",
    "web",
    "x_search",
  ]) {
    assert.match(config, new RegExp(`- ${toolset}`));
  }
  assert.match(config, /memory_enabled: false/);
  assert.match(soul, /Do not use tools/);
  assert.match(soul, /Never describe Sandanski as a sea destination/);
});
