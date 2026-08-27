# Launch Input Checklist

Generated: 2026-08-27T14:16:20.632Z

Status: blocked
Blockers: live_services, monitoring_rollback, payload_runtime, production_recovery

## Blocked Gate Actions

- live_services: Run npm run live:provisioning:preflight, then npm run live:capture against the production Postgres search path and Hermes service.
- live_services: Import or mount the 3 required live service reports, then run npm run live:preflight before launch.
- monitoring_rollback: Mount a current redacted monitoring and rollback report, then run npm run monitoring:preflight.
- monitoring_rollback: Confirm the automated rollback policy, canary, and isolated drill cover disable, revert, cache purge, sitemap resubmit, and lead intake fallback.
- payload_runtime: Use /api/admin/payload-runtime-bootstrap to provision the private env and Postgres runtime.
- payload_runtime: Run npm run payload:runtime, import the redacted report through /api/admin/payload-runtime/import, then run npm run payload:preflight.
- production_recovery: Complete an encrypted off-site backup and isolated restore drill for durable Payload/Postgres and CRM/CMS data.
- production_recovery: Run the governed recovery:r2 backup, restore, and approval commands; only their Ed25519-signed report can be imported through /api/admin/production-recovery/import.

## Redirect Reviews

- Workbook: `production/data/redirect-approval-workbook.csv`
- Legacy route decision workbook rows: 457
- Reviewed one-hop 301 redirects: 179
- Terminal route decisions: 457/457 (200: 10, 301: 179, 410: 268)
- Remaining terminal route decisions: 0
- Legacy route coverage: 457/457
- Unresolved legacy URLs: 0 (none)
- Import path: `migration/reviews/redirect-approvals.csv`
- Admin import endpoint: `POST /api/admin/redirect-approvals/import`
- Admin workbook endpoint: `GET /api/admin/redirect-approval-workbook?pending=1`
- Production adapter path overrides: `MS_REALTY_REDIRECT_APPROVALS_PATH`, `MS_REALTY_DEPLOYABLE_REDIRECTS_OUTPUT_PATH`
- Checklist output override: `MS_REALTY_LAUNCH_INPUT_CHECKLIST_OUTPUT_PATH`
- Review helper columns: `decision`, `target_path`, `target_listing_id`, `review_status`, `same_content_checklist`
- Approval import columns: `old_url`, `decision`, `target_path`, `equivalent_content`, `reviewer`, optional `approved_at`, `reason`
- Launch rule: each of all 457 legacy URLs needs a deliberate equivalent 200 route, reviewed one-hop 301, or approved 410 before the compatibility map is published. Set `equivalent_content=true` only after same-content human review; broad home/search fallbacks stay blocked, while the exact mappings in the locked launch freeze are allowed.

## Live Service Provisioning

