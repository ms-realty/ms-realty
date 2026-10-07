# Calendar mail implementation review

Scope: current calendar attachment diff extending reviewed Case mail, plus the Linux native
select repair. Direct review in this session; no independent multi-agent review is claimed.

## Standards

No unresolved correctness finding in the reviewed slice. Generated snapshots are strict and
bounded, sender/recipient identity is checked, unrelated Case/appointment selection is denied,
and approval plus provider handoff recheck the current appointment and participant. The
worker retains the existing current staff grants/two-passkey checks and unknown-outcome
no-replay rule. Case then appointment locks serialize snapshot creation; appointment commands
read Case authority without taking a reverse Case update lock. No uploaded files, remote
attachment URLs, private logistics or additional attendee addresses enter this path.

The first provider-payload test reused an already consumed mock Response; its fixture now
returns a fresh response per simulated call. A concurrent-build integration run timed out;
the clean rerun passed at the unchanged timeout. Neither issue was hidden by wider timeouts.

## Spec

Architecture §6.4 / AT32 / F22 is partially implemented: staff can review and queue generated
REQUEST/CANCEL bytes for the committed version, with stable UID and increasing cancellation
SEQUENCE. Provider acceptance is not attendance. Actual invitation/cancellation generation,
stale preview rejection, queued-version/participant invalidation and unchanged organizer are
covered by server tests; native browser acceptance reaches the durable queue without sending.

Automatic notification/reminder fan-out, notified/acknowledged sequence reconciliation,
external calendar clients and live provider proof remain open. This slice does not complete
F22, R00, R11/R12 or overall product acceptance. Launch authority files are unchanged.

Validation: 37 targeted tests; 12 Linux browser scenarios; full `make check` passed lint,
types, 1232 tests in 123 files (two explicit unconfigured real-scanner skips) and build.
Evidence: `/Users/ivan/Code/.artifacts/ms-realty/calendar-email/20260929`.
