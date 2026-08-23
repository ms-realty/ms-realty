// Image type sniffing and in-process metadata stripping for uploaded photos.
//
// Two hard rules, both of which exist because the uploader is not trusted:
//
// 1. The stored type comes from the bytes. A filename and a client-declared
//    `content-type` are both free text; `photo.jpg` carrying a shell script is
//    the oldest upload attack there is, so the extension we store is derived
//    from the magic bytes and nothing else.
// 2. A seller's photo carries their home's GPS coordinates in EXIF. Storing
//    that would publish a private address through an image nobody reviewed for
//    it. JPEG, PNG and WebP metadata is stripped here, in process, with no
//    dependency; AVIF metadata lives inside the ISOBMFF item tree where a safe
//    in-place rewrite is not something to improvise, so an AVIF that carries
//    Exif or XMP is refused rather than stored.
//
// Stripping is deliberately blunt: everything that can carry EXIF, XMP, IPTC or
// a free-text comment is removed. Only colour-rendering data (JFIF density, ICC
// profile, gamma/chromaticity) survives, because dropping it changes how the
// photo looks without making it any safer.

const JPEG = Buffer.from([0xff, 0xd8, 0xff]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const RIFF = Buffer.from("RIFF");
const WEBP = Buffer.from("WEBP");
const EXIF_MARKER = Buffer.from("Exif\u0000\u0000", "latin1");

export const ALLOWED_IMAGE_FORMATS = Object.freeze(["jpeg", "png", "webp", "avif"]);

const FORMAT_DETAILS = Object.freeze({
  jpeg: { ext: "jpg", mime: "image/jpeg" },
  png: { ext: "png", mime: "image/png" },
  webp: { ext: "webp", mime: "image/webp" },
  avif: { ext: "avif", mime: "image/avif" },
});

export class UnsupportedImageError extends Error {
  constructor(message) {
    super(message);
    this.name = "UnsupportedImageError";
    this.code = "unsupported_image_type";
  }
}

export class ImageMetadataError extends Error {
  constructor(message) {
    super(message);
    this.name = "ImageMetadataError";
    this.code = "image_metadata_refused";
  }
}

function isAvif(bytes) {
  if (bytes.length < 16) return false;
  if (bytes.slice(4, 8).toString("latin1") !== "ftyp") return false;
  const boxSize = bytes.readUInt32BE(0);
  const end = Math.min(boxSize > 8 ? boxSize : bytes.length, bytes.length);
  const brands = bytes.slice(8, end).toString("latin1");
  return /avif|avis/.test(brands);
}

export function sniffImageFormat(bytes) {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes || []);
  if (buffer.length < 12) return null;
  if (buffer.slice(0, 3).equals(JPEG)) return { format: "jpeg", ...FORMAT_DETAILS.jpeg };
  if (buffer.slice(0, 8).equals(PNG)) return { format: "png", ...FORMAT_DETAILS.png };
  if (buffer.slice(0, 4).equals(RIFF) && buffer.slice(8, 12).equals(WEBP)) return { format: "webp", ...FORMAT_DETAILS.webp };
  if (isAvif(buffer)) return { format: "avif", ...FORMAT_DETAILS.avif };
  return null;
}

/* ------------------------------------------------------------------ JPEG */

// APP0 is JFIF density; APP2 with an ICC_PROFILE payload is a colour profile.
// Both are rendering data with no author, location or device in them.
function jpegSegmentIsSafe(marker, payload) {
  if (marker === 0xe0) return true;
  if (marker === 0xe2) return payload.slice(0, 12).toString("latin1") === "ICC_PROFILE\u0000";
  return marker < 0xe0 || marker > 0xef ? marker !== 0xfe : false;
}

