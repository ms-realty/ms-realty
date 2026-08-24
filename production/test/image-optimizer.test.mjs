// What the optimiser must guarantee about every photo it accepts.
//
// The assertions are deliberately about observable properties of the stored
// bytes — dimensions, format, size, absence of EXIF — rather than about which
// sharp calls were made. That is what lets the encoder settings change without
// rewriting the suite.

import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";

import { sanitizeImageUpload, sniffImageFormat } from "../lib/image-sanitizer.mjs";
import {
  DEFAULT_IMAGE_MAX_EDGE,
  DEFAULT_IMAGE_MAX_PIXELS,
  DEFAULT_IMAGE_QUALITY,
  DEFAULT_IMAGE_THUMBNAIL_EDGE,
  ImageTooLargeError,
  imageOptimizationFromEnv,
  optimizeImageUpload,
} from "../lib/image-optimizer.mjs";
import {
  alphaPng,
  avifWithExif,
  avifWithoutMetadata,
  decodeBombPng,
  efficientWebp,
  jpegWithGpsExif,
  orientedPhotoJpeg,
  photoPng,
  photoWebp,
  textFileNamedJpg,
  tinyJpeg,
  tinyPng,
} from "./image-upload.fixture.mjs";

const EXIF_MARKER = Buffer.from("Exif\u0000\u0000", "latin1");
const GPS_LATITUDE_REF_TAG = Buffer.from([0x00, 0x01, 0x00, 0x02]);

/* ----------------------------------------------------------------- config */

test("optimisation settings come from the environment with documented defaults", () => {
  const defaults = imageOptimizationFromEnv({});
  assert.equal(defaults.maxEdge, DEFAULT_IMAGE_MAX_EDGE);
  assert.equal(defaults.maxEdge, 2560);
  assert.equal(defaults.quality, DEFAULT_IMAGE_QUALITY);
  assert.equal(defaults.quality, 82);
  assert.equal(defaults.thumbnailEdge, DEFAULT_IMAGE_THUMBNAIL_EDGE);
  assert.equal(defaults.thumbnailEdge, 640);
  assert.equal(defaults.maxPixels, DEFAULT_IMAGE_MAX_PIXELS);
  assert.equal(defaults.maxPixels, 50_000_000);

  const overridden = imageOptimizationFromEnv({
    MS_REALTY_IMAGE_MAX_EDGE: "1600",
    MS_REALTY_IMAGE_QUALITY: "70",
    MS_REALTY_IMAGE_THUMBNAIL_EDGE: "320",
    MS_REALTY_IMAGE_MAX_PIXELS: "1000000",
  });
  assert.equal(overridden.maxEdge, 1600);
  assert.equal(overridden.quality, 70);
  assert.equal(overridden.thumbnailEdge, 320);
  assert.equal(overridden.maxPixels, 1_000_000);

  // A quality outside 1-100 is a configuration mistake that must fail loudly
  // at startup rather than silently clamp.
  assert.throws(() => imageOptimizationFromEnv({ MS_REALTY_IMAGE_QUALITY: "0" }), /positive integer/);
  assert.throws(() => imageOptimizationFromEnv({ MS_REALTY_IMAGE_QUALITY: "101" }), /100 or less/);
  assert.throws(() => imageOptimizationFromEnv({ MS_REALTY_IMAGE_MAX_EDGE: "-5" }), /positive integer/);
});

/* ------------------------------------------------------------ orientation */

