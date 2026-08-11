import {
  createBulkListingStatusEdits,
  createListingEdit,
  LISTING_EDIT_FIELDS,
  LISTING_FACT_EDIT_FIELDS,
  LISTING_SEO_EDIT_FIELDS,
  LISTING_WORKFLOW_EDIT_FIELDS,
} from "./listing-edits.mjs";
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

function payloadUser(principal) {
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

async function withPayloadTransaction(payload, { principal, accessMode, isolationLevel }, work) {
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

function listingEnrichmentTaskIdDuplicate(error) {
  const validationErrors = error?.data?.errors;
  return (
    error?.name === "ValidationError" &&
    error?.data?.collection === "listing_enrichment_tasks" &&
    Array.isArray(validationErrors) &&
    validationErrors.length === 1 &&
    validationErrors[0]?.path === "id" &&
    validationErrors[0]?.message === "Value must be unique"
  );
}

async function withListingEnrichmentDuplicateRetry(payload, transactionOptions, work) {
  try {
    return await withPayloadTransaction(payload, transactionOptions, work);
  } catch (error) {
    if (!listingEnrichmentTaskIdDuplicate(error)) throw error;
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

function mutationFromEdit(current, edit, principal, editedAt, requestChannel = "admin") {
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

export async function projectListingDraftSeed(seed, { env = process.env, payload = null, req = null } = {}) {
  if (!payload && missingPayloadRuntime(env)) return seed;
  try {
    const runtime = await loadPayloadCmsImportRuntime({ env, payload });
    const snapshot = await readPayloadCmsSnapshot({ payload: runtime, req });
    return projectPayloadCmsSeed(seed, snapshot);
  } catch (error) {
    if (!payload && /Payload runtime is not configured/i.test(String(error?.message || ""))) return seed;
    throw error;
  }
}

export async function saveListingDraft(
  seed,
  { env = process.env, payload = null, principal, input, editedAt = new Date().toISOString(), requestChannel = "admin" } = {},
) {
  const listingId = listingIdFor(input?.listingId || input?.listing_id);
  const patch = listingDraftPatchFromInput(input);
  const validated = createListingEdit(
    seed,
    {
      listingId,
      editor: requiredText(principal?.id, "Authenticated operator id", 64),
      patch,
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

  return withListingEnrichmentDuplicateRetry(runtime, { principal, accessMode: "read write", isolationLevel: "serializable" }, async (req) => {
    const current = await runtime.findByID({
      collection: "listings",
      id: listingId,
      depth: 0,
      draft: true,
      req,
    });
    if (!current) throw notFoundError("Known listingId is required");
    const mutation = mutationFromEdit(current, validated.edit, principal, editedAt, requestChannel);
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
    const projectedSeed = await projectListingDraftSeed(seed, { payload: runtime, req });
    return {
      changedFields: mutation.changedFields,
      idempotent: mutation.idempotent,
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

  return withPayloadTransaction(runtime, { principal, accessMode: "read write", isolationLevel: "serializable" }, async (req) => {
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
