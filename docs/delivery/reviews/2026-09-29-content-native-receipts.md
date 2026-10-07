# O21 — durable content decisions without JavaScript

The earlier CI recorded a WebKit retry waiting for a content-publication receipt. Exercising
the entire lifecycle with JavaScript disabled exposed a deterministic defect: a qualified
claim review was committed, the new reviewed edition and audit history appeared, but native
form-state restoration lost the receipt when the available sibling review forms changed.
The user saw another actionable form instead of confirmation. This is consistent with the
same class of failure during a submission before hydration; the CI trace itself was unavailable.

Successful claim/editorial/publication/withdrawal decisions now redirect to the existing
actor-bound operation status route. It renders the shared receipt from persisted operation
identity and recorded time, and links back to the exact content workbench. Reload does not
resubmit or replace the recorded time. Unknown operation keys cannot claim success. A receipt
requires both its original actor and current access; a supplied different content-page ID is
rejected even if the actor can read both pages. Rejection/unknown-outcome forms retain their
existing recovery behavior, and publication authority/noindex rules are unchanged.

Four PostgreSQL content checks passed, including a new receipt test for repeat reads,
different actor, unknown key, wrong page and later access revocation. Nine production-build
browser journeys passed without retries across desktop Chromium, mobile Chromium and mobile
WebKit: full creation/review/publication/new-draft/withdrawal with JavaScript on and off, plus
the existing native draft check. Each decision now checks the durable route, visible receipt,
reload and stable recorded time. Public readback still proves drafts stay private, the reviewed
edition stays live while a new draft is edited, and withdrawal removes it. Build, lint and
TypeScript passed. This is synthetic authority evidence, not actual professional approval.

Logs: `/Users/ivan/Code/.artifacts/ms-realty/recovery/20260929/native-content-baseline.log`,
`content-tests.log`, `content-browser.log`, `content-build.log`, `content-lint.log` and
`content-types-final.log`. The first typecheck caught use of raw DB fields on the normalized
OperationView; the final implementation uses its operationId and the stored outcome timestamp.
R00 and remaining product/live qualification stay open.
