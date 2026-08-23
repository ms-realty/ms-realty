// Synthetic image fixtures for the photo upload tests.
//
// The point of these builders is that the bytes are constructed here, so a test
// can say exactly what it is asserting: "this JPEG really does carry a GPS
// coordinate, and after sanitising it does not".

const TINY_JPEG_BASE64 =
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a" +
  "HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIy" +
  "MjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIA" +
  "AhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQA" +
  "AAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3" +
  "ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWm" +
  "p6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEA" +
  "AwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSEx" +
  "BhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElK" +
  "U1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3" +
  "uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iii" +
  "gD//2Q==";

export function tinyJpeg() {
  return Buffer.from(TINY_JPEG_BASE64, "base64");
}

/* ------------------------------------------------------------- EXIF (GPS) */

function ifdEntry(tag, type, count, valueBytes) {
  const entry = Buffer.alloc(12);
  entry.writeUInt16BE(tag, 0);
  entry.writeUInt16BE(type, 2);
  entry.writeUInt32BE(count, 4);
  valueBytes.copy(entry, 8, 0, Math.min(4, valueBytes.length));
  return entry;
}

// A real (little-effort but structurally correct) EXIF block: IFD0 points at a
// GPS IFD holding a latitude reference and a latitude in degrees/minutes/
// seconds. This is exactly the payload a phone writes into a seller's photo.
export function gpsExifPayload() {
  const header = Buffer.alloc(8);
  header.write("MM", 0, "latin1");
  header.writeUInt16BE(0x002a, 2);
  header.writeUInt32BE(8, 4);

  const gpsOffsetPlaceholder = Buffer.alloc(4);
  const ifd0 = Buffer.concat([
    Buffer.from([0x00, 0x01]),
    ifdEntry(0x8825, 4, 1, gpsOffsetPlaceholder),
    Buffer.alloc(4),
  ]);

  const latitude = Buffer.alloc(24);
  // 41 deg 34 min 12 s — Sandanski, as a rational triplet.
  latitude.writeUInt32BE(41, 0);
  latitude.writeUInt32BE(1, 4);
  latitude.writeUInt32BE(34, 8);
  latitude.writeUInt32BE(1, 12);
  latitude.writeUInt32BE(12, 16);
  latitude.writeUInt32BE(1, 20);

  const gpsIfdStart = 8 + ifd0.length;
  const gpsEntries = 3;
  const gpsIfdSize = 2 + gpsEntries * 12 + 4;
  const latitudeOffset = gpsIfdStart + gpsIfdSize;

  const latitudeRef = Buffer.from("N\u0000\u0000\u0000", "latin1");
  const longitudeRef = Buffer.from("E\u0000\u0000\u0000", "latin1");
  const latitudePointer = Buffer.alloc(4);
  latitudePointer.writeUInt32BE(latitudeOffset, 0);

  const gpsIfd = Buffer.concat([
    Buffer.from([0x00, gpsEntries]),
    ifdEntry(0x0001, 2, 2, latitudeRef),
    ifdEntry(0x0002, 5, 3, latitudePointer),
    ifdEntry(0x0003, 2, 2, longitudeRef),
    Buffer.alloc(4),
  ]);

  ifd0.writeUInt32BE(gpsIfdStart, 2 + 8);
  return Buffer.concat([header, ifd0, gpsIfd, latitude]);
}

export function jpegWithGpsExif() {
  const base = tinyJpeg();
  const exif = Buffer.concat([Buffer.from("Exif\u0000\u0000", "latin1"), gpsExifPayload()]);
  const segment = Buffer.alloc(4);
  segment[0] = 0xff;
  segment[1] = 0xe1;
  segment.writeUInt16BE(exif.length + 2, 2);
  // APP1 goes directly after SOI so the JPEG stays valid.
  return Buffer.concat([base.slice(0, 2), segment, exif, base.slice(2)]);
}

/* -------------------------------------------------------------------- PNG */

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typed = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed), 0);
  return Buffer.concat([length, typed, crc]);
}

const TINY_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

export function tinyPng() {
  return Buffer.from(TINY_PNG_BASE64, "base64");
}

