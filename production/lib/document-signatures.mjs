import { randomUUID } from "node:crypto";
import {
  documentCollectionAccess,
  documentRevisionCollectionAccess,
  signatureRequestCollectionAccess,
} from "./payload-access.mjs";

export const DOCUMENT_COLLECTION = "documents";
export const DOCUMENT_REVISION_COLLECTION = "document_revisions";
export const SIGNATURE_REQUEST_COLLECTION = "signature_requests";
export const DOCUMENT_COLLECTION_SLUGS = Object.freeze([
  DOCUMENT_COLLECTION,
  DOCUMENT_REVISION_COLLECTION,
  SIGNATURE_REQUEST_COLLECTION,
]);

export const DOCUMENT_TYPES = Object.freeze([
  "mandate",
  "identity",
  "title",
  "technical",
  "tax",
  "contract",
  "lease",
  "annex",
  "power_of_attorney",
  "regulatory_snapshot",
  "other",
]);
export const DOCUMENT_SOURCES = Object.freeze([
  "client",
  "counterparty",
  "agency",
  "professional",
  "registry",
  "system",
  "provider",
]);
export const DOCUMENT_RETENTION_CLASSES = Object.freeze(["case_file", "legal_hold", "short_lived"]);
export const DOCUMENT_STATUSES = Object.freeze(["active", "void", "expired", "archived"]);
export const SIGNATURE_REQUEST_STATUSES = Object.freeze([
  "provider_pending",
  "signed",
  "declined",
  "expired",
  "cancelled",
  "failed",
]);

const REFERENCE_ONLY_KEYS = new Set([
  "base64",
  "binary",
  "body",
  "content",
  "document_content",
  "file",
  "file_data",
  "raw_content",
]);

const immutableField = Object.freeze({
  access: { update: () => false },
  admin: { readOnly: true },
});

function referenceOnly(value) {
  if (value === null || value === undefined) return true;
  if (!value || typeof value !== "object") return true;
  if (Array.isArray(value)) return value.every(referenceOnly);
  return Object.entries(value).every(
    ([key, nested]) => !REFERENCE_ONLY_KEYS.has(String(key).toLowerCase()) && referenceOnly(nested),
  );
}

export function validateDocumentReferences(value) {
  return referenceOnly(value) ? true : "Document references must not contain document content or encoded binary data";
}

export function validateOpaqueStorageReference(value) {
  const reference = String(value ?? "").trim();
  if (!reference) return "A storage reference is required";
  if (/^(?:data|blob|base64):/i.test(reference)) {
    return "Storage references must point to an object; inline document content is not accepted";
  }
  return true;
}

const workspaceField = () => ({
  name: "workspace_id",
  type: "text",
  required: true,
  index: true,
  maxLength: 160,
  ...immutableField,
});

const relationField = (name, relationTo) => ({
  name,
  type: "relationship",
  relationTo,
  required: true,
  ...immutableField,
});

const referenceField = (name, { required = false, maxLength = 240, validate } = {}) => ({
  name,
  type: "text",
  required,
  maxLength,
  ...(validate ? { validate } : {}),
  ...immutableField,
});

const jsonReferenceField = (name, { required = false } = {}) => ({
  name,
  type: "json",
  required,
  validate: validateDocumentReferences,
  ...immutableField,
});

