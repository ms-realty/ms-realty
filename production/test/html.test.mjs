import test from "node:test";
import assert from "node:assert/strict";
import { createBrokerContact } from "../lib/broker-contacts.mjs";
import { findListingById, loadListings } from "../lib/content.mjs";
import { assertHtmlPage, renderHtmlPage } from "../lib/html.mjs";
import { loadLocaleRegistry } from "../lib/locales.mjs";
import { loadCmsSeed, renderRuntimePath } from "../lib/runtime.mjs";
import {
  renderLanguageFallback,
  renderContactPage,
  renderHomePage,
  renderListingPage,
  renderLocationPage,
  renderSearchPage,
  renderSellerPage,
} from "../lib/public-site.mjs";

const registry = loadLocaleRegistry();
const listings = loadListings();
const listing = findListingById(listings, "MS-CRAWL-0001");
const seed = loadCmsSeed();

test("HTML renderer emits SEO-safe listing, search, and fallback documents", () => {
  const homeHtml = renderHtmlPage(renderHomePage({ registry, listings, localeCode: "he" }));
  const listingHtml = renderHtmlPage(renderListingPage({ registry, listing, localeCode: "he" }));
  const runtimeListingHtml = renderHtmlPage(renderRuntimePath(registry, seed, "/he/properties/MS-CRAWL-0001"));
  const listingPrintHtml = renderHtmlPage(renderListingPage({ registry, listing, localeCode: "he" }), { print: true });
  const approvedListingHtml = renderHtmlPage(
    renderListingPage({
      registry,
      listing,
      localeCode: "he",
      brokerContact: createBrokerContact({
        listingId: listing.id,
        broker: "broker_ru",
        phone: "+359880000000",
        reviewer: "owner",
        approved: true,
      }),
    }),
  );
  const searchHtml = renderHtmlPage(renderSearchPage({ registry, listings, localeCode: "he", query: "Sandanski" }));
  const locationHtml = renderHtmlPage(renderLocationPage({ registry, listings, localeCode: "he", location: "Sandanski" }));
  const sellerHtml = renderHtmlPage(renderSellerPage({ registry, localeCode: "he" }));
  const contactHtml = renderHtmlPage(renderContactPage({ registry, localeCode: "he" }));
  const guideHtml = renderHtmlPage(renderRuntimePath(registry, seed, "/en/guides/foreign-buyers"));
  const fallbackHtml = renderHtmlPage(renderLanguageFallback({ registry, requestedLocale: "fr" }));

  assert.equal(assertHtmlPage(homeHtml, { lang: "he", dir: "rtl", kind: "home" }), true);
  assert.match(homeHtml, /role="search"/);
  assert.match(homeHtml, /data-action="seller"/);
  assert.equal(assertHtmlPage(listingHtml, { lang: "he", dir: "rtl", kind: "listing" }), true);
  assert.match(listingHtml, /application\/ld\+json/);
  assert.match(listingHtml, /property="og:type" content="article"/);
  assert.match(runtimeListingHtml, /property="og:image" content="https:\/\/makler-realty\.com\/wp-content\/uploads\//);
  assert.match(listingHtml, /hreflang="el"/);
  assert.doesNotMatch(listingHtml, /tel:\+359880000000/);
  assert.equal(assertHtmlPage(listingPrintHtml, { lang: "he", dir: "rtl", kind: "listing-print" }), true);
  assert.match(listingPrintHtml, /data-print-status="browser-pdf-ready"/);
  assert.doesNotMatch(listingPrintHtml, /tel:\+359880000000/);
  assert.match(approvedListingHtml, /tel:\+359880000000/);
  assert.equal(assertHtmlPage(searchHtml, { lang: "he", dir: "rtl", kind: "search" }), true);
  assert.match(searchHtml, /property="og:type" content="website"/);
  assert.match(searchHtml, /data-total-matches=/);
  assert.match(searchHtml, /data-map-optional="true"/);
  assert.match(searchHtml, /data-save-search-endpoint="\/api\/saved-searches"/);
  assert.match(searchHtml, /data-search-card="true"/);
  assert.match(searchHtml, /data-view-mode="list"/);
  assert.match(searchHtml, /data-client-save-listing="MS-CRAWL-/);
  assert.match(searchHtml, /data-endpoint="\/api\/leads"/);
  assert.equal(assertHtmlPage(locationHtml, { lang: "he", dir: "rtl", kind: "location" }), true);
  assert.match(locationHtml, /data-location="Sandanski"/);
  assert.equal(assertHtmlPage(sellerHtml, { lang: "he", dir: "rtl", kind: "seller" }), true);
  assert.match(sellerHtml, /data-lead-type="seller"/);
  assert.equal(assertHtmlPage(contactHtml, { lang: "he", dir: "rtl", kind: "contact" }), true);
  assert.match(contactHtml, /data-lead-type="general"/);
  assert.match(contactHtml, /website_contact_callback/);
  assert.equal(assertHtmlPage(guideHtml, { lang: "en", dir: "ltr", kind: "guide" }), true);
  assert.match(guideHtml, /data-approved-source="cms"/);
  assert.match(guideHtml, /Non-EU buyers cannot own Bulgarian land directly/);
  assert.equal(assertHtmlPage(fallbackHtml, { lang: "en", dir: "ltr", kind: "language-fallback" }), true);
  assert.match(fallbackHtml, /noindex,follow/);
});
