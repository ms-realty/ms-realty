import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { derivePrimaryAreaSqm } from "./listing-facts.mjs";
import { fromRoot } from "./paths.mjs";
import { normalizeSearchIntent } from "./search-intent.mjs";
import { createLedgerStore } from "./sqlite-ledger.mjs";

export const DEFAULT_SEARCH_DATA_DIR = fromRoot("search", "data");
export const DEFAULT_SEARCH_ENGINE_SYNC_REPORT = fromRoot("production", "data", "search-engine-sync-report.json");
export const DEFAULT_SEARCH_ENGINE_SYNC_SMOKE = fromRoot("production", "data", "search-engine-sync-smoke.json");
export const DEFAULT_SEARCH_ENGINE_QUERY_REPORT = fromRoot("production", "data", "search-engine-query-report.json");
export const DEFAULT_SEARCH_ENGINE_QUERY_SMOKE = fromRoot("production", "data", "search-engine-query-smoke.json");
export const DEFAULT_SEARCH_OUTBOX_PATH = fromRoot("production", "data", "search-outbox.jsonl");

const SEARCH_ENGINES = new Set(["typesense", "meilisearch"]);
const APPROVED_PUBLICATION_STATE = "published";
const BROKER_VERIFIED = "broker_verified";
const SEARCH_OUTBOX_EVENT_TYPES = new Set(["enqueue", "retry", "delete"]);
const SEARCH_OUTBOX_STORE = createLedgerStore({
  name: "search_outbox",
  columns: ["id", "message_id", "event_type", "idempotency_key", "recorded_at"],
  indexes: ["message_id", "idempotency_key"],
});

// ponytail: this is a single-host JSONL/SQLite outbox; move to a shared transactional store before multiple workers write it.

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readBody(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function rowCount(body) {
  return body.split("\n").filter(Boolean).length;
}

function meilisearchImportBody(body) {
  const identifiers = new Set();
  const documents = body
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const document = JSON.parse(line);
      const meiliId = String(document.id || "").replace(/[^A-Za-z0-9_-]/g, "_");
      if (!meiliId) throw new Error("Meilisearch document id is required");
      if (identifiers.has(meiliId)) throw new Error(`Duplicate Meilisearch document id: ${meiliId}`);
      identifiers.add(meiliId);
      return JSON.stringify({ ...document, meili_id: meiliId });
    });
  return `${documents.join("\n")}\n`;
}

function joinUrl(baseUrl, route) {
  return `${String(baseUrl).replace(/\/+$/, "")}${route}`;
}

function redactedUrl(value) {
  const parsed = new URL(value);
  parsed.username = "";
  parsed.password = "";
  parsed.hash = "";
  return parsed.href;
}

function required(value, name) {
  const text = String(value || "").trim();
  if (!text) throw new Error(`${name} is required`);
  if (/replace-with|change-me|example/i.test(text)) throw new Error(`${name} must not be a placeholder`);
  return value;
}

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function optionalText(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function isoTimestamp(value, label) {
  const text = String(value || "").trim();
  if (!text || Number.isNaN(Date.parse(text))) throw new Error(`${label} must be an ISO timestamp`);
  return new Date(text).toISOString();
}

function searchIdentifier(value, label) {
  const text = String(value || "").trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(text)) {
    throw new Error(`${label} must contain only letters, numbers, underscores, or hyphens`);
  }
  return text;
}

function outboxKey(value, label) {
  const text = String(value || "").trim();
  if (!text || text.length > 240 || /[\r\n\u0000]/.test(text)) throw new Error(`${label} must be a stable non-empty key`);
  return text;
}

function verificationMap(approval = {}, listing = {}) {
  const raw = approval.fact_verification ?? approval.factVerifications ?? listing.fact_verification ?? listing.factVerifications ?? [];
  const map = new Map();
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (!plainObject(entry)) continue;
      const field = optionalText(entry.field);
      if (field) map.set(field, String(entry.state || "").trim());
    }
  } else if (plainObject(raw)) {
    for (const [field, value] of Object.entries(raw)) {
      map.set(field, String(plainObject(value) ? value.state : value || "").trim());
    }
  }
  return map;
}

function approvalAllowsSearch(approval = {}) {
  return (
    approval.publication_state === APPROVED_PUBLICATION_STATE &&
    approval.translation_human_approved === true &&
    (approval.locale_indexable === true || approval.locale_is_indexable === true)
  );
}

const PROJECTED_FACT_FIELDS = Object.freeze([
  "property_family",
  "property_subtype",
  "location_id",
  "location_label",
  "price_amount",
  "price_currency",
  "price_period",
  "price_on_request",
  "offer_type",
  "listing_status",
  "bedrooms_count",
  "premises_count",
  "hotel_room_count",
  "floor_number",
  "total_floors",
  "storeys_count",
  "living_area_sqm",
  "built_area_sqm",
  "usable_area_sqm",
  "gross_floor_area_sqm",
  "land_area_sqm",
  "parking_kind",
  "condition",
  "construction_status",
  "zoning_status",
  "utilities_status",
  "road_access_status",
  "land_category",
  "permanent_use",
  "permitted_use",
]);

function publicFactSource(listing) {
  return { ...listing, ...(plainObject(listing.facts) ? listing.facts : {}) };
}

function verifiedFact(value, field, verified) {
  if (verified.get(field) !== BROKER_VERIFIED || value === null || value === undefined || value === "") return undefined;
  return value;
}