function stripJpeg(bytes) {
  const kept = [bytes.slice(0, 2)];
  let cursor = 2;
  let removed = 0;
  while (cursor + 4 <= bytes.length) {
    if (bytes[cursor] !== 0xff) throw new ImageMetadataError("JPEG upload is malformed and cannot be sanitised");
    let marker = bytes[cursor + 1];
    let markerStart = cursor;
    // Fill bytes (0xFF padding) are legal between segments.
    while (marker === 0xff && markerStart + 2 < bytes.length) {
      markerStart += 1;
      marker = bytes[markerStart + 1];
    }
    if (marker === 0xd9) {
      kept.push(bytes.slice(markerStart));
      return { bytes: Buffer.concat(kept), removed };
    }
    if (marker === 0xda) {
      // Start of scan: the entropy-coded stream runs to the end of the file.
      kept.push(bytes.slice(markerStart));
      return { bytes: Buffer.concat(kept), removed };
    }
    const lengthOffset = markerStart + 2;
    if (lengthOffset + 2 > bytes.length) throw new ImageMetadataError("JPEG upload ends inside a segment header");
    const length = bytes.readUInt16BE(lengthOffset);
    if (length < 2 || lengthOffset + length > bytes.length) {
      throw new ImageMetadataError("JPEG upload declares a segment longer than the file");
    }
    const payload = bytes.slice(lengthOffset + 2, lengthOffset + length);
    if (jpegSegmentIsSafe(marker, payload)) kept.push(bytes.slice(markerStart, lengthOffset + length));
    else removed += length + 2;
    cursor = lengthOffset + length;
  }
  throw new ImageMetadataError("JPEG upload has no image scan");
}

/* ------------------------------------------------------------------- PNG */

// eXIf is EXIF verbatim; tEXt/zTXt/iTXt carry XMP and free text; tIME is a
// capture timestamp. Everything else in a PNG is pixels or colour handling.
const PNG_METADATA_CHUNKS = new Set(["eXIf", "tEXt", "zTXt", "iTXt", "tIME"]);

function stripPng(bytes) {
  const kept = [bytes.slice(0, 8)];
  let cursor = 8;
  let removed = 0;
  let sawEnd = false;
  while (cursor + 8 <= bytes.length) {
    const length = bytes.readUInt32BE(cursor);
    if (length > bytes.length) throw new ImageMetadataError("PNG upload declares a chunk longer than the file");
    const type = bytes.slice(cursor + 4, cursor + 8).toString("latin1");
    const end = cursor + 12 + length;
    if (end > bytes.length) throw new ImageMetadataError("PNG upload ends inside a chunk");
    if (PNG_METADATA_CHUNKS.has(type)) removed += length + 12;
    else kept.push(bytes.slice(cursor, end));
    cursor = end;
    if (type === "IEND") {
      sawEnd = true;
      break;
    }
  }
  if (!sawEnd) throw new ImageMetadataError("PNG upload has no IEND chunk");
  return { bytes: Buffer.concat(kept), removed };
}

/* ------------------------------------------------------------------ WebP */

const WEBP_METADATA_CHUNKS = new Set(["EXIF", "XMP "]);

function stripWebp(bytes) {
  const declared = bytes.readUInt32LE(4);
  const end = Math.min(8 + declared, bytes.length);
  const kept = [];
  let cursor = 12;
  let removed = 0;
  while (cursor + 8 <= end) {
    const fourcc = bytes.slice(cursor, cursor + 4).toString("latin1");
    const size = bytes.readUInt32LE(cursor + 4);
    const padded = size + (size % 2);
    const chunkEnd = cursor + 8 + padded;
    if (chunkEnd > bytes.length) throw new ImageMetadataError("WebP upload ends inside a chunk");
    if (WEBP_METADATA_CHUNKS.has(fourcc)) {
      removed += padded + 8;
    } else if (fourcc === "VP8X") {
      // VP8X flags bit 3 marks an EXIF chunk and bit 2 an XMP chunk; both are
      // about to be gone, so the header must stop advertising them.
      const chunk = Buffer.from(bytes.slice(cursor, chunkEnd));
      chunk[8] &= ~0b0000_1100;
      kept.push(chunk);
    } else {
      kept.push(bytes.slice(cursor, chunkEnd));
    }
    cursor = chunkEnd;
  }
  if (!kept.length) throw new ImageMetadataError("WebP upload contains no image data");
  const payload = Buffer.concat(kept);
  const header = Buffer.alloc(12);
  RIFF.copy(header, 0);
  header.writeUInt32LE(payload.length + 4, 4);
  WEBP.copy(header, 8);
  return { bytes: Buffer.concat([header, payload]), removed };
}

/* ------------------------------------------------------------------ AVIF */

