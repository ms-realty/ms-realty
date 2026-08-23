import fs from "node:fs";
import { fromRoot } from "./paths.mjs";

const BCP47 = /^[a-z]{2,3}(-[A-Z]{2})?$/;
const ROUTE_SEGMENT = /^[a-z0-9-]+$/;
const PROVIDERS = new Set(["human", "hermes_draft", "external_import"]);
const DIRECTIONS = new Set(["ltr", "rtl"]);
const FALLBACK_REQUIRED_ADMIN_LOCALES = ["bg", "ru", "en"];
const FALLBACK_REQUIRED_PUBLIC_LOCALES = ["bg", "en", "de", "nl", "ru", "el", "he"];

export function loadLocaleRegistry(path = fromRoot("locales", "registry.json")) {
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

// The site root has no page of its own: every public URL is locale-prefixed
// (§14). It must still resolve, because the legacy `.com` root is the
// highest-equity URL on the domain. Derived from source_locale rather than
// registry.x_default ("/bg/"), which would redirect again to "/bg" and break
// the single-hop rule in §13.
export function siteRootRedirectTarget(registry) {
  return `/${registry.source_locale}`;
}

export function writeLocaleRegistry(registry, path = fromRoot("locales", "registry.json")) {
  fs.writeFileSync(path, `${JSON.stringify(registry, null, 2)}\n`);
  return registry;
}

export function localesByCode(registry) {
  return new Map(registry.locales.map((locale) => [locale.code, locale]));
}

export function publicIndexableLocales(registry) {
  return registry.locales.filter((locale) => locale.public_enabled && locale.indexable);
}

export function requiredAdminLocales(registry) {
  return registry.required_admin_locales || FALLBACK_REQUIRED_ADMIN_LOCALES;
}

export function adminLocales(registry) {
  return registry.admin_locales;
}

export function requiredPublicLocales(registry) {
  return registry.required_public_locales || registry.initial_public_locales || FALLBACK_REQUIRED_PUBLIC_LOCALES;
}

export function websiteLanguageCoverage(registry) {
  return registry.website_language_coverage || [];
}

export function getLocale(registry, code) {
  const locale = localesByCode(registry).get(code);
  if (!locale) throw new Error(`Unknown locale: ${code}`);
  return locale;
}

export function assertLocaleRegistry(registry) {
  if (registry.policy !== "dynamic_approved") throw new Error("Locale policy must be dynamic_approved");
  if (registry.source_locale !== "bg") throw new Error("Source locale must be bg");
  if (registry.url_strategy !== "locale_prefix") throw new Error("URL strategy must be locale_prefix");
  if (JSON.stringify(requiredAdminLocales(registry)) !== JSON.stringify(["bg", "ru", "en"])) {
    throw new Error("Required admin CMS/CRM locales must be bg, ru, en");
  }
  if (JSON.stringify(registry.admin_locales) !== JSON.stringify(requiredAdminLocales(registry))) {
    throw new Error("Admin CMS/CRM locales must be bg, ru, en");
  }
  if (JSON.stringify(requiredPublicLocales(registry)) !== JSON.stringify(FALLBACK_REQUIRED_PUBLIC_LOCALES)) {
    throw new Error("Required public website locales must be bg, en, de, nl, ru, el, he");
  }

  const seen = new Set();
  for (const locale of registry.locales) {
    if (!BCP47.test(locale.code)) throw new Error(`Invalid locale code: ${locale.code}`);
    if (seen.has(locale.code)) throw new Error(`Duplicate locale: ${locale.code}`);
    seen.add(locale.code);
    if (!DIRECTIONS.has(locale.direction)) throw new Error(`Invalid direction for ${locale.code}`);
    if (!PROVIDERS.has(locale.translation_provider_mode)) {
      throw new Error(`Invalid translation provider for ${locale.code}`);
    }
    const fallback = locale.fallback_locale
      ? registry.locales.find((candidate) => candidate.code === locale.fallback_locale)
      : null;
    if (locale.fallback_locale && !fallback) {
      throw new Error(`Missing fallback ${locale.fallback_locale} for ${locale.code}`);
    }
    if (fallback && (!fallback.public_enabled || !fallback.indexable)) {
      throw new Error(`Fallback ${locale.fallback_locale} for ${locale.code} must be public and indexable`);
    }
    if (
      !locale.route_segments?.listing ||
      !locale.route_segments?.search ||
      !locale.route_segments?.location ||
      !locale.route_segments?.contact ||
      !locale.route_segments?.seller
    ) {
      throw new Error(`Missing route segments for ${locale.code}`);
    }
    if (
      !ROUTE_SEGMENT.test(locale.route_segments.listing) ||
      !ROUTE_SEGMENT.test(locale.route_segments.search) ||
      !ROUTE_SEGMENT.test(locale.route_segments.location) ||
      !ROUTE_SEGMENT.test(locale.route_segments.contact) ||
      !ROUTE_SEGMENT.test(locale.route_segments.seller) ||
      // The buyer onboarding segment is optional for registries written before
      // it existed (startPath falls back to "start"), but when present it must
      // be a valid URL segment like every other route.
      (locale.route_segments.start !== undefined && !ROUTE_SEGMENT.test(locale.route_segments.start)) ||
      // Compare, about and alerts follow the same optional-but-valid rule as
      // the onboarding segment, so an older registry keeps resolving.
      (locale.route_segments.compare !== undefined && !ROUTE_SEGMENT.test(locale.route_segments.compare)) ||
      (locale.route_segments.about !== undefined && !ROUTE_SEGMENT.test(locale.route_segments.about)) ||
      (locale.route_segments.alerts !== undefined && !ROUTE_SEGMENT.test(locale.route_segments.alerts))
    ) {
      throw new Error(`Invalid route segment for ${locale.code}`);
    }
    // Two routes of the same locale may never resolve to the same path.
    const owned = [
      locale.route_segments.listing,
      locale.route_segments.search,
      locale.route_segments.location,
      locale.route_segments.contact,
      locale.route_segments.seller,
      locale.route_segments.start,
      locale.route_segments.compare,
      locale.route_segments.about,
      locale.route_segments.alerts,
    ].filter((segment) => segment !== undefined);
    if (new Set(owned).size !== owned.length) throw new Error(`Duplicate route segment for ${locale.code}`);
  }

  for (const code of requiredPublicLocales(registry)) {
    const locale = getLocale(registry, code);
    if (!locale.public_enabled || !locale.indexable) throw new Error(`${code} must be public and indexable`);
  }
  if (getLocale(registry, "he").direction !== "rtl") throw new Error("Hebrew must be RTL");
  if (getLocale(registry, "el").direction !== "ltr") throw new Error("Greek must be LTR");

  const coverage = websiteLanguageCoverage(registry);
  const greece = coverage.find((item) => item.id === "greece_greek");
  const israel = coverage.find((item) => item.id === "israel_hebrew");
  if (greece?.locale !== "el" || greece.country_code !== "GR" || greece.public_route_prefix !== "/el/") {
    throw new Error("Website language coverage must map Greece to Greek /el/");
  }
  if (
    israel?.locale !== "he" ||
    israel.country_code !== "IL" ||
    israel.public_route_prefix !== "/he/" ||
    israel.requires_rtl_qa !== true
  ) {
    throw new Error("Website language coverage must map Israel to Hebrew /he/ with RTL QA");
  }
  for (const item of coverage) {
    const locale = getLocale(registry, item.locale);
    if (!locale.public_enabled || !locale.indexable) {
      throw new Error(`Website language coverage locale must be public and indexable: ${item.locale}`);
    }
  }
  return true;
}

export function addLocaleToRegistry(registry, input) {
  const code = String(input.code || "").trim();
  if (!BCP47.test(code)) throw new Error("Locale code must be BCP 47, for example es or fr-CA");
  if (localesByCode(registry).has(code)) throw new Error(`Locale already exists: ${code}`);
  const locale = {
    code,
    native_name: input.native_name || code,
    admin_name: input.admin_name || input.native_name || code,
    direction: input.direction || "ltr",
    public_enabled: input.public_enabled === true,
    indexable: input.public_enabled === true && input.indexable === true,
    fallback_locale: input.fallback_locale || "en",
    translation_provider_mode: input.translation_provider_mode || "hermes_draft",
    reviewer_role: input.reviewer_role || `translator_${code.toLowerCase().replace("-", "_")}`,
    route_segments: {
      listing: input.route_segments?.listing || "properties",
      search: input.route_segments?.search || "search",
      location: input.route_segments?.location || "locations",
      contact: input.route_segments?.contact || "contact",
      seller: input.route_segments?.seller || "sell",
      start: input.route_segments?.start || "start",
      compare: input.route_segments?.compare || "compare",
      about: input.route_segments?.about || "about",
      alerts: input.route_segments?.alerts || "alerts",
    },
  };
  const next = { ...registry, locales: [...registry.locales, locale] };
  assertLocaleRegistry(next);
  return { registry: next, locale };
}

export function resolvePublicLocale(registry, requestedCode) {
  const byCode = localesByCode(registry);
  const requested = byCode.get(requestedCode);
  if (requested?.public_enabled && requested.indexable) {
    return { locale: requested, available: true, requestedCode };
  }
  const fallbackCode = requested?.fallback_locale || registry.source_locale;
  return { locale: getLocale(registry, fallbackCode), available: false, requestedCode };
}
