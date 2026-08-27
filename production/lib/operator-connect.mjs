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

import { ADMIN_CSS_HASH, FONTS_URL, LOGO_ASPECT, LOGO_URL } from "./ui/design-assets.mjs";
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

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

const PROVIDERS_WITHOUT_REMOTE_REVOKE = new Set(["cloudflare", "neon"]);

const DATE_LOCALES = { bg: "bg-BG", ru: "ru-RU", en: "en-GB" };

// "24 август 2026 г., 09:12" rather than "2026-08-24T09:12:00.000Z". The reader
// is an estate agent checking whether a connection is still alive, and an ISO
// timestamp makes them work for an answer they should be able to glance at.
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

function statusPill(card, copy) {
  const state =
    card.status === "connected"
      ? copy.connected
      : card.status === "configured"
        ? copy.runtimeReady
        : card.status === "needs_setup"
          ? copy.needsSetup
          : card.status === "disabled"
            ? copy.disabled
            : copy.notConnected;
  const modifier =
    card.status === "connected"
      ? " status--ok"
      : card.status === "configured"
        ? " status--ok"
        : card.status === "needs_setup"
          ? " status--setup"
          : card.status === "disabled"
            ? " status--disabled"
            : "";
  return `<strong class="status${modifier}" aria-label="${escapeHtml(`${copy.statusLabel}: ${state}`)}">${escapeHtml(state)}</strong>`;
}

function unavailableProviderBlock(copy, message = copy.oauthUnavailable, recovery = copy.oauthRecovery) {
  return `<p class="blocked" data-provider-unavailable="true">${escapeHtml(message)}</p>
    <p class="hint" data-provider-recovery="true">${escapeHtml(recovery)}</p>`;
}

function runtimeHealthBlock(card, copy) {
  if (card.status === "configured") {
    return `<p class="verified" data-runtime-health="configured">${escapeHtml(copy.aiProviderHealthy)}</p>`;
  }
  return unavailableProviderBlock(copy, copy.aiProviderDisabled, copy.aiProviderRecovery);
}

function disconnectForm(card, copy) {
  return `<form class="card__disconnect" method="post" action="/api/admin/connections/disconnect">
      <input type="hidden" name="provider" value="${escapeHtml(card.id)}">
      <button class="button button--quiet" type="submit">${escapeHtml(copy.disconnect)}</button>
      <span class="hint">${escapeHtml(PROVIDERS_WITHOUT_REMOTE_REVOKE.has(card.id) ? copy.disconnectManual : copy.disconnectHint)}</span>
    </form>`;
}

function disabledProviderBlock(card, copy) {
  const reason = copy[providerCopyKey(card.id, "Disabled")] || copy.noToken;
  return `<p class="blocked" data-provider-disabled="true">${escapeHtml(reason)}</p>`;
}

function cardAction(card, copy, { whatsappReady }) {
  if (card.supported === false) return disabledProviderBlock(card, copy);
  if (card.kind === "runtime") return runtimeHealthBlock(card, copy);
  if (card.status === "needs_setup") return unavailableProviderBlock(copy);
  if (card.kind === "oauth") {
    return `<p><a class="button" href="/api/admin/connections?provider=${escapeHtml(card.id)}&amp;action=start">${escapeHtml(copy[providerCopyKey(card.id, "Connect")])}</a></p>`;
  }
  if (card.kind === "embedded_signup") {
    return whatsappReady
      ? `<button class="button" id="whatsapp-connect" type="button" disabled>${escapeHtml(copy.whatsappConnect)}</button><p id="whatsapp-result" class="verified" role="status" aria-live="polite" aria-atomic="true">${escapeHtml(copy.whatsappLoading)}</p>`
      : `<p class="blocked">${escapeHtml(copy.whatsappBlocked)}</p>`;
  }
  // Token-only providers have no owner-console connection path. Keep this
  // closed if a future catalogue entry forgets to declare its UI support.
  return disabledProviderBlock(card, copy);
}

