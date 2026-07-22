import fs from "node:fs";
import path from "node:path";
import { getLocale, loadLocaleRegistry, publicIndexableLocales } from "./locales.mjs";
import { fromRoot } from "./paths.mjs";

export const DEFAULT_APP_ROUTE_MANIFEST = fromRoot("production", "data", "app-route-manifest.json");
export const DEFAULT_LOCALIZED_SITEMAP = fromRoot("production", "data", "localized-sitemap.json");

const ROUTE_MODULES = {
  home: { module: "app/[locale]/route", renderer: "renderHomePage", dynamic: false },
  search: { module: "app/[locale]/search/route", renderer: "renderSearchPage", dynamic: true },
  listing: { module: "app/[locale]/[...slug]/route", renderer: "renderListingPage", dynamic: true },
  location: { module: "app/[locale]/[...slug]/route", renderer: "renderLocationPage", dynamic: true },
  seller: { module: "app/[locale]/[...slug]/route", renderer: "renderSellerPage", dynamic: true },
  contact: { module: "app/[locale]/[...slug]/route", renderer: "renderContactPage", dynamic: true },
  guide: { module: "app/[locale]/[...slug]/route", renderer: "renderGuidePage", dynamic: true },
};

function loadSitemap(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function routeSegmentsFor(locale) {
  return {
    listing: locale.route_segments.listing,
    search: locale.route_segments.search,
    location: locale.route_segments.location,
    seller: locale.route_segments.seller,
    contact: locale.route_segments.contact,
  };
}

function entryFromSitemap(registry, entry) {
  const locale = getLocale(registry, entry.locale);
  const route = ROUTE_MODULES[entry.type];
  if (!route) throw new Error(`Unknown app route type: ${entry.type}`);
  return {
    type: entry.type,
    path: entry.loc,
    locale: locale.code,
    lang: locale.code,
    dir: locale.direction,
    route_segments: routeSegmentsFor(locale),
    app_module: route.module,
    renderer: route.renderer,
    dynamic: route.dynamic,
    sitemap_indexable: true,
    public_indexable: true,
    cache: "public, max-age=300, s-maxage=3600",
    params: {
      locale: locale.code,
      ...(entry.type === "listing" ? { listingId: entry.loc.split("/").filter(Boolean).at(-1) } : {}),
      ...(entry.type === "location" ? { location: entry.loc.split("/").filter(Boolean).at(-1) } : {}),
      ...(entry.type === "guide" ? { guidePath: entry.loc.split("/").filter(Boolean).slice(1).join("/") } : {}),
    },
    hreflang_count: entry.hreflang?.length || 0,
  };
}

function searchEntry(registry, locale) {
  return {
    type: "search",
    path: `/${locale.code}/${locale.route_segments.search}`,
    locale: locale.code,
    lang: locale.code,
    dir: locale.direction,
    route_segments: routeSegmentsFor(locale),
    app_module: ROUTE_MODULES.search.module,
    renderer: ROUTE_MODULES.search.renderer,
    dynamic: false,
    sitemap_indexable: false,
    public_indexable: false,
    cache: "no-store",
    params: { locale: locale.code },
    hreflang_count: 0,
  };
}

export function buildAppRouteManifest({
  registry = loadLocaleRegistry(),
  sitemap = loadSitemap(DEFAULT_LOCALIZED_SITEMAP),
  generatedAt = new Date().toISOString(),
} = {}) {
  const sitemapRoutes = sitemap.entries.map((entry) => entryFromSitemap(registry, entry));
  const searchRoutes = publicIndexableLocales(registry).map((locale) => searchEntry(registry, locale));
  const routes = [...sitemapRoutes, ...searchRoutes].sort((a, b) => a.path.localeCompare(b.path));

  return {
    generated_at: generatedAt,
    source_sitemap_entries: sitemap.entries.length,
    summary: {
      routes: routes.length,
      sitemap_indexable_routes: sitemapRoutes.length,
      utility_routes: searchRoutes.length,
      by_type: routes.reduce((counts, route) => {
        counts[route.type] = (counts[route.type] || 0) + 1;
        return counts;
      }, {}),
      by_locale: routes.reduce((counts, route) => {
        counts[route.locale] = (counts[route.locale] || 0) + 1;
        return counts;
      }, {}),
    },
    routes,
  };
}

export function assertAppRouteManifest(manifest) {
  if (manifest.source_sitemap_entries !== manifest.summary.sitemap_indexable_routes) {
    throw new Error("App route manifest must preserve every localized sitemap entry");
  }
  if (manifest.summary.routes !== manifest.routes.length) throw new Error("App route manifest summary must match rows");
  if (manifest.summary.utility_routes !== 7) throw new Error("App route manifest must include one search route per public locale");
  if (manifest.routes.some((route) => route.locale === "fr")) throw new Error("App route manifest must not include draft French routes");
  for (const route of manifest.routes) {
    if (!route.path.startsWith(`/${route.locale}/`) && route.path !== `/${route.locale}`) {
      throw new Error(`Route path must be locale-prefixed: ${route.path}`);
    }
    if (!route.app_module || !route.renderer || !route.lang || !route.dir) {
      throw new Error(`Route missing app handoff metadata: ${route.path}`);
    }
    if (route.type === "search" && (route.sitemap_indexable || route.cache !== "no-store")) {
      throw new Error("Search utility routes must stay out of the sitemap and use no-store");
    }
  }
  const hebrewHome = manifest.routes.find((route) => route.path === "/he");
  if (hebrewHome?.dir !== "rtl") throw new Error("Hebrew app route must carry RTL direction");
  return true;
}

export function assertAppRouteFiles(manifest, root = fromRoot()) {
  const modules = new Set(manifest.routes.map((route) => route.app_module));
  for (const appModule of modules) {
    const filePath = path.join(root, `${appModule}.js`);
    if (!fs.existsSync(filePath)) throw new Error(`Missing App Router module file: ${appModule}.js`);
  }
  if (!modules.has("app/[locale]/[...slug]/route")) throw new Error("App Router manifest must use one catch-all content route");
  return true;
}

export function writeAppRouteManifest(manifest, filePath = DEFAULT_APP_ROUTE_MANIFEST) {
  assertAppRouteManifest(manifest);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(manifest, null, 2)}\n`);
  return filePath;
}
