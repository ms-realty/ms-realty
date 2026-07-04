import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHttpApp } from "../lib/http.mjs";
import { assertLeadLedger, readLeadLedger, resetLeadLedger } from "../lib/lead-ledger.mjs";
import { assertReplyOutbox, readReplyOutbox, resetReplyOutbox } from "../lib/lead-replies.mjs";
import { assertServerSmoke, close, createNodeServer, jsonFetch, listen, textFetch } from "../lib/node-server.mjs";
import { fromRoot } from "../lib/paths.mjs";

const leadLedgerPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-leads-")), "leads.jsonl");
const replyOutboxPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-replies-")), "replies.jsonl");
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
const baseUrl = `http://${address.address}:${address.port}`;

try {
  const smoke = {
    fixture_id: "node-server-smoke-20260704",
    baseUrl,
    listing: await jsonFetch(baseUrl, "/he/properties/MS-CRAWL-0001"),
    search: await jsonFetch(baseUrl, "/api/search?locale=he&q=Sandanski"),
    sitemap: await textFetch(baseUrl, "/sitemap.xml"),
    robots: await textFetch(baseUrl, "/robots.txt"),
    lead: await jsonFetch(baseUrl, "/api/leads", {
      method: "POST",
      body: JSON.stringify({
        id: "server-lead-he-0001",
        leadType: "buyer",
        language: "he",
        listingReference: "MS-CRAWL-0001",
        contact: { name: "Noa Levi" },
      }),
    }),
    sellerLead: await jsonFetch(baseUrl, "/api/leads", {
      method: "POST",
      body: JSON.stringify({
        id: "server-lead-seller-el-0001",
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
        id: "server-lead-bad-0001",
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
        id: "reply-server-lead-he-0001",
        leadId: "server-lead-he-0001",
        language: "he",
        hermesDraft: "Hermes draft for broker review.",
        reviewedReply: "Reviewed reply approved by broker.",
        reviewer: "broker_ru",
        approved: true,
      }),
    }),
    replyUnauthorized: await jsonFetch(baseUrl, "/api/admin/replies", {
      method: "POST",
      body: JSON.stringify({
        leadId: "server-lead-he-0001",
        reviewedReply: "No auth",
        reviewer: "broker_ru",
        approved: true,
      }),
    }),
  };
  assertServerSmoke(smoke);
  const ledger = readLeadLedger(leadLedgerPath);
  assertLeadLedger(ledger);
  smoke.leadLedger = { rows: ledger.length };
  const outbox = readReplyOutbox(replyOutboxPath);
  assertReplyOutbox(outbox);
  smoke.replyOutbox = { rows: outbox.length };
  const outPath = fromRoot("production", "data", "node-server-smoke.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(smoke, null, 2)}\n`);
  console.log(`Wrote Node server smoke fixture to ${outPath}`);
} finally {
  await close(server);
}
