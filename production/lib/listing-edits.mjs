import fs from "node:fs";
import path from "node:path";
import {
  assertPublicationReady,
  CANONICAL_PROPERTY_FAMILIES,
  derivePrimaryAreaSqm,
  normalizeImportedFact,
  propertyFamilyFor,
  propertySubtypeFor,
  PROPERTY_FIELD_REGISTRY,
} from "./listing-facts.mjs";
import { fromRoot } from "./paths.mjs";
import { contentHash, markStaleWhenSourceChanges } from "./translations.mjs";

export const DEFAULT_LISTING_EDIT_LEDGER_PATH = fromRoot("production", "data", "listing-edits.jsonl");

export const LISTING_FACT_EDIT_FIELDS = Object.freeze([
  "title",
  "h1",
  "description",
  "location",
  "property_type",
  "offer_type",
  "listing_status",
  "bedrooms",
  "bedrooms_not_applicable",
  "area_sqm",
  "price_eur",
  "price_on_request",
  "floor",
  "total_floors",
  "land_area_sqm",
  "condition",
  "location_precision",
]);
export const LISTING_WORKFLOW_EDIT_FIELDS = Object.freeze([
  "availability_verified_at",
  "location_verified_at",
  "price_verified_at",
  "price_on_request_verified_at",
  "publish_approved",
]);
export const LISTING_SEO_EDIT_FIELDS = Object.freeze([
  "seo_title",
  "seo_description",
  "seo_canonical",
  "seo_og_title",
  "seo_og_description",
  "seo_robots",
  "seo_review_confirmed",
]);
export const LISTING_EDIT_FIELDS = Object.freeze([
  ...LISTING_FACT_EDIT_FIELDS,
  ...LISTING_WORKFLOW_EDIT_FIELDS,
  ...LISTING_SEO_EDIT_FIELDS,
]);
export const PROPERTY_FACT_EDIT_FIELDS = Object.freeze(
  Object.entries(PROPERTY_FIELD_REGISTRY)
    .filter(([, definition]) => definition.scope === "property")
    .map(([field]) => field),
);
const EDITABLE_FIELDS = new Set(LISTING_EDIT_FIELDS);
const PROPERTY_FACT_EDIT_FIELD_SET = new Set(PROPERTY_FACT_EDIT_FIELDS);
const LEGACY_PROPERTY_FACT_EDIT_FIELDS = new Set([
  "location",
  "property_type",
  "bedrooms",
  "bedrooms_not_applicable",
  "area_sqm",
  "floor",
  "total_floors",
  "land_area_sqm",
  "condition",
  "location_precision",
]);
const TEXT_FIELDS = new Set([
  "title",
  "h1",
  "description",
  "location",
  "property_type",
  "offer_type",
  "condition",
  "seo_title",
  "seo_description",
  "seo_og_title",
  "seo_og_description",
]);
const BOOLEAN_FIELDS = new Set(["bedrooms_not_applicable", "price_on_request", "publish_approved", "seo_review_confirmed"]);
const SEO_FIELD_MAP = Object.freeze({
  seo_title: "title",
  seo_description: "description",
  seo_canonical: "canonical_override",
  seo_og_title: "og_title",
  seo_og_description: "og_description",
  seo_robots: "robots",
});
const FACT_FIELDS = new Set(LISTING_FACT_EDIT_FIELDS);
const WORKFLOW_FIELDS = new Set(LISTING_WORKFLOW_EDIT_FIELDS);
const VERIFICATION_TIMESTAMP_FIELDS = Object.freeze({
  availability_verified_at: "availability_verified_by",
  location_verified_at: "location_verified_by",
  price_verified_at: "price_verified_by",
  price_on_request_verified_at: "price_on_request_verified_by",
});
const LOCATION_PRECISIONS = new Set(["area_only", "approximate", "exact"]);
const ROBOTS_VALUES = new Set(["index,follow", "noindex,follow"]);
export const LISTING_STATUSES = Object.freeze(["available", "reserved", "sold", "rented", "archived"]);
const LISTING_STATUS_SET = new Set(LISTING_STATUSES);
const MAX_BULK_LISTING_EDITS = 100;

