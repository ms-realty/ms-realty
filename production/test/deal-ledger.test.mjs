import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import test from "node:test";
import { appendClosedDeal, assertDealLedger, readDeals, resetDealLedger } from "../lib/deal-ledger.mjs";

test("closed deal ledger requires a known lead and creates testimonial and referral tasks", () => {
  const file = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-deals-`)}/deals.jsonl`;
  resetDealLedger(file);
  const leads = [
    {
      lead_id: "lead-test",
      listing_reference: "MS-00815",
      original_language: "he",
      admin_locale: "en",
      contact_preference: "whatsapp",
    },
  ];

  assert.throws(
    () => appendClosedDeal({ leads }, { leadId: "missing", broker: "broker_ru" }, { filePath: file }),
    /known leadId/,
  );

  const row = appendClosedDeal(
    { leads },
    {
      id: "deal-lead-test",
      leadId: "lead-test",
      broker: "broker_ru",
      closedAt: "2026-07-10T10:00:00Z",
    },
    { filePath: file },
  );

  assert.equal(row.listing_reference, "MS-00815");
  assert.deepEqual(row.testimonial_request, {
    id: "testimonial-lead-test",
    kind: "testimonial_request",
    owner: "broker_ru",
    status: "open",
    due_at: "2026-07-12T10:00:00.000Z",
    channel: "whatsapp",
  });
  assert.deepEqual(row.referral_request, {
    id: "referral-lead-test",
    kind: "referral_request",
    owner: "broker_ru",
    status: "open",
    due_at: "2026-07-17T10:00:00.000Z",
    channel: "whatsapp",
  });
  assert.equal(assertDealLedger(readDeals(file)), true);
});
