// Payload-backed listing media authority.
//
// The upload bytes are deliberately written before this module is called: the
// media upload pipeline owns sanitising and storage, while this module owns the
// durable relationship between an object, its listing draft, and its human
// review history. The two writes are joined by explicit orphan handling in the
// error path; a successful byte PUT is never reported as a successful upload
// until the Payload transaction commits.

import { createHash } from "node:crypto";
import { mediaAssetId } from "./media-reviews.mjs";
import { publicMediaUpload } from "./media-uploads.mjs";
import { withPayloadTransaction } from "./listing-draft-service.mjs";
import {
  LISTING_PRIVATE_PREFIX,
  mediaUploadPublicUrl,
} from "./media-upload-storage.mjs";

export const MEDIA_ASSET_COLLECTION = "media_assets";

const LISTING_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const DURABLE_REVIEW_STATUSES = Object.freeze({
  pending: "review_required",
  publish: "approved_imported_photo",
  keep_private: "reviewed_private",
});
const INTERNAL_MEDIA_URL_PREFIX = "https://media.invalid/assets/";
const STAGED_LISTING_MARKER = `/${LISTING_PRIVATE_PREFIX}/`;
const PRIVATE_LISTING_KEY = /^([^/]+)\/wp-content\/private\/listings\/([^/]+)\/([^/]+)\/([^/]+)$/;
const PUBLIC_LISTING_KEY = /^([^/]+)\/wp-content\/uploads\/(\d{4})\/(\d{2})\/listings\/([^/]+)\/([^/]+)\/([^/]+)$/;

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function relationId(value) {
  return String(value && typeof value === "object" ? value.id || "" : value || "").trim();
}

function relationIds(value) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return values.map(relationId).filter(Boolean);
}

function requiredText(value, label, max = 240) {
  const text = String(value ?? "").trim();
  if (!text || text.length > max) throw new Error(`${label} is required and must be ${max} characters or fewer`);
  return text;
}

function isStagedStorageKey(value) {
  return String(value || "").includes(STAGED_LISTING_MARKER);
}

function internalMediaUrl(assetId) {
  return `${INTERNAL_MEDIA_URL_PREFIX}${encodeURIComponent(String(assetId || "asset"))}`;
}

function scopedStorageParts(key) {
  const value = String(key || "");
  const privateMatch = value.match(PRIVATE_LISTING_KEY);
  if (privateMatch) {
    return { visibility: "staged_private", host: privateMatch[1], listingId: privateMatch[2], assetId: privateMatch[3], name: privateMatch[4] };
  }
  const publicMatch = value.match(PUBLIC_LISTING_KEY);
  if (publicMatch) {
    return {
      visibility: "public",
      host: publicMatch[1],
      year: publicMatch[2],
      month: publicMatch[3],
      listingId: publicMatch[4],
      assetId: publicMatch[5],
      name: publicMatch[6],
    };
  }
  return null;
}

function storageKeyForVisibility(key, visibility, at = new Date()) {
  const parts = scopedStorageParts(key);
  if (!parts) return null;
  if (parts.visibility === visibility) return String(key);
  if (visibility === "staged_private") {
    return `${parts.host}/${LISTING_PRIVATE_PREFIX}/${parts.listingId}/${parts.assetId}/${parts.name}`;
  }
  const stamp = at instanceof Date && !Number.isNaN(at.valueOf()) ? at : new Date();
  const year = String(stamp.getUTCFullYear());
  const month = String(stamp.getUTCMonth() + 1).padStart(2, "0");
  return `${parts.host}/wp-content/uploads/${year}/${month}/listings/${parts.listingId}/${parts.assetId}/${parts.name}`;
}

export class MediaDurableStoreUnavailableError extends Error {
  constructor(message, cause = null) {
    super(message);
    this.name = "MediaDurableStoreUnavailableError";
    this.code = "media_durable_store_unavailable";
    this.status = 503;
    if (cause) this.cause = cause;
  }
}

export class MediaPersistenceError extends Error {
  constructor(message, { cause = null, storageCleanup = "unsupported", orphanedStorage = false } = {}) {
    super(message);
    this.name = "MediaPersistenceError";
    this.code = "media_persistence_failed";
    this.status = 503;
    this.storageCleanup = storageCleanup;
    this.orphanedStorage = orphanedStorage;
    if (cause) this.cause = cause;
  }
}

export class MediaReviewConflictError extends Error {
  constructor(message = "Media review id already belongs to a different decision") {
    super(message);
    this.name = "MediaReviewConflictError";
    this.code = "media_review_conflict";
    this.status = 409;
  }
}

export function mediaDurableStoreConfigFromEnv(env = process.env) {
  const payloadSecret = String(env.PAYLOAD_SECRET || "").trim();
  const databaseUrl = String(env.DATABASE_URL || "").trim();
  const marker = String(env.MS_REALTY_MEDIA_DURABLE_STORE_ENABLED || "").trim().toLowerCase();
  return {
    // Payload is already the production runtime authority. An explicit false
    // is the only opt-out; this keeps durable-only deployments safe when the
    // media-specific marker has not yet been added to their environment.
    mediaDurableStoreEnabled: marker ? marker === "true" : Boolean(payloadSecret && databaseUrl),
    payloadSecret,
    databaseUrl,
    workspaceId: String(env.MS_REALTY_WORKSPACE_ID || "").trim(),
  };
}

export function isMediaDurableStoreEnabled(config = mediaDurableStoreConfigFromEnv()) {
  return Boolean(config?.mediaDurableStoreEnabled === true && config.payloadSecret && config.databaseUrl);
}

