import { PAYLOAD_ADMIN_ROLES } from "./payload-admin-auth.mjs";
import { DS_HASH, FONTS_URL, LOGO_ASPECT, LOGO_URL } from "./ui/design-assets.mjs";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// The team page is a standalone document like the login page: it loads the
// workbench webfonts and design-system bundle and lays out two panels on the
// admin canvas. Token values carry literal fallbacks so the page still reads
// correctly if the stylesheet is blocked.
const TEAM_STYLE = `
  .team-page {
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
  .team { width: 100%; max-width: 960px; margin: 0 auto; display: grid; gap: 16px; }
  .team__top { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
  .team__brand { display: inline-flex; }
  .team__brand img { display: block; height: 32px; width: auto; }
  .team__back {
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
  .team__back:hover { border-color: var(--ink-500, #545453); text-decoration: none; }
  .team__title {
    margin: 0;
    font-family: inherit;
    font-size: 22px;
    font-weight: 600;
    line-height: 1.25;
    letter-spacing: -0.015em;
    color: var(--text-strong, #241F18);
  }
  .team__status {
    margin: 0;
    padding: 10px 12px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    line-height: 1.4;
  }
  .team__status.notice { background: var(--success-50, #E7F3EC); color: var(--success-700, #1F5A3E); }
  .team__status.error { background: var(--danger-50, #F9E7EA); color: var(--danger-600, #9E2334); }
  .team__panel {
    overflow: hidden;
    border: 1px solid var(--ink-100, #E6E6E5);
    border-radius: 8px;
    background: #FFFFFF;
  }
  .team__panel-hd { padding: 14px 20px; border-bottom: 1px solid var(--ink-100, #E6E6E5); }
  .team__panel-hd h2 { margin: 0; font-family: inherit; font-size: 15px; font-weight: 600; line-height: 1.25; }
  .team__form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px 16px; padding: 16px 20px 20px; }
  .team__form label {
    display: grid;
    gap: 6px;
    min-width: 0;
    color: var(--text-strong, #241F18);
    font-size: 13px;
    font-weight: 600;
    line-height: 1.25;
  }
  .team-page .team__form input,
  .team-page .team__form select {
    display: block;
    width: 100%;
    height: 44px;
    min-height: 44px;
    padding: 0 14px;
    box-sizing: border-box;
    border: 1px solid var(--ink-200, #C9C9C7);
    border-radius: 8px;
    background: #FFFFFF;
    color: var(--text-strong, #241F18);
    font: inherit;
    font-size: 15px;
    line-height: 1.25;
  }
  .team-page .team__form select {
    appearance: none;
    -webkit-appearance: none;
    padding-right: 36px;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23948263' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 12px center;
    background-size: 16px 16px;
  }
  .team-page .team__form input:focus-visible,
  .team-page .team__form select:focus-visible {
    outline: none;
    border-color: var(--ink-500, #545453);
    box-shadow: var(--shadow-focus, 0 0 0 3px rgba(219, 62, 62, 0.45));
  }
  .team__actions { grid-column: 1 / -1; display: flex; justify-content: flex-end; }
  .team__submit {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 180px;
    height: 44px;
    min-height: 44px;
    padding: 0 18px;
    border: 0;
    border-radius: 8px;
    background: var(--accent, #C42D2D);
    color: #FFFFFF;
    font: inherit;
    font-size: 15px;
    font-weight: 600;
    line-height: 1;
    cursor: pointer;
  }
  .team__submit:hover { background: var(--accent-hover, #A32323); }
  .team__submit:active { transform: translateY(1px); }
  .team__submit:focus-visible { outline: none; box-shadow: var(--shadow-focus-accent, 0 0 0 3px rgba(34, 34, 34, 0.45)); }
  .team__table-wrap { overflow-x: auto; }
  .team__table { width: 100%; border-collapse: collapse; font-size: 13px; line-height: 1.25; }
  .team__table th,
  .team__table td { padding: 10px 12px; text-align: left; border-bottom: 1px solid var(--ink-100, #E6E6E5); vertical-align: top; }
  .team__table th { color: var(--ink-500, #545453); font-size: 12px; font-weight: 600; text-transform: none; letter-spacing: normal; }
  .team__table tbody tr:hover { background: var(--ink-50, #F4F4F3); }
  .team__table tbody tr:last-child td { border-bottom: 0; }
  .team__empty { margin: 0; padding: 16px 20px; color: var(--text-muted, #948263); font-size: 13px; }
  @media (max-width: 719px) {
    .team-page { padding: 16px; }
    .team__back { min-height: 44px; }
    .team__form { grid-template-columns: 1fr; padding: 16px; }
    .team__submit { width: 100%; }
    .team__table thead { position: absolute; width: 1px; height: 1px; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); }
    .team__table tr { display: block; padding: 8px 0; border-bottom: 1px solid var(--ink-100, #E6E6E5); }
    .team__table td { display: grid; grid-template-columns: minmax(96px, 0.6fr) minmax(0, 1fr); gap: 12px; padding: 6px 16px; border: 0; }
    .team__table td::before { content: attr(data-label); color: var(--text-muted, #948263); font-size: 12px; font-weight: 600; }
  }
`;

