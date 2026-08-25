import { PAYLOAD_ADMIN_ROLES } from "./payload-admin-auth.mjs";
import { ADMIN_LOGIN_LOCALES } from "./admin-login.mjs";
import { ADMIN_CSS_HASH, FONTS_URL, LOGO_ASPECT, LOGO_URL } from "./ui/design-assets.mjs";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// The team page speaks the same three workbench languages as the login page,
// chosen from the query string, instead of stacking two languages into every
// label. Roles keep their stored id as the value and gain a readable name.
const TEAM_COPY = {
  bg: {
    documentTitle: "Екип · MS Realty",
    title: "Екип",
    intro: "Операторите на агенцията и достъпът, който имат до работното място.",
    back: "Работно място",
    created: "Операторът е създаден.",
    error: "Операторът не беше създаден. Провери данните и опитай отново.",
    newOperator: "Нов оператор",
    operators: "Оператори",
    name: "Име",
    email: "Имейл",
    password: "Парола",
    passwordHint: "Поне 12 знака.",
    role: "Роля",
    workspaces: "Работни пространства",
    workspacesHint: "Идентификатори, разделени със запетая.",
    submit: "Създай",
    submitting: "Създаване…",
    empty: "Още няма оператори. Първият създаден акаунт получава достъп до работното място.",
    none: "Няма",
    languageLabel: "Език на работното място",
    roleNames: {
      admin: "Администратор",
      broker: "Брокер",
      editor: "Редактор",
      translator: "Преводач",
      viewer: "Само четене",
    },
  },
  ru: {
    documentTitle: "Команда · MS Realty",
    title: "Команда",
    intro: "Операторы агентства и доступ, который у них есть к рабочему месту.",
    back: "Рабочее место",
    created: "Оператор создан.",
    error: "Оператор не создан. Проверь данные и попробуй снова.",
    newOperator: "Новый оператор",
    operators: "Операторы",
    name: "Имя",
    email: "Почта",
    password: "Пароль",
    passwordHint: "Не менее 12 знаков.",
    role: "Роль",
    workspaces: "Рабочие пространства",
    workspacesHint: "Идентификаторы через запятую.",
    submit: "Создать",
    submitting: "Создаём…",
    empty: "Операторов пока нет. Первый созданный аккаунт получит доступ к рабочему месту.",
    none: "Нет",
    languageLabel: "Язык рабочего места",
    roleNames: {
      admin: "Администратор",
      broker: "Брокер",
      editor: "Редактор",
      translator: "Переводчик",
      viewer: "Только чтение",
    },
  },
  en: {
    documentTitle: "Team · MS Realty",
    title: "Team",
    intro: "The agency operators and the access each of them has to the workbench.",
    back: "Workbench",
    created: "Operator created.",
    error: "The operator was not created. Check the details and try again.",
    newOperator: "New operator",
    operators: "Operators",
    name: "Name",
    email: "Email",
    password: "Password",
    passwordHint: "At least 12 characters.",
    role: "Role",
    workspaces: "Workspaces",
    workspacesHint: "Comma separated identifiers.",
    submit: "Create",
    submitting: "Creating…",
    empty: "No operators yet. The first account created gets access to the workbench.",
    none: "None",
    languageLabel: "Workbench language",
    roleNames: {
      admin: "Administrator",
      broker: "Broker",
      editor: "Editor",
      translator: "Translator",
      viewer: "Read only",
    },
  },
};