function validPublicCoordinates(latitude, longitude) {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

export function projectApprovedSearchDocument({ listing = {}, approval = {} } = {}) {
  if (!plainObject(listing) || !plainObject(approval)) throw new Error("Search projection requires listing and approval objects");
  if (!approvalAllowsSearch(approval)) return null;

  const facts = publicFactSource(listing);
  const verified = verificationMap(approval, listing);
  const sourceListingId = optionalText(facts.source_listing_id || facts.id || facts.listing_reference);
  const listingReference = optionalText(facts.listing_reference || sourceListingId);
  const locale = optionalText(approval.locale || facts.locale);
  const localePath = optionalText(facts.locale_path);
  const title = optionalText(facts.title || facts.h1);
  if (!sourceListingId || !listingReference || !locale || !localePath || !title) {
    throw new Error("Approved search projection requires source_listing_id, listing_reference, locale, locale_path, and title");
  }
  if (!localePath.startsWith("/")) throw new Error("Approved search projection locale_path must be absolute");

  const description = optionalText(facts.description);
  const document = {
    id: optionalText(facts.search_document_id) || `${sourceListingId}:${locale}`,
    source_listing_id: sourceListingId,
    listing_reference: listingReference,
    locale,
    locale_path: localePath,
    title,
    publication_state: APPROVED_PUBLICATION_STATE,
    translation_human_approved: true,
    locale_indexable: true,
    translation_indexable: true,
    search_text: [title, description].filter(Boolean).join(" "),
  };
  if (description) document.description = description;
  if (approval.has_approved_tour === true) document.has_approved_tour = true;

  for (const field of PROJECTED_FACT_FIELDS) {
    const value = verifiedFact(facts[field], field, verified);
    if (value !== undefined) document[field] = value;
  }

  const directPrimaryArea = verifiedFact(facts.primary_area_sqm, "primary_area_sqm", verified);
  if (directPrimaryArea !== undefined && finiteNumber(directPrimaryArea) !== null && finiteNumber(directPrimaryArea) > 0) {
    document.primary_area_sqm = finiteNumber(directPrimaryArea);
  } else {
    const derivedPrimaryArea = derivePrimaryAreaSqm(document);
    if (derivedPrimaryArea !== null) document.primary_area_sqm = derivedPrimaryArea;
  }

  const publicLatitude = verifiedFact(facts.public_latitude, "public_latitude", verified);
  const publicLongitude = verifiedFact(facts.public_longitude, "public_longitude", verified);
  const latitude = finiteNumber(publicLatitude);
  const longitude = finiteNumber(publicLongitude);
  if (validPublicCoordinates(latitude, longitude)) {
    document.public_latitude = latitude;
    document.public_longitude = longitude;
    const precision = verifiedFact(facts.public_location_precision, "public_location_precision", verified);
    if (precision !== undefined) document.public_location_precision = precision;
  }
  return document;
}

export function buildApprovedSearchProjection(rows = []) {
  if (!Array.isArray(rows)) throw new Error("Approved search projection rows must be an array");
  const documents = [];
  const ids = new Set();
  for (const row of rows) {
    const record = plainObject(row) ? row : {};
    const document = projectApprovedSearchDocument({ listing: record.listing || record, approval: record.approval || {} });
    if (!document) continue;
    if (ids.has(document.id)) throw new Error(`Approved search projection has duplicate document id: ${document.id}`);
    ids.add(document.id);
    documents.push(document);
  }
  return {
    schema_version: 1,
    documents,
    summary: {
      input_rows: rows.length,
      projected_documents: documents.length,
      skipped_rows: rows.length - documents.length,
    },
  };
}

export function approvedSearchSchema(name = "ms_realty_listings") {
  const requiredFields = [
    ["id", "string"],
    ["source_listing_id", "string"],
    ["listing_reference", "string"],
    ["locale", "string"],
    ["locale_path", "string"],
    ["title", "string"],
    ["publication_state", "string"],
    ["translation_human_approved", "bool"],
    ["locale_indexable", "bool"],
    ["translation_indexable", "bool"],
    ["search_text", "string"],
  ];
  const optionalFields = [
    ["description", "string"],
    ["listing_status", "string"],
    ["has_approved_tour", "bool"],
    ["property_family", "string"],
    ["property_subtype", "string"],
    ["location_id", "string"],
    ["location_label", "string"],
    ["price_amount", "float"],
    ["price_currency", "string"],
    ["price_period", "string"],
    ["price_on_request", "bool"],
    ["offer_type", "string"],
    ["bedrooms_count", "int32"],
    ["premises_count", "int32"],
    ["hotel_room_count", "int32"],
    ["floor_number", "int32"],
    ["total_floors", "int32"],
    ["storeys_count", "int32"],
    ["living_area_sqm", "float"],
    ["built_area_sqm", "float"],
    ["usable_area_sqm", "float"],
    ["gross_floor_area_sqm", "float"],
    ["land_area_sqm", "float"],
    ["primary_area_sqm", "float"],
    ["parking_kind", "string"],
    ["condition", "string"],
    ["construction_status", "string"],
    ["zoning_status", "string"],
    ["utilities_status", "string"],
    ["road_access_status", "string"],
    ["land_category", "string"],
    ["permanent_use", "string"],
    ["permitted_use", "string"],
    ["public_latitude", "float"],
    ["public_longitude", "float"],
    ["public_location_precision", "string"],
  ];
  const facet = new Set([
    "source_listing_id",
    "listing_reference",
    "locale",
    "publication_state",
    "translation_human_approved",
    "locale_indexable",
    "translation_indexable",
    "listing_status",
    "has_approved_tour",
    "property_family",
    "property_subtype",
    "location_id",
    "location_label",
    "price_amount",
    "price_currency",
    "price_period",
    "price_on_request",
    "offer_type",
    "bedrooms_count",
    "premises_count",
    "hotel_room_count",
    "floor_number",
    "storeys_count",
    "primary_area_sqm",
    "land_area_sqm",
    "parking_kind",
    "condition",
    "construction_status",
    "zoning_status",
    "utilities_status",
    "road_access_status",
    "public_latitude",
    "public_longitude",
  ]);
  return {
    name: searchIdentifier(name, "Search collection name"),
    fields: [...requiredFields, ...optionalFields].map(([field, type], index) => ({
      name: field,
      type,
      ...(index >= requiredFields.length ? { optional: true } : {}),
      ...(facet.has(field) ? { facet: true } : {}),
    })),
  };
}

export function approvedSearchSettings() {
  return {
    searchableAttributes: ["title", "description", "search_text", "location_label", "listing_reference"],
    filterableAttributes: approvedSearchSchema().fields.filter((field) => field.facet).map((field) => field.name),
    sortableAttributes: ["price_amount", "primary_area_sqm"],
    displayedAttributes: ["*"],
    rankingRules: ["words", "typo", "proximity", "attribute", "sort", "exactness"],
  };
}

function documentsToJsonl(documents) {
  if (!Array.isArray(documents)) throw new Error("Search documents must be an array");
  return documents.length ? `${documents.map((document) => JSON.stringify(document)).join("\n")}\n` : "";
}

export function writeApprovedSearchProjection(projection, dataDir) {
  if (!plainObject(projection) || projection.schema_version !== 1 || !Array.isArray(projection.documents)) {
    throw new Error("Approved search projection must use schema version 1");
  }
  const directory = optionalText(dataDir);
  if (!directory) throw new Error("Approved search projection dataDir is required");
  fs.mkdirSync(directory, { recursive: true });
  const documents = projection.documents;
  const outputs = {
    index: path.join(directory, "index-listings.json"),
    typesense: path.join(directory, "typesense-listings.jsonl"),
    meilisearch: path.join(directory, "meilisearch-listings.ndjson"),
    schema: path.join(directory, "typesense-schema.json"),
    settings: path.join(directory, "meilisearch-settings.json"),
    summary: path.join(directory, "approved-search-projection-summary.json"),
  };
  fs.writeFileSync(outputs.index, `${JSON.stringify(documents, null, 2)}\n`);
  fs.writeFileSync(outputs.typesense, documentsToJsonl(documents));
  fs.writeFileSync(outputs.meilisearch, meilisearchImportBody(documentsToJsonl(documents)));
  fs.writeFileSync(outputs.schema, `${JSON.stringify(approvedSearchSchema(), null, 2)}\n`);
  fs.writeFileSync(outputs.settings, `${JSON.stringify(approvedSearchSettings(), null, 2)}\n`);
  fs.writeFileSync(outputs.summary, `${JSON.stringify(projection.summary, null, 2)}\n`);
  return outputs;
}

function normalizedSearchEngine(value) {
  const engine = String(value || "").trim().toLowerCase();
  if (engine && !SEARCH_ENGINES.has(engine)) throw new Error("MS_REALTY_SEARCH_ENGINE must be typesense or meilisearch");
  return engine || null;
}

function productionEnvironment(value) {
  return String(value || "").trim().toLowerCase() === "production";
}

export function selectSearchRuntime({
  engine = process.env.MS_REALTY_SEARCH_ENGINE,
  environment = process.env.NODE_ENV,
  typesense = {},
  meilisearch = {},
} = {}) {
  const selected = normalizedSearchEngine(engine);
  const production = productionEnvironment(environment);
  if (!selected) {
    if (production) throw new Error("MS_REALTY_SEARCH_ENGINE is required in production");
    return { engine: null, mode: "legacy_fallback" };
  }
  const config = selected === "typesense" ? typesense : meilisearch;
  if (missingSearchEngineConfig(config)) {
    if (production) throw new Error(`${selected} search engine configuration is required in production`);
    return { engine: selected, mode: "local_fallback" };
  }
  return { engine: selected, mode: "single" };
}

export function versionedSearchTarget(alias, version) {
  return `${searchIdentifier(alias, "Search alias")}__${searchIdentifier(version, "Search version")}`;
}

function aliasActivation(engine, alias, target) {
  if (engine === "typesense") {
    return { method: "PUT", path: `/aliases/${encodeURIComponent(alias)}`, body: { collection_name: target } };
  }
  return { method: "POST", path: "/swap-indexes", body: [{ indexes: [alias, target] }] };
}

export function createSearchRebuildPlan({ engine, alias, version, previousVersion = null } = {}) {
  const selected = normalizedSearchEngine(engine);
  if (!selected) throw new Error("Search rebuild engine is required");
  const normalizedAlias = searchIdentifier(alias, "Search alias");
  const target = versionedSearchTarget(normalizedAlias, version);
  const previousTarget = previousVersion ? versionedSearchTarget(normalizedAlias, previousVersion) : null;
  return {
    schema_version: 1,
    engine: selected,
    alias: normalizedAlias,
    target,
    previous_target: previousTarget,
    activation: aliasActivation(selected, normalizedAlias, target),
  };
}

export function createSearchRollbackPlan(rebuildPlan = {}) {
  if (!plainObject(rebuildPlan) || rebuildPlan.schema_version !== 1 || !rebuildPlan.previous_target) {
    throw new Error("Search rollback requires a rebuild plan with previous_target");
  }
  const engine = normalizedSearchEngine(rebuildPlan.engine);
  const alias = searchIdentifier(rebuildPlan.alias, "Search alias");
  const target = searchIdentifier(rebuildPlan.target, "Search target");
  const previousTarget = searchIdentifier(rebuildPlan.previous_target, "Search previous target");
  return {
    schema_version: 1,
    engine,
    alias,
    target: previousTarget,
    previous_target: target,
    activation: engine === "typesense" ? aliasActivation(engine, alias, previousTarget) : aliasActivation(engine, alias, target),
  };
}

function configuredEngine(engine, { typesense = {}, meilisearch = {} } = {}) {
  const config = engine === "typesense" ? typesense : meilisearch;
  const label = engine === "typesense" ? "TYPESENSE" : "MEILI";
  required(config.baseUrl, `${label}_URL`);
  required(config.apiKey, `${label}_API_KEY`);
  return config;
}

export async function applySearchAliasPlan(
  plan,
  { typesense = {}, meilisearch = {}, fetchImpl = globalThis.fetch } = {},
) {
  if (!plainObject(plan) || !plainObject(plan.activation)) throw new Error("Search alias plan is required");
  if (typeof fetchImpl !== "function") throw new Error("fetch is required for search alias activation");
  const engine = normalizedSearchEngine(plan.engine);
  const config = configuredEngine(engine, { typesense, meilisearch });
  const headers =
    engine === "typesense"
      ? { "content-type": "application/json", "x-typesense-api-key": config.apiKey }
      : { "content-type": "application/json", authorization: `Bearer ${config.apiKey}` };
  return checkedFetch(fetchImpl, joinUrl(config.baseUrl, plan.activation.path), {
    method: plan.activation.method,
    headers,
    body: JSON.stringify(plan.activation.body),
  });
}

export async function runSearchEngineRebuild({
  engine,
  alias,
  version,
  previousVersion = null,
  documents,
  schema,
  settings,
  typesense = {},
  meilisearch = {},
  fetchImpl = globalThis.fetch,
  activate = false,
} = {}) {
  const plan = createSearchRebuildPlan({ engine, alias, version, previousVersion });
  if (!Array.isArray(documents)) throw new Error("Search rebuild documents must be an array");
  const sync =
    plan.engine === "typesense"
      ? await syncTypesense({ ...typesense, collectionName: plan.target, documents, schema, fetchImpl })
      : await syncMeilisearch({ ...meilisearch, indexName: plan.target, documents, settings, fetchImpl });
  const activation = activate ? await applySearchAliasPlan(plan, { typesense, meilisearch, fetchImpl }) : null;
  return { ...plan, sync, activation };
}

export async function rollbackSearchEngineRebuild(rebuildPlan, options = {}) {
  const rollback = createSearchRollbackPlan(rebuildPlan);
  return { ...rollback, activation: await applySearchAliasPlan(rollback, options) };
}

function stableJson(value) {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (plainObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  throw new Error("Search outbox payload must be JSON data");
}

function assertSafeOutboxPayload(value, key = "") {
  if (key && /(api.?key|authorization|secret|password|token)/i.test(key)) {
    throw new Error("Search outbox payload must not contain credentials");
  }
  if (Array.isArray(value)) {
    value.forEach((item) => assertSafeOutboxPayload(item));
  } else if (plainObject(value)) {
    Object.entries(value).forEach(([name, child]) => assertSafeOutboxPayload(child, name));
  }
}

function outboxEventId(messageId, eventType, idempotencyKey) {
  const digest = crypto.createHash("sha256").update(`${messageId}:${eventType}:${idempotencyKey}`).digest("hex").slice(0, 20);
  return `search-outbox-${digest}`;
}

export function resetSearchOutbox(filePath = DEFAULT_SEARCH_OUTBOX_PATH) {
  SEARCH_OUTBOX_STORE.resetLedger(filePath);
}

export function readSearchOutbox(filePath = DEFAULT_SEARCH_OUTBOX_PATH) {
  return SEARCH_OUTBOX_STORE.readRows(filePath);
}

export function reconcileSearchOutbox(rows = []) {
  if (!Array.isArray(rows)) throw new Error("Search outbox rows must be an array");
  const ids = new Set();
  const states = new Map();
  const idempotency = new Map();
  for (const row of rows) {
    if (!plainObject(row) || !SEARCH_OUTBOX_EVENT_TYPES.has(row.event_type) || !row.id || ids.has(row.id)) {
      throw new Error("Search outbox contains an invalid event");
    }
    ids.add(row.id);
    if (row.event_type === "enqueue") {
      const messageId = outboxKey(row.message_id, "Search outbox message id");
      const key = outboxKey(row.idempotency_key, "Search outbox idempotency key");
      if (!plainObject(row.payload) || !row.payload_digest) throw new Error("Search outbox enqueue event is incomplete");
      assertSafeOutboxPayload(row.payload);
      const prior = states.get(messageId) || idempotency.get(key);
      if (prior && (prior.message_id !== messageId || prior.payload_digest !== row.payload_digest || prior.type !== row.type)) {
        throw new Error("Search outbox idempotency key belongs to a different message");
      }
      const state = {
        message_id: messageId,
        idempotency_key: key,
        type: outboxKey(row.type, "Search outbox type"),
        payload: row.payload,
        payload_digest: row.payload_digest,
        enqueued_at: isoTimestamp(row.recorded_at, "Search outbox recorded_at"),
        attempts: 0,
        deleted: false,
      };
      states.set(messageId, state);
      idempotency.set(key, state);
      continue;
    }
    const state = states.get(row.message_id);
    if (!state) throw new Error("Search outbox event references an unknown message");
    if (row.event_type === "retry") {
      if (state.deleted) throw new Error("Search outbox cannot retry a deleted message");
      state.attempts += 1;
    } else if (row.event_type === "delete") {
      state.deleted = true;
      state.deleted_at = isoTimestamp(row.recorded_at, "Search outbox recorded_at");
    }
  }
  const messages = [...states.values()];
  return {
    messages,
    pending: messages.filter((message) => !message.deleted),
    deleted: messages.filter((message) => message.deleted),
    summary: {
      messages: messages.length,
      pending: messages.filter((message) => !message.deleted).length,
      deleted: messages.filter((message) => message.deleted).length,
    },
  };
}

function appendSearchOutboxEvent(event, filePath) {
  SEARCH_OUTBOX_STORE.appendRow(filePath, event);
  return event;
}

export function enqueueSearchOutbox(
  { type, payload, idempotencyKey, messageId = null } = {},
  { filePath = DEFAULT_SEARCH_OUTBOX_PATH, recordedAt = new Date().toISOString() } = {},
) {
  const key = outboxKey(idempotencyKey, "Search outbox idempotency key");
  const normalizedType = outboxKey(type, "Search outbox type");
  if (!plainObject(payload)) throw new Error("Search outbox payload must be an object");
  assertSafeOutboxPayload(payload);
  const payloadDigest = crypto.createHash("sha256").update(stableJson(payload)).digest("hex");
  const current = reconcileSearchOutbox(readSearchOutbox(filePath));
  const existing = current.messages.find((message) => message.idempotency_key === key);
  if (existing) {
    if (existing.type !== normalizedType || existing.payload_digest !== payloadDigest) {
      throw new Error("Search outbox idempotency key belongs to a different message");
    }
    return { ...existing, idempotent: true };
  }
  const resolvedMessageId = messageId ? outboxKey(messageId, "Search outbox message id") : `search-${payloadDigest.slice(0, 20)}`;
  if (current.messages.some((message) => message.message_id === resolvedMessageId)) {
    throw new Error("Search outbox message id already exists");
  }
  const event = {
    id: outboxEventId(resolvedMessageId, "enqueue", key),
    event_type: "enqueue",
    message_id: resolvedMessageId,
    idempotency_key: key,
    type: normalizedType,
    payload,
    payload_digest: payloadDigest,
    recorded_at: isoTimestamp(recordedAt, "recordedAt"),
  };
  appendSearchOutboxEvent(event, filePath);
  return { ...reconcileSearchOutbox(readSearchOutbox(filePath)).messages.find((message) => message.message_id === resolvedMessageId), idempotent: false };
}

export function retrySearchOutbox(
  messageId,
  { filePath = DEFAULT_SEARCH_OUTBOX_PATH, retryKey = null, recordedAt = new Date().toISOString() } = {},
) {
  const current = reconcileSearchOutbox(readSearchOutbox(filePath));
  const message = current.messages.find((candidate) => candidate.message_id === messageId);
  if (!message || message.deleted) throw new Error("Search outbox retry requires a pending message");
  const key = outboxKey(retryKey || `retry:${messageId}:${message.attempts + 1}`, "Search outbox retry key");
  const id = outboxEventId(messageId, "retry", key);
  const existing = readSearchOutbox(filePath).find((row) => row.id === id);
  if (existing) return { ...reconcileSearchOutbox(readSearchOutbox(filePath)).messages.find((candidate) => candidate.message_id === messageId), idempotent: true };
  appendSearchOutboxEvent(
    {
      id,
      event_type: "retry",
      message_id: messageId,
      idempotency_key: key,
      recorded_at: isoTimestamp(recordedAt, "recordedAt"),
    },
    filePath,
  );
  return { ...reconcileSearchOutbox(readSearchOutbox(filePath)).messages.find((candidate) => candidate.message_id === messageId), idempotent: false };
}

export function deleteSearchOutbox(
  messageId,
  { filePath = DEFAULT_SEARCH_OUTBOX_PATH, deleteKey = null, recordedAt = new Date().toISOString() } = {},
) {
  const current = reconcileSearchOutbox(readSearchOutbox(filePath));
  const message = current.messages.find((candidate) => candidate.message_id === messageId);
  if (!message) throw new Error("Search outbox delete requires a known message");
  if (message.deleted) return { ...message, idempotent: true };
  const key = outboxKey(deleteKey || `delete:${messageId}`, "Search outbox delete key");
  appendSearchOutboxEvent(
    {
      id: outboxEventId(messageId, "delete", key),
      event_type: "delete",
      message_id: messageId,
      idempotency_key: key,
      recorded_at: isoTimestamp(recordedAt, "recordedAt"),
    },
    filePath,
  );
  return { ...reconcileSearchOutbox(readSearchOutbox(filePath)).messages.find((candidate) => candidate.message_id === messageId), idempotent: false };
}

export async function processSearchOutbox({
  filePath = DEFAULT_SEARCH_OUTBOX_PATH,
  dispatch,
  maxAttempts = null,
  recordedAt = new Date().toISOString(),
} = {}) {
  if (typeof dispatch !== "function") throw new Error("Search outbox dispatch is required");
  const results = [];
  for (const message of reconcileSearchOutbox(readSearchOutbox(filePath)).pending) {
    if (maxAttempts !== null && message.attempts >= maxAttempts) {
      results.push({ message_id: message.message_id, status: "retry_limit" });
      continue;
    }
    try {
      await dispatch({ ...message, idempotency_key: message.idempotency_key });
      deleteSearchOutbox(message.message_id, {
        filePath,
        deleteKey: `dispatch:${message.message_id}:success`,
        recordedAt,
      });
      results.push({ message_id: message.message_id, status: "deleted" });
    } catch {
      retrySearchOutbox(message.message_id, {
        filePath,
        retryKey: `dispatch:${message.message_id}:${message.attempts + 1}`,
        recordedAt,
      });
      results.push({ message_id: message.message_id, status: "retry_scheduled" });
    }
  }
  return { results, reconciliation: reconcileSearchOutbox(readSearchOutbox(filePath)) };
}

class SearchEngineUnavailableError extends Error {
  constructor(message, { cause } = {}) {
    super(message, { cause });
    this.name = "SearchEngineUnavailableError";
    this.unavailable = true;
  }
}

function isUnavailableStatus(status) {
  return status === 408 || status === 429 || status >= 500;
}

function isUnavailableError(error) {
  return error?.unavailable === true;
}

function missingSearchEngineConfig({ baseUrl, apiKey }) {
  return !String(baseUrl || "").trim() || !String(apiKey || "").trim();
}

async function checkedFetch(fetchImpl, url, options, acceptedStatuses = [200, 201, 202]) {
  const response = await fetchImpl(url, options);
  if (!acceptedStatuses.includes(response.status)) {
    throw new Error(`Search engine sync failed: ${options.method} ${url} returned ${response.status}`);
  }
  return {
    method: options.method,
    url: redactedUrl(url),
    status: response.status,
    bytes: Buffer.byteLength(options.body || ""),
  };
}

async function checkedJson(fetchImpl, url, options, acceptedStatuses = [200]) {
  let response;
  try {
    response = await fetchImpl(url, options);
  } catch (cause) {
    throw new SearchEngineUnavailableError(`Search engine query failed: ${options.method} ${url} could not connect`, { cause });
  }
  if (!acceptedStatuses.includes(response.status)) {
    const error = new Error(`Search engine query failed: ${options.method} ${url} returned ${response.status}`);
    error.unavailable = isUnavailableStatus(response.status);
    throw error;
  }
  let payload;
  try {
    payload = await response.json();
  } catch (cause) {
    throw new SearchEngineUnavailableError(`Search engine query failed: ${options.method} ${url} returned invalid JSON`, { cause });
  }
  return {
    payload,
    operation: {
      method: options.method,
      url: redactedUrl(url),
      status: response.status,
    },
  };
}

function searchHit(doc) {
  return {
    id: doc.id,
    source_listing_id: doc.source_listing_id,
    locale: doc.locale,
    locale_path: doc.locale_path,
    title: doc.title,
  };
}

function assertSearchEngines(report, label) {
  const engines = (report.engines || []).map((engine) => engine.engine).sort();
  if (engines.join("|") !== "meilisearch|typesense") {
    throw new Error(`${label} must cover Typesense and Meilisearch exactly once`);
  }
}

function assertReportUrl(value, label) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must include valid service URL evidence`);
  }
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error(`${label} must include valid service URL evidence`);
  if (parsed.username || parsed.password) throw new Error(`${label} must not include URL credentials`);
}

function targetFieldForEngine(engine) {
  if (engine.engine === "typesense") return "collection";
  if (engine.engine === "meilisearch") return "index";
  throw new Error(`${engine.engine} search report engine is unsupported`);
}

function assertSearchEngineTarget(engine, label) {
  const field = targetFieldForEngine(engine);
  const target = String(engine[field] || "").trim();
  if (!target) throw new Error(`${label} must include ${field} evidence`);
  if (target.includes("/") || target.includes("?") || target.includes("#")) {
    throw new Error(`${label} ${field} evidence must be a target name`);
  }
  return { field, target };
}

function operationUrlsIncludeTarget(engine, target) {
  const encoded = encodeURIComponent(target);
  return (engine.operations || []).some((operation) => {
    try {
      return new URL(operation.url).pathname.split("/").includes(encoded);
    } catch {
      return false;
    }
  });
}

function hasSyncOperation(engine, { method, path, searchParam = null, statuses }) {
  return (engine.operations || []).some((operation) => {
    let parsed;
    try {
      parsed = new URL(operation.url);
    } catch {
      return false;
    }
    return (
      operation.method === method &&
      parsed.pathname === path &&
      (!searchParam || parsed.searchParams.get(searchParam.key) === searchParam.value) &&
      statuses.includes(operation.status)
    );
  });
}

function assertSearchSyncOperations(engine, target) {
  const encoded = encodeURIComponent(target);
  if (engine.engine === "typesense") {
    if (!hasSyncOperation(engine, { method: "POST", path: "/collections", statuses: [200, 201, 409] })) {
      throw new Error("typesense sync report must include collection create operation evidence");
    }
    if (
      !hasSyncOperation(engine, {
        method: "POST",
        path: `/collections/${encoded}/documents/import`,
        searchParam: { key: "action", value: "upsert" },
        statuses: [200, 201, 202],
      })
    ) {
      throw new Error("typesense sync report must include document import operation evidence");
    }
    return;
  }
  if (engine.engine === "meilisearch") {
    if (!hasSyncOperation(engine, { method: "PATCH", path: `/indexes/${encoded}/settings`, statuses: [200, 201, 202] })) {
      throw new Error("meilisearch sync report must include settings operation evidence");
    }
    if (
      !hasSyncOperation(engine, {
        method: "POST",
        path: `/indexes/${encoded}/documents`,
        searchParam: { key: "primaryKey", value: "meili_id" },
        statuses: [200, 201, 202],
      })
    ) {
      throw new Error("meilisearch sync report must include document import operation evidence");
    }
  }
}

function assertSearchQueryOperation(engine, target) {
  const operation = engine.operation || {};
  assertReportUrl(operation.url, `${engine.engine} query operation`);
  let parsed;
  try {
    parsed = new URL(operation.url);
  } catch {
    throw new Error(`${engine.engine} query operation must include valid service URL evidence`);
  }
  const encoded = encodeURIComponent(target);
  if (engine.engine === "typesense") {
    if (
      operation.method !== "GET" ||
      operation.status !== 200 ||
      parsed.pathname !== `/collections/${encoded}/documents/search` ||
      !parsed.searchParams.get("q") ||
      !parsed.searchParams.get("filter_by")
    ) {
      throw new Error("typesense query report must include document search operation evidence");
    }
    return;
  }
  if (engine.engine === "meilisearch") {
    if (operation.method !== "POST" || operation.status !== 200 || parsed.pathname !== `/indexes/${encoded}/search`) {
      throw new Error("meilisearch query report must include index search operation evidence");
    }
  }
}

function searchEngineTargets(engines) {
  return Object.fromEntries(engines.map((engine) => [engine.engine, engine.collection || engine.index]));
}

export async function syncTypesense({
  baseUrl = process.env.TYPESENSE_URL,
  apiKey = process.env.TYPESENSE_API_KEY,
  collectionName = process.env.TYPESENSE_COLLECTION || "ms_realty_listings",
  dataDir = DEFAULT_SEARCH_DATA_DIR,
  documents = null,
  schema: suppliedSchema = null,
  fetchImpl = globalThis.fetch,
} = {}) {
  required(baseUrl, "TYPESENSE_URL");
  required(apiKey, "TYPESENSE_API_KEY");
  if (typeof fetchImpl !== "function") throw new Error("fetch is required for Typesense sync");

  const schema = { ...(suppliedSchema || readJson(path.join(dataDir, "typesense-schema.json"))), name: collectionName };
  const body = documents === null ? readBody(path.join(dataDir, "typesense-listings.jsonl")) : documentsToJsonl(documents);
  const headers = { "content-type": "application/json", "x-typesense-api-key": apiKey };
  const operations = [
    await checkedFetch(
      fetchImpl,
      joinUrl(baseUrl, "/collections"),
      { method: "POST", headers, body: JSON.stringify(schema) },
      [200, 201, 409],
    ),
    await checkedFetch(fetchImpl, joinUrl(baseUrl, `/collections/${encodeURIComponent(collectionName)}/documents/import?action=upsert`), {
      method: "POST",
      headers: { "x-typesense-api-key": apiKey, "content-type": "application/x-ndjson" },
      body,
    }),
  ];

  return {
    engine: "typesense",
    collection: collectionName,
    documents: rowCount(body),
    operations,
  };
}

export async function syncMeilisearch({
  baseUrl = process.env.MEILI_URL,
  apiKey = process.env.MEILI_API_KEY,
  indexName = process.env.MEILI_INDEX || "ms_realty_listings",
  dataDir = DEFAULT_SEARCH_DATA_DIR,
  documents = null,
  settings: suppliedSettings = null,
  fetchImpl = globalThis.fetch,
} = {}) {
  required(baseUrl, "MEILI_URL");
  required(apiKey, "MEILI_API_KEY");
  if (typeof fetchImpl !== "function") throw new Error("fetch is required for Meilisearch sync");

  const settings = suppliedSettings || readJson(path.join(dataDir, "meilisearch-settings.json"));
  const body = meilisearchImportBody(
    documents === null ? readBody(path.join(dataDir, "meilisearch-listings.ndjson")) : documentsToJsonl(documents),
  );
  const auth = { authorization: `Bearer ${apiKey}` };
  const operations = [
    await checkedFetch(fetchImpl, joinUrl(baseUrl, `/indexes/${encodeURIComponent(indexName)}/settings`), {
      method: "PATCH",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify(settings),
    }),
    await checkedFetch(fetchImpl, joinUrl(baseUrl, `/indexes/${encodeURIComponent(indexName)}/documents?primaryKey=meili_id`), {
      method: "POST",
      headers: { ...auth, "content-type": "application/x-ndjson" },
      body,
    }),
  ];

  return {
    engine: "meilisearch",
    index: indexName,
    documents: rowCount(body),
    operations,
  };
}

export async function runSearchEngineSync({
  typesense = {},
  meilisearch = {},
  fetchImpl = globalThis.fetch,
  generatedAt = "2026-07-06T00:00:00Z",
} = {}) {
  const engines = [
    await syncTypesense({ ...typesense, fetchImpl }),
    await syncMeilisearch({ ...meilisearch, fetchImpl }),
  ];

  return {
    generated_at: generatedAt,
    summary: {
      engines: engines.length,
      targets: searchEngineTargets(engines),
      documents_per_engine: engines.map((engine) => engine.documents),
      total_operations: engines.reduce((sum, engine) => sum + engine.operations.length, 0),
    },
    engines,
  };
}

export function assertSearchEngineSyncReport(report) {
  if (!report.generated_at || Number.isNaN(Date.parse(report.generated_at))) {
    throw new Error("Search sync report must include valid generated_at");
  }
  if (report.summary.engines !== 2) throw new Error("Search sync must cover Typesense and Meilisearch");
  if (report.summary.total_operations !== 4) throw new Error("Search sync must perform four engine operations");
  assertSearchEngines(report, "Search sync");
  if (JSON.stringify(report.summary.documents_per_engine) !== JSON.stringify(report.engines.map((engine) => engine.documents))) {
    throw new Error("Search sync summary documents must match engine rows");
  }
  const operationCount = report.engines.reduce((sum, engine) => sum + (engine.operations || []).length, 0);
  if (report.summary.total_operations !== operationCount) throw new Error("Search sync summary operations must match engine rows");
  for (const engine of report.engines) {
    const { target } = assertSearchEngineTarget(engine, `${engine.engine} sync report`);
    if (report.summary.targets?.[engine.engine] !== target) throw new Error("Search sync summary targets must match engine rows");
    if (!operationUrlsIncludeTarget(engine, target)) {
      throw new Error(`${engine.engine} sync report must include operation URL evidence for its target`);
    }
    if (engine.documents !== 167) throw new Error(`${engine.engine} must sync 167 locale-scoped documents`);
    for (const operation of engine.operations || []) {
      assertReportUrl(operation.url, `${engine.engine} sync operation`);
      if (!["PATCH", "POST"].includes(operation.method)) throw new Error(`${engine.engine} sync operation method is invalid`);
      if (![200, 201, 202, 409].includes(operation.status)) throw new Error(`${engine.engine} sync operation status is invalid`);
    }
    if (engine.operations.some((operation) => operation.bytes <= 0)) {
      throw new Error(`${engine.engine} operations must send non-empty request bodies`);
    }
    assertSearchSyncOperations(engine, target);
  }
  return true;
}

export function writeSearchEngineSyncReport(report, filePath = DEFAULT_SEARCH_ENGINE_SYNC_REPORT) {
  assertSearchEngineSyncReport(report);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(report, null, 2)}\n`);
  return filePath;
}