export function pngWithGpsExif() {
  const base = tinyPng();
  const iend = base.length - 12;
  return Buffer.concat([
    base.slice(0, iend),
    pngChunk("eXIf", gpsExifPayload()),
    pngChunk("tEXt", Buffer.from("Author\u0000Seller Name", "latin1")),
    base.slice(iend),
  ]);
}

/* ------------------------------------------------------------------- WebP */

function riffChunk(fourcc, data) {
  const header = Buffer.alloc(8);
  header.write(fourcc, 0, "latin1");
  header.writeUInt32LE(data.length, 4);
  const padding = data.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0);
  return Buffer.concat([header, data, padding]);
}

// An extended (VP8X) WebP whose header advertises EXIF, carrying a GPS block.
export function webpWithGpsExif() {
  const vp8x = Buffer.alloc(10);
  vp8x[0] = 0b0000_1000; // EXIF flag
  vp8x.writeUIntLE(0, 4, 3); // canvas width - 1
  vp8x.writeUIntLE(0, 7, 3); // canvas height - 1
  const payload = Buffer.concat([
    riffChunk("VP8X", vp8x),
    riffChunk("VP8L", Buffer.from([0x2f, 0x00, 0x00, 0x00, 0x00, 0x88, 0x88, 0x08])),
    riffChunk("EXIF", gpsExifPayload()),
  ]);
  const header = Buffer.alloc(12);
  header.write("RIFF", 0, "latin1");
  header.writeUInt32LE(payload.length + 4, 4);
  header.write("WEBP", 8, "latin1");
  return Buffer.concat([header, payload]);
}

/* ------------------------------------------------------------------- AVIF */

function box(type, payload) {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(payload.length + 8, 0);
  header.write(type, 4, "latin1");
  return Buffer.concat([header, payload]);
}

function infe(itemId, itemType) {
  const payload = Buffer.concat([
    Buffer.from([2, 0, 0, 0]), // version 2, flags 0
    Buffer.from([(itemId >> 8) & 0xff, itemId & 0xff]),
    Buffer.from([0, 0]),
    Buffer.from(itemType, "latin1"),
    Buffer.from("item\u0000", "latin1"),
  ]);
  return box("infe", payload);
}

function avif(itemTypes) {
  const ftyp = box("ftyp", Buffer.from("avifavifmif1miaf", "latin1"));
  const entries = itemTypes.map((type, index) => infe(index + 1, type));
  const iinf = box(
    "iinf",
    Buffer.concat([Buffer.from([0, 0, 0, 0]), Buffer.from([0, itemTypes.length]), ...entries]),
  );
  const meta = box("meta", Buffer.concat([Buffer.from([0, 0, 0, 0]), iinf]));
  return Buffer.concat([ftyp, meta, box("mdat", Buffer.from([0, 1, 2, 3]))]);
}

export function avifWithoutMetadata() {
  return avif(["av01"]);
}

export function avifWithExif() {
  return avif(["av01", "Exif"]);
}

/* ----------------------------------------------------------- not an image */

export function textFileNamedJpg() {
  return Buffer.from("This is a plain text file that has simply been renamed to photo.jpg.\n", "utf8");
}

/* ------------------------------------------------------- multipart request */

export function multipartBody(parts, boundary = "----MSRealtyTestBoundary") {
  const chunks = [];
  for (const part of parts) {
    const disposition = part.filename
      ? `form-data; name="${part.name}"; filename="${part.filename}"`
      : `form-data; name="${part.name}"`;
    const headers =
      `--${boundary}\r\nContent-Disposition: ${disposition}\r\n` +
      (part.contentType ? `Content-Type: ${part.contentType}\r\n` : "") +
      "\r\n";
    chunks.push(Buffer.from(headers, "latin1"));
    chunks.push(Buffer.isBuffer(part.value) ? part.value : Buffer.from(String(part.value), "utf8"));
    chunks.push(Buffer.from("\r\n", "latin1"));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`, "latin1"));
  return { body: Buffer.concat(chunks), contentType: `multipart/form-data; boundary=${boundary}` };
}
