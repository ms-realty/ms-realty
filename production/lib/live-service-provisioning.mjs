import fs from "node:fs";
import path from "node:path";
import {
  HERMES_AGENT_INSTALL_COMMAND,
  HERMES_AGENT_OFFICIAL_URL,
  HERMES_CHAT_COMPLETIONS_PATH,
  assertHermesChatCompletionsEndpoint,
  buildHermesProviderProvisioningReport,
} from "./hermes-provider-provisioning.mjs";
import { fromRoot } from "./paths.mjs";

export const DEFAULT_LIVE_SERVICE_PROVISIONING_REPORT = fromRoot(
  "production",
  "data",
  "live-service-provisioning-report.json",
);
const REQUIRED_CHECK_IDS = [
  "typesense_url",
  "typesense_api_key",
  "meili_url",
  "meili_api_key",
  "typesense_health",
  "meilisearch_health",
  "hermes_provider",
];
const REQUIRED_SERVICES = ["typesense", "meilisearch", "hermes"];
const CHECK_STATUSES = new Set(["pass", "missing_env", "placeholder", "fail"]);
const REQUIRED_ENV_BY_CHECK = {
  typesense_url: "TYPESENSE_URL",
  typesense_api_key: "TYPESENSE_API_KEY",
  meili_url: "MEILI_URL",
  meili_api_key: "MEILI_API_KEY",
};
const HERMES_REQUIRED_ENV_NAMES = new Set(["HERMES_CHAT_COMPLETIONS_URL", "HERMES_API_KEY"]);

function redactUrl(value) {
  if (!value) return null;
  const parsed = new URL(value);
  parsed.username = "";
  parsed.password = "";
  parsed.search = "";
  parsed.hash = "";
  return parsed.href.replace(/\/$/, "");
}

function assertProvisioningServiceUrl(value, label) {
  const parsed = new URL(value);
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error(`${label} must use http or https`);
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const reservedHosts = ["example.com", "example.net", "example.org", "localhost", "127.0.0.1", "0.0.0.0", "::1"];
  const reservedSuffixes = [".example", ".example.com", ".example.net", ".example.org", ".invalid", ".localhost", ".local", ".test"];
  if (reservedHosts.includes(host) || reservedSuffixes.some((suffix) => host.endsWith(suffix))) {
    throw new Error(`${label} must not use localhost or placeholder service URLs`);
  }
}

function envCheck(id, env, key) {
  const value = String(env[key] || "").trim();
  if (!value) return { id, env: key, status: "missing_env" };
  if (/replace-with|change-me|example/i.test(value)) return { id, env: key, status: "placeholder" };
  return { id, env: key, status: "pass" };
}

async function healthCheck({ fetchImpl, headers = {}, id, path: route, url }) {
  if (!url) return { id, status: "missing_env" };
  let redacted_url = null;
  try {
    redacted_url = redactUrl(url);
    assertProvisioningServiceUrl(redacted_url, id);
    const response = await fetchImpl(`${String(url).replace(/\/+$/, "")}${route}`, { headers, method: "GET" });
    return { id, redacted_url, status: response.ok ? "pass" : "fail", status_code: response.status };
  } catch (error) {
    return { error: error.message, id, redacted_url, status: "fail" };
  }
}

function hermesProviderCheck(hermes) {
  if (!hermes.ready) {
    return {
      id: "hermes_provider",
      mode: hermes.provider.mode,
      status: "missing_env",
      missing: hermes.missing,
    };
  }
  const check = {
    id: "hermes_provider",
    mode: hermes.provider.mode,
    status: "pass",
    missing: hermes.missing,
  };
  try {
    assertProvisioningServiceUrl(hermes.provider.endpoint, "Hermes provisioning endpoint");
    assertHermesChatCompletionsEndpoint(hermes.provider.endpoint, "Hermes provisioning endpoint");
    return check;
  } catch (error) {
    return { ...check, status: "fail", error: error.message };
  }
}

