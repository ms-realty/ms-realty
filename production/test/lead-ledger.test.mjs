import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import { appendLead, assertLeadLedger, leadReplayState, readLeadLedger, resetLeadLedger } from "../lib/lead-ledger.mjs";

const CONTACT_SECRET = "test-only-lead-contact-key-32-characters-minimum";

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
      broker_assignment: { broker_id: null, method: "manager_queue" },
      lead: {
        id: "lead-test",
        source: "website_listing_detail",
        intent: "inquiry",
        leadType: "buyer",
        listingReference: "MS-00815",
        contact: { email: "Noa@example.com" },
        request_details: { callback_time: "After 14:00" },
        requirements: {
          budget_min_eur: null,
          budget_max_eur: null,
          locations: ["Sandanski"],
          property_types: ["apartment"],
          bedrooms_min: null,
          timeline: null,
          finance_status: null,
        },
        intake: { complete: false, missing_fields: ["budget_max_eur", "timeline"], captured_fields: ["locations", "property_types"] },
        message: "Test Buyer asks for a call at +359000000001 or noa@example.invalid.",
      },
      hermes_reply_draft: { broker_approval_required: true },
    },
    { filePath: file, receivedAt: "2026-07-04T00:00:00Z", contactSecret: CONTACT_SECRET },
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
        intent: "viewing",
        leadType: "buyer",
        listingReference: "MS-00815",
        contact: { email: "noa@example.com" },
      },
      hermes_reply_draft: { broker_approval_required: true },
    },
    { filePath: file, receivedAt: "2026-07-04T00:05:00Z", contactSecret: CONTACT_SECRET },
  );

  const rows = readLeadLedger(file);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].original_language, "he");
  assert.equal(rows[0].admin_locale, "en");
  assert.equal(rows[0].source, "website_listing_detail");
  assert.equal(rows[0].intent, "inquiry");
  assert.equal(rows[1].intent, "viewing");
  assert.equal("message_original" in rows[0], false);
  assert.equal("message" in rows[0], false);
  assert.equal(rows[0].show_original_available, true);
  assert.equal(rows[0].contact_preference, "whatsapp");
  assert.deepEqual(rows[0].request_details, { callback_time: "After 14:00" });
  assert.deepEqual(rows[0].requirements.locations, ["Sandanski"]);
  assert.equal(rows[0].intake_completion.complete, false);
  assert.equal(rows[0].qualification_task.status, "open");
  assert.deepEqual(rows[0].qualification_task.missing_fields, ["budget_max_eur", "timeline"]);
  assert.equal(rows[0].confirmation_status, "ready");
  assert.equal(rows[0].confirmation_message_key, "lead_received");
  assert.equal(rows[0].assigned_broker, null);
  assert.equal(rows[0].assignment_method, "manager_queue");
  assert.equal(rows[1].assigned_broker, "broker_international");
  assert.equal(rows[1].assignment_method, "rules");
  assert.equal(
    rows[0].contact_fingerprint,
    crypto.createHmac("sha256", CONTACT_SECRET).update("email:noa@example.com").digest("hex"),
  );
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
  const serialized = JSON.stringify(rows);
  for (const plaintext of ["Test Buyer", "+359000000001", "noa@example.invalid"]) {
    assert.equal(serialized.includes(plaintext), false, `${plaintext} must not enter the public lead ledger`);
  }
  assert.equal(assertLeadLedger(rows), true);
});


// A browser retry carries the same idempotency key. The ledger names it a
// replay only for the same enquiry; a different person, listing or message
// under the same key is a conflict the caller must refuse.
test("lead replay state distinguishes the same enquiry from a reused key", () => {
  const filePath = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-lead-replay-`)}/leads.jsonl`;
  const secret = "test-secret-0123456789";
  const lead = (id, extra = {}) => ({ id: `inbox-${id}`, lead: { id, source: "website_listing_detail", leadType: "buyer", listingReference: "MS-00815", idempotency_key: "public-lead:replay-1", contact: { name: "Retry Person", phone: "+359880000001" }, message: "First message", ...extra } });
  assert.equal(leadReplayState(lead("lead-draft-0"), { filePath, contactSecret: secret }).state, "none");
  const first = appendLead(lead("lead-draft-1"), { filePath, contactSecret: secret });
  const replay = leadReplayState(lead("lead-draft-2"), { filePath, contactSecret: secret });
  assert.equal(replay.state, "replay");
  assert.equal(replay.row.lead_id, first.lead_id);
  assert.equal(leadReplayState(lead("lead-draft-3", { contact: { name: "Other", phone: "+359880000002" } }), { filePath, contactSecret: secret }).state, "conflict");
  assert.equal(leadReplayState(lead("lead-draft-4", { message: "Changed message" }), { filePath, contactSecret: secret }).state, "conflict");
  assert.equal(leadReplayState(lead("lead-draft-5", { listingReference: "MS-00907" }), { filePath, contactSecret: secret }).state, "conflict");
  assert.equal(leadReplayState(lead("lead-draft-6", { idempotency_key: "public-lead:replay-2" }), { filePath, contactSecret: secret }).state, "none");
  assert.equal(readLeadLedger(filePath).length, 1);
});
