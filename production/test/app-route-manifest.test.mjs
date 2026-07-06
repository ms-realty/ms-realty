import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { assertAppRouteFiles, assertAppRouteManifest, buildAppRouteManifest } from "../lib/app-route-manifest.mjs";
import { appRouterConfigFromEnv, renderAppRobots, renderAppRoute, renderAppSitemap } from "../lib/app-router-adapter.mjs";
import { loadLocaleRegistry } from "../lib/locales.mjs";
import { fromRoot } from "../lib/paths.mjs";

const registry = loadLocaleRegistry();

test("App Router manifest maps sitemap entries plus no-store search routes", () => {
  const manifest = buildAppRouteManifest({
    registry,
    sitemap: {
      entries: [
        { type: "home", locale: "he", loc: "/he/", hreflang: [{ hreflang: "he", href: "/he/" }] },
        {
          type: "listing",
          locale: "he",
          loc: "/he/properties/MS-CRAWL-0001",
          hreflang: [{ hreflang: "he", href: "/he/properties/MS-CRAWL-0001" }],
        },
        {
          type: "guide",
          locale: "en",
          loc: "/en/guides/foreign-buyers",
          hreflang: [{ hreflang: "en", href: "/en/guides/foreign-buyers" }],
        },
      ],
    },
    generatedAt: "2026-07-06T00:00:00Z",
  });

  assert.equal(assertAppRouteManifest(manifest), true);
  assert.equal(manifest.summary.sitemap_indexable_routes, 3);
  assert.equal(manifest.summary.utility_routes, 7);
  assert.equal(manifest.routes.find((route) => route.path === "/he/").dir, "rtl");
  assert.equal(manifest.routes.find((route) => route.path === "/he/properties/MS-CRAWL-0001").params.listingId, "MS-CRAWL-0001");
  assert.equal(manifest.routes.find((route) => route.path === "/en/guides/foreign-buyers").renderer, "renderGuidePage");
  assert.equal(manifest.routes.find((route) => route.path === "/en/guides/foreign-buyers").params.guidePath, "guides/foreign-buyers");
  assert.equal(manifest.routes.find((route) => route.path === "/he/search").cache, "no-store");
  assert.equal(manifest.routes.find((route) => route.path === "/he/search").sitemap_indexable, false);
  assert.equal(manifest.routes.find((route) => route.path === "/he/properties/MS-CRAWL-0001").app_module, "app/[locale]/[...slug]/route");
});

test("generated App Router manifest is valid when present", () => {
  const file = fromRoot("production", "data", "app-route-manifest.json");
  if (!fs.existsSync(file)) return;
  const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.equal(assertAppRouteManifest(manifest), true);
  assert.equal(manifest.summary.routes, 204);
  assert.equal(manifest.summary.sitemap_indexable_routes, 197);
  assert.equal(manifest.summary.by_type.search, 7);
  assert.equal(manifest.summary.by_type.guide, 2);
  assert.equal(manifest.routes.some((route) => route.path.startsWith("/fr/")), false);
  assert.equal(assertAppRouteFiles(manifest), true);
});

test("App Router adapter renders home, search, listing, and RTL HTML", () => {
  const home = renderAppRoute({ pathname: "/he/", url: "https://example.test/he/" });
  assert.equal(home.status, 200);
  assert.equal(home.headers["cache-control"], "public, max-age=300, s-maxage=3600");
  assert.match(home.html, /<html lang="he" dir="rtl">/);

  const search = renderAppRoute({ pathname: "/he/search", url: "https://example.test/he/search?q=sandanski" });
  assert.equal(search.status, 200);
  assert.equal(search.headers["cache-control"], "no-store");
  assert.equal(search.rendered.kind, "search");
  assert.equal(search.rendered.search.query, "sandanski");

  const listing = renderAppRoute({ pathname: "/he/properties/MS-CRAWL-0001", url: "https://example.test/he/properties/MS-CRAWL-0001" });
  assert.equal(listing.status, 200);
  assert.equal(listing.rendered.kind, "listing");
  assert.match(listing.html, /MS-CRAWL-0001/);

  const guide = renderAppRoute({ pathname: "/en/guides/foreign-buyers", url: "https://example.test/en/guides/foreign-buyers" });
  assert.equal(guide.status, 200);
  assert.equal(guide.rendered.kind, "guide");
  assert.match(guide.html, /Non-EU buyers cannot own Bulgarian land directly/);
});

test("App Router adapter honors mounted public listing edit ledger", () => {
  const editPath = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-app-router-edits-`)}/listing-edits.jsonl`;
  fs.writeFileSync(
    editPath,
    `${JSON.stringify({
      listing_id: "MS-CRAWL-0001",
      editor: "content_editor",
      patch: { title: "Operator edited Sandanski listing", h1: "Operator edited Sandanski listing" },
      source_hash_after: "mounted-edit",
      stale_translation_count: 1,
    })}\n`,
  );
  const listing = renderAppRoute({
    pathname: "/bg/imoti/MS-CRAWL-0001",
    url: "https://example.test/bg/imoti/MS-CRAWL-0001",
    config: appRouterConfigFromEnv({ MS_REALTY_LISTING_EDIT_LEDGER_PATH: editPath }),
  });

  assert.equal(listing.status, 200);
  assert.match(listing.html, /Operator edited Sandanski listing/);
});

test("App Router adapter serves approved sitemap and robots text", async () => {
  const sitemap = renderAppSitemap();
  assert.equal(sitemap.status, 200);
  assert.equal(sitemap.headers["content-type"], "application/xml; charset=utf-8");
  assert.equal(sitemap.sitemap.summary.entries, 195);
  assert.match(sitemap.body, /<loc>https:\/\/makler-realty.com\/he\/<\/loc>/);
  assert.match(sitemap.body, /\/he\/properties\/MS-CRAWL-0001/);
  assert.match(sitemap.body, /\/en\/guides\/foreign-buyers/);
  assert.doesNotMatch(sitemap.body, /\/el\/akinita\/MS-CRAWL-0001/);
  assert.doesNotMatch(sitemap.body, /\/fr\//);

  const robots = renderAppRobots();
  assert.equal(robots.status, 200);
  assert.equal(robots.headers["content-type"], "text/plain; charset=utf-8");
  assert.match(robots.body, /Sitemap: https:\/\/makler-realty.com\/sitemap.xml/);

  const sitemapRoute = await import("../../app/sitemap.xml/route.js");
  const robotsRoute = await import("../../app/robots.txt/route.js");
  assert.equal((await sitemapRoute.GET()).headers.get("content-type"), "application/xml; charset=utf-8");
  assert.equal((await robotsRoute.GET()).headers.get("content-type"), "text/plain; charset=utf-8");
});
