# Switch

On/off toggle for settings that take effect immediately (alerts, map auto-pan). For a form choice that needs submitting, use Checkbox instead.

```jsx
<Switch label="Email me new listings" defaultChecked />
<Switch label="Show sold properties" size="sm" />
```

- Wraps a native checkbox with `role="switch"` — pass `checked`/`defaultChecked`/`onChange`.
