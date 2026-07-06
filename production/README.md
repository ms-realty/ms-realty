# MS Realty Production Foundation

This folder contains the executable production contracts used by the Next.js
App Router bridge in `../app/`. The contracts stay mostly Node-stdlib code so
URL, locale, AI, migration, and lead policy remains testable outside the app
framework.

What it proves now:

- Dynamic approved locale registry.
- Locale-prefixed public listing routes.
- Hreflang generation only for approved/indexable translations.
- Hermes Agent draft-only translation guardrails (the Hermes engine — self-hosted Nous
  open-weight Hermes models + function-calling format — is specified in
  `../SOURCE_OF_TRUTH.md` §11; these contracts define the guardrail it must satisfy).
- Translation stale-state rules.
- CRM lead language routing into BG/RU/EN admin queues.
- Search fixtures carry locale/indexability metadata and approved translation documents.
- Search import payloads validate locally for Typesense and Meilisearch.
- Normalized migration records from the crawl CSVs with launch-gate checks.
- Structured SQLite migration database imported from the crawl CSVs.
- Migration review dashboard for metadata gaps, media reconciliation, and redirect safety.
- Legacy route map for reviewed listing redirects and unmapped review queues.
- Migration review queue with BG/RU admin owners for every crawled URL.
- Generated 165-row redirect approval workbook for mapped listings.
- Separate reviewed redirect approval ledger and deployable 301 export.
- Optional human-reviewed redirect approval CSV import at `migration/reviews/redirect-approvals.csv`.
- Authenticated admin migration review endpoint for the dashboard, route worklist, and redirect approval preview.
- Authenticated admin migration review HTML workbench for mapped listing approvals.
- Authenticated redirect approval endpoint that appends reviewed same-content mappings without changing live redirects.
- Localized sitemap fixture gated by approved translation records.
- Generated `sitemap.xml` and `robots.txt` from approved localized sitemap entries.
- Canonical CMS seed records composed from crawl, route, translation, and media evidence.
- Moderated public media contract that separates imported gallery photos from review-gated floor-plan/video/tour assets.
- Draft Photo Sphere Viewer 360 tour fields with required gallery fallback policy.
- Authenticated 360 tour approval endpoint and ledger; approved tours overlay public listing routes with Photo Sphere Viewer mount data.
- Public route fixtures for locale-prefixed listing/search/contact/fallback routes.
- Locale homepages with search, seller, contact, location, and featured listing paths.
- Crawlable location pages generated from reviewed listing inventory.
- Admin CRM/CMS shell language availability in BG, RU, and EN.
- Website route coverage for Greek `/el/` and Israel-facing Hebrew `/he/`,
  including Hebrew RTL metadata.
