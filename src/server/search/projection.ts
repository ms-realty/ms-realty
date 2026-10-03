// The search projection (architecture §10): one typed row per listing and locale, built from
// the read-back of the active manifest so search never sees an unapproved revision. Activation
// writes it and restriction or withdrawal removes it, in the same transaction as the pointer
// change. Availability is not projected: search reads it live from the listing.
import "server-only";
import { listingSearchDocuments } from "@/db/schema";
import type { Area, AreaBasis, Fact, FactState, Money } from "@/domain/facts";
import type { Executor } from "../db";
import type { PublishedListing } from "../publication/presentation";

type SearchDocument = typeof listingSearchDocuments.$inferInsert;

function factAt<T>(listing: PublishedListing, key: string): Fact<T> | undefined {
  return listing.facts.get(key)?.fact as Fact<T> | undefined;
}

// A fact never recorded is unknown, which filters treat exactly like a recorded unknown.
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
  const knownPrice = price?.state === "known" ? price.value : null;
  const bedrooms = numberState(factAt<number>(listing, "bedrooms"));
  const rooms = numberState(factAt<number>(listing, "rooms"));
  const living = areaState(listing, "living");
  const built = areaState(listing, "built");
  const total = areaState(listing, "total");
  const land = areaState(listing, "land");
  return {
    listingId: listing.listingId,
    locale: listing.locale,
    manifestId: listing.manifestId,
    reference: listing.reference,
    purpose: listing.purpose,
    propertyType: listing.propertyType,
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
    // Approved place names and aliases (Cyrillic, Latin, local and legacy spellings, AT07).
    searchText: [
      listing.reference,
      ...listing.placeChain.flatMap((p) => [p.nameNative, p.nameLatin]),
      ...listing.placeAliases,
      listing.title ?? "",
    ]
      .filter(Boolean)
      .join(" "),
    updatedAt: new Date(),
  };
}

/** Writes the listing's row for the published listing's locale and manifest. */
export async function writeSearchDocument(db: Executor, listing: PublishedListing): Promise<void> {
  const document = buildSearchDocument(listing);
  const { listingId: _listing, locale: _locale, ...changes } = document;
  await db
    .insert(listingSearchDocuments)
    .values(document)
    .onConflictDoUpdate({
      target: [listingSearchDocuments.listingId, listingSearchDocuments.locale],
      set: changes,
    });
}