export async function queryTypesense({
  baseUrl = process.env.TYPESENSE_URL,
  apiKey = process.env.TYPESENSE_API_KEY,
  collectionName = process.env.TYPESENSE_COLLECTION || "ms_realty_listings",
  q = "Sandanski",
  filterBy = "translation_indexable:=true && locale:=bg && source_listing_id:=MS-CRAWL-0001",
  perPage = 5,
  exactReference = null,
  sortBy = null,
  queryBy = null,
  fetchImpl = globalThis.fetch,
} = {}) {
  required(baseUrl, "TYPESENSE_URL");
  required(apiKey, "TYPESENSE_API_KEY");
  if (typeof fetchImpl !== "function") throw new Error("fetch is required for Typesense query");

  const reference = optionalText(exactReference);
  const queryFields = optionalText(queryBy) || (reference ? "listing_reference,source_listing_id" : "title,description,search_text,location_label,listing_reference");
  const params = new URLSearchParams({
    q: reference || String(q || "").trim() || "*",
    query_by: queryFields,
    filter_by: filterBy,
    per_page: String(perPage),
  });
  if (reference) {
    params.set("num_typos", "0");
    params.set("drop_tokens_threshold", "0");
  }
  if (sortBy) params.set("sort_by", sortBy);
  const { payload, operation } = await checkedJson(
    fetchImpl,
    joinUrl(baseUrl, `/collections/${encodeURIComponent(collectionName)}/documents/search?${params}`),
    { method: "GET", headers: { "x-typesense-api-key": apiKey } },
  );

  return {
    engine: "typesense",
    service_url: redactedUrl(baseUrl),
    collection: collectionName,
    query: q,
    filter: filterBy,
    operation,
    total: Number(payload.found || 0),
    hits: (payload.hits || []).map((hit) => searchHit(hit.document || hit)),
  };
}

