import fs from "node:fs";
import path from "node:path";
import { loadCmsSeed } from "./runtime.mjs";
import { fromRoot } from "./paths.mjs";

export const DEFAULT_LISTING_QUALITY_REPORT = fromRoot("production", "data", "listing-quality-report.json");
export const DEFAULT_LISTING_QUALITY_WORKBOOK = fromRoot("production", "data", "listing-quality-workbook.csv");

function filled(value) {
  return value !== null && value !== undefined && value !== "";
}

function issueCounts(rows) {
  return rows.reduce((counts, row) => {
    for (const issue of row.issues) counts[issue] = (counts[issue] || 0) + 1;
    return counts;
  }, {});
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

function qualityRow(record) {
  const facts = record.facts || {};
  const publicPhotos = (record.media || []).filter((media) => media.kind === "photo" && media.is_public);
  const missingAltTextAssets = publicPhotos.filter((media) => !filled(media.alt)).length;
  const issues = [];
  if (!filled(facts.price_eur)) issues.push("missing_price");
  if (!filled(facts.bedrooms)) issues.push("missing_bedrooms");
  if (!filled(facts.location)) issues.push("missing_location");
  if (!filled(facts.description)) issues.push("missing_description");
  if (record.media_workflow?.review_gated_assets) issues.push("media_review_pending");
  if (missingAltTextAssets) issues.push("missing_alt_text");
  if (publicPhotos.length < 3) issues.push("thin_public_gallery");
  if (record.tour && !record.tour.is_public) issues.push("tour_review_pending");
  if (!issues.length) return null;

  return {
    listing_id: record.id,
    source_locale: record.source_locale,
    source_domain: record.source_domain,
    target_path: record.routing?.target_path || null,
    editor_path: `/admin/listings/edit?listingId=${encodeURIComponent(record.id)}`,
    title: facts.h1 || facts.title || record.id,
    location: facts.location || "",
    issues,
    price_eur: facts.price_eur,
    bedrooms: facts.bedrooms,
    public_gallery_assets: record.media_workflow?.public_gallery_assets || 0,
    missing_alt_text_assets: missingAltTextAssets,
    review_gated_assets: record.media_workflow?.review_gated_assets || 0,
  };
}

export function buildListingQualityReport({ seed = loadCmsSeed(), generatedAt = new Date().toISOString(), limit = null } = {}) {
  const allRows = seed.records.filter((record) => record.collection === "listings").map(qualityRow).filter(Boolean);
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
  if (!report.summary.issue_counts.missing_price) throw new Error("Listing quality report must expose missing prices");
  if (!report.summary.issue_counts.media_review_pending) throw new Error("Listing quality report must expose pending media review");
  if (!report.summary.issue_counts.missing_alt_text) throw new Error("Listing quality report must expose missing media alt text");
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
    "title",
    "location",
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
