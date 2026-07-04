import fs from "node:fs";
import path from "node:path";
import { fromRoot } from "./paths.mjs";
import { mergeRuntimeTranslations } from "./runtime.mjs";
import { sitemapEntriesForListing, sitemapEntriesForLocations, sitemapEntriesForSeller } from "./seo.mjs";

export const DEFAULT_PUBLIC_ORIGIN = process.env.MS_REALTY_PUBLIC_ORIGIN || "https://makler-realty.com";
export const DEFAULT_LOCALIZED_SITEMAP_PATH = fromRoot("production", "data", "localized-sitemap.json");
export const DEFAULT_SITEMAP_XML_OUTPUT = fromRoot("production", "data", "sitemap.xml");
export const DEFAULT_ROBOTS_OUTPUT = fromRoot("production", "data", "robots.txt");

export function loadLocalizedSitemap(filePath = DEFAULT_LOCALIZED_SITEMAP_PATH) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function countBy(rows, keyFn) {
  const counts = {};
  for (const row of rows) {
    const key = keyFn(row);
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

export function buildRuntimeLocalizedSitemap(registry, seed, translationTasks = []) {
  const listings = seed.records.filter((record) => record.collection === "listings");
  const listingEntries = listings.flatMap((record) =>
    sitemapEntriesForListing(registry, record.id, mergeRuntimeTranslations(record, translationTasks)),
  );
  const locationEntries = sitemapEntriesForLocations(registry, listings, (record) =>
    mergeRuntimeTranslations(record, translationTasks),
  );
  const sellerEntries = sitemapEntriesForSeller(registry);
  const entries = [...listingEntries, ...locationEntries, ...sellerEntries];
  return {
    artifact_id: "runtime-localized-sitemap",
    summary: {
      listings: listings.length,
      listing_entries: listingEntries.length,
      location_pages: locationEntries.length,
      seller_pages: sellerEntries.length,
      entries: entries.length,
      byLocale: countBy(entries, (entry) => entry.locale),
    },
    entries,
  };
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function absoluteUrl(origin, pathname) {
  return new URL(pathname, origin).toString();
}

export function renderSitemapXml(sitemap, { origin = DEFAULT_PUBLIC_ORIGIN } = {}) {
  const urls = sitemap.entries
    .map((entry) => {
      const links = entry.hreflang
        .map(
          (link) =>
            `    <xhtml:link rel="alternate" hreflang="${escapeXml(link.hreflang)}" href="${escapeXml(
              absoluteUrl(origin, link.href),
            )}" />`,
        )
        .join("\n");
      return `  <url>\n    <loc>${escapeXml(absoluteUrl(origin, entry.loc))}</loc>\n${links}\n  </url>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls}\n</urlset>\n`;
}

export function renderRobotsTxt({ origin = DEFAULT_PUBLIC_ORIGIN } = {}) {
  return `User-agent: *\nAllow: /\nSitemap: ${absoluteUrl(origin, "/sitemap.xml")}\n`;
}

export function assertSeoFiles({ sitemapXml, robotsTxt }) {
  if (!sitemapXml.includes("/he/properties/MS-CRAWL-0001")) throw new Error("Sitemap XML must include approved Hebrew route");
  if (!sitemapXml.includes("/he/locations/sandanski")) throw new Error("Sitemap XML must include approved Hebrew location route");
  if (!sitemapXml.includes("/he/sell")) throw new Error("Sitemap XML must include Hebrew seller route");
  if (sitemapXml.includes("/fr/")) throw new Error("Sitemap XML must not include unapproved French routes");
  if (!sitemapXml.includes('hreflang="x-default"')) throw new Error("Sitemap XML must include x-default links");
  if (!robotsTxt.includes("User-agent: *")) throw new Error("Robots must declare user agent");
  if (!robotsTxt.includes("Sitemap:")) throw new Error("Robots must point to sitemap");
  return true;
}

export function writeSeoFiles(
  sitemap,
  {
    origin = DEFAULT_PUBLIC_ORIGIN,
    sitemapPath = DEFAULT_SITEMAP_XML_OUTPUT,
    robotsPath = DEFAULT_ROBOTS_OUTPUT,
  } = {},
) {
  const sitemapXml = renderSitemapXml(sitemap, { origin });
  const robotsTxt = renderRobotsTxt({ origin });
  assertSeoFiles({ sitemapXml, robotsTxt });
  fs.mkdirSync(path.dirname(sitemapPath), { recursive: true });
  fs.writeFileSync(sitemapPath, sitemapXml);
  fs.writeFileSync(robotsPath, robotsTxt);
  return { sitemapPath, robotsPath, sitemapXml, robotsTxt };
}
