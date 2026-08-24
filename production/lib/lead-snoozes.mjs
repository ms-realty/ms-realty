import fs from "node:fs";
import path from "node:path";
import { fromRoot } from "./paths.mjs";

// Lead snoozes: an append-only record of a broker deferring one enquiry to a
// chosen moment, with the reason they gave.
//
// The SLA clock DEFERS, it never restarts. buildLeadSlaReport() reads the
// deferral this module derives and pushes both the reminder and the manager
// escalation out by exactly the snoozed window, so a deferred enquiry still
// escalates - later, never silently never.
//
// Deferral model (deliberate, and asserted by the tests):
//   * an ACTIVE snooze defers both clocks by its whole approved window
//     (until - snoozed_at), so the enquiry does not reappear before `until`;
//   * a snooze that RAN OUT keeps that same whole-window deferral, because the
//     deferral the operator approved actually happened;
//   * a snooze ended early by an un-snooze contributes NOTHING: un-snooze
//     restores the original clock, which is the fail-closed direction - the
//     enquiry owes its original response time again.

export const DEFAULT_LEAD_SNOOZE_LEDGER_PATH = fromRoot("production", "data", "lead-snoozes.jsonl");

export const LEAD_SNOOZE_ACTIONS = Object.freeze(["snooze", "unsnooze"]);
const ACTION_SET = new Set(LEAD_SNOOZE_ACTIONS);
const MAX_SNOOZE_DAYS = 90;
const MAX_REASON_LENGTH = 500;

function isoTimestamp(value, label) {
  const text = String(value || "").trim();
  if (!text || Number.isNaN(Date.parse(text))) throw new Error(`${label} must be an ISO timestamp`);
  return new Date(text).toISOString();
}

function boundedText(value, label, max) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${label} is required`);
  if (text.length > max) throw new Error(`${label} must be ${max} characters or fewer`);
  return text;
}

function knownLead(leads, leadId) {
  const id = boundedText(leadId, "Lead id", 160);
  const lead = (leads || []).find((row) => row.lead_id === id);
  if (!lead) throw new Error("Snooze requires a known leadId");
  return lead;
}

export function resetLeadSnoozes(filePath = DEFAULT_LEAD_SNOOZE_LEDGER_PATH) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "");
}

export function readLeadSnoozes(filePath = DEFAULT_LEAD_SNOOZE_LEDGER_PATH) {
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

// The open snooze for one lead, or null. A snooze stays "open" after its
// `until` passes: it is then an expired window that still owes its deferral.
function latestSnoozeFor(rows, leadId) {
  let open = null;
  for (const row of rows) {
    if (row.lead_id !== leadId) continue;
    if (row.action === "snooze") open = row;
    if (row.action === "unsnooze") open = null;
  }
  return open;
}

export function activeLeadSnooze(rows, leadId, now = new Date().toISOString()) {
  const open = latestSnoozeFor(rows, leadId);
  if (!open) return null;
  return Date.parse(now) < Date.parse(open.until) ? open : null;
}

export function createLeadSnooze(leads, rows, input, recordedAt = new Date().toISOString()) {
  const lead = knownLead(leads, input.leadId || input.lead_id);
  const recorded = isoTimestamp(recordedAt, "recordedAt");
  const actor = boundedText(input.actor || input.snoozedBy || input.snoozed_by, "Snooze actor", 80);
  const reason = boundedText(input.reason, "Snooze reason", MAX_REASON_LENGTH);
  const until = isoTimestamp(input.until || input.snoozeUntil || input.snooze_until, "until");
  if (Date.parse(until) <= Date.parse(recorded)) throw new Error("until must be in the future");
  if (Date.parse(until) - Date.parse(recorded) > MAX_SNOOZE_DAYS * 24 * 60 * 60 * 1000) {
    throw new Error(`until must be within ${MAX_SNOOZE_DAYS} days`);
  }
  const open = latestSnoozeFor(rows || [], lead.lead_id);
  if (open) {
    // A retried submission of the same deferral is the same deferral, not a
    // second one: hand back the stored record so the caller stays idempotent.
    if (open.actor === actor && open.reason === reason && open.until === until) return open;
    throw new Error("Lead already has an open snooze; un-snooze it before deferring again");
  }
  return {
    id: null,
    lead_id: lead.lead_id,
    action: "snooze",
    actor,
    reason,
    until,
    snooze_id: null,
    recorded_at: recorded,
    human_confirmed: true,
  };
}

export function createLeadUnsnooze(leads, rows, input, recordedAt = new Date().toISOString()) {
  const lead = knownLead(leads, input.leadId || input.lead_id);
  const recorded = isoTimestamp(recordedAt, "recordedAt");
  const actor = boundedText(input.actor || input.unsnoozedBy || input.unsnoozed_by, "Snooze actor", 80);
  const reason = boundedText(input.reason, "Snooze reason", MAX_REASON_LENGTH);
  const open = latestSnoozeFor(rows || [], lead.lead_id);
  if (!open) throw new Error("Lead has no open snooze to restore");
  return {
    id: null,
    lead_id: lead.lead_id,
    action: "unsnooze",
    actor,
    reason,
    until: null,
    snooze_id: open.id,
    recorded_at: recorded,
    human_confirmed: true,
  };
}

function sameIntent(left, right) {
  return (
    left.lead_id === right.lead_id &&
    left.action === right.action &&
    left.actor === right.actor &&
    left.reason === right.reason &&
    (left.until || null) === (right.until || null)
  );
}

function nextSnoozeId(rows, record) {
  const base = `lead-${record.action}-${record.lead_id}`;
  const ids = new Set(rows.map((row) => row.id));
  if (!ids.has(base)) return base;
  let ordinal = 2;
  while (ids.has(`${base}-${ordinal}`)) ordinal += 1;
  return `${base}-${ordinal}`;
}

// The append decision, without the storage. A durable writer runs the same
// rules against rows it read from Postgres, so both backends collapse a retry
// onto the original record and mint the same next id.
export function resolveLeadSnoozeAppend(rows, record) {
  // A retried submission with the same intent returns the original record.
  const existing = (rows || []).find((row) => sameIntent(row, record));
  if (existing) return { record: existing, idempotent: true };
  return { record: { ...record, id: record.id || nextSnoozeId(rows || [], record) }, idempotent: false };
}

export function appendLeadSnooze(record, { filePath = DEFAULT_LEAD_SNOOZE_LEDGER_PATH } = {}) {
  const rows = readLeadSnoozes(filePath);
  const resolved = resolveLeadSnoozeAppend(rows, record);
  if (resolved.idempotent) return { ...resolved.record, idempotent: true };
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(resolved.record)}\n`);
  return { ...resolved.record, idempotent: false };
}

