// Media assets, their placement and the shared upload/scan vocabulary (architecture §4.1, §13).
// Bytes are sealed under a server-only key before scanning; rights, scan, processing and human
// review are separate facts, and none of them alone makes an asset publishable.

export const mediaKinds = ["photo", "floor_plan", "video", "render", "virtual_tour"] as const;
export type MediaKind = (typeof mediaKinds)[number];

/** Why the asset exists; a gallery candidate and private evidence are different purposes. */
export const mediaPurposes = ["listing_gallery", "floor_plan", "tour", "private_evidence"] as const;
export type MediaPurpose = (typeof mediaPurposes)[number];

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

export const mediaReviewStates = ["pending", "approved", "rejected"] as const;
export type MediaReviewState = (typeof mediaReviewStates)[number];

/** Malware scan of the sealed bytes; an unavailable or stale scanner leaves files quarantined. */
export const scanStates = ["pending", "clean", "infected", "failed"] as const;
export type ScanState = (typeof scanStates)[number];

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
}

/** Publication-eligible only when every separate fact allows it (AT28, AT42). */
export function isMediaPublishable(asset: MediaEligibilityInput): boolean {
  if (asset.audience !== "public_candidate" || !asset.sealedSha256) return false;
  if (asset.scan !== "clean" || asset.processing !== "ready") return false;
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
