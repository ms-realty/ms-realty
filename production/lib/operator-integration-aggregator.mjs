import { ProviderConnectionUnavailableError, readProviderConnections } from "./provider-connections.mjs";
import {
  OPERATOR_PROVIDER_COVERAGE,
  operatorProviderAvailability,
  operatorProviderCards,
  operatorProviderConfigFromEnv,
  operatorProviderDefinition,
} from "./operator-provider-catalog.mjs";

export const OPERATOR_INTEGRATIONS_PATH = "/api/admin/integrations";
export const OPERATOR_INTEGRATIONS_SCHEMA_VERSION = 1;

const SAFE_METADATA_KEYS = new Set([
  "display_phone_number",
  "email",
  "email_verified",
  "endpoint",
  "instagram_account_id",
  "key_verified",
  "login",
  "mode",
  "model",
  "page_id",
  "page_name",
  "project_count",
  "quality_rating",
  "token_status",
  "uri",
  "user_id",
  "verification",
  "webhook_registered",
  "webhook_subscribed",
]);

function text(value) {
  return String(value || "").trim();
}

function workspaceFailure(code, message, status = 403) {
  return Object.assign(new Error(message), { code, status });
}

function normalizedWorkspaceId(value, label) {
  const result = text(value);
  if (result.length > 160) throw workspaceFailure("workspace_scope_invalid", `${label} is too long`, 400);
  return result;
}

function principalWorkspaceIds(principal) {
  return [
    ...new Set(
      (Array.isArray(principal?.workspace_ids) ? principal.workspace_ids : [])
        .map((value) => normalizedWorkspaceId(value, "workspace id"))
        .filter(Boolean),
    ),
  ];
}

export function isUnrestrictedOwnerAdmin(principal) {
  return Array.isArray(principal?.roles) && principal.roles.includes("admin") && principalWorkspaceIds(principal).length === 0;
}

// Provider connections are a single configured owner workspace until the
// provider store has a per-workspace uniqueness model. An assigned/scoped
// admin must not receive an apparently actionable integration contract.
export function resolveOperatorIntegrationWorkspace(
  principal,
  { workspaceId = "", configuredWorkspaceId = "" } = {},
) {
  if (!principal) throw workspaceFailure("workspace_scope_required", "An authenticated operator is required");
  const requested = normalizedWorkspaceId(workspaceId, "workspace_id");
  const configured = normalizedWorkspaceId(configuredWorkspaceId, "configured workspace id");
  if (!isUnrestrictedOwnerAdmin(principal)) {
    throw workspaceFailure("owner_admin_required", "Integrations require an unrestricted owner admin");
  }
  if (!configured) {
    throw workspaceFailure("workspace_scope_unavailable", "A configured workspace is required for integrations", 503);
  }
  if (requested && requested !== configured) {
    throw workspaceFailure("workspace_forbidden", "The selected workspace is not available to this operator");
  }
  return { workspace_id: configured, scope: "workspace" };
}

const OMIT_METADATA = Symbol("omit_metadata");
const URL_METADATA_KEYS = new Set(["endpoint", "uri"]);

function sanitizeUrlMetadata(value) {
  if (typeof value !== "string") return OMIT_METADATA;
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    return OMIT_METADATA;
  }
  if (!url.origin || !["http:", "https:"].includes(url.protocol)) return OMIT_METADATA;
  return `${url.origin}${url.pathname === "/" ? "" : url.pathname}`.slice(0, 320);
}

function redactMetadata(value, depth = 0) {
  if (depth > 2 || value === null || value === undefined) return value ?? null;
  if (Array.isArray(value)) return value.slice(0, 32).map((entry) => redactMetadata(entry, depth + 1));
  if (typeof value !== "object") return typeof value === "string" ? value.slice(0, 320) : value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => SAFE_METADATA_KEYS.has(String(key)))
      .map(([key, nested]) => [
        key,
        URL_METADATA_KEYS.has(String(key)) ? sanitizeUrlMetadata(nested) : redactMetadata(nested, depth + 1),
      ])
      .filter(([, nested]) => nested !== OMIT_METADATA),
  );
}

export function redactOperatorIntegrationMetadata(value) {
  return redactMetadata(value);
}

function safeConnection(connection) {
  return {
    provider: text(connection?.provider),
    status: text(connection?.status) || "unknown",
    connected_by: text(connection?.connected_by),
    workspace_id: normalizedWorkspaceId(connection?.workspace_id, "connection workspace id") || null,
    account_label: text(connection?.account_label),
    external_account_id: text(connection?.external_account_id),
    scopes: Array.isArray(connection?.scopes) ? [...new Set(connection.scopes.map(String))].sort() : [],
    metadata: redactMetadata(connection?.metadata || {}),
    last_verified_at: connection?.last_verified_at || null,
  };
}

function blockingReason(coverage, card) {
  if (coverage.state !== "enabled") return coverage.reason || "provider_not_supported";
  if (card.status === "needs_setup") return "provider_configuration_missing";
  if (card.status === "unavailable") return "provider_connection_unavailable";
  if (card.status === "inactive") return "provider_consumer_inactive";
  if (card.status === "connecting") return "provider_connection_pending";
  if (card.status === "error") return "provider_connection_error";
  if (card.status === "not_connected") return "provider_not_connected";
  return null;
}

