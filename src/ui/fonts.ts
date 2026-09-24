import { Noto_Sans, Noto_Sans_Hebrew } from "next/font/google";

// Self-hosted at build time by next/font (CSP font-src 'self'). Hebrew text lists Noto Sans
// Hebrew first (tokens.css, :lang(he)): Noto Sans has no Hebrew glyphs and its generated
// fallback face is local Arial, which does. Not preloaded because only Hebrew pages need it.
const notoSans = Noto_Sans({
  subsets: ["latin", "latin-ext", "cyrillic", "greek"],
  variable: "--font-noto-sans",
  display: "swap",
});

const notoSansHebrew = Noto_Sans_Hebrew({
  subsets: ["hebrew"],
  variable: "--font-noto-sans-hebrew",
  display: "swap",
  preload: false,
});

/** Put on <html> so tokens.css can resolve `--font-sans`. */
export const fontVariables = `${notoSans.variable} ${notoSansHebrew.variable}`;
