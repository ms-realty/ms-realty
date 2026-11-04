import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { defaultLocale, indexableLocales, localePolicy } from "@/i18n/config";
import { localizedPath } from "@/i18n/seo";
import { publicSeoOrigin } from "@/server/seo/public-metadata";
import {
  publicContentPages,
  publicListingRoutePages,
  publicStaticPaths,
} from "@/server/seo/public-pages";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await headers();
  const origin = publicSeoOrigin();
  const groups = new Map<string, { locale: string; url: string; modified?: string | Date }[]>();
  const add = (
    path: string,
    locale: Parameters<typeof localizedPath>[0],
    modified?: string | Date,
  ) => {
    if (!localePolicy(locale).indexable) return;
    const pages = groups.get(path) ?? [];
    pages.push({ locale, url: new URL(localizedPath(locale, path), origin).toString(), modified });
    groups.set(path, pages);
  };
  for (const path of publicStaticPaths) for (const locale of indexableLocales()) add(path, locale);
  for (const page of await publicContentPages()) add(page.path, page.locale, page.publishedAt);
  const result = new Map<string, MetadataRoute.Sitemap[number]>();
  for (const pages of groups.values()) {
    const languages = Object.fromEntries(pages.map((page) => [page.locale, page.url]));
    if (languages[defaultLocale]) languages["x-default"] = languages[defaultLocale];
    for (const page of pages)
      result.set(page.url, {
        url: page.url,
        ...(page.modified ? { lastModified: page.modified } : {}),
        alternates: { languages },
      });
  }
  // AT27: route existence does not make an unavailable or fallback edition indexable.
  for (const page of await publicListingRoutePages()) {
    if (
      page.surface !== "listing" ||
      !localePolicy(page.locale).indexable ||
      !page.availableIn.includes(page.locale)
    )
      continue;
    const url = new URL(localizedPath(page.locale, page.path), origin).toString();
    const languages = Object.fromEntries(
      page.availableIn
        .filter((locale) => localePolicy(locale).indexable)
        .map((locale) => [locale, new URL(localizedPath(locale, page.path), origin).toString()]),
    );
    if (languages[defaultLocale]) languages["x-default"] = languages[defaultLocale];
    result.set(url, {
      url,
      ...(page.publishedAt ? { lastModified: page.publishedAt } : {}),
      alternates: { languages },
    });
  }
  // Legacy snapshots/same-path collectors remain planning inputs; no production indexing
  // approval exists for them. Preserve their routes and source records outside this index.
  return [...result.values()];
}
