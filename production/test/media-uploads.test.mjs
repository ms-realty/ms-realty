import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { ALLOWED_IMAGE_FORMATS, sanitizeImageUpload, sniffImageFormat } from "../lib/image-sanitizer.mjs";
import { multipartBoundary, multipartForm, parseMultipart } from "../lib/multipart.mjs";
import {
  MEDIA_UPLOAD_SCOPES,
  createMediaUploadStorage,
  mediaUploadKey,
  mediaUploadPublicUrl,
  mediaUploadStorageConfigFromEnv,
} from "../lib/media-upload-storage.mjs";
import {
  appendMediaUpload,
  applyMediaUploads,
  assertMediaUploads,
  assertReplacementAsset,
  assertUploadEnquiry,
  assertUploadListing,
  createMediaUploadRecord,
  enquiryMediaUploads,
  mediaUploadLimitsFromEnv,
  parseMediaUploadRequest,
  prepareMediaUpload,
  readMediaUploads,
  resetMediaUploads,
} from "../lib/media-uploads.mjs";
import { mediaAssetId } from "../lib/media-reviews.mjs";
import { loadCmsSeed } from "../lib/runtime.mjs";
import { MEDIA_INGEST_CONTEXT, mediaIngestCredential } from "../../workers/media-ingest-auth.mjs";
import {
  avifWithExif,
  avifWithoutMetadata,
  gpsExifPayload,
  jpegWithGpsExif,
  multipartBody,
  pngWithGpsExif,
  textFileNamedJpg,
  tinyJpeg,
  tinyPng,
  webpWithGpsExif,
} from "./image-upload.fixture.mjs";

const EXIF_HEADER = Buffer.from("Exif\u0000\u0000", "latin1");
const GPS_LATITUDE_REF_TAG = Buffer.from([0x00, 0x01, 0x00, 0x02]);

function scratch(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `ms-realty-${prefix}-`));
}

/* ------------------------------------------------------------- sniffing */

test("image type is read from the bytes, never from the name or the declared type", () => {
  assert.deepEqual(ALLOWED_IMAGE_FORMATS, ["jpeg", "png", "webp", "avif"]);
  assert.equal(sniffImageFormat(tinyJpeg()).format, "jpeg");
  assert.equal(sniffImageFormat(tinyPng()).format, "png");
  assert.equal(sniffImageFormat(webpWithGpsExif()).format, "webp");
  assert.equal(sniffImageFormat(avifWithoutMetadata()).format, "avif");
  assert.equal(sniffImageFormat(textFileNamedJpg()), null);

  assert.throws(
    () => sanitizeImageUpload(textFileNamedJpg(), { filename: "photo.jpg", declaredType: "image/jpeg" }),
    (error) => error.code === "unsupported_image_type" && /read from the bytes/.test(error.message),
  );
  // A GIF is a real image and still not an accepted upload type.
  assert.throws(
    () => sanitizeImageUpload(Buffer.from("GIF89a" + "0".repeat(32), "latin1")),
    (error) => error.code === "unsupported_image_type",
  );
});

/* ------------------------------------------------------- metadata removal */

test("a JPEG carrying GPS EXIF is stored with the coordinates removed", () => {
  const source = jpegWithGpsExif();
  assert.ok(source.includes(EXIF_HEADER), "fixture must actually carry EXIF");
  assert.ok(source.includes(gpsExifPayload()), "fixture must actually carry the GPS IFD");

  const stored = sanitizeImageUpload(source, { filename: "kitchen.jpg" });
  assert.equal(stored.format, "jpeg");
  assert.equal(stored.metadata_stripped, true);
  assert.ok(stored.metadata_removed_bytes > 0);
  assert.ok(!stored.bytes.includes(EXIF_HEADER));
  assert.ok(!stored.bytes.includes(gpsExifPayload()));
  assert.ok(!stored.bytes.includes(GPS_LATITUDE_REF_TAG));
  // What survives is exactly the image without its metadata segment.
  assert.deepEqual(stored.bytes, tinyJpeg());
});

