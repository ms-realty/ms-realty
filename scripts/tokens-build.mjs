// Builds the design-token outputs from design/tokens.json (W3C Design Tokens Format 2025.10):
//   src/ui/tokens.css            Tailwind v4 @theme and CSS custom properties
//   design/figma-variables.json  Figma REST variables payload (POST /v1/files/:key/variables)
// Usage: node scripts/tokens-build.mjs [--check]
// --check writes nothing and exits 1 when a committed output is out of date.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { formatJson } from "./format-json.mjs";

const root = new URL("../", import.meta.url);
export const sourcePath = fileURLToPath(new URL("design/tokens.json", root));
export const cssPath = fileURLToPath(new URL("src/ui/tokens.css", root));
export const figmaPath = fileURLToPath(new URL("design/figma-variables.json", root));

/** Every token as { path, type, value, description }, with group `$type` inherited. */
export function flatten(tree, path = [], inheritedType) {
  const type = tree.$type ?? inheritedType;
  if ("$value" in tree) return [{ path, type, value: tree.$value, description: tree.$description }];
  return Object.entries(tree)
    .filter(([key]) => !key.startsWith("$"))
    .flatMap(([key, child]) => flatten(child, [...path, key], type));
}

export function loadTokens(source = JSON.parse(readFileSync(sourcePath, "utf8"))) {
  const tokens = flatten(source);
  const byPath = new Map(tokens.map((token) => [token.path.join("."), token]));
  /** Follows `{group.token}` aliases to the final value. */
  const resolve = (value, seen = []) => {
    if (typeof value !== "string" || !/^\{[^}]+\}$/.test(value)) return value;
    const target = value.slice(1, -1);
    if (seen.includes(target)) throw new Error(`Alias cycle: ${[...seen, target].join(" -> ")}`);
    const token = byPath.get(target);
    if (!token) throw new Error(`Unknown alias ${value}`);
    return resolve(token.value, [...seen, target]);
  };
  for (const token of tokens) {
    if (token.type === "color") checkColor(token.path.join("."), resolve(token.value));
  }
  return { tokens, byPath, resolve, get: (path) => resolve(byPath.get(path)?.value) };
}

function checkColor(name, color) {
  const fromComponents = hex(color);
  if (color.hex && color.hex.toLowerCase() !== fromComponents) {
    throw new Error(`${name}: components give ${fromComponents}, hex says ${color.hex}`);
  }
}

const channel = (value) => Math.round(value * 255);
export function hex(color) {
  return `#${color.components.map((c) => channel(c).toString(16).padStart(2, "0")).join("")}`;
}

function cssColor(color) {
  if (color.alpha === undefined || color.alpha === 1) return hex(color);
  return `rgb(${color.components.map(channel).join(" ")} / ${color.alpha})`;
}

const rem = ({ value, unit }) =>
  unit === "rem" ? `${value}rem` : `${+(value / 16).toFixed(4)}rem`;
const px = ({ value, unit }) => (unit === "px" ? `${value}px` : `${value * 16}px`);
const pxNumber = ({ value, unit }) => (unit === "px" ? value : value * 16);

function fontFamily(families) {
  return families.map((family) => (/^[a-z-]+$/.test(family) ? family : `"${family}"`)).join(", ");
}

function shadow({ color, offsetX, offsetY, blur, spread }) {
  return [px(offsetX), px(offsetY), px(blur), px(spread), cssColor(color)].join(" ");
}

const weightNames = { regular: "normal", medium: "medium", semibold: "semibold", bold: "bold" };

export function buildCss(set = loadTokens()) {
  const theme = [];
  const root = [];
  const group = (prefix) => set.tokens.filter((token) => token.path[0] === prefix);
  const name = (token) => token.path.slice(1).join("-");

  theme.push("  --breakpoint-*: initial;");
  for (const token of group("breakpoint")) {
    theme.push(`  --breakpoint-${name(token)}: ${rem(set.resolve(token.value))};`);
  }
  theme.push("", "  --color-*: initial;");
  for (const token of group("color")) {
    theme.push(`  --color-${name(token)}: ${cssColor(set.resolve(token.value))};`);
  }
  theme.push(
    "",
    "  --font-*: initial;",
    `  --font-sans: ${fontFamily(set.get("font.family.sans"))};`,
  );
  theme.push("  --font-weight-*: initial;");
  for (const token of group("font").filter((t) => t.path[1] === "weight")) {
    theme.push(`  --font-weight-${weightNames[token.path[2]]}: ${set.resolve(token.value)};`);
  }
  theme.push("", "  --text-*: initial;");
  for (const token of group("typography")) {
    const value = set.resolve(token.value);
    const size = pxNumber(value.fontSize);
    const role = name(token);
    theme.push(`  --text-${role}: ${rem(value.fontSize)};`);
    theme.push(
      `  --text-${role}--line-height: ${rem({ value: Math.round(size * value.lineHeight), unit: "px" })};`,
    );
    if (pxNumber(value.letterSpacing) !== 0) {
      theme.push(`  --text-${role}--letter-spacing: ${px(value.letterSpacing)};`);
    }
  }
  theme.push("", `  --spacing: ${rem(set.get("spacing.base"))};`);
  for (const token of group("spacing").filter((t) => t.path[1] !== "base")) {
    theme.push(`  --spacing-${name(token)}: ${rem(set.resolve(token.value))};`);
  }
  theme.push("");
  for (const token of group("container")) {
    theme.push(`  --container-${name(token)}: ${rem(set.resolve(token.value))};`);
  }
  theme.push("", "  --radius-*: initial;");
  for (const token of group("radius")) {
    theme.push(`  --radius-${name(token)}: ${rem(set.resolve(token.value))};`);
  }
  theme.push("", "  --shadow-*: initial;");
  for (const token of group("shadow")) {
    theme.push(`  --shadow-${name(token)}: ${shadow(set.resolve(token.value))};`);
  }
  theme.push("", "  --ease-*: initial;");
  for (const token of group("easing")) {
    theme.push(`  --ease-${name(token)}: cubic-bezier(${set.resolve(token.value).join(", ")});`);
  }

  for (const token of group("duration")) {
    const { value, unit } = set.resolve(token.value);
    root.push(`  --duration-${name(token)}: ${value}${unit};`);
  }
  for (const token of group("focus")) {
    root.push(`  --focus-${name(token)}: ${px(set.resolve(token.value))};`);
  }
  for (const token of group("z")) root.push(`  --z-${name(token)}: ${set.resolve(token.value)};`);

  return [
    "/* Generated by scripts/tokens-build.mjs from design/tokens.json. Do not edit: change the",
    '   source and run `npm run tokens:build`. Import once, after "tailwindcss". */',
    "",
    "@theme {",
    ...theme.filter((line, index, all) => !(line === "" && all[index - 1] === "")),
    "}",
    "",
    "/* Not Tailwind theme namespaces: use as duration-(--duration-fast), z-(--z-header). */",
    ":root {",
    ...root,
    "}",
    "",
  ].join("\n");
}

