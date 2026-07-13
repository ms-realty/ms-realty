import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { appendViewing, resetViewingLedger } from "../lib/viewing-ledger.mjs";
import {
  appendViewingFollowUp,
  assertViewingFollowUpLedger,
  buildViewingFollowUpQueue,
  readViewingFollowUps,
  resetViewingFollowUpLedger,
} from "../lib/viewing-follow-ups.mjs";

function fixture() {
  const directory = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-viewing-follow-ups-`);
  const viewingPath = `${directory}/viewings.jsonl`;
  const followUpPath = `${directory}/viewing-follow-ups.jsonl`;
  resetViewingLedger(viewingPath);
  resetViewingFollowUpLedger(followUpPath);
  const leads = [
    {
      lead_id: "lead-viewing-test",
      listing_reference: "MS-CRAWL-0001",
      original_language: "he",
      admin_locale: "en",
      contact_preference: "whatsapp",
    },
  ];
  const viewing = appendViewing(
    leads,
    { id: "viewing-test", leadId: "lead-viewing-test", startsAt: "2026-07-06T10:00:00Z", broker: "broker_ru" },
    { filePath: viewingPath, bookedAt: "2026-07-04T00:06:00Z" },
  );
  return { followUpPath, viewings: [viewing] };
}

test("viewing follow-ups keep bookings immutable while deriving an actionable queue", () => {
  const { followUpPath, viewings } = fixture();
  assert.throws(
    () => appendViewingFollowUp(viewings, { viewingId: "missing", actor: "broker_ru", action: "complete" }, { filePath: followUpPath }),
    /known viewingId/,
  );

  const rescheduled = appendViewingFollowUp(
    viewings,
    {
      viewingId: "viewing-test",
      actor: "broker_ru",
      action: "reschedule",
      startsAt: "2026-07-07T10:00:00Z",
      note: "Buyer asked to move the appointment.",
    },
    { filePath: followUpPath, recordedAt: "2026-07-06T08:00:00Z" },
  );
  assert.equal(rescheduled.idempotent, false);
  assert.equal(rescheduled.viewing.status, "rescheduled");
  assert.equal(rescheduled.viewing.starts_at, "2026-07-07T10:00:00.000Z");
  assert.equal(rescheduled.viewing.feedback_request.due_at, "2026-07-07T12:00:00.000Z");

  const retry = appendViewingFollowUp(
    viewings,
    {
      viewingId: "viewing-test",
      actor: "broker_ru",
      action: "reschedule",
      startsAt: "2026-07-07T10:00:00Z",
      note: "Buyer asked to move the appointment.",
    },
    { filePath: followUpPath, recordedAt: "2026-07-06T08:05:00Z" },
  );
  assert.equal(retry.idempotent, true);
  assert.equal(readViewingFollowUps(followUpPath).length, 1);

  const noShow = appendViewingFollowUp(
    viewings,
    {
      viewingId: "viewing-test",
      actor: "broker_ru",
      action: "no_show",
      dueAt: "2026-07-07T13:00:00Z",
      note: "No arrival; broker will offer a new time.",
    },
    { filePath: followUpPath, recordedAt: "2026-07-07T10:15:00Z" },
  );
  assert.equal(noShow.viewing.status, "no_show");
  assert.equal(noShow.viewing.follow_up_task.status, "open");
  assert.equal(noShow.viewing.feedback_request.status, "not_required");

  const queue = buildViewingFollowUpQueue(viewings, readViewingFollowUps(followUpPath), { now: "2026-07-07T12:00:00Z" });
  assert.equal(queue.summary.total_viewings, 1);
  assert.equal(queue.summary.no_show, 1);
  assert.equal(queue.summary.open, 1);
  assert.equal(queue.rows[0].task, "follow_up");
  assert.equal(queue.rows[0].overdue, false);

  const completed = appendViewingFollowUp(
    viewings,
    { viewingId: "viewing-test", actor: "broker_ru", action: "complete" },
    { filePath: followUpPath, recordedAt: "2026-07-07T13:30:00Z" },
  );
  assert.equal(completed.viewing.status, "no_show");
  assert.equal(completed.viewing.follow_up_task.status, "completed");
  assert.equal(buildViewingFollowUpQueue(viewings, readViewingFollowUps(followUpPath)).summary.open, 0);
  assert.equal(assertViewingFollowUpLedger(readViewingFollowUps(followUpPath)), true);
});

test("viewing follow-up IDs are collision-safe and cannot claim another broker action", () => {
  const { followUpPath, viewings } = fixture();
  appendViewingFollowUp(
    viewings,
    {
      id: "viewing-follow-up-viewing-test-2",
      viewingId: "viewing-test",
      actor: "broker_ru",
      action: "note",
      note: "Private broker note.",
    },
    { filePath: followUpPath, recordedAt: "2026-07-06T08:00:00Z" },
  );
  const noShow = appendViewingFollowUp(
    viewings,
    {
      viewingId: "viewing-test",
      actor: "broker_ru",
      action: "no_show",
      dueAt: "2026-07-06T13:00:00Z",
    },
    { filePath: followUpPath, recordedAt: "2026-07-06T12:00:00Z" },
  );
  assert.equal(noShow.follow_up.id, "viewing-follow-up-viewing-test-3");

  assert.throws(
    () =>
      appendViewingFollowUp(
        viewings,
        {
          id: "viewing-follow-up-viewing-test-2",
          viewingId: "viewing-test",
          actor: "broker_en",
          task: "feedback",
          action: "complete",
        },
        { filePath: followUpPath, recordedAt: "2026-07-06T12:05:00Z" },
      ),
    /id already belongs to a different action/,
  );
  assert.equal(assertViewingFollowUpLedger(readViewingFollowUps(followUpPath)), true);
});

test("viewing follow-up outcomes keep the append-only timeline credible", () => {
  const { followUpPath, viewings } = fixture();
  assert.throws(
    () =>
      appendViewingFollowUp(
        viewings,
        { viewingId: "viewing-test", actor: "broker_ru", action: "complete" },
        { filePath: followUpPath, recordedAt: "2026-07-06T09:00:00Z" },
      ),
    /cannot be recorded before the viewing starts/,
  );
  assert.throws(
    () =>
      appendViewingFollowUp(
        viewings,
        {
          viewingId: "viewing-test",
          actor: "broker_ru",
          action: "reschedule",
          startsAt: "2026-07-06T08:00:00Z",
        },
        { filePath: followUpPath, recordedAt: "2026-07-06T09:00:00Z" },
      ),
    /must start after the recorded action/,
  );
  assert.throws(
    () =>
      appendViewingFollowUp(
        viewings,
        {
          viewingId: "viewing-test",
          actor: "broker_ru",
          action: "reschedule",
          startsAt: "2026-07-07T10:00:00Z",
          feedbackDueAt: "2026-07-07T09:00:00Z",
        },
        { filePath: followUpPath, recordedAt: "2026-07-06T12:00:00Z" },
      ),
    /feedback due date cannot precede the new viewing/,
  );
  assert.throws(
    () =>
      appendViewingFollowUp(
        viewings,
        {
          viewingId: "viewing-test",
          actor: "broker_ru",
          action: "no_show",
          dueAt: "2026-07-06T11:00:00Z",
        },
        { filePath: followUpPath, recordedAt: "2026-07-06T12:00:00Z" },
      ),
    /due date cannot precede the recorded action/,
  );
});
