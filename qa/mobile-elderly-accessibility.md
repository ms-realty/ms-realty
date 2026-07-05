# Mobile / Elderly Accessibility QA

Date: 2026-07-04

Scope:

- `makler-realty-design-system/project/ui_kits/remaining/index.html`
- Crawl artifact `migration/artifacts/20260704-211155/`
- Search fixtures under `search/data/`

## Result

Pass for the current local prototype slice.

## Checks

- Touch targets use a 48px baseline for primary tab, form, and action controls.
- Mobile search keeps one clear search field, horizontal chips, and a sticky phone CTA.
- Listing detail keeps direct Call, Viber, and Ask actions visible after scrolling.
- Seller intake is short, phone-first, and does not publish a property without broker review.
- Broker inbox exposes source, channel, stage, and next action without hiding the callback task.
- Property editor separates core listing, SEO/translation readiness, and the 360 tour field.
- Dynamic approved locales are registry-driven instead of fixed to five chips.
- Website locales include Greek and Hebrew for Israel; Hebrew is marked RTL.
- Admin CMS/CRM locale coverage is BG, RU, and EN.
- Photo Sphere Viewer is represented by a CMS mount target, panorama URL, hotspot readiness, and required accessibility caption.
- Sandanski copy is residential/spa-oriented; no sea-resort framing is introduced.
- Redirect safety is preserved: the editor screen explicitly rejects homepage redirect assumptions.

## Static Gate

Run:

```bash
npm run qa:mobile
python3 qa/mobile_elderly_static_check.py
```

Expected:

```text
PASS: mobile/elderly static QA markers present
PASS: dynamic approved locale registry includes public Greek/Hebrew and admin bg/ru/en
PASS: crawl rows url=457 metadata=457 media=11859 redirect=457
```

`npm run qa:mobile` writes `production/data/mobile-elderly-qa-report.json`
from rendered public pages and fails if the live HTML loses:

- Hebrew `lang`/`dir` coverage.
- Mobile search form and list-first result marker.
- Sticky listing actions.
- Phone-first seller/contact forms.
- Noindex fallback language request flow.
- BG/RU/EN admin language policy plus Greek/Hebrew market coverage.

## Remaining Manual QA Before Visual Polish

- Test with browser zoom at 125%, 150%, and 200%.
- Test VoiceOver focus order across tab buttons, phone actions, form fields, and CRM quick actions.
- Test touch ergonomics on a real narrow mobile viewport.
- Verify final brand/logo usage against the production asset once the migration URL map is locked.
