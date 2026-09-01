import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  DOCUMENT_COLLECTIONS,
  DocumentStoreUnavailableError,
  createDocument,
  createDocumentRevision,
  createSignatureRequest,
  readDocumentRevisions,
  readDocuments,
  readSignatureRequests,
  updateSignatureRequestStatus,
  validateDocumentReferences,
  validateOpaqueStorageReference,
} from "../lib/document-signatures.mjs";
import { requiredAdminCapability } from "../lib/admin-auth.mjs";
import { createAuditLogEntry } from "../lib/audit-log.mjs";

function scalarEqual(actual, expected) {
  if (actual === expected) return true;
  if (actual === null || actual === undefined || expected === null || expected === undefined) return false;
  return String(actual) === String(expected);
}

function matches(where, row) {
  if (!where) return true;
  if (Array.isArray(where.and)) return where.and.every((clause) => matches(clause, row));
  if (Array.isArray(where.or)) return where.or.some((clause) => matches(clause, row));
  return Object.entries(where).every(([field, condition]) => {
    if (field === "and" || field === "or") return matches({ [field]: condition }, row);
    const value = row[field];
    if (!condition || typeof condition !== "object") return scalarEqual(value, condition);
    if (Object.hasOwn(condition, "equals")) return scalarEqual(value, condition.equals);
    if (Object.hasOwn(condition, "in")) return condition.in.some((candidate) => scalarEqual(value, candidate));
    return true;
  });
}

class FakePayload {
  constructor() {
    this.rows = new Map();
    this.nextId = 1;
  }

  async find({ collection, where }) {
    return { docs: [...(this.rows.get(collection) || [])].filter((row) => matches(where, row)) };
  }

  async create({ collection, data }) {
    const now = new Date().toISOString();
    const row = { id: String(this.nextId++), ...data, createdAt: now, updatedAt: now };
    this.rows.set(collection, [...(this.rows.get(collection) || []), row]);
    return row;
  }

  async update({ collection, id, data }) {
    const rows = [...(this.rows.get(collection) || [])];
    const index = rows.findIndex((row) => scalarEqual(row.id, id));
    if (index < 0) throw new Error(`Missing ${collection}:${id}`);
    rows[index] = { ...rows[index], ...data, updatedAt: new Date().toISOString() };
    this.rows.set(collection, rows);
    return rows[index];
  }
}

const admin = { id: "operator-admin", role: "admin", roles: ["admin"] };
const broker = { id: "operator-broker", role: "broker", roles: ["broker"], workspace_ids: ["ws-one"] };
const foreignBroker = { id: "operator-foreign", role: "broker", roles: ["broker"], workspace_ids: ["ws-two"] };
const editor = { id: "operator-editor", role: "editor", roles: ["editor"] };

function documentInput(overrides = {}) {
  return {
    workspace_id: "ws-one",
    document_id: "doc-contract-1",
    idempotency_key: "document-write-1",
    document_type: "contract",
    title: "Purchase contract",
    subject_type: "case",
    subject_ref: "case-1",
    source: "client",
    storage_ref: "r2://private/doc-contract-1/r1.pdf",
    mime_type: "application/pdf",
    byte_size: 1200,
    content_digest: "sha256:contract-r1",
    retention_class: "case_file",
    ...overrides,
  };
}

test("document collections are private, workspace-scoped, and service-owned", () => {
  assert.deepEqual(
    DOCUMENT_COLLECTIONS.map((collection) => collection.slug),
    ["documents", "document_revisions", "signature_requests"],
  );
  for (const collection of DOCUMENT_COLLECTIONS) {
    assert.equal(collection.access.create({ req: { user: admin } }), false);
    assert.equal(collection.access.update({ req: { user: admin } }), false);
    assert.equal(collection.access.delete({ req: { user: admin } }), false);
    assert.equal(collection.access.read({ req: { user: admin } }), true);
    assert.deepEqual(collection.access.read({ req: { user: broker } }), { workspace_id: { in: ["ws-one"] } });
    assert.equal(collection.access.read({ req: { user: editor } }), false);
  }
});

