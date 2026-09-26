// Public listing view models (spec §19.2 "Listing summary/detail", "Fact", "Search response";
// P01, P02, P05, P06, P21). Everything here is public approved data: no owner identity, no
// exact address beyond the approved precision, no internal notes, no staff ids.
import "server-only";
import type {
  Area,
  Fact,
  FactState,
  ListingPurpose,
  LocationPrecision,
  Money,
  PropertyType,
  SourceClass,
} from "@/domain/facts";
import type { PublicLocale } from "@/domain/ids";
import type { CommercialState, PrimaryAction, PublicAvailability } from "@/domain/listing";
import type { SearchCriteria } from "@/domain/search/filters";
import type { PublicMedia } from "../media/public-media";

export type { PublicMedia, SearchCriteria, SourceClass };

/**
 * imported: carried over from the legacy site · owner_supplied: stated or confirmed by the
 * owner · broker_verified: observed or reviewed by the agency · calculated: derived by the
 * system. `reviewed` says whether a person recorded a review of the value.
 */
export type FactVerification = "imported" | "owner_supplied" | "broker_verified" | "calculated";

export type FactGroup =
  | "price"
  | "space"
  | "building"
  | "condition"
  | "access"
  | "facilities"
  | "planning";

export interface PublicFact<T = unknown> {
  /** Field key: price, bedrooms, rooms, area.built, feature.parking_kind, ... */
  readonly key: string;
  readonly group: FactGroup;
  /** Provenance carries source class, review and observation instants; never staff ids. */
  readonly fact: Fact<T>;
  readonly verification: FactVerification;
  readonly reviewed: boolean;
}

export interface PlaceName {
  readonly id: string;
  readonly level: "country" | "district" | "municipality" | "settlement" | "neighborhood";
  readonly slug: string;
  /** In the requested locale's script where one is recorded, else the Latin name. */
  readonly name: string;
  readonly nameNative: string;
  readonly nameLatin: string;
}

export interface PublicPlace {
  /** ISO 3166-1 alpha-2. */
  readonly country: string;
  readonly district: PlaceName | null;
  readonly municipality: PlaceName | null;
  readonly settlement: PlaceName | null;
  /** Only when the approved precision reaches the neighborhood. */
  readonly neighborhood: string | null;
  readonly precision: LocationPrecision;
}

export interface ListingCard {
  readonly reference: string;
  /** Stable URL segment derived from the reference (titles may change, references do not). */
  readonly slug: string;
  /** The published listing version this card shows. */
  readonly version: number;
  readonly purpose: ListingPurpose;
  readonly propertyType: PropertyType;
  readonly title: string | null;
  /** The locale `title` is in: the requested one only when its translation is approved. */
  readonly titleLocale: PublicLocale;
  /** Money carries amount (minor units), currency, period and basis. */
  readonly price: Fact<Money>;
  readonly locality: {
    readonly settlement: string | null;
    readonly municipality: string | null;
    /** How exactly the place may be shown; an approximate location must look approximate. */
    readonly precision: LocationPrecision;
  };
  readonly bedrooms: Fact<number>;
  /** The first known area by basis (living, built, total, land); its value names the basis. */
  readonly area: Fact<Area>;
  readonly availability: PublicAvailability;
  readonly commercialState: CommercialState;
  /** ISO 8601 instant of the last availability check; null when never checked. */
  readonly availabilityCheckedAt: string | null;
  readonly coverImage: PublicMedia | null;
  /** ISO 8601 instant of the last recorded change to the listing. */
  readonly updatedAt: string;
}

export interface ToConfirmItem {
  readonly key: string;
  readonly group: FactGroup;
  readonly state: Exclude<FactState, "known">;
}

