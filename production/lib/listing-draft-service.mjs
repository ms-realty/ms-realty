import {
  createBulkListingStatusEdits,
  createListingEdit,
  LISTING_EDIT_FIELDS,
  LISTING_FACT_EDIT_FIELDS,
  LISTING_SEO_EDIT_FIELDS,
  LISTING_WORKFLOW_EDIT_FIELDS,
} from "./listing-edits.mjs";
import {
  factPromotionsFor,
  listingFactReviewFor,
  normalizeConfirmedFactFields,
} from "./listing-fact-review.mjs";
import { derivePrimaryAreaSqm } from "./listing-facts.mjs";
import {
  loadPayloadCmsImportRuntime,
  projectPayloadCmsSeed,
  readPayloadCmsSnapshot,
} from "./payload-cms-import.mjs";

const PROHIBITED_FIELDS = new Set(["publish_approved", "seo_review_confirmed"]);
const FACT_FIELDS = new Set(LISTING_FACT_EDIT_FIELDS);
const WORKFLOW_FIELDS = new Set(LISTING_WORKFLOW_EDIT_FIELDS);
const SEO_FIELDS = Object.freeze({
  seo_title: "title",
  seo_description: "description",
  seo_canonical: "canonical_override",
  seo_og_title: "og_title",
  seo_og_description: "og_description",
  seo_robots: "robots",
});
const VERIFICATION_OWNER_FIELDS = Object.freeze({
  availability_verified_at: "availability_verified_by",
  location_verified_at: "location_verified_by",
  price_verified_at: "price_verified_by",
  price_on_request_verified_at: "price_on_request_verified_by",
});

export const DURABLE_LISTING_EDIT_FIELDS = Object.freeze(
  LISTING_EDIT_FIELDS.filter((field) => !PROHIBITED_FIELDS.has(field)),
);

const DURABLE_FIELD_SET = new Set(DURABLE_LISTING_EDIT_FIELDS);

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function relationId(value) {
  return String(value && typeof value === "object" ? value.id || "" : value || "").trim();
}

async function readDraftCollectionAll(runtime, collection, req) {
  const result = await runtime.find({
    collection,
    draft: true,
    req,
    pagination: false,
    limit: 0,
  });
  return Array.isArray(result?.docs) ? result.docs : [];
}

function requiredText(value, label, max = 240) {
  const text = String(value || "").trim();
  if (!text || text.length > max) throw new Error(`${label} is required and must be ${max} characters or fewer`);
  return text;
}

function listingIdFor(value) {
  return requiredText(value, "Known listingId", 80);
}

function missingPayloadRuntime(env = process.env) {
  return !String(env.PAYLOAD_SECRET || "").trim() || !String(env.DATABASE_URL || "").trim();
}

function unavailableError(message, cause = null) {
  const error = new Error(message);
  error.status = 503;
  error.code = "payload_draft_unavailable";
  if (cause) error.cause = cause;
  return error;
}

function notFoundError(message) {
  const error = new Error(message);
  error.status = 404;
  error.code = "listing_draft_not_found";
  return error;
}

function assertCompletePayloadSnapshot(seed, snapshot) {
  for (const [collection, rows] of [
    ["listings", seed.records || []],
    ["properties", seed.properties || []],
    ["locations", seed.locations || []],
  ]) {
    const missing = rows.map((row) => String(row.id || "").trim()).filter((id) => id && !snapshot[collection].byId.has(id));
    if (missing.length) {
      throw unavailableError(`Payload ${collection} snapshot is incomplete: ${missing.slice(0, 5).join(", ")}`);
    }
  }
}

export function payloadUser(principal) {
  const id = requiredText(principal?.id, "Authenticated operator id", 64);
  const roles = Array.isArray(principal?.roles) ? principal.roles.map((role) => String(role || "").trim()).filter(Boolean) : [];
  const role = roles.includes("admin")
    ? "admin"
    : roles.includes("editor")
      ? "editor"
      : roles.includes("translator")
        ? "translator"
        : roles.includes("broker")
          ? "broker"
          : roles[0] || "editor";
  return { id, role, roles, source: principal?.source || "admin" };
}