function runtimeFacts(card, copy) {
  const rows = [
    card.endpoint ? `${copy.aiProviderEndpoint}: ${card.endpoint}` : "",
    card.model ? `${copy.aiProviderModel}: ${card.model}` : "",
  ].filter(Boolean);
  return rows.length ? `<p class="verified">${escapeHtml(rows.join(" · "))}</p>` : "";
}

function connectionCard(card, copy, options) {
  const title = copy[providerCopyKey(card.id, "Title")];
  const description = copy[providerCopyKey(card.id, "Description")];
  const connected = card.status === "connected";
  const runtime = card.kind === "runtime";
  return `<section class="card" data-provider="${escapeHtml(card.id)}" data-status="${escapeHtml(card.status)}" aria-labelledby="provider-${escapeHtml(card.id)}-title">
    <div class="card__head">
      <div><h2 id="provider-${escapeHtml(card.id)}-title">${escapeHtml(title)}</h2><p>${escapeHtml(description)}</p></div>
      ${statusPill(card, copy)}
    </div>
    ${runtime
      ? `${card.status === "configured" ? runtimeFacts(card, copy) : ""}${cardAction(card, copy, options)}`
      : connected
        ? `<p class="account">${escapeHtml(card.account_label || copy.accountConfirmed)}</p>
           <p class="verified">${escapeHtml(copy.verifiedAt)}: ${escapeHtml(verifiedAt(card.last_verified_at, copy))}</p>
           ${disconnectForm(card, copy)}`
        : cardAction(card, copy, options)
    }
  </section>`;
}