const scopes = {
  color: ["ALL_FILLS", "STROKE_COLOR", "EFFECT_COLOR"],
  spacing: ["GAP", "WIDTH_HEIGHT"],
  container: ["WIDTH_HEIGHT"],
  breakpoint: ["WIDTH_HEIGHT"],
  radius: ["CORNER_RADIUS"],
  focus: ["STROKE_FLOAT"],
};

/** A Figma REST variables payload: one collection per concern, one "Light" mode. */
export function buildFigma(set = loadTokens()) {
  const collections = [
    { key: "color", name: "Color" },
    { key: "size", name: "Size" },
    { key: "type", name: "Type" },
    { key: "motion", name: "Motion" },
  ];
  const variables = [];
  const values = [];
  const add = (collection, id, resolvedType, value, extra = {}) => {
    variables.push({
      action: "CREATE",
      id,
      name: id,
      variableCollectionId: `collection:${collection}`,
      resolvedType,
      ...extra,
    });
    values.push({ variableId: id, modeId: `mode:${collection}:light`, value });
  };

  for (const token of set.tokens) {
    const [group] = token.path;
    const id = token.path.join("/");
    const description = token.description ? { description: token.description } : {};
    if (token.type === "color") {
      const alias = typeof token.value === "string" ? token.value.slice(1, -1) : null;
      const color = set.resolve(token.value);
      const [r, g, b] = color.components;
      add(
        "color",
        id,
        "COLOR",
        alias
          ? { type: "VARIABLE_ALIAS", id: alias.replaceAll(".", "/") }
          : { r, g, b, a: color.alpha ?? 1 },
        {
          ...description,
          scopes: scopes.color,
          codeSyntax: { WEB: `var(--color-${token.path.slice(1).join("-")})` },
        },
      );
    } else if (token.type === "dimension") {
      add("size", id, "FLOAT", pxNumber(set.resolve(token.value)), {
        ...description,
        scopes: scopes[group] ?? ["ALL_SCOPES"],
      });
    } else if (token.type === "fontFamily") {
      add("type", id, "STRING", set.resolve(token.value)[0], {
        ...description,
        scopes: ["FONT_FAMILY"],
      });
    } else if (token.type === "fontWeight") {
      add("type", id, "FLOAT", set.resolve(token.value), { scopes: ["FONT_WEIGHT"] });
    } else if (token.type === "typography") {
      const value = set.resolve(token.value);
      const size = pxNumber(value.fontSize);
      add("type", `${id}/size`, "FLOAT", size, { ...description, scopes: ["FONT_SIZE"] });
      add("type", `${id}/line-height`, "FLOAT", Math.round(size * value.lineHeight), {
        scopes: ["LINE_HEIGHT"],
      });
      add("type", `${id}/weight`, "FLOAT", set.resolve(value.fontWeight), {
        scopes: ["FONT_WEIGHT"],
      });
    } else if (token.type === "duration") {
      add("motion", id, "FLOAT", set.resolve(token.value).value, { scopes: [] });
    } else if (token.type === "number") {
      add("size", id, "FLOAT", set.resolve(token.value), { scopes: [] });
    }
    // shadow and cubicBezier have no Figma variable type; they stay in tokens.json.
  }

  return {
    $comment:
      "Generated by scripts/tokens-build.mjs from design/tokens.json. Body for POST /v1/files/:file_key/variables (Figma REST API); do not edit.",
    variableCollections: collections.map(({ key, name }) => ({
      action: "CREATE",
      id: `collection:${key}`,
      name,
      initialModeId: `mode:${key}:light`,
    })),
    variableModes: collections.map(({ key }) => ({
      action: "UPDATE",
      id: `mode:${key}:light`,
      name: "Light",
      variableCollectionId: `collection:${key}`,
    })),
    variables,
    variableModeValues: values,
  };
}

export function buildAll(set = loadTokens()) {
  return [
    [cssPath, buildCss(set)],
    [figmaPath, formatJson(buildFigma(set))],
  ];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes("--check");
  let stale = false;
  for (const [path, content] of buildAll()) {
    let current = "";
    try {
      current = readFileSync(path, "utf8");
    } catch {}
    if (current === content) continue;
    if (check) {
      stale = true;
      console.error(`${path} is out of date: run npm run tokens:build`);
    } else {
      writeFileSync(path, content);
      console.log(`wrote ${path}`);
    }
  }
  if (stale) process.exit(1);
}