// The three collections are intentionally write-protected at the generic
// Payload surface. Service methods below are the only writer and use
// overrideAccess after validating actor/workspace/ordering invariants.
export const DOCUMENT_COLLECTIONS = [
  {
    slug: DOCUMENT_COLLECTION,
    access: documentCollectionAccess,
    admin: {
      useAsTitle: "document_id",
      defaultColumns: ["workspace_id", "document_id", "document_type", "status", "current_revision_number"],
    },
    fields: [
      workspaceField(),
      { name: "document_id", type: "text", required: true, unique: true, index: true, maxLength: 160, ...immutableField },
      { name: "idempotency_key", type: "text", required: true, index: true, maxLength: 240, ...immutableField },
      { name: "document_type", type: "select", required: true, options: [...DOCUMENT_TYPES], ...immutableField },
      { name: "title", type: "text", required: true, maxLength: 240, ...immutableField },
      referenceField("subject_type", { required: true, maxLength: 80 }),
      referenceField("subject_ref", { required: true }),
      {
        name: "case",
        type: "relationship",
        relationTo: "realty_cases",
        ...immutableField,
      },
      { name: "source", type: "select", required: true, options: [...DOCUMENT_SOURCES], ...immutableField },
      referenceField("storage_ref", { required: true, validate: validateOpaqueStorageReference }),
      { name: "mime_type", type: "text", required: true, maxLength: 160, ...immutableField },
      { name: "byte_size", type: "number", required: true, min: 0, ...immutableField },
      { name: "content_digest", type: "text", required: true, maxLength: 160, ...immutableField },
      { name: "retention_class", type: "select", required: true, options: [...DOCUMENT_RETENTION_CLASSES], ...immutableField },
      { name: "status", type: "select", required: true, defaultValue: "active", options: [...DOCUMENT_STATUSES], ...immutableField },
      { name: "valid_from", type: "date", ...immutableField },
      { name: "valid_until", type: "date", ...immutableField },
      { name: "current_revision_number", type: "number", required: true, defaultValue: 1, min: 1, ...immutableField },
      referenceField("current_revision_id", { required: true }),
      {
        name: "current_storage_ref",
        type: "text",
        required: true,
        maxLength: 240,
        validate: validateOpaqueStorageReference,
        ...immutableField,
      },
      { name: "current_mime_type", type: "text", required: true, maxLength: 160, ...immutableField },
      { name: "current_byte_size", type: "number", required: true, min: 0, ...immutableField },
      { name: "current_content_digest", type: "text", required: true, maxLength: 160, ...immutableField },
      referenceField("created_by", { required: true, maxLength: 120 }),
    ],
  },
  {
    slug: DOCUMENT_REVISION_COLLECTION,
    access: documentRevisionCollectionAccess,
    admin: {
      useAsTitle: "revision_id",
      defaultColumns: ["workspace_id", "document_ref", "revision_number", "content_digest", "created_by"],
    },
    fields: [
      workspaceField(),
      relationField("document", DOCUMENT_COLLECTION),
      referenceField("document_ref", { required: true }),
      { name: "revision_id", type: "text", required: true, unique: true, index: true, maxLength: 240, ...immutableField },
      { name: "idempotency_key", type: "text", required: true, index: true, maxLength: 240, ...immutableField },
      { name: "revision_number", type: "number", required: true, min: 1, ...immutableField },
      { name: "document_type", type: "select", required: true, options: [...DOCUMENT_TYPES], ...immutableField },
      { name: "title", type: "text", required: true, maxLength: 240, ...immutableField },
      referenceField("storage_ref", { required: true, validate: validateOpaqueStorageReference }),
      { name: "mime_type", type: "text", required: true, maxLength: 160, ...immutableField },
      { name: "byte_size", type: "number", required: true, min: 0, ...immutableField },
      { name: "content_digest", type: "text", required: true, maxLength: 160, ...immutableField },
      referenceField("change_reason", { required: true, maxLength: 240 }),
      jsonReferenceField("metadata_refs"),
      referenceField("created_by", { required: true, maxLength: 120 }),
      { name: "revision_recorded_at", type: "date", required: true, ...immutableField },
    ],
  },
  {
    slug: SIGNATURE_REQUEST_COLLECTION,
    access: signatureRequestCollectionAccess,
    admin: {
      useAsTitle: "request_id",
      defaultColumns: ["workspace_id", "request_id", "document_ref", "signer_role", "status"],
    },
    fields: [
      workspaceField(),
      { name: "request_id", type: "text", required: true, unique: true, index: true, maxLength: 240, ...immutableField },
      { name: "idempotency_key", type: "text", required: true, index: true, maxLength: 240, ...immutableField },
      relationField("document", DOCUMENT_COLLECTION),
      relationField("document_revision", DOCUMENT_REVISION_COLLECTION),
      referenceField("document_ref", { required: true }),
      { name: "revision_number", type: "number", required: true, min: 1, ...immutableField },
      referenceField("signer_ref", { required: true }),
      referenceField("signer_role", { required: true, maxLength: 80 }),
      { name: "provider", type: "select", required: true, defaultValue: "internal", options: ["internal"], ...immutableField },
      referenceField("provider_request_ref"),
      {
        name: "status",
        type: "select",
        required: true,
        defaultValue: "provider_pending",
        options: [...SIGNATURE_REQUEST_STATUSES],
        ...immutableField,
      },
      referenceField("requested_by", { required: true, maxLength: 120 }),
      { name: "requested_at", type: "date", required: true, ...immutableField },
      { name: "expires_at", type: "date", ...immutableField },
      referenceField("provider_receipt_ref"),
      referenceField("failure_code", { maxLength: 120 }),
      {
        name: "status_history",
        type: "json",
        required: true,
        defaultValue: [],
        validate: validateDocumentReferences,
        admin: { readOnly: true },
      },
      { name: "status_updated_at", type: "date", required: true },
    ],
  },
];

export class DocumentStoreUnavailableError extends Error {
  constructor(message = "Document storage is temporarily unavailable", cause = null) {
    super(message);
    this.name = "DocumentStoreUnavailableError";
    this.code = "document_store_unavailable";
    this.status = 503;
    if (cause) this.cause = cause;
  }
}

