"use server";

import { getDb } from "@/db/client";
import { type SavedProperty, validSavedReferences } from "@/features/discovery/saved-property-data";
import { isRoutableLocale, type PublicLocale } from "@/i18n/config";
import { getPublicListing } from "@/server/listings/detail";

/** P08: read current approved public summaries; never persist a browser's saves on the server. */
export async function loadSavedProperties(
  locale: PublicLocale,
  references: readonly string[],
): Promise<SavedProperty[]> {
  if (!isRoutableLocale(locale) || !validSavedReferences(references))
    throw new Error("Invalid saved-property request");
  const items: SavedProperty[] = [];
  // Bound concurrency too: a full device-local list must not open fifty parallel DB reads.
  for (let index = 0; index < references.length; index += 5) {
    items.push(
      ...(await Promise.all(
        references.slice(index, index + 5).map(async (reference): Promise<SavedProperty> => {
          try {
            const result = await getPublicListing(getDb(), { reference, locale });
            if (result.status !== "listing") return { reference, status: "unavailable" };
            const listing = result.listing;
            return {
              reference,
              status: "listing",
              listing: {
                reference: listing.reference,
                slug: listing.slug,
                manifestId: listing.manifestId,
                locale: listing.locale,
                purpose: listing.purpose,
                propertyType: listing.propertyType,
                title: listing.title,
                price: listing.price,
                place: listing.place,
                bedrooms: listing.bedrooms,
                area: listing.area,
                availability: listing.availability,
                cover: listing.cover,
              },
            };
          } catch {
            return { reference, status: "error" };
          }
        }),
      )),
    );
  }
  return items;
}