function ownerAction(coverage, card, { canManageConnections, actionBasePath }) {
  if (!canManageConnections || coverage.state !== "enabled" || card.ready !== true || !coverage.owner_action) return null;
  if (card.kind === "oauth") {
    return {
      id: "start",
      kind: "oauth_start",
      method: "GET",
      path: `${actionBasePath}?provider=${encodeURIComponent(card.id)}&action=start`,
      owner_only: true,
      returns_to: "/admin/connect",
      callback: {
        method: "GET",
        path: `${actionBasePath}?provider=${encodeURIComponent(card.id)}&action=callback`,
        owner_only: true,
        returns_to: "/admin/connect",
      },
    };
  }
  return {
    id: "connect",
    kind: coverage.owner_action.kind,
    method: coverage.owner_action.method,
    path: actionBasePath,
    owner_only: true,
    provider: card.id,
  };
}

function providerRow(coverage, card, connection, options) {
  const definition = operatorProviderDefinition(card.id);
  const safe = safeConnection(connection);
  const connected = ["connected", "inactive"].includes(card.status);
  return {
    id: card.id,
    family: card.family,
    setup_kind: definition.kind,
    authorization: coverage.authorization,
    capability_state: coverage.state,
    supported: card.supported === true && coverage.state === "enabled",
    owner_connectable: card.owner_connectable === true && coverage.state === "enabled",
    status: card.status,
    blocking_reason: blockingReason(coverage, card),
    missing: [...new Set((card.missing || []).map(String))],
    action: ownerAction(coverage, card, options),
    account_label: connected ? safe.account_label : "",
    external_account_id: connected ? safe.external_account_id : "",
    workspace_id: options.workspace_id || safe.workspace_id || null,
    scopes: [...(card.scopes || [])],
    metadata: safe.metadata,
    last_verified_at: connected ? safe.last_verified_at : null,
    downstream_consumers: coverage.downstream_consumers.map((consumer) => ({ ...consumer })),
    source_file: coverage.source_file,
  };
}

function safeAvailability(availability) {
  return Object.fromEntries(
    Object.entries(availability || {}).map(([provider, value]) => [
      provider,
      { ready: value?.ready === true, missing: [...new Set((value?.missing || []).map(String))] },
    ]),
  );
}

export function buildOperatorIntegrationContract({
  principal,
  workspace = null,
  workspaceId = "",
  connections = [],
  availability = {},
  providerConfig = null,
  canManageConnections = false,
  actionBasePath = "/api/admin/connections",
} = {}) {
  const scope = workspace || (() => {
    const id = normalizedWorkspaceId(workspaceId, "workspace_id");
    if (!id) throw workspaceFailure("workspace_scope_required", "A workspace is required for integrations");
    return { workspace_id: id, scope: "workspace" };
  })();
  const ownerCanManage = canManageConnections === true && isUnrestrictedOwnerAdmin(principal);
  const safeConnections = (Array.isArray(connections) ? connections : []).map(safeConnection);
  const stored = new Map(safeConnections.map((connection) => [connection.provider, connection]));
  const config = providerConfig || operatorProviderConfigFromEnv();
  const cards = operatorProviderCards({ connections: safeConnections, availability, config });
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  const providers = OPERATOR_PROVIDER_COVERAGE.map((coverage) => {
    const card = cardsById.get(coverage.provider);
    return providerRow(coverage, card, stored.get(coverage.provider), {
      canManageConnections: ownerCanManage,
      actionBasePath,
      workspace_id: scope.workspace_id,
    });
  });
  return {
    kind: "operator_integrations",
    schema_version: OPERATOR_INTEGRATIONS_SCHEMA_VERSION,
    source: "provider_connections+operator_provider_catalog",
    workspace_id: scope.workspace_id,
    workspace_scope: scope.scope,
    providers,
    integrations: providers,
    // `connections` is the safe legacy shape; no credential envelope or
    // provider token is ever copied into this contract.
    connections: safeConnections,
    availability: safeAvailability(availability),
    actions: {
      status: { method: "GET", path: OPERATOR_INTEGRATIONS_PATH, owner_only: true },
      refresh: { method: "POST", path: OPERATOR_INTEGRATIONS_PATH, body: { action: "refresh" }, owner_only: true },
      disconnect: { method: "POST", path: "/api/admin/connections/disconnect", body: { provider: "<provider>" }, owner_only: true },
    },
    capability_summary: {
      total: providers.length,
      enabled: providers.filter((provider) => provider.capability_state === "enabled").length,
      connected: providers.filter((provider) => ["connected", "inactive"].includes(provider.status)).length,
      actionable: providers.filter((provider) => provider.action).length,
    },
  };
}

export async function readOperatorIntegrationContract({
  principal,
  workspaceId = "",
  configuredWorkspaceId = "",
  providerConfig = null,
  providerPayload = null,
  readConnections = readProviderConnections,
  canManageConnections = false,
  actionBasePath = "/api/admin/connections",
} = {}) {
  const workspace = resolveOperatorIntegrationWorkspace(principal, { workspaceId, configuredWorkspaceId });
  const config = providerConfig || operatorProviderConfigFromEnv();
  const availability = operatorProviderAvailability(config);
  if (availability.store?.ready !== true) {
    throw new ProviderConnectionUnavailableError("Provider connection storage is unavailable");
  }
  const rawConnections = await readConnections({ payload: providerPayload, workspaceId: workspace.workspace_id || "" });
  const connections = Array.isArray(rawConnections) ? rawConnections : [];
  return buildOperatorIntegrationContract({
    principal,
    workspace,
    connections,
    availability,
    providerConfig: config,
    canManageConnections,
    actionBasePath,
  });
}
