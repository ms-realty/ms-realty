import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { derivePrimaryAreaSqm } from "./listing-facts.mjs";
import { fromRoot } from "./paths.mjs";
import { loadPayloadCmsImportRuntime } from "./payload-cms-import.mjs";
import { foldSearchText } from "./search-fold.mjs";
import { normalizeSearchIntent } from "./search-intent.mjs";
import {
  fetchSearchService,
  privateSearchServiceNetworkAllowed,
  readBoundedJsonResponse,
  SEARCH_QUERY_MAX_BYTES,
  SearchServiceConfigurationError,
} from "./search-service-http.mjs";
import { createLedgerStore } from "./sqlite-ledger.mjs";

export const DEFAULT_SEARCH_DATA_DIR = fromRoot("search", "data");
export const DEFAULT_SEARCH_ENGINE_SYNC_REPORT = fromRoot("production", "data", "search-engine-sync-report.json");
export const DEFAULT_SEARCH_ENGINE_SYNC_SMOKE = fromRoot("production", "data", "search-engine-sync-smoke.json");
export const DEFAULT_SEARCH_ENGINE_QUERY_REPORT = fromRoot("production", "data", "search-engine-query-report.json");
export const DEFAULT_SEARCH_ENGINE_QUERY_SMOKE = fromRoot("production", "data", "search-engine-query-smoke.json");
export const DEFAULT_SEARCH_OUTBOX_PATH = fromRoot("production", "data", "search-outbox.jsonl");

const SEARCH_ENGINES = new Set(["postgres", "typesense", "meilisearch"]);
const APPROVED_PUBLICATION_STATE = "published";
const BROKER_VERIFIED = "broker_verified";
const MAX_PUBLIC_SEARCH_HITS = 250;
const POSTGRES_PUBLIC_SEARCH_VIEW = "ms_realty_public_search_documents";
const POSTGRES_PUBLIC_SEARCH_CARD_COLUMNS = Object.freeze([
  "id",
  "source_listing_id",
  "listing_reference",
  "locale",
  "locale_path",
  "title",
  "description",
  "property_family",
  "property_subtype",
  "location_label",
  "municipality",
  "district",
  "region_id",
  "country_code",
  "geography_id",
  "geography_path",
  "price_amount",
  "price_currency",
  "price_on_request",
  "offer_type",
  "listing_status",
  "bedrooms_count",
  "primary_area_sqm",
  "condition",
  "public_latitude",
  "public_longitude",
  "public_location_precision",
]);
const POSTGRES_VIEW_COLUMNS = Object.freeze([
  "id",
  "source_listing_id",
  "listing_reference",
  "locale",
  "locale_path",
  "title",
  "publication_state",
  "translation_human_approved",
  "locale_indexable",
  "translation_indexable",
  "search_text",
  "description",
  "has_approved_tour",
  "property_family",
  "property_subtype",
  "location_id",
  "location_label",
  "municipality",
  "district",
  "region_id",
  "country_code",
  "geography_id",
  "geography_path",
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
  "primary_area_sqm",
  "parking_kind",
  "condition",
  "construction_status",
  "zoning_status",
  "utilities_status",
  "road_access_status",
  "land_category",
  "permanent_use",
  "permitted_use",
  "public_latitude",
  "public_longitude",
  "public_location_precision",
]);
const SEARCH_QUERY_TIMEOUT_MS = 4_000;
const SEARCH_SYNC_TIMEOUT_MS = 20_000;
const SEARCH_OUTBOX_EVENT_TYPES = new Set(["enqueue", "retry", "delete"]);
const SEARCH_OUTBOX_STORE = createLedgerStore({
  name: "search_outbox",
  columns: ["id", "message_id", "event_type", "idempotency_key", "recorded_at"],
  indexes: ["message_id", "idempotency_key"],
});

// ponytail: this is a single-host JSONL/SQLite outbox; move to a shared transactional store before multiple workers write it.

let postgresSqlModulePromise = null;

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

function redactedUrl(value) {
  const parsed = new URL(value);
  parsed.username = "";
  parsed.password = "";
  parsed.hash = "";
  return parsed.href;
}

function redactedDatabaseTarget(value) {
  const parsed = new URL(required(value, "DATABASE_URL"));
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) throw new Error("DATABASE_URL must use postgres:// or postgresql://");
  return `${parsed.protocol}//${parsed.hostname}:${Number(parsed.port || 5432)}/${parsed.pathname.replace(/^\//, "")}`;
}

async function loadPostgresSql() {
  postgresSqlModulePromise ??= import("@payloadcms/db-postgres");
  const module = await postgresSqlModulePromise;
  if (typeof module?.sql !== "function") throw new Error("@payloadcms/db-postgres did not expose sql");
  return module.sql;
}

