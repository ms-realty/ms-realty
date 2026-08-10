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

export function renderAdminLoginPage({ error = false } = {}) {
  const errorBanner = error
    ? `<p class="error" role="alert">Данните не бяха приети. Опитай отново. / Sign-in details were not accepted. Try again.</p>`
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
  <p class="hint">Използвай служебния си имейл и парола.</p>
  ${errorBanner}
  <form method="POST" action="/admin/login">
    <label for="admin-email">Имейл</label>
    <input id="admin-email" name="email" type="email" autocomplete="username" inputmode="email" required autofocus>
    <label for="admin-password">Парола</label>
    <input id="admin-password" name="password" type="password" autocomplete="current-password" required>
    <button type="submit">Влез</button>
  </form>
</main>
</body>
</html>`;
}