export async function buildLiveServiceProvisioningReport({
  env = process.env,
  fetchImpl = globalThis.fetch,
  generatedAt = new Date().toISOString(),
} = {}) {
  const checks = [
    envCheck("typesense_url", env, "TYPESENSE_URL"),
    envCheck("typesense_api_key", env, "TYPESENSE_API_KEY"),
    envCheck("meili_url", env, "MEILI_URL"),
    envCheck("meili_api_key", env, "MEILI_API_KEY"),
  ];

  if (checks.find((check) => check.id === "typesense_url").status === "pass" && checks.find((check) => check.id === "typesense_api_key").status === "pass") {
    checks.push(
      await healthCheck({
        fetchImpl,
        headers: { "x-typesense-api-key": env.TYPESENSE_API_KEY },
        id: "typesense_health",
        path: "/health",
        url: env.TYPESENSE_URL,
      }),
    );
  } else {
    checks.push({ id: "typesense_health", status: "missing_env" });
  }

  if (checks.find((check) => check.id === "meili_url").status === "pass" && checks.find((check) => check.id === "meili_api_key").status === "pass") {
    checks.push(
      await healthCheck({
        fetchImpl,
        headers: { authorization: `Bearer ${env.MEILI_API_KEY}` },
        id: "meilisearch_health",
        path: "/health",
        url: env.MEILI_URL,
      }),
    );
  } else {
    checks.push({ id: "meilisearch_health", status: "missing_env" });
  }

  const hermes = buildHermesProviderProvisioningReport({ env, generatedAt });
  checks.push(hermesProviderCheck(hermes));

  const missingEnv = [
    ...checks.filter((check) => check.status === "missing_env").map((check) => check.env).filter(Boolean),
    ...hermes.missing,
  ];
  const placeholderEnv = checks.filter((check) => check.status === "placeholder").map((check) => check.env).filter(Boolean);
  const ready = checks.every((check) => check.status === "pass");
  return {
    generated_at: generatedAt,
    ready,
    status: ready ? "ready" : "blocked",
    summary: {
      checks: checks.length,
      missing_env: [...new Set(missingEnv)],
      placeholder_env: [...new Set(placeholderEnv)],
      services: REQUIRED_SERVICES,
    },
    checks,
    hermes: {
      mode: hermes.provider.mode,
      endpoint: hermes.provider.endpoint,
      model: hermes.provider.model,
      ready: hermes.ready,
      official_url: hermes.agent_runtime.official_url,
      install_command: hermes.agent_runtime.install_command,
      setup_commands: hermes.agent_runtime.setup_commands,
      gateway_setup_command: hermes.agent_runtime.gateway_setup_command,
      vllm: {
        launch_command: hermes.vllm.launch_command,
        chat_completions_path: hermes.vllm.chat_completions_path,
        tool_call_parser: hermes.vllm.tool_call_parser,
        enable_auto_tool_choice: hermes.vllm.enable_auto_tool_choice,
      },
      safety: {
        draft_only: hermes.safety.draft_only,
        human_approval_required: hermes.safety.human_approval_required,
        can_publish: hermes.safety.can_publish,
        can_send_customer_messages: hermes.safety.can_send_customer_messages,
      },
      next_actions: hermes.next_actions,
    },
    next_actions: ready
      ? ["Run npm run live:capture, then npm run live:preflight."]
      : [
          "Set TYPESENSE_URL, TYPESENSE_API_KEY, MEILI_URL, MEILI_API_KEY, and Hermes provider env.",
          "Run npm run live:provisioning until all service checks pass.",
          "Run npm run live:capture only after provisioning passes.",
        ],
  };
}

