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
  - structured SQLite migration database builder in `migration/build_migration_db.py`
  - metadata/media review dashboard in `production/data/migration-review-dashboard.json`
  - launch-gate checks for row counts, domains, statuses, redirect review rows, and homepage redirects
- Added executable legacy route map:
  - 165 listing URLs mapped to locale-prefixed production routes
  - 52 Russian listings mapped under `/ru/`
  - pages, posts, and taxonomy URLs left review-gated
  - zero homepage/search fallback redirects
- Added migration review queue:
  - 457 crawled URLs assigned to review owners
  - 179 `.ru` rows owned by `ru_preservation_editor`
  - 292 non-listing rows remain unmapped until editorial review
  - zero review-queue rows are deployable
- Added reviewed deployable redirect export:
  - `production/data/redirect-approvals.jsonl` records explicit reviewer approvals
  - `production/data/deployable-redirects.json` exports only approved same-content 301s
  - smoke export includes one BG listing and one RU listing
  - legacy route map remains fully non-deployable until each row is reviewed
- Added authenticated migration review workbench contract:
  - `GET /api/admin/migration/review` exposes the metadata/media dashboard, route review sample, existing redirect approvals, and deployable preview
  - `GET /admin/migration/review` renders the same review data as an admin-only HTML workbench
  - `POST /api/admin/redirect-approvals` appends reviewed same-content approvals without changing live redirects directly
  - redirect approvals accept JSON and form-encoded admin submissions
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
  - `/api/search` returns reviewed translation cards for those admin-added approved locales
- Added locale homepage route resolution:
  - approved locale roots like `/he/` serve a real homepage with search, seller, contact, location, and featured listing paths
  - disabled locale roots like `/fr/` stay in the non-indexable fallback/request flow
  - homepage routes are included in hreflang and sitemap output
- Added crawlable location route resolution:
  - source listing locations generate locale-prefixed location pages only when that locale has at least one indexable listing in the location
  - Hebrew Sandanski route `/he/locations/sandanski` serves reviewed inventory and HTML
  - empty locale-location pairs return noindex/404 instead of creating thin localized pages
- Added runtime search filtering:
  - text query and location/property type/offer type/price/bedroom filters apply before card pagination
  - search responses expose `total_matches` and `returned`
  - saved searches persist the full filtered match count, not just the first page size
- Added listing conversion/share contract:
  - listing pages expose sticky mobile inquiry, callback, and viewing request actions backed by `POST /api/leads`
  - save, family-share, and browser-print/PDF-ready intents are present in the public listing payload
  - `?print=1` serves a locale-aware, SEO-canonical, browser-print listing document
  - direct phone, WhatsApp, and Viber channels stay review-gated until broker contact data is approved
- Added contact preference preservation:
  - lead intake accepts phone, Viber, WhatsApp, and email preferences
  - CRM inbox and append-only lead ledger store the normalized contact preference
  - invalid contact channels are rejected at the shared lead boundary
- Added broker contact approval workflow:
  - `POST /api/admin/broker-contacts` stores reviewer-approved broker phone data
  - listing pages keep direct phone, WhatsApp, and Viber links disabled until approval exists
  - approved rows enable `tel:`, WhatsApp, and Viber links on the public listing payload
- Added reviewer-approved 360 tour publishing workflow:
  - `POST /api/admin/tours/approve` stores approved Photo Sphere Viewer panorama data in `production/data/tour-approvals.jsonl`
  - public listing routes overlay approved tours only after reviewer approval
  - approved tours expose `psv-listing-tour` mount data while imported crawl tour media stays gated by default
- Added authenticated CMS translation review endpoints:
  - `POST /api/admin/translations/draft` creates non-indexable Hermes drafts
  - `POST /api/admin/translations/publish` requires reviewer approval before indexability
  - `production/data/translation-tasks.jsonl` stores draft and published review rows
- Added authenticated listing edit endpoint:
  - `GET /admin/listings/edit?listingId=MS-CRAWL-0001` renders a BG/RU/EN admin property editor for imported listing facts
  - `POST /api/admin/listings/edit` stores reviewed source edits
  - listing edits accept JSON and form-encoded admin submissions
  - dependent translations are marked stale and non-indexable after source changes
  - `production/data/listing-edits.jsonl` stores the deterministic property editor smoke row
- Added stale-aware public listing rendering:
  - served listing routes overlay latest translation review ledger rows
  - stale Greek listing smoke returns `noindex,follow`
- Added approved-translation-gated localized sitemap fixture:
  - approved locale homepages included for public website locales
  - BG and RU source listings included from published crawl fixtures
  - Greek and Hebrew included only for explicit approved seed translations
  - approved location pages included for real inventory locations
  - public seller valuation pages included for each indexable website locale
  - public contact callback pages included for each indexable website locale
  - current generated sitemap contains 194 approved localized routes
  - unapproved French excluded
- Added generated SEO files:
  - `production/data/sitemap.xml` from approved localized sitemap entries
  - `production/data/robots.txt` pointing at the sitemap
  - HTTP and live server smoke coverage for `/sitemap.xml` and `/robots.txt`
