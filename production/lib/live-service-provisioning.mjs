import fs from "node:fs";
import path from "node:path";
import {
  HERMES_AGENT_INSTALL_COMMAND,
  HERMES_AGENT_OFFICIAL_URL,
  HERMES_CHAT_COMPLETIONS_PATH,
  assertHermesChatCompletionsEndpoint,
  buildHermesProviderProvisioningReport,
} from "./hermes-provider-provisioning.mjs";
import { assertHermesAgentRuntimeReport, probeHermesAgentRuntime } from "./hermes-agent-runtime.mjs";
import {
  assertProductionSearchEngine,
  HERMES_LAUNCH_REQUIRED,
  REQUIRED_LIVE_SERVICE_PROVISIONING_CHECK_IDS,
  REQUIRED_LIVE_SERVICE_PROVISIONING_SERVICES,
} from "./launch-service-contract.mjs";
import { fromRoot, repoRelativePath } from "./paths.mjs";
import { assertExactRedactedPostgresTarget, redactPostgresDatabaseTarget } from "./postgres-target.mjs";
import { assertProductionDatabaseHost } from "./payload-runtime.mjs";
import { assertSearchServiceUrl } from "./search-service-http.mjs";

export const DEFAULT_LIVE_SERVICE_PROVISIONING_REPORT = fromRoot(
  "production",
  "data",
  "live-service-provisioning-report.json",
);
const CHECK_STATUSES = new Set(["pass", "missing_env", "placeholder", "fail", "not_run"]);
const REQUIRED_ENV_BY_CHECK = {
  database_url: "DATABASE_URL",
  payload_secret: "PAYLOAD_SECRET",
  search_engine: "MS_REALTY_SEARCH_ENGINE",
};
const HERMES_REQUIRED_ENV_NAMES = new Set(["HERMES_CHAT_COMPLETIONS_URL", "HERMES_API_KEY"]);

function assertProvisioningServiceUrl(value, label) {
  const parsed = assertSearchServiceUrl(value, { label, exactOrigin: false });
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const reservedHosts = ["example.com", "example.net", "example.org", "localhost", "127.0.0.1", "0.0.0.0", "::1"];
  const reservedSuffixes = [".example", ".example.com", ".example.net", ".example.org", ".invalid", ".localhost", ".local", ".test"];
  if (reservedHosts.includes(host) || reservedSuffixes.some((suffix) => host.endsWith(suffix))) {
    throw new Error(`${label} must not use localhost or placeholder service URLs`);
  }
  const internalHermes = parsed.protocol === "http:" && host === "hermes-agent" && parsed.port === "8642";
  if (parsed.protocol !== "https:" && !internalHermes) throw new Error(`${label} must use HTTPS`);
}

function envCheck(id, env, key) {
  const value = String(env[key] || "").trim();
  if (!value) return { id, env: key, status: "missing_env" };
  if (/replace-with|change-me|example/i.test(value)) return { id, env: key, status: "placeholder" };
  return { id, env: key, status: "pass" };
}

function assertProvisioningDatabaseTarget(value) {
  const parsed = new URL(value);
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    throw new Error("DATABASE_URL must use postgres:// or postgresql://");
  }
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, "")).trim();
  if (!database) throw new Error("DATABASE_URL must include a database name");
  if (!parsed.hostname) throw new Error("DATABASE_URL must include a database host");
  assertProductionDatabaseHost(parsed.hostname);
  return parsed;
}

function postgresDatabaseTargetCheck(env) {
  const value = String(env.DATABASE_URL || "").trim();
  if (!value) return { id: "postgres_database_target", status: "missing_env" };
  try {
    const parsed = assertProvisioningDatabaseTarget(value);
    if (!parsed.username || !parsed.password) throw new Error("DATABASE_URL must include database credentials");
    return {
      id: "postgres_database_target",
      status: "pass",
      database_target: redactPostgresDatabaseTarget(value),
    };
  } catch (error) {
    return { id: "postgres_database_target", status: "fail", error: error.message };
  }
}

function productionSearchEngineCheck(env) {
  const check = envCheck("search_engine", env, "MS_REALTY_SEARCH_ENGINE");
  if (check.status !== "pass") return check;
  try {
    return { ...check, engine: assertProductionSearchEngine(env.MS_REALTY_SEARCH_ENGINE) };
  } catch (error) {
    return { ...check, status: "fail", error: error.message };
  }
}

function runtimeChecks(runtime) {
  return runtime.checks.map((check) => ({ ...check, id: `hermes_agent_${check.id}` }));
}

function requiredChecksPass(checks) {
  const byId = new Map(checks.map((check) => [check.id, check]));
  return REQUIRED_LIVE_SERVICE_PROVISIONING_CHECK_IDS.every((id) => byId.get(id)?.status === "pass");
}

function requiredCheck(check) {
  return REQUIRED_LIVE_SERVICE_PROVISIONING_CHECK_IDS.includes(check.id);
}

