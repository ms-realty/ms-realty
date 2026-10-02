// Architecture §11.3: every foreground/background token pair the components use meets
// WCAG 2.2 AA contrast. CSS is generated from the DTCG source in design/tokens.json.
import { readFileSync } from "node:fs";
import { parse } from "postcss";
import { compile } from "tailwindcss";
import { describe, expect, it } from "vitest";
import { fontFilesFor } from "./fonts";

const css = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");
const base = readFileSync(new URL("./base.css", import.meta.url), "utf8");
const colors = new Map(
  [...css.matchAll(/--color-([a-z-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map((m) => [m[1], m[2]]),
);

function color(name: string): string {
  const value = colors.get(name);
  if (!value) throw new Error(`tokens.css has no --color-${name}`);
  return value;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const channel = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

const surfaces = ["canvas", "surface", "subtle"];

// [foreground, background] pairs for text (4.5:1).
const textPairs: Array<[string, string]> = [
  ...surfaces.flatMap((bg) => [
    ["text", bg],
    ["text-muted", bg],
    ["link", bg],
    ["action", bg],
    ["brand", bg],
    ["error", bg],
    ["warning", bg],
    ["success", bg],
    ["info", bg],
  ]),
  ["link-visited", "surface"],
  ["link-visited", "canvas"],
  ["text", "selected"],
  ["brand", "selected"],
  ["text-muted", "selected"],
  ["action", "selected"],
  ["action-pressed", "selected"],
  ["text", "success-soft"],
  ["text", "warning-soft"],
  ["text", "error-soft"],
  ["text", "info-soft"],
  ["text-inverse", "action"],
  ["text-inverse", "action-hover"],
  ["text-inverse", "action-pressed"],
  ["text-inverse", "error"],
  ["text-inverse", "error-hover"],
  ["text-inverse", "error-pressed"],
  // Tooltip: inverse text on ink.
  ["text-inverse", "text"],
  // Dark bands (footer, owner band, compare tray).
  ["text-inverse", "ink"],
  ["text-on-ink-muted", "ink"],
  // Assistance: interpreted criteria and drafts.
  ["assist", "assist-soft"],
  ["assist-line", "assist-soft"],
  ["assist", "surface"],
  ["text", "assist-soft"],
  ["disabled-text", "disabled"],
] as Array<[string, string]>;

// Component boundaries, focus indicators, icons and state marks (3:1).
const nonTextPairs: Array<[string, string]> = [
  ...surfaces.flatMap((bg) => [
    ["border", bg],
    ["focus", bg],
    ["action", bg],
    ["error", bg],
  ]),
  ["focus", "selected"],
  ["action", "selected"],
  ["success", "success-soft"],
  ["warning", "warning-soft"],
  ["error", "error-soft"],
  ["info", "info-soft"],
  ["assist", "assist-soft"],
  // The focus ring is offset 2px, so it sits on the page surface, never on the button fill.
  ["disabled-text", "disabled"],
] as Array<[string, string]>;

describe("design tokens (spec §16.2)", () => {
  it("defines every semantic colour role", () => {
    for (const role of [
      "canvas",
      "surface",
      "subtle",
      "text",
      "text-muted",
      "text-inverse",
      "border",
      "divider",
      "focus",
      "action",
      "action-hover",
      "action-pressed",
      "link",
      "link-visited",
      "selected",
      "success",
      "warning",
      "error",
      "info",
      "ink",
      "assist",
      "assist-soft",
      "assist-line",
      "brand",
      "brand-tint",
    ]) {
      expect(colors.has(role), role).toBe(true);
    }
    expect(css).toMatch(/--color-overlay:/);
  });

  it.each(textPairs)("text %s on %s is at least 4.5:1", (fg, bg) => {
    expect(contrast(color(fg), color(bg))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(nonTextPairs)("non-text %s on %s is at least 3:1", (fg, bg) => {
    expect(contrast(color(fg), color(bg))).toBeGreaterThanOrEqual(3);
  });

  it("keeps a 44px default control height and a 4px spacing base", () => {
    expect(css).toMatch(/--spacing-control:\s*2\.75rem/);
    expect(css).toMatch(/--spacing:\s*0\.25rem/);
    expect(css).toContain("--radius-control: 0.375rem;");
    expect(css).toContain("--radius-panel: 0.5rem;");
  });

  it("uses the owner-approved palette B (architecture §11.3) with a distinct assistance colour", () => {
    expect(
      Object.fromEntries(
        ["canvas", "subtle", "text", "action", "brand", "assist", "border"].map((role) => [
          role,
          color(role),
        ]),
      ),
    ).toEqual({
      canvas: "#f8f7f3",
      subtle: "#eef1ec",
      text: "#192e27",
      action: "#214f3c",
      brand: "#214f3c",
      assist: "#5b45a0",
      border: "#687a6f",
    });
    expect(contrast(color("border"), color("subtle"))).toBeGreaterThanOrEqual(3);
    expect(contrast(color("border"), color("selected"))).toBeGreaterThanOrEqual(3);
  });

  it("uses the architecture's 16px body and readable secondary type roles", () => {
    const roles = {
      body: ["1rem", "1.625rem"],
      compact: ["1rem", "1.5rem"],
      operational: ["0.9375rem", "1.375rem"],
      dense: ["0.875rem", "1.25rem"],
      caption: ["0.875rem", "1.25rem"],
    };
    for (const [role, [size, leading]] of Object.entries(roles)) {
      expect(css).toContain(`--text-${role}: ${size};`);
      expect(css).toContain(`--text-${role}--line-height: ${leading};`);
    }
  });

  it("sets titles and body in Noto Sans with a Hebrew-first fallback (palette B, no Manrope)", async () => {
    expect(css).toContain("--text-title: 2rem;");
    expect(css).toContain("--text-title--line-height: 2.5rem;");
    expect(css).toContain('--font-sans: "Noto Sans", "Noto Sans Hebrew"');
    expect(css).toMatch(/--font-display:\s*"Noto Sans", "Noto Sans Hebrew"/);
    expect(css).not.toContain("Manrope");
    expect(base).toMatch(/:lang\(he\)\s*\{\s*--font-sans: "Noto Sans Hebrew"/);
    expect(base).toMatch(/--font-display:\s*"Noto Sans Hebrew", "Noto Sans"/);
    expect(css).toContain("--focus-width: 3px;");
    const compiled = await compile(`${css}\n@tailwind utilities;`);
    const output = parse(
      compiled.build(["text-title", "sm:text-title", "text-heading", "text-body"]),
    );
    const rules: Record<string, Record<string, string>> = {};
    output.walkRules((rule) => {
      const declarations: Record<string, string> = {};
      rule.walkDecls((declaration) => {
        declarations[declaration.prop] = declaration.value;
      });
      rules[rule.selector] = { ...rules[rule.selector], ...declarations };
    });
    for (const selector of [".text-title", ".sm\\:text-title"]) {
      expect(rules[selector]).toMatchObject({
        "font-family": "var(--font-sans)",
        "font-size": "var(--text-title)",
        "line-height": "var(--tw-leading, var(--text-title--line-height))",
      });
    }
    for (const selector of [".text-heading", ".text-body"])
      expect(rules[selector]?.["font-family"]).toBe("var(--font-sans)");
  });

  it("preloads only the title/body subsets needed by each locale from local WOFF2 assets", () => {
    const latin = ["/fonts/noto-sans-latin.woff2"];
    for (const locale of ["en", "de", "nl"] as const) expect(fontFilesFor(locale)).toEqual(latin);
    for (const locale of ["bg", "ru"] as const)
      expect(fontFilesFor(locale)).toEqual([...latin, "/fonts/noto-sans-cyrillic.woff2"]);
    expect(fontFilesFor("el")).toEqual([...latin, "/fonts/noto-sans-greek.woff2"]);
    expect(fontFilesFor("he")).toEqual([...latin, "/fonts/noto-sans-hebrew.woff2"]);
    for (const locale of ["bg", "ru", "en", "de", "nl", "el", "he"] as const) {
      for (const path of fontFilesFor(locale)) {
        const file = readFileSync(new URL(`../../public${path}`, import.meta.url));
        expect(file.length).toBeGreaterThan(1000);
        expect(file.subarray(0, 4).toString()).toBe("wOF2");
      }
    }
  });

  it("honours reduced motion and forced colours", () => {
    expect(base).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
    expect(base).toMatch(/@media \(forced-colors: active\)/);
  });
});
