const MUTATING_ACTIONS = new Set(["publish", "send_message", "mark_indexable", "change_price", "change_redirect"]);
const SANDANSKI_SEA_TOKENS = ["sea", "seaside", "coast", "coastal", "beach", "море", "морски", "плаж", "θάλασσα", "παραλία", "ים", "חוף"];
const LEGAL_CLAIM_TOKENS = ["tax", "legal", "mortgage", "financing", "visa", "residency", "notary", "данък", "ипотека", "правн", "налог", "ипотек", "юрид", "φόρος", "νομικ", "משכנת", "מס", "חוק"];

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

function draftText(draft) {
  return [draft.title, draft.body, draft.seo_title, draft.meta_description].filter(Boolean).join("\n");
}

function factValues(propertyFacts) {
  return Object.values(propertyFacts)
    .filter((value) => ["string", "number"].includes(typeof value))
    .map(String)
    .filter(Boolean);
}

function hasToken(text, tokens) {
  const normalized = ` ${String(text).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ")} `;
  return tokens.some((token) => normalized.includes(` ${token} `));
}

export function validateHermesTranslationDraft({ draft, propertyFacts = {}, sourceSnapshot = {} }) {
  if (!draft || typeof draft !== "object") throw new Error("Hermes draft output is required");
  if (!Array.isArray(draft.citations) || !draft.citations.length) throw new Error("Hermes draft requires citations");
  if (!sourceSnapshot.source_hash) throw new Error("Hermes draft requires a source snapshot hash");

  const text = draftText(draft);
  if (!text) throw new Error("Hermes draft requires translated text");
  if (/sandanski/i.test(text) && hasToken(text, SANDANSKI_SEA_TOKENS)) {
    throw new Error("Hermes draft must not frame Sandanski as a sea destination");
  }
  for (const value of factValues(propertyFacts)) {
    if (!text.includes(value)) throw new Error(`Hermes draft changed or omitted property fact: ${value}`);
  }
  if (hasToken(text, LEGAL_CLAIM_TOKENS) && sourceSnapshot.approved_legal_content !== true) {
    throw new Error("Hermes legal/tax/process claims require approved source content");
  }

  return {
    ...draft,
    status: "hermes_drafted",
    public_indexable: false,
    human_approved: false,
    source_snapshot: sourceSnapshot,
  };
}
