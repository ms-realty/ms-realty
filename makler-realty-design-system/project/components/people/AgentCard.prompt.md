# AgentCard

The agent contact card — sticky panel beside a listing gallery, tile on the team page, header of a message thread (`layout="row"`).

```jsx
<AgentCard
  name="Мария Стоянова"
  role="Старши брокер"
  office="Свети Влас"
  phone="+359 88 421 7788"
  langs={['BG', 'EN', 'RU']}
  callLabel="Обади се"
  messageLabel="Изпрати съобщение"
  onCall={call}
  onMessage={write}
/>

<AgentCard layout="row" name="Петър Илиев" role="Брокер" office="Банско" langs={['BG','EN','DE']} callLabel="Обади се" onCall={call} />
```

- The call button is `accent` — this is one of the two sanctioned uses of the brand red. Message stays `secondary`.
- `langs` chips answer the buyer's first question: *will they speak my language?* Always pass them.
- Localise `callLabel`/`messageLabel`; defaults are English.