async function hermesProviderCheck(hermes, { env, fetchImpl, generatedAt }) {
  if (!hermes.ready) {
    return {
      provider: {
        id: "hermes_provider",
        mode: hermes.provider.mode,
        status: "missing_env",
        missing: hermes.missing,
      },
      runtime: await probeHermesAgentRuntime({
        endpoint: env.HERMES_CHAT_COMPLETIONS_URL,
        apiKey: env.HERMES_API_KEY,
        fetchImpl,
        generatedAt,
        evidenceScope: "live",
      }),
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
    const runtime = await probeHermesAgentRuntime({
      endpoint: env.HERMES_CHAT_COMPLETIONS_URL,
      apiKey: env.HERMES_API_KEY,
      fetchImpl,
      generatedAt,
      evidenceScope: "live",
    });
    return {
      provider: { ...check, status: runtime.ready ? "pass" : "fail", ...(runtime.ready ? {} : { error: "agent_runtime_unavailable" }) },
      runtime,
    };
  } catch (error) {
    return {
      provider: { ...check, status: "fail", error: error.message },
      runtime: {
        kind: "hermes_agent_runtime",
        evidence_scope: "live",
        generated_at: generatedAt,
        ready: false,
        status: "blocked",
        endpoint: hermes.provider.endpoint,
        service: "Nous Hermes Agent",
        model: null,
        checks: [
          { id: "health", status: "not_run" },
          { id: "capabilities", status: "not_run" },
        ],
        missing: [],
        safety: {
          draft_only: true,
          human_approval_required: true,
          can_publish: false,
          can_send_customer_messages: false,
          managed_tool_access: "none",
          persistent_memory: false,
        },
        next_actions: ["Correct the Hermes Agent endpoint before requesting runtime evidence."],
      },
    };
  }
}

export async function buildLiveServiceProvisioningReport({
  env = process.env,
  fetchImpl = globalThis.fetch,
  generatedAt = new Date().toISOString(),
} = {}) {
  const checks = [
    envCheck("database_url", env, "DATABASE_URL"),
    envCheck("payload_secret", env, "PAYLOAD_SECRET"),
    productionSearchEngineCheck(env),
  ];
  checks.push(checks[0].status === "pass" ? postgresDatabaseTargetCheck(env) : { id: "postgres_database_target", status: "missing_env" });

  const hermes = buildHermesProviderProvisioningReport({ env, generatedAt });
  const hermesChecks = await hermesProviderCheck(hermes, { env, fetchImpl, generatedAt });
  checks.push(hermesChecks.provider, ...runtimeChecks(hermesChecks.runtime));

  const missingEnv = [
    ...checks.filter((check) => requiredCheck(check) && check.status === "missing_env").map((check) => check.env).filter(Boolean),
    ...(HERMES_LAUNCH_REQUIRED ? hermes.missing : []),
  ];
  const placeholderEnv = checks
    .filter((check) => requiredCheck(check) && check.status === "placeholder")
    .map((check) => check.env)
    .filter(Boolean);
  const ready = requiredChecksPass(checks);
  return {
    generated_at: generatedAt,
    ready,
    status: ready ? "ready" : "blocked",
    summary: {
      checks: checks.length,
      missing_env: [...new Set(missingEnv)],
      placeholder_env: [...new Set(placeholderEnv)],
      services: REQUIRED_LIVE_SERVICE_PROVISIONING_SERVICES,
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
      agent_runtime: hermesChecks.runtime,
      next_actions: hermes.next_actions,
    },
    next_actions: ready
      ? ["Run npm run live:provisioning:preflight, then npm run live:capture and npm run live:preflight."]
      : [
          HERMES_LAUNCH_REQUIRED
            ? "Set DATABASE_URL, PAYLOAD_SECRET, MS_REALTY_SEARCH_ENGINE=postgres, and Hermes provider env."
            : "Set DATABASE_URL, PAYLOAD_SECRET, and MS_REALTY_SEARCH_ENGINE=postgres.",
          "Run npm run live:provisioning until all required service checks pass.",
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
  for (const id of REQUIRED_LIVE_SERVICE_PROVISIONING_CHECK_IDS) {
    if (!checkIds.has(id)) throw new Error(`Live service provisioning report missing required check ${id}`);
  }
  const ready = requiredChecksPass(report.checks);
  if (report.ready !== ready) throw new Error("Live service provisioning ready flag must match checks");
  if (report.status !== (ready ? "ready" : "blocked")) {
    throw new Error("Live service provisioning status must match ready flag");
  }
  if (!report.summary || !Array.isArray(report.summary.missing_env) || !Array.isArray(report.summary.placeholder_env)) {
    throw new Error("Live service provisioning report must summarize missing and placeholder env");
  }
  if (JSON.stringify(report.summary.services) !== JSON.stringify(REQUIRED_LIVE_SERVICE_PROVISIONING_SERVICES)) {
    throw new Error("Live service provisioning services summary must match required services");
  }
  if (report.summary.checks !== report.checks.length) throw new Error("Live service provisioning summary check count must match checks");
  const missingEnv = [
    ...report.checks
      .filter((check) => requiredCheck(check) && check.status === "missing_env")
      .map((check) => check.env)
      .filter(Boolean),
    ...(HERMES_LAUNCH_REQUIRED ? (report.checks.find((check) => check.id === "hermes_provider")?.missing || []) : []),
  ];
  if (JSON.stringify(report.summary.missing_env) !== JSON.stringify([...new Set(missingEnv)])) {
    throw new Error("Live service provisioning missing env summary must match checks");
  }
  const placeholderEnv = report.checks
    .filter((check) => requiredCheck(check) && check.status === "placeholder")
    .map((check) => check.env)
    .filter(Boolean);
  if (JSON.stringify(report.summary.placeholder_env) !== JSON.stringify([...new Set(placeholderEnv)])) {
    throw new Error("Live service provisioning placeholder env summary must match checks");
  }
  const postgresTarget = report.checks.find((item) => item.id === "postgres_database_target");
  if (postgresTarget?.status === "pass") {
    const canonical = assertExactRedactedPostgresTarget(postgresTarget.database_target, "Postgres provisioning target");
    assertProductionDatabaseHost(new URL(canonical).hostname);
  }
  const searchEngine = report.checks.find((item) => item.id === "search_engine");
  if (searchEngine?.status === "pass" && searchEngine.engine !== assertProductionSearchEngine(searchEngine.engine)) {
    throw new Error("Live service provisioning search engine must match the production invariant");
  }
  for (const id of ["hermes_agent_health", "hermes_agent_capabilities"]) {
    const check = report.checks.find((item) => item.id === id);
    if (
      HERMES_LAUNCH_REQUIRED &&
      ready &&
      (!Number.isInteger(check.status_code) || check.status_code < 200 || check.status_code > 299)
    ) {
      throw new Error(`${id} must include successful endpoint evidence`);
    }
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
  const hermesEvidenceRequired = (HERMES_LAUNCH_REQUIRED && ready) || hermesProvider?.status === "pass";
  if (hermesEvidenceRequired && (!report.hermes?.endpoint || report.hermes.ready !== true)) {
    throw new Error("Live service provisioning ready report must include Hermes endpoint evidence");
  }
  if (hermesEvidenceRequired && report.hermes?.endpoint) {
    assertProvisioningServiceUrl(report.hermes.endpoint, "Live service provisioning Hermes endpoint");
    assertHermesChatCompletionsEndpoint(report.hermes.endpoint, "Live service provisioning Hermes endpoint");
  }
  assertHermesAgentRuntimeReport(report.hermes?.agent_runtime);
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
  if (!Array.isArray(report.next_actions) || report.next_actions.length === 0) {
    throw new Error("Live service provisioning report must include next actions");
  }
  if (!ready && !report.next_actions.some((action) => action.includes("live:provisioning"))) {
    throw new Error("Blocked live service provisioning report must point to live:provisioning");
  }
  if (
    ready &&
    !report.next_actions.some((action) =>
      ["live:provisioning:preflight", "live:capture", "live:preflight"].every((term) => action.includes(term)),
    )
  ) {
    throw new Error("Ready live service provisioning report must point to provisioning preflight, capture, and live preflight");
  }
  const serialized = JSON.stringify(report);
  if (/Bearer\s+\S+|sk-[A-Za-z0-9_-]+|:\/\/[^/@\s]+:[^/@\s]+@/i.test(serialized)) {
    throw new Error("Live service provisioning report must not persist secrets");
  }
  return true;
}

const LIVE_SERVICE_PROVISIONING_MISSING_REPORT_ACTIONS = [
  "Set DATABASE_URL, PAYLOAD_SECRET, and Hermes provider env.",
  "Run npm run live:provisioning, then npm run live:provisioning:preflight.",
];
const LIVE_SERVICE_PROVISIONING_INVALID_REPORT_ACTIONS = [
  "Regenerate the live service provisioning report with npm run live:provisioning.",
  "Run npm run live:provisioning:preflight before live:capture.",
];

export function liveServiceProvisioningState(reportPath = DEFAULT_LIVE_SERVICE_PROVISIONING_REPORT) {
  if (!fs.existsSync(reportPath)) {
    return { status: "missing_report", path: repoRelativePath(reportPath), next_actions: LIVE_SERVICE_PROVISIONING_MISSING_REPORT_ACTIONS };
  }
  try {
    const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    assertLiveServiceProvisioningReport(report);
    return {
      status: report.ready ? "pass" : "blocked_report",
      path: repoRelativePath(reportPath),
      summary: report.summary,
      checks: report.checks,
      hermes: report.hermes,
      next_actions: report.next_actions,
    };
  } catch (error) {
    return { status: "invalid_report", path: repoRelativePath(reportPath), error: error.message, next_actions: LIVE_SERVICE_PROVISIONING_INVALID_REPORT_ACTIONS };
  }
}

export function writeLiveServiceProvisioningReport(report, outPath = DEFAULT_LIVE_SERVICE_PROVISIONING_REPORT) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  assertLiveServiceProvisioningReport(report);
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
  return outPath;
}