- Admin workflow fixtures for Hermes CMS translation review and CRM lead reply drafts.
- Authenticated admin translation draft and human-approved publish endpoints.
- Translation coverage report that turns missing/stale listing locale coverage into open non-indexable reviewer tasks.
- Authenticated listing edit endpoint that marks dependent translations stale.
- Authenticated listing editor HTML workbench backed by the same stale-translation edit endpoint.
- Authenticated listing slug-change endpoint that creates path-only automatic 301s to the current canonical listing route.
- Listing status edits keep sold/rented/archived pages live for SEO while removing them from active search and location inventory.
- Public listing routes overlay translation ledger state before indexability.
- Runtime smoke fixture for listing route, search route, contact route, fallback route, and lead intake.
- HTTP JSON adapter smoke fixture for listing, search, contact, fallback, and lead endpoints.
- Server-rendered HTML adapter for listing, search, contact, and fallback pages with SEO metadata.
- Open Graph metadata in server-rendered public HTML, including listing `og:image` from reviewed gallery media.
- Structured-data launch report for every indexable listing sitemap entry.
- Listing quality report that turns missing price, bedroom, location, alt text, thin gallery, media review, and tour review warnings into admin editor links.
- 165-row listing quality workbook for editor import/review.
- Listing publication report that proves sitemap coverage and internal-link suggestions for every CMS listing.
- Listing verification report that creates open broker verification tasks for edited listings, with high priority for stale translations and price/status changes.
- Locale-prefixed seller valuation page backed by the existing seller lead pipeline.
- Locale-prefixed contact callback page backed by the existing gated CRM lead intake.
- Live Node HTTP server smoke fixture on an ephemeral local port.
- Runtime 301 handling for reviewed legacy redirects only.
- Runtime 301 handling for reviewed CMS listing slug changes without homepage/search-page assumptions.
- Runtime locale roots serve public homepages for approved locales and keep disabled locales in the fallback/request flow.
- Runtime search query/facet filtering before pagination, with total match counts.
- Runtime location routes expose only locale-indexable listing cards and return noindex/404 for empty locale-location pairs.
- Listing conversion actions for inquiry, callback, viewing request, save, share, and browser print-to-PDF, with direct broker contact channels review-gated.
- Broker contact approval ledger that enables direct phone, WhatsApp, and Viber links only after review.
- Lead contact preference validation and persistence for phone, Viber, WhatsApp, and email.
- Search API overlays translation ledger state before card display/indexability.
- Search API returns reviewed translation cards for admin-added approved locales.
- Search engine sync worker path for Typesense and Meilisearch imports from the same reviewed 167-document fixture.
- Search engine query smoke path that verifies both engines can return the reviewed BG listing document without draft locales.
- Language request intake for unavailable public locales.
- Authenticated admin locale creation for non-indexable website locales.
- Locale rollout report that turns requested disabled locales into approval tasks and public Hermes locales into draft queue summaries.
- Hermes draft dispatch batch that prepares real crawl-backed listing prompts with citations while keeping drafts non-publishing and reviewer-gated.
- Hermes draft worker path that calls an OpenAI-compatible vLLM/Hermes endpoint, validates JSON output, and persists only non-indexable review drafts.
- Authenticated launch input checklist endpoint for redirect, SEO, listing-quality, and live-service launch handoff gates.
- App Router manifest that maps every approved public route to a Next-compatible route handler, renderer, cache policy, and `lang`/`dir`.
- Minimal App Router route-handler bridge under `app/` for homepage, search, and catch-all content routes, reusing the server-rendered HTML contracts.
- Next App Router `sitemap.xml` and `robots.txt` handlers backed by the same approved localized sitemap contract.
- Next App Router public API handlers for health, readiness, search, and lead intake backed by the same HTTP contracts.
- Next App Router public API handlers for analytics events, language requests, and saved searches.
- Next App Router admin read pages for CRM lead inbox and CMS listing editor behind the same bearer auth gate.
- Next App Router admin JSON lead inbox endpoint for broker CRM consumers.
- Next App Router admin write handlers for reviewed replies and listing edits used by those admin pages.
- Next App Router admin CRM lifecycle handlers for viewing bookings, viewing calendar export, and deal close tasks.
- Next App Router admin media/contact handlers for reviewed broker contacts and approved 360 tours.
- Next App Router admin locale and translation handlers for dynamic language rollout without AI auto-publish.
- Next App Router admin launch-readiness, launch-input checklist, and SEO evidence read endpoints.
- Next App Router admin redirect review handlers for approval workbook, CSV import, single approvals, and deployable export.
- Next App Router admin listing slug-change handler for reviewed path-only 301 creation.
- Next App Router admin listing-quality workbook and import handlers for facts/media review rows.
- Next App Router admin SEO evidence template/import handlers and launch-readiness export.
- Next App Router admin migration review workbench for crawl, redirect, SEO, and listing-quality handoff.
- `next build` gate over the App Router handlers, pinned to Next 16 and React 19.
- Admin-approved dynamic locale translations resolve as locale-prefixed listing routes.
- Served sitemap XML includes approved dynamic locale translations from the review ledger.
- Served sitemap XML includes approved home and location pages without unapproved French routes.
- Append-only lead ledger for persisted buyer inquiry, viewing request, contact callback, and seller valuation smoke rows, including source classification.
- Lead intake returns a deterministic instant-confirmation contract without sending unreviewed messages.
- Lead ledger rows create an immediate broker follow-up SLA task and manager escalation timestamp.
- Lead SLA report creates broker reminders and manager escalations from unreplied missed leads.
- Broker assignment is rules-based by language plus listing location/type, with validated manual override.
- Lead ledger duplicate detection stores privacy-safe contact fingerprints instead of raw contact fields.
- Gated admin lead inbox JSON endpoint with BG/RU/EN interface locale support.
- Gated admin lead inbox HTML endpoint with BG/RU/EN interface locale support.
- Broker-approved reply outbox for reviewed CRM replies; Hermes drafts are never auto-sent.
- Broker reply approval accepts JSON and form-encoded admin submissions.
- Broker-booked viewing ledger with open follow-up tasks and admin `.ics` calendar export from existing CRM leads.
- Booked viewings create post-viewing feedback request tasks using the lead contact preference.
- Closed-deal ledger with testimonial and referral request tasks from existing CRM leads.
- Saved-search ledger with open alert tasks from public search criteria.
- Saved-search alert report that compares persisted search criteria with current runtime inventory and opens broker alert tasks only for increased match counts.
- Seller valuation pipeline ledger with callback/appraisal tasks from seller leads.
- Privacy-safe analytics event ledger for page views, searches, lead submissions, and CTA clicks.
- SEO evidence join artifact for Search Console, Yandex Webmaster, backlinks, and privacy analytics.
- Local-only external SEO export templates under `migration/external/seo/`.
- Launch readiness report that aggregates crawl, redirect, sitemap, schema, monitoring, and rollback gates.
- Public health endpoint that reports liveness while still exposing launch blockers.
- Public readiness endpoint that returns `503` until launch gates pass.
- Production Node server adapter exposed by `npm start`.
- Public seller and contact pages are included in the localized sitemap for approved website locales.
- Generated mobile/elderly QA report over rendered public HTML, including Hebrew RTL, search form, sticky listing actions, phone-first forms, fallback noindex, and BG/RU/EN admin language policy.

