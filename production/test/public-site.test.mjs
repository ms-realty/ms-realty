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
import { PUBLIC_APP_JS } from "../lib/ui/client.mjs";
import {
  localizedListingValue,
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
import { CANONICAL_PROPERTY_FAMILIES } from "../lib/listing-facts.mjs";

Object.assign(process.env, {
  MS_REALTY_LEAD_DURABLE_STORE_ENABLED: "true",
  PAYLOAD_SECRET: "test-only-public-site-payload-secret-32-characters",
  DATABASE_URL: "postgres://payload:secret@db.example.test/ms_realty",
  MS_REALTY_LEAD_CONTACT_KEY: "test-only-public-site-contact-key-32-characters",
  MS_REALTY_WORKSPACE_ID: "workspace-sandanski",
});

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

test("listing language navigation keeps users on an available translation of the same listing", () => {
  const page = renderListingPage({ registry, listing, localeCode: "he" });

  assert.deepEqual(
    page.chrome.languages.map(({ code, href }) => ({ code, href })),
    [
      { code: "bg", href: "/bg/imoti/MS-CRAWL-0001" },
      { code: "el", href: "/el/akinita/MS-CRAWL-0001" },
      { code: "he", href: "/he/properties/MS-CRAWL-0001" },
    ],
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
 assert.match(html, /data-mobile-gallery-label="Галерея"/);
 assert.match(html, /data-mobile-gallery-slide="1" data-gallery-active="true"/);
 assert.equal((html.match(/data-mobile-gallery-slide=/g) || []).length, 1);
  assert.doesNotMatch(html, /data-mobile-gallery-progress="true"/);
  assert.match(html, /data-mobile-sticky-primary="true"/);
  assert.match(html, /data-mobile-contact-options="true"/);
  assert.match(html, /data-mobile-contact-options-open="true"/);
  assert.match(html, /data-listing-action="back_to_results" data-history-back="same-origin"/);
  assert.doesNotMatch(html, /data-related-listings="true"/);
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
  assert.match(html, /data-mobile-gallery-prev="true"/);
  assert.match(html, /data-mobile-gallery-next="true"/);
 assert.match(html, /aria-label="Назад фото"/);
 assert.match(html, /aria-label="Далее фото"/);
  assert.doesNotMatch(html, /undefined/);
  assert.match(html, /tabindex="0"/);
  assert.match(html, /role="region" aria-label="Галерея"/);
  assert.match(html, /aria-label="14 \/ 14:[^"]*" data-mobile-gallery-slide="14"/);
 assert.equal((html.match(/data-listing-gallery-source="true"/g) || []).length, 14);
  assert.match(html, /data-listing-gallery-dialog="true"/);
  assert.match(PUBLIC_APP_JS, /function initListingGallery\(\)/);
  assert.match(PUBLIC_APP_JS, /dialog\.showModal\(\)/);
  assert.match(PUBLIC_APP_JS, /event\.key === "Escape"[\s\S]*?dialog\.close\(\)/);
  assert.match(PUBLIC_APP_JS, /event\.key === "ArrowLeft"/);
  assert.match(PUBLIC_APP_JS, /initListingGallery\(\);\s+initMobileListingGallery\(\);/);
});

test("approved 360 tours retain a public gallery fallback when the viewer cannot load", () => {
  const page = renderListingPage({ registry, listing, localeCode: "en" });
  page.body.media.tour = {
    available: true,
    mount_target: "psv-listing-tour",
    provider: "photo-sphere-viewer",
    panorama_url: "https://cdn.example.org/panorama.jpg",
    accessibility_caption: "A 360-degree view of the property.",
    fallback_gallery: [page.body.media.gallery[0]],
  };
  const html = renderReactPublicBody(page);

 assert.match(html, /id="listing-tour"/);
 assert.match(html, /data-photo-sphere-fallback="true"/);
 assert.match(html, /data-photo-sphere-fallback="true"[\s\S]*?data-listing-gallery-open="0"/);
 assert.match(html, /ld-tour__fallback/);
});

test("approved Supersplat tours link to the self-hosted viewer without loading the panorama viewer", () => {
  const page = renderListingPage({ registry, listing, localeCode: "en" });
  page.body.media.tour = {
    available: true,
    provider: "supersplat-viewer",
    viewer_url: "https://makler-realty.com/tours/MS-CRAWL-0001/index.html",
    accessibility_caption: "Reviewed 3D tour of the property.",
    fallback_gallery: [page.body.media.gallery[0]],
  };
  const html = renderReactPublicBody(page);

  assert.match(html, /data-tour-provider="supersplat-viewer"/);
  assert.match(html, /href="https:\/\/makler-realty\.com\/tours\/MS-CRAWL-0001\/index\.html" target="_blank" rel="noopener" data-supersplat-viewer-link="true"/);
  assert.match(html, /data-tour-gallery-fallback="true"/);
  assert.match(html, /data-tour-gallery-fallback="true"[\s\S]*?data-listing-gallery-open="0"/);
  assert.doesNotMatch(html, /data-photo-sphere-viewer=/);
  assert.doesNotMatch(html, /data-panorama-url=/);
});

test("approved broker contact data enables direct listing contact links", () => {
  const page = renderListingPage({
    registry,
    listing,
    localeCode: "he",
    brokerContact: createBrokerContact({
      listingId: listing.id,
      broker: "broker_ru",
      phone: "+447700900001",
      reviewer: "owner",
      sourceReference: "test://broker-contact/MS-CRAWL-0001",
      validationStatus: "broker_verified",
      approved: true,
    }),
  });

  assert.equal(page.body.actions.direct_contact.review_status, "approved_broker_contact");
  assert.equal(page.body.actions.direct_contact.broker, "broker_ru");
  assert.equal(page.body.actions.direct_contact.channels.find((channel) => channel.id === "phone").href, "tel:+447700900001");
  assert.equal(
    page.body.actions.direct_contact.channels.find((channel) => channel.id === "whatsapp").href,
    "https://wa.me/447700900001",
  );
  const html = renderReactPublicBody(page);
  assert.match(html, /ld-contact-options__direct/);
  assert.match(html, /href="tel:\+447700900001"/);
  assert.match(html, /href="https:\/\/wa\.me\/447700900001"/);
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
  assert.equal(search.mobile_policy.map_optional, true);
  assert.deepEqual(search.search.engines, ["postgres"]);
  assert.equal(search.search.filters.locale, "he");
  assert.equal(search.search.controls.save_search.endpoint, "/api/saved-searches");
  assert.equal(search.search.controls.save_search.payload.language, "he");
  assert.equal(search.search.controls.view_modes.find((mode) => mode.id === "list").default, true);
  assert.equal(search.search.controls.view_modes.some((mode) => mode.id === "map"), true);
  assert.deepEqual(
    search.search.controls.sort_options.map((option) => option.id),
    ["recommended", "price_asc", "price_desc"],
  );
  assert.ok(search.search.controls.filter_options.locations.includes("Sandanski"));
  assert.deepEqual(search.search.controls.filter_options.property_families, [...CANONICAL_PROPERTY_FAMILIES]);
  assert.deepEqual(search.search.controls.filter_options.property_types, [...CANONICAL_PROPERTY_FAMILIES]);
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

test("map view browses official areas while keeping listing results clickable", () => {
  const map = renderSearchPage({ registry, listings, localeCode: "en", view: "map" });
  const html = renderReactPublicBody(map);

  assert.equal(map.search.view, "map");
  assert.equal(map.search.controls.area_maps.flatMap((country) => country.areas).length, 41);
  assert.equal(map.search.controls.area_map_source.authority, "Eurostat GISCO");
  assert.match(html, /data-official-area-maps="true"/);
  assert.equal((html.match(/data-area-map-link=/g) || []).length, 41);
  assert.match(html, /data-area-map-link="BG:district:BLG"/);
  assert.match(html, /href="\/en\/search\?view=map&amp;country_code=BG&amp;region_id=BG%3Adistrict%3ABLG"/);
  assert.doesNotMatch(html, /data-listing-map-pin/);
  assert.match(html, /data-search-results="true"/);
  assert.match(html, /data-card-action="detail"/);
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
  assert.match(html, /aria-label="EN, Language: English"/);
  assert.doesNotMatch(html, /<h4>/);
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
  assert.match(html, /data-mobile-search-filters="true"/);
  assert.match(html, /aria-controls="mobile-search-filters-panel-en"/);
  assert.doesNotMatch(html, /data-mobile-filter-sheet=/);
  assert.doesNotMatch(html, /id="mobile-search-filters-panel-en"[^>]*(?:role="dialog"|aria-modal=)/);
  assert.match(html, /class="sr-mobile-filters__copy"><strong class="sr-mobile-filters__label">Search/);
  assert.match(html, /class="sr-mobile-filters__control" aria-hidden="true"/);
  assert.doesNotMatch(html, /data-mobile-filter-close=/);
  assert.match(html, /data-save-search-disclosure="sr-mobile"/);
  assert.match(html, /data-success-message="Search saved\. We will alert you when new properties match\."/);
  assert.match(html, /id="sr-mobile-filter-form"[^>]*data-search-filter-form="true"/);
  assert.match(html, /class="sr-mobile-filters__sheet-body"/);
  assert.doesNotMatch(html, /class="sr-mobile-filters__sheet-foot/);
  assert.doesNotMatch(html, /data-mobile-filter-preview-status=/);
  assert.match(html, /id="sr-mobile-filter-form"[\s\S]*?<button[^>]*class="mk-btn mk-btn--primary[^"]*"[^>]*type="submit"/);
  const mobileFilterForm = html.slice(html.indexOf('id="sr-mobile-filter-form"'), html.indexOf("</form>", html.indexOf('id="sr-mobile-filter-form"')));
  assert.match(mobileFilterForm, /name="country_code"/);
  assert.match(mobileFilterForm, /name="region_id"/);
  assert.match(mobileFilterForm, /data-geography-combobox="true"[^>]*data-geography-endpoint="\/api\/geography"/);
  assert.match(mobileFilterForm, /name="location" type="search"[^>]*role="combobox"/);
  assert.match(mobileFilterForm, /type="hidden" name="geography_id"/);
  assert.doesNotMatch(mobileFilterForm, /<datalist/);
  assert.doesNotMatch(mobileFilterForm, /name="municipality"|name="district"/);
  assert.match(html, /data-card-action="detail"/);
  assert.match(html, /data-card-action="inquiry"/);
  assert.match(html, /data-card-action="save"/);
  assert.match(html, /data-listing-id="MS-CRAWL-/);
  assert.doesNotMatch(html, /data-card-spec="reference"/);
  assert.doesNotMatch(html, /name="hotel_rooms_min"|name="premises_min"|name="storeys_min"|name="land_area_min"|name="property_subtype"/);
  assert.match(html, /data-card-thumbnail="true"[^>]*><img[^>]*loading="eager"/);
  const thumbnailLink = html.match(/<a[^>]*data-card-thumbnail="true"[^>]*>/)?.[0] || "";
  assert.match(thumbnailLink, /aria-label="[^"]+; \d+ photos?"/);
  assert.match(html, /data-card-thumbnail="true"[^>]*><img[^>]*fetchPriority="high"/);
  assert.match(html, /<img[^>]*loading="lazy"[^>]*decoding="async"/);
});

test("search exposes reviewed crawlable suggestions and localized recent-search containers", () => {
  const english = renderReactPublicBody(
    renderSearchPage({ registry, listings, localeCode: "en", filters: { location: "Sandanski" } }),
  );
  const hebrewPage = renderSearchPage({ registry, listings, localeCode: "he", filters: { property_family: "apartment" } });
  const hebrew = renderReactPublicBody(hebrewPage);

  assert.match(english, /data-guided-search-path="\/en\/search" data-guided-search-success="true"/);
  assert.match(
    english,
    /<a class="sr-guided__link" href="\/en\/search\?location=Sandanski" data-guided-search-suggestion="location" data-guided-search-value="Sandanski">Sandanski<\/a>/,
  );
  assert.match(
    english,
    /<a class="sr-guided__link" href="\/en\/search\?property_family=apartment" data-guided-search-suggestion="property_family" data-guided-search-value="apartment">Apartment<\/a>/,
  );
  assert.match(english, /data-recent-searches="true" aria-labelledby="sr-mobile-recent-searches-title" hidden/);
  assert.match(english, /data-recent-search-list="true"/);
  assert.match(english, /data-clear-recent-searches="true" aria-label="Clear">Clear<\/button>/);
  assert.doesNotMatch(english, /data-guided-search-suggestion="(?:location|property_family)"[^>]*href="[^"]*\?q=/);

  assert.equal(hebrewPage.dir, "rtl");
  assert.match(hebrew, /data-guided-search-path="\/he\/search" data-guided-search-success="true"/);
  assert.match(hebrew, /חיפושים אחרונים/);
  assert.match(hebrew, /href="\/he\/search\?property_family=apartment"/);
  assert.match(hebrew, /name="bedrooms_min"/);
  assert.doesNotMatch(hebrew, /name="hotel_rooms_min"|name="premises_min"/);
  assert.match(english, /data-guided-search-value="plot">Plot<\/a>/);
  assert.match(english, /data-guided-search-value="agricultural_land">Agricultural land<\/a>/);
  assert.match(english, /data-guided-search-value="hotel">Hotel<\/a>/);
});

test("canonical property families have human labels instead of raw taxonomy keys", () => {
  assert.equal(localizedListingValue("en", "property_type", "plot"), "Plot");
  assert.equal(localizedListingValue("en", "property_type", "agricultural_land"), "Agricultural land");
  assert.equal(localizedListingValue("bg", "property_type", "plot"), "Парцел");
  assert.equal(localizedListingValue("bg", "property_type", "agricultural_land"), "Земеделска земя");
  assert.equal(localizedListingValue("en", "property_type", "land"), "Land");
});

test("zero-result searches render a useful mobile recovery state", () => {
  const page = renderSearchPage({ registry, listings, localeCode: "ru", query: "no-such-listing-987654" });
  const html = renderReactPublicBody(page);

  assert.equal(page.search.total_matches, 0);
  assert.equal(page.cards.length, 0);
  assert.match(html, /data-search-empty="true"/);
  assert.match(html, /<h2>Результаты поиска<\/h2>/);
  assert.match(html, /class="sr-empty__value">0<\/strong>/);
  assert.match(html, /<p>совпадений<\/p>/);
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
  assert.ok(petrichLocation.cards.some((card) => card.location === "פטריץ׳"));
  assert.ok(petrichLocation.cards.every((card) => ["פטריץ׳", "Petrich Municipality"].includes(card.location)));
  assert.ok(apartments.search.total_matches > apartments.cards.length);
  assert.ok(apartments.cards.every((card) => card.property_type === "apartment"));
  assert.equal(apartments.search.filters.property_family, "apartment");
  assert.deepEqual(apartments.search.controls.active_filter_chips, [{ key: "property_family", value: "apartment", active: true }]);
});

test("official geography filters cover both countries and match reviewed Bulgarian hierarchy", () => {
  const base = renderSearchPage({ registry, listings, localeCode: "en" });
  const greece = renderSearchPage({ registry, listings, localeCode: "bg", filters: { country_code: "GR" }, pageSize: null });
  const sandanski = renderSearchPage({
    registry,
    listings,
    localeCode: "bg",
    filters: { geography_id: "BG:settlement:65334" },
    pageSize: null,
  });
  const blagoevgrad = renderSearchPage({
    registry,
    listings,
    localeCode: "bg",
    filters: { region_id: "BG:district:BLG" },
    pageSize: null,
  });
  const sourceById = new Map(listings.map((candidate) => [candidate.id, candidate]));

  assert.deepEqual(base.search.controls.filter_options.countries.map((country) => country.code), ["BG", "GR"]);
  assert.equal(base.search.controls.filter_options.regions.filter((area) => area.country_code === "BG").length, 28);
  assert.equal(base.search.controls.filter_options.regions.filter((area) => area.country_code === "GR").length, 13);
  assert.ok(greece.cards.length > 0);
  assert.ok(greece.cards.every((card) => sourceById.get(card.id)?.country_code === "GR"));
  assert.ok(sandanski.cards.length > 0);
  assert.ok(sandanski.cards.every((card) => sourceById.get(card.id)?.settlement_ekatte === "65334"));
  assert.ok(blagoevgrad.cards.length > sandanski.cards.length);
  assert.ok(blagoevgrad.cards.every((card) => sourceById.get(card.id)?.district_code === "BLG"));
});

test("municipality search exposes reviewed Bulgarian municipality scope at every known precision", () => {
  const sandanski = renderSearchPage({ registry, listings, localeCode: "ru", filters: { municipality: "Sandanski" }, pageSize: null });
  const html = renderReactPublicBody(sandanski);
  const sourceById = new Map(listings.map((candidate) => [candidate.id, candidate]));

  assert.ok(sandanski.search.controls.filter_options.municipalities.includes("Sandanski"));
  assert.ok(sandanski.search.controls.filter_options.municipalities.includes("Petrich"));
  assert.equal(sandanski.search.controls.filter_options.municipalities.includes("Thessaloniki"), false);
  assert.ok(sandanski.cards.length > 0);
  assert.ok(
    sandanski.cards.every((card) => {
      const source = sourceById.get(card.id);
      return source?.country_code === "BG" && source?.geography_id && source?.municipality === "Sandanski";
    }),
  );
  assert.equal(sandanski.cards.some((card) => card.id === "MS-CRAWL-0021"), false);
  assert.deepEqual(sandanski.search.controls.active_filter_chips, [{ key: "municipality", value: "Sandanski", active: true }]);
  assert.match(html, /data-geography-combobox="true"[^>]*data-geography-endpoint="\/api\/geography"/);
  assert.match(html, /name="region_id"/);
  assert.doesNotMatch(html, /name="municipality"/);
});

test("district search exposes official Bulgarian administrative areas without inventing neighbourhoods", () => {
  const blagoevgrad = renderSearchPage({ registry, listings, localeCode: "ru", filters: { district: "Blagoevgrad" }, pageSize: null });
  const html = renderReactPublicBody(blagoevgrad);
  const sourceById = new Map(listings.map((candidate) => [candidate.id, candidate]));

  assert.equal(blagoevgrad.search.controls.filter_options.districts.length, 28);
  assert.ok(blagoevgrad.search.controls.filter_options.districts.includes("Blagoevgrad"));
  assert.ok(blagoevgrad.search.controls.filter_options.districts.includes("Burgas"));
  assert.ok(blagoevgrad.cards.length > 0);
  assert.ok(
    blagoevgrad.cards.every((card) => {
      const source = sourceById.get(card.id);
      return source?.country_code === "BG" && source?.district === "Blagoevgrad";
    }),
  );
  assert.equal(blagoevgrad.cards.some((card) => card.id === "MS-CRAWL-0072"), false);
  assert.deepEqual(blagoevgrad.search.controls.active_filter_chips, [{ key: "district", value: "Blagoevgrad", active: true }]);
  assert.match(html, /<option value="BG:district:BLG" data-country="BG">Blagoevgrad<\/option>/);
  assert.doesNotMatch(html, /name="district"/);
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
  const englishFirstHtml = renderReactPublicBody(renderSearchPage({ registry, listings: withAreas, localeCode: "en", page: 1 }));
  const englishSecondHtml = renderReactPublicBody(renderSearchPage({ registry, listings: withAreas, localeCode: "en", page: 2 }));

  assert.equal(second.search.pagination.page, 2);
  assert.equal(second.search.pagination.has_previous, true);
  assert.equal(first.cards.some((card) => second.cards.some((candidate) => candidate.id === card.id)), false);
  assert.ok(area.cards.length > 0);
  assert.ok(area.cards.every((card) => card.area_sqm >= 100 && card.area_sqm <= 120));
  assert.deepEqual(
    area.search.controls.active_filter_chips.map((chip) => chip.key),
    ["area_min", "area_max"],
  );
  assert.match(englishFirstHtml, /rel="next" aria-label="Next · Page 2" title="Next"/);
  assert.match(englishSecondHtml, /rel="prev" aria-label="Previous · Page 1" title="Previous"/);
});

test("property-card photo counts use reviewed singular and plural labels", () => {
  const onePhotoListing = findListingById(listings, "MS-CRAWL-0006");
  const englishHtml = renderReactPublicBody(renderSearchPage({ registry, listings: [onePhotoListing], localeCode: "en" }));
  const bulgarianHtml = renderReactPublicBody(renderSearchPage({ registry, listings: [onePhotoListing], localeCode: "bg" }));

  assert.match(englishHtml, /> 1 photo<\/span>/);
  assert.doesNotMatch(englishHtml, /> 1 photos<\/span>/);
  assert.match(bulgarianHtml, /> 1 снимка<\/span>/);
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
  assert.deepEqual(
    he.body.search.controls.filter_options,
    renderSearchPage({ registry, listings, localeCode: "he" }).search.controls.filter_options,
  );
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

test("home page explains an empty reviewed catalog without inventing featured cards", () => {
  const page = renderHomePage({ registry, listings: [], localeCode: "bg" });
  const html = renderReactPublicBody(page);

  assert.equal(page.cards.length, 0);
  assert.match(html, /data-featured-empty="true"/);
  assert.match(html, /class="mk-empty__value">0</);
  assert.match(html, /class="mk-empty__text">проверени обяви</);
});

test("English home makes every approved buyer guide discoverable without expanding the mobile task dock", () => {
  const en = renderHomePage({ registry, listings, localeCode: "en" });
  const bg = renderHomePage({ registry, listings, localeCode: "bg" });
  const html = renderReactPublicBody(en);

  assert.equal(en.body.guides.label, "Buyer guides");
  assert.equal(bg.body.guides.label, "Ръководства за купувачи");
  assert.deepEqual(
    en.body.guides.links.map((guide) => guide.href).sort(),
    ["/en/guides/buying-process", "/en/guides/foreign-buyers"],
  );
  assert.ok(en.body.guides.links.every((guide) => guide.reviewer === "editor_bg"));
  assert.match(html, /data-home-guides="true" data-approved-source="cms"/);
  assert.match(html, /href="\/en\/guides\/buying-process"/);
  assert.match(html, /href="\/en\/guides\/foreign-buyers"/);
  assert.match(html, /Foreign buyers and Bulgarian land ownership/);
  assert.equal(en.body.locations.some((location) => location.path === "/en/locations/sandanski"), true);
  assert.equal((html.match(/data-mobile-task="/g) || []).length, 5);
});

test("location page keeps reviewed inventory indexable and serves source fallback without a soft 404", () => {
  const he = renderLocationPage({ registry, listings, localeCode: "he", location: "Sandanski" });
  const fallback = renderLocationPage({ registry, listings, localeCode: "he", location: "Petrich" });
  const englishFallback = renderLocationPage({ registry, listings, localeCode: "en", location: "Sandanski" });
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
  assert.equal(fallback.status, 200);
  assert.equal(fallback.indexable, false);
  assert.equal(fallback.cards.length > 0, true);
  assert.equal(fallback.cards.every((card) => card.translation_indexable === false), true);
  assert.equal(fallback.metadata.robots, "noindex,follow");
  assert.equal(englishFallback.status, 200);
  assert.equal(englishFallback.indexable, false);
  assert.equal(englishFallback.cards.length > 0, true);
  assert.equal(englishFallback.metadata.robots, "noindex,follow");
});

test("reviewed settlement search is exact and curated location pages exclude held or foreign inventory", () => {
  const polenitsa = findListingById(listings, "MS-CRAWL-0033");
  const greek = findListingById(listings, "MS-CRAWL-0072");
  const held = findListingById(listings, "MS-CRAWL-0143");
  const search = renderSearchPage({ registry, listings, localeCode: "bg", filters: { location: "Поленица" }, pageSize: null });
  const sandanski = renderLocationPage({ registry, listings: [polenitsa, greek, held], localeCode: "bg", location: "Sandanski" });

  assert.ok(search.cards.some((card) => card.id === "MS-CRAWL-0033"));
  assert.ok(search.cards.every((card) => card.location === "Поленица"));
  assert.equal(sandanski.status, 200);
  assert.equal(sandanski.body.listing_count, 1);
  assert.deepEqual(sandanski.cards.map((card) => card.id), ["MS-CRAWL-0033"]);
});

test("Bulgarian locations expose only their approved source-bound context", () => {
  const bg = renderLocationPage({ registry, listings, localeCode: "bg", location: "Sandanski" });
  const ru = renderLocationPage({ registry, listings, localeCode: "ru", location: "Sandanski" });
  const hotovo = renderLocationPage({ registry, listings, localeCode: "bg", location: "Hotovo" });
  const petrich = renderLocationPage({ registry, listings, localeCode: "bg", location: "Petrich" });
  const html = renderReactPublicBody(bg);

  assert.deepEqual(bg.body.context, {
    href: "/bg/guides/proverka-na-imot-sandanski",
    title: "Сандански: официални източници при проверка на имот",
    summary: "Порталът KAIS предоставя справки по кадастралната карта и регистрите и заявления за кадастрални услуги.",
  });
  assert.equal(
    bg.metadata.description,
    "Проверени обяви на MS Realty в Сандански и официални източници за кадастър, Имотен регистър и удостоверения.",
  );
  assert.equal("context" in ru.body, false);
  assert.deepEqual(hotovo.body.context, {
    href: "/bg/guides/hotovo-obstinski-kontekst",
    title: "Хотово: официален контекст за населеното място",
    summary: "Община Сандански посочва, че с. Хотово е разположено в западното подножие на Среден Пирин.",
  });
  assert.equal(
    hotovo.metadata.description,
    "Проверени обяви на MS Realty в Хотово. Община Сандански посочва, че селото е в западното подножие на Среден Пирин.",
  );
  assert.deepEqual(petrich.body.context, {
    href: "/bg/guides/petrich-obstinski-kontekst",
    title: "Петрич: официален контекст за общината",
    summary: "Община Петрич посочва, че територията ѝ е в южната част на Санданско-Петричката котловина и обхваща части от Беласица, Огражден и южните склонове на Пирин.",
  });
  assert.equal(
    petrich.metadata.description,
    "Проверени обяви на MS Realty в Петрич. Община Петрич посочва, че територията ѝ е в южната част на Санданско-Петричката котловина.",
  );
  assert.match(html, /data-location-context="true"/);
  assert.match(html, /href="\/bg\/guides\/proverka-na-imot-sandanski"/);
  assert.doesNotMatch(renderReactPublicBody(ru), /data-location-context="true"/);
});

test("seller valuation page is locale-prefixed and posts seller leads", () => {
  const he = renderSellerPage({ registry, localeCode: "he" });
  const fr = renderSellerPage({ registry, localeCode: "fr" });
  const html = renderReactPublicBody(he);

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
  assert.match(html, /data-seller-intake="true" data-seller-step="1"/);
  assert.match(html, /data-seller-step-indicator="1" aria-current="step"/);
  assert.match(html, /data-seller-step="2" role="group"/);
  assert.match(html, /data-seller-step="3" role="group"/);
  assert.match(html, /data-seller-next="true"/);
  assert.match(html, /data-seller-back="true"/);
  assert.match(html, /data-seller-review="true"/);
  assert.match(html, /data-seller-summary="property.location"/);
  assert.match(html, /data-no-public-avm="true"/);
  assert.match(html, /data-broker-review-required="true"/);
  assert.doesNotMatch(html, /data-mobile-task-navigation="true"/);
});

// The seller valuation request is the primary seller-lead engine, so it must
// never render a form that the edge will reject. The contact page already
// degrades to a phone CTA when lead writes are disabled; this asserts the
// seller page does the same instead of showing a form that always errors.
test("seller valuation page degrades to a phone CTA when lead writes are disabled", () => {
  const disabled = renderSellerPage({ registry, localeCode: "bg", leadWritesDisabled: true });
  const enabled = renderSellerPage({ registry, localeCode: "bg", leadWritesDisabled: false });
  const disabledHtml = renderReactPublicBody(disabled);
  const enabledHtml = renderReactPublicBody(enabled);

  // The page still answers 200 and stays indexable — only the form is withheld.
  assert.equal(disabled.status, 200);
  assert.equal(disabled.indexable, true);
  assert.equal(disabled.chrome.lead_writes_disabled, true);
  assert.equal(disabled.body.valuation, null);
  assert.equal(disabled.body.callback, null);
  assert.equal(
    disabled.body.form_unavailable,
    "Формата е временно недостъпна. Обадете се или ни пишете. Отговаряме бързо.",
  );
  assert.equal(disabled.body.contact_channels.phone.href, "tel:+359879696870");

  // No submittable seller intake may reach the visitor in this state.
  assert.doesNotMatch(disabledHtml, /data-seller-intake="true"/);
  assert.doesNotMatch(disabledHtml, /action="\/api\/leads"/);
  assert.match(disabledHtml, /data-form-unavailable="true"/);
  assert.match(disabledHtml, /href="tel:\+359879696870"/);

  // And the working path is unchanged when the durable store is available.
  assert.equal(enabled.body.form_unavailable, null);
  assert.equal(enabled.body.valuation.endpoint, "/api/leads");
  assert.match(enabledHtml, /data-seller-intake="true"/);
  assert.doesNotMatch(enabledHtml, /data-form-unavailable="true"/);
});

test("contact callback page is locale-prefixed and posts generic CRM leads", () => {
  const he = renderContactPage({ registry, localeCode: "he" });
  const el = renderContactPage({ registry, localeCode: "el" });
  const bg = renderContactPage({ registry, localeCode: "bg" });
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
  assert.equal(
    bg.body.intro,
    "Изпратете запитване или заявка за обратно обаждане към екипа на MS Realty. За обратно обаждане посочете име, телефон и предпочитано време.",
  );
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

test("source-bound Bulgarian guide renders official citations without a machine translation", () => {
  const path = "/bg/guides/proverka-na-imot-sandanski";
  const guide = renderGuidePage({
    registry,
    localeCode: "bg",
    path,
    documents: approvedContentDocumentsForPath(readApprovedCmsContent(), path),
  });
  const html = renderReactPublicBody(guide);

  assert.equal(guide.status, 200);
  assert.equal(guide.indexable, true);
  assert.equal(guide.body.sections[0].sources.length, 3);
  assert.equal(
    guide.metadata.description,
    "Порталът KAIS предоставя справки по кадастралната карта и регистрите и заявления за кадастрални услуги.",
  );
  assert.match(html, /data-guide-sources="true"/);
  assert.match(html, /https:\/\/kais\.cadastre\.bg\//);
  assert.match(html, /Официални източници/);
  assert.equal(
    renderGuidePage({
      registry,
      localeCode: "en",
      path: "/en/guides/proverka-na-imot-sandanski",
      documents: approvedContentDocumentsForPath(readApprovedCmsContent(), "/en/guides/proverka-na-imot-sandanski"),
    }).status,
    404,
  );
});

test("buying-process guide retains its Registry Agency citation", () => {
  const path = "/en/guides/buying-process";
  const guide = renderGuidePage({
    registry,
    localeCode: "en",
    path,
    documents: approvedContentDocumentsForPath(readApprovedCmsContent(), path),
  });
  const html = renderReactPublicBody(guide);

  assert.equal(guide.status, 200);
  assert.equal(guide.body.sections[0].sources.length, 1);
  assert.match(html, /data-guide-sources="true"/);
  assert.match(html, /https:\/\/portal\.registryagency\.bg\/en\/home-pr/);
  assert.match(html, /Official sources/);
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
