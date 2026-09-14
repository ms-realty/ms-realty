import assert from "node:assert/strict";
import test from "node:test";
import { appAdminConfigFromEnv, renderAppAdminResponse } from "../lib/app-admin-adapter.mjs";
import { appRouterConfigFromEnv, renderAppRouteResponse } from "../lib/app-router-adapter.mjs";
import { loadLocaleRegistry } from "../lib/locales.mjs";
import { sellerPath } from "../lib/seo.mjs";
import { PagePayload } from "./helpers/site-page-payload.mjs";

const copy = { title: "Проверено заглавие за продавачи", description: "Описание на проверената страница.", h1: "Вашият имот в Сандански", intro: "Разкажете ни за имота си." };
const credentials = ["admin", "editor", "translator", "broker", "agent"].map((role) => ({ id: `site-page-route-${role}`, roles: [role], token: `site-page-route-test-${role}-0123456789abcdef` }));
const authEnv = { MS_REALTY_ADMIN_CREDENTIALS_JSON: JSON.stringify(credentials) };
const registry = loadLocaleRegistry();
const api = "/api/admin/site-pages/seller";
const editorPath = "/admin/site-pages/seller?locale=en&contentLocale=bg";
const selected = (state) => ({ contentLocale: state.locale, expectedVersion: state.version, revisionId: state.draft.revision_id, contentHash: state.draft.content_hash });

function fixture(payload = new PagePayload()) {
  const config = { ...appAdminConfigFromEnv({}), authEnv, sitePageContentPayload: payload };
  async function request(pathname = api, { role = "editor", input, method = input ? "POST" : "GET", headers = {}, body } = {}) {
    const credential = credentials.find((entry) => entry.roles[0] === role);
    return renderAppAdminResponse(new Request(`https://example.test${pathname}`, { method,
      headers: { ...(credential ? { authorization: `Bearer ${credential.token}` } : {}), accept: pathname.startsWith("/admin/") ? "text/html" : "application/json",
        ...(input ? { "content-type": "application/json" } : {}), ...headers }, body: body ?? (input ? JSON.stringify(input) : undefined) }), { config });
  }
  async function mutate(input, role = "editor") {
    const response = await request(api, { input: { interfaceLocale: "en", ...input }, role });
    const body = await response.json();
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.readback_verified, true);
    return body;
  }
  const publicConfig = { ...appRouterConfigFromEnv({}), sitePageContentPayload: payload };
  const publicPage = (locale = "bg") => renderAppRouteResponse({ pathname: sellerPath(registry, locale), host: "makler-realty.com", accept: "text/html", config: publicConfig });
  return { config, payload, request, mutate, publicConfig, publicPage };
}

test("seller routes retain session, role, CSRF, second-factor and bounded-body checks", async () => {
  const f = fixture();
  assert.equal((await f.request(editorPath, { role: null })).status, 303);
  assert.equal((await f.request(api, { role: null })).status, 401);
  assert.equal((await f.request(editorPath, { role: "agent" })).status, 403);
  assert.equal((await f.request(editorPath, { role: "broker" })).status, 200);
  const input = { action: "save", expectedVersion: 0, ...copy, principal: { roles: ["admin"] } };
  for (const role of ["broker", "translator", "agent"]) assert.equal((await f.request(api, { role, input })).status, 403);
  assert.equal((await f.request(api, { input, headers: { origin: "https://foreign.test", host: "example.test" } })).status, 403);
  assert.equal((await f.request(api, { input, headers: { "sec-fetch-site": "cross-site", origin: "https://foreign.test", host: "example.test" } })).status, 403);
  const opaque = await f.request(api, { role: "admin", method: "POST", body: new URLSearchParams({ action: "save", expectedVersion: "0", ...copy }),
    headers: { "content-type": "application/x-www-form-urlencoded", origin: "null", "sec-fetch-site": "cross-site", host: "example.test" } });
  assert.equal(opaque.status, 403, "ambient authorized credentials cannot admit an opaque cross-site form");
  assert.equal(f.payload.rows.site_page_revisions.length, 0);
  f.config.maxBodyBytes = 10;
  assert.equal((await f.request(api, { input })).status, 413);
  f.config.maxBodyBytes = 65536;
  assert.equal((await f.request(api, { method: "POST", headers: { "content-type": "application/json" }, body: "{" })).status, 400);
  assert.equal((await f.request(api, { method: "DELETE" })).status, 405);
  f.config.authEnv = { MS_REALTY_ADMIN_CREDENTIALS_JSON: JSON.stringify(credentials.map((entry) => ({ ...entry, require_two_factor: true }))) };
  const factor = await f.request(api, { input });
  assert.equal(factor.status, 403);
  assert.equal((await factor.json()).kind, "two_factor_enrolment_required");
  assert.equal(f.payload.rows.site_page_revisions.length, 0);
});

