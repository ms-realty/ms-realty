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

function optionalText(value, { max = 4000 } = {}) {
  const text = String(value || "").trim();
  return text ? text.slice(0, max) : null;
}

function booleanInput(value) {
  return value === true || value === "true" || value === "on" || value === "1";
}

function hermesDraftText(input) {
  const draft = input.hermesDraftText || input.translatedDraft || input.hermesDraft;
  if (!draft || draft === true || draft === "true" || draft === "on" || draft === "1") return null;
  if (typeof draft === "object") return optionalText(draft.text || draft.body || draft.message || draft.draft);
  return optionalText(draft);
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
  const messageOriginal = optionalText(input.originalMessage || input.messageOriginal || lead.message_original || lead.message);
  const translatedDraft = hermesDraftText(input);

  const row = {
    id: input.id || `reply-${input.leadId}`,
    lead_id: input.leadId,
    listing_reference: lead.listing_reference,
    original_language: lead.original_language,
    message_original: messageOriginal,
    reply_language: input.language || lead.original_language,
    translated_draft: translatedDraft,
    reviewed_reply: input.reviewedReply,
    reviewer: input.reviewer,
    reviewed_at: reviewedAt,
    status: "queued_for_manual_send",
    broker_approved: true,
    hermes_draft_used: Boolean(translatedDraft),
    hermes_draft_referenced: Boolean(input.hermesDraft || input.hermesDraftText || input.translatedDraft),
    show_original_available: Boolean(messageOriginal),
    show_original_requested: booleanInput(input.showOriginal),
    translated_draft_available: Boolean(translatedDraft),
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
    if (row.hermes_draft_used === true && !row.translated_draft) {
      throw new Error("Hermes draft usage must preserve the reviewed translated draft");
    }
    if (row.show_original_requested === true && row.show_original_available !== true) {
      throw new Error("Reply outbox cannot request original view without original message");
    }
  }
  return true;
}
