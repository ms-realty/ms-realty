// F02 filter semantics as pure predicates over the listing search view-model (AD10).
// OR within a category, AND across categories. Unknown values never satisfy a constraint:
// they make a listing "needs confirmation", shown only when the visitor opts in (A05).
import type {
  Area,
  AreaBasis,
  Fact,
  ListingPurpose,
  Money,
  PricePeriod,
  PropertyType,
} from "../facts";
import type { CurrencyCode } from "../ids";
import type { CommercialState } from "../listing";

export interface ListingSearchView {
  readonly listingId: string;
  readonly reference: string;
  readonly purpose: ListingPurpose;
  readonly propertyType: PropertyType;
  /** The listing's place and every ancestor (settlement, municipality, district, country). */
  readonly placeIds: readonly string[];
  readonly commercial: CommercialState;
  readonly price: Fact<Money>;
  readonly bedrooms: Fact<number>;
  readonly rooms: Fact<number>;
  readonly areas: Partial<Record<AreaBasis, Fact<Area>>>;
  readonly features: Readonly<Record<string, Fact<boolean>>>;
}

export interface Range {
  readonly min?: number;
  readonly max?: number;
}

export interface SearchCriteria {
  readonly purpose: ListingPurpose;
  readonly propertyTypes?: readonly PropertyType[];
  readonly placeIds?: readonly string[];
  readonly availability?: readonly CommercialState[];
  /** Minor units in the given currency, for the purpose's search price period. */
  readonly price?: Range & { readonly currency: CurrencyCode };
  readonly bedrooms?: Range;
  readonly rooms?: Range;
  readonly area?: Range & { readonly basis: AreaBasis };
  /** Feature keys that must be known to be true. */
  readonly mustHave?: readonly string[];
  readonly includeNeedsConfirmation?: boolean;
}

/** The price period a budget refers to for each purpose. */
export const searchPricePeriod: Record<ListingPurpose, PricePeriod> = {
  sale: "total",
  long_term_rent: "month",
  short_stay: "night",
};

export type FilterResult = "match" | "needs_confirmation" | "no_match";

export interface FilterEvaluation {
  readonly result: FilterResult;
  /** Criteria the listing could not be shown to satisfy because a value is not known. */
  readonly unconfirmed: readonly string[];
}

type Check = FilterResult;

function anyOf<T>(selected: readonly T[] | undefined, value: T): Check {
  return !selected || selected.length === 0 || selected.includes(value) ? "match" : "no_match";
}

function inRange(value: number, range: Range): boolean {
  return (
    (range.min === undefined || value >= range.min) &&
    (range.max === undefined || value <= range.max)
  );
}

function factInRange(fact: Fact<number>, range: Range): Check {
  if (fact.state === "known") return inRange(fact.value, range) ? "match" : "no_match";
  // "Not applicable" is a known absence (a plot has no bedrooms), never a match.
  return fact.state === "not_applicable" ? "no_match" : "needs_confirmation";
}

function priceCheck(
  price: Fact<Money>,
  criteria: NonNullable<SearchCriteria["price"]>,
  purpose: ListingPurpose,
): Check {
  // A missing price is never zero.
  if (price.state !== "known")
    return price.state === "not_applicable" ? "no_match" : "needs_confirmation";
  // No silent reinterpretation of another period or currency.
  if (price.value.period !== searchPricePeriod[purpose]) return "needs_confirmation";
  if (price.value.currency !== criteria.currency) return "needs_confirmation";
  return inRange(price.value.amountMinor, criteria) ? "match" : "no_match";
}

function areaCheck(view: ListingSearchView, criteria: NonNullable<SearchCriteria["area"]>): Check {
  // Compared only on the requested basis; another basis is never substituted.
  const fact = view.areas[criteria.basis];
  if (!fact) return "needs_confirmation";
  if (fact.state !== "known")
    return fact.state === "not_applicable" ? "no_match" : "needs_confirmation";
  return inRange(fact.value.value, criteria) ? "match" : "no_match";
}

function featureCheck(fact: Fact<boolean> | undefined): Check {
  if (!fact) return "needs_confirmation";
  if (fact.state === "known") return fact.value ? "match" : "no_match";
  return fact.state === "not_applicable" ? "no_match" : "needs_confirmation";
}

export function evaluateListing(
  view: ListingSearchView,
  criteria: SearchCriteria,
): FilterEvaluation {
  const checks: [string, Check][] = [
    ["purpose", view.purpose === criteria.purpose ? "match" : "no_match"],
    ["propertyType", anyOf(criteria.propertyTypes, view.propertyType)],
    [
      "place",
      !criteria.placeIds?.length || criteria.placeIds.some((id) => view.placeIds.includes(id))
        ? "match"
        : "no_match",
    ],
    ["availability", anyOf(criteria.availability, view.commercial)],
  ];
  if (criteria.price)
    checks.push(["price", priceCheck(view.price, criteria.price, criteria.purpose)]);
  if (criteria.bedrooms) checks.push(["bedrooms", factInRange(view.bedrooms, criteria.bedrooms)]);
  if (criteria.rooms) checks.push(["rooms", factInRange(view.rooms, criteria.rooms)]);
  if (criteria.area) checks.push([`area.${criteria.area.basis}`, areaCheck(view, criteria.area)]);
  for (const key of criteria.mustHave ?? []) {
    checks.push([`feature.${key}`, featureCheck(view.features[key])]);
  }

  if (checks.some(([, check]) => check === "no_match"))
    return { result: "no_match", unconfirmed: [] };
  const unconfirmed = checks
    .filter(([, check]) => check === "needs_confirmation")
    .map(([name]) => name);
  return { result: unconfirmed.length > 0 ? "needs_confirmation" : "match", unconfirmed };
}

export function matchesSearch(view: ListingSearchView, criteria: SearchCriteria): boolean {
  const { result } = evaluateListing(view, criteria);
  return (
    result === "match" ||
    (result === "needs_confirmation" && criteria.includeNeedsConfirmation === true)
  );
}
