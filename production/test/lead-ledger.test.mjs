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
      confirmation: { status: "ready", message_key: "lead_received" },
      broker_assignment: { broker_id: "broker_international", method: "rules" },
      lead: {
        id: "lead-test",
        source: "website_listing_detail",
        leadType: "buyer",
        listingReference: "MS-CRAWL-0001",
        contact: { email: "Noa@example.com" },
      },
      hermes_reply_draft: { broker_approval_required: true },
    },
    { filePath: file, receivedAt: "2026-07-04T00:00:00Z" },
  );
  appendLead(
    {
      id: "inbox-lead-duplicate-test",
      original_language: "he",
      admin_locale: "en",
      confirmation: { status: "ready", message_key: "lead_received" },
      broker_assignment: { broker_id: "broker_international", method: "rules" },
      lead: {
        id: "lead-duplicate-test",
        source: "website_viewing_request",
        leadType: "buyer",
        listingReference: "MS-CRAWL-0001",
        contact: { email: "noa@example.com" },
      },
      hermes_reply_draft: { broker_approval_required: true },
    },
    { filePath: file, receivedAt: "2026-07-04T00:05:00Z" },
  );

  const rows = readLeadLedger(file);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].original_language, "he");
  assert.equal(rows[0].admin_locale, "en");
  assert.equal(rows[0].source, "website_listing_detail");
  assert.equal(rows[0].contact_preference, "whatsapp");
  assert.equal(rows[0].confirmation_status, "ready");
  assert.equal(rows[0].confirmation_message_key, "lead_received");
  assert.equal(rows[0].assigned_broker, "broker_international");
  assert.equal(rows[0].assignment_method, "rules");
  assert.match(rows[0].contact_fingerprint, /^[a-f0-9]{64}$/);
  assert.equal(rows[0].contact_fingerprint.includes("noa"), false);
  assert.equal(rows[0].duplicate_status, "new_contact");
  assert.equal(rows[1].duplicate_status, "possible_duplicate");
  assert.equal(rows[1].possible_duplicate_of, "lead-test");
  assert.equal(rows[1].contact_fingerprint, rows[0].contact_fingerprint);
  assert.equal(rows[0].sla_due_at, "2026-07-04T00:15:00.000Z");
  assert.equal(rows[0].manager_escalation_due_at, "2026-07-04T01:00:00.000Z");
  assert.deepEqual(rows[0].follow_up_task, {
    id: "sla-lead-test",
    status: "open",
    owner: "broker_assignment",
    due_at: "2026-07-04T00:15:00.000Z",
    action: "broker_response_required",
  });
  assert.equal(assertLeadLedger(rows), true);
});
