import assert from "node:assert/strict";
import test from "node:test";

import worker, { isServicePath, localeFromPath, pickLocale, renderPage } from "../../workers/under-construction.js";

test("accept-language negotiation falls back to the source locale", () => {
  assert.equal(pickLocale("de-DE,de;q=0.9,en;q=0.8"), "de");
  assert.equal(pickLocale("en;q=0.3, he;q=0.9"), "he");
  assert.equal(pickLocale("fr-FR,fr;q=0.9"), "bg");
  assert.equal(pickLocale(null), "bg");
});

test("every public locale is rendered and Hebrew opens right-to-left", () => {
  const html = renderPage("he");
  assert.match(html, /^<!doctype html>\n<html lang="he" dir="rtl">/);
  for (const code of ["bg", "en", "de", "nl", "ru", "el", "he"]) {
    assert.ok(html.includes(`data-locale="${code}"`), `missing locale ${code}`);
  }
  assert.equal(html.match(/ hidden>/g).length, 6);
});

test("the placeholder answers 503 and stays out of the index", async () => {
  const response = await worker.fetch(
    new Request("https://makler-realty.com/", { headers: { "accept-language": "ru" } }),
  );
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
  assert.ok(Number(response.headers.get("retry-after")) > 0);
  assert.match(await response.text(), /<html lang="ru"/);
});

test("app-owned paths are matched on segment boundaries", () => {
  for (const pathname of ["/admin", "/admin/collections/listings", "/api/health", "/media/a.jpg", "/wp-content/uploads/a.jpg", "/robots.txt"]) {
    assert.ok(isServicePath(pathname), `should reach the app: ${pathname}`);
  }
  for (const pathname of ["/", "/bg", "/en/imoti/x", "/administrator", "/apifoo"]) {
    assert.ok(!isServicePath(pathname), `should stay on the placeholder: ${pathname}`);
  }
});

test("app-owned paths are forwarded to the service binding untouched", async () => {
  let forwarded = null;
  const env = { APP: { fetch: (request) => { forwarded = request; return new Response("app", { status: 401 }); } } };

  const admin = await worker.fetch(new Request("https://makler-realty.com/admin"), env);
  assert.equal(admin.status, 401);
  assert.equal(forwarded.url, "https://makler-realty.com/admin");

  forwarded = null;
  const publicPage = await worker.fetch(new Request("https://makler-realty.com/bg"), env);
  assert.equal(publicPage.status, 503);
  assert.equal(forwarded, null);
});

test("a locale-prefixed deep link keeps its own language", async () => {
  assert.equal(localeFromPath("/ru/imoti/ms-crawl-0003"), "ru");
  assert.equal(localeFromPath("/"), "");
  assert.equal(localeFromPath("/rubbish"), "");

  const response = await worker.fetch(
    new Request("https://makler-realty.com/el/", { headers: { "accept-language": "bg" } }),
    {},
  );
  assert.match(await response.text(), /<html lang="el"/);
});
