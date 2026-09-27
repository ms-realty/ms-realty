Application services, capability checks, repositories, jobs and integrations (plan AD5, AD6, AD7, AD11).
Every module imports `server-only`; services take a `db` (pool or open transaction) so callers can
compose several of them into one transaction.

- `config/env.ts` — `getEnv()`: zod-validated environment; production fails fast, dev/test get local defaults.
- `errors.ts` — `AppError` with stable codes, safe messages, field errors, retryability and known outcome;
  `toErrorBody()` is the §5.1 error result, whose wire code is the §5.1 standard name (`wireCode()`).
- `authz.ts` — `can(db, actor, capability, resource)`: role presets + record/locale-scoped grants + case
  participation and property relationships. Staff need an active staff principal with an active staff
  membership. `assertCanRead` turns an unauthorized private read into `not_found`. The AI service is
  draft-only (AT52).
- `auth/` — sessions (opaque token, SHA-256 at rest, idle/absolute expiry, rotation, revoke-all, step-up),
  cookie helpers (`__Host-` in production), email-link sign-in (enumeration-safe, rate-limited, single-use,
  15 min, GET inspects / POST consumes) and staff passkeys (`@simplewebauthn/server`). A link request only
  enqueues an `auth.email_link` job; the worker resolves the account, so response time reveals nothing.
- `operations.ts` — `runOperation()`: idempotent command execution recorded in `operations` (§5.1).
- `transitions.ts` — `executeTransition()`: domain transition + version check + activity + audit in one
  transaction; `tableStore()` adapts a table with `id`/`version`/state columns.
- `activity.ts`, `audit.ts` — business timeline (audience internal | participants | public) and the
  restricted technical trail.
- `rate-limit.ts` — Postgres token buckets keyed by purpose + keyed hash of the identifier.
- `jobs/` — pg-boss `JobQueue` with typed job names, `recordOutboxEvent()` for business intent committed
  with its change, email delivery on the `external_actions` ledger
  (queued → attempting → acknowledged (provider accepted) → verified (delivered) | failed | outcome unknown)
  and the `MessageProvider` seam with a test provider.
- `http/` — correlation id, same-origin check for cookie-authenticated mutations, session actor and safe
  error responses (`request.ts`), plus Next.js route/action wrappers and cookie writes (`next.ts`).
- `references.ts` — `nextReference()`: yearly human references (RQ-, RL-, …) inside the caller's transaction.
- `publication/` — the Publication module (§7.2–§7.4). `commands.ts`: the recorded human commands
  `approveFactRevision`, `submitListingRevision`, `approveListingRevision`, `prepareManifest` (an
  immutable manifest from the approved revisions), `activateManifest` (re-validate, switch the one
  pointer, project, verify by read-back, in one transaction) and `restrictPublication` /
  `withdrawPublication` (increment the generation). `presentation.ts`: the one eligible presentation —
  `eligiblePublications()` and `loadPublishedListings()` — that detail, search, counts, place
  suggestions and inquiry context all read through.
- `listings/` — `getPublicListing()` (P05/P06) from the active manifest, and the public view models.
- `search/` — `searchListings()` / `listSearchPlaces()`: parameterized SQL over the per-locale
  projection (`projection.ts`) joined to the eligibility subquery; filter semantics shared with
  `src/domain/search/filters.ts` through the case table; keyset cursors bound to the query.
- `inquiries/` — `submitInquiry()` (server-issued submission key, receipt-session cookie, one Inquiry per
  logical payload, coverage queue and outbox event in one transaction) and `readInquiryReceipt()`;
  `app/api/inquiries` serves them (JSON and no-JavaScript POST/Redirect/GET).
- `testing.ts`, `publication/testing.ts` — fixtures for integration tests only.

The email-link confirm route must live at `emailLinkPath` (`/sign-in/confirm`): GET renders a confirm page
from `inspectEmailLink()`, and only its POST calls `consumeEmailLink()`.
