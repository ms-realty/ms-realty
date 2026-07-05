import fs from "node:fs";
import path from "node:path";
import { fromRoot } from "./paths.mjs";
import { contentHash, markStaleWhenSourceChanges } from "./translations.mjs";

export const DEFAULT_LISTING_EDIT_LEDGER_PATH = fromRoot("production", "data", "listing-edits.jsonl");

const EDITABLE_FACT_FIELDS = new Set([
  "title",
  "h1",
  "description",
  "location",
  "property_type",
  "offer_type",
  "bedrooms",
  "price_eur",
  "price_on_request",
]);
const TEXT_FACT_FIELDS = new Set(["title", "h1", "description", "location", "property_type", "offer_type"]);
const BOOLEAN_FACT_FIELDS = new Set(["price_on_request"]);

export function resetListingEdits(filePath = DEFAULT_LISTING_EDIT_LEDGER_PATH) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "");
}

export function readListingEdits(filePath = DEFAULT_LISTING_EDIT_LEDGER_PATH) {
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export function appendListingEdit(edit, { filePath = DEFAULT_LISTING_EDIT_LEDGER_PATH } = {}) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(edit)}\n`);
  return edit;
}

export function applyListingEdits(seed, edits = []) {
  const patches = new Map();
  const mediaReviewers = new Map();
  for (const edit of edits) {
    if (!edit.listing_id) continue;
    if (edit.patch) patches.set(edit.listing_id, { ...(patches.get(edit.listing_id) || {}), ...edit.patch });
    if (edit.media_reviewer) mediaReviewers.set(edit.listing_id, edit.media_reviewer);
  }
  if (!patches.size && !mediaReviewers.size) return seed;
  return {
    ...seed,
    records: seed.records.map((record) => {
      if (record.collection !== "listings" || (!patches.has(record.id) && !mediaReviewers.has(record.id))) return record;
      const mediaReviewer = mediaReviewers.get(record.id);
      const media = mediaReviewer
        ? (record.media || []).map((item) =>
            item.is_public ? item : { ...item, review_status: "reviewed_private", media_reviewer: mediaReviewer },
          )
        : record.media;
      return {
        ...record,
        facts: { ...record.facts, ...(patches.get(record.id) || {}) },
        media,
        media_workflow: mediaReviewer
          ? { ...record.media_workflow, review_gated_assets: 0, media_reviewer: mediaReviewer }
          : record.media_workflow,
      };
    }),
  };
}

function findListing(seed, listingId) {
  return seed.records.find((record) => record.collection === "listings" && record.id === listingId);
}

function normalizePatch(patch = {}) {
  const entries = Object.entries(patch).filter(([field]) => EDITABLE_FACT_FIELDS.has(field));
  if (!entries.length) throw new Error("Listing edit patch must include editable listing facts");
  return Object.fromEntries(entries.map(([field, value]) => [field, normalizePatchValue(field, value)]));
}

function normalizePatchValue(field, value) {
  if (TEXT_FACT_FIELDS.has(field)) return typeof value === "string" ? value.trim() : value;
  if (BOOLEAN_FACT_FIELDS.has(field)) return value === true || value === "true" || value === "on" || value === "1";
  if (value === "" || value === null) return "";
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${field} must be numeric`);
  if (field === "price_eur") {
    if (number <= 0) throw new Error("price_eur must be positive");
    return number;
  }
  if (field === "bedrooms") {
    if (!Number.isInteger(number) || number < 0) throw new Error("bedrooms must be a non-negative integer");
    return number;
  }
  return value;
}

export function staleTranslationsForListing(record, sourceHashAfter, translationTasks = []) {
  const stale = (translation) => {
    const staleTranslation = markStaleWhenSourceChanges(sourceHashAfter, translation);
    return staleTranslation.status === "stale"
      ? {
          ...staleTranslation,
          previous_status: translation.status,
          stale_reason: "source_listing_changed",
        }
      : staleTranslation;
  };
  const seedTranslations = record.translations
    .filter((translation) => translation.locale !== record.source_locale)
    .map(stale);
  const ledgerTranslations = translationTasks
    .filter((translation) => translation.object_type === "listing" && translation.object_id === record.id)
    .filter((translation) => translation.target_locale !== record.source_locale)
    .map(stale);

  return [...seedTranslations, ...ledgerTranslations]
    .filter((translation) => translation.status === "stale");
}

export function createListingEdit(seed, input, translationTasks = [], editedAt = new Date().toISOString()) {
  const record = findListing(seed, input.listingId);
  if (!record) throw new Error("Known listingId is required");
  if (!input.editor) throw new Error("Listing edit requires an editor");
  const patch = normalizePatch(input.patch);
  const factsAfter = { ...record.facts, ...patch };
  const sourceHashBefore = contentHash(record.facts);
  const sourceHashAfter = contentHash(factsAfter);
  const staleTranslations = staleTranslationsForListing(record, sourceHashAfter, translationTasks);

  return {
    edit: {
      edited_at: editedAt,
      id: input.id || `listing-edit-${record.id}`,
      listing_id: record.id,
      editor: input.editor,
      source_locale: record.source_locale,
      patch,
      source_hash_before: sourceHashBefore,
      source_hash_after: sourceHashAfter,
      stale_translation_count: staleTranslations.length,
      stale_locales: [...new Set(staleTranslations.map((translation) => translation.locale || translation.target_locale))],
    },
    staleTranslations,
  };
}

export function assertListingEdits(rows) {
  if (!rows.length) throw new Error("Listing edit ledger must contain at least one row");
  for (const row of rows) {
    if (!row.listing_id || !row.editor || !row.source_hash_after) throw new Error("Listing edit row is missing review data");
    if (row.stale_translation_count < 1) throw new Error("Listing edit must stale at least one dependent translation");
  }
  return true;
}
