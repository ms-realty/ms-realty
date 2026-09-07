import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";
import { readAuditLog } from "../lib/audit-log.mjs";
import { createMediaUploadStorage } from "../lib/media-upload-storage.mjs";
import { DOCUMENT_STORAGE_SCHEME, documentStorageKeyFromRef, storeDocumentBytes, verifyStoredDocumentBytes } from "../lib/document-storage.mjs";
import { FakePayload } from "./fake-payload.fixture.mjs";
import { multipartBody } from "./image-upload.fixture.mjs";

// A document row used to carry whatever the caller typed as its storage
// reference, size and digest -- "sha256:contract-r1" passed as a digest. Bytes
// went nowhere. Now bytes go to the private object store, the triple is
// computed from them, and a row that quotes a triple the store cannot vouch
// for is refused.

const PDF = Buffer.from("%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n");
const sha256 = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

function localStore() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-document-store-"));
  return createMediaUploadStorage({ driver: "local", root });
}

test("stored bytes come back as a reference, a size and a digest that are all true", async () => {
  const storage = localStore();
  const stored = await storeDocumentBytes({ storage, workspaceId: "ws-one", bytes: PDF, mimeType: "application/pdf" });
  assert.equal(stored.byte_size, PDF.length);
  assert.equal(stored.content_digest, sha256(PDF));
  assert.equal(stored.mime_type, "application/pdf");
  assert.ok(stored.storage_ref.startsWith(DOCUMENT_STORAGE_SCHEME));
  // Content-addressed: the key is the digest, so the same bytes land once.
  const again = await storeDocumentBytes({ storage, workspaceId: "ws-one", bytes: PDF, mimeType: "application/pdf" });
  assert.equal(again.storage_ref, stored.storage_ref);
  assert.match(documentStorageKeyFromRef(stored.storage_ref), /^wp-content\/private\/documents\/ws-one\/[0-9a-f]{64}\.pdf$/);
  // And the store actually holds them.
  assert.deepEqual(await storage.read(documentStorageKeyFromRef(stored.storage_ref)), PDF);
  assert.deepEqual(await verifyStoredDocumentBytes({ storage, ...stored }), {
    key: documentStorageKeyFromRef(stored.storage_ref),
    byte_size: PDF.length,
    content_digest: sha256(PDF),
  });
});

test("a triple the store cannot vouch for is refused, whichever part lies", async () => {
  const storage = localStore();
  const stored = await storeDocumentBytes({ storage, workspaceId: "ws-one", bytes: PDF, mimeType: "application/pdf" });
  await assert.rejects(verifyStoredDocumentBytes({ storage, ...stored, content_digest: "sha256:contract-r1" }), /not the digest of the stored document/);
  await assert.rejects(verifyStoredDocumentBytes({ storage, ...stored, byte_size: stored.byte_size + 1 }), /byte_size says/);
  await assert.rejects(verifyStoredDocumentBytes({ storage, ...stored, storage_ref: "r2://private/doc-contract-1/r1.pdf" }), /must name bytes stored through/);
  const missing = `${DOCUMENT_STORAGE_SCHEME}wp-content/private/documents/ws-one/${"0".repeat(64)}.pdf`;
  await assert.rejects(verifyStoredDocumentBytes({ storage, storage_ref: missing, byte_size: 1, content_digest: `sha256:${"0".repeat(64)}` }), /does not hold/);
});

test("what a document may be is a short list, and nothing is not a document", async () => {
  const storage = localStore();
  await assert.rejects(storeDocumentBytes({ storage, workspaceId: "ws-one", bytes: PDF, mimeType: "application/msword" }), /must be one of/);
  await assert.rejects(storeDocumentBytes({ storage, workspaceId: "ws-one", bytes: Buffer.alloc(0), mimeType: "application/pdf" }), /bytes are required/);
  await assert.rejects(storeDocumentBytes({ storage, workspaceId: "ws-one", bytes: PDF, mimeType: "application/pdf", maxBytes: 8 }), /or smaller/);
  await assert.rejects(storeDocumentBytes({ storage, workspaceId: "../../etc", bytes: PDF, mimeType: "application/pdf" }), /workspace id/);
});

