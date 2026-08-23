// Approved financing partners: who can actually lend to a buyer of Bulgarian
// property, and who they serve.
//
// The onboarding "See financing options" step is the highest-stakes place on
// the public site to be wrong: a foreign-national mortgage that does not exist
// is a wasted trip and a broken promise. The approved CMS content already
// records the verified market fact that foreign-national mortgage availability
// in Bulgaria can be limited, so this surface exists to name real routes, not
// to imply a market that is not there.
//
// Two refusals are built in:
//   - No rate publishes unless the approval itself carries that rate with an
//     effective date and a named reviewer. A number without a date is a lie
//     with a shelf life.
//   - Every partner declares a review date. Past it, the partner disappears
//     from the public payload instead of ageing quietly into fiction.
import {
  APPROVAL_REASONS,
  approvalState,
  markedAbsence,
  normalizeApproval,
  normalizeSources,
  optionalIsoDate,
  optionalText,
  readApprovedRecordFile,
  requireIsoDate,
  requireLocale,
  requireOperator,
  requireStringList,
  requireText,
  reviewRows,
  stableHash,
  writeApprovedRecordFile,
} from "./approved-records.mjs";
import { fromRoot } from "./paths.mjs";

export const DEFAULT_APPROVED_FINANCING_PARTNERS_PATH = fromRoot("production", "data", "approved-financing-partners.json");

export const FINANCING_BUYER_SCOPES = Object.freeze(["eu", "non_eu", "both"]);
export const FINANCING_CONTACT_ROUTES = Object.freeze(["agency_introduction", "partner_direct"]);
export const FINANCING_RATE_UNITS = Object.freeze(["percent", "eur"]);

export function readApprovedFinancingPartners(filePath = DEFAULT_APPROVED_FINANCING_PARTNERS_PATH) {
  return readApprovedRecordFile(filePath, { collection: "partners" });
}

export function writeApprovedFinancingPartners(document, { filePath = DEFAULT_APPROVED_FINANCING_PARTNERS_PATH } = {}) {
  return writeApprovedRecordFile(document, { filePath });
}

export function financingPartnerHashPayload(partner) {
  return {
    partner_key: partner.partner_key || "",
    locale: partner.locale || "",
    source_locale: partner.source_locale || "",
    source_document_id: partner.source_document_id || "",
    name: partner.name || "",
    serves: partner.serves || "",
    offering: partner.offering || [],
    contact_route: {
      kind: partner.contact_route?.kind || "",
      detail: partner.contact_route?.detail || "",
      url: partner.contact_route?.url || "",
    },
    rates: (partner.rates || []).map((rate) => ({
      label: rate.label || "",
      value: rate.value ?? null,
      unit: rate.unit || "",
      effective_from: rate.effective_from || "",
      expires_at: rate.expires_at || "",
      approved_at: rate.approved_at || "",
      reviewer: rate.reviewer || "",
      source_id: rate.source_id || "",
    })),
    sources: (partner.sources || []).map((source) => ({
      id: source.id || "",
      publisher: source.publisher || "",
      url: source.url || "",
      checked_at: source.checked_at || "",
      claim_ids: source.claim_ids || [],
    })),
  };
}

export function financingPartnerSourceHash(partner) {
  return stableHash(financingPartnerHashPayload(partner));
}

function normalizeContactRoute(input, label) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error(`${label} is required`);
  const kind = String(input.kind ?? "").trim();
  if (!FINANCING_CONTACT_ROUTES.includes(kind)) {
    throw new Error(`${label}.kind must be one of: ${FINANCING_CONTACT_ROUTES.join(", ")}`);
  }
  const url = optionalText(input.url, `${label}.url`, { max: 500 });
  if (url && !url.startsWith("https://")) throw new Error(`${label}.url must be HTTPS`);
  // A direct route with nowhere to go is not a route. The agency route always
  // works because it lands on the agency's own approved contact channel.
  if (kind === "partner_direct" && !url) throw new Error(`${label}.url is required for a partner_direct route`);
  return { kind, detail: requireText(input.detail, `${label}.detail`, { max: 300 }), url };
}

