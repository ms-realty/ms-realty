# Launch Input Checklist

Generated: 2026-07-05T00:00:00Z

Status: blocked
Blockers: external_seo_exports, listing_quality_review, live_services, payload_runtime

## Redirect Reviews

- Workbook: `production/data/redirect-approval-workbook.csv`
- Review rows: 165
- Deployable approvals: 165/165
- Remaining approvals required: 0
- Import path: `migration/reviews/redirect-approvals.csv`
- Admin import endpoint: `POST /api/admin/redirect-approvals/import`
- Admin workbook endpoint: `GET /api/admin/redirect-approval-workbook?pending=1`
- Production adapter path overrides: `MS_REALTY_REDIRECT_APPROVALS_PATH`, `MS_REALTY_DEPLOYABLE_REDIRECTS_OUTPUT_PATH`
- Review helper columns: `target_listing_id`, `review_status`, `same_content_checklist`
- Approval import columns: `old_url`, `equivalent_content`, `reviewer`, optional `approved_at`, optional `reason`
- Launch rule: set `equivalent_content=true` only after same-content human review. Homepage targets stay blocked.

## External SEO Exports

- `migration/external/seo/search-console.csv`: missing_export, rows 0, matched 0, signal 0, unmatched 0, duplicates 0, placeholders 0, domains: none
- `migration/external/seo/yandex-webmaster.csv`: missing_export, rows 0, matched 0, signal 0, unmatched 0, duplicates 0, placeholders 0, domains: none
- `migration/external/seo/backlinks.csv`: missing_export, rows 0, matched 0, signal 0, unmatched 0, duplicates 0, placeholders 0, domains: none

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

- Search engines: set `TYPESENSE_URL`, `TYPESENSE_API_KEY`, `MEILI_URL`, and `MEILI_API_KEY`.
- Hermes worker: set `HERMES_CHAT_COMPLETIONS_URL`; set `HERMES_API_KEY` when the endpoint requires auth.
- Hermes default: self-host vLLM with `--enable-auto-tool-choice --tool-call-parser hermes`; hosted OpenRouter fallback is non-sensitive only.
- Hermes provider report: `npm run hermes:provisioning` writes `production/data/hermes-provider-provisioning-report.json` without persisting API keys.
- Live service provisioning report: `npm run live:provisioning` writes `production/data/live-service-provisioning-report.json` with redacted endpoint health and missing-env evidence.
- Admin provisioning status endpoint: `GET /api/admin/live-service-provisioning`.
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
- Hermes ledger path overrides: `MS_REALTY_TRANSLATION_LEDGER_PATH`, `MS_REALTY_HERMES_AUDIT_PATH`.
- Real report outputs stay local and ignored; examples do not count as launch evidence.
- Launch rule: run live search and Hermes commands after provisioning; the checked-in smoke commands remain local contract tests only.

## Payload Runtime

- Current gate: blocked
- Runtime report: `production/data/payload-runtime-report.json`
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
- Launch rule: the interim admin workbenches do not count as the final Payload CMS runtime.

## Content Quality Warnings

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
- Review columns: `review_status`, `required_editor_fields`, `price_eur`, `bedrooms`, `location`, `description`, `facts_reviewer`, `media_reviewer`, `review_notes`
- Admin review packet endpoint: `GET /api/admin/listing-quality-review-packet`
- Admin draft endpoint: `GET /api/admin/listing-quality-review-draft`
- Admin status endpoint: `GET /api/admin/listing-quality`
- Admin import endpoint: `POST /api/admin/listing-quality/import`
- Admin editor endpoint: `POST /api/admin/listings/edit`
- Review pack command: `npm run listing:review-pack`.
- Launch rule: the review CSV must include one valid row for every workbook row; partial CSVs are only for iterative admin imports.
- listing_quality.thin_public_gallery: 7

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
npm run live:provisioning:preflight
npm run live:preflight
npm run payload:bootstrap
npm run payload:preflight
npm run listing:review-pack
npm run listing:preflight
npm run launch:readiness
npm run launch:inputs
npm run launch:preflight
```
