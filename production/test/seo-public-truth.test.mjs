import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { loadListings } from "../lib/content.mjs";
import { loadLocaleRegistry } from "../lib/locales.mjs";
import { fromRoot } from "../lib/paths.mjs";
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
const designSystemOfficeFiles = [
  "makler-realty-design-system/project/_ds_bundle.js",
  "makler-realty-design-system/project/_ds_manifest.json",
  "makler-realty-design-system/project/components/people/AgentCard.prompt.md",
  "makler-realty-design-system/project/components/people/people.card.html",
  "makler-realty-design-system/project/guidelines/voice-tone.html",
  "makler-realty-design-system/project/readme.md",
  "makler-realty-design-system/project/templates/agents/AgentsPage.dc.html",
  "makler-realty-design-system/project/templates/client-deck/ClientDeck.dc.html",
  "makler-realty-design-system/project/templates/contact/ContactPage.dc.html",
  "makler-realty-design-system/project/templates/listing-detail/ListingDetail.dc.html",
  "makler-realty-design-system/project/ui_kits/crm/crm-data.js",
  "makler-realty-design-system/project/ui_kits/website/ContactPanel.jsx",
  "makler-realty-design-system/project/ui_kits/website/HomePage.jsx",
  "makler-realty-design-system/project/ui_kits/website/SiteChrome.jsx",
  "makler-realty-design-system/project/ui_kits/website/data.js",
];
const falseOfficeClaim = /(?:три\s+офиса|местни\s+офиси|морски\s+офис|пирински\s+офис|централен\s+офис\s*[·—-]\s*(?:банско|свети\s+влас)|офис\s*[·—-]\s*(?:банско|свети\s+влас)|(?:банско|свети\s+влас)\s*(?:·|—|-)\s*офис|three\s+(?:makler\s+)?offices?|local\s+offices?|marine\s+office|mountain\s+office|central\s+office\s*[—-]\s*(?:bansko|sveti\s+vlas)|office\s*[—-]\s*(?:bansko|sveti\s+vlas))/iu;

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

test("design-system office claims stay separate from real service locations", () => {
  const contents = Object.fromEntries(
    designSystemOfficeFiles.map((relativePath) => [relativePath, fs.readFileSync(fromRoot(relativePath), "utf8")]),
  );
  const designSystem = Object.values(contents).join("\n");
  assert.match(designSystem, /Сандански|Sandanski/iu, "design system retains the real office location");
  assert.match(contents["makler-realty-design-system/project/ui_kits/website/data.js"], /location:\s*['"](?:Банско|Свети\s+Влас)['"]/iu, "service locations remain available");
  assert.doesNotMatch(designSystem, falseOfficeClaim, "design system has no Bansko/coast office claim");
});
