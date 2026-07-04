# assets/

Drop real brand binaries here. The **brand logo now lives here** (fetched from the live site and embedded into the `Logo` component); **fonts** and **photography** are still open drop-zones awaiting supplied files.

- **`fonts/`** — licensed brand webfonts (`.woff2`). If added, replace the Google-Fonts `@import` in `../tokens/fonts.css` with `@font-face` rules pointing here. Current fonts are stand-ins (Source Serif 4 / Commissioner / IBM Plex Mono — all Latin + Cyrillic + Greek).
- **Logo** — the real **MS Realty** mark (172×88, red MS + charcoal REALTY) now lives here as `logo-ms-realty.png`, plus `logo-ms-realty-reversed.png` (red MS + warm-white REALTY, for dark surfaces). Both are **embedded as data URIs** in the `Logo` component (`../components/general/Logo.jsx`), so the mark renders offline and in PPTX/PDF export — no hotlink. If you have a vector (**SVG**) master, drop it here and repoint `LOGO_SRC`.
- **`photography/`** — property & resort photos. Until then, imagery uses the `.mk-photo` placeholder tones in `../tokens/media.css`; `PropertyCard` and the listing gallery already accept a real `image` URL that overrides the tone.

Icons are **not** stored here — they come from [Lucide](https://lucide.dev) (loaded from CDN in the HTML cards/kit, or `lucide-react` in production). See the Iconography section of the root `readme.md`.
