import { assertCmsSeed } from "./cms-seed.mjs";
import { assertLocaleRegistry, loadLocaleRegistry } from "./locales.mjs";
import { mediaWorkflow } from "./media.mjs";
import { loadCmsSeed } from "./runtime.mjs";

export const CMS_SEED_IMPORT_CONTEXT_FLAG = "ms_realty_cms_seed_import";

const IMPORT_COLLECTIONS = Object.freeze([
  "locales",
  "locations",
  "properties",
  "listings",
  "listing_translations",
  "media_assets",
  "listing_tours",
  "listing_enrichment_tasks",
  "search_outbox",
]);

const VERSIONED_COLLECTIONS = new Set(["listings", "listing_translations", "media_assets", "listing_tours"]);
const SAMPLE_CONFLICT_LIMIT = 25;
const LISTING_FACT_SOURCE_FIELDS = ["id", "thumbnail_url", "thumbnail_alt", "word_count", "canonical"];

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function withoutFields(value, fields) {
  const result = clone(value || {});
  for (const field of fields) delete result[field];
  return result;
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requiredText(value, label, max = 240) {
  const text = String(value || "").trim();
  if (!text || text.length > max) throw new Error(`${label} is required and must be ${max} characters or fewer`);
  return text;
}

function relationId(value) {
  if (Array.isArray(value)) return value.map((item) => relationId(item)).filter(Boolean);
  if (value && typeof value === "object") return String(value.id || value.value || "").trim();
  return String(value || "").trim();
}

function normalize(value) {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalize);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, normalize(value[key])]));
}

function equalNormalized(left, right) {
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}

function missingValue(value) {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  if (!isRecord(value)) return false;
  return Object.keys(value).length === 0;
}

function countBy(rows, keyFn) {
  return rows.reduce((result, row) => {
    const key = keyFn(row);
    result[key] = (result[key] || 0) + 1;
    return result;
  }, {});
}

function relationKey(...values) {
  return values.map((value) => String(value || "")).join("\u0000");
}

function retryCount(value) {
  const count = value === undefined ? 2 : Number(value);
  if (!Number.isInteger(count) || count < 1 || count > 3) throw new Error("Payload CMS importer maxAttempts must be an integer from 1 to 3");
  return count;
}

function retryableTransactionError(error) {
  return /could not serialize|serialization failure|deadlock detected|duplicate key/i.test(String(error?.message || error));
}

function baseCollection(name) {
  return { collection: name, created: 0, updated: 0, reused: 0 };
}

function conflictEntry(collection, key, fields, reason = "conflicting_existing_data") {
  return { collection, fields: [...new Set(fields)].sort(), key, reason };
}

function summarizePlan(operations, conflicts) {
  const summary = Object.fromEntries(
    [...new Set([...operations.map((item) => item.collection), ...conflicts.map((item) => item.collection)])].map((collection) => [collection, baseCollection(collection)]),
  );
  for (const operation of operations) {
    summary[operation.collection][operation.action] += 1;
  }
  return { byCollection: summary, conflicts: conflicts.length, writes: operations.filter((item) => item.action !== "reused").length };
}

function buildTargetSummary(seed, registry) {
  const translationCount = seed.records.reduce((total, record) => total + (record.translations || []).length, 0);
  const mediaCount = new Set(seed.records.flatMap((record) => (record.media || []).map((item) => item.url))).size;
  const tourCount = seed.records.filter((record) => record.tour).length;
  return {
    locales: registry.locales.length,
    listings: seed.records.length,
    listing_translations: translationCount,
    listing_tours: tourCount,
    listing_enrichment_tasks: (seed.enrichment_tasks || []).length,
    locations: (seed.locations || []).length,
    media_assets: mediaCount,
    properties: (seed.properties || []).length,
    search_outbox: 0,
  };
}

function requiredMapValue(map, key, label) {
  const value = map.get(key);
  if (missingValue(value)) throw new Error(`${label} missing for ${key}`);
  return value;
}

function localeIdMap(snapshot) {
  return new Map(snapshot.locales.docs.map((doc) => [String(doc.code || "").trim(), doc.id]));
}

function desiredLocalesBase(registry) {
  return registry.locales.map((locale) => ({
    data: {
      code: locale.code,
      native_name: locale.native_name,
      admin_name: locale.admin_name,
      direction: locale.direction,
      public_enabled: locale.public_enabled === true,
      indexable: locale.indexable === true,
      reviewer_owner: locale.reviewer_owner || locale.reviewer_role || null,
    },
    key: locale.code,
    match: { code: locale.code },
  }));
}

function desiredLocaleRelations(registry, localeIds) {
  return registry.locales.map((locale) => ({
    id: requiredMapValue(localeIds, locale.code, "Locale id"),
    data: {
      fallback_locale: locale.fallback_locale ? requiredMapValue(localeIds, locale.fallback_locale, "Locale fallback id") : null,
    },
    key: locale.code,
    match: { code: locale.code },
  }));
}

function desiredLocations(seed) {
  return (seed.locations || []).map((location) => ({
    id: location.id,
    data: {
      id: location.id,
      label: location.label,
      public_location_precision: location.public_location_precision,
      internal_latitude: location.internal_latitude ?? null,
      internal_longitude: location.internal_longitude ?? null,
      public_latitude: location.public_latitude ?? null,
      public_longitude: location.public_longitude ?? null,
    },
    key: location.id,
    match: { id: location.id },
  }));
}

function desiredProperties(seed) {
  return (seed.properties || []).map((property) => ({
    id: property.id,
    data: {
      id: property.id,
      location: property.location,
      property_family: property.property_family ?? null,
      property_subtype: property.property_subtype ?? null,
      taxonomy_mapping_version: property.taxonomy_mapping_version,
      taxonomy_review_status: property.taxonomy_review_status,
      facts: clone(property.facts || {}),
      fact_verification: clone(property.fact_verification || []),
      zero_value_audit: clone(property.zero_value_audit || []),
      legacy_listing_id: property.legacy_listing_id,
    },
    key: property.id,
    match: { id: property.id },
  }));
}

