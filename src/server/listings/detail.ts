// Public listing detail (architecture §7.3, §10; P05, P06). Built only from the listing's active
// website manifest in the requested locale. A restricted or withdrawn publication keeps a
// truthful unavailable surface with nothing but its reference and purpose; a listing never
// published in the locale is not found. Sold, let and withdrawn availability is shown as it is,
// with offered alternatives, instead of being dressed up as an offer.
import "server-only";
import { and, eq } from "drizzle-orm";
import { currentPublications, listings } from "@/db/schema";
import type { Fact, FactState, ListingPurpose } from "@/domain/facts";
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

/** Newest offered public listings of the purpose, other than the one shown. */
async function alternatives(
  db: Executor,
  input: { locale: PublicLocale; purpose: ListingPurpose; exclude: string; now: Date },
): Promise<ListingCard[]> {
  const result = await searchListings(
    db,
    {
      locale: input.locale,
      purpose: input.purpose,
      sort: "newest",
      pageSize: maxAlternatives + 1,
    },
    { now: input.now },
  );
  return result.items
    .filter((item) => item.reference !== input.exclude)
    .slice(0, maxAlternatives)
    .map(({ match: _match, unconfirmed: _unconfirmed, ...card }) => card);
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
      alternatives:
        shown.primaryAction === "view_similar"
          ? await alternatives(db, {
              locale,
              purpose: listing.purpose,
              exclude: listing.reference,
              now,
            })
          : [],
    };
  }

  // Not public: tell restricted/withdrawn (a truthful unavailable surface) from never published.
  const [pointer] = await db
    .select({
      state: currentPublications.state,
      purpose: listings.purpose,
      commercialState: listings.commercialState,
    })
    .from(currentPublications)
    .innerJoin(listings, eq(listings.id, currentPublications.listingId))
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
      purpose: pointer.purpose,
      exclude: parsed.reference,
      now,
    }),
  };
}
