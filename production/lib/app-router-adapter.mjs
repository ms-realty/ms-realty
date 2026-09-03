import { searchPath } from "./seo.mjs";
import { renderHtmlPage } from "./html.mjs";
import { renderReactPublicBody } from "./react-public-site.mjs";
import { loadLocaleRegistry, siteRootRedirectTarget } from "./locales.mjs";
import { loadCmsSeed, renderOriginUnavailablePage, renderRuntimePath, renderSearchUnavailablePage, searchRuntimeListings } from "./runtime.mjs";
import { DEFAULT_BROKER_CONTACT_LEDGER_PATH, readBrokerContacts } from "./broker-contacts.mjs";
import { DEFAULT_LISTING_EDIT_LEDGER_PATH, applyListingEdits, readListingEdits } from "./listing-edits.mjs";
import { DEFAULT_MEDIA_REVIEW_LEDGER_PATH, applyMediaReviews, readMediaReviews } from "./media-reviews.mjs";
import { normalizeSearchRequest, searchParamsFromUrl } from "./search-request.mjs";
import { searchFilterQueryKeys } from "./search-intent.mjs";
import { buildRuntimeLocalizedSitemap, renderRobotsTxt, renderSitemapXml } from "./seo-files.mjs";
import { DEFAULT_TOUR_APPROVAL_LEDGER_PATH, readTourApprovals } from "./tours.mjs";
import { DEFAULT_TRANSLATION_LEDGER_PATH, readTranslationLedger } from "./translation-ledger.mjs";
import { renderFaviconSvg } from "./favicon.mjs";
import {
  DEFAULT_DEPLOYABLE_REDIRECTS_OUTPUT,
  approvedLaunchFreezeRouteArtifact,
  loadLegacyRouteDecisions,
} from "./redirect-approvals.mjs";
import { DEFAULT_LAUNCH_FREEZE_PATH, loadApprovedLaunchFreeze } from "./launch-freeze.mjs";
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
import { projectListingDraftSeed } from "./listing-draft-service.mjs";
import { publicOriginForHost } from "./public-origin.mjs";

const DEFAULT_LOCALE_REGISTRY_PATH = fromRoot("locales", "registry.json");

const PUBLIC_CACHE = "public, max-age=300, s-maxage=3600";
const HTML = "text/html; charset=utf-8";

export function appRouterConfigFromEnv(env = process.env) {
  const durableOnly = env.NODE_ENV === "production" && env.MS_REALTY_RUNTIME_DATA_AUTHORITY === "payload";
  return {
    brokerContactLedgerPath: env.MS_REALTY_BROKER_CONTACT_LEDGER_PATH || DEFAULT_BROKER_CONTACT_LEDGER_PATH,
    cmsSeedPath: env.MS_REALTY_CMS_SEED_PATH || DEFAULT_CMS_SEED_PATH,
    deployableRedirectOutputPath: env.MS_REALTY_DEPLOYABLE_REDIRECTS_OUTPUT_PATH || DEFAULT_DEPLOYABLE_REDIRECTS_OUTPUT,
    launchFreezePath: env.MS_REALTY_LAUNCH_FREEZE_PATH || DEFAULT_LAUNCH_FREEZE_PATH,
    listingEditLedgerPath: env.MS_REALTY_LISTING_EDIT_LEDGER_PATH || DEFAULT_LISTING_EDIT_LEDGER_PATH,
    mediaReviewLedgerPath: env.MS_REALTY_MEDIA_REVIEW_LEDGER_PATH || DEFAULT_MEDIA_REVIEW_LEDGER_PATH,
    localeRegistryPath: env.MS_REALTY_LOCALE_REGISTRY_PATH,
    tourApprovalLedgerPath: env.MS_REALTY_TOUR_APPROVAL_LEDGER_PATH || DEFAULT_TOUR_APPROVAL_LEDGER_PATH,
    translationLedgerPath: env.MS_REALTY_TRANSLATION_LEDGER_PATH || DEFAULT_TRANSLATION_LEDGER_PATH,
    privateReview: env.MS_REALTY_PRIVATE_REVIEW_MODE === "true",
    search: publicSearchConfigFromEnv(env),
    naturalLanguageSearchEnabled: env.MS_REALTY_SEARCH_NL_INTENT_ENABLED === "true",
    runtimeDataDurableOnly: durableOnly,
    payloadListingEnv: env,
  };
}

let legacyDecisionIndex = { key: null, byOldUrl: new Map() };

