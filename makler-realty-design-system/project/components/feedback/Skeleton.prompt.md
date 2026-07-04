# Skeleton

Loading shimmer for async content — search results, gallery, agent panel. Compose variants to mirror the layout that will load.

```jsx
{/* a loading PropertyCard */}
<div style={{ width: 320, display: 'flex', flexDirection: 'column', gap: 12 }}>
  <Skeleton variant="photo" height={180} />
  <Skeleton variant="text" width="55%" height={14} />
  <Skeleton variant="text" lines={2} />
</div>

<Skeleton variant="circle" width={44} />   {/* agent avatar */}
<Skeleton variant="rect" height={44} />    {/* a control */}
```

- Variants: `text` (with `lines`) · `rect` · `circle` · `photo` (image radius, deeper stone).
- Match the real content's dimensions so nothing jumps when it loads.
- Shimmer stops under `prefers-reduced-motion`.
