# AT62 synthetic workload

`npm run test:load` builds and starts the real application against a newly migrated, uniquely
named local test database. The surrounding E2E server removes only that database and its own
synthetic file directory on exit. It refuses a non-local PostgreSQL host. Never point this
runner at a live provider, customer dataset or deployed application.

```sh
TEST_DATABASE_URL=postgres://postgres:pg@127.0.0.1:55476/postgres \
E2E_PORT=3187 NEXT_DIST_DIR=.next-load npm run test:load
```

The default dataset contains 10,000 distinct Listings, synthetic seller/document/approval
fixtures, Bulgarian source copy and rotating approved-fixture translations for the other six
public locales. Publication uses the normal commands. Each listing has its own photo record;
at least 100 sampled listings use generated 1280×960 WebP bytes. Every sampled media request
loads those larger bytes through current publication eligibility. Scan/rights/locale approvals
are explicitly synthetic, not actual professional, language or ClamAV evidence.

After recording sequential route warmup, 50 separate public request sessions and ten distinct
staff browser sessions start together. Public sessions repeatedly search, read detail and fetch
media; staff navigate Today and their own task, submit a native task transition and check its
receipt. The closed-loop workload has no think time and defaults to 60 seconds. Existing
unknown-outcome behavior is not bypassed: a failed lane is reported and stops new work. No
email or AI worker runs. The 500 ms p95 read and 800 ms p95 local-command budgets are enforced;
a performance failure remains a test failure even when every action is functionally correct.

The JSON report distinguishes measured HTTP/HTML timings, the command POST's browser network
timing, sequential warmup, database search/eligibility diagnostics, failures, actual completed
cycles, peak measured requests and environment. HTML/browser-navigation timings include more
than an isolated API execution; they are a conservative local diagnostic, not field Web Vitals.
A missing Git checkout in a container is recorded as unknown rather than invented provenance.
The retained production build and workload source must be separately bound for release use.

For a harness smoke run, use `LOAD_LISTINGS=100 LOAD_SECONDS=10`; those results explicitly fail
the minimum inventory/duration qualifications. Keep cold-start and warmed runs separately. On a
shared developer machine, record contemporaneous host load and container limits; do not stop
other owners' resources to manufacture a capacity pass.

Set `MSR_LOAD_PROFILE=1` for a diagnostic repeat with the same dataset and session counts.
The owned Next process writes a Node CPU profile and one-second CPU/event-loop/RSS samples into
`test-results/<run-id>/`. The load report includes aggregate PostgreSQL connection/wait samples
for only its own database; it does not collect query text or customer records. Profiling adds
overhead, so preserve the ordinary run and instrumented run separately. The preload is selected
only by the local E2E server and is never installed in production instrumentation.

The report always leaves the release gate open. It does not establish ten times an approved
frozen launch inventory, target infrastructure capacity, queue non-starvation, actual provider
behavior, geographic/content representativeness or field LCP/INP/CLS. Those remain separate
AT62/R08 evidence obligations, alongside owner inputs and R00.