export async function withPayloadTransaction(payload, { principal, accessMode, isolationLevel }, work) {
  const transactionID = await payload.db.beginTransaction({ accessMode, isolationLevel });
  if (!transactionID) throw unavailableError("Payload draft store did not open a transaction");
  const req = { payload, transactionID, user: payloadUser(principal) };
  let committed = false;
  try {
    const result = await work(req);
    await payload.db.commitTransaction(transactionID);
    committed = true;
    return result;
  } finally {
    if (!committed) await payload.db.rollbackTransaction(transactionID).catch(() => undefined);
  }
}

function listingWorkQueueDuplicate(error) {
  const validationErrors = error?.data?.errors;
  if ([error?.code, error?.cause?.code, error?.data?.code, error?.data?.cause?.code].includes("23505")) {
    const constraint = String(error?.constraint || error?.cause?.constraint || error?.data?.constraint || "");
    return !constraint || /^(listing_enrichment_tasks|search_outbox)_/.test(constraint);
  }
  return (
    error?.name === "ValidationError" &&
    error?.data?.collection === "listing_enrichment_tasks" &&
    Array.isArray(validationErrors) &&
    validationErrors.length === 1 &&
    validationErrors[0]?.path === "id" &&
    validationErrors[0]?.message === "Value must be unique"
  );
}

async function withListingWorkQueueDuplicateRetry(payload, transactionOptions, work) {
  try {
    return await withPayloadTransaction(payload, transactionOptions, work);
  } catch (error) {
    if (!listingWorkQueueDuplicate(error)) throw error;
    return withPayloadTransaction(payload, transactionOptions, work);
  }
}

function patchSourceFromInput(input = {}) {
  if (input.patch !== undefined) {
    if (!input.patch || typeof input.patch !== "object" || Array.isArray(input.patch)) {
      throw new Error("Listing draft patch must be an object");
    }
    return { ...input.patch };
  }
  return Object.fromEntries(
    Object.entries(input).filter(([field]) => DURABLE_FIELD_SET.has(field) || PROHIBITED_FIELDS.has(field)),
  );
}

export function listingDraftPatchFromInput(input = {}) {
  const source = patchSourceFromInput(input);
  const prohibited = Object.keys(source).filter((field) => PROHIBITED_FIELDS.has(field));
  if (prohibited.length) throw new Error(`Listing draft patch cannot change: ${prohibited.join(", ")}`);
  const unsupported = Object.keys(source).filter((field) => !DURABLE_FIELD_SET.has(field));
  if (unsupported.length) throw new Error(`Listing draft patch has unsupported fields: ${unsupported.join(", ")}`);
  if (!Object.keys(source).length) throw new Error("Listing draft patch must include editable listing fields");
  return source;
}

function translationStateFor(document = {}) {
  const state = String(document.translation_state || document.status || "draft").trim().toLowerCase();
  return state || "draft";
}

async function localeCodeMap(runtime, req) {
  const locales = await readDraftCollectionAll(runtime, "locales", req);
  return new Map(locales.map((locale) => [relationId(locale.id), String(locale.code || "").trim()]));
}