// The routes: bytes first, row second, and the row is refused unless the
// bytes endpoint vouched for it.
// Document mutations require a named operator, and so do the bytes they
// quote: an upload attributed to nobody would be the one gap the row closes.
// The origin names an operator from the credential registry in the process
// environment, as production does; the shared smoke token names nobody.
const BROKER_TOKEN = "document-bytes-broker-token-0123456789abcdef";
function harness({ named = true } = {}) {
  if (named) {
    process.env.MS_REALTY_ADMIN_CREDENTIALS_JSON = JSON.stringify([
      { id: "operator-broker", token: BROKER_TOKEN, roles: ["broker"], workspace_ids: ["ws-one"] },
    ]);
  } else {
    delete process.env.MS_REALTY_ADMIN_CREDENTIALS_JSON;
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-document-routes-"));
  const auditLogPath = path.join(dir, "audit.jsonl");
  const payload = new FakePayload();
  const app = createHttpApp({
    auditLogPath,
    payloadListingRuntime: payload,
    mediaUploadStorage: createMediaUploadStorage({ driver: "local", root: path.join(dir, "store") }),
    leadContactVaultPath: path.join(dir, "contacts.jsonl"),
    leadContactKey: "test-only-document-bytes-key-32-chars",
  });
  return { app, auditLogPath, payload };
}
const AUTH = { authorization: `Bearer ${BROKER_TOKEN}`, "content-type": "application/json" };
const body = (res) => (typeof res.body === "string" ? JSON.parse(res.body) : res.body);
const documentInput = (triple, overrides = {}) => ({
  workspace_id: "ws-one",
  document_id: "doc-contract-1",
  idempotency_key: "document-write-1",
  document_type: "contract",
  title: "Purchase contract",
  subject_type: "case",
  subject_ref: "case-1",
  source: "client",
  retention_class: "case_file",
  ...triple,
  ...overrides,
});

test("the document routes accept only a triple the bytes endpoint minted", async () => {
  const { app, auditLogPath } = harness();
  const stored = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/documents/bytes",
    headers: AUTH,
    body: JSON.stringify({ workspace_id: "ws-one", dataBase64: PDF.toString("base64"), contentType: "application/pdf", filename: "contract.pdf" }),
  });
  assert.equal(stored.status, 201, JSON.stringify(body(stored)));
  const triple = body(stored);
  assert.equal(triple.kind, "document_bytes");
  assert.equal(triple.content_digest, sha256(PDF));
  assert.equal(triple.byte_size, PDF.length);

  // The old fiction is refused at the door.
  const fiction = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/documents",
    headers: AUTH,
    body: JSON.stringify(documentInput({ storage_ref: "r2://private/doc-contract-1/r1.pdf", mime_type: "application/pdf", byte_size: 1200, content_digest: "sha256:contract-r1" })),
  });
  assert.equal(fiction.status, 400);
  assert.equal(body(fiction).kind, "storage_ref_unverifiable");

  // So is a real reference with a lying digest.
  const tampered = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/documents",
    headers: AUTH,
    body: JSON.stringify(documentInput({ storage_ref: triple.storage_ref, mime_type: triple.mime_type, byte_size: triple.byte_size, content_digest: "sha256:contract-r1" })),
  });
  assert.equal(tampered.status, 409);
  assert.equal(body(tampered).kind, "document_bytes_mismatch");

  // The minted triple is accepted, and the row carries it unchanged.
  const created = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/documents",
    headers: AUTH,
    body: JSON.stringify(documentInput({ storage_ref: triple.storage_ref, mime_type: triple.mime_type, byte_size: triple.byte_size, content_digest: triple.content_digest })),
  });
  assert.equal(created.status, 201, JSON.stringify(body(created)));
  assert.equal(body(created).revision.storage_ref, triple.storage_ref);
  assert.equal(body(created).revision.content_digest, sha256(PDF));

  const audit = readAuditLog(auditLogPath).map((row) => row.action);
  assert.ok(audit.includes("document_bytes_stored"), audit.join(","));
  assert.ok(audit.includes("document_created"), audit.join(","));
});