export function mediaDurableRuntimeConfigured({ runtimeDataDurableOnly = false, payload = null, config = null, env = process.env } = {}) {
  if (!runtimeDataDurableOnly) return false;
  // Tests and the Next/Node adapters may hand us an already-open Local API;
  // its presence is the strongest configuration signal and avoids requiring
  // test credentials in process.env.
  if (payload) return true;
  return isMediaDurableStoreEnabled(config || mediaDurableStoreConfigFromEnv(env));
}

function assertPayloadRuntime(payload) {
  if (
    !payload ||
    !payload.db ||
    typeof payload.db.beginTransaction !== "function" ||
    typeof payload.db.commitTransaction !== "function" ||
    typeof payload.db.rollbackTransaction !== "function" ||
    typeof payload.find !== "function" ||
    typeof payload.create !== "function" ||
    typeof payload.update !== "function" ||
    typeof payload.findByID !== "function"
  ) {
    throw new Error("Payload runtime cannot read and write listing media");
  }
  return payload;
}

async function runtimePayload(payload, env = process.env) {
  try {
    if (payload) return assertPayloadRuntime(payload);
    if (!String(env.PAYLOAD_SECRET || "").trim() || !String(env.DATABASE_URL || "").trim()) {
      throw new Error("Payload media authority is not configured");
    }
    const [{ getPayload }, payloadConfigModule] = await Promise.all([import("payload"), import("../../payload.config.js")]);
    return assertPayloadRuntime(await getPayload({ config: await payloadConfigModule.default }));
  } catch (error) {
    if (error instanceof MediaDurableStoreUnavailableError) throw error;
    throw new MediaDurableStoreUnavailableError("Durable Payload media authority is unavailable", error);
  }
}

function assertPrincipal(principal) {
  const id = String(principal?.id || "").trim();
  if (!id || id.length > 64) {
    const error = new Error("Media mutations require a named authenticated operator");
    error.status = 403;
    error.code = "forbidden";
    throw error;
  }
  const roles = Array.isArray(principal?.roles) ? principal.roles.map((role) => String(role || "").trim()) : [];
  if (!roles.includes("admin") && !roles.includes("editor")) {
    const error = new Error("Media mutations require an authenticated admin or editor");
    error.status = 403;
    error.code = "forbidden";
    throw error;
  }
  return { id, roles, source: principal?.source || "admin" };
}

function bindActor(input, actor, field) {
  const submitted = String(input?.[field] || "").trim();
  if (submitted && submitted !== actor.id) {
    const error = new Error(`Submitted ${field} must match the authenticated operator`);
    error.status = 403;
    error.code = "forbidden";
    throw error;
  }
  return { ...(input || {}), [field]: actor.id };
}

function isUniqueViolation(error) {
  return [error?.code, error?.cause?.code, error?.data?.code, error?.data?.cause?.code].includes("23505");
}

function isRetryableTransactionFailure(error) {
  return [error?.code, error?.cause?.code, error?.data?.code, error?.data?.cause?.code].some((code) =>
    ["40001", "40P01"].includes(String(code || "")),
  ) || /could not serialize|serialization failure|deadlock detected/i.test(String(error?.message || error));
}

function assetIdForDocument(document = {}) {
  const explicit = String(document.asset_id || "").trim();
  if (explicit) return explicit;
  try {
    return mediaAssetId(document);
  } catch {
    return "";
  }
}

function scopedAssetId(record) {
  const source = requiredText(record?.asset_id, "Media asset id", 160);
  const listingId = requiredText(record?.subject_id, "Media listing id", 80);
  // The legacy ledger hashes only bytes, which permits the same photo to be
  // attached to two listings. Payload's stable key is scoped so one listing
  // cannot accidentally replay or preview another listing's asset.
  return `media-${createHash("sha256").update(`${listingId}:${source}`).digest("hex").slice(0, 20)}`;
}

function storageRendition(record) {
  if (!record?.rendition) return null;
  return {
    kind: String(record.rendition.kind || "thumb"),
    storage_key: String(record.rendition.storage_key || ""),
    content_type: String(record.rendition.content_type || "application/octet-stream"),
    format: String(record.rendition.format || ""),
    bytes: Number(record.rendition.bytes || 0),
    width: record.rendition.width ?? null,
    height: record.rendition.height ?? null,
  };
}

