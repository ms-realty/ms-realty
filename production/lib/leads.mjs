import { getLocale, adminLocales } from "./locales.mjs";
import { newRecordId, normalizeIdempotencyKey } from "./record-ids.mjs";

const CONTACT_PREFERENCES = new Set(["phone", "viber", "whatsapp", "email"]);
export const LEAD_TYPES = Object.freeze([
  "buyer",
  "foreign_buyer",
  "investor",
  "renter",
  "seller",
  "landlord",
  "partner_referral",
  "general",
]);
const LEAD_TYPE_SET = new Set(LEAD_TYPES);
const BUYER_REQUIREMENT_TYPES = new Set(["buyer", "foreign_buyer", "investor", "renter"]);
const OWNER_REQUIREMENT_TYPES = new Set(["seller", "landlord"]);
export const BUYER_LISTING_SOURCE_INTENTS = Object.freeze({
  website_listing_detail: "inquiry",
  website_search_result: "inquiry",
  website_callback_request: "callback",
  website_viewing_request: "viewing",
});
const PUBLIC_LEAD_SOURCE_CONTRACTS = Object.freeze({
  website_contact_callback: { leadTypes: ["general"], intent: "callback", phone: true },
  website_seller_callback: { leadTypes: ["seller"], intent: "callback", phone: true },
  website_seller_valuation: { leadTypes: ["seller"], intent: "valuation", phone: true, property: true },
  website_consultation_request: {
    leadTypes: ["buyer", "foreign_buyer", "investor", "renter", "landlord", "partner_referral", "general"],
    intent: "consultation",
    reachableContact: true,
  },
});
export const BROKER_INTAKE_SOURCES = Object.freeze([
  "broker_phone",
  "broker_viber",
  "broker_whatsapp",
  "broker_email",
  "broker_walk_in",
  "partner_referral",
]);
const BROKER_INTAKE_SOURCE_SET = new Set(BROKER_INTAKE_SOURCES);
const LOCAL_LOCATIONS = ["Sandanski", "Petrich", "Bansko", "Blagoevgrad", "Sveti Vlas", "Sunny Beach", "Melnik"];
const PROPERTY_TYPES = ["apartment", "house", "villa", "land", "commercial", "hotel", "office", "industrial"];
export const DEFAULT_BROKER_PROFILES = [
  { id: "broker_bg", languages: ["bg"], locations: LOCAL_LOCATIONS, property_types: PROPERTY_TYPES, lead_types: LEAD_TYPES },
  { id: "broker_ru", languages: ["ru"], locations: LOCAL_LOCATIONS, property_types: PROPERTY_TYPES, lead_types: LEAD_TYPES },
  {
    id: "broker_international",
    languages: ["en", "de", "nl", "el", "he"],
    locations: LOCAL_LOCATIONS,
    property_types: PROPERTY_TYPES,
    lead_types: LEAD_TYPES,
  },
];

export function normalizeLeadLanguage(registry, languageCode) {
  const locale = getLocale(registry, languageCode);
  const admin = adminLocales(registry);
  const adminLocale = admin.includes(locale.code) ? locale.code : "en";
  return {
    language: locale.code,
    direction: locale.direction,
    adminLocale,
    requiresTranslation: adminLocale !== locale.code,
  };
}

function normalizeContactPreference(input) {
  const value =
    input.contact_preference || input.contactPreference || input.preferred_channel || input.contact?.preferred_channel || null;
  if (!value) {
    if (String(input.contact?.whatsapp || "").trim()) return "whatsapp";
    if (String(input.contact?.viber || "").trim()) return "viber";
    if (String(input.contact?.phone || "").trim()) return "phone";
    if (String(input.contact?.email || "").trim()) return "email";
    return null;
  }
  const normalized = String(value).toLowerCase();
  if (!CONTACT_PREFERENCES.has(normalized)) {
    throw new Error("contact_preference must be phone, viber, whatsapp, or email");
  }
  return normalized;
}

function optionalMoney(value, label) {
  if (value === null || value === undefined || value === "") return null;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) throw new Error(`${label} must be a non-negative amount`);
  return Math.round(amount);
}

function optionalInteger(value, label, { min = 0, max = 20 } = {}) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new Error(`${label} must be an integer from ${min} to ${max}`);
  }
  return number;
}

function boundedString(value, label, max = 200) {
  const text = String(value || "").trim();
  if (text.length > max) throw new Error(`${label} must be ${max} characters or fewer`);
  return text || null;
}

