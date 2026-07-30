import fs from "node:fs";
import path from "node:path";
import { fromRoot } from "../lib/paths.mjs";

// Self-hosts the webfonts.
//
// Embedding fonts.googleapis.com sends every EU visitor's IP to Google on page
// load; German courts have found that to violate GDPR without consent, and DE
// and NL are target locales. It is also a render-blocking third-party request
// on the phone-first path this product is designed around.
//
// Downloads the Google Fonts CSS with a modern-browser UA (so it returns woff2),
// rewrites every font URL to a local path, and stores the result under
// public/vendor/fonts/. The build then prefers the local stylesheet.
//
// Usage: node production/scripts/build-self-hosted-fonts.mjs

const FONTS_DIR = fromRoot("public", "vendor", "fonts");
const STYLESHEET = path.join(FONTS_DIR, "fonts.css");
// Chrome UA: Google serves woff2 + unicode-range subsets to modern browsers.
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function sourceUrl() {
  const tokens = fs.readFileSync(fromRoot("makler-realty-design-system", "project", "tokens", "fonts.css"), "utf8");
  const match = tokens.match(/@import\s+url\(['"]([^'"]+)['"]\)/);
  if (!match) throw new Error("tokens/fonts.css must contain the webfont @import url");
  return match[1];
}

const upstream = process.env.MS_REALTY_FONTS_SOURCE_URL || sourceUrl();
const response = await fetch(upstream, { headers: { "user-agent": UA } });
if (!response.ok) throw new Error(`Font stylesheet fetch failed: HTTP ${response.status}`);
let css = await response.text();

fs.mkdirSync(FONTS_DIR, { recursive: true });
const assets = [...new Set([...css.matchAll(/url\((https:\/\/[^)]+)\)/g)].map((match) => match[1]))];
console.log(`Fetching ${assets.length} font files from ${new URL(upstream).host}...`);

let downloaded = 0;
for (const assetUrl of assets) {
  const name = path.basename(new URL(assetUrl).pathname);
  const target = path.join(FONTS_DIR, name);
  if (!fs.existsSync(target)) {
    const asset = await fetch(assetUrl, { headers: { "user-agent": UA } });
    if (!asset.ok) throw new Error(`Font file fetch failed (${name}): HTTP ${asset.status}`);
    fs.writeFileSync(target, Buffer.from(await asset.arrayBuffer()));
    downloaded += 1;
  }
  css = css.replaceAll(assetUrl, `/vendor/fonts/${name}`);
}

fs.writeFileSync(
  STYLESHEET,
  `/* Self-hosted from ${upstream}. Regenerate: node production/scripts/build-self-hosted-fonts.mjs */\n${css}`,
);
console.log(`Wrote ${STYLESHEET} (${downloaded} new files, ${assets.length} referenced).`);
console.log("Run npm run design:build so FONTS_URL points at the local stylesheet.");