test("saved preview, human review, owner publication and public readback share one exact revision", async () => {
  const f = fixture();
  const originalResponse = await f.publicPage();
  const original = await originalResponse.text();
  assert.equal(originalResponse.headers.get("cache-control"), "no-store");
  const draft = await f.mutate({ action: "save", expectedVersion: 0, ...copy, principal: { id: "forged-owner", roles: ["admin"] }, actor: "forged-owner" });
  assert.equal(draft.draft.created_by, "site-page-route-editor");
  assert.equal(await (await f.publicPage()).text(), original);
  const page = await f.request(editorPath);
  const pageHtml = await page.text();
  assert.match(pageHtml, /data-site-page-editor="true"/);
  assert.match(pageHtml, /data-site-page-form="submit"/);
  assert.doesNotMatch(pageHtml, /data-site-page-form="publish"/);
  assert.match(pageHtml, /ms-realty-site-page-editor\.js\?v=[a-f0-9]{12}/);
  const previewUrl = `/admin/site-pages/seller?${new URLSearchParams({ ...selected(draft), preview: "1", locale: "en" })}`;
  const preview = await f.request(previewUrl);
  assert.equal(preview.status, 200);
  assert.equal(preview.headers.get("cache-control"), "private,no-store");
  assert.equal(preview.headers.get("x-robots-tag"), "noindex,nofollow");
  assert.match(await preview.text(), new RegExp(copy.h1));
  assert.equal((await f.request(previewUrl.replace(draft.draft.content_hash, "bad"))).status, 409);
  const review = await f.mutate({ action: "submit", ...selected(draft) });
  assert.equal((await f.request(api, { role: "admin", input: { action: "publish", ...selected(review), confirm: true } })).status, 409);
  const approved = await f.mutate({ action: "approve", ...selected(review), contentReviewed: true, evidenceRefs: "Owner's approved seller copy" });
  assert.equal((await f.request(api, { input: { action: "publish", ...selected(approved), confirm: true } })).status, 403);
  assert.equal((await f.request(api, { role: "admin", input: { action: "publish", ...selected(approved), confirm: false } })).status, 400);
  const live = await f.mutate({ action: "publish", ...selected(approved), confirm: true }, "admin");
  const response = await f.publicPage();
  const publicHtml = await response.text();
  assert.equal(response.headers.get("x-ms-site-page-revision"), live.published.revision_id);
  assert.equal(response.headers.get("x-ms-site-page-content-hash"), live.published.content_hash);
  assert.match(publicHtml, new RegExp(copy.title));
  assert.match(publicHtml, new RegExp(copy.intro));
  assert.equal(publicHtml.match(/<link rel="canonical"[^>]+>/)?.[0], original.match(/<link rel="canonical"[^>]+>/)?.[0]);
  assert.equal(publicHtml.match(/<meta name="robots"[^>]+>/)?.[0], original.match(/<meta name="robots"[^>]+>/)?.[0]);
  assert.doesNotMatch(publicHtml, /site-page-route-editor|Owner&#39;s approved seller copy/);
  await f.mutate({ action: "save", expectedVersion: live.version, ...copy, h1: "Нова лична чернова" });
  assert.equal(await (await f.publicPage()).text(), publicHtml);
  assert.equal((await f.request(api, { input: { action: "save", expectedVersion: live.version, ...copy } })).status, 409);
});

test("native form failures retain text, translations require published BG and storage outages fail closed", async () => {
  const f = fixture();
  const translation = { action: "save", contentLocale: "en", expectedVersion: 0, ...copy };
  assert.equal((await f.request(api, { role: "translator", input: translation })).status, 409);
  await f.mutate({ action: "save", expectedVersion: 0, ...copy });
  const body = new URLSearchParams({ action: "save", interfaceLocale: "en", expectedVersion: "0", ...copy, h1: "My unsaved local text" });
  const conflict = await f.request(api, { method: "POST", body, headers: { "content-type": "application/x-www-form-urlencoded" } });
  assert.equal(conflict.status, 409);
  const html = await conflict.text();
  assert.match(html, /My unsaved local text/);
  assert.match(html, /This page changed elsewhere/);
  assert.match(html, /fieldset[^>]+disabled/);
  f.payload.failOperation = "find:site_pages";
  const unavailable = await f.publicPage();
  assert.equal(unavailable.status, 503);
  assert.equal(unavailable.headers.get("cache-control"), "no-store");
  assert.doesNotMatch(await unavailable.text(), new RegExp(copy.h1));
  assert.equal((await f.request(editorPath)).status, 503);
  assert.equal((await f.request(api)).status, 503);
});

test("unconfigured seller routes keep approved baseline and route wrappers use existing authentication", async () => {
  const config = appRouterConfigFromEnv({});
  const response = await renderAppRouteResponse({ pathname: sellerPath(registry, "bg"), config });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-ms-site-page-revision"), null);
  const [admin, apiRoute] = await Promise.all([import("../../app/admin/site-pages/seller/route.js"), import("../../app/api/admin/site-pages/seller/route.js")]);
  assert.equal((await admin.GET(new Request(`https://example.test${editorPath}`, { headers: { accept: "text/html" } }))).status, 303);
  assert.equal((await apiRoute.POST(new Request(`https://example.test${api}`, { method: "POST", body: "{}" }))).status, 401);
});
