import fs from "node:fs";
import path from "node:path";
import { loadLocaleRegistry } from "./locales.mjs";
import { fromRoot } from "./paths.mjs";
import { buildRuntimeLocalizedSitemap } from "./seo-files.mjs";
import { homePath, locationPath } from "./seo.mjs";
import { loadCmsSeed } from "./runtime.mjs";
import { publicationReadinessFor } from "./listing-facts.mjs";

export const DEFAULT_LISTING_PUBLICATION_REPORT = fromRoot("production", "data", "listing-publication-report.json");

const ACTIVE_STATUSES = new Set(["available", "reserved"]);

function listingRecords(seed) {
  return seed.records.filter((record) => record.collection === "listings");
}

function active(record) {
  return ACTIVE_STATUSES.has(record.facts?.listing_status || "available");
}

function pathFor(entries, listingId, locale) {
  return entries.find((entry) => entry.type === "listing" && entry.locale === locale && entry.loc.endsWith(`/${listingId}`))?.loc;
}

function suggestions({ registry, sitemap, sitemapLocs, records, record, locale, toPath, limit }) {
  const links = [];
  const add = (kind, fromPath, label) => {
    if (fromPath && fromPath !== toPath && sitemapLocs.has(fromPath)) links.push({ kind, from_path: fromPath, to_path: toPath, label });
  };

  add("homepage_feature", homePath(registry, locale), "Add to featured listings");
  if (record.facts?.location) add("location_page", locationPath(registry, locale, record.facts.location), "Add to location inventory");
  // ponytail: scan 165 crawl-backed listings; pre-index by location if CMS inventory gets large.
  for (const related of records) {
    if (links.length >= limit) break;
    if (related.id === record.id || !active(related) || related.facts?.location !== record.facts?.location) continue;
    add("related_listing", pathFor(sitemap.entries, related.id, locale), "Add as related listing");
  }
  return links.slice(0, limit);
}

export function buildListingPublicationReport({
  registry = loadLocaleRegistry(),
  seed = loadCmsSeed(),
  sitemap = buildRuntimeLocalizedSitemap(registry, seed),
  generatedAt = new Date().toISOString(),
  suggestionLimit = 4,
} = {}) {
  const records = listingRecords(seed);
  const properties = new Map((seed.properties || []).map((property) => [property.id, property]));
  const sitemapLocs = new Set(sitemap.entries.map((entry) => entry.loc));
  const rows = records.map((record) => {
    const locale = record.source_locale || registry.source_locale;
    const sitemapEntries = sitemap.entries.filter((entry) => entry.type === "listing" && entry.loc.endsWith(`/${record.id}`));
    const primaryPath = pathFor(sitemap.entries, record.id, locale) || sitemapEntries[0]?.loc || null;
    const publicationReadiness = publicationReadinessFor({ listing: record, property: properties.get(record.property), now: generatedAt });
    const internalLinks = primaryPath
      ? suggestions({ registry, sitemap, sitemapLocs, records, record, locale, toPath: primaryPath, limit: suggestionLimit })
      : [];
    return {
      listing_id: record.id,
      source_locale: locale,
      listing_status: record.facts?.listing_status || "available",
      primary_path: primaryPath,
      sitemap_paths: sitemapEntries.map((entry) => entry.loc).sort(),
      sitemap_entry_count: sitemapEntries.length,
      internal_link_suggestions: internalLinks,
      internal_link_suggestion_count: internalLinks.length,
      publication_readiness: {
        ready: publicationReadiness.ready,
        blocking_fields: publicationReadiness.blocking_fields,
      },
    };
  });

  return {
    generated_at: generatedAt,
    summary: {
      listings: records.length,
      listings_with_sitemap_entries: rows.filter((row) => row.sitemap_entry_count > 0).length,
      listings_with_internal_link_suggestions: rows.filter((row) => row.internal_link_suggestion_count > 0).length,
      missing_sitemap_entries: rows.filter((row) => row.sitemap_entry_count === 0).length,
      ready_for_publish: rows.filter((row) => row.publication_readiness.ready).length,
      blocked_for_publish: rows.filter((row) => !row.publication_readiness.ready).length,
    },
    rows,
  };
}

export function assertListingPublicationReport(report) {
  if (!report.rows.length) throw new Error("Listing publication report must contain listing rows");
  if (report.summary.listings !== report.rows.length) throw new Error("Listing publication summary must match rows");
  if (report.summary.missing_sitemap_entries !== 0) throw new Error("Every listing must have at least one sitemap entry");
  if (report.rows.some((row) => !row.primary_path || !row.sitemap_paths.includes(row.primary_path))) {
    throw new Error("Each listing must expose a primary sitemap path");
  }
  if (!report.rows.some((row) => row.internal_link_suggestion_count > 0)) {
    throw new Error("Listing publication report must include internal-link suggestions");
  }
  if (report.rows.some((row) => !row.publication_readiness || typeof row.publication_readiness.ready !== "boolean")) {
    throw new Error("Listing publication report must expose publish readiness without changing public visibility");
  }
  if (report.summary.ready_for_publish + report.summary.blocked_for_publish !== report.rows.length) {
    throw new Error("Listing publication readiness summary must match rows");
  }
  return true;
}

export function writeListingPublicationReport(report, filePath = DEFAULT_LISTING_PUBLICATION_REPORT) {
  assertListingPublicationReport(report);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(report, null, 2)}\n`);
  return filePath;
}