export async function queryMeilisearch({
  baseUrl = process.env.MEILI_URL,
  apiKey = process.env.MEILI_API_KEY,
  indexName = process.env.MEILI_INDEX || "ms_realty_listings",
  q = "Sandanski",
  filter = 'translation_indexable = true AND locale = bg AND source_listing_id = "MS-CRAWL-0001"',
  limit = 5,
  fetchImpl = globalThis.fetch,
} = {}) {
  required(baseUrl, "MEILI_URL");
  required(apiKey, "MEILI_API_KEY");
  if (typeof fetchImpl !== "function") throw new Error("fetch is required for Meilisearch query");

  const { payload, operation } = await checkedJson(fetchImpl, joinUrl(baseUrl, `/indexes/${encodeURIComponent(indexName)}/search`), {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ q, filter, limit }),
  });

  return {
    engine: "meilisearch",
    service_url: redactedUrl(baseUrl),
    index: indexName,
    query: q,
    filter,
    operation,
    total: Number(payload.estimatedTotalHits ?? payload.totalHits ?? 0),
    hits: (payload.hits || []).map(searchHit),
  };
}

function normalizedLocaleCodes(localeCodes) {
  const codes = [...new Set((localeCodes || []).map((code) => String(code || "").trim()).filter(Boolean))];
  if (!codes.length) throw new Error("Public search requires at least one locale code");
  return codes;
}

