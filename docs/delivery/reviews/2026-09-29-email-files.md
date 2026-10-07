# Reviewed outgoing document attachments

The composer accepts current files from a recipient's explicit document request. Selection
creates immutable, separately reviewed recipient drafts. Each attachment records its document,
version, request, recipient, filename, type, size and SHA-256; storage keys and bytes are not
persisted in correspondence payloads. The screen shows a private download link and the exact
version/hash. It explains that revoking portal access cannot recall an emailed copy.

The draft, human approval and worker verify the recipient's active account, live participation,
explicit document grant, case upload capability, request validity, non-internal document audience,
current accepted version and scan bound to the sealed digest. The sender must retain restricted
document permission. Internal compliance purposes are excluded. File/grant/participant/account
rows remain locked through the provider handoff. The worker reads at most the frozen size and
verifies size/hash before calling the provider; a final eligibility check follows storage I/O.
The transport renderer rejects omitted, reordered or changed bytes. A storage failure before
provider I/O is a known cancelled send, not outcome-unknown or an automatic retry.

Five files / 10 MiB total, PDF/JPEG/PNG/WebP. Native and enhanced forms preserve checkbox
selections through validation. This is requested-document correspondence, not unrestricted
sharing of any document a broker can read. Inbound file ingestion remains open.

Evidence in `/Users/ivan/Code/.artifacts/ms-realty/recovery/20260929/`:
- `email-files-tests.log`: 34 integration checks including cross-party isolation, replacement,
  changed scan, internal audience, revoked grant, expired request, missing/corrupt bytes,
  exact rendered attachment and no pre-approval send.
- `email-files-browser.log`: 18 passes (new files and existing human review/eligibility/ICS).
- `email-files-approval-browser.log`: six complete review/queue journeys, three profiles and
  JavaScript on/off; only the reviewed recipient's draft is queued. Run
  `56cb24fd582d4917b241d1e7334c0ebd`; mobile screenshot inspected.
- `email-files-build.log`, `email-files-lint.log`: passed. Initial fixture typing errors were
  corrected before the successful production build.

Review is local/self-review, not an independent reviewer signoff. Fixtures contain synthetic
review/scan state and private synthetic bytes. No live provider, real document or launch gate
was exercised. The synthetic renderer/provider tests establish local transport behavior only.
