# Accordion

Expandable rows for FAQs, the buying process, and grouped listing features. Hairline dividers, rotating chevron, smooth height animation.

```jsx
<Accordion
  card
  defaultOpen={[0]}
  items={[
    { title: 'Могат ли чужденци да купуват имоти в България?',
      content: 'Гражданите на ЕС купуват апартаменти и къщи директно. За земя най-често се използва българско дружество — нашият екип урежда всичко.' },
    { title: 'Какви са разходите по сделката?', icon: 'receipt',
      content: 'Обичайно 3–4% върху цената: местен данък, такси за вписване и нотариус.' },
    { title: 'Колко време отнема покупката?',
      content: 'При готово финансиране — обикновено 4–6 седмици от резервация до нотариален акт.' },
  ]}
/>
```

- One row open by default (`multiple` only for feature groups).
- Answers are 1–3 plain sentences, max-width ~68ch.
- `card` wraps it in the standard white surface; omit inside an existing Card.
