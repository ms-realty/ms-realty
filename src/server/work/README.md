# Agency work

This is the current-schema port of the useful inquiry, task, contact and Today behavior from
PR275. It uses `principals`/`parties`, current domain state machines and the immutable activity,
audit and outbox tables. It does not use the retired PR275 records or migrations.

`listInbox`, `listTasks`, `listContacts`, `readInquiry`, `readTask`, `readContact` and `readToday`
require a live staff session with active membership and two enrolled passkeys. Record,
case and locale grants are applied before queue ordering/pagination. Contact reads require an
accessible linked inquiry; contact verification does not imply authority or grant case access.

`acceptInquiry` explicitly assigns work to the staff member accepting it and creates the next
owned internal follow-up in the same transaction. It does not claim a client response or move
another owner's existing promises. `triageInquiry` records human dispositions; duplicate
review requires access to both inquiries, and resolution refuses open commitments.
`changeTask` requires a recorded outcome, dependency/review time, or cancellation reason as
appropriate. Evidence-required and publishing, communication, access and approval tasks cannot
be completed through this generic command.

Commands require `{id, operationId, expectedVersion, ...payload}`. They authorize before
idempotent replay, authorize again under the transaction, lock the current row and compare its
version. Mutation, activity, audit, outbox intent and operation outcome commit together. The
Next Server Action adapter adds staff-host and same-origin checks and binds signed form keys
to a command and record. A stale edit retains the draft and requires an explicit reviewed
reapply with a fresh operation key. Unknown outcomes keep the original key and an authorized
operation-status URL. No command sends externally.

Staff routes use host-relative URLs: `/{locale}/today`, `/inquiries`, `/inquiries/{id}`,
`/tasks`, `/tasks/{id}`, `/contacts`, `/contacts/{id}`. `/inbox` redirects to `/inquiries`.
Every page checks current staff access. Today combines bounded inquiry and task queues with
visible viewings, Case and listing work, reviews and delivery exceptions. Each queue reports
its authorized total or an unavailable state; a failed read is never presented as empty work.
Exact times name their zone: UTC for inquiries, tasks, Cases and listings, the agency zone
(Europe/Sofia) for key returns and the recorded zone for viewings; ages are relative to the
read. BG/RU staff copy is draft translation.

Verification on disposable PostgreSQL:

```sh
TEST_DATABASE_URL=postgres://… npx vitest run --project integration src/server/work --maxWorkers 2
TEST_DATABASE_URL=postgres://… npx playwright test e2e/work.spec.ts --project chromium-desktop
TEST_DATABASE_URL=postgres://… npx playwright test e2e/today.spec.ts e2e/today-binding.spec.ts
```

Each integration suite and browser run creates its own disposable database. Browser fixtures
seed a valid staff session; passkey ceremony proof lives in `e2e/identity.spec.ts`. The work
journey submits through the real public form, reads its durable inquiry from staff Inbox,
accepts responsibility, handles stale triage, records the task outcome and resolves the inquiry.
These local checks are not provider, operator or release acceptance evidence.