function stringList(value, label, max = 10) {
  const rows = (Array.isArray(value) ? value : String(value || "").split(","))
    .map((item) => String(item).trim())
    .filter(Boolean);
  const unique = [...new Set(rows)];
  if (unique.length > max) throw new Error(`${label} must contain ${max} values or fewer`);
  if (unique.some((item) => item.length > 120)) throw new Error(`${label} values must be 120 characters or fewer`);
  return unique;
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

export function normalizeLeadRequirements(input = {}, property = {}) {
  const raw = input.requirements && typeof input.requirements === "object" && !Array.isArray(input.requirements) ? input.requirements : {};
  const budgetMin = optionalMoney(
    firstDefined(input["requirements.budget_min_eur"], input.budgetMinEur, input.budget_min_eur, raw.budget_min_eur),
    "requirements.budget_min_eur",
  );
  const budgetMax = optionalMoney(
    firstDefined(input["requirements.budget_max_eur"], input.budgetMaxEur, input.budget_max_eur, raw.budget_max_eur),
    "requirements.budget_max_eur",
  );
  if (budgetMin !== null && budgetMax !== null && budgetMin > budgetMax) {
    throw new Error("requirements.budget_min_eur cannot exceed requirements.budget_max_eur");
  }
  const locations = stringList(
    firstDefined(input["requirements.locations"], input.locations, raw.locations, property.location),
    "requirements.locations",
  );
  const propertyTypes = stringList(
    firstDefined(input["requirements.property_types"], input.propertyTypes, input.property_types, raw.property_types, property.type),
    "requirements.property_types",
  );
  const timeline = boundedString(
    firstDefined(input["requirements.timeline"], input.timeline, raw.timeline),
    "requirements.timeline",
  );
  const bedroomsMin = optionalInteger(
    firstDefined(input["requirements.bedrooms_min"], input.bedroomsMin, input.bedrooms_min, raw.bedrooms_min),
    "requirements.bedrooms_min",
  );
  const financeStatus = boundedString(
    firstDefined(input["requirements.finance_status"], input.financeStatus, input.finance_status, raw.finance_status),
    "requirements.finance_status",
    40,
  );
  if (financeStatus && !["cash", "mortgage", "preapproved", "unknown", "not_applicable"].includes(financeStatus.toLowerCase())) {
    throw new Error("requirements.finance_status must be cash, mortgage, preapproved, unknown, or not_applicable");
  }
  return {
    budget_min_eur: budgetMin,
    budget_max_eur: budgetMax,
    locations,
    property_types: propertyTypes,
    bedrooms_min: bedroomsMin,
    timeline,
    finance_status: financeStatus?.toLowerCase() || null,
  };
}

export function leadIntakeCompleteness(lead) {
  const requirements = lead.requirements || {};
  const missing = [];
  if (!lead.contact_preference) missing.push("preferred_channel");
  if (BUYER_REQUIREMENT_TYPES.has(lead.leadType)) {
    if (requirements.budget_max_eur === null || requirements.budget_max_eur === undefined) missing.push("budget_max_eur");
    if (!requirements.locations?.length) missing.push("locations");
    if (!requirements.timeline) missing.push("timeline");
  } else if (OWNER_REQUIREMENT_TYPES.has(lead.leadType)) {
    if (!requirements.locations?.length) missing.push("locations");
    if (!requirements.property_types?.length) missing.push("property_types");
    if (!requirements.timeline) missing.push("timeline");
  }
  return {
    complete: missing.length === 0,
    missing_fields: missing,
    captured_fields: Object.entries(requirements)
      .filter(([, value]) => (Array.isArray(value) ? value.length > 0 : value !== null && value !== undefined && value !== ""))
      .map(([key]) => key),
  };
}

export function normalizeLeadInput(input = {}) {
  const contact = input.contact && typeof input.contact === "object" && !Array.isArray(input.contact) ? { ...input.contact } : {};
  const property = input.property && typeof input.property === "object" && !Array.isArray(input.property) ? { ...input.property } : {};
  const requestDetails =
    input.request_details && typeof input.request_details === "object" && !Array.isArray(input.request_details)
      ? { ...input.request_details }
      : input.requestDetails && typeof input.requestDetails === "object" && !Array.isArray(input.requestDetails)
        ? { ...input.requestDetails }
        : {};
  for (const field of ["name", "email", "phone", "whatsapp", "viber", "preferred_channel"]) {
    const value = input[`contact.${field}`];
    if (value !== undefined && String(value).trim()) contact[field] = String(value).trim();
    else if (typeof contact[field] === "string") contact[field] = contact[field].trim();
  }
  for (const field of ["location", "type", "area", "bedrooms"]) {
    const value = input[`property.${field}`];
    if (value !== undefined && String(value).trim()) property[field] = String(value).trim();
    else if (typeof property[field] === "string") property[field] = property[field].trim();
  }
  for (const field of ["callback_time", "viewing_date", "viewing_time"]) {
    const value = input[`request_details.${field}`];
    if (value !== undefined && String(value).trim()) requestDetails[field] = String(value).trim();
    else if (typeof requestDetails[field] === "string") requestDetails[field] = requestDetails[field].trim();
  }
  const requirements = normalizeLeadRequirements(input, property);
  return { ...input, contact, property, request_details: requestDetails, requirements };
}

function hasReachableContact(contact = {}) {
  return ["email", "phone", "whatsapp", "viber"].some((field) => Boolean(String(contact[field] || "").trim()));
}

function truthy(value) {
  return value === true || value === "true" || value === "on" || value === "1";
}

export function normalizeBrokerLeadInput(input = {}) {
  const source = String(input.source || "").trim();
  if (!BROKER_INTAKE_SOURCE_SET.has(source)) throw new Error("Manual lead source must be a supported broker channel");
  if (!truthy(input.humanConfirmed ?? input.human_confirmed)) {
    throw new Error("Manual lead intake requires human confirmation");
  }
  const contact = input.contact && typeof input.contact === "object" && !Array.isArray(input.contact) ? { ...input.contact } : {};
  for (const field of ["name", "email", "phone", "whatsapp", "viber", "preferred_channel"]) {
    const value = input[`contact.${field}`];
    if (value !== undefined && String(value).trim()) contact[field] = String(value).trim();
  }
  if (source === "broker_whatsapp" && !contact.whatsapp && contact.phone) contact.whatsapp = contact.phone;
  if (source === "broker_viber" && !contact.viber && contact.phone) contact.viber = contact.phone;
  if (!hasReachableContact(contact)) throw new Error("Manual lead intake requires a reachable contact channel");
  if (source === "broker_email" && !String(contact.email || "").trim()) throw new Error("Email lead source requires an email address");
  if (["broker_phone", "broker_viber", "broker_whatsapp"].includes(source) && !String(contact.phone || contact.whatsapp || contact.viber || "").trim()) {
    throw new Error("Phone, Viber, or WhatsApp lead source requires a phone number");
  }
  const sourcePreference = {
    broker_phone: "phone",
    broker_viber: "viber",
    broker_whatsapp: "whatsapp",
    broker_email: "email",
  }[source];
  const message = boundedString(input.message, "message", 2000) || "";
  const normalized = normalizeLeadInput({
    ...input,
    source,
    intent: "broker_intake",
    contact,
    contact_preference: input.contact_preference || input.contactPreference || sourcePreference,
    message,
  });
  if (OWNER_REQUIREMENT_TYPES.has(normalized.leadType)) {
    normalized.property = {
      ...normalized.property,
      location: normalized.property.location || normalized.requirements.locations[0] || "",
      type: normalized.property.type || normalized.requirements.property_types[0] || "",
    };
  }
  return normalized;
}

export function normalizeBuyerListingLeadInput(input = {}) {
  const leadInput = normalizeLeadInput(input);
  const source = String(leadInput.source || "").trim();
  const intent = BUYER_LISTING_SOURCE_INTENTS[source];
  if (!intent) throw new Error("Listing lead source must be a known canonical source");

  const submittedIntent = String(leadInput.intent || "").trim().toLowerCase();
  if (submittedIntent && submittedIntent !== intent) throw new Error("Listing lead intent must match source");

  if (intent === "inquiry" && !hasReachableContact(leadInput.contact)) {
    throw new Error("Listing inquiry requires a reachable contact channel");
  }
  if ((intent === "callback" || intent === "viewing") && !String(leadInput.contact.phone || "").trim()) {
    throw new Error(`Listing ${intent} requires a phone`);
  }
  if (intent === "viewing") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(leadInput.request_details.viewing_date || "")) {
      throw new Error("Listing viewing requires a preferred date");
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(leadInput.request_details.viewing_time || "")) {
      throw new Error("Listing viewing requires a preferred time");
    }
  }

  return { ...leadInput, source, intent };
}

