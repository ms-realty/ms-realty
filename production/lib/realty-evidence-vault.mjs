import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fromRoot } from "./paths.mjs";

export const DEFAULT_REALTY_EVIDENCE_VAULT_PATH = fromRoot("production", "data", "realty-evidence-vault.jsonl");
export const REALTY_EVIDENCE_VAULT_KEY_ENV = "MS_REALTY_EVIDENCE_VAULT_KEY";

const SCHEMA_VERSION = 1;
const MAX_PAYLOAD_BYTES = 25 * 1024 * 1024;
const PAYLOAD_ENCODINGS = new Set(["utf8", "bytes"]);

function requiredText(value, label, max = 240) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${label} is required`);
  if (text.length > max) throw new Error(`${label} must be ${max} characters or fewer`);
  if (/[\u0000-\u001f\u007f]/.test(text)) throw new Error(`${label} must not contain control characters`);
  return text;
}

function optionalText(value, label, max = 240) {
  if (value === undefined || value === null || value === "") return null;
  return requiredText(value, label, max);
}

function isoTimestamp(value, label) {
  const text = requiredText(value, label, 80);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(text) || Number.isNaN(Date.parse(text))) {
    throw new Error(`${label} must be an ISO timestamp`);
  }
  return new Date(text).toISOString();
}

function normalizedScope(value, label = "Evidence access scope") {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} requires a workspace id and case id`);
  }
  return {
    workspace_id: requiredText(value.workspaceId ?? value.workspace_id, `${label} workspace id`, 120),
    case_id: requiredText(value.caseId ?? value.case_id, `${label} case id`, 240),
  };
}

function normalizedRetention(value, issuedAt) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Evidence retention metadata is required");
  }
  const allowed = new Set(["retainUntil", "retain_until", "policyRef", "policy_ref", "legalHold", "legal_hold"]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`Evidence retention metadata field is not allowed: ${key}`);
  }
  const retainUntil = isoTimestamp(value.retainUntil ?? value.retain_until, "Evidence retention retainUntil");
  if (Date.parse(retainUntil) < Date.parse(issuedAt)) {
    throw new Error("Evidence retention retainUntil must not precede issuedAt");
  }
  const legalHold = value.legalHold ?? value.legal_hold ?? false;
  if (typeof legalHold !== "boolean") throw new Error("Evidence retention legalHold must be boolean");
  return {
    retain_until: retainUntil,
    policy_ref: optionalText(value.policyRef ?? value.policy_ref, "Evidence retention policyRef", 160),
    legal_hold: legalHold,
  };
}

function payloadFrom(input) {
  const candidates = [
    ["payload", input.payload],
    ["payloadText", input.payloadText],
    ["payloadBytes", input.payloadBytes],
  ].filter(([key, value]) => Object.hasOwn(input, key) && value !== undefined);
  if (candidates.length !== 1) throw new Error("Evidence vault requires exactly one payload, payloadText, or payloadBytes value");

  const [field, value] = candidates[0];
  let bytes;
  let encoding;
  if (typeof value === "string") {
    bytes = Buffer.from(value, "utf8");
    encoding = "utf8";
  } else if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    bytes = Buffer.from(value);
    encoding = "bytes";
  } else {
    throw new Error(`${field} must be text or bytes`);
  }
  if (bytes.length > MAX_PAYLOAD_BYTES) throw new Error("Evidence payload exceeds the local vault size limit");
  return { bytes, encoding };
}

function canonicalDigest(value, bytes) {
  const actual = crypto.createHash("sha256").update(bytes).digest("hex");
  if (value === undefined || value === null || value === "") return `sha256:${actual}`;
  const supplied = String(value).trim().toLowerCase().replace(/^sha256:/, "");
  if (!/^[a-f0-9]{64}$/.test(supplied)) throw new Error("Evidence digest must be a SHA-256 hex digest");
  if (!crypto.timingSafeEqual(Buffer.from(supplied, "hex"), Buffer.from(actual, "hex"))) {
    throw new Error("Evidence digest does not match the supplied payload");
  }
  return `sha256:${actual}`;
}

