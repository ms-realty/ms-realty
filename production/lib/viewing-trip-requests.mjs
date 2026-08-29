// Viewing-trip requests: a visitor asks for two or three days of viewings.
//
// This is a REQUEST, never a booking. Software in this repo does not commit the
// agency to a date: the record lands in the same admin queue as the other public
// requests (production/lib/public-request-outcomes.mjs) and a human arranges the
// trip. The ledger never stores raw contact data; the contact goes to the public
// contact vault under the record id, exactly as saved searches do.

import fs from "node:fs";
import { createHash, createHmac } from "node:crypto";
import path from "node:path";
import { assertIsoDate } from "./broker-free-slots.mjs";
import { resolvePublicLocale } from "./locales.mjs";
import { fromRoot } from "./paths.mjs";
import { createPrivateContactEnvelope, openPrivateContactEnvelope } from "./private-contact-vault.mjs";
import { findByIdempotencyKey, newRecordId, normalizeIdempotencyKey } from "./record-ids.mjs";

export const DEFAULT_VIEWING_TRIP_LEDGER_PATH = fromRoot("production", "data", "viewing-trip-requests.jsonl");
export const VIEWING_TRIP_REQUEST_COLLECTION_SLUG = "viewing_trip_requests";

const CONTACT_PREFERENCES = new Set(["email", "phone", "whatsapp", "viber"]);
const BCP47 = /^[a-z]{2,3}(-[A-Z]{2})?$/;
const LISTING_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const MAX_TRIP_NIGHTS = 30;
const MAX_AREAS = 12;
const MAX_SHORTLIST = 25;
const MAX_PARTY_SIZE = 12;
const VIEWING_TRIP_CONTACT_SUBJECT = "viewing_trip";
const IDEMPOTENCY_CONSTRAINT = "viewing_trip_requests_workspace_id_idempotency_key_idx";
const IDEMPOTENCY_RECOVERY_ATTEMPTS = 8;
const IDEMPOTENCY_RECOVERY_DEADLINE_MS = 750;
const immutablePayloadField = {
  access: { update: () => false },
  admin: { readOnly: true },
};

export const VIEWING_TRIP_REQUEST_COLLECTION = {
  slug: VIEWING_TRIP_REQUEST_COLLECTION_SLUG,
  admin: {
    useAsTitle: "request_id",
    defaultColumns: ["workspace_id", "request_id", "requested_at", "arrival_date", "status"],
  },
  fields: [
    { name: "workspace_id", type: "text", required: true, index: true, maxLength: 160, ...immutablePayloadField },
    { name: "request_id", type: "text", required: true, unique: true, index: true, maxLength: 160, ...immutablePayloadField },
    { name: "idempotency_key", type: "text", index: true, maxLength: 128, ...immutablePayloadField },
    { name: "semantic_hash", type: "text", required: true, index: true, maxLength: 64, ...immutablePayloadField },
    { name: "requested_at", type: "date", required: true, index: true, ...immutablePayloadField },
    { name: "arrival_date", type: "date", required: true, index: true, ...immutablePayloadField },
    { name: "departure_date", type: "date", required: true, ...immutablePayloadField },
    { name: "requested_locale", type: "text", required: true, maxLength: 12, ...immutablePayloadField },
    { name: "locale", type: "text", required: true, maxLength: 12, ...immutablePayloadField },
    { name: "status", type: "text", required: true, maxLength: 40, ...immutablePayloadField },
    { name: "confirmation", type: "text", required: true, maxLength: 40, ...immutablePayloadField },
    { name: "contact_ref", type: "text", required: true, maxLength: 160, ...immutablePayloadField },
    { name: "contact_preference", type: "text", required: true, maxLength: 40, ...immutablePayloadField },
    {
      name: "request_row",
      type: "json",
      required: true,
      admin: { description: "The privacy-safe viewing trip request row. Never raw contact data." },
    },
  ],
};

export class ViewingTripStoreUnavailableError extends Error {
  constructor(message, cause = null) {
    super(message);
    this.name = "ViewingTripStoreUnavailableError";
    this.code = "viewing_trip_store_unavailable";
    if (cause) this.cause = cause;
  }
}

export class ViewingTripConflictError extends Error {
  constructor(message = "This viewing trip idempotency key already belongs to a different request") {
    super(message);
    this.name = "ViewingTripConflictError";
    this.code = "viewing_trip_conflict";
    this.status = 409;
  }
}

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