function uploadData(record) {
  if (record?.subject_type !== "listing") {
    throw new Error("Only listing media can use the durable media authority");
  }
  if (!LISTING_ID.test(String(record.subject_id || ""))) throw new Error("Known listingId is required");
  const assetId = scopedAssetId(record);
  const storageKey = requiredText(record.storage_key, "Media storage key", 512);
  const staged = isStagedStorageKey(storageKey);
  const assetUrl = String(record.asset_url || "").trim() || null;
  if (staged && assetUrl) throw new Error("Staged listing media must not carry a public URL");
  if (!staged && !assetUrl) throw new Error("Listing media asset URL is required for a non-staged upload");
  return {
    asset_id: assetId,
    upload_id: requiredText(record.id, "Media upload id", 200),
    subject_type: "listing",
    subject_id: String(record.subject_id),
    // Payload keeps `url` required and unique for legacy imports. New staged
    // uploads use a reserved non-public placeholder until review promotion;
    // the safe projections below never expose it or the storage key.
    source_url: staged ? null : assetUrl,
    url: staged ? internalMediaUrl(assetId) : assetUrl,
    asset_url: staged ? null : assetUrl,
    alt: "",
    width: record.width ?? null,
    height: record.height ?? null,
    kind: requiredText(record.kind, "Media kind", 40),
    is_public: false,
    review_status: DURABLE_REVIEW_STATUSES.pending,
    storage_driver: requiredText(record.storage_driver, "Media storage driver", 40),
    storage_key: storageKey,
    rendition: storageRendition(record),
    content_hash: requiredText(record.content_hash, "Media content hash", 128),
    format: record.format || null,
    content_type: record.content_type || null,
    bytes: record.bytes ?? null,
    submitted_bytes: record.submitted_bytes ?? null,
    bytes_before: record.bytes_before ?? null,
    bytes_after: record.bytes_after ?? null,
    optimized: record.optimized === true,
    orientation_applied: record.orientation_applied === true,
    resized: record.resized === true,
    metadata_stripped: record.metadata_stripped === true,
    metadata_removed_bytes: record.metadata_removed_bytes ?? null,
    uploaded_at: record.uploaded_at || new Date().toISOString(),
    uploaded_by: requiredText(record.uploaded_by, "Media uploader", 160),
    source: requiredText(record.source, "Media source", 120),
    replaces_asset_id: record.replaces_asset_id || null,
    replacement_asset_id: null,
    reviewer: null,
    reviewed_at: null,
    review_decision: null,
    human_confirmed: false,
    review_history: [],
  };
}

async function findMediaDocument(runtime, { assetId, listingId = "", req = null } = {}) {
  const requested = String(assetId || "").trim();
  if (!requested) return null;
  const result = await runtime.find({
    collection: MEDIA_ASSET_COLLECTION,
    depth: 0,
    draft: true,
    limit: 0,
    pagination: false,
    overrideAccess: true,
    req,
    where: { asset_id: { equals: requested } },
  });
  let docs = Array.isArray(result?.docs) ? result.docs : [];
  // Legacy imported media predates the stable asset_id field. It remains
  // addressable by the deterministic mediaAssetId fallback until an operator
  // next edits it, so a query on the new field must not hide those rows.
  if (!docs.length) {
    const all = await runtime.find({
      collection: MEDIA_ASSET_COLLECTION,
      depth: 0,
      draft: true,
      limit: 0,
      pagination: false,
      overrideAccess: true,
      req,
    });
    docs = Array.isArray(all?.docs) ? all.docs : [];
  }
  return (
    docs.find((doc) => assetIdForDocument(doc) === requested && (!listingId || String(doc.subject_id || "") === String(listingId))) ||
    null
  );
}

function mediaDocumentForListing(docs, listing) {
  const refs = new Set(relationIds(listing?.media));
  return docs.filter((doc) => {
    if (doc.subject_type && doc.subject_type !== "listing") return false;
    if (doc.subject_id && String(doc.subject_id) !== String(listing.id)) return false;
    return refs.has(relationId(doc.id));
  });
}

async function findListing(runtime, listingId, req = null) {
  if (!LISTING_ID.test(String(listingId || ""))) return null;
  return runtime.findByID({
    collection: "listings",
    id: listingId,
    depth: 0,
    draft: true,
    overrideAccess: true,
    req,
  });
}

function operatorContext(principal) {
  return {
    ms_realty_operator: {
      id: principal.id,
      roles: principal.roles,
      source: principal.source || "admin",
    },
  };
}

async function attachMediaToListing(runtime, listing, mediaDocument, req, principal) {
  const mediaId = relationId(mediaDocument?.id);
  if (!mediaId) throw new Error("Payload did not return a media asset id");
  const mediaIds = relationIds(listing.media);
  if (mediaIds.includes(mediaId)) return false;
  await runtime.update({
    collection: "listings",
    id: listing.id,
    depth: 0,
    draft: true,
    overrideAccess: true,
    req,
    data: { media: [...mediaIds, mediaId] },
    context: operatorContext(principal),
  });
  return true;
}

function cleanupKeysForRecord(record) {
  return [record?.storage_key, record?.rendition?.storage_key].map((key) => String(key || "").trim()).filter(Boolean);
}

function listingScopedStorageKey(key) {
  const value = String(key || "");
  return isStagedStorageKey(value) || /\/wp-content\/uploads\/\d{4}\/\d{2}\/listings\/[^/]+\/[^/]+\//.test(value);
}

function safeCompensationKeys(record) {
  return cleanupKeysForRecord(record).filter(listingScopedStorageKey);
}

function unreferencedKeys(incoming, committed) {
  const retained = new Set(cleanupKeysForRecord(committed));
  return cleanupKeysForRecord(incoming).filter((key) => !retained.has(key));
}

async function cleanupStoredObjects(storage, keys) {
  if (!keys.length) return "not_needed";
  if (!storage || typeof storage.delete !== "function") return "unsupported";
  try {
    for (const key of keys) await storage.delete(key);
    return "deleted";
  } catch {
    return "failed";
  }
}

async function cleanupSafeRecord(storage, record) {
  const keys = safeCompensationKeys(record);
  if (keys.length) return cleanupStoredObjects(storage, keys);
  return cleanupKeysForRecord(record).length ? "unknown" : "not_needed";
}

function persistenceFailure(error, cleanup) {
  const orphaned = cleanup !== "deleted" && cleanup !== "not_needed";
  const suffix = cleanup === "deleted" ? " The stored object was removed." : " The stored object requires storage reconciliation.";
  return new MediaPersistenceError(`Listing media metadata could not be committed.${suffix}`, {
    cause: error,
    storageCleanup: cleanup,
    orphanedStorage: orphaned,
  });
}

