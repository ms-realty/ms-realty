import test from "node:test";
import assert from "node:assert/strict";
import { approvedContentDocumentsForPath, readApprovedCmsContent } from "../lib/approved-content.mjs";
import { createBrokerContact } from "../lib/broker-contacts.mjs";
import { findListingById, loadListings } from "../lib/content.mjs";
import { loadLocaleRegistry } from "../lib/locales.mjs";
import { publicMediaLibrary } from "../lib/media.mjs";
import { renderReactPublicBody } from "../lib/react-public-site.mjs";
import { applyListingEdits } from "../lib/listing-edits.mjs";
import { listingFromCmsRecord, loadCmsSeed } from "../lib/runtime.mjs";
import {
  renderAdminShell,
  renderContactPage,
  renderGuidePage,
  renderHomePage,
  renderLanguageFallback,
  renderListingPage,
  renderLocationPage,
  renderSearchPage,
  renderSellerPage,
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
  assert.equal(he.body.actions.sticky_mobile, true);
  assert.equal(he.body.actions.primary.find((action) => action.id === "callback").payload.contact_preference, "phone");
  assert.equal(he.body.actions.primary.find((action) => action.id === "request_viewing").payload.source, "website_viewing_request");
  assert.equal(he.body.actions.primary.find((action) => action.id === "request_viewing").payload.contact_preference, "phone");
  assert.equal(he.body.actions.direct_contact.review_status, "needs_broker_contact_review");
  assert.ok(he.body.actions.direct_contact.channels.every((channel) => channel.enabled === false && channel.href === null));
  assert.deepEqual(he.body.actions.secondary.find((action) => action.id === "back_to_results"), {
    id: "back_to_results",
    label: "חזרה לתוצאות",
    kind: "link",
    url: "/he/search",
  });
  assert.deepEqual(
    he.body.actions.secondary.find((action) => action.id === "print"),
    {
      id: "print",
      label: "הדפסה/PDF",
      kind: "print",
      url: "/he/properties/MS-CRAWL-0001?print=1",
      pdf_status: "browser_print_ready",
    },
  );
});

