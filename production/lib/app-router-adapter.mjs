import { renderHtmlPage } from "./html.mjs";
import { renderReactPublicBody } from "./react-public-site.mjs";
import { loadLocaleRegistry } from "./locales.mjs";
import { loadCmsSeed, renderRuntimePath, searchRuntimeListings } from "./runtime.mjs";
import { DEFAULT_BROKER_CONTACT_LEDGER_PATH, readBrokerContacts } from "./broker-contacts.mjs";
import { DEFAULT_LISTING_EDIT_LEDGER_PATH, applyListingEdits, readListingEdits } from "./listing-edits.mjs";
import { searchFiltersFromParams } from "./search-filters.mjs";
import { buildRuntimeLocalizedSitemap, renderRobotsTxt, renderSitemapXml } from "./seo-files.mjs";
import { DEFAULT_TOUR_APPROVAL_LEDGER_PATH, readTourApprovals } from "./tours.mjs";
import { DEFAULT_TRANSLATION_LEDGER_PATH, readTranslationLedger } from "./translation-ledger.mjs";
import { renderFaviconSvg } from "./favicon.mjs";

const PUBLIC_CACHE = "public, max-age=300, s-maxage=3600";
const HTML = "text/html; charset=utf-8";

export function appRouterConfigFromEnv(env = process.env) {
  return {
    brokerContactLedgerPath: env.MS_REALTY_BROKER_CONTACT_LEDGER_PATH || DEFAULT_BROKER_CONTACT_LEDGER_PATH,
    listingEditLedgerPath: env.MS_REALTY_LISTING_EDIT_LEDGER_PATH || DEFAULT_LISTING_EDIT_LEDGER_PATH,
    localeRegistryPath: env.MS_REALTY_LOCALE_REGISTRY_PATH,
    tourApprovalLedgerPath: env.MS_REALTY_TOUR_APPROVAL_LEDGER_PATH || DEFAULT_TOUR_APPROVAL_LEDGER_PATH,
    translationLedgerPath: env.MS_REALTY_TRANSLATION_LEDGER_PATH || DEFAULT_TRANSLATION_LEDGER_PATH,
  };
}

function searchLocaleFor(registry, pathname) {
  const normalized = pathname.replace(/\/$/, "");
  return registry.locales.find((locale) => `/${locale.code}/${locale.route_segments?.search}` === normalized) || null;
}

function currentRegistry(config) {
  return loadLocaleRegistry(config.localeRegistryPath);
}

function currentSeed(config) {
  return applyListingEdits(loadCmsSeed(), readListingEdits(config.listingEditLedgerPath));
}

function currentTranslationTasks(config) {
  return readTranslationLedger(config.translationLedgerPath);
}

export function renderAppRoute({ pathname, url = pathname, config = appRouterConfigFromEnv() } = {}) {
  if (!pathname) throw new Error("App route pathname is required");

  const registry = currentRegistry(config);
  const seed = currentSeed(config);
  const requestUrl = new URL(url, "http://localhost");
  const translationTasks = currentTranslationTasks(config);
  const searchLocale = searchLocaleFor(registry, pathname);
  const rendered = searchLocale
    ? searchRuntimeListings(registry, seed, {
        localeCode: searchLocale.code,
        query: requestUrl.searchParams.get("q") || "",
        filters: searchFiltersFromParams(requestUrl.searchParams),
        translationTasks,
      })
    : renderRuntimePath(
        registry,
        seed,
        pathname,
        translationTasks,
        readBrokerContacts(config.brokerContactLedgerPath),
        readTourApprovals(config.tourApprovalLedgerPath),
      );
  const print = requestUrl.searchParams.get("print") === "1";
  const reactBody = print ? "" : renderReactPublicBody(rendered);
  const html = renderHtmlPage(rendered, { bodyHtml: reactBody, print });

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

export function renderAppRouteResponse({ pathname, url = pathname, config = appRouterConfigFromEnv() } = {}) {
  const result = renderAppRoute({ pathname, url, config });
  return new Response(result.html, { status: result.status, headers: result.headers });
}

export function renderAppSitemap({ config = appRouterConfigFromEnv() } = {}) {
  const sitemap = buildRuntimeLocalizedSitemap(currentRegistry(config), currentSeed(config), currentTranslationTasks(config));
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

export function renderAppFavicon() {
  return {
    status: 200,
    headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "public, max-age=86400" },
    body: renderFaviconSvg(),
  };
}

export function renderAppSitemapResponse({ config = appRouterConfigFromEnv() } = {}) {
  const result = renderAppSitemap({ config });
  return new Response(result.body, { status: result.status, headers: result.headers });
}

export function renderAppRobotsResponse() {
  const result = renderAppRobots();
  return new Response(result.body, { status: result.status, headers: result.headers });
}

export function renderAppFaviconResponse() {
  const result = renderAppFavicon();
  return new Response(result.body, { status: result.status, headers: result.headers });
}
