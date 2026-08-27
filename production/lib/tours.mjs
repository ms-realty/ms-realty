import fs from "node:fs";
import path from "node:path";
import { imageUrlFromMediaItem } from "./media.mjs";
import { fromRoot } from "./paths.mjs";
import { FALLBACK_PUBLIC_ORIGIN } from "./public-origin.mjs";

export const TOUR_PROVIDER = "photo-sphere-viewer";
export const TOUR_PROVIDERS = Object.freeze([TOUR_PROVIDER, "supersplat-viewer"]);
const APPROVED_TOUR_HOSTS = Object.freeze([new URL(FALLBACK_PUBLIC_ORIGIN).hostname]);
export const TOUR_REVIEW_STATUSES = Object.freeze([
  "needs_panorama_upload",
  "needs_viewer_upload",
  "review_required",
  "approved",
  "published",
]);
export const DEFAULT_TOUR_APPROVAL_LEDGER_PATH = fromRoot("production", "data", "tour-approvals.jsonl");

function httpsUrl(value) {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

function approvedTourUrl(value) {
  if (!httpsUrl(value)) return false;
  const hostname = new URL(value).hostname.toLowerCase();
  return APPROVED_TOUR_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`));
}

function assertTourProvider(provider) {
  if (!TOUR_PROVIDERS.includes(provider)) throw new Error("Unsupported tour provider");
}

function sourceField(provider) {
  return provider === TOUR_PROVIDER ? "panorama_url" : "viewer_url";
}

function sourceUrl(provider, { panoramaUrl, viewerUrl }) {
  return provider === TOUR_PROVIDER ? panoramaUrl : viewerUrl;
}

function publicRequirementsError(provider) {
  return (
    "Public " +
    (provider === TOUR_PROVIDER ? "360" : "3D") +
    " tours require " +
    sourceField(provider) +
    ", accessibility_caption, and fallback gallery"
  );
}

function approvedOriginError(provider) {
  return `Public ${provider === TOUR_PROVIDER ? "360" : "3D"} tours must use an approved MS Realty HTTPS origin`;
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

export function createTourField({
  listingId,
  provider = TOUR_PROVIDER,
  panoramaUrl = null,
  viewerUrl = null,
  thumbnailUrl = null,
  accessibilityCaption = "",
  isPublic = false,
  media = [],
}) {
  assertTourProvider(provider);
  if (panoramaUrl && !httpsUrl(panoramaUrl)) throw new Error("panorama_url must be an HTTPS URL");
  if (viewerUrl && !httpsUrl(viewerUrl)) throw new Error("viewer_url must be an HTTPS URL");
  if (provider === TOUR_PROVIDER && viewerUrl) throw new Error("viewer_url is only supported by supersplat-viewer");
  if (provider === "supersplat-viewer" && panoramaUrl) throw new Error("panorama_url is only supported by photo-sphere-viewer");
  if (thumbnailUrl && !httpsUrl(thumbnailUrl)) throw new Error("thumbnail_url must be an HTTPS URL");

  const fallbackGallery = galleryFallback(media);
  const source = sourceUrl(provider, { panoramaUrl, viewerUrl });
  if (isPublic && (!source || !accessibilityCaption || !fallbackGallery.length)) {
    throw new Error(publicRequirementsError(provider));
  }
  if (isPublic && !approvedTourUrl(source)) throw new Error(approvedOriginError(provider));

  return {
    provider,
    listing_id: listingId,
    panorama_url: provider === TOUR_PROVIDER ? panoramaUrl : null,
    viewer_url: provider === "supersplat-viewer" ? viewerUrl : null,
    thumbnail_url: thumbnailUrl,
    hotspots: [],
    is_public: isPublic,
    accessibility_caption: accessibilityCaption,
    review_status: isPublic ? "approved" : provider === TOUR_PROVIDER ? "needs_panorama_upload" : "needs_viewer_upload",
    fallback_gallery: fallbackGallery,
  };
}

export function publicTour(tour) {
  const provider = tour?.provider || TOUR_PROVIDER;
  assertTourProvider(provider);
  if (!tour?.is_public) {
    return {
      available: false,
      provider,
      review_status: tour?.review_status || "missing",
      fallback_gallery: tour?.fallback_gallery || [],
    };
  }

  const value = provider === TOUR_PROVIDER ? tour.panorama_url : tour.viewer_url;
  if (!httpsUrl(value) || !tour.accessibility_caption || !tour.fallback_gallery?.length) {
    throw new Error(publicRequirementsError(provider));
  }
  if (!approvedTourUrl(value)) throw new Error(approvedOriginError(provider));

  const shared = {
    available: true,
    provider,
    thumbnail_url: tour.thumbnail_url,
    accessibility_caption: tour.accessibility_caption,
    fallback_gallery: tour.fallback_gallery,
  };
  if (provider === "supersplat-viewer") {
    return {
      ...shared,
      viewer_url: tour.viewer_url,
    };
  }

  return {
    ...shared,
    mount_target: "psv-listing-tour",
    panorama_url: tour.panorama_url,
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
    provider: input.provider,
    panoramaUrl: input.panoramaUrl,
    viewerUrl: input.viewerUrl,
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
  return (
    [...approvals]
      .reverse()
      .find((approval) => {
        if (approval.listing_id !== listingId || approval.is_public !== true) return false;
        try {
          return publicTour(approval).available === true;
        } catch {
          return false;
        }
      }) || null
  );
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
