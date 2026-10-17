import type { mediaAssets } from "@/db/schema";
import { isMediaPublishable } from "@/domain/media";
import { parseMediaRenditions } from "@/domain/media-rendition";

/** Byte evidence is required in addition to domain review states. */
export function mediaAssetEligible(asset: typeof mediaAssets.$inferSelect): boolean {
  const renditions = parseMediaRenditions(asset.derivativeRenditions, asset.id);
  if (
    !renditions ||
    (renditions.length > 0 &&
      !renditions.some(
        (item) =>
          item.key === asset.derivativeKey &&
          item.sha256 === asset.derivativeSha256 &&
          item.contentType === asset.derivativeContentType &&
          item.width === asset.width &&
          item.height === asset.height,
      ))
  )
    return false;
  return (
    isMediaPublishable({ ...asset, sealedSha256: asset.sha256 }) &&
    Boolean(
      asset.sealedKey &&
        asset.scannedAt &&
        asset.scannerVersion &&
        asset.scannedSha256 === asset.sha256 &&
        asset.derivativeKey &&
        asset.derivativeSha256 &&
        asset.derivativeContentType === "image/webp",
    )
  );
}
