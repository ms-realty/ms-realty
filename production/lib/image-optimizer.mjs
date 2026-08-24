// Decode, re-orient, resize and re-encode uploaded photos.
//
// production/lib/image-sanitizer.mjs answers "is this an image, and is it safe
// to store". It does not answer "is this a sensible thing to serve": a 12 MB
// photo straight off a phone was stored and served at full weight. This module
// is the step that makes every accepted upload a web-sized image.
//
// The ordering here is the whole point, and it is the opposite of the obvious
// one:
//
//     sniff  ->  decode + auto-rotate  ->  resize  ->  re-encode  ->  strip
//
// EXIF orientation is the reason. A phone held sideways does not rotate the
// pixels; it writes the rotation into the EXIF Orientation tag and leaves the
// pixels as the sensor read them. Stripping EXIF first — which is what storing
// a sanitised original did — throws that tag away and leaves the sideways
// pixels behind, so the photo renders sideways forever with nothing left to
// say it should not. Rotating *before* the strip bakes the orientation into
// the pixels, after which losing the tag is exactly what we want.
//
// The strip still runs, and it runs last, on the bytes we actually store. That
// is deliberate: sharp is trusted to drop metadata, but "trusted to" is not the
// standard this pipeline holds for a seller's GPS coordinates. The re-encoded
// bytes go through the same byte-level strip and the same "EXIF must be absent
// afterwards" assertion as an unoptimised upload.
//
// AVIF is passed through untouched. Re-encoding it would be slow, and the
// sanitiser's contract for AVIF is to refuse metadata it cannot strip rather
// than to rewrite the file; decoding it here would quietly turn that refusal
// into an acceptance. An AVIF that reaches storage is one that never carried
// Exif or XMP in the first place.

import sharp from "sharp";
import { UnsupportedImageError, sanitizeImageUpload, sniffImageFormat } from "./image-sanitizer.mjs";

export const DEFAULT_IMAGE_MAX_EDGE = 2560;
export const DEFAULT_IMAGE_QUALITY = 82;
export const DEFAULT_IMAGE_THUMBNAIL_EDGE = 640;
export const DEFAULT_IMAGE_THUMBNAIL_QUALITY = 75;

// 50 MP is roughly a 8660x5773 photo — larger than any camera a seller is
// holding, and small enough that a decode cannot exhaust the container. The
// cap is checked against the *declared* dimensions before decoding and handed
// to sharp as a hard decode limit, so a header that lies is caught too.
export const DEFAULT_IMAGE_MAX_PIXELS = 50_000_000;

// Recompressing an already-compressed WebP usually buys a few percent and
// costs a generation of quality. It is only worth storing the new bytes if the
// win is real.
const RECOMPRESS_MIN_SAVING = 0.1;

export const IMAGE_RENDITION_THUMBNAIL = "thumb";

/**
 * A decode bomb: a file whose header declares more pixels than we will ever
 * decode. It is an unsupported image rather than a storage failure, so it
 * carries the upload error taxonomy and lands on the caller's 415 path.
 */
export class ImageTooLargeError extends UnsupportedImageError {
  constructor(message) {
    super(message);
    this.name = "ImageTooLargeError";
    this.code = "image_dimensions_too_large";
  }
}

function positiveInteger(value, fallback, name, { max = Number.MAX_SAFE_INTEGER } = {}) {
  const raw = value === undefined || value === null || value === "" ? String(fallback) : String(value);
  if (!/^\d+$/.test(raw) || Number(raw) < 1) throw new Error(`${name} must be a positive integer`);
  if (Number(raw) > max) throw new Error(`${name} must be ${max} or less`);
  return Number(raw);
}

/**
 * Read the optimisation settings once, the way the upload limits are read
 * once. Both surfaces — the admin editor and the public seller intake — take
 * their settings from here, so a photo is treated the same whoever sent it.
 */
export function imageOptimizationFromEnv(env = process.env) {
  return {
    maxEdge: positiveInteger(env.MS_REALTY_IMAGE_MAX_EDGE, DEFAULT_IMAGE_MAX_EDGE, "MS_REALTY_IMAGE_MAX_EDGE", {
      max: 10000,
    }),
    quality: positiveInteger(env.MS_REALTY_IMAGE_QUALITY, DEFAULT_IMAGE_QUALITY, "MS_REALTY_IMAGE_QUALITY", { max: 100 }),
    thumbnailEdge: positiveInteger(
      env.MS_REALTY_IMAGE_THUMBNAIL_EDGE,
      DEFAULT_IMAGE_THUMBNAIL_EDGE,
      "MS_REALTY_IMAGE_THUMBNAIL_EDGE",
      { max: 10000 },
    ),
    thumbnailQuality: DEFAULT_IMAGE_THUMBNAIL_QUALITY,
    maxPixels: positiveInteger(env.MS_REALTY_IMAGE_MAX_PIXELS, DEFAULT_IMAGE_MAX_PIXELS, "MS_REALTY_IMAGE_MAX_PIXELS"),
  };
}

