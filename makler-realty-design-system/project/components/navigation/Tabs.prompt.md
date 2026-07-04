# Tabs

Section switcher. `underline` (default) for page sections; `segmented` for compact view toggles.

```jsx
const [tab, setTab] = React.useState('overview');

<Tabs
  value={tab} onChange={setTab}
  items={[
    { key: 'overview', label: 'Преглед' },
    { key: 'features', label: 'Характеристики' },
    { key: 'location', label: 'Локация', icon: 'map-pin' },
    { key: 'similar',  label: 'Подобни', count: 6 },
  ]}
/>

<Tabs variant="segmented" size="sm" value={view} onChange={setView}
  items={[{ key: 'grid', label: 'Решетка' }, { key: 'list', label: 'Списък' }, { key: 'map', label: 'Карта' }]} />
```

- Active state is a charcoal underline / white pill — never red.
- `count` pills for result-bearing tabs (Подобни · 6).
- Keep labels to one word where possible; they must survive DE/NL translation widths.
