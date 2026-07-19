import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fromRoot } from "./paths.mjs";

export const DEFAULT_CONSENT_LEDGER_PATH = fromRoot("production", "data", "consent-ledger.jsonl");

const CONSENT_TYPES = new Set(["inquiry_follow_up", "language_request", "saved_search_alerts"]);
const RAW_PRIVATE_FIELDS = new Set(["contact", "email", "phone", "whatsapp", "viber", "message"]);
const WITHDRAWAL_REASONS = new Set(["customer_request", "broker_recorded_request", "data_correction"]);

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

function consentIdentity(row) {
  const subject = String(row.subject_id || "").trim();
  const fingerprint = String(row.contact_fingerprint || "").trim();
  return subject ? `${row.consent_type}:subject:${subject}` : fingerprint ? `${row.consent_type}:contact:${fingerprint}` : "";
}

export function latestConsentStates(rows) {
  const states = new Map();
  for (const row of rows || []) {
    const identity = consentIdentity(row);
    if (!identity) continue;
    const current = states.get(identity);
    if (!current || Date.parse(row.recorded_at) >= Date.parse(current.recorded_at)) states.set(identity, row);
  }
  return [...states.entries()]
    .map(([id, row]) => ({
      id,
      consent_type: row.consent_type,
      subject_id: row.subject_id || null,
      contact_reference: row.contact_fingerprint ? `fp:${row.contact_fingerprint.slice(0, 12)}` : null,
      locale: row.locale,
      source: row.source,
      granted: row.granted === true,
      marketing_opt_in: row.marketing_opt_in === true,
      legal_basis: row.legal_basis,
      recorded_at: row.recorded_at,
      actor: row.actor || null,
      reason_code: row.reason_code || null,
      withdrawable: row.granted === true,
    }))
    .sort((left, right) => right.recorded_at.localeCompare(left.recorded_at));
}

export function createConsentWithdrawal(input, rows, recordedAt = new Date().toISOString()) {
  const consentType = String(input.consent_type || input.consentType || "").trim();
  const subjectId = String(input.subject_id || input.subjectId || "").trim();
  const actor = String(input.actor || "").trim();
  const reasonCode = String(input.reason_code || input.reasonCode || "customer_request").trim();
  const humanConfirmed = [true, "true", "on", "1"].includes(input.human_confirmed ?? input.humanConfirmed);
  if (!CONSENT_TYPES.has(consentType)) throw new Error("Unknown consent type");
  if (!subjectId) throw new Error("Consent subject is required");
  if (!actor) throw new Error("Consent withdrawal requires an attributable operator");
  if (!humanConfirmed) throw new Error("Consent withdrawal requires human confirmation");
  if (!WITHDRAWAL_REASONS.has(reasonCode)) throw new Error("Unknown consent withdrawal reason");
  const history = (rows || [])
    .filter((row) => row.consent_type === consentType && row.subject_id === subjectId)
    .sort((left, right) => right.recorded_at.localeCompare(left.recorded_at));
  const latest = history[0];
  if (!latest) throw new Error("Consent subject was not found");
  if (latest.granted === false) return { record: latest, idempotent: true };
  return {
    idempotent: false,
    record: {
      recorded_at: recordedAt,
      consent_type: latest.consent_type,
      source: "admin_withdrawal",
      subject_id: latest.subject_id,
      locale: latest.locale,
      contact_fingerprint: latest.contact_fingerprint || null,
      granted: false,
      legal_basis: latest.legal_basis,
      marketing_opt_in: false,
      actor,
      reason_code: reasonCode,
      supersedes_recorded_at: latest.recorded_at,
    },
  };
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
    if (row.reason_code && !WITHDRAWAL_REASONS.has(row.reason_code)) {
      throw new Error("Consent row has an unknown withdrawal reason");
    }
  }
  return true;
}