async function writeUploadTransaction(runtime, record, data, principal) {
  return withPayloadTransaction(
    runtime,
    { principal, accessMode: "read write", isolationLevel: "serializable" },
    async (req) => {
      const listing = await findListing(runtime, record.subject_id, req);
      if (!listing) {
        const error = new Error("Known listingId is required");
        error.status = 404;
        error.code = "unknown_listing";
        throw error;
      }
      if (record.replaces_asset_id) {
        const original = await findMediaDocument(runtime, {
          assetId: record.replaces_asset_id,
          listingId: record.subject_id,
          req,
        });
        if (!original || !relationIds(listing.media).includes(relationId(original.id))) {
          const error = new Error("Known replacement assetId is required");
          error.status = 404;
          error.code = "unknown_media_asset";
          throw error;
        }
      }
      const existing = await findMediaDocument(runtime, { assetId: data.asset_id, listingId: record.subject_id, req });
      if (existing) {
        await attachMediaToListing(runtime, listing, existing, req, principal);
        return { document: existing, idempotent: true };
      }
      const created = await runtime.create({
        collection: MEDIA_ASSET_COLLECTION,
        data,
        depth: 0,
        draft: true,
        overrideAccess: true,
        req,
        context: operatorContext(principal),
      });
      if (!created?.id) throw new Error("Payload did not return the created media asset");
      await attachMediaToListing(runtime, listing, created, req, principal);
      return { document: created, idempotent: false };
    },
  );
}

function uploadRecordFromDocument(document, fallback = {}) {
  const durableStatus = document.replacement_asset_id
    ? "replaced_by_human"
    : String(document.review_decision || "").trim() === "publish"
      ? "approved_by_human"
      : String(document.review_decision || "").trim() === "keep_private"
        ? "reviewed_private"
        : "needs_media_review";
  return {
    id: document.upload_id || fallback.id || `media-upload-${assetIdForDocument(document)}`,
    asset_id: assetIdForDocument(document) || fallback.asset_id,
    subject_type: document.subject_type || fallback.subject_type || "listing",
    subject_id: document.subject_id || fallback.subject_id || "",
    kind: document.kind || fallback.kind,
    format: document.format || fallback.format || null,
    content_type: document.content_type || fallback.content_type || null,
    bytes: document.bytes ?? fallback.bytes ?? null,
    submitted_bytes: document.submitted_bytes ?? fallback.submitted_bytes ?? null,
    width: document.width ?? fallback.width ?? null,
    height: document.height ?? fallback.height ?? null,
    bytes_before: document.bytes_before ?? fallback.bytes_before ?? null,
    bytes_after: document.bytes_after ?? fallback.bytes_after ?? null,
    optimized: document.optimized === true || fallback.optimized === true,
    metadata_stripped: document.metadata_stripped === true || fallback.metadata_stripped === true,
    metadata_removed_bytes: document.metadata_removed_bytes ?? fallback.metadata_removed_bytes ?? null,
    uploaded_at: document.uploaded_at || fallback.uploaded_at,
    uploaded_by: document.uploaded_by || fallback.uploaded_by,
    source: document.source || fallback.source,
    storage_driver: document.storage_driver || fallback.storage_driver,
    storage_key: document.storage_key || fallback.storage_key,
    rendition: document.rendition || fallback.rendition || null,
    replaces_asset_id: document.replaces_asset_id || fallback.replaces_asset_id || null,
    asset_url: document.asset_url || fallback.asset_url || null,
    is_public: document.is_public === true,
    review_status: durableStatus,
  };
}

export async function persistMediaUploadDurably(
  record,
  { payload = null, env = process.env, principal, storage = null } = {},
) {
  const actor = assertPrincipal(principal);
  const boundRecord = bindActor(record, actor, "uploaded_by");
  const data = uploadData(boundRecord);
  const durableRecord = { ...boundRecord, asset_id: data.asset_id };
  let runtime;
  try {
    runtime = await runtimePayload(payload, env);
  } catch (error) {
    const cleanup = await cleanupSafeRecord(storage, record);
    if (error instanceof MediaDurableStoreUnavailableError) throw persistenceFailure(error, cleanup);
    throw persistenceFailure(error, cleanup);
  }

  try {
    let result;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        result = await writeUploadTransaction(runtime, durableRecord, data, actor);
        break;
      } catch (error) {
        // A retry racing a unique asset_id insert or serializable transaction
        // must replay the committed row, never delete its object or surface a
        // duplicate to the operator.
        if ((!isUniqueViolation(error) && !isRetryableTransactionFailure(error)) || attempt === 3) throw error;
      }
    }
    if (result.idempotent) {
      // A retry may have optimized to the same asset id while writing a new
      // object key. Delete only keys not referenced by the committed Payload
      // document; content-hash legacy keys can be shared by other listings.
      const retryKeys = unreferencedKeys(record, result.document).filter(listingScopedStorageKey);
      const cleanup = await cleanupStoredObjects(storage, retryKeys);
      if (cleanup !== "deleted" && cleanup !== "not_needed") {
        throw persistenceFailure(new Error("Idempotent media retry left an unreferenced object"), cleanup);
      }
    }
    return {
      ...uploadRecordFromDocument(result.document, durableRecord),
      idempotent: result.idempotent,
      durable: true,
    };
  } catch (error) {
    if (error instanceof MediaPersistenceError) throw error;
    let cleanupKeys = safeCompensationKeys(record);
    let ownershipChecked = false;
    try {
      const committed = await findMediaDocument(runtime, { assetId: data.asset_id, listingId: record.subject_id });
      ownershipChecked = true;
      cleanupKeys = committed ? unreferencedKeys(record, committed).filter(listingScopedStorageKey) : cleanupKeys;
    } catch {
      // Do not delete an object when the ownership check itself is unavailable.
      // The caller receives an explicit reconciliation state instead.
      cleanupKeys = [];
    }
    const cleanup = cleanupKeys.length
      ? await cleanupStoredObjects(storage, cleanupKeys)
      : ownershipChecked
        ? "not_needed"
        : cleanupKeysForRecord(record).length
          ? "unknown"
          : "not_needed";
    if (error.status === 404 || error.code === "unknown_listing") {
      const wrapped = persistenceFailure(error, cleanup);
      wrapped.status = 404;
      wrapped.code = error.code;
      wrapped.message = error.message;
      throw wrapped;
    }
    throw persistenceFailure(error, cleanup);
  }
}