Run:

```bash
npm run check
```

Fail closed before launch:

```bash
npm run redirects:preflight
npm run seo:preflight:report
npm run seo:preflight
npm run listing:preflight:report
npm run listing:preflight
npm run live:report
npm run live:preflight
npm run launch:preflight
```

`redirects:preflight` passes once reviewed 301 approvals are present. `seo:preflight:report` writes the current
SEO export status without clearing the launch gate, and `seo:preflight` still exits
non-zero until real external SEO exports are complete. `listing:preflight:report` writes the current
listing review status without clearing the launch gate, and `listing:preflight` still exits non-zero until
the reviewed listing-quality CSV is present. `launch:preflight` also requires live Typesense/Meilisearch
reports from `npm run search:sync && npm run search:query` and a Hermes draft-worker report from
`npm run hermes:worker`; `live:preflight` checks those report files directly.
`live:report` writes the current live-service report status without clearing the launch gate.
The expected report shapes are committed as `production/data/*-report.json.example`; the real live
report files are ignored and must be generated from provisioned services.

Start the local production adapter:

```bash
MS_REALTY_ADMIN_TOKEN=replace-me npm start
```

Useful operator endpoints:

- `GET /api/health` returns `status: ok` plus current launch blockers.
- `GET /api/ready` returns `503` with blockers, public blocked-gate messages, `Cache-Control: no-store`, and `Retry-After: 60` until launch readiness is clear.
- `GET /api/admin/launch-readiness` returns the launch gate report.
- `GET /api/admin/launch-input-checklist` returns the remaining operator inputs as Markdown.
- `GET /api/admin/live-service-report-template` and `POST /api/admin/live-service-reports/import` handle validated live report files.
- `GET /api/admin/cms-collections` returns the implemented CMS collection contract manifest.
- `GET /api/admin/migration/review?locale=bg|ru|en` returns the redirect, SEO, and listing-quality review workbench.

