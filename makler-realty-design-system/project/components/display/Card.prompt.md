# Card

The neutral surface container. Hairline border by default; `elevated` swaps it for a soft shadow, `sunken` for a tinted well. For property listings use `PropertyCard`.

```jsx
<Card padding="lg" elevated>
  <h3>Arrange a viewing</h3>
  <p>Our Sandanski team will call you back within the hour.</p>
</Card>

<Card as="a" href="#" interactive>…agent card…</Card>
```

- `padding`: `none` · `sm` · `md` · `lg`. `elevated` (shadow) · `sunken` (Stone well) · `interactive` (hover lift).
