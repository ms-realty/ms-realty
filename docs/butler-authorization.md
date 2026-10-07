# Butler authorization — draft-only

Authority: the current owner rule in `AGENTS.md` and the approved
[R00 successor policy](delivery/r00-successor-policy.md). Butler/Hermes may draft within
a selected task. Automatic internal task creation, customer sends, booking, publication,
approval and other autonomous routine actions require a separately accepted policy and
proof from the exact release before they can be enabled.

## Server boundary

`src/domain/butler.ts` recognizes six routine intent names: `acknowledgement.send`,
`reminder.send`, `chaser.send`, `viewing.book`, `document.record_received` and `task.create`.
Recognition and complete server evidence do not grant execution authority. A valid routine
intent returns `awaiting_approval` with reason `draft_only` and outcome `not_applied`.
Protected actions still require a human; missing or invalid scope, unknown actions and
unregistered send/booking intents are blocked.

`src/server/butler/executor.ts` captures a trusted registry and strict schemas at bootstrap.
Requests cannot supply evidence, callbacks or an actor selector. Its opaque authorization
binds the parsed immutable command, case, key and callback identity. `runOperation` checks
that binding and current evidence inside a savepoint, then denies every new Butler effect
before its callback can run. Raw `ai_service` writes and forged Butler authority are also
blocked. Ordinary human commands keep their independent authorization.

`src/server/butler/tasks.ts` retains the old `task.create` input
`{ caseId, title, purpose? }`, current-case lock and available-owner checks. It contains no
task or activity insertion. A valid old request records a truthful denial; it cannot create
a task, even if a trusted adapter is registered. Promise, state and approval flags remain
invalid input. No customer-send or booking adapter is registered in this worker entry point.

## Receipt and manual path

`awaiting_approval` records a blocked intent, not a resumable automatic task. Approving a
draft or changing the policy cannot execute that old attempt. A person takes the step
through a separately authorized manual command with current scope, revision and any
required identity checks. The old idempotency key always replays its stored result.

The safe `ButlerReceipt` DTO retains its existing fields:

```ts
{
  policy: "owner_draft_only",
  operationId: string,
  action: string,
  verdict: "awaiting_approval" | "blocked",
  reason: string,
  outcome: "not_applied",
  manual: {
    available: true,
    requiresAuthorization: true,
    requiresReconciliation: boolean
  }
}
```

New settled intents use `owner_draft_only`. Errors carry `current.butlerReceipt`, and
`findOperation` returns the same receipt for worker recovery. `readButlerReceipt` exposes
only that DTO to a live staff session with current case access. Every settled valid intent
commits its operation receipt and one `butler.verdict` audit together. An identical retry
adds neither an effect nor another audit; a changed body under the same key conflicts.
Failed evidence checks roll back savepoint writes and retain a blocked `not_applied`
receipt, even if a reader reports uncertainty: no effect callback began. Invalid envelopes
and database outages cannot claim a settled receipt.

Historical records may retain policy `owner_option_2_2026_10_02`, verdict
`done_automatically` and outcome `applied`. Those fields describe a stored prior result,
never authority for a new effect. Historical success and failure replay unchanged. An
unknown historical result remains parked with `requiresReconciliation: true`; trusted
reconciliation records what already happened, retains the original policy marker and
adds one `butler.reconciled` audit. It never repeats the effect. Reconcile before repeating
an unknown external effect through a manual command.

Always offer the independent manual path. Render `done_automatically` only for historical
applied receipts or their confirmed reconciliation, never for a new draft-only intent.
No UI transport, layout or Figma changes are included in this server correction.

Disposable PostgreSQL tests verify denial, absence of task/activity insertion, savepoint
rollback, readback, idempotency and historical reconciliation. They are local regression
evidence; they do not clear worker/provider, staging or launch gates.
