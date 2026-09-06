import { publishedListingTranslationCopy } from "./content.mjs";
import { publicSeedFor } from "./public-inventory.mjs";
import { contentHash } from "./translations.mjs";
import { contactPath, listingPath } from "./seo.mjs";

export const LISTING_QUESTION_PATH = "/api/listings/question";
export const LISTING_QUESTION_MAX_BYTES = 4096;
const INPUT_FIELDS = new Set(["listingId", "locale", "question"]);
// This is literal passage retrieval, with no synonyms, inference or model call.
const STOP_WORDS = new Set(("a an the is are does do it this that there have has with of in on at to for and or i we can you me my tell about what where which how please " +
  "има ли какво какъв каква какви е са за на в с и или този тази моля " +
  "есть ли какой какая какие что где это на в с и или про пожалуйста " +
  "ist sind hat gibt es der die das ein eine mit von im zu und oder was wo bitte " +
  "is zijn heeft er de het een met van op te en of wat waar graag " +
  "είναι έχει υπάρχει υπάρχουν το η ο τα με σε και ή τι πού παρακαλώ " +
  "האם יש מה איפה עם של על או את זה זו בבקשה").split(/\s+/u));
const ADVICE = /\b(?:legal|law|tax|taxes|mortgage|visa|citizenship|residen(?:ce|cy)|permit|guarantee|investment|yield)\b|данъ|юрид|закон|нотари|налог|правов|ипотек|steuer|recht|hypothek|belasting|jurid|φόρ|νομικ|משפט|מסים|משכנתא|אזרחות/iu;
const UNSAFE = /<[^>]*>|https?:\/\/|javascript:|\b(?:ignore|system|developer|prompt|instruction|publish|send)\b/iu;
const tokens = (value) => [...new Set((value.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) || []).filter((word) => word.length > 1 && !STOP_WORDS.has(word)))];
const badRequest = () => Object.assign(new Error("Use a known listing reference, an available language and a question of 1–240 characters."), { status: 400, code: "invalid_listing_question" });

export function publicListingQuestion({ registry, seed, input, now = new Date().toISOString() }) {
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some((key) => !INPUT_FIELDS.has(key))) throw badRequest();
  if (typeof input.listingId !== "string" || !/^MS-[A-Z0-9-]{1,70}$/u.test(input.listingId) || typeof input.question !== "string" || typeof input.locale !== "string") throw badRequest();
  const question = input.question.trim();
  const locale = registry.locales.find((row) => row.code === input.locale && row.public_enabled && row.indexable);
  if (!locale || !question || question.length > 240 || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/u.test(question)) throw badRequest();
  const record = publicSeedFor(seed, { now }).records.find((row) => row.collection === "listings" && row.id === input.listingId);
  if (!record) throw Object.assign(new Error("This public listing is unavailable."), { status: 404, code: "listing_unavailable" });
  const base = { kind: "listing_source_passages", listing_id: record.id, locale: locale.code, question,
    canonical_url: listingPath(registry, locale.code, record.id), contact_url: contactPath(registry, locale.code),
    source_hash: null, reviewer: null, reviewed_at: null, passages: [], status: "no_answer" };
  const translation = (record.translations || []).find((row) => row.locale === locale.code);
  const copy = publishedListingTranslationCopy(translation);
  // CMS seed facts are the canonical source snapshot used by its translation
  // importer. Compare that exact hash; never accept an older catalogue hash.
  const sourceHash = contentHash(record.facts);
  if (!copy || translation.source_locale !== record.source_locale || translation.listing !== record.id ||
      translation.source_hash !== sourceHash || translation.translated_hash !== contentHash(copy) ||
      [translation.approved_at, translation.publication_authorized_at, translation.published_at].some((value) => Date.parse(value) > Date.parse(now))) {
    return { ...base, reason: "approved_source_unavailable" };
  }
  const source = { source_hash: sourceHash, reviewer: translation.reviewer, reviewed_at: translation.approved_at };
  if (ADVICE.test(question) || UNSAFE.test(question)) return { ...base, ...source, reason: "outside_source_lookup" };
  const terms = tokens(question);
  if (!terms.length || /<[^>]*>/u.test(copy.description)) return { ...base, ...source, reason: "no_related_passage" };
  const passages = (copy.description.match(/[^.!?\n]+(?:[.!?]+|$)/gu) || [])
    .map((text) => text.trim())
    .filter((text) => text && text.length <= 1000 && terms.every((term) => tokens(text).includes(term)))
    .slice(0, 2)
    .map((quote) => ({ quote, field: "description", source_hash: sourceHash }));
  return { ...base, ...source, status: passages.length ? "related_source" : "no_answer", reason: passages.length ? null : "no_related_passage", passages };
}
