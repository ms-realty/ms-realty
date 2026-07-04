import fs from "node:fs";
import path from "node:path";
import { assertHttpSmoke, createHttpApp, dispatchHttp } from "../lib/http.mjs";
import { assertLeadLedger, DEFAULT_LEAD_LEDGER_PATH, readLeadLedger, resetLeadLedger } from "../lib/lead-ledger.mjs";
import {
  assertReplyOutbox,
  DEFAULT_REPLY_OUTBOX_PATH,
  readReplyOutbox,
  resetReplyOutbox,
} from "../lib/lead-replies.mjs";
import { fromRoot } from "../lib/paths.mjs";

resetLeadLedger(DEFAULT_LEAD_LEDGER_PATH);
resetReplyOutbox(DEFAULT_REPLY_OUTBOX_PATH);
const app = createHttpApp({
  leadLedgerPath: DEFAULT_LEAD_LEDGER_PATH,
  replyOutboxPath: DEFAULT_REPLY_OUTBOX_PATH,
  receivedAt: "2026-07-04T00:00:00Z",
  reviewedAt: "2026-07-04T00:05:00Z",
});
const smoke = {
  fixture_id: "http-smoke-20260704",
  listing: await dispatchHttp(app, { url: "/he/properties/MS-CRAWL-0001" }),
  search: await dispatchHttp(app, { url: "/api/search?locale=he&q=Sandanski" }),
  fallback: await dispatchHttp(app, { url: "/fr/" }),
  sitemap: await dispatchHttp(app, { url: "/sitemap.xml" }),
  robots: await dispatchHttp(app, { url: "/robots.txt" }),
  lead: await dispatchHttp(app, {
    method: "POST",
    url: "/api/leads",
    body: {
      id: "http-lead-he-0001",
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
      id: "http-lead-seller-el-0001",
      source: "website_seller_valuation",
      leadType: "seller",
      language: "el",
      contact: { name: "Nikos Papadopoulos" },
      message: "I want a valuation for my property.",
    },
  }),
  admin: null,
  adminUnauthorized: null,
};
smoke.admin = await dispatchHttp(app, {
  url: "/api/admin/leads?locale=ru",
  headers: { authorization: "Bearer local-admin-smoke" },
});
smoke.adminUnauthorized = await dispatchHttp(app, { url: "/api/admin/leads?locale=ru" });
smoke.reply = await dispatchHttp(app, {
  method: "POST",
  url: "/api/admin/replies",
  headers: { authorization: "Bearer local-admin-smoke" },
  body: {
    id: "reply-http-lead-he-0001",
    leadId: "http-lead-he-0001",
    language: "he",
    hermesDraft: "Hermes draft for broker review.",
    reviewedReply: "Reviewed reply approved by broker.",
    reviewer: "broker_ru",
    approved: true,
  },
});
smoke.replyUnauthorized = await dispatchHttp(app, {
  method: "POST",
  url: "/api/admin/replies",
  body: { leadId: "http-lead-he-0001", reviewedReply: "No auth", reviewer: "broker_ru", approved: true },
});

assertHttpSmoke(smoke);
const ledger = readLeadLedger(DEFAULT_LEAD_LEDGER_PATH);
assertLeadLedger(ledger);
smoke.leadLedger = { path: DEFAULT_LEAD_LEDGER_PATH, rows: ledger.length };
const outbox = readReplyOutbox(DEFAULT_REPLY_OUTBOX_PATH);
assertReplyOutbox(outbox);
smoke.replyOutbox = { path: DEFAULT_REPLY_OUTBOX_PATH, rows: outbox.length };

const outPath = fromRoot("production", "data", "http-smoke.json");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(smoke, null, 2)}\n`);
console.log(`Wrote HTTP smoke fixture to ${outPath}`);
