# Pagination

Numbered page navigation for search results. Prev/next arrows plus page numbers that collapse to ellipses; the current page fills with Sea.

```jsx
const [page, setPage] = React.useState(1);
<Pagination page={page} totalPages={18} onChange={setPage} />
```

- `siblings` controls how many numbers show either side of the current page.
- Arrows disable at the first / last page.