function typesenseLiteral(value) {
  return `\`${String(value).replace(/\\/g, "\\\\").replace(/`/g, "\\`")}\``;
}

function typesensePublicFilter(localeCodes) {
  const localeFilter = localeCodes.map((locale) => `locale:=${typesenseLiteral(locale)}`).join(" || ");
  return [
    "publication_state:=published",
    "(listing_status:=available || listing_status:=reserved)",
    "translation_indexable:=true",
    "translation_human_approved:=true",
    "locale_indexable:=true",
    localeCodes.length === 1 ? localeFilter : `(${localeFilter})`,
  ].join(" && ");
}

function meilisearchPublicFilter(localeCodes) {
  const localeFilter = localeCodes.map((locale) => `locale = ${JSON.stringify(locale)}`).join(" OR ");
  return [
    'publication_state = "published"',
    '(listing_status = "available" OR listing_status = "reserved")',
    "translation_indexable = true",
    "translation_human_approved = true",
    "locale_indexable = true",
    localeCodes.length === 1 ? localeFilter : `(${localeFilter})`,
  ].join(" AND ");
}

function typesenseOneOf(field, values = []) {
  if (!values.length) return null;
  const clauses = values.map((value) => `${field}:=${typesenseLiteral(value)}`);
  return clauses.length === 1 ? clauses[0] : `(${clauses.join(" || ")})`;
}