// A rate is only storable with the approval that carries it: a value, a unit,
// the date it takes effect, when it was approved, and by whom.
function normalizeRates(input, label, sourceIds) {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input)) throw new Error(`${label} must be an array`);
  return input.map((rate, index) => {
    const at = `${label}[${index}]`;
    const unit = String(rate?.unit ?? "").trim();
    if (!FINANCING_RATE_UNITS.includes(unit)) throw new Error(`${at}.unit must be one of: ${FINANCING_RATE_UNITS.join(", ")}`);
    const value = Number(rate?.value);
    if (!Number.isFinite(value) || value < 0) throw new Error(`${at}.value must be a non-negative number`);
    const sourceId = optionalText(rate?.source_id, `${at}.source_id`, { max: 120 });
    if (sourceId && !sourceIds.has(sourceId)) throw new Error(`${at}.source_id cites a source this partner does not carry`);
    return {
      label: requireText(rate?.label, `${at}.label`, { max: 200 }),
      value,
      unit,
      effective_from: requireIsoDate(rate?.effective_from, `${at}.effective_from`),
      expires_at: optionalIsoDate(rate?.expires_at, `${at}.expires_at`),
      approved_at: requireIsoDate(rate?.approved_at, `${at}.approved_at`),
      reviewer: requireOperator(rate?.reviewer, `${at}.reviewer`),
      source_id: sourceId,
    };
  });
}

export function normalizeFinancingPartner(input = {}) {
  const label = `financing partner ${String(input.id || input.partner_key || "").trim() || "(unnamed)"}`;
  const serves = String(input.serves ?? "").trim();
  if (!FINANCING_BUYER_SCOPES.includes(serves)) {
    throw new Error(`${label}.serves must be one of: ${FINANCING_BUYER_SCOPES.join(", ")}`);
  }
  const sources = normalizeSources(input.sources || [], `${label}.sources`);
  const partner = {
    id: requireText(input.id, `${label}.id`, { max: 160 }),
    type: "financing_partner",
    partner_key: requireText(input.partner_key, `${label}.partner_key`, { max: 120 }),
    locale: requireLocale(input.locale, `${label}.locale`),
    source_locale: requireLocale(input.source_locale, `${label}.source_locale`),
    ...normalizeApproval(input, label),
    ...(input.source_document_id ? { source_document_id: requireText(input.source_document_id, `${label}.source_document_id`, { max: 160 }) } : {}),
    ...(input.human_translation_approved === true ? { human_translation_approved: true } : {}),
    name: requireText(input.name, `${label}.name`, { max: 200 }),
    serves,
    offering: requireStringList(input.offering, `${label}.offering`, { max: 400 }),
    contact_route: normalizeContactRoute(input.contact_route, `${label}.contact_route`),
    rates: normalizeRates(input.rates, `${label}.rates`, new Set(sources.map((source) => source.id))),
    sources,
    display_order: Number.isFinite(Number(input.display_order)) ? Number(input.display_order) : 100,
  };
  // "approval and review date": the review date is not optional here, because
  // a lending relationship goes stale faster than editorial copy.
  partner.review_due_at = requireIsoDate(
    input.review_due_at,
    `${label}.review_due_at`,
  );
  partner.source_hash = requireText(input.source_hash || financingPartnerSourceHash(partner), `${label}.source_hash`, { max: 64 });
  return partner;
}

export function financingPartnerApprovalState(partner, { now } = {}) {
  return approvalState(partner, { hashPayload: financingPartnerHashPayload, now });
}

export function isPublishableFinancingPartner(partner, { now } = {}) {
  return financingPartnerApprovalState(partner, { now }).publishable;
}

// A rate publishes only inside its own effective window, independent of the
// partner record's approval.
export function publishableRates(partner, { now = new Date().toISOString() } = {}) {
  const at = Date.parse(now);
  return (partner.rates || []).filter(
    (rate) => Date.parse(rate.effective_from) <= at && (!rate.expires_at || Date.parse(rate.expires_at) > at),
  );
}

