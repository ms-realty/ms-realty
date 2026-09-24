// Facts with explicit states and provenance (spec §18.1, §19.2).
import type { CurrencyCode } from "./ids";
import { isCurrencyCode } from "./ids";

/** `false` is a known value; these five states are never collapsed into null. */
export const factStates = [
  "known",
  "unknown",
  "not_applicable",
  "not_provided",
  "withheld",
] as const;
export type FactState = (typeof factStates)[number];

export const sourceClasses = [
  "source_supplied",
  "owner_confirmed",
  "agency_observed",
  "document_reviewed",
  "professional_reviewed",
  "system_calculated",
  "legacy_import",
] as const;
export type SourceClass = (typeof sourceClasses)[number];

export interface Provenance {
  readonly sourceClass: SourceClass;
  readonly sourceReference?: string;
  readonly reviewedBy?: string;
  /** ISO 8601 instant. */
  readonly reviewedAt?: string;
  /** ISO 8601 instant when the value was observed at its source. */
  readonly observedAt?: string;
}

export type KnownFact<T> = {
  readonly state: "known";
  readonly value: T;
  /** Unit or basis for scalar values; value objects (Money, Area) carry their own. */
  readonly unit?: string;
  readonly provenance: Provenance;
};
export type AbsentFact = {
  readonly state: Exclude<FactState, "known">;
  readonly provenance?: Provenance;
  readonly note?: string;
};
export type Fact<T> = KnownFact<T> | AbsentFact;

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

// Value objects.

export const listingPurposes = ["sale", "long_term_rent", "short_stay"] as const;
export type ListingPurpose = (typeof listingPurposes)[number];

export const pricePeriods = ["total", "month", "night", "week", "year"] as const;
export type PricePeriod = (typeof pricePeriods)[number];

export const priceBases = ["asking", "negotiable", "fixed", "indicative"] as const;
export type PriceBasis = (typeof priceBases)[number];

/** Price periods a purpose may carry; a price is never reinterpreted from its size. */
export const pricePeriodsByPurpose: Record<ListingPurpose, readonly PricePeriod[]> = {
  sale: ["total"],
  long_term_rent: ["month", "year"],
  short_stay: ["night", "week"],
};

export interface Money {
  /** Integer amount in the currency's minor unit (cents). */
  readonly amountMinor: number;
  readonly currency: CurrencyCode;
  readonly period: PricePeriod;
  readonly basis: PriceBasis;
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

export const areaBases = ["living", "built", "total", "land"] as const;
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
