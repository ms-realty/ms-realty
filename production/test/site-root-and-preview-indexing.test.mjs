import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fromRoot } from "../lib/paths.mjs";
import { loadLocaleRegistry, siteRootRedirectTarget } from "../lib/locales.mjs";
import {
  renderAppRobotsResponse,
  renderAppRouteResponse,
  renderAppSitemapResponse,
  renderAppSiteRoot,
  renderAppSiteRootResponse,
} from "../lib/app-router-adapter.mjs";
import { CANONICAL_PUBLIC_ORIGIN, FALLBACK_PUBLIC_ORIGIN, publicOriginForHost } from "../lib/public-origin.mjs";
import {
  CANONICAL_PUBLIC_HOST,
  PREVIEW_NOINDEX,
  canonicalLegacyHost,
  isCanonicalPublicHost,
  isPreviewHost,
  isProductionPublicHost,
  mediaCandidateKeys,
} from "../../workers/preview-host.mjs";
import { responseForCanonicalPublicIndex } from "../../workers/origin-proxy.mjs";

const workerSource = fs.readFileSync(fromRoot("workers", "index.js"), "utf8");

test("the site root resolves instead of 404ing", () => {
  const result = renderAppSiteRoot();
  assert.equal(result.status, 308);
  assert.equal(result.headers.location, "/bg");
});

test("the root target is a single hop: /bg, not the registry x_default /bg/", () => {
  const registry = loadLocaleRegistry();
  assert.equal(registry.x_default, "/bg/");
  // "/bg/" would redirect again to "/bg"; §13 allows no chain longer than one hop.
  assert.equal(siteRootRedirectTarget(registry), "/bg");
  assert.equal(siteRootRedirectTarget({ source_locale: "en" }), "/en");
});

test("both runtimes serve the root redirect", () => {
  assert.ok(fs.existsSync(fromRoot("app", "route.js")), "Next needs app/route.js for /");
  const httpSource = fs.readFileSync(fromRoot("production", "lib", "http.mjs"), "utf8");
  assert.match(httpSource, /url\.pathname === "\/"\) \{\n\s+const location = siteRootRedirectTarget/);
});

test("the Next root serves the approved apex retain_200 content without changing other hosts", async () => {
  const route = await import("../../app/route.js");
  const request = (url, host) =>
    new Request(url, {
      headers: { accept: "text/html", "x-forwarded-host": host },
    });

  for (const url of ["https://makler-realty.com", "https://makler-realty.com/"]) {
    const response = await route.GET(request(url, "makler-realty.com"));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("location"), null);
    assert.match(await response.text(), /<html[^>]*lang="bg"/);
  }

  const worker = await route.GET(request("https://ms-realty.ms-realty-bg.workers.dev/", "ms-realty.ms-realty-bg.workers.dev"));
  assert.equal(worker.status, 308);
  assert.equal(worker.headers.get("location"), "/bg");

  const www = await route.GET(request("https://www.makler-realty.com/", "www.makler-realty.com"));
  assert.equal(www.status, 308);
  assert.equal(www.headers.get("location"), "/bg");

  const legacyRu = await route.GET(request("https://makler-realty.ru/", "makler-realty.ru"));
  assert.equal(legacyRu.status, 308);
  assert.equal(legacyRu.headers.get("location"), "/bg");
});

test("the shared root response renders the same page as its retain_200 target", async () => {
  const retained = renderAppSiteRootResponse({
    url: "http://app:3000/",
    host: "makler-realty.com:443",
    accept: "text/html",
  });
  const target = renderAppRouteResponse({ pathname: "/bg", url: "http://app:3000/bg", accept: "text/html" });
  const canonicalTarget = renderAppRouteResponse({
    pathname: "/bg",
    url: "http://app:3000/bg",
    host: "makler-realty.com",
    accept: "text/html",
  });
  assert.equal(retained.status, 200);
  assert.equal(retained.headers.get("location"), null);
  assert.notEqual(await target.text(), await canonicalTarget.clone().text());
  assert.equal(await retained.text(), await canonicalTarget.text());
});

