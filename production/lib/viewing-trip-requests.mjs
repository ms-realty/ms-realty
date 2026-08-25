// Viewing-trip requests: a visitor asks for two or three days of viewings.
//
// This is a REQUEST, never a booking. Software in this repo does not commit the
// agency to a date: the record lands in the same admin queue as the other public
// requests (production/lib/public-request-outcomes.mjs) and a human arranges the
// trip. The ledger never stores raw contact data; the contact goes to the public
// contact vault under the record id, exactly as saved searches do.

import fs from "node:fs";
import path from "node:path";
import { assertIsoDate } from "./broker-free-slots.mjs";
import { resolvePublicLocale } from "./locales.mjs";
import { fromRoot } from "./paths.mjs";
import { findByIdempotencyKey, newRecordId, normalizeIdempotencyKey } from "./record-ids.mjs";

export const DEFAULT_VIEWING_TRIP_LEDGER_PATH = fromRoot("production", "data", "viewing-trip-requests.jsonl");

const CONTACT_PREFERENCES = new Set(["email", "phone", "whatsapp", "viber"]);
const BCP47 = /^[a-z]{2,3}(-[A-Z]{2})?$/;
const LISTING_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const MAX_TRIP_NIGHTS = 30;
const MAX_AREAS = 12;
const MAX_SHORTLIST = 25;
const MAX_PARTY_SIZE = 12;

export function resetViewingTripRequests(filePath = DEFAULT_VIEWING_TRIP_LEDGER_PATH) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "");
}

export function readViewingTripRequests(filePath = DEFAULT_VIEWING_TRIP_LEDGER_PATH) {
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function reachableChannels(contact = {}) {
  return ["email", "phone", "whatsapp", "viber"].filter((field) => Boolean(String(contact[field] || "").trim()));
}

function textList(value, { label, max, pattern = null, maxLength = 120 }) {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[,\n]/)
      : value === undefined || value === null
        ? []
        : [value];
  const items = [...new Set(raw.map((entry) => String(entry ?? "").trim()).filter(Boolean))];
  if (items.length > max) throw new Error(`${label} must list ${max} entries or fewer`);
  for (const item of items) {
    if (item.length > maxLength) throw new Error(`${label} entries must be ${maxLength} characters or fewer`);
    if (pattern && !pattern.test(item)) throw new Error(`${label} entries must be valid listing references`);
  }
  return items;
}

function optionalNote(value) {
  const note = String(value ?? "").trim();
  if (note.length > 2000) throw new Error("Viewing trip note must be 2000 characters or fewer");
  return note || null;
}

// A form posted without JavaScript arrives flat: contact.name, contact.email
// and so on are top-level keys, not a nested object. Un-flatten them exactly
// the way lead intake does, or a native POST fails on "contact.name is
// required" while the fetch path succeeds.
function unflattenContact(input) {
  const contact = input.contact && typeof input.contact === "object" && !Array.isArray(input.contact) ? { ...input.contact } : {};
  for (const field of ["name", "email", "phone", "whatsapp", "viber", "preferred_channel"]) {
    const value = input[`contact.${field}`];
    if (value !== undefined && String(value).trim()) contact[field] = String(value).trim();
    else if (typeof contact[field] === "string") contact[field] = contact[field].trim();
  }
  return contact;
}

export function normalizeViewingTripInput(input = {}) {
  return {
    ...input,
    contact: unflattenContact(input),
    locale: input.locale || input.language || null,
    arrival_date: input.arrivalDate ?? input.arrival_date ?? null,
    departure_date: input.departureDate ?? input.departure_date ?? null,
    listing_references: input.listingReferences ?? input.listing_references ?? input.shortlist ?? [],
    party_size: input.partySize ?? input.party_size ?? null,
    contact_preference: input.contact_preference ?? input.contactPreference ?? null,
  };
}