test("document creation is idempotent and revisions remain append-only", async () => {
  const payload = new FakePayload();
  const created = await createDocument({
    payload,
    principal: broker,
    input: documentInput(),
    recordedAt: "2026-09-01T10:00:00.000Z",
  });
  assert.equal(created.idempotent, false);
  assert.equal(created.document.current_revision_number, 1);
  assert.equal(created.revision.revision_number, 1);
  assert.equal(created.revision.storage_ref, "r2://private/doc-contract-1/r1.pdf");

  const replay = await createDocument({ payload, principal: broker, input: documentInput(), recordedAt: "2026-09-01T10:01:00.000Z" });
  assert.equal(replay.idempotent, true);
  assert.equal(replay.document.document_id, "doc-contract-1");

  const revision = await createDocumentRevision({
    payload,
    principal: broker,
    documentId: "doc-contract-1",
    input: {
      idempotency_key: "document-revision-2",
      revision_number: 2,
      storage_ref: "r2://private/doc-contract-1/r2.pdf",
      mime_type: "application/pdf",
      byte_size: 1500,
      content_digest: "sha256:contract-r2",
      change_reason: "Counterparty amendment",
    },
    recordedAt: "2026-09-01T11:00:00.000Z",
  });
  assert.equal(revision.idempotent, false);
  assert.equal(revision.document.current_revision_number, 2);
  assert.equal(revision.revision.revision_number, 2);
  assert.deepEqual(
    (await readDocumentRevisions({ payload, principal: broker, documentId: "doc-contract-1" })).map((row) => row.revision_number),
    [1, 2],
  );
  await assert.rejects(
    () =>
      createDocumentRevision({
        payload,
        principal: broker,
        documentId: "doc-contract-1",
        input: {
          idempotency_key: "document-revision-wrong-number",
          revision_number: 4,
          storage_ref: "r2://private/doc-contract-1/r4.pdf",
          mime_type: "application/pdf",
          byte_size: 1,
          content_digest: "sha256:wrong",
          change_reason: "Wrong sequence",
        },
      }),
    (error) => error?.code === "revision_conflict" && error?.status === 409,
  );
  assert.deepEqual((await readDocuments({ payload, principal: foreignBroker })).map((row) => row.document_id), []);
});

test("idempotency keys cannot replay revisions or signature requests onto another document", async () => {
  const payload = new FakePayload();
  await createDocument({ payload, principal: broker, input: documentInput() });
  await createDocument({
    payload,
    principal: broker,
    input: documentInput({ document_id: "doc-contract-2", idempotency_key: "document-write-2" }),
  });
  await createDocumentRevision({
    payload,
    principal: broker,
    documentId: "doc-contract-1",
    input: {
      idempotency_key: "shared-revision-key",
      storage_ref: "r2://private/doc-contract-1/r2.pdf",
      mime_type: "application/pdf",
      byte_size: 1300,
      content_digest: "sha256:contract-r2",
      change_reason: "First document revision",
    },
  });
  await assert.rejects(
    () =>
      createDocumentRevision({
        payload,
        principal: broker,
        documentId: "doc-contract-2",
        input: {
          idempotency_key: "shared-revision-key",
          storage_ref: "r2://private/doc-contract-2/r2.pdf",
          mime_type: "application/pdf",
          byte_size: 1400,
          content_digest: "sha256:other-r2",
          change_reason: "Second document revision",
        },
      }),
    (error) => error?.code === "revision_conflict" && error?.status === 409,
  );

  await createSignatureRequest({
    payload,
    principal: broker,
    input: {
      document_id: "doc-contract-1",
      idempotency_key: "shared-signature-key",
      signer_ref: "contact-1",
      signer_role: "buyer",
    },
  });
  await assert.rejects(
    () =>
      createSignatureRequest({
        payload,
        principal: broker,
        input: {
          document_id: "doc-contract-2",
          idempotency_key: "shared-signature-key",
          signer_ref: "contact-2",
          signer_role: "seller",
        },
      }),
    (error) => error?.code === "signature_request_conflict" && error?.status === 409,
  );
});

