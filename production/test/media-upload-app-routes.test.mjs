// The container serves the Next App Router handoff, not the standalone Node
// server, so an upload that only worked in http.mjs would not exist in
// production. These tests drive the adapters the App Router route files call.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { renderAppAdminResponse, appAdminConfigFromEnv } from "../lib/app-admin-adapter.mjs";
import { renderAppApiResponse, appApiConfigFromEnv } from "../lib/app-api-adapter.mjs";
import { optimizeImageUpload } from "../lib/image-optimizer.mjs";
import { readMediaUploads } from "../lib/media-uploads.mjs";
import { fromRoot } from "../lib/paths.mjs";
import { createPayloadDraftRuntime } from "./payload-draft-runtime.fixture.mjs";
import { jpegWithGpsExif, multipartBody, textFileNamedJpg, tinyJpeg } from "./image-upload.fixture.mjs";

const ENQUIRY_ID = "lead-draft-99999999-8888-7777-6666-555555555555";
const LISTING_ID = "MS-00815";
const DURABLE_ENV = Object.freeze({
  NODE_ENV: "production",
  MS_REALTY_RUNTIME_DATA_AUTHORITY: "payload",
  PAYLOAD_SECRET: "x".repeat(40),
  DATABASE_URL: "postgres://payload:secret@db.example.test/ms_realty",
});

function scratch() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-app-upload-"));
  const uploadLedger = path.join(dir, "media-uploads.jsonl");
  const auditLog = path.join(dir, "audit-log.jsonl");
  const sellerPipeline = path.join(dir, "seller-pipeline.jsonl");
  fs.writeFileSync(uploadLedger, "");
  fs.writeFileSync(auditLog, "");
  fs.writeFileSync(
    sellerPipeline,
    `${JSON.stringify({ id: `seller-pipeline-${ENQUIRY_ID}`, lead_id: ENQUIRY_ID, stage: "valuation_requested", contact_name: "seller" })}\n`,
  );
  return { dir, uploadLedger, auditLog, sellerPipeline, uploadRoot: path.join(dir, "bytes") };
}

function uploadRequest(url, { body, contentType }, headers = {}) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": contentType, accept: "application/json", ...headers },
    body,
    duplex: "half",
  });
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

test("the App Router handoff exposes both upload routes", () => {
  assert.equal(fs.existsSync(fromRoot("app", "api", "admin", "media", "uploads", "route.js")), true);
  assert.equal(fs.existsSync(fromRoot("app", "api", "admin", "media", "uploads", "[assetId]", "route.js")), true);
  assert.equal(fs.existsSync(fromRoot("app", "api", "seller-photos", "route.js")), true);
});

test("the admin adapter stores an upload unreviewed and refuses a renamed text file", async () => {
  const context = scratch();
  const config = {
    ...appAdminConfigFromEnv(),
    adminPrincipal: { id: "operations_lead", source: "credential_registry", can_mutate: true, roles: ["admin"] },
    mediaUploadLedgerPath: context.uploadLedger,
    mediaUploadStorageConfig: { driver: "local", root: context.uploadRoot, host: "ms-realty.ms-realty-bg.workers.dev" },
    auditLogPath: context.auditLog,
  };

  const accepted = await renderAppAdminResponse(
    uploadRequest(
      "http://localhost/api/admin/media/uploads",
      multipartBody([
        { name: "listingId", value: LISTING_ID },
        { name: "photo", filename: "kitchen.jpg", contentType: "image/jpeg", value: jpegWithGpsExif() },
      ]),
    ),
    { config },
  );
  assert.equal(accepted.status, 201);
  const payload = await accepted.json();
  assert.equal(payload.public, false);
  assert.equal(payload.uploaded[0].review_status, "needs_media_review");
  assert.equal(payload.uploaded[0].metadata_stripped, true);

  const rows = readMediaUploads(context.uploadLedger);
  assert.equal(rows.length, 1);
  // The bytes survive the Web Request round trip unchanged, which is the whole
  // reason the adapter reads raw bytes instead of a decoded string. What is
  // stored is now the optimised photo, so the check is that optimising the
  // source locally lands on exactly the same bytes: any corruption in transit
  // would decode differently and could not.
  const expected = await optimizeImageUpload(tinyJpeg());
  assert.deepEqual(fs.readFileSync(path.join(context.uploadRoot, rows[0].storage_key)), expected.bytes);

  const refused = await renderAppAdminResponse(
    uploadRequest(
      "http://localhost/api/admin/media/uploads",
      multipartBody([
        { name: "listingId", value: LISTING_ID },
        { name: "photo", filename: "photo.jpg", contentType: "image/jpeg", value: textFileNamedJpg() },
      ]),
    ),
    { config },
  );
  assert.equal(refused.status, 415);
  assert.equal((await refused.json()).kind, "unsupported_image_type");
  assert.equal(readMediaUploads(context.uploadLedger).length, 1);

  const listed = await renderAppAdminResponse(
    new Request(`http://localhost/api/admin/media/uploads?listing=${LISTING_ID}`, { headers: { accept: "application/json" } }),
    { config },
  );
  assert.equal(listed.status, 200);
  assert.equal((await listed.json()).uploads.length, 1);

  const preview = await renderAppAdminResponse(
    new Request(`http://localhost/api/admin/media/uploads/${payload.uploaded[0].asset_id}`, { headers: { accept: "image/jpeg" } }),
    { config },
  );
  assert.equal(preview.status, 200);
  assert.equal(preview.headers.get("cache-control"), "no-store");
  assert.deepEqual(Buffer.from(await preview.arrayBuffer()), expected.bytes);
});

