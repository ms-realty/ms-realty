Noto Sans and Noto Sans Hebrew, self-hosted (architecture §11.3), licensed under the SIL Open
Font License 1.1 (`OFL.txt`).

Each file is one Google Fonts subset of the variable font (weight axis 100–900), as fetched by
`next/font/google` at build time; `src/ui/fonts.css` declares them with their `unicode-range`
and `src/ui/fonts.ts` preloads the subsets each locale needs.

| File | Subset |
|---|---|
| `noto-sans-latin.woff2` | Latin (every page) |
| `noto-sans-latin-ext.woff2` | Latin Extended (on demand) |
| `noto-sans-cyrillic.woff2` | Cyrillic (bg, ru) |
| `noto-sans-greek.woff2` | Greek (el) |
| `noto-sans-hebrew.woff2` | Hebrew, from Noto Sans Hebrew (he) |

## Manrope titles

Manrope variable WOFF2, weights 200–800, self-hosted for the saved Figma title styles.
Copyright 2018 The Manrope Project Authors; SIL Open Font License 1.1 in
`Manrope-OFL.txt`. These unmodified official Google Fonts v20 subsets were fetched on
2026-09-30 using [the Google Fonts CSS endpoint](https://fonts.googleapis.com/css2?family=Manrope:wght@200..800&display=swap).
The [upstream license](https://raw.githubusercontent.com/google/fonts/main/ofl/manrope/OFL.txt) is retained verbatim.
No runtime font provider or build-time network request is required. Noto body/script faces
and their existing subset behavior remain in place; Hebrew prioritizes Noto Sans Hebrew.
Latin Extended loads on demand.

| File | Official immutable version URL | SHA-256 | Bytes |
|---|---|---|---|
| `manrope-cyrillic.woff2` | [Google Fonts v20](https://fonts.gstatic.com/s/manrope/v20/xn7gYHE41ni1AdIRggOxSvfedN62Zw.woff2) | `95a493061fe0a8d0d027c2892747134ba747141112d3be4d5022e70ab7d3a1a6` | 14544 |
| `manrope-greek.woff2` | [Google Fonts v20](https://fonts.gstatic.com/s/manrope/v20/xn7gYHE41ni1AdIRggSxSvfedN62Zw.woff2) | `40af11327fe5308166c6cb5787808b042db6da889abf602f0a4876c49675d87e` | 9360 |
| `manrope-latin-ext.woff2` | [Google Fonts v20](https://fonts.gstatic.com/s/manrope/v20/xn7gYHE41ni1AdIRggmxSvfedN62Zw.woff2) | `ce093b341d9c10658ee1eaa85c5f8042ff3307bc6ccfc5f405616eb437f0009e` | 15240 |
| `manrope-latin.woff2` | [Google Fonts v20](https://fonts.gstatic.com/s/manrope/v20/xn7gYHE41ni1AdIRggexSvfedN4.woff2) | `e310b55a7fd9677f5e3555e6c6c4d064fa1f1d24393f0ddbe217cea12a8c432f` | 24576 |
