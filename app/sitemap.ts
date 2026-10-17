import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { defaultLocale, publicLocales } from "@/i18n/config";
import { localizedPath } from "@/i18n/seo";
import { legacySnapshotPages } from "@/server/legacy/pages";
import { reviewedSamePathLegacyPages } from "@/server/legacy/sitemap";
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
    const pages = groups.get(path) ?? [];
    pages.push({ locale, url: new URL(localizedPath(locale, path), origin).toString(), modified });
    groups.set(path, pages);
  };
  for (const path of publicStaticPaths) for (const locale of publicLocales) add(path, locale);
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
  // Stable unavailable/translation-fallback pages are real response surfaces,
  // but only eligible locale publications can assert factual sibling alternates.
  for (const page of await publicListingRoutePages()) {
    const url = new URL(localizedPath(page.locale, page.path), origin).toString();
    const languages = Object.fromEntries(
      page.availableIn.map((locale) => [
        locale,
        new URL(localizedPath(locale, page.path), origin).toString(),
      ]),
    );
    if (languages[defaultLocale]) languages["x-default"] = languages[defaultLocale];
    result.set(url, {
      url,
      ...(page.publishedAt ? { lastModified: page.publishedAt } : {}),
      ...(page.availableIn.length ? { alternates: { languages } } : {}),
    });
  }
  // Prepared snapshots and source-reviewed same-path aliases are staging inputs.
  // Their inclusion does not grant translation approval or prove full parity.
  for (const page of legacySnapshotPages()) {
    const url = new URL(page.canonicalPath, origin).toString();
    result.set(url, {
      url,
      alternates: {
        languages: {
          [page.locale]: url,
          ...(page.locale === defaultLocale ? { "x-default": url } : {}),
        },
      },
    });
  }
  for (const page of reviewedSamePathLegacyPages(origin)) {
    result.set(page.url, {
      url: page.url,
      alternates: {
        languages: {
          [page.locale]: page.url,
          ...(page.locale === defaultLocale ? { "x-default": page.url } : {}),
        },
      },
    });
  }
  return [...result.values()];
}
