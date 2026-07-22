import test from "node:test";
import assert from "node:assert/strict";
import { renderAdminLeadsPayload } from "../lib/admin-payloads.mjs";
import { createBrokerContact } from "../lib/broker-contacts.mjs";
import { findListingById, loadListings } from "../lib/content.mjs";
import { assertHtmlPage, renderHtmlPage } from "../lib/html.mjs";
import { loadLocaleRegistry } from "../lib/locales.mjs";
import { loadCmsSeed, renderRuntimePath } from "../lib/runtime.mjs";
import { ADMIN_APP_JS } from "../lib/ui/client.mjs";
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

test("HTML renderer honors reviewed Open Graph listing fields", () => {
  const page = renderListingPage({ registry, listing, localeCode: "bg" });
  const html = renderHtmlPage({
    ...page,
    metadata: {
      ...page.metadata,
      og_title: "Reviewed social title",
      og_description: "Reviewed social description.",
    },
  });

  assert.match(html, /property="og:title" content="Reviewed social title"/);
  assert.match(html, /property="og:description" content="Reviewed social description\."/);
});

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
  const filteredSearchHtml = renderHtmlPage(
    renderSearchPage({ registry, listings, localeCode: "he", query: "Sandanski", filters: { offer_type: "sale", price_min: "50000" } }),
  );
  const locationHtml = renderHtmlPage(renderLocationPage({ registry, listings, localeCode: "he", location: "Sandanski" }));
  const sellerHtml = renderHtmlPage(renderSellerPage({ registry, localeCode: "he" }));
  const contactHtml = renderHtmlPage(renderContactPage({ registry, localeCode: "he" }));
  const guideHtml = renderHtmlPage(renderRuntimePath(registry, seed, "/en/guides/foreign-buyers"));
  const fallbackHtml = renderHtmlPage(renderLanguageFallback({ registry, requestedLocale: "fr" }));

  assert.equal(assertHtmlPage(homeHtml, { lang: "he", dir: "rtl", kind: "home" }), true);
  assert.match(homeHtml, /content="width=device-width, initial-scale=1, viewport-fit=cover"/);
  assert.match(homeHtml, /data-ms-realty-design-system="external"/);
  assert.match(homeHtml, /href="\/vendor\/ms-realty\.css\?v=[a-f0-9]{12}"/);
  assert.match(homeHtml, /role="search"/);
  assert.match(homeHtml, /data-action="seller"/);
  assert.match(homeHtml, /data-hero-media="approved"/);
  assert.match(homeHtml, /data-location-media="approved"/);
  assert.match(homeHtml, /aria-label="נכסים מובילים"/);
  assert.match(homeHtml, /data-card-thumbnail="true"/);
  assert.equal(assertHtmlPage(listingHtml, { lang: "he", dir: "rtl", kind: "listing" }), true);
  assert.match(listingHtml, /application\/ld\+json/);
  assert.match(listingHtml, /property="og:type" content="article"/);
  assert.match(listingHtml, /data-listing-summary="true"/);
  assert.match(listingHtml, /data-listing-tools="true"/);
  assert.match(listingHtml, /data-listing-content-grid="true"/);
  assert.match(listingHtml, /data-listing-contact-panel="true"/);
  assert.match(listingHtml, /data-listing-facts="true"/);
  assert.match(listingHtml, /data-listing-price="true"/);
  assert.match(listingHtml, /data-photo-carousel="true"/);
  assert.doesNotMatch(listingHtml, /data-photo-sphere-viewer="review_required"|needs_panorama_upload|review required/);
  assert.match(listingHtml, /data-listing-action="back_to_results"/);
  assert.match(listingHtml, /href="\/he\/search"/);
  assert.match(listingHtml, /data-listing-action="print"/);
  assert.match(listingHtml, /data-client-save-listing="MS-CRAWL-0001"/);
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
  assert.match(searchHtml, /data-map-optional="false"/);
  assert.match(searchHtml, /שמירת חיפוש/);
  assert.match(contactHtml, /פעולות קשר/);
  assert.match(searchHtml, /data-save-search-endpoint="\/api\/saved-searches"/);
  assert.match(searchHtml, /name="locale" value="he"/);
  assert.match(searchHtml, /name="filters" value="{}"/);
  assert.match(searchHtml, /name="contact\.name" required/);
  assert.match(searchHtml, /name="contact_preference"/);
  assert.match(searchHtml, /name="contact\.email" type="email" required/);
  assert.match(searchHtml, /name="alertFrequency"/);
  assert.match(searchHtml, /name="alertConsent" value="true" required/);
  assert.match(searchHtml, /name="offer_type"/);
  assert.match(searchHtml, /name="price_min"/);
  assert.match(searchHtml, /name="bedrooms_min"/);
  assert.match(searchHtml, /name="area_min"/);
  assert.match(searchHtml, /name="area_max"/);
  assert.match(searchHtml, /id="sr-location-options"/);
  assert.match(searchHtml, /id="sr-mobile-location-options"/);
  assert.match(searchHtml, /data-mobile-search-filters="true"/);
  assert.doesNotMatch(searchHtml, /data-hermes-(assistant|mode|chat-form|chat-output)|\/api\/hermes\/chat/);
  assert.match(searchHtml, /defer src="\/vendor\/ms-realty-public\.js\?v=[a-f0-9]{12}"/);
  assert.match(searchHtml, /data-ms-realty-public-client/);
  assert.match(searchHtml, /data-share-copied="הקישור הועתק\."/);
  assert.match(searchHtml, /data-request-failed="לא ניתן היה לשלוח את הפנייה\. נסו שוב\."/);
  assert.doesNotMatch(searchHtml, /window\.MS_REALTY_I18N/);
  assert.match(filteredSearchHtml, /data-filter-chip="offer_type"/);
  assert.match(filteredSearchHtml, /href="\/he\/search\?q=Sandanski&amp;price_min=50000"/);

  const pagedSearchHtml = renderHtmlPage(
    renderSearchPage({ registry, listings, localeCode: "he", query: "Sandanski", page: 2 }),
  );
  assert.match(pagedSearchHtml, /data-search-pagination="true"/);
  assert.match(pagedSearchHtml, /page=3/);
  assert.match(filteredSearchHtml, /href="\/he\/search\?q=Sandanski"/);
  assert.match(searchHtml, /data-search-card="true"/);
  assert.match(searchHtml, /data-card-thumbnail="true"/);
  assert.match(searchHtml, /<img src="https:\/\/makler-realty\./);
  assert.doesNotMatch(searchHtml, /data-view-mode=/);
  assert.doesNotMatch(searchHtml, /verified inventory/);
  assert.match(searchHtml, /data-client-save-listing="MS-CRAWL-/);
  assert.match(searchHtml, /data-endpoint="\/api\/leads"/);
  assert.equal(assertHtmlPage(locationHtml, { lang: "he", dir: "rtl", kind: "location" }), true);
  assert.match(locationHtml, /<h1>נכסים ב-סנדנסקי<\/h1>/);
  assert.match(locationHtml, /data-location="Sandanski"/);
  assert.match(locationHtml, /data-location-listings="true"/);
  assert.match(locationHtml, /data-card-thumbnail="true"/);
  assert.equal(assertHtmlPage(sellerHtml, { lang: "he", dir: "rtl", kind: "seller" }), true);
  assert.match(sellerHtml, /data-lead-type="seller"/);
  assert.match(sellerHtml, /data-no-public-avm="true"/);
  assert.match(sellerHtml, /data-broker-review-required="true"/);
  assert.match(sellerHtml, /data-seller-valuation-flow="broker_callback"/);
  assert.match(sellerHtml, /name="contact.phone"/);
  assert.match(sellerHtml, /name="contact_preference"/);
  assert.match(sellerHtml, /data-seller-property-fields="true"/);
  assert.match(sellerHtml, /name="property.area"/);
  assert.match(sellerHtml, /name="property.bedrooms"/);
  assert.match(sellerHtml, /name="property.type"/);
  assert.match(sellerHtml, /טלפון/);
  assert.equal(assertHtmlPage(contactHtml, { lang: "he", dir: "rtl", kind: "contact" }), true);
  assert.match(contactHtml, /data-lead-type="general"/);
  assert.match(contactHtml, /website_contact_callback/);
  assert.match(contactHtml, /name="contact.phone" type="tel" required/);
  assert.match(contactHtml, /name="request_details.callback_time"/);
  assert.match(listingHtml, /data-enquiry-callback-time-group="true"/);
  assert.match(listingHtml, /name="request_details.viewing_date" type="date"/);
  assert.match(listingHtml, /name="request_details.viewing_time" type="time"/);
  assert.equal(assertHtmlPage(guideHtml, { lang: "en", dir: "ltr", kind: "guide" }), true);
  assert.match(guideHtml, /data-approved-source="cms"/);
  assert.match(guideHtml, /Non-EU buyers cannot own Bulgarian land directly/);
  assert.equal(assertHtmlPage(fallbackHtml, { lang: "en", dir: "ltr", kind: "language-fallback" }), true);
  assert.match(fallbackHtml, /noindex,follow/);
  assert.match(fallbackHtml, /action="\/api\/language-requests"/);
  assert.match(fallbackHtml, /name="requestedLocale" value="fr"/);
  assert.match(fallbackHtml, /name="requestedPath" value="\/fr\/"/);
});

