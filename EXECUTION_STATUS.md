# MS Realty Crawl-First Slice Status

Date: 2026-07-04

## Completed

- Initialized `/Users/ivan/Code/MS-Realty` as a local git repository.
- Copied the source plan into `OPEN_SOURCE_SOTA_RESEARCH_AND_REFINEMENT.md`.
- Built and ran the local crawler/exporter for:
  - `https://makler-realty.com/sitemap.html`
  - `https://makler-realty.ru/sitemap_index.xml`
- Produced versioned crawl artifacts in `migration/artifacts/20260704-211155/`:
  - `url-inventory.csv`
  - `metadata-inventory.csv`
  - `media-inventory.csv`
  - `redirect-map-draft.csv`
  - `crawl-summary.md`
- Added a real-listing search fixture builder for Typesense and Meilisearch:
  - `search/build_search_indexes.py`
  - `search/data/listings.json`
  - `search/data/typesense-schema.json`
  - `search/data/typesense-listings.jsonl`
  - `search/data/meilisearch-settings.json`
  - `search/data/meilisearch-listings.ndjson`
- Added design-system screens in
  `makler-realty-design-system/project/ui_kits/remaining/index.html`:
  - Mobile search.
  - Listing detail.
  - Sell your property.
  - Broker lead inbox.
  - Property editor.
- Added 360 tour CMS field prototype with Photo Sphere Viewer contract:
  - `prototypes/360-tour-cms/README.md`
- Added CRM lead-intake examples:
  - `prototypes/crm-lead-intake/lead-intake-demo.json`
- Added mobile/elderly accessibility QA:
  - `qa/mobile_elderly_static_check.py`
  - `qa/mobile-elderly-accessibility.md`
- Added universal language coverage contract:
  - dynamic approved public locale registry in `locales/registry.json`
  - seeded public website locales BG, EN, DE, NL, RU, EL, HE
  - admin CMS/CRM locales BG, RU, EN
  - Hebrew RTL validation and Greek website coverage
- Added executable production foundation:
  - locale, SEO, Hermes, translation, lead, and migration contracts
  - normalized migration record builder in `production/scripts/build-migration-records.mjs`
  - launch-gate checks for row counts, domains, statuses, redirect review rows, and homepage redirects
- Added executable public route fixtures:
  - BG listing route `/bg/imoti/{id}`
  - Greek website route `/el/akinita/{id}`
  - Hebrew website route `/he/properties/{id}` with RTL metadata
  - French fallback/request flow without indexability
  - Hebrew mobile search backed by Typesense/Meilisearch fixtures
  - Admin CRM/CMS shell limited to BG, RU, and EN interface locales

## Crawl Counts

- Total URL rows: 457.
- `.com` URL rows: 278.
- `.ru` URL rows: 179.
- HTTP 200 pages: 457.
- Listing pages: 165.
- Taxonomy pages: 146.
- Informational/page rows: 104.
- Blog/post rows: 42.
- Media rows: 11,859.

## Guardrails Preserved

- No platform/CRM/CMS scaffolding was expanded beyond local prototypes.
- No bulk homepage/search-page redirect assumptions were generated.
- Sandanski is not described as a sea destination.
- Public brand copy uses MS Realty while existing internal Makler namespaces stay compatible with the current design-system bundle.
- Language coverage is registry-driven; Hermes drafts translations, humans approve indexable pages.

## Validation

```bash
python3 search/build_search_indexes.py
python3 -m py_compile migration/crawl_inventory.py search/build_search_indexes.py qa/mobile_elderly_static_check.py locales/validate_locale_registry.py
python3 locales/validate_locale_registry.py
npm run migration:build
npm run public:build
npm run test
npm run validate
python3 qa/mobile_elderly_static_check.py
```
