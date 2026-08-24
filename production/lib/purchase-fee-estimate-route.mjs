// The public purchase-fee estimate, as one contract both runtimes answer with.
//
// The Node server (http.mjs) and the App Router adapter serve the same route,
// and production only ever runs the second. Keeping the status rules here means
// the two cannot answer the same query differently: the buyer scope, the price
// format, and — most importantly — the refusal that a missing or expired fee
// line produces are decided once.

import { purchaseFeePayload } from "./public-site.mjs";
import { PURCHASE_FEE_BUYER_SCOPES } from "./purchase-fees.mjs";

const PRICE_EUR = /^\d+(\.\d{1,2})?$/;

// Returns { status, body } so each runtime can wrap it in its own response
// helper without re-deciding what the answer is.
export function purchaseFeeEstimateResponse({ searchParams, defaultLocale = "bg", filePath = null, now = null } = {}) {
  const buyerScope = searchParams.get("buyer") || searchParams.get("buyer_scope") || "eu";
  const rawPrice = searchParams.get("price_eur");
  if (!PURCHASE_FEE_BUYER_SCOPES.includes(buyerScope)) {
    return {
      status: 400,
      body: { kind: "bad_request", message: `buyer must be one of: ${PURCHASE_FEE_BUYER_SCOPES.join(", ")}` },
    };
  }
  if (rawPrice !== null && !PRICE_EUR.test(rawPrice.trim())) {
    return { status: 400, body: { kind: "bad_request", message: "price_eur must be a positive amount in euro" } };
  }
  const payload = purchaseFeePayload({
    localeCode: searchParams.get("locale") || defaultLocale,
    priceEur: rawPrice === null || rawPrice.trim() === "" ? null : Number(rawPrice),
    municipality: searchParams.get("municipality") || null,
    buyerScope,
    filePath: filePath || undefined,
    ...(now ? { now } : {}),
  });
  if (payload.reason === "bad_request") return { status: 400, body: { kind: "bad_request", message: payload.message } };
  // A missing or expired fee line is a refusal, not a zero: 409 carries the
  // exact lines that block the total so the estimator can name them.
  return { status: payload.available ? 200 : 409, body: { kind: "purchase_fee_estimate", ...payload } };
}