test("admin lead values are localized without exposing raw workflow codes", () => {
  const page = renderAdminLeadsPayload(registry, "ru", {
    leads: [
      {
        lead_id: "lead-ru-1",
        lead_type: "buyer",
        source: "website_listing_detail",
        original_language: "he",
        admin_locale: "ru",
        contact_preference: "whatsapp",
        property: { location: "Sandanski", type: "apartment" },
        broker_assignment: { broker_id: "broker_international" },
        duplicate_status: "possible_duplicate",
        possible_duplicate_of: "lead-earlier",
      },
    ],
    replies: [],
    languageRequests: [],
    viewings: [],
    savedSearches: [],
    sellerPipeline: [],
    deals: [],
    leadSla: {
      rows: [{ lead_id: "lead-ru-1", status: "manager_escalation_required" }],
      summary: { manager_escalation_required: 1, reminder_required: 0 },
    },
  });
  const html = renderHtmlPage(page);

  assert.match(html, /Запрос со страницы объекта/);
  assert.match(html, /WhatsApp/);
  assert.match(html, /Нужна эскалация менеджеру/);
  assert.match(html, /data-lead-context="true">Sandanski/);
  assert.match(html, /data-possible-duplicate-of="lead-earlier"/);
  assert.match(html, /Возможный дубликат контакта/);
  assert.match(html, /data-lead-assignment-control="lead-ru-1"/);
  assert.match(html, /action="\/api\/admin\/leads\/assign"/);
  assert.match(html, /data-viewing-follow-up-queue="true"/);
  assert.match(html, /data-empty-viewing-follow-ups="true"/);
  assert.match(html, /data-seller-pipeline-queue="true"/);
  assert.match(html, /data-empty-seller-pipeline="true"/);
  assert.match(ADMIN_APP_JS, /data-viewing-follow-up-form/);
  assert.match(ADMIN_APP_JS, /data-seller-pipeline-outcome-form/);
  assert.match(ADMIN_APP_JS, /window\.location\.reload/);
  assert.doesNotMatch(html, />website_listing_detail</);
  assert.doesNotMatch(html, />manager escalation required</);
});