/* ------------------------------------------------------------------ decode */

// Orientation values 5-8 are the ones that transpose the image, so the
// dimensions a viewer sees are the stored dimensions swapped.
function orientationSwapsAxes(orientation) {
  return Number(orientation) >= 5 && Number(orientation) <= 8;
}

function displayDimensions(metadata) {
  const width = Number(metadata?.width) || 0;
  const height = Number(metadata?.height) || 0;
  return orientationSwapsAxes(metadata?.orientation) ? { width: height, height: width } : { width, height };
}

async function readMetadata(bytes, format) {
  try {
    // metadata() parses the header only; it does not decode pixels, which is
    // what makes it safe to call on a file we have not yet vetted for size.
    return await sharp(bytes, { limitInputPixels: false }).metadata();
  } catch (error) {
    throw new UnsupportedImageError(
      `Upload claims to be a ${format.toUpperCase()} but could not be decoded as one: ${error.message.split("\n")[0]}`,
    );
  }
}

function assertDecodable(metadata, maxPixels) {
  const width = Number(metadata?.width) || 0;
  const height = Number(metadata?.height) || 0;
  if (!width || !height) throw new UnsupportedImageError("Upload does not declare usable image dimensions");
  // An animated WebP decodes every frame, so the bomb is frames x pixels.
  const frames = Math.max(1, Number(metadata?.pages) || 1);
  const pixels = width * height * frames;
  if (pixels > maxPixels) {
    throw new ImageTooLargeError(
      `Image is ${width}x${height}${frames > 1 ? ` over ${frames} frames` : ""} (${Math.round(pixels / 1e6)} megapixels); the limit is ${Math.round(
        maxPixels / 1e6,
      )} megapixels. Export it at a smaller size and upload it again.`,
    );
  }
  return pixels;
}

/* ------------------------------------------------------------------ encode */

// One decoded, re-oriented, resized pipeline. Every encode below starts from a
// fresh clone of it so the source is decoded once per output.
function pipelineFor(bytes, { maxEdge, maxPixels }) {
  return sharp(bytes, { limitInputPixels: maxPixels })
    // No argument: take the angle from EXIF Orientation and bake it in.
    .rotate()
    .resize({ width: maxEdge, height: maxEdge, fit: "inside", withoutEnlargement: true });
}

async function encodeJpeg(pipeline, quality) {
  return pipeline.clone().jpeg({ quality, mozjpeg: true }).toBuffer({ resolveWithObject: true });
}

async function encodePng(pipeline) {
  return pipeline.clone().png({ compressionLevel: 9, palette: true }).toBuffer({ resolveWithObject: true });
}

async function encodeWebp(pipeline, quality) {
  return pipeline.clone().webp({ quality }).toBuffer({ resolveWithObject: true });
}

/**
 * Choose the stored format.
 *
 *   jpeg  -> jpeg. A photo is a photo.
 *   png   -> png when it carries transparency, which a JPEG cannot represent
 *            at all. Otherwise both encodings are produced and the smaller one
 *            wins: that keeps flat graphics and floor plans as PNG (where PNG
 *            genuinely is smaller) and turns PNG-wrapped photographs into
 *            JPEG (where it is dramatically smaller), without guessing from a
 *            byte-count threshold what the picture actually is.
 *   webp  -> webp, but only if recompressing is worth a generation loss.
 */
async function encodeBest(pipeline, { format, hasAlpha, quality }) {
  if (format === "jpeg") return { ...(await encodeJpeg(pipeline, quality)), format: "jpeg" };

  if (format === "png") {
    const png = await encodePng(pipeline);
    if (hasAlpha) return { ...png, format: "png" };
    const jpeg = await encodeJpeg(pipeline, quality);
    return jpeg.data.length < png.data.length ? { ...jpeg, format: "jpeg" } : { ...png, format: "png" };
  }

  return { ...(await encodeWebp(pipeline, quality)), format: "webp" };
}

/* -------------------------------------------------------------- renditions */

/**
 * A small rendition for list and preview surfaces. The admin workbench shows
 * uploads at thumbnail size; without this it downloads the full photo to draw
 * an 80px box.
 *
 * WebP, because it is markedly smaller than JPEG at this size and — unlike
 * JPEG — can carry the transparency of a floor plan without flattening it onto
 * a background colour that may be wrong for the viewer's theme.
 */
