// Shared F02 filter-semantics cases. The pure predicates and the SQL search layer both run
// this table, so the two implementations cannot disagree. Listings are fictional.
import { absent, area, known, money, type Provenance } from "../facts";
import type { FilterResult, ListingSearchView, SearchCriteria } from "./filters";

const source: Provenance = { sourceClass: "agency_observed", observedAt: "2026-09-01T09:00:00Z" };

export const placeIds = {
  bulgaria: "00000000-0000-4000-8000-000000000001",
  sandanski: "00000000-0000-4000-8000-000000000002",
  melnik: "00000000-0000-4000-8000-000000000003",
} as const;

/** A two-bedroom apartment for sale in Sandanski with a known lift and unknown step-free access. */
export const baseListing: ListingSearchView = {
  listingId: "00000000-0000-4000-8000-00000000a001",
  reference: "MS-00100",
  purpose: "sale",
  propertyType: "apartment",
  placeIds: [placeIds.bulgaria, placeIds.sandanski],
  commercial: "available",
  price: known(money(9_500_000, "EUR", "total"), source),
  bedrooms: known(2, source),
  rooms: known(3, source),
  areas: { living: known(area(68, "living"), source), built: known(area(82, "built"), source) },
  features: {
    lift: known(true, source),
    step_free_access: absent("unknown"),
    parking: known(false, source),
  },
};

export interface FilterCase {
  readonly id: string;
  readonly name: string;
  readonly listing: ListingSearchView;
  readonly criteria: SearchCriteria;
  readonly expected: FilterResult;
  /** Whether the listing is returned, given criteria.includeNeedsConfirmation. */
  readonly returned: boolean;
}

const sale: SearchCriteria = { purpose: "sale" };
const rent = (overrides: Partial<ListingSearchView>): ListingSearchView => ({
  ...baseListing,
  purpose: "long_term_rent",
  price: known(money(60_000, "EUR", "month"), source),
  ...overrides,
});