export function resetListingEdits(filePath = DEFAULT_LISTING_EDIT_LEDGER_PATH) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "");
}

export function readListingEdits(filePath = DEFAULT_LISTING_EDIT_LEDGER_PATH) {
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export function appendListingEdit(edit, { filePath = DEFAULT_LISTING_EDIT_LEDGER_PATH } = {}) {
  const rows = readListingEdits(filePath);
  const explicitId = String(edit.id || "").trim();
  const sameIntent = (candidate) =>
    candidate.listing_id === edit.listing_id &&
    candidate.editor === edit.editor &&
    candidate.media_reviewer === edit.media_reviewer &&
    JSON.stringify(candidate.patch || {}) === JSON.stringify(edit.patch || {}) &&
    JSON.stringify(candidate.property_patch || {}) === JSON.stringify(edit.property_patch || {}) &&
    JSON.stringify(candidate.listing_patch || {}) === JSON.stringify(edit.listing_patch || {});
  if (explicitId) {
    const existing = rows.find((row) => row.id === explicitId);
    if (existing) {
      if (!sameIntent(existing)) throw new Error("Listing edit id already belongs to a different change");
      return { ...existing, idempotent: true };
    }
  } else {
    const retry = rows.find(
      (row) =>
        sameIntent(row) &&
        ((row.source_hash_before === edit.source_hash_before && row.source_hash_after === edit.source_hash_after) ||
          (edit.source_hash_before === edit.source_hash_after && row.source_hash_after === edit.source_hash_after)),
    );
    if (retry) return { ...retry, idempotent: true };
  }

  const baseId = `listing-edit-${edit.listing_id}`;
  let id = explicitId || baseId;
  let suffix = 2;
  while (rows.some((row) => row.id === id)) {
    id = `${baseId}-${suffix}`;
    suffix += 1;
  }
  const persisted = { ...edit, id };
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(persisted)}\n`);
  return { ...persisted, idempotent: false };
}

export function applyListingEdits(seed, edits = []) {
  const editsByListing = new Map();
  for (const edit of edits) {
    if (!edit.listing_id) continue;
    editsByListing.set(edit.listing_id, [...(editsByListing.get(edit.listing_id) || []), edit]);
  }
  if (!editsByListing.size) return seed;
  const propertyEditsById = new Map();
  for (const [listingId, listingEdits] of editsByListing) {
    const listing = findListing(seed, listingId);
    const propertyId = String(listing?.property || "").trim();
    if (!propertyId) continue;
    for (const edit of listingEdits) {
      if (!Object.keys(edit.property_patch || {}).length) continue;
      propertyEditsById.set(propertyId, [...(propertyEditsById.get(propertyId) || []), edit]);
    }
  }

  const records = seed.records.map((record) => {
    const listingEdits = editsByListing.get(record.id);
    if (record.collection !== "listings" || !listingEdits?.length) return record;
    const facts = { ...record.facts };
    const seo = { ...record.seo };
    const workflow = { ...(record.workflow || {}) };
    let location = record.location;
    let mediaReviewer = null;
    for (const edit of listingEdits) {
      const patch = { ...(edit.patch || {}), ...(edit.listing_patch || {}) };
      const propertyPatch = edit.property_patch || {};
      const priceChanged = Object.hasOwn(patch, "price_eur") || Object.hasOwn(patch, "price_on_request");
      const locationChanged = Object.hasOwn(patch, "location") || Object.hasOwn(propertyPatch, "location_id");
      if (priceChanged) {
        if (!Object.hasOwn(patch, "price_verified_at")) workflow.price_verified_at = null;
        if (!Object.hasOwn(patch, "price_on_request_verified_at")) workflow.price_on_request_verified_at = null;
      }
      if (locationChanged && !Object.hasOwn(patch, "location_verified_at")) workflow.location_verified_at = null;
      if (propertyPatch.location_id) location = propertyPatch.location_id;
      if (patch.price_on_request === true) patch.price_eur = null;
      let seoChanged = false;
      for (const [field, value] of Object.entries(patch)) {
        if (SEO_FIELD_MAP[field]) {
          seo[SEO_FIELD_MAP[field]] = value;
          seoChanged = true;
        } else if (WORKFLOW_FIELDS.has(field)) workflow[field] = value;
        else if (FACT_FIELDS.has(field)) facts[field] = value;
      }
      if (seoChanged || Object.hasOwn(patch, "seo_review_confirmed")) {
        seo.human_approved = patch.seo_review_confirmed === true;
        seo.reviewer = seo.human_approved ? edit.editor || null : null;
        seo.reviewed_at = seo.human_approved ? edit.edited_at || null : null;
        seo.review_status = seo.human_approved ? "approved" : "review_required";
      }
      if (Object.keys(patch).length || Object.keys(edit.property_patch || {}).length || edit.media_reviewer) {
        if (edit.edited_at) workflow.last_edited_at = edit.edited_at;
        if (edit.editor) workflow.last_editor = edit.editor;
      }
      for (const [field, ownerField] of Object.entries(VERIFICATION_TIMESTAMP_FIELDS)) {
        if (Object.hasOwn(patch, field)) workflow[ownerField] = patch[field] ? edit.editor || null : null;
      }
      if (Object.hasOwn(patch, "publish_approved")) {
        workflow.publish_approved_by = patch.publish_approved ? edit.editor || null : null;
        workflow.publish_approved_at = patch.publish_approved ? edit.edited_at || null : null;
      }
      if (edit.media_reviewer) mediaReviewer = edit.media_reviewer;
    }
    const media = mediaReviewer
      ? (record.media || []).map((item) =>
          item.is_public ? item : { ...item, review_status: "reviewed_private", media_reviewer: mediaReviewer },
        )
      : record.media;
    return {
      ...record,
      facts,
      seo,
      workflow,
      location,
      media,
      media_workflow: mediaReviewer
        ? { ...record.media_workflow, review_gated_assets: 0, media_reviewer: mediaReviewer }
        : record.media_workflow,
    };
  });

  const properties = Array.isArray(seed.properties)
    ? seed.properties.map((property) => {
        const propertyEdits = propertyEditsById.get(property.id);
        if (!propertyEdits?.length) return property;
        const facts = { ...(property.facts || {}) };
        const factVerification = [...(property.fact_verification || [])];
        const zeroValueAudit = new Set(property.zero_value_audit || []);
        let propertyFamily = property.property_family;
        let propertySubtype = property.property_subtype;
        let location = property.location;
        for (const edit of propertyEdits) {
          for (const [field, value] of Object.entries(edit.property_patch || {})) {
            if (field === "property_family") propertyFamily = value;
            else if (field === "property_subtype") propertySubtype = value;
            else if (field === "location_id") location = value;
            else facts[field] = value;
          }
          for (const verification of edit.property_fact_verification || []) {
            const index = factVerification.findIndex((entry) => entry.field === verification.field);
            if (index >= 0) factVerification[index] = verification;
            else factVerification.push(verification);
          }
          for (const field of Object.keys(edit.property_patch || {})) zeroValueAudit.delete(field);
          for (const field of edit.property_zero_value_audit || []) zeroValueAudit.add(field);
        }
        facts.primary_area_sqm = derivePrimaryAreaSqm({ ...facts, property_family: propertyFamily, property_subtype: propertySubtype });
        return {
          ...property,
          property_family: propertyFamily,
          property_subtype: propertySubtype,
          location,
          facts,
          fact_verification: factVerification,
          zero_value_audit: [...zeroValueAudit].sort(),
        };
      })
    : seed.properties;

  return { ...seed, records, ...(properties ? { properties } : {}) };
}

function findListing(seed, listingId) {
  return seed.records.find((record) => record.collection === "listings" && record.id === listingId);
}

function findProperty(seed, listing) {
  const propertyId = String(listing?.property || "").trim();
  if (!propertyId) return null;
  return (seed.properties || []).find((property) => property.id === propertyId) || null;
}

function normalizePatch(patch = {}, { allowEmpty = false } = {}) {
  const entries = Object.entries(patch).filter(([field]) => EDITABLE_FIELDS.has(field));
  if (!entries.length && allowEmpty) return {};
  if (!entries.length) throw new Error("Listing edit patch must include editable listing fields");
  const normalized = Object.fromEntries(entries.map(([field, value]) => [field, normalizePatchValue(field, value)]));
  if (normalized.price_on_request === true) normalized.price_eur = null;
  return normalized;
}

function normalizeScopedListingPatch(patch = {}, { allowEmpty = false } = {}) {
  const unsupported = Object.keys(patch).filter((field) => !EDITABLE_FIELDS.has(field));
  if (unsupported.length) throw new Error(`Listing patch has unsupported fields: ${unsupported.join(", ")}`);
  const physical = Object.keys(patch).filter((field) => LEGACY_PROPERTY_FACT_EDIT_FIELDS.has(field));
  if (physical.length) {
    throw new Error(`Physical facts belong in propertyPatch: ${physical.join(", ")}`);
  }
  return normalizePatch(patch, { allowEmpty });
}

function normalizePropertyPatch(property, patch = {}, { allowEmpty = false } = {}) {
  const entries = Object.entries(patch);
  if (!entries.length && allowEmpty) return { property_patch: {}, fact_verification: [], zero_value_audit: [] };
  if (!entries.length) throw new Error("Property patch must include editable property fields");
  const unsupported = entries.map(([field]) => field).filter((field) => !PROPERTY_FACT_EDIT_FIELD_SET.has(field));
  if (unsupported.length) throw new Error(`Property patch has unsupported fields: ${unsupported.join(", ")}`);

  const candidate = {
    ...(property?.facts || {}),
    property_family: patch.property_family ?? property?.property_family,
    property_subtype: patch.property_subtype ?? property?.property_subtype,
  };
  const family = propertyFamilyFor(candidate);
  if (!CANONICAL_PROPERTY_FAMILIES.includes(family)) {
    throw new Error("Property patch requires a canonical property_family");
  }
  const subtype = propertySubtypeFor(candidate);
  const propertyPatch = {};
  const factVerification = [];
  const zeroValueAudit = [];

  for (const [field, value] of entries) {
    if (field === "property_family") {
      if (!CANONICAL_PROPERTY_FAMILIES.includes(String(value || "").trim().toLowerCase())) {
        throw new Error("property_family must be canonical");
      }
      propertyPatch[field] = String(value).trim().toLowerCase();
      continue;
    }
    if (field === "property_subtype") {
      const normalized = String(value || "").trim();
      if (!normalized || normalized.length > 80) throw new Error("property_subtype must be 1 to 80 characters");
      propertyPatch[field] = normalized;
      continue;
    }
    const normalized = normalizeImportedFact(value, {
      field,
      family,
      subtype,
      source: { source_type: "listing_edit_ledger", source_reference: property.id },
    });
    if (normalized.verification.state === "not_applicable") {
      throw new Error(`${field} is not applicable to ${family}`);
    }
    propertyPatch[field] = normalized.value;
    factVerification.push({ field, ...normalized.verification });
    if (normalized.zero_value_audit) zeroValueAudit.push(field);
  }
  return { property_patch: propertyPatch, fact_verification: factVerification, zero_value_audit: zeroValueAudit };
}

function normalizeEditPatches(seed, record, input) {
  const usesScopedPatches = input.propertyPatch !== undefined || input.listingPatch !== undefined;
  if (!usesScopedPatches) {
    return {
      edit_scope: "legacy_flat",
      patch: normalizePatch(input.patch, { allowEmpty: Boolean(input.mediaReviewer) }),
      property_patch: {},
      listing_patch: {},
      property_fact_verification: [],
      property_zero_value_audit: [],
    };
  }
  if (input.patch && Object.keys(input.patch).length) {
    throw new Error("Use either legacy patch or scoped propertyPatch/listingPatch, not both");
  }
  const property = findProperty(seed, record);
  if (input.propertyPatch && Object.keys(input.propertyPatch).length && !property) {
    throw new Error("Scoped property patch requires a linked property record");
  }
  const propertyResult = normalizePropertyPatch(property, input.propertyPatch || {}, { allowEmpty: true });
  const listingPatch = normalizeScopedListingPatch(input.listingPatch || {}, { allowEmpty: true });
  if (!Object.keys(propertyResult.property_patch).length && !Object.keys(listingPatch).length && !input.mediaReviewer) {
    throw new Error("Scoped listing edit must include a propertyPatch, listingPatch, or media reviewer");
  }
  if (propertyResult.property_patch.location_id && Array.isArray(seed.locations)) {
    const knownLocation = seed.locations.some((location) => location.id === propertyResult.property_patch.location_id);
    if (!knownLocation) throw new Error("propertyPatch.location_id must reference a known location");
  }
  return {
    edit_scope: "property_listing",
    patch: {},
    property_patch: propertyResult.property_patch,
    listing_patch: listingPatch,
    property_fact_verification: propertyResult.fact_verification,
    property_zero_value_audit: propertyResult.zero_value_audit,
  };
}

function normalizePatchValue(field, value) {
  if (TEXT_FIELDS.has(field)) {
    if (typeof value !== "string") throw new Error(`${field} must be text`);
    const normalized = value.trim();
    const max = field === "description" ? 20000 : field.includes("description") ? 320 : 240;
    if (normalized.length > max) throw new Error(`${field} must be ${max} characters or fewer`);
    return normalized;
  }
  if (field === "listing_status") {
    const status = String(value || "").trim().toLowerCase();
    if (!LISTING_STATUS_SET.has(status)) throw new Error("listing_status must be available, reserved, sold, rented, or archived");
    return status;
  }
  if (BOOLEAN_FIELDS.has(field)) return value === true || value === "true" || value === "on" || value === "1";
  if (field === "location_precision") {
    const precision = String(value || "").trim().toLowerCase();
    if (!LOCATION_PRECISIONS.has(precision)) throw new Error("location_precision must be area_only, approximate, or exact");
    return precision;
  }
  if (Object.hasOwn(VERIFICATION_TIMESTAMP_FIELDS, field)) {
    if (value === "" || value === null) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new Error(`${field} must be a valid date and time`);
    return date.toISOString();
  }
  if (field === "seo_canonical") {
    const canonical = String(value || "").trim();
    if (!canonical) return "";
    if (!canonical.startsWith("/") || canonical.startsWith("//") || canonical.includes("?") || canonical.includes("#")) {
      throw new Error("seo_canonical must be a root-relative path without query parameters or fragments");
    }
    return canonical;
  }
  if (field === "seo_robots") {
    const robots = String(value || "").trim().toLowerCase();
    if (!ROBOTS_VALUES.has(robots)) throw new Error("seo_robots must be index,follow or noindex,follow");
    return robots;
  }
  if (value === "" || value === null) return "";
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${field} must be numeric`);
  if (field === "price_eur") {
    if (number <= 0) throw new Error("price_eur must be positive");
    return number;
  }
  if (field === "area_sqm") {
    if (number <= 0) throw new Error("area_sqm must be positive");
    return number;
  }
  if (field === "land_area_sqm") {
    if (number <= 0) throw new Error("land_area_sqm must be positive");
    return number;
  }
  if (["bedrooms", "floor", "total_floors"].includes(field)) {
    if (!Number.isInteger(number) || number < 0) throw new Error(`${field} must be a non-negative integer`);
    return number;
  }
  return value;
}

