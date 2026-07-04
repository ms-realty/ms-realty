# Stat

KPI tile for dashboards and market blocks — serif display value on a white card, tonal icon chip, optional trend pill.

```jsx
<Stat label="Активни имоти" value="132" icon="building-2" />
<Stat label="Продажби Q2" value="€4.2M" icon="banknote" delta="+12%" trend="up" note="спрямо Q1" />
<Stat label="Средно време до сделка" value="27 дни" icon="clock" delta="−3 дни" trend="up" />
```

- Pre-format `value` — € with thousands separators, units after numerals.
- Default `tone="ink"`; use `success`/`brick` only when the metric itself is semantic.
- Grid them: `display:grid; grid-template-columns:repeat(4,1fr); gap:16px`.
