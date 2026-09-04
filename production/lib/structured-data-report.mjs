import fs from "node:fs";
import path from "node:path";
import { loadLocaleRegistry } from "./locales.mjs";
import { fromRoot } from "./paths.mjs";
import { loadCmsSeed, renderRuntimePath } from "./runtime.mjs";
import { schemaIssues } from "./structured-data.mjs";
import { applyListingEdits, readListingEdits } from "./listing-edits.mjs";
import { bedroomsRequired } from "./listing-facts.mjs";

export const DEFAULT_STRUCTURED_DATA_REPORT = fromRoot("production", "data", "structured-data-report.json");
const KNOWN_WARNINGS = ["missing_location", "missing_price", "missing_area", "missing_bedrooms", "missing_public_images", "media_review_pending"];

function filled(value) {
  return value !== null && value !== undefined && value !== "";
}

function loadLocalizedSitemap(filePath = fromRoot("production", "data", "localized-sitemap.json")) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function reportRow(registry, seed, entry) {
  const page = renderRuntimePath(registry, seed, entry.loc);
  const issues = entry.type === "guide" ? guideSchemaIssues(page.schema) : schemaIssues(page.schema);
  const warnings = [];
  if (entry.type === "listing") {
    if (!filled(page.body?.facts?.location)) warnings.push("missing_location");
    if (!filled(page.body?.facts?.price_eur) && page.body?.facts?.price_on_request !== true) warnings.push("missing_price");
    if (!filled(page.body?.facts?.area_sqm)) warnings.push("missing_area");
    if (
      bedroomsRequired(page.body?.facts) &&
      !filled(page.body?.facts?.bedrooms) &&
      page.body?.quality_flags?.bedrooms_not_applicable !== true
    ) {
      warnings.push("missing_bedrooms");
    }
    // Image is recommended structured data, but it must not re-expose an
    // unrelated crawl asset simply to satisfy schema validation. It remains a
    // media-review warning and a publication gate, not a schema failure.
    if (!Array.isArray(page.schema?.image) || page.schema.image.length === 0) warnings.push("missing_public_images");
    if (page.body?.media?.review?.review_gated_assets) warnings.push("media_review_pending");
  }

  return {
    loc: entry.loc,
    locale: entry.locale,
    page_type: entry.type,
    listing_id: page.schema?.identifier || null,
    indexable: page.indexable === true,
    schema_type: page.schema?.["@type"] || null,
    image_count: page.schema?.image?.length || 0,
    has_offer: Boolean(page.schema?.offers),
    issues,
    warnings,
  };
}

function guideSchemaIssues(schema) {
  const issues = [];
  if (schema?.["@context"] !== "https://schema.org") issues.push("missing_context");
  if (schema?.["@type"] !== "Article") issues.push("missing_article_type");
  for (const field of ["headline", "url"]) {
    if (!filled(schema?.[field])) issues.push(`missing_${field}`);
  }
  return issues;
}

export function buildStructuredDataReport({
  registry = loadLocaleRegistry(),
  seed = loadCmsSeed(),
  listingEdits = readListingEdits(),
  sitemap = loadLocalizedSitemap(),
  generatedAt = new Date().toISOString(),
} = {}) {
  const reviewedSeed = applyListingEdits(seed, listingEdits);
  const rows = sitemap.entries
    // An entry flagged public:false is eligible but gated: the runtime answers
    // 404 for it and sitemap.xml leaves it out, so it has no page whose schema
    // markup could be reported on. The thirty-eight archived cross-domain twins
    // are the first listings to be in that state.
    .filter((entry) => entry.public !== false && ["listing", "guide"].includes(entry.type))
    .map((entry) => reportRow(registry, reviewedSeed, entry));
  const summary = {
    generated_at: generatedAt,
    listing_entries: rows.filter((row) => row.page_type === "listing").length,
    guide_entries: rows.filter((row) => row.page_type === "guide").length,
    failing_entries: rows.filter((row) => row.issues.length).length,
    entries_with_offer: rows.filter((row) => row.has_offer).length,
    warnings: rows.reduce((counts, row) => {
      for (const warning of row.warnings) counts[warning] = (counts[warning] || 0) + 1;
      return counts;
    }, Object.fromEntries(KNOWN_WARNINGS.map((warning) => [warning, 0]))),
    by_locale: rows.reduce((counts, row) => ({ ...counts, [row.locale]: (counts[row.locale] || 0) + 1 }), {}),
  };
  return { summary, rows };
}

// The 165 approved listings less the 38 cross-domain twins that the lot-number
// identity merged into their survivor. A twin is archived and answers 404, so
// it has no page to describe; a drop below this is a published listing that
// lost its markup.
export const PUBLIC_LISTING_SCHEMA_ENTRIES = 127;

export function assertStructuredDataReport(report) {
  if (report.summary.listing_entries !== PUBLIC_LISTING_SCHEMA_ENTRIES) {
    throw new Error(`Structured data report must cover ${PUBLIC_LISTING_SCHEMA_ENTRIES} public listing sitemap entries`);
  }
  if (report.summary.guide_entries !== 5) throw new Error("Structured data report must cover 5 approved guide sitemap entries");
  if (report.summary.failing_entries !== 0) throw new Error("Structured data report must have zero failing public schemas");
  if (report.rows.some((row) => row.indexable !== true)) throw new Error("Structured data report must only cover indexable rows");
  return true;
}

export function writeStructuredDataReport(report, outPath = DEFAULT_STRUCTURED_DATA_REPORT) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  assertStructuredDataReport(report);
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
  return outPath;
}