export function staleTranslationsForListing(record, sourceHashAfter, translationTasks = []) {
  const stale = (translation) => {
    const staleTranslation = markStaleWhenSourceChanges(sourceHashAfter, translation);
    return staleTranslation.status === "stale"
      ? {
          ...staleTranslation,
          previous_status: translation.status,
          stale_reason: "source_listing_changed",
        }
      : staleTranslation;
  };
  const seedTranslations = record.translations
    .filter((translation) => translation.locale !== record.source_locale)
    .map(stale);
  const ledgerTranslations = translationTasks
    .filter((translation) => translation.object_type === "listing" && translation.object_id === record.id)
    .filter((translation) => translation.target_locale !== record.source_locale)
    .map(stale);

  return [...seedTranslations, ...ledgerTranslations]
    .filter((translation) => translation.status === "stale");
}

export function createListingEdit(seed, input, translationTasks = [], editedAt = new Date().toISOString()) {
  const record = findListing(seed, input.listingId);
  if (!record) throw new Error("Known listingId is required");
  if (!input.editor) throw new Error("Listing edit requires an editor");
  const patches = normalizeEditPatches(seed, record, input);
  assertWorkflowTimestampsAtOrBefore(patches, editedAt);
  const patch = patches.patch;
  const translationSourcePatch = Object.fromEntries(
    Object.entries({ ...patch, ...patches.listing_patch }).filter(
      ([field]) => LISTING_FACT_EDIT_FIELDS.includes(field) || Object.hasOwn(SEO_FIELD_MAP, field),
    ),
  );
  const property = findProperty(seed, record);
  const scopedSource = patches.edit_scope === "property_listing";
  const sourceBefore = scopedSource
    ? {
        listing: record.facts,
        property: { ...(property?.facts || {}), property_family: property?.property_family, property_subtype: property?.property_subtype },
      }
    : record.facts;
  const sourceAfter = scopedSource
    ? {
        listing: { ...record.facts, ...translationSourcePatch },
        property: {
          ...(property?.facts || {}),
          ...patches.property_patch,
          property_family: patches.property_patch.property_family || property?.property_family,
          property_subtype: patches.property_patch.property_subtype || property?.property_subtype,
        },
      }
    : { ...record.facts, ...translationSourcePatch };
  const sourceHashBefore = contentHash(sourceBefore);
  const sourceHashAfter = contentHash(sourceAfter);
  const staleTranslations = staleTranslationsForListing(record, sourceHashAfter, translationTasks);
  const requestedId = String(input.id || "").trim();
  if (requestedId && !/^[a-z0-9][a-z0-9._:-]{2,159}$/i.test(requestedId)) {
    throw new Error("Listing edit id must be a stable identifier");
  }

  const edit = {
    edited_at: editedAt,
    ...(requestedId ? { id: requestedId } : {}),
    listing_id: record.id,
    editor: input.editor,
    media_reviewer: input.mediaReviewer ? String(input.mediaReviewer).trim() : null,
    source_locale: record.source_locale,
    edit_scope: patches.edit_scope,
    patch,
    ...(patches.edit_scope === "property_listing"
      ? {
          property_patch: patches.property_patch,
          listing_patch: patches.listing_patch,
          property_fact_verification: patches.property_fact_verification,
          property_zero_value_audit: patches.property_zero_value_audit,
        }
      : {}),
    source_hash_before: sourceHashBefore,
    source_hash_after: sourceHashAfter,
    stale_translation_count: staleTranslations.length,
    stale_locales: [...new Set(staleTranslations.map((translation) => translation.locale || translation.target_locale))],
  };
  if (patch.publish_approved === true || patches.listing_patch.publish_approved === true) {
    const projectedSeed = applyListingEdits(seed, [edit]);
    const projectedRecord = findListing(projectedSeed, record.id);
    assertPublicationReady({
      listing: projectedRecord,
      property: findProperty(projectedSeed, projectedRecord),
      now: editedAt,
    });
  }
  return { edit, staleTranslations };
}

