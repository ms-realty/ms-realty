# O23 — staff access removal and retained handover

## Scope and direct review

A freshly verified global access manager can end another staff membership with a reviewed
reason/handover plan. Sessions, passkeys, pending staff invitations and grants are revoked in
one receipt-backed transaction. A shared capability-management lock, current authority recheck,
expected principal revision and no-self-removal rule protect concurrent changes; a usable
manager must remain. This reuses the existing recovery/bootstrap revocation helper. No factor,
identity, work record or physical-custody evidence is deleted.

The page exposes summary counts of retained keys/Cases/tasks/inquiries, not their private
contents. Detail links keep existing capabilities. Physical return remains a separate reviewed
custody command. The most recent 50 former staff remain reachable from Manage access; older
records retain their direct authorized URL. Unknown/mismatched operation receipts cannot claim
success or expose a replacement destructive form. Private page restoration rechecks access.

Direct review covered the actor/target distinction, global versus scoped authority, fresh
verification, changed-payload replay, transaction/lock ordering, native validation/recovery,
receipt ownership, former-staff navigation and retained physical obligations. No independent
agent review is claimed. Assignment-by-assignment handover and external device/provider/HR
account removal are not implemented by this command.

## Verification and retained failures

Evidence directory: `/Users/ivan/Code/.artifacts/ms-realty/offboarding/20260929/`.

- Initial focused PostgreSQL checks: 28 passed across access grants, invitations, custody and
  three new offboarding cases. New cases cover factor/session/grant/invitation removal, retained
  key/Case ownership, actual later key return, receipt replay, stale/missing authority or review,
  client/self targets and competing manager removals.
- The first full run had 1246 passes, three failures and two explicit real-ClamAV skips. The
  replacement temporary cluster had C locale: lower('САНДАНСКИ') stayed uppercase. The UTF-8
  stand correctly returns lowercase. The other two failures were the existing proposal and
  release-CLI test deadlines under concurrent local work; their limits were not increased.
- Sequential qualification on en_US.UTF-8 PostgreSQL: **71 passed in seven files**, including
  every previously failed file plus the four affected access/custody files. This is joined
  evidence, not a claim that the original full run passed.
- The initial browser run caught a real missing validation message: the new command used a
  parser that discarded field errors. It now uses the shared field-aware parser. A later
  no-JavaScript check incorrectly rejected the form fragment on the correct sign-in URL; it
  now verifies exact pathname and the actual Staff sign-in heading.
- A further mobile native-form run exposed real horizontal overflow on Manage access. The
  trace shows neighboring elements intercepting the former-staff link; its screenshot is
  `manage-click-failure.jpeg`. Native controls now have bounded width and selectors have the
  explicit control height. A WebKit probe isolated selected-option overflow: bounding the
  native select content with the shared control styles reduced document width from 609px
  to the actual 390px viewport without changing native appearance. Staff links are blocks with a 44px minimum target. The regression
  asserts page containment and target height and clicks the real retained-staff destination.

Final fresh production build (`CIRCLE_NODE_TOTAL=3`, one browser worker): **13 passed, two
explicit virtual-passkey profile skips**. Twelve scenarios cover custody and offboarding with
and without JavaScript on desktop Chromium, mobile Chromium and mobile WebKit; the existing
AT36/AT39 desktop virtual-authenticator journey also passed, including capability grant and
session rotation. Offboarding checks actual retained database ownership, revoked credentials,
receipt reload, former-staff navigation, unknown receipt suppression and the revoked person's
real sign-in redirect. Axe WCAG 2 A/AA and 2.1 AA checks on the new form returned no violations
in all three enabled-JavaScript profiles. Page-containment and real 44px link-target assertions
passed on Manage access. Final browser run: `0896da3a4ea44909aedc6b3aebfc08e7`,
`browser-qualified.log`. Mobile screenshots were inspected. Repository lint (808 files) and
production-build TypeScript passed. The identity test emitted closed response-stream diagnostics
while exercising cancellation/reauthorization; no zero-console-error claim is made.

The original vanished `/tmp` cluster was not recreated over other data. The newly created
C-locale test cluster is stopped. The owned UTF-8 test cluster is on loopback 55476 under
`/Users/ivan/Code/.artifacts/ms-realty/offboarding/runtime/pgdata-utf8`.
No production mutation or existing Docker-service recreation occurred. Launch authority hashes
remain unchanged; R00 and live acceptance are open. Prior commit `7a95a8e0` passed all CI jobs
in run 36551918070; offboarding requires its own current-head CI.
