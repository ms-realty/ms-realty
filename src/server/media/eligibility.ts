import type { mediaAssets } from "@/db/schema";
import { isMediaPublishable } from "@/domain/media";

/** Byte evidence is required in addition to domain review states. */
export function mediaAssetEligible(asset: typeof mediaAssets.$inferSelect): boolean {
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
