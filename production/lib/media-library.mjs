import { mediaAssetId } from "./media-reviews.mjs";
import { renderAdminWorkspace } from "./admin-workflows.mjs";
import { loadCmsSeed } from "./runtime.mjs";

// The catalogue carries 4,978 media assets across 165 listings. Every operation
// on one of them exists on the server — upload, replace, review, publish,
// reattach — and the only way to reach an asset was to know which listing it
// hangs off and open that listing's editor. This is the library the canvas
// draws: every asset in one place, grouped by the four issues the code
// actually computes.
//
// The four are listing-quality.mjs's media issues, and nothing else is invented
// here: media_review_pending, missing_alt_text, thin_public_gallery and
// tour_review_pending. No face, plate or watermark detection exists.

export const MEDIA_LIBRARY_ISSUES = Object.freeze([
  "media_review_pending",
  "missing_alt_text",
  "thin_public_gallery",
  "tour_review_pending",
]);

const REVIEWED = new Set(["approved_imported_photo", "approved_by_human", "reviewed_private", "replaced_by_human", "approved"]);
const PAGE_SIZE = 48;

function assetRow(record, item) {
  let assetId = null;
  try {
    assetId = mediaAssetId(item);
  } catch {
    // An asset with no source URL cannot be reviewed; it is still shown, so a
    // broken row is visible rather than quietly dropped from the count.
    assetId = null;
  }
  const alt = String(item.alt || "").trim();
  return {
    asset_id: assetId,
    listing_id: record.id,
    listing_title: record.facts?.title || record.seo?.title || record.id,
    location: record.facts?.location || "",
    kind: item.kind || "photo",
    review_status: item.review_status || "needs_media_review",
    is_public: item.is_public === true,
    alt,
    has_alt: Boolean(alt),
    width: Number.isFinite(Number(item.width)) ? Number(item.width) : null,
    height: Number.isFinite(Number(item.height)) ? Number(item.height) : null,
    url: item.url || item.asset_url || null,
    reviewable: Boolean(assetId),
    needs_review: !REVIEWED.has(item.review_status || ""),
    editor_path: `/admin/listings/edit?listingId=${encodeURIComponent(record.id)}#media`,
  };
}

function matches(row, filters) {
  if (filters.issue === "media_review_pending" && !row.needs_review) return false;
  if (filters.issue === "missing_alt_text" && row.has_alt) return false;
  if (filters.listing && row.listing_id !== filters.listing) return false;
  if (filters.kind && row.kind !== filters.kind) return false;
  if (filters.q) {
    const haystack = [row.listing_id, row.listing_title, row.location, row.alt].join(" ").toLocaleLowerCase();
    if (!haystack.includes(filters.q)) return false;
  }
  return true;
}

export function renderAdminMediaLibraryPayload(
  registry,
  requestedLocale,
  { seed = loadCmsSeed(), query = "", issue = "", listing = "", kind = "", page = 1, operatorId = null, generatedAt = new Date().toISOString() } = {},
) {
  const workspace = renderAdminWorkspace({ registry, requestedLocale });
  const listings = (seed.records || []).filter((record) => record.collection === "listings");
  const rows = listings.flatMap((record) => (record.media || []).map((item) => assetRow(record, item)));

  const filters = {
    q: String(query).trim().toLocaleLowerCase(),
    issue: MEDIA_LIBRARY_ISSUES.includes(issue) ? issue : "",
    listing: String(listing).trim(),
    kind: String(kind).trim(),
  };
  const filtered = rows.filter((row) => matches(row, filters));

  const requested = Number(page);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Number.isInteger(requested) && requested > 0 ? Math.min(requested, totalPages) : 1;
  const offset = (currentPage - 1) * PAGE_SIZE;

  // A gallery is thin when the listing cannot fill a public page; the figure
  // comes from the same public library the site renders from.
  const thinGalleries = listings.filter((record) => (record.media || []).filter((item) => item.is_public === true && item.kind === "photo").length < 6).length;

  return {
    kind: "admin_media_library",
    status: 200,
    locale: workspace.locale,
    lang: workspace.lang,
    dir: workspace.dir,
    path: "/admin/media",
    canonical: "/admin/media",
    indexable: false,
    metadata: {
      title: `${workspace.copy.mediaLibrary || "Media"} | MS Realty`,
      description: workspace.copy.mediaLibraryDescription || "Every photo, floor plan and tour in the catalogue, and what each one is waiting for.",
      robots: "noindex,nofollow",
    },
    workspace: { ...workspace, operator_id: operatorId || workspace.operator_id || null },
    generated_at: generatedAt,
    assets: filtered.slice(offset, offset + PAGE_SIZE),
    filters: { q: filters.q, issue: filters.issue, listing: filters.listing, kind: filters.kind },
    filterOptions: {
      issues: MEDIA_LIBRARY_ISSUES,
      kinds: [...new Set(rows.map((row) => row.kind))].filter(Boolean).sort(),
    },
    pagination: { page: currentPage, pageSize: PAGE_SIZE, totalRows: filtered.length, totalPages },
    summary: {
      total: rows.length,
      listings: listings.length,
      visible: filtered.length,
      // Counted over the whole catalogue, not the page, so a narrowed filter
      // never makes the queue look shorter than it is.
      media_review_pending: rows.filter((row) => row.needs_review).length,
      missing_alt_text: rows.filter((row) => !row.has_alt).length,
      thin_public_gallery: thinGalleries,
      public: rows.filter((row) => row.is_public).length,
      unreviewable: rows.filter((row) => !row.reviewable).length,
    },
  };
}
