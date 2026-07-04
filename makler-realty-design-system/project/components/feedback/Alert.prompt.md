# Alert

Inline notice — form results, saved-search updates, page-level messages. Tonal fill, hairline border, optional dismiss and text-link actions.

```jsx
<Alert variant="success" title="Enquiry sent">An agent who speaks your language will reply within one working day.</Alert>
<Alert variant="info" icon="bell">3 new homes match your saved search.</Alert>
<Alert variant="warning" title="Viewing unconfirmed" onDismiss={close}>The owner has not confirmed Saturday yet.</Alert>
<Alert variant="danger" title="Could not send" actions={<button className="mk-alert__link">Try again</button>}>Check your email address.</Alert>
```

- Variants: `info` (charcoal — the monochrome default) · `success` · `warning` · `danger` (cooler crimson, never the brand red).
- Keep the body to 1–2 plain sentences; no exclamation marks.
- Use for in-flow messages. It is **not** a toast system — place it where the action happened (top of the form, above results).
