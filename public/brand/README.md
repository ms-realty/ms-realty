# Original MS Realty assets

`logo-ms-realty.png` is the authentic 172 × 88 MS Realty logo, displayed at 86 × 44 without cropping. Its SHA-256 is `a066e47e0258bbdf20eb0f7c84dbd1d947f526c71c7dbb9b75e562dae660fd3b`.

`workspace/` and `journey/` retain the original 20 × 20 static SVG bytes supplied by the saved Figma O01 and C03 design contexts; `workspace/` also holds the phone context bar and X02 agency-tools icons, each with its Figma node id. Their `sources.json` files record their provenance and SHA-256 hashes. They are decorative external images with empty alt text beside a named navigation link or control; they are never inline SVG controls. A narrow Biome override disables the inline-SVG title rule for only these imported asset files, preserving their original bytes. Navigation text, focus, dimensions and native behavior are checked separately in browser acceptance.
