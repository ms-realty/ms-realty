// Public search over listings live on the website (spec F02, P02, P03, P22, A03-A07, AD10).
// Filters are the domain's own predicates (src/domain/search/filters.ts) applied to the
// typed projection, so the SQL and the rules cannot drift: OR within a category, AND across,
// unknown never satisfies a constraint and needs-confirmation results only on opt-in.
import "server-only";
import { and, arrayOverlaps, eq } from "drizzle-orm";
import { listingSearchDocuments, listings } from "@/db/schema";
import { canonicalJson } from "@/domain/approval";
import {
  type Area,
  type AreaBasis,
  type Fact,
  type FactState,
  factStates,
  type ListingPurpose,
  type Money,
  type PropertyType,
  type Provenance,
  propertyTypes,
} from "@/domain/facts";
import type { CurrencyCode, PublicLocale } from "@/domain/ids";
import {
  evaluateListing,
  type ListingSearchView,
  matchesSearch,
  type SearchCriteria,
  searchPricePeriod,
} from "@/domain/search/filters";
import { sha256Hex } from "../crypto";
import type { Executor } from "../db";
import {
  isLive,
  loadCards,
  loadPlaceChains,
  offeredStates,
  type PlaceNode,
  placeName,
} from "../listings/published";
import type {
  PlaceCount,
  SearchResponse,
  SearchResultItem,
  SearchSort,
} from "../listings/view-models";

export interface SearchOptions {
  readonly locale: PublicLocale;
  readonly sort?: SearchSort;
  /** 1-based. */
  readonly page?: number;
  readonly pageSize?: number;
}

export const defaultPageSize = 24;
export const maxPageSize = 48;

type DocumentRow = typeof listingSearchDocuments.$inferSelect;

interface LiveDocument {
  readonly doc: DocumentRow;
  readonly createdAt: Date;
  readonly availabilityCheckedAt: Date | null;
}

// ponytail: every live document of the purpose is evaluated in memory with the domain
// predicates. Exact and simple for the agency's inventory (hundreds); move the predicates
// into SQL over the projection's typed columns if live listings pass ~10k.
async function loadLiveDocuments(
  db: Executor,
  filter: { purpose?: ListingPurpose; placeIds?: readonly string[] } = {},
): Promise<LiveDocument[]> {
  return db
    .select({
      doc: listingSearchDocuments,
      createdAt: listings.createdAt,
      availabilityCheckedAt: listings.availabilityCheckedAt,
    })
    .from(listingSearchDocuments)
    .innerJoin(listings, eq(listings.id, listingSearchDocuments.listingId))
    .where(
      and(
        isLive(),
        filter.purpose ? eq(listingSearchDocuments.purpose, filter.purpose) : undefined,
        filter.placeIds?.length
          ? arrayOverlaps(listingSearchDocuments.placeIds, [...filter.placeIds])
          : undefined,
      ),
    );
}

// The projection keeps states and values only; provenance is irrelevant to filtering.
const projected: Provenance = { sourceClass: "system_calculated" };

function numberFact(state: FactState, value: number | null): Fact<number> {
  return state === "known" && value !== null
    ? { state, value, provenance: projected }
    : { state: state === "known" ? "unknown" : state };
}

function areaFact(state: FactState, value: string | null, basis: AreaBasis): Fact<Area> {
  return state === "known" && value !== null
    ? { state, value: { value: Number(value), unit: "m2", basis }, provenance: projected }
    : { state: state === "known" ? "unknown" : state };
}

function priceFact(doc: DocumentRow): Fact<Money> {
  if (
    doc.priceState === "known" &&
    doc.priceAmountMinor !== null &&
    doc.priceCurrency &&
    doc.pricePeriod &&
    doc.priceBasis
  ) {
    return {
      state: "known",
      value: {
        amountMinor: doc.priceAmountMinor,
        currency: doc.priceCurrency,
        period: doc.pricePeriod,
        basis: doc.priceBasis,
      },
      provenance: projected,
    };
  }
  return { state: doc.priceState === "known" ? "unknown" : doc.priceState };
}

function featureFacts(features: unknown): Record<string, Fact<boolean>> {
  const result: Record<string, Fact<boolean>> = {};
  for (const [key, state] of Object.entries((features ?? {}) as Record<string, string>)) {
    if (state === "true" || state === "false") {
      result[key] = { state: "known", value: state === "true", provenance: projected };
    } else if ((factStates as readonly string[]).includes(state) && state !== "known") {
      result[key] = { state: state as Exclude<FactState, "known"> };
    }
  }
  return result;
}