test("admin seller valuation queue renders native broker outcome controls", () => {
  const page = renderAdminLeadsPayload(registry, "en", {
    leads: [],
    replies: [],
    languageRequests: [],
    viewings: [],
    savedSearches: [],
    sellerPipeline: [{ id: "seller-pipeline-lead-1" }],
    sellerPipelineQueue: {
      rows: [
        {
          seller_pipeline_id: "seller-pipeline-lead-1",
          lead_id: "lead-1",
          property: { location: "Sandanski" },
          owner: "broker_bg",
          stage: "callback_completed",
          task: "appraisal",
          task_status: "open",
          due_at: null,
          appraisal_at: null,
          overdue: false,
        },
      ],
      summary: { total: 1, open: 1, overdue: 0, completed: 0, closed_lost: 0 },
    },
    deals: [],
    leadSla: { rows: [], summary: { manager_escalation_required: 0, reminder_required: 0 } },
  });
  const html = renderHtmlPage(page);

  assert.match(html, /data-seller-pipeline-row="true"/);
  assert.match(html, /action="\/api\/admin\/seller-pipeline\/outcome"/);
  assert.match(html, /name="appraisalAt" type="datetime-local" required/);
  assert.match(html, /name="action" value="appraisal_scheduled"/);
  assert.match(html, /name="action" value="closed_lost"/);
});

test("admin seller controls continue from listing publication through offer and sale", () => {
  const tasks = [
    { id: "publish", stage: "listing_draft_started", task: "listing_publish", listing_reference: "MS-SELLER-1" },
    { id: "offer", stage: "published", task: "listing_offer", listing_reference: "MS-SELLER-2", public_path: "/bg/properties/MS-SELLER-2" },
    { id: "close", stage: "offer_received", task: "seller_close", listing_reference: "MS-SELLER-3", offer_amount_eur: 120000 },
  ].map((row) => ({
    seller_pipeline_id: `seller-pipeline-${row.id}`,
    lead_id: `lead-${row.id}`,
    property: { location: "Sandanski" },
    owner: "broker_bg",
    task_status: "open",
    due_at: null,
    overdue: false,
    ...row,
  }));
  const page = renderAdminLeadsPayload(registry, "en", {
    leads: [],
    replies: [],
    languageRequests: [],
    viewings: [],
    savedSearches: [],
    sellerPipeline: tasks.map((row) => ({ id: row.seller_pipeline_id })),
    sellerPipelineQueue: {
      rows: tasks,
      summary: { total: 3, open: 3, overdue: 0, completed: 0, closed_lost: 0 },
    },
    deals: [],
    leadSla: { rows: [], summary: { manager_escalation_required: 0, reminder_required: 0 } },
  });
  const html = renderHtmlPage(page);

  assert.match(html, /name="action" value="listing_published"/);
  assert.match(html, /name="publicPath" required/);
  assert.match(html, /name="action" value="offer_received"/);
  assert.match(html, /name="offerAmountEur" type="number" min="1" step="1" required/);
  assert.match(html, /name="action" value="sale_completed"/);
  assert.match(html, /name="salePriceEur" type="number" min="1" step="1" required/);
  assert.match(html, /name="commissionEur" type="number" min="0" step="1"/);
});
