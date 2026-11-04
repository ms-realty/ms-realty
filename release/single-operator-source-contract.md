# R00 single-operator source foundation

This package is disabled source preparation. `policy.single-operator.proposed.json` is an
unratified proposal, with no trusted keys, no legacy replacement approvals and null amendment,
limitation and phase-permission references. The active `policy.json` stays draft-3. Existing
launch authority, runtime flags, routing and watchdog behavior are unchanged. Source review,
tests and merging this package grant no release or provider authority.

The proposed staffing is AI plus Ivan. Ivan is the sole human owner, operator and self-reviewer.
A machine key authenticates observations; it never represents another human, independent human
administration, or Ivan's approval. This package supports only candidate evidence/self-review.
It deliberately blocks R11/R12 in the proposed mode, even if their artifacts are supplied.

## Library contract and external trust

An omitted `approvalModel`, or explicit `separate_reviewers`, keeps the separate operator/reviewer
rules. Signed JSON parsing adds no mode, defaults, name normalization or other signed fields.
The legacy `manifestApprovalRoles` export remains `operator`, `reviewer`.

The new mode is `approvalModel.mode: single_operator_owner_review`. Its required owner is Ivan.
The model names the exact R00 authority artifact and immutable references for the reviewed
amendments, shared-custody limitations and phase permissions. Null references block R00.
The authority signs the policy digest and release-context digest, binding these references,
the complete key-purpose list and the actual candidate scope. Its required assertions explicitly
ratify the model, limitations, amendments and phase permissions. Merely naming an artifact does
not count it: its signature, digest pin, purpose, actor, environment and assertions must verify.

`evaluateRelease` accepts an optional `admittedTrust` argument. The adapter supplying it must
read independently installed operator trust, never derive it from the submitted policy,
manifest, evidence directory or caller request. The object pins the exact canonical policy,
canonical trusted-key list, Ivan's authority key ID and DER-SPKI fingerprint, and custody
reference. The authority signature must use that exact key. Missing or mismatched admission
prevents every artifact from counting and blocks R00 and its dependent gates.

The library validates agreement with those pins; it cannot prove who installed them, read or
validate custody, authenticate an external configuration store, establish the truth of an
observation, or verify bytes merely because a signed reference names their digest. The deployment
adapter must enforce those boundaries. No admission loader, CLI option, enrollment operation or
runtime adapter is supplied here. The existing CLI cannot activate the proposed mode. A caller
that supplies its own policy and invents matching trust pins has not established deployment trust.

In this mode every artifact needs an explicit actor and purpose and a valid signature. A machine
actor includes its tool/model version. Keys have an actor kind and allowed purposes in addition
to allowed evidence types. Machine keys only authenticate `machine_observation`; owner purposes
cannot be enrolled on them. Human keys name Ivan. A review-provenance label on a machine report
never supplies human approval. Human review artifacts still require Ivan's actual review within
his competence. The library cannot determine whether the asserted review happened.

`authority_decision_record`, candidate `release_attestation`, human/listing review,
`recovery_owner_review` and `operational_acceptance` use distinct human purposes. Machine
observations cannot fill these slots; human signatures cannot replace required machine checks.
The proposed recovery policy requires a separate actual owner restore review alongside machine
drill evidence. The evidence producer must preserve raw receipts, independent AI source-review
findings, author/verifier separation and their exact source and evidence bindings; this package
does not implement those producers or turn their labels into live proof.

## Finite candidate and execution order

1. Freeze candidate context and every nonapproval artifact as evidence set E. The context includes
   scope, exact source/images/configuration/data/recovery bindings and the immutable reviewed
   cutover and rollback procedure references and byte digests. Retain and verify the actual bytes.
2. Ivan genuinely reviews E and creates one `release_attestation` under R10, with human actor,
   `candidate_review` purpose and explicit operator completion, owner self-review, custody and
   procedure/scope-review assertions. The manifest contains exactly one `owner_self_review`
   approval with the same purpose, name, observation time and evidence ID. Extra, duplicate,
   missing or legacy approval slots fail closed. The attestation signs
   `approvalEvidenceDigest(manifest)`, covering every pinned artifact except its own current slot.
