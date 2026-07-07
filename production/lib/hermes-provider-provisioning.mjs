import fs from "node:fs";
import path from "node:path";
import { fromRoot } from "./paths.mjs";

export const DEFAULT_HERMES_PROVIDER_PROVISIONING_REPORT = fromRoot(
  "production",
  "data",
  "hermes-provider-provisioning-report.json",
);
export const DEFAULT_SELF_HOSTED_HERMES_MODEL = "NousResearch/Hermes-4-14B";
export const DEFAULT_OPENROUTER_CHAT_COMPLETIONS_URL = "https://openrouter.ai/api/v1/chat/completions";
export const HERMES_AGENT_OFFICIAL_URL = "https://hermes-agent.nousresearch.com/";
export const HERMES_AGENT_INSTALL_COMMAND = "curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash";
export const HERMES_CHAT_COMPLETIONS_PATH = "/v1/chat/completions";
export const HERMES_AGENT_REQUIRED_CAPABILITIES = Object.freeze([
  "messaging_gateway",
  "persistent_memory",
  "skills",
  "mcp",
  "scheduled_automations",
  "isolated_subagents",
]);
const PROJECT_CONTEXT_FILE = "AGENTS.md";
const REQUIRED_PROJECT_CONTEXT_MARKERS = Object.freeze([
  "Do not call the system production-ready while any launch gate is blocked.",
  "Hermes may draft translations",
  "Hermes must not publish pages",
  "Real launch evidence must come from live services and operator inputs",
]);

const VALID_PROVIDER_MODES = new Set(["self_hosted", "openrouter"]);

function cleanMode(value) {
  const mode = String(value || "self_hosted").trim();
  if (!VALID_PROVIDER_MODES.has(mode)) throw new Error("HERMES_PROVIDER_MODE must be self_hosted or openrouter");
  return mode;
}

function endpointFor(mode, env) {
  const configured = String(env.HERMES_CHAT_COMPLETIONS_URL || "").trim();
  if (configured) return configured;
  return mode === "openrouter" ? DEFAULT_OPENROUTER_CHAT_COMPLETIONS_URL : "";
}

function redactedEndpoint(endpoint) {
  if (!endpoint) return null;
  const parsed = new URL(endpoint);
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Hermes endpoint must use http or https");
  parsed.username = "";
  parsed.password = "";
  parsed.search = "";
  parsed.hash = "";
  return parsed.href;
}

export function assertHermesChatCompletionsEndpoint(endpoint, label = "Hermes endpoint") {
  const parsed = new URL(endpoint);
  const pathname = parsed.pathname.replace(/\/+$/, "");
  if (!pathname.endsWith(HERMES_CHAT_COMPLETIONS_PATH)) {
    throw new Error(`${label} must use ${HERMES_CHAT_COMPLETIONS_PATH}`);
  }
  return true;
}

function boolFromEnv(value) {
  return value === "1" || value === "true" || value === "yes";
}

export function hermesProviderConfigFromEnv(env = process.env) {
  const mode = cleanMode(env.HERMES_PROVIDER_MODE);
  const endpoint = endpointFor(mode, env);
  return {
    mode,
    endpoint,
    endpoint_redacted: redactedEndpoint(endpoint),
    model: String(env.HERMES_MODEL || DEFAULT_SELF_HOSTED_HERMES_MODEL).trim(),
    has_api_key: Boolean(env.HERMES_API_KEY || env.OPENROUTER_API_KEY),
    endpoint_requires_auth: boolFromEnv(env.HERMES_ENDPOINT_REQUIRES_AUTH),
  };
}

function missingInputs(config) {
  const missing = [];
  if (!config.endpoint) missing.push("HERMES_CHAT_COMPLETIONS_URL");
  if (config.endpoint_requires_auth && !config.has_api_key) missing.push("HERMES_API_KEY");
  if (config.mode === "openrouter" && !config.has_api_key) missing.push("HERMES_API_KEY");
  return missing;
}

function vllmLaunchCommand(config) {
  return [
    "vllm",
    "serve",
    config.model,
    "--host",
    "127.0.0.1",
    "--port",
    "8000",
    "--enable-auto-tool-choice",
    "--tool-call-parser",
    "hermes",
  ];
}

