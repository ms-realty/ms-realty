# B04/B05 privacy source classification

O26/O27, AT43/AT45/AT56, UX22 and R05 govern this source integration. A
canonical identity link remains navigation metadata. It supplies no authentication,
consent, recipient, Case, document or privacy authority.

## Declared customer privacy history

| Source | Merge classification | Export classification |
| --- | --- | --- |
| `privacy_requests` | Existing ordinary request review, with fresh `privacyOperator` authority for each request. Original Party and request history remain unchanged. | Own-person request metadata remains in the explicit activity collector. |
| `privacy_exports` | Retained original Party, request, recipient and review/delivery metadata. A bounded dedicated projection selects revision and commitment fields, with no encrypted payload/review. | Existing recipient-bound, reauthenticated private delivery remains authoritative. Export preparation is deliberately excluded from the safety fingerprint to avoid invalidating its own review. |
| `privacy_safety_decisions` | Retained original Party and request bindings. Only canonical sequence, IDs, request/decision commitments and recorded instant enter an opaque fingerprint. | Party-scoped commitment in the existing `security_boundary`; raw decision review and effect are never collected. |
| `privacy_processing_restrictions` | Explicit composite key `(party_id, purpose)`, decision sequence and created instant. Marketing and search-alert restrictions stay on the original Party. `client_access` holds identity linking for separate privacy reconciliation because a canonical link can reidentify a restricted person. | Party-scoped opaque fingerprint. An added restriction invalidates category review and frozen delivery. No automatic restriction release exists. |
| `privacy_propagation_events` | Joined only through a source Party's decisions; immutable ID, sequence, boundary, state and created instant bind retained history. Evidence JSON is never selected. | The same Party-scoped opaque fingerprint detects new observations; a held provider/archive observation is never promoted to actual proof. |
| `subscriptions` / `consent_events` | Existing purpose-specific consent remains source-owned. The merge never moves, combines, renews or removes a subscription, negative consent event or processing restriction. | Existing own-person subscription/consent collectors and current execution fences continue to apply. |

The safety tables reject updates and deletions. Their canonical decision commitments
and append-only propagation metadata bind every supported change without copying the
private review, effect or evidence. The restriction projection requires no invented ID.

A merge reviewer must pass fresh `privacyOperator` authority, current privacy scope
on both original Parties, and every live related request's ordinary authority. Export
requests must exist and belong to their original Party. A restored safety decision may
precede its request; retaining that historical commitment grants no reopening authority.
The independent recovery gate continues to hold a restored application until its required
reapplication proof is accepted.

An authorized comparison exposes one opaque `privacy_history` reference for the pair,
with no private record IDs, row counts or audience fields. Failure to authorize returns
only the generic restricted hold. The reader selects at most 500 rows per declared source;
the export safety collector selects at most 1000. Excess history stays held. A newly
populated unknown FK or undeclared FK column retains the existing unsupported hold.

## Staff and agency operating records

`privacy_governance_records` and `privacy_governance_revisions` reference staff
editors/reviewers through Principal IDs. Their structured processing, processor and
incident documents describe agency operations; that FK is not a customer subject
relationship. The ordinary authoring schema uses minimised policy/evidence references.
These registers therefore create neither an all-customer export source nor a blanket
hold on every customer export. Their JSON documents and free-text references are not
silently disclosed or assumed to contain no personal information. If an operator has
included customer-specific incident details or referenced material, the privacy owner must
identify it, classify its audience and retention, and prepare a reviewed redacted supplement
through the manual additional-material path. A request for broader/additional data remains
unresolved until that work is supported; a generic checkbox cannot waive it.

`task_effort_entries` is an attributable staff observation attached to a Task and an
operation receipt. Its actor FK identifies the staff member who recorded correction or
reentry effort; controlled reason codes and duration are agency operating metadata. It
creates no automatic all-customer source or generic JSON disclosure. Existing Case task
revision bindings remain applicable. Customer-specific material held outside the declared
collectors requires the same human additional-material review.

`service_scope_drafts` and `service_scope_versions` are staff operating-policy sources.
Their Principal references identify the editor or approver; their scope documents contain
staffing, fallback, approved content/terms and policy configuration. They contain no customer
subject link and create neither an all-customer dossier source nor an unknown-source blanket
hold. Their documents, approval notes and raw configuration are never exported. Customer
material placed outside the declared collectors still requires human additional-material
review; this classification supplies no generic table or JSON whitelist.

## B11 retained service requests