export function renderAdminTeamPage({ operators = [], created = false, error = false } = {}) {
  const status = created
    ? '<p class="team__status notice" role="status">Операторът е създаден. / Operator created.</p>'
    : error
      ? '<p class="team__status error" role="alert">Операторът не беше създаден. Провери данните. / Operator was not created.</p>'
      : "";
  const empty = "Няма / None";
  const rows = operators
    .map(
      (operator) => `<tr>
        <td data-label="Име / Name">${escapeHtml(operator.name || empty)}</td>
        <td data-label="Имейл / Email">${escapeHtml(operator.email)}</td>
        <td data-label="Роля / Role">${escapeHtml(operator.role)}</td>
        <td data-label="Работни пространства / Workspaces">${escapeHtml((operator.workspace_ids || []).join(", ") || empty)}</td>
      </tr>`,
    )
    .join("");
  const table = operators.length
    ? `<div class="team__table-wrap"><table class="team__table"><thead><tr><th scope="col">Име / Name</th><th scope="col">Имейл / Email</th><th scope="col">Роля / Role</th><th scope="col">Работни пространства / Workspaces</th></tr></thead><tbody>${rows}</tbody></table></div>`
    : '<p class="team__empty">Все още няма оператори. / No operators yet.</p>';
  const roles = PAYLOAD_ADMIN_ROLES.map((role) => `<option value="${role}">${role}</option>`).join("");
  return `<!doctype html>
<html lang="bg">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Екип · MS Realty</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS_URL}">
<link rel="stylesheet" href="/vendor/ms-realty.css?v=${DS_HASH}" data-ms-realty-design-system="external" data-ds-hash="${DS_HASH}">
<style>${TEAM_STYLE}</style>
</head>
<body class="team-page">
<main class="team" aria-labelledby="admin-team-title">
  <div class="team__top">
    <a class="team__brand" href="/admin" aria-label="MS Realty"><img src="${LOGO_URL}" alt="MS Realty" height="32" width="${Math.round(32 * LOGO_ASPECT)}"></a>
    <a class="team__back" href="/admin">&larr; Работно място / Workbench</a>
  </div>
  <h1 id="admin-team-title" class="team__title">Екип / Team</h1>
  ${status}
  <section class="team__panel" aria-labelledby="admin-team-new">
    <div class="team__panel-hd"><h2 id="admin-team-new">Нов оператор / New operator</h2></div>
    <form method="POST" action="/api/admin/team" class="team__form">
      <label>Име / Name<input name="name" autocomplete="name"></label>
      <label>Имейл / Email<input name="email" type="email" autocomplete="off" required></label>
      <label>Парола / Password<input name="password" type="password" autocomplete="new-password" minlength="12" required></label>
      <label>Роля / Role<select name="role" required>${roles}</select></label>
      <label>Работни пространства / Workspaces<input name="workspace_ids" placeholder="sandanski"></label>
      <div class="team__actions"><button type="submit" class="team__submit">Създай / Create</button></div>
    </form>
  </section>
  <section class="team__panel" aria-labelledby="admin-team-list">
    <div class="team__panel-hd"><h2 id="admin-team-list">Оператори / Operators</h2></div>
    ${table}
  </section>
</main>
</body>
</html>`;
}
