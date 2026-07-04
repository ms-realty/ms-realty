# EmptyState

Centred zero-result state — no matching homes, empty saved list, empty inbox. Icon in a soft stone circle, serif title, short guidance, and always a way forward.

```jsx
<EmptyState
  icon="search-x"
  title="No homes match"
  actions={<>
    <Button variant="secondary" iconStart="rotate-ccw">Clear filters</Button>
    <Button variant="primary">Browse all in St Vlas</Button>
  </>}
>
  Try widening the price range or removing an amenity.
</EmptyState>
```

- State the fact plainly in the title; put the advice in the body (1–2 sentences, no exclamation marks).
- Always pass `actions` — a dead end with no exit is a design failure.
- `size="sm"` inside panels, table bodies and sidebars.