export function createViewingTripRequest(registry, input, { requestedAt = new Date().toISOString() } = {}) {
  const trip = normalizeViewingTripInput(input);
  if (Number.isNaN(Date.parse(requestedAt))) throw new Error("requestedAt must be an ISO timestamp");
  const requestedAtIso = new Date(requestedAt).toISOString();

  const contact = trip.contact && typeof trip.contact === "object" ? trip.contact : {};
  const name = String(contact.name || "").trim();
  if (!name) throw new Error("contact.name is required");
  if (name.length > 160) throw new Error("contact.name must be 160 characters or fewer");
  const channels = reachableChannels(contact);
  if (!channels.length) throw new Error("A viewing trip request needs an email, phone, WhatsApp, or Viber contact");
  const contactPreference = String(trip.contact_preference || channels[0]).toLowerCase();
  if (!CONTACT_PREFERENCES.has(contactPreference) || !channels.includes(contactPreference)) {
    throw new Error("contact_preference must identify a supplied contact channel");
  }

  const requestedLocale = trip.locale || registry.source_locale;
  if (!BCP47.test(requestedLocale)) throw new Error("locale must be a BCP 47 language code");
  const resolved = resolvePublicLocale(registry, requestedLocale);

  const arrivalDate = assertIsoDate(trip.arrival_date, "arrivalDate");
  const departureDate = assertIsoDate(trip.departure_date, "departureDate");
  const nights = Math.round((Date.parse(`${departureDate}T00:00:00Z`) - Date.parse(`${arrivalDate}T00:00:00Z`)) / 86_400_000);
  if (nights < 0) throw new Error("departureDate cannot precede arrivalDate");
  if (nights > MAX_TRIP_NIGHTS) throw new Error(`A viewing trip must not span more than ${MAX_TRIP_NIGHTS} nights`);
  if (Date.parse(`${arrivalDate}T23:59:59Z`) < Date.parse(requestedAtIso)) throw new Error("arrivalDate must not be in the past");

  const areas = textList(trip.areas, { label: "areas", max: MAX_AREAS });
  const listingReferences = textList(trip.listing_references, {
    label: "listingReferences",
    max: MAX_SHORTLIST,
    pattern: LISTING_REFERENCE,
    maxLength: 64,
  });
  if (!areas.length && !listingReferences.length) {
    throw new Error("A viewing trip request needs at least one area or one shortlisted property");
  }

  const partySize = trip.party_size === null || trip.party_size === undefined || trip.party_size === "" ? null : Number(trip.party_size);
  if (partySize !== null && (!Number.isInteger(partySize) || partySize < 1 || partySize > MAX_PARTY_SIZE)) {
    throw new Error(`partySize must be a whole number between 1 and ${MAX_PARTY_SIZE}`);
  }

  return {
    requested_at: requestedAtIso,
    id: newRecordId("viewing-trip"),
    idempotency_key: normalizeIdempotencyKey(trip.idempotencyKey ?? trip.idempotency_key),
    requested_locale: requestedLocale,
    locale: resolved.locale.code,
    fallback_used: !resolved.available,
    arrival_date: arrivalDate,
    departure_date: departureDate,
    nights,
    areas,
    listing_references: listingReferences,
    party_size: partySize,
    note: optionalNote(trip.note ?? trip.message),
    contact,
    contact_preference: contactPreference,
    source: "website_viewing_trip",
    // A request, never a booking. Only a human moves this on.
    status: "requested",
    confirmation: "human_required",
  };
}

export function privacySafeViewingTripRequest(trip) {
  const { contact, ...safe } = trip;
  return {
    ...safe,
    contact_ref: trip.id,
    contact_available: reachableChannels(contact).length > 0,
  };
}

export function appendViewingTripRequest(trip, { filePath = DEFAULT_VIEWING_TRIP_LEDGER_PATH } = {}) {
  const existing = findByIdempotencyKey(readViewingTripRequests(filePath), trip.idempotency_key);
  if (existing) return existing;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(trip)}\n`);
  return trip;
}

export function assertViewingTripRequests(rows) {
  const ids = new Set();
  for (const row of rows) {
    if (!row.id || ids.has(row.id)) throw new Error("Viewing trip request ids must be present and unique");
    ids.add(row.id);
    if (row.contact_available !== true || row.contact_ref !== row.id) {
      throw new Error("Viewing trip request row is missing private contact routing");
    }
    if (row.contact || row.email || row.phone || row.whatsapp || row.viber || row.message) {
      throw new Error("Viewing trip request ledger must not store raw contact data");
    }
    if (!row.locale || !row.requested_locale) throw new Error("Viewing trip request row is missing locale data");
    if (!CONTACT_PREFERENCES.has(row.contact_preference)) throw new Error("Viewing trip request has invalid contact preference");
    assertIsoDate(row.arrival_date, "arrival_date");
    assertIsoDate(row.departure_date, "departure_date");
    if (!row.areas?.length && !row.listing_references?.length) {
      throw new Error("Viewing trip request must carry an area or a shortlisted property");
    }
    if (row.status !== "requested") throw new Error("Viewing trip ledger records a request, not a booking");
    if (row.confirmation !== "human_required") throw new Error("A viewing trip must stay pending human confirmation");
  }
  return true;
}