- Current report evidence:
- postgres_search_sync: missing_report (path production/data/postgres-search-sync-report.json)
- postgres_search_query: missing_report (path production/data/postgres-search-query-report.json)
- hermes_draft_worker: missing_report (path production/data/hermes-draft-worker-report.json)
- Current provisioning evidence:
- blocked_report (path production/data/live-service-provisioning-report.json; missing DATABASE_URL, PAYLOAD_SECRET, MS_REALTY_SEARCH_ENGINE, HERMES_CHAT_COMPLETIONS_URL, HERMES_API_KEY)
- Postgres search: set `MS_REALTY_SEARCH_ENGINE=postgres`, `DATABASE_URL`, and `PAYLOAD_SECRET`; apply the public-search migration before capture so sync and query evidence use the same authoritative Neon target.
- Hermes Agent: set `HERMES_CHAT_COMPLETIONS_URL` to its internal `/v1/chat/completions` API and set `HERMES_API_KEY`; production Hermes evidence must be authenticated.
- Hermes runtime: `npm run hermes:runtime` verifies its `/health` endpoint and authenticated `/v1/capabilities` response before any draft-worker evidence is accepted.
- Managed local profile: set `HERMES_AGENT_MODEL`, `HERMES_AGENT_LLM_BASE_URL`, and `HERMES_AGENT_LLM_API_KEY`, then run `npm run docker:hermes:up`. The Agent only forwards to a private OpenAI-compatible model provider; its tools and persistent memory are disabled.
- Hermes provider report: `npm run hermes:provisioning` writes `production/data/hermes-provider-provisioning-report.json` without persisting API keys.
- Live service provisioning report: `npm run live:provisioning` writes `production/data/live-service-provisioning-report.json` with the redacted Postgres target, Hermes endpoint health, and missing-env evidence.
- Admin provisioning status endpoint: `GET /api/admin/live-service-provisioning`.
- Admin provisioning import endpoint: `POST /api/admin/live-service-provisioning/import` accepts the redacted JSON from `npm run live:provisioning`.
- Provisioning preflight: `npm run live:provisioning:preflight` must pass before live evidence capture.
- Live evidence capture: `npm run live:capture` verifies the Postgres search projection, queries that same Postgres target, runs the Hermes draft worker, and validates every required report output.
- Individual debug commands: `npm run search:sync`, `npm run search:query`, `npm run hermes:worker`.
- Status report: `npm run live:report` writes current missing/invalid live-service report state without clearing the launch gate.
- Admin live-services status endpoint: `GET /api/admin/live-services`.
- Report preflight: `npm run live:preflight`.
- Report examples: `production/data/postgres-search-sync-report.json.example`, `production/data/postgres-search-query-report.json.example`, `production/data/hermes-draft-worker-report.json.example`.
- Admin template endpoint: `GET /api/admin/live-service-report-template?source=postgres_search_sync`, `?source=postgres_search_query`, `?source=hermes_draft_worker`.
- Admin import endpoint: `POST /api/admin/live-service-reports/import?source=postgres_search_sync`, `?source=postgres_search_query`, `?source=hermes_draft_worker`.
- Production/CLI report path overrides: `MS_REALTY_LIVE_SERVICE_PROVISIONING_REPORT_PATH`, `MS_REALTY_POSTGRES_SEARCH_SYNC_REPORT_PATH`, `MS_REALTY_POSTGRES_SEARCH_QUERY_REPORT_PATH`, `MS_REALTY_HERMES_WORKER_REPORT_PATH`, `MS_REALTY_LIVE_SERVICE_PREFLIGHT_REPORT_PATH`.
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
- Client admin routes: `/admin/login` for Payload-backed email/password sessions and `/admin/team` for admin-only operator management.
- Identity authority: Payload collection `admins` with database-backed sessions; the internal `/payload-admin` UI and direct `/api/admins/*` identity REST routes are hidden at the Cloudflare edge.
- Internal integration: the Payload REST catch-all remains available to the application runtime, while GraphQL is not a client-facing admin surface.
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
- Launch rule: custom `/admin` session, edge-boundary, Payload identity/config, and database evidence must all pass; the hidden Payload Admin UI is not a launch requirement.

## R2 Media Coverage (workers.dev)

- Current gate: pass
- Runtime source contract: `1725` unique keys from `loadMediaInventory + imageUrlFromMediaItem`; expected digest: `ada013ef6b48892b877a58490799f2b029b0b13856121529aecbfa2b599d4b28`.
- Coverage report: `production/data/r2-media-coverage-report.json` (real report stays local and ignored).
- ListObjectsV2 input: set `MS_REALTY_R2_MEDIA_LISTING_INPUT_PATH` to the credential-free flattened JSON array (or simple `Contents` response).
- Build command: `MS_REALTY_RELEASE_SHA=<workers.dev release SHA> npm run r2:media:coverage`.
- Current counts: expected 1725, listed 1727, present 1725, missing 0, unexpected 2.
- Expected/listing digests: ada013ef6b48892b877a58490799f2b029b0b13856121529aecbfa2b599d4b28 / e32d4e34c775a81220c6f43d0619f53a1f3529339430c1016665fd3fec7f02b1.
- Public missing keys: none.
- Release binding: the report `release_sha` must equal `MS_REALTY_RELEASE_SHA` for the workers.dev release under review.
- Launch rule: R2 coverage passes only when `missing_count=0`; unexpected keys remain visible and do not substitute for missing runtime assets.
- Next actions: Mount this report for the exact workers.dev release SHA, then rerun npm run launch:preflight.

## Production Recovery

