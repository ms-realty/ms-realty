# R07 protected staging URL, SEO and sitemap observations

This collector captures a finite staging request plan and reproduces technical comparisons
offline. It produces `staging-url-seo-sitemap-parity.json`, a raw supporting receipt for
AT57 and the HTML/metadata/JSON-LD/hreflang/sitemap portion of AT27. It does not produce a
complete `migration_rehearsal_report`, a production map, an approval or a launch verdict.

`captureComplete` means every planned request and required redirect target has a complete
retained response. `technicalStatus` is `PASS`, `BLOCKED` or `FAIL` for the named comparisons.
It is possible to finish every request while comparisons remain blocked. A technical pass
compares supplied expectations; it does not authenticate their authority. Overall `status`
remains `BLOCKED` unless a defect makes it `FAIL` in this source phase. The collector has no
authority adapter or override that can turn this into verified release parity.

`productionQualified`, `publicationApproved`, `humanApproval`, `cutoverAuthorized`,
`gateCompletion`, `fullLegacyParityQualified`, `identityAuthenticated`,
`eligibilityAuthenticated`, `revisionCoherenceProven` and `completeUniverseProven` remain
false. The existing HTTP checker's three parity flags also remain false. Neither receipt
authorizes publication, translation/indexability, deployment or cutover.

## Source and authority boundary

The scope audit pinned application `e130f5f72f98a85daff009304a653dfc11fe9cca` and accepted
release tooling `7db050438f50c238d525d1cb51c09574c02c0a0e` separately. These do not identify a
composed or deployed candidate. The receipt retains these historical audit facts separately
from its actual plan and observed identity inputs:

- 457 frozen exact spellings, 454 normalized identities and 13 unresolved sources.
- 1,257 snapshots with pending equivalence review and 411 staging exclusions.
- An unreconciled current delta and no resulting production map authority.

Capture counts never replace those facts. The plan records each exact spelling, including
spellings sharing a normalized identity, and every exclusion with its reason. A normalized
identity uses the source host, decoded pathname and exact serialized query. A request keeps
its encoded path/query; HTTP and HTTPS source spellings are retained as separate records.
Host simulation on protected staging tests gateway routing logic, not public DNS or TLS.

The audited tree has no complete, independently authenticated expected-state/eligibility
producer or durable revision boundary. This implementation consumes explicit pending or
recorded expectations and preserves provenance bytes. It neither calls application approval
readers nor creates decisions, signatures, trusted keys or policies. A caller's `approved:
true`, reviewer name or extra authority field is rejected by the strict schemas. A
hash-matching input is not authenticated human review. The unratified single-operator
proposal does not change active policy.

## Three immutable inputs

The pure schemas and comparison functions live in
`src/release/staging-url-seo-sitemap-parity.mjs`. Unknown fields are rejected. JSON inputs
are at most 2 MiB and 32 levels deep. Digests are lowercase SHA-256 hex; Git pins are full
40-character object IDs. The focused test file contains complete synthetic packet examples.
It is test evidence, not an expectation exporter or human decision producer.

The packet directory contains `plan.json`, `expectations.json`,
`observed-identity.json`, and each explicitly named file under `inputs/`. Relative file
paths cannot traverse, contain credentials or resolve through symlinks. Files are checked
against both their exact byte length and SHA-256 before capture and again offline.

### Observation plan

`plan.json` has `schemaVersion: 1`, `kind: r07_observation_plan` and the fixed staging
account, zone and Worker. It contains these required fields:

| Field             | Contract                                                                                                                                                                                                                                                                                             |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sourcePins`      | Separate `application` and `releaseTools` commits; application must equal the expected source commit.                                                                                                                                                                                                |
| `expectedContext` | Source commit/tree, image/gateway/lockfile/routes/source-data/import/schema/config/locale-policy/catalog-policy digests, policy revision/digest, deployment ID and Worker version ID. Every key is required; null is pending.                                                                        |
| `parser`          | `jsdom` name/version and the application lockfile digest. The loader checks the installed version against that lockfile; parsing uses no script execution or external resource loading.                                                                                                              |
| `inputs`          | Named references for frozen inventory, route manifest, source pages, decisions, exclusions, source captures, eligibility, revision boundary, independent review, human decisions, provider observations and runtime observations. The first six must be supplied; the others may explicitly be null. |
| `files`           | Every local input as `{path, bytes, sha256}`. References inside these files are not imported recursively.                                                                                                                                                                                            |
| `currentDelta`    | `pending` or `recorded`; recorded is a claim for comparison, not accepted reconciliation.                                                                                                                                                                                                            |
| `urls`            | Finite records with `id`, exact `sourceUrl`, `normalizedId`, groups (`frozen`, `snapshot`, `current`), `pendingSource`, `capture`, `exclusionReason` and optional explicit `followPath`.                                                                                                             |
| `sitemapPaths`    | Complete finite list starting with `/sitemap.xml`; any index parts must be explicitly listed. No recursive discovery.                                                                                                                                                                                |

