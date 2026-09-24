import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { defaultLocale, indexableLocales, type PublicLocale } from "@/i18n/config";
import { canonicalOrigin, isCanonicalHost, localizedPath, requestHost } from "@/i18n/seo";

// Indexable pages in indexable locales only, each with its hreflang alternates. Pages join
// as their slices make them indexable (area/search landing pages are curated, §20.4).
const indexablePaths = ["/"];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Read per request: the answer depends on the host and on CANONICAL_ORIGIN at runtime.
  const host = requestHost(await headers());
  const origin = canonicalOrigin();
  if (!origin || !isCanonicalHost(host, origin)) return [];
  const locales = indexableLocales();
  const url = (locale: PublicLocale, path: string) =>
    new URL(localizedPath(locale, path), origin).toString();

  return indexablePaths.flatMap((path) =>
    locales.map((locale) => ({
      url: url(locale, path),
      alternates: {
        languages: Object.fromEntries([
          ...locales.map((alternate) => [alternate, url(alternate, path)]),
          ["x-default", url(defaultLocale, path)],
        ]),
      },
    })),
  );
}
