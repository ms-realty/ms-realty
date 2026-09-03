import { createHash } from "node:crypto";

// A document row carries a storage reference, a size and a digest, and until
// now all three were whatever the caller typed: "sha256:contract-r1" was
// accepted as a digest. Bytes never went anywhere. This module is where they
// go -- the same private object store the media uploads use -- and the triple
// the row carries is computed here from the bytes, then checked against the
// store again before a row that quotes it may be written.

export const DOCUMENT_STORAGE_PREFIX = "wp-content/private/documents";
export const DOCUMENT_STORAGE_SCHEME = "doc://";
export const DOCUMENT_MAX_BYTES = 25 * 1024 * 1024;

// What a document may be. Images are here because a scanned identity page or
// a signed sheet arrives as a photo; office formats are not, because the
// workspace never renders them and an unrenderable upload is an unreviewable
// one.
export const DOCUMENT_MIME_TYPES = Object.freeze({
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
});

export class DocumentStorageError extends Error {
  constructor(message, { status = 400, code = "document_storage_rejected" } = {}) {
    super(message);
    this.name = "DocumentStorageError";
    this.status = status;
    this.code = code;
  }
}

function workspaceSegment(value) {
  const text = String(value ?? "").trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(text)) {
    throw new DocumentStorageError("Document bytes need a workspace id", { code: "workspace_required" });
  }
  return text;
}

export function documentContentDigest(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

// Content-addressed: the key is the bytes' own digest, so the same file stored
// twice lands once, and a reference cannot be minted without the bytes that
// hash to it.
export function documentStorageKey({ workspaceId, contentDigest, mimeType }) {
  const ext = DOCUMENT_MIME_TYPES[mimeType];
  if (!ext) throw new DocumentStorageError(`Documents must be one of ${Object.keys(DOCUMENT_MIME_TYPES).join(", ")}`, { code: "unsupported_mime_type" });
  const hex = String(contentDigest || "").replace(/^sha256:/, "");
  if (!/^[0-9a-f]{64}$/.test(hex)) throw new DocumentStorageError("Document digest must be a sha256 hex digest");
  return `${DOCUMENT_STORAGE_PREFIX}/${workspaceSegment(workspaceId)}/${hex}.${ext}`;
}

export function documentStorageRef(key) {
  return `${DOCUMENT_STORAGE_SCHEME}${key}`;
}

export function documentStorageKeyFromRef(storageRef) {
  const text = String(storageRef ?? "").trim();
  if (!text.startsWith(DOCUMENT_STORAGE_SCHEME)) return null;
  const key = text.slice(DOCUMENT_STORAGE_SCHEME.length);
  return key.startsWith(`${DOCUMENT_STORAGE_PREFIX}/`) && !key.includes("..") ? key : null;
}

function normalizedMimeType(value) {
  const text = String(value ?? "").trim().toLowerCase().split(";")[0];
  if (!DOCUMENT_MIME_TYPES[text]) {
    throw new DocumentStorageError(`Documents must be one of ${Object.keys(DOCUMENT_MIME_TYPES).join(", ")}`, { code: "unsupported_mime_type" });
  }
  return text;
}

export async function storeDocumentBytes({ storage, workspaceId, bytes, mimeType, maxBytes = DOCUMENT_MAX_BYTES } = {}) {
  if (!storage || typeof storage.put !== "function") throw new DocumentStorageError("Document storage is not configured", { status: 503, code: "document_storage_unavailable" });
  if (!Buffer.isBuffer(bytes) || bytes.length === 0) throw new DocumentStorageError("Document bytes are required", { code: "document_bytes_required" });
  if (bytes.length > maxBytes) throw new DocumentStorageError(`A document must be ${Math.floor(maxBytes / (1024 * 1024))} MB or smaller`, { status: 413, code: "document_too_large" });
  const mime = normalizedMimeType(mimeType);
  const contentDigest = documentContentDigest(bytes);
  const key = documentStorageKey({ workspaceId, contentDigest, mimeType: mime });
  await storage.put({ key, bytes, contentType: mime });
  return {
    storage_ref: documentStorageRef(key),
    mime_type: mime,
    byte_size: bytes.length,
    content_digest: contentDigest,
  };
}

// The check that makes the row true: the bytes the reference names exist,
// and they are the size and the digest the row claims. A row that quotes a
// reference this store does not hold, or a digest that is not the digest of
// those bytes, is refused before it is written.
export async function verifyStoredDocumentBytes({ storage, storage_ref, byte_size, content_digest } = {}) {
  if (!storage || typeof storage.read !== "function") throw new DocumentStorageError("Document storage is not configured", { status: 503, code: "document_storage_unavailable" });
  const key = documentStorageKeyFromRef(storage_ref);
  if (!key) throw new DocumentStorageError("storage_ref must name bytes stored through the document bytes endpoint", { code: "storage_ref_unverifiable" });
  let bytes;
  try {
    bytes = await storage.read(key);
  } catch (error) {
    if (error?.code === "not_found") throw new DocumentStorageError("storage_ref names bytes this store does not hold", { status: 404, code: "document_bytes_missing" });
    throw error;
  }
  if (Number(byte_size) !== bytes.length) {
    throw new DocumentStorageError(`byte_size says ${byte_size} but the stored document is ${bytes.length} bytes`, { status: 409, code: "document_bytes_mismatch" });
  }
  const digest = documentContentDigest(bytes);
  if (String(content_digest) !== digest) {
    throw new DocumentStorageError("content_digest is not the digest of the stored document", { status: 409, code: "document_bytes_mismatch" });
  }
  return { key, byte_size: bytes.length, content_digest: digest };
}
