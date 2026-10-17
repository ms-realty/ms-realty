import "server-only";
import sharp from "sharp";
import { AppError } from "../errors";
import { MAX_DOCUMENT_BYTES, MAX_IMAGE_BYTES } from "./storage";

export const imageContentTypes = ["image/jpeg", "image/png", "image/webp"] as const;
export const documentContentTypes = [...imageContentTypes, "application/pdf"] as const;
export interface InspectedFile {
  contentType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
}

/** Server-measured signatures and bounded decoding; extensions/client MIME are not proof. */
export async function inspectFile(
  bytes: Buffer,
  kind: "media" | "document",
): Promise<InspectedFile> {
  if (!bytes.length || bytes.length > (kind === "media" ? MAX_IMAGE_BYTES : MAX_DOCUMENT_BYTES))
    throw new AppError("validation_failed", {
      fieldErrors: { file: ["File is empty or exceeds the size limit."] },
    });
  let contentType: string | undefined;
  if (bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) contentType = "image/jpeg";
  else if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    contentType = "image/png";
  else if (bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP")
    contentType = "image/webp";
  else if (
    kind === "document" &&
    /^%PDF-\d\.\d/.test(bytes.toString("ascii", 0, 8)) &&
    bytes.subarray(-2048).includes(Buffer.from("%%EOF"))
  )
    contentType = "application/pdf";
  if (!contentType)
    throw new AppError("validation_failed", {
      fieldErrors: { file: ["Use a supported PDF, JPEG, PNG or WebP file."] },
    });
  if (contentType === "application/pdf")
    return { contentType, byteSize: bytes.length, width: null, height: null };
  try {
    const source = sharp(bytes, { limitInputPixels: 40_000_000, failOn: "warning", pages: 1 });
    const metadata = await source.metadata();
    if (!metadata.width || !metadata.height || (metadata.pages ?? 1) > 1)
      throw new Error("unsupported_image");
    // Decode fully now; metadata alone does not establish a readable image.
    await source.clone().resize({ width: 1, height: 1 }).raw().toBuffer();
    return { contentType, byteSize: bytes.length, width: metadata.width, height: metadata.height };
  } catch {
    throw new AppError("validation_failed", {
      fieldErrors: { file: ["This image could not be decoded safely."] },
    });
  }
}

/** sharp strips EXIF/IPTC/XMP by default; never call keepMetadata/withMetadata. */
export async function derivative(
  bytes: Buffer,
): Promise<{ bytes: Buffer; width: number; height: number }> {
  const result = await sharp(bytes, { limitInputPixels: 40_000_000, failOn: "warning", pages: 1 })
    .rotate()
    .resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 85 })
    .toBuffer({ resolveWithObject: true });
  return { bytes: result.data, width: result.info.width, height: result.info.height };
}
