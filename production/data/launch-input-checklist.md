# Launch Input Checklist

Generated: 2026-07-05T00:00:00Z

Status: blocked
Blockers: redirect_reviews, external_seo_exports, listing_quality_review, live_services, monitoring_rollback, payload_runtime, production_recovery

## Blocked Gate Actions

- redirect_reviews: Review every unresolved legacy URL in /admin/migration/review; retain equivalent content, map one-hop 301s, or approve a 410 individually.
- redirect_reviews: Download /api/admin/redirect-approval-workbook?pending=1, record a terminal decision for each row, then import it through /api/admin/redirect-approvals/import.
- external_seo_exports: Import Search Console, Yandex Webmaster, and backlink CSV exports through /api/admin/seo-evidence/import.
- external_seo_exports: Run npm run seo:preflight, npm run seo:evidence, and npm run seo:preflight:report after import.
- listing_quality_review: Review listings one at a time in /admin/migration/review; each human sign-off is validated, persisted, and audited before the queue advances.
- listing_quality_review: Download /api/admin/listing-quality-review-packet or /api/admin/listing-quality-review-draft.
- listing_quality_review: Import a complete human-reviewed CSV through /api/admin/listing-quality/import, then run npm run listing:preflight.
- live_services: Run npm run live:provisioning:preflight, then npm run live:capture against real Typesense, Meilisearch, and Hermes services.
- live_services: Import or mount the three live service reports, then run npm run live:preflight before launch.
- monitoring_rollback: Import Search Console, Yandex Webmaster, and backlink evidence for post-launch monitoring.
- monitoring_rollback: Confirm rollback steps cover disable, revert, cache purge, sitemap resubmit, and lead intake fallback.
- payload_runtime: Use /api/admin/payload-runtime-bootstrap to provision the private env and Postgres runtime.
- payload_runtime: Run npm run payload:runtime, import the redacted report through /api/admin/payload-runtime/import, then run npm run payload:preflight.
- production_recovery: Complete an encrypted off-site backup and isolated restore drill using production data stores.
- production_recovery: Download /api/admin/production-recovery-template, complete it with real evidence, and import it through /api/admin/production-recovery/import.

## Redirect Reviews

- Workbook: `production/data/redirect-approval-workbook.csv`
- Legacy route decision workbook rows: 457
- Reviewed one-hop 301 redirects: 165
- Terminal route decisions: 165/457 (200: 0, 301: 165, 410: 0)
- Remaining terminal route decisions: 292
- Legacy route coverage: 165/457
- Unresolved legacy URLs: 292 (page 104, post 42, taxonomy 146)
- Import path: `migration/reviews/redirect-approvals.csv`
- Admin import endpoint: `POST /api/admin/redirect-approvals/import`
- Admin workbook endpoint: `GET /api/admin/redirect-approval-workbook?pending=1`
- Production adapter path overrides: `MS_REALTY_REDIRECT_APPROVALS_PATH`, `MS_REALTY_DEPLOYABLE_REDIRECTS_OUTPUT_PATH`
- Review helper columns: `decision`, `target_path`, `target_listing_id`, `review_status`, `same_content_checklist`
- Approval import columns: `old_url`, `decision`, `target_path`, `equivalent_content`, `reviewer`, optional `approved_at`, `reason`
- Launch rule: each of all 457 legacy URLs needs a deliberate equivalent 200 route, reviewed one-hop 301, or approved 410 before cutover. Set `equivalent_content=true` only after same-content human review; homepage and search targets stay blocked.

## External SEO Exports

- Missing required sources: search_console, yandex_webmaster, backlinks
- Crawl coverage: 457 URLs (page 104, post 42, taxonomy 146, listing 165); URLs with any evidence: 3
- `migration/external/seo/search-console.csv`: missing_export, rows 0, matched 0, signal 0, unmatched 0, duplicates 0, placeholders 0, domains: none, signal domains: none
- `migration/external/seo/yandex-webmaster.csv`: missing_export, rows 0, matched 0, signal 0, unmatched 0, duplicates 0, placeholders 0, domains: none, signal domains: none
- `migration/external/seo/backlinks.csv`: missing_export, rows 0, matched 0, signal 0, unmatched 0, duplicates 0, placeholders 0, domains: none, signal domains: none

