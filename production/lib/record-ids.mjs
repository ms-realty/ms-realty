// Server-generated record identity for public submissions.
//
// Public intake used to derive ids from request content — `language-request-de`
// (one id for every German request, forever), `saved-search-<locale>-<ms>`,
// `lead-draft-<ms>` — and honoured a caller-supplied `id` outright. Both are
// the same defect: two submissions can share an identity, and the
// last-write-wins projections that build contact routing then collapse one
// person's enquiry onto another's.
//
// The rules here: identity is always minted server-side and is never derived
// from anything a caller controls. A caller may supply an *idempotency key*
// instead — a separate, constrained field whose only power is to make a
// retried submission return the original record rather than create a second.
import { randomUUID } from "node:crypto";

const PREFIX = /^[a-z][a-z0-9-]{0,39}$/;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export function newRecordId(prefix) {
  if (!PREFIX.test(String(prefix || ""))) throw new Error("record id prefix must be lower-case kebab-case");
  return `${prefix}-${randomUUID()}`;
}

export function normalizeIdempotencyKey(value) {
  const key = String(value ?? "").trim();
  if (!key) return null;
  if (!IDEMPOTENCY_KEY.test(key)) {
    throw new Error("idempotencyKey must be 1-128 characters of letters, digits, dot, underscore, colon, or hyphen");
  }
  return key;
}

export function findByIdempotencyKey(rows, key) {
  if (!key) return null;
  // ponytail: linear scan of an append-only ledger, which is written at human
  // submission rates. Index it if intake ever becomes a hot path.
  return rows.find((row) => row && row.idempotency_key === key) || null;
}
