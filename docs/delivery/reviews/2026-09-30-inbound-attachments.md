# Human-selected inbound attachments — F13 / AT42

Implemented locally; live Resend/storage/scanner qualification and exact-head CI remain open.

After a human assigns an incoming email to one Case and participant, an explicitly authorized
employee can choose one attachment, a safe document name, purpose and classification, and record
why it belongs in that Case. A fresh staff session and current Case, compliance and restricted
document grants are required. Closed Cases, revoked participants, unlisted attachments and
unreviewed requests are rejected. Receiving a message never proves a sender's identity.

The command reads bytes through a bounded provider adapter, then locks the Case before the
inbound record, and rechecks scope, source, participant and both revisions. It composes the
existing actor-bound document upload, immutable sealing and transactional `files.process` queue
path. One database transaction records the document version, append-only provenance, audit,
Case update and durable actor-bound operation receipt. Concurrent imports cannot create two
versions for one email/attachment pair. Replaying a completed operation rechecks current access
and returns its original result without another provider call. Provider failure leaves no partial
document or success receipt and permits a safe retry.

The provenance links the original email metadata digest, selected provider attachment identity,
Case, attributed participant, employee and reason to the exact sealed version and SHA-256.
It does not claim that the earlier email metadata proved those later downloaded bytes. The
migration prevents updates/deletes of import provenance and enforces unique source/version links.
No imported file is added to an outgoing message, shared with a client or accepted for a purpose.
Pending, failed and infected scans remain unavailable. A clean scan permits the existing separate
human review; it never creates a legal/professional conclusion.

## Provider contract

Primary documentation checked 30 September 2026:
[retrieve one received attachment](https://resend.com/docs/api-reference/emails/retrieve-received-email-attachment)
and [receiving attachments](https://resend.com/docs/dashboard/receiving/attachments).
Resend supplies metadata with an expiring download URL; a later attempt fetches fresh metadata.
The documented URL lasts one hour. The implementation permits only the fixed Resend API origin
and the exact HTTPS inbound-CDN path for the selected email/attachment. API credentials are never
sent to the CDN. Both requests reject redirects and share a 30-second deadline. Metadata is
bounded to 64 KiB, content to 20 MiB and the stated length, with identity/expiry/metadata checks.
The existing signature inspection measures actual type; unsupported files are rejected. Signed
URLs and raw network errors are neither stored in receipts nor propagated to application logs.

`CASE_INBOUND_ENABLED=1`, `MAIL_PROVIDER=resend`, the project key, private storage and the normal
ClamAV worker must be configured by the operator. Defaults remain disabled. An explicitly named
synthetic provider reads UUID-addressed fixture files only in the existing loopback test-outbox
mode; production-origin configuration cannot enable it. Browser evidence uses this synthetic
provider, not Resend. Storage writes preceding a database rollback can leave inaccessible private
objects, as in the existing upload path; object lifecycle/recovery qualification remains required.

## Interface and verification

The native form works with JavaScript on or off. A revision conflict preserves selected attachment,
filename, purpose, classification and reason in a short-lived session-bound draft, but clears the
review checkbox. Success survives page reload. A forged receipt query cannot display a success
receipt; the independently read import record remains visible to authorized staff. The screen
links to the Case's normal restricted-document scan/review workflow. BG/RU/EN copy is present;
public translations and indexing are unchanged.

Artifacts: `/Users/ivan/Code/.artifacts/ms-realty/recovery/20260930/`.

- `attachment-adapter-tests.log`: 20 provider boundary checks passed (IDs, origin/path, credentials,
  expiry, size, streaming cancellation, errors and API-header isolation).
- `attachment-integration.log`: 17 PostgreSQL checks passed, including a real transactional
  pg-boss enqueue, immutable provenance, races, source binding, post-retrieval revocation,
  changed Case, retries, malware outcomes and separate human acceptance. Scanners are injected
  only in tests; this is not a fresh live ClamAV result.
- `attachment-regressions.log`: 76 checks passed in seven files, one explicit real-ClamAV skip.
  Includes inbound triage, files, provider configuration and recovery quarantine regressions.
- `attachment-browser.log`: fresh Linux production build; 24 linked inbound/attachment checks
  passed across Chromium desktop/mobile and WebKit mobile, including 320px and JS on/off.
- `attachment-browser-final.log`: fresh final build; all 18 attachment journeys passed after
  shortening the mobile purpose labels and expanding the reason field. Nine hydrated journeys
  also passed the scoped axe WCAG 2/2.1/2.2 A/AA checks. These do not prove whole-site accessibility.
- `attachment-lint-v2.log` and `attachment-types-v2.log`: lint (889 files) and TypeScript passed.
  The initial fixture type/format diagnostics remain in the earlier logs.
- Final browser run `2e3289b899d747fe99817f72391e0ac9`: screenshot evidence was inspected for mobile
  labels, controls, reason text, receipts and overflow. Original run:
  `e406250ac32949369c2b908b75346905`.

This is an implementation-author review with bounded local evidence. Live provider integration,
operator acceptance, independent review and final candidate qualification remain open. No launch
gate, production setting, deployed service or customer communication changed.