function typesenseRange(field, min, max) {
  const clauses = [];
  if (min !== null && min !== undefined) clauses.push(`${field}:>=${Number(min)}`);
  if (max !== null && max !== undefined) clauses.push(`${field}:<=${Number(max)}`);
  return clauses.length ? clauses.join(" && ") : null;
}

function typesenseLocationFilter(locationIds = []) {
  if (!locationIds.length) return null;
  const clauses = locationIds.map(
    (location) => `(location_id:=${typesenseLiteral(location)} || location_label:=${typesenseLiteral(location)})`,
  );
  return clauses.length === 1 ? clauses[0] : `(${clauses.join(" || ")})`;
}

function backendIntent(intent, localeCodes) {
  if (!intent) return null;
  const mapBounds = intent.map_bounds;
  return normalizeSearchIntent(
    {
      ...intent,
      ...(plainObject(mapBounds) ? { map_bounds: [mapBounds.west, mapBounds.south, mapBounds.east, mapBounds.north] } : {}),
    },
    { defaultLocale: intent.locale || localeCodes[0] },
  );
}

function typesenseSortFor(intent) {
  if (intent?.sort === "price_asc") return "price_amount:asc";
  if (intent?.sort === "price_desc") return "price_amount:desc";
  return null;
}

/** Builds Typesense syntax exclusively from a validated SearchIntent. */
export function typesenseFilterForIntent(intent, localeCodes) {
  const normalizedLocales = normalizedLocaleCodes(localeCodes);
  const normalized = backendIntent(intent, normalizedLocales);
  const filters = [typesensePublicFilter(normalizedLocales)];
  if (!normalized) return filters[0];

  const exactReference = optionalText(normalized.exact_reference);
  if (exactReference) {
    filters.push(`(listing_reference:=${typesenseLiteral(exactReference)} || source_listing_id:=${typesenseLiteral(exactReference)})`);
  }
  for (const [field, values] of [
    ["property_family", normalized.property_families],
    ["property_subtype", normalized.property_subtypes],
    ["parking_kind", normalized.parking_kinds],
    ["construction_status", normalized.construction_statuses],
  ]) {
    const filter = typesenseOneOf(field, values);
    if (filter) filters.push(filter);
  }
  const locationFilter = typesenseLocationFilter(normalized.location_ids);
  if (locationFilter) filters.push(locationFilter);
  for (const [field, min, max] of [
    ["price_amount", normalized.price_min, normalized.price_max],
    ["bedrooms_count", normalized.bedrooms_min, normalized.bedrooms_max],
    ["primary_area_sqm", normalized.primary_area_min, normalized.primary_area_max],
    ["land_area_sqm", normalized.land_area_min, normalized.land_area_max],
    ["floor_number", normalized.floor_min, normalized.floor_max],
    ["storeys_count", normalized.storeys_min, normalized.storeys_max],
  ]) {
    const filter = typesenseRange(field, min, max);
    if (filter) filters.push(filter);
  }
  for (const [field, min] of [
    ["premises_count", normalized.premises_min],
    ["hotel_room_count", normalized.hotel_rooms_min],
  ]) {
    const filter = typesenseRange(field, min, null);
    if (filter) filters.push(filter);
  }
  if (normalized.offer_type) filters.push(`offer_type:=${typesenseLiteral(normalized.offer_type)}`);
  if (normalized.price_period) filters.push(`price_period:=${typesenseLiteral(normalized.price_period)}`);
  if (normalized.has_approved_tour === true) filters.push("has_approved_tour:=true");
  if (normalized.map_bounds) {
    const { west, south, east, north } = normalized.map_bounds;
    filters.push(`public_longitude:>=${west} && public_longitude:<=${east}`);
    filters.push(`public_latitude:>=${south} && public_latitude:<=${north}`);
  }
  return filters.join(" && ");
}

