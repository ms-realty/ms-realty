import test from "node:test";
import assert from "node:assert/strict";
import { assertContactRecords, buildContactRecords } from "../lib/contact-records.mjs";

test("contact records consolidate duplicate lead fingerprints without losing ownership or history", () => {
  const leads = [
    {
      lead_id: "lead-contact-1",
      received_at: "2026-07-19T08:00:00.000Z",
      contact_fingerprint: "abcdef1234567890abcdef1234567890",
      contact: { name: "Review Contact", email: "review@example.test" },
      contact_preference: "email",
      lead_type: "buyer",
      original_language: "en",
      source: "website_listing_detail",
      assigned_broker: "broker_international",
    },
    {
      lead_id: "lead-contact-2",
      received_at: "2026-07-19T09:00:00.000Z",
      contact_fingerprint: "abcdef1234567890abcdef1234567890",
      contact: { name: "Review Contact", email: "review@example.test" },
      contact_preference: "email",
      lead_type: "renter",
      original_language: "en",
      source: "website_search_result",
      broker_assignment: { broker_id: "broker_international" },
    },
  ];
  const records = buildContactRecords({
    leads,
    communicationThreads: [
      { lead_id: "lead-contact-1", event_count: 2 },
      { lead_id: "lead-contact-2", event_count: 1 },
    ],
    accounts: [{ id: "account-family-review", type: "family", label: "Review family", contact_ids: ["contact-abcdef1234567890"] }],
  });
  assert.equal(assertContactRecords(records), true);
  assert.equal(records.length, 1);
  assert.deepEqual(records[0].lead_ids, ["lead-contact-1", "lead-contact-2"]);
  assert.deepEqual(records[0].lead_types, ["buyer", "renter"]);
  assert.equal(records[0].duplicate_leads, 1);
  assert.equal(records[0].communication_event_count, 3);
  assert.equal(records[0].account_id, "account-family-review");
});
