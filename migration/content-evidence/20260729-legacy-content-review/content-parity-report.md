# Legacy Content Parity Report

Generated: `2026-07-30T12:04:41+00:00`
Focus source: `makler-realty.com`

## Decision

Do not publish raw legacy text. The CMS seed is a review-only provenance link, not public usage; only an explicit approved-CMS legacy URL link counts as `used`.

## Exact Mismatch

- Crawl inventory URLs: 457
- Captured text: 418
- Used through direct approved-CMS source links: 0
- Seeded for review only: 160
- Captured but unlinked/unused: 258
- Robots-disallowed: 29
- Capture-time 404: 10
- Unavailable: 0
- Captured without a direct approved-CMS link: 418
- Unresolved non-listing routes: 292

## CMS Linkage

- Approved CMS documents: 6 (6 human-approved)
- Legacy-marked approved documents: 3
- Legacy-marked documents without a direct legacy URL: 3
- Direct approved-CMS capture matches: 0
- CMS seed records with source URLs: 165 (160 captured; 5 unavailable at capture time)

## Counts by Source and Type

| Source | Type | Crawl | Used | Seeded for review | Unused | Robots | 404 | Unavailable | Route mapped | Route unresolved |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| makler-realty.com | listing | 113 | 0 | 109 | 0 | 0 | 4 | 0 | 113 | 0 |
| makler-realty.com | page | 63 | 0 | 0 | 50 | 9 | 4 | 0 | 0 | 63 |
| makler-realty.com | post | 5 | 0 | 0 | 4 | 0 | 1 | 0 | 0 | 5 |
| makler-realty.com | taxonomy | 97 | 0 | 0 | 91 | 6 | 0 | 0 | 0 | 97 |
| makler-realty.ru | listing | 52 | 0 | 51 | 0 | 0 | 1 | 0 | 52 | 0 |
| makler-realty.ru | page | 41 | 0 | 0 | 32 | 9 | 0 | 0 | 0 | 41 |
| makler-realty.ru | post | 37 | 0 | 0 | 37 | 0 | 0 | 0 | 0 | 37 |
| makler-realty.ru | taxonomy | 49 | 0 | 0 | 44 | 5 | 0 | 0 | 0 | 49 |

## Safe Content-Preservation Import

Create a review-only import queue from rows with content_status=unused, preserving the legacy URL and text_sha256 as provenance.

Required before any publication:
- A human reviewer must choose retain, rewrite, same-content redirect, or approved 410 for each unresolved legacy route.
- Any import must store the legacy URL and captured text_sha256, then remain draft/review-gated until approved.
- Robots-disallowed and 404 rows need a route decision, not a raw-content import.

Do not:
- Do not publish raw extracted text.
- Do not treat cms_seed source_imported_review_required records as public content.
- Do not use homepage or search-page redirects as a fallback for unresolved URLs.

## Per-URL Audit

Every joined URL and its capture, route, approved-CMS, and CMS-seed state is in `content-parity-report.json` under `urls`. Raw extracted body text is intentionally omitted from this report.
