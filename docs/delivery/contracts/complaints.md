# Private complaint register

Plan §7/S5: record receipt, accountable staff owner, due date and outcome. This extends the
existing staff Operations workspace. No public review publication, client message, legal
conclusion or automatic statutory deadline is produced. Dates and external response evidence
are entered by the responsible person. BG is the source locale; staff BG/RU/EN copy follows
the existing Operations forms.

Global `complaint.manage` authority and current two-passkey staff access are required. Managers
receive this capability; brokers, clients and AI do not. Records are private to authorized
operators. This register does not create client or Case access. The initial report stays
unchanged; append-only review entries retain decisions, owner changes, due changes, resolution
and reopening. Resolution requires an explicit outcome and review. Native forms preserve
failed input and reconcile the same operation; stale revisions cannot overwrite a decision.

Acceptance: real PostgreSQL authorization/revocation, idempotent create, stale decisions,
resolution/reopen history and immutable events; native browser receipt/detail/review workflow,
role denial and mobile containment. No live complaint or customer response is part of tests.


Implemented and locally verified on 2026-09-29. Migration 0014 adds the capability and register;
triggers protect the original received report and append-only review history. Queue and history
have bounded pagination. Historical staff names remain visible after access is removed. Receipt
lookup is bound to the current actor and complaint operation type. Errors retain entered values
and clear review confirmation; the application never invents receipt, outcome or delivery.

Validation: five complaint integration tests plus twelve schema tests passed. Full local
`make check` passed 1237 tests in 124 files, lint, types and build; two unconfigured real-ClamAV
checks were explicitly skipped. Six complaint browser flows passed on Linux Chromium desktop,
mobile Chromium and mobile WebKit, with and without JavaScript. A final combined host/complaint
run passed 81 scenarios after a test-server IPv4/IPv6 correction. Evidence is under
`/Users/ivan/Code/.artifacts/ms-realty/complaints/20260929`.

Open outside this slice: public review consent/publication, customer-response approval and
live operator acceptance; key custody, partner fees and privacy processing/breach registers.
Human-supplied deadline/policy decisions and original launch authority remain unchanged.