- Added canonical CMS seed fixture:
  - 165 listing records composed from crawl/search evidence
  - 4,978 listing media rows attached
  - 2,544 imported photo assets normalized as public gallery candidates
  - 2 floor-plan candidates and 2,434 non-gallery assets kept review-gated
  - zero video assets invented from crawl media
  - draft Photo Sphere Viewer 360 tour fields attached with gallery fallback
  - no unreviewed crawl media is published as a public 360 panorama
  - migration and route review state carried into each listing
  - approved translations included without unapproved French drafts
- Added runtime smoke fixture:
  - resolves Hebrew and Russian locale-prefixed listing routes from CMS seed
  - runs Hebrew mobile-first search from CMS seed
  - resolves Hebrew contact callback route `/he/contact`
  - keeps French fallback non-indexable
  - accepts Hebrew buyer, viewing, and contact callback leads into the EN admin queue with broker approval required
  - exposes a moderated public photo gallery instead of raw crawl media
  - exposes a draft 360 tour field with non-WebGL fallback gallery on listing pages
- Added HTTP JSON adapter smoke fixture:
  - `GET /he/properties/MS-CRAWL-0001`
  - `GET /api/search?locale=he&q=Sandanski`
  - `GET /he/contact`
  - `GET /fr/`
  - `POST /api/leads`
- Added server-rendered HTML adapter:
  - `GET /he/` serves a Hebrew RTL homepage with search, seller, and contact paths
  - `GET /he/properties/MS-CRAWL-0001` serves listing HTML when `Accept: text/html` or `?format=html` is present
  - `GET /he/search?q=Sandanski` serves locale-scoped search HTML
  - `GET /he/sell` serves a Hebrew RTL seller valuation page backed by `POST /api/leads`
  - `GET /he/contact` serves a Hebrew RTL callback page backed by `POST /api/leads`
  - HTML includes `lang`, `dir`, canonical, robots, hreflang, and listing schema metadata
  - direct phone, WhatsApp, and Viber links stay absent until broker contact approval exists
- Added live Node server smoke fixture:
  - starts a stdlib HTTP server on an ephemeral local port
  - fetches Hebrew listing and Hebrew search endpoints
  - fetches Hebrew listing/search HTML through browser-style content negotiation
  - posts valid Hebrew buyer, viewing, and contact callback leads
  - rejects an unknown buyer listing reference
- Added append-only CRM lead ledger:
  - persists accepted HTTP buyer, viewing request, contact callback, and seller lead intake as JSONL
  - stores source classification so viewing requests and generic contact callbacks remain distinguishable in CRM
  - stores original language, admin queue locale, listing reference, and broker approval gate
  - keeps smoke artifact deterministic
- Added gated admin lead inbox endpoint:
  - `GET /api/admin/leads?locale=ru` reads the persisted ledger
  - `GET /admin/leads?locale=ru` renders the same CRM queue as an admin-only HTML inbox
  - unauthorized requests return `401`
  - admin workspace still exposes only BG, RU, and EN
- Added broker-approved reply outbox:
  - `POST /api/admin/replies` requires admin bearer token
  - accepts JSON and form-encoded reviewed replies
  - verifies the lead exists in the ledger
  - requires reviewer and explicit broker approval
  - queues replies for manual send instead of auto-sending
- Added broker viewing/task booking:
  - `POST /api/admin/viewings` requires admin bearer token
  - verifies the lead exists in the CRM ledger
  - persists a booked viewing row with an open follow-up task
  - `GET /api/admin/viewings.ics` exports booked viewings as an admin-gated calendar feed
  - authenticated admin inbox returns persisted viewing rows
- Added saved search and alert intake:
  - `POST /api/saved-searches` stores locale-scoped search criteria
  - current match count is calculated from the runtime search renderer
  - persisted rows create open alert tasks for broker follow-up
  - authenticated admin inbox returns persisted saved searches
- Added seller valuation pipeline intake:
  - seller leads from `POST /api/leads` create a seller pipeline row
  - persisted seller rows start at `valuation_requested`
  - callback and appraisal checklist items are opened for broker follow-up
  - authenticated admin inbox returns persisted seller pipeline rows
- Added locale-prefixed contact callback intake:
  - `GET /he/contact` resolves as an approved Hebrew public page
  - contact pages carry hreflang/canonical metadata and participate in sitemap output
  - `website_contact_callback` leads are stored as `general` CRM leads and remain broker-approval gated
- Added executable public route fixtures:
  - BG listing route `/bg/imoti/{id}`
  - Greek website route `/el/akinita/{id}`
  - Hebrew website route `/he/properties/{id}` with RTL metadata
  - Hebrew contact route `/he/contact` with callback lead payload
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
python3 -m py_compile migration/crawl_inventory.py migration/build_migration_db.py search/build_search_indexes.py search/validate_search_imports.py qa/mobile_elderly_static_check.py locales/validate_locale_registry.py
python3 locales/validate_locale_registry.py
npm run migration:build
python3 migration/build_migration_db.py
npm run routes:build
npm run migration:review
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
