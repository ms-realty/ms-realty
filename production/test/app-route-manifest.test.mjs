import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { assertAppRouteManifest, buildAppRouteManifest } from "../lib/app-route-manifest.mjs";
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
      ],
    },
    generatedAt: "2026-07-06T00:00:00Z",
  });

  assert.equal(assertAppRouteManifest(manifest), true);
  assert.equal(manifest.summary.sitemap_indexable_routes, 2);
  assert.equal(manifest.summary.utility_routes, 7);
  assert.equal(manifest.routes.find((route) => route.path === "/he/").dir, "rtl");
  assert.equal(manifest.routes.find((route) => route.path === "/he/properties/MS-CRAWL-0001").params.listingId, "MS-CRAWL-0001");
  assert.equal(manifest.routes.find((route) => route.path === "/he/search").cache, "no-store");
  assert.equal(manifest.routes.find((route) => route.path === "/he/search").sitemap_indexable, false);
});

test("generated App Router manifest is valid when present", () => {
  const file = fromRoot("production", "data", "app-route-manifest.json");
  if (!fs.existsSync(file)) return;
  const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.equal(assertAppRouteManifest(manifest), true);
  assert.equal(manifest.summary.routes, 202);
  assert.equal(manifest.summary.sitemap_indexable_routes, 195);
  assert.equal(manifest.summary.by_type.search, 7);
  assert.equal(manifest.routes.some((route) => route.path.startsWith("/fr/")), false);
});
