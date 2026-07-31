import { renderHtmlPage } from "./html.mjs";
import { renderReactPublicBody } from "./react-public-site.mjs";
import { loadLocaleRegistry } from "./locales.mjs";
import { loadCmsSeed, renderRuntimePath, searchRuntimeListings } from "./runtime.mjs";
import { DEFAULT_BROKER_CONTACT_LEDGER_PATH, readBrokerContacts } from "./broker-contacts.mjs";
import { DEFAULT_LISTING_EDIT_LEDGER_PATH, applyListingEdits, readListingEdits } from "./listing-edits.mjs";
import { DEFAULT_MEDIA_REVIEW_LEDGER_PATH, applyMediaReviews, readMediaReviews } from "./media-reviews.mjs";
import { normalizeSearchRequest } from "./search-request.mjs";
import { buildRuntimeLocalizedSitemap, renderRobotsTxt, renderSitemapXml } from "./seo-files.mjs";
import { DEFAULT_TOUR_APPROVAL_LEDGER_PATH, readTourApprovals } from "./tours.mjs";
import { DEFAULT_TRANSLATION_LEDGER_PATH, readTranslationLedger } from "./translation-ledger.mjs";
import { renderFaviconSvg } from "./favicon.mjs";
import { DEFAULT_DEPLOYABLE_REDIRECTS_OUTPUT, loadLegacyRouteDecisions } from "./redirect-approvals.mjs";
import { fileSignature, readThroughCached } from "./file-cache.mjs";
import { fromRoot } from "./paths.mjs";
import { DEFAULT_CMS_SEED_PATH } from "./runtime.mjs";
import { CSP_HEADER } from "./security-headers.mjs";
import {
  executePublicSearch,
  PublicSearchInputError,
  PublicSearchUnavailableError,
  publicSearchConfigFromEnv,
} from "./public-search.mjs";
import { publicSeedFor } from "./public-inventory.mjs";

const DEFAULT_LOCALE_REGISTRY_PATH = fromRoot("locales", "registry.json");

const PUBLIC_CACHE = "public, max-age=300, s-maxage=3600";
const HTML = "text/html; charset=utf-8";

export function appRouterConfigFromEnv(env = process.env) {
  return {
    brokerContactLedgerPath: env.MS_REALTY_BROKER_CONTACT_LEDGER_PATH || DEFAULT_BROKER_CONTACT_LEDGER_PATH,
    cmsSeedPath: env.MS_REALTY_CMS_SEED_PATH || DEFAULT_CMS_SEED_PATH,
    deployableRedirectOutputPath: env.MS_REALTY_DEPLOYABLE_REDIRECTS_OUTPUT_PATH || DEFAULT_DEPLOYABLE_REDIRECTS_OUTPUT,
    listingEditLedgerPath: env.MS_REALTY_LISTING_EDIT_LEDGER_PATH || DEFAULT_LISTING_EDIT_LEDGER_PATH,
    mediaReviewLedgerPath: env.MS_REALTY_MEDIA_REVIEW_LEDGER_PATH || DEFAULT_MEDIA_REVIEW_LEDGER_PATH,
    localeRegistryPath: env.MS_REALTY_LOCALE_REGISTRY_PATH,
    tourApprovalLedgerPath: env.MS_REALTY_TOUR_APPROVAL_LEDGER_PATH || DEFAULT_TOUR_APPROVAL_LEDGER_PATH,
    translationLedgerPath: env.MS_REALTY_TRANSLATION_LEDGER_PATH || DEFAULT_TRANSLATION_LEDGER_PATH,
    search: publicSearchConfigFromEnv(env),
    naturalLanguageSearchEnabled: env.MS_REALTY_SEARCH_NL_INTENT_ENABLED === "true",
  };
}

let legacyDecisionIndex = { key: null, byOldUrl: new Map() };

