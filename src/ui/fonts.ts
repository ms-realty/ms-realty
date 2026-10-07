import { preload } from "react-dom";
import type { PublicLocale } from "@/i18n/config";

// Self-hosted font subsets (public/fonts, declared in src/ui/fonts.css). Every page shows Latin
// (brand, digits, references), so Latin is always preloaded; a locale adds only its own script.
// Latin Extended and the other scripts still load on demand through unicode-range.
const scriptFiles = {
  cyrillic: ["/fonts/noto-sans-cyrillic.woff2"],
  greek: ["/fonts/noto-sans-greek.woff2"],
  hebrew: ["/fonts/noto-sans-hebrew.woff2"],
} as const;

const localeScripts: Record<PublicLocale, readonly (keyof typeof scriptFiles)[]> = {
  bg: ["cyrillic"],
  ru: ["cyrillic"],
  en: [],
  de: [],
  nl: [],
  el: ["greek"],
  he: ["hebrew"],
};

export function fontFilesFor(locale: PublicLocale): string[] {
  return ["/fonts/noto-sans-latin.woff2", ...localeScripts[locale].flatMap((s) => scriptFiles[s])];
}

/** Call from a root layout: emits `<link rel="preload">` for the locale's font files. */
export function preloadFonts(locale: PublicLocale): void {
  for (const href of fontFilesFor(locale)) {
    preload(href, { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
  }
}