async function markListingTranslationsStale(
  runtime,
  { req, listing, sourceHashAfter, staleTranslations = [], localeCodes = null, translationDocs = null } = {},
) {
  if (!listing || !staleTranslations.length) return { staleTranslations: [], localeCodes };
  const translationIds = new Set((Array.isArray(listing.translations) ? listing.translations : []).map((value) => relationId(value)).filter(Boolean));
  if (!translationIds.size) return { staleTranslations: [], localeCodes };
  const staleByLocale = new Map(
    staleTranslations
      .map((translation) => [String(translation.locale || translation.target_locale || "").trim(), translation])
      .filter(([locale]) => locale),
  );
  if (!staleByLocale.size) return { staleTranslations: [], localeCodes };
  const codes = localeCodes || (await localeCodeMap(runtime, req));
  const sourceLocaleId = relationId(listing.source_locale);
  const translations = Array.isArray(translationDocs) ? translationDocs : await readDraftCollectionAll(runtime, "listing_translations", req);
  const persisted = [];

  for (const document of translations) {
    if (!translationIds.has(relationId(document.id))) continue;
    const localeId = relationId(document.locale);
    const locale = codes.get(localeId) || localeId;
    const translationState = translationStateFor(document);
    if (!locale || !staleByLocale.has(locale)) continue;
    if (localeId === sourceLocaleId) continue;
    if (translationState === "stale" && document.public_indexable === false) continue;
    if (String(document.source_hash || "") === String(sourceHashAfter || "")) continue;

    await runtime.update({
      collection: "listing_translations",
      id: document.id,
      depth: 0,
      draft: true,
      req,
      data: {
        status: "draft",
        translation_state: "stale",
        public_indexable: false,
      },
      context: {
        ms_realty_operator: {
          id: req.user.id,
          roles: req.user.roles,
          source: req.user.source || "admin",
        },
      },
    });
    document.status = "draft";
    document.translation_state = "stale";
    document.public_indexable = false;
    persisted.push({
      ...clone(staleByLocale.get(locale)),
      id: document.id,
      locale,
      status: "stale",
      translation_state: "stale",
      previous_status: translationState,
      source_hash: document.source_hash,
      translated_hash: document.translated_hash,
      reviewer: document.reviewer || null,
      approved_at: document.approved_at || null,
      public_indexable: false,
    });
  }

  return { staleTranslations: persisted, localeCodes: codes };
}

function mutationFromEdit(current, edit, principal, editedAt, requestChannel = "admin", extraChangedFields = []) {
  const actorId = principal.id;
  const patch = { ...(edit.patch || {}), ...(edit.listing_patch || {}) };
  for (const field of Object.keys(VERIFICATION_OWNER_FIELDS)) {
    if (patch[field] === "") patch[field] = null;
  }
  const sameValue = (left, right) => JSON.stringify(left ?? "") === JSON.stringify(right ?? "");
  const facts = { ...(current.facts || {}) };
  const seo = { ...(current.seo || {}) };
  const workflow = { ...(current.workflow || {}) };
  const changedFields = [];

  for (const [field, value] of Object.entries(patch)) {
    if (FACT_FIELDS.has(field)) {
      const currentValue = field === "listing_status" ? facts[field] || "available" : facts[field];
      if (!sameValue(currentValue, value)) {
        facts[field] = value;
        changedFields.push(field);
      }
      continue;
    }
    if (Object.hasOwn(SEO_FIELDS, field)) {
      const target = SEO_FIELDS[field];
      const currentValue = target === "robots" ? seo[target] || "index,follow" : seo[target];
      if (!sameValue(currentValue, value)) {
        seo[target] = value;
        changedFields.push(field);
      }
      continue;
    }
    if (WORKFLOW_FIELDS.has(field) && !sameValue(workflow[field], value)) {
      workflow[field] = value;
      changedFields.push(field);
    }
  }

  for (const field of extraChangedFields) {
    if (field && !changedFields.includes(field)) changedFields.push(field);
  }

  if (!changedFields.length) return { changedFields: [], data: null, idempotent: true };

  const priceChanged = changedFields.some((field) => field === "price_eur" || field === "price_on_request");
  const locationChanged = changedFields.some((field) => field === "location" || field === "location_precision");

  workflow.last_editor = actorId;
  workflow.last_edited_at = editedAt;
  workflow.last_edit_event = {
    actor_id: actorId,
    auth_source: String(principal.source || "admin"),
    channel: requestChannel === "mcp" ? "mcp" : "admin",
    changed_fields: [...changedFields].sort(),
    edited_at: editedAt,
    source_hash_before: edit.source_hash_before,
    source_hash_after: edit.source_hash_after,
    source_locale: edit.source_locale,
    stale_locales: [...(edit.stale_locales || [])].sort(),
    stale_translation_count: Number(edit.stale_translation_count || 0),
  };
  if (priceChanged && !Object.hasOwn(patch, "price_verified_at")) {
    workflow.price_verified_at = null;
    workflow.price_verified_by = null;
  }
  if (priceChanged && !Object.hasOwn(patch, "price_on_request_verified_at")) {
    workflow.price_on_request_verified_at = null;
    workflow.price_on_request_verified_by = null;
  }
  if (locationChanged && !Object.hasOwn(patch, "location_verified_at")) {
    workflow.location_verified_at = null;
    workflow.location_verified_by = null;
  }
  for (const [field, ownerField] of Object.entries(VERIFICATION_OWNER_FIELDS)) {
    if (!Object.hasOwn(patch, field)) continue;
    workflow[ownerField] = workflow[field] ? actorId : null;
  }

  return { changedFields, data: { facts, seo, workflow }, idempotent: false };
}

