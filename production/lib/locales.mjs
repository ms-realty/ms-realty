import fs from "node:fs";
import { fromRoot } from "./paths.mjs";

const BCP47 = /^[a-z]{2,3}(-[A-Z]{2})?$/;
const ROUTE_SEGMENT = /^[a-z0-9-]+$/;
const PROVIDERS = new Set(["human", "hermes_draft", "external_import"]);
const DIRECTIONS = new Set(["ltr", "rtl"]);

export function loadLocaleRegistry(path = fromRoot("locales", "registry.json")) {
  return JSON.parse(fs.readFileSync(path, "utf8"));
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

export function adminLocales(registry) {
  return registry.admin_locales;
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
  if (JSON.stringify(registry.admin_locales) !== JSON.stringify(["bg", "ru", "en"])) {
    throw new Error("Admin CMS/CRM locales must be bg, ru, en");
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
    if (locale.fallback_locale && !registry.locales.some((candidate) => candidate.code === locale.fallback_locale)) {
      throw new Error(`Missing fallback ${locale.fallback_locale} for ${locale.code}`);
    }
    if (!locale.route_segments?.listing || !locale.route_segments?.search || !locale.route_segments?.seller) {
      throw new Error(`Missing route segments for ${locale.code}`);
    }
    if (
      !ROUTE_SEGMENT.test(locale.route_segments.listing) ||
      !ROUTE_SEGMENT.test(locale.route_segments.search) ||
      !ROUTE_SEGMENT.test(locale.route_segments.seller)
    ) {
      throw new Error(`Invalid route segment for ${locale.code}`);
    }
  }

  for (const code of ["bg", "en", "de", "nl", "ru", "el", "he"]) {
    const locale = getLocale(registry, code);
    if (!locale.public_enabled || !locale.indexable) throw new Error(`${code} must be public and indexable`);
  }
  if (getLocale(registry, "he").direction !== "rtl") throw new Error("Hebrew must be RTL");
  if (getLocale(registry, "el").direction !== "ltr") throw new Error("Greek must be LTR");
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
      seller: input.route_segments?.seller || "sell",
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