function desiredListingsBase(seed, localeIds) {
  return seed.records.map((record) => ({
    id: record.id,
    data: {
      id: record.id,
      cms_status: "source_imported_review_required",
      source_locale: requiredMapValue(localeIds, record.source_locale, "Listing source locale"),
      source_domain: record.source_domain,
      source_url: record.source_url,
      facts: withoutFields(record.facts, LISTING_FACT_SOURCE_FIELDS),
      seo: clone(record.seo || {}),
      workflow: clone(record.workflow || {}),
      property: record.property,
      location: record.location,
      routing: {
        ...(record.routing || {}),
        review_required: true,
        deployable: false,
      },
      migration: withoutFields(record.migration, ["source_seo"]),
    },
    key: record.id,
    match: { id: record.id },
  }));
}

function desiredTranslations(seed, localeIds) {
  return seed.records.flatMap((record) =>
    (record.translations || []).map((translation) => ({
      data: {
        listing: record.id,
        locale: requiredMapValue(localeIds, translation.locale, "Translation locale"),
        source_locale: requiredMapValue(localeIds, translation.source_locale, "Translation source locale"),
        status: "draft",
        translation_state: "draft",
        source_hash: translation.source_hash,
        translated_hash: translation.translated_hash,
        reviewer: translation.reviewer || null,
        approved_at: null,
        direction: translation.direction || null,
        public_indexable: false,
      },
      key: relationKey(record.id, translation.locale),
      match: { listing: record.id, locale: requiredMapValue(localeIds, translation.locale, "Translation locale") },
    })),
  );
}

function firstNonNullish(values) {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return null;
}

function normalizeMediaAlt(value) {
  return String(value || "").trim();
}

function mergedMediaDocument(url, variants) {
  const alts = [...new Set(variants.map((media) => normalizeMediaAlt(media.alt)).filter(Boolean))];
  const altConflict = alts.length > 1;
  return {
    asset_url: firstNonNullish(variants.map((media) => media.asset_url ?? null)),
    alt: altConflict ? "" : alts[0] || "",
    height: firstNonNullish(variants.map((media) => media.height ?? null)),
    is_public: false,
    kind: firstNonNullish(variants.map((media) => media.kind)) || "unknown",
    review_status: altConflict
      ? "review_required"
      : variants.some((media) => media.is_public === true || !["approved_imported_photo", "reviewed_private"].includes(media.review_status))
        ? "review_required"
        : firstNonNullish(variants.map((media) => media.review_status).filter(Boolean)) || "review_required",
    url,
    width: firstNonNullish(variants.map((media) => media.width ?? null)),
  };
}

function desiredMedia(seed) {
  const byUrl = new Map();
  for (const record of seed.records) {
    for (const media of record.media || []) {
      const url = requiredText(media.url, "CMS media url", 2000);
      const variants = byUrl.get(url) || [];
      variants.push(media);
      byUrl.set(url, variants);
    }
  }
  return [...byUrl.entries()].map(([url, variants]) => ({
    data: mergedMediaDocument(url, variants),
    key: url,
    match: { url },
  }));
}

function desiredTours(seed) {
  return seed.records
    .filter((record) => record.tour)
    .map((record) => ({
      data: {
        provider: record.tour.provider,
        listing_id: record.id,
        panorama_url: record.tour.panorama_url ?? null,
        viewer_url: record.tour.viewer_url ?? null,
        thumbnail_url: record.tour.thumbnail_url ?? null,
        hotspots: clone(record.tour.hotspots || []),
        is_public: false,
        accessibility_caption: record.tour.accessibility_caption || "",
        review_status: ["approved", "published"].includes(record.tour.review_status) ? "review_required" : record.tour.review_status,
        fallback_gallery: clone(record.tour.fallback_gallery || []),
      },
      key: record.id,
      match: { listing_id: record.id },
    }));
}

function desiredTasks(seed) {
  return (seed.enrichment_tasks || []).map((task) => ({
    id: task.id,
    data: {
      id: task.id,
      listing: task.listing,
      property: task.property,
      task_type: task.task_type,
      task_state: task.task_state,
      idempotency_key: task.idempotency_key,
      fact_fields: clone(task.fact_fields || []),
      source: task.source,
    },
    key: task.id,
    match: { id: task.id },
  }));
}

function buildImportedRelationIds(seed, snapshot, localeIds) {
  const translations = new Map();
  const media = new Map();
  const tours = new Map();

  for (const record of seed.records) {
    for (const translation of record.translations || []) {
      const localeId = requiredMapValue(localeIds, translation.locale, "Imported translation locale");
      const document = snapshot.listing_translations.byListingLocale.get(relationKey(record.id, localeId));
      if (!document) throw new Error(`Imported translation missing for ${record.id}:${translation.locale}`);
      translations.set(relationKey(record.id, translation.locale), document.id);
    }
    for (const item of record.media || []) {
      const url = requiredText(item.url, "CMS media url", 2000);
      const document = snapshot.media_assets.byUrl.get(url);
      if (!document) throw new Error(`Imported media missing for ${url}`);
      media.set(url, document.id);
    }
    if (record.tour) {
      const document = snapshot.listing_tours.byListingId.get(record.id);
      if (!document) throw new Error(`Imported tour missing for ${record.id}`);
      tours.set(record.id, document.id);
    }
  }

  return { media, tours, translations };
}

