import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { createHttpApp } from "../lib/http.mjs";
import { assertLeadLedger, readLeadLedger, resetLeadLedger } from "../lib/lead-ledger.mjs";
import { assertLanguageRequests, readLanguageRequests, resetLanguageRequests } from "../lib/language-requests.mjs";
import { assertReplyOutbox, readReplyOutbox, resetReplyOutbox } from "../lib/lead-replies.mjs";
import { assertServerSmoke, close, createNodeServer, jsonFetch, listen, textFetch } from "../lib/node-server.mjs";
import { fromRoot } from "../lib/paths.mjs";

async function withServer(fn) {
  const leadLedgerPath = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-server-`)}/leads.jsonl`;
  const replyOutboxPath = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-server-replies-`)}/replies.jsonl`;
  const languageRequestPath = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-server-language-`)}/requests.jsonl`;
  resetLeadLedger(leadLedgerPath);
  resetReplyOutbox(replyOutboxPath);
  resetLanguageRequests(languageRequestPath);
  const server = createNodeServer(
    createHttpApp({
      leadLedgerPath,
      replyOutboxPath,
      languageRequestPath,
      receivedAt: "2026-07-04T00:00:00Z",
      requestedAt: "2026-07-04T00:01:00Z",
      reviewedAt: "2026-07-04T00:05:00Z",
    }),
  );
  const address = await listen(server);
  try {
    return await fn(`http://${address.address}:${address.port}`, leadLedgerPath, replyOutboxPath, languageRequestPath);
  } finally {
    await close(server);
  }
}

function deployableRedirect() {
  return JSON.parse(fs.readFileSync(fromRoot("production", "data", "deployable-redirects.json"), "utf8")).redirects[0];
}

test("Node server serves live listing, search, and lead endpoints", async () => {
  await withServer(async (baseUrl, leadLedgerPath, replyOutboxPath, languageRequestPath) => {
    const redirect = deployableRedirect();
    const oldUrl = new URL(redirect.old_url);
    const smoke = {
      legacyRedirect: await textFetch(baseUrl, oldUrl.pathname, {
        headers: { "x-forwarded-host": redirect.source_domain },
        redirect: "manual",
        captureHeaders: true,
      }),
      listing: await jsonFetch(baseUrl, "/he/properties/MS-CRAWL-0001"),
      search: await jsonFetch(baseUrl, "/api/search?locale=he&q=Sandanski"),
      languageRequest: await jsonFetch(baseUrl, "/api/language-requests", {
        method: "POST",
        body: JSON.stringify({
          id: "node-server-language-request-test",
          requestedLocale: "fr",
          requestedPath: "/fr/",
          contact: { name: "Claire Martin" },
          message: "Please notify me when French property pages are reviewed.",
        }),
      }),
      sitemap: await textFetch(baseUrl, "/sitemap.xml"),
      robots: await textFetch(baseUrl, "/robots.txt"),
      lead: await jsonFetch(baseUrl, "/api/leads", {
        method: "POST",
        body: JSON.stringify({
          id: "node-server-lead-test",
          leadType: "buyer",
          language: "he",
          listingReference: "MS-CRAWL-0001",
          contact: { name: "Noa Levi" },
        }),
      }),
      sellerLead: await jsonFetch(baseUrl, "/api/leads", {
        method: "POST",
        body: JSON.stringify({
          id: "node-server-seller-lead-test",
          source: "website_seller_valuation",
          leadType: "seller",
          language: "el",
          contact: { name: "Nikos Papadopoulos" },
          message: "I want a valuation for my property.",
        }),
      }),
      badLead: await jsonFetch(baseUrl, "/api/leads", {
        method: "POST",
        body: JSON.stringify({
          id: "node-server-bad-lead-test",
          leadType: "buyer",
          language: "he",
          listingReference: "missing",
          contact: { name: "Noa Levi" },
        }),
      }),
      admin: await jsonFetch(baseUrl, "/api/admin/leads?locale=ru", {
        headers: { authorization: "Bearer local-admin-smoke" },
      }),
      adminUnauthorized: await jsonFetch(baseUrl, "/api/admin/leads?locale=ru"),
      reply: await jsonFetch(baseUrl, "/api/admin/replies", {
        method: "POST",
        headers: { authorization: "Bearer local-admin-smoke" },
        body: JSON.stringify({
          leadId: "node-server-lead-test",
          reviewedReply: "Reviewed reply approved by broker.",
          reviewer: "broker_ru",
          approved: true,
        }),
      }),
      replyUnauthorized: await jsonFetch(baseUrl, "/api/admin/replies", {
        method: "POST",
        body: JSON.stringify({
          leadId: "node-server-lead-test",
          reviewedReply: "No auth",
          reviewer: "broker_ru",
          approved: true,
        }),
      }),
    };
    assert.equal(assertServerSmoke(smoke), true);
    assert.equal(smoke.legacyRedirect.headers.location, redirect.target_path);
    assert.equal(assertLeadLedger(readLeadLedger(leadLedgerPath)), true);
    assert.equal(assertReplyOutbox(readReplyOutbox(replyOutboxPath)), true);
    assert.equal(assertLanguageRequests(readLanguageRequests(languageRequestPath)), true);
  });
});

test("generated Node server smoke file is valid when present", () => {
  const file = fromRoot("production", "data", "node-server-smoke.json");
  if (!fs.existsSync(file)) return;
  const smoke = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.equal(assertServerSmoke(smoke), true);
});
