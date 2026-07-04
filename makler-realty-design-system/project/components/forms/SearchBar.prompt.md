# SearchBar

MS's signature property-search control — a deal toggle (Buy / Rent / Holiday lets) above one elevated bar holding location, type and max-price. Use it in the homepage hero (`lg`) and as the sticky filter header on search results (`md`).

```jsx
<SearchBar
  size="lg"
  locationPlaceholder="Where? e.g. Sandanski, Bansko, St Vlas"
  onSearch={(q) => console.log(q)}
/>

// Compact, inside a results toolbar:
<SearchBar size="md" showDeals={false} />
```

- `deals` overrides the toggles; `types` / `prices` override the select options.
- `onSearch` receives `{ deal, location, type, price }`.
- The Search button is the one place Clay (accent) appears in the bar — it is the money action. Keep the bar on a photo or a Stone-50 section so its shadow reads.
