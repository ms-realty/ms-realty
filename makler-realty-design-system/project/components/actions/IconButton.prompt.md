# IconButton

A single-icon button for compact actions (save, share, close, gallery arrows); `label` is required for accessibility.

```jsx
<IconButton icon="heart" label="Save to favourites" variant="glass" round active />
<IconButton icon="share-2" label="Share listing" variant="outline" />
<IconButton icon="x" label="Close" variant="ghost" />
<IconButton icon="chevron-right" label="Next photo" variant="glass" round />
```

- Variants: `ghost` · `solid` · `outline` · `glass` (glass = translucent, for placing over property photos).
- `active` toggles the pressed look (favourited heart turns terracotta on `glass`).