function requiredText(value, label, maxLength = 160) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${label} is required`);
  if (text.length > maxLength) throw new Error(`${label} must be ${maxLength} characters or fewer`);
  return text;
}

function isoTimestamp(value, label) {
  const text = String(value || "").trim();
  if (!text || Number.isNaN(Date.parse(text))) throw new Error(`${label} must be an ISO timestamp`);
  return new Date(text).toISOString();
}

function isoDateStart(value, label) {
  return `${assertIsoDate(value, label)}T00:00:00.000Z`;
}

function workspaceIds(value) {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  return [...new Set(raw.map((entry) => String(entry || "").trim()).filter(Boolean))].sort();
}

function workspaceScopedWhere(workspaceId, clause) {
  return { and: [{ workspace_id: { equals: workspaceId } }, clause] };
}

function scopeWhere(scope) {
  return scope.length ? { workspace_id: { in: scope } } : undefined;
}

function assertPayloadReader(payload) {
  if (!payload || typeof payload.find !== "function") {
    throw new Error("Payload runtime cannot read viewing trip requests");
  }
  return payload;
}

function assertPayloadWriter(payload) {
  if (
    !assertPayloadReader(payload) ||
    typeof payload.create !== "function" ||
    !payload.db ||
    typeof payload.db.beginTransaction !== "function" ||
    typeof payload.db.commitTransaction !== "function" ||
    typeof payload.db.rollbackTransaction !== "function"
  ) {
    throw new Error("Payload runtime cannot durably store viewing trip requests");
  }
  return payload;
}

async function runtimePayload(payload, { writer = false } = {}) {
  try {
    if (payload) return writer ? assertPayloadWriter(payload) : assertPayloadReader(payload);
    const [{ getPayload }, payloadConfigModule] = await Promise.all([import("payload"), import("../../payload.config.js")]);
    const runtime = await getPayload({ config: await payloadConfigModule.default });
    return writer ? assertPayloadWriter(runtime) : assertPayloadReader(runtime);
  } catch (error) {
    throw new ViewingTripStoreUnavailableError("Durable viewing trip runtime is unavailable", error);
  }
}

async function findOne(payload, collection, where, req = undefined) {
  const result = await payload.find({ collection, depth: 0, limit: 1, overrideAccess: true, pagination: false, req, where });
  if (!Array.isArray(result?.docs)) throw new Error(`Payload ${collection} query did not return documents`);
  return result.docs[0] || null;
}

function errorChain(error) {
  const errors = [];
  const pending = [error];
  const seen = new Set();
  while (pending.length) {
    const current = pending.shift();
    if (!current || (typeof current !== "object" && typeof current !== "function") || seen.has(current)) continue;
    seen.add(current);
    errors.push(current);
    for (const key of ["cause", "error", "originalError", "parent"]) {
      if (current[key]) pending.push(current[key]);
    }
  }
  return errors;
}

function isConcurrentIdempotencyConflict(error) {
  return errorChain(error).some((current) => {
    const code = String(current.code || current.sqlState || "");
    if (code === "40001") return true;
    if (code !== "23505") return false;
    const constraint = String(current.constraint || current.constraint_name || "");
    const message = String(current.message || "");
    return constraint === IDEMPOTENCY_CONSTRAINT || message.includes(IDEMPOTENCY_CONSTRAINT);
  });
}

function durableContactPayload(trip) {
  return {
    contact: trip.contact,
    contact_preference: trip.contact_preference || null,
    ...(trip.note ? { message: trip.note } : {}),
  };
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stableValue(value[key])]),
  );
}

function semanticHashPartsFromTrip(trip) {
  const safeTrip = privacySafeViewingTripRequest(trip);
  const {
    id: _id,
    idempotency_key: _idempotencyKey,
    requested_at: _requestedAt,
    contact_ref: _contactRef,
    contact_available: _contactAvailable,
    note: _note,
    ...publicIntent
  } = safeTrip;
  return {
    public_intent: stableValue(publicIntent),
    private_payload_hmac_sha256: stableValue({
      algorithm: "hmac-sha256",
      digest_input: stableValue({
        ...durableContactPayload(trip),
        contact: trip.contact || {},
      }),
    }),
  };
}

function viewingTripSemanticHash(trip, { contactSecret } = {}) {
  const secret = requiredText(contactSecret, "MS_REALTY_PUBLIC_CONTACT_KEY", 4096);
  const parts = semanticHashPartsFromTrip(trip);
  const privatePayloadHmac = createHmac("sha256", secret)
      .update(
        JSON.stringify(
          parts.private_payload_hmac_sha256.digest_input,
        ),
      )
      .digest("hex");
  return createHash("sha256")
    .update(
      JSON.stringify({
        public_intent: parts.public_intent,
        private_payload_hmac_sha256: privatePayloadHmac,
      }),
    )
    .digest("hex");
}

function durableRequestRow(trip) {
  const safeTrip = privacySafeViewingTripRequest(trip);
  assertViewingTripRequests([safeTrip]);
  return safeTrip;
}

function requestDocumentFor(trip, workspaceId, { contactSecret } = {}) {
  const safeTrip = durableRequestRow(trip);
  return {
    workspace_id: requiredText(workspaceId, "Durable viewing trip workspace_id"),
    request_id: requiredText(safeTrip.id, "Viewing trip request id"),
    idempotency_key: safeTrip.idempotency_key || null,
    semantic_hash: viewingTripSemanticHash(trip, { contactSecret }),
    requested_at: isoTimestamp(safeTrip.requested_at, "requested_at"),
    arrival_date: isoDateStart(safeTrip.arrival_date, "arrival_date"),
    departure_date: isoDateStart(safeTrip.departure_date, "departure_date"),
    requested_locale: requiredText(safeTrip.requested_locale, "requested_locale", 12),
    locale: requiredText(safeTrip.locale, "locale", 12),
    status: requiredText(safeTrip.status, "status", 40),
    confirmation: requiredText(safeTrip.confirmation, "confirmation", 40),
    contact_ref: requiredText(safeTrip.contact_ref, "contact_ref"),
    contact_preference: requiredText(safeTrip.contact_preference, "contact_preference", 40),
    request_row: safeTrip,
  };
}

function requestRowFromDocument(document) {
  const row = document?.request_row;
  if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error("Payload viewing trip request_row is invalid");
  if (requiredText(document.request_id, "Viewing trip request id") !== requiredText(row.id, "Viewing trip row id")) {
    throw new Error("Payload viewing trip request id does not match its row");
  }
  if (row.idempotency_key !== (document.idempotency_key || null)) {
    throw new Error("Payload viewing trip idempotency key does not match its row");
  }
  requiredText(document.semantic_hash, "Viewing trip semantic_hash", 64);
  assertViewingTripRequests([row]);
  return row;
}

function assertMatchingSemanticHash(document, semanticHash) {
  const stored = requiredText(document?.semantic_hash, "Stored viewing trip semantic_hash", 64);
  if (stored !== requiredText(semanticHash, "Viewing trip semantic_hash", 64)) {
    throw new ViewingTripConflictError();
  }
}

function contactEnvelopeForTrip(trip, { contactSecret } = {}) {
  return createPrivateContactEnvelope(
    {
      subjectType: VIEWING_TRIP_CONTACT_SUBJECT,
      subjectId: trip.id,
      payload: durableContactPayload(trip),
    },
    { secret: contactSecret, secretName: "MS_REALTY_PUBLIC_CONTACT_KEY", storedAt: trip.requested_at },
  );
}

async function storedViewingTripOutcome(runtime, document, workspaceId, contactSecret, semanticHash, req = undefined) {
  if (!document) return null;
  if (requiredText(document.workspace_id, "Stored viewing trip workspace_id") !== workspaceId) {
    throw new Error("Stored viewing trip belongs to another workspace");
  }
  assertMatchingSemanticHash(document, semanticHash);
  const request = requestRowFromDocument(document);
  const contact = await findOne(
    runtime,
    "lead_contacts",
    workspaceScopedWhere(workspaceId, {
      and: [{ subject_type: { equals: VIEWING_TRIP_CONTACT_SUBJECT } }, { subject_id: { equals: request.id } }],
    }),
    req,
  );
  if (!contact?.ciphertext || !contact?.iv || !contact?.auth_tag) {
    throw new Error("Stored viewing trip is missing its encrypted contact");
  }
  if (requiredText(contact.workspace_id, "Stored viewing trip contact workspace_id") !== workspaceId) {
    throw new Error("Stored viewing trip contact belongs to another workspace");
  }
  const opened = openPrivateContactEnvelope(contact, {
    secret: contactSecret,
    secretName: "MS_REALTY_PUBLIC_CONTACT_KEY",
  });
  if (opened.subject_type !== VIEWING_TRIP_CONTACT_SUBJECT || opened.subject_id !== request.id) {
    throw new Error("Stored viewing trip contact envelope is invalid");
  }
  return { request, created: false, idempotent: true };
}

async function recoverCommittedIdempotentViewingTrip(runtime, { idempotencyKey, workspaceId, contactSecret, semanticHash }) {
  const deadline = Date.now() + IDEMPOTENCY_RECOVERY_DEADLINE_MS;
  for (let attempt = 0; attempt < IDEMPOTENCY_RECOVERY_ATTEMPTS; attempt += 1) {
    try {
      const document = await findOne(
        runtime,
        VIEWING_TRIP_REQUEST_COLLECTION_SLUG,
        workspaceScopedWhere(workspaceId, { idempotency_key: { equals: idempotencyKey } }),
      );
      if (document) {
        assertMatchingSemanticHash(document, semanticHash);
        const request = requestRowFromDocument(document);
        const contact = await findOne(
          runtime,
          "lead_contacts",
          workspaceScopedWhere(workspaceId, {
            and: [{ subject_type: { equals: VIEWING_TRIP_CONTACT_SUBJECT } }, { subject_id: { equals: request.id } }],
          }),
        );
        if (!contact?.ciphertext || !contact?.iv || !contact?.auth_tag) throw new Error("Stored viewing trip is missing its encrypted contact");
        const opened = openPrivateContactEnvelope(contact, {
          secret: contactSecret,
          secretName: "MS_REALTY_PUBLIC_CONTACT_KEY",
        });
        if (opened.subject_type !== VIEWING_TRIP_CONTACT_SUBJECT || opened.subject_id !== request.id) {
          throw new Error("Stored viewing trip contact envelope is invalid");
        }
        return { request, created: false, idempotent: true };
      }
    } catch {
      // The winning serializable transaction may not be visible yet.
    }
    const remaining = deadline - Date.now();
    if (attempt + 1 >= IDEMPOTENCY_RECOVERY_ATTEMPTS || remaining <= 0) break;
    await new Promise((resolve) => setTimeout(resolve, Math.min(25 * (attempt + 1), remaining)));
  }
  return null;
}

export function isViewingTripDurableStoreEnabled(config = {}) {
  return Boolean(
    config.viewingDurableStoreEnabled &&
      config.payloadSecret &&
      config.databaseUrl &&
      String(config.contactSecret || "").length >= 32 &&
      String(config.workspaceId || "").trim(),
  );
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

export async function persistViewingTripDurably({ trip, contactSecret, payload = null, workspaceId } = {}) {
  if (!trip || typeof trip !== "object") throw new Error("A viewing trip request is required");
  const request = requestDocumentFor(trip, workspaceId, { contactSecret });
  const envelope = contactEnvelopeForTrip(trip, { contactSecret });
  const runtime = await runtimePayload(payload, { writer: true });
  let transactionId = null;
  let committed = false;
  let insertAttempted = false;
  try {
    transactionId = await runtime.db.beginTransaction({ accessMode: "read write", isolationLevel: "serializable" });
    if (!transactionId) throw new Error("Payload database adapter did not open a transaction");
    const req = { payload: runtime, transactionID: transactionId };
    const byKey = request.idempotency_key
      ? await findOne(
          runtime,
          VIEWING_TRIP_REQUEST_COLLECTION_SLUG,
          workspaceScopedWhere(request.workspace_id, { idempotency_key: { equals: request.idempotency_key } }),
          req,
        )
      : null;
    const byId = byKey
      ? null
      : await findOne(
          runtime,
          VIEWING_TRIP_REQUEST_COLLECTION_SLUG,
          workspaceScopedWhere(request.workspace_id, { request_id: { equals: request.request_id } }),
          req,
        );
    const existing = byKey || byId;
    if (existing) {
      const stored = await storedViewingTripOutcome(runtime, existing, request.workspace_id, contactSecret, request.semantic_hash, req);
      await runtime.db.commitTransaction(transactionId);
      committed = true;
      return stored;
    }

    insertAttempted = true;
    await runtime.create({
      collection: VIEWING_TRIP_REQUEST_COLLECTION_SLUG,
      overrideAccess: true,
      req,
      data: request,
    });
    await runtime.create({
      collection: "lead_contacts",
      overrideAccess: true,
      req,
      data: {
        workspace_id: request.workspace_id,
        subject_type: envelope.subject_type,
        subject_id: envelope.subject_id,
        stored_at: envelope.stored_at,
        algorithm: envelope.algorithm,
        iv: envelope.iv,
        auth_tag: envelope.auth_tag,
        ciphertext: envelope.ciphertext,
      },
    });
    await runtime.db.commitTransaction(transactionId);
    committed = true;
    return { request: request.request_row, created: true, idempotent: false };
  } catch (error) {
    let rolledBack = false;
    if (transactionId && !committed) {
      try {
        await runtime.db.rollbackTransaction(transactionId);
        rolledBack = true;
      } catch {
        rolledBack = false;
      }
    }
    if (rolledBack && insertAttempted && request.idempotency_key && isConcurrentIdempotencyConflict(error)) {
      const recovered = await recoverCommittedIdempotentViewingTrip(runtime, {
        idempotencyKey: request.idempotency_key,
        workspaceId: request.workspace_id,
        contactSecret,
        semanticHash: request.semantic_hash,
      });
      if (recovered) return recovered;
    }
    if (error instanceof ViewingTripConflictError || error?.code === "viewing_trip_conflict") throw error;
    throw new ViewingTripStoreUnavailableError("Durable viewing trip store rejected the submission", error);
  }
}

export async function readViewingTripRequestsDurably({ payload = null, user = null, workspaceId, workspaceIds: scopeInput } = {}) {
  const scope = workspaceIds(scopeInput || workspaceId);
  if (!scope.length) throw new Error("Durable viewing trip workspace scope is required");
  try {
    const runtime = await runtimePayload(payload);
    const access = user ? { overrideAccess: false, user } : { overrideAccess: true };
    const result = await runtime.find({
      collection: VIEWING_TRIP_REQUEST_COLLECTION_SLUG,
      depth: 0,
      ...access,
      pagination: false,
      sort: "requested_at",
      where: scopeWhere(scope),
    });
    if (!Array.isArray(result?.docs)) throw new Error("Payload viewing trip query did not return documents");
    const allowed = new Set(scope);
    return result.docs.map((document) => {
      const documentWorkspaceId = requiredText(document?.workspace_id, "Payload viewing trip workspace_id");
      if (allowed.size && !allowed.has(documentWorkspaceId)) {
        throw new Error("Payload viewing trip query crossed the requested workspace boundary");
      }
      return requestRowFromDocument(document);
    });
  } catch (error) {
    if (error instanceof ViewingTripStoreUnavailableError) throw error;
    throw new ViewingTripStoreUnavailableError("Durable viewing trip read failed", error);
  }
}

export async function readViewingTripContactsDurably({ contactSecret, payload = null, user = null, workspaceId, workspaceIds: scopeInput } = {}) {
  const scope = workspaceIds(scopeInput || workspaceId);
  if (!scope.length) throw new Error("Durable viewing trip workspace scope is required");
  try {
    const runtime = await runtimePayload(payload);
    const access = user ? { overrideAccess: false, user } : { overrideAccess: true };
    const result = await runtime.find({
      collection: "lead_contacts",
      depth: 0,
      ...access,
      pagination: false,
      where: scopeWhere(scope),
    });
    if (!Array.isArray(result?.docs)) throw new Error("Payload lead_contacts query did not return documents");
    const allowed = new Set(scope);
    const contacts = new Map();
    for (const document of result.docs) {
      const documentWorkspaceId = requiredText(document?.workspace_id, "Payload lead_contacts workspace_id");
      if (allowed.size && !allowed.has(documentWorkspaceId)) {
        throw new Error("Payload lead_contacts query crossed the requested workspace boundary");
      }
      if (document?.subject_type !== VIEWING_TRIP_CONTACT_SUBJECT) continue;
      const opened = openPrivateContactEnvelope(document, {
        secret: contactSecret,
        secretName: "MS_REALTY_PUBLIC_CONTACT_KEY",
      });
      if (opened.subject_type !== VIEWING_TRIP_CONTACT_SUBJECT) continue;
      contacts.set(opened.subject_id, opened.payload);
    }
    return contacts;
  } catch (error) {
    if (error instanceof ViewingTripStoreUnavailableError) throw error;
    throw new ViewingTripStoreUnavailableError("Durable viewing trip contact read failed", error);
  }
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
