# Button

The main interactive control; use `accent` (terracotta) for the single highest-intent CTA on a view and `primary` (sea) for standard strong actions.

```jsx
<Button variant="accent" iconStart="phone">Book a viewing</Button>
<Button variant="primary">Search properties</Button>
<Button variant="secondary" iconEnd="arrow-right">See all listings</Button>
<Button variant="ghost" size="sm">Cancel</Button>
<Button as="a" href="#" variant="subtle">View on map</Button>
```

- Variants: `primary` · `accent` · `secondary` · `ghost` · `subtle`. Sizes: `sm` · `md` · `lg`.
- `iconStart` / `iconEnd` take a Lucide name string or a node. `loading` shows a spinner; `fullWidth` stretches.
- One accent button per view — reserve terracotta for the money action (contact / viewing / call).
