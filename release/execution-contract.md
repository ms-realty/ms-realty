# R00–R10 execution boundary

This source implements local verification and a conditional runtime v2 path for one canonical
route cutover. Actual phase documents, admitted policy/key inputs, operator installation and
release evidence remain pending. No admission is supplied by this repository, no provider was
changed, and no launch gate is cleared by these source checks. R11/R12 evaluator acceptance is
unchanged and remains a separate lineage step.

## Interfaces and installed authority

The accepted v1 `prepareExecutionPlan` and `inspectExecutionCandidate` exports in
`scripts/production-cutover.mjs` remain read-only. Run those tools with Node 24 and `--import
tsx`. Their third-key signed lease observation belongs only to the v1 inspection contract;
inspection still returns `execution: unavailable` and supplies no capability.

Runtime v2 uses the existing owner and controller keys plus direct authoritative watchdog state.
It does not introduce a lease-signing key. `loadExecutionAdmission` accepts only the actual
process or Worker environment supplied by its adapter. Its fixed `MS_REALTY_EXECUTION_ADMISSION`
value must be canonical JSON, at most 16 KiB, matching `runtimeAdmissionSchema`:

- `schemaVersion: 2`, `mode: single_operator_owner_review`, and
  `leaseAuthority: watchdog_durable_state`;
- the independently admitted release policy digest, complete trusted-key-set digest, Ivan's
  exact owner key identity/fingerprint and custody reference;
- exactly two distinct key entries: owner `execution_grant` and machine verifier
  `execution_verification`, with exact key IDs and DER-SPKI SHA-256 fingerprints.

The operator adapter checks those fingerprints against the existing `LAUNCH_OWNER_PUBLIC_KEY`
and `LAUNCH_CONTROLLER_PUBLIC_KEY`. The remote adapter uses `WATCHDOG_OWNER_PUBLIC_KEY` and
`WATCHDOG_CONTROLLER_PUBLIC_KEY`. All keys are public Ed25519 keys. No path, request field,
submitted policy, command option or unsigned activation marker installs admission. An empty or
absent installation preserves legacy mode only when the remote mode latch has never been set.
A nonempty malformed installation fails closed.

The actual R00-pinned canonical phase-permission bytes must independently grant these purposes
and the exact scope. The runtime execution section extends the v1 action, key-set digest, scope
digest and reviewed procedure digests with:

```text
schemaVersion: 2
execution:
  action: canonical_route_cutover
  keysDigest: SHA256(canonical runtime admission key entries)
  scopeDigest: SHA256(canonical candidate manifest.scope)
  procedures:
    cutover: SHA256(actual reviewed cutover bytes)
    rollback: SHA256(actual reviewed rollback bytes)
  leaseAuthority: watchdog_durable_state
  recoveryAuthority: original_operation_restore_and_separate_lease_release
  conditionalAcceptance: original_operation_complete_production_parity
```

This is a source schema for a future ratified document. Matching Ivan's fingerprint alone never
grants execution, recovery, or conditional-acceptance purposes. The phase document contains no
policy digest, snapshot, P or grant. Policy ratification then pins the document without a cycle.
No production-preparation or general execution capability is granted here.

## Finite evidence and decision order

1. Freeze full evidence E and candidate context. Counted production `deployed_check` evidence
   must bind `digests.productionInputs` to actual input bytes. Import, dependencies, domains,
   routes, media, database schema and gateway bytes must match the candidate. The web, worker
   and migrator use the same immutable image topology required by the existing cutover contract.
2. Ivan signs the separate candidate self-review of E. Neither P nor an execution decision is
   inserted into E or its complete-set signature.
3. Freeze S. Verification recomputes the entire canonical snapshot from the admitted policy,
   manifest and raw evidence at the original evaluation time. It separately checks the current
   clock, rejects future evaluation and expired S, and requires each R00–R10 result to remain
   passed in a current evaluation. A self-authored digest, status or extended expiry is rejected.
4. Reserve the exact operation/lease/source/image/baseline/zones in the authenticated account-wide
   watchdog after S. Build P from that actual receipt. The reservation must be under five minutes
   old at bind, and lease expiry must leave the existing cutover and restoration reserve.
5. Ivan makes the separate execution decision over P; the independent machine signs its own
   verification. Each original envelope binds the exact P/S/policy/context/action/operation/lease,
   installation digest and validity interval. Candidate review and R11/R12 acceptance cannot
   satisfy either purpose.

P also binds exact procedure bytes, raw production plan, full baseline, all source/image and
config/data pins, and all nine protected parity domains. The owner execution envelope retains
`role`, `decision`, `reportSha256`, `cutoverPlanSha256`, source/image, reviewed-screens and
signing-time fields. Those same signed bytes reach the legacy parity validator, local cutover
and remote consumer. There is one execution signature by Ivan, separate from candidate review.
The controller envelope supplies the existing controller approval under its explicit new purpose.

Raw production JSON, the new signed payloads and installed-mode HTTP requests must be canonical.
Duplicate keys, alternative encodings, noncanonical signatures and conflicting extra decision
fields are rejected. Preparing or verifying a packet copies its inputs; later caller mutation
cannot change a prepared decision or the bytes retained for admission.

## Actual operator and remote entry points

`scripts/production-cutover.mjs apply` selects mode from the installed process environment before
interpreting its bundle. In installed mode, the bundle specification has exactly these data paths:

```json
{ "executionPacket": "packet.json", "recheck": "production-check.json" }
```