const FACT_REVIEW_PROPERTY_FIELDS = new Set([
  "bedrooms",
  "area_sqm",
  "floor",
  "total_floors",
  "land_area_sqm",
  "condition",
]);

function propertyForListing(seed, listing) {
  const propertyId = String(listing?.property || "").trim();
  return propertyId ? (seed.properties || []).find((property) => property.id === propertyId) || null : null;
}

function factReviewInput(seed, listing, patch, input, editedAt) {
  const confirmedFields = normalizeConfirmedFactFields(input.confirmedFacts ?? input.confirmFacts);
  const property = propertyForListing(seed, listing);
  const review = listingFactReviewFor({ listing, property });
  const promotion = factPromotionsFor({
    listing,
    property,
    confirmedFields,
    changedFields: Object.keys(patch),
  });
  if (!promotion.rows.length) return { patch, propertyPatch: {}, propertyFactVerification: {}, promotion };

  const propertyPatch = {};
  const propertyFactVerification = {};
  for (const row of review.rows) {
    const propertyFields = promotion.property_fields_by_editor_field?.[row.editor_field] || [];
    if (!promotion.editor_fields.includes(row.editor_field) || !propertyFields.length) continue;
    for (const field of propertyFields) {
      const value = Object.hasOwn(patch, row.editor_field) ? patch[row.editor_field] : property?.facts?.[field];
      if (value === null || value === undefined || value === "") continue;
      propertyPatch[field] = value;
      propertyFactVerification[field] = { state: "broker_verified" };
    }
  }
  if (promotion.property_fields.some((field) => !Object.hasOwn(propertyPatch, field))) {
    throw new Error("A confirmed fact needs a current canonical value or an editor value");
  }

  const listingPatch = { ...patch };
  for (const field of promotion.editor_fields) {
    if (FACT_REVIEW_PROPERTY_FIELDS.has(field)) delete listingPatch[field];
  }
  if (promotion.verify_price && !Object.hasOwn(listingPatch, "price_verified_at")) {
    listingPatch.price_verified_at = editedAt;
  }
  return {
    patch,
    listingPatch,
    propertyPatch,
    propertyFactVerification,
    promotion,
  };
}

