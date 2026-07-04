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
  - `search/data/index-listings.json`
  - `search/data/typesense-schema.json`
  - `search/data/typesense-listings.jsonl`
  - `search/data/meilisearch-settings.json`
  - `search/data/meilisearch-listings.ndjson`
  - search imports now include 167 locale-scoped documents: 165 source listings plus approved Greek and Hebrew translation documents for `MS-CRAWL-0001`
  - `search/validate_search_imports.py` validates the Typesense and Meilisearch import payloads locally
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
- Added executable legacy route map:
  - 165 listing URLs mapped to locale-prefixed production routes
  - 52 Russian listings mapped under `/ru/`
  - pages, posts, and taxonomy URLs left review-gated
  - zero homepage/search fallback redirects
- Added reviewed deployable redirect export:
  - `production/data/redirect-approvals.jsonl` records explicit reviewer approvals
  - `production/data/deployable-redirects.json` exports only approved same-content 301s
  - smoke export includes one BG listing and one RU listing
  - legacy route map remains fully non-deployable until each row is reviewed
- Added runtime serving for reviewed legacy redirects:
  - HTTP and live Node server smokes return `301 Location: /bg/imoti/MS-CRAWL-0001`
  - mapped but unapproved listing rows do not redirect
- Added language request intake for unavailable website locales:
  - `POST /api/language-requests` stores non-indexable requests
  - French fallback users route into the EN admin queue
  - authenticated admin inbox includes language requests next to leads and replies
- Added authenticated admin locale creation:
  - `POST /api/admin/locales` adds a website locale without changing BG/RU/EN admin languages
  - new locales are non-public and non-indexable by default
  - `production/data/admin-locale-registry-smoke.json` proves the deterministic Spanish smoke row
- Added dynamic locale listing route resolution:
  - translation ledger rows now participate in public listing route matching
  - a newly added public locale can draft, approve, publish, and serve a locale-prefixed listing without seed-code changes
  - served `/sitemap.xml` includes approved dynamic locale translations from the review ledger
- Added authenticated CMS translation review endpoints:
  - `POST /api/admin/translations/draft` creates non-indexable Hermes drafts
  - `POST /api/admin/translations/publish` requires reviewer approval before indexability
  - `production/data/translation-tasks.jsonl` stores draft and published review rows
- Added authenticated listing edit endpoint:
  - `POST /api/admin/listings/edit` stores reviewed source edits
  - dependent translations are marked stale and non-indexable after source changes
  - `production/data/listing-edits.jsonl` stores the deterministic property editor smoke row
- Added stale-aware public listing rendering:
  - served listing routes overlay latest translation review ledger rows
  - stale Greek listing smoke returns `noindex,follow`
- Added approved-translation-gated localized sitemap fixture:
  - BG and RU source listings included from published crawl fixtures
  - Greek and Hebrew included only for explicit approved seed translations
  - unapproved French excluded
- Added generated SEO files:
  - `production/data/sitemap.xml` from approved localized sitemap entries
  - `production/data/robots.txt` pointing at the sitemap
  - HTTP and live server smoke coverage for `/sitemap.xml` and `/robots.txt`
- Added canonical CMS seed fixture:
  - 165 listing records composed from crawl/search evidence
  - 4,978 listing media rows attached
  - migration and route review state carried into each listing
  - approved translations included without unapproved French drafts
- Added runtime smoke fixture:
  - resolves Hebrew and Russian locale-prefixed listing routes from CMS seed
  - runs Hebrew mobile-first search from CMS seed
  - keeps French fallback non-indexable
  - accepts a Hebrew buyer lead into the EN admin queue with broker approval required
- Added HTTP JSON adapter smoke fixture:
  - `GET /he/properties/MS-CRAWL-0001`
  - `GET /api/search?locale=he&q=Sandanski`
  - `GET /fr/`
  - `POST /api/leads`
- Added live Node server smoke fixture:
  - starts a stdlib HTTP server on an ephemeral local port
  - fetches Hebrew listing and Hebrew search endpoints
  - posts a valid Hebrew buyer lead
  - rejects an unknown buyer listing reference
- Added append-only CRM lead ledger:
  - persists accepted HTTP buyer and seller lead intake as JSONL
  - stores original language, admin queue locale, listing reference, and broker approval gate
  - keeps smoke artifact deterministic
- Added gated admin lead inbox endpoint:
  - `GET /api/admin/leads?locale=ru` reads the persisted ledger
  - unauthorized requests return `401`
  - admin workspace still exposes only BG, RU, and EN
- Added broker-approved reply outbox:
  - `POST /api/admin/replies` requires admin bearer token
  - verifies the lead exists in the ledger
  - requires reviewer and explicit broker approval
  - queues replies for manual send instead of auto-sending
- Added executable public route fixtures:
  - BG listing route `/bg/imoti/{id}`
  - Greek website route `/el/akinita/{id}`
  - Hebrew website route `/he/properties/{id}` with RTL metadata
  - French fallback/request flow without indexability
  - Hebrew mobile search backed by Typesense/Meilisearch fixtures
  - Admin CRM/CMS shell limited to BG, RU, and EN interface locales
- Added executable admin workflow fixtures:
  - Hermes CMS translation drafts for Hebrew and Greek listings
  - human approval/publish gates before indexability
  - Hebrew buyer lead intake routed to EN admin queue
  - Greek seller valuation lead intake routed to EN admin queue
  - broker approval required before Hermes reply drafts can be sent

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
python3 search/validate_search_imports.py
python3 -m py_compile migration/crawl_inventory.py search/build_search_indexes.py search/validate_search_imports.py qa/mobile_elderly_static_check.py locales/validate_locale_registry.py
python3 locales/validate_locale_registry.py
npm run migration:build
npm run routes:build
npm run redirects:build
npm run sitemap:build
npm run seo:build
npm run cms:build
npm run public:build
npm run admin:build
npm run runtime:build
npm run http:build
npm run server:smoke
npm run test
npm run validate
python3 qa/mobile_elderly_static_check.py
```
