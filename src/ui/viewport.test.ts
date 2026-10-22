import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { appViewport } from "./viewport";

it("M-107 every root document is safe-area aware, light and canvas-coloured", () => {
  const canvas = /--color-canvas:\s*(#[0-9a-f]{6});/.exec(
    readFileSync(new URL("./tokens.css", import.meta.url), "utf8"),
  )?.[1];
  expect(canvas).toBeDefined();
  expect(appViewport).toEqual({
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
    colorScheme: "light",
    themeColor: canvas,
  });
  expect(appViewport).not.toHaveProperty("maximumScale");
  expect(appViewport).not.toHaveProperty("userScalable");
  expect(appViewport).not.toHaveProperty("interactiveWidget");
  for (const root of [
    "../../app/public/[locale]/layout.tsx",
    "../../app/client/[locale]/layout.tsx",
    "../../app/staff/[locale]/layout.tsx",
    "../../app/global-not-found.tsx",
  ])
    expect(readFileSync(new URL(root, import.meta.url), "utf8")).toContain(
      "export const viewport: Viewport = appViewport;",
    );
});
