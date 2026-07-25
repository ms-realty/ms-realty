import fs from "node:fs";
import path from "node:path";
import { renderHtmlPage } from "./html.mjs";
import { LEGACY_MEDIA_HOSTS, mirrorKeyFor, mirrorPathFor } from "./media-migration.mjs";
import { enableNextImageOptimizer, renderReactPublicBody } from "./react-public-site.mjs";

// This adapter only runs inside the Next.js runtime, where the built-in
// /_next/image optimizer exists. The bare Node server keeps plain URLs.
enableNextImageOptimizer();
import { loadLocaleRegistry, negotiateRootLocale } from "./locales.mjs";
import { canonicalCasePath, loadCmsSeed, renderRuntimePath, searchRuntimeListings } from "./runtime.mjs";
import { DEFAULT_BROKER_CONTACT_LEDGER_PATH, readBrokerContacts } from "./broker-contacts.mjs";
import { DEFAULT_LISTING_EDIT_LEDGER_PATH, applyListingEdits, readListingEdits } from "./listing-edits.mjs";
import { DEFAULT_MEDIA_REVIEW_LEDGER_PATH, applyMediaReviews, readMediaReviews } from "./media-reviews.mjs";
import { searchFiltersFromParams, searchPageFromParams } from "./search-filters.mjs";
import {
  DEFAULT_PUBLIC_ORIGIN,
  buildRuntimeLocalizedSitemap,
  publicOriginForHost,
  renderRobotsTxt,
  renderSitemapXml,
} from "./seo-files.mjs";
import { DEFAULT_TOUR_APPROVAL_LEDGER_PATH, readTourApprovals } from "./tours.mjs";
import { DEFAULT_TRANSLATION_LEDGER_PATH, readTranslationLedger } from "./translation-ledger.mjs";
import { renderFaviconSvg } from "./favicon.mjs";
import { DEFAULT_DEPLOYABLE_REDIRECTS_OUTPUT, loadLegacyRouteDecisions } from "./redirect-approvals.mjs";
import { fileSignature, readThroughCached } from "./file-cache.mjs";
import { fromRoot } from "./paths.mjs";
import { DEFAULT_CMS_SEED_PATH } from "./runtime.mjs";
import { CSP_HEADER } from "./security-headers.mjs";

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

function currentSeed(config) {
  const seed = readThroughCached(config.cmsSeedPath, () => loadCmsSeed(config.cmsSeedPath));
  return applyMediaReviews(
    applyListingEdits(
      seed,
      readThroughCached(config.listingEditLedgerPath, () => readListingEdits(config.listingEditLedgerPath)),
    ),
    readThroughCached(config.mediaReviewLedgerPath, () => readMediaReviews(config.mediaReviewLedgerPath)),
  );
}

function currentTranslationTasks(config) {
  return readThroughCached(config.translationLedgerPath, () => readTranslationLedger(config.translationLedgerPath));
}

// Negotiates the bare domain root to a locale home. `.ru` is a first-class
// Russian site, so it defaults to RU regardless of Accept-Language; everything
// else falls back to the registry source locale (BG).
export function rootRedirectTarget({ host = "", acceptLanguage = "", config = appRouterConfigFromEnv() } = {}) {
  return `/${negotiateRootLocale(currentRegistry(config), { host, acceptLanguage })}`;
}

export function renderRootRedirectResponse({ host = "", acceptLanguage = "", config = appRouterConfigFromEnv() } = {}) {
  return new Response(null, {
    status: 307,
    headers: {
      location: rootRedirectTarget({ host, acceptLanguage, config }),
      vary: "accept-language",
      "cache-control": "no-store",
    },
  });
}

