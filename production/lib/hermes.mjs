const MUTATING_ACTIONS = new Set(["publish", "send_message", "mark_indexable", "change_price", "change_redirect"]);

export function assertHermesActionAllowed(action) {
  if (MUTATING_ACTIONS.has(action)) {
    throw new Error(`Hermes Agent cannot perform mutating action: ${action}`);
  }
  return true;
}

export function translationPrompt({ sourceLocale, targetLocale, sourceText, propertyFacts = {}, glossary = {} }) {
  if (!sourceLocale || !targetLocale || !sourceText) {
    throw new Error("sourceLocale, targetLocale, and sourceText are required");
  }
  return {
    role: "translation_draft",
    sourceLocale,
    targetLocale,
    sourceText,
    propertyFacts,
    glossary,
    rules: [
      "Draft only; never publish.",
      "Preserve price, area, property ID, location, availability, and contact facts exactly.",
      "Do not describe Sandanski as a sea destination.",
      "Legal, tax, financing, and valuation claims require approved CMS source content.",
      "Return SEO title and meta description drafts within normal search-result lengths.",
    ],
  };
}