export function normalizePublicLeadInput(input = {}) {
  const source = String(input.source || "website_listing_detail").trim();
  if (BUYER_LISTING_SOURCE_INTENTS[source]) return normalizeBuyerListingLeadInput({ ...input, source });
  const leadInput = normalizeLeadInput({ ...input, source });
  const contract = PUBLIC_LEAD_SOURCE_CONTRACTS[source];
  if (!contract) throw new Error("Lead source must be a known canonical source");
  if (!contract.leadTypes.includes(leadInput.leadType)) throw new Error("Lead type must match source");
  const submittedIntent = String(leadInput.intent || "").trim().toLowerCase();
  if (submittedIntent && submittedIntent !== contract.intent) throw new Error("Lead intent must match source");
  if (contract.phone && !String(leadInput.contact.phone || "").trim()) throw new Error("Lead source requires a phone");
  if (contract.reachableContact && !hasReachableContact(leadInput.contact)) throw new Error("Lead source requires a reachable contact channel");
  if (contract.property && (!String(leadInput.property.location || "").trim() || !String(leadInput.property.type || "").trim())) {
    throw new Error("Seller valuation requires property location and type");
  }
  return { ...leadInput, source, intent: contract.intent };
}

// `assignedId` is a SECOND-ARGUMENT option on purpose: only server-side code
// can set the identity of a record, never a field inside a request body. The
// authenticated broker-intake path mints its own id (and uses it for
// idempotency against the ledger); public intake gets a fresh server id.
export function createLeadDraft(registry, input, { assignedId = null } = {}) {
  const leadInput = normalizeLeadInput(input);
  if (!leadInput.source || !leadInput.leadType || !leadInput.contact?.name) {
    throw new Error("source, leadType, and contact.name are required");
  }
  if (!LEAD_TYPE_SET.has(leadInput.leadType)) throw new Error("leadType must be a supported lead segment");
  const language = normalizeLeadLanguage(registry, leadInput.language || registry.source_locale);
  const draft = {
    id: assignedId || newRecordId("lead-draft"),
    idempotency_key: normalizeIdempotencyKey(leadInput.idempotencyKey ?? leadInput.idempotency_key),
    source: leadInput.source,
    intent: leadInput.intent || null,
    leadType: leadInput.leadType,
    listingReference: leadInput.listingReference || null,
    contact: leadInput.contact,
    property: leadInput.property,
    request_details: leadInput.request_details,
    requirements: leadInput.requirements,
    contact_preference: normalizeContactPreference(leadInput),
    message: leadInput.message || "",
    language,
    status: "draft",
    requiresBrokerApproval: true,
    hermesDraftAllowed: true,
  };
  draft.intake = leadIntakeCompleteness(draft);
  return draft;
}

