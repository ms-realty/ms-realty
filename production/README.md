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
- Draft Photo Sphere Viewer and SuperSplat Viewer tour fields with required gallery fallback policy.
- Authenticated tour approval endpoint and ledger; approved panorama tours overlay public listing routes with Photo Sphere Viewer mount data, while approved 3D tours link to a reviewed HTTPS static viewer.
- Public route fixtures for locale-prefixed listing/search/contact/guide/fallback routes.
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
- Server-rendered HTML adapter for listing, search, contact, guide, and fallback pages with SEO metadata.
- Approved CMS guide pages for human-reviewed foreign-buyer and buying-process guidance.
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
- Locale rollout report that turns requested disabled locales into approval tasks and Hermes draft queue summaries.
- Hermes draft dispatch batch that prepares real crawl-backed listing prompts with citations while keeping drafts non-publishing and reviewer-gated.
- Hermes draft worker path that calls an OpenAI-compatible vLLM/Hermes endpoint, validates JSON output, and persists only non-indexable review drafts.
- Authenticated launch input checklist endpoint for redirect, SEO, listing-quality, and live-service launch handoff gates.
- App Router manifest that maps every approved public route to a Next-compatible route handler, renderer, cache policy, and `lang`/`dir`.
- Minimal App Router route-handler bridge under `app/` for homepage, search, and catch-all content routes, reusing the server-rendered HTML contracts.
- Next App Router `sitemap.xml` and `robots.txt` handlers backed by the same approved localized sitemap contract.
- Next App Router public API handlers for health, readiness, search, and lead intake backed by the same HTTP contracts.
- Next App Router public home, search, listing, location, seller, contact, guide, and language-fallback routes render through the React body bridge while unsupported page kinds fall back to the stdlib HTML renderer.
- Next App Router public API handlers for analytics events, language requests, and saved searches.
- Next App Router admin read pages for CRM lead inbox and CMS listing editor behind the same bearer auth gate.
- Next App Router admin lead inbox, listing editor, and migration review can render through the React admin body bridge.
- Next App Router admin JSON lead inbox endpoint for broker CRM consumers.
- Next App Router admin write handlers for reviewed replies, attributed reply-delivery outcomes, and listing edits used by those admin pages.
- Next App Router admin CRM lifecycle handlers for viewing bookings, private append-only follow-up outcomes, viewing calendar export, and deal close tasks.
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
- Served sitemap XML includes approved home, location, and CMS guide pages without unapproved French routes.
- Append-only lead ledger for persisted buyer inquiry, viewing request, contact callback, and seller valuation smoke rows, including source classification.
- Lead intake returns a deterministic instant-confirmation contract without sending unreviewed messages.
- Lead ledger rows create an immediate broker follow-up SLA task and manager escalation timestamp.
- Lead SLA report creates broker reminders and manager escalations until actual customer delivery is recorded; broker approval alone does not stop the clock.
- Broker assignment is rules-based by language plus listing location/type, with validated manual override.
- Lead ledger duplicate detection stores privacy-safe contact fingerprints instead of raw contact fields.
- Gated admin lead inbox JSON endpoint with BG/RU/EN interface locale support.
- Gated admin lead inbox HTML endpoint with BG/RU/EN interface locale support.
- Broker-approved reply outbox for reviewed CRM replies plus an append-only queued/failed/requeued/sent delivery ledger; Hermes drafts are never auto-sent and only a human-attributed sent outcome completes the reply SLA.
- Broker reply approval accepts JSON and form-encoded admin submissions.
- Broker-booked viewing ledger with open follow-up tasks and admin `.ics` calendar export from existing CRM leads.
- Private append-only viewing outcomes (complete, reschedule, no-show, note) retain booking history, protect note content from the audit metadata, and leave actionable follow-up/feedback tasks in the broker queue.
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
- Production Node HTML adapter uses the same React public/admin body bridges as the App Router, while listing `?print=1` stays on the print renderer.
- Public seller and contact pages are included in the localized sitemap for approved website locales.
- Generated mobile/elderly QA report over rendered public HTML, including Hebrew RTL, search form, sticky listing actions, phone-first forms, fallback noindex, and BG/RU/EN admin language policy.
- Distinct inquiry, callback, and viewing forms persist their own intent-specific fields instead of collapsing into one generic modal.
- Public cards expose only reviewed/renderable gallery counts and label fallback source-language content without making it indexable.
- Search normalizes accents and Cyrillic/Latin keyboard variants in both runtime matching and Typesense/Meilisearch documents without manufacturing translations.
- Task-first BG/RU/EN broker routes cover Today, leads, contacts/accounts, consent, documents, buyer/renter and seller pipelines, requests, viewings, reports, activity, listings, translations, and migration review.
- Versioned BG/GR `RealtyCase` workflows cover buying, selling, long-term rental, short-term rental, land/new-build/commercial work, and property management in manual or autonomous mode.
- RealtyCase actions enforce signed-mandate capabilities, agent assurance, chronological phase progression, accepted external evidence, optional-step authority, freeze/resume, and complete-close gates.
- Trusted `agent` credentials are limited to the case workbench/API and cannot bypass the mandate through broker-wide operational endpoints.
- Role-scoped, attributable operations include broker-originated intake, manual assignment, lead next actions, inventory matching, publication schedules, bulk status changes, consent withdrawal, document outcomes, communication threads, delivery outcomes, and entity timelines.
- Local recovery snapshots quiesce writes and checksum Payload/Postgres plus CRM/CMS and evidence volumes; restore requires explicit confirmation, validates secret compatibility and archive paths, retains a rollback snapshot, then rebuilds migrations, search, and runtime reports.

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
npm run listing:review-pack
npm run listing:preflight
npm run live:provisioning
npm run live:provisioning:preflight
npm run live:report
npm run live:preflight
npm run payload:bootstrap
npm run payload:runtime
npm run payload:preflight
npm run launch:preflight
```

`redirects:preflight` passes once reviewed 301 approvals are present. `seo:preflight:report` writes the current
SEO export status without clearing the launch gate, and `seo:preflight` still exits
non-zero until real external SEO exports are complete. `listing:preflight:report` writes the current
listing review status without clearing the launch gate, and `listing:preflight` still exits non-zero until
the reviewed listing-quality CSV is present. `listing:review-pack` writes a complete draft review packet
for editors, but it is not launch evidence until reviewer fields are filled. `launch:preflight` also requires live Typesense/Meilisearch
reports from `npm run search:sync && npm run search:query`, a Hermes draft-worker report from
`npm run hermes:worker`, and a configured Payload runtime app; `live:preflight` checks those report files directly.
`live:provisioning` writes redacted endpoint and missing-env evidence before live capture, and
`live:provisioning:preflight` must pass before treating `live:capture` output as launch evidence.
`live:report` writes the current live-service report status without clearing the launch gate.
`payload:bootstrap` writes the Payload private-env example and localhost Postgres compose file;
placeholder values remain blocked until replaced with real secrets and a reachable database.
The expected report shapes are committed as `production/data/*-report.json.example`; the real live
report files are ignored and must be generated from provisioned services.

Start the local production adapter:

```bash
MS_REALTY_ADMIN_TOKEN=replace-me MS_REALTY_ADMIN_ACTOR=operations_lead npm start
```

Run the complete loopback-only production preview in Docker:

```bash
npm run docker:up
```

This builds the Next/Payload application in `NODE_ENV=production`, starts PostgreSQL,
Typesense, Meilisearch, and Caddy, applies versioned Payload database migrations, then
imports the reviewed search documents into both search engines. The public entry point
defaults to `http://127.0.0.1:3200/ru/`.
Operator workbenches under `/admin/` receive the generated local bearer token at the
loopback-only Caddy boundary. Payload keeps its own login and first-admin setup flow at
`/payload-admin`.

Approved 360 tours load Photo Sphere Viewer from the locally bundled
`/vendor/photo-sphere-viewer.js` and `/vendor/photo-sphere-viewer.css` assets. The Docker
preview does not depend on an external viewer CDN. Approved SuperSplat tours open a reviewed
HTTPS static viewer page in a separate tab; the public app does not bundle or invoke a GPU
reconstruction service. See [3D-tour pilot](3d-tour-pilot.md) for the private capture,
reconstruction, review, and deployment handoff.

The compose stack keeps CRM/CMS JSONL preview state and the admin locale registry in the
named `local-dev-app-data` Docker volume. App rebuilds, recreates, and `npm run docker:down`
preserve that local state; `npm run docker:reset` intentionally removes it. This is a local
development convenience, not production persistence or a substitute for Payload/Postgres.

Create a private, checksummed recovery snapshot of the local Payload/Postgres database,
CRM/CMS ledger volume, and runtime-evidence volume with:

```bash
npm run docker:backup
```

Backups are written mode-private under ignored `.local-backups/` directories. Their
manifest contains no secrets, but binds restore to fingerprints of the current Payload
and contact-vault secrets. Restore validates every checksum and archive path, takes an
automatic rollback snapshot, replaces the local state only after explicit confirmation,
then migrates Payload and rebuilds the search indexes and runtime reports:

```bash
npm run docker:restore -- .local-backups/backup-<timestamp>-<id> --confirm-replace-local-data
```

This is tested local recovery machinery, not proof of an encrypted off-site production
backup policy, retention schedule, or successful production disaster-recovery drill.
Production launch stays blocked until a named operator and reviewer supply a valid private
`production/data/production-recovery-report.json` using the committed `.json.example` contract;
`MS_REALTY_PRODUCTION_RECOVERY_REPORT_PATH` may mount that evidence outside the repository.

After `docker:up` or `docker:seed`, the app atomically materializes schema-valid runtime reports
that are no older than 15 minutes into `/runtime-evidence/local-launch-readiness.json`. It preserves
all external launch blockers and adds a local-preview-only block, so `/api/ready` remains `503` until
the real production evidence gates are complete.

The command creates an ignored, mode-`0600` `.env.local-production` file with local
secrets. Add real `HERMES_CHAT_COMPLETIONS_URL` and `HERMES_API_KEY` values there only
when a real Hermes endpoint is available. A missing Hermes endpoint remains visible as
a launch blocker; the Docker preview does not manufacture AI evidence.

Useful lifecycle commands:

```bash
npm run docker:status
npm run docker:logs
npm run docker:seed
npm run docker:backup
npm run docker:down
npm run docker:reset
```

Useful operator endpoints:

- `GET /api/health` returns `status: ok` plus current launch blockers.
- `GET /api/ready` returns `503` with blockers, public blocked-gate messages, `Cache-Control: no-store`, and `Retry-After: 60` until launch readiness is clear.
- `GET /api/admin/launch-readiness` returns the launch gate report.
- `GET /api/admin/launch-input-checklist` returns the remaining operator inputs as Markdown.
- `GET /api/admin/live-service-report-template` and `POST /api/admin/live-service-reports/import` handle validated live report files.
- `GET /api/admin/production-recovery-template`, `GET /api/admin/production-recovery`, and `POST /api/admin/production-recovery/import` provide a validated, audited recovery-evidence intake without committing the private report.
- `GET /api/admin/cms-collections` returns the implemented CMS collection contract manifest.
- `POST /mcp` is the bounded remote MCP endpoint for approved ChatGPT/Codex operator tools; see `MCP_OPERATOR_SETUP_RU.md` before exposing it to staff.
- `GET /api/admin/payload-collections` returns Payload-compatible collection configs generated from that manifest.
- `GET /admin/cases?locale=bg|ru|en` and `GET /api/admin/cases` return the RealtyCase queue for both human and autonomous execution.
- `POST /api/admin/cases` opens a versioned BG/GR case; `POST /api/admin/cases/actions` advances, blocks, reopens, freezes, resumes, changes mode, closes, or cancels it through the same authority/evidence contract.
- `GET /admin/requests?locale=bg|ru|en` and `GET /api/admin/requests` return the broker queue for saved-search alerts and language requests. Private contact values are decrypted only for this authenticated, `no-store` response.
- `GET /admin/pipeline?locale=bg|ru|en` and `GET /api/admin/pipeline` return the buyer/renter operating queue, derived from attributed qualification outcomes plus actual viewing and closed-deal ledgers.
- `POST /api/admin/lead-pipeline/outcome` records qualification, offer/application, due-diligence/contract/lease, loss/reopen, and internal-note transitions. The authenticated principal replaces any actor supplied by the browser.
- `POST /api/admin/public-requests/outcome` records an attributed contacted, complete, close, reopen, or note transition and appends a privacy-safe audit row. Completed and closed saved searches are suppressed from future alert reports.
- `GET /api/admin/migration/review?locale=bg|ru|en` returns the redirect, SEO, listing-quality, and runtime-evidence workbench. Brokers can sign off one listing at a time, while authorized operators import redacted live-search, Hermes, Payload, provisioning, and recovery reports through validated and audited endpoints.
- `production/data/payload-collections.json` exports Payload-compatible collection configs generated from the CMS manifest; launch readiness still blocks until the Payload runtime dependency and config exist.

Admin routes accept `local-admin-smoke` only outside `NODE_ENV=production`.
Set `MS_REALTY_ADMIN_TOKEN` before running the production server. Production
mutations also require an attributable operator: either set
`MS_REALTY_ADMIN_ACTOR` for a single named admin credential, or prefer a distinct
per-person credential registry in the deployment secret store:

```bash
MS_REALTY_ADMIN_CREDENTIALS_JSON='[{"id":"broker_bg","token":"a-long-random-bearer-secret","roles":["broker"]}]'
```

The registry supersedes `MS_REALTY_ADMIN_TOKEN` when configured. Keep every
token only in deployment secrets; never commit this value. Every registry row
must declare one or more supported roles: `admin`, `broker`, `editor`,
`translator`, or `agent`; rotated credentials for the same operator must keep the same
roles. Broker accounts can operate CRM workflows and read listing facts,
editors own listing/media changes and approved translation publication,
translators can draft and approve translations but cannot publish them, and
trusted agents can access only the mandate-enforced RealtyCase routes. Only
admins can enter commission values or change launch evidence. Unauthorized
routes return a capability-specific `403 forbidden` response and are omitted
from the authenticated workspace navigation.

Editors can schedule a human-approved listing publication or retained-URL
archive from `/admin/listings`. The authenticated workspace can run due changes
manually; production automation should invoke `npm run listing:publication:run`
on the deployment scheduler. The command executes only already-approved, due
rows, records the listing edit and stale-translation tasks, repairs a missing
execution audit on retry, and never delegates publication authority to Hermes.
Set `MS_REALTY_LISTING_PUBLICATION_EXECUTOR` to the scheduler service identity;
the default is `listing_publication_scheduler`. The schedule, listing-edit,
translation, and audit paths must all point at durable mounted storage.

A production shared
token without an operator remains read-only and receives
`403 operator_identity_required` for any mutation, so it cannot create a
misattributed audit row.
Set `MS_REALTY_MAX_BODY_BYTES` to tune the Node adapter request-body limit
for large admin CSV imports. The default is 10 MiB.
Set `MS_REALTY_LEAD_CONTACT_KEY` to a secret of at least 32 characters and
`MS_REALTY_LEAD_CONTACT_VAULT_PATH` to durable private storage. Public contact
details are AES-256-GCM encrypted there and never written to the lead ledger.
Saved-search and language-notification contacts use the same key by default and
`MS_REALTY_PUBLIC_CONTACT_VAULT_PATH`; set `MS_REALTY_PUBLIC_CONTACT_KEY` when
those records must use a separately rotated secret. Their workflow ledgers keep
only contact references and delivery routing, never raw contact values.
Set `MS_REALTY_PUBLIC_REQUEST_OUTCOME_LEDGER_PATH` when the append-only request
outcome ledger is mounted outside the repo. `MS_REALTY_PUBLIC_REQUEST_OUTCOME_AT`
is a deterministic test/smoke timestamp only; production should use wall-clock time.
Set `MS_REALTY_LEAD_PIPELINE_OUTCOME_LEDGER_PATH` to durable private storage for
buyer/renter milestones. `MS_REALTY_LEAD_PIPELINE_OUTCOME_AT` is a deterministic
test/smoke timestamp only; production should use wall-clock time.
Set `MS_REALTY_CASE_LEDGER_PATH` to durable private storage for RealtyCase
events. `MS_REALTY_CASE_RECORDED_AT` is a deterministic test/smoke timestamp
only; production should use wall-clock time. The complete operating and
integration contract is in `production/REALTY_OS_OPERATING_MODEL.md`.
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
- `production/data/approved-cms-content.json`
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
- `production/data/payload-collections.json`
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
- `production/data/viewing-follow-ups.jsonl`
- `production/data/lead-pipeline-outcomes.jsonl`
- `production/data/deals.jsonl`
- `production/data/saved-searches.jsonl`
- `production/data/saved-search-alert-report.json`
- `production/data/public-request-outcomes.jsonl`
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
- `production/data/audit-log.jsonl.example`
- `production/data/language-requests.jsonl`
- `production/data/locale-rollout-report.json`
- `production/data/hermes-draft-dispatch.json`
- `production/data/hermes-draft-worker-smoke.json`
- `production/data/hermes-worker-smoke-translations.jsonl`
- `production/data/hermes-worker-smoke-audit.jsonl`
- `production/data/hermes-worker-smoke-audit-log.jsonl`
- `production/data/translation-tasks.jsonl`
- `production/data/translation-coverage-report.json`
- `production/data/listing-edits.jsonl`

The local runtime remains a launch-review environment until the external evidence gates
and operator approvals in `production/data/launch-readiness.json` are complete. Local
workflow coverage must not be presented as live Payload, search-engine, Hermes-worker,
Search Console, Yandex Webmaster, backlink, or human listing-review proof.