test("listing CTA dialog keeps inquiry, callback, and viewing intents distinct", () => {
  const html = renderReactPublicBody(renderListingPage({ registry, listing, localeCode: "ru" }));

  assert.match(html, /id="mk-enquiry"/);
  assert.match(html, /name="intent" value="inquiry"/);
  assert.match(html, /data-enquiry-title="true"/);
  assert.match(html, /data-enquiry-submit="true"/);
  assert.match(html, /data-enquiry-channel="true"/);
  assert.match(html, /data-enquiry-contact="true"/);
  assert.match(html, /data-enquiry-icon="inquiry"/);
  assert.match(html, /data-enquiry-icon="callback" hidden/);
  assert.match(html, /data-enquiry-icon="viewing" hidden/);
  assert.match(html, /data-enquiry-property="true"/);
  assert.match(html, /data-help-inquiry="Спросите о цене/);
  assert.match(html, /data-next-callback="Брокер подтвердит время/);
  assert.match(html, /data-enquiry-success-detail="true"/);
  assert.match(html, /data-lead-intent="inquiry"/);
  assert.match(html, /data-lead-intent="callback"/);
  assert.match(html, /data-lead-intent="viewing"/);
  assert.match(html, /data-lead-source="website_listing_detail"/);
  assert.match(html, /data-lead-source="website_callback_request"/);
  assert.match(html, /data-lead-source="website_viewing_request"/);
  assert.match(html, /data-lead-type="renter"/);
  assert.match(html, /data-mobile-gallery="true"/);
  assert.match(html, /data-mobile-gallery-index="1"/);
  assert.match(html, /data-mobile-gallery-slide="1" data-gallery-active="true"/);
  assert.equal((html.match(/data-mobile-gallery-slide=/g) || []).length, 1);
  assert.doesNotMatch(html, /data-mobile-gallery-progress="true"/);
  assert.match(html, /data-mobile-sticky-primary="true"/);
  assert.match(html, /data-mobile-contact-options="true"/);
  assert.match(html, /data-mobile-contact-options-open="true"/);
  assert.match(html, /data-listing-action="back_to_results" data-history-back="same-origin"/);
  assert.doesNotMatch(html, /\/api\/admin\/(viewings|replies)/);
});

test("mobile listing gallery exposes every reviewed photo and its swipe position", () => {
  const page = renderListingPage({ registry, listing, localeCode: "ru" });
  const firstImage = page.body.media.gallery[0];
  page.body.media.gallery = Array.from({ length: 14 }, (_, index) => ({
    ...firstImage,
    url: `${firstImage.url}?preview=${index + 1}`,
  }));
  page.body.media.gallery_count = 14;
  const html = renderReactPublicBody(page);

  assert.equal((html.match(/data-mobile-gallery-slide=/g) || []).length, 14);
  assert.match(html, /data-mobile-gallery-slide="14"/);
  assert.match(html, /data-mobile-gallery-progress="true" data-gallery-total="14"/);
  assert.match(html, /data-mobile-gallery-current="true">1<\/span> \/ 14/);
  assert.match(html, /role="region" aria-label="Галерея"/);
  assert.match(html, /role="group" aria-label="14 \/ 14:/);
});

test("approved broker contact data enables direct listing contact links", () => {
  const page = renderListingPage({
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
  });

  assert.equal(page.body.actions.direct_contact.review_status, "approved_broker_contact");
  assert.equal(page.body.actions.direct_contact.broker, "broker_ru");
  assert.equal(page.body.actions.direct_contact.channels.find((channel) => channel.id === "phone").href, "tel:+359880000000");
  assert.equal(
    page.body.actions.direct_contact.channels.find((channel) => channel.id === "whatsapp").href,
    "https://wa.me/359880000000",
  );
  const html = renderReactPublicBody(page);
  assert.match(html, /ld-contact-options__direct/);
  assert.match(html, /href="tel:\+359880000000"/);
  assert.match(html, /href="https:\/\/wa\.me\/359880000000"/);
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

test("reviewed listing facts, privacy, verification, and SEO reach the public listing", () => {
  const seed = applyListingEdits(loadCmsSeed(), [
    {
      listing_id: "MS-CRAWL-0001",
      editor: "listing_editor",
      edited_at: "2026-07-19T11:31:00Z",
      patch: {
        floor: 2,
        total_floors: 5,
        land_area_sqm: 640,
        condition: "Renovated",
        location_precision: "approximate",
        availability_verified_at: "2026-07-19T11:30:00Z",
        publish_approved: true,
        seo_title: "Reviewed commercial property in Sandanski",
        seo_description: "Reviewed source-language description for search engines.",
        seo_canonical: "/bg/imoti/MS-CRAWL-0001",
        seo_og_title: "Commercial property in Sandanski",
        seo_og_description: "Reviewed commercial property listing.",
        seo_robots: "index,follow",
        seo_review_confirmed: true,
      },
    },
  ]);
  const record = seed.records.find((candidate) => candidate.id === "MS-CRAWL-0001");
  const page = renderListingPage({ registry, listing: listingFromCmsRecord(record), localeCode: "bg" });
  const html = renderReactPublicBody(page);

  assert.equal(page.canonical, "/bg/imoti/MS-CRAWL-0001");
  assert.equal(page.metadata.title, "Reviewed commercial property in Sandanski");
  assert.equal(page.metadata.og_title, "Commercial property in Sandanski");
  assert.equal(page.body.facts.floor, 2);
  assert.equal(page.body.facts.total_floors, 5);
  assert.equal(page.body.facts.land_area_sqm, 640);
  assert.equal(page.body.facts.location_precision, "approximate");
  assert.equal(page.body.verification.verified, true);
  assert.equal(page.body.lifecycle.publish_approved, true);
  assert.equal(page.schema.dateModified, "2026-07-19T11:30:00Z");
  assert.ok(page.schema.additionalProperty.some((property) => property.name === "condition" && property.value === "Renovated"));
  assert.match(html, /data-availability-verified="true"/);
  assert.match(html, /data-location-precision="approximate"/);
  assert.match(html, /data-listing-verification="availability"/);
  assert.match(html, /приблизителна локация/);
  assert.match(html, /ld-g--main[^>]*><img[^>]*loading="eager"/);
  assert.match(html, /ld-g--main[^>]*><img[^>]*fetchPriority="high"/);
});

test("unreviewed source-language SEO never replaces public metadata", () => {
  const seed = applyListingEdits(loadCmsSeed(), [
    {
      listing_id: "MS-CRAWL-0001",
      editor: "seo_editor",
      edited_at: "2026-07-19T11:31:00Z",
      patch: { seo_title: "Unreviewed SEO draft", seo_review_confirmed: false },
    },
  ]);
  const record = seed.records.find((candidate) => candidate.id === "MS-CRAWL-0001");
  const runtimeListing = listingFromCmsRecord(record);
  const page = renderListingPage({ registry, listing: runtimeListing, localeCode: "bg" });

  assert.equal(runtimeListing.seo.human_approved, false);
  assert.notEqual(page.metadata.title, "Unreviewed SEO draft");
  assert.equal(page.metadata.title, page.body.h1);
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
  assert.equal(search.indexable, false);
  assert.equal(search.metadata.robots, "noindex,follow");
  assert.equal(search.mobile_policy.list_first_mobile, true);
  assert.equal(search.mobile_policy.map_optional, false);
  assert.deepEqual(search.search.engines, ["typesense", "meilisearch"]);
  assert.equal(search.search.filters.locale, "he");
  assert.equal(search.search.controls.save_search.endpoint, "/api/saved-searches");
  assert.equal(search.search.controls.save_search.payload.language, "he");
  assert.equal(search.search.controls.view_modes.find((mode) => mode.id === "list").default, true);
  assert.equal(search.search.controls.view_modes.some((mode) => mode.id === "map"), false);
  assert.deepEqual(
    search.search.controls.sort_options.map((option) => option.id),
    ["recommended", "price_asc", "price_desc"],
  );
  assert.ok(search.search.controls.filter_options.locations.includes("Sandanski"));
  assert.ok(search.search.controls.filter_options.property_types.includes("apartment"));
  assert.ok(search.search.controls.filter_options.offer_types.includes("sale"));
  assert.ok(search.search.controls.filter_options.bedrooms.includes(2));
  assert.ok(search.search.total_matches > search.cards.length);
  assert.equal(search.search.returned, search.cards.length);
  assert.deepEqual(search.search.pagination, {
    page: 1,
    per_page: 12,
    total_pages: Math.ceil(search.search.total_matches / 12),
    has_previous: false,
    has_next: true,
  });
  assert.ok(search.cards.length > 0);
  assert.ok(search.cards.every((card) => card.path.startsWith("/he/properties/")));
  assert.equal(search.cards.every((card) => card.actions.inquiry.endpoint === "/api/leads"), true);
  assert.equal(search.cards.every((card) => card.actions.save.storage_key === "ms-realty:saved-listings"), true);
  assert.equal(search.cards.every((card) => card.thumbnail?.url.includes("/wp-content/uploads/")), true);
  assert.equal(search.cards.every((card) => card.thumbnail?.alt), true);
  assert.equal(search.cards.find((card) => card.id === "MS-CRAWL-0001").translation_display, "reviewed_translation");
  assert.equal(search.cards.find((card) => card.id === "MS-CRAWL-0001").review_badge, "reviewed_translation");
  assert.ok(search.cards.some((card) => card.translation_display === "fallback_source_locale"));
  assert.ok(search.cards.some((card) => card.translation_display === "fallback_source_locale" && card.content_locale === "bg"));
  assert.match(renderReactPublicBody(search), /data-content-language="bg"/);
});

test("saved listings are a private app-style collection rather than a dead toggle", () => {
  const saved = renderSearchPage({ registry, listings, localeCode: "ru", savedView: true });
  const html = renderReactPublicBody(saved);

  assert.equal(saved.search.saved_view, true);
  assert.equal(saved.indexable, false);
  assert.equal(saved.metadata.robots, "noindex,nofollow");
  assert.equal(saved.cards.length, saved.search.total_matches);
  assert.equal(saved.search.pagination.total_pages, 1);
  assert.match(saved.metadata.title, /^Избранное \| MS Realty$/);
  assert.match(html, /data-saved-listings-view="true"/);
  assert.match(html, /data-saved-listings-grid="true"/);
  assert.match(html, /data-saved-listings-empty="true"/);
  assert.match(html, /data-saved-navigation="true"/);
  assert.match(html, /href="\/ru\/search\?saved=1"/);
  assert.match(html, /data-saved-label="Сохранено"/);
  assert.doesNotMatch(html, /data-mobile-search-filters="true"/);
  assert.doesNotMatch(html, /data-search-pagination="true"/);
});

test("public UI localizes structured values and excludes operational crawl imagery", () => {
  const ruListing = findListingById(listings, "MS-CRAWL-0114");
  const ruSearch = renderSearchPage({ registry, listings, localeCode: "ru", query: "Парк отеле" });
  const ruPage = renderListingPage({ registry, listing: ruListing, localeCode: "ru" });
  const card = ruSearch.cards.find((entry) => entry.id === ruListing.id);
  const importedRecord = loadCmsSeed().records.find((record) => record.id === ruListing.id);
  const importedGallery = publicMediaLibrary(importedRecord.media).gallery;

  assert.equal(ruSearch.metadata.title, "Поиск недвижимости | MS Realty");
  assert.equal(ruSearch.search.controls.view_modes.find((mode) => mode.id === "list").label, "Список");
  assert.equal(card.actions.detail.label, "Подробнее");
  assert.equal(card.location, "Сандански");
  assert.equal(card.property_type_label, "Апартаменты");
  assert.equal(card.offer_type_label, "Продажа");
  assert.equal(ruPage.body.facts.location, "Сандански");
  assert.equal(card.thumbnail, null);
  assert.equal(card.image_count, ruPage.body.media.gallery_count);
  assert.equal(card.legacy_image_count, ruListing.image_count);
  assert.ok(ruPage.body.media.gallery.every((image) => !image.url.includes("taxi")));
  assert.ok(importedGallery.some((image) => image.url.includes("/191-1.jpg")));
  assert.ok(importedGallery.every((image) => !image.url.includes("taxi")));
});

test("public chrome gives the icon-only mobile menu an explicit accessible name", () => {
  const html = renderReactPublicBody(renderHomePage({ registry, listings, localeCode: "en" }));

  assert.match(html, /class="site-hd__mobile-label">Primary navigation<\/span>/);
  assert.match(html, /aria-controls="public-mobile-navigation-en" aria-expanded="false"/);
  assert.match(html, /data-mobile-menu-close="true"/);
  assert.match(html, /role="dialog" aria-modal="true" aria-label="Primary navigation"/);
  assert.match(html, /data-language-switcher="desktop"/);
  assert.match(html, /aria-label="Language: English"/);
  assert.match(html, /data-language-switcher="mobile"/);
  assert.match(html, /data-mobile-task-navigation="true"/);
  assert.match(html, /data-mobile-task="buy" data-active="true" aria-current="page"/);
  assert.equal((html.match(/data-mobile-task="/g) || []).length, 5);
  assert.match(html, /data-mobile-secondary-navigation="true"/);
  assert.match(html, /aria-label="Buyer guides"/);
  assert.match(html, /class="mk-search__go" type="submit" aria-label="Search" title="Search"/);
  assert.equal((html.match(/data-mobile-footer-group="/g) || []).length, 3);
});

test("mobile task navigation follows the buyer's active search journey", () => {
  const html = renderReactPublicBody(
    renderSearchPage({ registry, listings, localeCode: "en", filters: { offer_type: "rent" } }),
  );

  assert.match(html, /data-mobile-task="rent" data-active="true" aria-current="page"/);
  assert.doesNotMatch(html, /data-mobile-task="buy" data-active="true"/);
  assert.match(html, /class="sr-mobile-filters__label">For rent<\/strong>/);
});

test("search result count is announced separately from the page heading", () => {
  const html = renderReactPublicBody(renderSearchPage({ registry, listings, localeCode: "en" }));

  assert.match(html, /<h1>Property search<\/h1>/);
  assert.match(html, /class="sr-results__count" role="status" aria-live="polite">\d+ matches<\/p>/);
  assert.doesNotMatch(html, /<h1>Property search \| MS Realty<small>/);
  assert.match(html, /data-mobile-filter-sheet="true"/);
  assert.match(html, /data-mobile-filter-sheet="true" role="dialog" aria-modal="true" aria-labelledby="mobile-search-filters-title-en"/);
  assert.match(html, /aria-controls="mobile-search-filters-panel-en" aria-expanded="false"/);
  assert.match(html, /class="sr-mobile-filters__copy"><strong class="sr-mobile-filters__label">Search/);
  assert.match(html, /class="sr-mobile-filters__control" aria-hidden="true"/);
  assert.match(html, /data-mobile-filter-close="true"/);
  assert.match(html, /data-save-search-disclosure="sr-mobile"/);
  assert.match(html, /data-success-message="Search saved\. We will alert you when new properties match\."/);
  assert.match(html, /form="sr-mobile-filter-form"/);
  assert.match(html, /class="sr-mobile-filters__sheet-foot/);
  assert.match(html, /data-mobile-filter-preview-status="true"/);
  assert.match(html, /data-mobile-filter-submit="true"/);
  assert.match(html, /data-mobile-filter-base-label="Search"/);
  assert.match(html, /data-mobile-filter-matches-label="matches"/);
  assert.match(html, /data-card-action="detail"/);
  assert.match(html, /data-card-action="inquiry"/);
  assert.match(html, /data-card-action="save"/);
  assert.match(html, /data-card-spec="reference"/);
  assert.match(html, /data-card-thumbnail="true"[^>]*><img[^>]*loading="eager"/);
  assert.match(html, /data-card-thumbnail="true"[^>]*><img[^>]*fetchPriority="high"/);
  assert.match(html, /<img[^>]*loading="lazy"[^>]*decoding="async"/);
});

test("zero-result searches render a useful mobile recovery state", () => {
  const page = renderSearchPage({ registry, listings, localeCode: "ru", query: "no-such-listing-987654" });
  const html = renderReactPublicBody(page);

  assert.equal(page.search.total_matches, 0);
  assert.equal(page.cards.length, 0);
  assert.match(html, /data-search-empty="true"/);
  assert.match(html, /<h2>Результаты поиска<\/h2>/);
  assert.match(html, /<p>0 совпадений<\/p>/);
  assert.match(html, /href="\/ru\/search"[^>]*>.*Очистить фильтры/s);
  assert.doesNotMatch(html, /class="sr-list"/);
});

test("search applies text and facet filters before paginating cards", () => {
  const petrich = renderSearchPage({ registry, listings, localeCode: "he", query: "Petrich" });
  const petrichLocation = renderSearchPage({ registry, listings, localeCode: "he", filters: { location: "Petrich" } });
  const apartments = renderSearchPage({
    registry,
    listings,
    localeCode: "he",
    query: "Sandanski",
    filters: { property_type: "apartment" },
  });

  assert.ok(petrich.search.total_matches > 0);
  assert.ok(petrich.cards.some((card) => card.location === "פטריץ׳"));
  assert.ok(petrichLocation.cards.every((card) => card.location === "פטריץ׳"));
  assert.ok(apartments.search.total_matches > apartments.cards.length);
  assert.ok(apartments.cards.every((card) => card.property_type === "apartment"));
  assert.equal(apartments.search.filters.property_type, "apartment");
  assert.deepEqual(apartments.search.controls.active_filter_chips, [{ key: "property_type", value: "apartment", active: true }]);
});

test("search matches Cyrillic listings across Latin and Cyrillic keyboard input", () => {
  const latinRussianTitle = renderSearchPage({ registry, listings, localeCode: "ru", query: "apartamenty" });
  const cyrillicLatinLocation = renderSearchPage({ registry, listings, localeCode: "ru", query: "Сандански" });

  assert.ok(latinRussianTitle.cards.some((card) => card.id === "MS-CRAWL-0114"));
  assert.ok(cyrillicLatinLocation.search.total_matches > 0);
});

test("search paginates without duplicating cards and applies reviewed area facets", () => {
  const withAreas = listings.map((listing, index) => ({ ...listing, area_sqm: 40 + index }));
  const first = renderSearchPage({ registry, listings: withAreas, localeCode: "he", query: "Sandanski", page: 1 });
  const second = renderSearchPage({ registry, listings: withAreas, localeCode: "he", query: "Sandanski", page: 2 });
  const area = renderSearchPage({
    registry,
    listings: withAreas,
    localeCode: "he",
    filters: { area_min: "100", area_max: "120" },
  });

  assert.equal(second.search.pagination.page, 2);
  assert.equal(second.search.pagination.has_previous, true);
  assert.equal(first.cards.some((card) => second.cards.some((candidate) => candidate.id === card.id)), false);
  assert.ok(area.cards.length > 0);
  assert.ok(area.cards.every((card) => card.area_sqm >= 100 && card.area_sqm <= 120));
  assert.deepEqual(
    area.search.controls.active_filter_chips.map((chip) => chip.key),
    ["area_min", "area_max"],
  );
});

test("search price sorting is real and unavailable prices stay after priced listings", () => {
  const lowToHigh = renderSearchPage({ registry, listings, localeCode: "he", query: "Sandanski", sort: "price_asc" });
  const highToLow = renderSearchPage({ registry, listings, localeCode: "he", query: "Sandanski", sort: "price_desc" });
  const lowPrices = lowToHigh.cards.map((card) => card.price_eur).filter((price) => Number.isFinite(Number(price))).map(Number);
  const highPrices = highToLow.cards.map((card) => card.price_eur).filter((price) => Number.isFinite(Number(price))).map(Number);

  assert.equal(lowToHigh.search.sort, "price_asc");
  assert.equal(highToLow.search.sort, "price_desc");
  assert.deepEqual(lowPrices, [...lowPrices].sort((left, right) => left - right));
  assert.deepEqual(highPrices, [...highPrices].sort((left, right) => right - left));
});

test("home page exposes search, seller, location, and featured listing paths", () => {
  const he = renderHomePage({ registry, listings, localeCode: "he" });

  assert.equal(he.status, 200);
  assert.equal(he.path, "/he");
  assert.equal(he.dir, "rtl");
  assert.equal(he.indexable, true);
  assert.equal(he.body.search.path, "/he/search");
  assert.equal(he.body.seller.path, "/he/sell");
  assert.equal(he.body.contact.path, "/he/contact");
  assert.equal(he.body.locations.some((location) => location.path === "/he/locations/sandanski"), true);
  assert.equal(he.body.locations.some((location) => location.location === "סנדנסקי"), true);
  assert.ok(he.body.hero.image?.url.includes("/wp-content/uploads/"));
  assert.ok(he.body.locations.some((location) => location.image?.url.includes("/wp-content/uploads/")));
  assert.ok(he.cards.length > 0);
  assert.equal(he.cards.every((card) => card.thumbnail?.url.includes("/wp-content/uploads/")), true);
  assert.equal(he.hreflang.some((link) => link.hreflang === "he"), true);
  assert.equal(he.body.guides, null);
});

test("English home makes every approved buyer guide discoverable without expanding the mobile task dock", () => {
  const en = renderHomePage({ registry, listings, localeCode: "en" });
  const html = renderReactPublicBody(en);

  assert.equal(en.body.guides.label, "Buyer guides");
  assert.deepEqual(
    en.body.guides.links.map((guide) => guide.href).sort(),
    ["/en/guides/buying-process", "/en/guides/foreign-buyers"],
  );
  assert.ok(en.body.guides.links.every((guide) => guide.reviewer === "editor_bg"));
  assert.match(html, /data-home-guides="true" data-approved-source="cms"/);
  assert.match(html, /href="\/en\/guides\/buying-process"/);
  assert.match(html, /href="\/en\/guides\/foreign-buyers"/);
  assert.match(html, /Foreign buyers and Bulgarian land ownership/);
  assert.equal((html.match(/data-mobile-task="/g) || []).length, 5);
});

test("location page exposes only indexable locale inventory", () => {
  const he = renderLocationPage({ registry, listings, localeCode: "he", location: "Sandanski" });
  const missing = renderLocationPage({ registry, listings, localeCode: "he", location: "Petrich" });
  const html = renderReactPublicBody(he);

  assert.equal(he.status, 200);
  assert.equal(he.path, "/he/locations/sandanski");
  assert.equal(he.dir, "rtl");
  assert.equal(he.indexable, true);
  assert.equal(he.cards.length, 1);
  assert.equal(he.cards[0].id, "MS-CRAWL-0001");
  assert.equal(he.cards[0].translation_indexable, true);
  assert.match(he.cards[0].thumbnail.url, /\/wp-content\/uploads\//);
  assert.equal(he.hreflang.some((link) => link.hreflang === "he"), true);
  assert.equal(he.body.h1, "נכסים ב-סנדנסקי");
  assert.equal(he.metadata.title, "נכסים ב-סנדנסקי | MS Realty");
  assert.match(he.metadata.description, /נכסים שנבדקו/);
  assert.match(html, /data-mobile-task="buy" data-active="true" aria-current="page"/);
  assert.equal(missing.status, 404);
  assert.equal(missing.indexable, false);
  assert.equal(missing.metadata.robots, "noindex,follow");
  const missingHtml = renderReactPublicBody(missing);
  assert.match(missingHtml, /data-location-empty="true"/);
  assert.match(missingHtml, /href="\/he\/search"/);
});

test("seller valuation page is locale-prefixed and posts seller leads", () => {
  const he = renderSellerPage({ registry, localeCode: "he" });
  const fr = renderSellerPage({ registry, localeCode: "fr" });

  assert.equal(he.status, 200);
  assert.equal(he.path, "/he/sell");
  assert.equal(he.dir, "rtl");
  assert.equal(he.indexable, true);
  assert.equal(he.body.valuation.endpoint, "/api/leads");
  assert.equal(he.body.valuation.payload.leadType, "seller");
  assert.equal(he.body.valuation.payload.source, "website_seller_valuation");
  assert.equal(he.body.valuation.payload.intent, "valuation");
  assert.equal(he.body.valuation.required_fields.includes("contact.phone"), true);
  assert.equal(fr.locale, "en");
  assert.equal(fr.indexable, false);
});

test("contact callback page is locale-prefixed and posts generic CRM leads", () => {
  const he = renderContactPage({ registry, localeCode: "he" });
  const el = renderContactPage({ registry, localeCode: "el" });
  const fr = renderContactPage({ registry, localeCode: "fr" });

  assert.equal(he.status, 200);
  assert.equal(he.path, "/he/contact");
  assert.equal(he.dir, "rtl");
  assert.equal(he.indexable, true);
  assert.equal(he.body.callback.endpoint, "/api/leads");
  assert.equal(he.body.callback.payload.source, "website_contact_callback");
  assert.equal(he.body.callback.payload.intent, "callback");
  assert.equal(he.body.callback.payload.leadType, "general");
  assert.equal(he.body.callback.payload.contact_preference, "phone");
  assert.deepEqual(he.body.callback.required_fields, ["contact.name", "contact.phone"]);
  assert.equal(he.hreflang.some((link) => link.hreflang === "he"), true);
  assert.equal(el.path, "/el/epikoinonia");
  assert.equal(el.body.callback.label, "Επανάκληση");
  assert.equal(fr.locale, "en");
  assert.equal(fr.indexable, false);
});

test("approved CMS guide page renders reviewed foreign-buyer facts", () => {
  const path = "/en/guides/foreign-buyers";
  const guide = renderGuidePage({
    registry,
    localeCode: "en",
    path,
    documents: approvedContentDocumentsForPath(readApprovedCmsContent(), path),
  });

  assert.equal(guide.status, 200);
  assert.equal(guide.path, path);
  assert.equal(guide.indexable, true);
  assert.equal(guide.chrome.resources.links.find((item) => item.href === path).active, true);
  assert.match(guide.body.sections[0].facts.join(" "), /Non-EU buyers cannot own Bulgarian land directly/);
  const html = renderReactPublicBody(guide);
  assert.match(html, /data-guide-trust="approved"/);
  assert.match(html, /data-primary-guide-section="true" aria-label="Foreign buyers and Bulgarian land ownership"/);
  assert.doesNotMatch(html, /<h2>Foreign buyers and Bulgarian land ownership<\/h2>/);
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
  assert.equal(adminRu.localized_surface.title, "Администрирование MS Realty");
  assert.equal(
    adminRu.localized_surface.modules.find((module) => module.id === "crm").screens.find((screen) => screen.id === "lead_inbox")
      .label,
    "Входящие заявки",
  );
  assert.equal(
    adminRu.localized_surface.modules.find((module) => module.id === "cms").screens.find((screen) => screen.id === "property_editor")
      .label,
    "Редактор объектов",
  );
  assert.equal(adminEl.localized_surface.locale, "en");
  assert.deepEqual(
    adminRu.website_language_coverage.map((item) => [item.market, item.locale, item.public_route_prefix]),
    [
      ["Greece", "el", "/el/"],
      ["Israel", "he", "/he/"],
    ],
  );
  assert.equal(adminRu.language_policy.hermes_reply_drafts_require_broker_approval, true);
});

test("rendered public fixtures do not introduce Sandanski sea framing", () => {
  const rendered = JSON.stringify({
    bg: renderListingPage({ registry, listing, localeCode: "bg" }),
    el: renderListingPage({ registry, listing, localeCode: "el" }),
    he: renderListingPage({ registry, listing, localeCode: "he" }),
    search: renderSearchPage({ registry, listings, localeCode: "he", query: "Sandanski" }),
    seller: renderSellerPage({ registry, localeCode: "he" }),
    contact: renderContactPage({ registry, localeCode: "he" }),
  });

  assert.doesNotMatch(rendered, /Sandanski sea|sea destination|Сандански море/i);
});
