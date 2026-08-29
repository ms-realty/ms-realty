// One implementation of "what happens when the operator presses a connection
// button", shared by the standalone HTTP runtime and the Next adapter.
//
// Both surfaces used to carry their own copy of the Google/WhatsApp/Viber
// branches. With ten providers that duplication is where a difference between
// the two would hide, so the decision lives here and each surface only turns the
// outcome into its own kind of Response and its own audit call.
//
// Nothing here writes an audit entry or reads process.env: the caller owns both,
// which is what keeps this testable without a running server.

import {
  completeViberConnection,
  completeWhatsAppEmbeddedSignup,
  registerViberWebhook,
  registerWhatsAppWebhook,
} from "./provider-connections.mjs";
import {
  completeOperatorProviderOAuth,
  completeOperatorTokenConnection,
  isOwnerConnectableProvider,
  operatorProviderAvailability,
  operatorProviderAuthorizationUrl,
  operatorProviderDefinition,
  revokeOperatorProvider,
  verifyOperatorAiProvider,
} from "./operator-provider-catalog.mjs";

export const OPERATOR_CONNECTION_BASE_PATH = "/api/admin/connections";
export const OPERATOR_CONNECTION_DISCONNECT_PATH = "/api/admin/connections/disconnect";
export const OPERATOR_CONNECTION_AGENT_CONFIG_PATH = "/api/admin/connections/agent-config";
export const OPERATOR_CONNECTION_PATHS = Object.freeze([
  OPERATOR_CONNECTION_BASE_PATH,
  OPERATOR_CONNECTION_DISCONNECT_PATH,
  OPERATOR_CONNECTION_AGENT_CONFIG_PATH,
]);

// Which phase label a failure is recorded under, so the audit trail says where
// a provider round trip actually broke.
const PHASE = Object.freeze({
  start: "oauth_start",
  callback: "oauth_callback",
  submit_token: "token_verification",
  submit_embedded: "embedded_signup",
  submit_viber: "account_or_webhook",
  verify: "runtime_verification",
  disconnect: "disconnect",
});

function normalizedProvider(value) {
  return String(value || "").trim().toLowerCase();
}

export function isOperatorOAuthProvider(provider) {
  try {
    const id = normalizedProvider(provider);
    return isOwnerConnectableProvider(id) && operatorProviderDefinition(id).kind === "oauth";
  } catch {
    return false;
  }
}

// The authorization redirect. Google keeps the exact URL the already-tested
// module builds; every other provider goes through the catalogue.
export function operatorConnectionStart({ provider, config, operatorId, now }) {
  const id = normalizedProvider(provider);
  if (!isOwnerConnectableProvider(id)) throw new Error("Unsupported provider connection");
  return operatorProviderAuthorizationUrl({ provider: id, config, operatorId, now });
}

// Each provider call is overridable so a test can stand in for the provider
// without a network. The default is always the real implementation.
function provider_(deps, name, fallback) {
  return typeof deps?.[name] === "function" ? deps[name] : fallback;
}

async function runCallback({ provider, code, state, operatorId, config, deps }) {
  const definition = operatorProviderDefinition(provider);
  // Google only issues a refresh token on first consent, so a re-consent has to
  // be able to fall back to the one already stored.
  const prior =
    definition.family === "google" ? await deps.readProviderCredentials(provider, deps.storeOptions) : null;
  // The Google callback keeps honouring an injected completeGoogleOAuth, which
  // is the seam the adapter's own tests already drive it through.
  const complete =
    provider === "google" && typeof deps?.completeGoogleOAuth === "function"
      ? (input, options) => deps.completeGoogleOAuth(input, options)
      : provider_(deps, "completeOperatorProviderOAuth", completeOperatorProviderOAuth);
  const connection = await complete(
    { provider, code, state, operatorId, existingRefreshToken: prior?.refresh_token || "" },
    { config, fetchImpl: deps.fetchImpl, now: deps.now },
  );
  const saved = await deps.saveProviderConnection(connection, { ...deps.storeOptions, connectedBy: operatorId });
  return { outcome: "connected", provider, connection: saved };
}

