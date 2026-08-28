import fs from "node:fs";
import path from "node:path";
import { fromRoot } from "./paths.mjs";

export const DEFAULT_PUBLIC_REQUEST_OUTCOME_LEDGER_PATH = fromRoot(
  "production",
  "data",
  "public-request-outcomes.jsonl",
);

const REQUEST_TYPES = new Set(["saved_search", "language_request", "viewing_trip"]);
// Each request type carries its own outcome vocabulary. A viewing trip is
// arranged over several steps that a saved search does not have, so it gets
// its own verbs rather than being squeezed into "contacted / complete".
export const PUBLIC_REQUEST_ACTIONS = Object.freeze({
  saved_search: Object.freeze(["contacted", "complete", "close", "reopen", "note"]),
  language_request: Object.freeze(["contacted", "complete", "close", "reopen", "note"]),
  viewing_trip: Object.freeze([
    "contacted",
    "itinerary_drafted",
    "trip_confirmed",
    "trip_completed",
    "close",
    "reopen",
    "note",
  ]),
});
const ACTIONS = new Set(Object.values(PUBLIC_REQUEST_ACTIONS).flat());
// Where each verb leaves the request.
const ACTION_STATUS = Object.freeze({
  contacted: "contacted",
  itinerary_drafted: "itinerary_drafted",
  trip_confirmed: "trip_confirmed",
  trip_completed: "completed",
  complete: "completed",
  close: "closed",
  reopen: "open",
});
const TERMINAL_STATUSES = new Set(["completed", "closed"]);
// Verbs that must say what happened before they end or park a request.
const NOTE_REQUIRED_ACTIONS = new Set(["complete", "close", "trip_completed"]);

export function publicRequestActions(requestType) {
  return [...(PUBLIC_REQUEST_ACTIONS[requestType] || PUBLIC_REQUEST_ACTIONS.saved_search)];
}

function isoTimestamp(value, label) {
  const text = String(value || "").trim();
  if (!text || Number.isNaN(Date.parse(text))) throw new Error(`${label} must be an ISO timestamp`);
  return new Date(text).toISOString();
}

function optionalNote(value) {
  const note = String(value || "").trim();
  if (note.length > 2000) throw new Error("Public request outcome note must be 2000 characters or fewer");
  return note || null;
}

function requestKey(requestType, requestId) {
  return `${requestType}:${requestId}`;
}

function frequencyDueAt(savedAt, frequency) {
  const offsets = { instant: 0, daily: 24 * 60 * 60 * 1000, weekly: 7 * 24 * 60 * 60 * 1000 };
  return new Date(Date.parse(savedAt) + (offsets[frequency] ?? offsets.weekly)).toISOString();
}

function contactFor(contactMaps, requestType, requestId) {
  const payload = contactMaps?.[requestType]?.get(requestId) || null;
  return {
    contact: payload?.contact || null,
    contact_preference: payload?.contact_preference || null,
    message: payload?.message || null,
  };
}

function savedSearchState(row, contactMaps, contactVaultStatus) {
  const privatePayload = contactFor(contactMaps, "saved_search", row.id);
  return {
    request_type: "saved_search",
    request_id: row.id,
    created_at: row.saved_at,
    requested_locale: row.requested_locale,
    locale: row.locale,
    owner: "unassigned",
    status: "open",
    query: row.query || "",
    filters: row.filters || {},
    alert_frequency: row.alert_frequency,
    match_count: Number(row.match_count || 0),
    requested_path: null,
    fallback_locale: null,
    contact_preference: privatePayload.contact_preference || row.contact_preference || null,
    contact: privatePayload.contact,
    message: privatePayload.message,
    contact_state: privatePayload.contact ? "available" : contactVaultStatus,
    next_follow_up_at: frequencyDueAt(row.saved_at, row.alert_frequency),
    last_action: null,
    last_recorded_at: null,
    note_count: 0,
  };
}

function languageRequestState(row, contactMaps, contactVaultStatus) {
  const privatePayload = contactFor(contactMaps, "language_request", row.id);
  return {
    request_type: "language_request",
    request_id: row.id,
    created_at: row.requested_at,
    requested_locale: row.requested_locale,
    locale: row.fallback_locale,
    owner: "unassigned",
    status: "open",
    query: "",
    filters: {},
    alert_frequency: null,
    match_count: null,
    requested_path: row.requested_path,
    fallback_locale: row.fallback_locale,
    contact_preference: privatePayload.contact_preference || null,
    contact: privatePayload.contact,
    message: privatePayload.message,
    contact_state: privatePayload.contact ? "available" : contactVaultStatus,
    next_follow_up_at: new Date(Date.parse(row.requested_at) + 24 * 60 * 60 * 1000).toISOString(),
    last_action: null,
    last_recorded_at: null,
    note_count: 0,
  };
}

