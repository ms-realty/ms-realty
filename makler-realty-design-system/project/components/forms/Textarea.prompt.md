# Textarea

Multi-line field — the enquiry message, viewing notes, a property description. Same anatomy as `Input` (label, hint, error).

```jsx
<Textarea
  label="Съобщение"
  placeholder="Кажете ни какво търсите — локация, бюджет, задължителни изисквания…"
  hint="Отговаряме до един работен ден."
  rows={5}
/>
<Textarea label="Бележки от огледа" maxLength={600} showCount />
<Textarea label="Съобщение" error="Моля, въведете съобщение" />
```

- Default 4 rows; 5–6 for the main enquiry form.
- `showCount` + `maxLength` only where a real limit exists.
- Resize is vertical-only by design.