A URL record ID is the first 24 hex characters of SHA-256 over its exact source string.
Its normalized ID follows the existing source host/decoded-path/query identity contract.
Duplicate exact spellings, conflicting normalized mappings, unexplained exclusions and
missing expected rows fail validation. No status, homepage/search mapping, `.ru` rule or
terminal disposition is invented by the plan. The currently unsupported retained `.ru` 200
case produces `retained_ru_200_unsupported`; the collector does not coerce it into a 301.

Only the two legacy source hosts are accepted. Path traversal, backslashes, control
characters, fragments, double slashes, auth/control endpoints and credential-bearing URLs
are rejected. The finite query key set is `p`, `page`, `paged`, `lang`, `s`, `property_id`.
Permitted encoded values and query ordering are preserved. Unsupported query semantics
need a separately reviewed contract change; the collector does not strip them silently.

### Expected state

`expectations.json` has `kind: r07_expected_state`, the exact `planSha256`, the same
candidate `context`, independent `provenanceRef`, `eligibilityRef` and
`revisionBoundaryRef`, and one row for every plan URL. Missing provenance is null/pending,
not an empty authoritative catalogue. Every non-null reference must be declared in the plan.

Each row records pending/recorded state, a nullable disposition (`200`, `301` or `410`,
exact production target, rationale and provenance), production canonical identity, locale,
eligibility, exact publication/fact/terms/localized/CMS/source revisions, metadata,
alternates, JSON-LD and a visible projection. The visible projection names `main` or
`article` and hashes its normalized visible text after removing scripts, styles, templates,
noscript and explicitly hidden content. It is a DOM text projection, not browser visual QA.

Titles and descriptions distinguish `{state: pending}`, `{state: absent}` and
`{state: value, value: ...}`. Recorded absence is compared explicitly. Empty or missing
expectations cannot make an empty head pass. `jsonLd: []` means recorded absence;
`jsonLd: null` is pending. JSON-LD is compared structurally, without fetching contexts or
interpreting unknown facts as zero. Expected JSON-LD describes the exact served staging
projection; production canonical identity is kept in its separate field.

Alternates are an explicit eligible set, including the self edition when applicable.
`x-default` must point to an eligible BG sibling. Every named sibling must be independently
planned, observed and reciprocal. An empty approved sibling set is legitimate held
behavior. Held, unavailable, fallback, expired, restricted, superseded and withdrawn editions are excluded from the
expected sitemap/alternate set; stale or pending revision/eligibility evidence blocks.

The expected sitemap enumerates the exact eligible URL set, per-URL lastmod presence/value
and alternates. All eligible static BG pages must be included explicitly. Zero eligible
rows can test absence but produce `positive_eligible_coverage_unobserved`, never positive
eligible-content clearance. Existing unresolved legacy rows remain visible independently.

### Actual identity observations

`observed-identity.json` has `kind: r07_unverified_observed_identity`, a separate `context`,
provider/runtime provenance references, and an optional revision boundary reference and
snapshot/sequence claim. It must be acquired independently for the candidate; copying the
expected context is not deployment proof. The collector preserves and compares this input
without authenticating it. Each provider/runtime input is bounded to 2 MiB.

Provider acquisition and the candidate eligibility exporter are separate prerequisites.
This CLI does not call a provider API, invoke the full HTTP runner, prepare actors, call
`POST /__staging/runtime`, query the database or establish a new freeze. It cannot establish
a common durable revision from matching HTML, timestamps or before/after equality.
Snapshot/sequence and revision mismatches fail comparison; even equal claims remain
blocked pending authenticated durable revision evidence. A change-and-revert sequence
cannot be excluded by this collector alone.

## Bounded capture and offline reproduction

After a candidate and read-only access have been independently authorized, the CLI shape is:

```sh
node scripts/staging-url-seo-sitemap-parity.mjs capture \
  --packet /absolute/immutable-packet \
  --source /absolute/exact-application-checkout \
  --output /absolute/new-capture-directory

node scripts/staging-url-seo-sitemap-parity.mjs verify \
  --capture /absolute/capture-directory \
  --source /absolute/exact-parser-checkout \
  --output /absolute/new-offline-readback.json
```

These commands are interface examples, not permission to collect live evidence. Capture
reads `MSR_PARITY_ACCESS_CLIENT_ID` and `MSR_PARITY_ACCESS_CLIENT_SECRET` from its command
environment. Credentials cannot occur in packet bytes and are never printed. Do not put
credentials on a command line or inside a packet. Existing directories/files are refused;
retries need new output locations. Keep offline output outside the original capture.

