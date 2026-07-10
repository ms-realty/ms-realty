import test from "node:test";
import assert from "node:assert/strict";
import { approvedContentDocumentsForPath, readApprovedCmsContent } from "../lib/approved-content.mjs";
import { createBrokerContact } from "../lib/broker-contacts.mjs";
import { findListingById, loadListings } from "../lib/content.mjs";
import { loadLocaleRegistry } from "../lib/locales.mjs";
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
  assert.equal(search.mobile_policy.map_optional, true);
  assert.deepEqual(search.search.engines, ["typesense", "meilisearch"]);
  assert.equal(search.search.filters.locale, "he");
  assert.equal(search.search.controls.save_search.endpoint, "/api/saved-searches");
  assert.equal(search.search.controls.save_search.payload.language, "he");
  assert.equal(search.search.controls.view_modes.find((mode) => mode.id === "list").default, true);
  assert.equal(search.search.controls.view_modes.find((mode) => mode.id === "map").optional, true);
  assert.ok(search.search.total_matches > search.cards.length);
  assert.equal(search.search.returned, search.cards.length);
  assert.ok(search.cards.length > 0);
  assert.ok(search.cards.every((card) => card.path.startsWith("/he/properties/")));
  assert.equal(search.cards.every((card) => card.actions.inquiry.endpoint === "/api/leads"), true);
  assert.equal(search.cards.every((card) => card.actions.save.storage_key === "ms-realty:saved-listings"), true);
  assert.equal(search.cards.every((card) => card.thumbnail?.url.includes("/wp-content/uploads/")), true);
  assert.equal(search.cards.every((card) => card.thumbnail?.alt), true);
  assert.equal(search.cards.find((card) => card.id === "MS-CRAWL-0001").translation_display, "reviewed_translation");
  assert.equal(search.cards.find((card) => card.id === "MS-CRAWL-0001").review_badge, "verified_inventory");
  assert.ok(search.cards.some((card) => card.translation_display === "fallback_source_locale"));
});

test("search applies text and facet filters before paginating cards", () => {
  const petrich = renderSearchPage({ registry, listings, localeCode: "he", query: "Petrich" });
  const apartments = renderSearchPage({
    registry,
    listings,
    localeCode: "he",
    query: "Sandanski",
    filters: { property_type: "apartment" },
  });

  assert.ok(petrich.search.total_matches > 0);
  assert.ok(petrich.cards.every((card) => card.location === "Petrich"));
  assert.ok(apartments.search.total_matches > apartments.cards.length);
  assert.ok(apartments.cards.every((card) => card.property_type === "apartment"));
  assert.equal(apartments.search.filters.property_type, "apartment");
  assert.deepEqual(apartments.search.controls.active_filter_chips, [{ key: "property_type", value: "apartment", active: true }]);
});

test("home page exposes search, seller, location, and featured listing paths", () => {
  const he = renderHomePage({ registry, listings, localeCode: "he" });

  assert.equal(he.status, 200);
  assert.equal(he.path, "/he/");
  assert.equal(he.dir, "rtl");
  assert.equal(he.indexable, true);
  assert.equal(he.body.search.path, "/he/search");
  assert.equal(he.body.seller.path, "/he/sell");
  assert.equal(he.body.contact.path, "/he/contact");
  assert.equal(he.body.locations.some((location) => location.path === "/he/locations/sandanski"), true);
  assert.ok(he.cards.length > 0);
  assert.equal(he.cards.every((card) => card.thumbnail?.url.includes("/wp-content/uploads/")), true);
  assert.equal(he.hreflang.some((link) => link.hreflang === "he"), true);
});

test("location page exposes only indexable locale inventory", () => {
  const he = renderLocationPage({ registry, listings, localeCode: "he", location: "Sandanski" });
  const missing = renderLocationPage({ registry, listings, localeCode: "he", location: "Petrich" });

  assert.equal(he.status, 200);
  assert.equal(he.path, "/he/locations/sandanski");
  assert.equal(he.dir, "rtl");
  assert.equal(he.indexable, true);
  assert.equal(he.cards.length, 1);
  assert.equal(he.cards[0].id, "MS-CRAWL-0001");
  assert.equal(he.cards[0].translation_indexable, true);
  assert.match(he.cards[0].thumbnail.url, /\/wp-content\/uploads\//);
  assert.equal(he.hreflang.some((link) => link.hreflang === "he"), true);
  assert.equal(missing.status, 404);
  assert.equal(missing.indexable, false);
  assert.equal(missing.metadata.robots, "noindex,follow");
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
  assert.equal(he.body.callback.payload.leadType, "general");
  assert.equal(he.body.callback.payload.contact_preference, "phone");
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
  assert.match(guide.body.sections[0].facts.join(" "), /Non-EU buyers cannot own Bulgarian land directly/);
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
