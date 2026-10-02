# Inbound Case email contract

Status: local implementation and bounded qualification complete, not provider activation. Architecture §9 / AT48 / F13.
Only a verified, durably recorded `email.received` webhook may request the provider read.
The provider API is fixed to `GET https://api.resend.com/emails/receiving/{uuid}`; no raw or
attachment download URL in an email is fetched. Response size, time and fields are bounded.
The returned ID must match the signed receipt. Provider receipt and Case ingestion are
separate, independently observable records.

Persist untrusted plaintext and bounded attachment metadata in a private triage record.
Never render received HTML or load images/links. HTML-only content stays explicitly
unsupported for automatic ingestion; attachments stay unavailable until separately sealed,
scanned and reviewed through the existing file pipeline. A provider auth result or a matching
From address is not proof of the sender's Case authority. An opaque reply address only
suggests the originating message and Case; it never grants access, publishes or sends.

A current authorized staff user reviews the exact source, chooses the Case, checks current
record permission and records a reason/verification basis. Assignment is versioned and
idempotent; default visibility remains staff-only. Forwarding to clients or exposing files
requires its own current audience review. Ambiguous/unknown recipients, spoofing suspicion,
unsupported content and unavailable provider results remain actionable triage states.
A rejection is recorded, never silently ingested. Repeated webhooks/provider reads cannot
produce duplicate messages. Manual completion remains possible without Hermes.

Validation must cover signature/ID mismatch, malformed/oversized/HTML-only payloads,
attachment/link non-fetch, duplicate reads, foreign Case and client/AI denial, exact-version
review, current participant revocation, role changes, no-JavaScript review receipts, and
recovery after provider fetch failure. Live received mail and reply-subdomain DNS remain
release proof, not synthetic-test claims.

Primary API reference inspected on 28 September 2026:
https://resend.com/docs/api-reference/emails/retrieve-received-email
https://resend.com/docs/dashboard/receiving/introduction

## Implemented boundary

Migration 0013 adds `inbound_emails`. `CASE_INBOUND_ENABLED=0` is the default;
the standalone worker requires explicit Resend credentials and a valid reply domain before
fetching. The test outbox cannot activate this external reader. Inbox sweeps page past failed
reads, and outgoing delivery reconciliation excludes inbound receipts to prevent starvation.

Operations → Incoming email provides paged triage/assigned/rejected lists. Staff can search
Cases by reference/title, select a current participant and record an independent review basis.
The exact Case and inbound versions are checked in the atomic decision. Only a staff-visible
Case Message is created; no audience grant, outbound action or downloaded attachment follows.
The Case email screen reads this history separately from outgoing delivery.

Native forms use same-origin validation, a signed operation identity bound to the inbound
record, durable actor-bound receipts, and a five-minute session-bound HttpOnly draft after a
failed decision. Restored input does not restore the confirmation checkbox. BG/EN/RU copy is
implemented; this is not a claim of human translation acceptance.

The provider adapter reads at most 1 MiB within 15 seconds from its fixed API path. It stores
only bounded plaintext/metadata/authentication hints; raw-download links, HTML and attachment
URLs are discarded. HTML-only replies cannot be assigned as empty Case messages. Files stay
metadata-only and unavailable; live quarantine/download-to-sealed-file integration is still
open. Raw received material is untrusted even after signed transport or SPF/DKIM/DMARC hints.

Local validation: 73 tests across nine files, including the actual pg-boss handler, signed
receipt identity requirements, outgoing starvation prevention, duplicate reads, current
permissions/participants, source correlation, private reads, and page traversal. Six final
fresh-build browser scenarios pass on Chromium desktop/mobile and WebKit mobile: native
assign/reject, exact-version conflict, retained draft and repeat confirmation, durable receipt,
Case history and client denial. Earlier combined identity/mail/triage run: 19 passed with two
expected virtual-authenticator exclusions. Repository lint and production-build TypeScript
passed. Evidence: `/Users/ivan/Code/.artifacts/ms-realty/inbound-email/20260929`.

Full local `make check` also passed: lint, TypeScript, 1224 tests in 122 files and production
build. Two real-ClamAV tests were explicitly skipped because this run did not configure a
scanner; this does not replace earlier real-scanner or future CI evidence.
