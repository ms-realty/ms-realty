# R10 local evidence bundle contract

This is disabled source tooling for `single_operator_owner_review`. The proposed policy has
zero keys and unratified references. The active policy and launch authority remain unchanged.
The commands supply no live reports, trust installation, Ivan signature, ratification or
execution permission. Legacy separate-reviewer evaluation is unchanged.

## Finite sequence and trust

The order is `M0 + policy + E0 → index B → capture → verification → Ivan A → M1 → S`.
M0 has an empty `approvals` array and the complete signed nonapproval evidence E0, including
earlier human, R00, recovery and candidate decisions. Only the missing current A is deferred:
all R00–R09 requirements, complete context, every supplied artifact and R10 nonapproval
requirements must pass before signing. Unlisted, duplicate or uncounted input blocks capture.

B and its witnesses are transport controls outside E0; they cannot satisfy normal gate proof.
Only the exact current manifest approval slot is excluded by `approvalEvidenceDigest`, after
slot validation. No prerequisite is dropped to avoid a hash cycle. Execution, expanded-set
acceptance and recovery decisions remain separate, with their existing authority boundaries.

The CLI reuses `loadExecutionAdmission(process.env, "operator")`, including the existing fixed
installation and public-key fingerprints. There is no trust, enrollment, activation, fallback
or time-override flag. The library's injected time/trust belongs to trusted adapters and tests.
An incoming policy cannot establish deployment trust.

The external machine signer uses `MS_REALTY_BUNDLE_SIGNING_KEY_PATH` and
`MS_REALTY_BUNDLE_SIGNING_KEY_ID`. The admitted policy must explicitly authorize that machine
key for `evidence_bundle_capture` / `evidence_bundle_verification` and `machine_observation`.
Execution scope grants no bundle scope. Keys remain outside all input/output trees; only public
key metadata is copied. No command installs or generates keys. Actual use requires separately
authorized custody and ratification. Synthetic test keys never become production evidence.

## Closed local inventory

Prepare an isolated input root containing exactly the inventory's files. The inventory document
is outside that root and has `schemaVersion: 1` and a `files` array. Every row has `path` and
`role`: exactly one `manifest`, one `policy`, one `evidence` row per E0 ID, and `supporting` rows
with nonempty `references` arrays. All paths are relative. Parent directories must already exist.

The five cutover, rollback, amendment, limitation and phase-permission references require exact
local bytes. Artifacts declare additional raw receipts in optional signed
`supportingFiles: [{ "ref": "receipt-identity", "digest": "sha256:..." }]`. Every declared
reference maps exactly once to a supporting file with that digest. Several references may name
one identical file. A URL or hash without matching local bytes blocks capture; nothing is fetched.
Producers must declare all required underlying receipts. Assertion prose is not a file inventory.

```json
{
  "schemaVersion": 1,
  "files": [
    { "path": "manifest.json", "role": "manifest" },
    { "path": "policy.json", "role": "policy" },
    { "path": "evidence/report.json", "role": "evidence" },
    {
      "path": "receipts/cutover.txt",
      "role": "supporting",
      "references": ["reviewed-cutover-reference"]
    }
  ]
}
```

This abbreviated shape is not a usable package; the actual inventory must be complete. Full
context remains covered by `releaseContextDigest`: source, images, dependencies, model/prompt/
schema revisions, providers, database/manifest pins, scope, policy and original recovery time.
Named revisions are not hashes; copied database reports are not fresh SQL measurements; image
observations are not local image measurements. Existing runtime byte/parity checks remain required.

## Capture, verify and owner handoff

```sh
npm run launch:evidence:capture -- --root /operator/frozen-input \
  --inventory /operator/inventory.json --out /operator/captured-package
npm run launch:evidence:verify -- --bundle /operator/captured-package \
  --out /operator/verified-package
```

Capture copies into `payload/`, rereads the destination and evaluates its actual copied inputs.
Canonical `index.json` pins source/environment, policy/key-set/context/M0/E0 digests and ordered
paths, roles, byte lengths and raw hashes. Evidence rows also carry IDs and canonical signed
artifact digests. Reformatting preserves artifact identity but changes raw hashes and requires
recapture. The machine then signs `capture.json`.

