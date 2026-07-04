import test from "node:test";
import assert from "node:assert/strict";
import { findListingById, loadListings } from "../lib/content.mjs";
import { loadLocaleRegistry } from "../lib/locales.mjs";
import {
  renderAdminShell,
  renderLanguageFallback,
  renderListingPage,
  renderSearchPage,
} from "../lib/public-site.mjs";

const registry = loadLocaleRegistry();
const listings = loadListings();
const listing = findListingById(listings, "MS-CRAWL-0001");

test("public listing routes render BG, Greek, and Hebrew locale-prefixed pages", () => {
  const bg = renderListingPage({ registry, listing, localeCode: "bg" });
  const el = renderListingPage({ registry, listing, localeCode: "el" });
  const he = renderListingPage({ registry, listing, localeCode: "he" });

  assert.equal(bg.status, 200);
  assert.equal(bg.path, `/bg/imoti/${listing.id}`);
  assert.equal(el.path, `/el/akinita/${listing.id}`);
  assert.equal(he.path, `/he/properties/${listing.id}`);
  assert.equal(he.dir, "rtl");
  assert.equal(he.indexable, true);
});

test("listing SEO includes approved hreflang and excludes unavailable draft locales", () => {
  const page = renderListingPage({ registry, listing, localeCode: "he" });
  const hreflangCodes = page.hreflang.map((link) => link.hreflang);

  assert.ok(hreflangCodes.includes("x-default"));
  assert.ok(hreflangCodes.includes("el"));
  assert.ok(hreflangCodes.includes("he"));
  assert.equal(hreflangCodes.includes("fr"), false);
  assert.equal(hreflangCodes.includes("de"), false);
  assert.equal(page.schema["@type"], "RealEstateListing");
  assert.equal(page.schema.url, page.canonical);
});

test("unapproved French route falls back without becoming indexable", () => {
  const listingFallback = renderListingPage({ registry, listing, localeCode: "fr" });
  const languageFallback = renderLanguageFallback({ registry, requestedLocale: "fr" });

  assert.equal(listingFallback.locale, "en");
  assert.equal(listingFallback.fallback.active, true);
  assert.equal(listingFallback.indexable, false);
  assert.equal(listingFallback.metadata.robots, "noindex,follow");
  assert.equal(languageFallback.locale, "en");
  assert.equal(languageFallback.indexable, false);
  assert.equal(languageFallback.request_language_available, true);
});

test("search route is locale-scoped and list-first on mobile", () => {
  const search = renderSearchPage({ registry, listings, localeCode: "he", query: "Sandanski" });

  assert.equal(search.path, "/he/search");
  assert.equal(search.dir, "rtl");
  assert.equal(search.mobile_policy.list_first_mobile, true);
  assert.deepEqual(search.search.engines, ["typesense", "meilisearch"]);
  assert.equal(search.search.filters.locale, "he");
  assert.ok(search.cards.length > 0);
  assert.ok(search.cards.every((card) => card.path.startsWith("/he/properties/")));
});

test("admin CRM/CMS shell is available only in BG, RU, and EN", () => {
  const adminRu = renderAdminShell({ registry, requestedLocale: "ru" });
  const adminEl = renderAdminShell({ registry, requestedLocale: "el" });

  assert.equal(adminRu.locale, "ru");
  assert.deepEqual(
    adminRu.interface_locales.map((locale) => locale.code),
    ["bg", "ru", "en"],
  );
  assert.deepEqual(adminRu.modules, ["crm", "cms"]);
  assert.equal(adminEl.locale, "en");
  assert.equal(adminRu.language_policy.hermes_reply_drafts_require_broker_approval, true);
});

test("rendered public fixtures do not introduce Sandanski sea framing", () => {
  const rendered = JSON.stringify({
    bg: renderListingPage({ registry, listing, localeCode: "bg" }),
    el: renderListingPage({ registry, listing, localeCode: "el" }),
    he: renderListingPage({ registry, listing, localeCode: "he" }),
    search: renderSearchPage({ registry, listings, localeCode: "he", query: "Sandanski" }),
  });

  assert.doesNotMatch(rendered, /Sandanski sea|sea destination|Сандански море/i);
});