// `publicMediaUpload` is intentionally upload-only and always returns
// `is_public: false`. The durable admin list also serves assets after review,
// so it needs a separate safe projection that keeps the review outcome while
// still omitting storage keys and rendition internals.
function durableMediaUploadProjection(document) {
  const row = uploadRecordFromDocument(document);
  const staged = isStagedStorageKey(document.storage_key) && document.is_public !== true;
  return {
    ...publicMediaUpload(row),
    source_url: staged ? null : document.source_url || document.asset_url || document.url || null,
    asset_url: staged ? null : document.asset_url || null,
    media_storage_state: staged ? "staged_private" : document.is_public === true ? "public" : "legacy_public_pending",
    is_public: document.is_public === true,
    review_status: row.review_status,
    replacement_asset_id: document.replacement_asset_id || null,
    media_reviewer: document.reviewer || null,
    media_reviewed_at: document.reviewed_at || null,
    media_review_note: document.review_history?.at(-1)?.review_note || null,
  };
}

function reviewIntent(left, right) {
  return (
    String(left?.listing_id || "") === String(right?.listing_id || "") &&
    String(left?.asset_id || "") === String(right?.asset_id || "") &&
    String(left?.reviewer || "") === String(right?.reviewer || "") &&
    String(left?.decision || "") === String(right?.decision || "") &&
    String(left?.kind || "") === String(right?.kind || "") &&
    String(left?.alt || "") === String(right?.alt || "") &&
    String(left?.replacement_url || "") === String(right?.replacement_url || "") &&
    String(left?.review_note || "") === String(right?.review_note || "")
  );
}

function reviewIdFor(review) {
  const explicit = String(review?.id || "").trim();
  if (explicit) return explicit;
  const digest = createHash("sha256")
    .update(JSON.stringify([
      review?.listing_id,
      review?.asset_id,
      review?.reviewer,
      review?.decision,
      review?.kind,
      review?.alt,
      review?.replacement_url || null,
      ...(review?.review_note ? [review.review_note] : []),
    ]))
    .digest("hex")
    .slice(0, 16);
  return `media-review-${String(review?.asset_id || "asset").replace(/^media-/, "")}-${digest}`;
}

function reviewEvent(review, id) {
  return {
    id,
    reviewed_at: review.reviewed_at,
    listing_id: review.listing_id,
    asset_id: review.asset_id,
    source_url: review.source_url || null,
    replacement_url: review.replacement_url || null,
    public_url: review.public_url || null,
    kind: review.kind,
    alt: review.alt || "",
    decision: review.decision,
    is_public: review.is_public === true,
    review_status: review.review_status,
    reviewer: review.reviewer,
    human_confirmed: true,
    ...(review.review_note ? { review_note: review.review_note } : {}),
  };
}

function storageTransitionDescriptor(asset, listingId, targetVisibility) {
  const sourceKey = String(asset?.storage_key || "");
  const source = scopedStorageParts(sourceKey);
  if (!source || source.visibility === targetVisibility) return null;
  if (source.listingId !== String(listingId)) {
    throw new MediaPersistenceError("Media storage key does not belong to the reviewed listing", {
      storageCleanup: "not_needed",
      orphanedStorage: false,
    });
  }
  const at = new Date(asset.uploaded_at || Date.now());
  const targetKey = storageKeyForVisibility(sourceKey, targetVisibility, at);
  const objects = [{
    sourceKey,
    targetKey,
    contentType: asset.content_type || "application/octet-stream",
  }];
  let rendition = null;
  if (asset.rendition?.storage_key) {
    const renditionKey = storageKeyForVisibility(asset.rendition.storage_key, targetVisibility, at);
    if (!renditionKey) {
      throw new MediaPersistenceError("Media rendition storage key is not listing-scoped", {
        storageCleanup: "not_needed",
        orphanedStorage: false,
      });
    }
    rendition = { ...asset.rendition, storage_key: renditionKey };
    objects.push({
      sourceKey: asset.rendition.storage_key,
      targetKey: renditionKey,
      contentType: asset.rendition.content_type || "application/octet-stream",
    });
  }
  return {
    assetId: assetIdForDocument(asset),
    targetVisibility,
    targetKey,
    targetUrl: targetVisibility === "public" ? mediaUploadPublicUrl(targetKey) : null,
    rendition,
    objects,
  };
}

