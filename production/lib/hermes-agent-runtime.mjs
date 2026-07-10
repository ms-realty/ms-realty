import fs from "node:fs";
import path from "node:path";
import { assertHermesChatCompletionsEndpoint } from "./hermes-provider-provisioning.mjs";
import { fromRoot } from "./paths.mjs";

export const DEFAULT_HERMES_AGENT_RUNTIME_REPORT = fromRoot(
  "production",
  "data",
  "hermes-agent-runtime-report.json",
);

const SCOPES = new Set(["local", "live"]);
const REQUIRED_CAPABILITIES = Object.freeze(["chat_completions", "responses_api", "run_submission"]);
const REQUIRED_CHECK_IDS = Object.freeze(["health", "capabilities"]);

function redactUrl(value) {
  const parsed = new URL(value);
  parsed.username = "";
  parsed.password = "";
  parsed.search = "";
  parsed.hash = "";
  return parsed.href;
}

function safeRedactUrl(value) {
  try {
    return redactUrl(value);
  } catch {
    return null;
  }
}

function endpointUrls(endpoint) {
  assertHermesChatCompletionsEndpoint(endpoint, "Hermes Agent endpoint");
  const parsed = new URL(endpoint);
  const apiPrefix = parsed.pathname.replace(/\/chat\/completions\/?$/, "").replace(/\/+$/, "") || "/v1";
  const capabilities = new URL(parsed);
  capabilities.pathname = `${apiPrefix}/capabilities`;
  capabilities.search = "";
  capabilities.hash = "";
  const health = new URL(parsed);
  health.pathname = "/health";
  health.search = "";
  health.hash = "";
  return { capabilities: capabilities.href, health: health.href };
}

function missingReport({ generatedAt, scope, missing }) {
  return {
    kind: "hermes_agent_runtime",
    evidence_scope: scope,
    generated_at: generatedAt,
    ready: false,
    status: "blocked",
    endpoint: null,
    service: "Nous Hermes Agent",
    model: null,
    checks: REQUIRED_CHECK_IDS.map((id) => ({ id, status: "missing_env" })),
    missing,
    safety: safetyProfile(),
    next_actions: ["Set HERMES_CHAT_COMPLETIONS_URL and HERMES_API_KEY, then run npm run hermes:runtime."],
  };
}

function safetyProfile() {
  return {
    draft_only: true,
    human_approval_required: true,
    can_publish: false,
    can_send_customer_messages: false,
    managed_tool_access: "none",
    persistent_memory: false,
  };
}

function failedReport({ generatedAt, scope, endpoint, checkId, statusCode = null, code = "request_failed" }) {
  const checks = REQUIRED_CHECK_IDS.map((id) =>
    id === checkId
      ? { id, status: "fail", ...(Number.isInteger(statusCode) ? { status_code: statusCode } : {}), error: code }
      : { id, status: "not_run" },
  );
  return {
    kind: "hermes_agent_runtime",
    evidence_scope: scope,
    generated_at: generatedAt,
    ready: false,
    status: "blocked",
    endpoint: safeRedactUrl(endpoint),
    service: "Nous Hermes Agent",
    model: null,
    checks,
    missing: [],
    safety: safetyProfile(),
    next_actions: ["Verify the authenticated Hermes Agent API server health and capabilities endpoints."],
  };
}

function capabilitySummary(payload) {
  const features = payload?.features || {};
  return {
    platform: payload?.platform || null,
    model: payload?.model || null,
    auth_type: payload?.auth?.type || null,
    auth_required: payload?.auth?.required === true,
    features: Object.fromEntries(REQUIRED_CAPABILITIES.map((key) => [key, features[key] === true])),
  };
}

function validCapabilities(summary) {
  return (
    summary.platform === "hermes-agent" &&
    summary.auth_type === "bearer" &&
    summary.auth_required === true &&
    REQUIRED_CAPABILITIES.every((key) => summary.features[key] === true)
  );
}

async function healthCheck(fetchImpl, url) {
  try {
    const response = await fetchImpl(url, { method: "GET" });
    if (!response?.ok) return { id: "health", status: "fail", status_code: response?.status || null, error: "health_unavailable" };
    return { id: "health", status: "pass", status_code: response.status };
  } catch {
    return { id: "health", status: "fail", error: "request_failed" };
  }
}

async function capabilityCheck(fetchImpl, url, apiKey) {
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: { authorization: `Bearer ${apiKey}` },
    });
    if (!response?.ok) {
      return { id: "capabilities", status: "fail", status_code: response?.status || null, error: "capabilities_unavailable" };
    }
    const payload = typeof response.json === "function" ? await response.json() : null;
    const capabilities = capabilitySummary(payload);
    if (!validCapabilities(capabilities)) {
      return { id: "capabilities", status: "fail", status_code: response.status, error: "unexpected_capabilities", capabilities };
    }
    return { id: "capabilities", status: "pass", status_code: response.status, capabilities };
  } catch {
    return { id: "capabilities", status: "fail", error: "request_failed" };
  }
}