export function toSearchView(doc: DocumentRow): ListingSearchView {
  return {
    listingId: doc.listingId,
    reference: doc.reference,
    purpose: doc.purpose,
    propertyType: doc.propertyType,
    placeIds: doc.placeIds,
    commercial: doc.commercialState,
    price: priceFact(doc),
    bedrooms: numberFact(doc.bedroomsState, doc.bedrooms),
    rooms: numberFact(doc.roomsState, doc.rooms),
    areas: {
      living: areaFact(doc.livingAreaState, doc.livingArea, "living"),
      built: areaFact(doc.builtAreaState, doc.builtArea, "built"),
      total: areaFact(doc.totalAreaState, doc.totalArea, "total"),
      land: areaFact(doc.landAreaState, doc.landArea, "land"),
    },
    features: featureFacts(doc.features),
  };
}

function sortedUnique<T extends string>(values: readonly T[] | undefined): T[] | undefined {
  return values?.length ? [...new Set(values)].sort() : undefined;
}

/** The criteria as applied: arrays de-duplicated, empty ones dropped, availability defaulted. */
export function normalizeCriteria(criteria: SearchCriteria): SearchCriteria {
  const propertyTypes = sortedUnique(criteria.propertyTypes);
  const placeIds = sortedUnique(criteria.placeIds);
  const mustHave = sortedUnique(criteria.mustHave);
  return {
    purpose: criteria.purpose,
    ...(propertyTypes ? { propertyTypes } : {}),
    ...(placeIds ? { placeIds } : {}),
    // Sold, let and withdrawn listings are history, not offers: shown only when asked for.
    availability: sortedUnique(criteria.availability) ?? [...offeredStates].sort(),
    ...(criteria.price ? { price: criteria.price } : {}),
    ...(criteria.bedrooms ? { bedrooms: criteria.bedrooms } : {}),
    ...(criteria.rooms ? { rooms: criteria.rooms } : {}),
    ...(criteria.area ? { area: criteria.area } : {}),
    ...(mustHave ? { mustHave } : {}),
    includeNeedsConfirmation: criteria.includeNeedsConfirmation === true,
  };
}

/** A price comparable with the search's period and currency; anything else sorts last. */
function sortablePrice(view: ListingSearchView, currency: CurrencyCode): number | null {
  const price = view.price;
  if (price.state !== "known") return null;
  if (price.value.period !== searchPricePeriod[view.purpose]) return null;
  return price.value.currency === currency ? price.value.amountMinor : null;
}

const bedroomFacetMinimums = [1, 2, 3, 4, 5] as const;

