// next-intl request configuration. Public pages set their locale from the `[locale]` segment,
// the workspace from the staff preference cookie, not-found pages from negotiation; each
// calls `setRequestLocale` before rendering. A missing locale falls back to the source.
import { getRequestConfig } from "next-intl/server";
import { agencyTimeZone, defaultLocale, isPublicLocale, type PublicLocale } from "./config";

export async function loadMessages(locale: PublicLocale) {
  return (await import(`../../messages/${locale}.json`))
    .default as typeof import("../../messages/en.json");
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = requested && isPublicLocale(requested) ? requested : defaultLocale;
  return { locale, timeZone: agencyTimeZone, messages: await loadMessages(locale) };
});
