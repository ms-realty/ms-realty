import {
  Noto_Sans,
  Noto_Sans_Hebrew,
  Noto_Serif_Display,
  Noto_Serif_Hebrew,
} from "next/font/google";

// Self-hosted at build time by next/font (CSP font-src 'self'). Hebrew text lists the Hebrew
// family first (tokens.css, :lang(he)): the Latin families have no Hebrew glyphs and their
// generated fallback faces are local fonts that do. Hebrew faces are not preloaded because
// only Hebrew pages need them.
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

// Public display face (headings on public pages only, tokens.css --font-display).
const notoSerifDisplay = Noto_Serif_Display({
  subsets: ["latin", "latin-ext", "cyrillic", "greek"],
  weight: ["400"],
  variable: "--font-noto-serif-display",
  display: "swap",
});

const notoSerifHebrew = Noto_Serif_Hebrew({
  subsets: ["hebrew"],
  weight: ["400"],
  variable: "--font-noto-serif-hebrew",
  display: "swap",
  preload: false,
});

/** Put on <html> so tokens.css can resolve `--font-sans` and `--font-display`. */
export const fontVariables = [notoSans, notoSansHebrew, notoSerifDisplay, notoSerifHebrew]
  .map((font) => font.variable)
  .join(" ");