function foldedTokens(value) {
  return foldSearchText(value).split(/\s+/u).filter(Boolean);
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
  "municipality",
  "district",
  "region_id",
  "country_code",
  "geography_id",
  "geography_path",
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
    ["municipality", "string"],
    ["district", "string"],
    ["region_id", "string"],
    ["country_code", "string"],
    ["geography_id", "string"],
    ["geography_path", "string[]"],
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
    "municipality",
    "district",
    "region_id",
    "country_code",
    "geography_id",
    "geography_path",
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
    searchableAttributes: ["title", "description", "search_text", "location_label", "municipality", "district", "listing_reference"],
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

function liveProjection(projection) {
  if (projection === null || projection === undefined) return null;
  if (!plainObject(projection) || projection.schema_version !== 1 || !Array.isArray(projection.documents)) {
    throw new Error("Live search sync requires an approved search projection");
  }
  const source = projection.source;
  if (
    !plainObject(source) ||
    source.kind !== "payload_postgres" ||
    source.authoritative !== true ||
    source.projected_documents !== projection.documents.length ||
    !/^[a-f0-9]{64}$/.test(String(source.digest || ""))
  ) {
    throw new Error("Live search sync requires authoritative Payload projection evidence");
  }
  return projection;
}

function fixtureSource(projectedDocuments) {
  return { kind: "search_fixture", authoritative: false, projected_documents: projectedDocuments };
}

function assertSearchReportSource(report, label) {
  if (!["live", "smoke"].includes(report.evidence_scope)) throw new Error(`${label} must declare live or smoke evidence scope`);
  if (!plainObject(report.source) || !Number.isInteger(report.source.projected_documents) || report.source.projected_documents < 0) {
    throw new Error(`${label} must include projected document source evidence`);
  }
  if (report.evidence_scope === "live") {
    if (
      report.source.kind !== "payload_postgres" ||
      report.source.authoritative !== true ||
      !/^[a-f0-9]{64}$/.test(String(report.source.digest || ""))
    ) {
      throw new Error(`${label} live evidence must use an authoritative Payload projection`);
    }
  } else if (report.source.kind !== "search_fixture" || report.source.authoritative !== false) {
    throw new Error(`${label} smoke evidence must identify its search fixture`);
  }
  return report.source;
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
  if (engine && !SEARCH_ENGINES.has(engine)) throw new Error("MS_REALTY_SEARCH_ENGINE must be postgres, typesense, or meilisearch");
  return engine || null;
}

function productionEnvironment(value) {
  return String(value || "").trim().toLowerCase() === "production";
}

export function selectSearchRuntime({
  engine = process.env.MS_REALTY_SEARCH_ENGINE,
  environment = process.env.NODE_ENV,
  postgres = {},
  typesense = {},
  meilisearch = {},
} = {}) {
  const selected = normalizedSearchEngine(engine);
  const production = productionEnvironment(environment);
  if (selected === "postgres") {
    if (missingPostgresSearchConfig(postgres)) {
      if (production) throw new Error("Payload Postgres search configuration is required in production");
      return { engine: "postgres", mode: "local_fallback" };
    }
    return { engine: "postgres", mode: "single" };
  }
  if (!selected) {
    if (!missingPostgresSearchConfig(postgres)) return { engine: "postgres", mode: production ? "single" : "authoritative_local" };
    if (production) throw new Error("Payload Postgres search is required in production");
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
  return checkedFetch(
    fetchImpl,
    config.baseUrl,
    plan.activation.path,
    {
      method: plan.activation.method,
      headers,
      body: JSON.stringify(plan.activation.body),
    },
    [200, 201, 202],
    config,
  );
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

function missingSearchEngineConfig({ baseUrl, apiKey, queryApiKey }) {
  return !String(baseUrl || "").trim() || !String(queryApiKey || apiKey || "").trim();
}

function missingPostgresSearchConfig({ payload, queryImpl, loadPayloadRuntime, env = process.env } = {}) {
  if (payload || typeof queryImpl === "function" || typeof loadPayloadRuntime === "function") return false;
  return !String(env?.DATABASE_URL || "").trim() || !String(env?.PAYLOAD_SECRET || "").trim();
}

async function checkedFetch(
  fetchImpl,
  baseUrl,
  route,
  options,
  acceptedStatuses = [200, 201, 202],
  { allowPrivateNetwork = privateSearchServiceNetworkAllowed(), lookupImpl, timeoutMs = SEARCH_SYNC_TIMEOUT_MS } = {},
) {
  const { response, url, clearDeadline } = await fetchSearchService({
    baseUrl,
    route,
    fetchImpl,
    lookupImpl,
    allowPrivateNetwork,
    timeoutMs,
    options,
  });
  try {
    if (!acceptedStatuses.includes(response.status)) {
      throw new Error(`Search engine sync failed: ${options.method} ${url} returned ${response.status}`);
    }
    return {
      method: options.method,
      url: redactedUrl(url),
      status: response.status,
      bytes: Buffer.byteLength(options.body || ""),
    };
  } finally {
    clearDeadline();
  }
}

async function checkedJson(
  fetchImpl,
  baseUrl,
  route,
  options,
  acceptedStatuses = [200],
  { allowPrivateNetwork = privateSearchServiceNetworkAllowed(), lookupImpl, timeoutMs = SEARCH_QUERY_TIMEOUT_MS } = {},
) {
  let response;
  let url;
  let clearDeadline = () => {};
  try {
    ({ response, url, clearDeadline } = await fetchSearchService({
      baseUrl,
      route,
      fetchImpl,
      lookupImpl,
      allowPrivateNetwork,
      timeoutMs,
      options,
    }));
  } catch (cause) {
    if (cause instanceof SearchServiceConfigurationError) throw cause;
    throw new SearchEngineUnavailableError(`Search engine query failed: ${options.method} ${baseUrl} could not connect`, { cause });
  }
  try {
    if (!acceptedStatuses.includes(response.status)) {
      const error = new Error(`Search engine query failed: ${options.method} ${url} returned ${response.status}`);
      error.unavailable = isUnavailableStatus(response.status);
      throw error;
    }
    let payload;
    try {
      payload = await readBoundedJsonResponse(response, { maxBytes: SEARCH_QUERY_MAX_BYTES, label: "Search engine query" });
    } catch (cause) {
      throw new SearchEngineUnavailableError(
        `Search engine query failed: ${options.method} ${url} returned invalid JSON: ${cause.message}`,
        { cause },
      );
    }
    return {
      payload,
      operation: {
        method: options.method,
        url: redactedUrl(url),
        status: response.status,
      },
    };
  } finally {
    clearDeadline();
  }
}

function boundedSearchLimit(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > MAX_PUBLIC_SEARCH_HITS) {
    throw new Error(`${label} must be an integer from 1 to ${MAX_PUBLIC_SEARCH_HITS}`);
  }
  return number;
}

function responseHitText(value, label, maxLength, { required: isRequired = false } = {}) {
  if (value === null || value === undefined || value === "") {
    if (isRequired) throw new SearchEngineUnavailableError(`Search engine response is missing ${label}`);
    return undefined;
  }
  if (typeof value !== "string" || value.length > maxLength) {
    throw new SearchEngineUnavailableError(`Search engine response has invalid ${label}`);
  }
  return value;
}

function searchHit(doc) {
  if (!plainObject(doc)) throw new SearchEngineUnavailableError("Search engine response contains an invalid hit");
  const id = responseHitText(doc.id, "hit id", 256);
  const sourceListingId = responseHitText(doc.source_listing_id, "source listing id", 256);
  if (!id && !sourceListingId) {
    throw new SearchEngineUnavailableError("Search engine response is missing a hit identifier");
  }
  return {
    id,
    source_listing_id: sourceListingId,
    locale: responseHitText(doc.locale, "locale", 32),
    locale_path: responseHitText(doc.locale_path, "locale path", 2048),
    title: responseHitText(doc.title, "title", 1000),
  };
}

function boundedSearchResponse(payload, { engine, limit }) {
  if (!plainObject(payload) || !Array.isArray(payload.hits)) {
    throw new SearchEngineUnavailableError(`${engine} response must include a hits array`);
  }
  if (payload.hits.length > limit || payload.hits.length > MAX_PUBLIC_SEARCH_HITS) {
    throw new SearchEngineUnavailableError(`${engine} response returned more than ${limit} hits`);
  }
  const rawTotal = engine === "Typesense" ? payload.found ?? 0 : payload.estimatedTotalHits ?? payload.totalHits ?? 0;
  if (!Number.isSafeInteger(rawTotal) || rawTotal < payload.hits.length) {
    throw new SearchEngineUnavailableError(`${engine} response has an invalid total hit count`);
  }
  return { hits: payload.hits, total: rawTotal };
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
      engine.documents > 0 &&
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
      engine.documents > 0 &&
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
  lookupImpl,
  allowPrivateNetwork = privateSearchServiceNetworkAllowed(),
  timeoutMs = SEARCH_SYNC_TIMEOUT_MS,
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
      baseUrl,
      "/collections",
      { method: "POST", headers, body: JSON.stringify(schema) },
      [200, 201, 409],
      { allowPrivateNetwork, lookupImpl, timeoutMs },
    ),
  ];
  if (body) {
    operations.push(await checkedFetch(
      fetchImpl,
      baseUrl,
      `/collections/${encodeURIComponent(collectionName)}/documents/import?action=upsert`,
      {
        method: "POST",
        headers: { "x-typesense-api-key": apiKey, "content-type": "application/x-ndjson" },
        body,
      },
      [200, 201, 202],
      { allowPrivateNetwork, lookupImpl, timeoutMs },
    ));
  }

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
  lookupImpl,
  allowPrivateNetwork = privateSearchServiceNetworkAllowed(),
  timeoutMs = SEARCH_SYNC_TIMEOUT_MS,
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
    await checkedFetch(
      fetchImpl,
      baseUrl,
      `/indexes/${encodeURIComponent(indexName)}/settings`,
      {
        method: "PATCH",
        headers: { ...auth, "content-type": "application/json" },
        body: JSON.stringify(settings),
      },
      [200, 201, 202],
      { allowPrivateNetwork, lookupImpl, timeoutMs },
    ),
  ];
  if (body.trim()) {
    operations.push(await checkedFetch(
      fetchImpl,
      baseUrl,
      `/indexes/${encodeURIComponent(indexName)}/documents?primaryKey=meili_id`,
      {
        method: "POST",
        headers: { ...auth, "content-type": "application/x-ndjson" },
        body,
      },
      [200, 201, 202],
      { allowPrivateNetwork, lookupImpl, timeoutMs },
    ));
  }

  return {
    engine: "meilisearch",
    index: indexName,
    documents: rowCount(body),
    operations,
  };
}

