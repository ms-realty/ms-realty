// The one-step operator onboarding at /admin/connect.
//
// One card per tool the agency actually uses, each with a plain-language
// sentence about what connecting lets them do, one status pill, and exactly one
// primary action. A provider whose application has not been registered yet says
// so and offers a copyable checklist for whoever can register it -- it never
// renders a button that would fail.
//
// Below the cards, the page offers the authorized Codex handoff and (when the
// owner-only issuance succeeds) one short-lived delegated credential. The
// credential itself is never included in the prompt or saved configuration.
//
// The page deliberately avoids the React admin shell: its entire job is a
// column of cards and one safe app handoff that an eighty-year-old can use. Like the
// login and team pages it loads the workbench webfonts and design-system bundle
// and lays itself out with the same tokens (literal fallbacks keep it readable
// if the stylesheet is blocked).

import { publicAdminPrincipal } from "./admin-auth.mjs";
import { renderAdminWorkspace } from "./admin-workflows.mjs";
import { renderHtmlPage } from "./html.mjs";
import { loadLocaleRegistry } from "./locales.mjs";
import { renderReactAdminBody } from "./react-admin-site.mjs";
import { operatorConnectCopy, providerCopyKey, providerDisplayName } from "./operator-connect-copy.mjs";
import { operatorProviderCards } from "./operator-provider-catalog.mjs";

export const OPERATOR_TOKEN_ENV = "MS_REALTY_OPERATOR_TOKEN";
const OPERATOR_TOKEN_PLACEHOLDER = `\${${OPERATOR_TOKEN_ENV}}`;
const OPERATIONAL_PROVIDER_IDS = Object.freeze(["google", "whatsapp", "facebook", "instagram", "ai"]);
const SUPPORTING_PROVIDER_IDS = Object.freeze(["viber"]);

const PROMPT_TEMPLATE = `You are now the operations copilot for MS Realty, a family real-estate agency in Sandanski, Bulgaria (legacy sites makler-realty.com and makler-realty.ru; the authoritative public platform runs at __BASE_URL__).

Pre-filled configuration for this operator:
- MCP endpoint: __BASE_URL__/mcp
- Credential environment variable: ${OPERATOR_TOKEN_ENV}
- Operator id: __OPERATOR_ID__

Do the following phases autonomously. Ask the user only when a step genuinely needs their click or choice. Speak to the user in the language they use with you (default to Russian).

PHASE 1 — CONNECT THE BUSINESS (remote MCP)
1. Detect your own environment: can you run terminal commands? Is the \`claude\` CLI or \`codex\` CLI available?
2. Preferred (terminal available):
   - Claude Code / Claude Desktop with Code: run
     claude mcp add --transport http ms-realty "__BASE_URL__/mcp" --header "Authorization: Bearer ${OPERATOR_TOKEN_PLACEHOLDER}"
   - Codex / ChatGPT with terminal: add to ~/.codex/config.toml:
     [mcp_servers.ms-realty]
     url = "__BASE_URL__/mcp"
     bearer_token_env_var = "${OPERATOR_TOKEN_ENV}"
3. No terminal: walk the user through Settings -> Connectors -> Add custom connector with URL __BASE_URL__/mcp, and select ${OPERATOR_TOKEN_ENV} in the connector's secret/environment credential field if the app offers one. If no protected credential field is available, say so plainly and stop after Phase 4's report.
4. The short-lived token is issued only on the signed-in owner page. Never paste its value into saved headers, URLs, configuration, or chat.

PHASE 2 — VERIFY
Call these MCP tools and keep the results for the report: get_launch_status, search_public_listings (query "Sandanski", locale "bg"), and get_operator_brief if your role allows it. A 401 means the token was mis-pasted; a 503 on other site APIs is a designed gate, not an outage.

PHASE 3 — VERIFY HERMES THROUGH THE SAME MS REALTY MCP
1. Call ms_realty_hermes with action status.
2. If authorized, call it with action next_tasks and limit 1. Sensitive rows are withheld by design.
3. Do not add a second MCP server or plugin; guarded Hermes drafting is already part of MS Realty Operator.

PHASE 4 — REPORT AND HAND OVER
Tell the user, in short plain sentences:
- what is now connected (business MCP; Hermes bridge if registered; their Gmail/Calendar if they connected your app's own connectors),
- what they can ask you to do right now, as a numbered menu, for example:
  1. "Дай утреннюю сводку" — operator brief + broker work queue,
  2. "Переведи объявления" — pull hermes_next_tasks, draft, submit for human review,
  3. "Покажи очередь качества объявлений" — listing content queue,
  4. "Составь ответ клиенту" — draft a reply in chat for the user to send from their own email,
  5. "Статус запуска" — launch gates and what still blocks production readiness,
- what is intentionally off according to get_launch_status; never infer production readiness from this prompt or from a successful login.
Then suggest connecting Gmail and Calendar through your app's own connector settings so the user can send approved replies with one click.

NON-NEGOTIABLE GUARDRAILS
- You draft; humans approve. Never publish, never mark anything indexable, never send customer messages yourself.
- Preserve property facts exactly: price, area, bedrooms, location, listing reference, source URL.
- Bulgarian is the source locale. Never describe Sandanski as a sea destination.
- Sensitive customer contact data stays inside the system; work from the privacy-safe briefs the tools return. Do not copy raw contacts into notes, files, or other services.
- If a tool refuses (401/403/sensitive-row rejection/validation error), report it honestly; never work around a guardrail.`;

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