function desiredListingRelations(seed, relationIds) {
  return seed.records.map((record) => ({
    id: record.id,
    data: {
      translations: (record.translations || []).map((row) => requiredMapValue(relationIds.translations, relationKey(record.id, row.locale), "Listing translation id")),
      media: [...new Set((record.media || []).map((row) => requiredMapValue(relationIds.media, row.url, "Listing media id")))],
      tour: record.tour ? requiredMapValue(relationIds.tours, record.id, "Listing tour id") : null,
    },
    key: record.id,
    match: { id: record.id },
  }));
}

function safePatchValue(current, desired) {
  if (equalNormalized(current, desired)) return { ok: true, changed: false, value: undefined };
  if (Array.isArray(desired)) {
    if (missingValue(current)) return { ok: true, changed: true, value: clone(desired) };
    return { ok: false };
  }
  if (isRecord(desired)) {
    const currentRecord = isRecord(current) ? current : {};
    const patch = {};
    let changed = false;
    for (const [key, desiredValue] of Object.entries(desired)) {
      const result = safePatchValue(currentRecord[key], desiredValue);
      if (!result.ok) return { ok: false };
      if (result.changed) {
        patch[key] = result.value;
        changed = true;
      }
    }
    if (!changed) return { ok: true, changed: false, value: undefined };
    return { ok: true, changed: true, value: { ...clone(currentRecord), ...patch } };
  }
  if (missingValue(current)) return { ok: true, changed: true, value: desired };
  return { ok: false };
}

function listingRelationPatch(current, desired) {
  const patch = {};
  const conflicts = [];

  const currentTranslations = Array.isArray(current?.translations) ? relationId(current.translations) : [];
  const desiredTranslations = relationId(desired.translations || []);
  const mergedTranslations = [...new Set([...currentTranslations, ...desiredTranslations])];
  if (!equalNormalized(currentTranslations, mergedTranslations)) patch.translations = mergedTranslations;

  const currentMedia = Array.isArray(current?.media) ? relationId(current.media) : [];
  const desiredMedia = relationId(desired.media || []);
  const mergedMedia = [...new Set([...currentMedia, ...desiredMedia])];
  if (!equalNormalized(currentMedia, mergedMedia)) patch.media = mergedMedia;

  const currentTour = relationId(current?.tour) || null;
  const desiredTour = relationId(desired.tour) || null;
  if (!currentTour && desiredTour) patch.tour = desiredTour;
  else if (currentTour && desiredTour && currentTour !== desiredTour) conflicts.push("tour");

  return { conflicts, patch };
}

function comparableValue(current, desired, arrayRow = false) {
  if (Array.isArray(current) && Array.isArray(desired)) {
    return current.map((item, index) => comparableValue(item, desired[index], true));
  }
  if (!isRecord(current) || !isRecord(desired)) return clone(current);
  return Object.fromEntries(
    Object.entries(current)
      .filter(([key]) => key !== "id" || !arrayRow || Object.hasOwn(desired, "id"))
      .map(([key, value]) => [key, comparableValue(value, desired[key])]),
  );
}

function currentComparable(document, desiredData) {
  if (!document) return null;
  return Object.fromEntries(Object.keys(desiredData).map((key) => [key, comparableValue(document[key], desiredData[key])]));
}

function publishedConflict(collection, document) {
  if (!VERSIONED_COLLECTIONS.has(collection)) return false;
  return String(document?._status || "").trim().toLowerCase() === "published";
}

function planRecord({ collection, current, desired, overwriteExisting = false, allowListingRelationMerge = false }) {
  const fields = Object.keys(desired.data);
  const comparable = currentComparable(current, desired.data);
  if (!current) return { action: "created", data: desired.data };
  if (publishedConflict(collection, current) && !overwriteExisting) {
    return { action: "conflict", conflict: conflictEntry(collection, desired.key, ["_status"], "published_document_requires_overwrite") };
  }
  if (equalNormalized(comparable, desired.data)) return { action: "reused" };

  let patch = null;
  if (allowListingRelationMerge) {
    const relationPatch = listingRelationPatch(current, desired.data);
    if (relationPatch.conflicts.length) {
      return { action: "conflict", conflict: conflictEntry(collection, desired.key, relationPatch.conflicts, "relationship_conflict") };
    }
    patch = relationPatch.patch;
  }

  const safePatch = safePatchValue(comparable, desired.data);
  if (!overwriteExisting && !safePatch.ok && !allowListingRelationMerge) {
    const changedFields = fields.filter((field) => !equalNormalized(comparable[field], desired.data[field]));
    return { action: "conflict", conflict: conflictEntry(collection, desired.key, changedFields) };
  }

  if (overwriteExisting) {
    const data = clone(desired.data);
    if (allowListingRelationMerge) {
      data.translations = [...new Set([...relationId(current.translations || []), ...relationId(desired.data.translations || [])])];
      data.media = [...new Set([...relationId(current.media || []), ...relationId(desired.data.media || [])])];
      if (relationId(current.tour) && !relationId(desired.data.tour)) data.tour = clone(current.tour);
    }
    return { action: "updated", data };
  }

  const mergedPatch = patch || {};
  if (safePatch.ok && safePatch.changed) {
    for (const [key, value] of Object.entries(safePatch.value)) {
      if (!equalNormalized(comparable[key], value)) mergedPatch[key] = value;
    }
  }
  if (!Object.keys(mergedPatch).length) return { action: "reused" };
  return { action: "updated", data: mergedPatch };
}

function planCollection(collection, desiredRows, currentRows, { overwriteExisting = false, allowListingRelationMerge = false } = {}) {
  const operations = [];
  const conflicts = [];
  for (const desired of desiredRows) {
    const current = currentRows(desired);
    const planned = planRecord({ collection, current, desired, overwriteExisting, allowListingRelationMerge });
    if (planned.action === "conflict") {
      if (conflicts.length < SAMPLE_CONFLICT_LIMIT) conflicts.push(planned.conflict);
      continue;
    }
    operations.push({
      action: planned.action,
      collection,
      data: planned.data,
      desired,
      id: desired.id,
      currentId: current?.id || null,
    });
  }
  return { conflicts, operations };
}

