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
  .login__brand { display: flex; justify-content: center; margin: 0 0 24px; }
  .login__brand img { display: block; height: 40px; width: auto; }
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
    margin: 0 0 16px;
    padding: 10px 12px;
    border-radius: 8px;
    background: var(--danger-50, #F9E7EA);
    color: var(--danger-600, #9E2334);
    font-size: 13px;
    font-weight: 600;
    line-height: 1.4;
  }
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
  .login #admin-email,
  .login #admin-password,
  .login #admin-code {
    display: block;
    width: 100%;
    height: 48px;
    min-height: 48px;
    margin: 0 0 16px;
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
  .login #admin-email:focus-visible,
  .login #admin-password:focus-visible,
  .login #admin-code:focus-visible {
    outline: none;
    border-color: var(--ink-500, #545453);
    box-shadow: var(--shadow-focus, 0 0 0 3px rgba(219, 62, 62, 0.45));
  }
  .login__submit {
    display: flex;
    align-items: center;
    justify-content: center;
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
`;

// B6 workspace security and data: `error` is either a truthy generic flag or
// the literal "2fa", which is what /admin/login redirects with when the
// password was right but the operator's second factor was not supplied or not
// accepted. A plain refusal still says nothing about which half failed.
export function renderAdminLoginPage({ error = false } = {}) {
  const errorBanner = !error
    ? ""
    : error === "2fa"
      ? `<p class="login__error" role="alert">Кодът от приложението не беше приет. / The authenticator code was not accepted.</p>`
      : `<p class="login__error" role="alert">Данните не бяха приети. Опитай отново. / Sign-in details were not accepted. Try again.</p>`;
  return `<!doctype html>
<html lang="bg">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Вход за екипа · MS Realty</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS_URL}">
<link rel="stylesheet" href="/vendor/ms-realty.css?v=${DS_HASH}" data-ms-realty-design-system="external" data-ds-hash="${DS_HASH}">
<style>${LOGIN_STYLE}</style>
</head>
<body class="login-page">
<main class="login" aria-labelledby="admin-login-title">
  <p class="login__brand"><img src="${LOGO_URL}" alt="MS Realty" height="40" width="${Math.round(40 * LOGO_ASPECT)}"></p>
  <h1 id="admin-login-title" class="login__title">Вход за екипа на MS Realty</h1>
  <p class="login__hint">Използвай служебния си имейл и парола.</p>
  ${errorBanner}
  <form method="POST" action="/admin/login" class="login__form">
    <label for="admin-email">Имейл</label>
    <input id="admin-email" name="email" type="email" autocomplete="username" inputmode="email" required autofocus>
    <label for="admin-password">Парола</label>
    <input id="admin-password" name="password" type="password" autocomplete="current-password" required>
    <label for="admin-code">Код от приложението <span class="login__optional">(само ако си включил двуфакторна защита)</span></label>
    <input id="admin-code" name="code" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9A-Za-z -]*" maxlength="20" spellcheck="false">
    <button type="submit" class="login__submit">Влез</button>
  </form>
</main>
</body>
</html>`;
}
