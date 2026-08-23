// The approval discipline shared by every approved-content type.
//
// production/lib/approved-content.mjs established the rule for guides: a
// document is public only when a named human approved *that exact content*,
// the approval is recorded on the document, and the recorded hash still
// matches what the file says today. Team profiles, area guides, financing
// partners, and purchase-fee lines reuse the same rule instead of inventing
// four variations of "is this safe to show".
//
// Everything here fails closed. A record that cannot be verified is not
// dropped silently: the caller receives a reason so the public surface can
// render a marked absence ("not published yet") rather than a claim.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

export const APPROVAL_REASONS = Object.freeze({
  EXAMPLE: "example_record",
  NOT_APPROVED: "not_approved",
  NO_REVIEWER: "no_named_reviewer",
  CHANGED: "changed_since_approval",
  STALE: "approval_expired",
  NOT_TRANSLATED: "translation_not_approved",
});

const LOCALE_CODE = /^[a-z]{2,3}(-[A-Z]{2})?$/;
const OPERATOR_ID = /^[a-z0-9][a-z0-9._-]{1,63}$/i;

export function stableHash(payload) {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function requireText(value, label, { max = 400 } = {}) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${label} is required`);
  if (text.length > max) throw new Error(`${label} must be ${max} characters or fewer`);
  return text;
}

export function optionalText(value, label, { max = 400 } = {}) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  return requireText(text, label, { max });
}

export function requireLocale(value, label) {
  const code = String(value ?? "").trim();
  if (!LOCALE_CODE.test(code)) throw new Error(`${label} must be a BCP 47 language code`);
  return code;
}

export function requireOperator(value, label) {
  const id = String(value ?? "").trim();
  if (!OPERATOR_ID.test(id)) throw new Error(`${label} must be a stable operator ID`);
  return id;
}

export function requireIsoDate(value, label) {
  const raw = String(value ?? "").trim();
  if (!raw || Number.isNaN(Date.parse(raw))) throw new Error(`${label} must be an ISO date`);
  return raw;
}

export function optionalIsoDate(value, label) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  return requireIsoDate(raw, label);
}

export function requireStringList(value, label, { max = 400, minItems = 1 } = {}) {
  if (!Array.isArray(value) || value.length < minItems) {
    throw new Error(`${label} must list at least ${minItems} value${minItems === 1 ? "" : "s"}`);
  }
  return value.map((item, index) => requireText(item, `${label}[${index}]`, { max }));
}

// Official-source evidence, in the same shape approved-cms-content.json already
// uses for guides: an identified publisher, an HTTPS URL, the date a human
// checked it, and the claim ids that source actually backs.
export function normalizeSources(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value.map((source, index) => {
    const at = `${label}[${index}]`;
    let url;
    try {
      url = new URL(String(source?.url ?? ""));
    } catch {
      throw new Error(`${at}.url must be an absolute URL`);
    }
    if (url.protocol !== "https:") throw new Error(`${at}.url must be HTTPS`);
    return {
      id: requireText(source?.id, `${at}.id`, { max: 120 }),
      publisher: requireText(source?.publisher, `${at}.publisher`, { max: 200 }),
      label: optionalText(source?.label, `${at}.label`, { max: 200 }),
      url: url.toString(),
      checked_at: requireIsoDate(source?.checked_at, `${at}.checked_at`),
      claim_ids: requireStringList(source?.claim_ids, `${at}.claim_ids`, { max: 120 }),
    };
  });
}

export function sourceClaimIndex(sources = []) {
  const index = new Map();
  for (const source of sources) {
    for (const claimId of source.claim_ids || []) {
      index.set(`${source.id}:${claimId}`, source);
    }
  }
  return index;
}

// The approval envelope every approved-content record carries. Kept separate
// from the type-specific body so the four modules stay comparable in review.
export function normalizeApproval(input = {}, label = "record") {
  const status = String(input.status ?? "").trim();
  if (!["draft", "approved", "withdrawn"].includes(status)) {
    throw new Error(`${label}.status must be draft, approved, or withdrawn`);
  }
  const humanApproved = input.human_approved === true;
  if (status === "approved" && !humanApproved) {
    throw new Error(`${label} cannot be approved without human_approved`);
  }
  return {
    status,
    human_approved: humanApproved,
    reviewer: humanApproved ? requireOperator(input.reviewer, `${label}.reviewer`) : optionalText(input.reviewer, `${label}.reviewer`, { max: 64 }),
    approved_at: humanApproved ? requireIsoDate(input.approved_at, `${label}.approved_at`) : optionalIsoDate(input.approved_at, `${label}.approved_at`),
    review_due_at: optionalIsoDate(input.review_due_at, `${label}.review_due_at`),
    ...(input.example_record === true ? { example_record: true } : {}),
  };
}

// The single publication gate. `hashPayload` is the type's own projection of
// the fields a human actually approved; a change to any of them invalidates
// the recorded approval.
export function approvalState(record, { hashPayload, now = new Date().toISOString() } = {}) {
  if (!record || typeof record !== "object") return { publishable: false, reason: APPROVAL_REASONS.NOT_APPROVED };
  if (record.example_record === true) return { publishable: false, reason: APPROVAL_REASONS.EXAMPLE };
  if (record.status !== "approved" || record.human_approved !== true) {
    return { publishable: false, reason: APPROVAL_REASONS.NOT_APPROVED };
  }
  if (!record.reviewer || !OPERATOR_ID.test(String(record.reviewer))) {
    return { publishable: false, reason: APPROVAL_REASONS.NO_REVIEWER };
  }
  if (!record.approved_at || Number.isNaN(Date.parse(record.approved_at))) {
    return { publishable: false, reason: APPROVAL_REASONS.NOT_APPROVED };
  }
  if (typeof hashPayload === "function" && record.source_hash !== stableHash(hashPayload(record))) {
    return { publishable: false, reason: APPROVAL_REASONS.CHANGED };
  }
  if (record.review_due_at && Date.parse(record.review_due_at) <= Date.parse(now)) {
    return { publishable: false, reason: APPROVAL_REASONS.STALE };
  }
  // A non-source locale is a translation, and a translation publishes only
  // once a human approved the translation itself (AGENTS.md: Hermes drafts,
  // humans publish).
  if (record.locale && record.source_locale && record.locale !== record.source_locale) {
    if (!record.source_document_id || record.human_translation_approved !== true) {
      return { publishable: false, reason: APPROVAL_REASONS.NOT_TRANSLATED };
    }
  }
  return { publishable: true, reason: null };
}

// What a public surface renders when nothing is approved: an absence with a
// machine-readable reason, never an empty section pretending to be complete.
export function markedAbsence(reason, extra = {}) {
  return { available: false, reason: reason || APPROVAL_REASONS.NOT_APPROVED, ...extra };
}

export function readApprovedRecordFile(filePath, { collection }) {
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed[collection])) {
    throw new Error(`${filePath} must contain a ${collection} array`);
  }
  return parsed;
}

export function writeApprovedRecordFile(document, { filePath }) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(document, null, 2)}\n`);
  return { outPath: filePath };
}

// Review rows for the admin workbench: every record, publishable or not, with
// the reason it is being withheld. This is what an approver needs to see.
export function reviewRows(records, { hashPayload, now, describe }) {
  return records.map((record) => {
    const state = approvalState(record, { hashPayload, now });
    return {
      id: record.id,
      type: record.type,
      locale: record.locale || null,
      status: record.status || "draft",
      reviewer: record.reviewer || null,
      approved_at: record.approved_at || null,
      review_due_at: record.review_due_at || null,
      example_record: record.example_record === true,
      publishable: state.publishable,
      blocked_reason: state.reason,
      ...(typeof describe === "function" ? describe(record) : {}),
    };
  });
}
