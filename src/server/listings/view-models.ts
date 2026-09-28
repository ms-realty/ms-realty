// Public listing and search view models (architecture §10, §12; P02, P05, P06). Everything here
// is the authorized public projection of one active publication manifest: no owner identity, no
// exact address or point beyond the approved precision, no internal notes, no staff ids.
import "server-only";
import type {
  Area,
  Fact,
  FactState,
  ListingPurpose,
  LocationPrecision,
  Money,
  PropertyType,
} from "@/domain/facts";
import type { PublicLocale } from "@/domain/ids";
import type { CommercialState, FreshnessState } from "@/domain/listing";
import type { MediaKind } from "@/domain/media";
import type { PublicMapPoint } from "@/domain/public-map";
import type { PrimaryAction } from "@/domain/publication";
import type { SearchCriteria } from "@/domain/search/filters";

export type { SearchCriteria };

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
  readonly mapPoint?: PublicMapPoint | null;
  /** ISO 3166-1 alpha-2. */
  readonly country: string;
  readonly district: PlaceName | null;
  readonly municipality: PlaceName | null;
  /** Null when the approved precision stops above the settlement. */
  readonly settlement: PlaceName | null;
  /** Only when the approved precision reaches the neighborhood. */
  readonly neighborhood: string | null;
  readonly precision: LocationPrecision;
}

/**
 * An approved gallery item of the manifest whose asset is still eligible now. Bytes are served
 * only through the application's public media route, which re-checks eligibility (§7.5); the
 * digest addresses the approved derivative.
 */
export interface PublicMedia {
  readonly relationId: string;
  readonly assetId: string;
  readonly digest: string;
  readonly kind: MediaKind;
  readonly contentType: string;
  /** Null when never recorded; unknown is not zero. */
  readonly width: number | null;
  readonly height: number | null;
  readonly alt: string | null;
  readonly caption: string | null;
  /** Shown next to modified media (renders, virtual staging, redrawn plans). */
  readonly modificationDisclosure: string | null;
  readonly position: number;
}

export interface PublicAvailability {
  /** What the visitor is told: an expired confirmation reads as confirmation_required. */
  readonly presented: CommercialState;
  readonly freshness: FreshnessState;
  /** ISO 8601 instant of the last human confirmation; null when never confirmed. */
  readonly confirmedAt: string | null;
  readonly primaryAction: PrimaryAction;
}

export interface ListingCard {
  readonly reference: string;
  /** Stable URL segment derived from the reference (titles may change, references do not). */
  readonly slug: string;
  /** The active manifest this card shows, for comparing with later responses. */
  readonly manifestId: string;
  readonly locale: PublicLocale;
  readonly purpose: ListingPurpose;
  readonly propertyType: PropertyType;
  readonly title: string | null;
  /** Money carries amount (minor units), currency, period and basis. */
  readonly price: Fact<Money>;
  readonly place: PublicPlace;
  readonly bedrooms: Fact<number>;
  /** The first known area by basis (living, built, total, land); its value names the basis. */
  readonly area: Fact<Area>;
  readonly availability: PublicAvailability;
  readonly cover: PublicMedia | null;
}

export interface ToConfirmItem {
  readonly key: string;
  readonly group: FactGroup;
  readonly state: Exclude<FactState, "known">;
}

export interface PublicListingDetail extends ListingCard {
  readonly description: string | null;
  /** Every public fact of the manifest with its state and provenance, grouped for display. */
  readonly facts: readonly PublicFact[];
  readonly media: readonly PublicMedia[];
  /** Decision-relevant facts that are not known: the "What to confirm" list. */
  readonly toConfirm: readonly ToConfirmItem[];
  /** A truthful team identity; no personally assigned agent is invented. */
  readonly responsibleTeam: { readonly label: string };
  readonly indexable: boolean;
  /** ISO 8601 instant the manifest was activated. */
  readonly publishedAt: string;
}

export type PublicListingResult =
  | {
      readonly status: "listing";
      readonly listing: PublicListingDetail;
      /** Offered listings of the same purpose when this one cannot be pursued. */
      readonly alternatives: readonly ListingCard[];
    }
  | {
      /** Restricted or withdrawn here: only the reference and purpose stay public. */
      readonly status: "unavailable";
      readonly reference: string;
      readonly purpose: ListingPurpose;
      readonly alternatives: readonly ListingCard[];
    }
  | { readonly status: "not_found" };

export interface PlaceCount extends PlaceName {
  readonly countryCode: string;
  /** The enclosing municipality or district, for telling same-named places apart. */
  readonly parentName: string | null;
  readonly count: number;
}
