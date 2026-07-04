import { getLocale, publicIndexableLocales } from "./locales.mjs";

const PUBLIC_TRANSLATION_STATES = new Set(["approved", "published"]);

export function listingPath(registry, localeCode, listingId) {
  const locale = getLocale(registry, localeCode);
  return `/${locale.code}/${locale.route_segments.listing}/${listingId}`;
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
    locale: translation.locale,
    loc: listingPath(registry, translation.locale, listingId),
    hreflang,
  }));
}