- Current gate: blocked
- Current evidence: missing_report (production/data/production-recovery-report.json)
- Private report: `production/data/production-recovery-report.json` (ignored)
- Report example: `production/data/production-recovery-report.json.example` (shape reference only; it cannot clear readiness)
- Admin template endpoint: `GET /api/admin/production-recovery-template`
- Admin status endpoint: `GET /api/admin/production-recovery`
- Admin import endpoint: `POST /api/admin/production-recovery/import` accepts only redacted Ed25519-signed production evidence from the governed recovery workflow.
- Path override: `MS_REALTY_PRODUCTION_RECOVERY_REPORT_PATH`
- Verification key: `MS_REALTY_RECOVERY_SIGNING_PUBLIC_KEY` contains public SPKI only; the private key is operator-only.
- Required scope: encrypted-at-rest and encrypted-in-transit off-site backups cover durable Payload/Postgres and CRM/CMS runtime data; exact-release runtime evidence is deterministically regenerated and revalidated after restore.
- Required drill: successful isolated restore of the cited backup with checksums, rollback procedure verification, named operator, and separate named reviewer approval.
- Launch rule: the tested local `docker:backup` path is not production disaster-recovery evidence.

## Content Quality Warnings

- Current review evidence:
- pass (path production/data/listing-publication-approval.json; expected 165; reviewed 165; missing 0)
- Pending review sample:
- none
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
- structured_data.missing_location: 2
- structured_data.missing_area: 166
- structured_data.missing_bedrooms: 10
- structured_data.missing_public_images: 9
- listing_quality.missing_area: 165
- listing_quality.missing_location: 2
- listing_quality.thin_public_gallery: 18

## Manual Source Audit (Non-Approval Evidence)

- Artifact: `production/data/manual-listing-audit.json`: complete_non_approval_evidence
- Coverage: 165/165 source rows (pass: 30, review: 75, hold: 52, source unavailable: 8).
- Broker approvals in this artifact: 0; broker confirmations still required: 165.
- Broker packet: `production/data/launch-candidate30-broker-packet.json` — 30 candidates, 0 publish-ready; selection: manual_source_pass_then_live_selection_score; overlap with prior automatic shortlist: 6.
- This evidence classifies the freeze catalog only. MSR-LISTING-PUBLICATION-1 publishes 163 listings from the full freeze catalog as source-locale inventory; 2 excluded by the approval. Archived freeze rows stay out of active search.

## Broker Verification

- Report: `production/data/listing-verification-report.json`
- Broker verification tasks: 165
- High priority tasks: 74
- Tasks by owner: broker_bg: 113, broker_ru: 52
- Publication/verification build overrides: `MS_REALTY_LOCALE_REGISTRY_PATH`, `MS_REALTY_LISTING_EDIT_LEDGER_PATH`, `MS_REALTY_LISTING_PUBLICATION_REPORT_PATH`, `MS_REALTY_LISTING_VERIFICATION_REPORT_PATH`

## Monitoring And Rollback

- Report: `production/data/launch-readiness.json`
- Readiness report override: `MS_REALTY_LAUNCH_READINESS_OUTPUT_PATH`
- Admin endpoint: `GET /api/admin/launch-readiness`
- Monitoring sources: privacy_events: imported, analytics_export: missing_export
- Rollback steps: 4
- Current machine evidence:
- missing (path production/data/monitoring-rollback-report.json)
- Private report: `production/data/monitoring-rollback-report.json` (ignored); template: `production/data/monitoring-rollback-report.json.example`.
- Path override: `MS_REALTY_MONITORING_ROLLBACK_REPORT_PATH`; validate it with `npm run monitoring:preflight`.
- Required machine proof: a redacted production report less than 24 hours old, a passing public HTTPS endpoint and alert, an automated rollback policy, a passing canary, and a verified isolated rollback drill.
- Release attestation: after every existing gate passes, set `MS_REALTY_RELEASE_SHA`, the mounted evidence paths, and the private signing key; run `npm run launch:evidence:capture`, then `npm run launch:evidence:verify` on the exact release SHA.
- Launch rule: an evidence bundle records validated inputs; it does not invent publication approvals, optional historical SEO evidence, or production readiness.

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
npm run monitoring:preflight
npm run payload:bootstrap
npm run payload:runtime
npm run payload:preflight
npm run r2:media:coverage
npm run listing:review-pack
npm run listing:preflight
npm run launch:readiness
npm run launch:inputs
npm run launch:preflight
npm run launch:evidence:capture
npm run launch:evidence:verify
```