export async function runSearchEngineSync({
  postgres = {},
  typesense = {},
  meilisearch = {},
  projection = null,
  fetchImpl = globalThis.fetch,
  generatedAt = "2026-07-06T00:00:00Z",
} = {}) {
  void typesense;
  void meilisearch;
  void fetchImpl;
  const needsRuntime = !postgres.payload && (!projection || typeof postgres.snapshotQueryImpl !== "function");
  const ownedRuntime = needsRuntime ? await postgresQueryRuntime(postgres) : null;
  const runtimePostgres = ownedRuntime ? { ...postgres, payload: ownedRuntime } : postgres;
  try {
    const approved = await postgresProjectionSnapshot({ postgres: runtimePostgres, projection });
    const viewDocuments = await readPostgresProjectionDocuments({ postgres: runtimePostgres });
    const digest = crypto.createHash("sha256").update(JSON.stringify(viewDocuments)).digest("hex");
    if (digest !== approved.source.digest) {
      throw new Error("Payload Postgres search view does not match the authoritative Payload projection");
    }
    const databaseTarget = redactedDatabaseTarget((postgres.env || process.env).DATABASE_URL);
    const engines = [
      {
        engine: "postgres",
        target: POSTGRES_PUBLIC_SEARCH_VIEW,
        documents: viewDocuments.length,
        digest,
        locale_codes: [...new Set(viewDocuments.map((document) => document.locale).filter(Boolean))].sort(),
        operations: [
          {
            method: "SELECT",
            status: 200,
            url: databaseTarget,
            rows: viewDocuments.length,
          },
        ],
      },
    ];

    return {
      evidence_scope: approved ? "live" : "smoke",
      generated_at: generatedAt,
      source: approved?.source || fixtureSource(viewDocuments.length),
      summary: {
        engines: engines.length,
        targets: { postgres: POSTGRES_PUBLIC_SEARCH_VIEW },
        documents_per_engine: engines.map((engine) => engine.documents),
        total_operations: engines.reduce((sum, engine) => sum + engine.operations.length, 0),
        database_target: databaseTarget,
      },
      engines,
    };
  } finally {
    await ownedRuntime?.destroy?.();
  }
}