function assertedStoredDigest(value) {
  const text = requiredText(value, "Evidence digest", 80).toLowerCase();
  if (!/^sha256:[a-f0-9]{64}$/.test(text)) throw new Error("Evidence vault row has an invalid digest");
  return text;
}

function metadataFromInput(input, { storedAt } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Evidence vault input is required");
  const allowed = new Set([
    "workspaceId",
    "workspace_id",
    "caseId",
    "case_id",
    "ref",
    "evidenceRef",
    "evidence_ref",
    "type",
    "evidenceType",
    "evidence_type",
    "producerKind",
    "producer_kind",
    "digest",
    "issuedAt",
    "issued_at",
    "retention",
    "accessScope",
    "access_scope",
    "payload",
    "payloadText",
    "payloadBytes",
  ]);
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) throw new Error(`Evidence vault field is not allowed: ${key}`);
  }
  const issuedAt = isoTimestamp(input.issuedAt ?? input.issued_at, "Evidence issuedAt");
  const payload = payloadFrom(input);
  return {
    workspace_id: requiredText(input.workspaceId ?? input.workspace_id, "Evidence workspace id", 120),
    case_id: requiredText(input.caseId ?? input.case_id, "Evidence case id", 240),
    evidence_ref: requiredText(input.evidenceRef ?? input.evidence_ref ?? input.ref, "Evidence ref", 240),
    evidence_type: requiredText(input.evidenceType ?? input.evidence_type ?? input.type, "Evidence type", 120),
    producer_kind: requiredText(input.producerKind ?? input.producer_kind, "Evidence producer kind", 40),
    digest: canonicalDigest(input.digest, payload.bytes),
    issued_at: issuedAt,
    stored_at: isoTimestamp(storedAt ?? new Date().toISOString(), "Evidence storedAt"),
    retention: normalizedRetention(input.retention, issuedAt),
    payload_encoding: payload.encoding,
    payload,
  };
}

function metadataFromStoredRow(row) {
  if (!row || typeof row !== "object" || Array.isArray(row) || row.schema_version !== SCHEMA_VERSION) {
    throw new Error("Evidence vault row is invalid");
  }
  const issuedAt = isoTimestamp(row.issued_at, "Evidence issuedAt");
  const storedAt = isoTimestamp(row.stored_at, "Evidence storedAt");
  const retention = normalizedRetention(row.retention, issuedAt);
  if (JSON.stringify(retention) !== JSON.stringify(row.retention)) throw new Error("Evidence vault row has invalid retention metadata");
  if (!PAYLOAD_ENCODINGS.has(row.payload_encoding)) throw new Error("Evidence vault row has an invalid payload encoding");
  return {
    workspace_id: requiredText(row.workspace_id, "Evidence workspace id", 120),
    case_id: requiredText(row.case_id, "Evidence case id", 240),
    evidence_ref: requiredText(row.evidence_ref, "Evidence ref", 240),
    evidence_type: requiredText(row.evidence_type, "Evidence type", 120),
    producer_kind: requiredText(row.producer_kind, "Evidence producer kind", 40),
    digest: assertedStoredDigest(row.digest),
    issued_at: issuedAt,
    stored_at: storedAt,
    retention,
    payload_encoding: row.payload_encoding,
  };
}

function metadataForReturn(metadata, { idempotent } = {}) {
  const result = {
    workspace_id: metadata.workspace_id,
    case_id: metadata.case_id,
    ref: metadata.evidence_ref,
    type: metadata.evidence_type,
    producer_kind: metadata.producer_kind,
    digest: metadata.digest,
    issued_at: metadata.issued_at,
    stored_at: metadata.stored_at,
    retention: { ...metadata.retention },
    encrypted: true,
  };
  return idempotent === undefined ? result : { ...result, idempotent };
}

function encryptionKey(options = {}) {
  const { secret, env = process.env } = options;
  const configured = Object.hasOwn(options, "secret") ? secret : env?.[REALTY_EVIDENCE_VAULT_KEY_ENV];
  const value = String(configured ?? "");
  if (value.length < 32) {
    throw new Error(`${REALTY_EVIDENCE_VAULT_KEY_ENV} must be at least 32 characters`);
  }
  return crypto.createHash("sha256").update(value).digest();
}

