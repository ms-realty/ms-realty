// Browser session for the admin workbench. The API surface stays pure
// Bearer, but a human in a browser cannot send headers — so /admin/login
// exchanges the operator key for a cookie carrying that same token.
// Deliberately stateless: the container disk forgets on every sleep, so there
// is nowhere to keep server-side sessions; the cookie IS the credential, and
// rotating the operator key in MS_REALTY_ADMIN_CREDENTIALS_JSON kills every
// session instantly.
export const ADMIN_SESSION_COOKIE = "ms_admin";
const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60;

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

export function adminSessionSetCookie(token, { maxAgeSeconds = THIRTY_DAYS_SECONDS } = {}) {
  return `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(token)}; Max-Age=${maxAgeSeconds}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

export function adminSessionClearCookie() {
  return `${ADMIN_SESSION_COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

export function renderAdminLoginPage({ error = false } = {}) {
  const errorBanner = error
    ? `<p class="error" role="alert">Ключът не беше разпознат. Провери и опитай пак. / Key not recognized — check it and try again.</p>`
    : "";
  return `<!doctype html>
<html lang="bg">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>MS Realty — вход за екипа</title>
<style>
  body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; margin: 0; padding: 24px; background: #f6f4ef; color: #1f2933; display: grid; place-items: center; min-height: 100vh; box-sizing: border-box; }
  main { width: 100%; max-width: 420px; background: #fff; border-radius: 16px; padding: 32px; box-shadow: 0 8px 30px rgba(31,41,51,.08); }
  h1 { font-size: 1.4rem; margin: 0 0 6px; }
  p.hint { color: #52606d; margin: 0 0 20px; }
  label { display: block; font-weight: 600; margin-bottom: 8px; }
  input { width: 100%; font-size: 1.1rem; padding: 14px; border-radius: 10px; border: 1px solid #cbd5e1; box-sizing: border-box; margin-bottom: 16px; }
  button { width: 100%; font-size: 1.2rem; padding: 14px; border-radius: 12px; border: 0; background: #1d4ed8; color: #fff; cursor: pointer; }
  .error { color: #b91c1c; font-weight: 600; }
</style>
</head>
<body>
<main>
  <h1>Вход за екипа на MS Realty</h1>
  <p class="hint">Постави личния си операторски ключ. Пази го като парола.</p>
  ${errorBanner}
  <form method="POST" action="/admin/login">
    <label for="operator-token">Операторски ключ</label>
    <input id="operator-token" name="token" type="password" autocomplete="current-password" required autofocus>
    <button type="submit">Влез</button>
  </form>
</main>
</body>
</html>`;
}