- Minimum required domain coverage:
- makler-realty.com: `https://makler-realty.com`
- makler-realty.ru: `https://makler-realty.ru`
- Admin import endpoints:
- `POST /api/admin/seo-evidence/import?source=search_console`: `url,clicks,impressions,position`
- `POST /api/admin/seo-evidence/import?source=yandex_webmaster`: `url,indexed,issue`
- `POST /api/admin/seo-evidence/import?source=backlinks`: `target_url,source_url,referring_domain`
- Template endpoints: `GET /api/admin/seo-evidence/template?source=search_console`, `?source=yandex_webmaster`, `?source=backlinks`
- Joined evidence export endpoint: `GET /api/admin/seo-evidence/export`
- Status report: `npm run seo:preflight:report` writes current missing/invalid SEO export state without clearing the launch gate.
- Admin SEO preflight endpoint: `GET /api/admin/seo-preflight`.
- Production/CLI path overrides: `MS_REALTY_SEO_EVIDENCE_INPUT_DIR`, `MS_REALTY_SEO_EVIDENCE_OUTPUT_PATH`, `MS_REALTY_SEO_PREFLIGHT_REPORT_PATH`, `MS_REALTY_LAUNCH_READINESS_OUTPUT_PATH`, `MS_REALTY_LAUNCH_INPUT_CHECKLIST_OUTPUT_PATH`
- Optional analytics: `migration/external/seo/analytics.csv`; privacy events are already imported.
- Launch rule: required SEO exports must match crawled URLs from both `makler-realty.com` and `makler-realty.ru`.

## Live Service Provisioning

- Current report evidence:
- typesense_meilisearch_sync: missing_report (path /Users/ivan/Code/MS-Realty-content-audit/production/data/search-engine-sync-report.json)
- typesense_meilisearch_query: missing_report (path /Users/ivan/Code/MS-Realty-content-audit/production/data/search-engine-query-report.json)
- hermes_draft_worker: missing_report (path /Users/ivan/Code/MS-Realty-content-audit/production/data/hermes-draft-worker-report.json)
- Current provisioning evidence:
- blocked_report (path /Users/ivan/Code/MS-Realty-content-audit/production/data/live-service-provisioning-report.json; missing TYPESENSE_URL, TYPESENSE_API_KEY, MEILI_URL, MEILI_API_KEY, HERMES_CHAT_COMPLETIONS_URL, HERMES_API_KEY)
- Search engines: set `TYPESENSE_URL`, `TYPESENSE_API_KEY`, `MEILI_URL`, and `MEILI_API_KEY`.
- Hermes Agent: set `HERMES_CHAT_COMPLETIONS_URL` to its internal `/v1/chat/completions` API and set `HERMES_API_KEY`; production Hermes evidence must be authenticated.
- Hermes runtime: `npm run hermes:runtime` verifies its `/health` endpoint and authenticated `/v1/capabilities` response before any draft-worker evidence is accepted.
- Managed local profile: set `HERMES_AGENT_MODEL`, `HERMES_AGENT_LLM_BASE_URL`, and `HERMES_AGENT_LLM_API_KEY`, then run `npm run docker:hermes:up`. The Agent only forwards to a private OpenAI-compatible model provider; its tools and persistent memory are disabled.
- Hermes provider report: `npm run hermes:provisioning` writes `production/data/hermes-provider-provisioning-report.json` without persisting API keys.
- Live service provisioning report: `npm run live:provisioning` writes `production/data/live-service-provisioning-report.json` with redacted endpoint health and missing-env evidence.
- Admin provisioning status endpoint: `GET /api/admin/live-service-provisioning`.
- Admin provisioning import endpoint: `POST /api/admin/live-service-provisioning/import` accepts the redacted JSON from `npm run live:provisioning`.
- Provisioning preflight: `npm run live:provisioning:preflight` must pass before live evidence capture.
- Live evidence capture: `npm run live:capture` runs search sync, search query, Hermes draft worker, and validates the three report outputs.
- Individual debug commands: `npm run search:sync`, `npm run search:query`, `npm run hermes:worker`.
- Status report: `npm run live:report` writes current missing/invalid live-service report state without clearing the launch gate.
- Admin live-services status endpoint: `GET /api/admin/live-services`.
- Report preflight: `npm run live:preflight`.
- Report examples: `production/data/search-engine-sync-report.json.example`, `production/data/search-engine-query-report.json.example`, `production/data/hermes-draft-worker-report.json.example`.
- Admin template endpoint: `GET /api/admin/live-service-report-template?source=typesense_meilisearch_sync`, `?source=typesense_meilisearch_query`, `?source=hermes_draft_worker`.
- Admin import endpoint: `POST /api/admin/live-service-reports/import?source=typesense_meilisearch_sync`, `?source=typesense_meilisearch_query`, `?source=hermes_draft_worker`.
- Production/CLI report path overrides: `MS_REALTY_LIVE_SERVICE_PROVISIONING_REPORT_PATH`, `MS_REALTY_SEARCH_SYNC_REPORT_PATH`, `MS_REALTY_SEARCH_QUERY_REPORT_PATH`, `MS_REALTY_HERMES_WORKER_REPORT_PATH`, `MS_REALTY_LIVE_SERVICE_PREFLIGHT_REPORT_PATH`.
- Hermes ledger path overrides: `MS_REALTY_TRANSLATION_LEDGER_PATH`, `MS_REALTY_HERMES_AUDIT_PATH`, `MS_REALTY_AUDIT_LOG_PATH`.
- Real report outputs stay local and ignored; examples do not count as launch evidence.
- Launch rule: run live search and Hermes commands after provisioning; the checked-in smoke commands remain local contract tests only.

