// The approved purchase-fee table behind the listing-page cost estimator.
//
// "What will this actually cost me" is the question a foreign buyer asks
// before they ask anything else, and it is answered with numbers that are set
// by municipalities, notary tariffs, and registry rules that change. So the
// estimator does not degrade gracefully: if one component of the total is
// missing, expired, or no longer matches its approval, this module refuses to
// produce a total and names the line that is missing. A partial total that
// looks complete is worse than no total.
//
// Each line declares how old its own approval may be (`max_approval_age_days`),
// because a municipal tax rate and an agency fee do not age at the same speed.
import {
  APPROVAL_REASONS,
  approvalState,
  normalizeApproval,
  normalizeSources,
  optionalIsoDate,
  optionalText,
  readApprovedRecordFile,
  requireIsoDate,
  requireText,
  reviewRows,
  stableHash,
  writeApprovedRecordFile,
} from "./approved-records.mjs";
import { fromRoot } from "./paths.mjs";

export const DEFAULT_APPROVED_PURCHASE_FEES_PATH = fromRoot("production", "data", "approved-purchase-fees.json");

export const PURCHASE_FEE_BUYER_SCOPES = Object.freeze(["eu", "non_eu"]);
export const PURCHASE_FEE_BASES = Object.freeze(["percent_of_price", "fixed_eur", "scale_of_price"]);

// The cost lines a Bulgarian purchase involves. `company_route_setup` applies
// only to the non-EU route, where land ownership needs a Bulgarian company
// (the approved CMS guide "Foreign buyers and Bulgarian land ownership").
export const PURCHASE_FEE_LINES = Object.freeze([
  { line_key: "local_transfer_tax", scopes: ["eu", "non_eu"], municipality_specific: true },
  { line_key: "notary_fee", scopes: ["eu", "non_eu"], municipality_specific: false },
  { line_key: "registry_entry_fee", scopes: ["eu", "non_eu"], municipality_specific: false },
  { line_key: "agency_fee", scopes: ["eu", "non_eu"], municipality_specific: false },
  { line_key: "company_route_setup", scopes: ["non_eu"], municipality_specific: false },
]);

export const PURCHASE_FEE_LINE_KEYS = Object.freeze(PURCHASE_FEE_LINES.map((line) => line.line_key));

export const PURCHASE_FEE_MISSING_REASONS = Object.freeze({
  NO_RECORD: "no_approved_record",
  NOT_IN_EFFECT: "not_in_effect",
  APPROVAL_EXPIRED: "approval_expired",
  CHANGED: "changed_since_approval",
  NOT_APPROVED: "not_approved",
});

export function requiredPurchaseFeeLines(buyerScope) {
  return PURCHASE_FEE_LINES.filter((line) => line.scopes.includes(buyerScope)).map((line) => line.line_key);
}

// A missing line reports a municipality only when the line is actually
// municipality-scoped; a notary tariff is national and saying "missing for
// Sandanski" would send an approver to the wrong place.
function missingLine(lineKey, municipality, reason) {
  const declared = PURCHASE_FEE_LINES.find((line) => line.line_key === lineKey);
  return { line_key: lineKey, municipality: declared?.municipality_specific ? municipality || null : null, reason };
}

export function readApprovedPurchaseFees(filePath = DEFAULT_APPROVED_PURCHASE_FEES_PATH) {
  return readApprovedRecordFile(filePath, { collection: "lines" });
}

export function writeApprovedPurchaseFees(document, { filePath = DEFAULT_APPROVED_PURCHASE_FEES_PATH } = {}) {
  return writeApprovedRecordFile(document, { filePath });
}

export function purchaseFeeLineHashPayload(line) {
  return {
    line_key: line.line_key || "",
    municipality: line.municipality || "",
    applies_to: line.applies_to || [],
    basis: line.basis || "",
    percent: line.percent ?? null,
    amount_eur: line.amount_eur ?? null,
    scale: (line.scale || []).map((bracket) => ({
      from_eur: bracket.from_eur ?? 0,
      to_eur: bracket.to_eur ?? null,
      fixed_eur: bracket.fixed_eur ?? 0,
      percent_of_excess: bracket.percent_of_excess ?? 0,
    })),
    minimum_eur: line.minimum_eur ?? null,
    maximum_eur: line.maximum_eur ?? null,
    effective_from: line.effective_from || "",
    effective_to: line.effective_to || "",
    max_approval_age_days: line.max_approval_age_days ?? null,
    label: line.label || "",
    sources: (line.sources || []).map((source) => ({
      id: source.id || "",
      publisher: source.publisher || "",
      url: source.url || "",
      checked_at: source.checked_at || "",
      claim_ids: source.claim_ids || [],
    })),
  };
}

