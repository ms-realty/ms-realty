// "Checked for you" (ADR 0012): what the system checks before a person publishes a listing by
// one decision. Blockers stop publishing; warnings are shown and left to the person. Pure and
// isomorphic: the staff preview, the bulk view, the Today queue and the publish command share it.
// No model call: every rule is a plain reading of the recorded content.
import type { FactState, PropertyType } from "./facts";
import type { CommercialState } from "./listing";

export const publishBlockers = [
  "title_missing",
  "description_missing",
  "price_undecided",
  "location_missing",
  "not_available",
] as const;
export type PublishBlocker = (typeof publishBlockers)[number];

export const publishWarnings = [
  "no_photos",
  "photos_not_ready",
  "photos_not_copied",
  "short_description",
  "bedrooms_unknown",
  "inland_framed_as_coast",
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
const inlandPlace = /sandanski|сандански/iu;
const coastWords =
  /\b(?:sea|seaside|beach(?:es)?|coast(?:al|line)?)\b|(?:^|[^\p{L}])(?:мор[еяю]|морск|плаж|крайбрежи|пляж|побережь)/iu;

export function framesInlandAsCoast(placeNames: readonly string[], texts: readonly string[]) {
  const inland = [...placeNames, ...texts].some((name) => inlandPlace.test(name));
  return inland && texts.some((text) => coastWords.test(text));
}

export function publishChecks(input: PublishCheckInput): PublishChecks {
  const blockers: PublishBlocker[] = [];
  const warnings: PublishWarning[] = [];
  if (!input.title.trim()) blockers.push("title_missing");
  if (!input.description.trim()) blockers.push("description_missing");
  // A price is either stated or deliberately withheld ("price on request").
  if (input.priceState !== "known" && input.priceState !== "withheld")
    blockers.push("price_undecided");
  if (!input.locationKnown) blockers.push("location_missing");
  if (!advertisableStates.includes(input.commercialState)) blockers.push("not_available");

  if (input.photos.ready === 0) warnings.push("no_photos");
  if (input.photos.notReady > 0) warnings.push("photos_not_ready");
  if ((input.photos.notCopied ?? 0) > 0) warnings.push("photos_not_copied");
  const description = input.description.trim();
  if (description && description.length < shortDescriptionLength)
    warnings.push("short_description");
  if (dwellings.includes(input.propertyType) && input.bedroomsState !== "known")
    warnings.push("bedrooms_unknown");
  if (framesInlandAsCoast(input.placeNames, input.texts)) warnings.push("inland_framed_as_coast");
  return { blockers, warnings };
}
