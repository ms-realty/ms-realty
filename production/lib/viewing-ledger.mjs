import { assertLeadCanBookViewing } from "./lead-pipeline-outcomes.mjs";
import { fromRoot } from "./paths.mjs";
import { createLedgerStore } from "./sqlite-ledger.mjs";

export const DEFAULT_VIEWING_LEDGER_PATH = fromRoot("production", "data", "viewings.jsonl");

const store = createLedgerStore({
  name: "viewings",
  columns: ["id", "lead_id", "listing_reference", "broker", "starts_at", "booked_at", "channel", "status"],
  indexes: ["lead_id", "starts_at"],
});

export function resetViewingLedger(filePath = DEFAULT_VIEWING_LEDGER_PATH) {
  store.resetLedger(filePath);
}

export function readViewings(filePath = DEFAULT_VIEWING_LEDGER_PATH) {
  return store.readRows(filePath);
}

export function createViewing(context, input, { rows = [], bookedAt = new Date().toISOString() } = {}) {
  if (!context || typeof context !== "object" || !Array.isArray(context.leads)) {
    throw new Error("Viewing requires lead journey context");
  }
  if (!Array.isArray(rows)) throw new Error("Viewing rows must be an array");
  const leads = context.leads;
  const lead = leads.find((row) => row.lead_id === input.leadId);
  if (!lead) throw new Error("Viewing requires a known leadId");
  if (!input.startsAt || !input.broker) throw new Error("startsAt and broker are required");
  if (Number.isNaN(Date.parse(input.startsAt))) throw new Error("startsAt must be an ISO date");
  const startsAt = new Date(input.startsAt).toISOString();
  if (Number.isNaN(Date.parse(bookedAt))) throw new Error("bookedAt must be an ISO date");
  const normalizedBookedAt = new Date(bookedAt).toISOString();
  const listingReference = input.listingReference || lead.listing_reference || null;
  const semanticMatch = rows.find(
    (row) =>
      row.lead_id === input.leadId &&
      row.broker === input.broker &&
      row.starts_at === startsAt &&
      (row.listing_reference || null) === listingReference,
  );
  if (semanticMatch) return { ...semanticMatch, idempotent: true };
  assertLeadCanBookViewing({ ...context, viewings: rows }, input.leadId, normalizedBookedAt);
  if (Date.parse(startsAt) < Date.parse(normalizedBookedAt)) throw new Error("startsAt cannot precede bookedAt");
  const requestedId = String(input.id || "").trim();
  const conflictingId = requestedId ? rows.find((row) => row.id === requestedId) : null;
  if (conflictingId) throw new Error("Viewing id already belongs to another booking");
  let ordinal = rows.filter((row) => row.lead_id === input.leadId).length + 1;
  let id = requestedId || `viewing-${input.leadId}${ordinal === 1 ? "" : `-${ordinal}`}`;
  const ids = new Set(rows.map((row) => row.id));
  while (ids.has(id)) {
    ordinal += 1;
    id = `viewing-${input.leadId}-${ordinal}`;
  }
  const followUpDueValue = input.followUpDueAt || startsAt;
  if (Number.isNaN(Date.parse(followUpDueValue))) throw new Error("followUpDueAt must be an ISO date");
  const followUpDueAt = new Date(followUpDueValue).toISOString();
  if (Date.parse(followUpDueAt) < Date.parse(normalizedBookedAt)) throw new Error("followUpDueAt cannot precede bookedAt");
  const feedbackDueValue = input.feedbackDueAt || new Date(Date.parse(startsAt) + 2 * 60 * 60 * 1000).toISOString();
  if (Number.isNaN(Date.parse(feedbackDueValue))) throw new Error("feedbackDueAt must be an ISO date");
  const feedbackDueAt = new Date(feedbackDueValue).toISOString();
  if (Date.parse(feedbackDueAt) < Date.parse(startsAt)) throw new Error("feedbackDueAt cannot precede startsAt");
  const taskSuffix = ordinal === 1 && id === `viewing-${input.leadId}` ? input.leadId : id;

  const row = {
    id,
    lead_id: input.leadId,
    listing_reference: listingReference,
    original_language: lead.original_language,
    admin_locale: lead.admin_locale,
    broker: input.broker,
    starts_at: startsAt,
    booked_at: normalizedBookedAt,
    channel: input.channel || "property_viewing",
    status: "booked",
    follow_up_task: {
      id: input.taskId || `task-${taskSuffix}`,
      owner: input.broker,
      status: "open",
      due_at: followUpDueAt,
    },
    feedback_request: {
      id: input.feedbackTaskId || `feedback-${taskSuffix}`,
      owner: input.broker,
      status: "open",
      due_at: feedbackDueAt,
      channel: input.feedbackChannel || lead.contact_preference || "broker_follow_up",
    },
  };

  return { ...row, idempotent: false };
}

export function appendViewing(context, input, { filePath = DEFAULT_VIEWING_LEDGER_PATH, bookedAt = new Date().toISOString() } = {}) {
  const result = createViewing(context, input, { rows: readViewings(filePath), bookedAt });
  if (!result.idempotent) {
    const { idempotent, ...row } = result;
    store.appendRow(filePath, row);
  }
  return result;
}

export function assertViewingLedger(rows) {
  if (!rows.length) throw new Error("Viewing ledger must contain at least one row");
  const ids = new Set();
  for (const row of rows) {
    if (!row.id || ids.has(row.id)) throw new Error("Viewing ids must be present and unique");
    ids.add(row.id);
    if (!row.lead_id || !row.broker || !row.starts_at) throw new Error("Viewing row is missing booking data");
    if (row.status !== "booked") throw new Error("Viewing must be booked");
    if (row.follow_up_task?.status !== "open") throw new Error("Viewing must create an open follow-up task");
    if (row.feedback_request?.status !== "open") throw new Error("Viewing must create a post-viewing feedback request");
  }
  return true;
}

function icsDate(value) {
  return new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function icsText(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

export function renderViewingCalendar(rows, { now = new Date().toISOString(), durationMinutes = 30 } = {}) {
  const events = rows.map((row) => {
    const start = new Date(row.starts_at);
    const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
    return [
      "BEGIN:VEVENT",
      `UID:${icsText(row.id)}@ms-realty.local`,
      `DTSTAMP:${icsDate(now)}`,
      `DTSTART:${icsDate(start)}`,
      `DTEND:${icsDate(end)}`,
      `SUMMARY:${icsText(`MS Realty viewing ${row.listing_reference || row.lead_id}`)}`,
      `DESCRIPTION:${icsText(`Lead ${row.lead_id}; broker ${row.broker}; follow-up ${row.follow_up_task?.status || "open"}`)}`,
      "END:VEVENT",
    ].join("\r\n");
  });

  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//MS Realty//Viewings//EN", ...events, "END:VCALENDAR", ""].join("\r\n");
}
