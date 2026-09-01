import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { appAdminConfigFromEnv, renderAppAdminResponse } from "../lib/app-admin-adapter.mjs";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";
import {
  MediaPersistenceError,
  listMediaUploadsDurably,
  persistMediaReviewDurably,
  persistMediaUploadDurably,
  readMediaUploadBytesDurably,
} from "../lib/media-durable-store.mjs";
import { createMediaReview } from "../lib/media-reviews.mjs";
import { projectListingDraftSeed } from "../lib/listing-draft-service.mjs";
import { handleAdminMediaUpload } from "../lib/media-upload-routes.mjs";
import { readMediaUploads } from "../lib/media-uploads.mjs";
import { fromRoot } from "../lib/paths.mjs";
import { loadCmsSeed } from "../lib/runtime.mjs";
import { createPayloadDraftRuntime } from "./payload-draft-runtime.fixture.mjs";
import { photoJpegWithGpsExif } from "./image-upload.fixture.mjs";

const LISTING_ID = "MS-CRAWL-0001";
const MEDIA_HOST = "ms-realty.ms-realty-bg.workers.dev";
const LIVE_ENV = {
  NODE_ENV: "production",
  MS_REALTY_RUNTIME_DATA_AUTHORITY: "payload",
};
const EDITOR = Object.freeze({ id: "media_editor", roles: ["editor"], source: "test", can_mutate: true });

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function focusedSeed() {
  const full = loadCmsSeed();
  const record = clone(full.records.find((row) => row.collection === "listings" && row.id === LISTING_ID));
  const property = clone(full.properties.find((row) => row.id === record.property));
  const location = clone(full.locations.find((row) => row.id === record.location));
  return {
    ...full,
    records: [record],
    properties: property ? [property] : [],
    locations: location ? [location] : [],
    enrichment_tasks: [],
    summary: {
      ...full.summary,
      listings: 1,
      properties: property ? 1 : 0,
      locations: location ? 1 : 0,
      mediaAssets: record.media.length,
    },
  };
}

function runtimeHarness(seed = focusedSeed(), hooks = {}) {
  const harness = createPayloadDraftRuntime(seed, hooks);
  const create = harness.payload.create;
  let nextMediaId = 90000;
  harness.payload.create = async (options) => {
    const data = clone(options.data || {});
    if (options.collection === "media_assets" && !data.id) data.id = `media-test-${nextMediaId++}`;
    return create({ ...options, data });
  };
  return harness;
}

function storageHarness({ deleteSupported = true, failDeleteTimes = 0 } = {}) {
  const objects = new Map();
  const deleted = [];
  let remainingDeleteFailures = failDeleteTimes;
  const storage = {
    driver: "local",
    async put({ key, bytes }) {
      const value = Buffer.from(bytes);
      objects.set(key, value);
      return { key, driver: "local", bytes: value.length, stored: true };
    },
    async read(key) {
      if (!objects.has(key)) {
        const error = new Error("Stored upload is missing");
        error.code = "not_found";
        throw error;
      }
      return Buffer.from(objects.get(key));
    },
  };
  if (deleteSupported) {
    storage.delete = async (key) => {
      if (remainingDeleteFailures > 0) {
        remainingDeleteFailures -= 1;
        throw new Error("temporary storage delete failure");
      }
      deleted.push(key);
      objects.delete(key);
      return { key, driver: "local", deleted: true };
    };
  }
  return { storage, objects, deleted };
}