test("signature requests stay provider-pending until a receipt-backed terminal update", async () => {
  const payload = new FakePayload();
  await createDocument({ payload, principal: admin, input: documentInput() });
  const pending = await createSignatureRequest({
    payload,
    principal: admin,
    input: {
      document_id: "doc-contract-1",
      idempotency_key: "signature-write-1",
      request_id: "sig-contract-1",
      signer_ref: "contact-1",
      signer_role: "buyer",
      provider: "internal",
      status: "signed",
    },
  });
  assert.equal(pending.request.status, "provider_pending");
  assert.equal(pending.provider_pending, true);
  assert.equal(pending.external_dispatch, false);
  assert.equal(pending.provider_status, "pending");

  const replay = await createSignatureRequest({
    payload,
    principal: admin,
    input: {
      document_id: "doc-contract-1",
      idempotency_key: "signature-write-1",
      signer_ref: "contact-1",
      signer_role: "buyer",
    },
  });
  assert.equal(replay.idempotent, true);
  await assert.rejects(
    () => createSignatureRequest({ payload, principal: admin, input: { ...pending.request, provider: "docusign", idempotency_key: "signature-write-2" } }),
    (error) => error?.code === "signature_provider_unavailable" && error?.status === 503,
  );
  await assert.rejects(
    () => updateSignatureRequestStatus({ payload, principal: admin, requestId: "sig-contract-1", input: { status: "signed" } }),
    (error) => error?.code === "signature_receipt_required" && error?.status === 409,
  );
  const signed = await updateSignatureRequestStatus({
    payload,
    principal: admin,
    requestId: "sig-contract-1",
    input: { status: "signed", provider_receipt_ref: "internal-receipt-1" },
  });
  assert.equal(signed.request.status, "signed");
  assert.equal(signed.request.provider_receipt_ref, "internal-receipt-1");
  const same = await updateSignatureRequestStatus({ payload, principal: admin, requestId: "sig-contract-1", input: { status: "signed" } });
  assert.equal(same.idempotent, true);
  await assert.rejects(
    () => updateSignatureRequestStatus({ payload, principal: admin, requestId: "sig-contract-1", input: { status: "declined" } }),
    (error) => error?.code === "signature_status_conflict" && error?.status === 409,
  );
  assert.equal((await readSignatureRequests({ payload, principal: admin })).length, 1);
});

test("document references reject content and API capabilities do not replace checklist access", () => {
  assert.equal(validateDocumentReferences({ storage_key: "r2/private/1", digest: "sha256:x" }), true);
  assert.notEqual(validateDocumentReferences({ storage_key: "r2/private/1", content: "raw bytes" }), true);
  assert.equal(validateOpaqueStorageReference("r2://private/1.pdf"), true);
  assert.notEqual(validateOpaqueStorageReference("data:application/pdf;base64,AAAA"), true);
  assert.equal(requiredAdminCapability("GET", "/api/admin/documents"), "operations:read");
  assert.equal(requiredAdminCapability("POST", "/api/admin/documents/outcome"), "operations:write");
  assert.equal(requiredAdminCapability("GET", "/api/admin/documents/records"), "documents:read");
  assert.equal(requiredAdminCapability("POST", "/api/admin/documents"), "documents:write");
  assert.equal(requiredAdminCapability("POST", "/api/admin/documents/doc-contract-1/revisions"), "documents:write");
  assert.equal(requiredAdminCapability("POST", "/api/admin/signature-requests/sig-contract-1/status"), "documents:write");
  assert.equal(createAuditLogEntry({ action: "document_created", actor: "operator", objectType: "document", objectId: "doc-1" }).action, "document_created");
});

test("document mutations reject inline content instead of silently dropping it", async () => {
  await assert.rejects(
    () => createDocument({ payload: new FakePayload(), principal: broker, input: { ...documentInput(), content: "raw bytes" } }),
    (error) => error?.code === "invalid_document" && error?.status === 400,
  );
});

test("migration registers durable document tables and immutable guards", () => {
  const migration = fs.readFileSync(new URL("../../migrations/20260901_130000_document_signatures.ts", import.meta.url), "utf8");
  const index = fs.readFileSync(new URL("../../migrations/index.ts", import.meta.url), "utf8");
  for (const table of ["documents", "document_revisions", "signature_requests"]) assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS \\\"${table}\\\"`));
  assert.match(migration, /CREATE TRIGGER "ms_realty_document_revisions_append_only"/);
  assert.match(migration, /CREATE TRIGGER "ms_realty_signature_requests_guard"/);
  assert.match(index, /migration_20260901_130000_document_signatures/);
  assert.equal(typeof DocumentStoreUnavailableError, "function");
});