export function assertSearchEngineSyncReport(report) {
  if (!report.generated_at || Number.isNaN(Date.parse(report.generated_at))) {
    throw new Error("Search sync report must include valid generated_at");
  }
  if (report.summary.engines !== 1) throw new Error("Search sync must cover the authoritative Postgres search view");
  const source = assertSearchReportSource(report, "Search sync");
  const expectedOperations = 1;
  if (report.summary.total_operations !== expectedOperations) throw new Error("Search sync must perform one authoritative Postgres snapshot operation");
  if (!Array.isArray(report.engines) || report.engines.length !== 1 || report.engines[0]?.engine !== "postgres") {
    throw new Error("Search sync must report one Postgres engine row");
  }
  if (JSON.stringify(report.summary.documents_per_engine) !== JSON.stringify(report.engines.map((engine) => engine.documents))) {
    throw new Error("Search sync summary documents must match engine rows");
  }
  const operationCount = report.engines.reduce((sum, engine) => sum + (engine.operations || []).length, 0);
  if (report.summary.total_operations !== operationCount) throw new Error("Search sync summary operations must match engine rows");
  for (const engine of report.engines) {
    if (engine.target !== POSTGRES_PUBLIC_SEARCH_VIEW) throw new Error("Postgres sync target is invalid");
    if (report.summary.targets?.postgres !== POSTGRES_PUBLIC_SEARCH_VIEW) throw new Error("Search sync summary target must match the Postgres view");
    if (engine.documents !== source.projected_documents) {
      throw new Error("Postgres document count must match the current Payload projection");
    }
    for (const operation of engine.operations || []) {
      if (!String(operation.url || "").startsWith("postgres")) throw new Error("Postgres sync operation must record the database target");
      if (operation.method !== "SELECT") throw new Error("Postgres sync operation method is invalid");
      if (operation.status !== 200) throw new Error("Postgres sync operation status is invalid");
    }
    if (!/^[a-f0-9]{64}$/.test(String(engine.digest || ""))) throw new Error("Postgres sync report must include a projection digest");
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
  queryApiKey = process.env.TYPESENSE_QUERY_API_KEY,
  collectionName = process.env.TYPESENSE_COLLECTION || "ms_realty_listings",
  q = "Sandanski",
  filterBy = "translation_indexable:=true && locale:=bg && source_listing_id:=MS-CRAWL-0001",
  perPage = 5,
  exactReference = null,
  sortBy = null,
  queryBy = null,
  fetchImpl = globalThis.fetch,
  lookupImpl,
  allowPrivateNetwork = privateSearchServiceNetworkAllowed(),
  timeoutMs = SEARCH_QUERY_TIMEOUT_MS,
} = {}) {
  required(baseUrl, "TYPESENSE_URL");
  const searchApiKey = queryApiKey
    ? required(queryApiKey, "TYPESENSE_QUERY_API_KEY")
    : required(apiKey, "TYPESENSE_API_KEY");
  if (typeof fetchImpl !== "function") throw new Error("fetch is required for Typesense query");
  const limit = boundedSearchLimit(perPage, "Typesense per_page");

  const reference = optionalText(exactReference);
  const queryFields = optionalText(queryBy) || (reference ? "listing_reference,source_listing_id" : "title,description,search_text,location_label,listing_reference");
  const params = new URLSearchParams({
    q: reference || String(q || "").trim() || "*",
    query_by: queryFields,
    filter_by: filterBy,
    per_page: String(limit),
  });
  if (reference) {
    params.set("num_typos", "0");
    params.set("drop_tokens_threshold", "0");
  }
  if (sortBy) params.set("sort_by", sortBy);
  const { payload, operation } = await checkedJson(
    fetchImpl,
    baseUrl,
    `/collections/${encodeURIComponent(collectionName)}/documents/search?${params}`,
    { method: "GET", headers: { "x-typesense-api-key": searchApiKey } },
    [200],
    { allowPrivateNetwork, lookupImpl, timeoutMs },
  );
  const bounded = boundedSearchResponse(payload, { engine: "Typesense", limit });

  return {
    engine: "typesense",
    service_url: redactedUrl(baseUrl),
    collection: collectionName,
    query: q,
    filter: filterBy,
    operation,
    total: bounded.total,
    hits: bounded.hits.map((hit) => searchHit(hit.document || hit)),
  };
}

