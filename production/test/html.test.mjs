import test from "node:test";
import assert from "node:assert/strict";
import { createBrokerContact } from "../lib/broker-contacts.mjs";
import { findListingById, loadListings } from "../lib/content.mjs";
import { assertHtmlPage, renderHtmlPage } from "../lib/html.mjs";
import { loadLocaleRegistry } from "../lib/locales.mjs";
import {
  renderLanguageFallback,
  renderHomePage,
  renderListingPage,
  renderLocationPage,
  renderSearchPage,
  renderSellerPage,
} from "../lib/public-site.mjs";

const registry = loadLocaleRegistry();
const listings = loadListings();
const listing = findListingById(listings, "MS-CRAWL-0001");

test("HTML renderer emits SEO-safe listing, search, and fallback documents", () => {
  const homeHtml = renderHtmlPage(renderHomePage({ registry, listings, localeCode: "he" }));
  const listingHtml = renderHtmlPage(renderListingPage({ registry, listing, localeCode: "he" }));
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
  const fallbackHtml = renderHtmlPage(renderLanguageFallback({ registry, requestedLocale: "fr" }));

  assert.equal(assertHtmlPage(homeHtml, { lang: "he", dir: "rtl", kind: "home" }), true);
  assert.match(homeHtml, /role="search"/);
  assert.match(homeHtml, /data-action="seller"/);
  assert.equal(assertHtmlPage(listingHtml, { lang: "he", dir: "rtl", kind: "listing" }), true);
  assert.match(listingHtml, /application\/ld\+json/);
  assert.match(listingHtml, /hreflang="el"/);
  assert.doesNotMatch(listingHtml, /tel:\+359880000000/);
  assert.match(approvedListingHtml, /tel:\+359880000000/);
  assert.equal(assertHtmlPage(searchHtml, { lang: "he", dir: "rtl", kind: "search" }), true);
  assert.match(searchHtml, /data-total-matches=/);
  assert.equal(assertHtmlPage(locationHtml, { lang: "he", dir: "rtl", kind: "location" }), true);
  assert.match(locationHtml, /data-location="Sandanski"/);
  assert.equal(assertHtmlPage(sellerHtml, { lang: "he", dir: "rtl", kind: "seller" }), true);
  assert.match(sellerHtml, /data-lead-type="seller"/);
  assert.equal(assertHtmlPage(fallbackHtml, { lang: "en", dir: "ltr", kind: "language-fallback" }), true);
  assert.match(fallbackHtml, /noindex,follow/);
});
