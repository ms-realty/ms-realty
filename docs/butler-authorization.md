# Butler authorization — owner Option 2

Authority: the owner's decision recorded in lane `msr.owner_decisions_2026_10_02`.
This supersedes the former draft-only rule **for the bounded Butler command executor**.
Raw model/Hermes capabilities remain draft-only. No model receives send, publication,
access, legal, price or financial capabilities. This change grants no launch permission.

The backend denies by default. These six command classes are the entire automatic list:

| Action | Evidence the server must load and lock before execution |
| --- | --- |
| `acknowledgement.send` | Current case participant and contact eligibility; recorded human first contact; current reviewed acknowledgement template and exact validated rendering |
| `reminder.send` | The same evidence, for a reviewed reminder template |
| `chaser.send` | The same evidence, for a reviewed chaser template |
| `viewing.book` | Independent current acceptance by visitor and host of the same appointment revision, times, timezone and resources; listing available; existing resource/conflict checks and locks pass in this transaction |
| `document.record_received` | A persisted uploaded version belonging to the case; receipt bookkeeping only, without purpose/legal acceptance or clearing a condition |
| `task.create` | Internal creation only, current case and available owner; no client promise, cancellation, completion, condition decision or monetary effect |

First contact, prices, offers, terms, condition clearance/waivers, publishing/withdrawal,
indexable translations, access grants, cancellations, legal and monetary actions require
a person. Protected effects take precedence over an automatic action's label. Unlisted
actions are blocked. A model's `approved`, `safe`, participant or resource booleans confer
no authority.

## Backend integration

`src/server/butler/executor.ts` captures an immutable registry at server bootstrap. Each
`defineButlerAction` binds one fixed class, a strict command schema, a trusted `readAndLock`
adapter and its concrete executor. The command contains record references/data, never
evidence or permission flags. Do not expose registry construction, authority minting or
an actor selector as a route/Server Action/model tool.

The executor selects `system:butler`, hashes the parsed immutable command and binds
authorization to that command, case, idempotency key and callback identity. `runOperation`
checks it inside the same savepoint as the effect. A cast or JSON lookalike does not pass
the private WeakMap check. Direct `ai_service` writes and direct unregistered Butler
operations are blocked before their callbacks run. Other established human/background
commands retain their existing authorization and receipt behavior.

`src/server/butler/tasks.ts` supplies the concrete internal-task adapter and
`runButlerAction(db, { action, idempotencyKey, body })`. It creates an open task for the
current case owner after locking the case and checking current staff availability. Its
strict body is `{ caseId, title, purpose? }`; state changes, promises and authority fields
are rejected.

**Current execution coverage:** internal task creation is wired to real database records.
Messages, viewing booking and document receipts have policy checks but no production
adapter registered in this entry point. They return `blocked` until their actual template,
consent/resource or upload evidence adapters are qualified and registered. In particular,
the existing acknowledgement of an already-confirmed viewing is **not** evidence of both
sides accepting a proposed slot. No automatic customer send or booking has been enabled.

For message adapters, reviewed template/render evidence must come from trusted revision
and renderer records. Preserve existing consent, opt-out, recipient, deduplication and
provider reconciliation guards. A draft or enqueue receipt is not a confirmed send. A
provider timeout/ambiguous exception must be `outcome: "unknown"`, never a fresh-send retry.
For viewing adapters, reuse the existing appointment/resource guards; lock acceptance
revisions and broker/property resources. Do not fabricate a staff session to satisfy them.

Human-only requests create an `awaiting_approval` receipt without running the effect.
Approval/manual completion uses the existing, independently authorized human command
with current scope, revision and required step-up checks. A blanket approval boolean does
not turn the old Butler attempt into an executable one.

## Contract for Claude UI

No UI, layout, palette, copy or Figma changes are included here. The controller relays this
contract to **MS Realty UI/UX redesign**; shared-file coordination remains in lane `msr`.

The stable `ButlerReceipt` type lives in `src/domain/butler.ts`:

```ts
{
  policy: "owner_option_2_2026_10_02",
  operationId: string,
  action: string,
  verdict: "done_automatically" | "awaiting_approval" | "blocked",
  reason: string,
  outcome: "applied" | "not_applied" | "unknown",
  manual: {
    available: true,
    requiresAuthorization: true,
    requiresReconciliation: boolean
  }
}
```

Successful commands return `butlerReceipt` alongside the existing operation result.
Errors carry `current.butlerReceipt`; `findOperation` also returns the receipt for worker
recovery. `readButlerReceipt(db, session, operationId)` returns only this safe DTO to a
live staff session with current case access, without raw command/outcome/provider data.
Wire the actual UI transport only after the controller relays the shared-file agreement.

Render the three verdicts and always offer “Do it myself.” This is a choice of human
workflow, not an authorization grant. If `requiresReconciliation` is true, reconcile the
unknown result before repeating its external effect through either path.

Every settled valid command intent has an operation receipt and a `butler.verdict` audit
entry committed together. An identical retry returns the same receipt/result without
re-execution or duplicate audit; changing the body under the same key conflicts. Known
failures roll back business writes and retain the blocked verdict. Unknown external results
remain parked until trusted reconciliation records their actual outcome and preserves the
Butler receipt (`butler.reconciled` audit). Invalid envelopes or database outages cannot
claim a settled action receipt.

Local database tests use a disposable PostgreSQL 16.15 Homebrew fixture. They prove command
authorization/receipt behavior only; they are not Cloudflare staging, PostgreSQL 16.14
provider, template approval, real send, viewing-consent, parity or launch evidence.