function uploadRecord(label, { replacesAssetId = null, subjectId = LISTING_ID, visibility = "staged_private", withRendition = false } = {}) {
  const contentHash = crypto.createHash("sha256").update(label).digest("hex");
  const objectName = `ms-${contentHash.slice(0, 32)}.jpg`;
  const sourceAssetId = `media-${crypto.createHash("sha256").update(replacesAssetId ? `${contentHash}:${replacesAssetId}` : contentHash).digest("hex").slice(0, 20)}`;
  const storageKey = visibility === "staged_private"
    ? `${MEDIA_HOST}/wp-content/private/listings/${subjectId}/${sourceAssetId}/${objectName}`
    : visibility === "scoped_public"
      ? `${MEDIA_HOST}/wp-content/uploads/2026/09/listings/${subjectId}/${sourceAssetId}/${objectName}`
      : `${MEDIA_HOST}/wp-content/uploads/2026/09/${objectName}`;
  const renditionKey = storageKey.replace(/\.jpg$/, "-thumb.webp");
  return {
    id: `media-upload-${label}`,
    asset_id: sourceAssetId,
    subject_type: "listing",
    subject_id: subjectId,
    kind: "photo",
    format: "jpeg",
    content_type: "image/jpeg",
    bytes: 128,
    submitted_bytes: 160,
    bytes_before: 160,
    bytes_after: 128,
    width: 800,
    height: 600,
    optimized: true,
    orientation_applied: false,
    resized: false,
    metadata_stripped: true,
    metadata_removed_bytes: 32,
    uploaded_at: "2026-09-01T10:00:00.000Z",
    uploaded_by: EDITOR.id,
    source: "admin_listing_editor",
    storage_driver: "local",
    storage_key: storageKey,
    asset_url: visibility === "staged_private" ? null : `https://${storageKey}`,
    content_hash: contentHash,
    rendition: withRendition
      ? {
          kind: "thumb",
          storage_key: renditionKey,
          content_type: "image/webp",
          format: "webp",
          bytes: 64,
          width: 320,
          height: 240,
        }
      : null,
    replaces_asset_id: replacesAssetId,
  };
}

function listingFor(seed, id = LISTING_ID) {
  return seed.records.find((row) => row.collection === "listings" && row.id === id);
}

async function reload(seed, harness) {
  return projectListingDraftSeed(seed, {
    payload: harness.payload,
    env: {},
    requirePayload: true,
  });
}

function rawMedia(harness, assetId) {
  return harness.currentRows().media_assets.find((row) => row.asset_id === assetId);
}

test("durable media schema and migration retain identity, storage, lineage, and review audit fields", () => {
  const manifest = JSON.parse(fs.readFileSync(fromRoot("production", "data", "cms-collections.json"), "utf8"));
  const media = manifest.collections.find((collection) => collection.slug === "media_assets");
  const fields = new Map(media.fields.map((field) => [field.name, field]));
  for (const field of [
    "asset_id",
    "upload_id",
    "storage_driver",
    "storage_key",
    "rendition",
    "content_hash",
    "subject_id",
    "uploaded_by",
    "replaces_asset_id",
    "replacement_asset_id",
    "reviewer",
    "reviewed_at",
    "review_decision",
    "human_confirmed",
    "review_history",
  ]) {
    assert.ok(fields.has(field), `media_assets.${field} must be in the CMS contract`);
  }
  assert.equal(fields.get("asset_id").unique, true);
  assert.equal(fields.get("upload_id").unique, true);
  assert.equal(fields.get("storage_key").admin.hidden, true);
  assert.equal(fields.get("review_history").admin.hidden, true);

  const payload = JSON.parse(fs.readFileSync(fromRoot("production", "data", "payload-collections.json"), "utf8"));
  const payloadMedia = payload.collections.find((collection) => collection.slug === "media_assets");
  assert.equal(payloadMedia.fields.find((field) => field.name === "storage_key").admin.hidden, true);
  assert.equal(payloadMedia.fields.find((field) => field.name === "review_history").admin.hidden, true);

  const migration = fs.readFileSync(fromRoot("migrations", "20260901_120000_durable_media_lifecycle.ts"), "utf8");
  for (const field of [
    "asset_id",
    "upload_id",
    "storage_key",
    "rendition",
    "replaces_asset_id",
    "replacement_asset_id",
    "reviewer",
    "reviewed_at",
    "review_decision",
    "human_confirmed",
    "review_history",
  ]) {
    assert.match(migration, new RegExp(`ADD COLUMN IF NOT EXISTS "${field}"`));
  }
  assert.match(migration, /media_assets_asset_id_idx/);
  assert.match(migration, /media_assets_upload_id_idx/);
  assert.match(fs.readFileSync(fromRoot("migrations", "index.ts"), "utf8"), /20260901_120000_durable_media_lifecycle/);
});