test("PNG and WebP metadata chunks that can carry GPS are removed", () => {
  const png = sanitizeImageUpload(pngWithGpsExif());
  assert.ok(png.metadata_removed_bytes > 0);
  assert.deepEqual(png.bytes, tinyPng());
  assert.ok(!png.bytes.includes(gpsExifPayload()));

  const webp = sanitizeImageUpload(webpWithGpsExif());
  assert.ok(webp.metadata_removed_bytes > 0);
  assert.ok(!webp.bytes.includes(gpsExifPayload()));
  assert.equal(webp.bytes.slice(0, 4).toString("latin1"), "RIFF");
  assert.equal(webp.bytes.slice(8, 12).toString("latin1"), "WEBP");
  assert.equal(webp.bytes.readUInt32LE(4), webp.bytes.length - 8, "RIFF size must match the rewritten payload");
  // VP8X must stop advertising the EXIF and XMP chunks it no longer has.
  assert.equal(webp.bytes[20] & 0b0000_1100, 0);
});

test("an AVIF that carries Exif or XMP is refused instead of stored", () => {
  assert.equal(sanitizeImageUpload(avifWithoutMetadata()).metadata_stripped, false);
  assert.throws(
    () => sanitizeImageUpload(avifWithExif()),
    (error) => error.code === "image_metadata_refused" && /cannot be stripped in process/.test(error.message),
  );
});

/* ------------------------------------------------------------- multipart */

test("multipart bodies are split into exact bytes and named fields", () => {
  const { body, contentType } = multipartBody([
    { name: "listingId", value: "MS-00815" },
    { name: "photo", filename: "a.jpg", contentType: "image/jpeg", value: tinyJpeg() },
    { name: "photo", filename: "b.png", contentType: "image/png", value: tinyPng() },
  ]);
  assert.equal(multipartBoundary(contentType), "----MSRealtyTestBoundary");
  assert.equal(multipartBoundary("application/json"), null);

  const form = multipartForm(body, contentType);
  assert.deepEqual(form.fields, { listingId: "MS-00815" });
  assert.equal(form.files.length, 2);
  assert.deepEqual(form.files[0].bytes, tinyJpeg());
  assert.deepEqual(form.files[1].bytes, tinyPng());
  assert.equal(form.files[1].filename, "b.png");

  assert.throws(() => parseMultipart(body, "multipart/form-data; boundary=wrong"), /boundary/);
  assert.throws(() => parseMultipart(Buffer.alloc(0), contentType), /request body/);
});

test("an upload request can also arrive as JSON with base64 data", () => {
  const request = {
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ listingId: "MS-00815", dataBase64: tinyJpeg().toString("base64") }),
  };
  const parsed = parseMediaUploadRequest(request);
  assert.equal(parsed.fields.listingId, "MS-00815");
  assert.equal(parsed.files.length, 1);
  assert.deepEqual(parsed.files[0].bytes, tinyJpeg());
  assert.equal(parsed.form, false);
});

/* --------------------------------------------------------------- limits */

test("the per-request cap can never exceed the transport body limit", () => {
  const limits = mediaUploadLimitsFromEnv(
    { MS_REALTY_MEDIA_UPLOAD_MAX_FILE_BYTES: "50000000", MS_REALTY_MEDIA_UPLOAD_MAX_REQUEST_BYTES: "90000000" },
    { maxBodyBytes: 1024 * 1024 },
  );
  assert.equal(limits.maxFileBytes, 1024 * 1024);
  assert.equal(limits.maxRequestBytes, 1024 * 1024);

  const defaults = mediaUploadLimitsFromEnv({}, { maxBodyBytes: 10 * 1024 * 1024 });
  assert.equal(defaults.maxFileBytes, 8 * 1024 * 1024);
  assert.equal(defaults.maxRequestBytes, 10 * 1024 * 1024);
  assert.equal(defaults.maxFiles, 8);
  assert.equal(defaults.maxEnquiryPhotos, 12);

  assert.throws(() => mediaUploadLimitsFromEnv({ MS_REALTY_MEDIA_UPLOAD_MAX_FILES: "0" }), /positive integer/);
});

test("an oversized file is refused before any bytes are stored", async () => {
  const limits = mediaUploadLimitsFromEnv({ MS_REALTY_MEDIA_UPLOAD_MAX_FILE_BYTES: "256" }, { maxBodyBytes: 4096 });
  await assert.rejects(
    () => prepareMediaUpload({ bytes: tinyJpeg(), filename: "big.jpg" }, { scope: "listing", subjectId: "MS-00815", limits }),
    (error) => error.status === 413 && error.code === "file_too_large",
  );
});

