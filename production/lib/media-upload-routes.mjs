// Runtime-agnostic photo upload handlers.
//
// The same upload has to work on both hosts this project runs: the standalone
// Node server (production/lib/http.mjs) and the Next App Router handoff
// (production/lib/app-api-adapter.mjs and app-admin-adapter.mjs, which is what
// the container actually serves). Rather than write the rules twice and let
// them drift, both call the functions here and supply only what differs: raw
// bytes, a storage driver, ledger paths, and how to record an audit entry.
//
// Every response says, in the payload, that an upload is not a publication.

import { imageOptimizationFromEnv } from "./image-optimizer.mjs";
import {
  MediaUploadError,
  appendMediaUpload,
  assertReplacementAsset,
  assertUploadEnquiry,
  assertUploadListing,
  createMediaUploadRecord,
  enquiryMediaUploads,
  listingMediaUploads,
  mediaUploadLimitsFromEnv,
  normalizeUploadKind,
  parseMediaUploadRequest,
  prepareMediaUpload,
  publicMediaUpload,
  readMediaUploads,
} from "./media-uploads.mjs";

export const ADMIN_MEDIA_UPLOAD_PATH = "/api/admin/media/uploads";
export const SELLER_PHOTO_UPLOAD_PATH = "/api/seller-photos";

const UPLOAD_NOT_PUBLIC =
  "Uploaded photos are stored unreviewed. A human must approve each one and supply alt text before it becomes public.";
const SELLER_NOT_PUBLIC =
  "Your photos reached your enquiry. They are private: photos sent by the public are never published automatically and never appear in search. A broker reviews them with you.";

// A return path is only ever a same-site absolute locale path, so a redirect
// built from it cannot be pointed at another origin.
const RETURN_PATH = /^\/[a-z]{2}(-[a-z]{2})?\/[a-z0-9/-]{1,64}$/i;

export function safeUploadReturnPath(value) {
  const candidate = String(value || "");
  return RETURN_PATH.test(candidate) ? candidate : "";
}

export function acceptsHtmlResponse(accept) {
  return String(accept || "").includes("text/html");
}

function failure(error) {
  return {
    status: error?.status || 400,
    body: { kind: error?.code || "bad_request", message: error?.message || "Upload failed" },
  };
}

