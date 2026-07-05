import fs from "node:fs";
import path from "node:path";
import { parseCsv } from "./csv.mjs";
import { bedroomsRequired } from "./listing-facts.mjs";
import { loadCmsSeed } from "./runtime.mjs";
import { latestTourForListing, readTourApprovals } from "./tours.mjs";
import { fromRoot } from "./paths.mjs";

export const DEFAULT_LISTING_QUALITY_REPORT = fromRoot("production", "data", "listing-quality-report.json");
export const DEFAULT_LISTING_QUALITY_WORKBOOK = fromRoot("production", "data", "listing-quality-workbook.csv");
export const DEFAULT_LISTING_QUALITY_REVIEW_INPUT = fromRoot("migration", "reviews", "listing-quality.csv");

const FACT_FIELDS_BY_ISSUE = {
  missing_price: "price_eur",
  missing_bedrooms: "bedrooms",
  missing_location: "location",
  missing_description: "description",
};
const MEDIA_FIELDS_BY_ISSUE = {
  media_review_pending: "media_review",
  missing_alt_text: "media_alt_text",
  thin_public_gallery: "public_gallery",
  tour_review_pending: "tour_review",
};
const KNOWN_ISSUES = [...Object.keys(FACT_FIELDS_BY_ISSUE), ...Object.keys(MEDIA_FIELDS_BY_ISSUE)];

function filled(value) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function issueCounts(rows) {
  return rows.reduce((counts, row) => {
    for (const issue of row.issues) counts[issue] = (counts[issue] || 0) + 1;
    return counts;
  }, Object.fromEntries(KNOWN_ISSUES.map((issue) => [issue, 0])));
}

