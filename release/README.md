# Release contract and local evaluator

This is draft implementation tooling for architecture §§20–21 and ADR 0002–0004. Ivan approved
the successor mapping reviewed at `1cf846d7` as both agency owner and technical release owner.
That chat approval covers the mapping only. It supplies no signed `authority_decision_record`,
evidence owners, broker decisions, release attestation or deployment authorization.

`policy.json` implements that mapping as `architecture-1.0/release-policy-draft-3`, with no
trusted keys and null replacement/retirement approvals. R00 and release remain blocked.
`production/data/launch-readiness.json` and `production/data/launch-input-checklist.md` remain
the current launch authority; historical passes do not qualify this rebuild. The local
`manifest.template.json` has unknown inputs and always evaluates as blocked. This directory
supplies no live evidence or release acceptance.

Search Console, Yandex Webmaster and backlink exports are optional historical analytics at
**every** lifecycle stage. Exact crawl/URL parity for both legacy domains remains required.
This does not waive the required monitoring `analytics_export`. Provisioning and Payload
substitutions still need implemented equivalent checks, named owners and a signed R00 record
bound to this policy before the old commands or report formats can be retired.

## Required successor and retained proof

The current legacy search contract already requires `postgres_search_sync`,
`postgres_search_query` and `hermes_draft_worker` reports. The policy requires those scoped live
reports, signed and bound to the authoritative database and exact release. A PostgreSQL
fixture or a generic provider/CI report cannot supply them. Search reports prove sync/projection,
authorized queries, deny/failure/recovery and the deployed path. Hermes proves authenticated
worker/provider operation, bounded draft tasks, budget/source policy and manual fallback; it
cannot publish, send, approve facts or make translations indexable.

The selected successor is the Cloudflare Containers candidate, Cloudflare gateway and
PostgreSQL 16.14 through a verified private TLS path. Web, persistent pg-boss worker and
file-based migrations use the immutable candidate image and separate database roles.
`successor_provisioning_report` proves this contract and equivalence to the legacy
`DATABASE_URL`, `PAYLOAD_SECRET`, `MS_REALTY_SEARCH_ENGINE=postgres`, `live:provisioning` and
`live:capture` checks. `first_party_runtime_report` replaces the Payload runtime proof with
deployed staff/client identity, grants/session boundaries, migrations, CMS/listing mutations,
human publication and worker leases, including deny, revocation, restart and recovery paths.
These report producers and their live qualification remain external inputs.

`listing_review_report` requires one complete human CSV for every in-scope listing, its current
facts, source, availability, media rights and publication decision, with assigned broker owners
and per-listing broker decisions. The existing manual audit covers 165 rows as non-approval
evidence: all 165 broker checks remain unassigned and there are zero broker approvals.
Source-as-is publication authorization supplies no factual, gallery or broker approval.
Translations need separate human approval before indexing. All five warning reviews are required:

| Warning in the preserved readiness JSON | Open count |
| --- | ---: |
| `structured_data.missing_area` | 11 |
| `structured_data.missing_bedrooms` | 9 |
| `structured_data.missing_public_images` | 7 |
| `listing_quality.missing_area` | 165 |
| `listing_quality.thin_public_gallery` | 17 |

The reviewer must retain the reviewed rows and approved disposition behind each warning
assertion. The evaluator checks signed assertion presence, result and release bindings; it does
not parse the human CSV, verify row coverage or warning counts, or establish the truth of an
observation. Producers and independent reviewers must supply that proof. Missing facts are
never inferred and warnings are never silently waived. The preserved checklist has differing
warning counts; reconcile the complete current review and regenerate one exact-release snapshot
before acceptance. Historical schema or publication passes do not clear these obligations.

Monitoring retains both `privacy_events` and `analytics_export`; the latter is still missing
and required for production readiness. `monitoring_check` requires a redacted production report
under 24 hours old, a passing public HTTPS endpoint and delivered alert, heartbeats and named
responders. `rollback_drill` requires an automated rollback policy, passing canary, verified
isolated drill, accepted-write preservation, cache purge/sitemap resubmit and queue/intake
fallback. Each of the four retained rollback steps has its own required assertion:

1. Keep the previous release/origin rollback available until the post-release crawl is stable.
2. Disable reviewed redirect deployment before changing content routes if crawl parity fails.
3. Republish the previous sitemap and robots files if indexable route coverage regresses.
4. Assign migration review-queue owners to triage failed old URLs before broad redirects.

Recovery retains encrypted independent off-site backup, isolated restore, checksums, rollback
and named operator/separate reviewer approval, with operator-authorized Ed25519 evidence.
R10 separately requires a captured and verified signed evidence bundle on the exact release
SHA, using the retained `launch:evidence:capture` then `launch:evidence:verify` contract with
the private signing key and mounted evidence paths after earlier gates pass. Its verified output
is bound to the candidate and named approvals; recovery signatures alone do not supply it.
R10 also requires independent protected staging parity before an authorized cutover.

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
   also cover scope, owners, policy, the legacy mapping, external-evidence transition, successor
   provisioning/identity equivalence and named evidence/broker-review owners. Mapping approval
   in chat cannot be inserted as a signed approval artifact or trusted key.
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
   the two approval artifacts, which cannot hash themselves. Other artifacts use null.
   The attestations must each assert capture and verification of the signed exact-release bundle
   and protected staging parity. Sign them and pin their final digests. Changing any other proof
   invalidates these decisions.
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
