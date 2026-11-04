# R00–R10 execution inspection, activation unavailable

This slice provides a read-only inspection seam for a proposed canonical routing operation.
It does not install trust, authorize an operation, consume a grant, reserve a lease, sign for
Ivan, contact a provider or clear a release gate. The active policy and launch authority are
unchanged. The existing production configuration, cutover apply, watchdog client bind and
direct remote bind reject the new execution purposes. No input flag or public key enables them.

Use the `prepareExecutionPlan` and `inspectExecutionCandidate` exports from
`scripts/production-cutover.mjs` in local Node 24 tooling with `--import tsx`. Their arguments
are the packet, independently installed admission, and the current clock. There is deliberately
no CLI option that reads admission or keys from the submitted packet, evidence directory or
policy. The trusted loader is still absent. Calling these functions with invented matching
admission proves agreement between objects, not operator authorization or real observations.

`prepareExecutionPlan` builds a draft P after checking the frozen candidate and exact input
bindings. `inspectExecutionCandidate` additionally authenticates both decision envelopes and
runs the existing full production-cutover validator, including all nine protected parity
domains. Its successful result is `inspection: verified, execution: unavailable`. It supplies
no capability or token accepted by a forward operation. Repeated read-only inspection is not
grant consumption or proof that an operation identifier has never been used.

## Admission and phase document

`executionAdmissionSchema` contains the existing admitted release trust plus three explicit
key-purpose entries. The owner entry names Ivan's exact admitted R00 key and fingerprint for
`execution_grant`; the verifier and watchdog entries name distinct machine keys from the same
admitted policy for `execution_verification` and `remote_lease_observation`. All three DER-SPKI
fingerprints must differ. Machine keys remain machine actors; these entries do not invent an
independent human administrator or remove shared-custody limitations.

The actual canonical phase-permission document bytes must match the reference in the admitted
policy and authenticated R00 authority. Its strict execution section is:

```text
schemaVersion: 1
execution:
  action: canonical_route_cutover
  keysDigest: SHA256(canonical executionAdmission.keys)
  scopeDigest: SHA256(canonical candidate manifest.scope)
  procedures:
    cutover: SHA256(actual reviewed cutover bytes)
    rollback: SHA256(actual reviewed rollback bytes)
```

This is a source contract for a future ratified document, not an amendment or admission receipt.
The phase document must be prepared before policy ratification. Its key-purpose table does not
include the policy digest, candidate snapshot, operation, P or the grant. The R00 policy digest
then covers its reference without creating a cycle. Matching the owner's fingerprint alone
never admits extra execution purposes. Other preparation or acceptance phases need separate
reviewed contracts; this section provides no general execution capability.

## Frozen candidate and operation order

1. Freeze full evidence set E and candidate context. Exact configuration must already be
   observed by a counted production `deployed_check` machine artifact whose
   `digests.productionInputs` matches the actual production-input bytes. Domains, import,
   dependencies, routes, media, database schema and gateway bytes must match the candidate pins.
   The web, worker and migration image identities must match the existing shared-image cutover
   topology. No staging observation is relabeled as production evidence.
2. Ivan reviews E and signs the separate R10 candidate review. Every input remains covered by
   the original complete-set signature; no plan or execution envelope is inserted into E.
3. Freeze S. Inspection recomputes its entire canonical report from the admitted policy,
   manifest and raw evidence at S's original evaluation time. It rejects any different report,
   including a caller-rehashed status, evidence set or expiry. It separately checks the actual
   clock, original expiry and every R00–R10 gate against a fresh evaluation. R11/R12 remain held.
4. Obtain an authenticated observation of the exact reserved remote lease and baseline after
   S, then construct P. The observation must be under one minute old with sufficient restoration
   reserve. P binds S, policy, context, manifest, phase permissions, scope, both procedures,
   source, image identities, exact raw cutover plan, baseline, parity report, operation and lease.
   Raw production plan, baseline, JSON artifacts and new signed envelopes must be canonical
   JSON. Duplicate keys, alternate encodings and conflicting extra decision fields are rejected.
5. Ivan makes the separate execution decision over P; the machine verifier signs its own
   exact-plan verification. Each envelope binds P/S/policy/context/action/operation/lease and
   its validity interval. Candidate, deployment or operating acceptance cannot fill these slots.

The owner execution envelope also carries the existing `role`, `decision`, `reportSha256`,
`cutoverPlanSha256`, source/image, reviewed-screens and signing-time fields. The same original
signed bytes are passed to the existing parity and cutover validators. There is one owner
execution signature, distinct from the earlier candidate review. The machine verification
envelope similarly supplies the existing controller approval. Neither decision is hashed back
into P, E or S. Parsing and inspection do not mutate inputs; a prepared P owns its copied fields,
and inspection reconstructs it again rather than trusting a caller's prepared digest.

## Remaining runtime work

Activation needs an independently installed, authenticated, versioned trust loader and an
accepted authority/phase packet for this exact implementation. A real watchdog must produce
the purpose-scoped signed lease observation; the existing reserve receipt is insufficient.
It must durably authenticate the same conjunction before bind and every forward mutation,
atomically consume the unique operation/grant/lease tuple, reject replays and competing plans,
retain the authenticated original decision and enforce expiry without a caller-selected clock.
Neither UUID format nor a fresh signed lease observation proves uniqueness or current ownership.

Local signatures cannot prove the truth of raw observations, actual image bytes running remotely,
who installed admission, genuine owner review, custody or the absence of competing operations.
The later adapter must fetch independently retained remote state, authenticate actual bytes and
observations, bind the exact source-zone authority, and retain provider receipts. This slice
does not claim remote R00–R10 enforcement, production-runtime preparation, expanded-set acceptance
lineage or final R11/R12 readiness.

## Recovery remains separate

No new check is inserted into restoration, durable alarms, late-write reconciliation, journal
persistence, conditional acceptance or restored-lease release. Forward authority expiry must
block a new forward action while the original operation remains responsible for restoration and
accepted-write preservation. The original operation's immutable plan, baseline and signatures
remain available to recovery after the candidate snapshot and execution grant expire.

Restored custody still requires the existing separate owner/controller release decisions and
current baseline observations. It must not require a new launch-ready snapshot. Before any
future activation, retain and extend the crash, lost-acknowledgement, concurrent-operation,
foreign-route and late-provider-write tests at the durable remote boundary. A passing source
test or this read-only inspection is never a live rehearsal or a real execution grant.