export function publicFinancingPartner(partner, { now } = {}) {
  const rates = publishableRates(partner, { now });
  return {
    partner_key: partner.partner_key,
    locale: partner.locale,
    name: partner.name,
    serves: partner.serves,
    offering: [...partner.offering],
    contact_route: { ...partner.contact_route },
    // Absent rates are stated as absent, so the step can say "ask us for
    // current terms" instead of leaving a blank that reads as zero.
    rates: rates.map((rate) => ({
      label: rate.label,
      value: rate.value,
      unit: rate.unit,
      effective_from: rate.effective_from,
      approved_at: rate.approved_at,
      reviewer: rate.reviewer,
    })),
    rates_available: rates.length > 0,
    sources: partner.sources.map((source) => ({
      id: source.id,
      publisher: source.publisher,
      label: source.label,
      url: source.url,
      checked_at: source.checked_at,
    })),
    reviewer: partner.reviewer,
    approved_at: partner.approved_at,
    review_due_at: partner.review_due_at,
  };
}

export function matchesBuyerScope(partner, buyerScope) {
  if (!buyerScope || buyerScope === "any") return true;
  return partner.serves === "both" || partner.serves === buyerScope;
}

export function publicFinancingPartnersFor(document, localeCode, { buyerScope = "any", now, sourceLocale = "bg" } = {}) {
  const publishable = (document?.partners || []).filter(
    (partner) => isPublishableFinancingPartner(partner, { now }) && matchesBuyerScope(partner, buyerScope),
  );
  const byKey = new Map();
  for (const partner of publishable) {
    const existing = byKey.get(partner.partner_key);
    const exact = partner.locale === localeCode;
    if (exact || (!existing && partner.locale === sourceLocale)) {
      if (!existing || exact || existing.locale !== localeCode) byKey.set(partner.partner_key, partner);
    }
  }
  return [...byKey.values()]
    .sort((a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name))
    .map((partner) => publicFinancingPartner(partner, { now }));
}

export function financingAbsence(document, localeCode, { buyerScope = "any", now } = {}) {
  const candidates = (document?.partners || []).filter((partner) => matchesBuyerScope(partner, buyerScope));
  if (!candidates.length) {
    return markedAbsence(APPROVAL_REASONS.NOT_APPROVED, { locale: localeCode, buyer_scope: buyerScope });
  }
  const states = candidates.map((partner) => financingPartnerApprovalState(partner, { now }));
  const stale = states.find((state) => state.reason === APPROVAL_REASONS.STALE);
  return markedAbsence(stale ? APPROVAL_REASONS.STALE : states[0].reason || APPROVAL_REASONS.NOT_APPROVED, {
    locale: localeCode,
    buyer_scope: buyerScope,
  });
}

export function financingPartnerReviewRows(document, { now } = {}) {
  return reviewRows(document?.partners || [], {
    hashPayload: financingPartnerHashPayload,
    now,
    describe: (partner) => ({
      partner_key: partner.partner_key,
      name: partner.name,
      serves: partner.serves,
      contact_route: partner.contact_route?.kind || null,
      rate_count: (partner.rates || []).length,
    }),
  });
}

export function assertApprovedFinancingPartners(document) {
  if (!Array.isArray(document?.partners)) throw new Error("Approved financing partners must contain a partners array");
  const ids = new Set();
  for (const raw of document.partners) {
    const partner = normalizeFinancingPartner(raw);
    if (ids.has(partner.id)) throw new Error(`Financing partner ids must be unique: ${partner.id}`);
    ids.add(partner.id);
    if (raw.source_hash && raw.source_hash !== financingPartnerSourceHash(partner)) {
      throw new Error(`Financing partner ${partner.id} source_hash does not cover its approved content`);
    }
    if (partner.rates.length && partner.status !== "approved") {
      throw new Error(`Financing partner ${partner.id} carries rates without an approval that covers them`);
    }
  }
  return true;
}