async function encodeThumbnail(bytes, stored, { thumbnailEdge, thumbnailQuality, maxPixels }) {
  // A photo that is already thumbnail-sized does not get a second copy of
  // itself. Re-encoding it would usually produce *more* bytes than the image
  // it is supposed to save the browser from downloading.
  if (Math.max(stored.width, stored.height) <= thumbnailEdge) return null;

  const { data, info } = await sharp(bytes, { limitInputPixels: maxPixels })
    .rotate()
    .resize({ width: thumbnailEdge, height: thumbnailEdge, fit: "inside", withoutEnlargement: true })
    .webp({ quality: thumbnailQuality })
    .toBuffer({ resolveWithObject: true });
  // The rendition is stored bytes like any other, so it goes through the same
  // strip and the same "no EXIF survives" assertion.
  const sanitized = sanitizeImageUpload(data);
  if (sanitized.bytes.length >= stored.bytes) return null;
  return {
    kind: IMAGE_RENDITION_THUMBNAIL,
    bytes: sanitized.bytes,
    format: sanitized.format,
    ext: sanitized.ext,
    mime: sanitized.mime,
    width: info.width,
    height: info.height,
  };
}

/* -------------------------------------------------------------- entrypoint */

/**
 * Sanitise *and* optimise one upload.
 *
 * Returns the same shape as `sanitizeImageUpload` — callers can treat it as a
 * drop-in replacement — plus the dimensions, the before/after byte counts, and
 * a `rendition` the caller stores under its own key.
 */
export async function optimizeImageUpload(
  input,
  { declaredType = "", filename = "", settings = imageOptimizationFromEnv(), renditions = true } = {},
) {
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input || []);
  const sniffed = sniffImageFormat(bytes);

  // Not an image at all, or an AVIF. Both are the sanitiser's decision to make
  // and its error messages are the ones the upload surfaces already quote.
  if (!sniffed || sniffed.format === "avif") {
    const sanitized = sanitizeImageUpload(bytes, { declaredType, filename });
    // A real AVIF still reports its dimensions, so the ledger row is complete
    // even though the bytes are passed through untouched.
    let dimensions = { width: null, height: null };
    try {
      dimensions = displayDimensions(await sharp(bytes, { limitInputPixels: false }).metadata());
    } catch {
      dimensions = { width: null, height: null };
    }
    return {
      ...sanitized,
      optimized: false,
      width: dimensions.width || null,
      height: dimensions.height || null,
      original_width: dimensions.width || null,
      original_height: dimensions.height || null,
      original_format: sniffed?.format || null,
      orientation_applied: false,
      resized: false,
      bytes_before: bytes.length,
      bytes_after: sanitized.bytes.length,
      rendition: null,
    };
  }

  const metadata = await readMetadata(bytes, sniffed.format);
  assertDecodable(metadata, settings.maxPixels);

  const source = displayDimensions(metadata);
  const pipeline = pipelineFor(bytes, settings);
  const encoded = await encodeBest(pipeline, {
    format: sniffed.format,
    hasAlpha: Boolean(metadata.hasAlpha),
    quality: settings.quality,
  });

  const resized = source.width > settings.maxEdge || source.height > settings.maxEdge;
  const rotated = Number(metadata.orientation || 1) !== 1;

  // The honest baseline for "did this help" is the *sanitised* original, not
  // the bytes as posted: stripping a fat EXIF block is a saving the strip
  // already made, and counting it again here would credit the encoder with it.
  // If the original cannot be stripped at all we have no fallback to keep, and
  // the re-encode — which rebuilds the file from decoded pixels — is the only
  // thing that can be stored.
  let sanitizedOriginal = null;
  try {
    sanitizedOriginal = sanitizeImageUpload(bytes, { declaredType, filename });
  } catch {
    sanitizedOriginal = null;
  }

  // A rotation or a downscale is not an optimisation we are free to decline:
  // declining it stores the sideways or oversized photo. Everything else is
  // kept only when it pays for itself. Recompressing an already-lossy WebP
  // costs a generation of quality, so it has to earn more than break-even;
  // for JPEG and PNG break-even is enough, which is simply the rule "never
  // store more bytes than we were given".
  const mustTransform = resized || rotated;
  const requiredSaving = sniffed.format === "webp" ? RECOMPRESS_MIN_SAVING : 0;
  const baseline = sanitizedOriginal ? sanitizedOriginal.bytes.length : Number.POSITIVE_INFINITY;
  const saving = 1 - encoded.data.length / baseline;
  const keepOriginal = !mustTransform && sanitizedOriginal !== null && saving <= requiredSaving;

  const sanitized = keepOriginal ? sanitizedOriginal : sanitizeImageUpload(encoded.data, { declaredType, filename });
  const width = keepOriginal ? source.width : encoded.info.width;
  const height = keepOriginal ? source.height : encoded.info.height;

  const rendition = renditions
    ? await encodeThumbnail(bytes, { width, height, bytes: sanitized.bytes.length }, settings)
    : null;

  return {
    ...sanitized,
    optimized: !keepOriginal,
    width,
    height,
    original_width: source.width,
    original_height: source.height,
    original_format: sniffed.format,
    orientation_applied: rotated,
    resized,
    bytes_before: bytes.length,
    bytes_after: sanitized.bytes.length,
    rendition,
  };
}
