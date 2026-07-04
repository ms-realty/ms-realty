import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { appendLead, assertLeadLedger, readLeadLedger, resetLeadLedger } from "../lib/lead-ledger.mjs";

test("lead ledger appends broker-review-gated CRM leads as JSONL", () => {
  const file = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-ledger-`)}/leads.jsonl`;
  resetLeadLedger(file);
  appendLead(
    {
      id: "inbox-lead-test",
      original_language: "he",
      admin_locale: "en",
      contact_preference: "whatsapp",
      lead: { id: "lead-test", source: "website_listing_detail", leadType: "buyer", listingReference: "MS-CRAWL-0001" },
      hermes_reply_draft: { broker_approval_required: true },
    },
    { filePath: file, receivedAt: "2026-07-04T00:00:00Z" },
  );

  const rows = readLeadLedger(file);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].original_language, "he");
  assert.equal(rows[0].admin_locale, "en");
  assert.equal(rows[0].source, "website_listing_detail");
  assert.equal(rows[0].contact_preference, "whatsapp");
  assert.equal(assertLeadLedger(rows), true);
});
