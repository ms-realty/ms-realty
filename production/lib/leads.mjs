import { getLocale, adminLocales } from "./locales.mjs";

const CONTACT_PREFERENCES = new Set(["phone", "viber", "whatsapp", "email"]);

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
