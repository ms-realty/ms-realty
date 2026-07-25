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

function scrubText(value) {
  return String(value || "")
    .slice(0, 120)
    .replace(/[^\s@]+@[^\s@]+/g, "[redacted-email]")
    .replace(/\+?\d[\d\s().-]{6,}\d/g, "[redacted-phone]");
}

function hasForbiddenKey(value) {
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([key, child]) => FORBIDDEN_KEYS.has(key) || hasForbiddenKey(child));
}

function safeFilters(filters = {}) {
  return Object.fromEntries(
    Object.entries(filters)
      .filter(([key, value]) => !FORBIDDEN_KEYS.has(key) && ["string", "number", "boolean"].includes(typeof value))
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
  if (type === "cta_click" && !input.action) throw new Error("CTA click events require an action");
  return {
    recorded_at: recordedAt,
    type,
    path: eventPath,
    locale: String(input.locale || "bg").trim(),
    listing_reference: input.listingReference || input.listing_reference || null,
    action: input.action || null,
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