function legacyDecisionByOldUrl(config) {
  const filePath = config.deployableRedirectOutputPath;
  const key = fileSignature(filePath);
  if (key !== null && legacyDecisionIndex.key === key) return legacyDecisionIndex.byOldUrl;
  const rows = readThroughCached(filePath, () => loadLegacyRouteDecisions(filePath));
  const byOldUrl = new Map(rows.map((row) => [row.old_url, row]));
  if (key !== null) legacyDecisionIndex = { key, byOldUrl };
  return byOldUrl;
}

function legacyDecisionFor({ pathname, url, host, config }) {
  const requestedHost = String(host || "")
    .split(",")[0]
    .trim()
    .replace(/:\d+$/, "")
    .toLowerCase();
  if (!requestedHost) return null;
  const requestUrl = new URL(url, "http://localhost");
  const oldUrl = `https://${requestedHost}${pathname}${requestUrl.search}`;
  return legacyDecisionByOldUrl(config).get(oldUrl) || null;
}

function searchLocaleFor(registry, pathname) {
  const normalized = pathname.replace(/\/$/, "");
  return registry.locales.find((locale) => `/${locale.code}/${locale.route_segments?.search}` === normalized) || null;
}

function currentRegistry(config) {
  const filePath = config.localeRegistryPath || DEFAULT_LOCALE_REGISTRY_PATH;
  return readThroughCached(filePath, () => loadLocaleRegistry(filePath));
}

export function isAppSearchPath({ pathname, config = appRouterConfigFromEnv() } = {}) {
  return Boolean(pathname && searchLocaleFor(currentRegistry(config), pathname));
}

function currentPublicSeed(config) {
  const seed = readThroughCached(config.cmsSeedPath, () => loadCmsSeed(config.cmsSeedPath));
  return publicSeedFor(applyMediaReviews(
    applyListingEdits(
      seed,
      readThroughCached(config.listingEditLedgerPath, () => readListingEdits(config.listingEditLedgerPath)),
    ),
    readThroughCached(config.mediaReviewLedgerPath, () => readMediaReviews(config.mediaReviewLedgerPath)),
  ));
}

function currentTranslationTasks(config) {
  return readThroughCached(config.translationLedgerPath, () => readTranslationLedger(config.translationLedgerPath));
}

function renderedHtmlResponse(rendered, requestUrl) {
  const print = requestUrl.searchParams.get("print") === "1";
  const reactBody = print ? "" : renderReactPublicBody(rendered);
  const html = renderHtmlPage(rendered, { bodyHtml: reactBody, print });

  return {
    status: rendered.status || 200,
    headers: {
      "content-type": HTML,
      ...CSP_HEADER,
      "cache-control": rendered.kind === "search" ? "no-store" : PUBLIC_CACHE,
    },
    rendered,
    html,
  };
}

export function renderAppRoute({ pathname, url = pathname, config = appRouterConfigFromEnv() } = {}) {
  if (!pathname) throw new Error("App route pathname is required");

  const registry = currentRegistry(config);
  const seed = currentPublicSeed(config);
  const requestUrl = new URL(url, "http://localhost");
  const translationTasks = currentTranslationTasks(config);
  const searchLocale = searchLocaleFor(registry, pathname);
  const savedView = requestUrl.searchParams.get("saved") === "1";
  const searchRequest = searchLocale
    ? normalizeSearchRequest(requestUrl.searchParams, {
        defaultLocale: searchLocale.code,
        naturalLanguageEnabled: config.naturalLanguageSearchEnabled === true,
      })
    : null;
  const rendered = searchLocale
    ? searchRuntimeListings(registry, seed, {
        localeCode: searchRequest.intent.locale,
        query: searchRequest.query,
        filters: searchRequest.filters,
        sort: searchRequest.sort,
        page: searchRequest.page,
        pageSize: savedView ? null : 12,
        savedView,
        translationTasks,
      })
    : renderRuntimePath(
        registry,
        seed,
        pathname,
        translationTasks,
        readThroughCached(config.brokerContactLedgerPath, () => readBrokerContacts(config.brokerContactLedgerPath)),
        readThroughCached(config.tourApprovalLedgerPath, () => readTourApprovals(config.tourApprovalLedgerPath)),
      );
  return renderedHtmlResponse(rendered, requestUrl);
}

