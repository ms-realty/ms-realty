import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { createHttpApp } from "../lib/http.mjs";
import { assertLeadLedger, readLeadLedger, resetLeadLedger } from "../lib/lead-ledger.mjs";
import { assertReplyOutbox, readReplyOutbox, resetReplyOutbox } from "../lib/lead-replies.mjs";
import { assertServerSmoke, close, createNodeServer, jsonFetch, listen, textFetch } from "../lib/node-server.mjs";
import { fromRoot } from "../lib/paths.mjs";

async function withServer(fn) {
  const leadLedgerPath = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-server-`)}/leads.jsonl`;
  const replyOutboxPath = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-server-replies-`)}/replies.jsonl`;
  resetLeadLedger(leadLedgerPath);
  resetReplyOutbox(replyOutboxPath);
  const server = createNodeServer(
    createHttpApp({
      leadLedgerPath,
      replyOutboxPath,
      receivedAt: "2026-07-04T00:00:00Z",
      reviewedAt: "2026-07-04T00:05:00Z",
    }),
  );
  const address = await listen(server);
  try {
    return await fn(`http://${address.address}:${address.port}`, leadLedgerPath, replyOutboxPath);
  } finally {
    await close(server);
  }
}

test("Node server serves live listing, search, and lead endpoints", async () => {
  await withServer(async (baseUrl, leadLedgerPath, replyOutboxPath) => {
    const smoke = {
      listing: await jsonFetch(baseUrl, "/he/properties/MS-CRAWL-0001"),
      search: await jsonFetch(baseUrl, "/api/search?locale=he&q=Sandanski"),
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
    assert.equal(assertLeadLedger(readLeadLedger(leadLedgerPath)), true);
    assert.equal(assertReplyOutbox(readReplyOutbox(replyOutboxPath)), true);
  });
});

test("generated Node server smoke file is valid when present", () => {
  const file = fromRoot("production", "data", "node-server-smoke.json");
  if (!fs.existsSync(file)) return;
  const smoke = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.equal(assertServerSmoke(smoke), true);
});
