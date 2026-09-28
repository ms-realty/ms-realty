# Case email — implementation contract

Status: local implementation and bounded qualification completed on 28 September 2026.
Architecture §9, AT44, AT46–AT48. In-app conversation remains separate from this
staff-only email workflow. This contract is not provider activation.

A staff user with current Case access and `message.draft` prepares one plaintext email
revision to explicitly selected, verified participant contact methods. A separate review
shows exact recipients, subject, body, channel, attachments (initially none), sender and
reply address. Human approval uses `message.send_external` and binds all of those values
and recipient/contact versions to the immutable revision and logical send identity.
Hermes can only produce a draft. Editing creates a new revision and invalidates approval.

Queue creation and approval commit atomically. The worker rechecks current participation,
contact verification, purpose-specific service eligibility, approver authority, digest,
reply/sender configuration and cancellation before provider I/O. Dispatch is serialized
against participation/consent changes, with a durable attempt committed before the
external call. Concurrent workers cannot send twice. Unknown outcomes are reconciled,
not replayed; definite rejection retries retain the exact key within the 24-hour window.

Each recipient has an observable delivery attempt; provider acceptance is not delivery.
Signed, deduplicated callbacks may resolve an attempt; a later adverse event must not be
lost. UI state comes from delivery records and cannot turn an email into in-app delivery.
An opaque reply address correlates replies but grants no authority. Inbound content and
attachments remain quarantined/triaged until explicit Case assignment and source review.

Acceptance requires: changed approval content/recipient rejected; revoked participant,
paused service eligibility and inactive approver prevent dispatch; two workers produce one
send; timeout remains unknown after repeat jobs; delivery/bounce ordering does not regress;
CSRF/host and record scope hold; no-JavaScript draft/review/receipt flow works; provider
configuration and DNS stay inactive until separately approved and qualified. Actual
Resend acceptance/delivery and inbound-domain evidence remain release gates.

Implementation should reuse `messages`, `approvals`, `message_attempts`, `external_actions`,
Case authorization, shared forms/operation receipts and the existing provider seam.
The existing receipt privacy contract must not be widened merely to match a visual mock.

## Implemented boundary

One verified participant recipient per immutable plaintext draft; attachments and bulk sends
are not exposed. Staff review binds the sender, opaque reply address, recipient/contact and
service-eligibility versions, subject and full body. `CASE_EMAIL_ENABLED` is disabled by
default and requires `EMAIL_FROM` plus the qualified `CASE_REPLY_DOMAIN`. No deployment
configuration was enabled. No new service eligibility is inferred from a marketing/search
subscription or portal login. Where the corresponding verified `service_updates` record
is absent, the screen truthfully has no eligible recipient. Capturing that eligibility through
an approved client-facing policy remains separate work.

Native approval forms remain mounted after the state transition, preserving the operation
receipt with JavaScript disabled. The persisted approval timestamp supplies the receipt on
reload. Queue sweeps skip disabled Case mail so access mail cannot be starved by it.
Accepted, delivered, bounced, failed and unknown outcomes are distinct; attempt records
and the Message are synchronized transactionally with authenticated delivery reports and
operator reconciliation. A definite rejected attempt remains failed even if its logical send
is queued for a bounded retry.

Validation: 206 tests across 22 Case/auth/jobs/subscription/form files passed on disposable
PostgreSQL. The final Case-email guard run passed 15/15, including two added worker-routing
and queue-starvation tests. Six browser scenarios passed after a fresh production build,
on desktop Chromium, mobile Chromium and mobile WebKit, with and without JavaScript.
The final screenshot review found and fixed WebKit overflow from a long native select
option; the browser regression asserts viewport containment. TypeScript and full-repository
Biome passed. Evidence is retained under
`/Users/ivan/Code/.artifacts/ms-realty/case-email/20260928`.

Outstanding broader communication requirements: approved service-eligibility capture,
attachments, multi-recipient revisions, ICS notification dispatch and safe inbound triage.
The current reply token is a correlation address, not an implemented inbound Case importer.
Live provider delivery, sender/reply DNS and owner release evidence remain unqualified.