function failure(message, status = 400, code = "invalid_document") {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function requiredText(value, label, maxLength = 240) {
  const text = String(value ?? "").trim();
  if (!text) throw failure(`${label} is required`);
  if (text.length > maxLength) throw failure(`${label} must be ${maxLength} characters or fewer`);
  return text;
}

function optionalText(value, label, maxLength = 240) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  return requiredText(value, label, maxLength);
}

function isoTimestamp(value, label, { required = false } = {}) {
  if (value === undefined || value === null || String(value).trim() === "") {
    if (!required) return null;
    throw failure(`${label} is required`);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw failure(`${label} must be an ISO timestamp`);
  return parsed.toISOString();
}

function nonNegativeNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw failure(`${label} must be a non-negative number`);
  return number;
}

function oneOf(value, label, values) {
  const normalized = requiredText(value, label, 80).toLowerCase();
  if (!values.includes(normalized)) throw failure(`${label} is invalid`);
  return normalized;
}

function principalRoles(principal) {
  const values = Array.isArray(principal?.roles) ? principal.roles : principal?.role ? [principal.role] : [];
  return [...new Set(values.map((value) => String(value || "").trim().toLowerCase()).filter(Boolean))];
}

function principalWorkspaces(principal) {
  const values = Array.isArray(principal?.workspace_ids)
    ? principal.workspace_ids
    : typeof principal?.workspace_ids === "string"
      ? principal.workspace_ids.split(",")
      : [];
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

export function documentWorkspaceAllowed(principal, workspaceId) {
  const workspace = String(workspaceId || "").trim();
  if (!workspace) return false;
  if (principalRoles(principal).includes("admin")) return true;
  return principalRoles(principal).includes("broker") && principalWorkspaces(principal).includes(workspace);
}

function assertActor(principal) {
  const actor = String(principal?.id || "").trim();
  if (!actor) throw failure("Document mutations require a named authenticated operator", 403, "operator_identity_required");
  if (!principalRoles(principal).some((role) => ["admin", "broker"].includes(role))) {
    throw failure("This operator cannot manage documents", 403, "forbidden");
  }
  return actor;
}

function assertWorkspace(principal, value) {
  const workspaceId = requiredText(value, "workspace_id", 160);
  if (!documentWorkspaceAllowed(principal, workspaceId)) {
    throw failure("The authenticated operator is not assigned to this document workspace", 403, "workspace_access_denied");
  }
  return workspaceId;
}

function assertReferences(value, label = "references") {
  if (!referenceOnly(value)) throw failure(`${label} must not contain document content or encoded binary data`);
  return value ?? null;
}

function assertStatus(status) {
  return oneOf(status, "status", SIGNATURE_REQUEST_STATUSES);
}

function assertPayloadRuntime(payload) {
  if (!payload || typeof payload.find !== "function" || typeof payload.create !== "function" || typeof payload.update !== "function") {
    throw new Error("Payload runtime cannot read and write document records");
  }
  return payload;
}

async function runtimePayload(payload) {
  try {
    if (payload) return assertPayloadRuntime(payload);
    if (!String(process.env.PAYLOAD_SECRET || "").trim() || !String(process.env.DATABASE_URL || "").trim()) {
      throw new Error("Payload document authority is not configured");
    }
    const [{ getPayload }, payloadConfigModule] = await Promise.all([import("payload"), import("../../payload.config.js")]);
    return assertPayloadRuntime(await getPayload({ config: await payloadConfigModule.default }));
  } catch (error) {
    throw new DocumentStoreUnavailableError(undefined, error);
  }
}

async function findRows(payload, collection, where, req = undefined) {
  try {
    const result = await payload.find({
      collection,
      depth: 0,
      overrideAccess: true,
      pagination: false,
      ...(where ? { where } : {}),
      ...(req ? { req } : {}),
    });
    if (!Array.isArray(result?.docs)) throw new Error(`Payload ${collection} query did not return documents`);
    return result.docs;
  } catch (error) {
    if (error instanceof DocumentStoreUnavailableError || error?.status) throw error;
    throw new DocumentStoreUnavailableError(`Document ${collection} lookup is unavailable`, error);
  }
}

async function findOne(payload, collection, where, req = undefined) {
  return (await findRows(payload, collection, where, req))[0] || null;
}

function workspaceWhere(workspaceId, clause = null) {
  return clause ? { and: [{ workspace_id: { equals: workspaceId } }, clause] } : { workspace_id: { equals: workspaceId } };
}

function byStableId(field, value, workspaceId = null) {
  return workspaceId ? workspaceWhere(workspaceId, { [field]: { equals: value } }) : { [field]: { equals: value } };
}

async function beginTransaction(payload) {
  if (typeof payload.db?.beginTransaction !== "function") return null;
  const transactionId = await payload.db.beginTransaction({ accessMode: "read write", isolationLevel: "serializable" });
  if (!transactionId) throw new Error("Payload database adapter did not open a transaction");
  return transactionId;
}

async function withTransaction(payload, callback) {
  const transactionId = await beginTransaction(payload);
  if (!transactionId) return callback(undefined);
  let committed = false;
  const req = { payload, transactionID: transactionId };
  try {
    const result = await callback(req);
    await payload.db.commitTransaction(transactionId);
    committed = true;
    return result;
  } finally {
    if (!committed) {
      try {
        await payload.db.rollbackTransaction(transactionId);
      } catch {
        // Preserve the original write failure.
      }
    }
  }
}

function relationId(value) {
  return String(value && typeof value === "object" ? value.id || "" : value || "").trim();
}

function documentRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    document_id: String(row.document_id || ""),
    workspace_id: String(row.workspace_id || ""),
    idempotency_key: String(row.idempotency_key || ""),
    document_type: String(row.document_type || ""),
    title: String(row.title || ""),
    subject_type: String(row.subject_type || ""),
    subject_ref: String(row.subject_ref || ""),
    case_id: relationId(row.case) || null,
    source: String(row.source || ""),
    storage_ref: String(row.storage_ref || ""),
    mime_type: String(row.mime_type || ""),
    byte_size: Number(row.byte_size),
    content_digest: String(row.content_digest || ""),
    retention_class: String(row.retention_class || ""),
    status: String(row.status || ""),
    valid_from: row.valid_from || null,
    valid_until: row.valid_until || null,
    current_revision_number: Number(row.current_revision_number),
    current_revision_id: String(row.current_revision_id || ""),
    current_storage_ref: String(row.current_storage_ref || ""),
    current_mime_type: String(row.current_mime_type || ""),
    current_byte_size: Number(row.current_byte_size),
    current_content_digest: String(row.current_content_digest || ""),
    created_by: String(row.created_by || ""),
    createdAt: row.createdAt || null,
    updatedAt: row.updatedAt || null,
  };
}

function revisionRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    revision_id: String(row.revision_id || ""),
    workspace_id: String(row.workspace_id || ""),
    document_id: String(row.document_ref || ""),
    document_payload_id: relationId(row.document) || null,
    idempotency_key: String(row.idempotency_key || ""),
    revision_number: Number(row.revision_number),
    document_type: String(row.document_type || ""),
    title: String(row.title || ""),
    storage_ref: String(row.storage_ref || ""),
    mime_type: String(row.mime_type || ""),
    byte_size: Number(row.byte_size),
    content_digest: String(row.content_digest || ""),
    change_reason: String(row.change_reason || ""),
    metadata_refs: row.metadata_refs || null,
    created_by: String(row.created_by || ""),
    revision_recorded_at: row.revision_recorded_at || null,
    createdAt: row.createdAt || null,
  };
}

function signatureRequestRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    request_id: String(row.request_id || ""),
    workspace_id: String(row.workspace_id || ""),
    document_id: String(row.document_ref || ""),
    document_payload_id: relationId(row.document) || null,
    document_revision_payload_id: relationId(row.document_revision) || null,
    revision_number: Number(row.revision_number),
    idempotency_key: String(row.idempotency_key || ""),
    signer_ref: String(row.signer_ref || ""),
    signer_role: String(row.signer_role || ""),
    provider: String(row.provider || "internal"),
    provider_request_ref: row.provider_request_ref || null,
    status: String(row.status || "provider_pending"),
    requested_by: String(row.requested_by || ""),
    requested_at: row.requested_at || null,
    expires_at: row.expires_at || null,
    provider_receipt_ref: row.provider_receipt_ref || null,
    failure_code: row.failure_code || null,
    status_history: Array.isArray(row.status_history) ? row.status_history : [],
    status_updated_at: row.status_updated_at || null,
    createdAt: row.createdAt || null,
    updatedAt: row.updatedAt || null,
  };
}

function inputRevision(input, fallback = {}) {
  const nested = input?.revision && typeof input.revision === "object" && !Array.isArray(input.revision) ? input.revision : {};
  const source = { ...fallback, ...input, ...nested };
  const storageRef = requiredText(source.storage_ref, "storage_ref");
  const storageRefError = validateOpaqueStorageReference(storageRef);
  if (storageRefError !== true) throw failure(storageRefError);
  return {
    storage_ref: storageRef,
    mime_type: requiredText(source.mime_type, "mime_type", 160),
    byte_size: nonNegativeNumber(source.byte_size, "byte_size"),
    content_digest: requiredText(source.content_digest, "content_digest", 160),
    change_reason: requiredText(source.change_reason || "initial", "change_reason"),
    metadata_refs: assertReferences(source.metadata_refs, "metadata_refs"),
  };
}

