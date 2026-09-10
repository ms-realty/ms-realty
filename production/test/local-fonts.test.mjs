import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";
import { FONTS_URL, FONTS_URL_HEBREW } from "../lib/ui/design-assets.mjs";

test("same-origin font subsets retain their bytes, content hashes and immutable delivery", async () => {
  const app = createHttpApp();
  const shortHash = bytes => createHash("sha256").update(bytes).digest("hex").slice(0, 12);
  assert.equal(FONTS_URL, FONTS_URL_HEBREW, "native unicode ranges select the required script");
  assert.match(FONTS_URL, /^\/vendor\/ms-realty-fonts\.css\?v=[a-f0-9]{12}$/);
  const sheet = await dispatchHttp(app, { method: "GET", url: FONTS_URL });
  assert.equal(sheet.status, 200);
  assert.ok(FONTS_URL.includes(shortHash(sheet.body)));
  assert.doesNotMatch(sheet.body, /https?:|@import/);
  for (const family of ["Commissioner", "Sofia Sans Semi Condensed", "Noto Sans Hebrew"]) {
    assert.ok(sheet.body.includes(`font-family: '${family}'`));
  }
  for (const face of sheet.body.matchAll(/@font-face\s*\{([^}]+)\}/g)) {
    assert.match(face[1], /font-display: swap/);
    assert.match(face[1], /unicode-range:/);
    const url = /url\(([^)]+)\)/.exec(face[1])[1];
    assert.match(url, /^\/vendor\/[a-z0-9-]+\.woff2$/);
    const response = await dispatchHttp(app, { method: "GET", url });
    const bytes = readFileSync(new URL("../../public" + url, import.meta.url));
    assert.equal(response.status, 200, url);
    assert.equal(response.headers["content-type"], "font/woff2");
    assert.match(response.headers["cache-control"], /immutable/);
    assert.ok(Buffer.isBuffer(response.body), "fonts must not be UTF-8 decoded");
    assert.deepEqual(response.body, bytes);
    assert.equal(bytes.subarray(0, 4).toString(), "wOF2");
    assert.ok(url.includes(shortHash(bytes)), "immutable filename matches its content");
  }
});