export async function queryMeilisearch({
  baseUrl = process.env.MEILI_URL,
  apiKey = process.env.MEILI_API_KEY,
  queryApiKey = process.env.MEILI_QUERY_API_KEY,
  indexName = process.env.MEILI_INDEX || "ms_realty_listings",
  q = "Sandanski",
  filter = 'translation_indexable = true AND locale = bg AND source_listing_id = "MS-CRAWL-0001"',
  limit = 5,
  fetchImpl = globalThis.fetch,
  lookupImpl,
  allowPrivateNetwork = privateSearchServiceNetworkAllowed(),
  timeoutMs = SEARCH_QUERY_TIMEOUT_MS,
} = {}) {
  required(baseUrl, "MEILI_URL");
  const searchApiKey = queryApiKey ? required(queryApiKey, "MEILI_QUERY_API_KEY") : required(apiKey, "MEILI_API_KEY");
  if (typeof fetchImpl !== "function") throw new Error("fetch is required for Meilisearch query");
  const boundedLimit = boundedSearchLimit(limit, "Meilisearch limit");

  const { payload, operation } = await checkedJson(
    fetchImpl,
    baseUrl,
    `/indexes/${encodeURIComponent(indexName)}/search`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${searchApiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ q, filter, limit: boundedLimit }),
    },
    [200],
    { allowPrivateNetwork, lookupImpl, timeoutMs },
  );
  const bounded = boundedSearchResponse(payload, { engine: "Meilisearch", limit: boundedLimit });

  return {
    engine: "meilisearch",
    service_url: redactedUrl(baseUrl),
    index: indexName,
    query: q,
    filter,
    operation,
    total: bounded.total,
    hits: bounded.hits.map(searchHit),
  };
}

function postgresRows(result) {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.rows)) return result.rows;
  if (Array.isArray(result?.[0]?.rows)) return result[0].rows;
  return [];
}

function postgresSearchHit(row = {}) {
  const optionalText = (value) => String(value ?? "").trim() || null;
  const optionalNumber = (value) => {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    if (!Number.isFinite(number)) throw new Error("Postgres public search returned an invalid numeric card field");
    return number;
  };
  return {
    id: String(row.id || "").trim(),
    source_listing_id: String(row.source_listing_id || "").trim(),
    listing_reference: String(row.listing_reference || row.source_listing_id || "").trim(),
    locale: String(row.locale || "").trim(),
    locale_path: String(row.locale_path || "").trim(),
    title: String(row.title || "").trim(),
    description: optionalText(row.description),
    property_family: optionalText(row.property_family),
    property_subtype: optionalText(row.property_subtype),
    location_label: optionalText(row.location_label),
    municipality: optionalText(row.municipality),
    district: optionalText(row.district),
    region_id: optionalText(row.region_id),
    country_code: optionalText(row.country_code),
    geography_id: optionalText(row.geography_id),
    geography_path: Array.isArray(row.geography_path) ? row.geography_path.map(String) : [],
    price_amount: optionalNumber(row.price_amount),
    price_currency: optionalText(row.price_currency),
    price_on_request: row.price_on_request === true,
    offer_type: optionalText(row.offer_type),
    listing_status: optionalText(row.listing_status),
    bedrooms_count: optionalNumber(row.bedrooms_count),
    primary_area_sqm: optionalNumber(row.primary_area_sqm),
    condition: optionalText(row.condition),
    public_latitude: optionalNumber(row.public_latitude),
    public_longitude: optionalNumber(row.public_longitude),
    public_location_precision: optionalText(row.public_location_precision),
  };
}

function postgresViewCondition(sql, field, value) {
  return sql`${sql.raw(`d."${field}"`)} = ${value}`;
}

function postgresRangeCondition(sql, field, min, max) {
  const clauses = [];
  if (min !== null && min !== undefined) clauses.push(sql`${sql.raw(`d."${field}"`)} >= ${Number(min)}`);
  if (max !== null && max !== undefined) clauses.push(sql`${sql.raw(`d."${field}"`)} <= ${Number(max)}`);
  return clauses.length ? sql.join(clauses, sql` AND `) : null;
}

function postgresOneOfCondition(sql, field, values = []) {
  if (!values.length) return null;
  const clauses = values.map((value) => postgresViewCondition(sql, field, value));
  return clauses.length === 1 ? clauses[0] : sql`(${sql.join(clauses, sql` OR `)})`;
}

function postgresLocationCondition(sql, locationIds = []) {
  if (!locationIds.length) return null;
  const clauses = locationIds.flatMap((value) => [
    postgresViewCondition(sql, "location_id", value),
    postgresViewCondition(sql, "location_label", value),
  ]);
  return sql`(${sql.join(clauses, sql` OR `)})`;
}

function postgresGeographyCondition(sql, value) {
  return sql`d."geography_path" @> ${JSON.stringify([value])}::jsonb`;
}

function postgresResultCount(rows) {
  const value = Number(rows[0]?.total_count ?? 0);
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("Postgres public search returned an invalid total count");
  return value;
}

function postgresSortOrder(sql, intent) {
  if (intent?.sort === "price_asc") return sql`d."price_amount" ASC NULLS LAST, d."id" ASC`;
  if (intent?.sort === "price_desc") return sql`d."price_amount" DESC NULLS LAST, d."id" ASC`;
  return sql`COALESCE(d."price_on_request", false) ASC, d."id" ASC`;
}

