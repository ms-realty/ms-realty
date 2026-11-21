// Public listing detail (architecture §7.3, §10; P05, P06). Built only from the listing's active
// website manifest in the requested locale. A restricted or withdrawn publication keeps a
// truthful unavailable surface with nothing but its reference and purpose; a listing never
// published in the locale is not found. Sold, let and withdrawn availability is shown as it is,
// with offered alternatives, instead of being dressed up as an offer.
import "server-only";
import { and, eq } from "drizzle-orm";
import { agency } from "@/config/tenant";
import { currentPublications, listings, properties } from "@/db/schema";
import { type Fact, type FactState, type PropertyType, sameKindTypes } from "@/domain/facts";
import { type PublicLocale, parseReference } from "@/domain/ids";
import { decisionFactKeys } from "@/domain/listing-readiness";
import { derivePublicPresentation } from "@/domain/publication";
import type { Executor } from "../db";
import {
  factGroup,
  headlineArea,
  loadPublishedListings,
  type PublishedListing,
  presentationOf,
  publicDestination,
  toCard,
} from "../publication/presentation";
import { searchListings } from "../search/search";
import type {
  FactGroup,
  ListingCard,
  PublicFact,
  PublicListingResult,
  ToConfirmItem,
} from "./view-models";

/** The agency's truthful identity until a responsible person is assigned and approved. */
export const agencyTeamLabel = agency.name;

const maxAlternatives = 3;

const groupOrder: readonly FactGroup[] = [
  "price",
  "space",
  "building",
  "condition",
  "access",
  "facilities",
  "planning",
];

function publicFacts(listing: PublishedListing): PublicFact[] {
  const relevant = new Set(decisionFactKeys(listing.propertyType));
  return [...listing.facts.values()]
    .filter(
      // Features irrelevant to this kind of property are shown only when actually known.
      (f) => !f.key.startsWith("feature.") || f.fact.state === "known" || relevant.has(f.key),
    )
    .sort(
      (a, b) =>
        groupOrder.indexOf(a.group) - groupOrder.indexOf(b.group) || a.key.localeCompare(b.key),
    );
}

const openStates: readonly FactState[] = ["unknown", "not_supplied", "conflicting"];

/** Decision-relevant facts nobody has settled: questions to ask, never invented answers. */
function toConfirm(listing: PublishedListing): ToConfirmItem[] {
  const items: ToConfirmItem[] = [];
  for (const key of decisionFactKeys(listing.propertyType)) {
    const fact: Fact<unknown> | undefined =
      key === "area" ? headlineArea(listing) : listing.facts.get(key)?.fact;
    const state = fact?.state ?? "unknown";
    if (openStates.includes(state)) {
      items.push({ key, group: factGroup(key), state: state as ToConfirmItem["state"] });
    }
  }
  return items;
}

/**
 * Up to three similar public listings of the same kind group (homes, land, commercial): the
 * same purpose in the same place first, then the same
 * purpose at a nearby price (within a third either way), newest first, never the one shown.
 * Built only from the public search, so every card is an eligible publication in this locale.
 */
async function alternatives(
  db: Executor,
  input: {
    locale: PublicLocale;
    now: Date;
    /** The listing shown; only its reference and purpose when it is not public. */
    card: Pick<ListingCard, "reference" | "purpose"> &
      Partial<Pick<ListingCard, "place" | "price">> & { propertyType?: PropertyType };
  },
): Promise<ListingCard[]> {
  const { card, locale, now } = input;
  const found = new Map<string, ListingCard>();
  const add = (items: readonly (ListingCard & { match?: unknown; unconfirmed?: unknown })[]) => {
    for (const { match: _match, unconfirmed: _unconfirmed, ...item } of items)
      if (item.reference !== card.reference && found.size < maxAlternatives)
        found.set(item.reference, item);
  };
  const base = {
    locale,
    purpose: card.purpose,
    sort: "newest" as const,
    pageSize: maxAlternatives + 1,
    // Only the same kind of property: homes, land or commercial (an office is not an alternative
    // to an apartment). Unknown for a listing that is no longer public.
    ...(card.propertyType ? { propertyTypes: [...sameKindTypes(card.propertyType)] } : {}),
  };
  const place = card.place?.settlement?.id ?? card.place?.municipality?.id;
  if (place) add((await searchListings(db, { ...base, placeIds: [place] }, { now })).items);
  if (found.size < maxAlternatives && card.price?.state === "known") {
    const { amountMinor, currency } = card.price.value;
    add(
      (
        await searchListings(
          db,
          {
            ...base,
            price: {
              currency,
              min: Math.floor((amountMinor * 2) / 3),
              max: Math.ceil((amountMinor * 4) / 3),
            },
          },
          { now },
        )
      ).items,
    );
  }
  if (found.size < maxAlternatives) add((await searchListings(db, base, { now })).items);
  return [...found.values()];
}

export async function getPublicListing(
  db: Executor,
  input: { readonly reference: string; readonly locale: PublicLocale; readonly now?: Date },
): Promise<PublicListingResult> {
  const now = input.now ?? new Date();
  const parsed = parseReference(input.reference);
  if (parsed?.kind !== "listing") return { status: "not_found" };
  const { locale } = input;
  const [listing] = await loadPublishedListings(db, { references: [parsed.reference] }, locale);

  if (listing) {
    const shown = presentationOf(listing, now);
    const detail = {
      ...toCard(listing, now),
      description: listing.description,
      facts: publicFacts(listing),
      media: listing.media,
      toConfirm: toConfirm(listing),
      responsibleTeam: { label: agencyTeamLabel },
      indexable: shown.indexable,
      publishedAt: listing.activatedAt.toISOString(),
    };
    return {
      status: "listing",
      listing: detail,
      alternatives: await alternatives(db, { locale, card: detail, now }).catch(() => []),
    };
  }

  // Not public: tell restricted/withdrawn (a truthful unavailable surface) from never published.
  const [pointer] = await db
    .select({
      state: currentPublications.state,
      purpose: listings.purpose,
      commercialState: listings.commercialState,
      propertyType: properties.propertyType,
    })
    .from(currentPublications)
    .innerJoin(listings, eq(listings.id, currentPublications.listingId))
    .innerJoin(properties, eq(properties.id, listings.propertyId))
    .where(
      and(
        eq(listings.reference, parsed.reference),
        eq(currentPublications.locale, locale),
        eq(currentPublications.destination, publicDestination),
      ),
    );
  const presentation = derivePublicPresentation({
    // An active pointer that failed eligibility (superseded generation, stale locale) is
    // shown as restricted: its content is no longer approved.
    pointer: pointer ? (pointer.state === "active" ? "restricted" : pointer.state) : null,
    commercial: pointer?.commercialState ?? "withdrawn",
    freshness: "unknown",
    localeIndexable: false,
  });
  if (!pointer || presentation.surface !== "unavailable") return { status: "not_found" };
  return {
    status: "unavailable",
    reference: parsed.reference,
    purpose: pointer.purpose,
    alternatives: await alternatives(db, {
      locale,
      card: {
        reference: parsed.reference,
        purpose: pointer.purpose,
        propertyType: pointer.propertyType,
      },
      now,
    }),
  };
}