function mergePlanParts(parts) {
  const operations = [];
  const conflicts = [];
  for (const part of parts) {
    operations.push(...(part?.operations || []));
    conflicts.push(...(part?.conflicts || []));
  }
  return { conflicts, operations, summary: summarizePlan(operations, conflicts) };
}

function assertPayload(payload) {
  if (!payload?.db || typeof payload.db.beginTransaction !== "function" || typeof payload.db.commitTransaction !== "function" || typeof payload.db.rollbackTransaction !== "function") {
    throw new Error("Payload CMS importer requires transaction-capable database access");
  }
  for (const method of ["find", "create", "update"]) {
    if (typeof payload?.[method] !== "function") throw new Error(`Payload CMS importer requires the Local API ${method} method`);
  }
}

async function findAll(payload, collection, req) {
  const result = await payload.find({
    collection,
    depth: 0,
    overrideAccess: true,
    pagination: false,
    req,
    ...(VERSIONED_COLLECTIONS.has(collection) ? { draft: true } : {}),
  });
  if (!Array.isArray(result?.docs)) throw new Error(`Payload ${collection} query did not return documents`);
  return result.docs;
}

function indexSnapshot(docs) {
  const byId = new Map(docs.map((doc) => [String(doc.id || "").trim(), doc]));
  return { byId, docs };
}

async function readSnapshot(payload, req) {
  const docs = {};
  for (const collection of IMPORT_COLLECTIONS) {
    docs[collection] = await findAll(payload, collection, req);
  }
  return {
    listing_enrichment_tasks: { ...indexSnapshot(docs.listing_enrichment_tasks) },
    listing_tours: {
      ...indexSnapshot(docs.listing_tours),
      byListingId: new Map(docs.listing_tours.map((doc) => [relationId(doc.listing_id), doc])),
    },
    listing_translations: {
      ...indexSnapshot(docs.listing_translations),
      byListingLocale: new Map(docs.listing_translations.map((doc) => [relationKey(relationId(doc.listing), relationId(doc.locale)), doc])),
    },
    listings: { ...indexSnapshot(docs.listings) },
    locales: {
      ...indexSnapshot(docs.locales),
      byCode: new Map(docs.locales.map((doc) => [String(doc.code || "").trim(), doc])),
    },
    locations: { ...indexSnapshot(docs.locations) },
    media_assets: {
      ...indexSnapshot(docs.media_assets),
      byUrl: new Map(docs.media_assets.map((doc) => [String(doc.url || "").trim(), doc])),
    },
    properties: { ...indexSnapshot(docs.properties) },
    search_outbox: { ...indexSnapshot(docs.search_outbox) },
  };
}

export async function readPayloadCmsSnapshot({ payload, req } = {}) {
  assertPayload(payload);
  if (req?.transactionID) return readSnapshot(payload, req);

  const transactionID = await payload.db.beginTransaction({ accessMode: "read only", isolationLevel: "repeatable read" });
  if (!transactionID) throw new Error("Payload CMS snapshot could not open a read transaction");
  try {
    return await readSnapshot(payload, { payload, transactionID });
  } finally {
    await payload.db.rollbackTransaction(transactionID).catch(() => undefined);
  }
}

function localeCode(value, snapshot) {
  const id = relationId(value);
  return snapshot.locales.byId.get(id)?.code || id || null;
}

function projectedTranslation(document, snapshot) {
  const translationState = document.translation_state || (document.status === "published" ? "published" : document.status) || "draft";
  return {
    locale: localeCode(document.locale, snapshot),
    source_locale: localeCode(document.source_locale, snapshot),
    status: translationState,
    source_hash: document.source_hash,
    translated_hash: document.translated_hash,
    reviewer: document.reviewer || null,
    approved_at: document.approved_at || null,
    direction: document.direction || null,
    public_indexable: document.public_indexable === true,
    human_approved: ["approved", "published"].includes(String(translationState || "").trim().toLowerCase()),
    translation_state: translationState,
    listing: relationId(document.listing),
  };
}

function projectedMedia(document) {
  return {
    url: document.url,
    asset_url: document.asset_url ?? null,
    alt: document.alt || "",
    width: document.width ?? null,
    height: document.height ?? null,
    kind: document.kind,
    is_public: document.is_public === true,
    review_status: document.review_status,
  };
}

function projectedTour(document) {
  return {
    provider: document.provider,
    listing_id: relationId(document.listing_id),
    panorama_url: document.panorama_url ?? null,
    viewer_url: document.viewer_url ?? null,
    thumbnail_url: document.thumbnail_url ?? null,
    hotspots: clone(document.hotspots || []),
    is_public: document.is_public === true,
    accessibility_caption: document.accessibility_caption || "",
    review_status: document.review_status,
    fallback_gallery: clone(document.fallback_gallery || []),
  };
}

function projectedListingRecord(document, snapshot) {
  const translationDocs = relationId(document.translations || [])
    .map((id) => snapshot.listing_translations.byId.get(id))
    .filter(Boolean)
    .map((row) => projectedTranslation(row, snapshot));
  const mediaDocs = relationId(document.media || [])
    .map((id) => snapshot.media_assets.byId.get(id))
    .filter(Boolean)
    .map((row) => projectedMedia(row));
  const tourDocument = snapshot.listing_tours.byId.get(relationId(document.tour)) || snapshot.listing_tours.byListingId.get(document.id) || null;
  return {
    id: document.id,
    collection: "listings",
    cms_status: document.cms_status,
    source_locale: localeCode(document.source_locale, snapshot),
    source_domain: document.source_domain,
    source_url: document.source_url,
    facts: clone(document.facts || {}),
    workflow: clone(document.workflow || {}),
    property: relationId(document.property) || null,
    location: relationId(document.location) || null,
    seo: clone(document.seo || {}),
    translations: translationDocs,
    media: mediaDocs,
    media_workflow: mediaWorkflow(mediaDocs),
    tour: tourDocument ? projectedTour(tourDocument) : null,
    migration: clone(document.migration || null),
    routing: clone(document.routing || null),
  };
}

