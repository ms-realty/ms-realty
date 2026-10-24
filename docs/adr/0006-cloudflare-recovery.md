# ADR 0006 — Cloudflare recovery with separate custody

Status: accepted by the owner for provider choice and the stated control tradeoff.
Supersedes architecture §17.3's mandatory AWS/S3 archive location. It supplies no retention,
custody, reviewer, deployment, recovery-point or production-release approval.

The agency's existing stack uses Cloudflare. The owner approved the reviewed alternative:
an EU R2 archive under separate administration, plus an encrypted recovery copy and keys
outside the application account. R2 administrators can remove retention locks; the owner
accepted that limitation. Keep that limitation visible in operational review and release
evidence. R2 locks are not S3 versioning or governance-mode Object Lock.

Use a separate agency-controlled Cloudflare archive account so application deployment
credentials cannot administer its buckets or retention. The backup writer is scoped to the
dedicated archive bucket and cannot change lock rules. Create unique immutable keys with
conditional writes, encrypt before upload, record checksums and retain every object needed
by a retained recovery point. No automatic lifecycle cleanup is authorized by this ADR.
Retention duration and outside-account key/copy custody still require recorded approval.

The independent safety tail and acknowledged watermark, complete coherent manifests,
freshness alerts, isolated restore, revoked restored sessions, disabled external effects,
provider reconciliation and accepted-write-preserving rollback remain required. An
unavailable or incomplete safety tail keeps recovery quarantined. A separate reviewer and
signed evidence are required before reopening. The agency must retain its monitored
incident/contact path for a Cloudflare outage.

The existing application and legacy backup configuration share an account; that fact is not
evidence of separate custody. A local encrypted archive and successful restore also cannot
prove the outside-account copy, live retention enforcement, independent safety tail or
review. Qualify those controls against actual provider and operator evidence before
clearing R08 or R10. Signed R00 authority and the existing launch gates remain required.

The owner decision is recorded in this task as “Approve the Cloudflare recovery alternative”.
The operational plan is in `deploy/recovery-archive/`; its validator observes configuration
with GET requests only and cannot provision or reopen anything.

References: [R2 bucket locks](https://developers.cloudflare.com/r2/buckets/bucket-locks/),
[R2 permissions](https://developers.cloudflare.com/r2/api/tokens/) and
[data jurisdiction](https://developers.cloudflare.com/r2/reference/data-location/).
