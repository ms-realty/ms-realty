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

## New-source integration boundary

Partner terms, customer reviews/consent, and photo-visit work require explicit source classification from
their final schemas, including immutable wording/terms/consent history and ordinary
Case/document access. This map supplies no generic table whitelist or permission to
ignore newly introduced customer sources.

## Local verification and remaining acceptance

The expanded synthetic integration run passed 64 tests across eight files: duplicate
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

These are source and disposable-database results. They do not establish human policy
acceptance, live provider deletion, independent archive/restore proof, runtime qualification,
language acceptance or an R05 pass. Existing launch authority is unchanged.
