import fs from "node:fs";
import path from "node:path";
import { findListingById, loadListings } from "./content.mjs";
import { assertHtmlPage, renderHtmlPage } from "./html.mjs";
import { loadLocaleRegistry, websiteLanguageCoverage } from "./locales.mjs";
import { fromRoot } from "./paths.mjs";
import { renderReactPublicBody } from "./react-public-site.mjs";
import { createTourField } from "./tours.mjs";
import {
  renderContactPage,
  renderHomePage,
  renderLanguageFallback,
  renderListingPage,
  renderSearchPage,
  renderSellerPage,
} from "./public-site.mjs";
import { DESIGN_CSS } from "./ui/design-assets.mjs";

export const DEFAULT_MOBILE_ELDERLY_QA_OUTPUT = fromRoot("production", "data", "mobile-elderly-qa-report.json");

function check(id, passed, evidence = {}) {
  return { id, status: passed ? "pass" : "fail", evidence };
}

function includes(html, marker) {
  return html.includes(marker);
}

function renderReactPage(page) {
  const bodyHtml = renderReactPublicBody(page);
  if (!bodyHtml) throw new Error(`Missing React public body for ${page.kind}`);
  return renderHtmlPage(page, { bodyHtml });
}

export function buildMobileElderlyQaReport({
  generatedAt = new Date().toISOString(),
  registry = loadLocaleRegistry(),
  listings = loadListings(),
} = {}) {
  const listing = findListingById(listings, "MS-CRAWL-0001");
  const tourListing = {
    ...listing,
    tour: createTourField({
      listingId: listing.id,
      panoramaUrl: "https://media.example.test/ms-realty/mobile-qa-tour.jpg",
      accessibilityCaption: "Reviewed 360 panorama with a gallery fallback.",
      isPublic: true,
      media: [
        {
          url: "https://makler-realty.com/wp-content/uploads/2025/04/mobile-qa-fallback-1024x768.jpg",
          alt: "Reviewed gallery fallback.",
        },
      ],
    }),
  };
  const pages = {
    home: renderReactPage(renderHomePage({ registry, listings, localeCode: "he" })),
    listing: renderReactPage(renderListingPage({ registry, listing, localeCode: "he" })),
    search: renderReactPage(renderSearchPage({ registry, listings, localeCode: "he", query: "Sandanski" })),
    seller: renderReactPage(renderSellerPage({ registry, localeCode: "he" })),
    contact: renderReactPage(renderContactPage({ registry, localeCode: "he" })),
    fallback: renderReactPage(renderLanguageFallback({ registry, requestedLocale: "fr" })),
  };
  const rentSearch = renderReactPage(
    renderSearchPage({ registry, listings, localeCode: "he", filters: { offer_type: "rent" } }),
  );
  const approvedTourHtml = renderReactPage(renderListingPage({ registry, listing: tourListing, localeCode: "he" }));
  const publicAdapterCss = fs.readFileSync(fromRoot("production", "lib", "ui", "adapter-public.css"), "utf8");

  for (const [kind, html] of Object.entries(pages)) {
    assertHtmlPage(html, {
      lang: kind === "fallback" ? "en" : "he",
      dir: kind === "fallback" ? "ltr" : "rtl",
      kind: kind === "fallback" ? "language-fallback" : kind,
    });
  }
  assertHtmlPage(rentSearch, { lang: "he", dir: "rtl", kind: "search" });

  const coverage = websiteLanguageCoverage(registry);
  const checks = [
    check(
      "viewport_and_touch_targets",
      Object.values(pages).every(
        (html) => includes(html, "name=\"viewport\"") && includes(html, "data-ms-realty-design-system=\"external\""),
      ) && includes(DESIGN_CSS, "min-height:44px"),
    ),
    check(
      "hebrew_rtl_public_pages",
      ["home", "listing", "search", "seller", "contact"].every((key) => includes(pages[key], "<html lang=\"he\" dir=\"rtl\">")),
    ),
    check(
      "react_public_bodies",
      ["home", "listing", "search", "seller", "contact"].every((key) => includes(pages[key], `data-react-public-ui=\"${key}\"`)),
    ),
    check(
      "mobile_search_form",
      includes(pages.search, "role=\"search\"") &&
        includes(pages.search, "type=\"search\"") &&
        includes(pages.search, "data-list-first-mobile=\"true\""),
    ),
    check(
      "mobile_search_actions",
      includes(pages.search, "data-map-optional=\"false\"") &&
        includes(pages.search, "data-save-search-endpoint=\"/api/saved-searches\"") &&
        includes(pages.search, "data-search-card=\"true\"") &&
        includes(pages.search, "data-card-thumbnail=\"true\"") &&
        includes(pages.search, "data-client-save-listing=") &&
        includes(pages.search, "data-endpoint=\"/api/leads\""),
    ),
    check(
      "mobile_app_navigation",
      includes(pages.home, "data-mobile-task=\"buy\" data-active=\"true\"") &&
        includes(rentSearch, "data-mobile-task=\"rent\" data-active=\"true\"") &&
        !includes(rentSearch, "data-mobile-task=\"buy\" data-active=\"true\"") &&
        includes(pages.search, "data-mobile-filter-sheet=\"true\"") &&
        includes(publicAdapterCss, ".site-hd { position: sticky; top: 0; z-index: 30; }") &&
        includes(publicAdapterCss, ".sr-mobile-filters {\n    position: sticky;"),
    ),
    check(
      "listing_sticky_actions",
      includes(pages.listing, "data-mobile-sticky-actions=\"true\"") &&
        includes(pages.listing, "data-mobile-sticky-primary=\"true\"") &&
        includes(pages.listing, "data-mobile-contact-options=\"true\"") &&
        includes(pages.listing, "data-listing-contact-panel=\"true\""),
    ),
    check(
      "intent_specific_lead_forms",
      includes(pages.listing, "data-enquiry-callback-time=\"true\"") &&
        includes(pages.listing, "data-enquiry-viewing-date=\"true\"") &&
        includes(pages.listing, "data-enquiry-viewing-time=\"true\"") &&
        includes(pages.listing, "data-lead-source=\"website_listing_detail\"") &&
        includes(pages.listing, "data-lead-source=\"website_callback_request\"") &&
        includes(pages.listing, "data-lead-source=\"website_viewing_request\"") &&
        includes(pages.listing, "data-history-back=\"same-origin\""),
    ),
    check(
      "listing_detail_media_actions",
      includes(pages.listing, "data-listing-summary=\"true\"") &&
        includes(pages.listing, "data-listing-price=\"true\"") &&
        includes(pages.listing, "data-listing-tools=\"true\"") &&
        includes(pages.listing, "data-listing-content-grid=\"true\"") &&
        includes(pages.listing, "data-listing-contact-panel=\"true\"") &&
        includes(pages.listing, "data-listing-facts=\"true\"") &&
        includes(pages.listing, "data-mobile-gallery=\"true\"") &&
        includes(pages.listing, "data-photo-carousel=\"true\"") &&
        includes(pages.listing, "data-listing-action=\"print\"") &&
        includes(pages.listing, "data-client-save-listing="),
    ),
    check(
      "approved_360_tour_accessibility",
      includes(approvedTourHtml, "data-photo-sphere-viewer=") &&
        includes(approvedTourHtml, "data-tour-provider=\"photo-sphere-viewer\"") &&
        includes(approvedTourHtml, "Reviewed 360 panorama with a gallery fallback.") &&
        includes(approvedTourHtml, "data-photo-carousel=\"true\""),
    ),
    check("phone_first_forms", includes(pages.seller, "data-phone-first=\"true\"") && includes(pages.contact, "data-phone-first=\"true\"")),
    check(
      "seller_valuation_broker_review",
      includes(pages.seller, "data-no-public-avm=\"true\"") &&
        includes(pages.seller, "data-broker-review-required=\"true\"") &&
        includes(pages.seller, "data-seller-valuation-flow=\"broker_callback\"") &&
        includes(pages.seller, "name=\"contact.phone\"") &&
        includes(pages.seller, "name=\"contact_preference\""),
    ),
    check(
      "seller_property_intake",
      includes(pages.seller, "data-seller-property-fields=\"true\"") &&
        includes(pages.seller, "name=\"property.location\"") &&
        includes(pages.seller, "name=\"property.type\"") &&
        includes(pages.seller, "name=\"property.area\"") &&
        includes(pages.seller, "name=\"property.bedrooms\""),
    ),
    check(
      "source_backed_search_filters",
      includes(pages.search, "name=\"property_type\"") &&
        includes(pages.search, "name=\"offer_type\"") &&
        includes(pages.search, "name=\"price_min\"") &&
        includes(pages.search, "name=\"price_max\"") &&
        includes(pages.search, "name=\"bedrooms_min\""),
    ),
    check("fallback_noindex_request", includes(pages.fallback, "noindex,follow") && includes(pages.fallback, "Request this language")),
    check(
      "admin_and_market_languages",
      JSON.stringify(registry.admin_locales) === JSON.stringify(["bg", "ru", "en"]) &&
        coverage.some((item) => item.market === "Greece" && item.locale === "el") &&
        coverage.some((item) => item.market === "Israel" && item.locale === "he"),
      { admin_locales: registry.admin_locales, market_coverage: coverage },
    ),
  ];
  const failed = checks.filter((item) => item.status !== "pass");

  return {
    generated_at: generatedAt,
    status: failed.length ? "fail" : "pass",
    summary: {
      checks: checks.length,
      passed: checks.length - failed.length,
      failed: failed.length,
    },
    checks,
  };
}

export function assertMobileElderlyQaReport(report) {
  if (report.status !== "pass") throw new Error("Mobile/elderly QA report must pass");
  if (!report.summary || report.summary.failed !== 0) throw new Error("Mobile/elderly QA report must have zero failures");
  for (const id of [
    "mobile_search_form",
    "mobile_search_actions",
    "mobile_app_navigation",
    "listing_sticky_actions",
    "intent_specific_lead_forms",
    "listing_detail_media_actions",
    "approved_360_tour_accessibility",
    "seller_valuation_broker_review",
    "seller_property_intake",
    "source_backed_search_filters",
    "react_public_bodies",
    "admin_and_market_languages",
  ]) {
    if (!report.checks.some((check) => check.id === id && check.status === "pass")) {
      throw new Error(`Mobile/elderly QA missing ${id}`);
    }
  }
  return true;
}

export function writeMobileElderlyQaReport(report, outPath = DEFAULT_MOBILE_ELDERLY_QA_OUTPUT) {
  assertMobileElderlyQaReport(report);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
  return outPath;
}
