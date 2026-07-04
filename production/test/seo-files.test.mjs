import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fromRoot } from "../lib/paths.mjs";
import { assertSeoFiles, loadLocalizedSitemap, renderRobotsTxt, renderSitemapXml } from "../lib/seo-files.mjs";

test("SEO files expose only approved localized sitemap routes", () => {
  const sitemap = loadLocalizedSitemap();
  const sitemapXml = renderSitemapXml(sitemap, { origin: "https://makler-realty.com" });
  const robotsTxt = renderRobotsTxt({ origin: "https://makler-realty.com" });

  assert.equal(assertSeoFiles({ sitemapXml, robotsTxt }), true);
  assert.match(sitemapXml, /https:\/\/makler-realty\.com\/ru\/properties\/MS-CRAWL-/);
  assert.doesNotMatch(sitemapXml, /\/fr\//);
  assert.match(robotsTxt, /Sitemap: https:\/\/makler-realty\.com\/sitemap\.xml/);
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