async function prepareStorageTransition(asset, listingId, targetVisibility, storage) {
  const transition = storageTransitionDescriptor(asset, listingId, targetVisibility);
  if (!transition) return null;
  if (!storage || typeof storage.read !== "function" || typeof storage.put !== "function") {
    throw new MediaPersistenceError("Media visibility changes require a storage driver that can read and write bytes", {
      storageCleanup: "unsupported",
      orphanedStorage: false,
    });
  }
  try {
    for (const object of transition.objects) {
      const sourceBytes = Buffer.from(await storage.read(object.sourceKey));
      let targetBytes = null;
      try {
        targetBytes = Buffer.from(await storage.read(object.targetKey));
      } catch (error) {
        if (error?.code !== "not_found") throw error;
      }
      if (targetBytes) {
        if (!targetBytes.equals(sourceBytes)) {
          throw new MediaPersistenceError("Media visibility destination already contains different bytes", {
            storageCleanup: "not_needed",
            orphanedStorage: false,
          });
        }
        continue;
      }
      await storage.put({ key: object.targetKey, bytes: sourceBytes, contentType: object.contentType });
    }
    return transition;
  } catch (error) {
    error.mediaTransition = transition;
    throw error;
  }
}

function reviewData(review, existing, history, id, { transition = null } = {}) {
  const decision = String(review.decision || "").trim();
  const isPublic = decision === "publish";
  const payloadStatus = DURABLE_REVIEW_STATUSES[decision];
  if (!payloadStatus) throw new Error("Media decision must be publish or keep_private");
  if (isPublic && !String(review.alt || "").trim()) {
    throw new Error("Published media requires reviewed alt text or an accessibility caption");
  }
  const privateAfterReview = transition?.targetVisibility === "staged_private" || isStagedStorageKey(existing.storage_key);
  const publicUrl = isPublic
    ? review.public_url || transition?.targetUrl || existing.asset_url || (privateAfterReview ? null : existing.url) || null
    : null;
  if (isPublic && !publicUrl) throw new Error("Published staged media requires a promoted public asset");
  const storageKey = transition?.targetKey || existing.storage_key;
  const event = reviewEvent({
    ...review,
    source_url: isPublic ? publicUrl : null,
    public_url: publicUrl,
    is_public: isPublic,
    review_status: review.review_status,
  }, id);
  return {
    source_url: isPublic ? publicUrl : privateAfterReview ? null : existing.source_url || existing.asset_url || existing.url || null,
    asset_url: isPublic ? publicUrl : null,
    url: isPublic ? publicUrl : privateAfterReview ? internalMediaUrl(assetIdForDocument(existing)) : existing.url,
    alt: review.alt || "",
    kind: review.kind,
    is_public: isPublic,
    review_status: payloadStatus,
    reviewer: review.reviewer,
    reviewed_at: review.reviewed_at,
    review_decision: decision,
    human_confirmed: true,
    review_history: [...history, event],
    storage_key: storageKey,
    ...(transition?.rendition ? { rendition: transition.rendition } : {}),
  };
}

function reviewOutput(review, id, idempotent) {
  return {
    ...clone(review),
    id,
    idempotent,
    durable: true,
  };
}