async function storeFiles(files, options) {
  const {
    scope,
    subjectId,
    kind,
    limits,
    imageSettings,
    storage,
    ledgerPath,
    uploadedBy,
    source,
    uploadedAt,
    recordAudit,
    auditKey,
    replacesAssetId = null,
    persistUpload = null,
  } = options;
  const accepted = [];
  const rejected = [];
  for (const [index, file] of files.entries()) {
    try {
      const prepared = await prepareMediaUpload(file, {
        scope,
        subjectId,
        kind,
        limits,
        imageSettings,
        replacesAssetId,
        uploadedAt,
      });
      const stored = await storage.put({ key: prepared.storageKey, bytes: prepared.bytes, contentType: prepared.mime });
      // The rendition is written after the photo it belongs to. If it fails,
      // the upload still succeeded — a missing thumbnail costs the reviewer a
      // larger download, which is not a reason to throw away the photo.
      if (prepared.rendition) {
        try {
          await storage.put({
            key: prepared.rendition.storageKey,
            bytes: prepared.rendition.bytes,
            contentType: prepared.rendition.mime,
          });
        } catch {
          prepared.rendition = null;
        }
      }
      const uploadRecord = createMediaUploadRecord(prepared, {
        uploadedBy,
        source,
        storageDriver: stored.driver,
        uploadedAt,
      });
      // Production durable-only mode supplies a Payload transaction callback.
      // Keeping the legacy append as the default preserves the Node/Next
      // parity and the existing non-durable behavior for local development.
      const persisted = typeof persistUpload === "function"
        ? await persistUpload(uploadRecord, { prepared, stored, storage })
        : appendMediaUpload(uploadRecord, { filePath: ledgerPath || undefined });
      if (!persisted.idempotent && typeof recordAudit === "function") {
        recordAudit({
          action: "media_uploaded",
          actor: uploadedBy,
          objectType: "media_asset",
          objectId: persisted.asset_id,
          metadata: {
            [auditKey]: persisted.subject_id,
            kind: persisted.kind,
            format: persisted.format,
            bytes: persisted.bytes,
            submitted_bytes: persisted.submitted_bytes,
            width: persisted.width,
            height: persisted.height,
            optimized: persisted.optimized,
            storage_driver: persisted.storage_driver,
            metadata_stripped: persisted.metadata_stripped,
            review_status: persisted.review_status,
            is_public: false,
            source: persisted.source,
          },
        });
      }
      accepted.push({ index, persisted });
    } catch (error) {
      if (typeof recordAudit === "function" && error?.code === "media_persistence_failed") {
        recordAudit({
          action: "media_persistence_failed",
          actor: uploadedBy,
          objectType: "media_asset",
          objectId: null,
          metadata: {
            [auditKey]: String(subjectId || ""),
            storage_cleanup: error.storageCleanup || "unknown",
            orphaned_storage: error.orphanedStorage === true,
          },
        });
      }
      rejected.push({
        index,
        filename: file.filename || null,
        kind: error.code || "bad_request",
        status: error.status || 400,
        message: error.message,
        ...(error?.storageCleanup
          ? {
              storage_cleanup: error.storageCleanup,
              orphaned_storage: error.orphanedStorage === true,
            }
          : {}),
      });
    }
  }
  return { accepted, rejected };
}

function assertBatch(files, limits) {
  if (!files.length) throw new MediaUploadError("Attach at least one photo");
  if (files.length > limits.maxFiles) {
    throw new MediaUploadError(`Upload at most ${limits.maxFiles} photos per request`, { status: 413, code: "too_many_files" });
  }
  const total = files.reduce((sum, file) => sum + file.bytes.length, 0);
  if (total > limits.maxRequestBytes) {
    throw new MediaUploadError(`An upload request must be ${Math.floor(limits.maxRequestBytes / 1024)} KB or smaller`, {
      status: 413,
      code: "request_too_large",
    });
  }
}

/* ------------------------------------------------------------------ admin */

export async function handleAdminMediaUpload({
  bytes,
  contentType,
  acceptsHtml = false,
  seed,
  limits = mediaUploadLimitsFromEnv(),
  imageSettings = imageOptimizationFromEnv(),
  storage,
  ledgerPath = null,
  uploadedBy = "admin",
  uploadedAt = new Date().toISOString(),
  recordAudit = null,
  persistUpload = null,
  editorPathFor = (id) => `/admin/listings/edit?listingId=${encodeURIComponent(id)}`,
}) {
  let listingId = "";
  try {
    const parsed = parseMediaUploadRequest({ headers: { "content-type": contentType }, bodyBytes: bytes }, { limits });
    const record = assertUploadListing(seed, parsed.fields.listingId || parsed.fields.listing_id);
    listingId = record.id;
    const kind = normalizeUploadKind(parsed.fields.kind || "photo");
    const replacesAssetId = assertReplacementAsset(
      record,
      parsed.fields.replacesAssetId || parsed.fields.replaces_asset_id || parsed.fields.replacementAssetId,
    );
    assertBatch(parsed.files, limits);
    if (replacesAssetId && parsed.files.length !== 1) {
      throw new MediaUploadError("A media replacement requires exactly one file", { code: "replacement_file_count" });
    }

    const { accepted, rejected } = await storeFiles(parsed.files, {
      scope: "listing",
      subjectId: record.id,
      kind,
      limits,
      imageSettings,
      storage,
      ledgerPath,
      uploadedBy,
      source: "admin_listing_editor",
      uploadedAt,
      recordAudit,
      auditKey: "listing_id",
      replacesAssetId,
      persistUpload,
    });

    if (acceptsHtml) {
      const flag = accepted.length ? (rejected.length ? "partial" : "1") : "0";
      return { status: 303, body: "", headers: { location: `${editorPathFor(record.id)}&media_upload=${flag}#listing-media` } };
    }
    if (!accepted.length) {
      return {
        status: rejected[0]?.status || 400,
        body: { kind: rejected[0]?.kind || "bad_request", message: rejected[0]?.message || "No photo was accepted", rejected },
      };
    }
    return {
      status: accepted.every((row) => row.persisted.idempotent) ? 200 : 201,
      body: {
        kind: "media_upload_accepted",
        listing_id: record.id,
        uploaded: accepted.map((row) => ({
          ...publicMediaUpload(row.persisted),
          index: row.index,
          idempotent: row.persisted.idempotent,
        })),
        rejected,
        public: false,
        searchable: false,
        review_required: true,
        review_endpoint: "/api/admin/media/reviews",
        message: UPLOAD_NOT_PUBLIC,
      },
    };
  } catch (error) {
    if (acceptsHtml) {
      const target = listingId ? `${editorPathFor(listingId)}&media_upload=0` : "/admin/listings/edit?media_upload=0";
      return { status: 303, body: "", headers: { location: `${target}#listing-media` } };
    }
    return failure(error);
  }
}