const CONNECT_STYLE = `
  :root { color-scheme: light; }
  .connect-page {
    margin: 0;
    min-height: 100vh;
    padding: 24px;
    box-sizing: border-box;
    background: var(--ink-50, #F4F4F3);
    color: var(--text-strong, #241F18);
    font-family: var(--font-sans, Commissioner, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif);
    font-size: 15px;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
  }
  .connect { width: 100%; max-width: 860px; margin: 0 auto; display: grid; gap: 16px; }
  .connect__top { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
  .connect__brand { display: inline-flex; }
  .connect__brand img { display: block; height: 32px; width: auto; }
  .connect__back {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 40px;
    padding: 0 12px;
    border: 1px solid var(--ink-200, #C9C9C7);
    border-radius: 8px;
    background: #FFFFFF;
    color: var(--text-strong, #241F18);
    font-size: 13px;
    font-weight: 600;
    text-decoration: none;
  }
  .connect__back:hover { border-color: var(--ink-500, #545453); text-decoration: none; }
  .connect h1 { margin: 0; font-family: inherit; font-size: 22px; font-weight: 600; line-height: 1.25; letter-spacing: -0.015em; color: var(--text-strong, #241F18); }
  .connect h2 { margin: 0 0 4px; font-family: inherit; font-size: 15px; font-weight: 600; line-height: 1.25; color: var(--text-strong, #241F18); }
  .intro, .card p { margin: 0; color: var(--text-muted, #948263); font-size: 15px; line-height: 1.5; }
  .notice { margin: 0; padding: 10px 12px; border: 1px solid var(--sea-100, #D2E3E1); border-radius: 8px; background: var(--sea-50, #ECF3F2); color: var(--sea-800, #122C2B); font-size: 13px; font-weight: 600; line-height: 1.4; }
  .grid { display: grid; gap: 12px; margin: 0; }
  .card { padding: 16px 20px; border: 1px solid var(--ink-100, #E6E6E5); border-radius: 8px; background: #FFFFFF; }
  .card:hover { border-color: var(--ink-200, #C9C9C7); }
  .card:focus-within { border-color: var(--ink-500, #545453); }
  .card__head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
  .status {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    min-height: 24px;
    padding: 0 10px;
    border-radius: 999px;
    background: var(--stone-100, #F2ECE1);
    color: var(--text-muted, #948263);
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;
  }
  .status--ok { background: var(--success-50, #E7F3EC); color: var(--success-600, #256345); }
  .status--setup { background: var(--sun-100, #FBEECF); color: var(--sun-600, #AE7420); }
  .status--disabled { background: var(--ink-100, #E6E6E5); color: var(--text-muted, #756A5C); }
  .card .account { margin-top: 12px; color: var(--text-strong, #241F18); font-weight: 600; }
  .card .verified { margin: 4px 0 0; font-size: 13px; }
  .card .blocked { margin-top: 12px; padding: 10px 12px; border-radius: 8px; background: var(--sun-100, #FBEECF); color: var(--sun-600, #AE7420); font-size: 13px; line-height: 1.4; }
  .card .blocked + p { margin-top: 8px; }
  .link { display: inline-flex; align-items: center; min-height: 44px; color: var(--text-link, #3F3F3F); font-weight: 600; text-decoration: underline; text-underline-offset: 3px; }
  .button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 44px;
    margin-top: 12px;
    padding: 0 16px;
    border: 0;
    border-radius: 8px;
    background: var(--brand, #222222);
    color: #FFFFFF;
    font: inherit;
    font-size: 15px;
    font-weight: 600;
    line-height: 1;
    cursor: pointer;
    text-decoration: none;
  }
  .button:hover { background: var(--brand-hover, #181818); text-decoration: none; }
  .button:active { transform: translateY(1px); }
  .button:disabled { cursor: wait; opacity: 0.6; }
  .button:focus-visible, .connect__back:focus-visible {
    outline: none;
    box-shadow: var(--shadow-focus, 0 0 0 3px rgba(219, 62, 62, 0.45));
  }
  .card__disconnect { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-top: 12px; max-width: none; }
  .card__disconnect .button { margin-top: 0; }
  .card__disconnect .hint { margin: 0; flex: 1 1 200px; }
  .agent { padding-top: 20px; border-top: 1px solid var(--ink-100, #E6E6E5); }
  .agent p { margin: 0; }
  .agent .button { margin-top: 16px; }
  .ai__actions, .agent__actions { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
  .button--quiet { background: var(--surface, #FFFFFF); border: 1px solid var(--ink-200, #C9C9C7); color: var(--text-strong, #241F18); }
  .button--quiet:hover { background: var(--ink-50, #F4F4F3); }
  .hint { margin: 12px 0 0; color: var(--text-muted, #948263); font-size: 13px; line-height: 1.4; }
  @media (max-width: 580px) {
    .connect-page { padding: 16px; }
    .connect__back { min-height: 44px; }
    .card { padding: 16px; }
    .card__head { display: block; }
    .status { margin-top: 12px; }
    .button, form .button { width: 100%; box-sizing: border-box; }
    .agent__actions { display: grid; }
    .card__disconnect .button { width: 100%; }
  }
`;

const inlineJson = (value) => JSON.stringify(value).replaceAll("<", "\\u003c");

