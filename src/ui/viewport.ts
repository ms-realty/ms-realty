import type { Viewport } from "next";

/** Safe-area insets and virtual-keyboard resizing without restricting browser zoom. */
export const appViewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  colorScheme: "light",
  themeColor: "#f8f7f3",
};
