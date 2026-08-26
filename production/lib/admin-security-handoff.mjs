import { ADMIN_CSS_HASH, FONTS_URL } from "./ui/design-assets.mjs";

// Two standalone pages for the only values this workspace ever shows once: an
// operator's new TOTP secret with its recovery codes, and a workspace export's
// single-use download link.
//
// They are pages rather than a banner on the settings screen for one reason: a
// redirect would have to carry the secret in a URL, where it lands in browser
// history, referrers and access logs. Here the value exists only in a POST
// response body that is never cached and never revisited.

const COPY = {
  bg: {
    back: "Обратно към настройките",
    enrolment: {
      title: "Запази тези кодове сега",
      lead: "Показваме ги само този път. След като затвориш страницата, няма как да ги видим отново.",
      secretLabel: "Ключ за приложението",
      uriLabel: "Адрес за автоматично добавяне",
      codesLabel: "Резервни кодове",
      codesHint: "Всеки код работи еднократно. Запази ги там, където пазиш паролите.",
      activateLabel: "Код от приложението",
      activateHint: "Въведи текущия шестцифрен код, за да включиш втория фактор.",
      activate: "Включи втория фактор",
    },
    exportReady: {
      title: "Експортът е готов",
      lead: "Връзката работи еднократно и изтича скоро. Изтегли файла сега.",
      download: "Изтегли експорта",
      expiresLabel: "Изтича",
      rowsLabel: "Записи",
      redactionsLabel: "Какво е скрито и защо",
    },
  },
  ru: {
    back: "Назад к настройкам",
    enrolment: {
      title: "Сохраните эти коды сейчас",
      lead: "Мы показываем их только один раз. После закрытия страницы восстановить их нельзя.",
      secretLabel: "Ключ для приложения",
      uriLabel: "Адрес для автоматического добавления",
      codesLabel: "Резервные коды",
      codesHint: "Каждый код работает один раз. Сохраните их там, где храните пароли.",
      activateLabel: "Код из приложения",
      activateHint: "Введите текущий шестизначный код, чтобы включить второй фактор.",
      activate: "Включить второй фактор",
    },
    exportReady: {
      title: "Экспорт готов",
      lead: "Ссылка работает один раз и скоро истекает. Скачайте файл сейчас.",
      download: "Скачать экспорт",
      expiresLabel: "Истекает",
      rowsLabel: "Записи",
      redactionsLabel: "Что скрыто и почему",
    },
  },
  en: {
    back: "Back to settings",
    enrolment: {
      title: "Save these codes now",
      lead: "This is the only time they are shown. Once you leave this page they cannot be recovered.",
      secretLabel: "Authenticator key",
      uriLabel: "Automatic setup address",
      codesLabel: "Recovery codes",
      codesHint: "Each code works once. Keep them wherever you keep passwords.",
      activateLabel: "Code from your authenticator",
      activateHint: "Enter the current six-digit code to switch the second factor on.",
      activate: "Turn on the second factor",
    },
    exportReady: {
      title: "Your export is ready",
      lead: "The link works once and expires shortly. Download the file now.",
      download: "Download the export",
      expiresLabel: "Expires",
      rowsLabel: "Records",
      redactionsLabel: "What was withheld, and why",
    },
  },
};

const STYLE = `
  .handoff-page {
    margin: 0;
    min-height: 100vh;
    min-height: 100svh;
    display: grid;
    place-items: start center;
    padding: 32px 24px;
    box-sizing: border-box;
    background: var(--ink-50, #F4F4F3);
    color: var(--text-strong, #241F18);
    font-family: var(--font-sans, Commissioner, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif);
    font-size: 15px;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
  }
  .handoff {
    width: 100%;
    max-width: 560px;
    padding: 28px;
    box-sizing: border-box;
    background: #FFFFFF;
    border: 1px solid var(--ink-100, #E6E6E5);
    border-radius: 14px;
    box-shadow: var(--shadow-md, 0 2px 4px rgba(22, 19, 14, 0.05), 0 6px 16px rgba(22, 19, 14, 0.08));
  }
  .handoff__title { margin: 0 0 6px; font-size: 22px; font-weight: 600; letter-spacing: -0.015em; }
  .handoff__lead { margin: 0 0 20px; color: var(--text-muted, #948263); }
  .handoff__label { display: block; margin: 16px 0 6px; font-size: 13px; font-weight: 600; }
  .handoff__hint { margin: 6px 0 0; font-size: 13px; color: var(--text-muted, #948263); }
  .handoff__value {
    margin: 0;
    padding: 12px 14px;
    border: 1px solid var(--ink-200, #C9C9C7);
    border-radius: 8px;
    background: var(--ink-50, #F4F4F3);
    font-family: var(--font-mono, ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace);
    font-size: 14px;
    word-break: break-all;
  }
  .handoff__codes { margin: 0; padding: 12px 14px; border: 1px solid var(--ink-200, #C9C9C7); border-radius: 8px; background: var(--ink-50, #F4F4F3); list-style: none; }
  .handoff__codes li { font-family: var(--font-mono, ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace); font-size: 15px; letter-spacing: 0.04em; padding: 2px 0; }
  .handoff__redactions { margin: 0; padding: 0 0 0 18px; font-size: 13px; color: var(--text-muted, #948263); }
  .handoff__redactions li { padding: 2px 0; }
  .handoff #two-factor-code {
    display: block;
    width: 100%;
    height: 48px;
    margin: 0;
    padding: 0 14px;
    box-sizing: border-box;
    border: 1px solid var(--ink-200, #C9C9C7);
    border-radius: 8px;
    font: inherit;
    font-size: 16px;
  }
  .handoff__actions { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin: 24px 0 0; }
  .handoff__submit {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 44px;
    padding: 0 18px;
    border: 0;
    border-radius: 8px;
    background: var(--accent, #C42D2D);
    color: #FFFFFF;
    font: inherit;
    font-size: 15px;
    font-weight: 600;
    text-decoration: none;
    cursor: pointer;
  }
  .handoff__submit:hover { background: var(--accent-hover, #A32323); }
  .handoff__back { color: var(--text-muted, #948263); font-size: 14px; }
`;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);
}

