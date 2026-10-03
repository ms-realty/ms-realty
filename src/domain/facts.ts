// Facts with explicit states and provenance, money, area and location (architecture §4.2).
import type { CurrencyCode } from "./ids";
import { isCurrencyCode } from "./ids";

/**
 * A material fact is a tagged value: known, or one of the absent states. `false` is a known
 * value; none of these states is ever collapsed into null, zero or false.
 */
export const factStates = [
  "known",
  "unknown",
  "not_supplied",
  "not_applicable",
  "withheld",
  "conflicting",
] as const;
export type FactState = (typeof factStates)[number];

export const sourceClasses = [
  "source_supplied",
  "owner_confirmed",
  "agency_observed",
  "document_reviewed",
  "professionally_reviewed",
  "system_calculated",
  "legacy_import",
] as const;
export type SourceClass = (typeof sourceClasses)[number];

export interface Provenance {
  readonly sourceClass: SourceClass;
  /** Source document or reference (URL, document id, page/span). */
  readonly sourceReference?: string;
  /** Language of the source evidence, which keeps its original language. */
  readonly sourceLanguage?: string;
  /** ISO 8601 instant when the value was observed at its source. */
  readonly observedAt?: string;
  /** What the review covered, by whom and when; absent means not reviewed. */
  readonly reviewScope?: string;
  readonly reviewedBy?: string;
  readonly reviewedAt?: string;
}

export type KnownFact<T> = {
  readonly state: "known";
  readonly value: T;
  /** Unit or basis for scalar values; value objects (Money, Area) carry their own. */
  readonly unit?: string;
  readonly provenance: Provenance;
};
/** Two or more sources disagree; the candidates are evidence, none of them is the value. */
export type ConflictingFact<T> = {
  readonly state: "conflicting";
  readonly candidates: readonly T[];
  readonly provenance?: Provenance;
  readonly note?: string;
};
export type AbsentFact = {
  readonly state: Exclude<FactState, "known" | "conflicting">;
  readonly provenance?: Provenance;
  readonly note?: string;
};
export type Fact<T> = KnownFact<T> | ConflictingFact<T> | AbsentFact;

export function known<T>(value: T, provenance: Provenance, unit?: string): KnownFact<T> {
  return unit === undefined
    ? { state: "known", value, provenance }
    : { state: "known", value, unit, provenance };
}

export function absent(state: AbsentFact["state"], provenance?: Provenance): AbsentFact {
  return provenance ? { state, provenance } : { state };
}

export function isKnown<T>(fact: Fact<T>): fact is KnownFact<T> {
  return fact.state === "known";
}

// Listing purpose and price period. Short stays are not a listing purpose (architecture §3.2).

export const listingPurposes = ["sale", "long_term_rent"] as const;
export type ListingPurpose = (typeof listingPurposes)[number];

export const pricePeriods = ["total", "month"] as const;
export type PricePeriod = (typeof pricePeriods)[number];

export const priceBases = ["asking", "negotiable", "fixed", "indicative"] as const;
export type PriceBasis = (typeof priceBases)[number];

/** The only price period each purpose carries; a price is never reinterpreted from its size. */
export const pricePeriodByPurpose: Record<ListingPurpose, PricePeriod> = {
  sale: "total",
  long_term_rent: "month",
};

// Money: integer minor units, ISO currency, period and named inclusions (architecture §4.2).

export interface Money {
  /** Integer amount in the currency's minor unit (cents). */
  readonly amountMinor: number;
  readonly currency: CurrencyCode;
  readonly period: PricePeriod;
  readonly basis: PriceBasis;
  /** Named inclusions or charges; an empty list states nothing, it does not mean "none". */
  readonly inclusions?: readonly string[];
}

export function money(
  amountMinor: number,
  currency: string,
  period: PricePeriod,
  basis: PriceBasis = "asking",
): Money {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) {
    throw new Error(`Money amount must be a non-negative integer of minor units: ${amountMinor}`);
  }
  if (!isCurrencyCode(currency)) throw new Error(`Unsupported currency: ${currency}`);
  return { amountMinor, currency, period, basis };
}

/** New BG/GR prices are presented in euro; historical amounts keep their own currency. */
export const defaultPresentationCurrency = "EUR" satisfies CurrencyCode;

/** Council fixed conversion rate: 1 EUR = 1.95583 BGN (Bulgaria adopted the euro 2026-01-01). */
export const bgnPerEur = { numerator: 195_583n, denominator: 100_000n } as const;

export interface PresentedMoney {
  readonly amountMinor: number;
  readonly currency: CurrencyCode;
  /** The recorded amount this presentation derives from; never overwritten by it. */
  readonly original: { readonly amountMinor: number; readonly currency: CurrencyCode };
}

/**
 * Presents a recorded amount in euro without rewriting it: BGN converts at the fixed rate
 * (half-up to the cent), EUR passes through, any other currency is not converted.
 */
export function presentInEuro(amount: Pick<Money, "amountMinor" | "currency">): PresentedMoney {
  const original = { amountMinor: amount.amountMinor, currency: amount.currency };
  if (amount.currency !== "BGN") return { ...original, original };
  const { numerator, denominator } = bgnPerEur;
  const scaled = BigInt(amount.amountMinor) * denominator * 2n;
  const eurMinor = (scaled / numerator + 1n) / 2n;
  return { amountMinor: Number(eurMinor), currency: "EUR", original };
}

// Area. Bases are never compared or substituted for each other.

export const areaBases = ["living", "usable", "built", "gross_floor", "total", "land"] as const;
export type AreaBasis = (typeof areaBases)[number];

export interface Area {
  readonly value: number;
  readonly unit: "m2";
  readonly basis: AreaBasis;
}

export function area(value: number, basis: AreaBasis): Area {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`Area must be positive: ${value}`);
  return { value, unit: "m2", basis };
}

// Location. Exact points are private; public precision is a separate approved choice.

export const locationPrecisions = [
  "exact",
  "street",
  "neighborhood",
  "settlement",
  "region",
] as const;
export type LocationPrecision = (typeof locationPrecisions)[number];

export interface Location {
  /** ISO 3166-1 alpha-2. */
  readonly country: string;
  readonly region: string;
  readonly settlement: string;
  readonly neighborhood?: string;
  readonly precision: LocationPrecision;
}

/** Rooms and bedrooms are separate facts; one never implies the other. */
export interface RoomFacts {
  readonly rooms: Fact<number>;
  readonly bedrooms: Fact<number>;
}

export const propertyTypes = [
  "apartment",
  "house",
  "plot",
  "commercial",
  "hotel",
  "development",
  "other",
] as const;
export type PropertyType = (typeof propertyTypes)[number];