function countSourceLocales(records) {
  return countBy(records, (record) => record.source_locale || "missing");
}

function countTranslationLocales(records) {
  return countBy(
    records.flatMap((record) => record.translations || []),
    (translation) => translation.locale || "missing",
  );
}

export function projectPayloadCmsSeed(seed, snapshot) {
  const payloadListingIds = new Set(snapshot.listings.docs.map((doc) => doc.id));
  const payloadRecords = new Map(snapshot.listings.docs.map((doc) => [doc.id, projectedListingRecord(doc, snapshot)]));
  const baseRecords = Array.isArray(seed.records) ? seed.records : [];
  const records = [
    ...baseRecords.map((record) => payloadRecords.get(record.id) || clone(record)),
    ...snapshot.listings.docs.filter((doc) => !baseRecords.some((record) => record.id === doc.id)).map((doc) => projectedListingRecord(doc, snapshot)),
  ];
  const properties = [
    ...(seed.properties || []).map((property) => clone(snapshot.properties.byId.get(property.id) || property)),
    ...snapshot.properties.docs.filter((doc) => !(seed.properties || []).some((property) => property.id === doc.id)).map((doc) => clone(doc)),
  ];
  const locations = [
    ...(seed.locations || []).map((location) => clone(snapshot.locations.byId.get(location.id) || location)),
    ...snapshot.locations.docs.filter((doc) => !(seed.locations || []).some((location) => location.id === doc.id)).map((doc) => clone(doc)),
  ];
  const enrichmentTasks = [
    ...(seed.enrichment_tasks || []).map((task) => clone(snapshot.listing_enrichment_tasks.byId.get(task.id) || task)),
    ...snapshot.listing_enrichment_tasks.docs
      .filter((doc) => !(seed.enrichment_tasks || []).some((task) => task.id === doc.id))
      .map((doc) => clone(doc)),
  ];
  const mediaAssets = records.reduce((total, record) => total + (record.media || []).length, 0);
  const publicGalleryAssets = records.reduce(
    (total, record) => total + (record.media || []).filter((item) => item.kind === "photo" && item.is_public === true).length,
    0,
  );
  const mediaReviewGatedAssets = records.reduce(
    (total, record) => total + (record.media || []).filter((item) => item.review_status === "review_required").length,
    0,
  );
  const floorPlanCandidates = records.reduce(
    (total, record) => total + (record.media || []).filter((item) => item.kind === "floor_plan").length,
    0,
  );
  const publicTours = records.filter((record) => record.tour?.is_public === true).length;
  return {
    ...clone(seed),
    records,
    properties,
    locations,
    enrichment_tasks: enrichmentTasks,
    summary: {
      ...clone(seed.summary || {}),
      listings: records.length,
      properties: properties.length,
      locations: locations.length,
      enrichmentTasks: enrichmentTasks.length,
      bySourceLocale: countSourceLocales(records),
      translationLocales: countTranslationLocales(records),
      mediaAssets,
      publicGalleryAssets,
      floorPlanCandidates,
      mediaReviewGatedAssets,
      tourFields: records.filter((record) => record.tour).length,
      publicTours,
      reviewRequiredRoutes: records.filter((record) => record.routing?.review_required === true).length,
      deployableRoutes: records.filter((record) => record.routing?.deployable === true).length,
    },
    payload_overlay: {
      listing_ids: [...payloadListingIds].sort(),
      source: "payload_draft_overlay",
    },
  };
}

function writeOptions(collection, req, data) {
  return {
    collection,
    data,
    depth: 0,
    overrideAccess: true,
    req,
    ...(VERSIONED_COLLECTIONS.has(collection) ? { draft: true } : {}),
    context: { [CMS_SEED_IMPORT_CONTEXT_FLAG]: true },
  };
}

async function applyOperations(payload, operations, req) {
  for (const operation of operations) {
    if (operation.action === "reused") continue;
    if (operation.action === "created") {
      await payload.create(writeOptions(operation.collection, req, operation.data));
      continue;
    }
    await payload.update({
      ...writeOptions(operation.collection, req, operation.data),
      id: operation.currentId || operation.id,
    });
  }
}

function includesIds(actual, expected) {
  const actualIds = new Set((actual || []).map((value) => String(value)));
  return [...new Set((expected || []).map((value) => String(value)))].every((value) => actualIds.has(value));
}

