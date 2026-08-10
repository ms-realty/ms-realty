import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

function encryptionKey(secret, secretName) {
  const value = String(secret || "");
  if (value.length < 32) throw new Error(`${secretName} must be at least 32 characters`);
  return crypto.createHash("sha256").update(value).digest();
}

function subjectAad(subjectType, subjectId) {
  return Buffer.from(`${subjectType}:${subjectId}`);
}

function envelopeSubject(row) {
  const legacyLeadRow = !row.subject_type && !row.subject_id && Boolean(row.lead_id);
  const subject = {
    legacyLeadRow,
    subjectType: legacyLeadRow ? "lead" : row.subject_type,
    subjectId: legacyLeadRow ? row.lead_id : row.subject_id,
  };
  if (row.algorithm !== "aes-256-gcm" || !subject.subjectType || !subject.subjectId) {
    throw new Error("Private contact vault row is invalid");
  }
  return subject;
}

function openEnvelope(row, key) {
  const { legacyLeadRow, subjectType, subjectId } = envelopeSubject(row);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(row.iv, "base64"));
  decipher.setAAD(legacyLeadRow ? Buffer.from(subjectId) : subjectAad(subjectType, subjectId));
  decipher.setAuthTag(Buffer.from(row.auth_tag, "base64"));
  const payload = JSON.parse(
    Buffer.concat([decipher.update(Buffer.from(row.ciphertext, "base64")), decipher.final()]).toString("utf8"),
  );
  return { subject_type: subjectType, subject_id: subjectId, payload };
}

export function createPrivateContactEnvelope(
  { subjectType, subjectId, payload },
  { secret, secretName = "contact vault secret", storedAt = new Date().toISOString() } = {},
) {
  if (!subjectType || !subjectId || !payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Private contact vault requires a subject type, subject id, and payload");
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(secret, secretName), iv);
  cipher.setAAD(subjectAad(subjectType, subjectId));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  return {
    subject_type: subjectType,
    subject_id: subjectId,
    stored_at: storedAt,
    algorithm: "aes-256-gcm",
    iv: iv.toString("base64"),
    auth_tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

export function appendPrivateContact(
  contact,
  { filePath, secret, secretName = "contact vault secret", storedAt = new Date().toISOString() } = {},
) {
  if (!filePath) throw new Error("Private contact vault path is required");
  const row = createPrivateContactEnvelope(contact, { secret, secretName, storedAt });
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(row)}\n`, { encoding: "utf8", mode: 0o600 });
  fs.chmodSync(filePath, 0o600);
  return { subject_type: row.subject_type, subject_id: row.subject_id, stored_at: row.stored_at, encrypted: true };
}

export function openPrivateContactEnvelope(row, { secret, secretName = "contact vault secret" } = {}) {
  return openEnvelope(row, encryptionKey(secret, secretName));
}

export function readPrivateContacts(
  filePath,
  { secret, secretName = "contact vault secret", subjectType = null } = {},
) {
  if (!filePath || !fs.existsSync(filePath)) return new Map();
  const key = encryptionKey(secret, secretName);
  const contacts = new Map();
  for (const line of fs.readFileSync(filePath, "utf8").trim().split("\n").filter(Boolean)) {
    const row = JSON.parse(line);
    const { subjectType: rowSubjectType } = envelopeSubject(row);
    if (subjectType && rowSubjectType !== subjectType) continue;
    const opened = openEnvelope(row, key);
    contacts.set(opened.subject_id, opened.payload);
  }
  return contacts;
}