// How long each lead's clocks are pushed out, in milliseconds, together with
// the snooze state a screen can render.
export function deriveLeadSnoozeStates(rows = [], { now = new Date().toISOString() } = {}) {
  const nowTime = Date.parse(now);
  if (!Number.isFinite(nowTime)) throw new Error("now must be an ISO timestamp");
  const byLead = new Map();
  for (const row of rows) {
    if (!byLead.has(row.lead_id)) {
      byLead.set(row.lead_id, { lead_id: row.lead_id, status: "never_snoozed", until: null, reason: null, actor: null, deferred_ms: 0, snooze_count: 0 });
    }
    const state = byLead.get(row.lead_id);
    if (row.action === "snooze") {
      state.snooze_count += 1;
      state.open = row;
      state.status = "active";
      state.until = row.until;
      state.reason = row.reason;
      state.actor = row.actor;
      continue;
    }
    // Un-snooze restores the original clock: the window it ends contributes
    // no deferral at all.
    state.open = null;
    state.status = "restored";
    state.until = null;
    state.reason = row.reason;
    state.actor = row.actor;
  }
  return [...byLead.values()].map((state) => {
    const { open, ...rest } = state;
    if (!open) return { ...rest, deferred_ms: 0, deferred_minutes: 0 };
    const window = Date.parse(open.until) - Date.parse(open.recorded_at);
    const expired = nowTime >= Date.parse(open.until);
    return {
      ...rest,
      status: expired ? "expired" : "active",
      snoozed_at: open.recorded_at,
      deferred_ms: Math.max(0, window),
      deferred_minutes: Math.round(Math.max(0, window) / 60000),
    };
  });
}

export function leadSnoozeDeferrals(rows = [], { now = new Date().toISOString() } = {}) {
  return new Map(deriveLeadSnoozeStates(rows, { now }).map((state) => [state.lead_id, state]));
}

export function assertLeadSnoozes(rows) {
  const ids = new Set();
  for (const row of rows) {
    if (!row.id || ids.has(row.id)) throw new Error("Lead snooze ids must be present and unique");
    ids.add(row.id);
    if (!row.lead_id || !row.actor || !row.reason || !ACTION_SET.has(row.action) || row.human_confirmed !== true) {
      throw new Error("Lead snooze row is missing audit data");
    }
    isoTimestamp(row.recorded_at, "recorded_at");
    if (row.action === "snooze") {
      isoTimestamp(row.until, "until");
      if (Date.parse(row.until) <= Date.parse(row.recorded_at)) throw new Error("Lead snooze must defer into the future");
    } else if (row.until !== null) {
      throw new Error("Un-snooze rows must not carry a deferral window");
    }
    if (["contact", "email", "message", "phone", "whatsapp", "viber"].some((field) => field in row)) {
      throw new Error("Lead snoozes must not contain private contact data");
    }
  }
  return true;
}
