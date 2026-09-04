import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { createHttpApp, dispatchHttp } from "../lib/http.mjs";
import { readAuditLog, resetAuditLog } from "../lib/audit-log.mjs";
import { sniffImageFormat } from "../lib/image-sanitizer.mjs";
import { readMediaUploads } from "../lib/media-uploads.mjs";
import { mediaAssetId } from "../lib/media-reviews.mjs";
import { loadCmsSeed } from "../lib/runtime.mjs";
import { approvedPublicSeedFixtureOptions } from "./approved-public-seed.fixture.mjs";
import { createPayloadDraftRuntime } from "./payload-draft-runtime.fixture.mjs";
import {
  avifWithExif,
  jpegWithGpsExif,
  multipartBody,
  orientedPhotoJpeg,
  photoJpegWithGpsExif,
  textFileNamedJpg,
  tinyJpeg,
  tinyPng,
} from "./image-upload.fixture.mjs";

const EXIF_HEADER = Buffer.from("Exif\u0000\u0000", "latin1");
const ADMIN = Object.freeze({ authorization: "Bearer local-admin-smoke", accept: "application/json" });
const SAME_ORIGIN = Object.freeze({
  host: "localhost",
  origin: "http://localhost",
  "sec-fetch-site": "same-origin",
  accept: "application/json",
});
const DURABLE_ENV = Object.freeze({
  NODE_ENV: "production",
  MS_REALTY_RUNTIME_DATA_AUTHORITY: "payload",
  PAYLOAD_SECRET: "x".repeat(40),
  DATABASE_URL: "postgres://payload:secret@db.example.test/ms_realty",
});
const ENQUIRY_ID = "lead-draft-11111111-2222-3333-4444-555555555555";
const LISTING_ID = "MS-00815";
const LISTING_PATH = "/en/properties/MS-00815";

function workspace(extra = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-upload-routes-"));
  const paths = {
    dir,
    mediaUploadLedgerPath: path.join(dir, "media-uploads.jsonl"),
    mediaReviewLedgerPath: path.join(dir, "media-reviews.jsonl"),
    auditLogPath: path.join(dir, "audit-log.jsonl"),
    sellerPipelinePath: path.join(dir, "seller-pipeline.jsonl"),
    uploadRoot: path.join(dir, "bytes"),
  };
  fs.writeFileSync(paths.mediaUploadLedgerPath, "");
  fs.writeFileSync(paths.mediaReviewLedgerPath, "");
  resetAuditLog(paths.auditLogPath);
  fs.writeFileSync(
    paths.sellerPipelinePath,
    `${JSON.stringify({
      id: `seller-pipeline-${ENQUIRY_ID}`,
      lead_id: ENQUIRY_ID,
      stage: "valuation_requested",
      contact_name: "seller",
    })}\n`,
  );
  const app = createHttpApp({
    ...approvedPublicSeedFixtureOptions(),
    mediaUploadLedgerPath: paths.mediaUploadLedgerPath,
    mediaReviewLedgerPath: paths.mediaReviewLedgerPath,
    auditLogPath: paths.auditLogPath,
    sellerPipelinePath: paths.sellerPipelinePath,
    mediaUploadStorageConfig: { driver: "local", root: paths.uploadRoot, host: "ms-realty.ms-realty-bg.workers.dev" },
    reviewedAt: "2026-08-23T10:00:00.000Z",
    receivedAt: "2026-08-23T10:00:00.000Z",
    ...extra,
  });
  return { app, ...paths };
}

function adminUpload(files, fields = { listingId: LISTING_ID }) {
  return multipartBody([
    ...Object.entries(fields).map(([name, value]) => ({ name, value })),
    ...files.map((file) => ({ name: "photo", filename: file.name, contentType: file.type || "image/jpeg", value: file.bytes })),
  ]);
}

async function post(app, url, { body, contentType }, headers) {
  return dispatchHttp(app, { method: "POST", url, headers: { ...headers, "content-type": contentType }, body });
}

function durablePayloadRuntime() {
  const runtime = createPayloadDraftRuntime();
  const create = runtime.payload.create.bind(runtime.payload);
  runtime.payload.create = async (input) => {
    if (input.collection === "media_assets" && !Object.hasOwn(input.data || {}, "id")) {
      return create({
        ...input,
        data: {
          id: runtime.currentRows().media_assets.length + 2000,
          ...input.data,
        },
      });
    }
    return create(input);
  };
  return runtime;
}

/* ------------------------------------------------------ admin happy path */