## Payload Runtime

- Current gate: blocked
- Runtime report: `production/data/payload-runtime-report.json` (real output stays local and ignored)
- Runtime report example: `production/data/payload-runtime-report.json.example`
- Current check evidence:
- no Payload runtime check rows available
- Runtime env example: `production/data/payload-runtime.env.example`
- Local Postgres compose file: `production/docker-compose.payload.yml`
- Collection export: `production/data/payload-collections.json`
- Admin route: `/payload-admin`; API routes: `/api/[...slug]`, `/graphql`, `/graphql-playground`.
- Required env: `PAYLOAD_SECRET`, `DATABASE_URL`; currently missing: `PAYLOAD_SECRET`, `DATABASE_URL`.
- Secret strength: `PAYLOAD_SECRET` must be at least 32 bytes.
- Runtime evidence: `payload` dependency present, `payload.config.js` present, collection export generated, and required env configured.
- Placeholder rule: copied example values such as `replace-with-...` and `change-me` stay blocked.
- Runtime commands: `npm run payload:bootstrap`, copy/edit the private env file, start Postgres, then `npm run payload:runtime` and `npm run payload:preflight`.
- Admin bootstrap endpoint: `GET /api/admin/payload-runtime-bootstrap`.
- Admin import endpoint: `POST /api/admin/payload-runtime/import` accepts the redacted JSON from `npm run payload:runtime`.
- Admin status endpoint: `GET /api/admin/payload-runtime`.
- Production/CLI path overrides: `MS_REALTY_PAYLOAD_RUNTIME_ENV_EXAMPLE_PATH`, `MS_REALTY_PAYLOAD_RUNTIME_COMPOSE_PATH`, `MS_REALTY_PAYLOAD_RUNTIME_REPORT_PATH`.
- Real Payload runtime reports stay local and ignored; examples do not count as launch evidence.
- Launch rule: the interim admin workbenches do not count as the final Payload CMS runtime.

## Production Recovery

- Current gate: blocked
- Current evidence: missing_report (/Users/ivan/Code/MS-Realty-content-audit/production/data/production-recovery-report.json)
- Private report: `production/data/production-recovery-report.json` (ignored)
- Report example: `production/data/production-recovery-report.json.example`
- Admin template endpoint: `GET /api/admin/production-recovery-template`
- Admin status endpoint: `GET /api/admin/production-recovery`
- Admin import endpoint: `POST /api/admin/production-recovery/import` accepts only validated, redacted production evidence.
- Path override: `MS_REALTY_PRODUCTION_RECOVERY_REPORT_PATH`
- Required scope: encrypted-at-rest and encrypted-in-transit off-site backups covering Payload/Postgres, CRM/CMS runtime data, and runtime evidence.
- Required drill: successful isolated restore of the cited backup with checksums, rollback procedure verification, named operator, and separate named reviewer approval.
- Launch rule: the tested local `docker:backup` path is not production disaster-recovery evidence.

## Content Quality Warnings

