import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fromRoot } from "./paths.mjs";

export const DEFAULT_CONSENT_LEDGER_PATH = fromRoot("production", "data", "consent-ledger.jsonl");

const CONSENT_TYPES = new Set(["inquiry_follow_up", "language_request", "saved_search_alerts"]);
const RAW_PRIVATE_FIELDS = new Set(["contact", "email", "phone", "whatsapp", "viber", "message"]);

function normalizeContactValue(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function contactFingerprint(contact = {}) {
  const email = normalizeContactValue(contact.email);
  const phone = normalizeContactValue(contact.phone || contact.whatsapp || contact.viber).replace(/[^\d+]/g, "");
  const key = email ? `email:${email}` : phone ? `phone:${phone}` : "";
  return key ? crypto.createHash("sha256").update(key).digest("hex") : null;
}

export function resetConsentLedger(filePath = DEFAULT_CONSENT_LEDGER_PATH) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "");
}

export function createConsentRecord(input, recordedAt = new Date().toISOString()) {
  const consentType = input.consent_type || input.consentType;
  if (!CONSENT_TYPES.has(consentType)) throw new Error("Unknown consent type");
  const source = String(input.source || "").trim();
  if (!source) throw new Error("Consent source is required");
  return {
    recorded_at: recordedAt,
    consent_type: consentType,
    source,
    subject_id: input.subject_id || input.subjectId || null,
    locale: String(input.locale || "bg").trim(),
    contact_fingerprint: contactFingerprint(input.contact),
    granted: input.granted !== false,
    legal_basis: input.legal_basis || input.legalBasis || "legitimate_interest",
    marketing_opt_in: input.marketing_opt_in === true || input.marketingOptIn === true,
  };
}

export function appendConsentRecord(record, { filePath = DEFAULT_CONSENT_LEDGER_PATH } = {}) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(record)}\n`);
  return record;
}

export function readConsentLedger(filePath = DEFAULT_CONSENT_LEDGER_PATH) {
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export function assertConsentLedger(rows) {
  if (!rows.length) throw new Error("Consent ledger must contain at least one row");
  for (const row of rows) {
    if (!CONSENT_TYPES.has(row.consent_type) || !row.source || !row.locale || !row.legal_basis) {
      throw new Error("Consent row is missing required routing fields");
    }
    if (Object.keys(row).some((field) => RAW_PRIVATE_FIELDS.has(field))) {
      throw new Error("Consent ledger must not store raw contact or message data");
    }
  }
  return true;
}