function documentInput(input, principal, recordedAt) {
  assertReferences(input, "document request");
  const workspaceId = assertWorkspace(principal, input?.workspace_id || input?.workspaceId);
  const actor = assertActor(principal);
  const idempotencyKey = requiredText(input?.idempotency_key || input?.idempotencyKey, "idempotency_key");
  const documentId = optionalText(input?.document_id || input?.documentId, "document_id", 160) || `doc-${randomUUID()}`;
  return {
    workspace_id: workspaceId,
    document_id: documentId,
    idempotency_key: idempotencyKey,
    document_type: oneOf(input?.document_type || input?.documentType, "document_type", DOCUMENT_TYPES),
    title: requiredText(input?.title, "title"),
    subject_type: requiredText(input?.subject_type || input?.subjectType, "subject_type", 80),
    subject_ref: requiredText(input?.subject_ref || input?.subjectRef, "subject_ref"),
    case_ref: optionalText(input?.case_id || input?.caseId || input?.case, "case_id"),
    source: oneOf(input?.source, "source", DOCUMENT_SOURCES),
    retention_class: oneOf(input?.retention_class || input?.retentionClass, "retention_class", DOCUMENT_RETENTION_CLASSES),
    status: oneOf(input?.status || "active", "status", DOCUMENT_STATUSES),
    valid_from: isoTimestamp(input?.valid_from || input?.validFrom, "valid_from"),
    valid_until: isoTimestamp(input?.valid_until || input?.validUntil, "valid_until"),
    created_by: actor,
    recorded_at: isoTimestamp(recordedAt || new Date().toISOString(), "recorded_at", { required: true }),
    revision: inputRevision(input),
  };
}

async function assertCaseWorkspace(payload, caseRef, workspaceId, req) {
  if (!caseRef) return null;
  const row = await findOne(payload, "realty_cases", byStableId("case_id", caseRef, workspaceId), req);
  if (!row) throw failure("The document case reference is not in the selected workspace", 403, "workspace_access_denied");
  return row.id;
}

async function findDocument(payload, documentId, principal, req) {
  const id = requiredText(documentId, "document_id", 160);
  const roles = principalRoles(principal);
  if (!roles.some((role) => ["admin", "broker"].includes(role))) throw failure("This operator cannot read documents", 403, "forbidden");
  if (!roles.includes("admin") && !principalWorkspaces(principal).length) {
    throw failure("The operator has no document workspace", 403, "workspace_access_denied");
  }
  const where = roles.includes("admin")
    ? byStableId("document_id", id)
    : {
        and: [
          { document_id: { equals: id } },
          { workspace_id: { in: principalWorkspaces(principal) } },
        ],
      };
  const rows = await findRows(payload, DOCUMENT_COLLECTION, where, req);
  const row = rows[0] || null;
  return row;
}

async function findRevision(payload, documentId, revisionNumber, workspaceId, req) {
  return findOne(
    payload,
    DOCUMENT_REVISION_COLLECTION,
    workspaceWhere(workspaceId, {
      and: [
        { document_ref: { equals: documentId } },
        { revision_number: { equals: revisionNumber } },
      ],
    }),
    req,
  );
}

export async function readDocuments({ payload = null, principal, workspaceId = null } = {}) {
  const runtime = await runtimePayload(payload);
  const roles = principalRoles(principal);
  if (!roles.some((role) => ["admin", "broker"].includes(role))) throw failure("This operator cannot read documents", 403, "forbidden");
  let where = null;
  if (workspaceId) {
    const scope = assertWorkspace(principal, workspaceId);
    where = workspaceWhere(scope);
  } else if (!roles.includes("admin")) {
    const scopes = principalWorkspaces(principal);
    if (!scopes.length) throw failure("The operator has no document workspace", 403, "workspace_access_denied");
    where = { workspace_id: { in: scopes } };
  }
  const rows = await findRows(runtime, DOCUMENT_COLLECTION, where || undefined);
  return rows.map(documentRow);
}

export async function readDocument({ payload = null, principal, documentId } = {}) {
  const runtime = await runtimePayload(payload);
  const row = await findDocument(runtime, documentId, principal);
  if (!row) throw failure("Document was not found", 404, "document_not_found");
  return documentRow(row);
}