export function listMediaUploads({ ledgerPath = null, listing = "", enquiry = "", limits = mediaUploadLimitsFromEnv() }) {
  const listingId = String(listing || "").trim();
  const enquiryId = String(enquiry || "").trim();
  if (!listingId && !enquiryId) {
    return { status: 400, body: { kind: "bad_request", message: "Pass ?listing= or ?enquiry=" } };
  }
  const rows = readMediaUploads(ledgerPath || undefined);
  const selected = listingId ? listingMediaUploads(rows, listingId) : enquiryMediaUploads(rows, enquiryId);
  return {
    status: 200,
    body: {
      kind: "media_uploads",
      subject_type: listingId ? "listing" : "enquiry",
      subject_id: listingId || enquiryId,
      uploads: selected.map(publicMediaUpload),
      review_required: true,
      public: false,
      limits,
    },
  };
}

/**
 * Byte preview for a reviewer.
 *
 * `rendition` selects a stored derivative instead of the photo itself. It is a
 * selector on this route rather than a route of its own on purpose: the
 * permission check, the private cache headers and the "unreviewed media is
 * admin-only" rule are already correct here, and a second endpoint would be a
 * second place for them to be got wrong. An unknown rendition name falls back
 * to the full photo rather than 404ing, so a stale link keeps working.
 */
export async function readMediaUploadBytes({ ledgerPath = null, assetId, rendition = "", storage }) {
  const row = readMediaUploads(ledgerPath || undefined).find((item) => item.asset_id === assetId || item.id === assetId);
  if (!row) return { status: 404, body: { kind: "not_found", message: "Unknown upload" } };
  const wanted = String(rendition || "").trim();
  const derived = wanted && row.rendition?.kind === wanted ? row.rendition : null;
  const key = derived ? derived.storage_key : row.storage_key;
  const contentType = derived ? derived.content_type : row.content_type;
  const format = derived ? derived.format : row.format;
  try {
    const bytes = await storage.read(key);
    return {
      status: 200,
      body: bytes,
      headers: {
        "content-type": contentType || "application/octet-stream",
        "content-length": String(bytes.length),
        "content-disposition": `inline; filename="${row.asset_id}${derived ? `-${derived.kind}` : ""}.${format === "jpeg" ? "jpg" : format}"`,
      },
    };
  } catch (error) {
    return {
      status: error.code === "not_found" ? 404 : 503,
      body: { kind: error.code || "media_storage_unavailable", message: error.message },
    };
  }
}

