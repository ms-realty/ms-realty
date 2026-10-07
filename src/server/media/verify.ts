import "server-only";
import type { mediaAssets } from "@/db/schema";
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
    } catch {
      throw new AppError("publication_ineligible", {
        detail: "Reviewed media bytes are missing or no longer match their evidence",
      });
    }
  }
}
