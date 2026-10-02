# Release contract and local evaluator

This is draft implementation tooling for architecture §§20–21 and ADR 0002. It does not
approve the launch-authority transition, replace required legacy proof, or clear a launch gate.
`policy.json` ships with no trusted keys and no replacement/retirement approvals. The local
`manifest.template.json` has unknown inputs and always evaluates as blocked. No live evidence,
operator decision, or release acceptance is supplied by this directory.

Search Console, Yandex Webmaster and backlink exports are optional historical analytics at
**every** lifecycle stage (owner decision, 2026-09-24). Exact crawl/URL parity for both legacy
domains remains required. Search-provider and legacy runtime evidence replacements need an
explicit signed R00 decision; their names changing does not satisfy the old obligation.

## Commands

```sh
npm run release:schemas
npm run release:schemas -- --check
npm run release:evaluate -- --manifest /operator/release-manifest.json \
  --evidence /operator/evidence --policy /operator/approved-policy.json --out /operator/readiness
```

The evaluator reads only local files and writes `readiness.json` plus `readiness.md` from one
snapshot. It makes no provider calls and has no deployment or publishing operation. The evidence
directory contains JSON artifacts, may contain subdirectories, and must not contain symlinks or
the output directory. Exit **0** means every R00–R12 gate passed this evaluation; **2** means a
valid blocked result; **1** means the inputs could not be evaluated. A failed refresh after the
output path is accepted replaces earlier output with an invalid/blocked marker, so a previous
passing file cannot silently survive that failure. A filesystem write failure must be treated
as an unusable result. `--now <ISO instant>` exists for reproducible offline diagnostics; it does
not extend evidence validity, and the runtime still applies its own clock.

The source contracts are `src/release/schemas.ts`. Generated draft-2020-12 schemas live under
`schemas/`; `--check` and tests reject drift. Cross-field relationships, cryptographic checks,
dependencies and expiry are evaluated by the TypeScript evaluator in addition to JSON Schema.
Do not use successful JSON Schema validation as a readiness verdict.

## Producing a bound evidence set

1. Complete and freeze the candidate manifest: exact Git SHA, all artifact/config/data and
   procedure digests, provider references, scope, revisions and sealed recovery-point identity.
   Do not put credentials or customer data in these files. Set the actual environment.
2. Reconcile the policy with the accountable owner and release owner. Register only authorized
   Ed25519 public keys with their named owner and permitted evidence types. R00 replacement or
   retirement records need an approval referring to a signed `authority_decision_record`, with
   matching signer name and a passing `legacy:<legacy-id>` assertion. R00's authority assertions
   also cover scope, owners, policy, the legacy mapping and external-evidence transition.
3. Collect real observations and reviews. Every artifact has a source/version, observation and
   optional expiry, environment, evidence class, SHA, policy revision and canonical policy digest.
   Its `dataDigest` is `releaseContextDigest(manifest)`: SHA-256 of canonical candidate JSON,
   excluding only `$schema`, `evidenceIds`, `evidenceDigests` and `approvals`. All other manifest
   fields are bound. CI artifacts have class `test`; live checks, human reviews and operator
   decisions cannot be replaced with local/CI fixtures. The current draft policy requires a
   trusted signature for every non-CI artifact. Unredacted artifacts do not count.
   Each artifact must itself pass its type's `requiredAssertions` in the policy. A signed
   placeholder live report cannot borrow deployment/provider checks from an unrelated CI report.
4. Pin every artifact ID and `evidenceDigest(artifact)` in the manifest. This digest hashes
   canonical JSON **including** its signature; report entries also record the raw file hash.
   Sorting object keys is recursive; arrays retain order. Plain reformatting does not change an
   artifact digest. `signEvidence` signs canonical artifact JSON **excluding** `signature`.
   Signing keys remain outside the repository and ordinary application runtime.
5. Obtain separate operator and reviewer `release_attestation` artifacts under R10. Their IDs
   are referenced by the corresponding manifest approvals. Each signer must match the named
   approver, each approval time must match the signed observation time, and each artifact must
   assert `approval:operator` or `approval:reviewer`. Set `attestedEvidenceDigest` to
   `approvalEvidenceDigest(manifest)`: the canonical hash of the pinned evidence map excluding
   the two approval artifacts, which cannot hash themselves. Other artifacts use null. Sign the
   attestations and pin their final digests. Changing any other proof invalidates these decisions.
6. Evaluate and review both generated views. A signature verifies custody and unchanged bytes;
   it does not establish that an observation or human review actually happened. Only genuine
   live reports and operator inputs can support real release decisions. The evaluator's unit
   tests generate synthetic signing keys and pass scenarios solely to exercise the evaluator;
   those fixtures are never launch evidence.

All gates depend on R00. R10 additionally requires R01–R09; R11 requires R10; R12 requires R11.
Missing evidence, failed assertions, incomplete manifest/approvals, changed bindings and invalid
signatures block their gate and dependents. Staging can qualify a candidate but cannot pass final
release acceptance; R11/R12 require a production manifest. Deployed-path/provider/monitoring and
rollback evidence expires at 24 hours, independent recovery points at 60 minutes. A recent
observation cannot freshen an old sealed recovery point. Producer expiry can shorten these limits.
The snapshot expires at the earliest counted-proof/recovery expiry and never lasts over 24 hours.

## Runtime readback

`GET /api/ops/readiness` is staff-host only and requires an active staff session with
`report.read`. It reads `release/readiness.json`, returns no evidence bodies, and uses `no-store`.
For later authorized deployment, package or mount that reviewed snapshot and bind the runtime to:

- `BUILD_SHA`: the manifest release SHA.
- `RELEASE_ENVIRONMENT`: `staging` or `production`.
- `RELEASE_MANIFEST_DIGEST`: `report.release.manifestDigest`.
- `RELEASE_POLICY_DIGEST`: `report.policy.policyDigest`.
- `RELEASE_SNAPSHOT_DIGEST`: `report.snapshotId`.

Missing pins, another release/environment/config/policy/snapshot, malformed or altered reports,
future evaluation times, expiry, missing gates and contradictory verdicts return every gate
blocked. Pins must come from the operator-reviewed release package; deriving them from whichever
file happens to be on disk would remove the check. No deployment configuration is changed by
running the evaluator. Health remains a separate minimal process check and never claims readiness.
