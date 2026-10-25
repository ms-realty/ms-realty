# B05 controlled privacy export slice

This source slice supplies real collection, frozen review and expiring private delivery for
C18/O26, F30, AT43, AT45 and UX23. It does not complete B05, B06, human privacy-policy review,
provider qualification or release acceptance. Shared records and files without a supported
disclosure path remain visible pending categories. Every generated dossier says `partial`;
the request remains in progress and a free-text review cannot mark it complete.

## Interaction and authority contract

The current client submits a request about their own person. A current privacy operator
verifies it, records the actual policy reference, responsible person and reviewed response
condition, then moves it into progress. The operator opens the export link in the privacy
queue, explicitly selects the client account receiving the copy and collects a private draft.
Collection requires current staff context, fresh authentication, `privacy.manage`, the exact
request revision and a verified, owned request. An organization party is held for a separate
person/authority review rather than treated as one individual.

The draft contains allowlisted account/contact/preferences/consent records, the person's own
privacy-request descriptions, inquiry submissions, authored client messages and feedback.
Other participants, recipients, attachments, internal notes, restricted compliance records,
provider metadata, passkeys, sessions and authentication material are never read into it.
Structured contact preferences are allowlisted rather than dumped as arbitrary JSON.

The operator reviews the exact collected data and can remove whole free-text entries before
disclosure. Saving removals creates a new private draft revision before final review, so an
invalid delivery submission cannot lose them. These removals cannot inject new records or
prose. The issue command binds the already reviewed exact bytes, digest, request and export
revisions, recipient and expiry without changing the dossier.
Changed source data refuses issue and requires a fresh draft. Identity, language and policy
approval are not inferred from a checkbox or synthetic test.

## Controlled manual supplement

A pending category can receive an attributable redacted supplement through the existing
private client-document workflow. It cannot import a raw legal or financial dossier, create
a new audience or grant access through a privacy request.

1. Use the existing purpose-bound document request for the exact client participant and an
   ordinary permitted `other` document. The existing upload, immutable sealing, clean-scan
   and purpose-review steps still apply. This slice can include an already supplied redacted
   copy; staff-authored arbitrary dossier upload is not added.
2. An authorized document reviewer checks that exact redacted version for this recipient and
   privacy request. The existing purpose-review note must be exactly
   `privacy-export:<privacy-request-UUID>`. A generic clean scan or generic review is insufficient.
3. In the export's technical-details section, add the reviewed document version and explicitly
   confirm its redaction scope. The privacy operator also needs ordinary restricted-document
   read access. The recipient must already hold the current purpose-bound document grant,
   active participant scope and case capability. Expired/cancelled requests, revoked grants,
   wrong recipients, internal audiences and restricted document purposes are refused.
4. The server reads existing private sealed bytes through `privateDownload`, freezes their
   digest plus document/file/request revisions into the encrypted dossier and changes its
   review digest. A supplement is limited to 512 KiB, at most ten supplements and 1 MiB for
   the whole dossier. Oversized copies are held, never silently truncated.
5. Review the new complete frozen draft before issue. Issue rechecks current source access,
   revisions and bytes. Every client full/range download again runs ordinary document access
   for each supplement and compares the frozen source manifest. Permission, scan/review,
   replacement, cancellation or source revision changes deny the old delivery.

The remaining category is not automatically closed just because one supplement exists. The
current collector cannot establish that every requested joint record or file has been
reviewed. Completion therefore stays partial. A future completion command must enumerate
requested categories and source manifests, record exact supported disclosure/withholding
decisions with attributable reviewers, resolve every pending category, and bind those
decisions to one current delivery. It must not expose identities or counts of restricted
compliance records. The existing request owner keeps pending work held until that controlled
category-disposition path is implemented and exercised.

## Private delivery and recovery

The dossier is AES-256-GCM encrypted in the private database using the existing private
context encryption pattern with a separate purpose binding. Authenticated associated data
binds artifact, privacy request, person and exact recipient. Review digests and operation
receipts contain no dossier body. There is no public bucket, signed bearer URL, customer
email or model call. A key change makes old ciphertext unavailable and requires an
operator-managed transition; it does not silently move custody.

The selected client downloads from `/{locale}/privacy` after current fresh authentication.
Full and range reads check the exact client account and person, current request revision,
state, expiry/revocation and supplemental source access before calling the shared private
download response helper. Wrong-party and denied reads disclose no size or byte-range
metadata. Responses are attachments with `private, no-store`, restrictive content policy and
no referrer. Access can be withdrawn; already downloaded copies cannot be recalled.

All actions are native POSTs. Stable operation keys make retry converge on one result.
An uncertain submission returns to the same request's reconciliation state before another
attempt. Draft and issue receipts remain separate from the privacy request's completion.
Expired ciphertext retention and deletion/restriction propagation require the actual accepted
retention policy and B06 work; this slice does not claim they are implemented.

## Integration and proof boundaries

`0029_privacy_export` is additive. The integration owner must regenerate its canonical
snapshot and journal ordering after the CMS and import migrations are combined. Existing
launch-authority files are untouched. Local fixtures use only synthetic people, policies,
documents and sessions; their review/scan records do not become live evidence.

Focused server checks cover collection, wrong-party and exact-recipient denial,
source/revision conflict, redaction, replay, ciphertext substitution, partial completion fence,
expiry, legal hold, session/grant revocation, private full/range reads and reviewed supplement
bytes/source grants. The browser portfolio adds native/enhanced review and issue, Hebrew
client layout, download, range and revocation at phone/desktop profiles. Actual operator,
physical-device, language, independent G1–G4 and deployed-provider acceptance remain open.