export async function searchListings(
  db: Executor,
  criteria: SearchCriteria,
  options: SearchOptions,
): Promise<SearchResponse> {
  const applied = normalizeCriteria(criteria);
  const sort = options.sort ?? "newest";
  const pageSize = Math.min(
    maxPageSize,
    Math.max(1, Math.trunc(options.pageSize ?? defaultPageSize)),
  );
  const page = Math.max(1, Math.trunc(options.page ?? 1));

  const documents = await loadLiveDocuments(db, {
    purpose: applied.purpose,
    ...(applied.placeIds ? { placeIds: applied.placeIds } : {}),
  });
  const views = documents.map((d) => ({ ...d, view: toSearchView(d.doc) }));
  const matched = views.flatMap((entry) => {
    const evaluation = evaluateListing(entry.view, applied);
    const included =
      evaluation.result === "match" ||
      (evaluation.result === "needs_confirmation" && applied.includeNeedsConfirmation);
    return included ? [{ ...entry, evaluation }] : [];
  });

  const currency: CurrencyCode = applied.price?.currency ?? "EUR";
  const byNewest = (a: (typeof matched)[number], b: (typeof matched)[number]) =>
    b.createdAt.getTime() - a.createdAt.getTime() || b.doc.reference.localeCompare(a.doc.reference);
  matched.sort((a, b) => {
    if (sort === "newest") return byNewest(a, b);
    const pa = sortablePrice(a.view, currency);
    const pb = sortablePrice(b.view, currency);
    if (pa === null && pb === null) return byNewest(a, b);
    if (pa === null) return 1;
    if (pb === null) return -1;
    return (sort === "price_asc" ? pa - pb : pb - pa) || byNewest(a, b);
  });

  const count = (variant: SearchCriteria) =>
    views.filter((entry) => matchesSearch(entry.view, variant)).length;
  const withoutTypes = { ...applied, propertyTypes: undefined };

  const pageEntries = matched.slice((page - 1) * pageSize, page * pageSize);
  const cards = await loadCards(
    db,
    pageEntries.map((e) => e.doc.listingId),
    options.locale,
  );
  const cardByReference = new Map(cards.map((card) => [card.reference, card]));
  const items: SearchResultItem[] = pageEntries.flatMap((entry) => {
    const card = cardByReference.get(entry.doc.reference);
    if (!card) return [];
    return [
      {
        ...card,
        match: entry.evaluation.result === "match" ? "match" : "needs_confirmation",
        unconfirmed: entry.evaluation.unconfirmed,
      },
    ];
  });

  const latestCheck = matched.reduce<Date | null>(
    (latest, e) =>
      e.availabilityCheckedAt && (!latest || e.availabilityCheckedAt > latest)
        ? e.availabilityCheckedAt
        : latest,
    null,
  );
  return {
    queryId: sha256Hex(
      canonicalJson({ criteria: applied, sort, page, pageSize, locale: options.locale }),
    ).slice(0, 16),
    criteria: applied,
    sort,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(matched.length / pageSize)),
    total: matched.length,
    countType: "exact",
    items,
    facets: {
      propertyType: propertyTypes.map((value: PropertyType) => ({
        value,
        count: count({ ...withoutTypes, propertyTypes: [value] }),
      })),
      bedrooms: bedroomFacetMinimums.map((min) => ({
        min,
        count: count({ ...applied, bedrooms: { min } }),
      })),
    },
    freshness: { latestAvailabilityCheckAt: latestCheck?.toISOString() ?? null },
  };
}

/** Places a search can be narrowed to: settlements and municipalities with offered listings. */
export async function listPlacesForSearch(
  db: Executor,
  locale: PublicLocale,
  options: { readonly purpose?: ListingPurpose } = {},
): Promise<PlaceCount[]> {
  const documents = await loadLiveDocuments(
    db,
    options.purpose ? { purpose: options.purpose } : {},
  );
  const counts = new Map<string, number>();
  for (const { doc } of documents) {
    if (!offeredStates.includes(doc.commercialState)) continue;
    for (const id of doc.placeIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const chains = await loadPlaceChains(db, [...counts.keys()]);
  const places: PlaceCount[] = [];
  for (const [id, count] of counts) {
    const [node, parent] = chains.get(id) ?? [];
    if (!node || (node.level !== "settlement" && node.level !== "municipality")) continue;
    places.push({
      ...placeName(node, locale),
      countryCode: node.countryCode,
      parentName: parent ? placeName(parent as PlaceNode, locale).name : null,
      count,
    });
  }
  return places.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, locale));
}

/** Live listings (all, and offered) for counts and the newest offered ones, for the home page. */
export async function liveListingSummary(db: Executor): Promise<{
  total: number;
  offeredNewestFirst: string[];
}> {
  const documents = await loadLiveDocuments(db);
  const offered = documents
    .filter((d) => offeredStates.includes(d.doc.commercialState))
    .sort(
      (a, b) =>
        b.createdAt.getTime() - a.createdAt.getTime() ||
        b.doc.reference.localeCompare(a.doc.reference),
    );
  return { total: documents.length, offeredNewestFirst: offered.map((d) => d.doc.listingId) };
}

/** Offered live listings in one place with one purpose, newest first (F09 alternatives). */
export async function offeredListingIdsIn(
  db: Executor,
  purpose: ListingPurpose,
  placeId: string,
  exclude: readonly string[],
  limit: number,
): Promise<string[]> {
  const documents = await loadLiveDocuments(db, { purpose, placeIds: [placeId] });
  return documents
    .filter(
      (d) => offeredStates.includes(d.doc.commercialState) && !exclude.includes(d.doc.listingId),
    )
    .sort(
      (a, b) =>
        b.createdAt.getTime() - a.createdAt.getTime() ||
        b.doc.reference.localeCompare(a.doc.reference),
    )
    .slice(0, limit)
    .map((d) => d.doc.listingId);
}