test("an admin upload is stored unreviewed, audited, absent from the public payload, and public only after review", async () => {
  const context = workspace();

  const before = await dispatchHttp(context.app, { url: LISTING_PATH });
  assert.equal(before.status, 200);
  const galleryBefore = before.body.body.media.gallery.map((item) => item.url);

  // A photograph, not the 1x1 marker: publication is under test here, and the
  // gallery refuses anything too small to be a real property photo.
  const photo = await photoJpegWithGpsExif({ width: 800, height: 600 });
  const created = await post(context.app, "/api/admin/media/uploads", adminUpload([{ name: "kitchen.jpg", bytes: photo }]), ADMIN);
  assert.equal(created.status, 201);
  assert.equal(created.body.kind, "media_upload_accepted");
  assert.equal(created.body.public, false);
  assert.equal(created.body.searchable, false);
  assert.equal(created.body.review_required, true);
  assert.equal(created.body.review_endpoint, "/api/admin/media/reviews");
  assert.equal(created.headers["cache-control"], "no-store");

  const asset = created.body.uploaded[0];
  assert.equal(asset.is_public, false);
  assert.equal(asset.review_status, "needs_media_review");
  assert.equal(asset.metadata_stripped, true);
  assert.ok(asset.submitted_bytes > asset.bytes, "the GPS block must be gone from the stored bytes");
  assert.match(asset.asset_url, /^https:\/\/ms-realty\.ms-realty-bg\.workers\.dev\/wp-content\/uploads\/\d{4}\/\d{2}\/ms-[a-f0-9]{32}\.jpg$/);

  // Bytes on disk, under the configured root, named from the content hash.
  const stored = readMediaUploads(context.mediaUploadLedgerPath);
  assert.equal(stored.length, 1);
  const bytesPath = path.join(context.uploadRoot, stored[0].storage_key);
  assert.ok(fs.existsSync(bytesPath));
  // The stored bytes are the *optimised* photo, not the posted file, so the
  // assertion is that they are a real JPEG of the recorded size rather than
  // that they are byte-identical to the upload.
  const onDisk = fs.readFileSync(bytesPath);
  assert.equal(sniffImageFormat(onDisk).format, "jpeg");
  assert.equal(onDisk.length, stored[0].bytes, "the ledger records the byte count actually written");
  assert.equal(onDisk.includes(EXIF_HEADER), false, "no EXIF survives optimisation");

  // One audit entry naming the authenticated actor.
  const audit = readAuditLog(context.auditLogPath).filter((row) => row.action === "media_uploaded");
  assert.equal(audit.length, 1);
  assert.equal(audit[0].object_id, asset.asset_id);
  assert.equal(audit[0].metadata.listing_id, LISTING_ID);
  assert.equal(audit[0].metadata.is_public, false);
  assert.equal(audit[0].metadata.review_status, "needs_media_review");

  // Not in the public payload yet, and the listing is still published.
  const pending = await dispatchHttp(context.app, { url: LISTING_PATH });
  assert.equal(pending.status, 200);
  assert.deepEqual(pending.body.body.media.gallery.map((item) => item.url), galleryBefore);
  assert.equal(JSON.stringify(pending.body).includes(asset.asset_id), false);

  // The reviewer sees it in the media manager.
  const editor = await dispatchHttp(context.app, { url: `/admin/listings/edit?listingId=${LISTING_ID}`, headers: ADMIN });
  assert.equal(editor.status, 200);
  assert.ok(editor.body.includes(`data-media-asset="${asset.asset_id}"`));
  assert.ok(editor.body.includes('data-media-upload-form="true"'));

  // Approving through the existing review route publishes it.
  const review = await dispatchHttp(context.app, {
    method: "POST",
    url: "/api/admin/media/reviews",
    headers: ADMIN,
    body: {
      listingId: LISTING_ID,
      assetId: asset.asset_id,
      decision: "publish",
      kind: "photo",
      alt: "Kitchen photographed during the broker visit",
      reviewer: "media_editor",
      reviewConfirmed: true,
    },
  });
  assert.equal(review.status, 201, JSON.stringify(review.body));
  assert.equal(review.body.is_public, true);
  assert.equal(review.body.review_status, "approved_by_human");
  assert.equal(review.body.public_url, asset.asset_url);

  const published = await dispatchHttp(context.app, { url: LISTING_PATH });
  assert.equal(published.status, 200);
  const galleryAfter = published.body.body.media.gallery.map((item) => item.url);
  assert.ok(galleryAfter.includes(asset.asset_url), "the approved upload must reach the public gallery");
  assert.equal(
    published.body.body.media.gallery.find((item) => item.url === asset.asset_url).alt,
    "Kitchen photographed during the broker visit",
  );
});

