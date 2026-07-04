# Rating

Star rating in Sun gold, with fractional fill. Used for resort and agent review scores.

```jsx
<Rating value={4.5} showValue count={128} />
<Rating value={3.7} size={14} />
```

- `value` may be fractional (`4.5` → half star). Empty stars use Stone-300, filled use `--rating` (Sun-500).
- Pair with `showValue` for the numeral and `count` for the review count.
