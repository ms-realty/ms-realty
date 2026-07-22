import { getLocale, publicIndexableLocales } from "./locales.mjs";

const PUBLIC_TRANSLATION_STATES = new Set(["approved", "published"]);
const ACTIVE_LISTING_STATUSES = new Set(["available", "reserved"]);

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

export function hreflangForSeller(registry) {
  return [
    ...publicIndexableLocales(registry).map((locale) => ({
      hreflang: locale.code,
      href: sellerPath(registry, locale.code),
    })),
    { hreflang: "x-default", href: sellerPath(registry, registry.source_locale) },
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

function listingLocation(listing) {
  return String(listing.location || listing.facts?.location || "").trim();
}

function isActiveListing(listing) {
  return ACTIVE_LISTING_STATUSES.has(listing.listing_status || listing.facts?.listing_status || "available");
}

export function sitemapEntriesForLocations(registry, listings, translationsForListing) {
  const byLocation = new Map();
  for (const listing of listings) {
    if (!isActiveListing(listing)) continue;
    const location = listingLocation(listing);
    if (!location) continue;
    for (const translation of translationsForListing(listing)) {
      if (!isTranslationIndexable(registry, translation)) continue;
      const locales = byLocation.get(location) || new Set();
      locales.add(translation.locale);
      byLocation.set(location, locales);
    }
  }

  return [...byLocation.entries()].flatMap(([location, locales]) => {
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
