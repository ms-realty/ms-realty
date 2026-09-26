// Public listing detail (spec F03, F09, P05, P06, P21, §18.1, §19.2). A listing that was never
// live is not_found; a live one that is sold, let or withdrawn, or one taken off the website,
// is unavailable with up to three offered alternatives in the same place and purpose.
import "server-only";
import { and, eq } from "drizzle-orm";
import { listings, properties } from "@/db/schema";
import type { Fact, FactState } from "@/domain/facts";
import { type PublicLocale, parseReference } from "@/domain/ids";
import { decisionFactKeys } from "@/domain/listing-readiness";
import { localePolicy } from "@/i18n/config";
import type { Executor } from "../db";
import { loadPublicMedia } from "../media/public-media";
import { offeredListingIdsIn } from "../search/search";
import {
  factGroup,
  headlineArea,
  listingSlug,
  loadCards,
  loadPlaceChains,
  loadPublishedListings,
  localizedTitle,
  type PlaceNode,
  type PublishedListing,
  placeName,
  presentation,
  priceFact,
  publicPlace,
} from "./published";
import type {
  FactGroup,
  PublicFact,
  PublicListingDetail,
  PublicListingResult,
  ToConfirmItem,
  UnavailableListing,
  UnavailableReason,
} from "./view-models";

/** The agency's truthful identity until a responsible person is assigned and approved. */
export const agencyTeamLabel = "MS Realty";

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

const unavailableReasons: readonly UnavailableReason[] = ["sold", "let", "withdrawn"];

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

function toConfirm(listing: PublishedListing): ToConfirmItem[] {
  const items: ToConfirmItem[] = [];
  const open = (state: FactState | undefined): state is "unknown" | "not_provided" =>
    state === undefined || state === "unknown" || state === "not_provided";
  for (const key of decisionFactKeys(listing.propertyType)) {
    const fact: Fact<unknown> | undefined =
      key === "area" ? headlineArea(listing) : listing.facts.get(key)?.fact;
    const state = fact?.state;
    if (open(state)) items.push({ key, group: factGroup(key), state: state ?? "unknown" });
  }
  return items;
}

async function alternatives(
  db: Executor,
  listing: { listingId: string; purpose: PublishedListing["purpose"]; placeId: string | null },
  locale: PublicLocale,
) {
  if (!listing.placeId) return [];
  const ids = await offeredListingIdsIn(
    db,
    listing.purpose,
    listing.placeId,
    [listing.listingId],
    maxAlternatives,
  );
  return loadCards(db, ids, locale);
}

function alternativesPlace(chain: readonly PlaceNode[], locale: PublicLocale) {
  const node = chain[0];
  return node ? placeName(node, locale) : null;
}

/** A listing taken off the website: only its reference, purpose and place stay public. */
async function removedListing(
  db: Executor,
  reference: string,
  locale: PublicLocale,
): Promise<PublicListingResult> {
  const [row] = await db
    .select({ listing: listings, property: properties })
    .from(listings)
    .innerJoin(properties, eq(properties.id, listings.propertyId))
    .where(and(eq(listings.reference, reference), eq(listings.distributionState, "withdrawn")));
  if (!row) return { status: "not_found" };
  const { listing, property } = row;
  const chain = property.placeId
    ? ((await loadPlaceChains(db, [property.placeId])).get(property.placeId) ?? [])
    : [];
  const unavailable: UnavailableListing = {
    reference,
    slug: listingSlug(reference),
    reason: "removed",
    purpose: listing.purpose,
    title: null,
    titleLocale: "bg",
    place: publicPlace(
      chain,
      { country: property.country, precision: property.publicPrecision, neighborhood: null },
      locale,
    ),
    updatedAt: listing.updatedAt.toISOString(),
    alternatives: await alternatives(
      db,
      { listingId: listing.id, purpose: listing.purpose, placeId: property.placeId },
      locale,
    ),
    alternativesCriteria: { purpose: listing.purpose, place: alternativesPlace(chain, locale) },
  };
  return { status: "unavailable", listing: unavailable };
}

export async function getPublicListing(
  db: Executor,
  input: { readonly reference: string; readonly locale: PublicLocale },
): Promise<PublicListingResult> {
  const parsed = parseReference(input.reference);
  if (parsed?.kind !== "listing") return { status: "not_found" };
  const { locale } = input;
  const [listing] = await loadPublishedListings(db, { references: [parsed.reference] }, locale);
  if (!listing) return removedListing(db, parsed.reference, locale);

  const shown = presentation(listing, locale, localePolicy(locale).indexable);
  const place = publicPlace(listing.placeChain, listing, locale);
  const slug = listingSlug(listing.reference);
  const title = localizedTitle(listing);

  const reason = unavailableReasons.find((r) => r === shown.availability);
  if (reason) {
    return {
      status: "unavailable",
      listing: {
        reference: listing.reference,
        slug,
        reason,
        purpose: listing.purpose,
        ...title,
        place,
        updatedAt: listing.updatedAt.toISOString(),
        alternatives: await alternatives(db, listing, locale),
        alternativesCriteria: {
          purpose: listing.purpose,
          place: alternativesPlace(listing.placeChain, locale),
        },
      },
    };
  }

  const media = (await loadPublicMedia(db, [listing.versionId])).get(listing.versionId) ?? [];
  const detail: PublicListingDetail = {
    reference: listing.reference,
    slug,
    version: listing.publishedVersion,
    purpose: listing.purpose,
    propertyType: listing.propertyType,
    ...title,
    price: priceFact(listing),
    commercial: {
      state: listing.commercialState,
      availability: shown.availability,
      primaryAction: shown.primaryAction,
      reservationBasis: listing.commercialState === "reserved" ? listing.reservationBasis : null,
      availabilityCheckedAt: listing.availabilityCheckedAt?.toISOString() ?? null,
    },
    facts: publicFacts(listing),
    description: {
      source: {
        locale: listing.sourceText?.locale ?? "bg",
        title: listing.sourceText?.title ?? null,
        text: listing.sourceText?.description ?? null,
      },
      translation: listing.translation
        ? {
            locale: listing.translation.locale,
            title: listing.translation.title,
            text: listing.translation.description,
          }
        : null,
      translationApproved: listing.translation !== null,
    },
    media,
    place,
    responsibleTeam: { label: agencyTeamLabel },
    toConfirm: toConfirm(listing),
    servedInLocale: shown.servedInLocale,
    indexable: shown.indexable,
    updatedAt: listing.updatedAt.toISOString(),
  };
  return { status: "available", listing: detail };
}