export async function createDocument({ payload = null, principal, input = {}, recordedAt = null } = {}) {
  const runtime = await runtimePayload(payload);
  const normalized = documentInput(input, principal, recordedAt);
  return withTransaction(runtime, async (req) => {
    const existing = await findOne(runtime, DOCUMENT_COLLECTION, workspaceWhere(normalized.workspace_id, {
      idempotency_key: { equals: normalized.idempotency_key },
    }), req);
    if (existing) return { document: documentRow(existing), revision: null, idempotent: true, provider_status: null };
    const duplicate = await findOne(runtime, DOCUMENT_COLLECTION, byStableId("document_id", normalized.document_id), req);
    if (duplicate) throw failure("document_id already belongs to another document", 409, "document_conflict");
    const casePayloadId = await assertCaseWorkspace(runtime, normalized.case_ref, normalized.workspace_id, req);
    const revisionId = `${normalized.document_id}:r1`;
    const document = await runtime.create({
      collection: DOCUMENT_COLLECTION,
      overrideAccess: true,
      ...(req ? { req } : {}),
      data: {
        workspace_id: normalized.workspace_id,
        document_id: normalized.document_id,
        idempotency_key: normalized.idempotency_key,
        document_type: normalized.document_type,
        title: normalized.title,
        subject_type: normalized.subject_type,
        subject_ref: normalized.subject_ref,
        ...(casePayloadId ? { case: casePayloadId } : {}),
        source: normalized.source,
        storage_ref: normalized.revision.storage_ref,
        mime_type: normalized.revision.mime_type,
        byte_size: normalized.revision.byte_size,
        content_digest: normalized.revision.content_digest,
        retention_class: normalized.retention_class,
        status: normalized.status,
        valid_from: normalized.valid_from,
        valid_until: normalized.valid_until,
        current_revision_number: 1,
        current_revision_id: revisionId,
        current_storage_ref: normalized.revision.storage_ref,
        current_mime_type: normalized.revision.mime_type,
        current_byte_size: normalized.revision.byte_size,
        current_content_digest: normalized.revision.content_digest,
        created_by: normalized.created_by,
      },
    });
    const revision = await runtime.create({
      collection: DOCUMENT_REVISION_COLLECTION,
      overrideAccess: true,
      ...(req ? { req } : {}),
      data: {
        workspace_id: normalized.workspace_id,
        document: document.id,
        document_ref: normalized.document_id,
        revision_id: revisionId,
        idempotency_key: `${normalized.idempotency_key}:r1`,
        revision_number: 1,
        document_type: normalized.document_type,
        title: normalized.title,
        storage_ref: normalized.revision.storage_ref,
        mime_type: normalized.revision.mime_type,
        byte_size: normalized.revision.byte_size,
        content_digest: normalized.revision.content_digest,
        change_reason: normalized.revision.change_reason,
        metadata_refs: normalized.revision.metadata_refs,
        created_by: normalized.created_by,
        revision_recorded_at: normalized.recorded_at,
      },
    });
    return { document: documentRow(document), revision: revisionRow(revision), idempotent: false, provider_status: null };
  }).catch((error) => {
    if (error?.status) throw error;
    throw new DocumentStoreUnavailableError("Document storage rejected the document", error);
  });
}

export async function readDocumentRevisions({ payload = null, principal, documentId } = {}) {
  const runtime = await runtimePayload(payload);
  const document = await findDocument(runtime, documentId, principal);
  if (!document) throw failure("Document was not found", 404, "document_not_found");
  const rows = await findRows(runtime, DOCUMENT_REVISION_COLLECTION, workspaceWhere(document.workspace_id, {
    document_ref: { equals: document.document_id },
  }));
  return rows.sort((left, right) => Number(left.revision_number) - Number(right.revision_number)).map(revisionRow);
}