test("uploading the same photo twice is a retry, not a second asset", async () => {
  const context = workspace();
  const payload = adminUpload([{ name: "kitchen.jpg", bytes: jpegWithGpsExif() }]);
  const first = await post(context.app, "/api/admin/media/uploads", payload, ADMIN);
  const retry = await post(context.app, "/api/admin/media/uploads", payload, ADMIN);
  assert.equal(first.status, 201);
  assert.equal(retry.status, 200);
  assert.equal(retry.body.uploaded[0].asset_id, first.body.uploaded[0].asset_id);
  assert.equal(readMediaUploads(context.mediaUploadLedgerPath).length, 1);
  assert.equal(readAuditLog(context.auditLogPath).filter((row) => row.action === "media_uploaded").length, 1);
});

test("an approved reupload replaces one public asset without a publication gap", async () => {
  const context = workspace();
  const before = await dispatchHttp(context.app, { url: LISTING_PATH });
  const beforeUrls = before.body.body.media.gallery.map((item) => item.url);
  const listing = loadCmsSeed().records.find((row) => row.id === LISTING_ID);
  const replaced = listing.media.find((item) => beforeUrls.includes(item.asset_url));
  assert.ok(replaced, "fixture must expose a public source asset to replace");
  const replacedAssetId = mediaAssetId(replaced);

  const replacementPhoto = await photoJpegWithGpsExif({ width: 900, height: 675 });
  const created = await post(
    context.app,
    "/api/admin/media/uploads",
    adminUpload(
      [{ name: "replacement.jpg", bytes: replacementPhoto }],
      { listingId: LISTING_ID, replacesAssetId: replacedAssetId, kind: "photo" },
    ),
    ADMIN,
  );
  assert.equal(created.status, 201);
  const replacement = created.body.uploaded[0];
  assert.equal(replacement.replaces_asset_id, replacedAssetId);

  const pending = await dispatchHttp(context.app, { url: LISTING_PATH });
  assert.ok(pending.body.body.media.gallery.some((item) => item.url === replaced.asset_url));
  assert.ok(!pending.body.body.media.gallery.some((item) => item.url === replacement.asset_url));

  const review = await dispatchHttp(context.app, {
    method: "POST",
    url: "/api/admin/media/reviews",
    headers: ADMIN,
    body: {
      listingId: LISTING_ID,
      assetId: replacement.asset_id,
      decision: "publish",
      kind: "photo",
      alt: "Replacement property photograph",
      reviewer: "media_editor",
      reviewConfirmed: true,
    },
  });
  assert.equal(review.status, 201, JSON.stringify(review.body));

  const published = await dispatchHttp(context.app, { url: LISTING_PATH });
  const publishedUrls = published.body.body.media.gallery.map((item) => item.url);
  assert.ok(publishedUrls.includes(replacement.asset_url));
  assert.ok(!publishedUrls.includes(replaced.asset_url));

  const editor = await dispatchHttp(context.app, { url: `/admin/listings/edit?listingId=${LISTING_ID}`, headers: ADMIN });
  assert.match(editor.body, new RegExp(`data-media-replacement="${replacement.asset_id}"`));
  assert.match(editor.body, /name="replacesAssetId"/);
});