A separate invocation reopens every copied file, verifies the closed inventory and signatures,
reproduces the complete original readiness snapshot, compares both saved views and evaluates
prerequisites at current time. Its new package contains `verification.json`. A repeated verify
produces a new witness; Ivan must review the exact selected witness. The actual producer/version
is recorded. Another machine check does not create independent human custody.

Ivan's genuine signed `release_attestation` uses human actor Ivan, `candidate_review`, the existing
required assertions and `attestedEvidenceDigest = hash(canonical E0 digest map)`. Its `digests`
must include `bundleIndex`, `bundleCapture` and `bundleVerification`, each hashing the exact
canonical control file, plus existing artifact pins. Its signed observation/approval time must
follow verification. The tool does not sign it.

```sh
npm run launch:evidence:verify -- --bundle /operator/verified-package \
  --approval /operator/genuine-owner-attestation.json --out /operator/candidate-package
```

This invocation keeps the selected witnesses unchanged, copies A verbatim, derives the single
manifest approval from A's signed identity/time and requires full R00–R10 qualification. Outputs
include `owner-review.json`, `manifest.final.json`, `candidate.json` and both readiness views.
The data-only candidate goes to the existing execution bridge, which reproduces S at its original
time and reevaluates at current time with the same raw `bundle` proof. Final candidate packages
are handoff outputs, not inputs to another witness operation. Changed E0 needs a new sequence.

Every operation uses a new exclusive private directory; it never overwrites an identity.
`result.json` is the final commit marker after verification. Partial directories are unusable.
Failure removes the attempt's own partial output and emits a redacted
`r10-failure-<attempt>.json` alongside the requested output, or a failed stderr receipt if that
parent cannot be written. Existing successful packages remain unchanged.

Exit `0` means the requested package operation verified, `2` means valid but blocked inputs,
and `1` means malformed input, I/O or integrity failure. JSON/stdout and Markdown separately
state R00–R10 qualification, owner-review status, overall release `blocked` and execution
`unavailable`. Before A, successful byte verification still reports R10 blocked. Missing trust
or the valid zero-key proposal emits diagnostics without a usable index or witness. R11/R12
holds remain even after a synthetic R00–R10 pass.

## Bounds and verification limits

V1 bounds are 1,024 payload entries, eight path components, 256 path bytes, 2 MiB per JSON
document, 16 MiB per supporting file, 256 MiB aggregate payload and JSON depth 32. Counts/sizes
are checked before allocation and actual copied bytes remain bounded. Larger inputs require a
reviewed extension; nothing is truncated. The complete runtime packet retains its 2 MiB cap,
including all evidence/configuration bytes, raw controls and execution envelopes.

Portable ASCII paths exclude traversal, absolute/hidden/device names, trailing dots, shell
metacharacters and case collisions. Roots, ancestors, hard links, symlinks and special files
are checked. No-follow descriptor reads check identity, length and modification times; copied
bytes are reread. Duplicate JSON keys, invalid UTF-8, ambiguous controls and noncanonical
signatures fail closed. Signer failures do not expose credential content.

Witness expiry is bounded by original evidence/recovery expiry, its own policy maximum, the
snapshot maximum and the preceding capture. Fresh tooling timestamps never rejuvenate evidence
or recovery sealing time. Existing observation skew and separate current database/ownership/
parity freshness remain enforced; snapshots cannot be evaluated in the future.

The pure `validateBundleBinding` is shared by direct evaluation and execution verification.
It checks exact raw E0, context/policy pins, witness scope/signature/time and A's control hashes
without I/O or evaluation recursion. The filesystem verifier checks supporting bytes; runtime
authenticates those witnesses and still checks its own configuration bytes. No cached success
flag is authority. Signatures prove custody/integrity, not observation truth, completeness of
undeclared source material, actual Ivan review or independence from a shared administrator.