export function assertLiveServiceProvisioningReport(report) {
  if (!report.generated_at || Number.isNaN(Date.parse(report.generated_at))) {
    throw new Error("Live service provisioning report must include valid generated_at");
  }
  if (!Array.isArray(report.checks) || report.checks.length < 1) {
    throw new Error("Live service provisioning report must include checks");
  }
  const checkIds = new Set();
  for (const check of report.checks) {
    if (!check?.id) throw new Error("Live service provisioning checks must include ids");
    if (!CHECK_STATUSES.has(check.status)) throw new Error(`Live service provisioning check ${check.id} has unknown status`);
    if (checkIds.has(check.id)) throw new Error(`Live service provisioning report has duplicate check ${check.id}`);
    if (REQUIRED_ENV_BY_CHECK[check.id] && check.env !== REQUIRED_ENV_BY_CHECK[check.id]) {
      throw new Error(`Live service provisioning ${check.id} check must reference ${REQUIRED_ENV_BY_CHECK[check.id]}`);
    }
    checkIds.add(check.id);
  }
  for (const id of REQUIRED_CHECK_IDS) {
    if (!checkIds.has(id)) throw new Error(`Live service provisioning report missing required check ${id}`);
  }
  const ready = report.checks.every((check) => check.status === "pass");
  if (report.ready !== ready) throw new Error("Live service provisioning ready flag must match checks");
  if (report.status !== (ready ? "ready" : "blocked")) {
    throw new Error("Live service provisioning status must match ready flag");
  }
  if (!report.summary || !Array.isArray(report.summary.missing_env) || !Array.isArray(report.summary.placeholder_env)) {
    throw new Error("Live service provisioning report must summarize missing and placeholder env");
  }
  if (JSON.stringify(report.summary.services) !== JSON.stringify(REQUIRED_SERVICES)) {
    throw new Error("Live service provisioning services summary must match required services");
  }
  if (report.summary.checks !== report.checks.length) throw new Error("Live service provisioning summary check count must match checks");
  const missingEnv = [
    ...report.checks.filter((check) => check.status === "missing_env").map((check) => check.env).filter(Boolean),
    ...((report.checks.find((check) => check.id === "hermes_provider")?.missing) || []),
  ];
  if (JSON.stringify(report.summary.missing_env) !== JSON.stringify([...new Set(missingEnv)])) {
    throw new Error("Live service provisioning missing env summary must match checks");
  }
  const placeholderEnv = report.checks.filter((check) => check.status === "placeholder").map((check) => check.env).filter(Boolean);
  if (JSON.stringify(report.summary.placeholder_env) !== JSON.stringify([...new Set(placeholderEnv)])) {
    throw new Error("Live service provisioning placeholder env summary must match checks");
  }
  for (const id of ["typesense_health", "meilisearch_health"]) {
    const check = report.checks.find((item) => item.id === id);
    if (ready && (!check.redacted_url || !Number.isInteger(check.status_code) || check.status_code < 200 || check.status_code > 299)) {
      throw new Error(`${id} must include successful endpoint evidence`);
    }
    if (ready && check.redacted_url) assertProvisioningServiceUrl(check.redacted_url, id);
  }
  const hermesProvider = report.checks.find((check) => check.id === "hermes_provider");
  if (!Array.isArray(hermesProvider?.missing)) {
    throw new Error("Live service provisioning Hermes check must include missing env labels");
  }
  if (hermesProvider.status === "missing_env" && hermesProvider.missing.length === 0) {
    throw new Error("Live service provisioning Hermes check must explain missing env labels");
  }
  for (const env of hermesProvider.missing) {
    if (!HERMES_REQUIRED_ENV_NAMES.has(env)) {
      throw new Error(`Live service provisioning Hermes check must use canonical env label ${env}`);
    }
  }
  if ((ready || hermesProvider?.status === "pass") && (!report.hermes?.endpoint || report.hermes.ready !== true)) {
    throw new Error("Live service provisioning ready report must include Hermes endpoint evidence");
  }
  if ((ready || hermesProvider?.status === "pass") && report.hermes?.endpoint) {
    assertProvisioningServiceUrl(report.hermes.endpoint, "Live service provisioning Hermes endpoint");
    assertHermesChatCompletionsEndpoint(report.hermes.endpoint, "Live service provisioning Hermes endpoint");
  }
  if (report.hermes?.official_url !== HERMES_AGENT_OFFICIAL_URL || report.hermes?.install_command !== HERMES_AGENT_INSTALL_COMMAND) {
    throw new Error("Live service provisioning Hermes handoff must include official install source");
  }
  if (
    !report.hermes?.setup_commands?.includes("hermes setup --portal") ||
    report.hermes?.gateway_setup_command !== "hermes gateway setup"
  ) {
    throw new Error("Live service provisioning Hermes handoff must include setup commands");
  }
  if (
    !report.hermes?.vllm?.launch_command?.includes("--tool-call-parser") ||
    report.hermes?.vllm?.chat_completions_path !== HERMES_CHAT_COMPLETIONS_PATH ||
    report.hermes?.vllm?.tool_call_parser !== "hermes" ||
    report.hermes?.vllm?.enable_auto_tool_choice !== true
  ) {
    throw new Error("Live service provisioning Hermes handoff must include vLLM Hermes tool parsing");
  }
  if (
    report.hermes?.safety?.draft_only !== true ||
    report.hermes?.safety?.human_approval_required !== true ||
    report.hermes?.safety?.can_publish !== false ||
    report.hermes?.safety?.can_send_customer_messages !== false
  ) {
    throw new Error("Live service provisioning Hermes handoff must preserve draft-only safety");
  }
  if (!Array.isArray(report.hermes?.next_actions) || report.hermes.next_actions.length === 0) {
    throw new Error("Live service provisioning Hermes handoff must include next actions");
  }
  const serialized = JSON.stringify(report);
  if (/secret|Bearer\s+|sk-[A-Za-z0-9_-]+|user:pass/i.test(serialized)) {
    throw new Error("Live service provisioning report must not persist secrets");
  }
  return true;
}

export function liveServiceProvisioningState(reportPath = DEFAULT_LIVE_SERVICE_PROVISIONING_REPORT) {
  if (!fs.existsSync(reportPath)) return { status: "missing_report", path: reportPath };
  try {
    const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    assertLiveServiceProvisioningReport(report);
    return {
      status: report.ready ? "pass" : "blocked_report",
      path: reportPath,
      summary: report.summary,
      checks: report.checks,
      hermes: report.hermes,
    };
  } catch (error) {
    return { status: "invalid_report", path: reportPath, error: error.message };
  }
}

export function writeLiveServiceProvisioningReport(report, outPath = DEFAULT_LIVE_SERVICE_PROVISIONING_REPORT) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  assertLiveServiceProvisioningReport(report);
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
  return outPath;
}