/* -------------------------------------------------------------- storage */

test("the stored filename is a content hash and cannot be steered by the caller", () => {
  assert.deepEqual(MEDIA_UPLOAD_SCOPES, ["listing", "enquiry"]);
  const hash = "a".repeat(64);
  const key = mediaUploadKey({ scope: "listing", hash, ext: "jpg", at: new Date("2026-08-23T00:00:00Z") });
  assert.equal(key, `ms-realty.ms-realty-bg.workers.dev/wp-content/uploads/2026/08/ms-${"a".repeat(32)}.jpg`);
  assert.equal(mediaUploadPublicUrl(key), `https://ms-realty.ms-realty-bg.workers.dev/wp-content/uploads/2026/08/ms-${"a".repeat(32)}.jpg`);

  const stagedKey = mediaUploadKey({
    scope: "listing",
    subjectId: "MS-00815",
    assetId: "media-0123456789abcdef0123",
    hash,
    ext: "jpg",
    visibility: "staged_private",
  });
  assert.equal(
    stagedKey,
    `ms-realty.ms-realty-bg.workers.dev/wp-content/private/listings/MS-00815/media-0123456789abcdef0123/ms-${"a".repeat(32)}.jpg`,
  );
  assert.equal(mediaUploadPublicUrl(stagedKey), null);

  // A seller's photo lives outside the prefix the Worker serves, so it has no
  // public URL at all.
  const privateKey = mediaUploadKey({ scope: "enquiry", subjectId: "lead-draft-1", hash, ext: "jpg" });
  assert.equal(privateKey, `ms-realty.ms-realty-bg.workers.dev/wp-content/private/enquiries/lead-draft-1/ms-${"a".repeat(32)}.jpg`);
  assert.equal(mediaUploadPublicUrl(privateKey), null);

  assert.throws(() => mediaUploadKey({ scope: "enquiry", subjectId: "../../etc", hash, ext: "jpg" }), /enquiry id/);
  assert.throws(() => mediaUploadKey({ scope: "listing", hash: "nope", ext: "jpg" }), /content hash/);
  assert.throws(() => mediaUploadKey({ scope: "gallery", hash, ext: "jpg" }), /listing or enquiry/);
});

test("the local storage driver writes under its root and refuses to escape it", async () => {
  const root = scratch("upload-store");
  const storage = createMediaUploadStorage({ driver: "local", root });
  const key = "makler-realty.com/wp-content/uploads/2026/08/ms-abc.jpg";
  const first = await storage.put({ key, bytes: tinyJpeg(), contentType: "image/jpeg" });
  assert.equal(first.stored, true);
  assert.deepEqual(await storage.read(key), tinyJpeg());
  // Content addressing makes a repeat write a no-op rather than a duplicate.
  assert.equal((await storage.put({ key, bytes: tinyJpeg() })).stored, false);
  assert.ok(fs.existsSync(path.join(root, "makler-realty.com/wp-content/uploads/2026/08/ms-abc.jpg")));

  await assert.rejects(storage.put({ key: "../escape.jpg", bytes: tinyJpeg() }), /unsafe|escapes/);
  await assert.rejects(storage.read("makler-realty.com/wp-content/uploads/2026/08/missing.jpg"), (error) => error.code === "not_found");
});

