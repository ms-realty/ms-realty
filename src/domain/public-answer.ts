// Butler answers on a published listing page (ADR 0017, ADR 0007, ADR 0011 §5 "Act"). Shared
// vocabulary of the router, the two answer tiers, the receipt and the staff list. Pure.

/** Question types the facts tier answers without a model. */
export const factKinds = [
  "price",
  "area",
  "bedrooms",
  "type",
  "floor",
  "place",
  "availability",
  "reference",
  "viewing",
  "contact",
  "inclusions",
] as const;
export type FactKind = (typeof factKinds)[number];

/** Questions Butler never answers, whatever the listing says; each has a fixed refusal. */
export const refusalClasses = [
  "negotiation",
  "legal",
  "tax",
  "money",
  "value",
  "people",
  "action",
] as const;
export type RefusalClass = (typeof refusalClasses)[number];

/**
 * facts: the deterministic answerer · text: one model call, validated · none: nothing ran (a
 * refusal, an injection attempt, the limit, or the text tier switched off).
 */
export const answerTiers = ["facts", "text", "none"] as const;
export type AnswerTier = (typeof answerTiers)[number];

/**
 * answered: a sourced answer was shown · unknown: the sources do not say · refused: a fixed
 * refusal · rejected: the model's output failed validation and was not shown · limited: the
 * visitor's rate limit or the daily budget stopped the question.
 */
export const answerOutcomes = ["answered", "unknown", "refused", "rejected", "limited"] as const;
export type AnswerOutcome = (typeof answerOutcomes)[number];

/** How the router read a question; stored on the receipt as `question_kind`. */
export type QuestionKind =
  | FactKind
  | `refusal.${RefusalClass}`
  | "injection"
  | "contact_details"
  | "other"
  | "multiple";

/** Longest question accepted, in characters. */
export const maxQuestionLength = 300;

/**
 * Source keys a receipt records and an answer cites: `listing.title`, `listing.description`,
 * `fact.<key>` (a published fact of the manifest), `listing.availability`, `listing.reference`,
 * `agency.contact`, `area:<slug>` (an approved area guide for the listing's place).
 */
export type SourceKey = string;

export function isSourceKey(value: string): boolean {
  return /^(?:listing\.(?:title|description|availability|reference|purpose|type|place)|agency\.contact|fact\.[a-z0-9_.]{1,80}|area:[a-z\d][a-z\d-]{0,100})$/.test(
    value,
  );
}

/** Days a receipt keeps the visitor's question and the answer text; the receipt stays. */
export const answerTextRetentionDays = 30;
