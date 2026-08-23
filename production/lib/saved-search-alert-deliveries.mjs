// The last leg of the saved-search alert path: a due saved search with
// something to say becomes a broker-visible delivery record.
//
// It is queued, never sent. Nothing customer-facing leaves this system without
// a human, so a delivery lands with status "queued", human_approval_required
// true, and no send timestamp. A broker picks it up on the requests screen and
// sends it through the normal reviewed channel.
//
// The alert content itself comes from production/lib/saved-search-alerts.mjs.
// This module only decides when a search is due, records that the alert was
// raised, and shapes the queue the admin renders.
import fs from "node:fs";
import path from "node:path";
import { fromRoot } from "./paths.mjs";
import { savedSearchAlertWindowMs } from "./saved-search-manage.mjs";

export const DEFAULT_SAVED_SEARCH_ALERT_DELIVERY_LEDGER_PATH = fromRoot(
  "production",
  "data",
  "saved-search-alert-deliveries.jsonl",
);

const ALERT_REASONS = new Set(["new_matches", "price_changes", "new_matches_and_price_changes"]);
const DELIVERY_STATUSES = new Set(["queued"]);
const MAX_SAMPLE_LISTINGS = 5;

function isoTimestamp(value, label) {
  const text = String(value || "").trim();
  if (!text || Number.isNaN(Date.parse(text))) throw new Error(`${label} must be an ISO timestamp`);
  return new Date(text).toISOString();
}

export function readSavedSearchAlertDeliveries(filePath = DEFAULT_SAVED_SEARCH_ALERT_DELIVERY_LEDGER_PATH) {
  if (!filePath || !fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export function resetSavedSearchAlertDeliveries(filePath = DEFAULT_SAVED_SEARCH_ALERT_DELIVERY_LEDGER_PATH) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "");
}

function deliveriesFor(deliveries, savedSearchId) {
  return deliveries.filter((row) => row.saved_search_id === savedSearchId);
}

export function lastQueuedAlertAt(deliveries, savedSearchId) {
  return (
    deliveriesFor(deliveries, savedSearchId)
      .map((row) => row.queued_at)
      .sort()
      .at(-1) || null
  );
}

// Due when the search is active and its frequency window has elapsed since the
// last queued alert (or since it was saved). A search that already has an
// unsent alert waiting is never due again: one person does not get a pile of
// duplicate alerts because a broker has not sent the first one yet.
export function savedSearchAlertDue(record, { deliveries = [], now = new Date().toISOString() } = {}) {
  if (!record || record.status !== "active") return false;
  const rows = deliveriesFor(deliveries, record.id);
  if (rows.some((row) => row.status === "queued")) return false;
  const since = lastQueuedAlertAt(deliveries, record.id) || record.saved_at;
  const readyAt = Date.parse(since) + savedSearchAlertWindowMs(record.alert_frequency);
  return Date.parse(isoTimestamp(now, "now")) >= readyAt;
}

function nextDeliveryId(rows, savedSearchId) {
  const known = new Set(rows.map((row) => row.id));
  let ordinal = deliveriesFor(rows, savedSearchId).length + 1;
  let id = `saved-search-alert-${savedSearchId}-${ordinal}`;
  while (known.has(id)) {
    ordinal += 1;
    id = `saved-search-alert-${savedSearchId}-${ordinal}`;
  }
  return id;
}

export function createSavedSearchAlertDelivery(record, alertRow, { queuedAt = new Date().toISOString(), id = null } = {}) {
  if (!record?.id) throw new Error("Saved search alert delivery requires a saved search");
  if (!ALERT_REASONS.has(String(alertRow?.status || ""))) {
    throw new Error("Saved search alert delivery requires new matches or price changes");
  }
  const newMatchCount = Number(alertRow.new_match_count || 0);
  const priceChangeCount = Number(alertRow.price_change_count || 0);
  if (newMatchCount < 0 || priceChangeCount < 0) throw new Error("Saved search alert counts must not be negative");
  if (!newMatchCount && !priceChangeCount) throw new Error("Saved search alert delivery requires something to report");
  return {
    id: id ? String(id).trim() : null,
    queued_at: isoTimestamp(queuedAt, "queuedAt"),
    saved_search_id: record.id,
    alert_task_id: record.alert_task?.id || null,
    owner: record.alert_task?.owner || "broker_en",
    locale: record.locale,
    requested_locale: record.requested_locale,
    alert_frequency: record.alert_frequency,
    // The channel name only. Contact values stay in the encrypted vault.
    channel: record.contact_preference || null,
    contact_ref: record.id,
    reason: alertRow.status,
    new_match_count: newMatchCount,
    price_change_count: priceChangeCount,
    listing_ids: (alertRow.sample_listing_ids || []).slice(0, MAX_SAMPLE_LISTINGS),
    // Queued for a human. Nothing in this repo sends on its own.
    status: "queued",
    delivery_mode: "manual_human_send",
    human_approval_required: true,
    sent_at: null,
  };
}

