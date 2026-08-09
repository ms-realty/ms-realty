import fs from "node:fs";
import path from "node:path";
import { normalizeLeadInput } from "./leads.mjs";
import { resolvePublicLocale } from "./locales.mjs";
import { fromRoot } from "./paths.mjs";
import { findByIdempotencyKey, newRecordId, normalizeIdempotencyKey } from "./record-ids.mjs";
import { searchIntentToQueryFilters } from "./search-intent.mjs";
import { normalizeSearchRequest } from "./search-request.mjs";

export const DEFAULT_SAVED_SEARCH_LEDGER_PATH = fromRoot("production", "data", "saved-searches.jsonl");

const FREQUENCIES = new Set(["instant", "daily", "weekly"]);
const CONTACT_PREFERENCES = new Set(["email", "phone", "whatsapp", "viber"]);
const BCP47 = /^[a-z]{2,3}(-[A-Z]{2})?$/;

function truthy(value) {
  return value === true || value === "true" || value === "1" || value === "on";
}

function reachableChannels(contact = {}) {
  return ["email", "phone", "whatsapp", "viber"].filter((field) => Boolean(String(contact[field] || "").trim()));
}

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

export function savedSearchIntent(registry, input) {
  const savedSearchInput = normalizeSavedSearchInput(input);
  return normalizeSearchRequest(
    {
      locale: savedSearchInput.locale || registry.source_locale,
      query: savedSearchInput.query,
      filters: savedSearchInput.filters,
      search_intent: savedSearchInput.search_intent || savedSearchInput.searchIntent || savedSearchInput.intent,
    },
    { defaultLocale: registry.source_locale },
  ).intent;
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
  const searchIntent = savedSearchIntent(registry, savedSearchInput);
  const query = searchIntent.text_query;
  const filters = Object.fromEntries(
    Object.entries(searchIntentToQueryFilters(searchIntent)).filter(
      ([key, value]) => key !== "property_family" && value !== "" && value !== null && value !== undefined,
    ),
  );
  if (!query && !Object.keys(filters).length) throw new Error("query or filters are required");
  if (!savedSearchInput.contact?.name) throw new Error("contact.name is required");
  const channels = reachableChannels(savedSearchInput.contact);
  if (!channels.length) throw new Error("Saved search alerts require an email, phone, WhatsApp, or Viber contact");
  if (!truthy(savedSearchInput.alertConsent || savedSearchInput.alert_consent)) {
    throw new Error("Saved search alert consent is required");
  }
  const requestedLocale = savedSearchInput.locale || registry.source_locale;
  if (!BCP47.test(requestedLocale)) throw new Error("locale must be a BCP 47 language code");
  const resolved = resolvePublicLocale(registry, requestedLocale);
  const frequency = savedSearchInput.alertFrequency || "weekly";
  if (!FREQUENCIES.has(frequency)) throw new Error("alertFrequency must be instant, daily, or weekly");
  const contactPreference = String(
    savedSearchInput.contact_preference || savedSearchInput.contactPreference || channels[0],
  ).toLowerCase();
  if (!CONTACT_PREFERENCES.has(contactPreference) || !channels.includes(contactPreference)) {
    throw new Error("contact_preference must identify a supplied contact channel");
  }

  return {
    saved_at: savedAt,
    id: newRecordId("saved-search"),
    idempotency_key: normalizeIdempotencyKey(savedSearchInput.idempotencyKey ?? savedSearchInput.idempotency_key),
    requested_locale: requestedLocale,
    locale: resolved.locale.code,
    fallback_used: !resolved.available,
    query,
    filters,
    search_intent: searchIntent,
    contact: savedSearchInput.contact,
    contact_preference: contactPreference,
    alert_consent: true,
    match_count: matchCount,
    price_snapshot: normalizePriceSnapshot(savedSearchInput.priceSnapshot || savedSearchInput.price_snapshot),
    alert_frequency: frequency,
    status: "active",
    alert_task: {
      id: newRecordId("alert"),
      status: "open",
      owner: savedSearchInput.owner || "broker_en",
    },
  };
}

export function privacySafeSavedSearch(search) {
  const { contact, ...safe } = search;
  return {
    ...safe,
    contact_ref: search.id,
    contact_available: reachableChannels(contact).length > 0,
  };
}

export function appendSavedSearch(search, { filePath = DEFAULT_SAVED_SEARCH_LEDGER_PATH } = {}) {
  // A retried submission carrying the same idempotency key returns the
  // original record instead of appending a duplicate saved search.
  const existing = findByIdempotencyKey(readSavedSearches(filePath), search.idempotency_key);
  if (existing) return existing;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(search)}\n`);
  return search;
}

export function assertSavedSearches(rows) {
  if (!rows.length) throw new Error("Saved search ledger must contain at least one row");
  for (const row of rows) {
    if (!row.id || !row.locale || row.contact_available !== true || row.contact_ref !== row.id) {
      throw new Error("Saved search row is missing private contact routing or locale data");
    }
    if (row.contact || row.email || row.phone || row.whatsapp || row.viber) {
      throw new Error("Saved search ledger must not store raw contact data");
    }
    if (!CONTACT_PREFERENCES.has(row.contact_preference)) throw new Error("Saved search row has invalid contact preference");
    if (row.alert_consent !== true) throw new Error("Saved search row must preserve explicit alert consent");
    if (row.status !== "active") throw new Error("Saved search must stay active");
    if (row.alert_task?.status !== "open") throw new Error("Saved search must create an open alert task");
    if (!FREQUENCIES.has(row.alert_frequency)) throw new Error("Saved search has invalid alert frequency");
    if (!row.search_intent || row.search_intent.schema_version !== 1) {
      throw new Error("Saved search must store a versioned SearchIntent");
    }
  }
  return true;
}
