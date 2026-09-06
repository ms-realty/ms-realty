import { findLeadByIdempotencyKey, isLeadDurableStoreEnabled } from "./lead-durable-store.mjs";

export const PUBLIC_LEAD_STATUS_PATH = "/api/leads/status";
const BROWSER_KEY = /^public-lead:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// A receipt confirms durable intake, never a viewing or a broker decision.
export function publicLeadReceipt(row, { retrySafe = false } = {}) {
  if (!row?.lead_id || !row.idempotency_key || !row.source) return null;
  return {
    kind: "lead_receipt",
    state: "received",
    lead_id: row.lead_id,
    idempotency_key: row.idempotency_key,
    source: row.source,
    listing_reference: row.listing_reference || null,
    retry_safe: retrySafe,
  };
}

export async function publicLeadStatus(input, { store = {}, lookup = findLeadByIdempotencyKey, payload = null } = {}) {
  const key = input?.idempotencyKey;
  if (!BROWSER_KEY.test(String(key || "")) || typeof input?.source !== "string" || input.source.length > 100 ||
      (input.listingReference != null && (typeof input.listingReference !== "string" || input.listingReference.length > 160))) {
    return { status: 400, body: { kind: "lead_status_invalid" } };
  }
  // File-backed preview intake has no atomic replay guarantee. Never offer
  // an automatic retry there merely because its ledger currently looks empty.
  if (!isLeadDurableStoreEnabled(store)) return { status: 503, body: { kind: "lead_status_unavailable", retry_safe: false } };
  try {
    const document = await lookup(key, { workspaceId: store.workspaceId, payload });
    if (!document) return { status: 200, body: { kind: "lead_status", state: "not_received", idempotency_key: key, retry_safe: true } };
    if (document.workspace_id !== store.workspaceId) throw new Error("Receipt workspace mismatch");
    const receipt = publicLeadReceipt(document.ledger_row || document, { retrySafe: true });
    if (!receipt || receipt.idempotency_key !== key) throw new Error("Receipt is incomplete");
    if (receipt.source !== input.source || receipt.listing_reference !== (input.listingReference || null)) {
      return { status: 409, body: { kind: "lead_status_mismatch" } };
    }
    return { status: 200, body: receipt };
  } catch {
    return { status: 503, body: { kind: "lead_status_unavailable", retry_safe: false } };
  }
}
