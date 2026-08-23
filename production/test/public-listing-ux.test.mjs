import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createBrokerContact } from "../lib/broker-contacts.mjs";
import { loadListings } from "../lib/content.mjs";
import { loadLocaleRegistry } from "../lib/locales.mjs";
import { labelsFor, renderListingPage, renderLocationPage, renderSearchPage } from "../lib/public-site.mjs";
import { renderReactPublicBody } from "../lib/react-public-site.mjs";
import { PUBLIC_APP_JS } from "../lib/ui/client.mjs";

const registry = loadLocaleRegistry();
const listings = loadListings();
const css = readFileSync(new URL("../lib/ui/adapter-public-listing.css", import.meta.url), "utf8");
const PUBLIC_LOCALES = ["bg", "en", "de", "nl", "ru", "el", "he"];
const listingById = (id) => listings.find((entry) => entry.id === id);
const rentListing = listingById("MS-CRAWL-0003");
const relatedFor = (listing) => listings.filter((entry) => entry.id !== listing.id && entry.location === listing.location).slice(0, 3);

function richListingPage(localeCode = "en", { related = true, broker = false } = {}) {
  const page = renderListingPage({
    registry,
    listing: rentListing,
    localeCode,
    relatedListings: related ? relatedFor(rentListing) : [],
    brokerContact: broker
      ? createBrokerContact({
          listingId: rentListing.id,
          broker: "broker_ru",
          phone: "+447700900001",
          reviewer: "owner",
          sourceReference: "test://broker-contact/listing-ux",
          validationStatus: "broker_verified",
          approved: true,
        })
      : null,
  });
  Object.assign(page.body.facts, { floor: 2, total_floors: 5, land_area_sqm: 640, area_sqm: 68, condition: "Renovated" });
  page.body.verification = { availability_verified_at: "2026-07-19T11:30:00Z", availability_verified_by: "owner", verified: true };
  page.body.lifecycle.publish_approved = true;
  const first = page.body.media.gallery[0];
  page.body.media.gallery = Array.from({ length: 9 }, (_, index) => ({ ...first, url: `${first.url}?p=${index + 1}` }));
  page.body.media.gallery_count = 9;
  return page;
}

test("listing detail leads with the decision: price block, facts bar, and a five-photo gallery", () => {
  const page = richListingPage("en");
  const labels = labelsFor("en");
  const html = renderReactPublicBody(page);

  assert.match(html, /class="ld-topbar"/);
  assert.match(html, /data-listing-summary="true"/);
  assert.match(html, /<div class="ld-price" data-listing-price-summary="true">/);
  assert.match(html, /class="ld-price__amount">€600</);
  assert.match(html, /class="ld-price__per">per month</);
  assert.match(html, /data-listing-offer="rent"/);
  // The facts bar is one horizontal strip of the numbers buyers scan first.
  assert.match(html, /data-listing-facts-bar="true"/);
  for (const fact of ["bedrooms", "area", "land", "floor", "availability"]) {
    assert.match(html, new RegExp(`data-listing-fact="${fact}"`), fact);
  }
  assert.match(html, /data-gallery-layout="quad"/);
  assert.equal((html.match(/data-mobile-gallery-slide=/g) || []).length, 9);
  assert.match(html, /data-listing-gallery-all="true"/);
  assert.match(html, new RegExp(labels.allPhotos.replace("{count}", "9")));
  assert.match(html, /class="ld-g ld-g--main[^"]*"[^>]*data-has-photo="true"/);
});

test("listing facts are grouped and the pending capabilities stay visible but inert", () => {
  const html = renderReactPublicBody(richListingPage("en"));

  assert.equal((html.match(/<dl data-listing-facts="true">/g) || []).length, 4);
  for (const group of ["property", "building", "land", "status"]) {
    assert.match(html, new RegExp(`data-listing-fact-group="${group}"`), group);
  }
  assert.match(html, /<dt>Reference<\/dt>|<dt>Availability<\/dt>/);
  assert.match(html, /data-listing-price-history="pending"/);
  assert.match(html, /data-listing-map-pending="true"[^>]*disabled|disabled[^>]*data-listing-map-pending="true"/);
  assert.match(html, /data-listing-location-link="search"/);
  assert.match(html, /data-listing-location-link="map"/);
});

test("the broker panel keeps one accent action, the office line, and the trust rows", () => {
  const html = renderReactPublicBody(richListingPage("en", { broker: true }));

  assert.match(html, /data-listing-contact-panel="true"/);
  assert.match(html, /<div class="ld-panel">/);
  const intents = [...html.matchAll(/data-lead-intent="(inquiry|viewing|callback)"/g)].map((match) => match[1]);
  assert.deepEqual(intents.slice(0, 3), ["inquiry", "viewing", "callback"]);
  assert.equal((html.match(/mk-btn--accent[^>]*data-endpoint="\/api\/leads"/g) || []).length >= 1, true);
  assert.match(html, /data-listing-office="true"/);
  assert.match(html, /data-contact-source="broker"/);
  assert.match(html, /data-listing-trust="facts-reviewed"/);
  assert.match(html, /data-availability-verification="true"/);
  assert.match(html, /data-listing-tools="true"/);
  assert.match(html, /data-listing-action="save"[^>]*aria-pressed="false"|aria-pressed="false"[^>]*data-listing-action="save"/);
});

