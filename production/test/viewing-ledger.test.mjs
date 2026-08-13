import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import {
  appendViewing,
  assertViewingLedger,
  createViewing,
  readViewings,
  renderViewingCalendar,
  resetViewingLedger,
} from "../lib/viewing-ledger.mjs";

test("pure viewing creation matches the file-backed wrapper", () => {
  const file = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-viewing-parity-`)}/viewings.jsonl`;
  resetViewingLedger(file);
  const context = {
    leads: [
      {
        lead_id: "lead-parity",
        listing_reference: "MS-PARITY-1",
        original_language: "bg",
        admin_locale: "en",
        contact_preference: "email",
      },
    ],
  };
  const input = {
    leadId: "lead-parity",
    startsAt: "2026-08-15T10:00:00Z",
    broker: "broker-bg",
    followUpDueAt: "2026-08-15T11:00:00Z",
    feedbackDueAt: "2026-08-15T12:00:00Z",
  };
  const bookedAt = "2026-08-13T16:00:00Z";

  const pure = createViewing(context, input, { rows: [], bookedAt });
  const fileBacked = appendViewing(context, input, { filePath: file, bookedAt });
  assert.deepEqual(fileBacked, pure);
  const { idempotent, ...stored } = pure;
  assert.equal(idempotent, false);
  assert.deepEqual(readViewings(file), [stored]);

  const retry = createViewing(context, input, { rows: readViewings(file), bookedAt });
  assert.deepEqual(retry, { ...fileBacked, idempotent: true });
});

test("viewing ledger requires a known lead and creates follow-up task", () => {
  const file = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-viewings-`)}/viewings.jsonl`;
  resetViewingLedger(file);
  const leads = [
    {
      lead_id: "lead-test",
      listing_reference: "MS-CRAWL-0001",
      original_language: "he",
      admin_locale: "en",
      contact_preference: "whatsapp",
    },
  ];

  assert.throws(
    () => appendViewing({ leads }, { leadId: "missing", startsAt: "2026-07-06T10:00:00Z", broker: "broker_ru" }, { filePath: file }),
    /known leadId/,
  );

  appendViewing(
    { leads },
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
  assert.deepEqual(rows[0].feedback_request, {
    id: "feedback-lead-test",
    owner: "broker_ru",
    status: "open",
    due_at: "2026-07-06T12:00:00.000Z",
    channel: "whatsapp",
  });
  assert.equal(assertViewingLedger(rows), true);

  const calendar = renderViewingCalendar(rows, { now: "2026-07-04T00:06:00Z" });
  assert.match(calendar, /BEGIN:VCALENDAR/);
  assert.match(calendar, /DTSTART:20260706T100000Z/);
  assert.match(calendar, /DTEND:20260706T103000Z/);
  assert.match(calendar, /SUMMARY:MS Realty viewing MS-CRAWL-0001/);
});