function currentRouteContract(config) {
  const filePath = config.launchFreezePath || config.deployableRedirectOutputPath;
  return readThroughCached(filePath, () =>
    config.launchFreezePath
      ? approvedLaunchFreezeRouteArtifact(loadApprovedLaunchFreeze(config.launchFreezePath))
      : { decisions: loadLegacyRouteDecisions(filePath), catalog: [] },
  );
}

function legacyDecisionByOldUrl(config) {
  const filePath = config.launchFreezePath || config.deployableRedirectOutputPath;
  const key = fileSignature(filePath);
  if (key !== null && legacyDecisionIndex.key === key) return legacyDecisionIndex.byOldUrl;
  const rows = currentRouteContract(config).decisions;
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
  return (
    registry.locales.find((locale) => {
      try {
        return searchPath(registry, locale.code) === normalized;
      } catch {
        return false;
      }
    }) || null
  );
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
  if (config.runtimeDataDurableOnly) {
    throw new Error("Production public inventory must use the asynchronous Payload authority path");
  }
  const reviewedSeed = applyMediaReviews(
    applyListingEdits(
      seed,
      readThroughCached(config.listingEditLedgerPath, () => readListingEdits(config.listingEditLedgerPath)),
    ),
    readThroughCached(config.mediaReviewLedgerPath, () => readMediaReviews(config.mediaReviewLedgerPath)),
  );
  return config.privateReview === true ? reviewedSeed : publicSeedFor(reviewedSeed);
}

async function durablePublicContext(config) {
  const registry = currentRegistry(config);
  const seed = readThroughCached(config.cmsSeedPath, () => loadCmsSeed(config.cmsSeedPath));
  const projected = await projectListingDraftSeed(seed, {
    env: config.payloadListingEnv || process.env,
    payload: config.payloadListingRuntime || null,
    requirePayload: true,
  });
  return { registry, seed: publicSeedFor(projected), translationTasks: [] };
}

function currentTranslationTasks(config) {
  if (config.runtimeDataDurableOnly) return [];
  return readThroughCached(config.translationLedgerPath, () => readTranslationLedger(config.translationLedgerPath));
}

// A page is only shared-cacheable when it both belongs to a cacheable kind and
// actually rendered. Choosing the header on kind alone declared every 404 and
// every 5xx safe to share for an hour, which meant a transient backend failure
// froze the error in the CDN and in each visitor's browser and did not heal
// when the backend came back.
function htmlCacheControl(kind, status) {
  if (kind === "search") return "no-store";
  return status === 200 ? PUBLIC_CACHE : "no-store";
}

function renderedHtmlResponse(rendered, requestUrl, origin) {
  const print = requestUrl.searchParams.get("print") === "1";
  const reactBody = print ? "" : renderReactPublicBody(rendered);
  const html = renderHtmlPage(rendered, { bodyHtml: reactBody, print, origin });
  const status = rendered.status || 200;

  return {
    status,
    headers: {
      "content-type": HTML,
      ...CSP_HEADER,
      "cache-control": htmlCacheControl(rendered.kind, status),
    },
    rendered,
    html,
  };
}

function htmlRequested(accept) {
  return String(accept || "").toLowerCase().includes("text/html");
}

function originUnavailableResponse({ pathname, url, config }) {
  const registry = currentRegistry(config);
  const localeCode = String(pathname || "").split("/").filter(Boolean)[0] || registry.source_locale;
  const page = renderOriginUnavailablePage({ registry, localeCode, path: pathname });
  const requestUrl = url instanceof URL ? url : new URL(String(url || pathname), "http://localhost");
  const out = renderedHtmlResponse(page, requestUrl, config.publicOrigin);
  return new Response(out.html, { status: 503, headers: { ...out.headers, "cache-control": "no-store" } });
}