async function runSubmit({ provider, input, operatorId, config, deps }) {
  if (provider === "whatsapp") {
    const verified = await provider_(deps, "completeWhatsAppEmbeddedSignup", completeWhatsAppEmbeddedSignup)(
      { code: input.code, wabaId: input.waba_id, phoneNumberId: input.phone_number_id },
      { config, fetchImpl: deps.fetchImpl },
    );
    // Saved once as "connecting" so a webhook subscription that fails leaves a
    // trace instead of vanishing, then again once the webhook is confirmed.
    await deps.saveProviderConnection(verified, { ...deps.storeOptions, connectedBy: operatorId });
    const connection = await provider_(deps, "registerWhatsAppWebhook", registerWhatsAppWebhook)(verified, {
      config,
      fetchImpl: deps.fetchImpl,
    });
    const saved = await deps.saveProviderConnection(connection, { ...deps.storeOptions, connectedBy: operatorId });
    return { outcome: "connected", provider, connection: saved };
  }
  if (provider === "viber") {
    const verified = await provider_(deps, "completeViberConnection", completeViberConnection)(
      { token: input.token },
      { config, fetchImpl: deps.fetchImpl },
    );
    await deps.saveProviderConnection(verified, { ...deps.storeOptions, connectedBy: operatorId });
    const connection = await provider_(deps, "registerViberWebhook", registerViberWebhook)(verified, {
      config,
      fetchImpl: deps.fetchImpl,
    });
    const saved = await deps.saveProviderConnection(connection, { ...deps.storeOptions, connectedBy: operatorId });
    return { outcome: "connected", provider, connection: saved };
  }
  if (provider === "ai") {
    const verified = await provider_(deps, "verifyOperatorAiProvider", verifyOperatorAiProvider)({
      endpoint: input.endpoint,
      model: input.model,
      apiKey: input.api_key,
      fetchImpl: deps.fetchImpl,
    });
    const saved = await deps.saveProviderConnection(verified, { ...deps.storeOptions, connectedBy: operatorId });
    return { outcome: "connected", provider, connection: saved };
  }
  const connection = await provider_(deps, "completeOperatorTokenConnection", completeOperatorTokenConnection)(
    { provider, token: input.token },
    { config, fetchImpl: deps.fetchImpl },
  );
  const saved = await deps.saveProviderConnection(connection, { ...deps.storeOptions, connectedBy: operatorId });
  return { outcome: "connected", provider, connection: saved };
}

async function runDisconnect({ provider, config, deps }) {
  // Revoke first, delete second. If the delete failed after a successful revoke
  // the operator would be looking at a row whose credential no longer works;
  // this order at least never leaves a live credential with no row to remove it.
  // A store read failure is not proof that no revocable credential exists, so
  // it must stop the delete instead of turning an unavailable store into a
  // successful-looking disconnect.
  const credentials = await deps.readProviderCredentials(provider, deps.storeOptions);
  const revocation = credentials
    ? await provider_(deps, "revokeOperatorProvider", revokeOperatorProvider)(
        { provider, credentials },
        { config, fetchImpl: deps.fetchImpl },
      )
    : { provider, revoked: false };
  const deletion = await deps.deleteProviderConnection(provider, deps.storeOptions);
  return { outcome: "disconnected", provider, revoked: revocation.revoked === true, deleted: deletion.deleted === true };
}

// The one entry point. `intent` is "callback", "submit" or "disconnect";
// "start" is synchronous and has its own export because it only builds a URL.
//
// A rejection is returned, never thrown, so the caller always has a provider id
// and a phase label to record and a redirect target to send the operator to.
export async function runOperatorConnectionAction({
  intent,
  provider: requestedProvider,
  code = "",
  state = "",
  input = {},
  operatorId,
  config,
  deps,
}) {
  const provider = normalizedProvider(requestedProvider);
  let definition;
  try {
    definition = operatorProviderDefinition(provider);
  } catch {
    return { outcome: "rejected", provider: provider || "unknown", phase: "unsupported_provider", error: new Error("Unsupported provider connection") };
  }
  // Viber remains intentionally absent from the one-click owner catalogue, but
  // its authenticated token/webhook API is already used by the runtime. Keep
  // that backend path available without turning it into an owner UI action.
  const runtimeOnlyProvider = provider === "viber";
  if (intent !== "disconnect" && !isOwnerConnectableProvider(provider) && !runtimeOnlyProvider) {
    return {
      outcome: "rejected",
      provider,
      phase: "unsupported_provider",
      error: new Error("Unsupported provider connection"),
    };
  }
  const phase =
    intent === "callback"
      ? PHASE.callback
      : intent === "disconnect"
        ? PHASE.disconnect
        : provider === "ai"
          ? PHASE.verify
          : definition.kind === "embedded_signup"
            ? PHASE.submit_embedded
            : provider === "viber"
              ? PHASE.submit_viber
              : PHASE.submit_token;
  try {
    if (intent === "callback") {
      if (definition.kind !== "oauth") throw new Error("Unsupported provider connection");
      return await runCallback({ provider, code, state, operatorId, config, deps });
    }
    if (intent === "disconnect") return await runDisconnect({ provider, config, deps });
    if (definition.kind === "oauth") throw new Error("Unsupported provider connection");
    return await runSubmit({ provider, input, operatorId, config, deps });
  } catch (error) {
    // Storage being down is not the provider refusing; the caller turns this
    // into a 503 rather than telling the operator their credential was wrong.
    if (error?.code === "provider_connection_unavailable") throw error;
    return { outcome: "rejected", provider, phase, error };
  }
}

// The audit entry for a completed action, in the shape both surfaces already
// pass to their own recordAudit.
export function operatorConnectionAudit(result, { actor }) {
  if (result.outcome === "connected" || result.outcome === "verified") {
    return {
      action: result.outcome === "verified" ? "provider_verified" : "provider_connected",
      actor,
      objectType: "provider_connection",
      objectId: result.connection.provider,
      metadata: {
        external_account_id: result.connection.external_account_id,
        scopes: result.connection.scopes,
      },
    };
  }
  if (result.outcome === "disconnected") {
    return {
      action: "provider_disconnected",
      actor,
      objectType: "provider_connection",
      objectId: result.provider,
      // revoked records whether the provider itself withdrew the grant; a false
      // here is why the card tells the operator to finish in the provider's own
      // dashboard.
      metadata: { revoked: result.revoked, deleted: result.deleted },
    };
  }
  return null;
}

export { operatorProviderAvailability };
