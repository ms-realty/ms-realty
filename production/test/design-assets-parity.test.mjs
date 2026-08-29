import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ADMIN_CLIENT_HASH,
  ADMIN_CSS_HASH,
  FONTS_URL,
} from "../lib/ui/design-assets.mjs";
import { ADMIN_APP_JS } from "../lib/ui/client.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function shortHash(value) {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function generatedBody(file, headerPattern) {
  const source = fs.readFileSync(path.join(ROOT, file), "utf8");
  const header = source.match(headerPattern)?.[0];
  assert.ok(header, `${file} has its generated header`);
  return source.slice(header.length).trim();
}

test("admin generated assets agree with their source and exported cache hashes", () => {
  const bundledJavaScript = generatedBody("public/vendor/ms-realty-admin.js", /^\/\/ GENERATED[^\n]*\n(?:\/\/[^\n]*\n){2}/);
  const bundledCss = generatedBody("public/vendor/ms-realty-admin.css", /^\/\* GENERATED[\s\S]*?\*\/\n/);

  assert.equal(shortHash(ADMIN_APP_JS), ADMIN_CLIENT_HASH, "source JS matches exported hash");
  assert.equal(shortHash(bundledJavaScript), ADMIN_CLIENT_HASH, "browser JS matches exported hash");
  assert.equal(shortHash(bundledCss + FONTS_URL), ADMIN_CSS_HASH, "browser CSS matches exported hash");
});