Admin routes accept `local-admin-smoke` only outside `NODE_ENV=production`.
Set `MS_REALTY_ADMIN_TOKEN` before running the production server.
Set `MS_REALTY_MAX_BODY_BYTES` to tune the Node adapter request-body limit
for large admin CSV imports. The default is 10 MiB.
Set `MS_REALTY_*_LEDGER_PATH` variables only when production append ledgers
need to live outside `production/data/`.
Set `MS_REALTY_LOCALE_REGISTRY_PATH` when admin-added locales must persist
outside the running process; otherwise locale additions are in-memory only.
Set these path overrides when operator evidence is mounted outside the repo:
`MS_REALTY_REDIRECT_APPROVALS_PATH`, `MS_REALTY_DEPLOYABLE_REDIRECTS_OUTPUT_PATH`,
`MS_REALTY_SEO_EVIDENCE_INPUT_DIR`, `MS_REALTY_SEO_EVIDENCE_OUTPUT_PATH`,
`MS_REALTY_SEO_PREFLIGHT_REPORT_PATH`,
`MS_REALTY_LAUNCH_READINESS_OUTPUT_PATH`, `MS_REALTY_LAUNCH_INPUT_CHECKLIST_OUTPUT_PATH`,
`MS_REALTY_LIVE_SERVICE_PREFLIGHT_REPORT_PATH`,
`MS_REALTY_LISTING_QUALITY_REVIEW_PATH`, `MS_REALTY_LISTING_QUALITY_PREFLIGHT_REPORT_PATH`,
`MS_REALTY_SEARCH_SYNC_REPORT_PATH`, `MS_REALTY_SEARCH_QUERY_REPORT_PATH`, and
`MS_REALTY_HERMES_WORKER_REPORT_PATH`.

Generated production data:

- `production/data/migration-records.json`
- `production/data/migration.sqlite`
- `production/data/migration-db-summary.json`
- `production/data/migration-review-dashboard.json`
- `production/data/legacy-route-map.json`
- `production/data/migration-review-queue.json`
- `production/data/redirect-approvals.jsonl`
- `production/data/redirect-approval-workbook.csv`
- `production/data/deployable-redirects.json`
- `production/data/localized-sitemap.json`
- `production/data/sitemap.xml`
- `production/data/robots.txt`
- `production/data/structured-data-report.json`
- `production/data/listing-quality-report.json`
- `production/data/listing-quality-workbook.csv`
- `production/data/listing-quality-preflight-report.json`
- `production/data/listing-publication-report.json`
- `production/data/listing-verification-report.json`
- `production/data/cms-seed.json`
- `production/data/cms-collections.json`
- `production/data/public-fixtures.json`
- `production/data/admin-fixtures.json`
- `production/data/runtime-smoke.json`
- `production/data/http-smoke.json`
- `production/data/admin-locale-registry-smoke.json`
- `production/data/node-server-smoke.json`
- `production/data/mobile-elderly-qa-report.json`
- `production/data/lead-ledger.jsonl`
- `production/data/lead-sla-report.json`
- `production/data/reply-outbox.jsonl`
- `production/data/viewings.jsonl`
- `production/data/deals.jsonl`
- `production/data/saved-searches.jsonl`
- `production/data/saved-search-alert-report.json`
- `production/data/seller-pipeline.jsonl`
- `production/data/broker-contacts.jsonl`
- `production/data/tour-approvals.jsonl`
- `production/data/events.jsonl`
- `production/data/slug-history.jsonl`
- `production/data/seo-evidence.json`
- `production/data/seo-evidence-preflight-report.json`
- `production/data/search-engine-sync-smoke.json`
- `production/data/search-engine-query-smoke.json`
- `production/data/live-service-preflight-report.json`
- `production/data/app-route-manifest.json`
- `production/data/launch-readiness.json`
- `production/data/launch-input-checklist.md`
- `production/data/language-requests.jsonl`
- `production/data/locale-rollout-report.json`
- `production/data/hermes-draft-dispatch.json`
- `production/data/hermes-draft-worker-smoke.json`
- `production/data/hermes-worker-smoke-translations.jsonl`
- `production/data/hermes-worker-smoke-audit.jsonl`
- `production/data/translation-tasks.jsonl`
- `production/data/translation-coverage-report.json`
- `production/data/listing-edits.jsonl`

The next production slice can add the React public UI layer or Payload CMS
collections without re-deciding URL, locale, AI, or lead-language policy.
