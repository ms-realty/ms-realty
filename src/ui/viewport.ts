import type { Viewport } from "next";
import tokens from "../../design/tokens.json";

/** Safe-area insets without restricting browser zoom. */
export const appViewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // The Linux WebKit target reports interactive-widget as an error; use native keyboard behavior.
  colorScheme: "light",
  themeColor: tokens.color.canvas.$value.hex,
};
