import fs from "node:fs";
import path from "node:path";
import { imageUrlFromMediaItem } from "./media.mjs";
import { fromRoot } from "./paths.mjs";

export const TOUR_PROVIDER = "photo-sphere-viewer";
export const DEFAULT_TOUR_APPROVAL_LEDGER_PATH = fromRoot("production", "data", "tour-approvals.jsonl");

function httpsUrl(value) {
  return typeof value === "string" && /^https:\/\//.test(value);
}

export function galleryFallback(media = []) {
  const seen = new Set();
  return media
    .map((item) => ({ ...item, url: imageUrlFromMediaItem(item) }))
    .filter((item) => {
      if (!item.url || seen.has(item.url)) return false;
      seen.add(item.url);
      return true;
    })
    .slice(0, 6)
    .map((item) => ({
      url: item.url,
      alt: item.alt || "Property photo",
    }));
}

export function createTourField({ listingId, panoramaUrl = null, thumbnailUrl = null, accessibilityCaption = "", isPublic = false, media = [] }) {
  const fallbackGallery = galleryFallback(media);
  if (panoramaUrl && !httpsUrl(panoramaUrl)) throw new Error("panorama_url must be an HTTPS URL");
  if (thumbnailUrl && !httpsUrl(thumbnailUrl)) throw new Error("thumbnail_url must be an HTTPS URL");
  if (isPublic && (!panoramaUrl || !accessibilityCaption || !fallbackGallery.length)) {
    throw new Error("Public 360 tours require panorama_url, accessibility_caption, and fallback gallery");
  }

  return {
    provider: TOUR_PROVIDER,
    listing_id: listingId,
    panorama_url: panoramaUrl,
    thumbnail_url: thumbnailUrl,
    hotspots: [],
    is_public: isPublic,
    accessibility_caption: accessibilityCaption,
    review_status: isPublic ? "approved" : "needs_panorama_upload",
    fallback_gallery: fallbackGallery,
  };
}

export function publicTour(tour) {
  if (!tour?.is_public) {
    return {
      available: false,
      provider: TOUR_PROVIDER,
      review_status: tour?.review_status || "missing",
      fallback_gallery: tour?.fallback_gallery || [],
    };
  }

  if (!httpsUrl(tour.panorama_url) || !tour.accessibility_caption || !tour.fallback_gallery?.length) {
    throw new Error("Public 360 tour is missing required fallback or caption");
  }

  return {
    available: true,
    provider: TOUR_PROVIDER,
    mount_target: "psv-listing-tour",
    panorama_url: tour.panorama_url,
    thumbnail_url: tour.thumbnail_url,
    accessibility_caption: tour.accessibility_caption,
    fallback_gallery: tour.fallback_gallery,
  };
}

function listingRecord(seed, listingId) {
  return seed.records.find((record) => record.collection === "listings" && record.id === listingId);
}

export function resetTourApprovals(filePath = DEFAULT_TOUR_APPROVAL_LEDGER_PATH) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "");
}

export function readTourApprovals(filePath = DEFAULT_TOUR_APPROVAL_LEDGER_PATH) {
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export function createTourApproval(seed, input, approvedAt = new Date().toISOString()) {
  const record = listingRecord(seed, input.listingId);
  if (!record) throw new Error("Known listingId is required");
  if (!input.reviewer) throw new Error("Tour approval requires a reviewer");
  const confirmed = input.reviewConfirmed === true || input.reviewConfirmed === "true" || input.reviewConfirmed === "on" || input.reviewConfirmed === "1";
  if (!confirmed) throw new Error("Tour approval requires explicit human confirmation");
  const tour = createTourField({
    listingId: record.id,
    panoramaUrl: input.panoramaUrl,
    thumbnailUrl: input.thumbnailUrl || null,
    accessibilityCaption: input.accessibilityCaption,
    isPublic: true,
    media: record.media || [],
  });
  return {
    ...tour,
    id: input.id || `tour-approval-${record.id}`,
    reviewer: input.reviewer,
    approved_at: approvedAt,
  };
}

export function appendTourApproval(approval, { filePath = DEFAULT_TOUR_APPROVAL_LEDGER_PATH } = {}) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(approval)}\n`);
  return approval;
}

export function latestTourForListing(approvals = [], listingId) {
  return [...approvals].reverse().find((approval) => approval.listing_id === listingId && approval.is_public === true) || null;
}

export function assertTourApprovals(rows) {
  if (!rows.length) throw new Error("Tour approvals must contain at least one row");
  for (const row of rows) {
    if (publicTour(row).available !== true || !row.reviewer || !row.approved_at) {
      throw new Error("Tour approval row must be public, reviewed, and renderable");
    }
  }
  return true;
}
