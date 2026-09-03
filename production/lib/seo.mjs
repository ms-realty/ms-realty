import { CANONICAL_PROPERTY_FAMILIES } from "./listing-facts.mjs";
import { getLocale, publicIndexableLocales } from "./locales.mjs";
import { SEARCH_OFFER_TYPES } from "./search-intent.mjs";

const PUBLIC_TRANSLATION_STATES = new Set(["approved", "published"]);
const ACTIVE_LISTING_STATUSES = new Set(["available", "reserved"]);
export const PUBLIC_LOCATION_SCOPES = Object.freeze({
  Sandanski: { municipality_code: "BLG40" },
  Petrich: { municipality_code: "BLG33" },
  Hotovo: { settlement_ekatte: "77361" },
});

// Google rewrites or hard-truncates a snippet past roughly 155-160 characters,
// so a description longer than this is not a sales pitch, it is an arbitrary
// mid-sentence fragment chosen by the search engine.
export const META_DESCRIPTION_LIMIT = 160;

// Trailing connectors, in every language the site publishes. A snippet that
// ends "…апартамент в…" or "…the property with…" reads as broken, and the word
// carries no meaning without what follows it. Anything of three characters or
// fewer is dropped for the same reason, which covers в, на, за, от, до, по, и,
// of, to, in, at, σε, με, של and their neighbours without listing them all.
const DANGLING_CONNECTORS = new Set([
  // bg / ru
  "или", "като", "след", "около", "върху", "между", "срещу", "заедно", "если", "перед", "через",
  // en
  "and", "the", "with", "from", "into", "near", "that", "this", "your", "such", "than", "onto", "upon",
  "about", "after", "before", "under", "over", "within", "without", "through", "during", "against",
  "between", "including",
  // de
  "und", "der", "die", "das", "mit", "für", "vom", "zum", "beim",
  // nl
  "van", "het", "een", "met", "voor", "naar",
  // el
  "και", "στο", "στη", "από", "για",
  // he
  "של", "עם", "על", "אל", "מן",
]);

function isDangling(token) {
  return token.length <= 3 || DANGLING_CONNECTORS.has(token.toLowerCase());
}

// Word-boundary truncation that leaves the snippet a readable sentence
// fragment. Operates on whole tokens, never on code units, so Cyrillic, Greek
// and Hebrew survive intact.
export function metaDescription(value, { limit = META_DESCRIPTION_LIMIT } = {}) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= limit) return text;

  const tokens = text.slice(0, limit - 1).split(" ");
  // The cut landed inside the last token unless it landed exactly on a space.
  if (text[limit - 1] !== " ") tokens.pop();
  while (tokens.length > 1 && isDangling(tokens[tokens.length - 1].replace(/[^\p{L}\p{N}]+$/u, ""))) tokens.pop();

  const truncated = tokens.join(" ").replace(/[\s,;:.!?·—–-]+$/u, "");
  return truncated ? `${truncated}…` : `${text.slice(0, limit - 1)}…`;
}

function listingField(listing, field) {
  return listing[field] ?? listing.facts?.[field] ?? "";
}

export function matchesPublicLocationScope(listing, location) {
  const scope = PUBLIC_LOCATION_SCOPES[location];
  return (
    Boolean(scope) &&
    listingField(listing, "location_review_status") === "confirmed_settlement" &&
    Object.entries(scope).every(([field, value]) => listingField(listing, field) === value)
  );
}

export function publicLocationNames(listings) {
  return Object.keys(PUBLIC_LOCATION_SCOPES).filter((location) => listings.some((listing) => matchesPublicLocationScope(listing, location)));
}

export function listingPath(registry, localeCode, listingId) {
  const locale = getLocale(registry, localeCode);
  return `/${locale.code}/${locale.route_segments.listing}/${listingId}`;
}

export function sellerPath(registry, localeCode) {
  const locale = getLocale(registry, localeCode);
  return `/${locale.code}/${locale.route_segments.seller}`;
}

export function contactPath(registry, localeCode) {
  const locale = getLocale(registry, localeCode);
  return `/${locale.code}/${locale.route_segments.contact}`;
}

// Buyer onboarding ("Start your search"). Older registries without the segment
// still resolve to /{locale}/start so the route never disappears.
export function startPath(registry, localeCode) {
  const locale = getLocale(registry, localeCode);
  return `/${locale.code}/${locale.route_segments.start || "start"}`;
}

