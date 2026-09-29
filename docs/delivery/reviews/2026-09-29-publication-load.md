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
