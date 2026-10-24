# ADR 0006 — Cloudflare recovery operated by one owner

Status: accepted provider choice and single-operator operating model. Supersedes the
mandatory AWS/S3 archive, separate archive administrator and second recovery reviewer
requirements for the current Phase 2 setup. It grants no release signature or reopening.

The owner approved the Cloudflare alternative, then clarified that Ivan is the sole
operator and there are no other people. Use Ivan's existing identity; keep its email in
private configuration. Another person or Cloudflare account is not an entry condition
for the protected staging pilot. Record the operator's own restore review explicitly;
do not describe it as independent review.

Use private EU R2 recovery storage and a verified encrypted copy outside the application
account, with keys controlled by Ivan. One person may control the application, archive
and local copy. This provides restoration options but not independent administration,
protection against that administrator or a guarantee through a whole-provider failure.
Separate administration and review remain optional future improvements.

Preserve existing retention while observing actual provider configuration. The legacy EU
archive has an observed archive-wide 90-day rule and a longer decommission prefix rule.
This decision changes neither duration and authorizes no lifecycle cleanup. A new rule
needs its own deliberate decision. R2 administrators can remove locks; the owner accepted
that limitation. R2 locks are not S3 versioning or governance-mode Object Lock.

Encrypt before upload, use unique immutable keys with conditional creation, record
checksums and retain every object referenced by a retained recovery point. The staging
drill writes only its unique encrypted archive under the private staging namespace;
it must not replace, delete or repurpose production backups.

Complete coherent manifests, current revocation/deletion history, safety tail and
acknowledged watermark, isolated restore, revoked restored sessions, disabled external
effects, provider reconciliation and accepted-write-preserving rollback remain required.
Unknown safety history keeps recovery quarantined. Configuration observations and a
successful closed restore do not establish signed authority, recovery objectives or
permission to reopen. Ivan must make the actual operator and owner decisions.

The draft production release policy needs explicit ratification for this operating model
before production launch. Do not silently treat its older independent-review assertions
as satisfied or generate a second signature/person. R00 authority, trusted keys and the
existing launch gates remain unqualified.

The operating plan is in `deploy/recovery-archive/`. Its GET-only validator supports the
explicit single-operator model and an optional separately administered model. It observes
account, EU bucket, private access and retention; it cannot provision, sign or open recovery.

References: [R2 bucket locks](https://developers.cloudflare.com/r2/buckets/bucket-locks/),
[R2 permissions](https://developers.cloudflare.com/r2/api/tokens/) and
[data jurisdiction](https://developers.cloudflare.com/r2/reference/data-location/).
