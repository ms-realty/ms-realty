import fs from "node:fs";
import path from "node:path";
import { normalizeLeadInput } from "./leads.mjs";
import { resolvePublicLocale } from "./locales.mjs";
import { fromRoot } from "./paths.mjs";

export const DEFAULT_SAVED_SEARCH_LEDGER_PATH = fromRoot("production", "data", "saved-searches.jsonl");

const FREQUENCIES = new Set(["instant", "daily", "weekly"]);
const BCP47 = /^[a-z]{2,3}(-[A-Z]{2})?$/;

function normalizePriceSnapshot(snapshot = {}) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return {};
  return Object.fromEntries(
    Object.entries(snapshot)
      .map(([id, price]) => [id, Number(price)])
      .filter(([id, price]) => id && Number.isFinite(price)),
  );
}

function normalizeFilters(filters) {
  if (filters === undefined || filters === null || filters === "") return {};
  if (typeof filters !== "string") return filters;
  try {
    return JSON.parse(filters);
  } catch {
    throw new Error("filters must be valid JSON");
  }
}

export function normalizeSavedSearchInput(input = {}) {
  const normalized = normalizeLeadInput(input);
  return {
    ...normalized,
    locale: normalized.locale || normalized.language,
    filters: normalizeFilters(normalized.filters),
  };
}

export function resetSavedSearches(filePath = DEFAULT_SAVED_SEARCH_LEDGER_PATH) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "");
}

export function readSavedSearches(filePath = DEFAULT_SAVED_SEARCH_LEDGER_PATH) {
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export function createSavedSearch(registry, input, { matchCount = 0, savedAt = new Date().toISOString() } = {}) {
  const savedSearchInput = normalizeSavedSearchInput(input);
  const query = String(savedSearchInput.query || "").trim();
  const filters = savedSearchInput.filters || {};
  if (typeof filters !== "object" || Array.isArray(filters)) throw new Error("filters must be an object");
  if (!query && !Object.keys(filters).length) throw new Error("query or filters are required");
  if (!savedSearchInput.contact?.name) throw new Error("contact.name is required");
  const requestedLocale = savedSearchInput.locale || registry.source_locale;
  if (!BCP47.test(requestedLocale)) throw new Error("locale must be a BCP 47 language code");
  const resolved = resolvePublicLocale(registry, requestedLocale);
  const frequency = savedSearchInput.alertFrequency || "weekly";
  if (!FREQUENCIES.has(frequency)) throw new Error("alertFrequency must be instant, daily, or weekly");

  return {
    saved_at: savedAt,
    id: savedSearchInput.id || `saved-search-${requestedLocale}-${Date.parse(savedAt)}`,
    requested_locale: requestedLocale,
    locale: resolved.locale.code,
    fallback_used: !resolved.available,
    query,
    filters,
    contact: savedSearchInput.contact,
    match_count: matchCount,
    price_snapshot: normalizePriceSnapshot(savedSearchInput.priceSnapshot || savedSearchInput.price_snapshot),
    alert_frequency: frequency,
    status: "active",
    alert_task: {
      id: savedSearchInput.taskId || `alert-${requestedLocale}-${Date.parse(savedAt)}`,
      status: "open",
      owner: savedSearchInput.owner || "broker_en",
    },
  };
}

export function appendSavedSearch(search, { filePath = DEFAULT_SAVED_SEARCH_LEDGER_PATH } = {}) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(search)}\n`);
  return search;
}

export function assertSavedSearches(rows) {
  if (!rows.length) throw new Error("Saved search ledger must contain at least one row");
  for (const row of rows) {
    if (!row.id || !row.locale || !row.contact?.name) throw new Error("Saved search row is missing contact or locale data");
    if (row.status !== "active") throw new Error("Saved search must stay active");
    if (row.alert_task?.status !== "open") throw new Error("Saved search must create an open alert task");
    if (!FREQUENCIES.has(row.alert_frequency)) throw new Error("Saved search has invalid alert frequency");
  }
  return true;
}