test("the admin adapter uses the durable media authority without falling back to the upload ledger", async () => {
  const context = scratch();
  const runtime = durablePayloadRuntime();
  const config = {
    ...appAdminConfigFromEnv(DURABLE_ENV),
    adminPrincipal: { id: "operations_lead", source: "credential_registry", can_mutate: true, roles: ["admin"] },
    runtimeDataDurableOnly: true,
    payloadListingRuntime: runtime.payload,
    payloadListingEnv: DURABLE_ENV,
    mediaUploadLedgerPath: context.uploadLedger,
    mediaUploadStorageConfig: { driver: "local", root: context.uploadRoot, host: "ms-realty.ms-realty-bg.workers.dev" },
    auditLogPath: context.auditLog,
  };

  const accepted = await renderAppAdminResponse(
    uploadRequest(
      "http://localhost/api/admin/media/uploads",
      multipartBody([
        { name: "listingId", value: LISTING_ID },
        { name: "photo", filename: "kitchen.jpg", contentType: "image/jpeg", value: jpegWithGpsExif() },
      ]),
    ),
    { config },
  );
  assert.equal(accepted.status, 201);
  const payload = await accepted.json();
  assert.equal(payload.uploaded[0].review_status, "needs_media_review");
  assert.equal(readMediaUploads(context.uploadLedger).length, 0);

  const rows = runtime.currentRows();
  const stored = rows.media_assets.find((row) => row.upload_id === payload.uploaded[0].id);
  assert.ok(stored, "the upload must be persisted through Payload");
  assert.equal(stored.subject_id, LISTING_ID);
  assert.equal(stored.is_public, false);

  const listed = await renderAppAdminResponse(
    new Request(`http://localhost/api/admin/media/uploads?listing=${LISTING_ID}`, { headers: { accept: "application/json" } }),
    { config },
  );
  assert.equal(listed.status, 200);
  const listingPayload = await listed.json();
  assert.equal(listingPayload.uploads.some((row) => row.asset_id === payload.uploaded[0].asset_id), true);
});

test("the public adapter keeps a seller photo private and bound to the enquiry", async () => {
  const context = scratch();
  const config = {
    ...appApiConfigFromEnv(),
    mediaUploadLedgerPath: context.uploadLedger,
    mediaUploadStorageConfig: { driver: "local", root: context.uploadRoot, host: "ms-realty.ms-realty-bg.workers.dev" },
    sellerPipelinePath: context.sellerPipeline,
    sellerPhotoUploadEnabled: true,
    rateLimit: null,
  };
  const headers = { host: "localhost", origin: "http://localhost", "sec-fetch-site": "same-origin" };

  const received = await renderAppApiResponse(
    uploadRequest(
      "http://localhost/api/seller-photos",
      multipartBody([
        { name: "enquiryId", value: ENQUIRY_ID },
        { name: "photo", filename: "front.jpg", contentType: "image/jpeg", value: jpegWithGpsExif() },
      ]),
      headers,
    ),
    { config },
  );
  assert.equal(received.status, 201);
  const payload = await received.json();
  assert.equal(payload.public, false);
  assert.equal(payload.searchable, false);
  assert.equal(payload.published, false);

  const row = readMediaUploads(context.uploadLedger)[0];
  assert.equal(row.subject_type, "enquiry");
  assert.equal(row.subject_id, ENQUIRY_ID);
  assert.equal(row.asset_url, null);
  assert.match(row.storage_key, /wp-content\/private\/enquiries\//);

  const unknown = await renderAppApiResponse(
    uploadRequest(
      "http://localhost/api/seller-photos",
      multipartBody([
        { name: "enquiryId", value: "lead-draft-nope" },
        { name: "photo", filename: "front.jpg", contentType: "image/jpeg", value: tinyJpeg() },
      ]),
      headers,
    ),
    { config },
  );
  assert.equal(unknown.status, 404);

  const crossOrigin = await renderAppApiResponse(
    uploadRequest(
      "http://localhost/api/seller-photos",
      multipartBody([
        { name: "enquiryId", value: ENQUIRY_ID },
        { name: "photo", filename: "front.jpg", contentType: "image/jpeg", value: tinyJpeg() },
      ]),
      { host: "localhost", origin: "https://evil.test", "sec-fetch-site": "cross-site" },
    ),
    { config },
  );
  assert.equal(crossOrigin.status, 403);
});

// A browser form post asks for HTML and gets a redirect back to the page it
// came from. That branch used to reference a helper this module never defined,
// so every no-JS seller upload answered 500 in production while the JSON path
// stayed green.
test("the public adapter redirects a no-JS seller photo form back to the page", async () => {
  const context = scratch();
  const config = {
    ...appApiConfigFromEnv(),
    mediaUploadLedgerPath: context.uploadLedger,
    mediaUploadStorageConfig: { driver: "local", root: context.uploadRoot, host: "ms-realty.ms-realty-bg.workers.dev" },
    sellerPipelinePath: context.sellerPipeline,
    sellerPhotoUploadEnabled: true,
    rateLimit: null,
  };

  const redirected = await renderAppApiResponse(
    uploadRequest(
      "http://localhost/api/seller-photos?return=%2Fen%2Fsell",
      multipartBody([
        { name: "enquiryId", value: ENQUIRY_ID },
        { name: "photo", filename: "front.jpg", contentType: "image/jpeg", value: jpegWithGpsExif() },
      ]),
      {
        host: "localhost",
        origin: "http://localhost",
        "sec-fetch-site": "same-origin",
        accept: "text/html,application/xhtml+xml",
      },
    ),
    { config },
  );

  assert.equal(redirected.status, 303);
  assert.equal(redirected.headers.get("location"), "/en/sell?photos=ok#seller-photos");
  assert.equal(redirected.headers.get("cache-control"), "no-store");
  assert.equal(readMediaUploads(context.uploadLedger).length, 1);
});
