# Independent recovery archive setup

This is a reviewable setup proposal. It provisions nothing by itself and does not qualify
R08, R10 or a recovery point. The existing Cloudflare R2 recovery evidence belongs to the
previous application and does not establish the selected architecture's independent archive.

Architecture §17.3 requires: “Store encrypted independent copies in a separately controlled
AWS account/S3 EU region.” It also requires a named operator and separate reviewer, replay
of the latest verifiable safety tail or a closed restore, and provider-outcome reconciliation.

## Proposed resources

Use an agency-controlled recovery account, Frankfurt (`eu-central-1`), a private versioned S3
bucket and governance Object Lock. The proposed retention is 90 days, matching the retained
legacy recovery policy; its application to this new archive still needs owner review. The
backup writer may put and verify archive objects. It cannot delete versions, bypass retention
or administer the bucket or IAM. Encryption with the agency's age recipient happens before
upload; the private decryption identity stays outside the backup runtime and the archive.
There is no automatic lifecycle deletion: retained manifests must keep all their references.

Copy `inputs.example.json` into private operator configuration and complete the nonsecret
account, profile, bucket and custody fields. Record the retention decision and a separate
reviewer. Keep credentials and private keys out of this repository and chat. The previously
configured AWS default profile was unavailable during the local preparation; do not substitute
another project's account or the application's R2 credentials.

`node scripts/recovery-archive-plan.mjs --inputs <private-json> --out <private-report>`
renders a blocked proposal until the required custody/review inputs exist. Optional `--validate`
performs only STS account readback and CloudFormation template validation in the explicit EU
region. It never creates resources or a change set and cannot execute one.

## Review and execution sequence

1. The owner identifies the agency-controlled AWS recovery account and approves its custody,
   region, retention and operator trust principal. A separate reviewer accepts that role.
2. An operator verifies the selected profile's STS account against the explicit account pin,
   then validates the template and reviews a CloudFormation change set in that account.
   Creating a change set is separate from executing it. No template or account field is an
   approval to execute it.
3. After approval, create the private versioned bucket and narrow writer role. Independently
   read back its owner, EU region, Public Access Block, versioning, governance retention and
   writer permissions. Prove that the writer cannot delete an archive version or bypass
   retention using a disposable test object, retaining the actual provider denial.
4. Upload an encrypted, checksum-bound consistent recovery package. Download its exact object
   version through independently held recovery credentials; verify ciphertext, manifest,
   database and every referenced object before restoring into new isolated resources.
5. Restore with web, jobs and provider egress disabled. Compare all records and object digests,
   replay the current complete safety tail, invalidate restored sessions and reconcile accepted
   writes and external-action outcomes. Missing or unverifiable authority keeps the destination
   quarantined; restoring only an older database is never an application rollback.
6. The operator and separate reviewer review the exact archive, restore, reconciliation and
   reopen evidence. Their signatures must bind the selected candidate, configuration, policy,
   schema and provider accounts. Empty key/approval fields remain blocked. No old approval or
   earlier R2 report is transferred to this candidate.

The live staging drill is narrower: it proves data/object recovery and a closed destination.
It leaves independent custody, a complete safety tail, controlled reopening, recovery
objectives and human approval unqualified until their actual evidence exists.

Provider references: [S3 Object Lock](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.html),
[S3 bucket CloudFormation schema](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-s3-bucket.html),
[PostgreSQL 16 pg_dump](https://www.postgresql.org/docs/16/app-pgdump.html).
