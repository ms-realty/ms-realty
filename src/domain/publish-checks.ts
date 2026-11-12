// "Checked for you" (ADR 0012): what the system checks before a person publishes a listing by
// one decision. Blockers stop publishing; warnings are shown and left to the person. Pure and
// isomorphic: the staff preview, the bulk view, the Today queue and the publish command share it.
// No model call: every rule is a plain reading of the recorded content.
import type { FactState, PropertyType } from "./facts";
import type { CommercialState } from "./listing";
import { framesInlandAsCoast as framesInland } from "./translation-checks";

export const publishBlockers = [
  "title_missing",
  "description_missing",
  "price_undecided",
  "rent_period_unconfirmed",
  "location_missing",
  "not_available",
  "owner_refused",
  "inland_framed_as_coast",
] as const;
export type PublishBlocker = (typeof publishBlockers)[number];

export const publishWarnings = [
  "no_photos",
  "photos_not_ready",
  "photos_not_copied",
  "short_description",
  "bedrooms_unknown",
  "title_site_suffix",
] as const;
export type PublishWarning = (typeof publishWarnings)[number];

export interface PublishCheckInput {
  readonly propertyType: PropertyType;
  readonly commercialState: CommercialState;
  /** Source-locale title and description that would go public. */
  readonly title: string;
  readonly description: string;
  /** The recorded price state; null when no price is recorded at all. */
  readonly priceState: FactState | null;
  /**
   * A rent amount was recorded without its period (legacy import). A person confirms the period
   * on the publish screen; until then it blocks, never guessed.
   */
  readonly rentAmountWithoutPeriod?: boolean;
  readonly rentPeriodConfirmed?: boolean;
  readonly locationKnown: boolean;
  /** Null when no bedroom count is recorded. */
  readonly bedroomsState: FactState | null;
  /**
   * Photos that can be shown now, placed photos that are not processed yet, and photos from the
   * old website the carry-over has not copied into storage yet (absent: none).
   */
  readonly photos: {
    readonly ready: number;
    readonly notReady: number;
    readonly notCopied?: number;
  };
  /** Place names of the property (settlement, municipality, region), in any script. */
  readonly placeNames: readonly string[];
  /** Every public text that would be shown: the source copy and approved translations. */
  readonly texts: readonly string[];
  /** The title ends with the old site's brand ending (offered without it on the screen). */
  readonly titleSiteSuffix?: boolean;
  /** The latest agreed seller instruction says the owner does not permit publication. */
  readonly ownerRefused?: boolean;
}

export interface PublishChecks {
  readonly blockers: readonly PublishBlocker[];
  readonly warnings: readonly PublishWarning[];
}

/** Commercial states that may be advertised. Sold, let and withdrawn listings may not. */
export const advertisableStates: readonly CommercialState[] = [
  "available",
  "confirmation_required",
  "negotiating",
  "reserved_with_recorded_basis",
];

/** Below this many characters a description rarely tells a buyer enough. */
export const shortDescriptionLength = 200;

const dwellings: readonly PropertyType[] = ["apartment", "house"];

// Sandanski is inland (AGENTS.md): copy must never present it as a sea, beach or coast place.
// The source text is checked with the coast words of Bulgarian, Russian and English, the
// languages an agency's source copy is written in; each translation is checked in its own.
export function framesInlandAsCoast(placeNames: readonly string[], texts: readonly string[]) {
  return framesInland(["bg", "ru", "en"], placeNames, texts);
}

export function publishChecks(input: PublishCheckInput): PublishChecks {
  const blockers: PublishBlocker[] = [];
  const warnings: PublishWarning[] = [];
  if (!input.title.trim()) blockers.push("title_missing");
  if (!input.description.trim()) blockers.push("description_missing");
  // A price is either stated or deliberately withheld ("price on request").
  if (input.priceState !== "known" && input.priceState !== "withheld") {
    if (!input.rentAmountWithoutPeriod) blockers.push("price_undecided");
    else if (!input.rentPeriodConfirmed) blockers.push("rent_period_unconfirmed");
  }
  if (!input.locationKnown) blockers.push("location_missing");
  if (!advertisableStates.includes(input.commercialState)) blockers.push("not_available");
  if (input.ownerRefused) blockers.push("owner_refused");
  // Sandanski is inland (AGENTS.md): sea, beach or coast wording never goes public.
  if (framesInlandAsCoast(input.placeNames, input.texts)) blockers.push("inland_framed_as_coast");

  // One photo line at most, and the one that is true: photos exist but are not ready yet, or
  // there are none at all.
  if (input.photos.notReady > 0) warnings.push("photos_not_ready");
  // Photos still on the old website are their own true line; "no photos" would repeat it.
  if ((input.photos.notCopied ?? 0) > 0) warnings.push("photos_not_copied");
  else if (input.photos.notReady === 0 && input.photos.ready === 0) warnings.push("no_photos");
  const description = input.description.trim();
  if (description && description.length < shortDescriptionLength)
    warnings.push("short_description");
  if (dwellings.includes(input.propertyType) && input.bedroomsState !== "known")
    warnings.push("bedrooms_unknown");
  if (input.titleSiteSuffix) warnings.push("title_site_suffix");
  return { blockers, warnings };
}
