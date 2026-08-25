// Visitor-driven changes to a saved search, made through the capability link.
//
// The saved-search ledger is append-only, so a pause, a frequency change, a
// channel change, or a deletion is recorded here as its own event and the
// current state is derived. That keeps the original intake row intact as
// evidence of what the visitor actually asked for, and keeps every later
// change attributable and replayable.
//
// Deleting is a tombstone: the projection drops the record, which stops the
// alert path, removes it from the broker queue, and invalidates the manage
// token, because there is no longer a stored verifier to match.
import fs from "node:fs";
import path from "node:path";
import { fromRoot } from "./paths.mjs";
import {
  SAVED_SEARCH_LINK_REFUSAL,
  SavedSearchLinkRefusedError,
  assertSavedSearchAccess,
  readSavedSearchAccessToken,
} from "./saved-search-access.mjs";

export const DEFAULT_SAVED_SEARCH_MANAGE_EVENT_LEDGER_PATH = fromRoot(
  "production",
  "data",
  "saved-search-manage-events.jsonl",
);

export const SAVED_SEARCH_MANAGE_ACTIONS = Object.freeze([
  "pause",
  "resume",
  "update_frequency",
  "update_channel",
  "delete",
]);
export const SAVED_SEARCH_FREQUENCIES = Object.freeze(["instant", "daily", "weekly"]);
export const SAVED_SEARCH_CHANNELS = Object.freeze(["email", "phone", "whatsapp", "viber"]);

const ACTIONS = new Set(SAVED_SEARCH_MANAGE_ACTIONS);
const FREQUENCIES = new Set(SAVED_SEARCH_FREQUENCIES);
const CHANNELS = new Set(SAVED_SEARCH_CHANNELS);
const MASK = "•";
const MASK_CAP = 6;

const FREQUENCY_WINDOW_MS = {
  instant: 0,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
};

export function savedSearchAlertWindowMs(frequency) {
  return FREQUENCY_WINDOW_MS[frequency] ?? FREQUENCY_WINDOW_MS.weekly;
}

function isoTimestamp(value, label) {
  const text = String(value || "").trim();
  if (!text || Number.isNaN(Date.parse(text))) throw new Error(`${label} must be an ISO timestamp`);
  return new Date(text).toISOString();
}

function maskSegment(value) {
  const length = String(value || "").length;
  if (!length) return "";
  return MASK.repeat(Math.min(MASK_CAP, Math.max(1, length - 1)));
}

// Masks a contact value the same way the vault treats one: the stored value
// never leaves the vault, and what the visitor sees back is only enough to
// recognise which of their own channels a record is routed to. The bullet run
// is capped so the mask does not leak the real length.
export function maskContactValue(value, kind = "text") {
  const text = String(value || "").trim();
  if (!text) return null;
  if (kind === "email") {
    const at = text.lastIndexOf("@");
    if (at <= 0) return `${text.slice(0, 1)}${maskSegment(text.slice(1))}`;
    const local = text.slice(0, at);
    const domain = text.slice(at + 1);
    const dot = domain.lastIndexOf(".");
    const domainName = dot > 0 ? domain.slice(0, dot) : domain;
    const suffix = dot > 0 ? domain.slice(dot) : "";
    return `${local.slice(0, 1)}${maskSegment(local)}@${domainName.slice(0, 1)}${maskSegment(domainName)}${suffix}`;
  }
  if (kind === "phone") {
    const plus = text.startsWith("+") ? "+" : "";
    const digits = text.replace(/\D/g, "");
    if (digits.length <= 2) return `${plus}${MASK.repeat(2)}`;
    return `${plus}${MASK.repeat(Math.min(MASK_CAP, digits.length - 2))}${digits.slice(-2)}`;
  }
  return `${text.slice(0, 1)}${maskSegment(text)}`;
}

export function maskedContactChannels(contact = {}) {
  const source = contact && typeof contact === "object" ? contact : {};
  return {
    email: maskContactValue(source.email, "email"),
    phone: maskContactValue(source.phone, "phone"),
    whatsapp: maskContactValue(source.whatsapp, "phone"),
    viber: maskContactValue(source.viber, "phone"),
  };
}