// Compare, about and alerts (package P4). Each falls back to the English
// segment so a registry written before the route existed still resolves.
export function comparePath(registry, localeCode) {
  const locale = getLocale(registry, localeCode);
  return `/${locale.code}/${locale.route_segments.compare || "compare"}`;
}

export function aboutPath(registry, localeCode) {
  const locale = getLocale(registry, localeCode);
  return `/${locale.code}/${locale.route_segments.about || "about"}`;
}

export function alertsPath(registry, localeCode) {
  const locale = getLocale(registry, localeCode);
  return `/${locale.code}/${locale.route_segments.alerts || "alerts"}`;
}

export function homePath(registry, localeCode) {
  const locale = getLocale(registry, localeCode);
  return `/${locale.code}`;
}

export function locationSlug(location) {
  return (
    String(location || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "location"
  );
}

export function locationPath(registry, localeCode, location) {
  const locale = getLocale(registry, localeCode);
  return `/${locale.code}/${locale.route_segments.location || "locations"}/${locationSlug(location)}`;
}

export function searchPath(registry, localeCode) {
  const locale = getLocale(registry, localeCode);
  return `/${locale.code}/${locale.route_segments.search}`;
}

// The eight search facets that are allowed into the index: one canonical
// property family or one offer type, never both and never with anything else.
// Every other query on the search route is a private utility view and stays
// noindex (see renderSearchPage). The catalogue lives here so the canonical,
// the hreflang cluster, the sitemap and the route manifest can never disagree
// about which facet URLs exist.
export const SEARCH_FACETS = Object.freeze([
  ...CANONICAL_PROPERTY_FAMILIES.map((value) => Object.freeze({ param: "property_family", value })),
  ...SEARCH_OFFER_TYPES.map((value) => Object.freeze({ param: "offer_type", value })),
]);

export function searchFacetFor(param, value) {
  return SEARCH_FACETS.find((facet) => facet.param === param && facet.value === value) || null;
}

export function searchFacetPath(registry, localeCode, facet) {
  return `${searchPath(registry, localeCode)}?${facet.param}=${facet.value}`;
}

export function hreflangForSeller(registry) {
  return [
    ...publicIndexableLocales(registry).map((locale) => ({
      hreflang: locale.code,
      href: sellerPath(registry, locale.code),
    })),
    { hreflang: "x-default", href: sellerPath(registry, registry.source_locale) },
  ];
}

export function hreflangForStart(registry) {
  return [
    ...publicIndexableLocales(registry).map((locale) => ({
      hreflang: locale.code,
      href: startPath(registry, locale.code),
    })),
    { hreflang: "x-default", href: startPath(registry, registry.source_locale) },
  ];
}

// Compare and alerts are per-visitor surfaces and stay out of the index, so
// these alternates only feed the header language switcher, never <link rel>.
export function localeAlternatesForCompare(registry) {
  return publicIndexableLocales(registry).map((locale) => ({
    hreflang: locale.code,
    href: comparePath(registry, locale.code),
  }));
}

export function localeAlternatesForAlerts(registry) {
  return publicIndexableLocales(registry).map((locale) => ({
    hreflang: locale.code,
    href: alertsPath(registry, locale.code),
  }));
}

export function hreflangForAbout(registry) {
  return [
    ...publicIndexableLocales(registry).map((locale) => ({
      hreflang: locale.code,
      href: aboutPath(registry, locale.code),
    })),
    { hreflang: "x-default", href: aboutPath(registry, registry.source_locale) },
  ];
}

export function hreflangForContact(registry) {
  return [
    ...publicIndexableLocales(registry).map((locale) => ({
      hreflang: locale.code,
      href: contactPath(registry, locale.code),
    })),
    { hreflang: "x-default", href: contactPath(registry, registry.source_locale) },
  ];
}

export function hreflangForHome(registry) {
  return [
    ...publicIndexableLocales(registry).map((locale) => ({
      hreflang: locale.code,
      href: homePath(registry, locale.code),
    })),
    { hreflang: "x-default", href: homePath(registry, registry.source_locale) },
  ];
}

export function hreflangForSearchFacet(registry, facet) {
  return [
    ...publicIndexableLocales(registry).map((locale) => ({
      hreflang: locale.code,
      href: searchFacetPath(registry, locale.code, facet),
    })),
    { hreflang: "x-default", href: searchFacetPath(registry, registry.source_locale, facet) },
  ];
}

export function isTranslationIndexable(registry, translation) {
  const locale = getLocale(registry, translation.locale);
  return Boolean(
    locale.public_enabled &&
      locale.indexable &&
      PUBLIC_TRANSLATION_STATES.has(translation.status) &&
      translation.human_approved === true,
  );
}

export function hreflangForListing(registry, listingId, translations) {
  const links = [];
  const translationsByLocale = new Map(translations.map((translation) => [translation.locale, translation]));

  for (const locale of publicIndexableLocales(registry)) {
    const translation = translationsByLocale.get(locale.code);
    if (!translation || !isTranslationIndexable(registry, translation)) continue;
    links.push({
      hreflang: locale.code,
      href: listingPath(registry, locale.code, listingId),
    });
  }

  const source = translationsByLocale.get(registry.source_locale);
  if (source && isTranslationIndexable(registry, source)) {
    links.push({ hreflang: "x-default", href: listingPath(registry, registry.source_locale, listingId) });
  }

  return links;
}

export function hreflangForLocation(registry, location, locales) {
  const links = locales.map((locale) => ({
    hreflang: locale,
    href: locationPath(registry, locale, location),
  }));
  const fallback = locales.includes(registry.source_locale) ? registry.source_locale : locales[0];
  if (fallback) links.push({ hreflang: "x-default", href: locationPath(registry, fallback, location) });
  return links;
}

export function sitemapEntriesForListing(registry, listingId, translations) {
  const hreflang = hreflangForListing(registry, listingId, translations);
  return translations.filter((translation) => isTranslationIndexable(registry, translation)).map((translation) => ({
    type: "listing",
    locale: translation.locale,
    loc: listingPath(registry, translation.locale, listingId),
    hreflang,
  }));
}

export function sitemapEntriesForHome(registry) {
  const hreflang = hreflangForHome(registry);
  return publicIndexableLocales(registry).map((locale) => ({
    type: "home",
    locale: locale.code,
    loc: homePath(registry, locale.code),
    hreflang,
  }));
}

export function sitemapEntriesForContact(registry) {
  const hreflang = hreflangForContact(registry);
  return publicIndexableLocales(registry).map((locale) => ({
    type: "contact",
    locale: locale.code,
    loc: contactPath(registry, locale.code),
    hreflang,
  }));
}

function isActiveListing(listing) {
  return ACTIVE_LISTING_STATUSES.has(listing.listing_status || listing.facts?.listing_status || "available");
}

export function sitemapEntriesForLocations(registry, listings, translationsForListing) {
  return publicLocationNames(listings).flatMap((location) => {
    const locales = new Set();
    for (const listing of listings) {
      if (!isActiveListing(listing) || !matchesPublicLocationScope(listing, location)) continue;
      for (const translation of translationsForListing(listing)) {
        if (isTranslationIndexable(registry, translation)) locales.add(translation.locale);
      }
    }
    const localeCodes = [...locales].sort();
    const hreflang = hreflangForLocation(registry, location, localeCodes);
    return localeCodes.map((locale) => ({
      type: "location",
      locale,
      location,
      loc: locationPath(registry, locale, location),
      hreflang,
    }));
  });
}

export function sitemapEntriesForSeller(registry) {
  const hreflang = hreflangForSeller(registry);
  return publicIndexableLocales(registry).map((locale) => ({
    type: "seller",
    locale: locale.code,
    loc: sellerPath(registry, locale.code),
    hreflang,
  }));
}

// One entry per facet per public locale: 8 facets x 7 locales = 56. The
// facets are registry-driven, not inventory-driven, so an empty facet still
// exists as a page (it renders the empty state) and the count never moves with
// the catalogue.
export function sitemapEntriesForSearchFacets(registry) {
  return SEARCH_FACETS.flatMap((facet) => {
    const hreflang = hreflangForSearchFacet(registry, facet);
    return publicIndexableLocales(registry).map((locale) => ({
      type: "search_facet",
      locale: locale.code,
      loc: searchFacetPath(registry, locale.code, facet),
      facet: { param: facet.param, value: facet.value },
      hreflang,
    }));
  });
}

export function sitemapEntriesForGuides(registry, guideGroups) {
  return guideGroups
    .map((group) => {
      const first = group.documents[0];
      if (!first) return null;
      const locale = getLocale(registry, first.locale);
      if (!locale.public_enabled || !locale.indexable) return null;
      const hreflang = [
        { hreflang: locale.code, href: group.path },
        { hreflang: "x-default", href: group.path },
      ];
      return {
        type: "guide",
        locale: locale.code,
        loc: group.path,
        guide_id: first.id,
        hreflang,
      };
    })
    .filter(Boolean);
}
