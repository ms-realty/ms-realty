#!/usr/bin/env node
// Generates production/lib/ui/design-assets.mjs, production/lib/ui/icon-data.mjs,
// and the versioned browser bundles under public/vendor/
// from the makler-realty-design-system sources, so the design system stays the
// single source of truth. Re-run after any change under makler-realty-design-system/.
//
//   npm run design:build
//
// Inputs:
//   makler-realty-design-system/project/tokens/*.css   (token layers, fonts URL)
//   makler-realty-design-system/project/components/**  (mk-* component CSS blocks)
//   makler-realty-design-system/project/ui_kits/**     (website + crm kit CSS blocks)
//   makler-realty-design-system/project/components/general/Logo.jsx (embedded logo data URIs)
//   production/lib/ui/adapter.css                      (production-only adaptations, hand-written)
//   production/lib/ui/client.mjs                        (public and admin progressive enhancement)
//   node_modules/lucide-static/icons/*.svg             (icon vectors, build-time only)

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ADMIN_APP_JS, PUBLIC_APP_JS } from "../lib/ui/client.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DS = path.join(ROOT, "makler-realty-design-system", "project");
const OUT_DIR = path.join(ROOT, "production", "lib", "ui");
const VENDOR_DIR = path.join(ROOT, "public", "vendor");

// Order mirrors makler-realty-design-system/project/styles.css (fonts.css becomes a <link>).
const TOKEN_FILES = ["colors.css", "typography.css", "spacing.css", "radius.css", "shadows.css", "motion.css", "media.css", "base.css"];

// Icons the production UI renders statically. Lucide is the DS's documented
// substitute icon set (components/general/Icon.jsx).
const ICON_NAMES = [
  "arrow-down-right", "arrow-left", "arrow-right", "arrow-up-right", "banknote", "bar-chart-3",
  "bath", "bed", "bell", "building-2", "calendar", "calendar-check", "calendar-days",
  "calculator", "calendar-plus", "camera", "check", "check-check", "check-circle-2", "chevron-down",
  "chevron-left", "chevron-right", "chevron-up", "circle", "circle-alert", "circle-check",
  "clock", "columns-3", "compass", "contact", "download", "external-link", "eye", "file-check", "file-text",
  "filter", "flame", "globe", "handshake", "heart", "home", "house", "inbox", "info",
  "kanban-square", "key", "landmark", "languages", "layout-dashboard", "layout-grid", "link",
  "list", "list-checks", "loader-circle", "mail", "map", "map-pin", "menu", "message-circle",
  "messages-square", "minus", "monitor", "moon", "pause", "pencil", "percent", "phone", "pin", "play", "plus",
  "printer", "ruler", "search", "search-x", "send", "settings", "share-2", "shield-check",
  "sliders-horizontal", "sparkles", "star", "sun", "table-properties", "trash-2", "trending-up",
  "triangle-alert", "upload", "user", "user-round", "users", "wallet", "x",
];

function read(file) {
  return readFileSync(file, "utf8");
}

function stripCssComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

function minifyCss(css) {
  return stripCssComments(css)
    .replace(/\s+/g, " ")
    .replace(/\s*([{}:;,>])\s*/g, "$1")
    .replace(/;}/g, "}")
    .trim();
}

function extractCssBlocks(source) {
  // Matches `const CSS = \`...\`` and `const xxxCss = \`...\`` (DS convention).
  const blocks = [];
  const pattern = /const\s+(?:CSS|\w+Css)\s*=\s*`([\s\S]*?)`;?\n/g;
  for (const match of source.matchAll(pattern)) blocks.push(match[1]);
  return blocks;
}

function jsxFilesUnder(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (entry.isFile() && entry.name.endsWith(".jsx")) {
      files.push(path.join(entry.parentPath ?? entry.path, entry.name));
    }
  }
  return files.sort();
}

function fontsUrl() {
  const source = read(path.join(DS, "tokens", "fonts.css"));
  const match = source.match(/@import\s+url\(['"]([^'"]+)['"]\)/);
  if (!match) throw new Error("tokens/fonts.css must contain the webfont @import url");
  return match[1];
}

function logoExports() {
  const source = read(path.join(DS, "components", "general", "Logo.jsx"));
  const grab = (name) => {
    const match = source.match(new RegExp(`export const ${name}\\s*=\\s*(?:'([^']*)'|"([^"]*)"|([\\d./\\s]+));`));
    if (!match) throw new Error(`Logo.jsx must export ${name}`);
    return match[1] ?? match[2] ?? match[3].trim();
  };
  return { src: grab("LOGO_SRC"), reversed: grab("LOGO_SRC_REVERSED"), aspect: grab("LOGO_ASPECT") };
}

