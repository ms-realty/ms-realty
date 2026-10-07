import "server-only";
import type { PublicLocale } from "@/i18n/config";
import { type ApprovedArea, readApprovedAreas, readApprovedContent } from "@/server/content/public";
import type { Executor } from "@/server/db";
import type { ListingCard, PlaceCount } from "@/server/listings/view-models";
import { listSearchPlaces, searchListings } from "@/server/search/search";

export type AreaLocation = PlaceCount & { saleCount: number; rentCount: number };
export interface AreaData {
  guides: ApprovedArea[];
  locations: AreaLocation[];
  featured: ListingCard | null;
  contentFailed: boolean;
  inventoryFailed: boolean;
  sourceAvailable: boolean;
}

export const unavailableAreaData = (): AreaData => ({
  guides: [],
  locations: [],
  featured: null,
  contentFailed: true,
  inventoryFailed: true,
  sourceAvailable: false,
});

/** Geography comes from approved CMS bindings or the same eligible inventory as search. */
export async function loadAreaData(db: Executor, locale: PublicLocale): Promise<AreaData> {
  const [content, sales, rentals] = await Promise.allSettled([
    readApprovedAreas(db, locale),
    listSearchPlaces(db, { locale, purpose: "sale" }),
    listSearchPlaces(db, { locale, purpose: "long_term_rent" }),
  ]);
  const guides = content.status === "fulfilled" ? content.value : [];
  const inventoryFailed = sales.status === "rejected" || rentals.status === "rejected";
  const locations = new Map<string, AreaLocation>();
  // An incomplete read is an outage, not a count of zero or an assertion of no inventory.
  if (!inventoryFailed) {
    for (const [result, purpose] of [
      [sales, "saleCount"],
      [rentals, "rentCount"],
    ] as const) {
      if (result.status !== "fulfilled") continue;
      for (const place of result.value) {
        const location = locations.get(place.id) ?? { ...place, saleCount: 0, rentCount: 0 };
        const combined = { ...location, [purpose]: place.count };
        locations.set(place.id, { ...combined, count: combined.saleCount + combined.rentCount });
      }
    }
  }
  let featured: ListingCard | null = null;
  let previewFailed = false;
  const featuredGuide = guides.find((guide) => guide.geography[0]);
  const featuredPlaceId = featuredGuide?.geography[0]?.id;
  if (featuredPlaceId && !inventoryFailed) {
    try {
      for (const purpose of ["sale", "long_term_rent"] as const) {
        const result = await searchListings(db, {
          locale,
          purpose,
          placeIds: [featuredPlaceId],
          pageSize: 4,
          sort: "newest",
        });
        featured =
          result.items.find((listing) => listing.cover?.kind === "photo") ??
          result.items[0] ??
          null;
        if (featured?.cover?.kind === "photo") break;
      }
    } catch {
      previewFailed = true;
      featured = null;
    }
  }
  const sourceAvailable =
    locale !== "bg" && content.status === "fulfilled" && !guides.length
      ? await readApprovedAreas(db, "bg")
          .then((areas) => areas.length > 0)
          .catch(() => false)
      : false;
  return {
    guides,
    locations: [...locations.values()],
    featured,
    contentFailed: content.status === "rejected",
    inventoryFailed: inventoryFailed || previewFailed,
    sourceAvailable,
  };
}

export interface AreaInventory {
  items: readonly ListingCard[];
  saleCount: number;
  rentCount: number;
  failed: boolean;
}

export async function loadAreaGuide(db: Executor, locale: PublicLocale, slug: string) {
  try {
    const area = (await readApprovedAreas(db, locale)).find((guide) => guide.slug === slug) ?? null;
    const sourceAvailable =
      !area && locale !== "bg" ? Boolean(await readApprovedContent(db, "area", slug, "bg")) : false;
    return { area, sourceAvailable, failed: false };
  } catch {
    return { area: null, sourceAvailable: false, failed: true };
  }
}

export async function loadAreaInventory(
  db: Executor,
  locale: PublicLocale,
  placeId: string | null,
): Promise<AreaInventory | null> {
  // No inferred binding from a guide's title, jurisdiction or prose.
  if (!placeId) return null;
  try {
    const [sales, rentals] = await Promise.all([
      searchListings(db, {
        locale,
        purpose: "sale",
        placeIds: [placeId],
        pageSize: 3,
        sort: "newest",
      }),
      searchListings(db, {
        locale,
        purpose: "long_term_rent",
        placeIds: [placeId],
        pageSize: 3,
        sort: "newest",
      }),
    ]);
    return {
      items: [...sales.items, ...rentals.items],
      saleCount: sales.count.value,
      rentCount: rentals.count.value,
      failed: false,
    };
  } catch {
    return { items: [], saleCount: 0, rentCount: 0, failed: true };
  }
}
