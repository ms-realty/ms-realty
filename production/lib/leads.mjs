import { getLocale, adminLocales } from "./locales.mjs";

const CONTACT_PREFERENCES = new Set(["phone", "viber", "whatsapp", "email"]);
const LOCAL_LOCATIONS = ["Sandanski", "Petrich", "Bansko", "Blagoevgrad", "Sveti Vlas", "Sunny Beach", "Melnik"];
const PROPERTY_TYPES = ["apartment", "house", "villa", "land", "commercial", "hotel", "office", "industrial"];
const DEFAULT_BROKER_PROFILES = [
  { id: "broker_bg", languages: ["bg"], locations: LOCAL_LOCATIONS, property_types: PROPERTY_TYPES, lead_types: ["buyer", "seller", "general"] },
  { id: "broker_ru", languages: ["ru"], locations: LOCAL_LOCATIONS, property_types: PROPERTY_TYPES, lead_types: ["buyer", "seller", "general"] },
  {
    id: "broker_international",
    languages: ["en", "de", "nl", "el", "he"],
    locations: LOCAL_LOCATIONS,
    property_types: PROPERTY_TYPES,
    lead_types: ["buyer", "seller", "general"],
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
  if (!value) return null;
  const normalized = String(value).toLowerCase();
  if (!CONTACT_PREFERENCES.has(normalized)) {
    throw new Error("contact_preference must be phone, viber, whatsapp, or email");
  }
  return normalized;
}

export function createLeadDraft(registry, input) {
  if (!input.source || !input.leadType || !input.contact?.name) {
    throw new Error("source, leadType, and contact.name are required");
  }
  const language = normalizeLeadLanguage(registry, input.language || registry.source_locale);
  return {
    id: input.id || `lead-draft-${Date.now()}`,
    source: input.source,
    leadType: input.leadType,
    listingReference: input.listingReference || null,
    contact: input.contact,
    contact_preference: normalizeContactPreference(input),
    message: input.message || "",
    language,
    status: "draft",
    requiresBrokerApproval: true,
    hermesDraftAllowed: true,
  };
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
