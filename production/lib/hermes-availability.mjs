import { assertHermesChatCompletionsEndpoint, hermesProviderConfigFromEnv } from "./hermes-provider-provisioning.mjs";

// Whether the workspace can ask Hermes for a reply draft, derived from
// configuration ALONE. Nothing here calls Hermes: a screen must be able to
// render the draft button correctly on first paint, and a probe request would
// be both slow and a side effect.
//
// The reason is short, operator-facing, and never carries a secret: it names
// the missing environment variables, never their values.

const REASONS = Object.freeze({
  available: "Hermes is configured for broker-only reply drafts.",
  configured_provider: "A Hermes reply provider is configured for this environment.",
  provider_mode_unsupported: "Hermes reply drafts require the self hosted provider mode.",
  command_available: "Hermes owner-command planning is configured.",
  command_configured_provider: "A Hermes owner-command provider is configured for this environment.",
  command_connected_provider: "The connected OpenRouter account can prepare owner-command plans.",
  command_provider_mode_unsupported: "This Hermes provider mode cannot prepare owner-command plans.",
  provider_mode_invalid: "HERMES_PROVIDER_MODE must be self_hosted or openrouter.",
  endpoint_invalid: "The configured Hermes endpoint is not a chat completions URL.",
  fetch_unavailable: "This runtime has no fetch, so Hermes cannot be reached.",
  not_configured: "Hermes is not configured in this environment.",
});

function missingInputs(config) {
  const missing = [];
  if (!config.endpoint) missing.push("HERMES_CHAT_COMPLETIONS_URL");
  if (!config.has_api_key) missing.push("HERMES_API_KEY");
  return missing;
}

function unavailable(reasonKey, { missing = [], mode = null } = {}) {
  return {
    available: false,
    reason_key: reasonKey,
    reason: missing.length ? `${REASONS[reasonKey]} Missing: ${missing.join(", ")}.` : REASONS[reasonKey],
    missing,
    provider_mode: mode,
  };
}

export function hermesReplyAvailability({ env = process.env, provider = null, fetchImpl = globalThis.fetch } = {}) {
  // An injected provider (local fixtures, tests, a bespoke worker) is the
  // configuration: if one is wired in, the button works.
  if (typeof provider === "function") {
    return { available: true, reason_key: "configured_provider", reason: REASONS.configured_provider, missing: [], provider_mode: "injected_provider" };
  }
  let config;
  try {
    config = hermesProviderConfigFromEnv(env);
  } catch {
    return unavailable("provider_mode_invalid");
  }
  const missing = missingInputs(config);
  if (missing.length) return unavailable("not_configured", { missing, mode: config.mode });
  if (config.mode !== "self_hosted") return unavailable("provider_mode_unsupported", { mode: config.mode });
  try {
    assertHermesChatCompletionsEndpoint(config.endpoint);
  } catch {
    return unavailable("endpoint_invalid", { mode: config.mode });
  }
  if (typeof fetchImpl !== "function") return unavailable("fetch_unavailable", { mode: config.mode });
  return { available: true, reason_key: "available", reason: REASONS.available, missing: [], provider_mode: config.mode };
}

// Owner-command planning only receives the authenticated operator's command
// and server-owned evidence. It may use the already-provisioned hosted
// OpenRouter mode, while customer/lead reply drafts remain self-hosted-only.
// Keep this decision separate from reply availability so an injected command
// provider cannot accidentally enable the reply composer (or vice versa).
export function hermesOwnerCommandAvailability({
  env = process.env,
  provider = null,
  connectedProviderMode = null,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (typeof provider === "function") {
    return {
      available: true,
      reason_key: "command_configured_provider",
      reason: REASONS.command_configured_provider,
      missing: [],
      provider_mode: "injected_provider",
    };
  }
  let config;
  try {
    config = hermesProviderConfigFromEnv(env);
  } catch {
    return unavailable("provider_mode_invalid");
  }
  const missing = missingInputs(config);
  if (missing.length) {
    if (connectedProviderMode === "openrouter") {
      if (typeof fetchImpl !== "function") return unavailable("fetch_unavailable", { mode: connectedProviderMode });
      return {
        available: true,
        reason_key: "command_connected_provider",
        reason: REASONS.command_connected_provider,
        missing: [],
        provider_mode: connectedProviderMode,
      };
    }
    return unavailable("not_configured", { missing, mode: config.mode });
  }
  if (!["self_hosted", "openrouter"].includes(config.mode)) {
    return unavailable("command_provider_mode_unsupported", { mode: config.mode });
  }
  try {
    assertHermesChatCompletionsEndpoint(config.endpoint);
  } catch {
    return unavailable("endpoint_invalid", { mode: config.mode });
  }
  if (typeof fetchImpl !== "function") return unavailable("fetch_unavailable", { mode: config.mode });
  return {
    available: true,
    reason_key: "command_available",
    reason: REASONS.command_available,
    missing: [],
    provider_mode: config.mode,
  };
}
