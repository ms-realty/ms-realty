# Logo

The MS Realty brand mark (red **MS** monogram + charcoal **REALTY**), rendered as an image and **embedded as a data URI** — self-contained, so it renders offline and survives PPTX/PDF export.

```jsx
<Logo height={40} />                    // header (light surface)
<Logo height={30} />                    // compact
<Logo variant="reversed" height={40} /> // on dark surfaces (Ink footer, photo hero)
<Logo src={myUrl} height={40} />        // override with a custom source
```

- Two embedded variants: `default` (full colour, for light surfaces) and `reversed` (red MS kept + warm-white REALTY, for dark surfaces). No hotlink, no asset path required.
- Width scales from `height` automatically (native ratio 172 / 88, exposed as `LOGO_ASPECT`).
- The originals also live at `assets/logo-ms-realty.png` and `assets/logo-ms-realty-reversed.png` for download / hand-off. If the brand supplies a vector (SVG) master, drop it in and point `LOGO_SRC` at it.