function viewingTripState(row, contactMaps, contactVaultStatus) {
  const privatePayload = contactFor(contactMaps, "viewing_trip", row.id);
  return {
    request_type: "viewing_trip",
    request_id: row.id,
    created_at: row.requested_at,
    requested_locale: row.requested_locale,
    locale: row.locale,
    owner: "unassigned",
    status: "open",
    query: "",
    filters: {},
    alert_frequency: null,
    match_count: row.listing_references?.length ?? 0,
    requested_path: null,
    fallback_locale: row.fallback_used ? row.locale : null,
    contact_preference: privatePayload.contact_preference || row.contact_preference || null,
    contact: privatePayload.contact,
    message: privatePayload.message,
    contact_state: privatePayload.contact ? "available" : contactVaultStatus,
    // The trip arrives before the visitor does; the first follow-up is the day
    // after it lands, never later than the day before arrival.
    next_follow_up_at: new Date(
      Math.min(Date.parse(row.requested_at) + 24 * 60 * 60 * 1000, Date.parse(`${row.arrival_date}T00:00:00.000Z`)),
    ).toISOString(),
    trip: {
      arrival_date: row.arrival_date,
      departure_date: row.departure_date,
      nights: row.nights ?? null,
      areas: row.areas || [],
      listing_references: row.listing_references || [],
      party_size: row.party_size ?? null,
      note: row.note || null,
      confirmation: row.confirmation || "human_required",
    },
    last_action: null,
    last_recorded_at: null,
    note_count: 0,
  };
}

function applyOutcome(state, outcome) {
  state.last_action = outcome.action;
  state.last_recorded_at = outcome.recorded_at;
  if (outcome.action === "note") {
    state.note_count += 1;
    return;
  }
  const status = ACTION_STATUS[outcome.action];
  if (status) state.status = status;
  state.next_follow_up_at = TERMINAL_STATUSES.has(state.status) ? null : outcome.next_follow_up_at;
}

export function derivePublicRequestStates(
  savedSearches = [],
  languageRequests = [],
  outcomes = [],
  { contactMaps = {}, contactVaultStatus = "not_configured", viewingTrips = [] } = {},
) {
  const states = new Map([
    ...savedSearches.map((row) => {
      const state = savedSearchState(row, contactMaps, contactVaultStatus);
      return [requestKey(state.request_type, state.request_id), state];
    }),
    ...languageRequests.map((row) => {
      const state = languageRequestState(row, contactMaps, contactVaultStatus);
      return [requestKey(state.request_type, state.request_id), state];
    }),
    ...viewingTrips.map((row) => {
      const state = viewingTripState(row, contactMaps, contactVaultStatus);
      return [requestKey(state.request_type, state.request_id), state];
    }),
  ]);
  for (const outcome of outcomes) {
    const state = states.get(requestKey(outcome.request_type, outcome.request_id));
    if (state) applyOutcome(state, outcome);
  }
  return [...states.values()];
}

export function buildPublicRequestQueue({
  savedSearches = [],
  languageRequests = [],
  outcomes = [],
  contactMaps = {},
  contactVaultStatus = "not_configured",
  viewingTrips = [],
  now = new Date().toISOString(),
} = {}) {
  const nowTime = Date.parse(now);
  if (!Number.isFinite(nowTime)) throw new Error("now must be an ISO timestamp");
  const states = derivePublicRequestStates(savedSearches, languageRequests, outcomes, {
    contactMaps,
    contactVaultStatus,
    viewingTrips,
  });
  const rows = states
    .filter((state) => !TERMINAL_STATUSES.has(state.status))
    .map((state) => ({
      ...state,
      overdue: Boolean(state.next_follow_up_at) && Date.parse(state.next_follow_up_at) < nowTime,
    }))
    .sort((left, right) => {
      if (left.overdue !== right.overdue) return left.overdue ? -1 : 1;
      return Date.parse(left.next_follow_up_at || "9999-12-31") - Date.parse(right.next_follow_up_at || "9999-12-31");
    });
  return {
    rows,
    states,
    contact_vault_status: contactVaultStatus,
    summary: {
      total: states.length,
      open: rows.length,
      overdue: rows.filter((row) => row.overdue).length,
      contacted: states.filter((state) => state.status === "contacted").length,
      completed: states.filter((state) => state.status === "completed").length,
      closed: states.filter((state) => state.status === "closed").length,
      saved_search_open: rows.filter((row) => row.request_type === "saved_search").length,
      language_request_open: rows.filter((row) => row.request_type === "language_request").length,
      viewing_trip_open: rows.filter((row) => row.request_type === "viewing_trip").length,
      contacts_available: states.filter((state) => state.contact).length,
    },
  };
}

export function resetPublicRequestOutcomes(filePath = DEFAULT_PUBLIC_REQUEST_OUTCOME_LEDGER_PATH) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "");
}

