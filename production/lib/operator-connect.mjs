// The one-step operator onboarding at /admin/connect.
//
// One card per tool the agency actually uses, each with a plain-language
// sentence about what connecting lets them do, one status pill, and exactly one
// primary action. A provider whose application has not been registered yet says
// so and offers a copyable checklist for whoever can register it -- it never
// renders a button that would fail.
//
// Below the cards, the page offers only the authorized Codex handoff. Direct
// MCP credentials stay behind the authenticated API and never enter this UI.
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

const PROMPT_TEMPLATE = `You are now the operations copilot for MS Realty, a family real-estate agency in Sandanski, Bulgaria (legacy sites makler-realty.com and makler-realty.ru; the authoritative public platform runs at __BASE_URL__).

Pre-filled configuration for this operator:
- MCP endpoint: __BASE_URL__/mcp
- Bearer token: __TOKEN__
- Operator id: __OPERATOR_ID__

Do the following phases autonomously. Ask the user only when a step genuinely needs their click or choice. Speak to the user in the language they use with you (default to Russian).

PHASE 1 — CONNECT THE BUSINESS (remote MCP)
1. Detect your own environment: can you run terminal commands? Is the \`claude\` CLI or \`codex\` CLI available?
2. Preferred (terminal available):
   - Claude Code / Claude Desktop with Code: run
     claude mcp add --transport http ms-realty "__BASE_URL__/mcp" --header "Authorization: Bearer __TOKEN__"
   - Codex / ChatGPT with terminal: add to ~/.codex/config.toml:
     [mcp_servers.ms-realty]
     url = "__BASE_URL__/mcp"
     http_headers = { "Authorization" = "Bearer __TOKEN__" }
3. No terminal: walk the user through Settings -> Connectors -> Add custom connector with URL __BASE_URL__/mcp, and put "Authorization: Bearer __TOKEN__" in the Request headers section if your app offers it. If neither headers nor terminal are available in this app, say so plainly and stop after Phase 4's report.
4. Never print the token back to the user in chat; it is a credential.

PHASE 2 — VERIFY
Call these MCP tools and keep the results for the report: get_launch_status, search_public_listings (query "Sandanski", locale "bg"), and get_operator_brief if your role allows it. A 401 means the token was mis-pasted; a 503 on other site APIs is a designed gate, not an outage.

PHASE 3 — HERMES DRAFTING BRIDGE (only on the owner's machine with the private repo)
1. Check whether the ms-realty repository exists locally (common path: ~/Code/MS-Realty). If absent, skip this phase silently — the remote MCP already works.
2. If present: run \`npm ci --no-audit --no-fund\` there once, then register the local drafting bridge:
   claude mcp add ms-realty-hermes -- node <repo>/production/scripts/hermes-mcp-server.mjs
   (Codex: [mcp_servers.ms-realty-hermes] command = "node", args = ["<repo>/production/scripts/hermes-mcp-server.mjs"])
3. Verify with hermes_status. It reports how many translation drafts are eligible; sensitive rows are withheld by design.

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

export function operatorBootstrapPrompt({ baseUrl, token, operatorId }) {
  const origin = new URL(String(baseUrl)).origin;
  if (!token || typeof token !== "string") throw new Error("An operator token is required");
  return PROMPT_TEMPLATE.replaceAll("__BASE_URL__", origin)
    .replaceAll("__TOKEN__", token)
    .replaceAll("__OPERATOR_ID__", operatorId || "operator");
}

// The whole configuration in one copyable block: what to do, then the exact
// material for Claude Code and for ChatGPT. Everything an operator pastes into
// their assistant, and nothing they have to assemble themselves.
export function operatorAgentConfigBlock({ baseUrl, token, operatorId, expiresAt = "", locale = "en" }) {
  const origin = new URL(String(baseUrl)).origin;
  if (!token || typeof token !== "string") throw new Error("An operator agent token is required");
  const copy = operatorConnectCopy(locale);
  const claudeConfig = {
    mcpServers: {
      "ms-realty": {
        type: "http",
        url: `${origin}/mcp`,
        headers: { Authorization: `Bearer ${token}` },
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
    `claude mcp add --transport http ms-realty "${origin}/mcp" --header "Authorization: Bearer ${token}"`,
    "",
    "# .mcp.json / claude_desktop_config.json",
    JSON.stringify(claudeConfig, null, 2),
    "",
    "=== ChatGPT (Codex CLI) ===",
    "# ~/.codex/config.toml",
    "[mcp_servers.ms-realty]",
    `url = "${origin}/mcp"`,
    `http_headers = { "Authorization" = "Bearer ${token}" }`,
    "",
    "=== ChatGPT (app) ===",
    "Settings -> Connectors -> Add custom connector",
    `URL: ${origin}/mcp`,
    `Authorization: Bearer ${token}`,
    "",
    "=== Hermes drafting bridge (optional, on the machine with the repository) ===",
    "claude mcp add ms-realty-hermes -- node <repo>/production/scripts/hermes-mcp-server.mjs",
    "",
    "Ask it: get_launch_status, get_operator_brief, hermes_next_tasks.",
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
  const ready = card.status === "not_connected" || connected;
  return {
    id: card.id,
    kind: card.kind,
    status: card.status,
    title: copy[providerCopyKey(card.id, "Title")],
    description: copy[providerCopyKey(card.id, "Description")],
    status_label: connected
      ? copy.connected
      : card.status === "needs_setup"
        ? copy.needsSetup
        : copy.notConnected,
    account_label: connected ? card.account_label || copy.accountConfirmed : "",
    verified_label: connected ? `${copy.verifiedAt}: ${verifiedAt(card.last_verified_at, copy)}` : "",
    action_label: connected ? copy.reauthorize : copy[providerCopyKey(card.id, "Connect")],
    can_manage: canManageConnections,
    action_href:
      canManageConnections && card.kind === "oauth" && ready
        ? `/api/admin/connections?provider=${card.id}&action=start`
        : "",
    disconnect_label: copy.disconnect,
    disconnect_hint: copy.disconnectHint,
    unavailable_message: !canManageConnections ? copy.sessionRequired : ready ? "" : copy.oauthUnavailable,
    recovery_message: !canManageConnections ? copy.sessionRequiredRecovery : ready ? "" : copy.oauthRecovery,
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
  codexMarketplacePath = DEFAULT_CODEX_MARKETPLACE_PATH,
  result = "",
  resultTone = "success",
  storeError = false,
  canManageConnections = false,
} = {}) {
  const workspace = workspaceForOperator(registry, requestedLocale, operator);
  const copy = operatorConnectCopy(workspace.locale);
  const cards = operatorProviderCards({ connections, availability, config: providerConfig })
    .filter((card) => card.owner_connectable)
    .map((card) => ownerConnectionView(card, copy, canManageConnections));
  const whatsapp = cards.find((card) => card.id === "whatsapp");
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
        ...systemState(availability.ai?.ready === true),
      },
      {
        id: "data",
        title: copy.managedDataTitle,
        description: copy.managedDataDescription,
        ...systemState(availability.store?.ready === true && !storeError),
      },
    ],
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
    },
    result: result ? { message: result, tone: resultTone === "error" ? "error" : "success" } : null,
    store_error: storeError,
  };
}

// Compatibility entry point for callers that still ask this module for a full
// document. It uses the same payload and shell as both production runtimes; no
// alternate connection UI or credential-bearing prompt exists anymore.
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
    codexMarketplacePath: options.codexMarketplacePath || DEFAULT_CODEX_MARKETPLACE_PATH,
    result: options.result || "",
    resultTone: options.resultTone || "success",
    storeError: options.storeError === true,
    canManageConnections: true,
  });
  return renderHtmlPage(page, { bodyHtml: renderReactAdminBody(page) });
}

export { operatorConnectCopy };
