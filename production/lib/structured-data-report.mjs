import fs from "node:fs";
import path from "node:path";
import { loadLocaleRegistry } from "./locales.mjs";
import { fromRoot } from "./paths.mjs";
import { loadCmsSeed, renderRuntimePath } from "./runtime.mjs";
import { schemaIssues } from "./structured-data.mjs";

export const DEFAULT_STRUCTURED_DATA_REPORT = fromRoot("production", "data", "structured-data-report.json");

function filled(value) {
  return value !== null && value !== undefined && value !== "";
}

function loadLocalizedSitemap(filePath = fromRoot("production", "data", "localized-sitemap.json")) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function reportRow(registry, seed, entry) {
  const page = renderRuntimePath(registry, seed, entry.loc);
  const issues = schemaIssues(page.schema);
  const warnings = [];
  if (!filled(page.body?.facts?.location)) warnings.push("missing_location");
  if (!filled(page.body?.facts?.price_eur)) warnings.push("missing_price");
  if (!filled(page.body?.facts?.bedrooms)) warnings.push("missing_bedrooms");
  if (page.body?.media?.review?.review_gated_assets) warnings.push("media_review_pending");

  return {
    loc: entry.loc,
    locale: entry.locale,
    listing_id: page.schema?.identifier || null,
    indexable: page.indexable === true,
    schema_type: page.schema?.["@type"] || null,
    image_count: page.schema?.image?.length || 0,
    has_offer: Boolean(page.schema?.offers),
    issues,
    warnings,
  };
}

export function buildStructuredDataReport({
  registry = loadLocaleRegistry(),
  seed = loadCmsSeed(),
  sitemap = loadLocalizedSitemap(),
  generatedAt = new Date().toISOString(),
} = {}) {
  const rows = sitemap.entries.filter((entry) => entry.type === "listing").map((entry) => reportRow(registry, seed, entry));
  const summary = {
    generated_at: generatedAt,
    listing_entries: rows.length,
    failing_entries: rows.filter((row) => row.issues.length).length,
    entries_with_offer: rows.filter((row) => row.has_offer).length,
    warnings: rows.reduce((counts, row) => {
      for (const warning of row.warnings) counts[warning] = (counts[warning] || 0) + 1;
      return counts;
    }, {}),
    by_locale: rows.reduce((counts, row) => ({ ...counts, [row.locale]: (counts[row.locale] || 0) + 1 }), {}),
  };
  return { summary, rows };
}

export function assertStructuredDataReport(report) {
  if (report.summary.listing_entries !== 167) throw new Error("Structured data report must cover 167 listing sitemap entries");
  if (report.summary.failing_entries !== 0) throw new Error("Structured data report must have zero failing listing schemas");
  if (report.rows.some((row) => row.indexable !== true)) throw new Error("Structured data report must only cover indexable rows");
  return true;
}

export function writeStructuredDataReport(report, outPath = DEFAULT_STRUCTURED_DATA_REPORT) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  assertStructuredDataReport(report);
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
  return outPath;
}