function handoffCopy(locale) {
  return COPY[String(locale || "").trim().toLowerCase()] || COPY.en;
}

function page(locale, title, body) {
  return `<!doctype html>
<html lang="${escapeHtml(locale || "en")}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="referrer" content="no-referrer">
<title>${escapeHtml(title)} · MS Realty</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS_URL}">
<link rel="stylesheet" href="/vendor/ms-realty-admin.css?v=${ADMIN_CSS_HASH}" data-ms-realty-design-system="external" data-ds-hash="${ADMIN_CSS_HASH}">
<style>${STYLE}</style>
</head>
<body class="handoff-page">
${body}
</body>
</html>`;
}

export function renderTwoFactorEnrolmentPage({ locale = "en", secret, provisioningUri, recoveryCodes = [] } = {}) {
  const copy = handoffCopy(locale).enrolment;
  const back = handoffCopy(locale).back;
  return page(
    locale,
    copy.title,
    `<main class="handoff" data-kind="two-factor-enrolment" aria-labelledby="handoff-title">
  <h1 id="handoff-title" class="handoff__title">${escapeHtml(copy.title)}</h1>
  <p class="handoff__lead">${escapeHtml(copy.lead)}</p>
  <span class="handoff__label">${escapeHtml(copy.secretLabel)}</span>
  <p class="handoff__value" data-two-factor-secret="true">${escapeHtml(secret)}</p>
  <span class="handoff__label">${escapeHtml(copy.uriLabel)}</span>
  <p class="handoff__value">${escapeHtml(provisioningUri)}</p>
  <span class="handoff__label">${escapeHtml(copy.codesLabel)}</span>
  <ul class="handoff__codes" data-recovery-codes="true">${recoveryCodes
    .map((code) => `<li>${escapeHtml(code)}</li>`)
    .join("")}</ul>
  <p class="handoff__hint">${escapeHtml(copy.codesHint)}</p>
  <form method="POST" action="/api/admin/security/two-factor/activate">
    <label class="handoff__label" for="two-factor-code">${escapeHtml(copy.activateLabel)}</label>
    <input id="two-factor-code" name="code" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]*" maxlength="8" required autofocus spellcheck="false">
    <p class="handoff__hint">${escapeHtml(copy.activateHint)}</p>
    <div class="handoff__actions">
      <button type="submit" class="handoff__submit">${escapeHtml(copy.activate)}</button>
      <a class="handoff__back" href="/admin/settings#settings-security">${escapeHtml(back)}</a>
    </div>
  </form>
</main>`,
  );
}

export function renderWorkspaceExportReadyPage({
  locale = "en",
  downloadUrl,
  expiresAt,
  counts = {},
  redactions = [],
} = {}) {
  const copy = handoffCopy(locale).exportReady;
  const back = handoffCopy(locale).back;
  const rows = Object.entries(counts)
    .map(([dataset, count]) => `${escapeHtml(dataset)}: ${Number(count) || 0}`)
    .join(" · ");
  return page(
    locale,
    copy.title,
    `<main class="handoff" data-kind="workspace-export-ready" aria-labelledby="handoff-title">
  <h1 id="handoff-title" class="handoff__title">${escapeHtml(copy.title)}</h1>
  <p class="handoff__lead">${escapeHtml(copy.lead)}</p>
  <span class="handoff__label">${escapeHtml(copy.rowsLabel)}</span>
  <p class="handoff__value">${rows || "-"}</p>
  <span class="handoff__label">${escapeHtml(copy.expiresLabel)}</span>
  <p class="handoff__value"><time datetime="${escapeHtml(expiresAt)}">${escapeHtml(expiresAt)}</time></p>
  <span class="handoff__label">${escapeHtml(copy.redactionsLabel)}</span>
  <ul class="handoff__redactions" data-export-redactions="true">${redactions
    .map((entry) => `<li>${escapeHtml(`${entry.dataset}.${entry.field}`)} — ${escapeHtml(entry.explanation || entry.reason)}</li>`)
    .join("")}</ul>
  <div class="handoff__actions">
    <a class="handoff__submit" href="${escapeHtml(downloadUrl)}" data-export-download="true" rel="noreferrer">${escapeHtml(copy.download)}</a>
    <a class="handoff__back" href="/admin/settings#settings-data">${escapeHtml(back)}</a>
  </div>
</main>`,
  );
}