`packet.json` is the complete canonical `runtimeExecutionPacketSchema` value. This specification
has no admission or key path. Native Node 24 loads the shared verifier through the pinned `tsx`
package; a global loader flag is unnecessary for runtime v2. `verifyInstalledExecution` provides
local inspection with the same fixed environment loader. Its successful return is verification,
not a consumable permission; only the remote controller can admit and consume the operation.

The existing watchdog client authenticates the fixed private origin, reads `/status`, verifies
the actual reservation, and sends `/bind` with exactly operation ID, lease ID and packet. The
remote controller rechecks against its own retained lease, installed admission and current clock.
Local provider mutations are routed through this controller. A legacy-shaped request cannot
select legacy behavior when installation is present. Configuration generation and the parity-only
CLI refuse installed execution mode because their separate phase contracts are not implemented.
Legacy behavior is preserved when installation and the permanent remote latch are absent.

Before bind and each forward mutation, the remote controller recomputes S and verifies the full
conjunction, both signatures, exact P, protected parity, current freshness and actual lease.
It uses the independent `WATCHDOG_READ_TOKEN` only for fixed-origin GETs to re-read:

- current web, worker and migrator application/actor images and complete rollout state;
- the latest exact gateway deployment/version at 100 percent;
- both source zones' account ownership/status, strict SSL, complete normalized DNS and routes.

The complete expected baseline includes every acknowledged original-operation route intent.
Observation has one eight-second budget in the watchdog, bounded bodies and pagination, and a
fixed redacted failure message. It never reports provider bodies or bearer-bearing exceptions.
The initial observation is retained with admission; forward observations are retained with the
write-ahead state. The observer has no provider write API.

The runtime hashes actual submitted config, manifest, artifact and baseline bytes and compares
all pinned identities. Database schema/session state, import/content truth, intake ownership,
recovery custody and other non-provider facts still depend on authenticated retained machine
observations. The existing production database and ownership measurements are bounded to five
minutes, protected staging parity to 24 hours; candidate evidence also obeys each admitted
policy age/explicit expiry and S's original expiry. This slice does not add a live SQL or content
export reader. Those retained bounds are material limits, not fresh remote database proof.

## Durable consumption, bounds and replay

Admission atomically commits the armed state, immutable operation-grant record, lease-use index,
canonical packet chunks, next alarm and permanent single-operator mode latch. Transaction failure
commits none of them. There is no request-level reset. Once the latch exists, removed, empty or
malformed installation blocks every new forward operation, including a fresh operation ID and
rehearsal entry points. Installing v2 does not promote an existing legacy operation.

The complete request and canonical packet are each limited to 2 MiB. Packets use at most 43
ordered 49,152-byte chunks, each base64 value at most 65,536 characters. At most 47 keys are
committed together. The retained record binds total byte length, chunk count and complete digest;
reads verify length, order, canonical base64 and digest before reuse. Missing, substituted or
reordered storage cannot become forward permission.

Before provider observation, bind checks a 100 KiB projected active-state budget including every
possible route intent, 16 KiB each for journal and observation, and recovery metadata allowance.
Runtime journal and observation values are separately capped at 16 KiB. Larger candidates need
a reviewed storage expansion; there is no truncation or digest-only fallback.

An exact repeated bind reads the retained packet and outcome without provider calls, writes,
rearming or extending the original window. A different plan, packet, action, grant, operation or
lease cannot reuse the consumed binding. The record survives restart and operation archival.
Forward mutation retains the existing write-ahead intent and output gate, refuses lost-ack retry,
and rechecks authority around provider/storage awaits. Expiry after a committed admission or a
provider acknowledgement starts original-operation restoration; it never creates a fresh grant.

## Conditional acceptance and original recovery

Conditional cutover acceptance is the existing complete production-parity disarm decision with
an explicit `conditional_cutover_acceptance` machine purpose and the original S/P/admission/key
bindings. It must be observed after admission, cover every production host and parity domain,
match the actual resulting state and arrive inside the original forward window. The same original
controller key is used. This receipt is not an R11/R12 evidence artifact or execution permission.

Snapshot/grant expiry and trust-configuration removal do not disable original-operation restore,
alarms, late-write reconciliation or accepted-write preservation. The remote controller retains
the original verified plan, baseline and public role keys. Recovery progresses without reloading
forward admission or requiring a new readiness snapshot. The restore CLI obtains those original
public keys from authenticated retained remote state. Provider outages or removed provider
credentials remain reconciliation conditions; source code cannot manufacture provider access.

Restored-lease release remains a separate pair of original owner/controller signatures with
purpose `release-restored-route-lease`, exact operation/lease/baseline bindings and current issuance.
It requires repeated restored route readbacks, original-host checks and the existing quiet interval.
An execution grant cannot release custody. Successful release does not erase the mode latch or
consumed history, and no new launch-ready snapshot is required for release.

## Required operator inputs and remaining qualification

Real use still requires Ivan's ratified exact phase document and policy/key admission, genuine
candidate self-review and separate execution decision, independent machine evidence/signatures,
complete fresh R00–R10 and protected parity, exact release/artifact/config/data bytes, actual source
zone and recovery ownership, and an authenticated reservation from the reviewed watchdog release.
The same canonical admission and existing public keys must be independently installed on operator
and watchdog surfaces, with the scoped read token and existing private control/route credentials.
The repository template deliberately installs none of these values.

Source tests and a Worker dry bundle do not prove real custody, genuine owner review, provider
permission scopes, actual data truth, deployed runtime behavior or recovery rehearsal. Live
qualification, deployment/configuration authorization, expanded R11/R12 lineage and release-gate
adoption remain outside this source checkpoint. Do not call the protocol or release complete.