test("the canonical host owns public metadata without trusting arbitrary Host values", async () => {
  assert.equal(CANONICAL_PUBLIC_HOST, new URL(CANONICAL_PUBLIC_ORIGIN).hostname);
  assert.equal(publicOriginForHost("makler-realty.com:443"), CANONICAL_PUBLIC_ORIGIN);
  assert.equal(publicOriginForHost("WWW.MAKLER-REALTY.COM."), CANONICAL_PUBLIC_ORIGIN);
  assert.equal(publicOriginForHost("makler-realty.com.evil.example"), FALLBACK_PUBLIC_ORIGIN);
  assert.equal(publicOriginForHost("ms-realty.ms-realty-bg.workers.dev"), FALLBACK_PUBLIC_ORIGIN);
  assert.equal(isCanonicalPublicHost("MAKLER-REALTY.COM."), true);

  const canonical = renderAppRouteResponse({
    pathname: "/bg",
    url: "http://app:3000/bg",
    host: "makler-realty.com",
    accept: "text/html",
  });
  const html = await canonical.text();
  const head = html.match(/<head>[\s\S]*?<\/head>/)?.[0] || "";
  assert.match(head, /<link rel="canonical" href="https:\/\/makler-realty\.com\/bg">/);
  assert.match(head, /<meta property="og:url" content="https:\/\/makler-realty\.com\/bg">/);
  assert.doesNotMatch(head, /ms-realty\.ms-realty-bg\.workers\.dev/);

  const listing = renderAppRouteResponse({
    pathname: "/bg/imoti/MS-CRAWL-0001",
    url: "http://app:3000/bg/imoti/MS-CRAWL-0001",
    host: "makler-realty.com",
    accept: "text/html",
  });
  const listingHtml = await listing.text();
  const schema = JSON.parse(listingHtml.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1] || "null");
  assert.match(schema.url, /^https:\/\/makler-realty\.com\//);
  assert.match(schema["@id"], /^https:\/\/makler-realty\.com\//);

  const worker = renderAppRouteResponse({
    pathname: "/bg",
    url: "http://app:3000/bg",
    host: "ms-realty.ms-realty-bg.workers.dev",
    accept: "text/html",
  });
  assert.match(await worker.text(), /<link rel="canonical" href="https:\/\/ms-realty\.ms-realty-bg\.workers\.dev\/bg">/);
});

test("robots and sitemap use the request's allowlisted public authority", async () => {
  const robots = await renderAppRobotsResponse({ host: "makler-realty.com" }).text();
  assert.match(robots, /Sitemap: https:\/\/makler-realty\.com\/sitemap\.xml/);
  assert.doesNotMatch(robots, /workers\.dev/);

  const sitemap = await renderAppSitemapResponse({ host: "makler-realty.com" }).text();
  assert.match(sitemap, /<loc>https:\/\/makler-realty\.com\/bg<\/loc>/);
  assert.doesNotMatch(sitemap, /workers\.dev/);
});

test("the edge removes review noindex only from canonical public documents", async () => {
  const response = () =>
    new Response("<html></html>", {
      headers: { "content-type": "text/html; charset=utf-8", "x-robots-tag": PREVIEW_NOINDEX },
    });
  assert.equal(
    responseForCanonicalPublicIndex(response(), { hostname: "makler-realty.com", pathname: "/bg" }).headers.get("x-robots-tag"),
    null,
  );
  assert.equal(
    responseForCanonicalPublicIndex(response(), { hostname: "makler-realty.com", pathname: "/admin/login" }).headers.get("x-robots-tag"),
    PREVIEW_NOINDEX,
  );
  assert.equal(
    responseForCanonicalPublicIndex(response(), {
      hostname: "ms-realty.ms-realty-bg.workers.dev",
      pathname: "/bg",
    }).headers.get("x-robots-tag"),
    PREVIEW_NOINDEX,
  );
});

test("only isolated *.workers.dev hosts count as preview hosts", () => {
  assert.equal(isProductionPublicHost("ms-realty.ms-realty-bg.workers.dev"), true);
  assert.equal(isProductionPublicHost("MS-REALTY.MS-REALTY-BG.WORKERS.DEV."), true);
  assert.equal(isPreviewHost("ms-realty.ms-realty-bg.workers.dev"), false);
  assert.equal(isPreviewHost("MS-REALTY.MS-REALTY-BG.WORKERS.DEV"), false);
  assert.equal(isPreviewHost("msr-monitoring-drill-123.account.workers.dev"), true);
  assert.equal(isPreviewHost("makler-realty.com"), false);
  assert.equal(isPreviewHost("makler-realty.ru"), false);
  // Not a suffix match on a lookalike domain.
  assert.equal(isPreviewHost("evil-workers.dev"), false);
  assert.equal(isPreviewHost(""), false);
  assert.equal(isPreviewHost(undefined), false);
});

test("www legacy hosts canonicalize to the approved apex route contract", () => {
  assert.equal(canonicalLegacyHost("WWW.MAKLER-REALTY.COM."), "makler-realty.com");
  assert.equal(canonicalLegacyHost("www.makler-realty.ru"), "makler-realty.ru");
  assert.equal(canonicalLegacyHost("mail.makler-realty.com"), "");
  assert.match(workerSource, /return Response\.redirect\(url, 301\);/);
});

test("the Worker noindexes isolated drills and applies canonical public indexing at the edge", () => {
  assert.equal(PREVIEW_NOINDEX, "noindex, nofollow, noarchive");
  assert.match(workerSource, /const preview = isPreviewHost\(url\.hostname\);/);
  assert.match(workerSource, /if \(preview && url\.pathname === "\/robots\.txt"\) return previewRobotsResponse\(\);/);
  assert.match(workerSource, /withPreviewNoindex\(response\)/);
  assert.match(workerSource, /responseForCanonicalPublicIndex\(response, \{ hostname: url\.hostname, pathname: url\.pathname \}\)/);
  assert.match(workerSource, /"User-agent: \*\\nDisallow: \/\\n"/);
});

test("the normalized production host reads newly uploaded workers.dev media first", () => {
  assert.deepEqual(mediaCandidateKeys("MS-REALTY.MS-REALTY-BG.WORKERS.DEV.", "/wp-content/uploads/new.jpg"), [
    "ms-realty.ms-realty-bg.workers.dev/wp-content/uploads/new.jpg",
    "makler-realty.com/wp-content/uploads/new.jpg",
    "makler-realty.ru/wp-content/uploads/new.jpg",
  ]);
});
