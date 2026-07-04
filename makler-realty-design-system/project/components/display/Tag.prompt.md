# Tag

Neutral feature / filter chip. Use for amenities and specs on a listing, and for removable active-filter chips on search results. (For listing *status* — For sale / New — use `Badge` instead.)

```jsx
<Tag icon="waves">Sea view</Tag>
<Tag icon="trees">Garden</Tag>
<Tag variant="brand" icon="bed">3 bedrooms</Tag>

{/* Active filter, removable */}
<Tag variant="outline" onRemove={() => clear('pool')}>Pool</Tag>

{/* Toggleable filter */}
<Tag onClick={() => toggle('balcony')}>Balcony</Tag>
```

- Variants: `neutral` (sunken) · `outline` · `brand` (sea tint). Sizes `sm` / `md`.
- `onRemove` adds a × button; `onClick` makes the chip interactive.