Live mode requires clean exact application and tooling checkouts before and after capture,
the fixed protected origins and verified TLS. Source binding does not attest a running
image. Injected transport always sets `evidenceClass: test`, cannot be relabeled live and
can only reduce timing limits. There is no fixture or production fallback.

Requests use GET or HEAD only, manual redirects, six workers, global 334 ms pacing,
20-second request limits and a 45-minute total capture budget. Headers are bounded to
32 KiB; HTML to 5,000,000 bytes per response; sitemaps to 2 MiB per part and 32 MiB in total;
HTML corpus bytes to 448 MiB and all captured body bytes to 512 MiB. Plans allow at most
5,000 URL rows and 32 sitemap parts. Input bytes are bounded to 256 MiB. The parser never
executes page scripts, loads resources or expands external XML entities.

Anonymous HEAD probes check all three protected origins without following Access login.
Authorized private-host HEAD probes and public document responses must retain noindex.
Robots must explicitly disallow staging. The sitemap still compares the independently
expected eligible set: protected staging noindex is not future production indexing
permission, and does not imply an empty future eligible catalogue.

The only host simulation is `x-msr-legacy-host` on the protected public origin. An observed
301 is followed only if it exactly matches the single explicit same-origin plan target.
No credentials are forwarded to another staging host, public origin, login page or arbitrary
origin. Chains, mismatched targets and off-origin redirects fail. Every follow-up is paced,
bounded and retained separately. The actual staging canonical is compared with the explicit
staging transform of the production identity; it is never reported as an observed
production canonical.

Only content type/length/encoding, noindex and safe same-origin Location headers are retained.
Authorization, cookies, other response headers, Access login locations/queries and raw
exceptions are not persisted. Access/challenge bodies are omitted. Known credentials and
token/cookie-like body fields are redacted; redacted, omitted, timed-out and truncated
bodies are never labeled complete or assigned a full-response hash. Partial bytes already
received remain in the failed member. Source/customer data is not an acceptable fixture;
inputs must contain only the public, scoped material needed for the comparison.

## Raw custody and R10 packaging

Responses are persisted in deterministic request order in `raw-0000.bin`, subsequent
numbered shards, `raw-index.json` and an append-only `failure-events.jsonl`. Every member
has an eight-byte big-endian prefix (metadata length, body length), bounded UTF-8 JSON
metadata, then retained body bytes. Shards are at most 8 MiB. The index records every
member's ID, shard, offset, length and SHA-256. Request identity, observation times,
response status, safe headers, received/retained byte counts, retained hash, body state
and failure code are in the metadata. Body bytes are explicitly labeled `fetch_decoded`;
they are the document bytes returned by Fetch, not a claim about compressed wire bytes.
Only complete bodies have `fullResponseSha256`.

`failure-journal.json` reconciles the append-only events. `source-binding-before.json`,
`source-binding-after.json`, exact collector/verifier source bytes, the input packet,
every input/provenance file and every shard/index/journal are retained. The verifier
reparses the raw bytes, including pending rows, and emits per-row checks and deterministic
parsed-projection hashes. It verifies internal member lengths,
hashes, ranges, gap/overlap absence, exact request identity, failure reconciliation and
coverage. Tampering, missing/duplicate members and undeclared raw files fail. An interrupted
capture without a final index remains failed/partial evidence; it is never resumed over.

`supporting-files.json` explicitly lists the receipt and every dependency with length/hash.
It is an inventory, not a recursive importer or signed authority. A later R10 artifact must
list this inventory itself, the parity receipt, **every** shard, index, journal, packet,
provenance/decision/review file and the other complete migration evidence in its signed
`supportingFiles`. Merely signing an index does not import its referenced files. No
supporting files may be added after the existing E0 freeze.

R10 limits remain 1,024 total bundle entries, 16 MiB per file, 256 MiB payload and 2 MiB
parsed JSON. One file per page would exceed the entry limit for 1,257 responses; the shards
preserve all member bytes within fewer files. The receipt measures this complete local
capture package, including itself and the supporting inventory. It reports any budget
excess while preserving capture. `wholeCandidateBundleMeasured` and `packageAdmission`
remain false: the whole candidate's other artifacts, signed references and active R10
admission must still be measured and verified. No limit is raised and no row is dropped to
make a package fit.

Exit status is 1 for failure and 2 for blocked evidence. This phase has no overall positive
release exit. Setup or persistence failures retain a safe failure receipt where the new
output directory could be created; existing evidence is never overwritten. CLI output
contains only status, capture completeness and evidence class.

## Remaining gates

Before any live positive R07 claim, independently implement/admit the expectation and
eligibility producers, authenticate exact candidate/provider/runtime identity, establish
durable revision coherence, reconcile the complete current universe and obtain genuine
scope-specific Ivan decisions. The separate media/rights/original/transform/access proof,
final-delta rehearsal, released map, R00 authority and later cutover/acceptance gates remain
required. None is supplied by these synthetic tests or by a technical comparison pass.