// Without an approved per-listing broker contact the panel still offers a way
// through: the agency line the footer already publishes, marked as such.
test("listings without an approved broker contact fall back to the agency line and never to Viber", () => {
  const html = renderReactPublicBody(richListingPage("en"));

  assert.match(html, /data-contact-source="agency"/);
  assert.match(html, /href="tel:\+359879696870"/);
  assert.match(html, /href="https:\/\/wa\.me\/359879696870"/);
  assert.doesNotMatch(html, /href="viber:/);
});

test("the related rail states its empty case instead of disappearing", () => {
  const withRelated = renderReactPublicBody(richListingPage("en"));
  const withoutRelated = renderReactPublicBody(richListingPage("en", { related: false }));

  assert.match(withRelated, /data-related-listings="true"/);
  assert.match(withRelated, /data-related-listing="true"/);
  assert.match(withoutRelated, /data-related-listings="true"/);
  assert.match(withoutRelated, /data-related-listings-empty="true"/);
  assert.doesNotMatch(withoutRelated, /data-related-listing="true"/);
});

test("the photo viewer carries its loading and failed states", () => {
  const html = renderReactPublicBody(richListingPage("en"));

  assert.match(html, /<dialog class="ld-photo-viewer" aria-modal="true"/);
  assert.match(html, /data-listing-gallery-figure="true"/);
  assert.match(html, /ld-photo-viewer__state--loading/);
  assert.match(html, /ld-photo-viewer__state--failed/);
  assert.match(css, /figure\[data-image-state="loading"\] \.ld-photo-viewer__state--loading \{ display: flex; \}/);
  assert.match(css, /figure\[data-image-state="unavailable"\] \.ld-photo-viewer__state--failed \{ display: flex; \}/);
  // The base reset makes images display:block, which would defeat [hidden].
  assert.match(css, /\.ld-photo-viewer img\[hidden\],?[\s\S]{0,120}\{ display: none; \}/);
  assert.match(PUBLIC_APP_JS, /function initListingGalleryLinks\(\)/);
  assert.match(PUBLIC_APP_JS, /function initListingGalleryImageState\(\)/);
  assert.match(PUBLIC_APP_JS, /initListingGalleryLinks\(\);\s+initListingGalleryImageState\(\);\s+initListingGallery\(\);/);
});

test("search cards lead with the price and carry the offer and photo states", () => {
  const search = renderSearchPage({ registry, listings, localeCode: "en", query: "Sandanski" });
  const html = renderReactPublicBody(search);

  assert.match(html, /data-card-offer="(sale|rent)"/);
  assert.match(html, /class="mk-pcard__noimage"/);
  assert.match(html, /data-card-action="save"[^>]*aria-pressed="false"|aria-pressed="false"/);
  const card = html.slice(html.indexOf('data-search-card="true"'));
  const priceIndex = card.indexOf('data-card-price="true"');
  const titleIndex = card.indexOf("mk-pcard__title");
  assert.ok(priceIndex > 0 && priceIndex < titleIndex, "price comes before the title");
  const rentCard = search.cards.find((entry) => entry.offer_type === "rent");
  if (rentCard) assert.match(html, /class="mk-pcard__per">per month</);
});

test("location landing opens with the area, its sub-areas, guides, and a seller CTA", () => {
  const page = renderLocationPage({ registry, listings, localeCode: "bg", location: "Sandanski" });
  const html = renderReactPublicBody(page);

  assert.equal(page.body.listing_count > 0, true);
  assert.ok(page.body.sub_areas.length > 1);
  assert.equal(page.body.sub_areas.every((area) => area.id.startsWith("BG:settlement:") && area.count > 0), true);
  assert.equal(page.body.sub_areas[0].href.startsWith("/bg/tarsene?region_id="), true);
  assert.equal(page.body.search_href, "/bg/tarsene?region_id=BG%3Amunicipality%3ABLG40");
  assert.equal(page.body.seller.path, "/bg/prodai");
  assert.match(html, /class="loc-head"/);
  assert.match(html, /data-location-count="\d+"/);
  assert.match(html, /data-location-areas="true"/);
  assert.match(html, /data-location-area="BG:settlement:65334"/);
  assert.match(html, /data-location-listings="true"/);
  assert.match(html, /data-location-all="true"/);
  assert.match(html, /data-location-sell="true"/);
  assert.match(html, /data-location-context="true"/);
});

test("a location without reviewed listings explains itself and offers the next step", () => {
  const page = renderLocationPage({ registry, listings: [], localeCode: "en", location: "Sandanski" });
  const html = renderReactPublicBody(page);

  assert.equal(page.body.listing_count, 0);
  assert.deepEqual(page.body.sub_areas, []);
  assert.match(html, /data-location-empty="true"/);
  assert.match(html, /There are no reviewed listings in this location right now\./);
  assert.doesNotMatch(html, /data-location-listings="true"/);
});

// Saved listings live in localStorage: without JavaScript the page must still
// say something true, so the empty state is the server-rendered default.
test("saved listings render an empty state first and keep the grid hidden until the client fills it", () => {
  const page = renderSearchPage({ registry, listings, localeCode: "en", savedView: true });
  const html = renderReactPublicBody(page);

  assert.match(html, /data-saved-listings-view="true"/);
  assert.match(html, /class="sr-saved__hint">Saved properties stay on this device\./);
  assert.match(html, /<section class="sr-saved-empty" data-saved-listings-empty="true" aria-live="polite">/);
  assert.match(html, /class="sr-list sr-list--grid"[^>]*data-saved-listings-grid="true" hidden/);
  assert.match(html, /data-saved-search-disclosure="true"/);
  assert.doesNotMatch(html, /data-search-pagination="true"/);
});

test("every new listing label exists in all seven public locales without dashes or exclamation marks", () => {
  const keys = [
    "allPhotos",
    "description",
    "reference",
    "availability",
    "factsReviewed",
    "sourceLanguage",
    "office",
    "moreInLocation",
    "viewOnMap",
    "savedHint",
    "saveSearchHint",
    "areas",
    "sellInLocation",
    "mapComingSoon",
    "photoLoading",
    "photoUnavailable",
    "priceHistory",
    "priceHistoryComingSoon",
  ];
  for (const code of PUBLIC_LOCALES) {
    const labels = labelsFor(code);
    for (const key of keys) {
      assert.equal(typeof labels[key], "string", `${code}.${key}`);
      assert.ok(labels[key].length > 1, `${code}.${key}`);
      assert.doesNotMatch(labels[key], /[—–!]/, `${code}.${key}`);
    }
    for (const group of ["property", "building", "land", "status"]) {
      assert.equal(typeof labels.factGroups[group], "string", `${code}.factGroups.${group}`);
    }
    for (const status of ["available", "reserved", "sold", "rented"]) {
      assert.equal(typeof labels.listingStatuses[status], "string", `${code}.listingStatuses.${status}`);
    }
    assert.equal(typeof labels.factLabels.area_sqm, "string", `${code}.factLabels.area_sqm`);
  }
});

test("listing, location, and saved views render in every public locale including Hebrew", () => {
  for (const code of PUBLIC_LOCALES) {
    const listing = renderReactPublicBody(richListingPage(code, { broker: true }));
    assert.match(listing, /data-react-public-ui="listing"/, code);
    assert.doesNotMatch(listing, /undefined/, code);
    const location = renderReactPublicBody(renderLocationPage({ registry, listings, localeCode: code, location: "Sandanski" }));
    assert.match(location, /data-react-public-ui="location"/, code);
    assert.doesNotMatch(location, /undefined/, code);
    const saved = renderReactPublicBody(renderSearchPage({ registry, listings, localeCode: code, savedView: true }));
    assert.match(saved, /data-saved-listings-view="true"/, code);
    assert.doesNotMatch(saved, /undefined/, code);
  }
  const hebrew = richListingPage("he");
  assert.equal(hebrew.dir, "rtl");
});

test("the listing sheet keeps hover, focus, active, disabled, and empty states in one place", () => {
  assert.match(css, /\.mk-pcard--interactive:hover \{ box-shadow: var\(--shadow-card-hover\); \}/);
  assert.match(css, /\.mk-pcard__title a:focus-visible \{[^}]*box-shadow: var\(--shadow-focus\)/);
  assert.match(css, /\.mk-pcard__actions \.mk-btn:active \{ transform: translateY\(1px\); \}/);
  assert.match(css, /\.ld-g:focus-visible \{[^}]*box-shadow: inset 0 0 0 3px var\(--ring\)/);
  assert.match(css, /\.ld-photo-viewer__nav:disabled \{ visibility: hidden; \}/);
  assert.match(css, /\.ld-soon \{[\s\S]*?border: 1px dashed var\(--border-strong\)/);
  assert.match(css, /\.ld-similar__empty \{[\s\S]*?border: 1px dashed var\(--border-strong\)/);
  assert.match(css, /\.loc-guide:focus-visible \{[^}]*box-shadow: var\(--shadow-focus\)/);
  assert.match(css, /\.sr-saved__search summary:focus-visible \{[^}]*box-shadow: var\(--shadow-focus\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});
