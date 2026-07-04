# Icon

Renders a Lucide glyph as an inline SVG that inherits `color` via `currentColor`; use anywhere the brand needs an icon.

```jsx
<Icon name="map-pin" size={18} />
<span style={{ color: 'var(--accent)' }}><Icon name="heart" label="Save" /></span>
```

- `name` accepts kebab (`"map-pin"`) or Pascal (`"MapPin"`).
- Decorative by default (`aria-hidden`); pass `label` to make it announced.
- Substitute set — Lucide via CDN. In production, swap to `lucide-react`.
- Common real-estate glyphs: `bed`, `bath`, `ruler`, `map-pin`, `heart`, `phone`, `search`, `home`/`house`, `mountain`, `waves`, `car`, `trees`, `key`, `building-2`.
