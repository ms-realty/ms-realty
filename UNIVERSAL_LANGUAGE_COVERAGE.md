# Universal Language Coverage

Date: 2026-07-04

MS Realty now treats language coverage as a dynamic approved-locale workflow,
not a fixed BG/EN/DE/NL/RU list.

## Current Contract

- Source/editorial locale: BG.
- Admin CMS/CRM locales: BG, RU, EN.
- Seeded public website locales: BG, EN, DE, NL, RU, EL, HE.
- Greek (`el`) and Hebrew for Israel (`he`) are public website locales.
- Hebrew is RTL and must pass layout QA.
- Locale-prefixed URLs are the production standard.
- Hermes Agent may draft translations, but cannot publish them or mark pages
  indexable.
- Only human-approved translations become public indexable pages.

Source of truth:

- `locales/registry.json`
- `locales/validate_locale_registry.py`

## Production Flow

1. Admin adds or enables a locale in the registry.
2. Hermes Agent drafts translations from BG/source content.
3. Reviewer edits and approves the translation.
4. Approved translation becomes public and indexable.
5. Hreflang, sitemap, search index, and localized routes are generated.
6. Source edits mark dependent translations stale and create review tasks.

## Prototype Coverage

- `makler-realty-design-system/project/ui_kits/remaining/index.html` shows the
  dynamic public language selector, locale request fallback, Greek, Hebrew RTL,
  and BG/RU/EN admin language coverage.
- `search/build_search_indexes.py` keeps the 165 source-listing corpus separate
  from the 167-document search index feed, with approved Greek and Hebrew
  translation documents included only when indexable.
- `POST /api/admin/locales` adds new website locales as non-indexable drafts
  while keeping admin CMS/CRM languages limited to BG, RU, and EN.
- `prototypes/crm-lead-intake/lead-intake-demo.json` includes Greek and Hebrew
  website leads routed into the BG/RU/EN admin workflow.
- `qa/mobile_elderly_static_check.py` validates the locale registry and screen
  markers.