function importedTargets(snapshot, seed, registry) {
  const localeIds = localeIdMap(snapshot);
  const locales = registry.locales.map((locale) => snapshot.locales.byCode.get(locale.code)).filter(Boolean);
  const locations = (seed.locations || []).map((location) => snapshot.locations.byId.get(location.id)).filter(Boolean);
  const properties = (seed.properties || []).map((property) => snapshot.properties.byId.get(property.id)).filter(Boolean);
  const listings = seed.records.map((record) => snapshot.listings.byId.get(record.id)).filter(Boolean);
  const listingById = new Map(listings.map((listing) => [listing.id, listing]));
  const translationKeys = seed.records.flatMap((record) =>
    (record.translations || []).map((translation) => ({
      key: relationKey(record.id, translation.locale),
      document: localeIds.has(translation.locale)
        ? snapshot.listing_translations.byListingLocale.get(relationKey(record.id, localeIds.get(translation.locale)))
        : null,
    })),
  );
  const translations = translationKeys.map((entry) => entry.document).filter(Boolean);
  const translationsByKey = new Map(translationKeys.filter((entry) => entry.document).map((entry) => [entry.key, entry.document]));
  const media = [...new Set(seed.records.flatMap((record) => (record.media || []).map((item) => item.url)))]
    .map((url) => snapshot.media_assets.byUrl.get(url))
    .filter(Boolean);
  const mediaByUrl = new Map(media.map((document) => [document.url, document]));
  const tours = seed.records.filter((record) => record.tour).map((record) => snapshot.listing_tours.byListingId.get(record.id)).filter(Boolean);
  const toursByListingId = new Map(tours.map((document) => [relationId(document.listing_id), document]));
  const tasks = (seed.enrichment_tasks || []).map((task) => snapshot.listing_enrichment_tasks.byId.get(task.id)).filter(Boolean);
  return { listingById, localeIds, locales, locations, media, mediaByUrl, properties, tasks, tours, toursByListingId, translations, translationsByKey, listings };
}

function listingRelationsResolved(seed, targets, localeIds) {
  return seed.records.every((record) => {
    const listing = targets.listingById.get(record.id);
    if (!listing) return false;
    const expectedTranslations = (record.translations || [])
      .map((translation) => targets.translationsByKey.get(relationKey(record.id, translation.locale))?.id)
      .filter((value) => !missingValue(value));
    const expectedMedia = (record.media || []).map((media) => targets.mediaByUrl.get(media.url)?.id).filter((value) => !missingValue(value));
    const expectedTour = record.tour ? targets.toursByListingId.get(record.id)?.id || null : null;
    const expectedLocale = localeIds.get(record.source_locale);
    return (
      relationId(listing.source_locale) === relationId(expectedLocale) &&
      relationId(listing.property) === relationId(record.property) &&
      relationId(listing.location) === relationId(record.location) &&
      includesIds(relationId(listing.translations || []), expectedTranslations) &&
      includesIds(relationId(listing.media || []), expectedMedia) &&
      (!expectedTour || relationId(listing.tour) === relationId(expectedTour))
    );
  });
}

function aggregateReadback(snapshot, beforeSnapshot, target, seed, registry) {
  const targets = importedTargets(snapshot, seed, registry);
  const localeIds = targets.localeIds;
  const outboxRows = snapshot.search_outbox.docs.length;
  const listingsWithMedia = seed.records.filter((record) => (record.media || []).length > 0).length;
  const listingsWithTranslations = seed.records.filter((record) => (record.translations || []).length > 0).length;

  const readback = {
    collections: Object.fromEntries(IMPORT_COLLECTIONS.map((collection) => [collection, snapshot[collection].docs.length])),
    target: {
      locales: {
        count: targets.locales.length,
        codes: targets.locales.map((row) => row.code).sort(),
      },
      locations: {
        count: targets.locations.length,
        ids: targets.locations.map((row) => row.id).sort(),
      },
      properties: {
        count: targets.properties.length,
        ids: targets.properties.map((row) => row.id).sort(),
      },
      listings: {
        count: targets.listings.length,
        ids: targets.listings.map((row) => row.id).sort(),
        by_cms_status: countBy(targets.listings, (row) => row.cms_status || "missing"),
        linked_media: targets.listings.filter((row) => Array.isArray(row.media) && row.media.length > 0).length,
        linked_properties: targets.listings.filter((row) => relationId(row.property)).length,
        linked_tours: targets.listings.filter((row) => relationId(row.tour)).length,
        linked_translations: targets.listings.filter((row) => Array.isArray(row.translations) && row.translations.length > 0).length,
        linked_locations: targets.listings.filter((row) => relationId(row.location)).length,
        published_docs: targets.listings.filter((row) => String(row._status || "").trim().toLowerCase() === "published").length,
      },
      listing_translations: {
        count: targets.translations.length,
        keys: [...targets.translationsByKey.keys()].sort(),
        by_status: countBy(targets.translations, (row) => row.status || "missing"),
        public_indexable_true: targets.translations.filter((row) => row.public_indexable === true).length,
        published_docs: targets.translations.filter((row) => String(row._status || "").trim().toLowerCase() === "published").length,
      },
      media_assets: {
        count: targets.media.length,
        urls: targets.media.map((row) => row.url).sort(),
        by_review_status: countBy(targets.media, (row) => row.review_status || "missing"),
        public_true: targets.media.filter((row) => row.is_public === true).length,
        published_docs: targets.media.filter((row) => String(row._status || "").trim().toLowerCase() === "published").length,
      },
      listing_tours: {
        count: targets.tours.length,
        listing_ids: targets.tours.map((row) => relationId(row.listing_id)).sort(),
        by_review_status: countBy(targets.tours, (row) => row.review_status || "missing"),
        public_true: targets.tours.filter((row) => row.is_public === true).length,
        published_docs: targets.tours.filter((row) => String(row._status || "").trim().toLowerCase() === "published").length,
      },
      listing_enrichment_tasks: {
        count: targets.tasks.length,
        ids: targets.tasks.map((row) => row.id).sort(),
      },
      search_outbox: {
        rows: outboxRows,
        delta: outboxRows - beforeSnapshot.search_outbox.docs.length,
      },
    },
  };

  const checks = [
    {
      id: "imported_target_identities_present",
      ok:
        readback.target.locales.count === target.locales &&
        readback.target.locations.count === target.locations &&
        readback.target.properties.count === target.properties &&
        readback.target.listings.count === target.listings &&
        readback.target.listing_translations.count === target.listing_translations &&
        readback.target.media_assets.count === target.media_assets &&
        readback.target.listing_tours.count === target.listing_tours &&
        readback.target.listing_enrichment_tasks.count === target.listing_enrichment_tasks,
      observed: readback.target,
    },
    {
      id: "listing_status_review_required",
      ok:
        (readback.target.listings.by_cms_status.source_imported_review_required || 0) === target.listings &&
        readback.target.listings.published_docs === 0,
      observed: readback.target.listings,
    },
    {
      id: "listing_relationships_resolved",
      ok:
        readback.target.listings.linked_properties === target.listings &&
        readback.target.listings.linked_locations === target.listings &&
        readback.target.listings.linked_translations === listingsWithTranslations &&
        readback.target.listings.linked_media === listingsWithMedia &&
        readback.target.listings.linked_tours >= target.listing_tours &&
        listingRelationsResolved(seed, targets, localeIds),
      observed: readback.target.listings,
    },
    {
      id: "translations_non_public_drafts",
      ok:
        (readback.target.listing_translations.by_status.draft || 0) === target.listing_translations &&
        readback.target.listing_translations.public_indexable_true === 0 &&
        readback.target.listing_translations.published_docs === 0,
      observed: readback.target.listing_translations,
    },
    {
      id: "media_non_public",
      ok: readback.target.media_assets.public_true === 0 && readback.target.media_assets.published_docs === 0,
      observed: readback.target.media_assets,
    },
    {
      id: "tours_non_public",
      ok: readback.target.listing_tours.public_true === 0 && readback.target.listing_tours.published_docs === 0,
      observed: readback.target.listing_tours,
    },
    {
      id: "no_hook_outbox_growth",
      ok: readback.target.search_outbox.delta === 0,
      observed: readback.target.search_outbox,
    },
  ];

  return { checks, ok: checks.every((check) => check.ok), readback };
}

