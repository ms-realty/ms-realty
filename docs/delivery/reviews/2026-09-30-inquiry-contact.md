# O03 / AT14: human contact and next commitment

An assigned broker can record an already completed contact against the inquiry's current,
party-bound contact method. An unanswered attempt does not set `firstResponseAt`; an explicitly
confirmed useful human response records the earliest observed response time. Automatic
acknowledgment stays separate. This is attributable human testimony, not mail-provider
delivery evidence, verification of a contact address, or a claim that the application sent a
message. Staffed-hour policy and live delivery qualification remain open.

Every record requires the actual contact time, a substantive outcome note, an owned future
follow-up and explicit human confirmation. A client promise is a separate, unchecked choice;
it cannot be inferred from an unanswered attempt. Existing tasks and promises are preserved.
The contact address, observation time, note, new task and promise choice are retained in the
private activity/audit history. Later responses never overwrite earlier observations.

The service checks current session, two passkeys, scoped inquiry/response/task permissions,
named responsibility and availability before replay and after database lock waits. It checks
the inquiry version and the party/contact/version binding inside the transaction. Known
rejections retain their failed operation receipt. Contact receipts bind their target record
at allocation, including failures, so a key for another accessible inquiry cannot give that
record an incorrect status. No database migration is needed for this increment.

Native and hydrated BG/RU/EN forms use the shared signed operation envelope and record-bound
permalink. Errors retain entered notes, clear human confirmation and provide current-record
comparison; changed contacts require explicit selection of the current address. A confirmed
POST redirects to the actor's authorized status page. The form has no send capability.
Staff language copy remains a draft for human language review.

## Source qualification before browser composition

Artifact root: `/Users/ivan/Code/.artifacts/ms-realty/recovery/20260930/`.

- `contact-db-baseline.log`: 32 checks across contact, work and operations on owned PostgreSQL
  18.6, all passing. The later race tests were not in this run.
- `contact-db-qualified.log`: 34 checks in those three files, all passing, 4.93 seconds.
  Real PostgreSQL lock races cover grant revocation while waiting for either the inquiry or
  contact row. Other checks cover useful/unanswered separation, atomic follow-up, replay,
  earlier/later observations, preserved promises, foreign contact/owner rejection, changed
  contact, failed receipt retention, revoked session/enrollment/absence, and concurrent
  observations on one revision.
- `contact-types.log` retains the fixture's invalid absence-field error. The corrected
  `contact-types-qualified.log` passes. `contact-lint.log` passes, 960 files; the subsequent
  disposable browser fixture and suite require the next candidate's checks.

Fresh production build and browser checks are pending after newer public workflow composition.
This source checkpoint does not pass R03, R08 or a live release gate.