function countBy(rows, keyFn) {
  return rows.reduce((counts, row) => {
    const key = keyFn(row) || "unknown";
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function csvCell(value) {
  const text = Array.isArray(value) ? value.join("|") : String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll("\"", "\"\"")}"` : text;
}

function reviewStatus(issues) {
  const needsFacts = issues.some((issue) => FACT_FIELDS_BY_ISSUE[issue]);
  const needsMedia = issues.some((issue) => MEDIA_FIELDS_BY_ISSUE[issue]);
  if (needsFacts && needsMedia) return "needs_facts_and_media_review";
  if (needsFacts) return "needs_facts_review";
  return "needs_media_review";
}

function requiredEditorFields(issues) {
  return issues.map((issue) => FACT_FIELDS_BY_ISSUE[issue] || MEDIA_FIELDS_BY_ISSUE[issue]).filter(Boolean);
}

function qualityRow(record, approvedTour = null) {
  const facts = record.facts || {};
  const tour = approvedTour || record.tour;
  const publicPhotos = (record.media || []).filter((media) => media.kind === "photo" && media.is_public);
  const publicGalleryAssets = record.media_workflow?.public_gallery_assets ?? publicPhotos.length;
  const missingAltTextAssets = publicPhotos.filter((media) => !filled(media.alt)).length;
  const issues = [];
  if (!filled(facts.price_eur) && facts.price_on_request !== true) issues.push("missing_price");
  if (bedroomsRequired(facts) && !filled(facts.bedrooms) && facts.bedrooms_not_applicable !== true) {
    issues.push("missing_bedrooms");
  }
  if (!filled(facts.location)) issues.push("missing_location");
  if (!filled(facts.description)) issues.push("missing_description");
  if (record.media_workflow?.review_gated_assets) issues.push("media_review_pending");
  if (missingAltTextAssets) issues.push("missing_alt_text");
  if (publicGalleryAssets < 3) issues.push("thin_public_gallery");
  if (tour?.panorama_url && !tour.is_public) issues.push("tour_review_pending");
  if (!issues.length) return null;

  return {
    listing_id: record.id,
    source_locale: record.source_locale,
    source_domain: record.source_domain,
    target_path: record.routing?.target_path || null,
    editor_path: `/admin/listings/edit?listingId=${encodeURIComponent(record.id)}`,
    review_status: reviewStatus(issues),
    required_editor_fields: requiredEditorFields(issues),
    title: facts.h1 || facts.title || record.id,
    location: facts.location || "",
    description: facts.description || "",
    issues,
    price_eur: facts.price_eur,
    price_on_request: facts.price_on_request === true,
    bedrooms: facts.bedrooms,
    bedrooms_not_applicable: facts.bedrooms_not_applicable === true,
    public_gallery_assets: publicGalleryAssets,
    missing_alt_text_assets: missingAltTextAssets,
    review_gated_assets: record.media_workflow?.review_gated_assets || 0,
  };
}

export function buildListingQualityReport({
  seed = loadCmsSeed(),
  tourApprovals = readTourApprovals(),
  generatedAt = new Date().toISOString(),
  limit = null,
} = {}) {
  const allRows = seed.records
    .filter((record) => record.collection === "listings")
    .map((record) => qualityRow(record, latestTourForListing(tourApprovals, record.id)))
    .filter(Boolean);
  const rows = limit ? allRows.slice(0, limit) : allRows;
  return {
    generated_at: generatedAt,
    summary: {
      listings: seed.summary.listings,
      affected_listings: allRows.length,
      issue_counts: issueCounts(allRows),
      by_source_locale: countBy(allRows, (row) => row.source_locale),
      by_source_domain: countBy(allRows, (row) => row.source_domain),
    },
    rows,
  };
}

export function assertListingQualityReport(report) {
  if (report.summary.listings !== 165) throw new Error("Listing quality report must cover CMS listing inventory");
  if (!Object.hasOwn(report.summary.issue_counts, "missing_price")) {
    throw new Error("Listing quality report must expose missing price counts");
  }
  if (!Object.hasOwn(report.summary.issue_counts, "media_review_pending")) {
    throw new Error("Listing quality report must expose pending media review");
  }
  if (!Object.hasOwn(report.summary.issue_counts, "missing_alt_text")) {
    throw new Error("Listing quality report must expose missing media alt text");
  }
  if (report.rows.some((row) => !row.editor_path.startsWith("/admin/listings/edit?listingId="))) {
    throw new Error("Listing quality rows must link to the admin listing editor");
  }
  return true;
}

export function renderListingQualityWorkbook(report) {
  const headers = [
    "listing_id",
    "target_path",
    "source_locale",
    "source_domain",
    "issues",
    "review_status",
    "required_editor_fields",
    "title",
    "location",
    "description",
    "price_eur",
    "bedrooms",
    "public_gallery_assets",
    "missing_alt_text_assets",
    "review_gated_assets",
    "facts_reviewer",
    "media_reviewer",
    "review_notes",
    "editor_path",
  ];
  return `${[headers.join(","), ...report.rows.map((row) => headers.map((header) => csvCell(row[header])).join(","))].join("\n")}\n`;
}

function assertReviewFactValue(listingId, field, value) {
  if (!filled(value)) throw new Error(`Listing ${listingId} requires ${field}`);
  if (field === "price_eur") {
    const price = Number(value);
    if (!Number.isFinite(price) || price <= 0) throw new Error(`Listing ${listingId} requires a positive price_eur`);
  }
  if (field === "bedrooms") {
    const bedrooms = Number(value);
    if (!Number.isInteger(bedrooms) || bedrooms < 0) {
      throw new Error(`Listing ${listingId} requires bedrooms as a non-negative integer`);
    }
  }
}

export function validateListingQualityReviewCsv(report, csvText) {
  const rows = parseCsv(csvText);
  if (!rows.length) throw new Error("Listing quality review CSV has no rows");

  const byListing = new Map(report.rows.map((row) => [row.listing_id, row]));
  const seen = new Set();
  const reviews = rows.map((row) => {
    const listingId = row.listing_id || row.listingId;
    const quality = byListing.get(listingId);
    if (!quality) throw new Error(`Listing quality review requires a known listing_id: ${listingId || ""}`);
    if (seen.has(listingId)) throw new Error(`Duplicate listing quality review row: ${listingId}`);
    seen.add(listingId);

    const factIssues = quality.issues.filter((issue) => FACT_FIELDS_BY_ISSUE[issue]);
    const mediaIssues = quality.issues.filter((issue) => MEDIA_FIELDS_BY_ISSUE[issue]);
    if (factIssues.length && !filled(row.facts_reviewer)) {
      throw new Error(`Listing ${listingId} requires facts_reviewer`);
    }
    for (const issue of factIssues) {
      assertReviewFactValue(listingId, FACT_FIELDS_BY_ISSUE[issue], row[FACT_FIELDS_BY_ISSUE[issue]]);
    }
    if (mediaIssues.length && !filled(row.media_reviewer)) {
      throw new Error(`Listing ${listingId} requires media_reviewer`);
    }

    return {
      listing_id: listingId,
      fact_issues: factIssues.length,
      media_issues: mediaIssues.length,
      editor: row.facts_reviewer || row.media_reviewer,
      media_reviewer: row.media_reviewer || "",
      review_notes: row.review_notes || "",
      patch: Object.fromEntries(factIssues.map((issue) => [FACT_FIELDS_BY_ISSUE[issue], row[FACT_FIELDS_BY_ISSUE[issue]]])),
    };
  });

  return {
    reviews,
    summary: {
      review_rows: reviews.length,
      facts_review_rows: reviews.filter((row) => row.fact_issues > 0).length,
      media_review_rows: reviews.filter((row) => row.media_issues > 0).length,
    },
  };
}

export function writeListingQualityReport(report, outPath = DEFAULT_LISTING_QUALITY_REPORT) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  assertListingQualityReport(report);
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
  return outPath;
}

export function writeListingQualityWorkbook(report, outPath = DEFAULT_LISTING_QUALITY_WORKBOOK) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  assertListingQualityReport(report);
  fs.writeFileSync(outPath, renderListingQualityWorkbook(report));
  return outPath;
}
