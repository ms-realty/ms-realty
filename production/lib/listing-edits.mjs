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
  "listing_status",
  "bedrooms",
  "bedrooms_not_applicable",
  "area_sqm",
  "price_eur",
  "price_on_request",
]);
const TEXT_FACT_FIELDS = new Set(["title", "h1", "description", "location", "property_type", "offer_type"]);
const BOOLEAN_FACT_FIELDS = new Set(["bedrooms_not_applicable", "price_on_request"]);
export const LISTING_STATUSES = Object.freeze(["available", "reserved", "sold", "rented", "archived"]);
const LISTING_STATUS_SET = new Set(LISTING_STATUSES);
const MAX_BULK_LISTING_EDITS = 100;

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
  const rows = readListingEdits(filePath);
  const explicitId = String(edit.id || "").trim();
  const sameIntent = (candidate) =>
    candidate.listing_id === edit.listing_id &&
    candidate.editor === edit.editor &&
    candidate.media_reviewer === edit.media_reviewer &&
    JSON.stringify(candidate.patch || {}) === JSON.stringify(edit.patch || {});
  if (explicitId) {
    const existing = rows.find((row) => row.id === explicitId);
    if (existing) {
      if (!sameIntent(existing)) throw new Error("Listing edit id already belongs to a different change");
      return { ...existing, idempotent: true };
    }
  } else {
    const retry = rows.find(
      (row) =>
        sameIntent(row) &&
        ((row.source_hash_before === edit.source_hash_before && row.source_hash_after === edit.source_hash_after) ||
          (edit.source_hash_before === edit.source_hash_after && row.source_hash_after === edit.source_hash_after)),
    );
    if (retry) return { ...retry, idempotent: true };
  }

  const baseId = `listing-edit-${edit.listing_id}`;
  let id = explicitId || baseId;
  let suffix = 2;
  while (rows.some((row) => row.id === id)) {
    id = `${baseId}-${suffix}`;
    suffix += 1;
  }
  const persisted = { ...edit, id };
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(persisted)}\n`);
  return { ...persisted, idempotent: false };
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

function normalizePatch(patch = {}, { allowEmpty = false } = {}) {
  const entries = Object.entries(patch).filter(([field]) => EDITABLE_FACT_FIELDS.has(field));
  if (!entries.length && allowEmpty) return {};
  if (!entries.length) throw new Error("Listing edit patch must include editable listing facts");
  return Object.fromEntries(entries.map(([field, value]) => [field, normalizePatchValue(field, value)]));
}

function normalizePatchValue(field, value) {
  if (TEXT_FACT_FIELDS.has(field)) return typeof value === "string" ? value.trim() : value;
  if (field === "listing_status") {
    const status = String(value || "").trim().toLowerCase();
    if (!LISTING_STATUS_SET.has(status)) throw new Error("listing_status must be available, reserved, sold, rented, or archived");
    return status;
  }
  if (BOOLEAN_FACT_FIELDS.has(field)) return value === true || value === "true" || value === "on" || value === "1";
  if (value === "" || value === null) return "";
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${field} must be numeric`);
  if (field === "price_eur") {
    if (number <= 0) throw new Error("price_eur must be positive");
    return number;
  }
  if (field === "area_sqm") {
    if (number <= 0) throw new Error("area_sqm must be positive");
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
  const patch = normalizePatch(input.patch, { allowEmpty: Boolean(input.mediaReviewer) });
  const factsAfter = { ...record.facts, ...patch };
  const sourceHashBefore = contentHash(record.facts);
  const sourceHashAfter = contentHash(factsAfter);
  const staleTranslations = staleTranslationsForListing(record, sourceHashAfter, translationTasks);
  const requestedId = String(input.id || "").trim();
  if (requestedId && !/^[a-z0-9][a-z0-9._:-]{2,159}$/i.test(requestedId)) {
    throw new Error("Listing edit id must be a stable identifier");
  }

  return {
    edit: {
      edited_at: editedAt,
      ...(requestedId ? { id: requestedId } : {}),
      listing_id: record.id,
      editor: input.editor,
      media_reviewer: input.mediaReviewer ? String(input.mediaReviewer).trim() : null,
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

function listingIdsFrom(input) {
  const source = Array.isArray(input.listingIds) ? input.listingIds : String(input.listingIds || "").split(",");
  const ids = [...new Set(source.map((value) => String(value || "").trim()).filter(Boolean))];
  if (!ids.length) throw new Error("Select at least one listing");
  if (ids.length > MAX_BULK_LISTING_EDITS) throw new Error(`Bulk listing updates are limited to ${MAX_BULK_LISTING_EDITS} listings`);
  return ids;
}

export function createBulkListingStatusEdits(seed, input, translationTasks = [], editedAt = new Date().toISOString()) {
  const listingIds = listingIdsFrom(input);
  const targetStatus = String(input.targetStatus || input.listingStatus || "").trim().toLowerCase();
  if (!LISTING_STATUS_SET.has(targetStatus)) {
    throw new Error("targetStatus must be available, reserved, sold, rented, or archived");
  }
  if (!input.editor) throw new Error("Bulk listing update requires an editor");
  const requestId = String(input.requestId || "").trim();
  if (requestId && !/^[a-z0-9][a-z0-9._:-]{2,79}$/i.test(requestId)) {
    throw new Error("Bulk listing requestId must be a stable identifier");
  }

  const unchangedListingIds = [];
  const changes = listingIds.flatMap((listingId) => {
    const record = findListing(seed, listingId);
    if (!record) throw new Error(`Unknown listingId: ${listingId}`);
    if ((record.facts?.listing_status || "available") === targetStatus) {
      unchangedListingIds.push(listingId);
      return [];
    }
    const result = createListingEdit(
      seed,
      {
        id: requestId ? `${requestId}-${listingId}` : undefined,
        listingId,
        editor: input.editor,
        patch: { listing_status: targetStatus },
      },
      translationTasks,
      editedAt,
    );
    return [{ listingId, ...result }];
  });

  return {
    targetStatus,
    requestedListingIds: listingIds,
    unchangedListingIds,
    changes,
  };
}

export function assertListingEdits(rows) {
  if (!rows.length) throw new Error("Listing edit ledger must contain at least one row");
  const ids = new Set();
  for (const row of rows) {
    if (!row.id || !row.listing_id || !row.editor || !row.edited_at || !row.source_hash_before || !row.source_hash_after) {
      throw new Error("Listing edit row is missing review data");
    }
    if (ids.has(row.id)) throw new Error("Listing edit ids must be unique");
    ids.add(row.id);
    if (!Number.isInteger(row.stale_translation_count) || row.stale_translation_count < 0) {
      throw new Error("Listing edit stale translation count must be a non-negative integer");
    }
    normalizePatch(row.patch, { allowEmpty: Boolean(row.media_reviewer) });
    if ("contact" in row || "email" in row || "phone" in row || "message" in row) {
      throw new Error("Listing edit rows must not contain private contact data");
    }
  }
  return true;
}