function requiredEnvContract(config) {
  if (config.mode === "openrouter") return ["HERMES_PROVIDER_MODE=openrouter", "HERMES_API_KEY"];
  return ["HERMES_CHAT_COMPLETIONS_URL", ...(config.endpoint_requires_auth ? ["HERMES_API_KEY"] : [])];
}

function projectContextState() {
  const filePath = fromRoot(PROJECT_CONTEXT_FILE);
  const present = fs.existsSync(filePath);
  const text = present ? fs.readFileSync(filePath, "utf8") : "";
  const missingMarkers = REQUIRED_PROJECT_CONTEXT_MARKERS.filter((marker) => !text.includes(marker));
  return {
    file: PROJECT_CONTEXT_FILE,
    path: filePath,
    present,
    complete: present && missingMarkers.length === 0,
    required_markers: REQUIRED_PROJECT_CONTEXT_MARKERS,
    missing_markers: missingMarkers,
    loaded_by_hermes_agent: true,
    required_for_launch: true,
  };
}

export function buildHermesProviderProvisioningReport({ env = process.env, generatedAt = new Date().toISOString() } = {}) {
  const config = hermesProviderConfigFromEnv(env);
  const missing = missingInputs(config);
  const selfHosted = config.mode === "self_hosted";
  const projectContext = projectContextState();
  return {
    kind: "hermes_provider_provisioning",
    generated_at: generatedAt,
    status: missing.length ? "blocked" : "configured",
    ready: missing.length === 0,
    agent_runtime: {
      product: "Nous Hermes Agent",
      official_url: HERMES_AGENT_OFFICIAL_URL,
      install_command: HERMES_AGENT_INSTALL_COMMAND,
      setup_commands: ["hermes setup --portal", "hermes model"],
      gateway_setup_command: "hermes gateway setup",
      required_capabilities: HERMES_AGENT_REQUIRED_CAPABILITIES,
      project_context: projectContext,
      gateway_security: {
        allow_all_users: false,
        required_allowlist_env: ["GATEWAY_ALLOWED_USERS", "TELEGRAM_ALLOWED_USERS", "DISCORD_ALLOWED_USERS"],
      },
    },
    provider: {
      mode: config.mode,
      endpoint: config.endpoint_redacted,
      model: config.model,
      openai_compatible: Boolean(config.endpoint),
      sensitive_data_allowed: selfHosted,
      hosted_fallback_allowed_for_sensitive_data: false,
      api_key_configured: config.has_api_key,
      endpoint_requires_auth: config.endpoint_requires_auth || config.mode === "openrouter",
    },
    missing,
    vllm: {
      serving_stack: "vllm",
      chat_completions_path: HERMES_CHAT_COMPLETIONS_PATH,
      enable_auto_tool_choice: true,
      tool_call_parser: "hermes",
      streaming_tool_calls: false,
      launch_command: vllmLaunchCommand(config),
      notes: [
        "Use the OpenAI-compatible chat completions endpoint.",
        "Keep customer/owner data on the self-hosted endpoint; hosted fallback is non-sensitive only.",
      ],
    },
    safety: {
      draft_only: true,
      human_approval_required: true,
      can_publish: false,
      can_send_customer_messages: false,
      legal_tax_process_claims_require_approved_source: true,
      sandanski_sea_framing_forbidden: true,
      prompt_and_output_audited: true,
    },
    env_contract: {
      required: requiredEnvContract(config),
      optional: ["HERMES_MODEL", "HERMES_API_KEY", "HERMES_ENDPOINT_REQUIRES_AUTH", "MS_REALTY_HERMES_WORKER_REPORT_PATH"],
      never_persist: ["HERMES_API_KEY", "OPENROUTER_API_KEY"],
    },
    next_actions: missing.length
      ? [
          "Install Hermes Agent with the official installer, then run hermes setup --portal or hermes model.",
          "Provision a self-hosted vLLM endpoint with Hermes tool parsing.",
          "Set HERMES_CHAT_COMPLETIONS_URL to the /v1/chat/completions endpoint.",
          "Run npm run hermes:provisioning, then npm run hermes:worker.",
        ]
      : ["Run npm run hermes:worker against this endpoint and import the generated live report."],
  };
}