/* ----------------------------------------------------------------- seller */

export async function handleSellerPhotoUpload({
  bytes,
  contentType,
  acceptsHtml = false,
  returnPath = "",
  enabled = true,
  sellerEnquiries = null,
  limits = mediaUploadLimitsFromEnv(),
  // The seller intake optimises through exactly the same settings as the admin
  // editor. A photo is not treated differently because a member of the public
  // sent it; only where it is stored differs, and that is the privacy contract.
  imageSettings = imageOptimizationFromEnv(),
  storage,
  ledgerPath = null,
  uploadedAt = new Date().toISOString(),
  // Every upload is already recorded in the audit log with its actor. A second
  // analytics event would add a public write path with nothing new in it.
  recordAudit = null,
}) {
  const redirectTo = acceptsHtml ? safeUploadReturnPath(returnPath) : "";
  try {
    if (!enabled || !Array.isArray(sellerEnquiries)) {
      // Seller photos follow the same durability boundary as the enquiry they
      // belong to: with no store we can name, we refuse rather than accept
      // bytes we cannot attach to anything.
      throw new MediaUploadError("Seller photo upload is unavailable until the enquiry store is durable", {
        status: 503,
        code: "seller_photo_upload_unavailable",
      });
    }
    const parsed = parseMediaUploadRequest({ headers: { "content-type": contentType }, bodyBytes: bytes }, { limits });
    const enquiryId = assertUploadEnquiry(
      parsed.fields.enquiryId || parsed.fields.enquiry_id || parsed.fields.enquiry,
      sellerEnquiries,
    );
    assertBatch(parsed.files, limits);

    const existing = enquiryMediaUploads(readMediaUploads(ledgerPath || undefined), enquiryId);
    if (existing.length + parsed.files.length > limits.maxEnquiryPhotos) {
      throw new MediaUploadError(`An enquiry can hold at most ${limits.maxEnquiryPhotos} photos`, {
        status: 413,
        code: "enquiry_photo_limit",
      });
    }

    const { accepted, rejected } = await storeFiles(parsed.files, {
      scope: "enquiry",
      subjectId: enquiryId,
      kind: "photo",
      limits,
      imageSettings,
      storage,
      ledgerPath,
      uploadedBy: "public_seller_intake",
      source: "public_seller_intake",
      uploadedAt,
      recordAudit,
      auditKey: "enquiry_id",
    });
    if (redirectTo) {
      const flag = accepted.length ? (rejected.length ? "partial" : "ok") : "error";
      return { status: 303, body: "", headers: { location: `${redirectTo}?photos=${flag}#seller-photos` } };
    }
    if (!accepted.length) {
      return {
        status: rejected[0]?.status || 400,
        body: { kind: rejected[0]?.kind || "bad_request", message: rejected[0]?.message || "No photo was accepted", rejected },
      };
    }
    return {
      status: accepted.every((row) => row.persisted.idempotent) ? 200 : 201,
      body: {
        kind: "seller_photos_received",
        enquiry_id: enquiryId,
        received: accepted.map((row) => ({
          index: row.index,
          id: row.persisted.id,
          asset_id: row.persisted.asset_id,
          bytes: row.persisted.bytes,
          format: row.persisted.format,
          metadata_stripped: row.persisted.metadata_stripped,
          review_status: row.persisted.review_status,
          is_public: false,
          idempotent: row.persisted.idempotent,
        })),
        rejected,
        photo_count: existing.length + accepted.filter((row) => !row.persisted.idempotent).length,
        public: false,
        searchable: false,
        published: false,
        review_required: true,
        message: SELLER_NOT_PUBLIC,
      },
    };
  } catch (error) {
    if (redirectTo) return { status: 303, body: "", headers: { location: `${redirectTo}?photos=error#seller-photos` } };
    return failure(error);
  }
}