export function appendSavedSearchAlertDelivery(
  delivery,
  { filePath = DEFAULT_SAVED_SEARCH_ALERT_DELIVERY_LEDGER_PATH } = {},
) {
  if (!filePath) throw new Error("Saved search alert delivery ledger path is required");
  const rows = readSavedSearchAlertDeliveries(filePath);
  const stored = { ...delivery, id: delivery.id || nextDeliveryId(rows, delivery.saved_search_id) };
  const existing = rows.find((row) => row.id === stored.id);
  if (existing) return existing;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(stored)}\n`);
  return stored;
}

// Turns a saved-search alert report into queued broker work. Returns what was
// queued and what was skipped, so the caller can report honestly instead of
// implying that anything was delivered.
export function queueDueSavedSearchAlerts({
  savedSearches = [],
  alertReport = { rows: [] },
  filePath = DEFAULT_SAVED_SEARCH_ALERT_DELIVERY_LEDGER_PATH,
  deliveries = readSavedSearchAlertDeliveries(filePath),
  queuedAt = new Date().toISOString(),
} = {}) {
  const alertsById = new Map((alertReport.rows || []).map((row) => [row.saved_search_id, row]));
  const known = [...deliveries];
  const queued = [];
  const skipped = [];
  for (const record of savedSearches) {
    // Order matters: a paused search is reported as paused, not as quiet.
    if (record.status !== "active") {
      skipped.push({ saved_search_id: record.id, reason: record.status || "inactive" });
      continue;
    }
    if (deliveriesFor(known, record.id).some((row) => row.status === "queued")) {
      skipped.push({ saved_search_id: record.id, reason: "awaiting_human_send" });
      continue;
    }
    const alertRow = alertsById.get(record.id);
    if (!alertRow || alertRow.status === "no_new_matches") {
      skipped.push({ saved_search_id: record.id, reason: "no_new_matches" });
      continue;
    }
    if (!savedSearchAlertDue(record, { deliveries: known, now: queuedAt })) {
      skipped.push({ saved_search_id: record.id, reason: "not_due" });
      continue;
    }
    const delivery = appendSavedSearchAlertDelivery(
      createSavedSearchAlertDelivery(record, alertRow, { queuedAt, id: nextDeliveryId(known, record.id) }),
      { filePath },
    );
    known.push(delivery);
    queued.push(delivery);
  }
  return {
    queued_at: isoTimestamp(queuedAt, "queuedAt"),
    queued,
    skipped,
    summary: {
      considered: savedSearches.length,
      queued: queued.length,
      skipped: skipped.length,
      delivered: 0,
      delivery_mode: "manual_human_send",
    },
  };
}

// Broker-visible queue, shaped like the other operational queues the admin
// already renders.
export function buildSavedSearchAlertDeliveryQueue({
  savedSearches = [],
  deliveries = [],
  now = new Date().toISOString(),
} = {}) {
  const searchById = new Map(savedSearches.map((row) => [row.id, row]));
  const rows = deliveries
    .filter((row) => row.status === "queued" && searchById.has(row.saved_search_id))
    .map((row) => {
      const record = searchById.get(row.saved_search_id);
      return {
        ...row,
        query: record.query || "",
        filters: record.filters || {},
        saved_search_status: record.status || "active",
        waiting_hours: Math.max(0, Math.round((Date.parse(now) - Date.parse(row.queued_at)) / 3_600_000)),
      };
    })
    .sort((left, right) => Date.parse(left.queued_at) - Date.parse(right.queued_at));
  return {
    rows,
    summary: {
      total: deliveries.length,
      queued: rows.length,
      sent: deliveries.filter((row) => row.status === "sent").length,
      awaiting_human_send: rows.length,
      new_match_alerts: rows.filter((row) => row.new_match_count > 0).length,
      price_change_alerts: rows.filter((row) => row.price_change_count > 0).length,
    },
  };
}

// Folds queued-alert history back onto the saved searches so the manage page
// can tell a visitor when their last alert was raised.
export function withSavedSearchAlertState(savedSearches = [], deliveries = []) {
  return savedSearches.map((record) => {
    const rows = deliveriesFor(deliveries, record.id);
    return {
      ...record,
      alerts_queued: rows.length,
      last_alert_queued_at: lastQueuedAlertAt(deliveries, record.id),
    };
  });
}

export function assertSavedSearchAlertDeliveries(rows) {
  if (!Array.isArray(rows)) throw new Error("Saved search alert deliveries must be an array");
  const ids = new Set();
  for (const row of rows) {
    if (!row.id || ids.has(row.id)) throw new Error("Saved search alert delivery ids must be present and unique");
    ids.add(row.id);
    if (!row.saved_search_id || !row.owner || !ALERT_REASONS.has(row.reason)) {
      throw new Error("Saved search alert delivery is missing routing data");
    }
    if (!DELIVERY_STATUSES.has(row.status) || row.human_approval_required !== true || row.sent_at !== null) {
      throw new Error("Saved search alert deliveries must stay queued for a human sender");
    }
    if (row.delivery_mode !== "manual_human_send") {
      throw new Error("Saved search alert deliveries must not claim automatic delivery");
    }
    if (!row.queued_at || Number.isNaN(Date.parse(row.queued_at))) {
      throw new Error("Saved search alert delivery must include queued_at");
    }
    if (row.contact || row.email || row.phone || row.whatsapp || row.viber || row.message) {
      throw new Error("Saved search alert deliveries must not store raw contact fields");
    }
  }
  return true;
}