export function reachableContactChannels(contact = {}) {
  const source = contact && typeof contact === "object" ? contact : {};
  return SAVED_SEARCH_CHANNELS.filter((channel) => Boolean(String(source[channel] || "").trim()));
}

export function normalizeSavedSearchManageEvent(input = {}, recordedAt = new Date().toISOString()) {
  const action = String(input.action || "").trim();
  if (!ACTIONS.has(action)) {
    throw new Error("Saved search action must be pause, resume, update_frequency, update_channel, or delete");
  }
  const savedSearchId = String(input.savedSearchId || input.saved_search_id || "").trim();
  if (!savedSearchId) throw new Error("Saved search id is required");
  const frequency = String(input.frequency || input.alertFrequency || input.alert_frequency || "").trim();
  const channel = String(input.channel || input.contactPreference || input.contact_preference || "").trim().toLowerCase();
  if (action === "update_frequency" && !FREQUENCIES.has(frequency)) {
    throw new Error("frequency must be instant, daily, or weekly");
  }
  if (action === "update_channel" && !CHANNELS.has(channel)) {
    throw new Error("channel must be email, phone, whatsapp, or viber");
  }
  return {
    id: input.id ? String(input.id).trim() : null,
    saved_search_id: savedSearchId,
    action,
    actor: "saved_search_link",
    frequency: action === "update_frequency" ? frequency : null,
    channel: action === "update_channel" ? channel : null,
    recorded_at: isoTimestamp(recordedAt, "recordedAt"),
  };
}

export function resetSavedSearchManageEvents(filePath = DEFAULT_SAVED_SEARCH_MANAGE_EVENT_LEDGER_PATH) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "");
}

