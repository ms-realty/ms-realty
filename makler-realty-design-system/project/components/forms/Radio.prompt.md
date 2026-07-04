# Radio

Single-choice control — buy vs rent, or a mutually exclusive filter. Group options by giving them the same `name`.

```jsx
<Radio name="deal" value="sale" label="For sale" defaultChecked />
<Radio name="deal" value="rent" label="For rent" />
```

- Wraps a native radio — pass `name`, `value`, `checked`/`defaultChecked`, `onChange`.
