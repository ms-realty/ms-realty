// Media assets: rights, modification disclosure and staging (spec F23, §18.1, A54, AD12).

export const mediaKinds = ["photo", "floor_plan", "video", "render", "virtual_tour"] as const;
export type MediaKind = (typeof mediaKinds)[number];

export const mediaRightsStates = [
  "unknown",
  "pending",
  "cleared",
  "restricted",
  "rejected",
] as const;
export type MediaRightsState = (typeof mediaRightsStates)[number];

/** Modified imagery is labeled next to the media; originals stay available. */
export const mediaModifications = [
  "none",
  "retouched",
  "virtually_staged",
  "renovation_render",
  "redrawn_plan",
] as const;
export type MediaModification = (typeof mediaModifications)[number];

export const mediaStorageAreas = ["staging", "public"] as const;
export type MediaStorageArea = (typeof mediaStorageAreas)[number];

export const mediaReviewStates = ["pending", "approved", "rejected"] as const;
export type MediaReviewState = (typeof mediaReviewStates)[number];

/** The only content types accepted for stored media (fixes arbitrary Content-Type, H2). */
export const allowedMediaContentTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "video/mp4",
  "application/pdf",
] as const;
export type MediaContentType = (typeof allowedMediaContentTypes)[number];

export function isAllowedMediaContentType(value: string): value is MediaContentType {
  return (allowedMediaContentTypes as readonly string[]).includes(value);
}

export interface MediaEligibilityInput {
  readonly rights: MediaRightsState;
  readonly review: MediaReviewState;
  readonly modification: MediaModification;
  /** Disclosure text shown next to modified media. */
  readonly modificationDisclosure?: string;
}

/** A54: no publication until rights are cleared and review passed; modifications disclosed. */
export function isMediaPublishable(asset: MediaEligibilityInput): boolean {
  if (asset.rights !== "cleared" || asset.review !== "approved") return false;
  return asset.modification === "none" || Boolean(asset.modificationDisclosure?.trim());
}