export function assertHermesProviderProvisioningReport(report) {
  if (report.kind !== "hermes_provider_provisioning") throw new Error("Hermes provisioning report kind is invalid");
  if (!report.generated_at || Number.isNaN(Date.parse(report.generated_at))) {
    throw new Error("Hermes provisioning report must include valid generated_at");
  }
  if (report.status !== (report.ready ? "configured" : "blocked")) throw new Error("Hermes provisioning status must match ready flag");
  const noMissingInputs = (report.missing || []).length === 0;
  if (report.ready !== noMissingInputs) throw new Error("Hermes provisioning ready flag must match missing inputs");
  if (report.agent_runtime?.product !== "Nous Hermes Agent") throw new Error("Hermes provisioning must target Nous Hermes Agent");
  if (report.agent_runtime?.official_url !== HERMES_AGENT_OFFICIAL_URL) {
    throw new Error("Hermes provisioning must link the official Hermes Agent runtime");
  }
  if (report.agent_runtime?.install_command !== HERMES_AGENT_INSTALL_COMMAND) {
    throw new Error("Hermes provisioning must include the official Hermes Agent installer");
  }
  if (!report.agent_runtime?.setup_commands?.includes("hermes model")) {
    throw new Error("Hermes provisioning must include Hermes model setup");
  }
  for (const capability of HERMES_AGENT_REQUIRED_CAPABILITIES) {
    if (!report.agent_runtime?.required_capabilities?.includes(capability)) {
      throw new Error("Hermes provisioning must include official Hermes Agent capabilities");
    }
  }
  if (report.agent_runtime?.project_context?.file !== PROJECT_CONTEXT_FILE || report.agent_runtime.project_context.present !== true) {
    throw new Error("Hermes provisioning requires project AGENTS.md context");
  }
  if (report.agent_runtime.project_context.complete !== true || report.agent_runtime.project_context.missing_markers?.length) {
    throw new Error("Hermes provisioning requires complete project AGENTS.md guardrails");
  }
  if (report.agent_runtime?.gateway_security?.allow_all_users !== false) {
    throw new Error("Hermes gateway must not allow all users");
  }
  if (!VALID_PROVIDER_MODES.has(report.provider?.mode)) throw new Error("Hermes provisioning provider mode is invalid");
  if (!String(report.provider?.model || "").trim()) throw new Error("Hermes provisioning report must include provider model");
  if (report.provider?.endpoint) {
    redactedEndpoint(report.provider.endpoint);
    assertHermesChatCompletionsEndpoint(report.provider.endpoint);
  }
  if (report.ready && (!report.provider?.endpoint || report.provider.openai_compatible !== true)) {
    throw new Error("Hermes provisioning ready report must include OpenAI-compatible endpoint evidence");
  }
  if (report.vllm?.tool_call_parser !== "hermes" || report.vllm?.enable_auto_tool_choice !== true) {
    throw new Error("Hermes provisioning must require the vLLM Hermes tool parser");
  }
  if (report.vllm?.streaming_tool_calls !== false) throw new Error("Hermes provisioning must use non-streaming tool calls");
  if (
    report.safety?.draft_only !== true ||
    report.safety?.human_approval_required !== true ||
    report.safety?.can_publish !== false ||
    report.safety?.can_send_customer_messages !== false
  ) {
    throw new Error("Hermes provisioning must remain draft-only with human approval");
  }
  if (report.provider?.mode === "self_hosted" && report.provider.sensitive_data_allowed !== true) {
    throw new Error("Self-hosted Hermes must allow sensitive data");
  }
  if (report.provider?.mode === "openrouter" && report.provider.sensitive_data_allowed !== false) {
    throw new Error("Hosted Hermes fallback must be non-sensitive only");
  }
  if (report.provider?.hosted_fallback_allowed_for_sensitive_data !== false) {
    throw new Error("Hosted Hermes fallback must never be allowed for sensitive data");
  }
  const serialized = JSON.stringify(report);
  if (/secret|sk-[A-Za-z0-9_-]+|Bearer\s+/i.test(serialized)) {
    throw new Error("Hermes provisioning report must not persist secrets");
  }
  return true;
}

export function writeHermesProviderProvisioningReport(report, filePath = DEFAULT_HERMES_PROVIDER_PROVISIONING_REPORT) {
  assertHermesProviderProvisioningReport(report);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(report, null, 2)}\n`);
  return filePath;
}