| Source | Merge classification | Export classification |
| --- | --- | --- |
| `inquiries.context.service` | Retain the complete original request/binding under its original Party and inquiry. The existing ordinary inquiry reader must authorize the source. A keyed commitment binds this specific JSON field even if neither row version nor timestamp changes. The binding never enters reference audiences or identity/ownership matching. | A dedicated `serviceContexts` projection requires ordinary inquiry access and includes only the self-declared request plus scope edition and public source URL. Location, needs, requested stay dates and self-declared relationship remain reviewable and removable together. No owner, responsible person, fallback, terms configuration or operating-policy document is disclosed. |
| `cases.service_context` | Retain the complete original Case copy. Related service Cases require both ordinary `case.read` and `case.read_internal`; a direct JSON edit stales merge review and automatic reversal independently of Case version/timestamp. | The same allowlist may disclose a Case copy only with current ordinary Case grants, an original same-party inquiry, an identical retained request/binding and no foreign-party participant or inquiry provenance. Missing, differing or mixed-party provenance holds the joint category for separate review. The subject's own readable inquiry remains independently available. |

When recorded, the original public `observedSource` locale and CMS edition/hash also enter
the allowlist. A legacy context does not invent an observation or gain permission to
qualify or progress new work; historical request disclosure remains possible.

Both stored copies and their explicit original inquiry/Party/Case relationships enter an
opaque export revision fence. Changing personal fields or hidden binding configuration
stales category review, issue, completion and frozen delivery, including a partial export
without a category manifest. Redacting a service row removes its whole projected context
and duplicated needs text; the native review form shows the complete projected context and
binds the resulting exact bytes. A same-ID inquiry/Case pair is removed together. Redaction
changes only the export copy, never the original inquiry or Case.

Historical disclosure reads the retained source; a later scope-policy edit or offering
expiry does not erase a person's earlier request. A self-declared relationship remains a
self-declared statement. It establishes no property ownership, brokerage relationship,
booking, publication, consent or access authority. Invalid/missing service context remains
held instead of silently disappearing from a supposedly complete disclosure. Source readers
are bounded to 1000 rows per declared source and 32 KiB per stored service field.

## B10 retained agency and photography sources

| Source | Merge classification | Export classification |
| --- | --- | --- |
| `agency_partner_terms` | The exact `counterparty_party_id` edge is declared; the original Party, optional Case/document, supplied wording/source, acceptance, qualified approval and revocation remain unchanged. Every current and historical binding requires its original Case/compliance/contact/document visibility. Standing text-only terms without a retained original Case or document link have an explicit `agency_reconciliation` hold until a human supplies a supported original-scope bridge. | An explicit joint source requires a concrete reviewed redacted supplement or withholding notice. Raw terms, professional names, internal unknowns and approval notes never enter the automatic dossier. Exact source, wording, acceptance/expiry and approval/revocation commitments bind review even when row version/timestamp do not change. |
| `agency_case_reviews` | The exact original `author_party_id` edge is declared. Identity association never moves the author, consent principal, exact CMS wording, display choice, refusal/withdrawal or qualified verification to a canonical Party. | A separate joint source requires a supported disposition over exact wording, author/display choice, purpose-specific consent and verification. The native author's own-wording page remains a separate existing reader. No raw agency row, Case evidence or consent history is automatically exported. |
| `agency_evidence_history` | Only the declared `partner_terms` / `case_review` parent and original snapshot Party/Case/document bindings are followed, including a prior Party/Case after the current record changes. The immutable snapshot ID must match its parent, the shape/fields must be known, and all original scopes must remain readable. Unknown, scalar, oversized, orphan or unreadable history returns a generic hold without a partial list or record identities. | The database returns declared ACL fields and a full snapshot commitment, never snapshot plaintext. Every retained decision joins its parent source's keyed revision. Current and historical CMS editions/hashes and private document revisions are also bound. Each parent is accounted for by exact source key and concrete redacted evidence; an absence checkbox cannot dispose of an existing source. |
| `appointments.purpose` / `photography_scope` and `appointment_versions.snapshot` | The original appointment, listing/property and participant links remain unchanged. Ordinary property/listing visibility and appointment authority gate a photo reference. Purpose, scope and immutable version commitments stale merge review and automatic reversal independently of the mutable appointment version. | A photo source is discovered only through an original explicit appointment Party participant or an already related Case. A staff host or property relationship supplies no customer ownership or dossier link. Supported sources require separate reviewed redacted evidence. Raw scope, logistics, policy snapshots and version payloads are never exported. Unknown or mixed historical photo purpose remains held. |

The agency collectors read at most 1000 rows per declared current/history source; merge
comparison uses 500. A retained agency snapshot above 64 KiB stays held. Snapshot field
validation is specific to these two source schemas; it grants no generic table/JSON
whitelist. A newly populated undeclared agency FK retains the unsupported merge hold.

Read-only history classification uses exact original scope without following a canonical
Party. A merged pointer conveys no authority to edit, accept, approve or use terms, assent
to publication, or restore public display. Current terms/public reviews can remain held
after association and require fresh human review under their ordinary gates. A negative
consent or privacy restriction remains on its original identity and is never released by
this classification or identity linking.

