import { createHash } from "node:crypto";
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

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
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

function stableMediaId(url) {
  const digest = createHash("sha256").update(requiredText(url, "CMS media url", 2000)).digest("hex");
  return `media-${digest.slice(0, 24)}`;
}

function stableTranslationId(listingId, locale) {
  return `translation-${requiredText(listingId, "CMS translation listing id", 160)}-${requiredText(locale, "CMS translation locale", 20)}`;
}

function stableTourId(listingId) {
  return `tour-${requiredText(listingId, "CMS tour listing id", 160)}`;
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
  const mediaCount = seed.records.reduce((total, record) => total + (record.media || []).length, 0);
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

function buildLocaleResolution(snapshot, registry) {
  const byCode = new Map(snapshot.locales.docs.map((doc) => [String(doc.code || "").trim(), doc]));
  return new Map(
    registry.locales.map((locale) => {
      const current = byCode.get(locale.code);
      return [locale.code, current?.id || locale.code];
    }),
  );
}

function buildIdentityMaps(snapshot, seed, registry, localeIds) {
  const locations = new Map((seed.locations || []).map((row) => [row.id, snapshot.locations.byId.get(row.id)?.id || row.id]));
  const properties = new Map((seed.properties || []).map((row) => [row.id, snapshot.properties.byId.get(row.id)?.id || row.id]));
  const listings = new Map(seed.records.map((row) => [row.id, snapshot.listings.byId.get(row.id)?.id || row.id]));
  const translations = new Map();
  const media = new Map();
  const tours = new Map();
  const tasks = new Map((seed.enrichment_tasks || []).map((row) => [row.id, snapshot.listing_enrichment_tasks.byId.get(row.id)?.id || row.id]));

  for (const record of seed.records) {
    for (const translation of record.translations || []) {
      const key = relationKey(record.id, translation.locale);
      const current = snapshot.listing_translations.byListingLocale.get(key);
      translations.set(key, current?.id || stableTranslationId(record.id, translation.locale));
    }
    for (const item of record.media || []) {
      const key = requiredText(item.url, "CMS media url", 2000);
      const current = snapshot.media_assets.byUrl.get(key);
      media.set(key, current?.id || stableMediaId(key));
    }
    if (record.tour) {
      const current = snapshot.listing_tours.byListingId.get(record.id);
      tours.set(record.id, current?.id || stableTourId(record.id));
    }
  }

  return { listings, localeIds, locations, media, properties, tasks, tours, translations };
}

function desiredLocales(registry, localeIds) {
  return registry.locales.map((locale) => ({
    id: localeIds.get(locale.code),
    data: {
      id: localeIds.get(locale.code),
      code: locale.code,
      native_name: locale.native_name,
      admin_name: locale.admin_name,
      direction: locale.direction,
      public_enabled: locale.public_enabled === true,
      indexable: locale.indexable === true,
      fallback_locale: locale.fallback_locale ? localeIds.get(locale.fallback_locale) || locale.fallback_locale : null,
      reviewer_owner: locale.reviewer_owner || locale.reviewer_role || null,
    },
    key: locale.code,
    match: { code: locale.code, id: localeIds.get(locale.code) },
  }));
}

function desiredLocations(seed, ids) {
  return (seed.locations || []).map((location) => ({
    id: ids.locations.get(location.id),
    data: {
      id: ids.locations.get(location.id),
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

function desiredProperties(seed, ids) {
  return (seed.properties || []).map((property) => ({
    id: ids.properties.get(property.id),
    data: {
      id: ids.properties.get(property.id),
      location: ids.locations.get(property.location) || property.location,
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

function desiredListings(seed, ids) {
  return seed.records.map((record) => {
    const translationIds = (record.translations || []).map((row) => ids.translations.get(relationKey(record.id, row.locale)));
    const mediaIds = (record.media || []).map((row) => ids.media.get(row.url));
    const tourId = record.tour ? ids.tours.get(record.id) : null;
    return {
      id: ids.listings.get(record.id),
      data: {
        id: ids.listings.get(record.id),
        cms_status: "source_imported_review_required",
        source_locale: ids.localeIds.get(record.source_locale) || record.source_locale,
        source_domain: record.source_domain,
        source_url: record.source_url,
        facts: clone(record.facts || {}),
        seo: clone(record.seo || {}),
        workflow: clone(record.workflow || {}),
        property: ids.properties.get(record.property) || record.property,
        location: ids.locations.get(record.location) || record.location,
        translations: translationIds,
        media: mediaIds,
        tour: tourId || null,
        routing: {
          ...(record.routing || {}),
          review_required: true,
          deployable: false,
        },
        migration: clone(record.migration || {}),
      },
      key: record.id,
      match: { id: record.id },
    };
  });
}

function desiredTranslations(seed, ids) {
  return seed.records.flatMap((record) =>
    (record.translations || []).map((translation) => ({
      id: ids.translations.get(relationKey(record.id, translation.locale)),
      data: {
        id: ids.translations.get(relationKey(record.id, translation.locale)),
        listing: ids.listings.get(record.id) || record.id,
        locale: ids.localeIds.get(translation.locale) || translation.locale,
        source_locale: ids.localeIds.get(translation.source_locale) || translation.source_locale,
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
      match: { listing: ids.listings.get(record.id) || record.id, locale: ids.localeIds.get(translation.locale) || translation.locale },
    })),
  );
}

function desiredMedia(seed, ids) {
  return seed.records.flatMap((record) =>
    (record.media || []).map((media) => ({
      id: ids.media.get(media.url),
      data: {
        id: ids.media.get(media.url),
        url: media.url,
        asset_url: media.asset_url ?? null,
        alt: media.alt || "",
        width: media.width ?? null,
        height: media.height ?? null,
        kind: media.kind,
        is_public: false,
        review_status: media.is_public === true ? "review_required" : media.review_status || "review_required",
      },
      key: media.url,
      match: { url: media.url },
    })),
  );
}

function desiredTours(seed, ids) {
  return seed.records
    .filter((record) => record.tour)
    .map((record) => ({
      id: ids.tours.get(record.id),
      data: {
        id: ids.tours.get(record.id),
        provider: record.tour.provider,
        listing_id: ids.listings.get(record.id) || record.id,
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
      match: { listing_id: ids.listings.get(record.id) || record.id },
    }));
}

function desiredTasks(seed, ids) {
  return (seed.enrichment_tasks || []).map((task) => ({
    id: ids.tasks.get(task.id),
    data: {
      id: ids.tasks.get(task.id),
      listing: ids.listings.get(task.listing) || task.listing,
      property: ids.properties.get(task.property) || task.property,
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

function desiredImportState(seed, registry, snapshot) {
  const localeIds = buildLocaleResolution(snapshot, registry);
  const ids = buildIdentityMaps(snapshot, seed, registry, localeIds);
  return {
    ids,
    locales: desiredLocales(registry, localeIds),
    locations: desiredLocations(seed, ids),
    properties: desiredProperties(seed, ids),
    listings: desiredListings(seed, ids),
    listing_translations: desiredTranslations(seed, ids),
    media_assets: desiredMedia(seed, ids),
    listing_tours: desiredTours(seed, ids),
    listing_enrichment_tasks: desiredTasks(seed, ids),
  };
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

function currentComparable(document, desiredData) {
  if (!document) return null;
  return Object.fromEntries(Object.keys(desiredData).map((key) => [key, clone(document[key])]));
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
    if (relationPatch.conflicts.length && !overwriteExisting) {
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
    return { action: "updated", data: desired.data };
  }

  const mergedPatch = patch || {};
  if (allowListingRelationMerge) {
    for (const [key, value] of Object.entries(mergedPatch)) {
      if (!safePatch.ok || !fields.includes(key)) continue;
    }
  }
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

function buildPlan(snapshot, desired, { overwriteExisting = false } = {}) {
  const localePlan = planCollection("locales", desired.locales, (row) => snapshot.locales.byCode.get(row.key) || snapshot.locales.byId.get(row.id), {
    overwriteExisting,
  });
  const locationPlan = planCollection("locations", desired.locations, (row) => snapshot.locations.byId.get(row.key), { overwriteExisting });
  const propertyPlan = planCollection("properties", desired.properties, (row) => snapshot.properties.byId.get(row.key), { overwriteExisting });
  const listingBaseRows = desired.listings.map((row) => ({
    ...row,
    data: Object.fromEntries(
      Object.entries(row.data).filter(([key]) => !["translations", "media", "tour"].includes(key)),
    ),
  }));
  const listingBasePlan = planCollection(
    "listings",
    listingBaseRows,
    (row) => snapshot.listings.byId.get(row.key),
    { overwriteExisting },
  );
  const translationPlan = planCollection(
    "listing_translations",
    desired.listing_translations,
    (row) => snapshot.listing_translations.byListingLocale.get(row.key) || snapshot.listing_translations.byId.get(row.id),
    { overwriteExisting },
  );
  const mediaPlan = planCollection("media_assets", desired.media_assets, (row) => snapshot.media_assets.byUrl.get(row.key) || snapshot.media_assets.byId.get(row.id), {
    overwriteExisting,
  });
  const tourPlan = planCollection("listing_tours", desired.listing_tours, (row) => snapshot.listing_tours.byListingId.get(row.key) || snapshot.listing_tours.byId.get(row.id), {
    overwriteExisting,
  });
  const baseListingByKey = new Map(listingBaseRows.map((row) => [row.key, row]));
  const listingRelationsPlan = planCollection("listings", desired.listings, (row) => snapshot.listings.byId.get(row.key), {
    overwriteExisting,
    allowListingRelationMerge: true,
  });
  const relationOperations = desired.listings.map((row) => {
    const current = snapshot.listings.byId.get(row.key) || baseListingByKey.get(row.key)?.data || null;
    const planned = planRecord({
      collection: "listings",
      current,
      desired: row,
      overwriteExisting,
      allowListingRelationMerge: true,
    });
    return { current, planned, row };
  });
  const taskPlan = planCollection("listing_enrichment_tasks", desired.listing_enrichment_tasks, (row) => snapshot.listing_enrichment_tasks.byId.get(row.key), {
    overwriteExisting,
  });

  const operations = [
    ...localePlan.operations,
    ...locationPlan.operations,
    ...propertyPlan.operations,
    ...listingBasePlan.operations,
    ...translationPlan.operations,
    ...mediaPlan.operations,
    ...tourPlan.operations,
    ...relationOperations
      .filter(({ planned }) => planned.action === "updated")
      .map(({ planned, row, current }) => ({
        action: "updated",
        collection: "listings",
        data: planned.data,
        desired: row,
        id: row.id,
        currentId: current?.id || row.id,
      })),
    ...taskPlan.operations,
  ];
  const conflicts = [
    ...localePlan.conflicts,
    ...locationPlan.conflicts,
    ...propertyPlan.conflicts,
    ...listingBasePlan.conflicts,
    ...translationPlan.conflicts,
    ...mediaPlan.conflicts,
    ...tourPlan.conflicts,
    ...listingRelationsPlan.conflicts,
    ...relationOperations
      .filter(({ planned }) => planned.action === "conflict")
      .map(({ planned }) => planned.conflict)
      .slice(0, SAMPLE_CONFLICT_LIMIT),
    ...taskPlan.conflicts,
  ];
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
  if (!req?.transactionID) throw new Error("Payload CMS snapshot requires a transaction-aware req");
  return readSnapshot(payload, req);
}

function localeCode(value, snapshot) {
  const id = relationId(value);
  return snapshot.locales.byId.get(id)?.code || id || null;
}

function projectedTranslation(document, snapshot) {
  return {
    locale: localeCode(document.locale, snapshot),
    source_locale: localeCode(document.source_locale, snapshot),
    status: document.status,
    source_hash: document.source_hash,
    translated_hash: document.translated_hash,
    reviewer: document.reviewer || null,
    approved_at: document.approved_at || null,
    direction: document.direction || null,
    public_indexable: document.public_indexable === true,
    human_approved: ["approved", "published"].includes(String(document.status || "").trim().toLowerCase()),
    translation_state: document.translation_state || document.status || "draft",
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

function aggregateReadback(snapshot, beforeSnapshot, target) {
  const listings = snapshot.listings.docs;
  const translations = snapshot.listing_translations.docs;
  const media = snapshot.media_assets.docs;
  const tours = snapshot.listing_tours.docs;
  const outboxRows = snapshot.search_outbox.docs.length;

  const readback = {
    collections: Object.fromEntries(IMPORT_COLLECTIONS.map((collection) => [collection, snapshot[collection].docs.length])),
    listings: {
      by_cms_status: countBy(listings, (row) => row.cms_status || "missing"),
      linked_media: listings.filter((row) => Array.isArray(row.media) && row.media.length > 0).length,
      linked_properties: listings.filter((row) => relationId(row.property)).length,
      linked_tours: listings.filter((row) => relationId(row.tour)).length,
      linked_translations: listings.filter((row) => Array.isArray(row.translations) && row.translations.length > 0).length,
      linked_locations: listings.filter((row) => relationId(row.location)).length,
      published_docs: listings.filter((row) => String(row._status || "").trim().toLowerCase() === "published").length,
    },
    listing_translations: {
      by_status: countBy(translations, (row) => row.status || "missing"),
      public_indexable_true: translations.filter((row) => row.public_indexable === true).length,
      published_docs: translations.filter((row) => String(row._status || "").trim().toLowerCase() === "published").length,
    },
    media_assets: {
      by_review_status: countBy(media, (row) => row.review_status || "missing"),
      public_true: media.filter((row) => row.is_public === true).length,
      published_docs: media.filter((row) => String(row._status || "").trim().toLowerCase() === "published").length,
    },
    listing_tours: {
      by_review_status: countBy(tours, (row) => row.review_status || "missing"),
      public_true: tours.filter((row) => row.is_public === true).length,
      published_docs: tours.filter((row) => String(row._status || "").trim().toLowerCase() === "published").length,
    },
    search_outbox: {
      rows: outboxRows,
      delta: outboxRows - beforeSnapshot.search_outbox.docs.length,
    },
  };

  const expectedCollections = { ...target, search_outbox: beforeSnapshot.search_outbox.docs.length };
  const checks = [
    {
      id: "collections_match_target",
      ok: Object.entries(expectedCollections).every(([collection, count]) => readback.collections[collection] === count),
      expected: expectedCollections,
      observed: readback.collections,
    },
    {
      id: "listing_status_review_required",
      ok: (readback.listings.by_cms_status.source_imported_review_required || 0) === target.listings && readback.listings.published_docs === 0,
      observed: readback.listings,
    },
    {
      id: "translations_non_public_drafts",
      ok:
        (readback.listing_translations.by_status.draft || 0) === target.listing_translations &&
        readback.listing_translations.public_indexable_true === 0 &&
        readback.listing_translations.published_docs === 0,
      observed: readback.listing_translations,
    },
    {
      id: "media_non_public",
      ok: readback.media_assets.public_true === 0 && readback.media_assets.published_docs === 0,
      observed: readback.media_assets,
    },
    {
      id: "tours_non_public",
      ok: readback.listing_tours.public_true === 0 && readback.listing_tours.published_docs === 0,
      observed: readback.listing_tours,
    },
    {
      id: "no_hook_outbox_growth",
      ok: readback.search_outbox.delta === 0,
      observed: readback.search_outbox,
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
  const desired = desiredImportState(seed, registry, snapshot);
  return {
    desired,
    plan: buildPlan(snapshot, desired, { overwriteExisting }),
    target: buildTargetSummary(seed, registry),
  };
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
        const { desired, plan, target } = buildPayloadCmsImportPlan({ registry, seed, snapshot: current, overwriteExisting });
        const report = reportSkeleton({ attempt, current, dryRun, overwriteExisting, plan, registry, seed, target });

        if (plan.conflicts.length && !overwriteExisting) {
          await payload.db.rollbackTransaction(transactionId);
          return { ...report, committed: false, status: "blocked_conflicts" };
        }

        await applyOperations(payload, plan.operations, req);
        const after = await readSnapshot(payload, req);
        const integrity = aggregateReadback(after, current, target);
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
