Message catalogs, one JSON file per namespace (ux-spec §19.1). Bulgarian (`bg`) is the source
locale: types and the key set come from `bg`.

- `<locale>/<namespace>.json`: public and client hosts, all seven locales.
- `staff/<locale>/<namespace>.json`: staff host only, `bg`, `en` and `ru`.
- `_status.json`: human review status per catalog set and locale (`draft_unreviewed` or
  `approved` with a named reviewer and date). A draft never makes a locale indexable.

A new namespace is a new file in every locale of its set plus an entry in
`src/i18n/messages.ts`; `src/i18n/messages.test.ts` fails until both agree.
