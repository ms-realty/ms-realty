import fs from "node:fs";
import path from "node:path";
import { fromRoot } from "./paths.mjs";

export const DEFAULT_REPLY_OUTBOX_PATH = fromRoot("production", "data", "reply-outbox.jsonl");

export function resetReplyOutbox(filePath = DEFAULT_REPLY_OUTBOX_PATH) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "");
}

export function readReplyOutbox(filePath = DEFAULT_REPLY_OUTBOX_PATH) {
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export function appendReviewedReply(
  leads,
  input,
  { filePath = DEFAULT_REPLY_OUTBOX_PATH, reviewedAt = new Date().toISOString() } = {},
) {
  const lead = leads.find((row) => row.lead_id === input.leadId);
  if (!lead) throw new Error("Reply requires a known leadId");
  if (!input.reviewedReply || !input.reviewer) throw new Error("reviewedReply and reviewer are required");
  if (input.approved !== true) throw new Error("Broker approval is required before reply is queued");

  const row = {
    id: input.id || `reply-${input.leadId}`,
    lead_id: input.leadId,
    listing_reference: lead.listing_reference,
    original_language: lead.original_language,
    reply_language: input.language || lead.original_language,
    reviewed_reply: input.reviewedReply,
    reviewer: input.reviewer,
    reviewed_at: reviewedAt,
    status: "queued_for_manual_send",
    broker_approved: true,
    hermes_draft_used: Boolean(input.hermesDraft),
  };

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(row)}\n`);
  return row;
}

export function assertReplyOutbox(rows) {
  if (!rows.length) throw new Error("Reply outbox must contain at least one row");
  for (const row of rows) {
    if (!row.lead_id || !row.reviewed_reply || row.broker_approved !== true) {
      throw new Error("Reply outbox row is missing approval data");
    }
    if (row.status !== "queued_for_manual_send") throw new Error("Replies must not be auto-sent");
  }
  return true;
}
