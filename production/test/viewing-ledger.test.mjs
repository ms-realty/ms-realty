import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { appendViewing, assertViewingLedger, readViewings, resetViewingLedger } from "../lib/viewing-ledger.mjs";

test("viewing ledger requires a known lead and creates follow-up task", () => {
  const file = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-viewings-`)}/viewings.jsonl`;
  resetViewingLedger(file);
  const leads = [{ lead_id: "lead-test", listing_reference: "MS-CRAWL-0001", original_language: "he", admin_locale: "en" }];

  assert.throws(
    () => appendViewing(leads, { leadId: "missing", startsAt: "2026-07-06T10:00:00Z", broker: "broker_ru" }, { filePath: file }),
    /known leadId/,
  );

  appendViewing(
    leads,
    {
      leadId: "lead-test",
      startsAt: "2026-07-06T10:00:00Z",
      broker: "broker_ru",
    },
    { filePath: file, bookedAt: "2026-07-04T00:06:00Z" },
  );

  const rows = readViewings(file);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].listing_reference, "MS-CRAWL-0001");
  assert.equal(rows[0].follow_up_task.status, "open");
  assert.equal(assertViewingLedger(rows), true);
});
