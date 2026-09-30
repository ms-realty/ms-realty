# Search and receiving-staff read performance

Status: local implementation and synthetic evidence; R08 remains open.

Search derives the ordered page, property-type facets and cursor publication freshness from
one statement-local eligible projection. Selective search filters remain inside that projection;
property-type selection applies to the page/count/freshness but not the type facets. Cursor sort
keys stay exact decimal text through JSON aggregation. Hydration still checks current publication,
reviewed source authority and public-media consent before presenting cards. The replacement-offer
regression keeps the selected count constant: a new other-type offer must not stale the cursor;
a replaced selected-type offer must stale it.

The receiving-staff directory reads live scoped grants in one batch and applies the same grant
expansion, role presets, record/parent/locale and expiry decisions as individual checks. Task
receiver candidates also need active membership, present availability and two current passkeys.
The Case directory retains both required capabilities and does not truncate before filtering.
The task page and handover form share one authorized read for the response. Commands retain their
own current authorization, resource locks, version checks and receiver acceptance requirements.

A real PostgreSQL query-count regression reproduced 154 reads after adding 51 ineligible and ten
eligible staff, versus 12 reads before expansion. It now passes the bounded-growth assertion,
while retaining every eligible late-sorting receiver. A second regression revokes a grant after
the directory was read and requires the subsequent command to fail without a pending assignment.
Differential tests compare batch and individual checks across roles, direct/parent/locale scopes,
revoked and expired grants, suspended/ended membership, clients, unknown IDs and multiple required
capabilities. The initial CTE prototype failed because a Drizzle select builder without FROM is
not executable; the single-row outer source fixed that error before any performance claim.

Evidence under `/Users/ivan/Code/.artifacts/ms-realty/recovery/20260930/`:

- `search-cte-regressions.log`: 72 PostgreSQL tests passed for search, publication, map projection
  and media consent. `search-cte-types-v2.log`: TypeScript passed.
- `recipient-directory-red.log`: retained 154-versus-14 query-bound failure.
- `recipient-regressions.log`: 38 authorization/directory/Case/task tests passed.
- `recipient-absence-regressions.log`: 20 absence/offboarding/coverage/work tests passed.
- `recipient-browser.log`: fresh Linux production build, 51 Chromium/WebKit scenarios passed,
  including JavaScript-disabled forms, receipts, absence, ownership acceptance and key return.
- `recipient-types.log` and `recipient-lint.log`: TypeScript and lint passed (876 files).
- `ci-eb538812.log`: the preceding exact source passed CI run 36730049201: 1,321 tests (two explicit
  skips), 11 separate real-ClamAV checks, 456 browser scenarios (five skips), 96 visual checks and
  packaging. That CI result does not qualify these later performance changes.

Ordinary performance runs use 10,000 Listings, 18,571 locale projections, 100 large-media samples,
50 public sessions and ten staff sessions over the unchanged 60-second closed-loop workload.
The same owned Linux Playwright container calls native macOS PostgreSQL 18 through
host.docker.internal. This shared development machine is not target infrastructure. Runtime
source patches, build IDs and exit codes accompany the reports because the container cannot
resolve the external Git worktree metadata. No session count, timeout or acceptance budget changed.

Baseline: p95 search 1,410 ms, task page 5,432 ms, command POST 5,381 ms; 1,796 public and 60 staff
cycles. Search-only CTE: 1,049 / 4,741 / 4,934 ms; 2,134 public and 70 staff cycles. Both had zero
operation failures, every session completed, and both performance tests failed. One direct-search
diagnostic measured 434 ms before and 215 ms after; neither isolated timing proves production
capacity. The subsequent runs are recorded below; all four runs failed the unchanged budgets.

No release gate, launch-authority bytes, production service or external-provider setting changes.
R00 succession approval, frozen launch inventory, representative geography/content, queue fairness,
actual infrastructure/providers and field Web Vitals remain required. This is a source review with
bounded local evidence, not independent review or whole-product acceptance.

## Combined results and Today follow-up