export async function probeHermesAgentRuntime({
  endpoint = process.env.HERMES_CHAT_COMPLETIONS_URL,
  apiKey = process.env.HERMES_API_KEY,
  fetchImpl = globalThis.fetch,
  generatedAt = new Date().toISOString(),
  evidenceScope = process.env.MS_REALTY_HERMES_AGENT_EVIDENCE_SCOPE || "live",
} = {}) {
  const scope = String(evidenceScope || "").trim();
  if (!SCOPES.has(scope)) throw new Error("Hermes Agent evidence scope must be local or live");
  const missing = [];
  if (!String(endpoint || "").trim()) missing.push("HERMES_CHAT_COMPLETIONS_URL");
  if (!String(apiKey || "").trim()) missing.push("HERMES_API_KEY");
  if (missing.length) return missingReport({ generatedAt, scope, missing });

  let urls;
  try {
    urls = endpointUrls(endpoint);
  } catch {
    return failedReport({ generatedAt, scope, endpoint, checkId: "health", code: "invalid_endpoint" });
  }

  const health = await healthCheck(fetchImpl, urls.health);
  if (health.status !== "pass") {
    return {
      ...failedReport({ generatedAt, scope, endpoint, checkId: "health", statusCode: health.status_code, code: health.error }),
      checks: [health, { id: "capabilities", status: "not_run" }],
    };
  }

  const capabilities = await capabilityCheck(fetchImpl, urls.capabilities, apiKey);
  const ready = capabilities.status === "pass";
  return {
    kind: "hermes_agent_runtime",
    evidence_scope: scope,
    generated_at: generatedAt,
    ready,
    status: ready ? "ready" : "blocked",
    endpoint: redactUrl(endpoint),
    service: "Nous Hermes Agent",
    model: capabilities.capabilities?.model || null,
    checks: [health, capabilities],
    missing: [],
    safety: safetyProfile(),
    next_actions: ready
      ? ["Run npm run hermes:worker to prove a real review-gated draft against the configured model provider."]
      : ["Verify the authenticated Hermes Agent API server health and capabilities endpoints."],
  };
}

export function assertHermesAgentRuntimeReport(report) {
  if (report?.kind !== "hermes_agent_runtime") throw new Error("Hermes Agent runtime report kind is invalid");
  if (!SCOPES.has(report.evidence_scope)) throw new Error("Hermes Agent runtime report must declare local or live evidence scope");
  if (!report.generated_at || Number.isNaN(Date.parse(report.generated_at))) {
    throw new Error("Hermes Agent runtime report must include valid generated_at");
  }
  if (report.service !== "Nous Hermes Agent") throw new Error("Hermes Agent runtime report must identify Nous Hermes Agent");
  if (!Array.isArray(report.checks) || report.checks.length !== REQUIRED_CHECK_IDS.length) {
    throw new Error("Hermes Agent runtime report must include health and capabilities checks");
  }
  const ids = report.checks.map((check) => check?.id);
  if (JSON.stringify(ids) !== JSON.stringify(REQUIRED_CHECK_IDS)) {
    throw new Error("Hermes Agent runtime report check order is invalid");
  }
  const ready = report.checks.every((check) => check.status === "pass");
  if (report.ready !== ready || report.status !== (ready ? "ready" : "blocked")) {
    throw new Error("Hermes Agent runtime report readiness must match checks");
  }
  if (ready) {
    if (!report.endpoint) throw new Error("Ready Hermes Agent runtime report must include endpoint evidence");
    assertHermesChatCompletionsEndpoint(report.endpoint, "Hermes Agent runtime endpoint");
    const capabilities = report.checks.find((check) => check.id === "capabilities")?.capabilities;
    if (!validCapabilities(capabilities)) throw new Error("Hermes Agent runtime report must verify API capabilities");
  }
  if (
    report.safety?.draft_only !== true ||
    report.safety?.human_approval_required !== true ||
    report.safety?.can_publish !== false ||
    report.safety?.can_send_customer_messages !== false ||
    report.safety?.managed_tool_access !== "none" ||
    report.safety?.persistent_memory !== false
  ) {
    throw new Error("Hermes Agent runtime report must preserve managed draft-only safety");
  }
  if (!Array.isArray(report.next_actions) || report.next_actions.length === 0) {
    throw new Error("Hermes Agent runtime report must include next actions");
  }
  const serialized = JSON.stringify(report);
  if (/secret|Bearer\s+|sk-[A-Za-z0-9_-]+|user:pass/i.test(serialized)) {
    throw new Error("Hermes Agent runtime report must not persist credentials");
  }
  return true;
}

export function writeHermesAgentRuntimeReport(report, filePath = DEFAULT_HERMES_AGENT_RUNTIME_REPORT) {
  assertHermesAgentRuntimeReport(report);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(report, null, 2)}\n`);
  return filePath;
}