const LOCALE_NAMES = { bg: "BG", ru: "RU", en: "EN" };

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
  .team__top-actions { display: flex; align-items: center; gap: 12px; }
  .team__locales { display: inline-flex; gap: 2px; padding: 3px; border-radius: 999px; background: var(--stone-100, #F2ECE1); }
  .team__locale {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 40px;
    height: 30px;
    padding: 0 10px;
    border-radius: 999px;
    color: var(--text-muted, #948263);
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-decoration: none;
  }
  .team__locale:hover { color: var(--text-strong, #241F18); text-decoration: none; }
  .team__locale[aria-current="page"] { background: #FFFFFF; color: var(--text-strong, #241F18); box-shadow: var(--shadow-xs, 0 1px 2px rgba(22, 19, 14, 0.06)); }
  .team__locale:focus-visible { outline: none; box-shadow: var(--shadow-focus, 0 0 0 3px rgba(219, 62, 62, 0.45)); }
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
  .team__back:focus-visible { outline: none; box-shadow: var(--shadow-focus, 0 0 0 3px rgba(219, 62, 62, 0.45)); }
  .team__head { display: grid; gap: 4px; }
  .team__title {
    margin: 0;
    font-family: inherit;
    font-size: 22px;
    font-weight: 600;
    line-height: 1.25;
    letter-spacing: -0.015em;
    color: var(--text-strong, #241F18);
  }
  .team__intro { margin: 0; color: var(--text-muted, #948263); font-size: 15px; }
  .team__status {
    display: flex;
    gap: 10px;
    margin: 0;
    padding: 10px 12px;
    border: 1px solid transparent;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    line-height: 1.4;
  }
  .team__status svg { flex: none; margin-top: 1px; }
  .team__status.notice { border-color: var(--success-500, #2F7D57); background: var(--success-50, #E7F3EC); color: var(--success-700, #1F5A3E); }
  .team__status.error { border-color: var(--danger-500, #C42E44); background: var(--danger-50, #F9E7EA); color: var(--danger-600, #9E2334); }
  .team__panel {
    overflow: hidden;
    border: 1px solid var(--ink-100, #E6E6E5);
    border-radius: 8px;
    background: #FFFFFF;
  }
  .team__panel-hd { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 20px; border-bottom: 1px solid var(--ink-100, #E6E6E5); }
  .team__panel-hd h2 { margin: 0; font-family: inherit; font-size: 15px; font-weight: 600; line-height: 1.25; }
  .team__count {
    display: inline-flex;
    align-items: center;
    min-height: 22px;
    padding: 0 8px;
    border-radius: 999px;
    background: var(--stone-100, #F2ECE1);
    color: var(--text-muted, #948263);
    font-size: 12px;
    font-weight: 600;
  }
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
  .team__form .team__hint { color: var(--text-muted, #948263); font-size: 12px; font-weight: 400; }
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
  .team-page .team__form input:hover,
  .team-page .team__form select:hover { border-color: var(--ink-300, #A8A8A6); }
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
  .team-page[data-team-state="error"] .team__form input:invalid { border-color: var(--danger-500, #C42E44); }
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
  .team__submit:disabled { cursor: wait; opacity: 0.72; transform: none; }
  .team__table-wrap { overflow-x: auto; }
  .team__table { width: 100%; border-collapse: collapse; font-size: 13px; line-height: 1.25; }
  .team__table th,
  .team__table td { padding: 10px 12px; text-align: left; border-bottom: 1px solid var(--ink-100, #E6E6E5); vertical-align: top; }
  .team__table th { color: var(--ink-500, #545453); font-size: 12px; font-weight: 600; text-transform: none; letter-spacing: normal; }
  .team__table tbody tr:hover { background: var(--ink-50, #F4F4F3); }
  .team__table tbody tr:last-child td { border-bottom: 0; }
  .team__role {
    display: inline-flex;
    align-items: center;
    min-height: 22px;
    padding: 0 8px;
    border-radius: 999px;
    background: var(--stone-100, #F2ECE1);
    color: var(--text-strong, #241F18);
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;
  }
  .team__role[data-role="admin"] { background: var(--sun-100, #FBEECF); color: var(--sun-600, #AE7420); }
  .team__muted { color: var(--text-muted, #948263); }
  .team__mono { font-family: var(--font-mono, "IBM Plex Mono", ui-monospace, monospace); font-size: 12px; }
  .team__empty {
    display: grid;
    justify-items: center;
    gap: 6px;
    margin: 0;
    padding: 32px 20px;
    color: var(--text-muted, #948263);
    font-size: 13px;
    text-align: center;
  }
  @media (prefers-reduced-motion: reduce) {
    .team__submit:active { transform: none; }
  }
  @media (max-width: 719px) {
    .team-page { padding: 16px; }
    .team__back { min-height: 44px; }
    .team__locale { min-width: 44px; height: 36px; }
    .team__form { grid-template-columns: 1fr; padding: 16px; }
    .team__submit { width: 100%; }
    .team__table thead { position: absolute; width: 1px; height: 1px; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); }
    .team__table tr { display: block; padding: 8px 0; border-bottom: 1px solid var(--ink-100, #E6E6E5); }
    .team__table td { display: grid; grid-template-columns: minmax(96px, 0.6fr) minmax(0, 1fr); gap: 12px; padding: 6px 16px; border: 0; }
    .team__table td::before { content: attr(data-label); color: var(--text-muted, #948263); font-size: 12px; font-weight: 600; }
  }
`;

const CHECK_ICON =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
const ALERT_ICON =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>';
const USERS_ICON =
  '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>';

export function renderAdminTeamPage({ operators = [], created = false, error = false, locale = "bg" } = {}) {
  const active = ADMIN_LOGIN_LOCALES.includes(locale) ? locale : "bg";
  const copy = TEAM_COPY[active];
  const status = created
    ? `<p class="team__status notice" role="status">${CHECK_ICON}<span>${escapeHtml(copy.created)}</span></p>`
    : error
      ? `<p class="team__status error" role="alert">${ALERT_ICON}<span>${escapeHtml(copy.error)}</span></p>`
      : "";
  const roleName = (role) => copy.roleNames[role] || role;
  const rows = operators
    .map(
      (operator) => `<tr>
        <td data-label="${escapeHtml(copy.name)}">${operator.name ? escapeHtml(operator.name) : `<span class="team__muted">${escapeHtml(copy.none)}</span>`}</td>
        <td data-label="${escapeHtml(copy.email)}"><span class="team__mono">${escapeHtml(operator.email)}</span></td>
        <td data-label="${escapeHtml(copy.role)}"><span class="team__role" data-role="${escapeHtml(operator.role)}">${escapeHtml(roleName(operator.role))}</span></td>
        <td data-label="${escapeHtml(copy.workspaces)}">${
          (operator.workspace_ids || []).length
            ? `<span class="team__mono">${escapeHtml((operator.workspace_ids || []).join(", "))}</span>`
            : `<span class="team__muted">${escapeHtml(copy.none)}</span>`
        }</td>
      </tr>`,
    )
    .join("");
  const table = operators.length
    ? `<div class="team__table-wrap"><table class="team__table"><thead><tr><th scope="col">${escapeHtml(copy.name)}</th><th scope="col">${escapeHtml(copy.email)}</th><th scope="col">${escapeHtml(copy.role)}</th><th scope="col">${escapeHtml(copy.workspaces)}</th></tr></thead><tbody>${rows}</tbody></table></div>`
    : `<p class="team__empty" data-team-empty="true">${USERS_ICON}<span>${escapeHtml(copy.empty)}</span></p>`;
  const roles = PAYLOAD_ADMIN_ROLES.map(
    (role) => `<option value="${escapeHtml(role)}">${escapeHtml(roleName(role))}</option>`,
  ).join("");
  const locales = ADMIN_LOGIN_LOCALES.map((code) => {
    const href = code === "bg" ? "/admin/team" : `/admin/team?locale=${code}`;
    const current = code === active ? ' aria-current="page"' : "";
    return `<a class="team__locale" href="${href}" lang="${code}"${current}>${LOCALE_NAMES[code]}</a>`;
  }).join("");
  return `<!doctype html>
<html lang="${active}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escapeHtml(copy.documentTitle)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS_URL}">
<link rel="stylesheet" href="/vendor/ms-realty-admin.css?v=${ADMIN_CSS_HASH}" data-ms-realty-design-system="external" data-ds-hash="${ADMIN_CSS_HASH}">
<style>${TEAM_STYLE}</style>
</head>
<body class="team-page" data-team-state="${error ? "error" : created ? "created" : "idle"}" data-admin-team-locale="${active}">
<main class="team" aria-labelledby="admin-team-title">
  <div class="team__top">
    <a class="team__brand" href="/admin" aria-label="MS Realty"><img src="${LOGO_URL}" alt="MS Realty" height="32" width="${Math.round(32 * LOGO_ASPECT)}"></a>
    <div class="team__top-actions">
      <nav class="team__locales" aria-label="${escapeHtml(copy.languageLabel)}">${locales}</nav>
      <a class="team__back" href="/admin">&larr; ${escapeHtml(copy.back)}</a>
    </div>
  </div>
  <div class="team__head">
    <h1 id="admin-team-title" class="team__title">${escapeHtml(copy.title)}</h1>
    <p class="team__intro">${escapeHtml(copy.intro)}</p>
  </div>
  ${status}
  <section class="team__panel" aria-labelledby="admin-team-new">
    <div class="team__panel-hd"><h2 id="admin-team-new">${escapeHtml(copy.newOperator)}</h2></div>
    <form method="POST" action="/api/admin/team" class="team__form" data-admin-team-form="true">
      <label>${escapeHtml(copy.name)}<input name="name" autocomplete="name"></label>
      <label>${escapeHtml(copy.email)}<input name="email" type="email" autocomplete="off" required></label>
      <label>${escapeHtml(copy.password)}<input name="password" type="password" autocomplete="new-password" minlength="12" required aria-describedby="team-password-hint"><span class="team__hint" id="team-password-hint">${escapeHtml(copy.passwordHint)}</span></label>
      <label>${escapeHtml(copy.role)}<select name="role" required>${roles}</select></label>
      <label>${escapeHtml(copy.workspaces)}<input name="workspace_ids" placeholder="sandanski" aria-describedby="team-workspaces-hint"><span class="team__hint" id="team-workspaces-hint">${escapeHtml(copy.workspacesHint)}</span></label>
      <div class="team__actions"><button type="submit" class="team__submit" data-team-submit="true" data-busy-label="${escapeHtml(copy.submitting)}">${escapeHtml(copy.submit)}</button></div>
    </form>
  </section>
  <section class="team__panel" aria-labelledby="admin-team-list">
    <div class="team__panel-hd"><h2 id="admin-team-list">${escapeHtml(copy.operators)}</h2><span class="team__count">${operators.length}</span></div>
    ${table}
  </section>
</main>
<script>
  // Progressive enhancement only: without JavaScript the form still posts and
  // the button keeps its idle label.
  (function () {
    var form = document.querySelector("[data-admin-team-form]");
    var submit = document.querySelector("[data-team-submit]");
    if (!form || !submit) return;
    form.addEventListener("submit", function () {
      if (!form.checkValidity()) return;
      document.body.setAttribute("data-team-state", "submitting");
      submit.disabled = true;
      submit.textContent = submit.getAttribute("data-busy-label");
    });
  })();
</script>
</body>
</html>`;
}
