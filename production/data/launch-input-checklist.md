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
- Required columns: `old_url,target_path,target_locale,source_domain,equivalent_content,reviewer,approved_at,reason`
- Launch rule: set `equivalent_content=true` only after same-content human review. Homepage targets stay blocked.

## External SEO Exports

- `migration/external/seo/search-console.csv`: missing_export, 0 matched rows, domains: none
- `migration/external/seo/yandex-webmaster.csv`: missing_export, 0 matched rows, domains: none
- `migration/external/seo/backlinks.csv`: missing_export, 0 matched rows, domains: none

- Optional analytics: `migration/external/seo/analytics.csv`; privacy events are already imported.
- Launch rule: required SEO exports must match crawled URLs from both `makler-realty.com` and `makler-realty.ru`.

## Validate After Inputs

```bash
npm run redirects:build
npm run seo:evidence
npm run launch:readiness
```