function propertyMutationFromEdit(current, edit) {
  const propertyPatch = edit.property_patch || {};
  const verifications = edit.property_fact_verification || [];
  if (!Object.keys(propertyPatch).length && !verifications.length) {
    return { changedFields: [], data: null, idempotent: true };
  }
  const facts = { ...(current?.facts || {}) };
  const currentVerification = [...(current?.fact_verification || [])];
  const changedFields = [];
  for (const [field, value] of Object.entries(propertyPatch)) {
    if (field === "property_family" || field === "property_subtype" || field === "location_id") continue;
    if (JSON.stringify(facts[field] ?? null) !== JSON.stringify(value ?? null)) {
      facts[field] = value;
      changedFields.push(field);
    }
  }
  const data = { facts };
  for (const field of ["property_family", "property_subtype"]) {
    if (Object.hasOwn(propertyPatch, field) && JSON.stringify(current?.[field] ?? null) !== JSON.stringify(propertyPatch[field] ?? null)) {
      data[field] = propertyPatch[field];
      changedFields.push(field);
    }
  }
  if (Object.hasOwn(propertyPatch, "location_id") && JSON.stringify(current?.location ?? null) !== JSON.stringify(propertyPatch.location_id ?? null)) {
    data.location = propertyPatch.location_id;
    changedFields.push("location_id");
  }
  for (const verification of verifications) {
    const index = currentVerification.findIndex((entry) => entry.field === verification.field);
    const previous = index >= 0 ? currentVerification[index] : null;
    if (JSON.stringify(previous || null) === JSON.stringify(verification)) continue;
    if (index >= 0) currentVerification[index] = verification;
    else currentVerification.push(verification);
    changedFields.push(verification.field);
  }
  const family = data.property_family || current?.property_family || facts.property_family;
  const subtype = data.property_subtype || current?.property_subtype || facts.property_subtype;
  facts.primary_area_sqm = derivePrimaryAreaSqm({ ...facts, property_family: family, property_subtype: subtype });
  data.fact_verification = currentVerification;
  data.zero_value_audit = [...new Set(current?.zero_value_audit || [])].filter((field) => !Object.hasOwn(propertyPatch, field));
  if (!changedFields.length) return { changedFields: [], data: null, idempotent: true };
  return { changedFields: [...new Set(changedFields)], data, idempotent: false };
}

export async function projectListingDraftSeed(
  seed,
  { env = process.env, payload = null, req = null, requirePayload = false } = {},
) {
  if (!payload && missingPayloadRuntime(env)) {
    if (requirePayload) throw unavailableError("Payload listing authority is not configured");
    return seed;
  }
  try {
    const runtime = await loadPayloadCmsImportRuntime({ env, payload });
    const snapshot = await readPayloadCmsSnapshot({ payload: runtime, req });
    if (requirePayload) assertCompletePayloadSnapshot(seed, snapshot);
    return projectPayloadCmsSeed(seed, snapshot);
  } catch (error) {
    if (!requirePayload && !payload && /Payload runtime is not configured/i.test(String(error?.message || ""))) return seed;
    if (requirePayload && !error?.status) throw unavailableError("Payload listing authority is unavailable", error);
    throw error;
  }
}

export async function saveListingDraft(
  seed,
  { env = process.env, payload = null, principal, input, editedAt = new Date().toISOString(), requestChannel = "admin" } = {},
) {
  const listingId = listingIdFor(input?.listingId || input?.listing_id);
  const patch = listingDraftPatchFromInput(input);
  const listing = seed.records.find((record) => record.collection === "listings" && record.id === listingId);
  if (!listing) throw notFoundError("Known listingId is required");
  const factReview = factReviewInput(seed, listing, patch, input, editedAt);
  const scoped = Object.keys(factReview.propertyPatch).length > 0;
  const validated = createListingEdit(
    seed,
    {
      listingId,
      editor: requiredText(principal?.id, "Authenticated operator id", 64),
      ...(scoped
        ? {
            propertyPatch: factReview.propertyPatch,
            propertyFactVerification: factReview.propertyFactVerification,
            listingPatch: factReview.listingPatch || patch,
          }
        : { patch: factReview.listingPatch || patch }),
    },
    [],
    editedAt,
  );

  let runtime;
  try {
    runtime = await loadPayloadCmsImportRuntime({ env, payload });
  } catch (error) {
    throw unavailableError("Payload draft store is not configured", error);
  }

  return withListingWorkQueueDuplicateRetry(runtime, { principal, accessMode: "read write", isolationLevel: "serializable" }, async (req) => {
    const current = await runtime.findByID({
      collection: "listings",
      id: listingId,
      depth: 0,
      draft: true,
      req,
    });
    if (!current) throw notFoundError("Known listingId is required");
    const currentProperty = current.property
      ? await runtime.findByID({
          collection: "properties",
          id: relationId(current.property),
          depth: 0,
          req,
        })
      : null;
    const propertyMutation = propertyMutationFromEdit(currentProperty, validated.edit);
    const mutation = mutationFromEdit(
      current,
      validated.edit,
      principal,
      editedAt,
      requestChannel,
      propertyMutation.changedFields,
    );
    let staleTranslations = [];
    if (!mutation.idempotent) {
      await runtime.update({
        collection: "listings",
        id: listingId,
        depth: 0,
        draft: true,
        req,
        data: mutation.data,
        context: {
          ms_realty_operator: {
            id: principal.id,
            roles: principal.roles,
            source: principal.source || "admin",
          },
        },
      });
      const staleResult = await markListingTranslationsStale(runtime, {
        req,
        listing: current,
        sourceHashAfter: validated.edit.source_hash_after,
        staleTranslations: validated.staleTranslations,
      });
      staleTranslations = staleResult.staleTranslations;
    }
    if (!propertyMutation.idempotent) {
      if (!currentProperty) throw unavailableError("Listing property record is unavailable");
      await runtime.update({
        collection: "properties",
        id: relationId(current.property),
        depth: 0,
        req,
        data: propertyMutation.data,
        context: {
          ms_realty_operator: {
            id: principal.id,
            roles: principal.roles,
            source: principal.source || "admin",
          },
        },
      });
    }
    const projectedSeed = await projectListingDraftSeed(seed, { payload: runtime, req });
    return {
      changedFields: [...new Set([...mutation.changedFields, ...propertyMutation.changedFields])],
      verifiedFactFields: factReview.promotion.editor_fields,
      idempotent: mutation.idempotent && propertyMutation.idempotent,
      listingId,
      patch: clone(patch),
      staleTranslations,
      projectedSeed,
    };
  });
}