function aad(metadata) {
  return Buffer.from(
    JSON.stringify({
      schema_version: SCHEMA_VERSION,
      workspace_id: metadata.workspace_id,
      case_id: metadata.case_id,
      evidence_ref: metadata.evidence_ref,
      evidence_type: metadata.evidence_type,
      producer_kind: metadata.producer_kind,
      digest: metadata.digest,
      issued_at: metadata.issued_at,
      stored_at: metadata.stored_at,
      retention: metadata.retention,
      payload_encoding: metadata.payload_encoding,
    }),
    "utf8",
  );
}

function base64(value, label, expectedBytes = null) {
  if (typeof value !== "string") throw new Error(`Evidence vault row has an invalid ${label}`);
  const decoded = Buffer.from(value, "base64");
  if (decoded.toString("base64") !== value || (expectedBytes !== null && decoded.length !== expectedBytes)) {
    throw new Error(`Evidence vault row has an invalid ${label}`);
  }
  return decoded;
}

function encryptedRow(metadata, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(aad(metadata));
  const ciphertext = Buffer.concat([cipher.update(metadata.payload.bytes), cipher.final()]);
  return {
    schema_version: SCHEMA_VERSION,
    workspace_id: metadata.workspace_id,
    case_id: metadata.case_id,
    evidence_ref: metadata.evidence_ref,
    evidence_type: metadata.evidence_type,
    producer_kind: metadata.producer_kind,
    digest: metadata.digest,
    issued_at: metadata.issued_at,
    stored_at: metadata.stored_at,
    retention: metadata.retention,
    payload_encoding: metadata.payload_encoding,
    algorithm: "aes-256-gcm",
    iv: iv.toString("base64"),
    auth_tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

function validateEncryptedRow(row) {
  const metadata = metadataFromStoredRow(row);
  if (row.algorithm !== "aes-256-gcm") throw new Error("Evidence vault row has an invalid algorithm");
  base64(row.iv, "initialization vector", 12);
  base64(row.auth_tag, "authentication tag", 16);
  base64(row.ciphertext, "ciphertext");
  return metadata;
}

function decryptPayload(row, metadata, key) {
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, base64(row.iv, "initialization vector", 12));
  decipher.setAAD(aad(metadata));
  decipher.setAuthTag(base64(row.auth_tag, "authentication tag", 16));
  const plaintext = Buffer.concat([decipher.update(base64(row.ciphertext, "ciphertext")), decipher.final()]);
  canonicalDigest(metadata.digest, plaintext);
  return plaintext;
}

function safeVaultFile(filePath) {
  const target = requiredText(filePath, "Evidence vault path", 2000);
  if (!fs.existsSync(target)) return target;
  const stat = fs.lstatSync(target);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Evidence vault path must be a regular file");
  return target;
}

function readRows(filePath) {
  const target = safeVaultFile(filePath);
  if (!fs.existsSync(target)) return [];
  const rows = [];
  const seen = new Set();
  for (const line of fs.readFileSync(target, "utf8").split("\n").filter(Boolean)) {
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      throw new Error("Evidence vault row is invalid");
    }
    const metadata = validateEncryptedRow(row);
    const key = `${metadata.workspace_id}:${metadata.case_id}:${metadata.evidence_ref}`;
    if (seen.has(key)) throw new Error("Evidence vault contains a duplicate evidence ref");
    seen.add(key);
    rows.push({ row, metadata });
  }
  return rows;
}

function appendRow(filePath, row) {
  const target = safeVaultFile(filePath);
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const flags = fs.constants.O_WRONLY | fs.constants.O_APPEND | fs.constants.O_CREAT | (fs.constants.O_NOFOLLOW || 0);
  const descriptor = fs.openSync(target, flags, 0o600);
  try {
    fs.writeSync(descriptor, `${JSON.stringify(row)}\n`, undefined, "utf8");
    fs.fchmodSync(descriptor, 0o600);
  } finally {
    fs.closeSync(descriptor);
  }
}