async function reviewTransaction(runtime, review, principal, { storage } = {}) {
  const transitions = [];
  const prepareTransition = async (asset, visibility) => {
    try {
      const transition = await prepareStorageTransition(asset, review.listing_id, visibility, storage);
      if (transition) transitions.push(transition);
      return transition;
    } catch (error) {
      if (error.mediaTransition) transitions.push(error.mediaTransition);
      throw error;
    }
  };
  try {
    return await withPayloadTransaction(
      runtime,
      { principal, accessMode: "read write", isolationLevel: "serializable" },
      async (req) => {
        const listing = await findListing(runtime, review.listing_id, req);
        if (!listing) {
          const error = new Error("Known listingId is required");
          error.status = 404;
          error.code = "listing_draft_not_found";
          throw error;
        }
        const refs = new Set(relationIds(listing.media));
        const asset = await findMediaDocument(runtime, { assetId: review.asset_id, listingId: review.listing_id, req });
        if (!asset || !refs.has(relationId(asset.id))) {
          const error = new Error("Known media assetId is required");
          error.status = 404;
          error.code = "unknown_media_asset";
          throw error;
        }

        const history = Array.isArray(asset.review_history) ? asset.review_history : [];
        const id = reviewIdFor(review);
        const sameId = history.find((entry) => String(entry.id || "") === id);
        const retry = sameId || history.find((entry) => reviewIntent(entry, review));
        if (retry) {
          if (!reviewIntent(retry, review)) throw new MediaReviewConflictError();
          if (String(history[history.length - 1]?.id || "") !== String(retry.id || "")) {
            throw new MediaReviewConflictError("Media review was superseded by a later decision");
          }
          const replacementSource = review.decision === "publish" && asset.replaces_asset_id
            ? await findMediaDocument(runtime, { assetId: asset.replaces_asset_id, listingId: review.listing_id, req })
            : null;
          return {
            review: reviewOutput({ ...review, ...retry }, retry.id, true),
            idempotent: true,
            asset,
            replacementSource,
          };
        }

        if (review.decision === "publish" && isStagedStorageKey(asset.storage_key) && review.public_url) {
          throw new Error("Staged listing media cannot publish from an external URL");
        }
        const childTransition = await prepareTransition(asset, review.decision === "publish" ? "public" : "staged_private");
        let original = null;
        let originalTransition = null;
        if (review.decision === "publish" && asset.replaces_asset_id) {
          original = await findMediaDocument(runtime, {
            assetId: asset.replaces_asset_id,
            listingId: review.listing_id,
            req,
          });
          if (!original || !refs.has(relationId(original.id))) {
            const error = new Error("Replacement source media asset is unavailable");
            error.status = 409;
            error.code = "replacement_source_unavailable";
            throw error;
          }
          originalTransition = await prepareTransition(original, "staged_private");
        }

        const childData = reviewData(review, asset, history, id, { transition: childTransition });
        const updatedAsset = await runtime.update({
          collection: MEDIA_ASSET_COLLECTION,
          id: asset.id,
          depth: 0,
          draft: true,
          overrideAccess: true,
          req,
          data: childData,
          context: operatorContext(principal),
        });

        // A replacement becomes visible as one operation: the reviewed child is
        // public, while its former sibling is retained for provenance but marked
        // private. Keeping both documents makes reloads and audit queries
        // deterministic without ever deleting the source asset.
        let updatedOriginal = null;
        if (original) {
          const originalHistory = Array.isArray(original.review_history) ? original.review_history : [];
          const privateAfterReview = originalTransition?.targetVisibility === "staged_private" || isStagedStorageKey(original.storage_key);
          const originalEvent = reviewEvent({
            ...review,
            asset_id: asset.replaces_asset_id,
            source_url: null,
            replacement_url: childData.asset_url,
            public_url: null,
            decision: "keep_private",
            is_public: false,
            review_status: DURABLE_REVIEW_STATUSES.keep_private,
          }, `${id}:replacement-source`);
          updatedOriginal = await runtime.update({
            collection: MEDIA_ASSET_COLLECTION,
            id: original.id,
            depth: 0,
            draft: true,
            overrideAccess: true,
            req,
            data: {
              is_public: false,
              asset_url: null,
              source_url: privateAfterReview ? null : original.source_url || null,
              url: privateAfterReview ? internalMediaUrl(assetIdForDocument(original)) : original.url,
              storage_key: originalTransition?.targetKey || original.storage_key,
              ...(originalTransition?.rendition ? { rendition: originalTransition.rendition } : {}),
              review_status: DURABLE_REVIEW_STATUSES.keep_private,
              replacement_asset_id: review.asset_id,
              reviewer: review.reviewer,
              reviewed_at: review.reviewed_at,
              review_decision: "keep_private",
              human_confirmed: true,
              review_history: [
                ...originalHistory,
                {
                  ...originalEvent,
                  replacement_asset_id: review.asset_id,
                },
              ],
            },
            context: operatorContext(principal),
          });
        }
        const output = {
          ...review,
          public_url: childData.asset_url || null,
          source_url: childData.source_url || null,
          is_public: childData.is_public === true,
          review_status: review.review_status,
        };
        return {
          review: reviewOutput(output, id, false),
          idempotent: false,
          asset: updatedAsset || { ...asset, ...childData },
          replacementSource: updatedOriginal,
        };
      },
    );
  } catch (error) {
    if (transitions.length) error.mediaTransitions = transitions;
    throw error;
  }
}

async function compensateReviewTransitions(runtime, review, transitions, storage) {
  for (const transition of transitions || []) {
    let committed;
    try {
      committed = await findMediaDocument(runtime, { assetId: transition.assetId, listingId: review.listing_id });
    } catch (error) {
      throw persistenceFailure(error, "unknown");
    }
    const retained = new Set(cleanupKeysForRecord(committed));
    const keys = transition.objects
      .map((object) => object.targetKey)
      .filter(listingScopedStorageKey)
      .filter((key) => !retained.has(key));
    const cleanup = await cleanupStoredObjects(storage, keys);
    if (cleanup !== "deleted" && cleanup !== "not_needed") {
      throw persistenceFailure(new Error("Media visibility change could not be compensated"), cleanup);
    }
  }
}

function staleVisibilityKeys(document, visibility) {
  if (!document) return [];
  const current = scopedStorageParts(document.storage_key);
  if (!current || current.visibility !== visibility) return [];
  const staleVisibility = visibility === "public" ? "staged_private" : "public";
  const at = new Date(document.uploaded_at || Date.now());
  return [
    storageKeyForVisibility(document.storage_key, staleVisibility, at),
    document.rendition?.storage_key ? storageKeyForVisibility(document.rendition.storage_key, staleVisibility, at) : null,
  ].filter(Boolean);
}

async function reconcileReviewStorage(storage, review, result) {
  const retained = new Set([
    ...cleanupKeysForRecord(result.asset),
    ...cleanupKeysForRecord(result.replacementSource),
  ]);
  const visibility = review.decision === "publish" ? "public" : "staged_private";
  const keys = [
    ...staleVisibilityKeys(result.asset, visibility),
    ...staleVisibilityKeys(result.replacementSource, "staged_private"),
  ].filter(listingScopedStorageKey).filter((key) => !retained.has(key));
  const cleanup = await cleanupStoredObjects(storage, [...new Set(keys)]);
  if (cleanup !== "deleted" && cleanup !== "not_needed") {
    throw new MediaPersistenceError("Media review committed, but superseded bytes require storage reconciliation", {
      storageCleanup: cleanup,
      orphanedStorage: true,
    });
  }
}