function scoreBroker(profile, lead, listingContext) {
  let score = 0;
  if (profile.languages?.includes(lead.language.language)) score += 4;
  if (profile.languages?.includes(lead.language.adminLocale)) score += 2;
  if (profile.lead_types?.includes(lead.leadType)) score += 1;
  if (listingContext.location && profile.locations?.includes(listingContext.location)) score += 1;
  if (listingContext.property_type && profile.property_types?.includes(listingContext.property_type)) score += 1;
  return score;
}

export function assignLeadBroker(lead, { manualBrokerId = null, brokerProfiles = DEFAULT_BROKER_PROFILES, listingContext = {} } = {}) {
  if (manualBrokerId) {
    const profile = brokerProfiles.find((candidate) => candidate.id === manualBrokerId);
    if (!profile) throw new Error("manualBrokerId must match a broker profile");
    return {
      status: "assigned",
      method: "manual_override",
      broker_id: profile.id,
      criteria: { language: lead.language.language, location: listingContext.location || null, property_type: listingContext.property_type || null },
    };
  }

  const ranked = brokerProfiles
    .map((profile) => ({ profile, score: scoreBroker(profile, lead, listingContext) }))
    .sort((a, b) => b.score - a.score || a.profile.id.localeCompare(b.profile.id));
  const best = ranked[0]?.profile;
  if (!best) throw new Error("At least one broker profile is required");
  return {
    status: "assigned",
    method: "rules",
    broker_id: best.id,
    criteria: {
      language: lead.language.language,
      admin_locale: lead.language.adminLocale,
      location: listingContext.location || null,
      property_type: listingContext.property_type || null,
      lead_type: lead.leadType,
    },
  };
}
