# DataTable

Sortable table for listings, leads and viewings. Uppercase stone header (click to sort), hairline rows, hover wash when `onRowClick` is set.

```jsx
<DataTable
  onRowClick={(r) => open(r)}
  columns={[
    { key: 'ref',   label: 'Реф.',  width: 90, render: r => <span className="mk-tbl__mono">{r.ref}</span> },
    { key: 'title', label: 'Имот',  render: r => <span className="mk-tbl__primary">{r.title}</span> },
    { key: 'area',  label: 'Площ',  align: 'right', render: r => `${r.area} m²`, sort: r => r.area },
    { key: 'price', label: 'Цена',  align: 'right', render: r => <span className="mk-tbl__price">{eur(r.price)}</span>, sort: r => r.price },
  ]}
  rows={listings}
  empty={<EmptyState size="sm" icon="inbox" title="Няма записи" />}
/>
```

- Cell helpers: `mk-tbl__primary` (name), `mk-tbl__muted`, `mk-tbl__mono` (refs), `mk-tbl__price`.
- Right-align numbers and prices; `dense` for back-office density.
- Wrap in `Card padding="none"` (or a `.crm-panel`) so the header radius sits inside the card.