test("a revision is held to the same bar as the first version", async () => {
  const { app } = harness();
  const first = body(await dispatchHttp(app, { method: "POST", url: "/api/admin/documents/bytes", headers: AUTH, body: JSON.stringify({ workspace_id: "ws-one", dataBase64: PDF.toString("base64"), contentType: "application/pdf" }) }));
  const created = await dispatchHttp(app, { method: "POST", url: "/api/admin/documents", headers: AUTH, body: JSON.stringify(documentInput({ storage_ref: first.storage_ref, mime_type: first.mime_type, byte_size: first.byte_size, content_digest: first.content_digest })) });
  assert.equal(created.status, 201, JSON.stringify(body(created)));
  const documentId = body(created).document.document_id;

  const refused = await dispatchHttp(app, {
    method: "POST",
    url: `/api/admin/documents/${encodeURIComponent(documentId)}/revisions`,
    headers: AUTH,
    body: JSON.stringify({ idempotency_key: "revision-2", storage_ref: "r2://private/doc-contract-1/r2.pdf", mime_type: "application/pdf", byte_size: 1500, content_digest: "sha256:contract-r2", change_reason: "counter-signed" }),
  });
  assert.equal(refused.status, 400);
  assert.equal(body(refused).kind, "storage_ref_unverifiable");

  const signed = Buffer.concat([PDF, Buffer.from("% signed\n")]);
  const second = body(await dispatchHttp(app, { method: "POST", url: "/api/admin/documents/bytes", headers: AUTH, body: JSON.stringify({ workspace_id: "ws-one", dataBase64: signed.toString("base64"), contentType: "application/pdf" }) }));
  const revised = await dispatchHttp(app, {
    method: "POST",
    url: `/api/admin/documents/${encodeURIComponent(documentId)}/revisions`,
    headers: AUTH,
    body: JSON.stringify({ idempotency_key: "revision-2", storage_ref: second.storage_ref, mime_type: second.mime_type, byte_size: second.byte_size, content_digest: second.content_digest, change_reason: "counter-signed" }),
  });
  assert.equal(revised.status, 201, JSON.stringify(body(revised)));
  assert.equal(body(revised).revision.revision_number, 2);
  assert.equal(body(revised).revision.content_digest, sha256(signed));
});

test("bytes are refused from an operator who has no name, as the row would be", async () => {
  const { app } = harness({ named: false });
  const res = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/documents/bytes",
    headers: { authorization: "Bearer local-admin-smoke", "content-type": "application/json" },
    body: JSON.stringify({ workspace_id: "ws-one", dataBase64: PDF.toString("base64"), contentType: "application/pdf" }),
  });
  assert.equal(res.status, 403);
  assert.equal(body(res).kind, "operator_identity_required");
});

test("the browser form path -- multipart, no JavaScript -- mints the same triple", async () => {
  const { app } = harness();
  const form = multipartBody([
    { name: "workspace_id", value: "ws-one" },
    { name: "document", filename: "contract.pdf", contentType: "application/pdf", value: PDF },
  ]);
  const res = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/documents/bytes",
    headers: { authorization: AUTH.authorization, "content-type": form.contentType },
    body: form.body,
  });
  assert.equal(res.status, 201, JSON.stringify(body(res)));
  assert.equal(body(res).content_digest, sha256(PDF));
  assert.equal(body(res).mime_type, "application/pdf");
});
