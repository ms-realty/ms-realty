# Badge

Small uppercase status pill for a listing's state. Tonal (soft tint) on light surfaces; `solid` when placed over a property photo.

```jsx
<Badge variant="for-sale">For sale</Badge>
<Badge variant="for-rent">For rent</Badge>
<Badge variant="new" dot>New</Badge>
<Badge variant="reduced" icon="trending-down">Reduced</Badge>
<Badge variant="featured" solid>Featured</Badge>   {/* over imagery */}
```

- Variants: `for-sale` (sea) · `for-rent` (clay) · `new` (green) · `reduced` (red) · `featured` (gold) · `sold` (stone) · `neutral`.
- Use `solid` only over photography (listing image corner); tonal everywhere else.
- Keep the label to one or two words — it is set in uppercase with wide tracking.
