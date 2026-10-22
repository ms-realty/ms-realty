import "server-only";
import sharp from "sharp";
import type { mediaAssets } from "@/db/schema";
import { parseMediaRenditions } from "@/domain/media-rendition";
import { AppError } from "../errors";
import { fileServices } from "../files/config";
import { digestOf, type FileStorage } from "../files/storage";
import { mediaAssetEligible } from "./eligibility";

/** Preparation and activation call this against actual storage, not database flags alone. */
export async function verifyPublicationMedia(
  assets: readonly (typeof mediaAssets.$inferSelect)[],
  storage: FileStorage = fileServices().storage,
): Promise<void> {
  for (const asset of assets) {
    if (!mediaAssetEligible(asset) || !asset.sealedKey || !asset.derivativeKey)
      throw new AppError("publication_ineligible");
    try {
      const [original, derivative] = await Promise.all([
        storage.read(asset.sealedKey),
        storage.read(asset.derivativeKey),
      ]);
      if (
        original.length !== asset.byteSize ||
        digestOf(original) !== asset.sha256 ||
        digestOf(derivative) !== asset.derivativeSha256
      )
        throw new Error("storage_digest_mismatch");
      const renditions = parseMediaRenditions(asset.derivativeRenditions, asset.id);
      if (!renditions) throw new Error("invalid_renditions");
      for (const rendition of renditions) {
        const bytes =
          rendition.key === asset.derivativeKey ? derivative : await storage.read(rendition.key);
        if (bytes.length !== rendition.byteSize || digestOf(bytes) !== rendition.sha256)
          throw new Error("storage_digest_mismatch");
        const metadata = await sharp(bytes, {
          limitInputPixels: 40_000_000,
          failOn: "warning",
          pages: 1,
        }).metadata();
        if (
          metadata.format !== "webp" ||
          metadata.width !== rendition.width ||
          metadata.height !== rendition.height
        )
          throw new Error("rendition_dimensions_mismatch");
      }
    } catch {
      throw new AppError("publication_ineligible", {
        detail: "Reviewed media bytes are missing or no longer match their evidence",
      });
    }
  }
}
