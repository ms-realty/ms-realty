# B05 controlled privacy export

This source supports actual collection, frozen human review, private delivery and controlled
completion of a declared export scope for C18/O26, F30, AT43, AT45 and UX23. It does not
certify legal compliance, complete B06, ratify privacy policy or supply human/release acceptance.
Unresolved, held, inaccessible or unsupported material keeps the export partial.

## Request and declared scope

A current client submits a request about their own person. Export scope explicitly includes
all listed source categories or requests additional material. The default is additional or
unspecified material. Legacy requests containing only free text retain that default; an
operator cannot narrow them through a checkbox. A new scope-confirmed client request is
needed for a narrower declared scope.

A privacy operator verifies the request and records its actual policy reference, responsible
person and response condition before work starts. Collection requires fresh staff
authentication, current `privacy.manage`, the exact verified request revision and the exact
active client recipient. An organization requires a separate person/authority review.

The dossier collects allowlisted profile, contacts, preferences, consent references, request
descriptions, inquiry submissions, authored client messages and feedback. It excludes
recipient rosters, attachments, internal notes, restricted records, credentials and provider
metadata. Whole-text removals are saved as a separate encrypted draft revision before final
review. Issue preserves the exact reviewed bytes and digest.

## Source inventory and attributable decisions

The operator captures a private manifest for every fixed category. A form cannot remove a
category or source. Source bounds fail closed instead of silently truncating the inventory.

| Category                                            | Supported source evidence                                                                                                                                                 |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Personal activity                                   | Digest of allowlisted collected data and exact own free-text removals                                                                                                     |
| Shared business records and received communications | Explicit case, timeline, brief, interest, feedback, task, appointment, proposal, message and seller-instruction revision metadata; scoped received inquiry communications |
| Private files                                       | Current document/version manifests linked to the person's cases, requests or uploads                                                                                      |
| Restricted material and security boundary           | Opaque purpose-keyed revision fingerprint and boundary signal; no restricted identities, counts or contents                                                               |
| Additional requested material                       | Client scope declaration; additional or legacy unspecified scope stays unsupported                                                                                        |

Ordinary case/internal-case, inquiry and document permissions are required before staff can
see source identities or counts. A missing dependency hides the category's source list and
keeps it unresolved. Property-only evidence currently has no complete collector and also
keeps shared records unresolved. Restricted compliance source identities and counts never
enter the staff review, recipient copy or audit. Their opaque fingerprint still changes
when relevant restricted evidence changes while the hold boolean stays true.

Each category records one typed decision: disclosed, none, withheld, held or unsupported.
The server binds the reviewer, evidence reference, actual request policy reference, complete
source-key set and exact reviewed source manifests. A `none` decision requires a genuinely
empty captured category and the explicit no-sources basis. Free text cannot declare
additional, inaccessible, restricted or nonempty material absent.

Disclosure and withholding decisions over nonempty shared/file sources require an exact
purpose-reviewed redacted copy or withholding notice for every captured source. Restricted
material can only receive a supported withholding decision or remain unresolved; it cannot
be disclosed or declared absent. No decision releases a retention duty. Additional material
has no arbitrary manual absence override. Redaction or a new supplement clears all prior
category decisions and requires review of the new frozen copy.

## Controlled manual supplement

Supplements reuse the existing private client-document workflow and create no new audience
or grant. They cannot import a raw legal or financial dossier.

1. Use an existing purpose-bound request for the exact client participant and an ordinary
   permitted `other` document. Upload, immutable sealing, clean scan and purpose review
   remain mandatory. This slice can include an already supplied redacted copy; it does not
   add arbitrary staff dossier uploads.
2. An authorized document reviewer checks the exact version for this recipient and privacy
   request. Its purpose-review note must be exactly `privacy-export:<privacy-request-UUID>`.
   A generic scan or generic review is insufficient.
3. The privacy operator attaches that version to a specific category and confirms its
   redaction scope. The operator needs ordinary restricted-document read access. The
   recipient already needs the current document-request grant, participant scope and case
   capability. Internal audiences, restricted purposes, wrong recipients, expired/cancelled
   requests and revoked grants are refused.
4. The server reads sealed bytes through `privateDownload` and freezes their digest plus
   document/file/request revisions into the encrypted dossier. Each supplement is at most
   512 KiB; at most ten supplements and a 1 MiB whole-dossier bound apply.
5. The reviewer maps each nonempty category source to the exact attached redacted copy or
   withholding notice. One reviewed document may support multiple category mappings only
   through separate explicit category attachments and attributable decisions.

The software binds evidence and authority; it cannot determine that a person's redaction or
withholding judgment is legally correct. Actual policy, identity and disclosure decisions
remain with authorized people. Synthetic fixtures provide no such acceptance.

## Issue, completion and private reads

Issue rechecks the exact recipient, request/export versions, current source inventory,
every reviewer's ordinary source permissions and every supplement's current bytes and
purpose review. A partial set remains partial. A fully supported set is labelled
`reviewed_scope`; making it available still does not complete the request.

The dedicated completion command requires the current issued, unexpired, unrevoked export,
its exact public and private review digests, every declared category resolved, current
sources and permissions, and the exact request/recipient/version binding. It rechecks the
actual supplement bytes and records a durable attributable receipt. The request's completed
revision and export delivery binding advance atomically without changing reviewed bytes.
The generic request-status form cannot complete an export, even if a complete copy exists.

Every full and byte-range download requires fresh client authentication, exact account and
person, current request binding, expiry/revocation, current source/reviewer permissions and
ordinary source-file access. Stale, revoked and wrong-party reads reveal no source identity,
size or range metadata. Availability lists also hide copies whose dependencies are no longer
eligible. A source or grant change can invalidate a previously completed delivery; its
historical completion receipt does not grant continuing access.

The dossier and separate private review manifest are AES-256-GCM encrypted in the private
database with distinct purpose bindings to artifact, request, person and recipient. No key,
plaintext dossier or bearer download token is stored in receipts. There is no public bucket,
customer email or model call. Attachments use `private, no-store`, a restrictive content
policy and no referrer. Withdrawal stops later reads but cannot recall downloaded copies.

## Recovery, integration and remaining gates

All commands have native POST paths, stable operation keys, exact-version conflicts and
reconciliation of uncertain outcomes. Receipt replay does not duplicate review, issue or
completion. A source/permission change requires a fresh supported draft and review.

Migration `0029_privacy_export` already has the integrated CMS/import snapshot. The additive
`0030_privacy_export_dispositions` adds private review/completion bindings and constraints.
The integration owner regenerates its canonical snapshot; no parent snapshot is manually
merged. Original launch authority remains untouched.

Focused checks cover allow/deny, typed absence, missing/invented evidence, additional scope,
source/restricted-revision changes, reviewer/recipient grant revocation, redaction invalidation,
exact completion and replay, staff confidentiality, and private full/range access. Browser
checks cover native/enhanced partial and complete flows, Hebrew client layout, withdrawal,
accessibility and narrow viewports across desktop/mobile Chromium and mobile WebKit.

Accepted retention, expiry cleanup and restore-safe deletion/restriction propagation remain
separate B06 work. Property-only and additional/unmapped requested material remain unsupported
by the completion collector. Actual operator, policy, language, physical-device, independent
F01/F02/G1–G4, integrated CI and deployed-release acceptance remain open.
