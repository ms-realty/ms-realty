import { fromRoot } from "./paths.mjs";
import { createLedgerStore } from "./sqlite-ledger.mjs";

export const DEFAULT_EVENT_LEDGER_PATH = fromRoot("production", "data", "events.jsonl");

const store = createLedgerStore({
  name: "events",
  columns: ["recorded_at", "type", "path", "locale", "listing_reference", "action"],
  indexes: ["type", "recorded_at"],
});

const EVENT_TYPES = new Set(["page_view", "search", "lead_submitted", "cta_click"]);
const FORBIDDEN_KEYS = new Set(["contact", "message", "email", "phone", "name"]);
const PUBLIC_FILTER_KEYS = new Set([
  "location",
  "country_code",
  "geography_id",
  "region_id",
  "municipality",
  "district",
  "property_family",
  "property_type",
  "offer_type",
  "status",
  "price_min",
  "price_max",
  "bedrooms_min",
  "bedrooms_max",
  "premises_min",
  "hotel_rooms_min",
  "area_min",
  "area_max",
  "land_area_min",
  "land_area_max",
  "floor_min",
  "floor_max",
  "storeys_min",
  "storeys_max",
  "exact_reference",
]);

function scrubText(value, maxLength = 120) {
  return String(value || "")
    .slice(0, maxLength)
    .replace(/[^\s@]+@[^\s@]+/g, "[redacted-email]")
    .replace(/\+?\d[\d\s().-]{6,}\d/g, "[redacted-phone]");
}

function hasForbiddenKey(value) {
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([key, child]) => FORBIDDEN_KEYS.has(key.toLowerCase()) || hasForbiddenKey(child));
}

function safeFilters(filters = {}) {
  return Object.fromEntries(
    Object.entries(filters)
      .filter(([key, value]) => PUBLIC_FILTER_KEYS.has(key) && ["string", "number", "boolean"].includes(typeof value))
      .map(([key, value]) => [key, scrubText(value)]),
  );
}

export function resetEventLedger(filePath = DEFAULT_EVENT_LEDGER_PATH) {
  store.resetLedger(filePath);
}

export function readEventLedger(filePath = DEFAULT_EVENT_LEDGER_PATH) {
  return store.readRows(filePath);
}

export function createEvent(input, recordedAt = new Date().toISOString()) {
  if (hasForbiddenKey(input)) throw new Error("Analytics events must not include contact or message data");
  const type = String(input.type || "").trim();
  if (!EVENT_TYPES.has(type)) throw new Error(`Unsupported analytics event type: ${type}`);
  const eventPath = String(input.path || "/").trim();
  if (!eventPath.startsWith("/") || eventPath.startsWith("//")) throw new Error("Analytics event path must be local");
  if (eventPath.length > 500) throw new Error("Analytics event path is too long");
  if (type === "cta_click" && !input.action) throw new Error("CTA click events require an action");
  const locale = String(input.locale || "bg").trim();
  if (!locale || locale.length > 12) throw new Error("Analytics event locale is invalid");
  return {
    recorded_at: recordedAt,
    type,
    path: eventPath,
    locale,
    listing_reference: input.listingReference || input.listing_reference ? scrubText(input.listingReference || input.listing_reference, 160) : null,
    action: input.action === undefined ? null : scrubText(input.action),
    query: input.query === undefined ? null : scrubText(input.query),
    filters: safeFilters(input.filters),
    sort: input.sort === undefined ? null : scrubText(input.sort),
    page: Number.isInteger(Number(input.page)) && Number(input.page) > 0 ? Number(input.page) : null,
  };
}

export function appendEvent(event, { filePath = DEFAULT_EVENT_LEDGER_PATH } = {}) {
  store.appendRow(filePath, event);
  return event;
}

export function assertEventLedger(rows) {
  if (!rows.length) throw new Error("Event ledger must contain at least one row");
  for (const row of rows) {
    if (!EVENT_TYPES.has(row.type) || !row.path?.startsWith("/") || !row.locale) {
      throw new Error("Event ledger row is missing required routing fields");
    }
    if (hasForbiddenKey(row)) throw new Error("Event ledger row must not store contact or message data");
  }
  return true;
}
