# Cloudflare recovery operated by Ivan

ADR 0006 records the owner's Cloudflare choice and sole-operator instruction. Use the
existing Cloudflare identity. A second account or reviewer is not required for Phase 2.
Report the archive as single-operator storage; do not claim independent administration.

Keep EU archive access private, encrypt before upload and retain a verified encrypted
copy outside the application account under Ivan's custody. Preserve existing retention;
the observed legacy EU bucket has a 90-day default and a longer decommission prefix rule.
Do not change retention or delete older objects as part of the staging drill.

Copy `inputs.example.json` to private configuration and fill actual account/bucket,
operator contact, encryption and outside-account copy references. Credentials and private
keys stay outside Git and chat. `retentionMode: preserve_existing` observes current rules
and proposes no new lock. The optional `independent_recovery_archive` scope additionally
requires separate account administration, reviewer and signing references; it is not the
owner's current operating model.

`node scripts/recovery-archive-plan.mjs --inputs <private-json> --out <private-report>`
prepares the plan. Optional `--validate` uses fixed-origin GETs to observe the pinned
account, exact EU bucket, private domains and retention. It creates no resources and
cannot qualify copy integrity, writer denials, signatures or recovery.

For the protected staging drill:

1. Bind the database snapshot, every durable object and release configuration to one
   candidate. Encrypt, conditionally upload under a unique private staging archive key,
   download the actual ciphertext and verify its hash. Preserve the local encrypted copy.
2. Restore into new isolated resources. Compare all table counts/content hashes and
   object bytes, revoke restored sessions and prove startup stays quarantined.
3. Reconcile current safety history, permissions and provider outcomes before reopening.
   Unknown history remains closed. An older database is not an application rollback;
   preserve accepted newer writes.
4. Ivan records actual operator review and owner acceptance. Do not manufacture an
   independent reviewer, signing authority, recovery target or production approval.

Production policy ratification and launch gates remain separate work. The staging drill
does not overwrite or delete production backups.
