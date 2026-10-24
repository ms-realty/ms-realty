# Cloudflare recovery archive setup

The owner accepted the provider choice and R2 lock-administrator tradeoff in ADR 0006.
Use a separate agency-controlled Cloudflare account, an EU-jurisdiction private R2 bucket,
and an encrypted recovery copy and keys outside the application account. This plan creates
nothing and does not qualify R08, R10 or a recovery point.

The existing application and legacy backup configuration share an account. Existing files,
an S3-compatible credential name or an earlier report cannot establish separate custody.
The proposed retention is 90 days; that duration still needs explicit approval. No automatic
lifecycle cleanup is configured: retained points must keep every referenced object.

Copy `inputs.example.json` to private operator configuration. Complete the archive-account
pin, bucket, custody, retention and separate-review inputs. Keep credentials and private
keys out of the repository and chat. Use only the named private environment variable for
the archive read token; there is no default-account or credential fallback.

`node scripts/recovery-archive-plan.mjs --inputs <private-json> --out <private-report>`
produces a blocked plan until those inputs exist. Optional `--validate` uses only
fixed-origin Cloudflare GETs to observe the pinned account, exact EU bucket, private
managed/custom-domain configuration and archive-wide retention rules. Successful reads
qualify configuration only. The command never creates resources, changes locks, uploads,
deletes, signs or opens a recovery destination.

## Execution and qualification

1. Record agency custody of the separate archive account and outside-account encrypted
   copy/keys. Name the operator and separate reviewer, approve retention and keep
   application deployment credentials out of archive administration.
2. Create the dedicated private EU bucket and approved locks under that authority. Scope
   the backup writer to its archive bucket with no configuration/lock permissions. R2
   administrators can remove locks; keep that accepted limitation in the operating record.
3. Independently observe configuration. With a unique disposable canary, prove the writer
   cannot overwrite or delete a retained object or change retention. Preserve the provider
   denials. Configuration booleans cannot substitute for these checks.
4. Encrypt a consistent database/object/release package before upload. Use unique immutable
   keys and conditional creation. Download the actual archived ciphertext through recovery
   credentials and compare ciphertext, manifest, database and all referenced object hashes.
5. Verify the outside-account copy and latest independently retained append-only safety
   tail/watermark. Restore into clean isolated resources, revoke restored sessions, disable
   external effects and reconcile post-snapshot accepted writes/provider outcomes. Missing
   or unverifiable safety history keeps the destination quarantined.
6. Obtain operator and separate-reviewer evidence bound to the exact candidate, account,
   configuration, archive and restore. Require signed authority before controlled reopening.
   An old database restore is not an application rollback; preserve accepted newer writes.

The live staging drill proves data/object restoration and a closed destination. It leaves
separate custody, outside-account copy, safety-tail completeness, controlled reopening,
recovery objectives and human approval unqualified until their real evidence exists.

References: [R2 bucket locks](https://developers.cloudflare.com/r2/buckets/bucket-locks/),
[R2 token permissions](https://developers.cloudflare.com/r2/api/tokens/),
[data jurisdiction](https://developers.cloudflare.com/r2/reference/data-location/) and
[PostgreSQL 16 pg_dump](https://www.postgresql.org/docs/16/app-pgdump.html).
