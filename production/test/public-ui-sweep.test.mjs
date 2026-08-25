import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { loadListings } from "../lib/content.mjs";
import { loadLocaleRegistry } from "../lib/locales.mjs";
import {
  labelsFor,
  renderHomePage,
  renderLanguageFallback,
  renderListingPage,
  renderSearchPage,
} from "../lib/public-site.mjs";
import { renderReactPublicBody } from "../lib/react-public-site.mjs";
import { PUBLIC_APP_JS } from "../lib/ui/client.mjs";

Object.assign(process.env, {
  MS_REALTY_LEAD_DURABLE_STORE_ENABLED: "true",
  PAYLOAD_SECRET: "test-only-public-ui-sweep-payload-secret-32-chars",
  DATABASE_URL: "postgres://payload:secret@db.example.test/ms_realty",
  MS_REALTY_LEAD_CONTACT_KEY: "test-only-public-ui-sweep-contact-key-32-characters",
  MS_REALTY_WORKSPACE_ID: "workspace-sandanski",
});

const registry = loadLocaleRegistry();
const listings = loadListings();
const css = readFileSync(new URL("../lib/ui/adapter-public.css", import.meta.url), "utf8");
const PUBLIC_LOCALES = ["bg", "en", "de", "nl", "ru", "el", "he"];

