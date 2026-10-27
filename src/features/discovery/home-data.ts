import "server-only";
import type { PublicLocale } from "@/i18n/config";
import { readApprovedAreas, readApprovedContent } from "@/server/content/public";
import type { Executor } from "@/server/db";
import { searchListings } from "@/server/search/search";
import { publicServiceOfferings } from "@/server/service-intake/scope";

/** Home previews use the same current eligibility and exact CMS approval readers as destinations. */
export async function loadHomeDiscovery(db: Executor, locale: PublicLocale) {
  const [sales, rentals, areas, offerings] = await Promise.allSettled([
    searchListings(db, { locale, purpose: "sale", pageSize: 3, sort: "newest" }),
    searchListings(db, { locale, purpose: "long_term_rent", pageSize: 3, sort: "newest" }),
    readApprovedAreas(db, locale),
    publicServiceOfferings(db, undefined, locale),
  ]);
  const slugs =
    offerings.status === "fulfilled"
      ? [...new Set(offerings.value.map((offering) => offering.contentReference.slug))].slice(0, 20)
      : [];
  const services = (
    await Promise.all(
      slugs.map(async (slug) => {
        const content = await readApprovedContent(db, "service", slug, locale).catch(() => null);
        return content ? [{ slug, title: content.title }] : [];
      }),
    )
  ).flat();
  return {
    sales: sales.status === "fulfilled" ? sales.value : null,
    rentals: rentals.status === "fulfilled" ? rentals.value : null,
    areas: areas.status === "fulfilled" ? areas.value.slice(0, 4) : [],
    services,
  };
}