function parseSvgChildren(svg) {
  // lucide-static SVGs contain only simple, attribute-only child elements.
  const inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>[\s\S]*$/, "");
  const nodes = [];
  for (const match of inner.matchAll(/<([a-z]+)((?:\s+[\w-]+="[^"]*")*)\s*\/?>/g)) {
    const attrs = {};
    for (const attr of match[2].matchAll(/([\w-]+)="([^"]*)"/g)) attrs[attr[1]] = attr[2];
    nodes.push([match[1], attrs]);
  }
  return nodes;
}

function buildIconData() {
  const iconsDir = path.join(ROOT, "node_modules", "lucide-static", "icons");
  const icons = {};
  for (const name of ICON_NAMES) {
    icons[name] = parseSvgChildren(read(path.join(iconsDir, `${name}.svg`)));
  }
  return icons;
}

function collectCss() {
  const sections = [];
  for (const file of TOKEN_FILES) sections.push(read(path.join(DS, "tokens", file)));
  for (const file of jsxFilesUnder(path.join(DS, "components"))) sections.push(...extractCssBlocks(read(file)));
  for (const kit of ["website", "crm"]) {
    for (const file of jsxFilesUnder(path.join(DS, "ui_kits", kit))) sections.push(...extractCssBlocks(read(file)));
  }
  // Production-only adaptations, concatenated last so they can override kit rules.
  // adapter.css = shared shell/RTL/print; adapter-public.css / adapter-admin.css
  // belong to the public-site and admin rebuilds respectively.
  // Per-surface extension sheets (adapter-public-*.css, adapter-admin-*.css)
  // follow their base sheet so each screen family can own its own file.
  const extensions = (prefix) =>
    readdirSync(OUT_DIR)
      .filter((name) => name.startsWith(`${prefix}-`) && name.endsWith(".css"))
      .sort();
  for (const file of ["adapter.css", "adapter-public.css", ...extensions("adapter-public"), "adapter-admin.css", ...extensions("adapter-admin")]) {
    sections.push(read(path.join(OUT_DIR, file)));
  }
  return sections.map(minifyCss).filter(Boolean).join("\n");
}

const css = collectCss();
const fonts = fontsUrl();
const logo = logoExports();
const icons = buildIconData();
const hash = createHash("sha256").update(css + fonts + JSON.stringify(logo)).digest("hex").slice(0, 12);
const publicClientHash = createHash("sha256").update(PUBLIC_APP_JS).digest("hex").slice(0, 12);
const adminClientHash = createHash("sha256").update(ADMIN_APP_JS).digest("hex").slice(0, 12);

const header = `// GENERATED by production/scripts/build-design-assets.mjs — do not edit.
// Source of truth: makler-realty-design-system/project plus production/lib/ui/adapter.css and client.mjs
// Rebuild with: npm run design:build
`;
const cssHeader = `/* GENERATED by production/scripts/build-design-assets.mjs — do not edit.
 * Source of truth: makler-realty-design-system/project plus production/lib/ui/adapter*.css
 * Rebuild with: npm run design:build
 */
`;

mkdirSync(VENDOR_DIR, { recursive: true });

const logoFile = `ms-realty-logo-${hash}.png`;
const reversedLogoFile = `ms-realty-logo-reversed-${hash}.png`;
const decodeLogo = (value) => {
  const match = /^data:image\/png;base64,(.+)$/.exec(value);
  if (!match) throw new Error("Logo assets must be base64 PNG data URIs");
  return Buffer.from(match[1], "base64");
};

writeFileSync(path.join(VENDOR_DIR, logoFile), decodeLogo(logo.src));
writeFileSync(path.join(VENDOR_DIR, reversedLogoFile), decodeLogo(logo.reversed));
writeFileSync(path.join(VENDOR_DIR, "ms-realty-public.js"), `${header}${PUBLIC_APP_JS}\n`);
writeFileSync(path.join(VENDOR_DIR, "ms-realty-admin.js"), `${header}${ADMIN_APP_JS}\n`);
writeFileSync(path.join(VENDOR_DIR, "ms-realty.css"), `${cssHeader}${css}\n`);

writeFileSync(
  path.join(OUT_DIR, "design-assets.mjs"),
  `${header}export const DS_HASH = ${JSON.stringify(hash)};
export const FONTS_URL = ${JSON.stringify(fonts)};
export const LOGO_SRC = ${JSON.stringify(logo.src)};
export const LOGO_SRC_REVERSED = ${JSON.stringify(logo.reversed)};
export const LOGO_URL = ${JSON.stringify(`/vendor/${logoFile}`)};
export const LOGO_URL_REVERSED = ${JSON.stringify(`/vendor/${reversedLogoFile}`)};
export const LOGO_ASPECT = ${logo.aspect};
export const PUBLIC_CLIENT_HASH = ${JSON.stringify(publicClientHash)};
export const ADMIN_CLIENT_HASH = ${JSON.stringify(adminClientHash)};
export const DESIGN_CSS = ${JSON.stringify(css)};
`,
);

writeFileSync(
  path.join(OUT_DIR, "icon-data.mjs"),
  `${header}export const ICON_DATA = ${JSON.stringify(icons)};
`,
);

console.log(
  JSON.stringify({
    kind: "design_assets",
    hash,
    css_bytes: css.length,
    icons: Object.keys(icons).length,
    public_client_hash: publicClientHash,
    admin_client_hash: adminClientHash,
  }),
);