export async function renderAppSearchRoute({ pathname, url = pathname, config = appRouterConfigFromEnv() } = {}) {
  if (!pathname) throw new Error("App route pathname is required");

  const registry = currentRegistry(config);
  const searchLocale = searchLocaleFor(registry, pathname);
  if (!searchLocale) throw new PublicSearchInputError("Localized search route is required");

  const requestUrl = new URL(url, "http://localhost");
  const savedView = requestUrl.searchParams.get("saved") === "1";
  const search = config.search || {
    naturalLanguageEnabled: config.naturalLanguageSearchEnabled === true,
  };
  const { result } = await executePublicSearch({
    registry,
    seed: currentPublicSeed(config),
    params: requestUrl.searchParams,
    defaultLocale: searchLocale.code,
    search,
    translationTasks: currentTranslationTasks(config),
    pageSize: savedView ? null : 12,
    savedView,
  });

  return renderedHtmlResponse(result, requestUrl);
}

export function renderAppRouteResponse({ pathname, url = pathname, host = "", config = appRouterConfigFromEnv() } = {}) {
  const legacyDecision = legacyDecisionFor({ pathname, url, host, config });
  if (legacyDecision?.status === 301) {
    return new Response(null, {
      status: 301,
      headers: { location: legacyDecision.target_path, "cache-control": PUBLIC_CACHE },
    });
  }
  if (legacyDecision?.status === 410) {
    return new Response("Gone", { status: 410, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": PUBLIC_CACHE } });
  }
  if (legacyDecision?.status === 200) {
    pathname = legacyDecision.target_path;
  }
  let result;
  try {
    result = renderAppRoute({ pathname, url, config });
  } catch (error) {
    return new Response(JSON.stringify({ kind: "bad_request", message: error.message }), {
      status: 400,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  }
  if (result.status === 200 && pathname.length > 1 && pathname.endsWith("/")) {
    return new Response(null, {
      status: 308,
      headers: { location: `${pathname.replace(/\/+$/, "")}${new URL(url, "http://localhost").search}`, "cache-control": PUBLIC_CACHE },
    });
  }
  return new Response(result.html, { status: result.status, headers: result.headers });
}

export async function renderAppSearchRouteResponse({ pathname, url = pathname, host = "", config = appRouterConfigFromEnv() } = {}) {
  const legacyDecision = legacyDecisionFor({ pathname, url, host, config });
  if (legacyDecision?.status === 301) {
    return new Response(null, {
      status: 301,
      headers: { location: legacyDecision.target_path, "cache-control": PUBLIC_CACHE },
    });
  }
  if (legacyDecision?.status === 410) {
    return new Response("Gone", { status: 410, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": PUBLIC_CACHE } });
  }
  if (legacyDecision?.status === 200) {
    return renderAppRouteResponse({ pathname: legacyDecision.target_path, url, config });
  }

  let result;
  try {
    result = await renderAppSearchRoute({ pathname, url, config });
  } catch (error) {
    if (error instanceof PublicSearchUnavailableError) {
      return new Response(JSON.stringify({ kind: "search_unavailable", message: "Search is temporarily unavailable" }), {
        status: 503,
        headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
      });
    }
    return new Response(JSON.stringify({ kind: "bad_request", message: error.message }), {
      status: 400,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  }
  if (result.status === 200 && pathname.length > 1 && pathname.endsWith("/")) {
    return new Response(null, {
      status: 308,
      headers: { location: `${pathname.replace(/\/+$/, "")}${new URL(url, "http://localhost").search}`, "cache-control": PUBLIC_CACHE },
    });
  }
  return new Response(result.html, { status: result.status, headers: result.headers });
}

export function renderAppSitemap({ config = appRouterConfigFromEnv() } = {}) {
  const sitemap = buildRuntimeLocalizedSitemap(currentRegistry(config), currentPublicSeed(config), currentTranslationTasks(config));
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