export interface PublicListingDetail {
  readonly reference: string;
  readonly slug: string;
  readonly version: number;
  readonly purpose: ListingPurpose;
  readonly propertyType: PropertyType;
  readonly title: string | null;
  readonly titleLocale: PublicLocale;
  readonly price: Fact<Money>;
  readonly commercial: {
    readonly state: CommercialState;
    readonly availability: PublicAvailability;
    readonly primaryAction: PrimaryAction;
    /** The stated basis of a reservation, when reserved. */
    readonly reservationBasis: string | null;
    /** ISO 8601 instant of the last availability check; null when never checked. */
    readonly availabilityCheckedAt: string | null;
  };
  /** Every public fact with its state and provenance, grouped for display. */
  readonly facts: readonly PublicFact[];
  readonly description: {
    readonly source: {
      readonly locale: PublicLocale;
      readonly title: string | null;
      readonly text: string | null;
    };
    /** The requested locale's text, present only when a human approved it for this version. */
    readonly translation: {
      readonly locale: PublicLocale;
      readonly title: string | null;
      readonly text: string | null;
    } | null;
    readonly translationApproved: boolean;
  };
  readonly media: readonly PublicMedia[];
  readonly place: PublicPlace;
  /** A truthful team identity; no personally assigned agent is invented (F03). */
  readonly responsibleTeam: { readonly label: string };
  /** Decision-relevant facts that are not known: the "What to confirm" list. */
  readonly toConfirm: readonly ToConfirmItem[];
  /** Served in the requested locale (source locale or approved translation). */
  readonly servedInLocale: boolean;
  readonly indexable: boolean;
  readonly updatedAt: string;
}

export type UnavailableReason = "sold" | "let" | "withdrawn" | "removed";

export interface UnavailableListing {
  readonly reference: string;
  readonly slug: string;
  readonly reason: UnavailableReason;
  readonly purpose: ListingPurpose;
  /** Null for a removed listing: only its reference and place remain public. */
  readonly title: string | null;
  readonly titleLocale: PublicLocale;
  readonly place: PublicPlace;
  readonly updatedAt: string;
  /** Up to three published, offered listings with the same purpose in the same place (F09). */
  readonly alternatives: readonly ListingCard[];
  /** The criteria the alternatives match, shown so the visitor can change them. */
  readonly alternativesCriteria: {
    readonly purpose: ListingPurpose;
    readonly place: PlaceName | null;
  };
}

export type PublicListingResult =
  | { readonly status: "available"; readonly listing: PublicListingDetail }
  | { readonly status: "unavailable"; readonly listing: UnavailableListing }
  | { readonly status: "not_found" };

export interface PlaceCount extends PlaceName {
  readonly countryCode: string;
  /** The enclosing municipality or district, for telling same-named places apart. */
  readonly parentName: string | null;
  readonly count: number;
}

export type SearchSort = "newest" | "price_asc" | "price_desc";

export interface SearchResultItem extends ListingCard {
  /** needs_confirmation only when the visitor opted in (A05). */
  readonly match: "match" | "needs_confirmation";
  /** Criteria this listing could not be shown to satisfy because a value is unknown. */
  readonly unconfirmed: readonly string[];
}

export interface SearchResponse {
  /** Identity of this exact query (criteria, sort, page, locale), for ignoring stale replies. */
  readonly queryId: string;
  /** The criteria as applied, defaults included (availability defaults to offered states). */
  readonly criteria: SearchCriteria;
  readonly sort: SearchSort;
  readonly page: number;
  readonly pageSize: number;
  readonly totalPages: number;
  readonly total: number;
  readonly countType: "exact";
  readonly items: readonly SearchResultItem[];
  /** Each count is what selecting that value alone would return with the other criteria. */
  readonly facets: {
    readonly propertyType: readonly { readonly value: PropertyType; readonly count: number }[];
    readonly bedrooms: readonly { readonly min: number; readonly count: number }[];
  };
  /** Latest availability check across every result, not just this page. */
  readonly freshness: { readonly latestAvailabilityCheckAt: string | null };
}

export interface HomeOverview {
  /** Every listing currently live on the website, whatever its availability. */
  readonly totalPublished: number;
  /** Live listings on offer (available, unconfirmed, negotiating or reserved). */
  readonly totalOffered: number;
  readonly latest: readonly ListingCard[];
  readonly topPlaces: readonly PlaceCount[];
}