export function purchaseFeeLineSourceHash(line) {
  return stableHash(purchaseFeeLineHashPayload(line));
}

function optionalNumber(value, label, { min = 0 } = {}) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < min) throw new Error(`${label} must be a number of at least ${min}`);
  return number;
}

function normalizeScale(input, label) {
  if (!Array.isArray(input) || !input.length) throw new Error(`${label} must list at least one bracket`);
  let previousTo = 0;
  return input.map((bracket, index) => {
    const at = `${label}[${index}]`;
    const from = optionalNumber(bracket?.from_eur, `${at}.from_eur`) ?? 0;
    const to = optionalNumber(bracket?.to_eur, `${at}.to_eur`);
    if (from !== previousTo) throw new Error(`${at}.from_eur must continue the previous bracket without a gap`);
    if (to !== null && to <= from) throw new Error(`${at}.to_eur must be greater than from_eur`);
    previousTo = to === null ? Number.POSITIVE_INFINITY : to;
    return {
      from_eur: from,
      to_eur: to,
      fixed_eur: optionalNumber(bracket?.fixed_eur, `${at}.fixed_eur`) ?? 0,
      percent_of_excess: optionalNumber(bracket?.percent_of_excess, `${at}.percent_of_excess`) ?? 0,
    };
  });
}