test("a sideways photo is rotated upright before its EXIF is discarded", async () => {
  // Orientation 6 means "rotate 90 degrees clockwise to display": the stored
  // pixels are 3000x1200 landscape, but the photograph is 1200x3000 portrait.
  const source = await orientedPhotoJpeg({ width: 3000, height: 1200, orientation: 6 });
  assert.equal((await sharp(source).metadata()).orientation, 6);
  assert.equal((await sharp(source).metadata()).width, 3000, "the stored pixels start out landscape");

  const result = await optimizeImageUpload(source, { filename: "sideways.jpg" });

  assert.equal(result.orientation_applied, true);
  assert.equal(result.original_width, 1200, "the source is described as the viewer would see it");
  assert.equal(result.original_height, 3000);

  // This is the regression: the output must be portrait. Strip the EXIF first
  // and the rotation is lost, leaving a landscape image with nothing left to
  // say it should have been turned.
  assert.ok(result.height > result.width, "an upright photo must be taller than it is wide");
  assert.equal(result.width, 1024);
  assert.equal(result.height, 2560);

  // And the rotation is in the pixels now, not in a tag: re-reading the stored
  // bytes reports no orientation to apply.
  const stored = await sharp(result.bytes).metadata();
  assert.equal(stored.width, 1024);
  assert.equal(stored.height, 2560);
  assert.ok(!stored.orientation || stored.orientation === 1, "no orientation tag may survive");
});

test("an upright photo is not rotated", async () => {
  const source = await orientedPhotoJpeg({ width: 1200, height: 800, orientation: 1 });
  const result = await optimizeImageUpload(source);
  assert.equal(result.orientation_applied, false);
  assert.equal(result.width, 1200);
  assert.equal(result.height, 800);
});

/* ---------------------------------------------------------------- resizing */

test("an oversized photo is fitted to the long edge and a small one is never upscaled", async () => {
  const big = await orientedPhotoJpeg({ width: 4000, height: 2000, orientation: 1 });
  const resized = await optimizeImageUpload(big);
  assert.equal(resized.resized, true);
  assert.equal(Math.max(resized.width, resized.height), DEFAULT_IMAGE_MAX_EDGE);
  assert.equal(resized.width, 2560);
  assert.equal(resized.height, 1280, "the aspect ratio is preserved");

  const small = await orientedPhotoJpeg({ width: 640, height: 480, orientation: 1 });
  const untouched = await optimizeImageUpload(small);
  assert.equal(untouched.resized, false);
  assert.equal(untouched.width, 640, "a photo smaller than the cap must never be enlarged");
  assert.equal(untouched.height, 480);
});

test("the long edge is configurable", async () => {
  const source = await orientedPhotoJpeg({ width: 3000, height: 1500, orientation: 1 });
  const result = await optimizeImageUpload(source, {
    settings: imageOptimizationFromEnv({ MS_REALTY_IMAGE_MAX_EDGE: "800" }),
  });
  assert.equal(result.width, 800);
  assert.equal(result.height, 400);
});

/* ----------------------------------------------------------- size and cost */

test("a heavy photo is stored dramatically smaller than it was uploaded", async () => {
  const source = await orientedPhotoJpeg({ width: 3000, height: 1200, orientation: 6 });
  const result = await optimizeImageUpload(source);

  assert.equal(result.bytes_before, source.length);
  assert.equal(result.bytes_after, result.bytes.length);
  assert.equal(result.optimized, true);
  assert.ok(
    result.bytes_after < result.bytes_before / 2,
    `expected the stored photo to be less than half the upload, got ${result.bytes_after} from ${result.bytes_before}`,
  );
});

test("re-encoding is declined when it would not make the file smaller", async () => {
  // A 1x1 PNG cannot be improved; re-encoding it produces more bytes than it
  // started with, and storing those would be a pure loss.
  const result = await optimizeImageUpload(tinyPng());
  assert.equal(result.optimized, false);
  assert.equal(result.format, "png");
  assert.ok(result.bytes_after <= result.bytes_before);
  assert.deepEqual(result.bytes, sanitizeImageUpload(tinyPng()).bytes);
});

test("an already efficient WebP is kept rather than recompressed for a few percent", async () => {
  const source = await efficientWebp({ width: 400, height: 300, quality: 60 });
  const result = await optimizeImageUpload(source);
  assert.equal(result.optimized, false, "a sub-10% saving does not justify a generation of quality loss");
  assert.equal(result.format, "webp");
  assert.equal(result.width, 400);
  assert.equal(result.height, 300);
});