export const DEFAULT_CODEX_MARKETPLACE_PATH = "/Users/ivan/.agents/plugins/marketplace.json";

export function operatorCodexPluginUrl({ marketplacePath = DEFAULT_CODEX_MARKETPLACE_PATH } = {}) {
  const resolved = String(marketplacePath || DEFAULT_CODEX_MARKETPLACE_PATH).trim();
  if (!resolved.startsWith("/") || resolved.includes("\0")) {
    throw new Error("The Codex marketplace path must be an absolute local path");
  }
  return `codex://plugins/ms-realty-operator?marketplacePath=${encodeURIComponent(resolved)}`;
}

export function operatorBootstrapPrompt({ baseUrl, operatorId }) {
  const origin = new URL(String(baseUrl)).origin;
  return PROMPT_TEMPLATE.replaceAll("__BASE_URL__", origin)
    .replaceAll("__OPERATOR_ID__", operatorId || "operator");
}

// The whole configuration in one copyable block: what to do, then the exact
// material for Claude Code and for ChatGPT. Everything an operator pastes into
// their assistant, and nothing they have to assemble themselves.
export function operatorAgentConfigBlock({ baseUrl, token, operatorId, expiresAt = "", locale = "en" }) {
  const origin = new URL(String(baseUrl)).origin;
  if (!token || typeof token !== "string") throw new Error("An operator agent token is required");
  const copy = operatorConnectCopy(locale);
  // The token is deliberately an authorization gate, not template material:
  // callers may generate this block only after owner-only issuance succeeds.
  // The operator stores the one-time credential separately as
  // MS_REALTY_OPERATOR_TOKEN; it never lands in copied configuration.
  const claudeConfig = {
    mcpServers: {
      "ms-realty": {
        type: "http",
        url: `${origin}/mcp`,
        headers: { Authorization: `Bearer ${OPERATOR_TOKEN_PLACEHOLDER}` },
      },
    },
  };
  return [
    `MS Realty · ${copy.agentConfigLabel}`,
    `${copy.agentAccount}: ${operatorId || "operator"}`,
    expiresAt ? `${copy.agentExpires}: ${verifiedAt(expiresAt, copy)}` : "",
    "",
    `1. ${copy.agentStep1}`,
    `2. ${copy.agentStep2}`,
    `3. ${copy.agentStep3}`,
    "",
    "=== Claude Code ===",
    `claude mcp add --transport http ms-realty "${origin}/mcp" --header "Authorization: Bearer ${OPERATOR_TOKEN_PLACEHOLDER}"`,
    "",
    "# .mcp.json / claude_desktop_config.json",
    JSON.stringify(claudeConfig, null, 2),
    "",
    "=== ChatGPT (Codex CLI) ===",
    "# ~/.codex/config.toml",
    "[mcp_servers.ms-realty]",
    `url = "${origin}/mcp"`,
    `bearer_token_env_var = "${OPERATOR_TOKEN_ENV}"`,
    "",
    "=== ChatGPT (app) ===",
    "Settings -> Connectors -> Add custom connector",
    `URL: ${origin}/mcp`,
    `Credential secret/environment field: ${OPERATOR_TOKEN_ENV}`,
    "Do not paste the token into saved headers, URLs, configuration, or chat.",
    "",
    "Ask it: get_launch_status, get_operator_brief, and ms_realty_hermes with action next_tasks.",
    "It drafts; a human still approves. Never publish, never send a customer message on your behalf.",
  ]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

// The banner above the cards after a provider round-trip. Both servers build it
// from the same copy so the page never mixes languages.
export function operatorConnectResult({
  locale,
  connected = "",
  disconnected = "",
  verified = "",
  error = false,
  storeError = false,
}) {
  const copy = operatorConnectCopy(locale);
  if (connected) return copy.resultConnected.replace("{provider}", providerDisplayName(connected, copy.lang));
  if (disconnected) return copy.resultDisconnected.replace("{provider}", providerDisplayName(disconnected, copy.lang));
  if (verified) return copy.resultVerified.replace("{provider}", providerDisplayName(verified, copy.lang));
  if (error) return copy.resultRejected;
  if (storeError) return copy.resultStoreError;
  return "";
}

const DATE_LOCALES = { bg: "bg-BG", ru: "ru-RU", en: "en-GB" };

function verifiedAt(value, copy) {
  const raw = String(value || "").trim();
  if (!raw) return copy.noDate;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  try {
    return new Intl.DateTimeFormat(DATE_LOCALES[copy.lang] || DATE_LOCALES.en, {
      dateStyle: "long",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(parsed);
  } catch {
    return raw;
  }
}

function workspaceForOperator(registry, requestedLocale, operator) {
  const workspace = renderAdminWorkspace({ registry, requestedLocale });
  const principal = publicAdminPrincipal(operator);
  if (!principal) return workspace;
  return {
    ...workspace,
    operator_id: principal.id,
    operator_roles: principal.roles,
    operator_capabilities: principal.capabilities,
  };
}

function ownerConnectionView(card, copy, canManageConnections) {
  const connected = card.status === "connected";
  const inactive = card.status === "inactive";
  const storedConnected = connected || inactive;
  const ready = card.status === "not_connected" || storedConnected;
  const ownerCanAct = card.owner_connectable && canManageConnections;
  const helperText = {
    google: copy.googleUsage,
    whatsapp: copy.whatsappUsage,
    facebook: copy.facebookUsage,
    instagram: copy.instagramUsage,
    viber: copy.viberUsage,
    cloudflare: copy.cloudflareUsage,
    neon: copy.neonUsage,
    ai: inactive ? copy.aiInactiveUsage : connected ? copy.aiUsage : copy.aiAvailableUsage,
  }[card.id] || "";
  const blockedText = {
    facebook: copy.facebookBlocked,
    instagram: copy.instagramBlocked,
    viber: copy.viberDisabled,
    cloudflare: copy.cloudflareDisabled,
    neon: copy.neonDisabled,
    ai: copy.aiProviderBlocked,
  }[card.id] || "";
  return {
    id: card.id,
    kind: card.kind,
    family: card.family,
    status: card.status,
    title: copy[providerCopyKey(card.id, "Title")],
    description: copy[providerCopyKey(card.id, "Description")],
    status_label: storedConnected
      ? inactive
        ? copy.connectedInactive
        : copy.connected
      : card.status === "needs_setup"
        ? copy.needsSetup
        : copy.notConnected,
    account_label: storedConnected ? card.account_label || copy.accountConfirmed : "",
    verified_label: storedConnected ? `${copy.verifiedAt}: ${verifiedAt(card.last_verified_at, copy)}` : "",
    action_label: storedConnected ? copy.reauthorize : copy[providerCopyKey(card.id, "Connect")],
    can_manage: ownerCanAct,
    action_href:
      ownerCanAct && card.kind === "oauth" && ready
        ? `/api/admin/connections?provider=${card.id}&action=start`
        : "",
    docs_href: card.setup_url || "",
    docs_label: copy.tokenOpenProvider,
    disconnect_label: copy.disconnect,
    disconnect_hint: copy.disconnectHint,
    unavailable_message: card.owner_connectable
      ? !canManageConnections
        ? copy.sessionRequired
        : ready
          ? ""
          : card.id === "ai"
            ? copy.aiProviderUnavailable
            : copy.oauthUnavailable
      : "",
    recovery_message: card.owner_connectable
      ? !canManageConnections
        ? copy.sessionRequiredRecovery
        : ready
          ? ""
          : card.id === "ai"
            ? copy.aiProviderRecovery
            : copy.oauthRecovery
      : "",
    helper_text: helperText,
    blocked_text:
      storedConnected || card.status === "not_connected"
        ? ""
        : !canManageConnections && card.owner_connectable
          ? copy.sessionRequired
          : blockedText,
    model: card.model || "",
    endpoint: card.endpoint || "",
  };
}

// The owner page deliberately exposes only connections that both use a
// provider-authorized handoff and power a real runtime workflow. Infrastructure
// and unsupported providers remain status/policy facts, never credential forms
// or decorative "Connect" buttons.
export function buildOperatorConnectPayload({
  registry,
  requestedLocale = "en",
  operator = null,
  connections = [],
  availability = {},
  providerConfig = null,
  baseUrl = "",
  assistantPrompt = "",
  agentToken = "",
  agentExpiresAt = "",
  codexMarketplacePath = DEFAULT_CODEX_MARKETPLACE_PATH,
  result = "",
  resultTone = "success",
  storeError = false,
  canManageConnections = false,
  canIssueAgentCredential = false,
} = {}) {
  const workspace = workspaceForOperator(registry, requestedLocale, operator);
  const copy = operatorConnectCopy(workspace.locale);
  const visibleCards = operatorProviderCards({ connections, availability, config: providerConfig });
  const cardById = new Map(visibleCards.map((card) => [card.id, card]));
  const cards = OPERATIONAL_PROVIDER_IDS.map((id) => cardById.get(id))
    .filter(Boolean)
    .map((card) => ownerConnectionView(card, copy, canManageConnections));
  const supportingConnections = SUPPORTING_PROVIDER_IDS.map((id) => cardById.get(id))
    .filter(Boolean)
    .map((card) => ownerConnectionView(card, copy, false));
  const whatsapp = cards.find((card) => card.id === "whatsapp");
  const ai = cardById.get("ai");
  const hermesMode = providerConfig?.hermes?.mode;
  const hermesRuntimeConfigured = Boolean(
    providerConfig?.hermes?.endpoint && providerConfig?.hermes?.has_api_key,
  );
  const connectedAi = ai?.status === "connected";
  const selfHostedHermesReady = hermesMode === "self_hosted" && hermesRuntimeConfigured;
  const connectedAiIsActive = connectedAi && !selfHostedHermesReady;
  const hermesReady =
    connectedAiIsActive || (hermesMode === "openrouter" ? hermesRuntimeConfigured : selfHostedHermesReady);
  const operatorId = workspace.operator_id || operator?.id || "operator";
  const assistantConfig = agentToken
    ? operatorAgentConfigBlock({
        baseUrl,
        token: agentToken,
        operatorId,
        expiresAt: agentExpiresAt,
        locale: workspace.lang,
      })
    : String(assistantPrompt || "");
  const systemState = (ready) => ({
    status: ready ? "ready" : "attention",
    status_label: ready ? copy.managedReady : copy.managedAttention,
  });
  return {
    kind: "admin_connections",
    status: 200,
    path: "/admin/connect",
    canonical: "/admin/connect",
    indexable: false,
    lang: workspace.lang,
    locale: workspace.locale,
    dir: workspace.dir,
    metadata: {
      title: copy.documentTitle,
      description: copy.intro,
      robots: "noindex,nofollow",
    },
    workspace,
    connection_copy: copy,
    connections: cards,
    managed_systems: [
      {
        id: "hermes",
        title: copy.managedHermesTitle,
        description: copy.managedHermesDescription,
        helper_text:
          connectedAiIsActive || hermesMode === "openrouter"
            ? copy.aiUsage
            : hermesMode === "self_hosted"
              ? copy.managedHermesSelfHostedUsage
              : copy.managedHermesUnconfiguredUsage,
        ...systemState(hermesReady),
        model: providerConfig?.hermes?.model || "",
        endpoint: providerConfig?.hermes?.endpoint_redacted || "",
      },
      {
        id: "data",
        title: copy.managedDataTitle,
        description: copy.managedDataDescription,
        helper_text: copy.managedDataUsage,
        ...systemState(availability.store?.ready === true && !storeError),
      },
      {
        id: "cloudflare",
        title: copy.cloudflareTitle,
        description: copy.cloudflareDescription,
        helper_text: copy.cloudflareUsage,
        status: "managed",
        status_label: copy.managedElsewhere,
      },
      {
        id: "neon",
        title: copy.neonTitle,
        description: copy.neonDescription,
        helper_text: copy.neonUsage,
        status: "managed",
        status_label: copy.managedElsewhere,
      },
    ],
    supporting_connections: supportingConnections,
    whatsapp_client: {
      enabled: Boolean(canManageConnections && whatsapp && whatsapp.status !== "needs_setup"),
      app_id: availability.whatsapp?.app_id || "",
      config_id: availability.whatsapp?.config_id || "",
      version: availability.whatsapp?.graph_version || "",
    },
    assistant: {
      title: copy.agentTitle,
      description: copy.agentDescription,
      install_label: copy.agentInstall,
      install_hint: copy.agentInstallHint,
      plugin_url: operatorCodexPluginUrl({ marketplacePath: codexMarketplacePath }),
      config: assistantConfig,
      operator_id: operatorId,
      credential_env: OPERATOR_TOKEN_ENV,
      credential: String(agentToken || ""),
      expires_at: String(agentExpiresAt || ""),
      can_issue: Boolean(canManageConnections && canIssueAgentCredential && !agentToken),
      issue_path: `/admin/connect?locale=${encodeURIComponent(workspace.locale)}`,
    },
    result: result ? { message: result, tone: resultTone === "error" ? "error" : "success" } : null,
    store_error: storeError,
  };
}

// Compatibility entry point for callers that still ask this module for a full
// document. It uses the same payload and shell as both production runtimes.
export function renderOperatorConnectPage(options = {}) {
  const page = buildOperatorConnectPayload({
    registry: options.registry || loadLocaleRegistry(),
    requestedLocale: options.locale || "en",
    operator: {
      id: options.operatorId || "operator",
      source: "payload_session",
      can_mutate: true,
      roles: ["admin"],
      workspace_ids: [],
    },
    connections: options.connections || [],
    availability: options.availability || {},
    providerConfig: options.providerConfig || null,
    baseUrl: options.baseUrl || "http://localhost",
    assistantPrompt: options.assistantPrompt || "",
    agentToken: options.agentToken || "",
    agentExpiresAt: options.agentExpiresAt || "",
    codexMarketplacePath: options.codexMarketplacePath || DEFAULT_CODEX_MARKETPLACE_PATH,
    result: options.result || "",
    resultTone: options.resultTone || "success",
    storeError: options.storeError === true,
    canManageConnections: true,
    canIssueAgentCredential: options.canIssueAgentCredential === true,
  });
  return renderHtmlPage(page, { bodyHtml: renderReactAdminBody(page) });
}

export { operatorConnectCopy };