export const filterCases: readonly FilterCase[] = [
  {
    id: "purpose-match",
    name: "purpose must match",
    listing: baseListing,
    criteria: sale,
    expected: "match",
    returned: true,
  },
  {
    id: "purpose-mismatch",
    name: "a sale listing is not a rental result",
    listing: baseListing,
    criteria: { purpose: "long_term_rent" },
    expected: "no_match",
    returned: false,
  },
  {
    id: "type-or",
    name: "OR within a category: apartment or house",
    listing: baseListing,
    criteria: { ...sale, propertyTypes: ["house", "apartment"] },
    expected: "match",
    returned: true,
  },
  {
    id: "and-across",
    name: "AND across categories: right type, wrong place",
    listing: baseListing,
    criteria: { ...sale, propertyTypes: ["apartment"], placeIds: [placeIds.melnik] },
    expected: "no_match",
    returned: false,
  },
  {
    id: "place-ancestor",
    name: "a country selection includes its settlements",
    listing: baseListing,
    criteria: { ...sale, placeIds: [placeIds.melnik, placeIds.bulgaria] },
    expected: "match",
    returned: true,
  },
  {
    id: "price-in-budget",
    name: "known price within budget",
    listing: baseListing,
    criteria: { ...sale, price: { max: 10_000_000, currency: "EUR" } },
    expected: "match",
    returned: true,
  },
  {
    id: "price-over-budget",
    name: "known price over budget",
    listing: baseListing,
    criteria: { ...sale, price: { max: 9_000_000, currency: "EUR" } },
    expected: "no_match",
    returned: false,
  },
  {
    id: "price-missing-not-zero",
    name: "a missing price is never zero, so it does not fall under a budget",
    listing: { ...baseListing, price: absent("unknown") },
    criteria: { ...sale, price: { max: 10_000_000, currency: "EUR" } },
    expected: "needs_confirmation",
    returned: false,
  },
  {
    id: "price-on-request-opt-in",
    name: "price on request appears only when needing-confirmation results are included",
    listing: { ...baseListing, price: absent("withheld") },
    criteria: {
      ...sale,
      price: { max: 10_000_000, currency: "EUR" },
      includeNeedsConfirmation: true,
    },
    expected: "needs_confirmation",
    returned: true,
  },
  {
    id: "price-period-must-match",
    name: "a yearly rent is not compared with a monthly budget",
    listing: rent({ price: known(money(720_000, "EUR", "year"), source) }),
    criteria: { purpose: "long_term_rent", price: { max: 70_000, currency: "EUR" } },
    expected: "needs_confirmation",
    returned: false,
  },
  {
    id: "price-monthly-rent",
    name: "a monthly rent is compared with a monthly budget",
    listing: rent({}),
    criteria: { purpose: "long_term_rent", price: { max: 70_000, currency: "EUR" } },
    expected: "match",
    returned: true,
  },
  {
    id: "price-currency-no-conversion",
    name: "no silent currency conversion",
    listing: { ...baseListing, price: known(money(18_000_000, "BGN", "total"), source) },
    criteria: { ...sale, price: { max: 10_000_000, currency: "EUR" } },
    expected: "needs_confirmation",
    returned: false,
  },
  {
    id: "bedrooms-not-rooms",
    name: "bedrooms filter uses bedrooms, not rooms (3 rooms, 2 bedrooms)",
    listing: baseListing,
    criteria: { ...sale, bedrooms: { min: 3 } },
    expected: "no_match",
    returned: false,
  },
  {
    id: "rooms-filter",
    name: "rooms filter uses rooms",
    listing: baseListing,
    criteria: { ...sale, rooms: { min: 3 } },
    expected: "match",
    returned: true,
  },
  {
    id: "bedrooms-unknown",
    name: "an unknown bedroom count needs confirmation",
    listing: { ...baseListing, bedrooms: absent("not_provided") },
    criteria: { ...sale, bedrooms: { min: 2 } },
    expected: "needs_confirmation",
    returned: false,
  },
  {
    id: "bedrooms-not-applicable",
    name: "a plot's not-applicable bedrooms never satisfy a bedroom filter",
    listing: { ...baseListing, propertyType: "plot", bedrooms: absent("not_applicable") },
    criteria: { ...sale, bedrooms: { min: 1 }, includeNeedsConfirmation: true },
    expected: "no_match",
    returned: false,
  },
  {
    id: "area-requested-basis",
    name: "living area compared on the living basis",
    listing: baseListing,
    criteria: { ...sale, area: { basis: "living", min: 60 } },
    expected: "match",
    returned: true,
  },
  {
    id: "area-no-substitution",
    name: "built area is not substituted for a living-area filter",
    listing: { ...baseListing, areas: { built: known(area(82, "built"), source) } },
    criteria: { ...sale, area: { basis: "living", min: 75 } },
    expected: "needs_confirmation",
    returned: false,
  },
  {
    id: "must-have-known-true",
    name: "a known lift satisfies must-have lift",
    listing: baseListing,
    criteria: { ...sale, mustHave: ["lift"] },
    expected: "match",
    returned: true,
  },
  {
    id: "A05-must-have-unknown",
    name: "A05: unknown step-free access does not satisfy a must-have",
    listing: baseListing,
    criteria: { ...sale, mustHave: ["step_free_access"] },
    expected: "needs_confirmation",
    returned: false,
  },
  {
    id: "A05-must-have-opt-in",
    name: "A05: unknown access is shown only with include-needing-confirmation",
    listing: baseListing,
    criteria: { ...sale, mustHave: ["step_free_access"], includeNeedsConfirmation: true },
    expected: "needs_confirmation",
    returned: true,
  },
  {
    id: "must-have-known-false",
    name: "a known 'no parking' (false) is a known value and excludes",
    listing: baseListing,
    criteria: { ...sale, mustHave: ["parking"], includeNeedsConfirmation: true },
    expected: "no_match",
    returned: false,
  },
  {
    id: "must-have-missing-key",
    name: "a feature never recorded is unknown, not absent",
    listing: baseListing,
    criteria: { ...sale, mustHave: ["garden"] },
    expected: "needs_confirmation",
    returned: false,
  },
  {
    id: "availability-or",
    name: "availability OR: available or under negotiation",
    listing: { ...baseListing, commercial: "under_negotiation" },
    criteria: { ...sale, availability: ["available", "under_negotiation"] },
    expected: "match",
    returned: true,
  },
];