test("a generously encoded WebP is recompressed when the saving is real", async () => {
  const source = await photoWebp({ width: 3000, height: 1200, quality: 95 });
  const result = await optimizeImageUpload(source);
  assert.equal(result.optimized, true);
  assert.equal(result.format, "webp", "a WebP stays a WebP");
  assert.equal(result.resized, true);
  assert.equal(result.width, 2560);
  assert.ok(result.bytes_after < result.bytes_before * 0.9, "the saving must clear the 10% bar");
});

/* ------------------------------------------------------------ format rules */

test("a PNG with transparency stays a PNG", async () => {
  const source = await alphaPng({ width: 900, height: 300 });
  const result = await optimizeImageUpload(source);
  assert.equal(result.format, "png", "JPEG cannot represent an alpha channel at all");
  assert.equal(result.mime, "image/png");
  assert.equal(sniffImageFormat(result.bytes).format, "png");
  assert.equal((await sharp(result.bytes).metadata()).hasAlpha, true, "the transparency must survive");
});

test("a photograph saved as PNG is stored as JPEG", async () => {
  const source = await photoPng({ width: 1200, height: 800 });
  const result = await optimizeImageUpload(source);
  assert.equal(result.format, "jpeg", "an opaque photograph is far smaller as JPEG");
  assert.equal(result.ext, "jpg");
  assert.equal(result.mime, "image/jpeg");
  assert.equal(sniffImageFormat(result.bytes).format, "jpeg");
  assert.ok(result.bytes_after < result.bytes_before / 2);
});

test("a JPEG stays a JPEG", async () => {
  const result = await optimizeImageUpload(await orientedPhotoJpeg({ width: 1000, height: 800, orientation: 1 }));
  assert.equal(result.format, "jpeg");
  assert.equal(sniffImageFormat(result.bytes).format, "jpeg");
});

/* -------------------------------------------------------------- renditions */

test("a large photo gets a thumbnail rendition stored under its own format", async () => {
  const source = await orientedPhotoJpeg({ width: 3000, height: 1200, orientation: 6 });
  const result = await optimizeImageUpload(source);

  assert.ok(result.rendition, "a full-size photo must carry a thumbnail");
  assert.equal(result.rendition.kind, "thumb");
  assert.equal(result.rendition.format, "webp");
  assert.equal(result.rendition.ext, "webp");
  assert.equal(result.rendition.mime, "image/webp");
  assert.equal(Math.max(result.rendition.width, result.rendition.height), DEFAULT_IMAGE_THUMBNAIL_EDGE);
  // The thumbnail is rotated too — a sideways thumbnail is just as wrong.
  assert.ok(result.rendition.height > result.rendition.width);

  assert.ok(
    result.rendition.bytes.length < result.bytes.length / 10,
    `a thumbnail worth serving must be far smaller than the photo: ${result.rendition.bytes.length} vs ${result.bytes.length}`,
  );
  // It is stored bytes like any other, so it is a real image with no metadata.
  assert.equal(sniffImageFormat(result.rendition.bytes).format, "webp");
  assert.equal(result.rendition.bytes.includes(EXIF_MARKER), false);
});

test("a photo already smaller than the thumbnail edge gets no rendition", async () => {
  const source = await orientedPhotoJpeg({ width: 320, height: 240, orientation: 1 });
  const result = await optimizeImageUpload(source);
  assert.equal(result.rendition, null, "a second copy of an already tiny image is wasted storage");
});

test("renditions can be switched off by the caller", async () => {
  const source = await orientedPhotoJpeg({ width: 2000, height: 1000, orientation: 1 });
  const result = await optimizeImageUpload(source, { renditions: false });
  assert.equal(result.rendition, null);
});

/* ------------------------------------------------------------ decode bombs */

test("an image with more pixels than the cap is refused before it is decoded", async () => {
  const bomb = await decodeBombPng({ width: 8000, height: 8000 });
  // The point of the guard: the file-size limit cannot see this coming.
  assert.ok(bomb.length < 1024 * 1024, "the bomb is small on the wire and huge once decoded");

  await assert.rejects(
    () => optimizeImageUpload(bomb, { settings: imageOptimizationFromEnv({ MS_REALTY_IMAGE_MAX_PIXELS: "50000000" }) }),
    (error) => {
      assert.ok(error instanceof ImageTooLargeError);
      assert.equal(error.code, "image_dimensions_too_large");
      assert.match(error.message, /8000x8000/);
      assert.match(error.message, /64 megapixels/);
      return true;
    },
  );
});

