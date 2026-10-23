// Captured, already-public source photos may be mirrored only in protected staging.
// This derives identities; it grants no rights, publication or translation approval.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const types = new Map([
  ["image/jpeg", /\.jpe?g$/i],
  ["image/png", /\.png$/i],
  ["image/gif", /\.gif$/i],
  ["image/webp", /\.webp$/i],
]);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
export function capturedSourceMedia(report, pages) {
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.scope, "protected_staging_source_media");
  assert.equal(report.productionAllowed, false);
  assert(Array.isArray(report.objects));
  const observed = new Map();
  for (const page of pages)
    for (const photo of page.media ?? []) {
      const source = new URL(photo.url);
      if (source.search || source.hash || source.username || source.password) continue;
      const key = `${source.hostname}${decodeURIComponent(source.pathname)}`;
      if (!observed.has(key)) observed.set(key, new Set());
      observed.get(key).add(page.id);
    }
  const keys = new Set();
  return report.objects.map((object) => {
    const url = new URL(object.requestUrl),
      path = decodeURIComponent(url.pathname);
    assert.equal(url.protocol, "https:");
    assert(["makler-realty.com", "makler-realty.ru"].includes(url.hostname));
    assert(!url.username && !url.password && !url.port && !url.search && !url.hash);
    assert(path.startsWith("/wp-content/uploads/"));
    // biome-ignore lint/suspicious/noControlCharactersInRegex: object identities reject controls.
    assert(!/[\\\u0000-\u001f]/.test(path) && !/%2f|%5c/i.test(url.pathname));
    assert.equal(object.key, `${url.hostname}${path}`);
    assert(observed.has(object.key), "Photo must occur in a captured source page");
    assert(!keys.has(object.key), "Duplicate captured object");
    keys.add(object.key);
    assert.equal(object.status, 200);
    assert.equal(object.hostAndSniPreserved, true);
    assert.equal(object.sslVerifyResult, 0);
    assert.equal(object.requestMethod, "GET");
    assert(
      Number.isSafeInteger(object.bytes) && object.bytes > 0 && object.bytes <= 25 * 1024 * 1024,
    );
    assert(/^[a-f0-9]{64}$/.test(object.sha256));
    assert(types.get(object.contentType)?.test(path), "Recorded image type must match its path");
    assert(/^[a-f0-9]{24,64}$/.test(object.headerPrefixHex));
    const prefix = Buffer.from(object.headerPrefixHex, "hex");
    const signature =
      object.contentType === "image/jpeg"
        ? prefix.subarray(0, 3).toString("hex") === "ffd8ff"
        : object.contentType === "image/png"
          ? prefix.subarray(0, 8).toString("hex") === "89504e470d0a1a0a"
          : object.contentType === "image/gif"
            ? /^GIF8[79]a$/.test(prefix.subarray(0, 6).toString("ascii"))
            : prefix.subarray(0, 4).toString("ascii") === "RIFF" &&
              prefix.subarray(8, 12).toString("ascii") === "WEBP";
    assert(signature, "Captured bytes must carry the recorded raster signature");
    assert.equal(
      object.sourcePageSetSha256,
      sha256(JSON.stringify([...observed.get(object.key)].sort())),
    );
    return { host: url.hostname, path, key: object.key };
  });
}
