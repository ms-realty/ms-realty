# R08 / AT64 — offline restore quarantine

This is the fail-closed first step of recovery, not a complete recovery point or a production
restore tool. The independent safety ledger, object archive, seal/completeness checks, operator
review and controlled reopening remain required by architecture §17.3. No release gate is
passed by this implementation or its synthetic rehearsal.

Migration 0016 adds one persistent runtime control row. Newly migrated installations start
normally. On an isolated restored destination, the offline recovery preparation transaction
sets quarantine, binds the restore ID and database archive SHA-256, revokes restored sessions,
unconsumed email links and pending invitations, consumes outstanding WebAuthn challenges and
records one audit event. Retry with the same identity returns the stored result. A different
restore identity is refused. Migration reruns cannot reset an existing quarantine.

Case/task ownership, grants, passkey records, publication pointers, consent/deletion records,
operation/external-action history, pending mail and pg-boss work remain intact for reconciliation.
Retaining these records does not authorize their use: all web surfaces and worker startup are
blocked while safety-tail completeness/current authority are unknown. There is no reopening
API, environment bypass, automated grant restoration or blanket outbox retry in this slice.

Next's instrumentation checks before request handling and explicitly exits on failure. In the
installed Next 16.3 runtime, the console's `Ready` banner precedes configuration/instrumentation,
and a rejected hook alone leaves the listener alive; neither proves service readiness. The
dedicated startup connection is always closed. The standalone worker checks before pg-boss
startup, and mail/case-mail/digest/AI dispatch entry points also re-read quarantine. Missing
control rows, missing migrations and unreadable state fail closed. Builds without DATABASE_URL
remain possible; that mode cannot open the restored database.

This is an **offline restore fence**, not an in-flight kill switch. Before invoking
`quarantineRestoredDatabase`, the destination must have no web/worker processes, no traffic,
and no provider credentials/egress. Existing in-flight provider calls cannot be recalled by
this transaction. Keep the source and destination isolated until safety-tail replay, object
digest verification, current access/publication review and provider-outcome reconciliation are
implemented and approved. Do not point an old application revision, which lacks this fence,
at the destination. Clearing the control row manually is not a supported recovery procedure.

## Repeat the synthetic local rehearsal

Use an owned disposable PostgreSQL 18 on loopback and PostgreSQL 18 client tools. Set
TEST_DATABASE_URL only for the command. The script creates both databases itself, consumes
only its own synthetic dump, refuses non-loopback connections/connection overrides, never uses
`--clean`, and drops only generated database names. It cleans up its temporary archive.

```sh
NEXT_DIST_DIR=.next-recovery npm run build
# TEST_DATABASE_URL points to the owned local test stand; PG_BIN holds its PG18 tools.
RECOVERY_NEXT_DIST_DIR=.next-recovery npm run recovery:rehearse
```

The report checks actual pg_dump/pg_restore, every restored table's row count, Case and
external-action readback, preserved queue rows, revoked sessions, zero provider calls and the
production web process refusing to serve the quarantined destination. A normal source must
first answer HTTP health. The report explicitly sets `sealedRecoveryPoint:false`,
`launchReady:false` and identifies the unexercised object archive, independent safety tail,
operator review and RPO/RTO. Do not submit it as signed live R08 evidence.
