import test from "node:test";
import assert from "node:assert/strict";
import { loadListings } from "../lib/content.mjs";
import { loadLocaleRegistry } from "../lib/locales.mjs";
import { renderAboutPage, renderContactPage, renderListingPage } from "../lib/public-site.mjs";
import { loadCmsSeed, renderRuntimePath } from "../lib/runtime.mjs";
import { aboutPath, startPath } from "../lib/seo.mjs";
import { loadLocalizedSitemap } from "../lib/seo-files.mjs";

const registry = loadLocaleRegistry();
const listings = loadListings();
const seed = loadCmsSeed();
const publicLocales = registry.locales.filter((locale) => locale.public_enabled).map((locale) => locale.code);
const knownDuplicateGroups = [
  ["MS-CRAWL-0007", "MS-CRAWL-0027"],
  ["MS-CRAWL-0055", "MS-CRAWL-0056", "MS-CRAWL-0088"],
  ["MS-CRAWL-0101", "MS-CRAWL-0109"],
];

function listingPath(localeCode, id) {
  const segment = registry.locales.find((locale) => locale.code === localeCode).route_segments.listing;
  return `/${localeCode}/${segment}/${id}`;
}

test("duplicate listing metadata titles receive reference suffixes in every public locale", () => {
  for (const localeCode of publicLocales) {
    const baseTitles = new Map();
    for (const listing of listings) {
      const page = renderListingPage({ registry, listing, localeCode });
      const title = page.metadata.title;
      if (!baseTitles.has(title)) baseTitles.set(title, []);
      baseTitles.get(title).push(listing.id);
    }
    const duplicateGroups = [...baseTitles.values()].filter((ids) => ids.length > 1).map((ids) => [...ids].sort());
    assert.deepEqual(duplicateGroups, knownDuplicateGroups.map((ids) => [...ids].sort()), `${localeCode} collision groups`);

    for (const ids of duplicateGroups) {
      for (const id of ids) {
        const listing = listings.find((candidate) => candidate.id === id);
        const page = renderRuntimePath(registry, seed, listingPath(localeCode, id));
        const sourcePage = renderListingPage({ registry, listing, localeCode });
        assert.match(page.metadata.title, new RegExp(`\\u00b7 ${id}$`), `${localeCode} ${id} metadata suffix`);
        assert.match(page.metadata.og_title, new RegExp(`\\u00b7 ${id}$`), `${localeCode} ${id} OG suffix`);
        assert.equal(page.body.h1, sourcePage.body.h1, `${localeCode} ${id} H1 remains source text`);
      }
    }
  }
});

test("unapproved localized start/about copy stays reachable but explicitly noindex and out of the sitemap", () => {
  const sitemap = loadLocalizedSitemap();
  assert.equal(
    sitemap.entries.some((entry) => entry.type === "start" || entry.type === "about"),
    false,
  );
  for (const localeCode of publicLocales) {
    const start = renderRuntimePath(registry, seed, startPath(registry, localeCode));
    const about = renderRuntimePath(registry, seed, aboutPath(registry, localeCode));
    for (const page of [start, about]) {
      assert.equal(page.status, 200, `${localeCode} ${page.kind} remains reachable`);
      assert.equal(page.indexable, false, `${localeCode} ${page.kind} is not indexable`);
      assert.equal(page.metadata.robots, "noindex,follow", `${localeCode} ${page.kind} robots`);
    }
  }
});

test("office claim scan allows real service locations while limiting office fields to Sandanski", () => {
  for (const localeCode of publicLocales) {
    const about = renderAboutPage({ registry, localeCode });
    const contact = renderContactPage({ registry, localeCode, leadWritesDisabled: true });
    const officeFields = JSON.stringify({ about: about.body.offices, contact: contact.body.offices });
    assert.deepEqual(about.body.offices.items.map((office) => office.id), ["sandanski"], `${localeCode} about office`);
    assert.deepEqual(contact.body.offices.map((office) => office.location), ["Sandanski"], `${localeCode} contact office`);
    assert.doesNotMatch(officeFields, /bansko|sveti\\s+vlas|банско|свети\\s*влас/iu, `${localeCode} false office claim`);
  }
});
