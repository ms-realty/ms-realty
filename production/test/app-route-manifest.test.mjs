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
  renderAppSearchRoute,
  renderAppSitemap,
} from "../lib/app-router-adapter.mjs";
import { loadLocaleRegistry } from "../lib/locales.mjs";
import { fromRoot } from "../lib/paths.mjs";
import { loadLegacyArchive } from "../lib/legacy-archive.mjs";
import { absolutePublicUrl } from "../lib/public-origin.mjs";
import { publicSeedFor } from "../lib/public-inventory.mjs";
import { loadCmsSeed } from "../lib/runtime.mjs";
import { approvedPublicSeedFixtureEnv, durableLeadStoreFixtureEnv } from "./approved-public-seed.fixture.mjs";

const registry = loadLocaleRegistry();
Object.assign(process.env, durableLeadStoreFixtureEnv());
const approvedConfig = appRouterConfigFromEnv({ ...process.env, ...approvedPublicSeedFixtureEnv() });
const approvedPublicListingIds = new Set(
  publicSeedFor(loadCmsSeed(approvedConfig.cmsSeedPath)).records
    .filter((record) => record.collection === "listings")
    .map((record) => record.id),
);

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
  const sitemap = JSON.parse(fs.readFileSync(fromRoot("production", "data", "localized-sitemap.json"), "utf8"));
  assert.equal(assertAppRouteManifest(manifest), true);
  assert.equal(manifest.summary.routes, 204);
  assert.equal(manifest.summary.eligible_routes, sitemap.summary.entries);
  assert.equal(manifest.summary.sitemap_indexable_routes, sitemap.summary.public.entries);
  assert.equal(manifest.summary.by_type.search, 7);
  assert.equal(manifest.summary.by_type.guide, 5);
  assert.equal(manifest.routes.some((route) => route.path.startsWith("/fr/")), false);
  assert.equal(assertAppRouteFiles(manifest), true);
});

test("every manifest page renders a complete public content contract", () => {
  const manifest = JSON.parse(fs.readFileSync(fromRoot("production", "data", "app-route-manifest.json"), "utf8"));

  for (const route of manifest.routes) {
    const page = renderAppRoute({ pathname: route.path, url: `https://audit.test${route.path}`, config: approvedConfig });
    const label = `${route.type} ${route.path}`;
    assert.equal(page.status, 200, `${label} must render`);
    if (route.type === "listing" && !approvedPublicListingIds.has(route.params.listingId)) {
      assert.equal(page.rendered.kind, "listing_preservation", `${label} must preserve its approved URL without inventing facts`);
      assert.equal(page.rendered.indexable, false);
      assert.match(page.html, /<meta name="robots" content="noindex,follow">/);
      assert.match(page.html, /data-react-public-ui="listing-preservation"/);
      continue;
    }
    assert.equal(page.rendered.kind, route.type, `${label} must use its declared renderer`);
    assert.equal(page.rendered.indexable, route.public_indexable, `${label} must match its sitemap indexability`);
    assert.match(page.html, /<title>\s*[^<\s]/, `${label} must have a title`);
    assert.match(page.html, /<meta name="description" content="[^"\s]/, `${label} must have a description`);
    assert.match(page.html, /<h1(?:\s[^>]*)?>\s*[^<\s]/, `${label} must have an H1`);
    assert.match(page.html, new RegExp(`data-react-public-ui="${route.type}"`), `${label} must render its public shell`);
  }
});

