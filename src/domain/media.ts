// Media assets, their placement and the shared upload/scan vocabulary (architecture §4.1, §13).
// Bytes are sealed under a server-only key before scanning; rights, scan, processing and human
// review are separate facts, and none of them alone makes an asset publishable.

import { type MediaPolicy, mediaPolicy } from "../config/tenant";

export const mediaKinds = ["photo", "floor_plan", "video", "render", "virtual_tour"] as const;
export type MediaKind = (typeof mediaKinds)[number];

/** Why the asset exists; a gallery candidate and private evidence are different purposes. */
export const mediaPurposes = ["listing_gallery", "floor_plan", "tour", "private_evidence"] as const;

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

/** Working photo text, separate from the metadata a person already approved. */
export type MediaDetailsDraft = {
  caption: string;
  altText: string;
  modification: MediaModification;
  modificationDisclosure: string;
};

export const mediaReviewStates = ["pending", "approved", "rejected"] as const;
export type MediaReviewState = (typeof mediaReviewStates)[number];

/** Malware scan of the sealed bytes; an unavailable or stale scanner leaves files quarantined. */
export const scanStates = ["pending", "clean", "infected", "failed"] as const;
export type ScanState = (typeof scanStates)[number];

/**
 * Which check admitted the sealed bytes (ADR 0016). `scan` and its evidence columns record the
 * outcome of that check for the exact digest: the malware scanner, or a full decode and fresh
 * re-encode of an image into renditions (only pixels survive; the original is never served).
 */
export const mediaAdmissions = ["virus_scan", "reencode"] as const;
export type MediaAdmission = (typeof mediaAdmissions)[number];

/** Raster types a decode-and-re-encode admission can vouch for. */
export const reencodableContentTypes = ["image/jpeg", "image/png", "image/webp"] as const;

/**
 * Whether the recorded admission still counts under the brand's media policy. A scanner result
 * always counts; a re-encode counts only for a raster image while the policy admits images by
 * re-encoding, so a brand that moves to scanner-first stops serving re-encoded media at once.
 */
export function admissionAccepted(
  asset: { readonly admission: MediaAdmission; readonly contentType: string },
  policy: MediaPolicy = mediaPolicy,
): boolean {
  if (asset.admission === "virus_scan") return true;
  return (
    policy.imageAdmission === "reencode" &&
    (reencodableContentTypes as readonly string[]).includes(asset.contentType)
  );
}

/**
 * A photo imported from the old website whose bytes were never brought into the system's own
 * storage: the legacy import recorded only its key (ADR 0016). The carry-over job ends this.
 */
export function isLegacyPhotoAwaitingCarryOver(asset: {
  readonly legacyReference: string | null;
  readonly sealedKey: string | null;
  readonly processing: ProcessingState;
}): boolean {
  return Boolean(asset.legacyReference) && !asset.sealedKey && asset.processing !== "failed";
}

/**
 * A photo from the old website the carry-over left out: missing at the source, too large, not
 * an image or not decodable. It is never shown and never blocks its listing.
 */
export function isLegacyPhotoLeftOut(asset: {
  readonly legacyReference: string | null;
  readonly sealedKey: string | null;
  readonly processing: ProcessingState;
}): boolean {
  return Boolean(asset.legacyReference) && !asset.sealedKey && asset.processing === "failed";
}

/** Safe processing: metadata stripping and content-addressed derivatives. */
export const processingStates = ["pending", "processing", "ready", "failed"] as const;
export type ProcessingState = (typeof processingStates)[number];

/** Who may ever receive the bytes. A public candidate is still private until eligible. */
export const mediaAudiences = ["private", "public_candidate"] as const;
export type MediaAudience = (typeof mediaAudiences)[number];

/** Allow-listed content types; everything else is rejected at upload (§13). */
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
  readonly audience: MediaAudience;
  /** Digest of the sealed object; null until the server sealed and verified it. */
  readonly sealedSha256: string | null;
  readonly scan: ScanState;
  readonly processing: ProcessingState;
  readonly rights: MediaRightsState;
  readonly review: MediaReviewState;
  readonly modification: MediaModification;
  /** Disclosure text shown next to modified media. */
  readonly modificationDisclosure?: string | null;
  /** Which check produced `scan`; absent means the malware scanner. */
  readonly admission?: MediaAdmission;
  readonly contentType?: string;
}

/** Publication-eligible only when every separate fact allows it (AT28, AT42). */
export function isMediaPublishable(
  asset: MediaEligibilityInput,
  policy: MediaPolicy = mediaPolicy,
): boolean {
  if (asset.audience !== "public_candidate" || !asset.sealedSha256) return false;
  if (asset.scan !== "clean" || asset.processing !== "ready") return false;
  if (
    !admissionAccepted(
      { admission: asset.admission ?? "virus_scan", contentType: asset.contentType ?? "" },
      policy,
    )
  )
    return false;
  if (asset.rights !== "cleared" || asset.review !== "approved") return false;
  return asset.modification === "none" || Boolean(asset.modificationDisclosure?.trim());
}

export interface Placement {
  /** Stable MediaRelation identity; the same asset may be placed more than once. */
  readonly relationId: string;
  readonly position: number;
}

/**
 * Moves one relation before or after another against the complete stored set (§12, AT20).
 * Hidden, unsupported and off-page relations keep their relative order; positions are
 * renumbered densely from zero.
 */
export function moveRelation(
  placements: readonly Placement[],
  relationId: string,
  target: { readonly before: string } | { readonly after: string },
): Placement[] {
  const ordered = [...placements].sort((a, b) => a.position - b.position);
  const moving = ordered.find((p) => p.relationId === relationId);
  const anchorId = "before" in target ? target.before : target.after;
  if (!moving || !ordered.some((p) => p.relationId === anchorId) || anchorId === relationId) {
    throw new Error("Unknown or identical media relation.");
  }
  const rest = ordered.filter((p) => p.relationId !== relationId);
  const anchor = rest.findIndex((p) => p.relationId === anchorId);
  rest.splice("before" in target ? anchor : anchor + 1, 0, moving);
  return rest.map((p, position) => ({ relationId: p.relationId, position }));
}
