// Image admission (ADR 0016). Under the brand's "reencode" rule an image is admitted by decoding
// it fully and writing fresh WebP renditions: only pixels survive, metadata is stripped, and the
// original is kept private and never served. The renditions are the same ones a scanned upload
// gets (src/server/files/inspect.ts), so public pages request exactly the sizes they always did.
import "server-only";
import sharp from "sharp";
import type { MediaPolicy } from "@/config/tenant";
import { type MediaAdmission, reencodableContentTypes } from "@/domain/media";
import type { MediaRendition } from "@/domain/media-rendition";
import { AppError } from "../errors";
import { derivatives } from "../files/inspect";
import { digestOf, type FileStorage } from "../files/storage";

/** Recorded as the check's "scanner version": the exact encoder that produced the pixels. */
export function reencodeAdmissionVersion(): string {
  return `reencode sharp/${sharp.versions.sharp} libvips/${sharp.versions.vips}`;
}

/** The rule that admits these bytes under the policy; documents always go to the scanner. */
export function admissionRuleFor(contentType: string, policy: MediaPolicy): MediaAdmission {
  return policy.imageAdmission === "reencode" &&
    (reencodableContentTypes as readonly string[]).includes(contentType)
    ? "reencode"
    : "virus_scan";
}

export interface StoredRenditions {
  readonly derivativeKey: string;
  readonly derivativeSha256: string;
  readonly derivativeContentType: "image/webp";
  readonly derivativeRenditions: readonly MediaRendition[];
  /** Of the largest rendition: what the public gallery is sized by. */
  readonly width: number;
  readonly height: number;
}

/**
 * Decodes the image and writes its content-addressed renditions, verifying each by reading it
 * back. Throws when the bytes are not a decodable image or a write does not verify. Idempotent:
 * the same original yields the same keys, and an existing identical object is accepted.
 */
export async function storeRenditions(
  storage: FileStorage,
  assetId: string,
  bytes: Buffer,
): Promise<StoredRenditions> {
  return writeRenditions(storage, assetId, await renderRenditions(bytes));
}

export type Renditions = Awaited<ReturnType<typeof derivatives>>;

/** Decode and re-encode only, without storage: throws when the bytes are not a usable image. */
export const renderRenditions = (bytes: Buffer): Promise<Renditions> => derivatives(bytes);

/** Writes rendered renditions under content-addressed keys and verifies each read-back. */
export async function writeRenditions(
  storage: FileStorage,
  assetId: string,
  variants: Renditions,
): Promise<StoredRenditions> {
  const sealed: MediaRendition[] = [];
  for (const variant of variants) {
    const digest = digestOf(variant.bytes);
    const key = `derivatives/${assetId}/${digest}.webp`;
    await storage.writeImmutable(key, variant.bytes, "image/webp");
    const readback = await storage.read(key);
    if (readback.length !== variant.bytes.length || digestOf(readback) !== digest)
      throw new AppError("unavailable");
    sealed.push({
      key,
      sha256: digest,
      contentType: "image/webp",
      width: variant.width,
      height: variant.height,
      byteSize: variant.bytes.length,
    });
  }
  const safe = sealed.at(-1);
  if (!safe) throw new AppError("unavailable");
  return {
    derivativeKey: safe.key,
    derivativeSha256: safe.sha256,
    derivativeContentType: "image/webp",
    derivativeRenditions: sealed,
    width: safe.width,
    height: safe.height,
  };
}