test("App Router adapter renders home, search, listing, and RTL HTML", () => {
  const home = renderAppRoute({ pathname: "/he/", url: "https://example.test/he/", config: approvedConfig });
  assert.equal(home.status, 200);
  assert.equal(home.headers["cache-control"], "public, max-age=300, s-maxage=3600");
  assert.match(home.html, /<html lang="he" dir="rtl">/);
  assert.match(home.html, /data-react-public-ui="home"/);
  assert.match(home.html, /data-home-locations="true"/);
  assert.match(home.html, /\/he\/locations\/sandanski/);
  assert.match(home.html, /data-featured-listings="true"/);
  assert.match(home.html, /data-card-thumbnail="true"/);

  // A page that did not render is never shared-cacheable: the header used to be
  // chosen from the page kind alone, so a transient 404 was pinned in the CDN
  // and in every visitor's browser for an hour and did not heal when the
  // backend recovered.
  const missing = renderAppRoute({ pathname: "/he/properties/NOPE-9999", url: "https://example.test/he/properties/NOPE-9999", config: approvedConfig });
  assert.equal(missing.status, 404);
  assert.equal(missing.headers["cache-control"], "no-store");

  const search = renderAppRoute({ pathname: "/he/search", url: "https://example.test/he/search?q=sandanski&property_type=apartment", config: approvedConfig });
  assert.equal(search.status, 200);
  assert.equal(search.headers["cache-control"], "no-store");
  assert.equal(search.rendered.kind, "search");
  assert.equal(search.rendered.search.query, "sandanski");
  assert.match(search.html, /data-react-public-ui="search"/);

  const saved = renderAppRoute({ pathname: "/he/search", url: "https://example.test/he/search?saved=1", config: approvedConfig });
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
  assert.match(search.html, /data-filter-chip="property_family"/);
  assert.match(search.html, /data-card-thumbnail="true"/);
  assert.match(search.html, /<img src="https:\/\/makler-realty\./);
  assert.match(search.html, /defer src="\/vendor\/ms-realty-public\.js\?v=[a-f0-9]{12}"/);
  assert.match(search.html, /data-ms-realty-public-client/);
  assert.doesNotMatch(search.html, /function submitHermesChat/);

  const bgListing = renderAppRoute({ pathname: "/bg/imoti/MS-CRAWL-0001", url: "https://example.test/bg/imoti/MS-CRAWL-0001", config: approvedConfig });
  assert.equal(bgListing.status, 200);
  assert.match(bgListing.html, /Комплекс за дългосрочен наем/);
  assert.doesNotMatch(bgListing.html, /Updated approved source description\./);

  const listing = renderAppRoute({ pathname: "/he/properties/MS-CRAWL-0001", url: "https://example.test/he/properties/MS-CRAWL-0001", config: approvedConfig });
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
  assert.match(listing.html, /data-tour-status="needs_panorama_upload"/);
  assert.match(listing.html, /data-listing-action="back_to_results"/);
  assert.equal((listing.html.match(/<[^>]+data-compact-mobile-action="true"/g) || []).length, 3);
  assert.match(listing.html, /href="\/he\/search"/);
  assert.match(listing.html, /data-related-listings="true"/);
  assert.equal(listing.rendered.body.actions.direct_contact.review_status, "needs_broker_contact_review");
  assert.doesNotMatch(listing.html, /href="(?:tel:(?!\+359879696870")|https:\/\/wa\.me\/(?!359879696870)|viber:)/);

  const listingFallback = renderAppRoute({
    pathname: "/en/properties/MS-CRAWL-0001",
    url: "https://example.test/en/properties/MS-CRAWL-0001",
    config: approvedConfig,
  });
  assert.equal(listingFallback.status, 200);
  assert.equal(listingFallback.rendered.kind, "listing");
  assert.equal(listingFallback.rendered.fallback.active, false);
  assert.equal(listingFallback.rendered.body.content_locale, "en");
  assert.match(listingFallback.html, /Commercial complex for rent near Sandanski/);
  assert.match(listingFallback.html, /<meta name="robots" content="noindex,follow">/);

  const listingPrint = renderAppRoute({
    pathname: "/he/properties/MS-CRAWL-0001",
    url: "https://example.test/he/properties/MS-CRAWL-0001?print=1",
    config: approvedConfig,
  });
  assert.equal(listingPrint.status, 200);
  assert.doesNotMatch(listingPrint.html, /data-react-public-ui=/);
  assert.match(listingPrint.html, /data-kind="listing-print"/);

  const location = renderAppRoute({ pathname: "/he/locations/sandanski", url: "https://example.test/he/locations/sandanski", config: approvedConfig });
  assert.equal(location.status, 200);
  assert.equal(location.rendered.kind, "location");
  assert.match(location.html, /data-react-public-ui="location"/);
  assert.match(location.html, /data-location-listings="true"/);
  assert.match(location.html, /data-card-thumbnail="true"/);

  const fallbackLocation = renderAppRoute({
    pathname: "/en/locations/sandanski",
    url: "https://example.test/en/locations/sandanski",
    config: approvedConfig,
  });
  assert.equal(fallbackLocation.status, 200);
  assert.equal(fallbackLocation.rendered.indexable, false);
  assert.equal(fallbackLocation.rendered.cards.length > 0, true);
  assert.match(fallbackLocation.html, /<meta name="robots" content="noindex,follow">/);

  const seller = renderAppRoute({ pathname: "/he/sell", url: "https://example.test/he/sell", config: approvedConfig });
  assert.equal(seller.status, 200);
  assert.equal(seller.rendered.kind, "seller");
  assert.match(seller.html, /data-react-public-ui="seller"/);
  assert.match(seller.html, /data-no-public-avm="true"/);

  const contact = renderAppRoute({ pathname: "/he/contact", url: "https://example.test/he/contact", config: approvedConfig });
  assert.equal(contact.status, 200);
  assert.equal(contact.rendered.kind, "contact");
  assert.match(contact.html, /data-react-public-ui="contact"/);
  assert.match(contact.html, /website_contact_callback/);

  const fallback = renderAppRoute({ pathname: "/fr/", url: "https://example.test/fr/", config: approvedConfig });
  assert.equal(fallback.status, 200);
  assert.equal(fallback.rendered.kind, "language_fallback");
  assert.match(fallback.html, /data-react-public-ui="language-fallback"/);
  assert.match(fallback.html, /noindex,follow/);

  const guide = renderAppRoute({ pathname: "/en/guides/foreign-buyers", url: "https://example.test/en/guides/foreign-buyers", config: approvedConfig });
  assert.equal(guide.status, 200);
  assert.equal(guide.rendered.kind, "guide");
  assert.match(guide.html, /data-react-public-ui="guide"/);
  assert.match(guide.html, /data-approved-source="cms"/);
  assert.match(guide.html, /aria-label="Guide actions"/);
  assert.match(guide.html, /Non-EU buyers cannot own Bulgarian land directly/);
});