export function readSavedSearchManageEvents(filePath = DEFAULT_SAVED_SEARCH_MANAGE_EVENT_LEDGER_PATH) {
  if (!filePath || !fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function nextEventId(rows, savedSearchId) {
  const known = new Set(rows.map((row) => row.id));
  let ordinal = rows.filter((row) => row.saved_search_id === savedSearchId).length + 1;
  let id = `saved-search-manage-${savedSearchId}-${ordinal}`;
  while (known.has(id)) {
    ordinal += 1;
    id = `saved-search-manage-${savedSearchId}-${ordinal}`;
  }
  return id;
}

export function appendSavedSearchManageEvent(
  event,
  { filePath = DEFAULT_SAVED_SEARCH_MANAGE_EVENT_LEDGER_PATH } = {},
) {
  if (!filePath) throw new Error("Saved search manage event ledger path is required");
  const rows = readSavedSearchManageEvents(filePath);
  const stored = { ...event, id: event.id || nextEventId(rows, event.saved_search_id) };
  if (rows.some((row) => row.id === stored.id)) return rows.find((row) => row.id === stored.id);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(stored)}\n`);
  return stored;
}

// Current saved-search state: the intake rows with every later visitor change
// folded in, and deleted records dropped outright.
export function applySavedSearchManageEvents(savedSearches = [], events = []) {
  const byId = new Map(savedSearches.map((row) => [row.id, { ...row }]));
  const deleted = new Set();
  for (const event of [...events].sort((left, right) => Date.parse(left.recorded_at) - Date.parse(right.recorded_at))) {
    const row = byId.get(event.saved_search_id);
    if (!row) continue;
    if (event.action === "delete") {
      deleted.add(event.saved_search_id);
      byId.delete(event.saved_search_id);
      continue;
    }
    if (event.action === "pause") row.status = "paused";
    if (event.action === "resume") row.status = "active";
    if (event.action === "update_frequency") row.alert_frequency = event.frequency;
    if (event.action === "update_channel") row.contact_preference = event.channel;
    row.updated_at = event.recorded_at;
    row.last_managed_action = event.action;
  }
  return savedSearches.filter((row) => !deleted.has(row.id)).map((row) => byId.get(row.id) || row);
}

export function findManageableSavedSearch(savedSearches, events, savedSearchId) {
  return applySavedSearchManageEvents(savedSearches, events).find((row) => row.id === savedSearchId) || null;
}

// The exact body the public manage page reads. It carries the criteria, the
// frequency, the channel and the status — and never the stored contact values,
// only masked echoes of the visitor's own channels.
export function savedSearchManagePayload(
  record,
  { contact = null, contactState = "not_configured", linkExpiresAt = null, now = new Date().toISOString() } = {},
) {
  const available = contact ? reachableContactChannels(contact) : [];
  const lastAlertAt = record.last_alert_queued_at || record.saved_at;
  const nextAlertAt =
    record.status === "active"
      ? new Date(Date.parse(lastAlertAt) + savedSearchAlertWindowMs(record.alert_frequency)).toISOString()
      : null;
  return {
    kind: "saved_search_manage",
    saved_search: {
      id: record.id,
      saved_at: record.saved_at,
      updated_at: record.updated_at || record.saved_at,
      status: record.status || "active",
      locale: record.locale,
      requested_locale: record.requested_locale,
      fallback_used: record.fallback_used === true,
      query: record.query || "",
      filters: record.filters || {},
      search_intent: record.search_intent || null,
      alert_frequency: record.alert_frequency,
      contact_preference: record.contact_preference || null,
      match_count: Number(record.match_count || 0),
      last_alert_queued_at: record.last_alert_queued_at || null,
      next_alert_at: nextAlertAt,
      alerts_queued: Number(record.alerts_queued || 0),
    },
    contact: {
      state: contact ? "available" : contactState,
      channels: contact ? maskedContactChannels(contact) : null,
      available_channels: available,
    },
    options: {
      actions: [...SAVED_SEARCH_MANAGE_ACTIONS],
      frequencies: [...SAVED_SEARCH_FREQUENCIES],
      channels: available.length ? available : [],
    },
    link: { expires_at: linkExpiresAt },
    generated_at: isoTimestamp(now, "now"),
  };
}

// ---- The /api/saved-searches/manage route, as one contract ----------------
//
// Both runtimes serve this route and production only ever runs the App Router
// adapter, so the capability check, the refusal vocabulary and the audit trail
// live here rather than in either dispatcher. Callers supply the ledgers and an
// audit sink; everything decided about the visitor's link is decided below.
//
// Every refusal returns the same generic answer, so the route cannot be used to
// probe whether a given saved search exists.

// Resolves a presented token to the stored record, or throws the single
// generic refusal.
function manageState(token, { secret, records, now }) {
  if (!secret) throw new SavedSearchLinkRefusedError("secret_unavailable");
  const presented = readSavedSearchAccessToken(token, { secret, now });
  const record = records.find((row) => row.id === presented.record_id) || null;
  // A deleted or unknown record is refused exactly like a forged token.
  assertSavedSearchAccess(record, presented);
  return { record, presented };
}

function manageBody(record, presented, { contacts, contactState, now }) {
  return savedSearchManagePayload(record, {
    contact: contacts?.get(record.id)?.contact || null,
    contactState,
    linkExpiresAt: presented.expires_at,
    now,
  });
}

const AUDIT_ACTIONS = Object.freeze({
  pause: "saved_search_paused",
  resume: "saved_search_resumed",
  update_frequency: "saved_search_frequency_updated",
  update_channel: "saved_search_channel_updated",
  delete: "saved_search_deleted",
});

// Returns { status, body }. `readRecords` returns the current projection with
// alert state folded in — it is called again after a change is written, because
// the answer must describe the stored state, not the snapshot we started from.
// `contacts` is the saved-search contact map (or null when the vault is
// unreadable), and `contactState` says which of those it is.
export function savedSearchManageRouteResponse({
  method,
  token,
  input = {},
  secret = null,
  readRecords = () => [],
  contacts = null,
  contactState = "not_configured",
  manageEventLedgerPath = null,
  now = new Date().toISOString(),
  recordAudit = () => {},
} = {}) {
  const refusal = { status: 404, body: { ...SAVED_SEARCH_LINK_REFUSAL } };
  const contactContext = { contacts, contactState, now };

  if (method === "GET") {
    try {
      const { record, presented } = manageState(token, { secret, records: readRecords(), now });
      return { status: 200, body: manageBody(record, presented, contactContext) };
    } catch (error) {
      if (error instanceof SavedSearchLinkRefusedError) return refusal;
      return { status: 400, body: { kind: "bad_request", message: error.message } };
    }
  }
  if (method !== "POST") return { status: 405, body: { kind: "method_not_allowed" } };

  let record;
  let presented;
  try {
    ({ record, presented } = manageState(input.token, { secret, records: readRecords(), now }));
  } catch (error) {
    if (error instanceof SavedSearchLinkRefusedError) return refusal;
    return { status: 400, body: { kind: "bad_request", message: error.message } };
  }
  if (!manageEventLedgerPath) {
    return {
      status: 503,
      body: {
        kind: "saved_search_manage_unavailable",
        message: "Saved search changes are unavailable because their storage is not configured.",
      },
    };
  }
  try {
    const event = normalizeSavedSearchManageEvent({ ...input, savedSearchId: record.id }, now);
    const contact = contacts?.get(record.id)?.contact || null;
    if (event.action === "update_channel") {
      // Fail closed: without the vault we cannot prove the requested channel is
      // one the visitor actually gave us.
      if (!contact) {
        return {
          status: 409,
          body: {
            kind: "saved_search_channel_unverifiable",
            message: "The stored contact channels cannot be read, so the alert channel cannot be changed.",
          },
        };
      }
      if (!reachableContactChannels(contact).includes(event.channel)) {
        return {
          status: 400,
          body: {
            kind: "bad_request",
            message: "channel must be one of the contact channels supplied with this saved search",
          },
        };
      }
    }
    const currentStatus = record.status || "active";
    const unchanged =
      (event.action === "pause" && currentStatus === "paused") ||
      (event.action === "resume" && currentStatus === "active") ||
      (event.action === "update_frequency" && record.alert_frequency === event.frequency) ||
      (event.action === "update_channel" && record.contact_preference === event.channel);
    if (unchanged) {
      return {
        status: 200,
        body: { ...manageBody(record, presented, contactContext), action: event.action, idempotent: true },
      };
    }
    appendSavedSearchManageEvent(event, { filePath: manageEventLedgerPath });
    // Every mutation is audited. The actor is the capability link, not an
    // operator, and the metadata carries no contact data.
    recordAudit(
      {
        action: AUDIT_ACTIONS[event.action],
        actor: "saved_search_link",
        objectType: "saved_search",
        objectId: record.id,
        locale: record.locale,
        status: event.action === "delete" ? "deleted" : "recorded",
        metadata: {
          source: "manage_link",
          action: event.action,
          ...(event.frequency ? { alert_frequency: event.frequency } : {}),
          ...(event.channel ? { channel: event.channel } : {}),
        },
      },
      now,
    );
    if (event.action === "delete") {
      return {
        status: 200,
        body: {
          kind: "saved_search_manage",
          action: "delete",
          deleted: true,
          saved_search: null,
          idempotent: false,
          message: "This saved search is deleted and its alerts have stopped. The manage link no longer works.",
        },
      };
    }
    // Re-read: the projection has to include the event just written.
    const updated = applySavedSearchManageEvents(readRecords(), []).find((row) => row.id === record.id) || record;
    return {
      status: 200,
      body: { ...manageBody(updated, presented, contactContext), action: event.action, idempotent: false },
    };
  } catch (error) {
    if (error instanceof SavedSearchLinkRefusedError) return refusal;
    return { status: 400, body: { kind: "bad_request", message: error.message } };
  }
}

export function assertSavedSearchManageEvents(rows) {
  if (!Array.isArray(rows)) throw new Error("Saved search manage events must be an array");
  const ids = new Set();
  for (const row of rows) {
    if (!row.id || ids.has(row.id)) throw new Error("Saved search manage event ids must be present and unique");
    ids.add(row.id);
    if (!ACTIONS.has(row.action) || !row.saved_search_id || !row.actor) {
      throw new Error("Saved search manage event is missing routing data");
    }
    if (!row.recorded_at || Number.isNaN(Date.parse(row.recorded_at))) {
      throw new Error("Saved search manage event must include recorded_at");
    }
    if (row.action === "update_frequency" && !FREQUENCIES.has(row.frequency)) {
      throw new Error("Saved search frequency change must store a known frequency");
    }
    if (row.action === "update_channel" && !CHANNELS.has(row.channel)) {
      throw new Error("Saved search channel change must store a known channel");
    }
    if (row.contact || row.email || row.phone || row.whatsapp || row.viber || row.token || row.verifier) {
      throw new Error("Saved search manage events must not store contact data or link secrets");
    }
  }
  return true;
}