export function renderOperatorConnectPage({
  baseUrl,
  token = "",
  operatorId,
  connections = [],
  availability = {},
  providerConfig = null,
  agentToken = "",
  agentExpiresAt = "",
  codexMarketplacePath = DEFAULT_CODEX_MARKETPLACE_PATH,
  result = "",
  locale = "en",
}) {
  const copy = operatorConnectCopy(locale);
  const codexPluginUrl = operatorCodexPluginUrl({ marketplacePath: codexMarketplacePath });
  const codexInstall = `<p class="agent__actions"><a class="button" href="${escapeHtml(codexPluginUrl)}" rel="noopener" data-codex-plugin-install="ms-realty-operator">${escapeHtml(copy.agentInstall)}</a></p>
         <p class="hint" id="codex-plugin-install-hint">${escapeHtml(copy.agentInstallHint)}</p>`;
  const agentCard = `<section class="agent" data-agent-config="unavailable">
         <h2>${escapeHtml(copy.agentTitle)}</h2>
         <p>${escapeHtml(copy.agentDescription)}</p>
         ${codexInstall}
         <p class="blocked">${escapeHtml(copy.agentNoToken || copy.noToken)}</p>
       </section>`;
  const cards = operatorProviderCards({ connections, availability, config: providerConfig });
  const whatsapp = cards.find((card) => card.id === "whatsapp");
  const whatsappReady = whatsapp?.status === "not_connected";
  return `<!doctype html>
<html lang="${copy.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escapeHtml(copy.documentTitle)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS_URL}">
<link rel="stylesheet" href="/vendor/ms-realty-admin.css?v=${ADMIN_CSS_HASH}" data-ms-realty-design-system="external" data-ds-hash="${ADMIN_CSS_HASH}">
<style>${CONNECT_STYLE}</style>
</head>
<body class="connect-page">
<main class="connect" aria-labelledby="admin-connect-title">
  <div class="connect__top">
    <a class="connect__brand" href="/admin" aria-label="MS Realty"><img src="${LOGO_URL}" alt="MS Realty" height="32" width="${Math.round(32 * LOGO_ASPECT)}"></a>
    <a class="connect__back" href="/admin">&larr; ${escapeHtml(copy.back)}</a>
  </div>
  <h1 id="admin-connect-title">${escapeHtml(copy.title)}</h1>
  <p class="intro">${escapeHtml(copy.intro)}</p>
  ${result ? `<p class="notice" role="status">${escapeHtml(result)}</p>` : ""}
  <div class="grid">
    ${cards.map((card) => connectionCard(card, copy, { whatsappReady })).join("\n    ")}
  </div>
  ${agentCard}
</main>
<script>
  const text = ${inlineJson({
    metaChecking: copy.metaChecking,
    metaRejected: copy.metaRejected,
    metaNoServer: copy.metaNoServer,
    metaReady: copy.metaReady,
    metaSdkFailed: copy.metaSdkFailed,
    metaSdkNotReady: copy.metaSdkNotReady,
    metaOpening: copy.metaOpening,
    metaCancelled: copy.metaCancelled,
  })};
  const meta = ${inlineJson({
    enabled: Boolean(whatsappReady),
    appId: availability.whatsapp?.app_id || null,
    configId: availability.whatsapp?.config_id || null,
    version: availability.whatsapp?.graph_version || null,
  })};
  if (meta.enabled) {
    let signup = null, code = null;
    const result = document.getElementById("whatsapp-result");
    const button = document.getElementById("whatsapp-connect");
    const fail = (message) => { result.textContent = message; result.removeAttribute("aria-busy"); button.disabled = false; };
    const finish = async () => {
      if (!signup || !code) return;
      button.disabled = true; result.setAttribute("aria-busy", "true");
      result.textContent = text.metaChecking;
      try {
        const response = await fetch("/api/admin/connections", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ provider: "whatsapp", code, waba_id: signup.waba_id, phone_number_id: signup.phone_number_id }),
        });
        if (response.ok) location.assign("/admin/connect?connected=whatsapp");
        else fail(text.metaRejected);
      } catch { fail(text.metaNoServer); }
    };
    addEventListener("message", (event) => {
      if (!["https://www.facebook.com", "https://web.facebook.com"].includes(event.origin)) return;
      let data = event.data; try { if (typeof data === "string") data = JSON.parse(data); } catch { return; }
      if (data?.type === "WA_EMBEDDED_SIGNUP" && data?.event === "FINISH") { signup = data.data; finish(); }
    });
    window.fbAsyncInit = () => { FB.init({ appId: meta.appId, autoLogAppEvents: true, xfbml: false, version: meta.version }); button.disabled = false; result.textContent = text.metaReady; };
    const script = document.createElement("script"); script.async = true; script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.onerror = () => fail(text.metaSdkFailed); document.head.append(script);
    button?.addEventListener("click", () => {
      if (!window.FB) return fail(text.metaSdkNotReady);
      button.disabled = true; result.textContent = text.metaOpening;
      FB.login((response) => {
        code = response?.authResponse?.code || null;
        if (!code) return fail(text.metaCancelled);
        finish();
      }, { config_id: meta.configId, response_type: "code", override_default_response_type: true, extras: { setup: {} } });
    });
  }
</script>
</body>
</html>`;
}

export { operatorConnectCopy };
