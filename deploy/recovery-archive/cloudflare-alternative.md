# Cloudflare recovery alternative for owner review

Status: provider choice and the stated control tradeoff accepted by the owner in ADR 0006.
Live custody, retention, separate review and recovery qualification remain open. The existing deployment and
legacy S3-compatible backup credentials use Cloudflare. The `AWS_*` SDK variable names do
not establish an AWS account. Architecture §17.3 separately specifies a controlled AWS/S3
archive; ADR 0006 records the owner's decision to replace that location requirement. The
signed release authority and actual recovery evidence remain separate gates.

Keep application hosting on Cloudflare. A recovery alternative can use encrypted recovery
points in an EU-jurisdiction R2 bucket under separate agency administration, with a second
encrypted copy and recovery keys held outside the application account. Application deploy
credentials must not control the archive account. The writer receives only the intended
archive-bucket object permissions; it receives no bucket configuration or lock-management
authority. A separate reviewer controls recovery verification and opening the destination.

R2 bucket locks protect retained objects against overwrite and deletion, but an authorized
administrator can remove their rules. They must not be represented as S3 versioning or an
equivalent governance-mode Object Lock control. Use unique immutable object keys, conditional
creation, recorded checksums, approved retention and reviewed administrator custody.
See [R2 bucket locks](https://developers.cloudflare.com/r2/buckets/bucket-locks/),
[R2 permissions](https://developers.cloudflare.com/r2/api/tokens/) and
[EU jurisdiction](https://developers.cloudflare.com/r2/reference/data-location/).

The existing application and legacy-backup configuration reference the same Cloudflare
account. That fact alone does not prove separate recovery custody. Inventory, jurisdiction,
private access, live retention rules, writer permissions and a real encrypted readback must
be established for the chosen archive before it can support a qualified recovery point.

The other §17.3 requirements remain: coherent database/object snapshots, complete manifests,
an independently retained append-only safety tail and acknowledged watermark, replica lag
alerts, restored-session invalidation, external-effect quarantine, provider reconciliation,
named operator and separate reviewer, and accepted-write-preserving rollback. An unavailable
safety tail keeps the restored environment quarantined. A same-provider archive also shares
Cloudflare availability; the documented incident/contact path remains required.

## Owner decision

The owner approved replacing the mandatory AWS/S3 location with an agency-controlled EU R2 archive under separate
administration plus an encrypted recovery copy outside the application account. Explicitly
accept R2's administrator-removable lock rules and the shared-provider availability limit.
Keep retention, agency custody, operator/reviewer identities and release-signing authority
as separate recorded decisions. This proposal does not supply any of those approvals.

## Required qualification

1. Verify the exact archive account, EU jurisdiction, private bucket and separately held
   keys; prove application credentials cannot change its configuration or retention.
2. Apply the approved retention policy. Verify a unique disposable canary cannot be
   overwritten or deleted by the backup writer while retained. Keep the actual provider
   denials; do not remove locks to manufacture a result.
3. Upload one encrypted staging recovery point with conditional creation, then download it
   and verify its ciphertext and manifest checksums. Prove every referenced durable object
   is recoverable against the consistent database snapshot.
4. Restore from the actual archived copy into clean isolated resources, replay the current
   safety tail or fail closed, revoke restored sessions and reconcile external actions.
5. Obtain the separate review and signed decision before controlled reopening. Update R00
   and the relevant recovery evidence only after acceptance. Production readiness remains
   governed by the existing launch authority.

The earlier AWS proposal is preserved in Git history. No AWS resources or new Cloudflare
archive have been provisioned by this decision.