test("the r2 driver ingests through the Worker route and verifies the echoed size", async () => {
  const calls = [];
  const storage = createMediaUploadStorage(
    { driver: "r2", endpoint: "https://example.test/__media", secret: "ingest-secret" },
    {
      fetchImpl: async (url, init) => {
        calls.push({ url, method: init.method, auth: init.headers.authorization, bytes: init.body?.length || 0 });
        if (init.method === "GET") return { ok: true, status: 200, arrayBuffer: async () => tinyJpeg() };
        if (init.method === "DELETE") return { ok: true, status: 200 };
        return { ok: true, status: 200, json: async () => ({ key: "k", size: init.body.length }) };
      },
    },
  );
  const stored = await storage.put({
    key: "makler-realty.com/wp-content/uploads/2026/08/ms-abc.jpg",
    bytes: tinyJpeg(),
    contentType: "image/jpeg",
  });
  assert.equal(stored.driver, "r2");
  assert.equal(calls[0].method, "PUT");
  assert.equal(calls[0].auth, "Bearer ingest-secret");
  assert.equal(
    calls[0].url,
    "https://example.test/__media/makler-realty.com%2Fwp-content%2Fuploads%2F2026%2F08%2Fms-abc.jpg",
  );
  assert.deepEqual(await storage.read("makler-realty.com/wp-content/uploads/2026/08/ms-abc.jpg"), tinyJpeg());
  await storage.delete("makler-realty.com/wp-content/uploads/2026/08/ms-abc.jpg");
  assert.deepEqual(calls.map((call) => call.method), ["PUT", "GET", "DELETE"]);
  assert.equal(calls[1].auth, "Bearer ingest-secret");
  assert.equal(calls[2].auth, "Bearer ingest-secret");

  const lying = createMediaUploadStorage(
    { driver: "r2", endpoint: "https://example.test/__media/", secret: "ingest-secret" },
    { fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ size: 1 }) }) },
  );
  await assert.rejects(lying.put({ key: "makler-realty.com/wp-content/uploads/2026/08/a.jpg", bytes: tinyJpeg() }), /different byte count/);

  assert.throws(() => createMediaUploadStorage({ driver: "r2" }), (error) => error.code === "bad_configuration");
  assert.throws(() => createMediaUploadStorage({ driver: "s3" }), (error) => error.code === "bad_configuration");

  const fromEnv = mediaUploadStorageConfigFromEnv({});
  assert.equal(fromEnv.driver, "local");
  assert.equal(fromEnv.host, "ms-realty.ms-realty-bg.workers.dev");
});

test("production can derive a media-only credential from the existing origin secret", async () => {
  const originToken = "origin-token-that-is-at-least-thirty-two-characters";
  const expected = createHmac("sha256", originToken).update(MEDIA_INGEST_CONTEXT).digest("hex");
  assert.equal(await mediaIngestCredential(originToken), expected);
  assert.equal(await mediaIngestCredential("short"), "");

  let authorization = "";
  const storage = createMediaUploadStorage(
    { driver: "r2", endpoint: "https://example.test/__media/", originToken },
    {
      fetchImpl: async (_url, init) => {
        authorization = init.headers.authorization;
        return { ok: true, status: 200, json: async () => ({ size: init.body.length }) };
      },
    },
  );
  await storage.put({ key: "makler-realty.com/wp-content/uploads/2026/08/a.jpg", bytes: tinyJpeg() });
  assert.equal(authorization, `Bearer ${expected}`);

  const fromEnv = mediaUploadStorageConfigFromEnv({ MS_REALTY_ORIGIN_TOKEN: originToken });
  assert.equal(fromEnv.originToken, originToken);
  assert.equal(fromEnv.secret, "");
});

/* --------------------------------------------------------------- ledger */

test("an uploaded asset is written unreviewed, is idempotent, and joins the listing media queue", async () => {
  const file = path.join(scratch("upload-ledger"), "media-uploads.jsonl");
  resetMediaUploads(file);
  const seed = loadCmsSeed();
  const record = assertUploadListing(seed, "MS-00815");
  const replacementTarget = mediaAssetId(record.media.find((item) => item.is_public));
  assert.equal(assertReplacementAsset(record, replacementTarget), replacementTarget);
  assert.equal(assertReplacementAsset(record, ""), null);
  assert.throws(
    () => assertReplacementAsset(record, "media-00000000000000000000"),
    (error) => error.status === 404 && error.code === "unknown_media_asset",
  );

  const prepared = await prepareMediaUpload(
    { bytes: jpegWithGpsExif(), filename: "kitchen.jpg", contentType: "image/jpeg" },
    { scope: "listing", subjectId: record.id, kind: "photo", uploadedAt: "2026-08-23T10:00:00.000Z" },
  );
  const created = createMediaUploadRecord(prepared, {
    uploadedBy: "operations_lead",
    source: "admin_listing_editor",
    storageDriver: "local",
    uploadedAt: "2026-08-23T10:00:00.000Z",
  });
  const first = appendMediaUpload(created, { filePath: file });
  const retry = appendMediaUpload(created, { filePath: file });

  assert.equal(first.idempotent, false);
  assert.equal(retry.idempotent, true);
  assert.equal(readMediaUploads(file).length, 1);
  assert.equal(first.is_public, false);
  assert.equal(first.review_status, "needs_media_review");
  assert.equal(first.alt, "");
  assert.equal(first.metadata_stripped, true);
  assert.equal(assertMediaUploads(readMediaUploads(file)), true);

  const projected = applyMediaUploads(seed, readMediaUploads(file));
  const listing = projected.records.find((row) => row.id === "MS-00815");
  const asset = listing.media.find((item) => item.asset_id === first.asset_id);
  assert.ok(asset, "the uploaded asset must appear in the listing media array");
  assert.equal(asset.is_public, false);
  assert.equal(asset.review_status, "needs_media_review");
  assert.equal(asset.origin, "operator_upload");
  // The review workflow addresses assets by this id, so it has to agree.
  assert.equal(mediaAssetId(asset), first.asset_id);
  // An upload must not take an already published listing off the site: the
  // publication gate keeps its original value and the pending review is its own
  // counter.
  const original = seed.records.find((row) => row.id === 'MS-00815');
  assert.equal(listing.media_workflow.review_gated_assets, original.media_workflow.review_gated_assets);
  assert.equal(listing.media_workflow.pending_upload_reviews, 1);
  assert.equal(listing.media_workflow.total_assets, original.media_workflow.total_assets + 1);

  // Other listings are untouched.
  const other = projected.records.find((row) => row.collection === "listings" && row.id !== "MS-00815");
  assert.equal((other.media || []).some((item) => item.asset_id === first.asset_id), false);
});

