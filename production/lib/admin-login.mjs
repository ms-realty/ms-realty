import { DS_HASH, FONTS_URL, LOGO_ASPECT, LOGO_URL } from "./ui/design-assets.mjs";

// Browser session transport for the custom admin workbench. The cookie carries
// a short-lived Payload JWT whose session id is also recorded in Postgres. It
// never carries a long-lived MCP/operator credential.
export const ADMIN_SESSION_COOKIE = "ms_admin";
export const MAX_ADMIN_SESSION_SECONDS = 2 * 60 * 60;

export function adminTokenFromCookie(cookieHeader) {
  for (const part of String(cookieHeader || "").split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === ADMIN_SESSION_COOKIE) {
      try {
        return decodeURIComponent(rest.join("=") || "");
      } catch {
        return "";
      }
    }
  }
  return "";
}

export function adminSessionSetCookie(token, { maxAgeSeconds = MAX_ADMIN_SESSION_SECONDS } = {}) {
  const requested = Number(maxAgeSeconds);
  const maxAge = Number.isFinite(requested)
    ? Math.max(0, Math.min(Math.floor(requested), MAX_ADMIN_SESSION_SECONDS))
    : MAX_ADMIN_SESSION_SECONDS;
  return `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(token)}; Max-Age=${maxAge}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

export function adminSessionClearCookie() {
  return `${ADMIN_SESSION_COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

// The workbench runs in Bulgarian, Russian and English, so the door to it does
// too. The locale comes from the query string and falls back to Bulgarian, the
// source editorial language.
export const ADMIN_LOGIN_LOCALES = ["bg", "ru", "en"];

const LOGIN_COPY = {
  bg: {
    documentTitle: "Вход за екипа · MS Realty",
    title: "Вход за екипа на MS Realty",
    hint: "Използвай служебния си имейл и парола.",
    email: "Имейл",
    password: "Парола",
    submit: "Влез",
    submitting: "Влизане…",
    error: "Данните не бяха приети. Провери имейла и паролата и опитай отново.",
    errorTwoFactor: "Кодът от приложението не беше приет. Опитай пак с нов код.",
    errorThrottled: "Твърде много неуспешни опита от тази връзка. Изчакай няколко минути и опитай отново.",
    code: "Код от приложението",
    codeOptional: "(само ако си включил двуфакторна защита)",
    showPassword: "Покажи паролата",
    hidePassword: "Скрий паролата",
    showShort: "Покажи",
    hideShort: "Скрий",
    languageLabel: "Език на работното място",
    support: "Ако си загубил достъпа си, потърси администратора на агенцията.",
  },
  ru: {
    documentTitle: "Вход для команды · MS Realty",
    title: "Вход для команды MS Realty",
    hint: "Используй рабочую почту и пароль.",
    email: "Почта",
    password: "Пароль",
    submit: "Войти",
    submitting: "Входим…",
    error: "Данные не приняты. Проверь почту и пароль и попробуй снова.",
    errorTwoFactor: "Код из приложения не принят. Попробуй снова с новым кодом.",
    errorThrottled: "Слишком много неудачных попыток с этого соединения. Подожди несколько минут и попробуй снова.",
    code: "Код из приложения",
    codeOptional: "(только если включена двухфакторная защита)",
    showPassword: "Показать пароль",
    hidePassword: "Скрыть пароль",
    showShort: "Показать",
    hideShort: "Скрыть",
    languageLabel: "Язык рабочего места",
    support: "Если доступ потерян, обратись к администратору агентства.",
  },
  en: {
    documentTitle: "Team sign-in · MS Realty",
    title: "Sign in to MS Realty",
    hint: "Use your work email address and password.",
    email: "Email",
    password: "Password",
    submit: "Sign in",
    submitting: "Signing in…",
    error: "Those details were not accepted. Check the email address and password, then try again.",
    errorTwoFactor: "The authenticator code was not accepted. Try again with a fresh code.",
    errorThrottled: "Too many failed attempts from this connection. Wait a few minutes, then try again.",
    code: "Authenticator code",
    codeOptional: "(only if you turned on two-factor protection)",
    showPassword: "Show password",
    hidePassword: "Hide password",
    showShort: "Show",
    hideShort: "Hide",
    languageLabel: "Workbench language",
    support: "If you have lost your access, ask the agency administrator.",
  },
};

const LOCALE_NAMES = { bg: "BG", ru: "RU", en: "EN" };

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// The login page is a standalone document: it loads the same webfonts and
// design-system bundle as the workbench, and the inline rules below only lay
// out the card. Token values carry literal fallbacks so the page still reads
// correctly if the stylesheet is blocked.
const LOGIN_STYLE = `
  .login-page {
    margin: 0;
    min-height: 100vh;
    min-height: 100svh;
    display: grid;
    place-items: center;
    padding: 24px;
    box-sizing: border-box;
    background: var(--ink-50, #F4F4F3);
    color: var(--text-strong, #241F18);
    font-family: var(--font-sans, Commissioner, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif);
    font-size: 15px;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
  }
  .login {
    width: 100%;
    max-width: 420px;
    padding: 32px;
    box-sizing: border-box;
    background: #FFFFFF;
    border: 1px solid var(--ink-100, #E6E6E5);
    border-radius: 14px;
    box-shadow: var(--shadow-md, 0 2px 4px rgba(22, 19, 14, 0.05), 0 6px 16px rgba(22, 19, 14, 0.08));
  }
  .login__top { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin: 0 0 24px; }
  .login__brand { display: inline-flex; margin: 0; }
  .login__brand img { display: block; height: 40px; width: auto; }
  .login__locales {
    display: inline-flex;
    gap: 2px;
    padding: 3px;
    border-radius: 999px;
    background: var(--stone-100, #F2ECE1);
  }
  .login__locale {
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
  .login__locale:hover { color: var(--text-strong, #241F18); }
  .login__locale[aria-current="page"] {
    background: #FFFFFF;
    color: var(--text-strong, #241F18);
    box-shadow: var(--shadow-xs, 0 1px 2px rgba(22, 19, 14, 0.06));
  }
  .login__locale:focus-visible { outline: none; box-shadow: var(--shadow-focus, 0 0 0 3px rgba(219, 62, 62, 0.45)); }
  .login__title {
    margin: 0 0 4px;
    font-family: inherit;
    font-size: 22px;
    font-weight: 600;
    line-height: 1.25;
    letter-spacing: -0.015em;
    color: var(--text-strong, #241F18);
  }
  .login__hint { margin: 0 0 20px; color: var(--text-muted, #948263); }
  .login__error {
    display: flex;
    gap: 10px;
    margin: 0 0 16px;
    padding: 10px 12px;
    border: 1px solid var(--danger-500, #C42E44);
    border-radius: 8px;
    background: var(--danger-50, #F9E7EA);
    color: var(--danger-600, #9E2334);
    font-size: 13px;
    font-weight: 600;
    line-height: 1.4;
  }
  .login__error svg { flex: none; margin-top: 1px; }
  .login__form { display: grid; gap: 0; }
  .login__form label {
    display: block;
    margin: 0 0 6px;
    color: var(--text-strong, #241F18);
    font-size: 13px;
    font-weight: 600;
    line-height: 1.25;
  }
  .login__optional { font-weight: 400; color: var(--text-muted, #948263); }
  .login__field { position: relative; margin: 0 0 16px; }
  .login #admin-email,
  .login #admin-password,
  .login #admin-code {
    display: block;
    width: 100%;
    height: 48px;
    min-height: 48px;
    margin: 0;
    padding: 0 14px;
    box-sizing: border-box;
    border: 1px solid var(--ink-200, #C9C9C7);
    border-radius: 8px;
    background: #FFFFFF;
    color: var(--text-strong, #241F18);
    font: inherit;
    font-size: 16px;
    line-height: 1.25;
  }
  .login #admin-password { padding-inline-end: 104px; }
  .login #admin-email:hover,
  .login #admin-password:hover { border-color: var(--ink-300, #A8A8A6); }
  .login #admin-email:focus-visible,
  .login #admin-password:focus-visible,
  .login #admin-code:focus-visible {
    outline: none;
    border-color: var(--ink-500, #545453);
    box-shadow: var(--shadow-focus, 0 0 0 3px rgba(219, 62, 62, 0.45));
  }
  .login-page[data-login-state="error"] #admin-email,
  .login-page[data-login-state="error"] #admin-password { border-color: var(--danger-500, #C42E44); }
  /* A rejected second factor means the password was right, so only the code
     field is marked. */
  .login-page[data-login-state="error-2fa"] #admin-code { border-color: var(--danger-500, #C42E44); }
  /* A compact chip that sits inside the password field. The design system gives
     every control a 44px tap target (button,input{min-height:44px}); at 44px
     this chip is taller than the 48px field allows once it is inset, so it used
     to spill over the input's rounded edge as a grey slab. It opts out of that
     minimum and centres itself, so its own height can never overflow the field.
     inset-inline-end keeps it on the correct side in RTL. */
  .login__reveal {
    position: absolute;
    inset-inline-end: 6px;
    inset-block-start: 50%;
    transform: translateY(-50%);
    display: none;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    min-height: 0;
    height: 36px;
    padding: 0 10px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--text-muted, #948263);
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    line-height: 1;
    white-space: nowrap;
    cursor: pointer;
  }
  /* Shown only once the script that gives it behaviour has run. */
  .login__reveal[data-login-reveal-ready="true"] { display: inline-flex; }
  .login__reveal:hover { color: var(--text-strong, #241F18); background: var(--ink-50, #F4F4F3); }
  .login__reveal:active { transform: translateY(calc(-50% + 1px)); }
  .login__reveal:focus-visible { outline: none; box-shadow: var(--shadow-focus, 0 0 0 3px rgba(219, 62, 62, 0.45)); }
  .login__submit {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    height: 48px;
    min-height: 48px;
    margin: 4px 0 0;
    padding: 0 16px;
    border: 0;
    border-radius: 8px;
    background: var(--accent, #C42D2D);
    color: #FFFFFF;
    font: inherit;
    font-size: 16px;
    font-weight: 600;
    line-height: 1;
    cursor: pointer;
  }
  .login__submit:hover { background: var(--accent-hover, #A32323); }
  .login__submit:active { transform: translateY(1px); }
  .login__submit:focus-visible {
    outline: none;
    box-shadow: var(--shadow-focus-accent, 0 0 0 3px rgba(34, 34, 34, 0.45));
  }
  .login__submit:disabled { cursor: wait; opacity: 0.72; transform: none; }
  .login__submit .login__spinner { display: none; width: 16px; height: 16px; animation: login-spin 900ms linear infinite; }
  .login-page[data-login-state="submitting"] .login__submit .login__spinner { display: block; }
  @keyframes login-spin { to { transform: rotate(360deg); } }
  .login__support { margin: 20px 0 0; color: var(--text-muted, #948263); font-size: 13px; line-height: 1.4; }
  @media (prefers-reduced-motion: reduce) {
    .login__submit:active { transform: none; }
    .login__submit .login__spinner { animation: none; }
  }
  @media (max-width: 420px) {
    .login { padding: 24px 20px; border-radius: 12px; }
    .login__locale { min-width: 44px; height: 36px; }
  }
`;

const ALERT_ICON =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>';
const SPINNER_ICON =
  '<svg class="login__spinner" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>';

// B6 workspace security and data: `error` is a truthy generic flag, the
// literal "2fa", which is what /admin/login redirects with when the password
// was right but the operator's second factor was not supplied or not
// accepted, or the literal "throttled", which the sign-in guard answers with
// when this address has failed too often. A plain refusal still says nothing
// about which half failed.
const LOGIN_STATES = { "2fa": "error-2fa", throttled: "error-throttled" };

export function renderAdminLoginPage({ error = false, locale = "bg" } = {}) {
  const active = ADMIN_LOGIN_LOCALES.includes(locale) ? locale : "bg";
  const copy = LOGIN_COPY[active];
  const message = error === "2fa" ? copy.errorTwoFactor : error === "throttled" ? copy.errorThrottled : copy.error;
  const errorBanner = error
    ? `<p class="login__error" id="admin-login-error" role="alert">${ALERT_ICON}<span>${escapeHtml(message)}</span></p>`
    : "";
  // A throttle is about the connection, not about either field, so it marks
  // neither one as the thing to correct.
  const describedBy = error && error !== "throttled" ? ' aria-describedby="admin-login-error"' : "";
  const credentialDescribedBy = error === "2fa" ? "" : describedBy;
  const codeDescribedBy = error === "2fa" ? describedBy : "";
  const locales = ADMIN_LOGIN_LOCALES.map((code) => {
    const href = code === "bg" ? "/admin/login" : `/admin/login?locale=${code}`;
    const current = code === active ? ' aria-current="page"' : "";
    return `<a class="login__locale" href="${href}" lang="${code}"${current}>${LOCALE_NAMES[code]}</a>`;
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
<link rel="stylesheet" href="/vendor/ms-realty.css?v=${DS_HASH}" data-ms-realty-design-system="external" data-ds-hash="${DS_HASH}">
<style>${LOGIN_STYLE}</style>
</head>
<body class="login-page" data-login-state="${error ? LOGIN_STATES[error] || "error" : "idle"}" data-admin-login-locale="${active}">
<main class="login" aria-labelledby="admin-login-title">
  <div class="login__top">
    <p class="login__brand"><img src="${LOGO_URL}" alt="MS Realty" height="40" width="${Math.round(40 * LOGO_ASPECT)}"></p>
    <nav class="login__locales" aria-label="${escapeHtml(copy.languageLabel)}">${locales}</nav>
  </div>
  <h1 id="admin-login-title" class="login__title">${escapeHtml(copy.title)}</h1>
  <p class="login__hint">${escapeHtml(copy.hint)}</p>
  ${errorBanner}
  <form method="POST" action="/admin/login" class="login__form" data-admin-login-form="true">
    <label for="admin-email">${escapeHtml(copy.email)}</label>
    <div class="login__field"><input id="admin-email" name="email" type="email" autocomplete="username" inputmode="email" required autofocus${credentialDescribedBy}></div>
    <label for="admin-password">${escapeHtml(copy.password)}</label>
    <div class="login__field">
      <input id="admin-password" name="password" type="password" autocomplete="current-password" required${credentialDescribedBy}>
      <button type="button" class="login__reveal" data-login-reveal="true" aria-controls="admin-password" aria-pressed="false" aria-label="${escapeHtml(copy.showPassword)}" data-show-label="${escapeHtml(copy.showShort)}" data-hide-label="${escapeHtml(copy.hideShort)}" data-show-aria="${escapeHtml(copy.showPassword)}" data-hide-aria="${escapeHtml(copy.hidePassword)}">${escapeHtml(copy.showShort)}</button>
    </div>
    <label for="admin-code">${escapeHtml(copy.code)} <span class="login__optional">${escapeHtml(copy.codeOptional)}</span></label>
    <div class="login__field"><input id="admin-code" name="code" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9A-Za-z -]*" maxlength="20" spellcheck="false"${codeDescribedBy}></div>
    <button type="submit" class="login__submit" data-login-submit="true" data-idle-label="${escapeHtml(copy.submit)}" data-busy-label="${escapeHtml(copy.submitting)}">${SPINNER_ICON}<span data-login-submit-label="true">${escapeHtml(copy.submit)}</span></button>
  </form>
  <p class="login__support">${escapeHtml(copy.support)}</p>
</main>
<script>
  // Progressive enhancement only: without JavaScript the form still posts, the
  // password stays masked and the button keeps its idle label.
  (function () {
    var reveal = document.querySelector("[data-login-reveal]");
    var field = document.getElementById("admin-password");
    if (reveal && field) {
      // Presentation stays in the stylesheet; the script only says it is live.
      reveal.setAttribute("data-login-reveal-ready", "true");
      reveal.addEventListener("click", function () {
        var shown = field.type === "text";
        field.type = shown ? "password" : "text";
        reveal.setAttribute("aria-pressed", shown ? "false" : "true");
        reveal.textContent = shown ? reveal.getAttribute("data-show-label") : reveal.getAttribute("data-hide-label");
        reveal.setAttribute("aria-label", shown ? reveal.getAttribute("data-show-aria") : reveal.getAttribute("data-hide-aria"));
        // Focus stays on the toggle so a keyboard user can flip it back with a
        // second Space or Enter instead of tabbing backwards for it.
      });
    }
    var form = document.querySelector("[data-admin-login-form]");
    var submit = document.querySelector("[data-login-submit]");
    var label = document.querySelector("[data-login-submit-label]");
    if (form && submit && label) {
      form.addEventListener("submit", function () {
        if (!form.checkValidity()) return;
        document.body.setAttribute("data-login-state", "submitting");
        submit.disabled = true;
        label.textContent = submit.getAttribute("data-busy-label");
      });
    }
  })();
</script>
</body>
</html>`;
}