function renderAppRouteWithContext({ pathname, url, config, registry, seed, translationTasks }) {
  if (!pathname) throw new Error("App route pathname is required");
  const requestUrl = new URL(url, "http://localhost");
  const searchLocale = searchLocaleFor(registry, pathname);
  const savedView = requestUrl.searchParams.get("saved") === "1";
  const view = requestUrl.searchParams.get("view") || "list";
  const searchRequest = searchLocale
    ? normalizeSearchRequest(searchParamsFromUrl(requestUrl.searchParams), {
        defaultLocale: searchLocale.code,
        naturalLanguageEnabled: config.naturalLanguageSearchEnabled === true,
      })
    : null;
  const brokerContacts = readThroughCached(config.brokerContactLedgerPath, () => readBrokerContacts(config.brokerContactLedgerPath));
  const tourApprovals = readThroughCached(config.tourApprovalLedgerPath, () => readTourApprovals(config.tourApprovalLedgerPath));
  const rendered = searchLocale
    ? searchRuntimeListings(registry, seed, {
        localeCode: searchRequest.intent.locale,
        query: searchRequest.query,
        filters: searchRequest.filters,
        sort: searchRequest.sort,
        page: searchRequest.page,
        pageSize: savedView ? null : 12,
        savedView,
        view,
        translationTasks,
      })
    : renderRuntimePath(
        registry,
        seed,
        pathname,
        translationTasks,
        brokerContacts,
        tourApprovals,
        currentRouteContract(config).catalog,
        { searchParams: requestUrl.searchParams },
      );
  return renderedHtmlResponse(rendered, requestUrl, config.publicOrigin);
}

export function renderAppRoute({ pathname, url = pathname, config = appRouterConfigFromEnv() } = {}) {
  return renderAppRouteWithContext({
    pathname,
    url,
    config,
    registry: currentRegistry(config),
    seed: currentPublicSeed(config),
    translationTasks: currentTranslationTasks(config),
  });
}

export async function renderAppSearchRoute({ pathname, url = pathname, config = appRouterConfigFromEnv(), filterNotice = null } = {}) {
  if (!pathname) throw new Error("App route pathname is required");

  const context = config.runtimeDataDurableOnly
    ? await durablePublicContext(config)
    : { registry: currentRegistry(config), seed: currentPublicSeed(config), translationTasks: currentTranslationTasks(config) };
  const { registry } = context;
  const searchLocale = searchLocaleFor(registry, pathname);
  if (!searchLocale) throw new PublicSearchInputError("Localized search route is required");

  const requestUrl = new URL(url, "http://localhost");
  const savedView = requestUrl.searchParams.get("saved") === "1";
  const search = config.search || {
    naturalLanguageEnabled: config.naturalLanguageSearchEnabled === true,
  };
  const { result } = await executePublicSearch({
    registry,
    seed: context.seed,
    params: requestUrl.searchParams,
    defaultLocale: searchLocale.code,
    search,
    translationTasks: context.translationTasks,
    pageSize: savedView ? null : 12,
    savedView,
    view: requestUrl.searchParams.get("view") || "list",
  });

  return renderedHtmlResponse(
    filterNotice ? { ...result, search: { ...result.search, filter_notice: filterNotice } } : result,
    requestUrl,
    config.publicOrigin,
  );
}