test("the pixel cap is configurable and an image under it is accepted", async () => {
  const source = await orientedPhotoJpeg({ width: 1000, height: 1000, orientation: 1 });
  await assert.rejects(
    () => optimizeImageUpload(source, { settings: imageOptimizationFromEnv({ MS_REALTY_IMAGE_MAX_PIXELS: "500000" }) }),
    (error) => error.code === "image_dimensions_too_large",
  );
  const accepted = await optimizeImageUpload(source, {
    settings: imageOptimizationFromEnv({ MS_REALTY_IMAGE_MAX_PIXELS: "2000000" }),
  });
  assert.equal(accepted.width, 1000);
});

/* ------------------------------------------------ the sanitiser's contract */

test("the sanitiser's guarantees still hold for the optimised bytes", async () => {
  // The optimiser is not allowed to be a way around the strip. Everything the
  // sanitiser promises about a stored upload must be true of its output.
  const carriesGps = jpegWithGpsExif();
  assert.ok(carriesGps.includes(EXIF_MARKER), "the fixture really does carry EXIF");
  assert.ok(carriesGps.includes(GPS_LATITUDE_REF_TAG), "the fixture really does carry a GPS tag");

  const result = await optimizeImageUpload(carriesGps, { filename: "kitchen.jpg" });
  assert.equal(result.bytes.includes(EXIF_MARKER), false, "no EXIF header may survive optimisation");
  assert.equal(result.metadata_verified_absent, true);
  assert.equal(result.metadata_stripped, true);

  // Re-running the sanitiser over the stored bytes must find nothing to do and
  // must still recognise them as a real image of the recorded type.
  const again = sanitizeImageUpload(result.bytes);
  assert.equal(again.format, result.format);
  assert.equal(again.metadata_removed_bytes, 0);
  assert.deepEqual(again.bytes, result.bytes);
});

test("an EXIF-bearing photo loses its metadata even when the bytes are kept unoptimised", async () => {
  // The WebP fixture's EXIF is stripped by the byte-level pass, which beats
  // anything re-encoding would save. The metadata must still be gone.
  const result = await optimizeImageUpload(tinyJpeg());
  assert.equal(result.bytes.includes(EXIF_MARKER), false);
  assert.equal(result.metadata_verified_absent, true);
});

test("a file that is not an image is refused with the sanitiser's message", async () => {
  await assert.rejects(
    () => optimizeImageUpload(textFileNamedJpg(), { filename: "photo.jpg", declaredType: "image/jpeg" }),
    (error) => {
      assert.equal(error.code, "unsupported_image_type");
      assert.match(error.message, /read from the bytes/);
      return true;
    },
  );
});

test("a file with an image header but an undecodable body is refused", async () => {
  const corrupt = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(64, 0x41)]);
  await assert.rejects(
    () => optimizeImageUpload(corrupt, { filename: "broken.jpg" }),
    (error) => {
      assert.equal(error.code, "unsupported_image_type");
      assert.match(error.message, /could not be decoded/);
      return true;
    },
  );
});

/* -------------------------------------------------------------------- AVIF */

test("AVIF is passed through, and one carrying metadata is still refused", async () => {
  // Decoding AVIF here would quietly convert the sanitiser's refusal into an
  // acceptance, so the passthrough is the behaviour under test.
  const clean = await optimizeImageUpload(avifWithoutMetadata());
  assert.equal(clean.format, "avif");
  assert.equal(clean.optimized, false);
  assert.equal(clean.rendition, null);
  assert.deepEqual(clean.bytes, avifWithoutMetadata());

  await assert.rejects(
    () => optimizeImageUpload(avifWithExif()),
    (error) => {
      assert.equal(error.code, "image_metadata_refused");
      return true;
    },
  );
});