function sourceSummary(seed, registry) {
  return {
    cms_seed: seed.summary,
    locale_count: registry.locales.length,
    locale_codes: registry.locales.map((locale) => locale.code),
  };
}

function reportSkeleton({ attempt, current, dryRun, overwriteExisting, plan, registry, seed, target }) {
  return {
    attempt,
    committed: false,
    dry_run: dryRun,
    overwrite_existing: overwriteExisting,
    plan: plan.summary,
    source: sourceSummary(seed, registry),
    status: "pending",
    target,
    write_blockers: plan.conflicts,
    write_blockers_total: plan.conflicts.length,
    current: {
      collections: Object.fromEntries(IMPORT_COLLECTIONS.map((collection) => [collection, current[collection].docs.length])),
      search_outbox_rows: current.search_outbox.docs.length,
    },
  };
}

export function payloadCmsImportContextEnabled(req) {
  return req?.context?.[CMS_SEED_IMPORT_CONTEXT_FLAG] === true;
}

export function buildPayloadCmsImportPlan({ registry, seed, snapshot, overwriteExisting = false } = {}) {
  const localeIds = localeIdMap(snapshot);
  const planParts = [
    planCollection("locales", desiredLocalesBase(registry), (row) => snapshot.locales.byCode.get(row.key), { overwriteExisting }),
    planCollection("locations", desiredLocations(seed), (row) => snapshot.locations.byId.get(row.key), { overwriteExisting }),
    planCollection("properties", desiredProperties(seed), (row) => snapshot.properties.byId.get(row.key), { overwriteExisting }),
  ];

  if (registry.locales.every((locale) => localeIds.has(locale.code))) {
    planParts.push(planCollection("locales", desiredLocaleRelations(registry, localeIds), (row) => snapshot.locales.byCode.get(row.key), { overwriteExisting }));
    planParts.push(planCollection("listings", desiredListingsBase(seed, localeIds), (row) => snapshot.listings.byId.get(row.key), { overwriteExisting }));
    planParts.push(
      planCollection(
        "listing_translations",
        desiredTranslations(seed, localeIds),
        (row) => snapshot.listing_translations.byListingLocale.get(relationKey(row.match.listing, row.match.locale)),
        { overwriteExisting },
      ),
    );
    planParts.push(planCollection("media_assets", desiredMedia(seed), (row) => snapshot.media_assets.byUrl.get(row.key), { overwriteExisting }));
    planParts.push(planCollection("listing_tours", desiredTours(seed), (row) => snapshot.listing_tours.byListingId.get(row.key), { overwriteExisting }));
    planParts.push(planCollection("listing_enrichment_tasks", desiredTasks(seed), (row) => snapshot.listing_enrichment_tasks.byId.get(row.key), { overwriteExisting }));
    try {
      const relationIds = buildImportedRelationIds(seed, snapshot, localeIds);
      planParts.push(
        planCollection("listings", desiredListingRelations(seed, relationIds), (row) => snapshot.listings.byId.get(row.key), {
          overwriteExisting,
          allowListingRelationMerge: true,
        }),
      );
    } catch {
      // The preview plan is best-effort before create-time integer ids exist.
    }
  }

  return {
    plan: mergePlanParts(planParts),
    target: buildTargetSummary(seed, registry),
  };
}

async function executePlanPart({ payload, req, planParts, collection, desiredRows, currentRows, overwriteExisting = false, allowListingRelationMerge = false } = {}) {
  const part = planCollection(collection, desiredRows, currentRows, { overwriteExisting, allowListingRelationMerge });
  planParts.push(part);
  if (part.conflicts.length) return { blocked: true, part };
  await applyOperations(payload, part.operations, req);
  return { blocked: false, part };
}

