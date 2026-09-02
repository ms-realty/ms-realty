import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import {
  ADMIN_SESSION_COOKIE,
  adminSessionClearCookie,
  adminSessionSetCookie,
  adminTokenFromCookie,
  renderAdminLoginPage,
} from "../lib/admin-login.mjs";
import { appAdminConfigFromEnv, renderAppAdminResponse } from "../lib/app-admin-adapter.mjs";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";
import { leadWritesDisabledFromEnv, renderContactPage, renderSearchUnavailablePage } from "../lib/public-site.mjs";
import { renderReactPublicBody } from "../lib/react-public-site.mjs";
import { loadLocaleRegistry } from "../lib/locales.mjs";
import { ADMIN_CSS_HASH, FONTS_URL } from "../lib/ui/design-assets.mjs";

const OPERATOR_TOKEN = "login-operator-token-0123456789ab";
const PAYLOAD_SESSION = "payload.browser.session";
const NOW_SECONDS = 1_786_377_600;
const registry = loadLocaleRegistry();

function payloadSessionService() {
  const calls = [];
  const principal = {
    id: "payload-1",
    source: "payload_session",
    can_mutate: true,
    roles: ["admin"],
    workspace_ids: ["sandanski"],
    payload_user_id: 1,
    email: "peycheff.com@gmail.com",
  };
  return {
    calls,
    async login({ email, password }) {
      calls.push(["login", email]);
      if (email !== "peycheff.com@gmail.com" || password !== "correct-password") throw new Error("invalid");
      return { token: PAYLOAD_SESSION, exp: NOW_SECONDS + 3600, principal, user: { id: 1 } };
    },
    async resolve(token) {
      calls.push(["resolve", token]);
      return token === PAYLOAD_SESSION ? { principal, user: { id: 1 } } : null;
    },
    async logout(token) {
      calls.push(["logout", token]);
      return token === PAYLOAD_SESSION;
    },
  };
}

