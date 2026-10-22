import "server-only";
import { eq } from "drizzle-orm";
import { cache } from "react";
import { getDb } from "@/db/client";
import { contentPages, currentPublications, listings } from "@/db/schema";
import { isPublicLocale, parseReference } from "@/domain/ids";
import { type PublicLocale, publicLocales } from "@/i18n/config";
import { readApprovedContent } from "@/server/content/public";
import type { Executor } from "@/server/db";
import {
  eligiblePublications,
  listingSlug,
  publicDestination,
} from "@/server/publication/presentation";

export const publicStaticPaths = [
  "/",
  "/properties",
  "/inquire",
  "/sell",
  "/let",
  "/contact",
  "/saved",
  "/compare",
  "/properties/intent",
  "/search-alerts",
] as const;
export interface PublicCataloguePage {
  reference: string;
  locale: PublicLocale;
  path: string;
  publishedAt: Date;
}

// The same publication authority as public detail, including sold/let records with an
// active pointer. Never treat a draft/imported listing as publicly approved.
export async function readPublicCataloguePages(
  db: Executor,
  reference?: string,
): Promise<PublicCataloguePage[]> {
  const result: PublicCataloguePage[] = [];
  for (const locale of publicLocales) {
    const eligible = eligiblePublications(db, locale);
    const rows = await db
      .select({ reference: listings.reference, publishedAt: eligible.activatedAt })
      .from(eligible)
      .innerJoin(listings, eq(listings.id, eligible.listingId))
      .where(reference ? eq(listings.reference, reference) : undefined);
    for (const row of rows) {
      // Public detail accepts only canonical listing references, even if storage is malformed.
      const parsed = parseReference(row.reference);
      if (parsed?.kind !== "listing" || parsed.reference !== row.reference) continue;
      result.push({
        ...row,
        locale,
        path: `/properties/${encodeURIComponent(row.reference)}/${listingSlug(row.reference)}`,
      });
    }
  }
  return result;
}
export const publicCataloguePages = cache((reference?: string) =>
  readPublicCataloguePages(getDb(), reference),
);

export interface PublicListingRoutePage {
  reference: string;
  locale: PublicLocale;
  path: string;
  surface: "listing" | "unavailable" | "translation_fallback";
  publishedAt?: Date;
  /** Approved fact siblings only; a 200 placeholder is not a translated listing. */
  availableIn: readonly PublicLocale[];
}

/** Stable public 200 identities, including the detail route's safe unavailable/source fallbacks. */
export async function readPublicListingRoutePages(db: Executor): Promise<PublicListingRoutePage[]> {
  const catalogue = await readPublicCataloguePages(db);
  const pointers = await db
    .select({ reference: listings.reference, locale: currentPublications.locale })
    .from(currentPublications)
    .innerJoin(listings, eq(listings.id, currentPublications.listingId))
    .where(eq(currentPublications.destination, publicDestination));
  const byReference = new Map<string, Map<PublicLocale, PublicListingRoutePage>>();
  const approvedLocales = new Map<string, PublicLocale[]>();
  for (const page of catalogue) {
    const locales = approvedLocales.get(page.reference) ?? [];
    locales.push(page.locale);
    approvedLocales.set(page.reference, locales);
  }
  const add = (page: PublicListingRoutePage) => {
    const locales = byReference.get(page.reference) ?? new Map();
    locales.set(page.locale, page);
    byReference.set(page.reference, locales);
  };
  for (const page of catalogue)
    add({ ...page, surface: "listing", availableIn: approvedLocales.get(page.reference) ?? [] });
  // A website pointer which fails eligibility still exposes only reference/purpose, never facts.
  for (const pointer of pointers) {
    const parsed = parseReference(pointer.reference);
    if (
      parsed?.kind !== "listing" ||
      parsed.reference !== pointer.reference ||
      !isPublicLocale(pointer.locale)
    )
      continue;
    if (byReference.get(pointer.reference)?.has(pointer.locale)) continue;
    add({
      ...pointer,
      locale: pointer.locale,
      path: `/properties/${encodeURIComponent(pointer.reference)}/${listingSlug(pointer.reference)}`,
      surface: "unavailable",
      availableIn: [],
    });
  }
  // Missing locale pages exist only while the BG source is an eligible public listing.
  for (const source of catalogue.filter((page) => page.locale === "bg"))
    for (const locale of publicLocales) {
      if (byReference.get(source.reference)?.has(locale)) continue;
      add({
        reference: source.reference,
        locale,
        path: source.path,
        surface: "translation_fallback",
        availableIn: [],
      });
    }
  return [...byReference.values()].flatMap((pages) =>
    publicLocales.flatMap((locale) => {
      const page = pages.get(locale);
      return page ? [page] : [];
    }),
  );
}

export const publicListingRoutePages = cache(() => readPublicListingRoutePages(getDb()));

export async function publicContentPages(): Promise<
  { locale: PublicLocale; path: string; publishedAt: string }[]
> {
  const db = getDb();
  const rows = await db
    .select({ kind: contentPages.kind, slug: contentPages.slug })
    .from(contentPages)
    .where(eq(contentPages.publicationState, "active"));
  const result: { locale: PublicLocale; path: string; publishedAt: string }[] = [];
  for (const row of rows) {
    for (const locale of publicLocales) {
      const approved = await readApprovedContent(db, row.kind, row.slug, locale);
      if (!approved) continue;
      const directory =
        row.kind === "area" ? "areas" : row.kind === "service" ? "services" : "help";
      result.push({
        locale,
        path: `/${directory}/${encodeURIComponent(row.slug)}`,
        publishedAt: approved.reviewedAt,
      });
    }
  }
  return result;
}