export function normalizePurchaseFeeLine(input = {}) {
  const label = `purchase fee line ${String(input.id || input.line_key || "").trim() || "(unnamed)"}`;
  const lineKey = String(input.line_key ?? "").trim();
  if (!PURCHASE_FEE_LINE_KEYS.includes(lineKey)) {
    throw new Error(`${label}.line_key must be one of: ${PURCHASE_FEE_LINE_KEYS.join(", ")}`);
  }
  const basis = String(input.basis ?? "").trim();
  if (!PURCHASE_FEE_BASES.includes(basis)) throw new Error(`${label}.basis must be one of: ${PURCHASE_FEE_BASES.join(", ")}`);
  const appliesTo = Array.isArray(input.applies_to) ? input.applies_to.map((scope) => String(scope || "").trim()) : [];
  if (!appliesTo.length || appliesTo.some((scope) => !PURCHASE_FEE_BUYER_SCOPES.includes(scope))) {
    throw new Error(`${label}.applies_to must list eu, non_eu, or both`);
  }
  const declaredScopes = PURCHASE_FEE_LINES.find((line) => line.line_key === lineKey).scopes;
  if (appliesTo.some((scope) => !declaredScopes.includes(scope))) {
    throw new Error(`${label}.applies_to includes a buyer scope this line never applies to`);
  }
  const line = {
    id: requireText(input.id, `${label}.id`, { max: 160 }),
    type: "purchase_fee_line",
    line_key: lineKey,
    // Municipal transfer tax differs by municipality; null means "the rate
    // used when no municipality-specific record exists".
    municipality: optionalText(input.municipality, `${label}.municipality`, { max: 160 }) || null,
    applies_to: [...new Set(appliesTo)].sort(),
    basis,
    label: requireText(input.label, `${label}.label`, { max: 200 }),
    ...normalizeApproval(input, label),
    percent: basis === "percent_of_price" ? optionalNumber(input.percent, `${label}.percent`) : null,
    amount_eur: basis === "fixed_eur" ? optionalNumber(input.amount_eur, `${label}.amount_eur`) : null,
    scale: basis === "scale_of_price" ? normalizeScale(input.scale, `${label}.scale`) : [],
    minimum_eur: optionalNumber(input.minimum_eur, `${label}.minimum_eur`),
    maximum_eur: optionalNumber(input.maximum_eur, `${label}.maximum_eur`),
    effective_from: requireIsoDate(input.effective_from, `${label}.effective_from`),
    effective_to: optionalIsoDate(input.effective_to, `${label}.effective_to`),
    // How stale this line's own approval may become before the estimator
    // refuses to use it.
    max_approval_age_days: optionalNumber(input.max_approval_age_days, `${label}.max_approval_age_days`, { min: 1 }) ?? 365,
    sources: normalizeSources(input.sources || [], `${label}.sources`),
  };
  if (basis === "percent_of_price" && line.percent === null) throw new Error(`${label}.percent is required for percent_of_price`);
  if (basis === "fixed_eur" && line.amount_eur === null) throw new Error(`${label}.amount_eur is required for fixed_eur`);
  if (line.municipality && !PURCHASE_FEE_LINES.find((row) => row.line_key === lineKey).municipality_specific) {
    throw new Error(`${label} may not be scoped to a municipality`);
  }
  if (line.minimum_eur !== null && line.maximum_eur !== null && line.maximum_eur < line.minimum_eur) {
    throw new Error(`${label}.maximum_eur must not be below minimum_eur`);
  }
  line.source_hash = requireText(input.source_hash || purchaseFeeLineSourceHash(line), `${label}.source_hash`, { max: 64 });
  return line;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function purchaseFeeLineState(line, { now = new Date().toISOString() } = {}) {
  const base = approvalState(line, { hashPayload: purchaseFeeLineHashPayload, now });
  if (!base.publishable) {
    if (base.reason === APPROVAL_REASONS.CHANGED) return { usable: false, reason: PURCHASE_FEE_MISSING_REASONS.CHANGED };
    if (base.reason === APPROVAL_REASONS.STALE) return { usable: false, reason: PURCHASE_FEE_MISSING_REASONS.APPROVAL_EXPIRED };
    return { usable: false, reason: PURCHASE_FEE_MISSING_REASONS.NOT_APPROVED };
  }
  const at = Date.parse(now);
  if (Date.parse(line.effective_from) > at || (line.effective_to && Date.parse(line.effective_to) <= at)) {
    return { usable: false, reason: PURCHASE_FEE_MISSING_REASONS.NOT_IN_EFFECT };
  }
  // The record's own declared shelf life for its approval.
  const maxAgeMs = (line.max_approval_age_days ?? 365) * DAY_MS;
  if (at - Date.parse(line.approved_at) > maxAgeMs) {
    return { usable: false, reason: PURCHASE_FEE_MISSING_REASONS.APPROVAL_EXPIRED };
  }
  return { usable: true, reason: null };
}

export function isUsablePurchaseFeeLine(line, { now } = {}) {
  return purchaseFeeLineState(line, { now }).usable;
}

function roundCents(value) {
  return Math.round(value * 100) / 100;
}

export function purchaseFeeAmount(line, priceEur) {
  let amount = 0;
  if (line.basis === "percent_of_price") amount = (priceEur * line.percent) / 100;
  else if (line.basis === "fixed_eur") amount = line.amount_eur;
  else {
    const bracket = line.scale.find(
      (row) => priceEur >= row.from_eur && (row.to_eur === null || priceEur <= row.to_eur),
    );
    if (!bracket) return null;
    amount = bracket.fixed_eur + ((priceEur - bracket.from_eur) * bracket.percent_of_excess) / 100;
  }
  if (line.minimum_eur !== null && amount < line.minimum_eur) amount = line.minimum_eur;
  if (line.maximum_eur !== null && amount > line.maximum_eur) amount = line.maximum_eur;
  return roundCents(amount);
}

// The most specific approved record wins: a municipality-scoped line beats the
// unscoped default. Nothing is inherited across buyer scopes.
export function resolvePurchaseFeeLine(lines, { lineKey, municipality, buyerScope, now }) {
  const candidates = (lines || []).filter((line) => line.line_key === lineKey && line.applies_to.includes(buyerScope));
  const scoped = municipality ? candidates.filter((line) => line.municipality === municipality) : [];
  const generic = candidates.filter((line) => !line.municipality);
  const ordered = [...scoped, ...generic];
  if (!ordered.length) return { line: null, reason: PURCHASE_FEE_MISSING_REASONS.NO_RECORD };
  const usable = ordered.find((line) => isUsablePurchaseFeeLine(line, { now }));
  if (usable) return { line: usable, reason: null };
  return { line: null, reason: purchaseFeeLineState(ordered[0], { now }).reason };
}

/**
 * Compute a purchase-cost estimate, or refuse and say which line is missing.
 * Never returns a partial total.
 */
export function purchaseFeeEstimate(
  document,
  { priceEur, municipality = null, buyerScope = "eu", now = new Date().toISOString() } = {},
) {
  if (!PURCHASE_FEE_BUYER_SCOPES.includes(buyerScope)) {
    throw new Error(`buyerScope must be one of: ${PURCHASE_FEE_BUYER_SCOPES.join(", ")}`);
  }
  const price = Number(priceEur);
  if (!Number.isFinite(price) || price <= 0) throw new Error("priceEur must be a positive number");
  const required = requiredPurchaseFeeLines(buyerScope);
  const lines = [];
  const missing = [];
  for (const lineKey of required) {
    const { line, reason } = resolvePurchaseFeeLine(document?.lines || [], { lineKey, municipality, buyerScope, now });
    if (!line) {
      missing.push(missingLine(lineKey, municipality, reason));
      continue;
    }
    const amount = purchaseFeeAmount(line, price);
    if (amount === null) {
      missing.push(missingLine(lineKey, line.municipality, PURCHASE_FEE_MISSING_REASONS.NO_RECORD));
      continue;
    }
    lines.push({
      line_key: line.line_key,
      label: line.label,
      municipality: line.municipality,
      basis: line.basis,
      percent: line.percent,
      amount_eur: amount,
      effective_from: line.effective_from,
      effective_to: line.effective_to,
      reviewer: line.reviewer,
      approved_at: line.approved_at,
      sources: line.sources.map((source) => ({
        id: source.id,
        publisher: source.publisher,
        label: source.label,
        url: source.url,
        checked_at: source.checked_at,
      })),
    });
  }
  if (missing.length) {
    return {
      kind: "purchase_fee_estimate",
      available: false,
      reason: "incomplete_fee_table",
      price_eur: price,
      currency: "EUR",
      buyer_scope: buyerScope,
      municipality: municipality || null,
      required_lines: required,
      resolved_lines: lines.map((line) => line.line_key),
      // Named so the front end can say exactly which line is not approved yet.
      missing,
      total_eur: null,
      total_including_price_eur: null,
      generated_at: now,
    };
  }
  const total = roundCents(lines.reduce((sum, line) => sum + line.amount_eur, 0));
  return {
    kind: "purchase_fee_estimate",
    available: true,
    reason: null,
    price_eur: price,
    currency: "EUR",
    buyer_scope: buyerScope,
    municipality: municipality || null,
    required_lines: required,
    resolved_lines: lines.map((line) => line.line_key),
    missing: [],
    lines,
    total_eur: total,
    total_including_price_eur: roundCents(price + total),
    generated_at: now,
  };
}

export function purchaseFeeTableStatus(document, { municipality = null, now } = {}) {
  return PURCHASE_FEE_BUYER_SCOPES.map((buyerScope) => {
    const required = requiredPurchaseFeeLines(buyerScope);
    const missing = required
      .map((lineKey) => {
        const { line, reason } = resolvePurchaseFeeLine(document?.lines || [], { lineKey, municipality, buyerScope, now });
        return line ? null : missingLine(lineKey, municipality, reason);
      })
      .filter(Boolean);
    return { buyer_scope: buyerScope, required_lines: required, available: missing.length === 0, missing };
  });
}

export function purchaseFeeReviewRows(document, { now } = {}) {
  return reviewRows(document?.lines || [], {
    hashPayload: purchaseFeeLineHashPayload,
    now,
    describe: (line) => ({
      line_key: line.line_key,
      municipality: line.municipality || null,
      applies_to: line.applies_to,
      basis: line.basis,
      effective_from: line.effective_from,
      effective_to: line.effective_to,
      max_approval_age_days: line.max_approval_age_days,
      usable: purchaseFeeLineState(line, { now }).usable,
    }),
  });
}

export function assertApprovedPurchaseFees(document) {
  if (!Array.isArray(document?.lines)) throw new Error("Approved purchase fees must contain a lines array");
  const ids = new Set();
  for (const raw of document.lines) {
    const line = normalizePurchaseFeeLine(raw);
    if (ids.has(line.id)) throw new Error(`Purchase fee line ids must be unique: ${line.id}`);
    ids.add(line.id);
    if (raw.source_hash && raw.source_hash !== purchaseFeeLineSourceHash(line)) {
      throw new Error(`Purchase fee line ${line.id} source_hash does not cover its approved content`);
    }
    if (line.status === "approved" && !line.sources.length) {
      throw new Error(`Purchase fee line ${line.id} cannot be approved without an official source`);
    }
  }
  return true;
}
