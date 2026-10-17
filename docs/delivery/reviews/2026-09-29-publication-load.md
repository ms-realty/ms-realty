# Publication read paths and synthetic load

AT62 requires at least 10,000 Listings, at least ten times frozen launch inventory, 50 public
sessions and ten active staff sessions. The read p95 budget remains 500 ms and the local-command
budget 800 ms. A shared development Mac cannot qualify target infrastructure or field Web Vitals.

## Implemented changes

Migration `0017` indexes document property/purpose lookup, current-publication manifest lookup
and the text representation of seller-instruction IDs. The last expression matches the existing
fail-closed comparison with JSON evidence; no unsafe UUID cast, eligibility bypass or cached
consent was introduced. Query semantics and approval rules are unchanged.

The opt-in `npm run test:load` creates a uniquely owned local database. It publishes synthetic
listings through normal commands, includes all seven public locales, serves generated large
media samples and drives separate public request sessions and real native staff browser forms.
Warmup is recorded separately. The report includes errors, completed cycles, timing distributions,
SQL diagnostics, host/runtime provenance and explicit unmet qualification flags. It never marks
the release gate passed. Tokens are excluded from reports. No real email or AI provider runs.

Playwright now requests SIGTERM with a bounded grace period. Its previous default process-group
kill bypassed `scripts/e2e-server.ts` cleanup. Run `3a3f78c27d1b4877b8335143c710acd0` verified its
exact database and file directory absent after shutdown. That run had one browser pass and one
content-receipt timeout: the captured POST had no response before the five-second assertion
deadline, and the form remained pending with its draft intact. This is cleanup evidence, not a
passing browser qualification. No test deadline or retry was increased.

## Evidence and limits

Evidence directory: `/Users/ivan/Code/.artifacts/ms-realty/recovery/20260929/`.

- `load-cold-100.json` and `load-warm-100.json`: all 60 sessions completed an action cycle, but
  both missed the unchanged performance budgets. The 100-listing/10-second smoke workload does
  not meet the minimum inventory or duration. Warmup did not hide those failures.
- `native-load-index-probe.json`: the initial same-dataset, 1,000-listing search measurement was
  1,704 ms before four candidate indexes and 108 ms afterward. Later ablation/repetition was
  unstable (160 ms through 10,163 ms for empty search) under changing host load. This is not a
  stable speedup or a capacity pass. All five readbacks retained the same 1,000 eligible IDs and
  digest `9afe65e80670f95d96e3d069372a7524291f2df5ae67fd155c108d95ffa20bd5`.
- `load-query-*.json`: plans use the three retained indexes. The fourth candidate on manifest
  JSON was not used in the observed plans; restoring it did not restore earlier latency, so it
  is omitted. No planner fence or eligibility-query rewrite was added.
- `load-index-regressions.log`: 71 PostgreSQL tests passed across search, publication, map
  visibility and current public-media consent. `load-lint.log`, `load-types.log`, `load-build.log`
  and `load-schema-parity.log` record successful lint, TypeScript, native build and schema parity.
- `ci-ed65d2c3.log`: the preceding committed runtime passed complete CI, including 370 browser
  scenarios (five explicit skips) and 96 Linux visual checks. It predates this load/index slice.

The full 10,000-listing run completed with 18,571 locale projections, 100 large media samples,
50 public and ten staff sessions over 61.46 seconds. All sessions completed cycles (1,469 public,
161 staff); no action failures occurred. The performance test nevertheless **failed**: p95 public
search 1,797 ms, detail 888 ms, staff Today 1,279 ms, staff task 1,283 ms, command POST 2,018 ms.
Warmup was separate (first BG route 744 ms, subsequent locales 150–164 ms). Budget failures are
retained rather than reclassified as passes. The bare diagnostic eligibility count took 90.4 s;
the actual direct search took 562 ms and uses a different plan. Both need to remain distinguishable.

Full evidence: `load-10000.log`, `load-10000-report.json`, `load-10000-provenance.json`; compact
checked-in summary: `../evidence/2026-09-29-load-summary.json`. This run's exact owned database and
file directory were absent afterward. A subsequent fresh-build run passed all 12 hydration and
offboarding scenarios without retries across desktop/mobile Chromium and mobile WebKit. It also
checks the exact removal target, self-removal suppression, unknown-result suppression and the
rendered error panel's Axe contrast/accessibility rules. This does not approve the Figma artifact.

Frozen launch inventory, representative geography/content, queue non-starvation, target
infrastructure, actual providers and field metrics remain open. R00 and launch authority are
unchanged. This is a direct implementation review, not an independent review sign-off.

## Profile-driven follow-up

An instrumented repeat used the same original production build and full workload. It again
completed without action failures and missed the budgets. During the measured phase, Node used
0.94 CPU cores on average and event-loop utilization averaged 0.91. The database had a mean of
7.67 active connections; all ten application connections were active in 20 of 61 samples. These
samples do not measure exact pool queue time. CPU profiling adds overhead and is retained as a
separate diagnostic, not substituted for the ordinary run. See `load-profile*.json`, the CPU
profile and `../evidence/2026-09-29-load-profile.json`.

The follow-up removes one full eligibility scan per search: counts are derived from the type
facets already calculated under all the other filters. Only selected types contribute; the
existing exact-count cap and cursor semantics are unchanged. Sixty-nine database regressions
pass, including one/multiple/absent type counts and publication/media-consent withdrawal.

The CPU profile also identifies repeated Intl construction in card formatting. Immutable money
and date-time formatters are reused under bounded configuration keys. No record, permission,
consent, rendered value or HTML is cached. Eight formatting tests pass, including repeated
locale/currency/fraction/time-zone changes. Separate full-workload repeats qualify SQL alone
and then both changes together; their outcomes must remain explicit, including any failure.

All three ordinary runs used 10,000 Listings, 50 public sessions, ten staff sessions and the
unchanged 60-second duration and budgets. SQL-only observed p95 search 1,247 ms / command 1,574 ms
(1,902 public cycles / 190 staff commands); SQL plus formatter reuse observed 1,305 / 1,794 ms
(1,908 / 195). Neither had operation failures; **both performance tests failed**. The shared host
is uncontrolled, and the combined run does not prove additional end-to-end improvement from
formatter reuse. An alternating-order isolated diagnostic of 6,000 formatting pairs measured
297–412 ms constructing fresh objects versus 9–14 ms reusing them; that is only local formatting
cost. See `formatter-diagnostic.json`, `load-count-report.json`, `load-optimized-report.json`,
their build/source provenance and `../evidence/2026-09-29-load-comparison.json`.

CI 36574597177 on the preceding `8bf3b049` passed every job: 1,254 tests with two explicit skips,
the separate 11-test real-ClamAV run, 370 browser scenarios with five explicit skips, 96 visual
checks and packaging. The SQL/formatter/profiling follow-up requires its own CI. Fresh optimized
build, lint and TypeScript pass; the runtime tests above are the current local qualification.
No pool limit, budget, session count or provider configuration was increased to obtain a pass.
