import fs from "node:fs";
import path from "node:path";
import { fromRoot } from "./paths.mjs";

export const DEFAULT_EVENT_LEDGER_PATH = fromRoot("production", "data", "events.jsonl");

const EVENT_TYPES = new Set(["page_view", "search", "lead_submitted", "cta_click", "hermes_chat"]);
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
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "");
}

export function readEventLedger(filePath = DEFAULT_EVENT_LEDGER_PATH) {
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
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
  };
}

export function appendEvent(event, { filePath = DEFAULT_EVENT_LEDGER_PATH } = {}) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(event)}\n`);
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