export async function persistMediaReviewDurably(
  review,
  { payload = null, env = process.env, principal, storage = null } = {},
) {
  const actor = assertPrincipal(principal);
  const boundReview = bindActor(review, actor, "reviewer");
  if (boundReview?.human_confirmed !== true) {
    throw new Error("Media review requires explicit human confirmation");
  }
  const runtime = await runtimePayload(payload, env);
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const result = await reviewTransaction(runtime, boundReview, actor, { storage });
      await reconcileReviewStorage(storage, boundReview, result);
      return result.review;
    } catch (error) {
      if (error.mediaTransitions) {
        await compensateReviewTransitions(runtime, boundReview, error.mediaTransitions, storage);
      }
      if (error instanceof MediaReviewConflictError || error.status) throw error;
      if ((isUniqueViolation(error) || isRetryableTransactionFailure(error)) && attempt < 3) continue;
      if (error instanceof MediaPersistenceError) throw error;
      throw new MediaDurableStoreUnavailableError("Durable Payload media review could not be committed", error);
    }
  }
}

export async function listMediaUploadsDurably({ payload = null, env = process.env, listing = "", enquiry = "", limits } = {}) {
  if (enquiry && !listing) {
    return {
      status: 503,
      body: { kind: "media_durable_scope_unavailable", message: "Durable media authority only exposes listing uploads" },
    };
  }
  const listingId = String(listing || "").trim();
  if (!listingId) return { status: 400, body: { kind: "bad_request", message: "Pass ?listing= in durable media mode" } };
  const runtime = await runtimePayload(payload, env);
  const listingDoc = await findListing(runtime, listingId);
  if (!listingDoc) return { status: 404, body: { kind: "unknown_listing", message: "Known listingId is required" } };
  const result = await runtime.find({
    collection: MEDIA_ASSET_COLLECTION,
    depth: 0,
    draft: true,
    limit: 0,
    pagination: false,
    overrideAccess: true,
  });
  const selected = mediaDocumentForListing(Array.isArray(result?.docs) ? result.docs : [], listingDoc);
  return {
    status: 200,
    body: {
      kind: "media_uploads",
      subject_type: "listing",
      subject_id: listingId,
      uploads: selected.map(durableMediaUploadProjection),
      review_required: true,
      public: false,
      limits,
    },
  };
}

export async function readMediaUploadBytesDurably({ payload = null, env = process.env, assetId, rendition = "", storage }) {
  const runtime = await runtimePayload(payload, env);
  const requested = String(assetId || "").trim();
  const result = await runtime.find({
    collection: MEDIA_ASSET_COLLECTION,
    depth: 0,
    draft: true,
    limit: 0,
    pagination: false,
    overrideAccess: true,
    where: { asset_id: { equals: requested } },
  });
  const document = (Array.isArray(result?.docs) ? result.docs : []).find((row) => assetIdForDocument(row) === requested);
  if (!document) return { status: 404, body: { kind: "not_found", message: "Unknown upload" } };
  const row = uploadRecordFromDocument(document);
  if (!row.storage_key) return { status: 503, body: { kind: "media_storage_unavailable", message: "Stored upload is not available for preview" } };
  const wanted = String(rendition || "").trim();
  const derived = wanted && row.rendition?.kind === wanted ? row.rendition : null;
  const key = derived ? row.rendition.storage_key : row.storage_key;
  const contentType = derived ? row.rendition.content_type : row.content_type;
  const format = derived ? row.rendition.format : row.format;
  try {
    const bytes = await storage.read(key);
    return {
      status: 200,
      body: bytes,
      headers: {
        "content-type": contentType || "application/octet-stream",
        "content-length": String(bytes.length),
        "content-disposition": `inline; filename="${row.asset_id}${derived ? `-${derived.kind}` : ""}.${format === "jpeg" ? "jpg" : format || "bin"}"`,
      },
    };
  } catch (error) {
    return {
      status: error.code === "not_found" ? 404 : 503,
      body: { kind: error.code || "media_storage_unavailable", message: error.message },
    };
  }
}

export function durableMediaDocumentProjection(document = {}) {
  const assetId = assetIdForDocument(document);
  const staged = isStagedStorageKey(document.storage_key);
  const payloadStatus = String(document.review_status || "").trim();
  const reviewDecision = String(document.review_decision || "").trim();
  const reviewStatus = document.replacement_asset_id
    ? "replaced_by_human"
    : reviewDecision === "publish"
    ? "approved_by_human"
    : reviewDecision === "keep_private"
      ? "reviewed_private"
      : payloadStatus;
  return {
    id: document.id,
    asset_id: assetId,
    upload_id: document.upload_id || null,
    url: staged && !document.is_public ? null : document.url,
    source_url: staged && !document.is_public ? null : document.source_url || document.url || null,
    asset_url: staged && !document.is_public ? null : document.asset_url ?? null,
    alt: document.alt || "",
    width: document.width ?? null,
    height: document.height ?? null,
    kind: document.kind,
    is_public: document.is_public === true,
    review_status: reviewStatus,
    media_storage_state: staged && !document.is_public ? "staged_private" : document.is_public === true ? "public" : "legacy_public_pending",
    replaces_asset_id: document.replaces_asset_id || null,
    replacement_asset_id: document.replacement_asset_id || null,
    uploaded_at: document.uploaded_at || null,
    uploaded_by: document.uploaded_by || null,
    source: document.source || null,
    media_reviewer: document.reviewer || null,
    media_reviewed_at: document.reviewed_at || null,
    media_review_note: document.review_history?.at(-1)?.review_note || null,
    thumbnail_url: document.rendition?.storage_key ? `/api/admin/media/uploads/${assetId}?rendition=${encodeURIComponent(document.rendition.kind || "thumb")}` : null,
  };
}
