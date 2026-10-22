// Synthetic fixtures only; the runtime reader never creates or reconstructs history.
import { randomUUID } from "node:crypto";
import { listings, properties } from "@/db/schema";
import type { Executor } from "../db";

export async function historyListingFixture(db: Executor) {
  const suffix = randomUUID().slice(0, 8).toUpperCase();
  const [property] = await db
    .insert(properties)
    .values({
      reference: `PROP-HISTORY-${suffix}`,
      propertyType: "apartment",
      country: "BG",
      region: "Synthetic region",
      settlement: "Synthetic settlement",
    })
    .returning();
  if (!property) throw new Error("Missing synthetic property");
  const [listing] = await db
    .insert(listings)
    .values({ reference: `MS-HIST-${suffix}`, propertyId: property.id, purpose: "sale" })
    .returning();
  if (!listing) throw new Error("Missing synthetic listing");
  return { listing, property };
}
