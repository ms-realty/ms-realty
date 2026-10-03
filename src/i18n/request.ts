// next-intl request configuration. Public pages set their locale from the `[locale]` segment,
// the workspace from its URL, not-found pages from negotiation; each calls `setRequestLocale`
// before rendering. A missing locale falls back to the source.
import { getRequestConfig } from "next-intl/server";
import { agencyTimeZone, defaultLocale, isPublicLocale } from "./config";
import { loadMessages } from "./messages";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = requested && isPublicLocale(requested) ? requested : defaultLocale;
  return { locale, timeZone: agencyTimeZone, messages: await loadMessages(locale) };
});