function meilisearchOneOf(field, values = []) {
  if (!values.length) return null;
  const clauses = values.map((value) => `${field} = ${JSON.stringify(value)}`);
  return clauses.length === 1 ? clauses[0] : `(${clauses.join(" OR ")})`;
}

function meilisearchRange(field, min, max) {
  const clauses = [];
  if (min !== null && min !== undefined) clauses.push(`${field} >= ${Number(min)}`);
  if (max !== null && max !== undefined) clauses.push(`${field} <= ${Number(max)}`);
  return clauses.length ? clauses.join(" AND ") : null;
}

function meilisearchFilterForIntent(intent, localeCodes) {
  const normalizedLocales = normalizedLocaleCodes(localeCodes);
  const normalized = backendIntent(intent, normalizedLocales);
  const filters = [meilisearchPublicFilter(normalizedLocales)];
  if (!normalized) return filters[0];
  if (normalized.exact_reference) {
    const reference = JSON.stringify(normalized.exact_reference);
    filters.push(`(listing_reference = ${reference} OR source_listing_id = ${reference})`);
  }
  for (const [field, values] of [
    ["property_family", normalized.property_families],
    ["property_subtype", normalized.property_subtypes],
    ["parking_kind", normalized.parking_kinds],
    ["construction_status", normalized.construction_statuses],
  ]) {
    const filter = meilisearchOneOf(field, values);
    if (filter) filters.push(filter);
  }
  if (normalized.location_ids.length) {
    const ids = normalized.location_ids.flatMap((value) => [
      `location_id = ${JSON.stringify(value)}`,
      `location_label = ${JSON.stringify(value)}`,
    ]);
    filters.push(`(${ids.join(" OR ")})`);
  }
  for (const [field, min, max] of [
    ["price_amount", normalized.price_min, normalized.price_max],
    ["bedrooms_count", normalized.bedrooms_min, normalized.bedrooms_max],
    ["primary_area_sqm", normalized.primary_area_min, normalized.primary_area_max],
    ["land_area_sqm", normalized.land_area_min, normalized.land_area_max],
    ["floor_number", normalized.floor_min, normalized.floor_max],
    ["storeys_count", normalized.storeys_min, normalized.storeys_max],
    ["premises_count", normalized.premises_min, null],
    ["hotel_room_count", normalized.hotel_rooms_min, null],
  ]) {
    const filter = meilisearchRange(field, min, max);
    if (filter) filters.push(filter);
  }
  if (normalized.offer_type) filters.push(`offer_type = ${JSON.stringify(normalized.offer_type)}`);
  if (normalized.price_period) filters.push(`price_period = ${JSON.stringify(normalized.price_period)}`);
  if (normalized.has_approved_tour === true) filters.push("has_approved_tour = true");
  if (normalized.map_bounds) {
    const { west, south, east, north } = normalized.map_bounds;
    filters.push(`public_longitude >= ${west} AND public_longitude <= ${east}`);
    filters.push(`public_latitude >= ${south} AND public_latitude <= ${north}`);
  }
  return filters.join(" AND ");
}

