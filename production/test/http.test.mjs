import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { assertHttpSmoke, createHttpApp, dispatchHttp } from "../lib/http.mjs";
import { assertLeadLedger, readLeadLedger, resetLeadLedger } from "../lib/lead-ledger.mjs";
import { assertLanguageRequests, readLanguageRequests, resetLanguageRequests } from "../lib/language-requests.mjs";
import { assertReplyOutbox, readReplyOutbox, resetReplyOutbox } from "../lib/lead-replies.mjs";
import { fromRoot } from "../lib/paths.mjs";

function tempLedger() {
  const file = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-http-`)}/leads.jsonl`;
  resetLeadLedger(file);
  return file;
}

function tempOutbox() {
  const file = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-replies-`)}/replies.jsonl`;
  resetReplyOutbox(file);
  return file;
}

function tempLanguageRequests() {
  const file = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-language-`)}/requests.jsonl`;
  resetLanguageRequests(file);
  return file;
}

function deployableRedirect() {
  return JSON.parse(fs.readFileSync(fromRoot("production", "data", "deployable-redirects.json"), "utf8")).redirects[0];
}

test("HTTP app serves listing, search, fallback, and lead JSON contracts", async () => {
  const leadLedgerPath = tempLedger();
  const replyOutboxPath = tempOutbox();
  const languageRequestPath = tempLanguageRequests();
  const app = createHttpApp({
    leadLedgerPath,
    replyOutboxPath,
    languageRequestPath,
    receivedAt: "2026-07-04T00:00:00Z",
    requestedAt: "2026-07-04T00:01:00Z",
    reviewedAt: "2026-07-04T00:05:00Z",
  });
  const redirect = deployableRedirect();
  const smoke = {
    legacyRedirect: await dispatchHttp(app, { url: redirect.old_url }),
    listing: await dispatchHttp(app, { url: "/he/properties/MS-CRAWL-0001" }),
    search: await dispatchHttp(app, { url: "/api/search?locale=he&q=Sandanski" }),
    fallback: await dispatchHttp(app, { url: "/fr/" }),
    languageRequest: await dispatchHttp(app, {
      method: "POST",
      url: "/api/language-requests",
      body: {
        id: "http-language-request-test",
        requestedLocale: "fr",
        requestedPath: "/fr/",
        contact: { name: "Claire Martin" },
        message: "Please notify me when French property pages are reviewed.",
      },
    }),
    sitemap: await dispatchHttp(app, { url: "/sitemap.xml" }),
    robots: await dispatchHttp(app, { url: "/robots.txt" }),
    lead: await dispatchHttp(app, {
      method: "POST",
      url: "/api/leads",
      body: {
        id: "http-lead-test",
        leadType: "buyer",
        language: "he",
        listingReference: "MS-CRAWL-0001",
        contact: { name: "Noa Levi" },
        message: "Interested in this property.",
      },
    }),
    sellerLead: await dispatchHttp(app, {
      method: "POST",
      url: "/api/leads",
      body: {
        id: "http-seller-lead-test",
        source: "website_seller_valuation",
        leadType: "seller",
        language: "el",
        contact: { name: "Nikos Papadopoulos" },
        message: "I want a valuation for my property.",
      },
    }),
    admin: await dispatchHttp(app, {
      url: "/api/admin/leads?locale=ru",
      headers: { authorization: "Bearer local-admin-smoke" },
    }),
    adminUnauthorized: await dispatchHttp(app, { url: "/api/admin/leads?locale=ru" }),
    reply: await dispatchHttp(app, {
      method: "POST",
      url: "/api/admin/replies",
      headers: { authorization: "Bearer local-admin-smoke" },
      body: {
        leadId: "http-lead-test",
        reviewedReply: "Reviewed reply approved by broker.",
        reviewer: "broker_ru",
        approved: true,
      },
    }),
    replyUnauthorized: await dispatchHttp(app, {
      method: "POST",
      url: "/api/admin/replies",
      body: { leadId: "http-lead-test", reviewedReply: "No auth", reviewer: "broker_ru", approved: true },
    }),
  };

  assert.equal(assertHttpSmoke(smoke), true);
  assert.equal(smoke.listing.headers["content-type"], "application/json; charset=utf-8");
  assert.equal(smoke.sitemap.headers["content-type"], "application/xml; charset=utf-8");
  assert.equal(smoke.legacyRedirect.headers.location, redirect.target_path);
  assert.equal(smoke.search.body.cards.length > 0, true);
  assert.equal(assertLeadLedger(readLeadLedger(leadLedgerPath)), true);
  assert.equal(assertReplyOutbox(readReplyOutbox(replyOutboxPath)), true);
  assert.equal(assertLanguageRequests(readLanguageRequests(languageRequestPath)), true);
  assert.equal(smoke.admin.body.leads.length, 2);
  assert.equal(smoke.admin.body.languageRequests.length, 1);
  assert.equal(smoke.admin.body.leads.some((lead) => lead.lead_type === "seller" && lead.original_language === "el"), true);
  assert.deepEqual(smoke.admin.body.workspace.interface_locales, ["bg", "ru", "en"]);
});

test("HTTP app rejects invalid language requests", async () => {
  const response = await dispatchHttp(createHttpApp(), {
    method: "POST",
    url: "/api/language-requests",
    body: { requestedLocale: "not a locale", requestedPath: "/x/" },
  });

  assert.equal(response.status, 400);
  assert.match(response.body.message, /BCP 47/);
});

test("HTTP app only redirects rows in the reviewed deployable export", async () => {
  const app = createHttpApp();
  const approved = deployableRedirect();
  const routeMap = JSON.parse(fs.readFileSync(fromRoot("production", "data", "legacy-route-map.json"), "utf8")).routes;
  const unapproved = routeMap.find(
    (route) => route.url_type === "listing" && route.target_path && route.old_url !== approved.old_url,
  );

  assert.equal((await dispatchHttp(app, { url: approved.old_url })).status, 301);
  assert.notEqual((await dispatchHttp(app, { url: unapproved.old_url })).status, 301);
});

test("HTTP app rejects unknown buyer listing references", async () => {
  const response = await dispatchHttp(createHttpApp(), {
    method: "POST",
    url: "/api/leads",
    body: {
      id: "bad-lead-test",
      leadType: "buyer",
      language: "he",
      listingReference: "missing",
      contact: { name: "Noa Levi" },
    },
  });

  assert.equal(response.status, 400);
  assert.match(response.body.message, /known listingReference/);
});

test("generated HTTP smoke file is valid when present", () => {
  const file = fromRoot("production", "data", "http-smoke.json");
  if (!fs.existsSync(file)) return;
  const smoke = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.equal(assertHttpSmoke(smoke), true);
});
