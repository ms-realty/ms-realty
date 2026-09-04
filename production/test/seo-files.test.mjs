import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { addLocaleToRegistry, loadLocaleRegistry } from "../lib/locales.mjs";
import { applyListingEdits } from "../lib/listing-edits.mjs";
import { fromRoot } from "../lib/paths.mjs";
import { loadCmsSeed } from "../lib/runtime.mjs";
import { readTranslationLedger } from "../lib/translation-ledger.mjs";
import {
  assertSeoFiles,
  buildRuntimeLocalizedSitemap,
  loadLocalizedSitemap,
  renderRobotsTxt,
  renderSitemapXml,
} from "../lib/seo-files.mjs";

test("SEO files expose only approved localized sitemap routes", () => {
  const sitemap = loadLocalizedSitemap();
  const sitemapXml = renderSitemapXml(sitemap, { origin: "https://makler-realty.com" });
  const robotsTxt = renderRobotsTxt({ origin: "https://makler-realty.com" });

  assert.equal(assertSeoFiles({ sitemapXml, robotsTxt, sitemap }), true);
  assert.match(sitemapXml, /https:\/\/makler-realty\.com\/he<\/loc>/);
  const listingUrlPattern = /https:\/\/makler-realty\.com\/[a-z]{2}\/[^</]+\/MS-0\d{4}/;
  if (sitemap.summary.public.listing_entries > 0) {
    assert.match(sitemapXml, listingUrlPattern);
  } else {
    assert.doesNotMatch(sitemapXml, listingUrlPattern);
  }
  assert.match(sitemapXml, /https:\/\/makler-realty\.com\/he\/contact/);
  assert.match(sitemapXml, /https:\/\/makler-realty\.com\/en\/guides\/foreign-buyers/);
  assert.doesNotMatch(sitemapXml, /\/fr\//);
  assert.match(robotsTxt, /Sitemap: https:\/\/makler-realty\.com\/sitemap\.xml/);
});

test("runtime sitemap includes approved dynamic locale translations", () => {
  const { registry } = addLocaleToRegistry(loadLocaleRegistry(), {
    code: "es",
    native_name: "Español",
    admin_name: "Spanish",
    public_enabled: true,
    indexable: true,
    route_segments: { listing: "propiedades", search: "buscar" },
  });
  const sitemap = buildRuntimeLocalizedSitemap(registry, loadCmsSeed(), [
    {
      id: "translation-listing-MS-00815-es",
      object_type: "listing",
      object_id: "MS-00815",
      target_locale: "es",
      status: "published",
      human_approved: true,
      public_indexable: true,
    },
  ]);

  // Home, listing, location, seller and contact plus the eight search facets
  // every public locale carries.
  assert.equal(sitemap.summary.byLocale.es, 13);
  assert.equal(sitemap.summary.seller_pages, 8);
  assert.equal(sitemap.summary.search_facet_pages, 64);
  assert.equal(sitemap.summary.contact_pages, 8);
  assert.equal(sitemap.summary.guide_pages, 5);
  assert.equal(sitemap.entries.some((entry) => entry.loc === "/es" && entry.type === "home"), true);
  assert.equal(sitemap.entries.some((entry) => entry.loc === "/es/propiedades/MS-00815"), true);
  assert.equal(sitemap.entries.some((entry) => entry.loc === "/es/locations/sandanski" && entry.type === "location"), true);
  assert.equal(sitemap.entries.some((entry) => entry.loc === "/es/sell" && entry.type === "seller"), true);
  assert.equal(sitemap.entries.some((entry) => entry.loc === "/es/contact" && entry.type === "contact"), true);
});

test("runtime sitemap keeps sold listings but not sold-only location pages", () => {
  const seed = applyListingEdits(loadCmsSeed(), [
    {
      listing_id: "MS-00815",
      patch: { location: "Sold Only Runtime City", listing_status: "sold" },
    },
  ]);
  const sitemap = buildRuntimeLocalizedSitemap(loadLocaleRegistry(), seed);

  assert.equal(sitemap.entries.some((entry) => entry.loc === "/bg/imoti/MS-00815"), true);
  assert.equal(sitemap.entries.some((entry) => entry.loc.endsWith("/locations/sold-only-runtime-city")), false);
});

test("runtime sitemap exposes only official reviewed location scopes", () => {
  const sitemap = buildRuntimeLocalizedSitemap(loadLocaleRegistry(), loadCmsSeed());

  assert.equal(sitemap.entries.some((entry) => entry.loc === "/bg/lokacii/sandanski"), true);
  assert.equal(sitemap.entries.some((entry) => entry.loc === "/bg/lokacii/petrich"), true);
  assert.equal(sitemap.entries.some((entry) => entry.loc === "/bg/lokacii/bansko"), false);
  assert.equal(sitemap.entries.some((entry) => entry.loc === "/bg/lokacii/logari"), false);
});

test("runtime sitemap excludes stale translation routes", () => {
  const sitemap = buildRuntimeLocalizedSitemap(loadLocaleRegistry(), loadCmsSeed(), readTranslationLedger());

  assert.equal(sitemap.entries.some((entry) => entry.loc === "/el/akinita/MS-00815"), false);
  assert.equal(sitemap.entries.some((entry) => entry.loc === "/el/topothesies/sandanski"), false);
});

test("generated SEO files are valid when present", () => {
  const sitemapPath = fromRoot("production", "data", "sitemap.xml");
  const robotsPath = fromRoot("production", "data", "robots.txt");
  if (!fs.existsSync(sitemapPath) || !fs.existsSync(robotsPath)) return;
  assert.equal(
    assertSeoFiles({
      sitemapXml: fs.readFileSync(sitemapPath, "utf8"),
      robotsTxt: fs.readFileSync(robotsPath, "utf8"),
      sitemap: loadLocalizedSitemap(),
    }),
    true,
  );
});
