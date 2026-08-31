import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { mediaWorkflow } from "./media.mjs";
import { fromRoot } from "./paths.mjs";

export const DEFAULT_MEDIA_REVIEW_LEDGER_PATH = fromRoot("production", "data", "media-reviews.jsonl");

const PUBLIC_KINDS = new Set(["photo", "floor_plan", "video"]);
const DECISIONS = new Set(["publish", "keep_private"]);
const IMAGE_URL = /\.(?:avif|gif|jpe?g|png|webp)(?:[?#]|$)/i;
const VIDEO_URL = /\.(?:m3u8|mov|mp4|webm)(?:[?#]|$)|(?:youtube\.com|youtu\.be|vimeo\.com)/i;

function assetUrl(item = {}) {
  return String(item.asset_url || item.url || "").trim();
}

function sourceAssetUrl(item = {}) {
  return String(item.source_url || item.asset_url || item.url || "").trim();
}

function httpsUrl(value) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export function mediaAssetId(item = {}) {
  if (/^media-[a-f0-9]{20}$/.test(String(item.asset_id || ""))) return item.asset_id;
  const url = sourceAssetUrl(item);
  if (!url) throw new Error("Media asset requires a source URL");
  return `media-${crypto.createHash("sha256").update(url).digest("hex").slice(0, 20)}`;
}

export function resetMediaReviews(filePath = DEFAULT_MEDIA_REVIEW_LEDGER_PATH) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "");
}

export function readMediaReviews(filePath = DEFAULT_MEDIA_REVIEW_LEDGER_PATH) {
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function findListing(seed, listingId) {
  return seed.records.find((record) => record.collection === "listings" && record.id === listingId);
}

function findAsset(record, requestedAssetId) {
  return (record.media || []).find((item) => mediaAssetId(item) === requestedAssetId);
}

function normalizedKind(value, fallback) {
  const kind = String(value || fallback || "").trim().toLowerCase();
  if (!PUBLIC_KINDS.has(kind)) throw new Error("Media kind must be photo, floor_plan, or video");
  return kind;
}

function normalizedDecision(value) {
  const decision = String(value || "").trim().toLowerCase();
  if (!DECISIONS.has(decision)) throw new Error("Media decision must be publish or keep_private");
  return decision;
}

function normalizedText(value, field, max = 500) {
  const text = String(value || "").trim();
  if (text.length > max) throw new Error(`${field} must be ${max} characters or fewer`);
  return text;
}

function validatedPublicUrl(value, kind) {
  const url = String(value || "").trim();
  if (!httpsUrl(url)) throw new Error("Published media requires an HTTPS asset URL");
  if (kind === "video" && !VIDEO_URL.test(url)) throw new Error("Published video requires a supported video URL");
  if (kind !== "video" && !IMAGE_URL.test(url)) throw new Error("Published photo or floor plan requires an image URL");
  return url;
}

export function createMediaReview(seed, input, reviewedAt = new Date().toISOString()) {
  const listingId = String(input.listingId || input.listing_id || "").trim();
  const record = findListing(seed, listingId);
  if (!record) throw new Error("Known listingId is required");
  const requestedAssetId = String(input.assetId || input.asset_id || "").trim();
  const item = findAsset(record, requestedAssetId);
  if (!item) throw new Error("Known media assetId is required");
  const reviewer = String(input.reviewer || "").trim();
  if (!reviewer) throw new Error("Media review requires a reviewer");
  const confirmed = input.reviewConfirmed === true || input.reviewConfirmed === "true" || input.reviewConfirmed === "on" || input.reviewConfirmed === "1";
  if (!confirmed) throw new Error("Media review requires explicit human confirmation");

  const decision = normalizedDecision(input.decision);
  const kind = normalizedKind(input.kind, item.kind);
  const alt = normalizedText(input.alt || input.accessibilityCaption, "Media alt text");
  const replacementUrl = String(input.replacementUrl || input.replacement_url || "").trim();
  const sourceUrl = sourceAssetUrl(item);
  const deliveryUrl = assetUrl(item);
  let publicUrl = null;
  if (decision === "publish") {
    if (!alt) throw new Error("Published media requires reviewed alt text or an accessibility caption");
    if (item.kind === "site_chrome" && !replacementUrl) {
      throw new Error("Site chrome cannot be published without a reviewed replacement asset");
    }
    publicUrl = validatedPublicUrl(replacementUrl || deliveryUrl, kind);
  } else if (replacementUrl) {
    if (!httpsUrl(replacementUrl)) throw new Error("Replacement media requires an HTTPS asset URL");
    publicUrl = replacementUrl;
  }

  const requestedId = String(input.id || "").trim();
  if (requestedId && !/^[a-z0-9][a-z0-9._:-]{2,159}$/i.test(requestedId)) {
    throw new Error("Media review id must be a stable identifier");
  }
  return {
    ...(requestedId ? { id: requestedId } : {}),
    reviewed_at: reviewedAt,
    listing_id: record.id,
    asset_id: requestedAssetId,
    source_url: sourceUrl,
    replacement_url: replacementUrl || null,
    public_url: publicUrl,
    kind,
    alt,
    decision,
    is_public: decision === "publish",
    review_status: decision === "publish" ? "approved_by_human" : "reviewed_private",
    reviewer,
    human_confirmed: true,
  };
}

function sameIntent(left, right) {
  return (
    left.listing_id === right.listing_id &&
    left.asset_id === right.asset_id &&
    left.reviewer === right.reviewer &&
    left.decision === right.decision &&
    left.kind === right.kind &&
    left.alt === right.alt &&
    left.replacement_url === right.replacement_url
  );
}

export function appendMediaReview(review, { filePath = DEFAULT_MEDIA_REVIEW_LEDGER_PATH } = {}) {
  const rows = readMediaReviews(filePath);
  if (review.id) {
    const existing = rows.find((row) => row.id === review.id);
    if (existing) {
      if (!sameIntent(existing, review)) throw new Error("Media review id already belongs to a different decision");
      return { ...existing, idempotent: true };
    }
  }
  const retry = rows.find((row) => sameIntent(row, review));
  if (retry) return { ...retry, idempotent: true };

  const baseId = `media-review-${review.listing_id}-${review.asset_id.replace(/^media-/, "")}`;
  let id = review.id || baseId;
  let suffix = 2;
  while (rows.some((row) => row.id === id)) {
    id = `${baseId}-${suffix}`;
    suffix += 1;
  }
  const persisted = { ...review, id };
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(persisted)}\n`);
  return { ...persisted, idempotent: false };
}

export function applyMediaReviews(seed, reviews = []) {
  if (!reviews.length) return seed;
  const latestByAsset = new Map(reviews.map((review) => [`${review.listing_id}:${review.asset_id}`, review]));
  return {
    ...seed,
    records: seed.records.map((record) => {
      if (record.collection !== "listings") return record;
      let changed = false;
      const sourceMedia = record.media || [];
      const approvedReplacements = new Map();
      for (const item of sourceMedia) {
        if (!item.replaces_asset_id) continue;
        const assetId = mediaAssetId(item);
        const review = latestByAsset.get(`${record.id}:${assetId}`);
        if (review?.is_public) approvedReplacements.set(item.replaces_asset_id, { assetId, review });
      }
      const media = sourceMedia.map((item) => {
        const assetId = mediaAssetId(item);
        const replacement = approvedReplacements.get(assetId);
        if (replacement) {
          changed = true;
          return {
            ...item,
            asset_id: assetId,
            is_public: false,
            review_status: "replaced_by_human",
            replacement_asset_id: replacement.assetId,
            media_reviewer: replacement.review.reviewer,
            media_reviewed_at: replacement.review.reviewed_at,
          };
        }
        const review = latestByAsset.get(`${record.id}:${assetId}`);
        if (!review) return { ...item, asset_id: assetId };
        changed = true;
        return {
          ...item,
          asset_id: assetId,
          source_url: item.source_url || item.url,
          asset_url: review.public_url || item.asset_url,
          kind: review.kind,
          alt: review.alt,
          is_public: review.is_public,
          review_status: review.review_status,
          media_reviewer: review.reviewer,
          media_reviewed_at: review.reviewed_at,
        };
      });
      if (!changed) return { ...record, media };
      return { ...record, media, media_workflow: mediaWorkflow(media) };
    }),
  };
}

export function assertMediaReviews(rows) {
  const ids = new Set();
  for (const row of rows) {
    if (!row.id || !row.reviewed_at || !row.listing_id || !row.asset_id || !row.reviewer || row.human_confirmed !== true) {
      throw new Error("Media review row is missing audit data");
    }
    if (ids.has(row.id)) throw new Error("Media review ids must be unique");
    ids.add(row.id);
    normalizedDecision(row.decision);
    normalizedKind(row.kind);
    if (row.is_public && row.review_status !== "approved_by_human") throw new Error("Public media must be human approved");
    if ("email" in row || "phone" in row || "message" in row || "contact" in row) {
      throw new Error("Media review rows must not contain private contact data");
    }
  }
  return true;
}