test("durable listing uploads commit Payload metadata, attach atomically, and read back privately", async () => {
  const seed = focusedSeed();
  const harness = runtimeHarness(seed);
  const { storage, objects } = storageHarness();
  const record = uploadRecord("durable-source");
  objects.set(record.storage_key, Buffer.from("durable-media-bytes"));

  const first = await persistMediaUploadDurably(record, { payload: harness.payload, principal: EDITOR, storage });
  const retry = await persistMediaUploadDurably(
    { ...record, id: "media-upload-durable-source-retry" },
    { payload: harness.payload, principal: EDITOR, storage },
  );

  assert.equal(first.durable, true);
  assert.equal(first.idempotent, false);
  assert.equal(retry.idempotent, true);
  assert.equal(harness.currentRows().media_assets.length, seed.summary.mediaAssets + 1);
  const persisted = rawMedia(harness, first.asset_id);
  assert.ok(persisted);
  assert.equal(persisted.review_status, "review_required");
  assert.equal(persisted.is_public, false);
  assert.equal(persisted.storage_key, record.storage_key);
  assert.equal(persisted.asset_url, null);
  assert.equal(
    harness.currentRows().listings.find((row) => row.id === LISTING_ID).media.some((id) => String(id) === String(persisted.id)),
    true,
  );

  const listed = await listMediaUploadsDurably({ payload: harness.payload, listing: LISTING_ID });
  const exposed = listed.body.uploads.find((row) => row.asset_id === first.asset_id);
  assert.ok(exposed);
  assert.equal(exposed.is_public, false);
  assert.equal(exposed.review_status, "needs_media_review");
  assert.equal(exposed.asset_url, null);
  assert.equal(exposed.media_storage_state, "staged_private");
  assert.equal(Object.hasOwn(exposed, "storage_key"), false);
  assert.equal(Object.hasOwn(exposed, "rendition"), false);

  const preview = await readMediaUploadBytesDurably({
    payload: harness.payload,
    assetId: first.asset_id,
    storage,
  });
  assert.equal(preview.status, 200);
  assert.deepEqual(preview.body, Buffer.from("durable-media-bytes"));
  assert.equal(preview.headers["cache-control"], undefined);

  const projected = await reload(seed, harness);
  const projectedAsset = listingFor(projected).media.find((row) => row.asset_id === first.asset_id);
  assert.ok(projectedAsset);
  assert.equal(projectedAsset.is_public, false);
  assert.equal(projectedAsset.review_status, "review_required");
  assert.equal(Object.hasOwn(projectedAsset, "storage_key"), false);
});