test("dedicated localized search renderer preserves configured engine hits", async () => {
  const config = {
    ...approvedConfig,
    search: {
      engine: "typesense",
      environment: "test",
      typesense: {
        baseUrl: "https://search.makler-realty.com",
        apiKey: "typesense-test",
        collectionName: "ms_realty_listings",
        lookupImpl: async () => [{ address: "1.1.1.1", family: 4 }],
      },
      meilisearch: {},
      fetchImpl: async () => new Response(JSON.stringify({
        found: 1,
        hits: [{ document: { id: "MS-CRAWL-0001:bg", source_listing_id: "MS-CRAWL-0001", locale: "bg" } }],
      }), { status: 200, headers: { "content-type": "application/json" } }),
    },
  };
  const search = await renderAppSearchRoute({
    pathname: "/bg/tarsene",
    url: "https://example.test/bg/tarsene?q=Sndanski",
    config,
  });

  assert.equal(search.status, 200);
  assert.equal(search.rendered.search.backend.engine, "typesense");
  assert.deepEqual(search.rendered.cards.map((card) => card.id), ["MS-CRAWL-0001"]);
  assert.match(search.html, /MS-CRAWL-0001/);
});

test("localized Next catch-all delegates configured search paths to the fail-closed search adapter", async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousSearchEngine = process.env.MS_REALTY_SEARCH_ENGINE;
  const previousTypesenseUrl = process.env.TYPESENSE_URL;
  const previousTypesenseKey = process.env.TYPESENSE_API_KEY;
  const previousDatabaseUrl = process.env.DATABASE_URL;
  const previousPayloadSecret = process.env.PAYLOAD_SECRET;
  process.env.NODE_ENV = "production";
  process.env.MS_REALTY_SEARCH_ENGINE = "typesense";
  delete process.env.TYPESENSE_URL;
  delete process.env.TYPESENSE_API_KEY;
  delete process.env.DATABASE_URL;
  delete process.env.PAYLOAD_SECRET;
  try {
    const { GET } = await import("../../app/[locale]/[...slug]/route.js");
    const response = await GET(new Request("https://example.test/bg/tarsene?q=Sandanski"));
    assert.equal(response.status, 503);
    assert.match(response.headers.get("content-type"), /text\/html/);
    const fallbackHtml = await response.text();
    assert.match(fallbackHtml, /data-kind="search-unavailable"/);
    assert.match(fallbackHtml, /tel:\+359879696870/);
    assert.equal(response.headers.get("cache-control"), "no-store");
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousSearchEngine === undefined) delete process.env.MS_REALTY_SEARCH_ENGINE;
    else process.env.MS_REALTY_SEARCH_ENGINE = previousSearchEngine;
    if (previousTypesenseUrl === undefined) delete process.env.TYPESENSE_URL;
    else process.env.TYPESENSE_URL = previousTypesenseUrl;
    if (previousTypesenseKey === undefined) delete process.env.TYPESENSE_API_KEY;
    else process.env.TYPESENSE_API_KEY = previousTypesenseKey;
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
    if (previousPayloadSecret === undefined) delete process.env.PAYLOAD_SECRET;
    else process.env.PAYLOAD_SECRET = previousPayloadSecret;
  }
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
    config: { ...approvedConfig, listingEditLedgerPath: editPath },
  });

  assert.equal(listing.status, 200);
  assert.match(listing.html, /Operator edited Sandanski listing/);
});