export async function runPayloadCmsImport({
  dryRun = false,
  maxAttempts,
  overwriteExisting = false,
  payload,
  registry = loadLocaleRegistry(),
  seed = loadCmsSeed(),
  validateRegistry = true,
  validateSeed = true,
} = {}) {
  if (validateRegistry) assertLocaleRegistry(registry);
  if (validateSeed) assertCmsSeed(seed);
  assertPayload(payload);

  const attempts = retryCount(maxAttempts);
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const transactionId = await payload.db.beginTransaction({ accessMode: "read write", isolationLevel: "serializable" });
      if (!transactionId) throw new Error("Payload CMS importer could not open a transaction");
      const req = { payload, transactionID: transactionId };
      let committed = false;
      try {
        const current = await readSnapshot(payload, req);
        const target = buildTargetSummary(seed, registry);
        const planParts = [];

        let snapshot = current;
        let stage = await executePlanPart({
          collection: "locales",
          currentRows: (row) => snapshot.locales.byCode.get(row.key),
          desiredRows: desiredLocalesBase(registry),
          overwriteExisting,
          payload,
          planParts,
          req,
        });
        let plan = mergePlanParts(planParts);
        let report = reportSkeleton({ attempt, current, dryRun, overwriteExisting, plan, registry, seed, target });
        if (stage.blocked) {
          await payload.db.rollbackTransaction(transactionId);
          return { ...report, committed: false, status: "blocked_conflicts" };
        }

        snapshot = await readSnapshot(payload, req);
        const localeIds = localeIdMap(snapshot);

        for (const nextStage of [
          {
            collection: "locales",
            currentRows: (row) => snapshot.locales.byCode.get(row.key),
            desiredRows: desiredLocaleRelations(registry, localeIds),
          },
          {
            collection: "locations",
            currentRows: (row) => snapshot.locations.byId.get(row.key),
            desiredRows: desiredLocations(seed),
          },
          {
            collection: "properties",
            currentRows: (row) => snapshot.properties.byId.get(row.key),
            desiredRows: desiredProperties(seed),
          },
          {
            collection: "listings",
            currentRows: (row) => snapshot.listings.byId.get(row.key),
            desiredRows: desiredListingsBase(seed, localeIds),
          },
        ]) {
          stage = await executePlanPart({ ...nextStage, overwriteExisting, payload, planParts, req });
          plan = mergePlanParts(planParts);
          report = reportSkeleton({ attempt, current, dryRun, overwriteExisting, plan, registry, seed, target });
          if (stage.blocked) {
            await payload.db.rollbackTransaction(transactionId);
            return { ...report, committed: false, status: "blocked_conflicts" };
          }
        }

        snapshot = await readSnapshot(payload, req);

        for (const nextStage of [
          {
            collection: "listing_translations",
            currentRows: (row) => snapshot.listing_translations.byListingLocale.get(relationKey(row.match.listing, row.match.locale)),
            desiredRows: desiredTranslations(seed, localeIds),
          },
          {
            collection: "media_assets",
            currentRows: (row) => snapshot.media_assets.byUrl.get(row.key),
            desiredRows: desiredMedia(seed),
          },
          {
            collection: "listing_tours",
            currentRows: (row) => snapshot.listing_tours.byListingId.get(row.key),
            desiredRows: desiredTours(seed),
          },
          {
            collection: "listing_enrichment_tasks",
            currentRows: (row) => snapshot.listing_enrichment_tasks.byId.get(row.key),
            desiredRows: desiredTasks(seed),
          },
        ]) {
          stage = await executePlanPart({ ...nextStage, overwriteExisting, payload, planParts, req });
          plan = mergePlanParts(planParts);
          report = reportSkeleton({ attempt, current, dryRun, overwriteExisting, plan, registry, seed, target });
          if (stage.blocked) {
            await payload.db.rollbackTransaction(transactionId);
            return { ...report, committed: false, status: "blocked_conflicts" };
          }
        }

        snapshot = await readSnapshot(payload, req);
        const relationIds = buildImportedRelationIds(seed, snapshot, localeIds);
        stage = await executePlanPart({
          allowListingRelationMerge: true,
          collection: "listings",
          currentRows: (row) => snapshot.listings.byId.get(row.key),
          desiredRows: desiredListingRelations(seed, relationIds),
          overwriteExisting,
          payload,
          planParts,
          req,
        });
        plan = mergePlanParts(planParts);
        report = reportSkeleton({ attempt, current, dryRun, overwriteExisting, plan, registry, seed, target });
        if (stage.blocked) {
          await payload.db.rollbackTransaction(transactionId);
          return { ...report, committed: false, status: "blocked_conflicts" };
        }

        const after = await readSnapshot(payload, req);
        const integrity = aggregateReadback(after, current, target, seed, registry);
        if (!integrity.ok) {
          await payload.db.rollbackTransaction(transactionId);
          return { ...report, committed: false, integrity, status: "integrity_failed" };
        }

        if (dryRun) {
          await payload.db.rollbackTransaction(transactionId);
          return { ...report, committed: false, integrity, status: "dry_run_ready" };
        }

        await payload.db.commitTransaction(transactionId);
        committed = true;
        return { ...report, committed: true, integrity, status: "committed" };
      } catch (error) {
        if (!committed) await payload.db.rollbackTransaction(transactionId).catch(() => undefined);
        throw error;
      }
    } catch (error) {
      if (attempt === attempts || !retryableTransactionError(error)) throw error;
    }
  }
  throw new Error("Payload CMS importer exhausted transaction retries");
}

export async function loadPayloadCmsImportRuntime({ env = process.env, payload } = {}) {
  if (payload) {
    assertPayload(payload);
    return payload;
  }
  if (!String(env.PAYLOAD_SECRET || "").trim() || !String(env.DATABASE_URL || "").trim()) {
    throw new Error("Payload runtime is not configured");
  }
  const [{ getPayload }, payloadConfigModule] = await Promise.all([import("payload"), import("../../payload.config.js")]);
  const runtime = await getPayload({ config: await payloadConfigModule.default });
  assertPayload(runtime);
  return runtime;
}