test("durable-only admin media uploads persist to Payload, never touch the JSONL ledger, and publish through review", async () => {
  const runtime = durablePayloadRuntime();
  const context = workspace({
    runtimeDataDurableOnly: true,
    payloadListingRuntime: runtime.payload,
    payloadListingEnv: DURABLE_ENV,
  });
  const previousCredentials = process.env.MS_REALTY_ADMIN_CREDENTIALS_JSON;
  process.env.MS_REALTY_ADMIN_CREDENTIALS_JSON = JSON.stringify([
    { id: "durable_media_owner", token: "durable-media-owner-token-0123456789abcdef", roles: ["admin"] },
  ]);
  const durableAdmin = {
    authorization: "Bearer durable-media-owner-token-0123456789abcdef",
    accept: "application/json",
  };
  try {
    const photo = await photoJpegWithGpsExif({ width: 800, height: 600 });
    const created = await post(context.app, "/api/admin/media/uploads", adminUpload([{ name: "kitchen.jpg", bytes: photo }]), durableAdmin);
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.kind, "media_upload_accepted");
    assert.equal(created.body.uploaded[0].review_status, "needs_media_review");
    assert.equal(created.body.uploaded[0].asset_url, null);
    assert.equal(created.body.uploaded[0].media_storage_state, "staged_private");
    assert.equal(readMediaUploads(context.mediaUploadLedgerPath).length, 0, "durable media must not fall back to JSONL");

    const createdRows = runtime.currentRows();
    const createdDoc = createdRows.media_assets.find((row) => row.upload_id === created.body.uploaded[0].id);
    assert.ok(createdDoc, "the upload must exist in Payload media_assets");
    assert.equal(createdDoc.subject_id, LISTING_ID);
    assert.equal(createdDoc.is_public, false);
    assert.equal(createdDoc.review_decision, null);
    assert.ok(
      createdRows.listings.find((row) => row.id === LISTING_ID).media.map((value) => String(value)).includes(String(createdDoc.id)),
    );

    const preview = await dispatchHttp(context.app, {
      url: `/api/admin/media/uploads/${created.body.uploaded[0].asset_id}`,
      headers: durableAdmin,
    });
    assert.equal(preview.status, 200);
    assert.equal(preview.headers["cache-control"], "no-store");

    const review = await dispatchHttp(context.app, {
      method: "POST",
      url: "/api/admin/media/reviews",
      headers: durableAdmin,
      body: {
        listingId: LISTING_ID,
        assetId: created.body.uploaded[0].asset_id,
        decision: "publish",
        kind: "photo",
        alt: "Kitchen photographed during the broker visit",
        reviewer: "durable_media_owner",
        reviewConfirmed: true,
      },
    });
    assert.equal(review.status, 201, JSON.stringify(review.body));
    assert.equal(review.body.is_public, true);
    assert.match(review.body.public_url, /^https:\/\/ms-realty\.ms-realty-bg\.workers\.dev\/wp-content\/uploads\/\d{4}\/\d{2}\/listings\//);

    const reviewedRows = runtime.currentRows();
    const reviewedDoc = reviewedRows.media_assets.find((row) => row.upload_id === created.body.uploaded[0].id);
    assert.equal(reviewedDoc.review_decision, "publish");
    assert.equal(reviewedDoc.human_confirmed, true);
    assert.equal(reviewedDoc.is_public, true);
    assert.equal(reviewedDoc.review_history.length, 1);
    assert.equal(reviewedDoc.asset_url, review.body.public_url);

    const published = await dispatchHttp(context.app, { url: LISTING_PATH });
    assert.equal(published.status, 200);
    const publishedAsset = published.body.body.media.gallery.find((item) => item.url === review.body.public_url);
    assert.ok(publishedAsset, "the reviewed durable upload must reach the public listing payload");
    assert.equal(publishedAsset.alt, "Kitchen photographed during the broker visit");
  } finally {
    if (previousCredentials === undefined) delete process.env.MS_REALTY_ADMIN_CREDENTIALS_JSON;
    else process.env.MS_REALTY_ADMIN_CREDENTIALS_JSON = previousCredentials;
  }
});

/* ---------------------------------------------------------- admin refusals */

test("the admin upload route refuses the wrong bytes, the wrong size, and metadata it cannot strip", async () => {
  const context = workspace({
    mediaUploadLimits: { maxFileBytes: 2048, maxRequestBytes: 8192, maxFiles: 2, maxEnquiryPhotos: 4 },
  });

  const renamedText = await post(
    context.app,
    "/api/admin/media/uploads",
    adminUpload([{ name: "photo.jpg", bytes: textFileNamedJpg(), type: "image/jpeg" }]),
    ADMIN,
  );
  assert.equal(renamedText.status, 415);
  assert.equal(renamedText.body.kind, "unsupported_image_type");
  assert.match(renamedText.body.message, /read from the bytes/);
  assert.equal(renamedText.body.rejected[0].filename, "photo.jpg");

  const oversized = await post(
    context.app,
    "/api/admin/media/uploads",
    adminUpload([{ name: "big.jpg", bytes: Buffer.concat([tinyJpeg(), Buffer.alloc(4096)]) }]),
    ADMIN,
  );
  assert.equal(oversized.status, 413);
  assert.equal(oversized.body.kind, "file_too_large");

  const geotaggedAvif = await post(
    context.app,
    "/api/admin/media/uploads",
    adminUpload([{ name: "geo.avif", bytes: avifWithExif(), type: "image/avif" }]),
    ADMIN,
  );
  assert.equal(geotaggedAvif.status, 415);
  assert.equal(geotaggedAvif.body.kind, "image_metadata_refused");

  const tooMany = await post(
    context.app,
    "/api/admin/media/uploads",
    adminUpload([
      { name: "a.jpg", bytes: tinyJpeg() },
      { name: "b.png", bytes: tinyPng(), type: "image/png" },
      { name: "c.jpg", bytes: jpegWithGpsExif() },
    ]),
    ADMIN,
  );
  assert.equal(tooMany.status, 413);
  assert.equal(tooMany.body.kind, "too_many_files");

  const unknownListing = await post(
    context.app,
    "/api/admin/media/uploads",
    adminUpload([{ name: "a.jpg", bytes: tinyJpeg() }], { listingId: "MS-NOT-REAL" }),
    ADMIN,
  );
  assert.equal(unknownListing.status, 404);
  assert.equal(unknownListing.body.kind, "unknown_listing");

  assert.equal(readMediaUploads(context.mediaUploadLedgerPath).length, 0, "nothing refused may be stored");
  assert.equal(fs.existsSync(context.uploadRoot), false, "no bytes may be written for a refused upload");
});

