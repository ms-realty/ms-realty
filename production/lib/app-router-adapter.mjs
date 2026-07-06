import { renderHtmlPage } from "./html.mjs";
import { loadLocaleRegistry } from "./locales.mjs";
import { loadCmsSeed, renderRuntimePath, searchRuntimeListings } from "./runtime.mjs";
import { readBrokerContacts } from "./broker-contacts.mjs";
import { searchFiltersFromParams } from "./search-filters.mjs";
import { buildRuntimeLocalizedSitemap, renderRobotsTxt, renderSitemapXml } from "./seo-files.mjs";
import { readTourApprovals } from "./tours.mjs";
import { readTranslationLedger } from "./translation-ledger.mjs";

const PUBLIC_CACHE = "public, max-age=300, s-maxage=3600";
const HTML = "text/html; charset=utf-8";

function searchLocaleFor(registry, pathname) {
  const normalized = pathname.replace(/\/$/, "");
  return registry.locales.find((locale) => `/${locale.code}/${locale.route_segments?.search}` === normalized) || null;
}

export function renderAppRoute({ pathname, url = pathname } = {}) {
  if (!pathname) throw new Error("App route pathname is required");

  const registry = loadLocaleRegistry();
  const seed = loadCmsSeed();
  const requestUrl = new URL(url, "http://localhost");
  const translationTasks = readTranslationLedger();
  const searchLocale = searchLocaleFor(registry, pathname);
  const rendered = searchLocale
    ? searchRuntimeListings(registry, seed, {
        localeCode: searchLocale.code,
        query: requestUrl.searchParams.get("q") || "",
        filters: searchFiltersFromParams(requestUrl.searchParams),
        translationTasks,
      })
    : renderRuntimePath(registry, seed, pathname, translationTasks, readBrokerContacts(), readTourApprovals());
  const html = renderHtmlPage(rendered, { print: requestUrl.searchParams.get("print") === "1" });

  return {
    status: rendered.status || 200,
    headers: {
      "content-type": HTML,
      "cache-control": rendered.kind === "search" ? "no-store" : PUBLIC_CACHE,
    },
    rendered,
    html,
  };
}

export function renderAppRouteResponse({ pathname, url = pathname } = {}) {
  const result = renderAppRoute({ pathname, url });
  return new Response(result.html, { status: result.status, headers: result.headers });
}

export function renderAppSitemap() {
  const sitemap = buildRuntimeLocalizedSitemap(loadLocaleRegistry(), loadCmsSeed(), readTranslationLedger());
  return {
    status: 200,
    headers: { "content-type": "application/xml; charset=utf-8", "cache-control": PUBLIC_CACHE },
    sitemap,
    body: renderSitemapXml(sitemap),
  };
}

export function renderAppRobots() {
  return {
    status: 200,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": PUBLIC_CACHE },
    body: renderRobotsTxt(),
  };
}

export function renderAppSitemapResponse() {
  const result = renderAppSitemap();
  return new Response(result.body, { status: result.status, headers: result.headers });
}

export function renderAppRobotsResponse() {
  const result = renderAppRobots();
  return new Response(result.body, { status: result.status, headers: result.headers });
}
