import fs from "node:fs";
import path from "node:path";
import { findListingById, loadListings } from "../lib/content.mjs";
import { loadLocaleRegistry, websiteLanguageCoverage } from "../lib/locales.mjs";
import {
  renderAdminShell,
  renderContactPage,
  renderHomePage,
  renderLanguageFallback,
  renderListingPage,
  renderLocationPage,
  renderSearchPage,
  renderSellerPage,
} from "../lib/public-site.mjs";
import { fromRoot } from "../lib/paths.mjs";

const registry = loadLocaleRegistry();
const listings = loadListings();
const listing = findListingById(listings, "MS-CRAWL-0001");

const fixtures = {
  fixture_id: "public-route-fixtures-20260704",
  source_listing_id: listing.id,
  website_language_coverage: websiteLanguageCoverage(registry),
  home_he: renderHomePage({ registry, localeCode: "he", listings }),
  listing_bg: renderListingPage({ registry, listing, localeCode: "bg" }),
  listing_el: renderListingPage({ registry, listing, localeCode: "el" }),
  listing_he: renderListingPage({ registry, listing, localeCode: "he" }),
  listing_fr_fallback: renderListingPage({ registry, listing, localeCode: "fr" }),
  fallback_fr: renderLanguageFallback({ registry, requestedLocale: "fr" }),
  search_he: renderSearchPage({ registry, localeCode: "he", listings, query: "Sandanski" }),
  location_he: renderLocationPage({ registry, localeCode: "he", location: "Sandanski", listings }),
  seller_he: renderSellerPage({ registry, localeCode: "he" }),
  contact_he: renderContactPage({ registry, localeCode: "he" }),
  admin_ru: renderAdminShell({ registry, requestedLocale: "ru" }),
  admin_el_fallback: renderAdminShell({ registry, requestedLocale: "el" }),
};

const outPath = fromRoot("production", "data", "public-fixtures.json");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(fixtures, null, 2)}\n`);
console.log(`Wrote ${outPath}`);