3. Evaluate the exact R00–R10 candidate snapshot S. R10 means candidate qualification only. In
   this mode `release:cutover_approved` is rejected; the replacement is
   `release:cutover_procedure_scope_reviewed`. R11/R12 and overall readiness remain blocked.
4. The later bridge constructs concrete plan P from S, admitted policy/context, exact permitted
   procedure and scope, source/images/configuration/data, production baseline, operation and
   remote lease. Ivan separately grants execution over exact P and its S/policy/context/operation/
   lease bindings. Independent machine verification must authenticate or recompute S, its expiry
   and each R00–R10 gate from admitted policy/evidence, and require complete nine-domain parity.
   A caller's digest or status label is insufficient. The remote watchdog must enforce the same
   conjunction before any forward mutation, including direct remote calls and replay rejection.

P and its execution grant must not be inserted back into E/S. That would create a hash cycle.
Required prerequisite proof cannot be omitted to evade that cycle. Candidate review never fills
the execution-grant slot. The schema in this package has no execution-grant purpose or consumer.

Production-runtime preparation is also a separate owner-authorized operation over exact
resources/images/configuration and permitted diagnostic effects. It must fence customer traffic,
publication, messaging and AI spending. Required production monitoring must be observed on the
production-bound runtime; staging evidence cannot be relabeled. If topology cannot supply this
separation, preparation stays blocked pending its concrete amendment. This document does not
amend the governing deployment restriction or provide preparation permission.

## Expanded acceptance remains held

Adding R11 or R12 evidence changes the complete evidence-set digest and invalidates the earlier
owner attestation. The current exclusion rule excludes only current manifest approval slots;
earlier decision artifacts must remain pinned in each expanded set. There is no selectable
evidence subset. The old snapshot and original execution grant remain immutable.

The later bridge must authenticate a fresh complete-set `deployment_acceptance` or
`operational_acceptance` attestation, linked to the authenticated prior snapshot and original
operation. Put acceptance lineage on the new decision envelope, outside the frozen nonapproval
candidate context. Merely adding proof must not rewrite every raw observation's context. Actual
context, policy, configuration or recovery-point changes invalidate the affected bindings and
require genuine reverification. Do not copy observation times to extend validity.

Acceptance purposes are recognized as distinct labels, but cannot satisfy candidate review.
This implementation holds expanded snapshots and R11/R12 until their authenticated lineage and
remote integration exist. Caller-provided lineage strings cannot release that hold. Overall
readiness still requires all thirteen gates; there is no production-ready candidate shortcut.

Forward-authority expiry must later block new forward execution without disabling the original
operation's rollback, fencing, late-write reconciliation or accepted-write preservation.
Restored-lease release needs its separate real owner decision and current machine/baseline
proof, without requiring a new launch-ready snapshot. No recovery control is modified here.

## Retained release requirements and remaining work

Protected rehearsal retains only its existing isolated staging authority. Shared human custody
does not provide independent administration, protection from that administrator or a guarantee
through a whole-provider failure. Preserve private EU R2, encryption before upload, immutable
conditional object creation, coherent manifests, retention and a verified encrypted copy outside
the application account. Preserve current safety history and an acknowledged watermark, isolated
restore, invalidated restored credentials, disabled external effects, provider reconciliation
and accepted-write-preserving rollback. Unknown safety history stays quarantined. Owner restore
review never supplies recovery reopening permission.

Listing facts, rights, publication, translation/indexability, Bulgarian source, shipped-locale
competence, professional claims, actual devices and assistive technology retain their existing
acceptance requirements. UX requires six task sessions covering actual role contexts, not six
different people. The proposed six owner walkthroughs and AI review method has lower assurance
and still needs explicit ratification; it cannot claim uncoached target-user evidence, missing
real-role contexts or absent competence. This package changes no R09 assertions or content scope.
Unreviewed material and contexts stay held.

The separate [unsigned decision examples](single-operator-decision-examples.json) describe four
future decision scopes. Nulls are unknown, and those examples intentionally cannot pass any
schema or gate as authority. Real keys, signatures, scope decisions, phase amendments and owner
reviews are absent. Before activation, finish and independently review the trust adapter,
producer contracts, exact authority-file amendments, snapshot authentication, complete parity
and production/watchdog conjunction, and expanded acceptance lineage. Then obtain actual owner
ratification and each separate operation decision. None follows from this source package.