async function postgresQueryRuntime({ payload, loadPayloadRuntime, env }) {
  if (payload?.db?.execute || payload?.db?.drizzle?.execute) return payload;
  const loader = typeof loadPayloadRuntime === "function" ? loadPayloadRuntime : loadPayloadCmsImportRuntime;
  return loader({ env, payload });
}

function postgresExecutor(runtime) {
  const adapter = runtime?.db;
  if (typeof adapter?.execute === "function") return (statement) => adapter.execute({ drizzle: adapter.drizzle, sql: statement });
  if (typeof adapter?.drizzle?.execute === "function") return (statement) => adapter.drizzle.execute(statement);
  throw new Error("Payload Postgres runtime does not expose a compatible SQL executor");
}

async function queryPostgres({
  postgres = {},
  intent,
  localeCodes,
  q = "",
} = {}) {
  if (typeof postgres.queryImpl === "function") {
    return postgres.queryImpl({ intent, localeCodes, q, target: POSTGRES_PUBLIC_SEARCH_VIEW });
  }
  const sql = await loadPostgresSql();
  const runtime = await postgresQueryRuntime(postgres);
  const execute = postgresExecutor(runtime);

  const normalizedLocales = normalizedLocaleCodes(localeCodes);
  const normalized = backendIntent(intent, normalizedLocales);
  const conditions = [
    sql`d."publication_state" = 'published'`,
    sql`d."translation_human_approved" = true`,
    sql`d."translation_indexable" = true`,
    sql`d."locale_indexable" = true`,
    sql`d."listing_status" IN ('available', 'reserved')`,
    sql`(${sql.join(normalizedLocales.map((locale) => postgresViewCondition(sql, "locale", locale)), sql` OR `)})`,
  ];

  if (normalized?.exact_reference) {
    conditions.push(
      sql`(d."listing_reference" = ${normalized.exact_reference} OR d."source_listing_id" = ${normalized.exact_reference})`,
    );
  } else {
    const tokens = foldedTokens(normalized?.text_query || q);
    if (tokens.length) {
      conditions.push(
        sql`(${sql.join(
          tokens.map((token) => sql`"public"."ms_realty_search_fold"(d."search_text") LIKE ${`%${token}%`}`),
          sql` AND `,
        )})`,
      );
    }
  }

  for (const [field, values] of [
    ["property_family", normalized?.property_families || []],
    ["property_subtype", normalized?.property_subtypes || []],
    ["parking_kind", normalized?.parking_kinds || []],
    ["construction_status", normalized?.construction_statuses || []],
  ]) {
    const clause = postgresOneOfCondition(sql, field, values);
    if (clause) conditions.push(clause);
  }
  const locationClause = postgresLocationCondition(sql, normalized?.location_ids || []);
  if (locationClause) conditions.push(locationClause);
  if (normalized?.country_code) conditions.push(postgresViewCondition(sql, "country_code", normalized.country_code));
  if (normalized?.region_id) conditions.push(postgresGeographyCondition(sql, normalized.region_id));
  if (normalized?.geography_id) conditions.push(postgresGeographyCondition(sql, normalized.geography_id));
  if (normalized?.municipality) conditions.push(postgresViewCondition(sql, "municipality", normalized.municipality));
  if (normalized?.district) conditions.push(postgresViewCondition(sql, "district", normalized.district));
  for (const [field, min, max] of [
    ["price_amount", normalized?.price_min, normalized?.price_max],
    ["bedrooms_count", normalized?.bedrooms_min, normalized?.bedrooms_max],
    ["primary_area_sqm", normalized?.primary_area_min, normalized?.primary_area_max],
    ["land_area_sqm", normalized?.land_area_min, normalized?.land_area_max],
    ["floor_number", normalized?.floor_min, normalized?.floor_max],
    ["storeys_count", normalized?.storeys_min, normalized?.storeys_max],
    ["premises_count", normalized?.premises_min, null],
    ["hotel_room_count", normalized?.hotel_rooms_min, null],
  ]) {
    const clause = postgresRangeCondition(sql, field, min, max);
    if (clause) conditions.push(clause);
  }
  if (normalized?.offer_type) conditions.push(postgresViewCondition(sql, "offer_type", normalized.offer_type));
  if (normalized?.listing_status) conditions.push(postgresViewCondition(sql, "listing_status", normalized.listing_status));
  if (normalized?.price_period) conditions.push(postgresViewCondition(sql, "price_period", normalized.price_period));
  if (normalized?.has_approved_tour === true) conditions.push(sql`d."has_approved_tour" = true`);
  if (normalized?.map_bounds) {
    const { west, south, east, north } = normalized.map_bounds;
    conditions.push(sql`d."public_longitude" >= ${west} AND d."public_longitude" <= ${east}`);
    conditions.push(sql`d."public_latitude" >= ${south} AND d."public_latitude" <= ${north}`);
  }

  const pageSize = Math.min(100, Math.max(1, Number(normalized?.page_size || 12)));
  const page = Math.max(1, Number(normalized?.page || 1));
  const offset = (page - 1) * pageSize;
  const countStatement = sql`
    SELECT count(*) AS total_count
    FROM ${sql.raw(`"public"."${POSTGRES_PUBLIC_SEARCH_VIEW}"`)} d
    WHERE ${sql.join(conditions, sql` AND `)}
  `;
  const pageStatement = sql`
    SELECT
      ${sql.raw(POSTGRES_PUBLIC_SEARCH_CARD_COLUMNS.map((column) => `d."${column}"`).join(",\n      "))}
    FROM ${sql.raw(`"public"."${POSTGRES_PUBLIC_SEARCH_VIEW}"`)} d
    WHERE ${sql.join(conditions, sql` AND `)}
    ORDER BY ${postgresSortOrder(sql, normalized)}
    LIMIT ${pageSize}
    OFFSET ${offset}
  `;
  const total = postgresResultCount(postgresRows(await execute(countStatement)));
  const rows = postgresRows(await execute(pageStatement));
  const hits = rows.map(postgresSearchHit);
  return {
    engine: "postgres",
    database_target: redactedDatabaseTarget(postgres.env?.DATABASE_URL || process.env.DATABASE_URL),
    total,
    hits,
    page,
    page_size: pageSize,
    locale_codes: normalizedLocales,
    unavailable_engines: [],
    target: POSTGRES_PUBLIC_SEARCH_VIEW,
  };
}

