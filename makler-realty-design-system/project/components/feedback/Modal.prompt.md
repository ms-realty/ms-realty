# Modal

The dialog for the contact moments — “Book a viewing”, “Request a call”, confirmations. Scrim + white panel, serif title, footer action row. Escape / scrim / ✕ all close; body scroll locks while open.

```jsx
const [open, setOpen] = React.useState(false);

<Button variant="accent" iconStart="calendar" onClick={() => setOpen(true)}>Book a viewing</Button>

<Modal
  open={open}
  onClose={() => setOpen(false)}
  eyebrow="MS-2214 · St Vlas"
  title="Book a viewing"
  subtitle="Tell us when suits you — we confirm within a few hours."
  footer={<>
    <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
    <Button variant="accent" iconStart="calendar-check">Request viewing</Button>
  </>}
>
  {/* Input / Select / Textarea fields */}
</Modal>
```

- Sizes: `sm` 440 (confirmations) · `md` 560 (forms — default) · `lg` 760 (galleries, comparisons).
- The confirm action sits **last** in `footer`; use `accent` only when it is the highest-intent contact action, otherwise `primary`.
- Renders in place with `position:fixed` — mount near the root of the tree, not inside a transformed/filtered ancestor.