test("a seller photo is bound to a known enquiry and never reaches a listing", async () => {
  const file = path.join(scratch("enquiry-ledger"), "media-uploads.jsonl");
  resetMediaUploads(file);
  const enquiries = [{ id: "seller-pipeline-lead-draft-7", lead_id: "lead-draft-7", stage: "valuation_requested" }];

  assert.equal(assertUploadEnquiry("lead-draft-7", enquiries), "lead-draft-7");
  assert.throws(
    () => assertUploadEnquiry("lead-draft-unknown", enquiries),
    (error) => error.status === 404 && error.code === "unknown_enquiry",
  );
  assert.throws(() => assertUploadEnquiry("", enquiries), /enquiryId is required/);

  const prepared = await prepareMediaUpload(
    { bytes: tinyPng(), filename: "front.png" },
    { scope: "enquiry", subjectId: "lead-draft-7", uploadedAt: "2026-08-23T10:00:00.000Z" },
  );
  assert.equal(prepared.assetUrl, null, "a public upload must not get a public URL");
  const persisted = appendMediaUpload(
    createMediaUploadRecord(prepared, { uploadedBy: "public_seller_intake", source: "public_seller_intake", storageDriver: "local" }),
    { filePath: file },
  );
  assert.equal(persisted.asset_url, null);
  assert.equal(persisted.is_public, false);
  assert.equal(enquiryMediaUploads(readMediaUploads(file), "lead-draft-7").length, 1);

  // Projection into the CMS seed only ever considers listing-scoped rows.
  const seed = loadCmsSeed();
  const projected = applyMediaUploads(seed, readMediaUploads(file));
  assert.equal(projected, seed, "enquiry uploads must not change the listing seed at all");
  assert.equal(JSON.stringify(projected).includes(persisted.asset_id), false);
});

test("the ledger refuses rows that claim publication or carry contact data", () => {
  assert.throws(
    () => assertMediaUploads([{ id: "a", uploaded_at: "x", subject_type: "listing", subject_id: "l", storage_key: "k", content_hash: "h", kind: "photo", is_public: true, review_status: "approved_by_human" }]),
    /stored unreviewed and non-public/,
  );
  assert.throws(
    () => assertMediaUploads([{ id: "a", uploaded_at: "x", subject_type: "enquiry", subject_id: "l", storage_key: "k", content_hash: "h", kind: "photo", is_public: false, review_status: "needs_media_review", asset_url: "https://example.test/a.jpg" }]),
    /must not carry a public asset URL/,
  );
  assert.throws(
    () => assertMediaUploads([{ id: "a", uploaded_at: "x", subject_type: "listing", subject_id: "l", storage_key: "k", content_hash: "h", kind: "photo", is_public: false, review_status: "needs_media_review", phone: "+359" }]),
    /private contact data/,
  );
});
