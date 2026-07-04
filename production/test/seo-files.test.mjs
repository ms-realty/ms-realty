import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { addLocaleToRegistry, loadLocaleRegistry } from "../lib/locales.mjs";
import { fromRoot } from "../lib/paths.mjs";
import { loadCmsSeed } from "../lib/runtime.mjs";
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

  assert.equal(assertSeoFiles({ sitemapXml, robotsTxt }), true);
  assert.match(sitemapXml, /https:\/\/makler-realty\.com\/ru\/properties\/MS-CRAWL-/);
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
      id: "translation-listing-MS-CRAWL-0001-es",
      object_type: "listing",
      object_id: "MS-CRAWL-0001",
      target_locale: "es",
      status: "published",
      human_approved: true,
      public_indexable: true,
    },
  ]);

  assert.equal(sitemap.summary.byLocale.es, 3);
  assert.equal(sitemap.summary.seller_pages, 8);
  assert.equal(sitemap.entries.some((entry) => entry.loc === "/es/propiedades/MS-CRAWL-0001"), true);
  assert.equal(sitemap.entries.some((entry) => entry.loc === "/es/locations/sandanski" && entry.type === "location"), true);
  assert.equal(sitemap.entries.some((entry) => entry.loc === "/es/sell" && entry.type === "seller"), true);
});

test("generated SEO files are valid when present", () => {
  const sitemapPath = fromRoot("production", "data", "sitemap.xml");
  const robotsPath = fromRoot("production", "data", "robots.txt");
  if (!fs.existsSync(sitemapPath) || !fs.existsSync(robotsPath)) return;
  assert.equal(
    assertSeoFiles({
      sitemapXml: fs.readFileSync(sitemapPath, "utf8"),
      robotsTxt: fs.readFileSync(robotsPath, "utf8"),
    }),
    true,
  );
});
