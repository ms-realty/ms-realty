import { cookies, headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import {
  localeCookie,
  type PublicLocale,
  routableLocales,
  suggestionDismissedCookie,
} from "@/i18n/config";
import { negotiateLocale } from "@/i18n/negotiate";
import type { SuggestionCopy } from "./language-suggestion";

/**
 * A language to suggest on this page, or null. Suggested only when the browser prefers
 * another routable language, the visitor has not chosen this one explicitly, and has not
 * dismissed suggestions. Never a redirect (F01, A02).
 */
export async function languageSuggestionFor(
  locale: PublicLocale,
): Promise<{ locale: PublicLocale; copy: SuggestionCopy } | null> {
  const [headerList, cookieJar] = await Promise.all([headers(), cookies()]);
  if (cookieJar.has(suggestionDismissedCookie)) return null;
  if (cookieJar.get(localeCookie)?.value === locale) return null;
  const preferred = negotiateLocale(headerList.get("accept-language"), routableLocales());
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
