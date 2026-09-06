import { framesInlandPlaceAsSea } from "./sea-claims.mjs";

const MUTATING_ACTIONS = new Set(["publish", "send_message", "mark_indexable", "change_price", "change_redirect"]);
const LEGAL_CLAIM_TOKENS = ["tax", "legal", "mortgage", "financing", "visa", "residency", "notary", "данък", "ипотека", "правн", "налог", "ипотек", "юрид", "φόρος", "νομικ", "משכנת", "מס", "חוק"];
const DEFAULT_TONE_RULES = ["Professional real-estate broker tone.", "Factual and concise; no hype or unverifiable claims."];
const FORBIDDEN_CLAIMS = [
  "Do not describe Sandanski as a sea, beach, coast, or seaside destination.",
  "Do not invent legal, tax, financing, residency, valuation, or availability claims.",
];
const DEFAULT_SEO_TARGETS = { title_max_chars: 60, meta_description_min_chars: 120, meta_description_max_chars: 160 };

export function assertHermesActionAllowed(action) {
  if (MUTATING_ACTIONS.has(action)) {
    throw new Error(`Hermes Agent cannot perform mutating action: ${action}`);
  }
  return true;
}

export function translationPrompt({
  sourceLocale,
  targetLocale,
  sourceText,
  propertyFacts = {},
  glossary = {},
  toneRules = DEFAULT_TONE_RULES,
  seoTargets = DEFAULT_SEO_TARGETS,
}) {
  if (!sourceLocale || !targetLocale || !sourceText) {
    throw new Error("sourceLocale, targetLocale, and sourceText are required");
  }
  const targets = { ...DEFAULT_SEO_TARGETS, ...seoTargets };
  return {
    role: "translation_draft",
    sourceLocale,
    targetLocale,
    sourceText,
    propertyFacts,
    glossary,
    toneRules: [...toneRules],
    forbiddenClaims: [...FORBIDDEN_CLAIMS],
    seoTargets: targets,
    capabilities: {
      can_publish: false,
      can_mark_indexable: false,
      requires_human_approval: true,
    },
    rules: [
      "Draft only; never publish.",
      "Preserve price, area, property ID, location, availability, and contact facts exactly.",
      "Do not describe Sandanski as a sea destination.",
      "Legal, tax, financing, and valuation claims require approved CMS source content.",
      `Return SEO title drafts at or below ${targets.title_max_chars} characters.`,
      `Return meta description drafts between ${targets.meta_description_min_chars} and ${targets.meta_description_max_chars} characters.`,
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
  if (framesInlandPlaceAsSea(text)) {
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

export function replyPrompt({ lead, language, listingFacts = {} }) {
  if (!lead?.lead_id || !language || !lead.message_original) {
    throw new Error("lead_id, language, and original message are required for Hermes reply drafts");
  }
  assertHermesActionAllowed("draft_reply");
  return {
    role: "reply_draft",
    leadId: lead.lead_id,
    language,
    listingReference: lead.listing_reference || null,
    originalMessage: lead.message_original,
    contactPreference: lead.contact_preference || null,
    listingFacts,
    capabilities: {
      can_send_customer_messages: false,
      requires_broker_approval: true,
    },
    rules: [
      "Draft only; never send.",
      "Preserve listing reference, location, price, area, and contact facts exactly when provided.",
      "Do not describe Sandanski as a sea destination.",
      "Legal, tax, financing, and valuation claims require approved CMS source content.",
    ],
  };
}

export function validateHermesReplyDraft({ draft, lead, prompt }) {
  if (!draft) throw new Error("Hermes reply draft output is required");
  const text =
    typeof draft === "string"
      ? draft.trim()
      : String(draft.text || draft.body || draft.message || draft.draft || "").trim();
  if (!text) throw new Error("Hermes reply draft requires text");
  if (framesInlandPlaceAsSea(text)) {
    throw new Error("Hermes reply draft must not frame Sandanski as a sea destination");
  }
  if (hasToken(text, LEGAL_CLAIM_TOKENS) && prompt.approved_legal_content !== true) {
    throw new Error("Hermes reply legal/tax/process claims require approved source content");
  }
  const citations = Array.isArray(draft.citations) ? draft.citations : [{ source: "lead", field: "message_original" }];
  return {
    status: "hermes_reply_draft",
    lead_id: lead.lead_id,
    language: draft.language || prompt.language,
    text,
    citations,
    broker_approval_required: true,
    can_send_without_approval: false,
  };
}

// Listing copy is the one place Hermes writes rather than translates, so the
// rule is the mirror image of the translation rule: a translation must carry
// every approved fact through, a description must not introduce a figure the
// catalogue never approved. "Five minutes from the centre" and "built in 1998"
// are exactly the sentences a broker would otherwise have to catch by reading.
export const HERMES_LISTING_COPY_FIELDS = Object.freeze(["description", "seo_title", "meta_description", "alt_text", "caption"]);

const LISTING_COPY_LIMITS = Object.freeze({
  description: { min: 40, max: 1800 },
  seo_title: { min: 10, max: 60 },
  meta_description: { min: 120, max: 160 },
  alt_text: { min: 5, max: 160 },
  caption: { min: 5, max: 200 },
});

function assertListingCopyField(field) {
  if (!HERMES_LISTING_COPY_FIELDS.includes(field)) {
    throw new Error(`Hermes listing copy field must be one of: ${HERMES_LISTING_COPY_FIELDS.join(", ")}`);
  }
  return field;
}

// 68 000 €, 68,000 and 68000 are the same figure written three ways.
function digitRuns(text) {
  return [...String(text).matchAll(/\d[\d\u00a0\u202f .,]*\d|\d/gu)]
    .map((match) => match[0].replace(/[^\d]/gu, ""))
    .filter(Boolean);
}

export function listingCopyPrompt({
  field,
  locale,
  listingReference = null,
  sourceUrl = null,
  propertyFacts = {},
  sourceText = "",
  toneRules = DEFAULT_TONE_RULES,
  seoTargets = DEFAULT_SEO_TARGETS,
}) {
  assertListingCopyField(field);
  if (!locale) throw new Error("locale is required for Hermes listing copy drafts");
  if (!Object.keys(propertyFacts).length) {
    throw new Error("Hermes listing copy drafts require approved property facts to draw from");
  }
  assertHermesActionAllowed("draft_listing_copy");
  const limits = LISTING_COPY_LIMITS[field];
  return {
    role: "listing_copy_draft",
    field,
    locale,
    listingReference,
    sourceUrl,
    propertyFacts,
    sourceText,
    toneRules: [...toneRules],
    forbiddenClaims: [...FORBIDDEN_CLAIMS],
    seoTargets: { ...DEFAULT_SEO_TARGETS, ...seoTargets },
    limits,
    capabilities: {
      can_publish: false,
      can_mark_indexable: false,
      can_change_price: false,
      requires_human_approval: true,
    },
    rules: [
      "Draft only; never publish.",
      "Use only the approved property facts supplied. State no figure that is not among them.",
      "Do not describe Sandanski as a sea destination.",
      "Legal, tax, financing, and valuation claims require approved CMS source content.",
      `Return between ${limits.min} and ${limits.max} characters.`,
    ],
  };
}

export function validateHermesListingCopyDraft({ draft, field, propertyFacts = {}, sourceSnapshot = {} }) {
  assertListingCopyField(field);
  if (!draft) throw new Error("Hermes listing copy draft output is required");
  const text = typeof draft === "string" ? draft.trim() : String(draft.text || draft.body || draft.draft || "").trim();
  if (!text) throw new Error("Hermes listing copy draft requires text");

  const limits = LISTING_COPY_LIMITS[field];
  if (text.length < limits.min || text.length > limits.max) {
    throw new Error(`Hermes ${field} draft must be between ${limits.min} and ${limits.max} characters`);
  }
  if (framesInlandPlaceAsSea(text)) {
    throw new Error("Hermes listing copy draft must not frame Sandanski as a sea destination");
  }
  if (hasToken(text, LEGAL_CLAIM_TOKENS) && sourceSnapshot.approved_legal_content !== true) {
    throw new Error("Hermes listing copy legal/tax/process claims require approved source content");
  }

  const approved = new Set(factValues(propertyFacts).flatMap(digitRuns));
  for (const value of digitRuns(text)) {
    if (!approved.has(value)) throw new Error(`Hermes listing copy draft states an unapproved figure: ${value}`);
  }

  return {
    status: "hermes_drafted",
    field,
    text,
    citations: Array.isArray(draft?.citations) && draft.citations.length ? draft.citations : [{ source: "listing_facts" }],
    human_approval_required: true,
    can_publish: false,
    public_indexable: false,
    source_snapshot: sourceSnapshot,
  };
}
