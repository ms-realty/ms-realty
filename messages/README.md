Message catalogs, one JSON file per namespace (ux-spec §19.1). Bulgarian (`bg`) is the source
locale: types and the key set come from `bg`.

- `<locale>/<namespace>.json`: public and client hosts, all seven locales.
- `staff/<locale>/<namespace>.json`: staff host only, `bg`, `en` and `ru`.
- `_status.json`: human review status per catalog set and locale (`draft_unreviewed` or
  `approved` with a named reviewer and date). A draft never makes a locale indexable.

A new namespace is a new file in every locale of its set plus an entry in
`src/i18n/messages.ts`; `src/i18n/messages.test.ts` fails until both agree.

Discovery, intent and map interface text now lives in their named public namespaces.
Feature accessors retain their existing keys, values and per-call object ownership. Listing
prose, source facts, metadata and route behavior are governed separately.

New namespace entries in `_status.json` start `draft_unreviewed` for every locale. Moving
existing text into a catalog does not establish human language review or indexability.

The copy guard measures interface text still held in TypeScript and holds it to the current
`src/i18n/copy-baseline.json` ratchet. That inventory records remaining migration work; it is
not a language-quality or human-approval report. `_cognates.json` lists exact shared-word
exceptions to duplicate-text checks and does not grant translation approval.