export function renderAppRouteResponse({ pathname, url = pathname, host = "", accept = "", config = appRouterConfigFromEnv() } = {}) {
  config = { ...config, publicOrigin: publicOriginForHost(host) };
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
  if (config.runtimeDataDurableOnly) return renderDurableAppRouteResponse({ pathname, url, accept, config });
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

async function renderDurableAppRouteResponse({ pathname, url, accept, config }) {
  let result;
  try {
    const context = await durablePublicContext(config);
    result = renderAppRouteWithContext({ pathname, url, config, ...context });
  } catch (error) {
    if (htmlRequested(accept)) return originUnavailableResponse({ pathname, url, config });
    return new Response(JSON.stringify({ kind: error.code || "payload_draft_unavailable", message: error.message }), {
      status: error.status || 503,
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

export async function renderAppSearchRouteResponse({ pathname, url = pathname, host = "", accept = "", config = appRouterConfigFromEnv() } = {}) {
  config = { ...config, publicOrigin: publicOriginForHost(host) };
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
    return renderAppRouteResponse({ pathname: legacyDecision.target_path, url, host, accept, config });
  }

  let result;
  try {
    result = await renderAppSearchRoute({ pathname, url, config });
  } catch (error) {
    // A reversed or non-numeric range is the visitor's typing, not a broken
    // request. Answering it with a JSON error body left a buyer staring at
    // {"kind":"bad_request"} with no way back to their search, so the page is
    // rendered again without the values that cannot be honoured, carrying a
    // notice that names them and keeps what was typed in the boxes.
    const invalidKeys = searchFilterQueryKeys(error?.fields || []);
    if (invalidKeys.length && htmlRequested(accept)) {
      const retryUrl = new URL(url, "http://localhost");
      const typed = Object.fromEntries(invalidKeys.map((key) => [key, retryUrl.searchParams.get(key) ?? ""]));
      for (const key of invalidKeys) retryUrl.searchParams.delete(key);
      try {
        result = await renderAppSearchRoute({
          pathname,
          url: retryUrl,
          config,
          filterNotice: { reason: error.fields.length > 1 ? "range" : "value", fields: invalidKeys, values: typed },
        });
        return new Response(result.html, { status: result.status, headers: { ...result.headers, "cache-control": "no-store" } });
      } catch {
        // Fall through to the generic answer below.
      }
    }
    if (error instanceof PublicSearchUnavailableError) {
      // A person on the search page gets a branded fallback with working
      // contact channels; the /api/search JSON contract is handled elsewhere.
      const registry = currentRegistry(config);
      const localeCode = String(pathname || "").split("/").filter(Boolean)[0] || registry.source_locale;
      const page = renderSearchUnavailablePage({ registry, localeCode });
      const requestUrl = url instanceof URL ? url : new URL(String(url || pathname), "http://localhost");
      const out = renderedHtmlResponse(page, requestUrl, config.publicOrigin);
      return new Response(out.html, { status: out.status, headers: { ...out.headers, "cache-control": "no-store" } });
    }
    if (config.runtimeDataDurableOnly && htmlRequested(accept)) return originUnavailableResponse({ pathname, url, config });
    return new Response(JSON.stringify({ kind: error.code || "bad_request", message: error.message }), {
      status: error.status || 400,
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

export function renderAppSitemap({ config = appRouterConfigFromEnv(), origin } = {}) {
  const sitemap = buildRuntimeLocalizedSitemap(currentRegistry(config), currentPublicSeed(config), currentTranslationTasks(config));
  return {
    status: 200,
    headers: { "content-type": "application/xml; charset=utf-8", "cache-control": PUBLIC_CACHE },
    sitemap,
    body: renderSitemapXml(sitemap, { origin }),
  };
}

export function renderAppSiteRoot({ config = appRouterConfigFromEnv() } = {}) {
  const location = siteRootRedirectTarget(currentRegistry(config));
  return {
    status: 308,
    headers: { location, "content-type": "text/plain; charset=utf-8", "cache-control": PUBLIC_CACHE },
    body: `Redirecting to ${location}\n`,
  };
}

export function renderAppRobots({ origin } = {}) {
  return {
    status: 200,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": PUBLIC_CACHE },
    body: renderRobotsTxt({ origin }),
  };
}

export function renderAppFavicon() {
  return {
    status: 200,
    headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "public, max-age=86400" },
    body: renderFaviconSvg(),
  };
}

export function renderAppSitemapResponse({ host = "", config = appRouterConfigFromEnv() } = {}) {
  const origin = publicOriginForHost(host);
  if (config.runtimeDataDurableOnly) return renderDurableAppSitemapResponse(config, origin);
  const result = renderAppSitemap({ config, origin });
  return new Response(result.body, { status: result.status, headers: result.headers });
}

async function renderDurableAppSitemapResponse(config, origin) {
  try {
    const context = await durablePublicContext(config);
    const sitemap = buildRuntimeLocalizedSitemap(context.registry, context.seed, context.translationTasks);
    return new Response(renderSitemapXml(sitemap, { origin }), {
      status: 200,
      headers: { "content-type": "application/xml; charset=utf-8", "cache-control": PUBLIC_CACHE },
    });
  } catch (error) {
    return new Response(JSON.stringify({ kind: error.code || "payload_draft_unavailable", message: error.message }), {
      status: error.status || 503,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  }
}

export function renderAppRobotsResponse({ host = "" } = {}) {
  const result = renderAppRobots({ origin: publicOriginForHost(host) });
  return new Response(result.body, { status: result.status, headers: result.headers });
}

export function renderAppSiteRootResponse({ url = "/", host = "", accept = "", config = appRouterConfigFromEnv() } = {}) {
  const legacyDecision = legacyDecisionFor({ pathname: "/", url, host, config });
  if (legacyDecision?.status === 200 && legacyDecision.target_path === siteRootRedirectTarget(currentRegistry(config))) {
    return renderAppRouteResponse({ pathname: "/", url, host, accept, config });
  }
  const result = renderAppSiteRoot({ config });
  return new Response(result.body, { status: result.status, headers: result.headers });
}

export function renderAppFaviconResponse() {
  const result = renderAppFavicon();
  return new Response(result.body, { status: result.status, headers: result.headers });
}
