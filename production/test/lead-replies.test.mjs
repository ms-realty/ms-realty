import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { appendReviewedReply, assertReplyOutbox, readReplyOutbox, resetReplyOutbox } from "../lib/lead-replies.mjs";

test("reply outbox requires known lead and broker approval", () => {
  const file = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-replies-`)}/replies.jsonl`;
  resetReplyOutbox(file);
  const leads = [{ lead_id: "lead-test", listing_reference: "MS-CRAWL-0001", original_language: "he" }];

  assert.throws(
    () => appendReviewedReply(leads, { leadId: "lead-test", reviewedReply: "Draft", reviewer: "broker_ru" }, { filePath: file }),
    /Broker approval/,
  );

  appendReviewedReply(
    leads,
    {
      leadId: "lead-test",
      reviewedReply: "Reviewed reply approved by broker.",
      reviewer: "broker_ru",
      approved: true,
    },
    { filePath: file, reviewedAt: "2026-07-04T00:05:00Z" },
  );

  const rows = readReplyOutbox(file);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, "queued_for_manual_send");
  assert.equal(assertReplyOutbox(rows), true);
});
