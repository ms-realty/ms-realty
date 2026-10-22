# Reviewed key deadline amendment — 29 September 2026

## Behavior and direct review

`key.amend_deadline` changes only a checked-out set's due-back time. It shares the physical
custody command's live staff/key.manage checks, row lock, version conflict and stable operation
receipt. The same active-holder/two-passkey qualification required for issue applies to an
amendment. An offboarded holder's physical return remains possible through the existing command.
The history joins the original operation to identify amendments without a schema migration or
rewriting previous events. Its distinct audit action contains only the existing state digest.

The form labels Europe/Sofia, rejects ambiguous/nonexistent native local times through the
existing converter, and requires a reason/agreement plus fresh human confirmation. Previous
values survive rejection. This is an operator declaration, not independent evidence that the
holder agreed or a record of a new physical handover. No email/reminder/provider operation runs.

Direct source review covered command authorization, stale/concurrent mutation, operation replay,
receipt authorization, preserved physical facts, history pagination and native form recovery.
No independent-agent review is claimed. Automated reminders and full offboarding orchestration
remain open.

## Bounded verification

- Nine PostgreSQL custody tests passed. New cases cover unchanged/past/reviewless rejection,
  one receipt on replay, changed-payload conflict, immutable old deadline, offboarded-holder and
  unauthorized-operator denial, and competing deadline amendment/physical return.
- Six browser journeys passed on a fresh production build, across desktop Chromium, mobile
  Chromium and mobile WebKit, both JavaScript enabled and disabled. Each checks retained error
  input, cleared confirmation, unchanged database version after rejection, exact committed
  deadline, prior event, same holder/state and later physical return.
- TypeScript and repository lint (802 files) passed. No full suite rerun was necessary for
  this bounded command; the PR's current-head CI remains a separate check.
- Mobile WebKit screenshot inspected: both commands are separately labelled, controls and
  evidence remain within the viewport, and history distinguishes the deadline amendment.

Logs: `/Users/ivan/Code/.artifacts/ms-realty/key-deadline/20260929/` (`service.log`,
`browser.log`, `lint.log`, `types.log`). Browser run `499cb252af704eeaae3dbfe8b9d0e0bc`.
The build/test stand uses a disposable database on native PostgreSQL 18, not production.
Launch authority files and blocked R00/live gates are unchanged.