test("desktop language menu closes on outside click, Escape, and focus leaving it", () => {
  assert.match(PUBLIC_APP_JS, /function initLanguageMenu\(\)/);
  assert.match(PUBLIC_APP_JS, /details\[data-language-switcher="desktop"\]/);
  assert.match(PUBLIC_APP_JS, /if \(menu\.open && !menu\.contains\(event\.target\)\) closeMenu\(false\);/);
  assert.match(PUBLIC_APP_JS, /event\.key === "Escape" && menu\.open/);
  assert.match(PUBLIC_APP_JS, /if \(returnFocus\) summary\.focus\(\);/);
  assert.match(PUBLIC_APP_JS, /menu\.addEventListener\("focusout"/);
  assert.match(PUBLIC_APP_JS, /initPublicMobileNavigation\(\);\s+initLanguageMenu\(\);/);
  assert.match(css, /\.site-language\[open\] > summary \{ background: var\(--surface-hover\); \}/);
});

test("mobile menu overlay covers the viewport under the sticky header and the button shows a close icon", () => {
  const html = renderReactPublicBody(renderHomePage({ registry, listings, localeCode: "en" }));
  assert.match(html, /class="mk-icon site-hd__mobile-icon-open"/);
  assert.match(html, /class="mk-icon site-hd__mobile-icon-close"/);
  assert.match(css, /\.site-hd__mobile-backdrop \{[\s\S]*?height: calc\(100dvh - 64px - env\(safe-area-inset-top\)\);/);
  assert.match(css, /\.site-hd__mobile\[open\] > summary \.site-hd__mobile-icon-open \{ display: none; \}/);
  assert.match(css, /\.site-hd__mobile\[open\] > summary \.site-hd__mobile-icon-close \{ display: block; \}/);
});

test("listing pages without approved translations still offer every public language", () => {
  const listing = listings.find((entry) => entry.id === "MS-CRAWL-0003");
  const page = renderListingPage({ registry, listing, localeCode: "en" });
  assert.equal(page.hreflang.length, 0);
  assert.deepEqual(page.chrome.languages.map((language) => language.code), PUBLIC_LOCALES);
  assert.equal(page.chrome.languages.find((language) => language.code === "en").active, true);
  // A missing translation is a reason for the source-language badge, not for
  // dropping the visitor on a home page: the German route renders this listing.
  assert.equal(page.chrome.languages.find((language) => language.code === "de").href, "/de/immobilien/MS-CRAWL-0003");
  const html = renderReactPublicBody(page);
  assert.match(html, /data-language-switcher="desktop"/);
  assert.equal((html.match(/class="site-hd__mobile-langs"[^>]*>/g) || []).length, 1);
});

test("public dialogs declare aria-modal and the map directory disclosure has a chevron", () => {
  const listing = listings.find((entry) => entry.id === "MS-CRAWL-0003");
  const listingHtml = renderReactPublicBody(renderListingPage({ registry, listing, localeCode: "en" }));
  assert.match(listingHtml, /<dialog id="mk-enquiry" class="ct-modal mk-enquiry" aria-modal="true"/);
  assert.match(listingHtml, /<dialog id="mk-contact-options" class="ld-contact-options" aria-modal="true"/);
  assert.match(listingHtml, /<dialog class="ld-photo-viewer" aria-modal="true"/);
  const mapPage = renderSearchPage({ registry, localeCode: "en", listings, query: "", filters: { location: "Sandanski" }, view: "map" });
  const mapHtml = renderReactPublicBody(mapPage);
  assert.match(mapHtml, /<details class="sr-area-map__directory"><summary class="sr-area-map__directory-summary"><span>[^<]+<\/span><svg[^>]*class="[^"]*sr-area-map__directory-chevron/);
  assert.match(css, /\.sr-area-map__directory summary::-webkit-details-marker \{ display: none; \}/);
  assert.match(css, /\.sr-area-map__directory\[open\] \.sr-area-map__directory-chevron \{ transform: rotate\(180deg\); \}/);
  assert.match(css, /\.sr-area-maps \{[\s\S]*?margin-bottom: var\(--space-5\);/);
  assert.match(mapHtml, /class="sr-mobile-filters__control" aria-hidden="true">[\s\S]*?sr-mobile-filters__chevron/);
});

test("results filter forms leave empty controls out of the URL and bare selects get a chevron", () => {
  assert.match(PUBLIC_APP_JS, /function emptyFormControls\(form\)/);
  assert.match(PUBLIC_APP_JS, /if \(control\.checked && String\(control\.value \|\| ""\) === ""\) empty\.push\(control\);/);
  assert.match(PUBLIC_APP_JS, /function initSearchFilterForms\(\)/);
  assert.match(PUBLIC_APP_JS, /document\.querySelectorAll\("\[data-search-filter-form\]"\)/);
  assert.match(PUBLIC_APP_JS, /initSavedSearchContacts\(\);\s+initSearchFilterForms\(\);/);
  assert.match(css, /dialog\.mk-enquiry \.ct-form select,\nmain \.ct-form select \{[\s\S]*?appearance: none;/);
  assert.match(css, /\.mk-btn:disabled \{ cursor: not-allowed; opacity: 0\.5; box-shadow: none; \}/);
  assert.match(css, /@media \(pointer: coarse\) \{[\s\S]*?\.sr-active a,[\s\S]*?min-height: 44px;/);
  assert.match(css, /\.hp-search__seg input\.mk-searchbar__input,\n\.hp-search__select select\.hp-search__input \{[\s\S]*?margin-top: -20px;[\s\S]*?padding-top: 20px;/);
});

test("language fallback explains the missing language in every public locale without dashes", () => {
  for (const code of PUBLIC_LOCALES) {
    const labels = labelsFor(code);
    for (const key of ["languageUnavailable", "languageUnavailableText", "languageRequestSent"]) {
      assert.equal(typeof labels[key], "string", `${code}.${key}`);
      assert.ok(labels[key].length > 8, `${code}.${key}`);
      assert.doesNotMatch(labels[key], /[—–!]/, `${code}.${key}`);
    }
  }
  const page = renderLanguageFallback({ registry, requestedLocale: "fr" });
  assert.equal(page.body.h1, "This language is not available yet");
  const html = renderReactPublicBody(page);
  assert.match(html, /<h1 id="[a-z-]+-title" class="mk-empty__title">This language is not available yet<\/h1>/);
  assert.match(html, /data-request-language="true" data-success-message="Thank you\. We will let you know when this language is ready\."/);
  assert.doesNotMatch(html, /Fallback route/);
});