test("durable media review promotes private bytes and rendition, persists publication, and is idempotent", async () => {
  const seed = focusedSeed();
  const harness = runtimeHarness(seed);
  const { storage, objects } = storageHarness();
  const record = uploadRecord("review-source", { withRendition: true });
  objects.set(record.storage_key, Buffer.from("review-media-bytes"));
  objects.set(record.rendition.storage_key, Buffer.from("review-thumb"));
  const upload = await persistMediaUploadDurably(record, { payload: harness.payload, principal: EDITOR, storage });
  const projected = await reload(seed, harness);

  const base = {
    listingId: LISTING_ID,
    assetId: upload.asset_id,
    decision: "publish",
    kind: "photo",
    reviewer: EDITOR.id,
  };
  assert.throws(() => createMediaReview(projected, { ...base, alt: "Reviewed room" }), /explicit human confirmation/);
  assert.throws(() => createMediaReview(projected, { ...base, alt: "", reviewConfirmed: true }), /requires reviewed alt text/);

  const review = createMediaReview(
    projected,
    { ...base, alt: "Reviewed room", reviewConfirmed: true },
    "2026-09-01T10:05:00.000Z",
    { allowStaged: true },
  );
  const saved = await persistMediaReviewDurably(review, { payload: harness.payload, principal: EDITOR, storage });
  const retry = await persistMediaReviewDurably(review, { payload: harness.payload, principal: EDITOR, storage });
  const persisted = rawMedia(harness, upload.asset_id);
  assert.equal(saved.idempotent, false);
  assert.equal(retry.idempotent, true);
  assert.equal(persisted.is_public, true);
  assert.equal(persisted.review_status, "approved_imported_photo");
  assert.equal(persisted.review_decision, "publish");
  assert.equal(persisted.human_confirmed, true);
  assert.equal(persisted.review_history.length, 1);
  assert.match(persisted.storage_key, /\/wp-content\/uploads\/2026\/09\/listings\/MS-CRAWL-0001\//);
  assert.equal(objects.has(record.storage_key), false);
  assert.equal(objects.has(record.rendition.storage_key), false);
  assert.deepEqual(objects.get(persisted.storage_key), Buffer.from("review-media-bytes"));
  assert.deepEqual(objects.get(persisted.rendition.storage_key), Buffer.from("review-thumb"));

  const reloaded = await reload(seed, harness);
  const approved = listingFor(reloaded).media.find((row) => row.asset_id === upload.asset_id);
  assert.equal(approved.is_public, true);
  assert.equal(approved.review_status, "approved_by_human");
  assert.equal(approved.alt, "Reviewed room");
  const listed = await listMediaUploadsDurably({ payload: harness.payload, listing: LISTING_ID });
  const exposed = listed.body.uploads.find((row) => row.asset_id === upload.asset_id);
  assert.equal(exposed.is_public, true);
  assert.equal(exposed.review_status, "approved_by_human");
  assert.equal(exposed.media_reviewer, EDITOR.id);
  assert.equal(Object.hasOwn(exposed, "storage_key"), false);
});

test("durable replacement keeps the source private and exposes the reviewed child", async () => {
  const seed = focusedSeed();
  const harness = runtimeHarness(seed);
  const mediaStorage = storageHarness();
  const source = uploadRecord("replacement-source");
  mediaStorage.objects.set(source.storage_key, Buffer.from("source"));
  const sourceUpload = await persistMediaUploadDurably(source, {
    payload: harness.payload,
    principal: EDITOR,
    storage: mediaStorage.storage,
  });
  const sourceProjected = await reload(seed, harness);
  const sourceReview = createMediaReview(
    sourceProjected,
    {
      listingId: LISTING_ID,
      assetId: sourceUpload.asset_id,
      decision: "publish",
      kind: "photo",
      alt: "Reviewed source room",
      reviewer: EDITOR.id,
      reviewConfirmed: true,
    },
    "2026-09-01T10:08:00.000Z",
    { allowStaged: true },
  );
  await persistMediaReviewDurably(sourceReview, { payload: harness.payload, principal: EDITOR, storage: mediaStorage.storage });
  const sourcePublicKey = rawMedia(harness, sourceUpload.asset_id).storage_key;

  const child = uploadRecord("replacement-child", { replacesAssetId: sourceUpload.asset_id });
  mediaStorage.objects.set(child.storage_key, Buffer.from("replacement"));
  const childUpload = await persistMediaUploadDurably(child, {
    payload: harness.payload,
    principal: EDITOR,
    storage: mediaStorage.storage,
  });

  const projected = await reload(seed, harness);
  const review = createMediaReview(
    projected,
    {
      listingId: LISTING_ID,
      assetId: childUpload.asset_id,
      decision: "publish",
      kind: "photo",
      alt: "Reviewed replacement room",
      reviewer: EDITOR.id,
      reviewConfirmed: true,
    },
    "2026-09-01T10:10:00.000Z",
    { allowStaged: true },
  );
  await persistMediaReviewDurably(review, { payload: harness.payload, principal: EDITOR, storage: mediaStorage.storage });

  const sourceDocument = rawMedia(harness, sourceUpload.asset_id);
  const childDocument = rawMedia(harness, childUpload.asset_id);
  assert.equal(sourceDocument.is_public, false);
  assert.equal(sourceDocument.review_status, "reviewed_private");
  assert.equal(sourceDocument.replacement_asset_id, childUpload.asset_id);
  assert.match(sourceDocument.storage_key, /\/wp-content\/private\/listings\/MS-CRAWL-0001\//);
  assert.equal(mediaStorage.objects.has(sourcePublicKey), false);
  assert.deepEqual(mediaStorage.objects.get(sourceDocument.storage_key), Buffer.from("source"));
  assert.equal(childDocument.is_public, true);
  assert.equal(childDocument.review_status, "approved_imported_photo");

  const reloaded = await reload(seed, harness);
  const media = listingFor(reloaded).media;
  const sourceView = media.find((row) => row.asset_id === sourceUpload.asset_id);
  const childView = media.find((row) => row.asset_id === childUpload.asset_id);
  assert.equal(sourceView.review_status, "replaced_by_human");
  assert.equal(sourceView.is_public, false);
  assert.equal(sourceView.replacement_asset_id, childUpload.asset_id);
  assert.equal(childView.review_status, "approved_by_human");
  assert.equal(childView.is_public, true);
  assert.equal(listingFor(reloaded).media_workflow.review_gated_assets, 0);
});

test("keep-private review physically demotes listing-scoped public bytes", async () => {
  const seed = focusedSeed();
  const harness = runtimeHarness(seed);
  const { storage, objects } = storageHarness();
  const record = uploadRecord("demotion-source");
  objects.set(record.storage_key, Buffer.from("demotion-bytes"));
  const upload = await persistMediaUploadDurably(record, { payload: harness.payload, principal: EDITOR, storage });

  const publish = createMediaReview(
    await reload(seed, harness),
    {
      listingId: LISTING_ID,
      assetId: upload.asset_id,
      decision: "publish",
      kind: "photo",
      alt: "Reviewed room",
      reviewer: EDITOR.id,
      reviewConfirmed: true,
    },
    "2026-09-01T10:12:00.000Z",
    { allowStaged: true },
  );
  await persistMediaReviewDurably(publish, { payload: harness.payload, principal: EDITOR, storage });
  const publicKey = rawMedia(harness, upload.asset_id).storage_key;
  assert.equal(objects.has(record.storage_key), false);
  assert.equal(objects.has(publicKey), true);

  const keepPrivate = createMediaReview(
    await reload(seed, harness),
    {
      listingId: LISTING_ID,
      assetId: upload.asset_id,
      decision: "keep_private",
      kind: "photo",
      alt: "Internal room photo",
      reviewer: EDITOR.id,
      reviewConfirmed: true,
    },
    "2026-09-01T10:13:00.000Z",
  );
  await persistMediaReviewDurably(keepPrivate, { payload: harness.payload, principal: EDITOR, storage });

  const privateDocument = rawMedia(harness, upload.asset_id);
  assert.equal(privateDocument.is_public, false);
  assert.equal(privateDocument.review_status, "reviewed_private");
  assert.equal(privateDocument.storage_key, record.storage_key);
  assert.equal(privateDocument.asset_url, null);
  assert.equal(privateDocument.source_url, null);
  assert.match(privateDocument.url, /^https:\/\/media\.invalid\/assets\//);
  assert.equal(objects.has(publicKey), false);
  assert.deepEqual(objects.get(record.storage_key), Buffer.from("demotion-bytes"));
  const projection = (await reload(seed, harness)).records.find((row) => row.id === LISTING_ID).media
    .find((row) => row.asset_id === upload.asset_id);
  assert.equal(projection.url, null);
  assert.equal(projection.asset_url, null);
  assert.equal(projection.media_storage_state, "staged_private");
});

test("retry reconciles staged bytes after a committed publish cleanup failure", async () => {
  const seed = focusedSeed();
  const harness = runtimeHarness(seed);
  const { storage, objects } = storageHarness({ failDeleteTimes: 1 });
  const record = uploadRecord("cleanup-retry");
  objects.set(record.storage_key, Buffer.from("retry-bytes"));
  const upload = await persistMediaUploadDurably(record, { payload: harness.payload, principal: EDITOR, storage });
  const review = createMediaReview(
    await reload(seed, harness),
    {
      listingId: LISTING_ID,
      assetId: upload.asset_id,
      decision: "publish",
      kind: "photo",
      alt: "Retry room",
      reviewer: EDITOR.id,
      reviewConfirmed: true,
    },
    "2026-09-01T10:14:00.000Z",
    { allowStaged: true },
  );

  await assert.rejects(
    persistMediaReviewDurably(review, { payload: harness.payload, principal: EDITOR, storage }),
    (error) => error instanceof MediaPersistenceError && error.orphanedStorage === true,
  );
  const committed = rawMedia(harness, upload.asset_id);
  assert.equal(committed.is_public, true);
  assert.equal(objects.has(committed.storage_key), true);
  assert.equal(objects.has(record.storage_key), true);

  const retry = await persistMediaReviewDurably(review, { payload: harness.payload, principal: EDITOR, storage });
  assert.equal(retry.idempotent, true);
  assert.equal(objects.has(committed.storage_key), true);
  assert.equal(objects.has(record.storage_key), false);
});

test("durable media mutations enforce operator roles and report orphan cleanup explicitly", async () => {
  const seed = focusedSeed();
  const unauthorizedHarness = runtimeHarness(seed);
  const unauthorizedStorage = storageHarness();
  const unauthorizedRecord = uploadRecord("unauthorized-media");
  unauthorizedStorage.objects.set(unauthorizedRecord.storage_key, Buffer.from("bytes"));
  await assert.rejects(
    persistMediaUploadDurably(unauthorizedRecord, {
      payload: unauthorizedHarness.payload,
      principal: { id: "translator", roles: ["translator"] },
      storage: unauthorizedStorage.storage,
    }),
    (error) => error.status === 403 && error.code === "forbidden",
  );
  assert.equal(unauthorizedHarness.currentRows().media_assets.length, seed.summary.mediaAssets);

  const failingHarness = runtimeHarness(seed, {
    afterUpdate: async ({ collection }) => {
      if (collection === "listings") throw new Error("listing attachment failed");
    },
  });
  const failingStorage = storageHarness();
  const failingRecord = uploadRecord("rollback-media");
  failingStorage.objects.set(failingRecord.storage_key, Buffer.from("bytes"));
  await assert.rejects(
    persistMediaUploadDurably(failingRecord, {
      payload: failingHarness.payload,
      principal: EDITOR,
      storage: failingStorage.storage,
    }),
    (error) =>
      error instanceof MediaPersistenceError &&
      error.code === "media_persistence_failed" &&
      error.storageCleanup === "deleted" &&
      error.orphanedStorage === false,
  );
  assert.equal(failingStorage.deleted.includes(failingRecord.storage_key), true);
  assert.equal(failingHarness.currentRows().media_assets.length, seed.summary.mediaAssets);

  const unsupportedHarness = runtimeHarness(seed, {
    afterUpdate: async ({ collection }) => {
      if (collection === "listings") throw new Error("listing attachment failed");
    },
  });
  const unsupportedStorage = storageHarness({ deleteSupported: false });
  const unsupportedRecord = uploadRecord("unsupported-cleanup");
  unsupportedStorage.objects.set(unsupportedRecord.storage_key, Buffer.from("bytes"));
  await assert.rejects(
    persistMediaUploadDurably(unsupportedRecord, {
      payload: unsupportedHarness.payload,
      principal: EDITOR,
      storage: unsupportedStorage.storage,
    }),
    (error) =>
      error instanceof MediaPersistenceError &&
      error.storageCleanup === "unsupported" &&
      error.orphanedStorage === true,
  );
});

test("legacy non-durable upload still uses the JSONL fallback", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-durable-media-legacy-"));
  const ledgerPath = path.join(directory, "media-uploads.jsonl");
  const storage = storageHarness();
  const bytes = await photoJpegWithGpsExif({ width: 800, height: 600 });
  const response = await handleAdminMediaUpload({
    bytes: Buffer.from(
      JSON.stringify({
        listingId: LISTING_ID,
        filename: "legacy.jpg",
        contentType: "image/jpeg",
        dataBase64: bytes.toString("base64"),
      }),
    ),
    contentType: "application/json",
    seed: focusedSeed(),
    storage: storage.storage,
    ledgerPath,
    uploadedBy: EDITOR.id,
    uploadedAt: "2026-09-01T10:20:00.000Z",
  });
  assert.equal(response.status, 201);
  assert.equal(readMediaUploads(ledgerPath).length, 1);
  assert.equal(readMediaUploads(ledgerPath)[0].review_status, "needs_media_review");
  assert.equal(readMediaUploads(ledgerPath)[0].is_public, false);
});

test("Node and Next admin adapters read the same durable media projection and keep controls available", async () => {
  // The real adapters always start from the complete CMS seed; keep this
  // parity check on that shape so the editor's complete-snapshot guard is
  // exercised too. The lower-level lifecycle tests stay on the focused seed.
  const seed = loadCmsSeed();
  const harness = runtimeHarness(seed);
  const storage = storageHarness();
  const record = uploadRecord("adapter-parity");
  storage.objects.set(record.storage_key, Buffer.from("adapter-media"));
  const upload = await persistMediaUploadDurably(record, { payload: harness.payload, principal: EDITOR, storage: storage.storage });

  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    MS_REALTY_ADMIN_TOKEN: process.env.MS_REALTY_ADMIN_TOKEN,
    MS_REALTY_ADMIN_ACTOR: process.env.MS_REALTY_ADMIN_ACTOR,
    MS_REALTY_ADMIN_CREDENTIALS_JSON: process.env.MS_REALTY_ADMIN_CREDENTIALS_JSON,
  };
  try {
    process.env.NODE_ENV = "production";
    delete process.env.MS_REALTY_ADMIN_TOKEN;
    delete process.env.MS_REALTY_ADMIN_ACTOR;
    process.env.MS_REALTY_ADMIN_CREDENTIALS_JSON = JSON.stringify([
      { id: EDITOR.id, token: "durable-media-editor-token-0123456789", roles: ["editor"] },
    ]);
    const adapterDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-durable-media-adapters-"));
    const legacyLedgerPath = path.join(adapterDirectory, "legacy-media-uploads.jsonl");
    const nodeApp = createHttpApp({
      runtimeDataDurableOnly: true,
      payloadListingRuntime: harness.payload,
      payloadListingEnv: LIVE_ENV,
      mediaUploadStorage: storage.storage,
      mediaUploadLedgerPath: legacyLedgerPath,
      auditLogPath: path.join(adapterDirectory, "node-audit.jsonl"),
    });
    const routeBytes = await photoJpegWithGpsExif({ width: 800, height: 600 });
    const nodeUpload = await dispatchHttp(nodeApp, {
      method: "POST",
      url: "/api/admin/media/uploads",
      headers: {
        authorization: "Bearer durable-media-editor-token-0123456789",
        "content-type": "application/json",
      },
      body: {
        listingId: LISTING_ID,
        filename: "durable-route.jpg",
        contentType: "image/jpeg",
        dataBase64: routeBytes.toString("base64"),
      },
    });
    assert.equal(nodeUpload.status, 201, JSON.stringify(nodeUpload.body));
    const routeAsset = nodeUpload.body.uploaded[0];
    assert.equal(routeAsset.review_status, "needs_media_review");
    assert.equal(routeAsset.is_public, false);
    assert.equal(fs.existsSync(legacyLedgerPath), false);

    const node = await dispatchHttp(nodeApp, {
      url: `/api/admin/media/uploads?listing=${LISTING_ID}`,
      headers: { authorization: "Bearer durable-media-editor-token-0123456789" },
    });
    assert.equal(node.status, 200);
    assert.ok(node.body.uploads.some((row) => row.asset_id === upload.asset_id));
    assert.equal(Object.hasOwn(node.body.uploads.find((row) => row.asset_id === upload.asset_id), "storage_key"), false);

    const config = {
      ...appAdminConfigFromEnv(LIVE_ENV),
      adminPrincipal: EDITOR,
      payloadListingRuntime: harness.payload,
      payloadListingEnv: LIVE_ENV,
      mediaUploadStorage: storage.storage,
      auditLogPath: path.join(adapterDirectory, "next-audit.jsonl"),
    };
    const next = await renderAppAdminResponse(
      new Request(`https://live.test/api/admin/media/uploads?listing=${LISTING_ID}`),
      { config },
    );
    assert.equal(next.status, 200);
    const nextBody = await next.json();
    assert.ok(nextBody.uploads.some((row) => row.asset_id === upload.asset_id));
    const nextReview = await renderAppAdminResponse(
      new Request("https://live.test/api/admin/media/reviews", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          listingId: LISTING_ID,
          assetId: routeAsset.asset_id,
          decision: "publish",
          kind: "photo",
          alt: "Durable route upload",
          reviewer: EDITOR.id,
          reviewConfirmed: true,
        }),
      }),
      { config },
    );
    assert.equal(nextReview.status, 201);
    assert.equal((await nextReview.json()).review_status, "approved_by_human");
    assert.equal(rawMedia(harness, routeAsset.asset_id).is_public, true);
    const editor = await renderAppAdminResponse(
      new Request(`https://live.test/admin/listings/edit?listingId=${LISTING_ID}&locale=en`),
      { config },
    );
    assert.equal(editor.status, 200);
    const editorHtml = await editor.text();
    assert.match(editorHtml, /data-media-upload-form="true"/);
    assert.doesNotMatch(editorHtml, /Uploads need a media ingest endpoint/);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