test("App Router restores a legacy WordPress gallery without serving tiny derivatives", () => {
  const listing = renderAppRoute({
    pathname: "/ru/properties/MS-CRAWL-0114",
    url: "https://example.test/ru/properties/MS-CRAWL-0114",
    config: approvedConfig,
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
  const sitemap = renderAppSitemap({ config: approvedConfig });
  const manifest = JSON.parse(fs.readFileSync(fromRoot("production", "data", "app-route-manifest.json"), "utf8"));
  const blockedListingRoutes = manifest.routes.filter(
    (route) => route.type === "listing" && !approvedPublicListingIds.has(route.params.listingId),
  );
  assert.equal(sitemap.status, 200);
  assert.equal(sitemap.headers["content-type"], "application/xml; charset=utf-8");
  assert.equal(sitemap.sitemap.summary.entries, manifest.summary.eligible_routes - blockedListingRoutes.length);
  // All source listings are published. Pending target-language translations
  // remain readable via the dynamic route but stay outside this sitemap.
  assert.equal(blockedListingRoutes.length, 0);
  assert.equal(approvedPublicListingIds.size, 165);
  assert.match(sitemap.body, /<loc>https:\/\/ms-realty\.ms-realty-bg\.workers\.dev\/he<\/loc>/);
  assert.match(sitemap.body, /\/bg\/imoti\/MS-CRAWL-0001/);
  assert.doesNotMatch(sitemap.body, /\/he\/properties\/MS-CRAWL-0001/);
  assert.match(sitemap.body, /\/en\/guides\/foreign-buyers/);
  assert.doesNotMatch(sitemap.body, /\/el\/akinita\/MS-CRAWL-0001/);
  assert.doesNotMatch(sitemap.body, /\/fr\//);

  const robots = renderAppRobots();
  assert.equal(robots.status, 200);
  assert.equal(robots.headers["content-type"], "text/plain; charset=utf-8");
  assert.match(robots.body, /Sitemap: https:\/\/ms-realty\.ms-realty-bg\.workers\.dev\/sitemap.xml/);

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
  const config = { ...appRouterConfigFromEnv(), launchFreezePath: null, deployableRedirectOutputPath };

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

test("App Router exposes only opaque noindex legacy archive captures", async () => {
  const entry = loadLegacyArchive().entries[0];
  const pathname = `/archive/${entry.archive_id}`;
  const archive = renderAppRoute({ pathname, url: `https://example.test${pathname}` });
  const sitemap = renderAppSitemap();
  const manifest = JSON.parse(fs.readFileSync(fromRoot("production", "data", "app-route-manifest.json"), "utf8"));
  const routeModule = await import("../../app/archive/[archiveId]/route.js");

  assert.equal(archive.status, 200);
  assert.equal(archive.rendered.kind, "legacy_archive");
  assert.equal(archive.rendered.indexable, false);
  assert.match(archive.html, /<meta name="robots" content="noindex,nofollow">/);
  assert.ok(archive.html.includes(`<link rel="canonical" href="${absolutePublicUrl(pathname)}">`));
  assert.match(archive.html, /data-react-public-ui="legacy-archive"/);
  assert.match(archive.html, /data-legacy-archive-source="true"/);
  assert.doesNotMatch(archive.html, /data-approved-source="cms"/);
  assert.doesNotMatch(sitemap.body, new RegExp(entry.archive_id));
  assert.equal(manifest.routes.some((route) => route.path === pathname), false);

  const forwarded = await routeModule.GET(new Request(`https://example.test${pathname}`));
  assert.equal(forwarded.status, 200);
  assert.match(await forwarded.text(), /data-react-public-ui="legacy-archive"/);
});

test("reviewed legacy redirects take priority over an archive capture", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-archive-redirect-"));
  const deployableRedirectOutputPath = path.join(directory, "deployable-redirects.json");
  const entry = loadLegacyArchive().entries[0];
  const pathname = `/archive/${entry.archive_id}`;
  fs.writeFileSync(
    deployableRedirectOutputPath,
    `${JSON.stringify({ decisions: [{ old_url: `https://makler-realty.com${pathname}`, status: 301, target_path: "/bg/imoti/MS-CRAWL-0001" }] })}\n`,
  );

  const response = renderAppRouteResponse({
    pathname,
    url: `http://app:3000${pathname}`,
    host: "makler-realty.com",
    config: { ...appRouterConfigFromEnv(), launchFreezePath: null, deployableRedirectOutputPath },
  });

  assert.equal(response.status, 301);
  assert.equal(response.headers.get("location"), "/bg/imoti/MS-CRAWL-0001");
});
