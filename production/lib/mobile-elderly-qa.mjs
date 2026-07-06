import fs from "node:fs";
import path from "node:path";
import { findListingById, loadListings } from "./content.mjs";
import { assertHtmlPage, renderHtmlPage } from "./html.mjs";
import { loadLocaleRegistry, websiteLanguageCoverage } from "./locales.mjs";
import { fromRoot } from "./paths.mjs";
import {
  renderContactPage,
  renderHomePage,
  renderLanguageFallback,
  renderListingPage,
  renderSearchPage,
  renderSellerPage,
} from "./public-site.mjs";

export const DEFAULT_MOBILE_ELDERLY_QA_OUTPUT = fromRoot("production", "data", "mobile-elderly-qa-report.json");

function check(id, passed, evidence = {}) {
  return { id, status: passed ? "pass" : "fail", evidence };
}

function includes(html, marker) {
  return html.includes(marker);
}

export function buildMobileElderlyQaReport({
  generatedAt = new Date().toISOString(),
  registry = loadLocaleRegistry(),
  listings = loadListings(),
} = {}) {
  const listing = findListingById(listings, "MS-CRAWL-0001");
  const pages = {
    home: renderHtmlPage(renderHomePage({ registry, listings, localeCode: "he" })),
    listing: renderHtmlPage(renderListingPage({ registry, listing, localeCode: "he" })),
    search: renderHtmlPage(renderSearchPage({ registry, listings, localeCode: "he", query: "Sandanski" })),
    seller: renderHtmlPage(renderSellerPage({ registry, localeCode: "he" })),
    contact: renderHtmlPage(renderContactPage({ registry, localeCode: "he" })),
    fallback: renderHtmlPage(renderLanguageFallback({ registry, requestedLocale: "fr" })),
  };

  for (const [kind, html] of Object.entries(pages)) {
    assertHtmlPage(html, {
      lang: kind === "fallback" ? "en" : "he",
      dir: kind === "fallback" ? "ltr" : "rtl",
      kind: kind === "fallback" ? "language-fallback" : kind,
    });
  }

  const coverage = websiteLanguageCoverage(registry);
  const checks = [
    check(
      "viewport_and_touch_targets",
      Object.values(pages).every((html) => includes(html, "name=\"viewport\"") && includes(html, "min-height:44px")),
    ),
    check(
      "hebrew_rtl_public_pages",
      ["home", "listing", "search", "seller", "contact"].every((key) => includes(pages[key], "<html lang=\"he\" dir=\"rtl\">")),
    ),
    check(
      "mobile_search_form",
      includes(pages.search, "role=\"search\"") &&
        includes(pages.search, "type=\"search\"") &&
        includes(pages.search, "data-list-first-mobile=\"true\""),
    ),
    check(
      "mobile_search_actions",
      includes(pages.search, "data-map-optional=\"true\"") &&
        includes(pages.search, "data-save-search-endpoint=\"/api/saved-searches\"") &&
        includes(pages.search, "data-search-card=\"true\"") &&
        includes(pages.search, "data-client-save-listing=") &&
        includes(pages.search, "data-endpoint=\"/api/leads\""),
    ),
    check(
      "listing_sticky_actions",
      includes(pages.listing, "data-mobile-sticky-actions=\"true\"") && includes(pages.listing, "aria-label=\"Listing actions\""),
    ),
    check(
      "listing_detail_media_actions",
      includes(pages.listing, "data-listing-summary=\"true\"") &&
        includes(pages.listing, "data-listing-price=\"true\"") &&
        includes(pages.listing, "data-photo-carousel=\"true\"") &&
        includes(pages.listing, "data-photo-sphere-viewer=") &&
        includes(pages.listing, "data-listing-action=\"print\"") &&
        includes(pages.listing, "data-client-save-listing="),
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
    "listing_sticky_actions",
    "listing_detail_media_actions",
    "seller_valuation_broker_review",
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
