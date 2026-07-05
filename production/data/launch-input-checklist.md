# Launch Input Checklist

Generated: 2026-07-05T00:00:00Z

Status: blocked
Blockers: redirect_reviews, external_seo_exports

## Redirect Reviews

- Workbook: `production/data/redirect-approval-workbook.csv`
- Review rows: 165
- Deployable approvals: 2/165
- Remaining approvals required: 163
- Import path: `migration/reviews/redirect-approvals.csv`
- Admin import endpoint: `POST /api/admin/redirect-approvals/import`
- Admin workbook endpoint: `GET /api/admin/redirect-approval-workbook?pending=1`
- Review helper columns: `target_listing_id`, `review_status`, `same_content_checklist`
- Approval import columns: `old_url`, `equivalent_content`, `reviewer`, optional `approved_at`, optional `reason`
- Launch rule: set `equivalent_content=true` only after same-content human review. Homepage targets stay blocked.

## External SEO Exports

- `migration/external/seo/search-console.csv`: missing_export, 0 matched rows, domains: none
- `migration/external/seo/yandex-webmaster.csv`: missing_export, 0 matched rows, domains: none
- `migration/external/seo/backlinks.csv`: missing_export, 0 matched rows, domains: none

- Admin import endpoints:
- `POST /api/admin/seo-evidence/import?source=search_console`: `url,clicks,impressions,position`
- `POST /api/admin/seo-evidence/import?source=yandex_webmaster`: `url,indexed,issue`
- `POST /api/admin/seo-evidence/import?source=backlinks`: `target_url,source_url,referring_domain`
- Template endpoints: `GET /api/admin/seo-evidence/template?source=search_console`, `?source=yandex_webmaster`, `?source=backlinks`
- Optional analytics: `migration/external/seo/analytics.csv`; privacy events are already imported.
- Launch rule: required SEO exports must match crawled URLs from both `makler-realty.com` and `makler-realty.ru`.

## Content Quality Warnings

- Workbook: `production/data/listing-quality-workbook.csv`
- Scope: 165 source listing rows; warning counts below include indexable localized listing entries.
- Review columns: `review_status`, `required_editor_fields`, `facts_reviewer`, `media_reviewer`, `review_notes`
- Admin editor endpoint: `POST /api/admin/listings/edit`
- missing_price: 167
- missing_bedrooms: 167
- media_review_pending: 167
- missing_location: 5

## Validate After Inputs

```bash
npm run redirects:build
npm run seo:evidence
npm run launch:readiness
npm run launch:inputs
```
