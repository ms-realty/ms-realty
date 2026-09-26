// The search projection (F02, AD10): one typed row per listing live on the website, built from
// its released version so search never sees unreleased edits. Publication writes it,
// withdrawal removes it; any later change to a live listing's commercial state must refresh it.
import "server-only";
import { eq } from "drizzle-orm";
import { listingSearchDocuments } from "@/db/schema";
import type { Area, AreaBasis, Fact, FactState, Money } from "@/domain/facts";
import { sourceLocale } from "@/domain/ids";
import type { Executor } from "../db";
import { loadPublishedListings, type PublishedListing } from "../listings/published";

type SearchDocument = typeof listingSearchDocuments.$inferInsert;

function factAt<T>(listing: PublishedListing, key: string): Fact<T> | undefined {
  return listing.facts.get(key)?.fact as Fact<T> | undefined;
}

// A basis with no recorded fact is unknown, which filters treat exactly like a missing one.
const unrecorded: FactState = "unknown";

function numberState(fact: Fact<number> | undefined): { state: FactState; value: number | null } {
  if (fact?.state === "known") return { state: "known", value: fact.value };
  return { state: fact?.state ?? unrecorded, value: null };
}

function areaState(listing: PublishedListing, basis: AreaBasis) {
  const fact = factAt<Area>(listing, `area.${basis}`);
  if (fact?.state === "known") return { state: "known" as const, value: String(fact.value.value) };
  return { state: fact?.state ?? unrecorded, value: null };
}

/** feature key -> "true" | "false" for known booleans, "known" for other values, else the state. */
function featureStates(listing: PublishedListing): Record<string, string> {
  const features: Record<string, string> = {};
  for (const [key, entry] of listing.facts) {
    if (!key.startsWith("feature.")) continue;
    const { fact } = entry;
    features[key.slice(8)] =
      fact.state === "known"
        ? typeof fact.value === "boolean"
          ? String(fact.value)
          : "known"
        : fact.state;
  }
  return features;
}

export function buildSearchDocument(listing: PublishedListing): SearchDocument {
  const price = factAt<Money>(listing, "price");
  const bedrooms = numberState(factAt<number>(listing, "bedrooms"));
  const rooms = numberState(factAt<number>(listing, "rooms"));
  const living = areaState(listing, "living");
  const built = areaState(listing, "built");
  const total = areaState(listing, "total");
  const land = areaState(listing, "land");
  const knownPrice = price?.state === "known" ? price.value : null;
  return {
    listingId: listing.listingId,
    reference: listing.reference,
    purpose: listing.purpose,
    propertyType: listing.propertyType,
    commercialState: listing.commercialState,
    placeIds: listing.placeChain.map((p) => p.id),
    priceState: price?.state ?? unrecorded,
    priceAmountMinor: knownPrice?.amountMinor ?? null,
    priceCurrency: knownPrice?.currency ?? null,
    pricePeriod: knownPrice?.period ?? null,
    priceBasis: knownPrice?.basis ?? null,
    bedroomsState: bedrooms.state,
    bedrooms: bedrooms.value,
    roomsState: rooms.state,
    rooms: rooms.value,
    livingAreaState: living.state,
    livingArea: living.value,
    builtAreaState: built.state,
    builtArea: built.value,
    totalAreaState: total.state,
    totalArea: total.value,
    landAreaState: land.state,
    landArea: land.value,
    features: featureStates(listing),
    searchText: [
      listing.reference,
      ...listing.placeChain.flatMap((p) => [p.nameNative, p.nameLatin]),
      listing.sourceText?.title ?? "",
    ]
      .filter(Boolean)
      .join(" "),
    updatedAt: new Date(),
  };
}

/**
 * Writes the listing's search document when it is live on the website, removes it otherwise.
 * Call it in the transaction that changes what is live (publication, withdrawal, commercial
 * state of a live listing).
 */
export async function refreshSearchDocument(
  db: Executor,
  listingId: string,
): Promise<"written" | "removed"> {
  const [listing] = await loadPublishedListings(db, { ids: [listingId] }, sourceLocale);
  if (!listing) {
    await db.delete(listingSearchDocuments).where(eq(listingSearchDocuments.listingId, listingId));
    return "removed";
  }
  const document = buildSearchDocument(listing);
  const { listingId: _key, ...changes } = document;
  await db
    .insert(listingSearchDocuments)
    .values(document)
    .onConflictDoUpdate({ target: listingSearchDocuments.listingId, set: changes });
  return "written";
}
