# RangeSlider

Dual-thumb range for search filters — price, area, distance to beach. Charcoal fill on a stone rail; both thumbs are keyboard accessible.

```jsx
const eur = (v) => '€' + v.toLocaleString('en-GB');

<RangeSlider
  label="Цена"
  min={20000} max={600000} step={5000}
  defaultValue={[60000, 245000]}
  format={eur}
  onChange={([lo, hi]) => setPrice({ lo, hi })}
/>

<RangeSlider label="Площ" min={20} max={400} step={5} defaultValue={[45, 120]} format={(v) => v + ' m²'} />
```

- Always pass `format` — raw numbers are never shown to buyers (`€245,000`, `68 m²`).
- Pick a `step` that matches the unit (€5,000 price steps, 5 m² area steps).
- For open-ended tops, label the max via format: `(v) => v >= 600000 ? '€600,000+' : eur(v)`.