- Current review evidence:
- missing_review (path /Users/ivan/Code/MS-Realty-content-audit/migration/reviews/listing-quality.csv; expected 165; reviewed 0; missing 165)
- Pending review sample:
- MS-CRAWL-0001: area_sqm (missing_area) /admin/listings/edit?listingId=MS-CRAWL-0001
- MS-CRAWL-0002: area_sqm|public_gallery (missing_area|thin_public_gallery) /admin/listings/edit?listingId=MS-CRAWL-0002
- MS-CRAWL-0003: area_sqm (missing_area) /admin/listings/edit?listingId=MS-CRAWL-0003
- MS-CRAWL-0004: area_sqm (missing_area) /admin/listings/edit?listingId=MS-CRAWL-0004
- MS-CRAWL-0005: area_sqm (missing_area) /admin/listings/edit?listingId=MS-CRAWL-0005
- MS-CRAWL-0006: area_sqm|public_gallery (missing_area|thin_public_gallery) /admin/listings/edit?listingId=MS-CRAWL-0006
- MS-CRAWL-0007: area_sqm (missing_area) /admin/listings/edit?listingId=MS-CRAWL-0007
- MS-CRAWL-0008: area_sqm (missing_area) /admin/listings/edit?listingId=MS-CRAWL-0008
- MS-CRAWL-0009: area_sqm (missing_area) /admin/listings/edit?listingId=MS-CRAWL-0009
- MS-CRAWL-0010: area_sqm (missing_area) /admin/listings/edit?listingId=MS-CRAWL-0010
- Workbook: `production/data/listing-quality-workbook.csv`
- Review packet: `production/data/listing-quality-review-packet.json`
- Draft review CSV: `production/data/listing-quality-review-draft.csv`
- Scope: 165 source listing rows; warning counts below include structured-data entries and listing-quality source rows.
- Review input path: `migration/reviews/listing-quality.csv`
- Example input: `migration/reviews/listing-quality.csv.example`
- Draft and example rows intentionally leave reviewer fields blank; fill them only after human gallery/facts review.
- Production/CLI path overrides: `MS_REALTY_LISTING_QUALITY_REVIEW_DRAFT_PATH`, `MS_REALTY_LISTING_QUALITY_REVIEW_PACKET_PATH`, `MS_REALTY_LISTING_QUALITY_REVIEW_PATH`
- Status report: `npm run listing:preflight:report` writes current missing/invalid listing-review state without clearing the launch gate.
- Build path overrides: `MS_REALTY_LISTING_EDIT_LEDGER_PATH`, `MS_REALTY_TOUR_APPROVAL_LEDGER_PATH`, `MS_REALTY_LISTING_QUALITY_REPORT_PATH`, `MS_REALTY_LISTING_QUALITY_WORKBOOK_PATH`
- Preflight report override: `MS_REALTY_LISTING_QUALITY_PREFLIGHT_REPORT_PATH`
- Review columns: `review_status`, `required_editor_fields`, `price_eur`, `area_sqm`, `bedrooms`, `location`, `description`, `facts_reviewer`, `media_reviewer`, `review_notes`
- Launch review CSVs must retain draft snapshot columns: `editor_path`, `review_status`, `issues`, `required_editor_fields`, `public_gallery_assets`, `public_gallery_sample`, `missing_alt_text_assets`.
- Admin review packet endpoint: `GET /api/admin/listing-quality-review-packet`
- Admin draft endpoint: `GET /api/admin/listing-quality-review-draft`
- Admin status endpoint: `GET /api/admin/listing-quality`
- Admin import endpoint: `POST /api/admin/listing-quality/import`
- Admin editor endpoint: `POST /api/admin/listings/edit`
- Review pack command: `npm run listing:review-pack`.
- Launch rule: the review CSV must include one valid row for every workbook row; partial CSVs are only for iterative admin imports.
- structured_data.missing_area: 166
- structured_data.missing_public_images: 4
- listing_quality.missing_area: 165
- listing_quality.thin_public_gallery: 18

## Broker Verification

- Report: `production/data/listing-verification-report.json`
- Broker verification tasks: 165
- High priority tasks: 74
- Tasks by owner: broker_bg: 113, broker_ru: 52
- Publication/verification build overrides: `MS_REALTY_LOCALE_REGISTRY_PATH`, `MS_REALTY_LISTING_EDIT_LEDGER_PATH`, `MS_REALTY_LISTING_PUBLICATION_REPORT_PATH`, `MS_REALTY_LISTING_VERIFICATION_REPORT_PATH`

## Monitoring And Rollback

- Report: `production/data/launch-readiness.json`
- Admin endpoint: `GET /api/admin/launch-readiness`
- Monitoring sources: privacy_events: imported, search_console: missing_export, yandex_webmaster: missing_export, backlinks: missing_export
- Rollback steps: 4
- Launch rule: verify monitoring exports before cutover and keep rollback steps available through the first post-launch crawl window.

## Validate After Inputs

- Admin status endpoint: `GET /api/admin/preflight-reports`

```bash
npm run redirects:preflight
npm run redirects:build
npm run seo:preflight
npm run seo:evidence
npm run seo:preflight:report
npm run live:provisioning
npm run live:provisioning:preflight
npm run live:capture
npm run live:report
npm run live:preflight
npm run payload:bootstrap
npm run payload:runtime
npm run payload:preflight
npm run listing:review-pack
npm run listing:preflight
npm run launch:readiness
npm run launch:inputs
npm run launch:preflight
```
