import fs from "node:fs";
import path from "node:path";
import { fromRoot } from "./paths.mjs";

export const DEFAULT_REPLY_DELIVERY_OUTCOME_LEDGER_PATH = fromRoot(
  "production",
  "data",
  "reply-delivery-outcomes.jsonl",
);

const ACTIONS = new Set(["sent", "failed", "requeue"]);
const CHANNELS = new Set(["email", "phone", "whatsapp", "viber", "sms", "other"]);

function isoTimestamp(value, label) {
  const text = String(value || "").trim();
  if (!text || Number.isNaN(Date.parse(text))) throw new Error(`${label} must be an ISO timestamp`);
  return new Date(text).toISOString();
}

function boundedNote(value) {
  const note = String(value || "").trim();
  if (note.length > 2000) throw new Error("Reply delivery note must be 2000 characters or fewer");
  return note || null;
}

function initialState(reply) {
  return {
    reply_id: reply.id,
    lead_id: reply.lead_id,
    listing_reference: reply.listing_reference || null,
    reply_language: reply.reply_language,
    reviewer: reply.reviewer,
    reviewed_at: reply.reviewed_at,
    status: "queued",
    delivery_channel: null,
    sent_at: null,
    last_action: null,
    last_actor: null,
    last_recorded_at: null,
    failure_count: 0,
  };
}

function applyOutcome(state, outcome) {
  state.last_action = outcome.action;
  state.last_actor = outcome.actor;
  state.last_recorded_at = outcome.recorded_at;
  if (outcome.action === "sent") {
    state.status = "sent";
    state.delivery_channel = outcome.channel;
    state.sent_at = outcome.sent_at;
    return;
  }
  if (outcome.action === "failed") {
    state.status = "failed";
    state.delivery_channel = outcome.channel;
    state.failure_count += 1;
    return;
  }
  if (outcome.action === "requeue") {
    state.status = "queued";
    state.delivery_channel = outcome.channel || state.delivery_channel;
  }
}

export function deriveReplyDeliveryStates(replies = [], outcomes = []) {
  const states = new Map();
  for (const reply of replies) {
    if (!states.has(reply.id)) states.set(reply.id, initialState(reply));
  }
  for (const outcome of outcomes) {
    const state = states.get(outcome.reply_id);
    if (state) applyOutcome(state, outcome);
  }
  return [...states.values()];
}

export function buildReplyDeliveryQueue(replies = [], outcomes = []) {
  const states = deriveReplyDeliveryStates(replies, outcomes);
  const rows = states
    .filter((state) => state.status !== "sent")
    .sort((left, right) => Date.parse(left.reviewed_at) - Date.parse(right.reviewed_at));
  return {
    rows,
    states,
    summary: {
      total: states.length,
      queued: states.filter((state) => state.status === "queued").length,
      failed: states.filter((state) => state.status === "failed").length,
      sent: states.filter((state) => state.status === "sent").length,
    },
  };
}

export function resetReplyDeliveryOutcomes(filePath = DEFAULT_REPLY_DELIVERY_OUTCOME_LEDGER_PATH) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "");
}

