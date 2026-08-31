// Uploaded photo ledger.
//
// An upload is never a publication. Every row written here is unreviewed by
// construction — `is_public: false`, `review_status: "needs_media_review"` —
// and the only way it can become public is the media review path that already
// governs mirrored photos (production/lib/media-reviews.mjs): a named human
// records a decision and supplies alt text. That is why an admin upload is
// projected into the listing's `media` array by `applyMediaUploads` *before*
// `applyMediaReviews` runs: the uploaded asset enters the same queue as
// everything else rather than getting its own private door to the public site.
//
// Photos submitted by a member of the public are stored against the enquiry,
// never against a listing, so there is no code path that can carry them into a
// listing payload, a gallery, or a search document. That is a structural
// guarantee, not a flag someone can flip by mistake.

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { mediaWorkflow } from "./media.mjs";
import { mediaAssetId } from "./media-reviews.mjs";
import { fromRoot } from "./paths.mjs";
import { newRecordId } from "./record-ids.mjs";
import { imageOptimizationFromEnv, optimizeImageUpload } from "./image-optimizer.mjs";
import { multipartBoundary, multipartForm } from "./multipart.mjs";
import {
  MEDIA_UPLOAD_SCOPES,
  MediaUploadStorageError,
  mediaUploadContentHash,
  mediaUploadKey,
  mediaUploadPublicUrl,
  mediaUploadRenditionKey,
} from "./media-upload-storage.mjs";

export const DEFAULT_MEDIA_UPLOAD_LEDGER_PATH = fromRoot("production", "data", "media-uploads.jsonl");

// Uploads are photos and floor plans. A video is not something a browser file
// input should be able to push through an image sanitiser, so it is not offered.
export const MEDIA_UPLOAD_KINDS = Object.freeze(["photo", "floor_plan"]);

const DEFAULT_MAX_FILE_BYTES = 8 * 1024 * 1024;
const DEFAULT_MAX_FILES = 8;
const DEFAULT_MAX_ENQUIRY_PHOTOS = 12;
const LISTING_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const ENQUIRY_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export class MediaUploadError extends Error {
  constructor(message, { status = 400, code = "bad_request" } = {}) {
    super(message);
    this.name = "MediaUploadError";
    this.status = status;
    this.code = code;
  }
}

function positiveInteger(value, fallback, name) {
  const raw = value === undefined || value === null || value === "" ? String(fallback) : String(value);
  if (!/^\d+$/.test(raw) || Number(raw) < 1) throw new Error(`${name} must be a positive integer`);
  return Number(raw);
}

// The per-request cap is clamped to the server body limit: a route must not
// promise to accept more bytes than the transport will hand it, and the 413 a
// caller gets should mean the same thing at both layers.
export function mediaUploadLimitsFromEnv(env = process.env, { maxBodyBytes = 10 * 1024 * 1024 } = {}) {
  const maxFileBytes = positiveInteger(
    env.MS_REALTY_MEDIA_UPLOAD_MAX_FILE_BYTES,
    DEFAULT_MAX_FILE_BYTES,
    "MS_REALTY_MEDIA_UPLOAD_MAX_FILE_BYTES",
  );
  const requestedRequestBytes = positiveInteger(
    env.MS_REALTY_MEDIA_UPLOAD_MAX_REQUEST_BYTES,
    maxBodyBytes,
    "MS_REALTY_MEDIA_UPLOAD_MAX_REQUEST_BYTES",
  );
  return {
    maxFileBytes: Math.min(maxFileBytes, maxBodyBytes),
    maxRequestBytes: Math.min(requestedRequestBytes, maxBodyBytes),
    maxFiles: positiveInteger(env.MS_REALTY_MEDIA_UPLOAD_MAX_FILES, DEFAULT_MAX_FILES, "MS_REALTY_MEDIA_UPLOAD_MAX_FILES"),
    maxEnquiryPhotos: positiveInteger(
      env.MS_REALTY_SELLER_PHOTO_MAX_PER_ENQUIRY,
      DEFAULT_MAX_ENQUIRY_PHOTOS,
      "MS_REALTY_SELLER_PHOTO_MAX_PER_ENQUIRY",
    ),
  };
}