function boxHeader(bytes, offset) {
  if (offset + 8 > bytes.length) return null;
  const size32 = bytes.readUInt32BE(offset);
  const type = bytes.slice(offset + 4, offset + 8).toString("latin1");
  if (size32 === 1) {
    if (offset + 16 > bytes.length) return null;
    const high = bytes.readUInt32BE(offset + 8);
    const low = bytes.readUInt32BE(offset + 12);
    if (high !== 0) return null;
    return { type, headerSize: 16, size: low };
  }
  const size = size32 === 0 ? bytes.length - offset : size32;
  if (size < 8) return null;
  return { type, headerSize: 8, size };
}

function avifItemTypes(bytes) {
  const types = [];
  let cursor = 0;
  let meta = null;
  while (cursor < bytes.length) {
    const box = boxHeader(bytes, cursor);
    if (!box) break;
    if (box.type === "meta") {
      meta = bytes.slice(cursor + box.headerSize + 4, cursor + box.size);
      break;
    }
    cursor += box.size;
  }
  if (!meta) return types;
  let inner = 0;
  while (inner < meta.length) {
    const box = boxHeader(meta, inner);
    if (!box) break;
    if (box.type === "iinf") {
      const version = meta[inner + box.headerSize];
      const countSize = version === 0 ? 2 : 4;
      let entry = inner + box.headerSize + 4 + countSize;
      const end = inner + box.size;
      while (entry < end) {
        const infe = boxHeader(meta, entry);
        if (!infe) break;
        if (infe.type === "infe") {
          const infeVersion = meta[entry + infe.headerSize];
          const idSize = infeVersion >= 3 ? 4 : 2;
          const typeAt = entry + infe.headerSize + 4 + idSize + 2;
          if (typeAt + 4 <= meta.length) types.push(meta.slice(typeAt, typeAt + 4).toString("latin1"));
        }
        entry += infe.size;
      }
      break;
    }
    inner += box.size;
  }
  return types;
}

function inspectAvif(bytes) {
  let types;
  try {
    types = avifItemTypes(bytes);
  } catch {
    throw new ImageMetadataError("AVIF upload could not be inspected for embedded metadata");
  }
  // `Exif` is EXIF (and therefore possibly GPS); `mime` items are XMP, which
  // also carries location. Neither can be removed here without rewriting the
  // item location table, so the upload is refused instead of stored.
  if (types.some((type) => type === "Exif" || type === "mime")) {
    throw new ImageMetadataError(
      "AVIF upload carries embedded Exif or XMP metadata that cannot be stripped in process. Re-export the photo without metadata, or upload it as JPEG, PNG, or WebP.",
    );
  }
  return { bytes, removed: 0 };
}

/* -------------------------------------------------------------- entrypoint */

export function sanitizeImageUpload(input, { declaredType = "", filename = "" } = {}) {
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input || []);
  if (!bytes.length) throw new UnsupportedImageError("Upload is empty");
  const sniffed = sniffImageFormat(bytes);
  if (!sniffed) {
    throw new UnsupportedImageError(
      `Upload is not a JPEG, PNG, WebP, or AVIF image. The file type is read from the bytes, not from ${
        filename ? `the name "${String(filename).slice(0, 64)}"` : "the file name"
      }${declaredType ? ` or the declared type "${String(declaredType).slice(0, 64)}"` : ""}.`,
    );
  }

  const stripped =
    sniffed.format === "jpeg"
      ? stripJpeg(bytes)
      : sniffed.format === "png"
        ? stripPng(bytes)
        : sniffed.format === "webp"
          ? stripWebp(bytes)
          : inspectAvif(bytes);

  // Belt and braces: if an EXIF header survived the rewrite, refuse rather than
  // store a photo whose coordinates we believed we had removed.
  if (sniffed.format !== "avif" && stripped.bytes.includes(EXIF_MARKER)) {
    throw new ImageMetadataError("Upload still contains EXIF metadata after sanitising and was refused");
  }
  if (!stripped.bytes.length) throw new ImageMetadataError("Sanitising the upload produced an empty image");

  return {
    format: sniffed.format,
    ext: sniffed.ext,
    mime: sniffed.mime,
    bytes: stripped.bytes,
    original_bytes: bytes.length,
    stored_bytes: stripped.bytes.length,
    metadata_removed_bytes: stripped.removed,
    metadata_stripped: sniffed.format !== "avif",
    metadata_verified_absent: true,
  };
}
