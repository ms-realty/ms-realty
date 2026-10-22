# Recovery quarantine and synthetic restore qualification

Direct implementation review against architecture §17.3 and the recovery contract; no independent
reviewer, live restore approval, independent archive or release acceptance is claimed.

The destination fence and credential invalidation are one transaction, with a stable restore
identity and one audit event. Missing control state denies startup. Queue/provider records and
owned work are retained; direct mail, Case mail, digests and AI reject before provider work.
The standalone worker rejects before initializing pg-boss. The web startup hook terminates
explicitly, because the installed Next server catches preparation failures and keeps listening
after a rejected hook. This is an offline fence; no claim is made about cancelling work already
claimed by an existing runtime. There is no reopening endpoint or bulk retry.

Local PostgreSQL 18 qualification: **1253 tests passed, two explicit real-ClamAV tests skipped,
127 files** (`full-tests.log`). Before that full run, the affected jobs/schema/recovery/AI/digest
files passed 60 checks and the Case-email/locale/intake-AI regressions passed 28. The four new
recovery tests cover credential invalidation, retained commitments, idempotence, transaction
rollback, missing row/schema, malformed control state, direct dispatcher rejection, no provider
calls and the real worker process exiting without creating a pg-boss schema. The same migration
rerun cannot clear quarantine. Lint, TypeScript, production build and Drizzle snapshot parity passed.

The native rehearsal used pg_dump/pg_restore 18 against two script-owned fresh databases on the
loopback test stand. It restored **99 tables**, compared every row count plus Case/external-action
records, preserved queued pg-boss work, rejected both old sessions and attempted no provider
calls. The source production server answered health; the quarantined destination exited with
code 1 and could not serve the public route. `rehearsal-verified.json` records the dump digest,
timestamp and explicit unqualified live/object/safety-tail/RPO-RTO fields. Its temporary dump and
both databases were removed by the script. No existing Docker service or live database changed.

Earlier rehearsal failures remain in `rehearsal*-errors.log`. The first assumptions about Next's
`Ready` banner and rejected-hook process exit were false. The probe now uses actual HTTP for the
positive control and process exit plus refused HTTP for quarantine. The first typecheck caught
a missing NODE_ENV key in the restricted pg-tool subprocess environment; it is fixed. The local
Jev secret matcher mistook a password-decoding expression for a literal secret; its configured
rule was inspected, and the environment-derived value is now passed through a local variable.
The semantic Jev check was budget-unavailable, not a review pass.

Evidence directory: `/Users/ivan/Code/.artifacts/ms-realty/recovery/20260929/`. The live R08 drill,
object completeness, independently acknowledged safety tail, replay/revalidation, approved
reopening, separately accountable reviewer and release gates remain open. The launch authority
files are unchanged. This report does not qualify production recovery or the complete product.
