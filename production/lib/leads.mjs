import { getLocale, adminLocales } from "./locales.mjs";

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
    message: input.message || "",
    language,
    status: "draft",
    requiresBrokerApproval: true,
    hermesDraftAllowed: true,
  };
}
