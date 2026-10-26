import type { PublicLocale } from "@/i18n/config";

export type PageLocaleAvailability = {
  pathname: string;
  locales: readonly PublicLocale[];
  /** Exact original path of this verified source record, when the gateway retains it. */
  sourcePath?: string;
};

export function pagePathname(path: string) {
  const pathname = path.split(/[?#]/u)[0] ?? "";
  try {
    // Original paths contain both Unicode and percent-encoded spellings. decodeURI
    // leaves encoded slash/query/hash separators intact instead of changing scope.
    return decodeURI(pathname);
  } catch {
    return pathname;
  }
}
export const isArchivePagePath = (path: string) =>
  /^\/[^/]+\/legacy(?:\/|$)/u.test(pagePathname(path));

export function matchesPageAvailability(
  pathname: string,
  availability?: PageLocaleAvailability | null,
) {
  const path = pagePathname(pathname);
  return Boolean(
    availability &&
      (pagePathname(availability.pathname) === path ||
        (availability.sourcePath && pagePathname(availability.sourcePath) === path)),
  );
}

export function localeLinkPath(pathname: string, availability?: PageLocaleAvailability | null) {
  return matchesPageAvailability(pathname, availability)
    ? (availability?.pathname ?? pathname)
    : pathname;
}

/** Same-page links need an actual edition, not merely a translated interface.
 * Layouts can survive client navigation. Never reuse another page's availability
 * on an archive: without matching server context, retain only its current locale.
 */
export function samePageLocales(
  pathname: string,
  locales: readonly PublicLocale[],
  availability?: PageLocaleAvailability | null,
): readonly PublicLocale[] {
  const path = pagePathname(pathname);
  if (availability && matchesPageAvailability(path, availability))
    return locales.filter((locale) => availability.locales.includes(locale));
  if (isArchivePagePath(path)) {
    const current = path.split("/")[1];
    return locales.filter((locale) => locale === current);
  }
  return locales;
}
