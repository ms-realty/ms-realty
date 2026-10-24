import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { capturedSourceMedia } from "./legacy-media-sources.mjs";

const pages = [
  { id: "source-page", media: [{ url: "http://makler-realty.ru/wp-content/uploads/exact.jpg" }] },
];
const object = {
  requestUrl: "https://makler-realty.ru/wp-content/uploads/exact.jpg",
  key: "makler-realty.ru/wp-content/uploads/exact.jpg",
  status: 200,
  hostAndSniPreserved: true,
  sslVerifyResult: 0,
  requestMethod: "GET",
  bytes: 20,
  sha256: "a".repeat(64),
  contentType: "image/jpeg",
  headerPrefixHex: "ffd8ffe000104a464946000101000001",
  sourcePageSetSha256: createHash("sha256")
    .update(JSON.stringify(["source-page"]))
    .digest("hex"),
};
const report = (...objects) => ({
  schemaVersion: 1,
  scope: "protected_staging_source_media",
  productionAllowed: false,
  objects,
});

test("derives the same exact object identity from a recorded HTTP spelling and strict HTTPS capture", () => {
  assert.deepEqual(capturedSourceMedia(report(object), pages), [
    { host: "makler-realty.ru", path: "/wp-content/uploads/exact.jpg", key: object.key },
  ]);
});
test("refuses unobserved, foreign, escaped-separator, query and credential-bearing source identities", () => {
  for (const requestUrl of [
    "https://foreign.invalid/wp-content/uploads/exact.jpg",
    "https://makler-realty.ru/private/exact.jpg",
    "https://makler-realty.ru/wp-content/uploads/a%2fexact.jpg",
    "https://makler-realty.ru/wp-content/uploads/exact.jpg?other=1",
    "https://operator@makler-realty.ru/wp-content/uploads/exact.jpg",
  ])
    assert.throws(() => capturedSourceMedia(report({ ...object, requestUrl }), pages));
  assert.throws(() => capturedSourceMedia(report(object), []));
  assert.throws(() =>
    capturedSourceMedia(report(object), [
      { id: "source-page", media: [{ url: `${pages[0].media[0].url}?different=1` }] },
    ]),
  );
});
test("does not accept incomplete byte, transport or source-page evidence", () => {
  for (const replacement of [
    { status: 404 },
    { sslVerifyResult: 1 },
    { hostAndSniPreserved: false },
    { requestMethod: "POST" },
    { bytes: 0 },
    { sha256: "unknown" },
    { headerPrefixHex: "3c68746d6c3e" },
    { contentType: "text/html" },
    { sourcePageSetSha256: "b".repeat(64) },
  ])
    assert.throws(() => capturedSourceMedia(report({ ...object, ...replacement }), pages));
});
test("never broadens scope, grants production authority or admits duplicate keys", () => {
  assert.throws(() => capturedSourceMedia({ ...report(object), productionAllowed: true }, pages));
  assert.throws(() => capturedSourceMedia({ ...report(object), scope: "production" }, pages));
  assert.throws(() => capturedSourceMedia(report(object, object), pages));
});
