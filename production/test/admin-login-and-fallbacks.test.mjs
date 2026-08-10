import test from "node:test";
import assert from "node:assert/strict";
import {
  ADMIN_SESSION_COOKIE,
  adminSessionClearCookie,
  adminSessionSetCookie,
  adminTokenFromCookie,
  renderAdminLoginPage,
} from "../lib/admin-login.mjs";
import { renderAppAdminResponse } from "../lib/app-admin-adapter.mjs";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";
import { renderContactPage, renderSearchUnavailablePage } from "../lib/public-site.mjs";
import { renderReactPublicBody } from "../lib/react-public-site.mjs";
import { loadLocaleRegistry } from "../lib/locales.mjs";
import { GET as adminLoginGet, POST as adminLoginPost } from "../../app/admin/login/route.js";

const OPERATOR_TOKEN = "login-operator-token-0123456789ab";
const registry = loadLocaleRegistry();

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

test("session cookie helpers round-trip the operator token", () => {
  const cookie = adminSessionSetCookie("abc=123");
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Lax/);
  const header = cookie.split(";")[0];
  assert.equal(adminTokenFromCookie(`${header}; other=1`), "abc=123");
  assert.equal(adminTokenFromCookie(adminSessionClearCookie().split(";")[0]), "");
  assert.equal(adminTokenFromCookie(""), "");
  assert.match(renderAdminLoginPage({ error: true }), /role="alert"/);
});

test("the deployed admin login route redirects to Payload without accepting an operator token", async () => {
  const base = "https://ms-realty.ms-realty-bg.workers.dev";
  const getResponse = await adminLoginGet(new Request(`${base}/admin/login`));
  assert.equal(getResponse.status, 303);
  assert.equal(getResponse.headers.get("location"), `${base}/payload-admin/login`);

  const postResponse = await adminLoginPost(
    new Request(`${base}/admin/login`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: `token=${OPERATOR_TOKEN}`,
    }),
  );
  assert.equal(postResponse.status, 303);
  assert.equal(postResponse.headers.get("location"), `${base}/payload-admin/login`);
  assert.equal(postResponse.headers.get("set-cookie"), null, "the long-lived operator token must not become a CMS cookie");
});

test("standalone HTTP runtime: login exchanges the key for a cookie session", async () => {
  await withNamedOperator(async () => {
    const app = createHttpApp({ reviewedAt: "2026-07-19T12:00:00.000Z" });

    const form = await dispatchHttp(app, { method: "GET", url: "/admin/login", headers: {} });
    assert.equal(form.status, 200);
    assert.match(form.headers["content-type"], /text\/html/);
    assert.match(form.body, /Операторски ключ/);

    const bad = await dispatchHttp(app, {
      method: "POST",
      url: "/admin/login",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "token=wrong-token-000000000000000000",
    });
    assert.equal(bad.status, 303);
    assert.equal(bad.headers.location, "/admin/login?error=1");
    assert.equal(bad.headers["set-cookie"], undefined);

    const ok = await dispatchHttp(app, {
      method: "POST",
      url: "/admin/login",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: `token=${OPERATOR_TOKEN}`,
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
    assert.ok(connect.body.includes(OPERATOR_TOKEN), "connect page embeds the cookie-authenticated token");

    const authed = await dispatchHttp(app, { method: "GET", url: "/admin/login", headers: { cookie } });
    assert.equal(authed.status, 303);
    assert.equal(authed.headers.location, "/admin");

    const logout = await dispatchHttp(app, { method: "POST", url: "/admin/logout", headers: { cookie } });
    assert.equal(logout.status, 303);
    assert.match(logout.headers["set-cookie"], /Max-Age=0/);
  });
});

test("Next admin adapter: login, cookie auth, and logout behave identically", async () => {
  await withNamedOperator(async () => {
    const base = "https://ms-realty.ms-realty-bg.workers.dev";
    const form = await renderAppAdminResponse(new Request(`${base}/admin/login`));
    assert.equal(form.status, 200);

    const ok = await renderAppAdminResponse(
      new Request(`${base}/admin/login`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: `token=${OPERATOR_TOKEN}`,
      }),
    );
    assert.equal(ok.status, 303);
    const cookie = ok.headers.get("set-cookie").split(";")[0];

    const connect = await renderAppAdminResponse(new Request(`${base}/admin/connect`, { headers: { cookie } }));
    assert.equal(connect.status, 200);
    assert.ok((await connect.text()).includes(OPERATOR_TOKEN));

    const logout = await renderAppAdminResponse(new Request(`${base}/admin/logout`, { method: "POST", headers: { cookie } }));
    assert.equal(logout.status, 303);
    assert.match(logout.headers.get("set-cookie"), /Max-Age=0/);
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