export async function queryPublicSearch({
  typesense = {},
  meilisearch = {},
  engine = process.env.MS_REALTY_SEARCH_ENGINE,
  environment = process.env.NODE_ENV,
  q = "",
  intent = null,
  localeCodes,
  perPage = 250,
  fetchImpl = globalThis.fetch,
} = {}) {
  const normalizedLocales = normalizedLocaleCodes(localeCodes);
  const normalizedIntent = backendIntent(intent, normalizedLocales);
  const query = normalizedIntent?.exact_reference || normalizedIntent?.text_query || q;
  const typesenseFilter = typesenseFilterForIntent(normalizedIntent, normalizedLocales);
  const meilisearchFilter = meilisearchFilterForIntent(normalizedIntent, normalizedLocales);
  const typesenseSort = typesenseSortFor(normalizedIntent);
  const runtime = selectSearchRuntime({ engine, environment, typesense, meilisearch });
  if (runtime.engine) {
    const selected = runtime.engine;
    const config = selected === "typesense" ? typesense : meilisearch;
    if (missingSearchEngineConfig(config)) {
      return {
        engine: "seed_fallback",
        total: null,
        hits: [],
        locale_codes: normalizedLocales,
        unavailable_engines: [selected],
      };
    }
    try {
      const result =
        selected === "typesense"
          ? await queryTypesense({
              ...typesense,
              q: query,
              filterBy: typesenseFilter,
              perPage,
              exactReference: normalizedIntent?.exact_reference,
              sortBy: typesenseSort,
              fetchImpl,
            })
          : await queryMeilisearch({
              ...meilisearch,
              q: query,
              filter: meilisearchFilter,
              limit: perPage,
              fetchImpl,
            });
      return {
        engine: selected,
        total: result.total,
        hits: result.hits,
        locale_codes: normalizedLocales,
        unavailable_engines: [],
      };
    } catch (error) {
      if (!isUnavailableError(error)) throw error;
      if (productionEnvironment(environment)) throw new Error(`Selected search engine ${selected} is unavailable`);
      return {
        engine: "seed_fallback",
        total: null,
        hits: [],
        locale_codes: normalizedLocales,
        unavailable_engines: [selected],
      };
    }
  }
  const unavailableEngines = [];

  if (missingSearchEngineConfig(typesense)) {
    unavailableEngines.push("typesense");
  } else {
    try {
      const result = await queryTypesense({
        ...typesense,
        q: query,
        filterBy: typesenseFilter,
        perPage,
        exactReference: normalizedIntent?.exact_reference,
        sortBy: typesenseSort,
        fetchImpl,
      });
      return {
        engine: "typesense",
        total: result.total,
        hits: result.hits,
        locale_codes: normalizedLocales,
        unavailable_engines: unavailableEngines,
      };
    } catch (error) {
      if (!isUnavailableError(error)) throw error;
      unavailableEngines.push("typesense");
    }
  }

  if (missingSearchEngineConfig(meilisearch)) {
    unavailableEngines.push("meilisearch");
  } else {
    try {
      const result = await queryMeilisearch({
        ...meilisearch,
        q: query,
        filter: meilisearchFilter,
        limit: perPage,
        fetchImpl,
      });
      return {
        engine: "meilisearch",
        total: result.total,
        hits: result.hits,
        locale_codes: normalizedLocales,
        unavailable_engines: unavailableEngines,
      };
    } catch (error) {
      if (!isUnavailableError(error)) throw error;
      unavailableEngines.push("meilisearch");
    }
  }

  return {
    engine: "seed_fallback",
    total: null,
    hits: [],
    locale_codes: normalizedLocales,
    unavailable_engines: unavailableEngines,
  };
}

export async function runSearchEngineQuerySmoke({
  typesense = {},
  meilisearch = {},
  fetchImpl = globalThis.fetch,
  generatedAt = "2026-07-06T00:00:00Z",
} = {}) {
  const engines = [
    await queryTypesense({ ...typesense, fetchImpl }),
    await queryMeilisearch({ ...meilisearch, fetchImpl }),
  ];
  return {
    generated_at: generatedAt,
    summary: {
      engines: engines.length,
      targets: searchEngineTargets(engines),
      total_hits: engines.reduce((sum, engine) => sum + engine.total, 0),
      first_hit_ids: engines.map((engine) => engine.hits[0]?.id || null),
    },
    engines,
  };
}

export function assertSearchEngineQueryReport(report) {
  if (!report.generated_at || Number.isNaN(Date.parse(report.generated_at))) {
    throw new Error("Search query smoke report must include valid generated_at");
  }
  if (report.summary.engines !== 2) throw new Error("Search query smoke must cover Typesense and Meilisearch");
  assertSearchEngines(report, "Search query smoke");
  const totalHits = report.engines.reduce((sum, engine) => sum + engine.total, 0);
  if (report.summary.total_hits !== totalHits) throw new Error("Search query summary hits must match engine rows");
  if (JSON.stringify(report.summary.first_hit_ids) !== JSON.stringify(report.engines.map((engine) => engine.hits?.[0]?.id || null))) {
    throw new Error("Search query summary first hits must match engine rows");
  }
  for (const engine of report.engines) {
    assertReportUrl(engine.service_url, `${engine.engine} query report`);
    const { target } = assertSearchEngineTarget(engine, `${engine.engine} query report`);
    if (report.summary.targets?.[engine.engine] !== target) throw new Error("Search query summary targets must match engine rows");
    assertSearchQueryOperation(engine, target);
    if (!String(engine.query || "").trim()) throw new Error(`${engine.engine} query report must include query evidence`);
    if (
      !String(engine.filter || "").includes("translation_indexable") ||
      !String(engine.filter || "").includes("locale") ||
      !String(engine.filter || "").includes("source_listing_id")
    ) {
      throw new Error(`${engine.engine} query report must prove reviewed locale filtering`);
    }
    if (engine.total < 1 || !engine.hits.length) throw new Error(`${engine.engine} query must return search hits`);
    if (!engine.hits.some((hit) => hit.id === "MS-CRAWL-0001:bg")) {
      throw new Error(`${engine.engine} query must find the reviewed BG listing document`);
    }
    if (engine.hits.some((hit) => hit.locale === "fr")) throw new Error(`${engine.engine} query must not return draft French docs`);
  }
  return true;
}

export function writeSearchEngineQueryReport(report, filePath = DEFAULT_SEARCH_ENGINE_QUERY_REPORT) {
  assertSearchEngineQueryReport(report);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(report, null, 2)}\n`);
  return filePath;
}