export async function createDocumentRevision({ payload = null, principal, documentId, input = {}, recordedAt = null } = {}) {
  const runtime = await runtimePayload(payload);
  assertReferences(input, "revision request");
  const actor = assertActor(principal);
  const idempotencyKey = requiredText(input?.idempotency_key || input?.idempotencyKey, "idempotency_key");
  const requestedRevisionValue = input?.revision_number ?? input?.revisionNumber;
  const requestedRevision = requestedRevisionValue === undefined ? undefined : Number(requestedRevisionValue);
  const recorded = isoTimestamp(recordedAt || new Date().toISOString(), "revision_recorded_at", { required: true });
  return withTransaction(runtime, async (req) => {
    const document = await findDocument(runtime, documentId, principal, req);
    if (!document) throw failure("Document was not found", 404, "document_not_found");
    const existing = await findOne(runtime, DOCUMENT_REVISION_COLLECTION, workspaceWhere(document.workspace_id, {
      idempotency_key: { equals: idempotencyKey },
    }), req);
    if (existing) return { document: documentRow(document), revision: revisionRow(existing), idempotent: true };
    const revision = inputRevision(input, document);
    const nextNumber = Number(document.current_revision_number) + 1;
    if (requestedRevision !== undefined && Number(requestedRevision) !== nextNumber) {
      throw failure(`revision_number must be ${nextNumber}`, 409, "revision_conflict");
    }
    const revisionId = optionalText(input?.revision_id || input?.revisionId, "revision_id", 240) || `${document.document_id}:r${nextNumber}`;
    const created = await runtime.create({
      collection: DOCUMENT_REVISION_COLLECTION,
      overrideAccess: true,
      ...(req ? { req } : {}),
      data: {
        workspace_id: document.workspace_id,
        document: document.id,
        document_ref: document.document_id,
        revision_id: revisionId,
        idempotency_key: idempotencyKey,
        revision_number: nextNumber,
        document_type: document.document_type,
        title: document.title,
        storage_ref: revision.storage_ref,
        mime_type: revision.mime_type,
        byte_size: revision.byte_size,
        content_digest: revision.content_digest,
        change_reason: revision.change_reason,
        metadata_refs: revision.metadata_refs,
        created_by: actor,
        revision_recorded_at: recorded,
      },
    });
    const updated = await runtime.update({
      collection: DOCUMENT_COLLECTION,
      id: document.id,
      overrideAccess: true,
      ...(req ? { req } : {}),
      data: {
        current_revision_number: nextNumber,
        current_revision_id: revisionId,
        current_storage_ref: revision.storage_ref,
        current_mime_type: revision.mime_type,
        current_byte_size: revision.byte_size,
        current_content_digest: revision.content_digest,
        storage_ref: revision.storage_ref,
        mime_type: revision.mime_type,
        byte_size: revision.byte_size,
        content_digest: revision.content_digest,
      },
    });
    return { document: documentRow(updated), revision: revisionRow(created), idempotent: false };
  }).catch((error) => {
    if (error?.status) throw error;
    throw new DocumentStoreUnavailableError("Document storage rejected the revision", error);
  });
}

function signatureInput(input, principal, document, revision, recordedAt) {
  const actor = assertActor(principal);
  const provider = String(input?.provider || "internal").trim().toLowerCase();
  if (provider !== "internal") throw failure("External signature providers are not configured", 503, "signature_provider_unavailable");
  const requested = isoTimestamp(recordedAt || new Date().toISOString(), "requested_at", { required: true });
  return {
    workspace_id: document.workspace_id,
    request_id: optionalText(input?.request_id || input?.requestId, "request_id", 240) || `sig-${randomUUID()}`,
    idempotency_key: requiredText(input?.idempotency_key || input?.idempotencyKey, "idempotency_key"),
    document: document.id,
    document_revision: revision.id,
    document_ref: document.document_id,
    revision_number: Number(revision.revision_number),
    signer_ref: requiredText(input?.signer_ref || input?.signerRef, "signer_ref"),
    signer_role: requiredText(input?.signer_role || input?.signerRole, "signer_role", 80),
    provider: "internal",
    provider_request_ref: null,
    status: "provider_pending",
    requested_by: actor,
    requested_at: requested,
    expires_at: isoTimestamp(input?.expires_at || input?.expiresAt, "expires_at"),
    provider_receipt_ref: null,
    failure_code: null,
    status_history: [{ status: "provider_pending", recorded_at: requested, actor }],
    status_updated_at: requested,
  };
}

export async function readSignatureRequests({ payload = null, principal, documentId = null } = {}) {
  const runtime = await runtimePayload(payload);
  const roles = principalRoles(principal);
  if (!roles.some((role) => ["admin", "broker"].includes(role))) throw failure("This operator cannot read signature requests", 403, "forbidden");
  let where = null;
  if (documentId) {
    const document = await findDocument(runtime, documentId, principal);
    if (!document) return [];
    where = workspaceWhere(document.workspace_id, { document_ref: { equals: document.document_id } });
  } else if (!roles.includes("admin")) {
    const scopes = principalWorkspaces(principal);
    if (!scopes.length) throw failure("The operator has no signature-request workspace", 403, "workspace_access_denied");
    where = { workspace_id: { in: scopes } };
  }
  const rows = await findRows(runtime, SIGNATURE_REQUEST_COLLECTION, where || undefined);
  return rows.map(signatureRequestRow);
}

