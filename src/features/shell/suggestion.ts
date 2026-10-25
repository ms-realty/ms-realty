import { cookies, headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import {
  localeCookie,
  type PublicLocale,
  requestPathHeader,
  routableLocales,
  suggestionDismissedCookie,
} from "@/i18n/config";
import { negotiateLocale } from "@/i18n/negotiate";
import type { SuggestionCopy } from "./language-suggestion";
import {
  isArchivePagePath,
  type PageLocaleAvailability,
  pagePathname,
} from "./page-locale-availability";

/** The proxy overwrites x-app-path. Source lookup, never browser preference or
 * a locale-shaped URL, determines which editions of an exact archive ID exist.
 */
export async function publicPageLocaleAvailability(
  locale: PublicLocale,
): Promise<PageLocaleAvailability | null> {
  const pathname = pagePathname((await headers()).get(requestPathHeader) ?? "");
  if (!isArchivePagePath(pathname)) return null;
  const match = /^\/([a-z]{2})\/legacy\/([0-9a-f]{24})\/?$/u.exec(pathname);
  const id = match?.[2];
  if (!id || match?.[1] !== locale) return { pathname, locales: [] };
  // Ordinary public routes do not load the preserved source inventory.
  const { getLegacyPage } = await import("@/server/legacy/pages");
  const pages = routableLocales().flatMap((candidate) => {
    const page = getLegacyPage(candidate, id);
    return page ? [page] : [];
  });
  return {
    pathname,
    locales: pages.map((page) => page.locale),
    sourcePath: pages.find((page) => page.locale === locale)?.sourcePath,
  };
}

/**
 * A language to suggest on this page, or null. Suggested only when the browser prefers
 * another routable language, the visitor has not chosen this one explicitly, and has not
 * dismissed suggestions. Never a redirect (F01, AT03).
 */
export async function languageSuggestionFor(
  locale: PublicLocale,
  availableLocales?: readonly PublicLocale[],
): Promise<{ locale: PublicLocale; copy: SuggestionCopy } | null> {
  const [headerList, cookieJar] = await Promise.all([headers(), cookies()]);
  if (cookieJar.has(suggestionDismissedCookie)) return null;
  if (cookieJar.get(localeCookie)?.value === locale) return null;
  const supported =
    availableLocales ?? (await publicPageLocaleAvailability(locale))?.locales ?? routableLocales();
  const preferred = negotiateLocale(headerList.get("accept-language"), supported);
  if (!preferred || preferred === locale) return null;

  const t = await getTranslations({ locale: preferred, namespace: "common.languageSuggestion" });
  return {
    locale: preferred,
    copy: {
      label: t("label"),
      message: t("message"),
      switchLabel: t("switch"),
      dismiss: t("dismiss"),
    },
  };
}