async function withNamedOperator(fn) {
  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    MS_REALTY_ADMIN_TOKEN: process.env.MS_REALTY_ADMIN_TOKEN,
    MS_REALTY_ADMIN_ACTOR: process.env.MS_REALTY_ADMIN_ACTOR,
    MS_REALTY_ADMIN_CREDENTIALS_JSON: process.env.MS_REALTY_ADMIN_CREDENTIALS_JSON,
  };
  try {
    process.env.NODE_ENV = "production";
    delete process.env.MS_REALTY_ADMIN_TOKEN;
    delete process.env.MS_REALTY_ADMIN_ACTOR;
    process.env.MS_REALTY_ADMIN_CREDENTIALS_JSON = JSON.stringify([
      { id: "login_operator", token: OPERATOR_TOKEN, roles: ["admin"] },
    ]);
    return await fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

// The owner reported the Bulgarian "Покажи" control rendering as a large grey
// slab hanging over the password field's right edge. The cause was the design
// system's global `button,input{min-height:44px}` beating the chip's own 36px
// height inside a 48px field, so the control has to opt out of that minimum and
// centre itself rather than hang from a fixed top inset.
test("password reveal is a compact inline toggle that cannot overflow the field", () => {
  const html = renderAdminLoginPage({ locale: "bg" });
  const reveal = html.match(/<button type="button" class="login__reveal"[^>]*>/)?.[0];
  assert.ok(reveal, "the reveal control is rendered");
  // Keyboard operable by construction: a real button, not a div, with the
  // pressed state and the field it controls exposed to assistive technology.
  assert.match(reveal, /type="button"/);
  assert.match(reveal, /aria-pressed="false"/);
  assert.match(reveal, /aria-controls="admin-password"/);
  // Bulgarian labels for both states, with no English leaking through.
  assert.match(reveal, /data-show-label="Покажи"/);
  assert.match(reveal, /data-hide-label="Скрий"/);
  assert.match(reveal, /aria-label="Покажи паролата"/);
  assert.match(reveal, /data-hide-aria="Скрий паролата"/);
  // It lives inside the field wrapper, which is the positioning context.
  assert.match(html, /<div class="login__field">\s*<input id="admin-password"[^>]*>\s*<button type="button" class="login__reveal"/);
  assert.match(html, /\.login__field \{ position: relative;/);

  const rule = html.match(/\.login__reveal \{[^}]+\}/)?.[0];
  assert.ok(rule, "the reveal control has its own rule");
  // Opts out of the 44px minimum, so 36px is what actually renders.
  assert.match(rule, /min-height: 0;/);
  assert.match(rule, /height: 36px;/);
  // Centred rather than pinned to a fixed top inset: any height stays inside.
  assert.match(rule, /inset-block-start: 50%;/);
  assert.match(rule, /transform: translateY\(-50%\);/);
  // RTL-safe: logical inset only, never a physical `right`.
  assert.match(rule, /inset-inline-end: 6px;/);
  assert.equal(/(^|[^-])right:/.test(rule), false, "no physical right offset");
  // The active nudge must keep the centring translate or the chip jumps.
  assert.match(html, /\.login__reveal:active \{ transform: translateY\(calc\(-50% \+ 1px\)\); \}/);

  // Presentation belongs to the stylesheet; the script only marks it live, so
  // without JavaScript the control stays hidden instead of being a dead chip.
  assert.match(html, /\.login__reveal\[data-login-reveal-ready="true"\] \{ display: inline-flex; \}/);
  assert.match(html, /reveal\.setAttribute\("data-login-reveal-ready", "true"\)/);
  assert.equal(html.includes('reveal.style.display'), false);
  assert.equal(reveal.includes("data-login-reveal-ready"), false, "hidden until the script runs");

  for (const [locale, show, hide] of [
    ["ru", "Показать", "Скрыть"],
    ["en", "Show", "Hide"],
  ]) {
    const localised = renderAdminLoginPage({ locale });
    assert.match(localised, new RegExp(`data-show-label="${show}"`), locale);
    assert.match(localised, new RegExp(`data-hide-label="${hide}"`), locale);
  }
});

test("session cookie helpers round-trip and cap the Payload session token", () => {
  const cookie = adminSessionSetCookie("abc=123");
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Lax/);
  const header = cookie.split(";")[0];
  assert.equal(adminTokenFromCookie(`${header}; other=1`), "abc=123");
  assert.equal(adminTokenFromCookie(adminSessionClearCookie().split(";")[0]), "");
  assert.equal(adminTokenFromCookie(""), "");
  assert.match(adminSessionSetCookie("token", { maxAgeSeconds: 30 * 24 * 60 * 60 }), /Max-Age=7200/);
  const login = renderAdminLoginPage({ error: true });
  assert.match(login, /<html lang="bg">/);
  assert.match(login, /role="alert"/);
  assert.match(login, /name="email"/);
  assert.match(login, /name="password"/);
  assert.match(login, /<label for="admin-email">/);
  assert.match(login, /<label for="admin-password">/);
  assert.match(login, /ms-realty-logo-/);
  // The standalone page loads the workbench webfonts and design-system bundle,
  // then lays out a 420px card on the admin canvas: Commissioner 22px/600
  // title, 48px inputs with an 8px radius and the focus ring, and a 48px
  // accent submit. No em-dashes anywhere in the copy.
  assert.ok(login.includes(`<link rel="stylesheet" href="${FONTS_URL}">`));
  assert.ok(login.includes(`<link rel="stylesheet" href="/vendor/ms-realty-admin.css?v=${ADMIN_CSS_HASH}"`));
  assert.match(login, /\.login-page \{[^}]*background: var\(--ink-50, #F4F4F3\)/);
  assert.match(login, /\.login \{[^}]*max-width: 420px;[^}]*border-radius: 14px/);
  assert.match(login, /\.login__title \{[^}]*font-size: 22px;\s*font-weight: 600/);
  for (const selector of ["locale", "hint", "optional", "reveal", "support"]) {
    assert.match(login, new RegExp(`\\.login__${selector} \\{[^}]*color: var\\(--stone-600, #73644A\\)`));
  }
  assert.match(login, /\.login #admin-email,\s*\.login #admin-password,\s*\.login #admin-code,\s*\.login #admin-new-password,\s*\.login #admin-password-confirmation \{[^}]*height: 48px;[^}]*border: 1px solid var\(--ink-200, #C9C9C7\);\s*border-radius: 8px/);
  assert.match(login, /#admin-code:focus-visible,[\s\S]*?\{[^}]*box-shadow: var\(--shadow-focus,/);
  // The optional second-factor code shares the field and focus treatment.
  assert.match(login, /\.login #admin-password:focus-visible,\s*\.login #admin-code:focus-visible,/);
  assert.match(login, /name="code"[^>]*autocomplete="one-time-code"/);
  assert.match(login, /\.login__submit \{[^}]*height: 48px;[^}]*border-radius: 8px;\s*background: var\(--accent, #C42D2D\)/);
  // The submit control now carries its own busy state, so the label lives in a
  // span beside the spinner rather than as the button's only text node.
  assert.match(login, /data-idle-label="Влез" data-busy-label="Влизане…"/);
  assert.match(login, /<span data-login-submit-label="true">Влез<\/span>/);
  // The workbench runs in three languages, so its door does too.
  assert.match(login, /<nav class="login__locales"/);
  assert.match(renderAdminLoginPage({ locale: "ru" }), /<html lang="ru">/);
  assert.match(renderAdminLoginPage({ locale: "ru" }), /data-idle-label="Войти"/);
  assert.match(renderAdminLoginPage({ locale: "en" }), /<html lang="en">/);
  assert.match(renderAdminLoginPage({ locale: "en" }), /data-idle-label="Sign in"/);
  assert.match(renderAdminLoginPage({ locale: "nope" }), /<html lang="bg">/);
  assert.doesNotMatch(login, /[—–]/);
  assert.doesNotMatch(login, /#1d4ed8/);
  assert.doesNotMatch(login, /name="token"|Операторски ключ/);
});

test("standalone HTTP runtime: login exchanges email/password for a Payload cookie session", async () => {
    const service = payloadSessionService();
    const app = createHttpApp({ reviewedAt: "2026-07-19T12:00:00.000Z", payloadAdminAuth: service, nowSeconds: () => NOW_SECONDS });

    const form = await dispatchHttp(app, { method: "GET", url: "/admin/login", headers: {} });
    assert.equal(form.status, 200);
    assert.match(form.headers["content-type"], /text\/html/);
    assert.match(form.body, /name="email"/);

    const bad = await dispatchHttp(app, {
      method: "POST",
      url: "/admin/login",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "email=peycheff.com%40gmail.com&password=wrong",
    });
    assert.equal(bad.status, 303);
    assert.equal(bad.headers.location, "/admin/login?error=1");
    assert.equal(bad.headers["set-cookie"], undefined);

    const ok = await dispatchHttp(app, {
      method: "POST",
      url: "/admin/login",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "email=peycheff.com%40gmail.com&password=correct-password",
    });
    assert.equal(ok.status, 303);
    assert.equal(ok.headers.location, "/admin");
    assert.match(ok.headers["set-cookie"], new RegExp(`^${ADMIN_SESSION_COOKIE}=`));

    const cookie = ok.headers["set-cookie"].split(";")[0];
    const connect = await dispatchHttp(app, {
      method: "GET",
      url: "/admin/connect",
      headers: { cookie, host: "ms-realty.ms-realty-bg.workers.dev" },
    });
    assert.equal(connect.status, 200);
    assert.match(connect.body, /MS Realty connections/);
    assert.equal(connect.body.includes(PAYLOAD_SESSION), false);

    const authed = await dispatchHttp(app, { method: "GET", url: "/admin/login", headers: { cookie } });
    assert.equal(authed.status, 303);
    assert.equal(authed.headers.location, "/admin");

    const logout = await dispatchHttp(app, { method: "POST", url: "/admin/logout", headers: { cookie } });
    assert.equal(logout.status, 303);
    assert.match(logout.headers["set-cookie"], /Max-Age=0/);
    assert.ok(service.calls.some(([name, token]) => name === "logout" && token === PAYLOAD_SESSION));
});

test("Next admin adapter: Payload login, cookie auth, and logout behave identically", async () => {
    const service = payloadSessionService();
    const config = {
      ...appAdminConfigFromEnv({ NODE_ENV: "test" }),
      payloadAdminAuth: service,
      // A sign-in through the adapter now registers the browser session the
      // same way the standalone runtime does, so the test needs its own
      // ledger rather than the committed one.
      adminSessionLedgerPath: `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-adapter-login-`)}/admin-sessions.jsonl`,
      nowSeconds: () => NOW_SECONDS,
    };
    const base = "https://ms-realty.ms-realty-bg.workers.dev";
    const form = await renderAppAdminResponse(new Request(`${base}/admin/login`), { config });
    assert.equal(form.status, 200);

    const ok = await renderAppAdminResponse(
      new Request(`${base}/admin/login`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "email=peycheff.com%40gmail.com&password=correct-password",
      }),
      { config },
    );
    assert.equal(ok.status, 303);
    const cookie = ok.headers.get("set-cookie").split(";")[0];

    const connect = await renderAppAdminResponse(new Request(`${base}/admin/connect`, { headers: { cookie } }), { config });
    assert.equal(connect.status, 200);
    const connectBody = await connect.text();
    assert.match(connectBody, /MS Realty connections/);
    assert.doesNotMatch(connectBody, new RegExp(PAYLOAD_SESSION));

    const logout = await renderAppAdminResponse(
      new Request(`${base}/admin/logout`, { method: "POST", headers: { cookie } }),
      { config },
    );
    assert.equal(logout.status, 303);
    assert.match(logout.headers.get("set-cookie"), /Max-Age=0/);
    assert.ok(service.calls.some(([name, token]) => name === "logout" && token === PAYLOAD_SESSION));
});

test("standalone and Next login accept the owned fallback origin but reject arbitrary cross-origin POSTs", async () => {
  const service = payloadSessionService();
  const config = {
    ...appAdminConfigFromEnv({ NODE_ENV: "test" }),
    payloadAdminAuth: service,
    adminSessionLedgerPath: `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-adapter-login-cross-origin-`)}/admin-sessions.jsonl`,
    nowSeconds: () => NOW_SECONDS,
  };
  const app = createHttpApp(config);
  const body = "email=peycheff.com%40gmail.com&password=correct-password";

  const standaloneLogin = await dispatchHttp(app, {
    method: "POST",
    url: "/admin/login",
    headers: {
      host: "makler-realty.com",
      origin: "https://ms-realty.ms-realty-bg.workers.dev",
      "sec-fetch-site": "cross-site",
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });
  assert.equal(standaloneLogin.status, 303);
  assert.equal(standaloneLogin.headers.location, "/admin");

  const adapterLogin = await renderAppAdminResponse(
    new Request("https://makler-realty.com/admin/login", {
      method: "POST",
      headers: {
        origin: "https://ms-realty.ms-realty-bg.workers.dev",
        "sec-fetch-site": "cross-site",
        "content-type": "application/x-www-form-urlencoded",
        "x-forwarded-host": "makler-realty.com",
      },
      body,
    }),
    { config },
  );
  assert.equal(adapterLogin.status, 303);
  assert.equal(adapterLogin.headers.get("location"), "/admin");

  const blockedStandaloneLogin = await dispatchHttp(app, {
    method: "POST",
    url: "/admin/login",
    headers: {
      host: "makler-realty.com",
      origin: "https://mail.google.com",
      "sec-fetch-site": "cross-site",
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });
  assert.equal(blockedStandaloneLogin.status, 403);
  assert.deepEqual(blockedStandaloneLogin.body, {
    kind: "cross_origin_write_blocked",
    reason: "cross_site_request",
  });

  const blockedAdapterLogin = await renderAppAdminResponse(
    new Request("https://makler-realty.com/admin/login", {
      method: "POST",
      headers: {
        origin: "https://mail.google.com",
        "sec-fetch-site": "cross-site",
        "content-type": "application/x-www-form-urlencoded",
        "x-forwarded-host": "makler-realty.com",
      },
      body,
    }),
    { config },
  );
  assert.equal(blockedAdapterLogin.status, 403);
  assert.deepEqual(await blockedAdapterLogin.json(), {
    kind: "cross_origin_write_blocked",
    reason: "cross_site_request",
  });

  const cookie = adapterLogin.headers.get("set-cookie").split(";")[0];
  const blockedStandaloneTeam = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/team",
    headers: {
      cookie,
      host: "makler-realty.com",
      origin: "https://ms-realty.ms-realty-bg.workers.dev",
      "sec-fetch-site": "cross-site",
      "content-type": "application/json",
    },
    body: "{}",
  });
  assert.equal(blockedStandaloneTeam.status, 403);
  assert.deepEqual(blockedStandaloneTeam.body, {
    kind: "cross_origin_write_blocked",
    reason: "cross_site_request",
  });

  const blockedAdapterTeam = await renderAppAdminResponse(
    new Request("https://makler-realty.com/api/admin/team", {
      method: "POST",
      headers: {
        cookie,
        origin: "https://ms-realty.ms-realty-bg.workers.dev",
        "sec-fetch-site": "cross-site",
        "content-type": "application/json",
        "x-forwarded-host": "makler-realty.com",
      },
      body: "{}",
    }),
    { config },
  );
  assert.equal(blockedAdapterTeam.status, 403);
  assert.deepEqual(await blockedAdapterTeam.json(), {
    kind: "cross_origin_write_blocked",
    reason: "cross_site_request",
  });

  const blockedStandaloneChange = await dispatchHttp(app, {
    method: "POST",
    url: "/admin/login",
    headers: {
      cookie,
      host: "makler-realty.com",
      origin: "https://ms-realty.ms-realty-bg.workers.dev",
      "sec-fetch-site": "cross-site",
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      action: "change-password",
      current_password: "correct-password",
      password: "replacement-password",
      password_confirmation: "replacement-password",
    }).toString(),
  });
  assert.equal(blockedStandaloneChange.status, 403);
  assert.deepEqual(blockedStandaloneChange.body, {
    kind: "cross_origin_write_blocked",
    reason: "cross_site_request",
  });

  const blockedChange = await renderAppAdminResponse(
    new Request("https://makler-realty.com/admin/login", {
      method: "POST",
      headers: {
        cookie,
        origin: "https://ms-realty.ms-realty-bg.workers.dev",
        "sec-fetch-site": "cross-site",
        "content-type": "application/x-www-form-urlencoded",
        "x-forwarded-host": "makler-realty.com",
      },
      body: new URLSearchParams({
        action: "change-password",
        current_password: "correct-password",
        password: "replacement-password",
        password_confirmation: "replacement-password",
      }),
    }),
    { config },
  );
  assert.equal(blockedChange.status, 403);
  assert.deepEqual(await blockedChange.json(), {
    kind: "cross_origin_write_blocked",
    reason: "cross_site_request",
  });
});

test("contact page tells the truth about the lead form and always offers channels", () => {
  const enabled = renderContactPage({ registry, localeCode: "bg", leadWritesDisabled: false });
  assert.ok(enabled.body.callback, "form renders when writes are available");
  assert.equal(enabled.body.form_unavailable, null);
  const enabledHtml = renderReactPublicBody(enabled);
  assert.match(enabledHtml, /action="\/api\/leads"/);
  assert.match(enabledHtml, /tel:\+359879696870/);
  assert.equal(enabledHtml.includes("ct-office__ph"), false, "decorative placeholder square is gone");
  for (const field of ["contact.name", "contact.phone", "request_details.callback_time", "message"]) {
    assert.ok(enabledHtml.includes(`name="${field}"`), `${field} input present`);
  }

  const disabled = renderContactPage({ registry, localeCode: "bg", leadWritesDisabled: true });
  assert.equal(disabled.body.callback, null);
  assert.ok(disabled.body.form_unavailable);
  const disabledHtml = renderReactPublicBody(disabled);
  assert.equal(disabledHtml.includes("/api/leads"), false, "no dead form when writes are off");
  assert.match(disabledHtml, /data-form-unavailable="true"/);
  assert.match(disabledHtml, /tel:\+359879696870/);
  assert.match(disabledHtml, /wa\.me\/359879696870/);
});

test("contact form availability follows only complete durable lead-store readiness", () => {
  const complete = {
    MS_REALTY_LEAD_DURABLE_STORE_ENABLED: "true",
    PAYLOAD_SECRET: "p".repeat(32),
    DATABASE_URL: "postgres://payload:secret@db.example.test/ms_realty",
    MS_REALTY_LEAD_CONTACT_KEY: "c".repeat(32),
    MS_REALTY_WORKSPACE_ID: "workspace-sandanski",
    MS_REALTY_MCP_WRITES_DISABLED: "1",
  };
  const enabled = renderContactPage({
    registry,
    localeCode: "bg",
    leadWritesDisabled: leadWritesDisabledFromEnv(complete),
  });
  assert.ok(enabled.body.callback, "MCP write policy must not disable durable public leads");

  for (const key of [
    "MS_REALTY_LEAD_DURABLE_STORE_ENABLED",
    "PAYLOAD_SECRET",
    "DATABASE_URL",
    "MS_REALTY_LEAD_CONTACT_KEY",
    "MS_REALTY_WORKSPACE_ID",
  ]) {
    const disabled = renderContactPage({
      registry,
      localeCode: "bg",
      leadWritesDisabled: leadWritesDisabledFromEnv({ ...complete, [key]: "" }),
    });
    assert.equal(disabled.body.callback, null, key);
    assert.ok(disabled.body.form_unavailable, key);
  }
});

test("search page failure renders a branded localized fallback, not raw JSON", () => {
  for (const localeCode of ["bg", "ru", "he"]) {
    const page = renderSearchUnavailablePage({ registry, localeCode });
    assert.equal(page.status, 503);
    assert.equal(page.indexable, false);
    const html = renderReactPublicBody(page);
    assert.match(html, /data-kind="search-unavailable"/);
    assert.match(html, /tel:\+359879696870/);
  }
  assert.match(renderSearchUnavailablePage({ registry, localeCode: "he" }).dir, /rtl/);
});

test("standalone HTTP runtime serves the search fallback page as HTML with 503", async () => {
  await withNamedOperator(async () => {
    const app = createHttpApp({ reviewedAt: "2026-07-19T12:00:00.000Z" });
    const page = await dispatchHttp(app, {
      method: "GET",
      url: "/bg/tarsene?q=sandanski",
      headers: { accept: "text/html", host: "ms-realty.ms-realty-bg.workers.dev" },
    });
    assert.equal(page.status, 503);
    assert.match(page.headers["content-type"], /text\/html/);
    assert.match(page.body, /data-kind="search-unavailable"/);
    assert.match(page.body, /tel:\+359879696870/);

    const api = await dispatchHttp(app, { method: "GET", url: "/api/search?q=sandanski&locale=bg", headers: {} });
    assert.equal(api.status, 503);
    assert.match(api.headers["content-type"], /application\/json/);
  });
});