function assertWorkflowTimestampsAtOrBefore(patches, editedAt) {
  const editTimestamp = new Date(editedAt);
  if (Number.isNaN(editTimestamp.getTime())) throw new Error("editedAt must be a valid date and time");
  const values = { ...(patches.patch || {}), ...(patches.listing_patch || {}) };
  for (const field of Object.keys(VERIFICATION_TIMESTAMP_FIELDS)) {
    if (!values[field]) continue;
    if (new Date(values[field]).getTime() > editTimestamp.getTime()) {
      throw new Error(`${field} cannot be later than editedAt`);
    }
  }
}

function listingIdsFrom(input) {
  const source = Array.isArray(input.listingIds) ? input.listingIds : String(input.listingIds || "").split(",");
  const ids = [...new Set(source.map((value) => String(value || "").trim()).filter(Boolean))];
  if (!ids.length) throw new Error("Select at least one listing");
  if (ids.length > MAX_BULK_LISTING_EDITS) throw new Error(`Bulk listing updates are limited to ${MAX_BULK_LISTING_EDITS} listings`);
  return ids;
}

export function createBulkListingStatusEdits(seed, input, translationTasks = [], editedAt = new Date().toISOString()) {
  const listingIds = listingIdsFrom(input);
  const targetStatus = String(input.targetStatus || input.listingStatus || "").trim().toLowerCase();
  if (!LISTING_STATUS_SET.has(targetStatus)) {
    throw new Error("targetStatus must be available, reserved, sold, rented, or archived");
  }
  if (!input.editor) throw new Error("Bulk listing update requires an editor");
  const requestId = String(input.requestId || "").trim();
  if (requestId && !/^[a-z0-9][a-z0-9._:-]{2,79}$/i.test(requestId)) {
    throw new Error("Bulk listing requestId must be a stable identifier");
  }

  const unchangedListingIds = [];
  const changes = listingIds.flatMap((listingId) => {
    const record = findListing(seed, listingId);
    if (!record) throw new Error(`Unknown listingId: ${listingId}`);
    if ((record.facts?.listing_status || "available") === targetStatus) {
      unchangedListingIds.push(listingId);
      return [];
    }
    const result = createListingEdit(
      seed,
      {
        id: requestId ? `${requestId}-${listingId}` : undefined,
        listingId,
        editor: input.editor,
        patch: { listing_status: targetStatus },
      },
      translationTasks,
      editedAt,
    );
    return [{ listingId, ...result }];
  });

  return {
    targetStatus,
    requestedListingIds: listingIds,
    unchangedListingIds,
    changes,
  };
}

export function assertListingEdits(rows) {
  if (!rows.length) throw new Error("Listing edit ledger must contain at least one row");
  const ids = new Set();
  for (const row of rows) {
    if (!row.id || !row.listing_id || !row.editor || !row.edited_at || !row.source_hash_before || !row.source_hash_after) {
      throw new Error("Listing edit row is missing review data");
    }
    if (ids.has(row.id)) throw new Error("Listing edit ids must be unique");
    ids.add(row.id);
    if (!Number.isInteger(row.stale_translation_count) || row.stale_translation_count < 0) {
      throw new Error("Listing edit stale translation count must be a non-negative integer");
    }
    const scoped = row.edit_scope === "property_listing";
    normalizePatch(row.patch, { allowEmpty: Boolean(row.media_reviewer) || scoped });
    if (scoped) {
      if (!row.property_patch || !row.listing_patch || !Array.isArray(row.property_fact_verification)) {
        throw new Error("Scoped listing edit must include property and listing patch metadata");
      }
    }
    if ("contact" in row || "email" in row || "phone" in row || "message" in row) {
      throw new Error("Listing edit rows must not contain private contact data");
    }
  }
  return true;
}