export function readReplyDeliveryOutcomes(filePath = DEFAULT_REPLY_DELIVERY_OUTCOME_LEDGER_PATH) {
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function normalizedInput(state, input, recordedAt) {
  const action = String(input.action || "").trim();
  if (!ACTIONS.has(action)) throw new Error("Reply delivery action must be sent, failed, or requeue");
  const actor = String(input.actor || input.broker || "").trim();
  if (!actor) throw new Error("Reply delivery actor is required");
  const channel = String(input.channel || input.deliveryChannel || input.delivery_channel || "").trim().toLowerCase();
  if ((action === "sent" || action === "failed") && !CHANNELS.has(channel)) {
    throw new Error("Reply delivery channel must be email, phone, whatsapp, viber, sms, or other");
  }
  const note = boundedNote(input.note);
  if (action === "failed" && !note) throw new Error("Failed reply delivery requires a note");
  const recorded = isoTimestamp(recordedAt, "recordedAt");
  if (Date.parse(recorded) < Date.parse(state.reviewed_at)) {
    throw new Error("Reply delivery cannot be recorded before broker review");
  }
  if (state.last_recorded_at && Date.parse(recorded) < Date.parse(state.last_recorded_at)) {
    throw new Error("Reply delivery outcomes must be recorded in chronological order");
  }
  const sentAt = action === "sent" ? isoTimestamp(input.sentAt || input.sent_at || recorded, "sentAt") : null;
  if (sentAt && Date.parse(sentAt) < Date.parse(state.reviewed_at)) {
    throw new Error("Reply cannot be marked sent before broker review");
  }
  if (sentAt && Date.parse(sentAt) > Date.parse(recorded)) {
    throw new Error("Reply sentAt cannot be later than recordedAt");
  }
  return {
    id: input.id ? String(input.id).trim() : null,
    reply_id: state.reply_id,
    lead_id: state.lead_id,
    actor,
    action,
    channel: channel || null,
    note,
    sent_at: sentAt,
    recorded_at: recorded,
  };
}

function sameOutcome(left, right) {
  return (
    left.reply_id === right.reply_id &&
    left.actor === right.actor &&
    left.action === right.action &&
    (left.channel || null) === (right.channel || null) &&
    (left.note || null) === (right.note || null) &&
    (left.sent_at || null) === (right.sent_at || null)
  );
}

function assertTransition(state, outcome) {
  if (outcome.action === "requeue") {
    if (state.status !== "failed") throw new Error("Only a failed reply delivery can be requeued");
    return;
  }
  if (state.status === "sent") throw new Error("Reply delivery is already marked sent");
  if (state.status === "failed") throw new Error("Failed reply delivery must be requeued before another attempt");
}

function nextOutcomeId(rows, replyId) {
  let ordinal = rows.filter((row) => row.reply_id === replyId).length + 1;
  const ids = new Set(rows.map((row) => row.id));
  let id = `reply-delivery-${replyId}-${ordinal}`;
  while (ids.has(id)) {
    ordinal += 1;
    id = `reply-delivery-${replyId}-${ordinal}`;
  }
  return id;
}

export function appendReplyDeliveryOutcome(
  replies,
  input,
  { filePath = DEFAULT_REPLY_DELIVERY_OUTCOME_LEDGER_PATH, recordedAt = new Date().toISOString() } = {},
) {
  const replyId = String(input.replyId || input.reply_id || "").trim();
  const reply = replies.find((row) => row.id === replyId);
  if (!reply) throw new Error("Reply delivery requires a known replyId");
  const rows = readReplyDeliveryOutcomes(filePath);
  const state = deriveReplyDeliveryStates(replies, rows).find((candidate) => candidate.reply_id === replyId);
  const outcome = normalizedInput(state, input, recordedAt);
  const existing = outcome.id
    ? rows.find((row) => row.id === outcome.id)
    : [...rows].reverse().find((row) => sameOutcome(row, outcome));
  if (existing) {
    if (!sameOutcome(existing, outcome)) throw new Error("Reply delivery outcome id already belongs to another action");
    return { outcome: existing, delivery: state, idempotent: true };
  }
  assertTransition(state, outcome);
  outcome.id ||= nextOutcomeId(rows, replyId);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(outcome)}\n`);
  const delivery = deriveReplyDeliveryStates(replies, [...rows, outcome]).find((candidate) => candidate.reply_id === replyId);
  return { outcome, delivery, idempotent: false };
}

export function assertReplyDeliveryOutcomes(rows) {
  if (!rows.length) throw new Error("Reply delivery outcome ledger must contain at least one row");
  const ids = new Set();
  for (const row of rows) {
    if (!row.id || ids.has(row.id)) throw new Error("Reply delivery outcome ids must be present and unique");
    ids.add(row.id);
    if (!row.reply_id || !row.lead_id || !row.actor || !ACTIONS.has(row.action)) {
      throw new Error("Reply delivery outcome is missing routing data");
    }
    if (!row.recorded_at || Number.isNaN(Date.parse(row.recorded_at))) {
      throw new Error("Reply delivery outcome must include recorded_at");
    }
    if ((row.action === "sent" || row.action === "failed") && !CHANNELS.has(row.channel)) {
      throw new Error("Sent or failed reply delivery must preserve its channel");
    }
    if (row.action === "sent" && !row.sent_at) {
      throw new Error("Sent reply delivery must preserve sent_at");
    }
    if (row.action === "failed" && !String(row.note || "").trim()) {
      throw new Error("Failed reply delivery must preserve its note");
    }
    if (row.contact || row.email || row.phone || row.reviewed_reply || row.translated_draft || row.message) {
      throw new Error("Reply delivery outcomes must not contain customer contact or reply content");
    }
  }
  return true;
}
