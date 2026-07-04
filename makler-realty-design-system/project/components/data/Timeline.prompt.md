# Timeline

Vertical activity feed — lead history, listing price changes, office activity. Icon circles on a hairline spine.

```jsx
<Timeline items={[
  { icon: 'phone',         text: <><b>Мария Стоянова</b> проведе разговор с Й. ван дер Берг</>, meta: 'Мария · днес, 10:20' },
  { icon: 'calendar-days', text: <>Оглед на <b>MS-2214</b> насрочен за събота</>,               meta: 'Петър · вчера' },
  { icon: 'trending-down', tone: 'brick', text: <>Цената на <b>MS-1187</b> е намалена до €189,000</>, meta: 'система · 2 юли' },
  { icon: 'file-check',    tone: 'success', text: <>Предварителен договор подписан — <b>MS-0954</b></>, meta: 'Елена · 28 юни' },
]} />
```

- Keep `tone` mostly `ink`; `brick` for price-reduced, `success` for closed/signed.
- `text` is one sentence; bold the subject with `<b>`.
