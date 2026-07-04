import { getLocale, publicIndexableLocales } from "./locales.mjs";

const PUBLIC_TRANSLATION_STATES = new Set(["approved", "published"]);

export function listingPath(registry, localeCode, listingId) {
  const locale = getLocale(registry, localeCode);
  return `/${locale.code}/${locale.route_segments.listing}/${listingId}`;
}

export function sellerPath(registry, localeCode) {
  const locale = getLocale(registry, localeCode);
  return `/${locale.code}/${locale.route_segments.seller}`;
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

export function sitemapEntriesForListing(registry, listingId, translations) {
  const hreflang = hreflangForListing(registry, listingId, translations);
  return translations.filter((translation) => isTranslationIndexable(registry, translation)).map((translation) => ({
    type: "listing",
    locale: translation.locale,
    loc: listingPath(registry, translation.locale, listingId),
    hreflang,
  }));
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