test("one bad file in a batch is reported per file without losing the good ones", async () => {
  const context = workspace();
  const mixed = await post(
    context.app,
    "/api/admin/media/uploads",
    adminUpload([
      { name: "good.jpg", bytes: jpegWithGpsExif() },
      { name: "not-an-image.jpg", bytes: textFileNamedJpg() },
    ]),
    ADMIN,
  );
  assert.equal(mixed.status, 201);
  assert.equal(mixed.body.uploaded.length, 1);
  assert.equal(mixed.body.uploaded[0].index, 0);
  assert.equal(mixed.body.rejected.length, 1);
  assert.equal(mixed.body.rejected[0].index, 1);
  assert.equal(mixed.body.rejected[0].filename, "not-an-image.jpg");
  assert.equal(mixed.body.rejected[0].kind, "unsupported_image_type");
});

/* -------------------------------------------------------------- admin auth */

test("the upload route needs an authenticated operator with content:write", async () => {
  const context = workspace();
  const payload = adminUpload([{ name: "a.jpg", bytes: tinyJpeg() }]);

  const anonymous = await post(context.app, "/api/admin/media/uploads", payload, { accept: "application/json" });
  assert.equal(anonymous.status, 401);
  assert.equal(anonymous.headers["www-authenticate"], 'Bearer realm="ms-realty-admin"');

  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    MS_REALTY_ADMIN_TOKEN: process.env.MS_REALTY_ADMIN_TOKEN,
    MS_REALTY_ADMIN_CREDENTIALS_JSON: process.env.MS_REALTY_ADMIN_CREDENTIALS_JSON,
  };
  try {
    process.env.NODE_ENV = "production";
    delete process.env.MS_REALTY_ADMIN_TOKEN;
    process.env.MS_REALTY_ADMIN_CREDENTIALS_JSON = JSON.stringify([
      { id: "editor_operator", token: "role-editor-token-0123456789abcdef", roles: ["editor"] },
      { id: "translator_operator", token: "role-translator-token-0123456789abcdef", roles: ["translator"] },
    ]);
    const roleContext = workspace();
    const editor = { authorization: "Bearer role-editor-token-0123456789abcdef", accept: "application/json" };
    const translator = { authorization: "Bearer role-translator-token-0123456789abcdef", accept: "application/json" };

    const refused = await post(roleContext.app, "/api/admin/media/uploads", payload, translator);
    assert.equal(refused.status, 403);
    assert.equal(refused.body.required_capability, "content:write");

    const allowed = await post(roleContext.app, "/api/admin/media/uploads", payload, editor);
    assert.equal(allowed.status, 201);
    assert.equal(allowed.body.uploaded[0].uploaded_by, "editor_operator");

    // A translator may still look at what is waiting for review.
    const listed = await dispatchHttp(roleContext.app, { url: `/api/admin/media/uploads?listing=${LISTING_ID}`, headers: translator });
    assert.equal(listed.status, 200);
    assert.equal(listed.body.uploads.length, 1);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

/* ------------------------------------------------------- admin read paths */

test("an operator can list uploads and preview the stored bytes privately", async () => {
  const context = workspace();
  const created = await post(context.app, "/api/admin/media/uploads", adminUpload([{ name: "kitchen.jpg", bytes: jpegWithGpsExif() }]), ADMIN);
  const asset = created.body.uploaded[0];

  const listed = await dispatchHttp(context.app, { url: `/api/admin/media/uploads?listing=${LISTING_ID}`, headers: ADMIN });
  assert.equal(listed.status, 200);
  assert.equal(listed.body.subject_type, "listing");
  assert.equal(listed.body.public, false);
  assert.equal(listed.body.uploads[0].asset_id, asset.asset_id);
  assert.equal(listed.body.uploads[0].preview_path, `/api/admin/media/uploads/${asset.asset_id}`);
  assert.equal(listed.body.uploads[0].storage_key, undefined, "storage keys stay server-side");

  const missingFilter = await dispatchHttp(context.app, { url: "/api/admin/media/uploads", headers: ADMIN });
  assert.equal(missingFilter.status, 400);

  const preview = await dispatchHttp(context.app, { url: `/api/admin/media/uploads/${asset.asset_id}`, headers: ADMIN });
  assert.equal(preview.status, 200);
  assert.equal(preview.headers["content-type"], "image/jpeg");
  assert.equal(preview.headers["cache-control"], "no-store");
  const storedRow = readMediaUploads(context.mediaUploadLedgerPath)[0];
  assert.deepEqual(
    preview.body,
    fs.readFileSync(path.join(context.uploadRoot, storedRow.storage_key)),
    "the preview serves exactly the bytes that were stored",
  );

  // An unknown rendition name is not an error: a stale link keeps working by
  // falling back to the photo itself.
  const bogus = await dispatchHttp(context.app, {
    url: `/api/admin/media/uploads/${asset.asset_id}?rendition=nonsense`,
    headers: ADMIN,
  });
  assert.equal(bogus.status, 200);
  assert.deepEqual(bogus.body, preview.body);

  const unknown = await dispatchHttp(context.app, { url: "/api/admin/media/uploads/media-0000000000000000000", headers: ADMIN });
  assert.equal(unknown.status, 404);

  const anonymous = await dispatchHttp(context.app, { url: `/api/admin/media/uploads/${asset.asset_id}` });
  assert.equal(anonymous.status, 401);
});

test("a large upload is optimised, stored with a thumbnail, and the thumbnail is served on request", async () => {
  const context = workspace();
  // 3200px on the long edge and held sideways, which is what a phone produces.
  const photo = await orientedPhotoJpeg({ width: 3200, height: 1600, orientation: 6 });
  const created = await post(context.app, "/api/admin/media/uploads", adminUpload([{ name: "hall.jpg", bytes: photo }]), ADMIN);
  assert.equal(created.status, 201);
  const asset = created.body.uploaded[0];

  const row = readMediaUploads(context.mediaUploadLedgerPath)[0];

  // Optimised: fitted to the long edge, turned upright, and much smaller.
  assert.equal(row.optimized, true);
  assert.equal(row.resized, true);
  assert.equal(row.orientation_applied, true);
  assert.equal(row.width, 1280, "orientation 6 makes the 3200x1600 source a 1600x3200 portrait");
  assert.equal(row.height, 2560);
  assert.equal(row.bytes_before, photo.length);
  assert.equal(row.bytes_after, row.bytes);
  assert.ok(row.bytes_after < row.bytes_before / 2, "a phone photo must not be stored at full weight");

  // The ledger row names the rendition, and the bytes are on disk beside the
  // photo, in the same prefix.
  assert.ok(row.rendition, "a large photo must carry a thumbnail");
  assert.equal(row.rendition.kind, "thumb");
  assert.equal(row.rendition.content_type, "image/webp");
  assert.equal(row.rendition.height, 640);
  assert.match(row.rendition.storage_key, /^ms-realty\.ms-realty-bg\.workers\.dev\/wp-content\/uploads\/\d{4}\/\d{2}\/ms-[a-f0-9]{32}-thumb\.webp$/);
  const thumbPath = path.join(context.uploadRoot, row.rendition.storage_key);
  assert.ok(fs.existsSync(thumbPath), "the rendition bytes must be stored");
  assert.equal(sniffImageFormat(fs.readFileSync(thumbPath)).format, "webp");
  assert.ok(fs.readFileSync(thumbPath).length < row.bytes / 5, "a thumbnail worth serving is far smaller");

  // The API tells an admin surface where to fetch it.
  assert.equal(asset.thumbnail_path, `/api/admin/media/uploads/${asset.asset_id}?rendition=thumb`);
  assert.equal(asset.width, 1280);
  assert.equal(asset.height, 2560);

  const thumb = await dispatchHttp(context.app, { url: asset.thumbnail_path, headers: ADMIN });
  assert.equal(thumb.status, 200);
  assert.equal(thumb.headers["content-type"], "image/webp");
  assert.equal(thumb.headers["cache-control"], "no-store", "a rendition of unreviewed media is just as private");
  assert.deepEqual(thumb.body, fs.readFileSync(thumbPath));

  // And it is admin-only for exactly the same reason the photo is.
  const anonymous = await dispatchHttp(context.app, { url: asset.thumbnail_path });
  assert.equal(anonymous.status, 401);
});

test("a seller's thumbnail stays outside the edge-served prefix", async () => {
  const context = workspace();
  const photo = await orientedPhotoJpeg({ width: 2000, height: 1500, orientation: 1 });
  const body = multipartBody([
    { name: "enquiryId", value: ENQUIRY_ID },
    { name: "photo", filename: "front.jpg", contentType: "image/jpeg", value: photo },
  ]);
  const response = await post(context.app, "/api/seller-photos", body, SAME_ORIGIN);
  assert.equal(response.status, 201);

  const row = readMediaUploads(context.mediaUploadLedgerPath)[0];
  assert.ok(row.rendition, "a seller photo is optimised exactly like an admin one");
  // The privacy contract is structural: the rendition inherits the private
  // prefix from the photo it was derived from, so there is no path by which a
  // thumbnail of someone's home becomes reachable from the edge.
  assert.match(row.rendition.storage_key, /^ms-realty\.ms-realty-bg\.workers\.dev\/wp-content\/private\/enquiries\//);
  assert.equal(row.rendition.storage_key.includes("/wp-content/uploads/"), false);
  assert.equal(row.asset_url, null);
  assert.ok(fs.existsSync(path.join(context.uploadRoot, row.rendition.storage_key)));
});

test("a browser form post without JavaScript is answered with a redirect back to the media panel", async () => {
  const context = workspace();
  const payload = adminUpload([{ name: "kitchen.jpg", bytes: jpegWithGpsExif() }]);
  const response = await post(context.app, "/api/admin/media/uploads", payload, {
    authorization: "Bearer local-admin-smoke",
    accept: "text/html,application/xhtml+xml",
  });
  assert.equal(response.status, 303);
  assert.equal(response.headers.location, `/admin/listings/edit?listingId=${LISTING_ID}&media_upload=1#listing-media`);
  assert.equal(readMediaUploads(context.mediaUploadLedgerPath).length, 1);
});

/* ------------------------------------------------------ public seller route */

test("a seller photo reaches the enquiry, stays private, and says so", async () => {
  const context = workspace();
  const response = await post(
    context.app,
    "/api/seller-photos",
    multipartBody([
      { name: "enquiryId", value: ENQUIRY_ID },
      { name: "photo", filename: "front.jpg", contentType: "image/jpeg", value: jpegWithGpsExif() },
    ]),
    SAME_ORIGIN,
  );
  assert.equal(response.status, 201);
  assert.equal(response.body.kind, "seller_photos_received");
  assert.equal(response.body.enquiry_id, ENQUIRY_ID);
  assert.equal(response.body.public, false);
  assert.equal(response.body.searchable, false);
  assert.equal(response.body.published, false);
  assert.equal(response.body.review_required, true);
  assert.match(response.body.message, /never published automatically and never appear in search/);
  assert.equal(response.headers["cache-control"], "no-store");
  assert.equal(response.body.received[0].is_public, false);
  assert.equal(response.body.received[0].metadata_stripped, true);

  const row = readMediaUploads(context.mediaUploadLedgerPath)[0];
  assert.equal(row.subject_type, "enquiry");
  assert.equal(row.subject_id, ENQUIRY_ID);
  assert.equal(row.asset_url, null, "a public submission never gets a public URL");
  assert.match(row.storage_key, /^ms-realty\.ms-realty-bg\.workers\.dev\/wp-content\/private\/enquiries\//);
  assert.equal(row.storage_key.includes("/wp-content/uploads/"), false, "must sit outside the edge-served prefix");
  const sellerBytes = fs.readFileSync(path.join(context.uploadRoot, row.storage_key));
  assert.equal(sniffImageFormat(sellerBytes).format, "jpeg");
  assert.equal(sellerBytes.length, row.bytes);
  assert.equal(sellerBytes.includes(EXIF_HEADER), false);

  const audit = readAuditLog(context.auditLogPath).filter((entry) => entry.action === "media_uploaded");
  assert.equal(audit.length, 1);
  assert.equal(audit[0].actor, "public_seller_intake");
  assert.equal(audit[0].metadata.enquiry_id, ENQUIRY_ID);

  // It exists nowhere in the public site payloads.
  const listing = await dispatchHttp(context.app, { url: LISTING_PATH });
  assert.equal(JSON.stringify(listing.body).includes(row.asset_id), false);
  const search = await dispatchHttp(context.app, { url: "/en/search?q=Sandanski" });
  assert.equal(JSON.stringify(search.body).includes(row.asset_id), false);

  // The broker sees it on the enquiry.
  const enquiry = await dispatchHttp(context.app, { url: `/api/admin/media/uploads?enquiry=${ENQUIRY_ID}`, headers: ADMIN });
  assert.equal(enquiry.status, 200);
  assert.equal(enquiry.body.uploads.length, 1);
  assert.equal(enquiry.body.uploads[0].source, "public_seller_intake");
  assert.equal(enquiry.body.uploads[0].asset_url, null);
});

test("the seller route refuses an unknown enquiry, a cross-origin post, and too many photos", async () => {
  const context = workspace({
    mediaUploadLimits: { maxFileBytes: 1024 * 1024, maxRequestBytes: 4 * 1024 * 1024, maxFiles: 4, maxEnquiryPhotos: 1 },
  });

  const unknown = await post(
    context.app,
    "/api/seller-photos",
    multipartBody([
      { name: "enquiryId", value: "lead-draft-does-not-exist" },
      { name: "photo", filename: "a.jpg", contentType: "image/jpeg", value: tinyJpeg() },
    ]),
    SAME_ORIGIN,
  );
  assert.equal(unknown.status, 404);
  assert.equal(unknown.body.kind, "unknown_enquiry");

  const crossOrigin = await post(
    context.app,
    "/api/seller-photos",
    multipartBody([
      { name: "enquiryId", value: ENQUIRY_ID },
      { name: "photo", filename: "a.jpg", contentType: "image/jpeg", value: tinyJpeg() },
    ]),
    { host: "localhost", origin: "https://evil.test", "sec-fetch-site": "cross-site", accept: "application/json" },
  );
  assert.equal(crossOrigin.status, 403);
  assert.equal(crossOrigin.body.kind, "cross_origin_write_blocked");

  const first = await post(
    context.app,
    "/api/seller-photos",
    multipartBody([
      { name: "enquiryId", value: ENQUIRY_ID },
      { name: "photo", filename: "a.jpg", contentType: "image/jpeg", value: tinyJpeg() },
    ]),
    SAME_ORIGIN,
  );
  assert.equal(first.status, 201);

  const overCap = await post(
    context.app,
    "/api/seller-photos",
    multipartBody([
      { name: "enquiryId", value: ENQUIRY_ID },
      { name: "photo", filename: "b.png", contentType: "image/png", value: tinyPng() },
    ]),
    SAME_ORIGIN,
  );
  assert.equal(overCap.status, 413);
  assert.equal(overCap.body.kind, "enquiry_photo_limit");
});

test("the seller route is rate limited like the other public writes", async () => {
  const context = workspace({ rateLimit: { windowMs: 60_000, max: 2 } });
  const payload = () =>
    multipartBody([
      { name: "enquiryId", value: ENQUIRY_ID },
      { name: "photo", filename: "a.jpg", contentType: "image/jpeg", value: tinyJpeg() },
    ]);
  const headers = { ...SAME_ORIGIN };
  assert.equal((await dispatchHttp(context.app, { method: "POST", url: "/api/seller-photos", headers: { ...headers, "content-type": payload().contentType }, body: payload().body, remoteAddress: "203.0.113.9" })).status, 201);
  assert.equal((await dispatchHttp(context.app, { method: "POST", url: "/api/seller-photos", headers: { ...headers, "content-type": payload().contentType }, body: payload().body, remoteAddress: "203.0.113.9" })).status, 200);
  const limited = await dispatchHttp(context.app, {
    method: "POST",
    url: "/api/seller-photos",
    headers: { ...headers, "content-type": payload().contentType },
    body: payload().body,
    remoteAddress: "203.0.113.9",
  });
  assert.equal(limited.status, 429);
  assert.equal(limited.body.kind, "rate_limited");
  assert.ok(Number(limited.headers["retry-after"]) >= 1);
});

test("the seller route degrades honestly when it is switched off or has no enquiry store", async () => {
  const disabled = workspace({ sellerPhotoUploadEnabled: false });
  const off = await post(
    disabled.app,
    "/api/seller-photos",
    multipartBody([
      { name: "enquiryId", value: ENQUIRY_ID },
      { name: "photo", filename: "a.jpg", contentType: "image/jpeg", value: tinyJpeg() },
    ]),
    SAME_ORIGIN,
  );
  assert.equal(off.status, 503);
  assert.equal(off.body.kind, "seller_photo_upload_unavailable");

  const noStore = workspace({ sellerPipelinePath: null });
  const unavailable = await post(
    noStore.app,
    "/api/seller-photos",
    multipartBody([
      { name: "enquiryId", value: ENQUIRY_ID },
      { name: "photo", filename: "a.jpg", contentType: "image/jpeg", value: tinyJpeg() },
    ]),
    SAME_ORIGIN,
  );
  assert.equal(unavailable.status, 503);
});

test("a seller form post without JavaScript is answered with a redirect back to the photos block", async () => {
  const context = workspace();
  const response = await post(
    context.app,
    "/api/seller-photos?return=%2Fen%2Fsell",
    multipartBody([
      { name: "enquiryId", value: ENQUIRY_ID },
      { name: "photo", filename: "front.jpg", contentType: "image/jpeg", value: tinyJpeg() },
    ]),
    { ...SAME_ORIGIN, accept: "text/html,application/xhtml+xml" },
  );
  assert.equal(response.status, 303);
  assert.equal(response.headers.location, "/en/sell?photos=ok#seller-photos");

  // An off-site return path is never honoured.
  const openRedirect = await post(
    context.app,
    "/api/seller-photos?return=https%3A%2F%2Fevil.test%2F",
    multipartBody([
      { name: "enquiryId", value: ENQUIRY_ID },
      { name: "photo", filename: "front.png", contentType: "image/png", value: tinyPng() },
    ]),
    { ...SAME_ORIGIN, accept: "text/html,application/xhtml+xml" },
  );
  assert.equal(openRedirect.status, 201);
  assert.equal(openRedirect.headers.location, undefined);
});
