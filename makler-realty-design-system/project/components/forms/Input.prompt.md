# Input

Single-line text field for search, contact forms, and filters; supports a label, leading/trailing icon, and hint/error text.

```jsx
<Input label="Location" iconStart="map-pin" placeholder="Sandanski, Bansko…" />
<Input label="Email" type="email" iconStart="mail" required
       hint="We only use this to reply to your enquiry." />
<Input label="Price from" iconEnd={<span style={{color:'var(--text-muted)'}}>€</span>}
       error="Enter a valid amount" />
```

- Sizes: `sm` · `md` · `lg`. Pass any native input attr (`type`, `value`, `onChange`, `placeholder`).
- `error` turns the field red and shows the message; otherwise `hint` shows.