async function postgresProjectionSnapshot({ postgres = {}, projection = null } = {}) {
  if (projection) return liveProjection(projection);
  const { loadPayloadApprovedSearchProjection } = await import("./payload-search-projection.mjs");
  return loadPayloadApprovedSearchProjection({ env: postgres.env || process.env, payload: postgres.payload || null });
}

function postgresProjectionDocument(row = {}) {
  return Object.fromEntries(POSTGRES_VIEW_COLUMNS.map((column) => [column, row[column] ?? null]).filter(([, value]) => value !== null));
}

async function readPostgresProjectionDocuments({ postgres = {} } = {}) {
  if (typeof postgres.snapshotQueryImpl === "function") return postgres.snapshotQueryImpl({ target: POSTGRES_PUBLIC_SEARCH_VIEW });
  const sql = await loadPostgresSql();
  const runtime = await postgresQueryRuntime(postgres);
  const execute = postgresExecutor(runtime);
  const rows = postgresRows(await execute(sql`SELECT * FROM ${sql.raw(`"public"."${POSTGRES_PUBLIC_SEARCH_VIEW}"`)} ORDER BY "id" ASC`));
  return rows.map(postgresProjectionDocument);
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
  if (normalized.country_code) filters.push(`country_code:=${typesenseLiteral(normalized.country_code)}`);
  if (normalized.region_id) filters.push(`geography_path:=${typesenseLiteral(normalized.region_id)}`);
  if (normalized.geography_id) filters.push(`geography_path:=${typesenseLiteral(normalized.geography_id)}`);
  if (normalized.municipality) filters.push(`municipality:=${typesenseLiteral(normalized.municipality)}`);
  if (normalized.district) filters.push(`district:=${typesenseLiteral(normalized.district)}`);
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
  if (normalized.country_code) filters.push(`country_code = ${JSON.stringify(normalized.country_code)}`);
  if (normalized.region_id) filters.push(`geography_path = ${JSON.stringify(normalized.region_id)}`);
  if (normalized.geography_id) filters.push(`geography_path = ${JSON.stringify(normalized.geography_id)}`);
  if (normalized.municipality) filters.push(`municipality = ${JSON.stringify(normalized.municipality)}`);
  if (normalized.district) filters.push(`district = ${JSON.stringify(normalized.district)}`);
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
  postgres = {},
  typesense = {},
  meilisearch = {},
  engine = process.env.MS_REALTY_SEARCH_ENGINE,
  environment = process.env.NODE_ENV,
  q = "",
  intent = null,
  localeCodes,
  filters = {},
  perPage = 250,
  fetchImpl = globalThis.fetch,
} = {}) {
  const normalizedLocales = normalizedLocaleCodes(localeCodes);
  const normalizedIntent = backendIntent(intent || (Object.keys(filters).length ? filters : null), normalizedLocales);
  const query = normalizedIntent?.exact_reference || normalizedIntent?.text_query || q;
  const typesenseFilter = typesenseFilterForIntent(normalizedIntent, normalizedLocales);
  const meilisearchFilter = meilisearchFilterForIntent(normalizedIntent, normalizedLocales);
  const typesenseSort = typesenseSortFor(normalizedIntent);
  const runtime = selectSearchRuntime({ engine, environment, postgres, typesense, meilisearch });
  if (runtime.engine) {
    const selected = runtime.engine;
    const config = selected === "postgres" ? postgres : selected === "typesense" ? typesense : meilisearch;
    if (selected === "postgres" && missingPostgresSearchConfig(config)) {
      return {
        engine: "seed_fallback",
        total: null,
        hits: [],
        locale_codes: normalizedLocales,
        unavailable_engines: [selected],
      };
    }
    if (selected !== "postgres" && missingSearchEngineConfig(config)) {
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
        selected === "postgres"
          ? await queryPostgres({
              postgres,
              q: query,
              intent: normalizedIntent,
              localeCodes: normalizedLocales,
            })
          : selected === "typesense"
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
        page: result.page,
        page_size: result.page_size,
        target: result.target,
        database_target: result.database_target,
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

  if (!missingPostgresSearchConfig(postgres)) {
    try {
      const result = await queryPostgres({
        postgres,
        q: query,
        intent: normalizedIntent,
        localeCodes: normalizedLocales,
      });
      return {
        engine: "postgres",
        total: result.total,
        hits: result.hits,
        page: result.page,
        page_size: result.page_size,
        target: result.target,
        database_target: result.database_target,
        locale_codes: normalizedLocales,
        unavailable_engines: unavailableEngines,
      };
    } catch (error) {
      if (productionEnvironment(environment)) throw new Error("Selected search engine postgres is unavailable");
      unavailableEngines.push("postgres");
    }
  } else {
    unavailableEngines.push("postgres");
  }

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
  postgres = {},
  typesense = {},
  meilisearch = {},
  projection = null,
  fetchImpl = globalThis.fetch,
  generatedAt = "2026-07-06T00:00:00Z",
} = {}) {
  void typesense;
  void meilisearch;
  void fetchImpl;
  const approved = await postgresProjectionSnapshot({ postgres, projection });
  const documents = approved?.documents ?? [];
  const sample = documents[0] || null;
  const localeCodes = [sample?.locale || "bg"];
  const postgresResult = await queryPostgres({
    postgres,
    q: sample?.listing_reference || "",
    intent: normalizeSearchIntent(
      {
        locale: localeCodes[0],
        exact_reference: sample?.listing_reference || null,
        page: 1,
        page_size: 5,
      },
      { defaultLocale: localeCodes[0] },
    ),
    localeCodes,
  });
  const projectedDocuments = documents.length;
  return {
    evidence_scope: approved ? "live" : "smoke",
    generated_at: generatedAt,
    source: approved?.source || fixtureSource(projectedDocuments),
    expectation: {
      projected_documents: projectedDocuments,
      sample_document_id: sample?.id || null,
    },
    summary: {
      engines: 1,
      targets: { postgres: POSTGRES_PUBLIC_SEARCH_VIEW },
      total_hits: postgresResult.total,
      first_hit_ids: [postgresResult.hits[0]?.id || null],
      database_target: postgresResult.database_target,
    },
    engines: [
      {
        engine: "postgres",
        target: POSTGRES_PUBLIC_SEARCH_VIEW,
        database_target: postgresResult.database_target,
        query: sample?.listing_reference || "",
        operation: {
          method: "SELECT",
          status: 200,
          url: postgresResult.database_target,
          rows: postgresResult.hits.length,
        },
        total: postgresResult.total,
        hits: postgresResult.hits,
      },
    ],
  };
}

export function assertSearchEngineQueryReport(report) {
  if (!report.generated_at || Number.isNaN(Date.parse(report.generated_at))) {
    throw new Error("Search query smoke report must include valid generated_at");
  }
  if (report.summary.engines !== 1) throw new Error("Search query smoke must cover the authoritative Postgres search path");
  const source = assertSearchReportSource(report, "Search query smoke");
  if (
    !plainObject(report.expectation) ||
    report.expectation.projected_documents !== source.projected_documents ||
    (report.expectation.sample_document_id !== null && !String(report.expectation.sample_document_id || "").trim())
  ) {
    throw new Error("Search query smoke must include current projection expectations");
  }
  if (!Array.isArray(report.engines) || report.engines.length !== 1 || report.engines[0]?.engine !== "postgres") {
    throw new Error("Search query smoke must report one Postgres engine row");
  }
  const totalHits = report.engines.reduce((sum, engine) => sum + engine.total, 0);
  if (report.summary.total_hits !== totalHits) throw new Error("Search query summary hits must match engine rows");
  if (JSON.stringify(report.summary.first_hit_ids) !== JSON.stringify(report.engines.map((engine) => engine.hits?.[0]?.id || null))) {
    throw new Error("Search query summary first hits must match engine rows");
  }
  for (const engine of report.engines) {
    if (engine.target !== POSTGRES_PUBLIC_SEARCH_VIEW) throw new Error("Postgres query target is invalid");
    if (report.summary.targets?.postgres !== POSTGRES_PUBLIC_SEARCH_VIEW) throw new Error("Search query summary target must match the Postgres view");
    if (!String(engine.database_target || "").startsWith("postgres")) throw new Error("Postgres query report must include database target evidence");
    if (engine.operation?.method !== "SELECT" || engine.operation?.status !== 200 || engine.operation?.url !== engine.database_target) {
      throw new Error("Postgres query report must include the database read operation");
    }
    if (source.projected_documents === 0) {
      if (engine.total !== 0 || engine.hits.length !== 0) throw new Error("Postgres query must prove zero approved documents");
      continue;
    }
    if (engine.total < 1 || !engine.hits.length) throw new Error("Postgres query must return search hits");
    if (!engine.hits.some((hit) => hit.id === report.expectation.sample_document_id)) {
      throw new Error("Postgres query must find the current projection sample document");
    }
    if (engine.hits.some((hit) => hit.locale === "fr")) throw new Error("Postgres query must not return draft French docs");
  }
  return true;
}

export function assertSearchEngineEvidenceConsistency(syncReport, queryReport) {
  assertSearchEngineSyncReport(syncReport);
  assertSearchEngineQueryReport(queryReport);
  if (
    syncReport.evidence_scope !== queryReport.evidence_scope ||
    syncReport.source.kind !== queryReport.source.kind ||
    syncReport.source.projected_documents !== queryReport.source.projected_documents ||
    (syncReport.evidence_scope === "live" && syncReport.source.digest !== queryReport.source.digest)
  ) {
    throw new Error("Search sync and query evidence must use the same Payload projection");
  }
  return true;
}

export function writeSearchEngineQueryReport(report, filePath = DEFAULT_SEARCH_ENGINE_QUERY_REPORT) {
  assertSearchEngineQueryReport(report);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(report, null, 2)}\n`);
  return filePath;
}
