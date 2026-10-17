import "server-only";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, permanentRedirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { cache } from "react";
import { getDb } from "@/db/client";
import { parseReference } from "@/domain/ids";
import { compareCopy } from "@/features/discovery/compare-copy";
import { discoveryCopy } from "@/features/discovery/copy";
import { intentCopy } from "@/features/discovery/intent-copy";
import { searchAlertCopy } from "@/features/discovery/search-alert-copy";
import { isRoutableLocale, type PublicLocale } from "@/i18n/config";
import { canonicalOrigin, localizedMetadata, localizedPath } from "@/i18n/seo";
import { hostOrigins } from "@/server/config/hosts";
import { readApprovedContent } from "@/server/content/public";
import { getPublicListing } from "@/server/listings/detail";
import { listingSlug } from "@/server/publication/presentation";
import { publicCataloguePages } from "./public-pages";

export function publicSeoOrigin(): URL {
  const origin = canonicalOrigin({
    CANONICAL_ORIGIN:
      process.env.CANONICAL_ORIGIN ??
      process.env.PUBLIC_ORIGIN ??
      (process.env.NODE_ENV !== "production" ? hostOrigins().public : undefined),
  });
  if (!origin)
    throw new Error("A valid CANONICAL_ORIGIN or PUBLIC_ORIGIN is required for public SEO");
  return origin;
}

export async function publicPageMetadata(input: {
  locale: string;
  path: string;
  title?: string;
  description?: string;
  availableIn?: readonly PublicLocale[];
}): Promise<Metadata> {
  if (!isRoutableLocale(input.locale)) notFound();
  const origin = publicSeoOrigin();
  const requestHeaders = await headers();
  const copy = discoveryCopy(input.locale);
  const metadata = localizedMetadata({
    ...input,
    locale: input.locale,
    host: requestHeaders.get("host"),
    origin,
  });
  // This header is stripped/rebuilt by the gateway and consumed only after origin trust.
  const external = requestHeaders.get("x-msr-rendered-path");
  if (external?.startsWith("/") && !external.startsWith("//") && !/[\\\r\n#]/.test(external)) {
    const canonical = new URL(external, origin).toString();
    const languages = { ...metadata.alternates?.languages };
    if (languages[input.locale]) languages[input.locale] = canonical;
    if (input.locale === "bg" && languages["x-default"]) languages["x-default"] = canonical;
    metadata.alternates = { ...metadata.alternates, canonical, languages };
  }
  return {
    title: input.title ?? copy.properties,
    description: input.description?.trim().slice(0, 320) || copy.intro,
    ...metadata,
  };
}

export const readPublicSeoListing = cache(async (reference: string, locale: PublicLocale) =>
  getPublicListing(getDb(), { reference, locale }),
);

export async function publicRouteMetadata(locale: string, path: string): Promise<Metadata> {
  if (!isRoutableLocale(locale)) notFound();
  const copy = discoveryCopy(locale);
  const titles: Record<string, string> = {
    "/": copy.properties,
    "/properties": copy.search,
    "/inquire": copy.ask,
    "/sell": copy.sell,
    "/let": copy.let,
    "/saved": copy.saved,
    "/compare": compareCopy(locale).title,
    "/properties/intent": intentCopy(locale).title,
    "/search-alerts": searchAlertCopy(locale).title,
  };
  return publicPageMetadata({
    locale,
    path,
    title:
      path === "/contact"
        ? (await getTranslations({ locale, namespace: "nav" }))("contact")
        : titles[path],
  });
}

export async function publicContentMetadata(
  locale: string,
  kind: "area" | "help" | "service",
  slug: string,
  path: string,
): Promise<Metadata> {
  if (!isRoutableLocale(locale)) notFound();
  const content = await readApprovedContent(getDb(), kind, slug, locale).catch(() => null);
  return publicPageMetadata({
    locale,
    path,
    title: content?.title,
    description: content?.paragraphs.join(" "),
    availableIn: content ? [locale] : [],
  });
}

export function normalizePublicListingRoute(input: {
  locale: string;
  reference: string;
  slug: string;
}) {
  if (!isRoutableLocale(input.locale)) notFound();
  const parsed = parseReference(input.reference);
  if (parsed?.kind !== "listing") notFound();
  const reference = parsed.reference;
  const slug = listingSlug(reference);
  const path = `/properties/${encodeURIComponent(reference)}/${slug}`;
  if (input.reference !== reference || input.slug !== slug)
    permanentRedirect(localizedPath(input.locale, path));
  return { locale: input.locale, reference, slug, path };
}

export async function publicListingMetadata(input: {
  locale: string;
  reference: string;
  slug: string;
}): Promise<Metadata> {
  const route = normalizePublicListingRoute(input);
  // Metadata must not preempt PropertyPage's existing database-failure recovery screen.
  const result = await readPublicSeoListing(route.reference, route.locale).catch(() => null);
  const copy = discoveryCopy(route.locale);
  const availableIn =
    result?.status === "listing"
      ? (await publicCataloguePages(route.reference).catch(() => []))
          .filter((page) => page.reference === route.reference)
          .map((page) => page.locale)
      : [];
  return publicPageMetadata({
    locale: route.locale,
    path: route.path,
    title:
      result?.status === "listing"
        ? (result.listing.title ?? result.listing.reference)
        : route.reference,
    description:
      result?.status === "listing"
        ? (result.listing.description ?? copy.intro)
        : result
          ? copy.unavailable
          : copy.failed,
    availableIn,
  });
}

export async function publicPageUrl(locale: PublicLocale, path: string) {
  const origin = publicSeoOrigin();
  const external = (await headers()).get("x-msr-rendered-path");
  return new URL(
    external?.startsWith("/") && !external.startsWith("//") && !/[\\\r\n#]/.test(external)
      ? external
      : localizedPath(locale, path),
    origin,
  ).toString();
}

export const publicListingUrl = (locale: PublicLocale, reference: string, slug: string) => {
  const route = normalizePublicListingRoute({ locale, reference, slug });
  return publicPageUrl(locale, route.path);
};