| Source in this slice | Search p95 ms | Today p95 ms | Task page p95 ms | Command p95 ms | Public / staff cycles |
|---|---:|---:|---:|---:|---:|
| eb538812 baseline | 1410.24 | 1291.23 | 5432.09 | 5381.48 | 1796 / 60 |
| Search CTE | 1049.07 | 983.24 | 4740.87 | 4933.64 | 2134 / 70 |
| CTE + batch recipients / shared task read | 1499.70 | 1293.72 | 1471.95 | 3056.76 | 1741 / 160 |
| Also shared Today authorization context | 2071.32 | 1847.38 | 2234.16 | 4894.52 | 1151 / 100 |

Every session completed, with zero operation failures. The latest run was slower than the
preceding run. A closed-loop workload changes its actual request mix when staff pages become
faster, and the host is shared; neither observation establishes the cause of this regression.
No claim of overall throughput improvement or R08 acceptance is made. Search and command
latency still need representative isolated runtime profiling and a verified repair.

Today now resolves current staff authority and grants once inside one service call, then applies
those scoped grants to each of the four queue queries. No context is persisted between requests
or accepted from a caller. Commands recheck authority independently. The real query-count test
first reproduced 24 reads against a nine-read limit, then passed after the change. Record scope,
due date, role revocation and newly granted access remain covered.

A bounded follow-up alternated the old and new Today service paths for 12 paired waves, ten
staff requests per wave, on the same fresh native PostgreSQL 18 fixture (four connections).
Outputs matched exactly. Median wave duration was 23.95 ms before and 12.95 ms after; p95 was
29.58 versus 16.49 ms. This supports retaining the bounded read change, but measures neither
HTTP rendering nor the full catalogue workload and cannot explain or erase the failing load run.

Additional evidence:
- `today-context-red.log`: retained 24-versus-nine query-count failure.
- `today-context-regressions.log`: 17 PostgreSQL regressions passed.
- `today-context-browser.log`: fresh Linux build, 24 Today/task-handover scenarios passed across
  Chromium desktop/mobile and WebKit mobile with JavaScript enabled and disabled.
- `today-context-types.log` and `read-performance-lint.log`: types and lint passed (877 files).
- `today-paired-probe.mts`, `today-paired-probe.log`, `today-paired-report.json`: paired diagnostic.
- `load-*-report.json`, `load-*-provenance.json` and patches bind all four local failures to their
  source and build. Latest build: `6EIaI5FJKRYahb_aO3rmR`.

[Portable measurements and provenance](../evidence/2026-09-30-read-performance.json) preserve
all runs and the paired samples. Full CI for this commit is pending; eb538812's green CI applies
only to that preceding source. The review here is the implementation author's source review.

## Expression-index diagnostic on ac92db7e

A fresh PostgreSQL 18 database with 2,000 BG-only synthetic eligible Listings tested whether
expression indexes on `property_relationships(id::text)` and `document_versions(id::text)`
would improve the publication eligibility join. The database was analyzed before measurement.
The indexes existed only in that disposable database and were dropped before the final baseline;
the database and its private fixture files were removed when the probe completed successfully.

| Stage | Eligible-ID read ms | EXPLAIN count execution ms |
|---|---:|---:|
| Baseline | 337.43 | 455.31 |
| Authority expression index | 343.19 | 451.69 |
| Document-version expression index | 404.97 | 487.31 |
| Both expression indexes | 350.37 | 464.72 |
| Baseline after removing indexes | 344.31 | 463.20 |

Every stage returned the same 2,000 eligible IDs (SHA-256
`c91fdbed9afb34c7d5429619caf5bd974b6331dd36f8258a684845031a541544`). Empty-query and
text search also retained a count of 2,000. Plans show that PostgreSQL used the diagnostic
indexes, but this experiment provides no evidence of a useful improvement. No migration was
added. These are single observations on a smaller, BG-only service fixture, not repeated load
samples or proof about the 10,000-Listing multilingual workload. The raw report's `seedMs`
includes measurement time and must not be reported as seeding-only duration.

Artifacts under `/Users/ivan/Code/.artifacts/ms-realty/recovery/20260930/`:
`publication-index-probe.mts`, `publication-index-probe.log`, and
`publication-index-probe.json` (full plans). R08 remains failed. The next useful diagnostic is
the existing full catalogue's join shape and per-request connection/query timing; repeating the
same full HTTP load without a measured repair would not establish a cause.
