import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  appendReplyDeliveryOutcome,
  assertReplyDeliveryOutcomes,
  buildReplyDeliveryQueue,
  readReplyDeliveryOutcomes,
} from "../lib/reply-delivery-outcomes.mjs";

function fixture() {
  return {
    id: "reply-lead-1",
    lead_id: "lead-1",
    listing_reference: "MS-00815",
    reply_language: "ru",
    reviewer: "broker_ru",
    reviewed_at: "2026-07-18T10:00:00.000Z",
    reviewed_reply: "Private approved text must not enter delivery outcomes.",
    status: "queued_for_manual_send",
    broker_approved: true,
  };
}

function ledger() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-reply-delivery-"));
  const filePath = path.join(directory, "outcomes.jsonl");
  fs.writeFileSync(filePath, "");
  return filePath;
}

test("approved replies remain queued until an attributed sent outcome exists", () => {
  const filePath = ledger();
  const replies = [fixture()];
  assert.equal(buildReplyDeliveryQueue(replies, []).summary.queued, 1);

  const sent = appendReplyDeliveryOutcome(
    replies,
    { replyId: replies[0].id, actor: "broker_ru", action: "sent", channel: "whatsapp" },
    { filePath, recordedAt: "2026-07-18T10:05:00.000Z" },
  );
  assert.equal(sent.delivery.status, "sent");
  assert.equal(sent.delivery.sent_at, "2026-07-18T10:05:00.000Z");
  const queue = buildReplyDeliveryQueue(replies, readReplyDeliveryOutcomes(filePath));
  assert.equal(queue.summary.sent, 1);
  assert.equal(queue.summary.queued, 0);
  assert.deepEqual(queue.rows, []);
  assert.equal(assertReplyDeliveryOutcomes(readReplyDeliveryOutcomes(filePath)), true);
  assert.doesNotMatch(fs.readFileSync(filePath, "utf8"), /Private approved text/);
});

test("failed delivery must be explained and requeued before retry", () => {
  const filePath = ledger();
  const replies = [fixture()];
  assert.throws(
    () => appendReplyDeliveryOutcome(replies, { replyId: replies[0].id, actor: "broker_ru", action: "failed", channel: "email" }, { filePath, recordedAt: "2026-07-18T10:05:00.000Z" }),
    /requires a note/,
  );
  appendReplyDeliveryOutcome(
    replies,
    { replyId: replies[0].id, actor: "broker_ru", action: "failed", channel: "email", note: "Mailbox rejected the address." },
    { filePath, recordedAt: "2026-07-18T10:05:00.000Z" },
  );
  assert.throws(
    () => appendReplyDeliveryOutcome(replies, { replyId: replies[0].id, actor: "broker_ru", action: "sent", channel: "email" }, { filePath, recordedAt: "2026-07-18T10:06:00.000Z" }),
    /requeued before another attempt/,
  );
  const requeued = appendReplyDeliveryOutcome(
    replies,
    { replyId: replies[0].id, actor: "broker_ru", action: "requeue" },
    { filePath, recordedAt: "2026-07-18T10:07:00.000Z" },
  );
  assert.equal(requeued.delivery.status, "queued");
  const sent = appendReplyDeliveryOutcome(
    replies,
    { replyId: replies[0].id, actor: "broker_ru", action: "sent", channel: "phone" },
    { filePath, recordedAt: "2026-07-18T10:08:00.000Z" },
  );
  assert.equal(sent.delivery.failure_count, 1);
  assert.equal(sent.delivery.status, "sent");
});

test("delivery outcomes reject unknown replies and anonymous actors", () => {
  const filePath = ledger();
  const replies = [fixture()];
  assert.throws(
    () => appendReplyDeliveryOutcome(replies, { replyId: "missing", actor: "broker_ru", action: "sent", channel: "email" }, { filePath }),
    /known replyId/,
  );
  assert.throws(
    () => appendReplyDeliveryOutcome(replies, { replyId: replies[0].id, action: "sent", channel: "email" }, { filePath }),
    /actor is required/,
  );
});

test("delivery evidence cannot predate approval or future-date a send", () => {
  const filePath = ledger();
  const replies = [fixture()];
  assert.throws(
    () =>
      appendReplyDeliveryOutcome(
        replies,
        { replyId: replies[0].id, actor: "broker_ru", action: "sent", channel: "email" },
        { filePath, recordedAt: "2026-07-18T09:59:59.000Z" },
      ),
    /before broker review/,
  );
  assert.throws(
    () =>
      appendReplyDeliveryOutcome(
        replies,
        {
          replyId: replies[0].id,
          actor: "broker_ru",
          action: "sent",
          channel: "email",
          sentAt: "2026-07-18T10:06:00.000Z",
        },
        { filePath, recordedAt: "2026-07-18T10:05:00.000Z" },
      ),
    /later than recordedAt/,
  );
});