export function renderAppRoute({ pathname, url = pathname, host = "", config = appRouterConfigFromEnv() } = {}) {
  if (!pathname) throw new Error("App route pathname is required");
  const origin = publicOriginForHost(host);

  const registry = currentRegistry(config);
  const seed = currentSeed(config);
  const requestUrl = new URL(url, "http://localhost");
  const translationTasks = currentTranslationTasks(config);
  const searchLocale = searchLocaleFor(registry, pathname);
  const savedView = requestUrl.searchParams.get("saved") === "1";
  const rendered = searchLocale
    ? searchRuntimeListings(registry, seed, {
        localeCode: searchLocale.code,
        query: requestUrl.searchParams.get("q") || "",
        filters: searchFiltersFromParams(requestUrl.searchParams),
        sort: requestUrl.searchParams.get("sort") || "recommended",
        page: searchPageFromParams(requestUrl.searchParams),
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
  const print = requestUrl.searchParams.get("print") === "1";
  const reactBody = print ? "" : renderReactPublicBody(rendered);
  const html = renderHtmlPage(rendered, { bodyHtml: reactBody, print, origin });

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
  const canonicalCase = canonicalCasePath(
    currentRegistry(config),
    currentSeed(config),
    pathname,
    currentTranslationTasks(config),
  );
  if (canonicalCase) {
    return new Response(null, {
      status: 301,
      headers: { location: `${canonicalCase}${new URL(url, "http://localhost").search}`, "cache-control": PUBLIC_CACHE },
    });
  }
  const result = renderAppRoute({ pathname, url, host, config });
  if (result.status === 200 && pathname.length > 1 && pathname.endsWith("/")) {
    return new Response(null, {
      status: 308,
      headers: { location: `${pathname.replace(/\/+$/, "")}${new URL(url, "http://localhost").search}`, "cache-control": PUBLIC_CACHE },
    });
  }
  return new Response(result.html, { status: result.status, headers: result.headers });
}

export function renderAppSitemap({ host = "", config = appRouterConfigFromEnv() } = {}) {
  const sitemap = buildRuntimeLocalizedSitemap(currentRegistry(config), currentSeed(config), currentTranslationTasks(config));
  return {
    status: 200,
    headers: { "content-type": "application/xml; charset=utf-8", "cache-control": PUBLIC_CACHE },
    sitemap,
    body: renderSitemapXml(sitemap, { origin: publicOriginForHost(host) || DEFAULT_PUBLIC_ORIGIN }),
  };
}

export function renderAppRobots({ host = "" } = {}) {
  return {
    status: 200,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": PUBLIC_CACHE },
    body: renderRobotsTxt({ origin: publicOriginForHost(host) || DEFAULT_PUBLIC_ORIGIN }),
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
  const result = renderAppSitemap({ host, config });
  return new Response(result.body, { status: result.status, headers: result.headers });
}

export function renderAppRobotsResponse({ host = "" } = {}) {
  const result = renderAppRobots({ host });
  return new Response(result.body, { status: result.status, headers: result.headers });
}

export function renderAppFaviconResponse() {
  const result = renderAppFavicon();
  return new Response(result.body, { status: result.status, headers: result.headers });
}

const MEDIA_CONTENT_TYPES = {
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".mp4": "video/mp4",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webm": "video/webm",
  ".webp": "image/webp",
};

// Serves a mirrored legacy upload at its original path. Falls through to 404
// when the asset has not been mirrored yet, so a partial mirror degrades to the
// current behaviour instead of serving a wrong file.
export function renderLegacyUploadResponse({ pathname, host = "" } = {}) {
  const requestHostName = String(host || "")
    .split(",")[0]
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, "")
    .replace(/^www\./, "");
  const mirrorHost = LEGACY_MEDIA_HOSTS.has(requestHostName) ? requestHostName : "makler-realty.com";
  const key = mirrorKeyFor(`https://${mirrorHost}${pathname}`);
  const filePath = key ? mirrorPathFor(key, { mirrorDir: process.env.MS_REALTY_MEDIA_MIRROR_DIR || undefined }) : null;
  if (!filePath || !fs.existsSync(filePath)) {
    return new Response("Not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  const body = fs.readFileSync(filePath);
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": MEDIA_CONTENT_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "content-length": String(body.byteLength),
      // Legacy upload originals are immutable: the filename encodes the upload.
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    },
  });
}