export function readPublicRequestOutcomes(filePath = DEFAULT_PUBLIC_REQUEST_OUTCOME_LEDGER_PATH) {
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function normalizedOutcomeInput(state, input, recordedAt) {
  const action = String(input.action || "").trim();
  const allowed = publicRequestActions(state.request_type);
  if (!allowed.includes(action)) {
    throw new Error(`Public request action for a ${state.request_type} must be one of: ${allowed.join(", ")}`);
  }
  const actor = String(input.actor || input.broker || "").trim();
  if (!actor) throw new Error("Public request outcome actor is required");
  const note = optionalNote(input.note);
  if (NOTE_REQUIRED_ACTIONS.has(action) && !note) throw new Error(`${action} requires an outcome note`);
  const recorded = isoTimestamp(recordedAt, "recordedAt");
  const suppliedNext = input.nextFollowUpAt || input.next_follow_up_at;
  const nextFollowUpAt = TERMINAL_STATUSES.has(ACTION_STATUS[action] || "") || action === "note"
    ? null
    : suppliedNext
      ? isoTimestamp(suppliedNext, "nextFollowUpAt")
      : new Date(Date.parse(recorded) + 24 * 60 * 60 * 1000).toISOString();
  if (nextFollowUpAt && Date.parse(nextFollowUpAt) <= Date.parse(recorded)) {
    throw new Error("nextFollowUpAt must be after recordedAt");
  }
  return {
    id: input.id ? String(input.id).trim() : null,
    request_type: state.request_type,
    request_id: state.request_id,
    actor,
    action,
    note,
    next_follow_up_at: nextFollowUpAt,
    recorded_at: recorded,
  };
}

function sameOutcome(left, right) {
  return (
    left.request_type === right.request_type &&
    left.request_id === right.request_id &&
    left.actor === right.actor &&
    left.action === right.action &&
    (left.note || null) === (right.note || null) &&
    (left.next_follow_up_at || null) === (right.next_follow_up_at || null)
  );
}

function assertTransition(state, outcome) {
  if (outcome.action === "note") return;
  if (outcome.action === "reopen") {
    if (!TERMINAL_STATUSES.has(state.status)) throw new Error("Only a completed or closed public request can be reopened");
    return;
  }
  if (TERMINAL_STATUSES.has(state.status)) throw new Error("Public request is already closed");
}

function nextOutcomeId(rows, requestType, requestId) {
  let ordinal = rows.filter((row) => row.request_type === requestType && row.request_id === requestId).length + 1;
  const knownIds = new Set(rows.map((row) => row.id));
  let id = `public-request-${requestType}-${requestId}-${ordinal}`;
  while (knownIds.has(id)) {
    ordinal += 1;
    id = `public-request-${requestType}-${requestId}-${ordinal}`;
  }
  return id;
}

export function appendPublicRequestOutcome(
  { savedSearches = [], languageRequests = [], viewingTrips = [] },
  input,
  { filePath = DEFAULT_PUBLIC_REQUEST_OUTCOME_LEDGER_PATH, recordedAt = new Date().toISOString() } = {},
) {
  const requestType = String(input.requestType || input.request_type || "").trim();
  const requestId = String(input.requestId || input.request_id || "").trim();
  if (!REQUEST_TYPES.has(requestType) || !requestId) throw new Error("Known public request type and id are required");
  const rows = readPublicRequestOutcomes(filePath);
  const state = derivePublicRequestStates(savedSearches, languageRequests, rows, { viewingTrips }).find(
    (candidate) => candidate.request_type === requestType && candidate.request_id === requestId,
  );
  if (!state) throw new Error("Known public request type and id are required");
  const outcome = normalizedOutcomeInput(state, input, recordedAt);
  const existing = outcome.id
    ? rows.find((row) => row.id === outcome.id)
    : [...rows].reverse().find((row) => outcome.action !== "note" && sameOutcome(row, outcome));
  if (existing) {
    if (!sameOutcome(existing, outcome)) throw new Error("Public request outcome id already belongs to a different action");
    return { outcome: existing, request: state, idempotent: true };
  }
  assertTransition(state, outcome);
  outcome.id ||= nextOutcomeId(rows, requestType, requestId);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(outcome)}\n`);
  const updated = derivePublicRequestStates(savedSearches, languageRequests, [...rows, outcome], { viewingTrips }).find(
    (candidate) => candidate.request_type === requestType && candidate.request_id === requestId,
  );
  return { outcome, request: updated, idempotent: false };
}

export function assertPublicRequestOutcomes(rows) {
  if (!rows.length) throw new Error("Public request outcome ledger must contain at least one row");
  const ids = new Set();
  for (const row of rows) {
    if (!row.id || ids.has(row.id)) throw new Error("Public request outcome ids must be present and unique");
    ids.add(row.id);
    if (!REQUEST_TYPES.has(row.request_type) || !row.request_id || !ACTIONS.has(row.action) || !row.actor) {
      throw new Error("Public request outcome row is missing routing data");
    }
    if (!publicRequestActions(row.request_type).includes(row.action)) {
      throw new Error(`${row.action} is not part of the ${row.request_type} outcome vocabulary`);
    }
    if (!row.recorded_at || Number.isNaN(Date.parse(row.recorded_at))) {
      throw new Error("Public request outcome row must include recorded_at");
    }
    if (row.contact || row.email || row.phone || row.message || row.whatsapp || row.viber) {
      throw new Error("Public request outcome ledger must not store raw contact fields");
    }
  }
  return true;
}
