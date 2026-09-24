import { headers } from "next/headers";
import {
  appLocaleHeader,
  defaultLocale,
  isPublicLocale,
  type PublicLocale,
  routableLocales,
} from "./config";
import { negotiateLocale } from "./negotiate";

/**
 * The locale of the current request for components without route params (not-found pages).
 * Falls back to negotiation when the proxy did not run (router prefetches).
 */
export async function requestLocale(): Promise<PublicLocale> {
  const headerList = await headers();
  const value = headerList.get(appLocaleHeader);
  if (value && isPublicLocale(value)) return value;
  return negotiateLocale(headerList.get("accept-language"), routableLocales()) ?? defaultLocale;
}