function sameEvidence(existing, submitted) {
  return (
    existing.workspace_id === submitted.workspace_id &&
    existing.case_id === submitted.case_id &&
    existing.evidence_ref === submitted.evidence_ref &&
    existing.evidence_type === submitted.evidence_type &&
    existing.producer_kind === submitted.producer_kind &&
    existing.digest === submitted.digest &&
    existing.issued_at === submitted.issued_at &&
    JSON.stringify(existing.retention) === JSON.stringify(submitted.retention) &&
    existing.payload_encoding === submitted.payload_encoding
  );
}

function assertAccessScope(metadata, supplied, label = "Evidence access scope") {
  const scope = normalizedScope(supplied, label);
  if (scope.workspace_id !== metadata.workspace_id || scope.case_id !== metadata.case_id) {
    throw new Error("Evidence access scope does not match the evidence workspace and case");
  }
}

function inputAccessScope(input, options) {
  return options.accessScope ?? options.access_scope ?? input.accessScope ?? input.access_scope;
}

export function appendRealtyEvidence(
  input,
  { filePath = DEFAULT_REALTY_EVIDENCE_VAULT_PATH, storedAt = new Date().toISOString(), ...options } = {},
) {
  // ponytail: local JSONL detects retry conflicts in this process; use a transactional store before multiple writers.
  const metadata = metadataFromInput(input, { storedAt });
  assertAccessScope(metadata, inputAccessScope(input, options));
  const key = encryptionKey(options);
  const existing = readRows(filePath).find(
    ({ metadata: row }) =>
      row.workspace_id === metadata.workspace_id &&
      row.case_id === metadata.case_id &&
      row.evidence_ref === metadata.evidence_ref,
  );
  if (existing) {
    if (!sameEvidence(existing.metadata, metadata)) throw new Error("Evidence ref conflicts with existing evidence");
    decryptPayload(existing.row, existing.metadata, key);
    return metadataForReturn(existing.metadata, { idempotent: true });
  }
  appendRow(filePath, encryptedRow(metadata, key));
  return metadataForReturn(metadata, { idempotent: false });
}

export function readRealtyEvidenceMetadata(
  input,
  { filePath = DEFAULT_REALTY_EVIDENCE_VAULT_PATH, ...options } = {},
) {
  const scope = normalizedScope(input, "Evidence metadata scope");
  assertAccessScope(scope, inputAccessScope(input, options));
  const evidenceRef = input.evidenceRef ?? input.evidence_ref ?? input.ref;
  const ref = evidenceRef === undefined ? null : requiredText(evidenceRef, "Evidence ref", 240);
  const key = encryptionKey(options);
  return readRows(filePath)
    .filter(({ metadata }) => metadata.workspace_id === scope.workspace_id && metadata.case_id === scope.case_id)
    .filter(({ metadata }) => !ref || metadata.evidence_ref === ref)
    .map(({ row, metadata }) => {
      decryptPayload(row, metadata, key);
      return metadataForReturn(metadata);
    });
}

export function readRealtyEvidence(
  input,
  { filePath = DEFAULT_REALTY_EVIDENCE_VAULT_PATH, ...options } = {},
) {
  const scope = normalizedScope(input, "Evidence read scope");
  const evidenceRef = requiredText(input.evidenceRef ?? input.evidence_ref ?? input.ref, "Evidence ref", 240);
  const selector = { ...scope, evidence_ref: evidenceRef };
  assertAccessScope(selector, inputAccessScope(input, options));
  const match = readRows(filePath).find(
    ({ metadata }) =>
      metadata.workspace_id === selector.workspace_id &&
      metadata.case_id === selector.case_id &&
      metadata.evidence_ref === selector.evidence_ref,
  );
  if (!match) throw new Error("Evidence ref was not found in the requested workspace and case");

  const key = encryptionKey(options);
  const plaintext = decryptPayload(match.row, match.metadata, key);
  return {
    metadata: metadataForReturn(match.metadata),
    payload: match.metadata.payload_encoding === "utf8" ? plaintext.toString("utf8") : plaintext,
  };
}