export async function saveBulkListingStatusDrafts(
  seed,
  { env = process.env, payload = null, principal, input, editedAt = new Date().toISOString(), requestChannel = "admin" } = {},
) {
  const attributed = { ...(input || {}), editor: requiredText(principal?.id, "Authenticated operator id", 64) };
  const batch = createBulkListingStatusEdits(seed, attributed, [], editedAt);

  let runtime;
  try {
    runtime = await loadPayloadCmsImportRuntime({ env, payload });
  } catch (error) {
    throw unavailableError("Payload draft store is not configured", error);
  }

  return withListingWorkQueueDuplicateRetry(runtime, { principal, accessMode: "read write", isolationLevel: "serializable" }, async (req) => {
    const edits = [];
    let localeCodes = null;
    let translationDocs = null;
    const staleTranslations = [];
    const needsStaleCheck = batch.changes.some((result) => Array.isArray(result.staleTranslations) && result.staleTranslations.length);
    if (needsStaleCheck) {
      [localeCodes, translationDocs] = await Promise.all([
        localeCodeMap(runtime, req),
        readDraftCollectionAll(runtime, "listing_translations", req),
      ]);
    }
    for (const result of batch.changes) {
      const current = await runtime.findByID({
        collection: "listings",
        id: result.listingId,
        depth: 0,
        draft: true,
        req,
      });
      if (!current) throw notFoundError(`Known listingId is required: ${result.listingId}`);
      const mutation = mutationFromEdit(current, result.edit, principal, editedAt, requestChannel);
      if (!mutation.idempotent) {
        await runtime.update({
          collection: "listings",
          id: result.listingId,
          depth: 0,
          draft: true,
          req,
          data: mutation.data,
          context: {
            ms_realty_operator: {
              id: principal.id,
              roles: principal.roles,
              source: principal.source || "admin",
            },
          },
        });
        const staleResult = await markListingTranslationsStale(runtime, {
          req,
          listing: current,
          sourceHashAfter: result.edit.source_hash_after,
          staleTranslations: result.staleTranslations,
          localeCodes,
          translationDocs,
        });
        localeCodes = staleResult.localeCodes;
        staleTranslations.push(...staleResult.staleTranslations);
        edits.push({ ...result.edit, idempotent: false, staleTranslations: staleResult.staleTranslations });
        continue;
      }
      edits.push({ ...result.edit, idempotent: true, staleTranslations: [] });
    }
    const projectedSeed = await projectListingDraftSeed(seed, { payload: runtime, req });
    return {
      batch,
      edits,
      staleTranslations,
      projectedSeed,
    };
  });
}
