// Spec §16.2 / §20.1: every foreground/background token pair the components use meets
// WCAG 2.2 AA contrast. Values are read from tokens.css, the single source of truth.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");
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
    ["error", bg],
    ["warning", bg],
    ["success", bg],
    ["info", bg],
  ]),
  ["link-visited", "surface"],
  ["link-visited", "canvas"],
  ["text", "selected"],
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
  });

  it("defines the type roles from spec §16.1", () => {
    const roles = {
      body: ["1.125rem", "1.75rem"],
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

  it("defines the public display roles and the display face", () => {
    expect(css).toContain("--text-display: 3.5rem;");
    expect(css).toContain("--text-title: 2.25rem;");
    expect(css).toMatch(/--font-display:/);
    // Hebrew display text must reach the Hebrew face before any Latin fallback.
    expect(css).toMatch(/:lang\(he\) \.font-display/);
  });

  it("honours reduced motion and forced colours", () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
    expect(css).toMatch(/@media \(forced-colors: active\)/);
  });
});