export function normalizeUploadKind(value, fallback = "photo") {
  const kind = String(value || fallback || "").trim().toLowerCase();
  if (!MEDIA_UPLOAD_KINDS.includes(kind)) throw new MediaUploadError("Upload kind must be photo or floor_plan");
  return kind;
}

export function resetMediaUploads(filePath = DEFAULT_MEDIA_UPLOAD_LEDGER_PATH) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "");
}

export function readMediaUploads(filePath = DEFAULT_MEDIA_UPLOAD_LEDGER_PATH) {
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export function listingMediaUploads(rows, listingId) {
  return rows.filter((row) => row.subject_type === "listing" && row.subject_id === String(listingId || ""));
}

export function enquiryMediaUploads(rows, enquiryId) {
  return rows.filter((row) => row.subject_type === "enquiry" && row.subject_id === String(enquiryId || ""));
}

export function assertUploadListing(seed, listingId) {
  const id = String(listingId || "").trim();
  if (!LISTING_ID.test(id)) throw new MediaUploadError("listingId is required");
  const record = (seed?.records || []).find((row) => row.collection === "listings" && row.id === id);
  if (!record) throw new MediaUploadError("Known listingId is required", { status: 404, code: "unknown_listing" });
  return record;
}

export function assertReplacementAsset(record, value) {
  const assetId = String(value || "").trim();
  if (!assetId) return null;
  if (!(record?.media || []).some((item) => mediaAssetId(item) === assetId)) {
    throw new MediaUploadError("Known replacement assetId is required", { status: 404, code: "unknown_media_asset" });
  }
  return assetId;
}

export function assertUploadEnquiry(enquiryId, sellerEnquiries) {
  const id = String(enquiryId || "").trim();
  if (!ENQUIRY_ID.test(id)) throw new MediaUploadError("enquiryId is required");
  // Fail closed: an enquiry reference we cannot verify is not a permission slip
  // to attach photos to somebody else's enquiry. The reference is a v4 UUID the
  // server minted for the person who submitted the enquiry (record-ids.mjs), so
  // "must already exist" is the whole access check.
  const match = (sellerEnquiries || []).find((row) => row.lead_id === id || row.id === id);
  if (!match) throw new MediaUploadError("Unknown enquiry reference", { status: 404, code: "unknown_enquiry" });
  return match.lead_id || match.id;
}

/**
 * Validate, sanitise, optimise and describe one uploaded file. Throws before
 * anything is written if the bytes are not an allowed image, are oversized,
 * declare more pixels than we will decode, or carry metadata we cannot remove.
 *
 * Asynchronous because the optimisation step decodes the image. Both upload
 * surfaces await it, so an admin upload and a seller upload get an identically
 * treated photo.
 */
export async function prepareMediaUpload(
  file,
  {
    scope,
    subjectId,
    kind = "photo",
    limits = mediaUploadLimitsFromEnv(),
    imageSettings = imageOptimizationFromEnv(),
    host,
    replacesAssetId = null,
    uploadedAt = new Date().toISOString(),
  },
) {
  if (!MEDIA_UPLOAD_SCOPES.includes(scope)) throw new MediaUploadError("Upload scope must be listing or enquiry");
  const bytes = Buffer.isBuffer(file?.bytes) ? file.bytes : Buffer.from(file?.bytes || []);
  if (!bytes.length) throw new MediaUploadError("Upload contains an empty file");
  if (bytes.length > limits.maxFileBytes) {
    throw new MediaUploadError(
      `Each photo must be ${Math.floor(limits.maxFileBytes / 1024)} KB or smaller; this one is ${Math.ceil(bytes.length / 1024)} KB`,
      { status: 413, code: "file_too_large" },
    );
  }

  let optimized;
  try {
    optimized = await optimizeImageUpload(bytes, {
      declaredType: file?.contentType,
      filename: file?.filename,
      settings: imageSettings,
    });
  } catch (error) {
    throw new MediaUploadError(error.message, { status: 415, code: error.code || "unsupported_image_type" });
  }

  // The hash is taken over the bytes we actually store, so an upload that
  // optimises to the same result as an earlier one is still the same asset.
  const contentHash = mediaUploadContentHash(optimized.bytes);
  let storageKey;
  let renditionKey = null;
  try {
    storageKey = mediaUploadKey({
      scope,
      subjectId,
      hash: contentHash,
      ext: optimized.ext,
      ...(host ? { host } : {}),
      at: new Date(uploadedAt),
    });
    if (optimized.rendition) {
      renditionKey = mediaUploadRenditionKey(storageKey, {
        label: optimized.rendition.kind,
        ext: optimized.rendition.ext,
      });
    }
  } catch (error) {
    throw new MediaUploadError(error.message, { status: error instanceof MediaUploadStorageError ? 400 : 500 });
  }

  return {
    scope,
    subjectId: String(subjectId),
    kind: normalizeUploadKind(kind),
    bytes: optimized.bytes,
    contentHash,
    storageKey,
    assetUrl: scope === "listing" ? mediaUploadPublicUrl(storageKey) : null,
    assetId: `media-${createHash("sha256").update(replacesAssetId ? `${contentHash}:${replacesAssetId}` : contentHash).digest("hex").slice(0, 20)}`,
    replacesAssetId,
    format: optimized.format,
    mime: optimized.mime,
    storedBytes: optimized.bytes_after,
    originalBytes: optimized.bytes_before,
    metadataStripped: optimized.metadata_stripped,
    metadataRemovedBytes: optimized.metadata_removed_bytes,
    width: optimized.width,
    height: optimized.height,
    optimized: optimized.optimized,
    orientationApplied: optimized.orientation_applied,
    resized: optimized.resized,
    rendition: optimized.rendition
      ? {
          kind: optimized.rendition.kind,
          bytes: optimized.rendition.bytes,
          storageKey: renditionKey,
          mime: optimized.rendition.mime,
          format: optimized.rendition.format,
          width: optimized.rendition.width,
          height: optimized.rendition.height,
        }
      : null,
  };
}

export function createMediaUploadRecord(prepared, { uploadedBy, source, storageDriver, uploadedAt = new Date().toISOString() }) {
  const actor = String(uploadedBy || "").trim();
  if (!actor) throw new MediaUploadError("Upload requires an attributed uploader");
  return {
    uploaded_at: uploadedAt,
    id: newRecordId("media-upload"),
    asset_id: prepared.assetId,
    subject_type: prepared.scope,
    subject_id: prepared.subjectId,
    kind: prepared.kind,
    alt: "",
    // Public status is not a decision this file gets to make.
    is_public: false,
    review_status: "needs_media_review",
    storage_driver: String(storageDriver || "local"),
    storage_key: prepared.storageKey,
    asset_url: prepared.assetUrl,
    content_hash: prepared.contentHash,
    format: prepared.format,
    content_type: prepared.mime,
    bytes: prepared.storedBytes,
    submitted_bytes: prepared.originalBytes,
    // The dimensions a viewer sees, after any rotation. These were `null` on
    // every row until the pipeline learned to decode: a gallery could not lay
    // out a photo it had no size for.
    width: prepared.width ?? null,
    height: prepared.height ?? null,
    // `bytes`/`submitted_bytes` say the same thing, but the pair below is what
    // an operator reads when asking "is optimisation actually working".
    bytes_before: prepared.originalBytes,
    bytes_after: prepared.storedBytes,
    optimized: Boolean(prepared.optimized),
    orientation_applied: Boolean(prepared.orientationApplied),
    resized: Boolean(prepared.resized),
    rendition: prepared.rendition
      ? {
          kind: prepared.rendition.kind,
          storage_key: prepared.rendition.storageKey,
          content_type: prepared.rendition.mime,
          format: prepared.rendition.format,
          bytes: prepared.rendition.bytes.length,
          width: prepared.rendition.width,
          height: prepared.rendition.height,
        }
      : null,
    metadata_stripped: prepared.metadataStripped,
    metadata_removed_bytes: prepared.metadataRemovedBytes,
    uploaded_by: actor,
    source: String(source || "admin_listing_editor"),
    ...(prepared.replacesAssetId ? { replaces_asset_id: prepared.replacesAssetId } : {}),
  };
}

export function appendMediaUpload(record, { filePath = DEFAULT_MEDIA_UPLOAD_LEDGER_PATH } = {}) {
  const rows = readMediaUploads(filePath);
  // Content plus replacement intent is the identity: re-sending the same
  // operation is a retry, while reusing bytes for another asset stays valid.
  const existing = rows.find(
    (row) =>
      row.subject_type === record.subject_type &&
      row.subject_id === record.subject_id &&
      row.asset_id === record.asset_id,
  );
  if (existing) return { ...existing, idempotent: true };
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(record)}\n`);
  return { ...record, idempotent: false };
}

/**
 * Project uploaded listing assets into the CMS seed so they appear in the media
 * manager and in the media review workflow. Enquiry uploads are deliberately
 * not projected anywhere near a listing.
 */
export function applyMediaUploads(seed, uploads = []) {
  const listingUploads = uploads.filter((row) => row.subject_type === "listing");
  if (!listingUploads.length) return seed;
  const byListing = new Map();
  for (const row of listingUploads) {
    if (!byListing.has(row.subject_id)) byListing.set(row.subject_id, []);
    byListing.get(row.subject_id).push(row);
  }
  return {
    ...seed,
    records: (seed.records || []).map((record) => {
      if (record.collection !== "listings") return record;
      const rows = byListing.get(record.id);
      if (!rows?.length) return record;
      const existing = new Set((record.media || []).map((item) => item.asset_id).filter(Boolean));
      const added = rows
        .filter((row) => !existing.has(row.asset_id))
        .map((row) => ({
          url: row.asset_url || `storage:${row.storage_key}`,
          asset_url: row.asset_url,
          asset_id: row.asset_id,
          alt: row.alt || "",
          width: row.width ?? null,
          height: row.height ?? null,
          thumbnail_url: row.rendition?.storage_key ? mediaUploadPublicUrl(row.rendition.storage_key) : null,
          kind: row.kind,
          is_public: false,
          review_status: "needs_media_review",
          upload_id: row.id,
          uploaded_at: row.uploaded_at,
          uploaded_by: row.uploaded_by,
          storage_driver: row.storage_driver,
          storage_key: row.storage_key,
          origin: "operator_upload",
          ...(row.replaces_asset_id ? { replaces_asset_id: row.replaces_asset_id } : {}),
        }));
      if (!added.length) return record;
      const media = [...(record.media || []), ...added];
      const workflow = mediaWorkflow(media);
      return {
        ...record,
        media,
        media_workflow: {
          ...workflow,
          // `review_gated_assets` is a publication readiness gate
          // (production/lib/listing-facts.mjs): it exists to stop a listing
          // going public while its *imported* media is unvetted. A photo an
          // operator just uploaded is not public and does not make the already
          // reviewed listing less trustworthy, so adding one must not take a
          // live listing off the site. It is counted separately instead.
          review_gated_assets: Number(record.media_workflow?.review_gated_assets || 0),
          pending_upload_reviews: added.length,
        },
      };
    }),
  };
}

/* ------------------------------------------------------- request decoding */

export function mediaUploadRequestBytes(request) {
  if (Buffer.isBuffer(request?.bodyBytes)) return request.bodyBytes;
  // A latin1 view round-trips bytes a caller already handed us as a string.
  return Buffer.from(String(request?.body || ""), "latin1");
}

function base64File(entry, index) {
  const data = String(entry?.dataBase64 || entry?.data_base64 || entry?.data || "").replace(/^data:[^;]+;base64,/, "");
  if (!data) throw new MediaUploadError(`Photo ${index + 1} has no base64 image data`);
  if (!/^[A-Za-z0-9+/=\s]+$/.test(data)) throw new MediaUploadError(`Photo ${index + 1} is not valid base64`);
  return {
    bytes: Buffer.from(data, "base64"),
    filename: entry?.filename || entry?.name || null,
    contentType: entry?.contentType || entry?.content_type || "",
  };
}

/**
 * Read an upload request as `{ fields, files }`. Accepts a browser
 * `multipart/form-data` post — the form that works with JavaScript switched
 * off — and a JSON body with base64 data for programmatic callers.
 */
export function parseMediaUploadRequest(request, { limits = mediaUploadLimitsFromEnv(), fileField = "photo" } = {}) {
  const contentType = String(request?.headers?.["content-type"] || request?.headers?.["Content-Type"] || "");
  const raw = mediaUploadRequestBytes(request);
  if (raw.length > limits.maxRequestBytes) {
    throw new MediaUploadError(
      `An upload request must be ${Math.floor(limits.maxRequestBytes / 1024)} KB or smaller`,
      { status: 413, code: "request_too_large" },
    );
  }
  if (multipartBoundary(contentType)) {
    let form;
    try {
      form = multipartForm(raw, contentType, { maxParts: limits.maxFiles + 12 });
    } catch (error) {
      throw new MediaUploadError(error.message, { status: 400, code: "malformed_upload" });
    }
    const files = form.files
      .filter((part) => part.bytes.length || part.filename)
      .filter((part) => !fileField || part.name === fileField || part.name === `${fileField}[]` || part.name === "file" || part.name === "photos")
      .map((part) => ({ bytes: part.bytes, filename: part.filename, contentType: part.contentType }));
    return { fields: form.fields, files, form: true };
  }
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const fields = {};
    for (const [key, value] of new URLSearchParams(raw.toString("utf8"))) fields[key] = value;
    return { fields, files: [], form: true };
  }
  let body;
  try {
    body = JSON.parse(raw.toString("utf8") || "{}");
  } catch {
    throw new MediaUploadError("Upload requires a multipart/form-data or JSON body");
  }
  const entries = Array.isArray(body.photos) ? body.photos : body.dataBase64 || body.data ? [body] : [];
  const files = entries.map(base64File);
  const fields = { ...body };
  delete fields.photos;
  delete fields.data;
  delete fields.dataBase64;
  delete fields.data_base64;
  return { fields, files, form: false };
}

/** Projection safe to return to an API caller: storage keys stay server-side. */
export function publicMediaUpload(row) {
  return {
    id: row.id,
    asset_id: row.asset_id,
    subject_type: row.subject_type,
    subject_id: row.subject_id,
    kind: row.kind,
    format: row.format,
    content_type: row.content_type,
    bytes: row.bytes,
    submitted_bytes: row.submitted_bytes,
    width: row.width ?? null,
    height: row.height ?? null,
    bytes_before: row.bytes_before ?? row.submitted_bytes,
    bytes_after: row.bytes_after ?? row.bytes,
    optimized: Boolean(row.optimized),
    metadata_stripped: row.metadata_stripped,
    metadata_removed_bytes: row.metadata_removed_bytes,
    uploaded_at: row.uploaded_at,
    uploaded_by: row.uploaded_by,
    source: row.source,
    storage_driver: row.storage_driver,
    replaces_asset_id: row.replaces_asset_id || null,
    asset_url: row.asset_url || null,
    is_public: false,
    review_status: row.review_status,
    preview_path: `/api/admin/media/uploads/${row.asset_id}`,
    // The same route with a rendition selector rather than a second route, so
    // the admin surfaces gain thumbnails without a new door into private
    // bytes. Null when the photo was already small enough to serve as-is.
    thumbnail_path: row.rendition ? `/api/admin/media/uploads/${row.asset_id}?rendition=${row.rendition.kind}` : null,
  };
}

export function assertMediaUploads(rows) {
  const ids = new Set();
  for (const row of rows) {
    if (!row.id || !row.uploaded_at || !row.subject_type || !row.subject_id || !row.storage_key || !row.content_hash) {
      throw new Error("Media upload row is missing storage or attribution data");
    }
    if (ids.has(row.id)) throw new Error("Media upload ids must be unique");
    ids.add(row.id);
    if (!MEDIA_UPLOAD_SCOPES.includes(row.subject_type)) throw new Error("Media upload subject must be listing or enquiry");
    if (!MEDIA_UPLOAD_KINDS.includes(row.kind)) throw new Error("Media upload kind must be photo or floor_plan");
    if (row.is_public !== false || row.review_status !== "needs_media_review") {
      throw new Error("Uploaded media must be stored unreviewed and non-public");
    }
    if (row.subject_type === "enquiry" && row.asset_url) {
      throw new Error("Enquiry uploads must not carry a public asset URL");
    }
    if (row.replaces_asset_id && !/^media-[a-f0-9]{20}$/.test(row.replaces_asset_id)) {
      throw new Error("Media replacement must name a stable asset id");
    }
    if ("email" in row || "phone" in row || "message" in row || "contact" in row) {
      throw new Error("Media upload rows must not contain private contact data");
    }
  }
  return true;
}
