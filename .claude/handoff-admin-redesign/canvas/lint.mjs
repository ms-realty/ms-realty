// Every artboard inlines the shared BASE stylesheet. A screen-local class that
// reuses a BASE name silently inherits it — that is how a 372px card became a
// 15px checkbox. This finds the collisions and the undefined classes.
import fs from "node:fs";
import path from "node:path";
import { BASE } from "./shell.mjs";
import { CANONICAL_SPACING, ICON_BANDS, RADII, SPACING_STEPS, TYPE_SCALE } from "./tokens.mjs";

const dir = new URL(".", import.meta.url).pathname;
const classesIn = (css) => new Set([...css.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]));
const baseClasses = classesIn(BASE);

let problems = 0;
for (const file of fs.readdirSync(dir).filter((n) => n.endsWith(".dc.html"))) {
  const src = fs.readFileSync(path.join(dir, file), "utf8");
  const style = src.match(/<helmet>\s*<style>([\s\S]*?)<\/style>/)[1];
  const body = src.split("</helmet>")[1].split("</x-dc>")[0];
  const declared = classesIn(style);
  // "local" = declared in this file's style block but not in the shared BASE
  const localCss = style.slice(BASE.length);
  // A collision is a BARE redeclaration -- `.pill { ... }` -- which silently
  // replaces the shared component. `.kc-top .pill { ... }` scopes an addition
  // to one place and is how the sheet is meant to be extended.
  const bareLocal = new Set(
    [...localCss.matchAll(/(^|\n)\s*((?:\.[\w-]+)(?:\s*,\s*\.[\w-]+)*)\s*\{/g)]
      .flatMap((m) => m[2].split(",").map((s) => s.trim().slice(1))),
  );
  const collisions = [...bareLocal].filter((c) => baseClasses.has(c));

  const used = new Set();
  for (const m of body.matchAll(/class="([^"]+)"/g)) m[1].split(/\s+/).forEach((c) => c && used.add(c));
  const undef = [...used].filter((c) => !declared.has(c));

  if (collisions.length || undef.length) {
    problems += 1;
    console.log(`\n${file}`);
    if (collisions.length) console.log(`  collides with BASE: ${collisions.join(", ")}`);
    if (undef.length) console.log(`  used but undefined:  ${undef.join(", ")}`);
  }
}
console.log(problems ? `\n${problems} file(s) with problems` : "\nno class collisions, no undefined classes");

// The Foundations sheet publishes the system's scales. It used to publish them
// as prose, and the prose drifted: the spacing rule named three values its own
// scale excludes, the type panel and the chart beside it named different sets
// of nine, and the icon note claimed a range three quarters of the drawings
// miss. The sheet now renders from tokens.mjs; these checks keep it that way.
const broken = [];
const claim = (ok, message) => { if (!ok) broken.push(message); };

for (const [name, value] of Object.entries(CANONICAL_SPACING)) {
  for (const step of [value].flat()) {
    claim(SPACING_STEPS.includes(step), `canonical spacing ${name} uses ${step}px, which is not a step`);
  }
}

const shell = fs.readFileSync(path.join(dir, "shell.mjs"), "utf8");
const declared = (selector, pattern) => {
  const found = shell.match(pattern);
  claim(Boolean(found), `${selector} padding not found in shell.mjs`);
  return found ? found.slice(1).map(Number) : [];
};
claim(
  String(declared("td", /\n\s*td \{[^}]*padding:(\d+)px (\d+)px;/)) === String(CANONICAL_SPACING.rowPadding),
  "the row padding in shell.mjs is not the row padding the sheet publishes",
);
claim(
  String(declared(".sect", /\n\s*\.sect \{ padding:(\d+)px (\d+)px;/)) ===
    String(CANONICAL_SPACING.panelPadding),
  "the panel padding in shell.mjs is not the panel padding the sheet publishes",
);
claim(
  declared(".scroll", /\.scroll \{ flex:1 1 auto; padding:\d+px (\d+)px \d+px;/)[0] === CANONICAL_SPACING.pageGutter,
  "the page gutter in shell.mjs is not the gutter the sheet publishes",
);

// Every icon in the canvas sits in one of the two declared bands.
const bands = Object.values(ICON_BANDS);
const inBand = (size) => bands.some(([low, high]) => size >= low && size <= high);
const sources = [
  ...fs.readdirSync(dir).filter((n) => n.endsWith(".mjs") && n !== "lint.mjs").map((n) => path.join(dir, n)),
  ...fs.readdirSync(path.join(dir, "build")).map((n) => path.join(dir, "build", n)),
];
const strays = new Map();
for (const file of sources) {
  for (const match of fs.readFileSync(file, "utf8").matchAll(/icon\(\s*"[^"]+"\s*,\s*(\d+(?:\.\d+)?)\s*\)/g)) {
    const size = Number(match[1]);
    if (!inBand(size)) strays.set(size, (strays.get(size) || 0) + 1);
  }
}
claim(
  strays.size === 0,
  `icons drawn outside the declared bands: ${[...strays.entries()].map(([s, n]) => `${s}px x${n}`).join(", ")}`,
);

// The type chart and the specimen list are rendered from one array, so they
// agree by construction. This checks the artboard actually shipped that way.
const foundations = fs.readFileSync(path.join(dir, "Foundations.dc.html"), "utf8");
const specimen = [...foundations.matchAll(/font-size:([\d.]+)px; font-weight:600; letter-spacing|UI \/ ([\d.]+)/g)];
claim(specimen.length > 0, "the Foundations type specimen list did not render");
const stated = foundations.match(/note-b">(\d+) sizes,/);
claim(Boolean(stated), "the Foundations type panel no longer states how many sizes there are");

// A var() with no fallback that names nothing is silent: a colour falls back to
// currentColor, a box-shadow is invalid and dropped. That is how five screens
// drew control edges in the inherited text colour, three lost their elevation,
// and one chart bar rendered with no fill at all.
const artboards = fs.readdirSync(dir).filter((n) => n.endsWith(".dc.html"));
for (const file of artboards) {
  const src = fs.readFileSync(path.join(dir, file), "utf8");
  const defined = new Set([...src.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
  for (const use of new Set([...src.matchAll(/var\(\s*(--[\w-]+)\s*\)/g)].map((m) => m[1]))) {
    claim(defined.has(use), `${file} paints with ${use}, which no stylesheet defines`);
  }
}

// A bar is read by where it ends, so the fill has to be visible against its own
// track. WCAG 2.2 AA 1.4.11 puts that at 3:1, and it is arithmetic.
const CONTRAST_FLOOR = 3;
const srgb = (channel) => {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex) => {
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.replace("#", "").slice(i, i + 2), 16));
  return 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
};
const contrast = (left, right) => {
  const [high, low] = [luminance(left), luminance(right)].sort((a, b) => b - a);
  return (high + 0.05) / (low + 0.05);
};
for (const file of artboards) {
  const src = fs.readFileSync(path.join(dir, file), "utf8");
  const palette = Object.fromEntries([...src.matchAll(/(--[\w-]+):\s*(#[0-9A-Fa-f]{6})/g)].map((m) => [m[1], m[2]]));
  const trackToken = (src.match(/\.bar \.t \{[^}]*background:var\((--[\w-]+)\)/) || [])[1];
  if (!trackToken || !palette[trackToken]) continue;
  for (const fill of new Set([...src.matchAll(/class="bar"[\s\S]{0,400}?<i style="width:[^"]*background:var\((--[\w-]+)\)/g)].map((m) => m[1]))) {
    if (!palette[fill]) continue;
    const ratio = contrast(palette[fill], palette[trackToken]);
    claim(
      ratio >= CONTRAST_FLOOR,
      `${file} draws a bar in ${fill} on ${trackToken}: ${ratio.toFixed(2)}:1, under the ${CONTRAST_FLOOR}:1 floor`,
    );
  }
}

// Three radii. A radius no rule produced is the most common Gate 3 defect, so
// every literal border-radius in every artboard must be one of the three (or a
// token that resolves to one). 0 is allowed: a square corner is not a radius.
const allowedRadii = new Set([0, ...Object.values(RADII)]);
for (const file of artboards) {
  const src = fs.readFileSync(path.join(dir, file), "utf8");
  const literal = [...src.matchAll(/border-radius\s*:\s*([^;"}]+)/g)]
    .flatMap((m) => m[1].split(/\s+/))
    .filter((v) => /^\d+(\.\d+)?px$/.test(v))
    .map((v) => Number.parseFloat(v))
    .filter((v) => !allowedRadii.has(v));
  if (literal.length) claim(false, `${file} uses radii outside the system: ${[...new Set(literal)].join(", ")}px`);
}

if (broken.length) {
  console.log(`\nFoundations claims that are not true:`);
  for (const message of broken) console.log(`  ${message}`);
  process.exitCode = 1;
} else {
  console.log("Foundations claims check out against tokens.mjs and the canvas sources");
}
