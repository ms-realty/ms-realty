import { DS_HASH, FONTS_URL } from "./ui/design-assets.mjs";

// The operator sign-in page. Rendered directly rather than through the React
// admin shell: the shell needs a principal to build a workspace, and this is
// the page you see when you do not have one yet.

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function renderAdminLoginPage({ next = "", error = false } = {}) {
  // Only same-site admin paths may be carried through a login round-trip,
  // otherwise ?next= becomes an open redirect.
  const safeNext = String(next || "").startsWith("/admin") && !String(next).startsWith("//") ? next : "";
  return `<!doctype html>
<html lang="en" dir="ltr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex,nofollow">
<title>Sign in | MS Realty</title>
<link rel="stylesheet" href="${FONTS_URL}">
<link rel="stylesheet" href="/vendor/ms-realty.css?v=${DS_HASH}">
<style>
.login { min-height: 100dvh; display: grid; place-items: center; padding: var(--space-5); background: var(--canvas); }
.login__card { width: min(420px, 100%); display: grid; gap: var(--space-4); padding: var(--space-6); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-lg); }
.login__card h1 { margin: 0; font-size: var(--text-xl); color: var(--text-strong); }
.login__card p { margin: 0; color: var(--text-muted); font-size: var(--text-sm); }
.login__card label { display: grid; gap: var(--space-1); font-size: var(--text-sm); color: var(--text-strong); }
.login__card input { min-height: 44px; padding: 0 var(--space-3); border: 1px solid var(--border-strong); border-radius: var(--radius-input); background: var(--surface); font: inherit; }
.login__card button { min-height: 44px; }
</style>
</head>
<body>
<main class="login">
  <form class="login__card" method="post" action="/admin/login" data-admin-login="true">
    <h1>MS Realty workspace</h1>
    <p>Sign in with your own operator account. Every action is recorded against it.</p>
    ${error ? '<p class="mk-alert mk-alert--danger" role="alert" data-login-error="true">That operator or password is not correct.</p>' : ""}
    ${safeNext ? `<input type="hidden" name="next" value="${escapeHtml(safeNext)}">` : ""}
    <label>Operator
      <input name="operator" autocomplete="username" autocapitalize="none" spellcheck="false" required autofocus>
    </label>
    <label>Password
      <input name="password" type="password" autocomplete="current-password" required>
    </label>
    <button class="mk-btn mk-btn--primary mk-btn--md mk-btn--full" type="submit">Sign in</button>
  </form>
</main>
</body>
</html>`;
}
