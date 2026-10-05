Message catalogs, one JSON file per namespace (ux-spec §19.1). Bulgarian (`bg`) is the source
locale: types and the key set come from `bg`.

- `<locale>/<namespace>.json`: public and client hosts, all seven locales.
- `staff/<locale>/<namespace>.json`: staff host only, `bg`, `en` and `ru`.
- `_status.json`: human review status per catalog set and locale (`draft_unreviewed` or
  `approved` with a named reviewer and date). A draft never makes a locale indexable.
- `_cognates.json`: messages whose value is deliberately the same word as in `bg` or `en`.

A new namespace is a new file in every locale of its set plus an entry in
`src/i18n/messages.ts`; `src/i18n/messages.test.ts` fails until both agree. That test also
checks each value: written in its locale's script, not copied from `bg` or `en` (unless listed
in `_cognates.json`), same placeholders, numbers and links as the source, and Sandanski never
by the sea.

Interface copy still written in TypeScript is counted by `src/i18n/copy-guard.test.ts` against
`src/i18n/copy-baseline.json`; that list may only shrink (design/i18n-uncatalogued-copy-plan.md).