export async function createSignatureRequest({ payload = null, principal, input = {}, recordedAt = null } = {}) {
  const runtime = await runtimePayload(payload);
  assertReferences(input, "signature request");
  const document = await findDocument(runtime, input?.document_id || input?.documentId, principal);
  if (!document) throw failure("Document was not found", 404, "document_not_found");
  const revisionValue = input?.revision_number ?? input?.revisionNumber;
  const revisionNumber = Number(revisionValue === undefined ? document.current_revision_number : revisionValue);
  if (!Number.isInteger(revisionNumber) || revisionNumber < 1) throw failure("revision_number must be a positive integer");
  const revision = await findRevision(runtime, document.document_id, revisionNumber, document.workspace_id);
  if (!revision) throw failure("Document revision was not found", 404, "document_revision_not_found");
  const normalized = signatureInput(input, principal, document, revision, recordedAt);
  return withTransaction(runtime, async (req) => {
    const existing = await findOne(runtime, SIGNATURE_REQUEST_COLLECTION, workspaceWhere(normalized.workspace_id, {
      idempotency_key: { equals: normalized.idempotency_key },
    }), req);
    if (existing) return { request: signatureRequestRow(existing), idempotent: true, provider_pending: existing.status === "provider_pending" };
    const duplicate = await findOne(runtime, SIGNATURE_REQUEST_COLLECTION, byStableId("request_id", normalized.request_id), req);
    if (duplicate) throw failure("request_id already belongs to another signature request", 409, "signature_request_conflict");
    const created = await runtime.create({
      collection: SIGNATURE_REQUEST_COLLECTION,
      overrideAccess: true,
      ...(req ? { req } : {}),
      data: normalized,
    });
    return {
      request: signatureRequestRow(created),
      idempotent: false,
      provider_pending: true,
      provider_status: "pending",
      external_dispatch: false,
    };
  }).catch((error) => {
    if (error?.status) throw error;
    throw new DocumentStoreUnavailableError("Signature request storage rejected the request", error);
  });
}

const STATUS_TRANSITIONS = Object.freeze({
  provider_pending: new Set(["provider_pending", "signed", "declined", "expired", "cancelled", "failed"]),
  signed: new Set(["signed"]),
  declined: new Set(["declined"]),
  expired: new Set(["expired"]),
  cancelled: new Set(["cancelled"]),
  failed: new Set(["failed"]),
});

export async function updateSignatureRequestStatus({ payload = null, principal, requestId, input = {}, recordedAt = null } = {}) {
  const runtime = await runtimePayload(payload);
  const actor = assertActor(principal);
  const status = assertStatus(input?.status);
  const updatedAt = isoTimestamp(recordedAt || new Date().toISOString(), "status_updated_at", { required: true });
  const receipt = optionalText(input?.provider_receipt_ref || input?.providerReceiptRef, "provider_receipt_ref");
  const roles = principalRoles(principal);
  const scopes = principalWorkspaces(principal);
  if (!roles.includes("admin") && !scopes.length) {
    throw failure("The operator has no signature-request workspace", 403, "workspace_access_denied");
  }
  const requestWhere = roles.includes("admin")
    ? byStableId("request_id", requestId)
    : {
        and: [
          { request_id: { equals: requestId } },
          { workspace_id: { in: scopes } },
        ],
      };
  return withTransaction(runtime, async (req) => {
    const request = await findOne(runtime, SIGNATURE_REQUEST_COLLECTION, requestWhere, req);
    if (!request) throw failure("Signature request was not found", 404, "signature_request_not_found");
    const current = assertStatus(request.status);
    if (!STATUS_TRANSITIONS[current]?.has(status)) {
      throw failure(`Cannot move signature request from ${current} to ${status}`, 409, "signature_status_conflict");
    }
    if (status === current) return { request: signatureRequestRow(request), idempotent: true };
    if (status === "signed" && !receipt) {
      throw failure("A provider receipt is required before a signature can be marked signed", 409, "signature_receipt_required");
    }
    const history = Array.isArray(request.status_history) ? request.status_history : [];
    const updated = await runtime.update({
      collection: SIGNATURE_REQUEST_COLLECTION,
      id: request.id,
      overrideAccess: true,
      ...(req ? { req } : {}),
      data: {
        status,
        ...(receipt ? { provider_receipt_ref: receipt } : {}),
        ...(status === "failed"
          ? { failure_code: optionalText(input?.failure_code || input?.failureCode, "failure_code", 120) }
          : {}),
        status_history: [...history, { status, recorded_at: updatedAt, actor, ...(receipt ? { provider_receipt_ref: receipt } : {}) }],
        status_updated_at: updatedAt,
      },
    });
    return { request: signatureRequestRow(updated), idempotent: false, provider_pending: status === "provider_pending" };
  }).catch((error) => {
    if (error?.status) throw error;
    throw new DocumentStoreUnavailableError("Signature request storage rejected the status update", error);
  });
}
