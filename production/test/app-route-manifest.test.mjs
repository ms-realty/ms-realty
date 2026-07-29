import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { assertAppRouteFiles, assertAppRouteManifest, buildAppRouteManifest } from "../lib/app-route-manifest.mjs";
import {
  appRouterConfigFromEnv,
  renderAppFavicon,
  renderAppRobots,
  renderAppRoute,
  renderAppRouteResponse,
  renderAppSitemap,
} from "../lib/app-router-adapter.mjs";
import { loadLocaleRegistry } from "../lib/locales.mjs";
import { fromRoot } from "../lib/paths.mjs";

const registry = loadLocaleRegistry();

test("App Router manifest maps sitemap entries plus no-store search routes", () => {
  const manifest = buildAppRouteManifest({
    registry,
    sitemap: {
      entries: [
        { type: "home", locale: "he", loc: "/he", hreflang: [{ hreflang: "he", href: "/he" }] },
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
  assert.equal(manifest.routes.find((route) => route.path === "/he").dir, "rtl");
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
  assert.equal(manifest.summary.routes, 205);
  assert.equal(manifest.summary.sitemap_indexable_routes, 198);
  assert.equal(manifest.summary.by_type.search, 7);
  assert.equal(manifest.summary.by_type.guide, 5);
  assert.equal(manifest.routes.some((route) => route.path.startsWith("/fr/")), false);
  assert.equal(assertAppRouteFiles(manifest), true);
});

test("every manifest page renders a complete public content contract", () => {
  const manifest = JSON.parse(fs.readFileSync(fromRoot("production", "data", "app-route-manifest.json"), "utf8"));

  for (const route of manifest.routes) {
    const page = renderAppRoute({ pathname: route.path, url: `https://audit.test${route.path}` });
    const label = `${route.type} ${route.path}`;
    assert.equal(page.status, 200, `${label} must render`);
    assert.equal(page.rendered.kind, route.type, `${label} must use its declared renderer`);
    assert.equal(page.rendered.indexable, route.public_indexable, `${label} must match its sitemap indexability`);
    assert.match(page.html, /<title>\s*[^<\s]/, `${label} must have a title`);
    assert.match(page.html, /<meta name="description" content="[^"\s]/, `${label} must have a description`);
    assert.match(page.html, /<h1(?:\s[^>]*)?>\s*[^<\s]/, `${label} must have an H1`);
    assert.match(page.html, new RegExp(`data-react-public-ui="${route.type}"`), `${label} must render its public shell`);
  }
});

test("App Router adapter renders home, search, listing, and RTL HTML", () => {
  const home = renderAppRoute({ pathname: "/he/", url: "https://example.test/he/" });
  assert.equal(home.status, 200);
  assert.equal(home.headers["cache-control"], "public, max-age=300, s-maxage=3600");
  assert.match(home.html, /<html lang="he" dir="rtl">/);
  assert.match(home.html, /data-react-public-ui="home"/);
  assert.match(home.html, /data-home-locations="true"/);
  assert.match(home.html, /\/he\/locations\/sandanski/);
  assert.match(home.html, /data-featured-listings="true"/);
  assert.match(home.html, /data-card-thumbnail="true"/);

  const search = renderAppRoute({ pathname: "/he/search", url: "https://example.test/he/search?q=sandanski&property_type=apartment" });
  assert.equal(search.status, 200);
  assert.equal(search.headers["cache-control"], "no-store");
  assert.equal(search.rendered.kind, "search");
  assert.equal(search.rendered.search.query, "sandanski");
  assert.match(search.html, /data-react-public-ui="search"/);

  const saved = renderAppRoute({ pathname: "/he/search", url: "https://example.test/he/search?saved=1" });
  assert.equal(saved.status, 200);
  assert.equal(saved.rendered.search.saved_view, true);
  assert.equal(saved.rendered.indexable, false);
  assert.equal(saved.rendered.metadata.robots, "noindex,nofollow");
  assert.equal(saved.rendered.cards.length, saved.rendered.search.total_matches);
  assert.match(saved.html, /data-saved-listings-view="true"/);
  assert.match(saved.html, /data-saved-label="נשמר"/);
  assert.match(search.html, /<select name="sort">/);
  assert.match(search.html, /data-active-filter-count="1"/);
  assert.match(search.html, /data-mobile-search-filters="true"/);
  assert.match(search.html, /data-mobile-filter-count="1"/);
  assert.match(search.html, /data-filter-form-id="sr-mobile"/);
  assert.match(search.html, /data-filter-chip="property_type"/);
  assert.match(search.html, /data-card-thumbnail="true"/);
  assert.match(search.html, /<img src="https:\/\/makler-realty\./);
  assert.match(search.html, /defer src="\/vendor\/ms-realty-public\.js\?v=[a-f0-9]{12}"/);
  assert.match(search.html, /data-ms-realty-public-client/);
  assert.doesNotMatch(search.html, /function submitHermesChat/);

  const bgListing = renderAppRoute({ pathname: "/bg/imoti/MS-CRAWL-0001", url: "https://example.test/bg/imoti/MS-CRAWL-0001" });
  assert.equal(bgListing.status, 200);
  assert.match(bgListing.html, /Комплекс за дългосрочен наем/);
  assert.doesNotMatch(bgListing.html, /Updated approved source description\./);

  const listing = renderAppRoute({ pathname: "/he/properties/MS-CRAWL-0001", url: "https://example.test/he/properties/MS-CRAWL-0001" });
  assert.equal(listing.status, 200);
  assert.equal(listing.rendered.kind, "listing");
  assert.match(listing.html, /MS-CRAWL-0001/);
  assert.match(listing.html, /data-react-public-ui="listing"/);
  assert.match(listing.html, /data-listing-tools="true"/);
  assert.match(listing.html, /data-listing-content-grid="true"/);
  assert.match(listing.html, /data-listing-contact-panel="true"/);
  assert.match(listing.html, /<dl data-listing-facts="true">/);
  assert.match(listing.html, /aria-label="מדיית נכס"/);
  assert.match(listing.html, /data-media-gallery-count=/);
  assert.match(listing.html, /data-listing-action="back_to_results"/);
  assert.equal((listing.html.match(/<[^>]+data-compact-mobile-action="true"/g) || []).length, 3);
  assert.match(listing.html, /href="\/he\/search"/);
  assert.match(listing.html, /data-related-listings="true"/);

  const listingFallback = renderAppRoute({
    pathname: "/en/properties/MS-CRAWL-0001",
    url: "https://example.test/en/properties/MS-CRAWL-0001",
  });
  assert.equal(listingFallback.status, 200);
  assert.equal(listingFallback.rendered.kind, "listing");
  assert.equal(listingFallback.rendered.fallback.active, true);
  assert.equal(listingFallback.rendered.body.content_locale, "bg");
  assert.match(listingFallback.html, /<meta name="robots" content="noindex,follow">/);

  const listingPrint = renderAppRoute({
    pathname: "/he/properties/MS-CRAWL-0001",
    url: "https://example.test/he/properties/MS-CRAWL-0001?print=1",
  });
  assert.equal(listingPrint.status, 200);
  assert.doesNotMatch(listingPrint.html, /data-react-public-ui=/);
  assert.match(listingPrint.html, /data-kind="listing-print"/);

  const location = renderAppRoute({ pathname: "/he/locations/sandanski", url: "https://example.test/he/locations/sandanski" });
  assert.equal(location.status, 200);
  assert.equal(location.rendered.kind, "location");
  assert.match(location.html, /data-react-public-ui="location"/);
  assert.match(location.html, /data-location-listings="true"/);
  assert.match(location.html, /data-card-thumbnail="true"/);

  const seller = renderAppRoute({ pathname: "/he/sell", url: "https://example.test/he/sell" });
  assert.equal(seller.status, 200);
  assert.equal(seller.rendered.kind, "seller");
  assert.match(seller.html, /data-react-public-ui="seller"/);
  assert.match(seller.html, /data-no-public-avm="true"/);

  const contact = renderAppRoute({ pathname: "/he/contact", url: "https://example.test/he/contact" });
  assert.equal(contact.status, 200);
  assert.equal(contact.rendered.kind, "contact");
  assert.match(contact.html, /data-react-public-ui="contact"/);
  assert.match(contact.html, /website_contact_callback/);

  const fallback = renderAppRoute({ pathname: "/fr/", url: "https://example.test/fr/" });
  assert.equal(fallback.status, 200);
  assert.equal(fallback.rendered.kind, "language_fallback");
  assert.match(fallback.html, /data-react-public-ui="language-fallback"/);
  assert.match(fallback.html, /noindex,follow/);

  const guide = renderAppRoute({ pathname: "/en/guides/foreign-buyers", url: "https://example.test/en/guides/foreign-buyers" });
  assert.equal(guide.status, 200);
  assert.equal(guide.rendered.kind, "guide");
  assert.match(guide.html, /data-react-public-ui="guide"/);
  assert.match(guide.html, /data-approved-source="cms"/);
  assert.match(guide.html, /aria-label="Guide actions"/);
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

test("App Router restores a legacy WordPress gallery without serving tiny derivatives", () => {
  const listing = renderAppRoute({
    pathname: "/ru/properties/MS-CRAWL-0114",
    url: "https://example.test/ru/properties/MS-CRAWL-0114",
  });

  assert.equal(listing.status, 200);
  assert.equal(listing.rendered.body.media.gallery_count, 10);
  assert.equal(listing.rendered.body.media.gallery.every((image) => !/-72x72\./.test(image.url)), true);
  assert.equal(listing.rendered.body.media.gallery.every((image) => !/-72x72\./.test(image.fallback_url || "")), true);
  assert.doesNotMatch(listing.html, /data-fallback-src="[^"]+-72x72\./);
  assert.equal((listing.html.match(/data-mobile-gallery-slide=/g) || []).length, 10);
  assert.match(listing.html, /data-mobile-gallery-progress="true" data-gallery-total="10"/);
});

test("App Router adapter serves approved sitemap, robots text, and favicon", async () => {
  const sitemap = renderAppSitemap();
  assert.equal(sitemap.status, 200);
  assert.equal(sitemap.headers["content-type"], "application/xml; charset=utf-8");
  assert.equal(sitemap.sitemap.summary.entries, 198);
  assert.match(sitemap.body, /<loc>https:\/\/makler-realty.com\/he<\/loc>/);
  assert.match(sitemap.body, /\/he\/properties\/MS-CRAWL-0001/);
  assert.match(sitemap.body, /\/en\/guides\/foreign-buyers/);
  assert.doesNotMatch(sitemap.body, /\/el\/akinita\/MS-CRAWL-0001/);
  assert.doesNotMatch(sitemap.body, /\/fr\//);

  const robots = renderAppRobots();
  assert.equal(robots.status, 200);
  assert.equal(robots.headers["content-type"], "text/plain; charset=utf-8");
  assert.match(robots.body, /Sitemap: https:\/\/makler-realty.com\/sitemap.xml/);

  const favicon = renderAppFavicon();
  assert.equal(favicon.status, 200);
  assert.equal(favicon.headers["content-type"], "image/svg+xml; charset=utf-8");
  assert.match(favicon.body, /<svg/);
  assert.match(favicon.body, /#DB3E3E/);

  const sitemapRoute = await import("../../app/sitemap.xml/route.js");
  const robotsRoute = await import("../../app/robots.txt/route.js");
  const faviconRoute = await import("../../app/favicon.ico/route.js");
  assert.equal((await sitemapRoute.GET()).headers.get("content-type"), "application/xml; charset=utf-8");
  assert.equal((await robotsRoute.GET()).headers.get("content-type"), "text/plain; charset=utf-8");
  assert.equal((await faviconRoute.GET()).headers.get("content-type"), "image/svg+xml; charset=utf-8");
});

test("App Router serves reviewed legacy URLs as direct domain-aware redirects", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-app-redirect-"));
  const deployableRedirectOutputPath = path.join(directory, "deployable-redirects.json");
  fs.writeFileSync(
    deployableRedirectOutputPath,
    `${JSON.stringify({
      decisions: [
        {
          old_url: "https://makler-realty.com/listing/reviewed-legacy/",
          status: 301,
          target_path: "/bg/imoti/MS-CRAWL-0001",
        },
      ],
    })}\n`,
  );
  const config = { ...appRouterConfigFromEnv(), deployableRedirectOutputPath };

  const response = renderAppRouteResponse({
    pathname: "/listing/reviewed-legacy/",
    url: "http://app:3000/listing/reviewed-legacy/",
    host: "makler-realty.com:443",
    config,
  });
  const wrongDomain = renderAppRouteResponse({
    pathname: "/listing/reviewed-legacy/",
    url: "http://app:3000/listing/reviewed-legacy/",
    host: "example.test",
    config,
  });
  const canonicalHome = renderAppRouteResponse({
    pathname: "/he/",
    url: "http://app:3000/he/?from=legacy-link",
    host: "makler-realty.com",
    config,
  });

  assert.equal(response.status, 301);
  assert.equal(response.headers.get("location"), "/bg/imoti/MS-CRAWL-0001");
  assert.equal(wrongDomain.status, 404);
  assert.equal(canonicalHome.status, 308);
  assert.equal(canonicalHome.headers.get("location"), "/he?from=legacy-link");
});