These are retained business records, not newly approved optional erasure copies. Existing
FK/business-dependency checks continue to hold unsupported retention/deletion work. Review
publication consent is a separate purpose from `search_alerts` and `marketing`; unknown
business/photography purposes are never mapped to those optional-processing commands. No
erasure, retention-policy, provider deletion or legal approval capability is added here.

New sources still require explicit classification from their final schemas. This map
supplies no permission to ignore newly introduced customer material or unknown history.

## Local verification and remaining acceptance

The B11 source checkpoint's expanded synthetic integration run passed 64 tests across eight files: duplicate
merge/split, export safety fingerprints, coverage, delivery, supplements, review binding
and recovery, plus service-source disclosure. It covered retained completed exports and consent, stable
composite restrictions, generic restricted-actor output, the client-access hold, changed
history staling a merge review and reversal, unknown-FK holds, new Party safety history
invalidating category review/frozen delivery, unrelated-Party/staff-register isolation,
live privacy-grant/fresh-auth checks and an oversized history's safe hold. The run used
`createTestDatabase` with the disposable server passed per command. Owned-file Biome,
`npm run typecheck` with a dedicated output directory, and `git diff --check` passed.
No build or browser run was needed for these server-source projections and private labels.

The B11 additions verified historical management/stay requests, original observed public
locale/edition, legacy and invalid context, both stored copies, same-party Case provenance,
mixed/foreign/missing/different provenance holds, whole-context redaction with exact-byte
delivery, current ordinary inquiry/Case grants, unversioned request/binding changes staling
merge/reversal/category review/frozen delivery, partial exports without a manifest, and
staff-policy draft/edition isolation. The initial focused run retained three failures: two
incorrect fixture assertions/states and an overly broad new non-service Case dependency
read. The fixtures were corrected and the added Case read was limited to service sources;
the unchanged document-access assertion passed. The final focused and expanded runs passed
without assertion or timeout weakening.

The B10 classification continuation passed 123 combined integration tests across 13 files,
covering the B11/duplicate/privacy regressions, agency and photography source classifiers,
existing agency/photography commands, and existing erasure boundaries. It verified exact
terms/review/consent/history commitments, current and historical original scopes, a
document-specific grant, unknown/scalar/oversized/orphan history without source identities,
unversioned current edits and appended immutable history, unchanged original Parties and
negative consent through merge/reversal, standing-term reconciliation, a newly populated
unknown agency FK, photo scope/purpose/version changes, original property access, no
customer ownership inference, and retained unsupported erasure purposes. Two additional
targeted regressions verified that ordinary source grants cannot outlive required passkey
assurance, including an issued partial service export without a manifest.

The initial B10 focused failures were synthetic fixture omissions (an author display name,
valid sealed/scan metadata, the required active Case owner/action, and a valid relationship
role). Those fixtures were corrected without weakening source assertions or database
constraints. Dedicated typecheck, owned-file Biome and diff checks passed. The separate
catalog/copy run passed 114 tests and retained three known imported-B10 baseline failures:
the Russian `agency.fields.action` cognate, the English `agency.reviewHint` script, and the
missing public `caseReview` review-status entry. The added reconciliation labels passed;
the baseline repairs remain with the B10/catalog owner. No catalog guard or baseline was
expanded, and the full catalog suite is not claimed green at this checkpoint.

These are source and disposable-database results. They do not establish human policy
acceptance, live provider deletion, independent archive/restore proof, runtime qualification,
language acceptance or an R05 pass. Existing launch authority is unchanged.

## F10 retained inquiry photo evidence

`inquiry_attachments` retains the original inquiry and its existing Party binding. It is
private agency-record business evidence, separate from Property publication media. A
receipt session permits bounded intake and safe status metadata for that original owner
inquiry; it grants no staff, Case, ownership, rights or byte-download authority.

The own-dossier collector exposes bounded metadata through ordinary inquiry access. An
opaque revision binds the exact source and scan state to export and erasure review. The
`private_files` source manifests require a human-reviewed supplement or withholding
notice; automatic dossier generation includes no original bytes or private object keys.
Staff byte access requires a current staff file session, ordinary `inquiry.read`, and a
clean scan bound to the exact sealed content, digest, scanner version and scan instant.
Unattested, failed, infected, changed or unavailable bytes remain private.

These rows are retained business dependencies, not optional client profile copies. No
photo deletion, physical object disposal, retention approval or independent recovery
reopening is inferred. Runtime upload, scanner and download paths honor the existing
restored-destination quarantine. An operator must separately qualify storage, scanner,
retention and recoverable disposal behavior before any live acceptance claim.
