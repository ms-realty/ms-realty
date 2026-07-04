import fs from "node:fs";
import path from "node:path";
import { approvedTranslationRecordsForListing, loadListings } from "../lib/content.mjs";
import { loadLocaleRegistry } from "../lib/locales.mjs";
import { fromRoot } from "../lib/paths.mjs";
import { sitemapEntriesForListing, sitemapEntriesForLocations, sitemapEntriesForSeller } from "../lib/seo.mjs";

const registry = loadLocaleRegistry();
const listings = loadListings();
const listingEntries = listings.flatMap((listing) =>
  sitemapEntriesForListing(registry, listing.id, approvedTranslationRecordsForListing(registry, listing)),
);
const locationEntries = sitemapEntriesForLocations(registry, listings, (listing) =>
  approvedTranslationRecordsForListing(registry, listing),
);
const sellerEntries = sitemapEntriesForSeller(registry);
const entries = [...listingEntries, ...locationEntries, ...sellerEntries];
const byLocale = {};
for (const entry of entries) byLocale[entry.locale] = (byLocale[entry.locale] || 0) + 1;

const outPath = fromRoot("production", "data", "localized-sitemap.json");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(
  outPath,
  `${JSON.stringify(
    {
      artifact_id: "localized-sitemap-20260704",
      summary: {
        listings: listings.length,
        listing_entries: listingEntries.length,
        location_pages: locationEntries.length,
        seller_pages: sellerEntries.length,
        entries: entries.length,
        byLocale,
      },
      entries,
    },
    null,
    2,
  )}\n`,
);
console.log(`Wrote ${entries.length} localized sitemap entries to ${outPath}`);
