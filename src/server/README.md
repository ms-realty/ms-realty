Application services, capability checks, repositories, jobs and integrations (plan AD5, AD6, AD7, AD11).
Every module imports `server-only`; services take a `db` (pool or open transaction) so callers can
compose several of them into one transaction.

- `config/env.ts` — `getEnv()`: zod-validated environment; production fails fast, dev/test get local defaults.
- `errors.ts` — `AppError` with stable codes, safe messages, field errors, retryability and known outcome;
  `toErrorBody()` is the spec §19.2 error view model.
- `authz.ts` — `can(db, actor, capability, resource)`: role presets + record/locale-scoped grants + party
  relationships. `assertCanRead` turns an unauthorized private read into `not_found`. The AI service is
  draft-only (A66).
- `auth/` — sessions (opaque token, SHA-256 at rest, idle/absolute expiry, rotation, revoke-all, step-up),
  cookie helpers (`__Host-` in production), email-link sign-in (enumeration-safe, rate-limited, single-use,
  15 min, GET inspects / POST consumes) and staff passkeys (`@simplewebauthn/server`). A link request only
  enqueues an `auth.email_link` job; the worker resolves the account, so response time reveals nothing.
- `operations.ts` — `runOperation()`: idempotent command execution with durable receipts (AD6).
- `transitions.ts` — `executeTransition()`: domain transition + version check + activity + audit in one
  transaction; `tableStore()` adapts a table with `id`/`version`/state columns.
- `activity.ts`, `audit.ts` — business timeline (audience internal | participants | public) and the
  restricted technical trail.
- `rate-limit.ts` — Postgres token buckets keyed by purpose + keyed hash of the identifier.
- `jobs/` — pg-boss `JobQueue` with typed job names, the transactional outbox (queued → provider accepted →
  delivered | failed | outcome unknown) and the `MessageProvider` seam with a test provider.
- `http/` — correlation id, same-origin check for cookie-authenticated mutations, session actor and safe
  error responses (`request.ts`), plus Next.js route/action wrappers and cookie writes (`next.ts`).
- `references.ts` — `nextReference()`: yearly human references (RQ-, RL-, …) inside the caller's transaction.
- `staff/` — `createStaffAccount()` (idempotent by email, role-preset grants) and the `staff:create` CLI.
- `listings/` — the S2 publication path (`publication.ts`: confirm facts → submit → approve the exact
  version by hash → release to the website, and withdraw; each step a recorded human operation) with the
  `listings:publish` CLI; public read models over the released version only (`published.ts`, `detail.ts`
  `getPublicListing`, `home.ts` `getHomeOverview`) and their view models (`view-models.ts`).
- `search/` — `projection.ts` writes/removes a listing's `listing_search_documents` row when what is live
  changes; `search.ts` `searchListings()` / `listPlacesForSearch()` apply the domain F02 predicates.
- `media/` — public media URLs (`MEDIA_PUBLIC_BASE_URL`) for cleared, reviewed, disclosed public renditions only.
- `inquiries/` — `submitInquiry()` (idempotent by client operation id, rate-limited per IP) and
  `getInquiryReceipt()`; `app/api/inquiries/route.ts` is its POST endpoint.
- `testing.ts`, `listings/testing.ts` — fixtures for integration tests only.

The email-link confirm route must live at `emailLinkPath` (`/sign-in/confirm`): GET renders a confirm page
from `inspectEmailLink()`, and only its POST calls `consumeEmailLink()`.
