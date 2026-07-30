import { DS_HASH, FONTS_URL } from "./ui/design-assets.mjs";

// The Hermes backend switch screen. Rendered directly (login-page pattern)
// rather than through the React admin shell: it is an operations control with
// one form, and keeping it out of the shell keeps the pinned admin smoke
// fixtures untouched.

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const BACKEND_LABELS = {
  openrouter: "OpenRouter — cloud API, per-token spend, works everywhere",
  "claude-cli": "Claude CLI — desktop Claude subscription, dev machine only",
  "codex-cli": "Codex CLI — desktop ChatGPT/Codex subscription, dev machine only",
};

export function renderAdminHermesPage({ status, switched = false, error = "" } = {}) {
  const current = status.backend;
  const options = status.backends
    .map((backend) => {
      const checked = backend === current ? " checked" : "";
      return `<label class="hermes__option"><input type="radio" name="backend" value="${backend}"${checked}> <strong>${backend}</strong><span>${escapeHtml(BACKEND_LABELS[backend] || "")}</span></label>`;
    })
    .join("\n    ");
  return `<!doctype html>
<html lang="en" dir="ltr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex,nofollow">
<title>Hermes backend | MS Realty</title>
<link rel="stylesheet" href="${FONTS_URL}">
<link rel="stylesheet" href="/vendor/ms-realty.css?v=${DS_HASH}">
<style>
.hermes { min-height: 100dvh; display: grid; place-items: start center; padding: var(--space-6) var(--space-5); background: var(--canvas); }
.hermes__card { width: min(640px, 100%); display: grid; gap: var(--space-4); padding: var(--space-6); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-lg); }
.hermes__card h1 { margin: 0; font-size: var(--text-xl); color: var(--text-strong); }
.hermes__card p { margin: 0; color: var(--text-muted); font-size: var(--text-sm); }
.hermes__facts { margin: 0; display: grid; gap: var(--space-1); font-size: var(--text-sm); color: var(--text-strong); }
.hermes__facts div { display: flex; gap: var(--space-2); }
.hermes__facts dt { min-width: 180px; color: var(--text-muted); }
.hermes__facts dd { margin: 0; }
.hermes__option { display: grid; grid-template-columns: auto auto 1fr; align-items: baseline; gap: var(--space-2); padding: var(--space-3); border: 1px solid var(--border); border-radius: var(--radius-input); font-size: var(--text-sm); }
.hermes__option span { color: var(--text-muted); }
.hermes__card button { min-height: 44px; justify-self: start; padding: 0 var(--space-5); }
.hermes__note { font-size: var(--text-xs); }
</style>
</head>
<body>
<main class="hermes">
  <form class="hermes__card" method="post" action="/admin/hermes">
    <h1>Hermes generation backend</h1>
    <p>Which engine drafts listing translations. Desktop CLIs use the operator's subscriptions and fail closed in production. Switching is audit-logged.</p>
    ${switched ? '<p class="mk-alert mk-alert--success" role="status" data-hermes-switched="true">Backend switched.</p>' : ""}
    ${error ? `<p class="mk-alert mk-alert--danger" role="alert">${escapeHtml(error)}</p>` : ""}
    <dl class="hermes__facts">
      <div><dt>Current backend</dt><dd data-hermes-backend="${escapeHtml(current)}">${escapeHtml(current)} (${escapeHtml(status.source)})</dd></div>
      <div><dt>Model</dt><dd>${escapeHtml(status.model || "from env at run time")}</dd></div>
      ${status.cli ? `<div><dt>CLI on this machine</dt><dd>${escapeHtml(status.cli.binary)} ${status.cli.available ? "found" : "NOT FOUND"}</dd></div>` : ""}
      <div><dt>Allowed in production</dt><dd>${status.production_allowed ? "yes" : "no — fails closed, drafts stay queued"}</dd></div>
      ${status.updated_at ? `<div><dt>Last switched</dt><dd>${escapeHtml(status.updated_at)} by ${escapeHtml(status.updated_by || "")}</dd></div>` : ""}
      <div><dt>Desktop plugin (MCP)</dt><dd>ms-realty-hermes — pull tasks from ChatGPT/Claude/Codex apps, see HERMES-DESKTOP.md</dd></div>
    </dl>
    ${options}
    <button class="mk-button mk-button--primary" type="submit">Switch backend</button>
    <p class="hermes__note">Lead-reply drafts are unaffected: they require the self-hosted provider and never leave for hosted inference.</p>
  </form>
</main>
</body>
</html>`;
}
