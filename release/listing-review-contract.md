# R02 listing review inputs

Ivan can use this local Python 3.10+ command to prepare one CSV and inspect its coverage. Its JSON output is an unsigned checklist for the independent reviewer. The release evaluator separately requires a trusted, signed human `listing_review_report`, R02 acceptance evidence and a passing R00. No checklist result grants publication, indexing or deployment authority.

```sh
python3 scripts/release-listing-review.py draft \
  --dataset /operator/listings.json --pins /operator/frozen-pins.json > /operator/ivan-review.csv
python3 scripts/release-listing-review.py check \
  --dataset /operator/listings.json --pins /operator/frozen-pins.json \
  --review /operator/ivan-review.csv --receipts /operator/redacted-receipts > /operator/r02-checklist.json
```

Use separate input and output paths. The commands read local files and write to standard output. A draft always starts pending. Check exits **2** for a blocked checklist, **1** for invalid input, or **0** when the input is structurally complete and awaits independent verification. The checklist always has null `humanAttestation` and `gateDecision`. Treat any failed command or output write as unusable.

## Freeze the candidate independently

Supply the following two JSON files. Keep the pin file under the release operator's independent custody, outside the editable review packet. The caller could replace a whole collection of locally generated hashes. The independent reviewer must verify where the pins and records came from.

**Pin file.** Each unknown input is explicitly null. `releaseSha` is the exact 40-character lowercase Git SHA. `releaseContextDigest` comes from the evaluator's `releaseContextDigest(manifest)`. `datasetDigest` hashes the exact dataset file bytes. `scope` addresses the independently frozen reconciliation record described below. Every addressed digest is `sha256:` followed by 64 lowercase hexadecimal digits.

```json
{"schemaVersion":1,"releaseSha":null,"releaseContextDigest":null,"datasetDigest":null,"scope":null}
```

**Dataset.** Freeze one public-safe observation per exact, case-sensitive reference, including withheld rows, legacy references and missing values. The example below is synthetic. Include only public-scope facts and opaque references or digests for private evidence. Omit customer identities, private coordinates, seller instructions, credentials and keys from this packet.

```json
{
  "schemaVersion": 1,
  "listings": [{
    "reference": "MS-00001",
    "sourceLocale": "bg",
    "sourceUrls": ["https://legacy.example/listing/one"],
    "sourceRevision": null,
    "facts": {"price": null, "area": null, "bedrooms": null, "location": null},
    "availability": null,
    "mediaDigest": null,
    "sourceAsIs": "unrecorded",
    "translations": {"ru": {"revision": null, "indexable": null}},
    "warnings": [{
      "family": "structured_data.missing_area", "url": "/bg/imoti/MS-00001", "locale": "bg", "occurrence": 1
    }]
  }]
}
```

- Keep the exact price/currency/period, area/unit/basis, bedroom count and location representation. The command round-trips JSON decimal values without floating-point conversion. Unknowns may be null, empty, tagged `state` or `kind` (`unknown`, `not_supplied`, `withheld`, `conflicting`), or explicitly `recorded:false`. Preserve source evidence when changing a fact's representation.
- Use a distinct source revision for the reviewed content and a digest of the exact ordered media selection. Record `sourceAsIs` as `observed` only for a recorded source-as-is authorization, otherwise `unrecorded`. This frozen field is separate from every current decision.
- For a current availability observation, include `{"state":"available","revision":"<exact source revision>"}` or the verified domain state `negotiating`, `reserved_with_recorded_basis`, `sold` or `let`. Additional redacted observation fields are allowed. Unresolved, withdrawn or unbound availability blocks the publication checklist. Historical archive state alone cannot establish a sale.
- Include each candidate non-source locale, including explicit noindex decisions. Use the translation's own revision and the candidate's intended `indexable` boolean. Null preserves an unknown intention. The source revision and translation revision are distinct bindings. The independent scope record fixes the candidate locale set.
- Include every warning occurrence from the frozen source reports. Family names are `structured_data.missing_area`, `structured_data.missing_bedrooms`, `structured_data.missing_public_images`, `listing_quality.missing_area` and `listing_quality.thin_public_gallery`. Retain the source URL or root-relative target path and locale. Number repeated identical family/URL/locale tuples from 1 within each reference. Count families from these instances, including multiple locales or URLs for one reference. Source URLs are absolute HTTPS URLs. Both URL forms exclude credentials, queries and fragments.
- The historical baseline has 165 listing-quality missing-area rows, 17 thin galleries and 11/9/7 structured-data occurrences for area/bedrooms/images. The WordPress source proposal contains 150 captured listing identities. The 816 captured pages include other page types and unresolved references. Reconcile the prospective release against the complete frozen inventory and current delta. Historical counts alone cannot determine the release scope.

## Complete Ivan's CSV

The draft fills the candidate identity, reference, row digest, source URLs and revision, public facts, observed availability, media selection and source-as-is observation. Leave these columns byte-for-byte as generated after CSV decoding. Start another freeze after a material change. CSV supports UTF-8, an optional BOM, quoted commas/quotes/newlines, CRLF and reordered header columns. Every required header appears once. Duplicate, missing and unexpected listing rows block the review.

| CSV field | Recorded human choice |
| --- | --- |
| `review_origin`, `broker_owner` | `current_ivan` and `Ivan` only after the actual review. A draft has `pending` and an empty owner. |
| `broker_decision`, `publication_decision` | Broker chooses `approve`, `hold`, `reject` or `pending`. Publication chooses `publish`, `withhold`, `withdraw`, `hold` or `pending`. An explicit hold/withdrawal is preserved and blocks clearance. |
| `source_decision`, `availability_decision`, `seller_authority`, `media_rights` | `verified`, `unknown`, `hold`, `denied` or `pending` for each separate decision. Checking a field leaves its supporting evidence and authorship open to independent verification. |
| `fact_decisions` | JSON object with separate price, area, bedrooms and location decisions. Use `verified` for a recorded value, `retain_unknown` for an explicit unknown, or `hold`/`pending`. An unknown remains unknown in the frozen row. |
| `warning_decisions` | Keep each source instance and add its own `decision`. Choose `retain_unknown`, `accepted_limitation`, `corrected`, `hold` or `pending`. A claimed corrected area/bedroom must have a recorded fact reviewed as verified. Inspect the underlying evidence for every disposition. |
| `translation_decisions` | Preserve each locale's `revision` and `indexable`. Explicit `noindex` uses null `receiptDigest`. Proposed indexing requires `approve_indexing` and a separate exact-revision translation receipt. `hold` and `pending` block. |
| `review_receipt_digest` | Digest of Ivan's retained review record. The command displays the exact expected `decisionDigest` for each row even while its record is missing. A batch review record can cover multiple listings. |

## Retained redacted records

Put each JSON record at `<receipts>/<64 hex>.json`. Its filename is the SHA-256 of its exact bytes. Every mention of **context** below means the three fields `releaseSha`, `releaseContextDigest` and `datasetDigest` with the independently frozen values. Missing files, mismatched bytes or stale bindings block the relevant check.

1. **Independent scope.** The file addressed by `pins.scope` has `kind:"r02.scope.v1"`, context, `expectedReferences` (exact unique listing IDs), `candidateLocales`, `warningCounts` (all five exact family keys, including zeros), `unresolvedCount`, `sourceInventoryDigest` and `deltaEvidenceDigest`. Scope and delta must be complete before this record is supplied.
2. **Source inventory and reconciliation.** The inventory has `kind:"r02.source-identities.v1"` and an `identities` array from independently retained baseline/current inventories, including source-only identities, new listings and candidates requiring disposition. Use stable, case-sensitive opaque tokens such as `makler-realty.com:123`. The delta has `kind:"r02.identity-reconciliation.v1"`, context, the same `sourceInventoryDigest`, `openItems:[]` and a `dispositions` object keyed by every inventory identity. Each entry is exactly `{"reference":"MS-00001"}` or `{"exclusionDigest":"sha256:…"}`. Every frozen reference needs a mapped identity. An exclusion addresses a record with exactly `kind:"r02.scope-exclusion.v1"`, context, `identity` and `decision:"exclude"`. Retain the source/reason and owner authority for exclusions for independent inspection. Leave `scope:null` when the authoritative census or delta is unavailable.
3. **Human review.** Ivan's record has `kind:"r02.human-review.v1"`, context, `reviewer:"Ivan"` and `decisions:{"MS-00001":{"decisionDigest":"sha256:…","basisDigest":"sha256:…"}}`. Obtain the actual human record through an authenticated channel. Its basis record has `kind:"r02.listing-basis.v1"`, the exact `reference` and `rowDigest`, and four redacted evidence pointers named `factSourceDigest`, `availabilityDigest`, `sellerInstructionDigest` and `mediaRightsDigest`. The pointers identify the underlying evidence for independent inspection. The command checks pointer syntax and the received basis document's bytes and binding.
4. **Locale approval.** A distinct translation receipt contains exactly `kind:"r02.translation-review.v1"`, context, `reviewer:"Ivan"`, `reference`, `sourceRevision`, `locale`, its translated `revision` and `decision:"approve_indexing"`. Changing either revision invalidates approval for the proposed candidate.

Ivan can review the observed data and choices, run the blocked check to obtain the row and decision digests, record his decision through the accountable channel, then insert the received receipt digest and rerun. The digest excludes its own receipt address. The independent reviewer checks the original evidence, authenticity and timing of Ivan's decisions, authority for every scope exclusion, warning dispositions, exact manifests and R02's other acceptance evidence. A structurally complete checklist still awaits this review and the release policy's trusted signature.

Run the focused command tests with `python3 scripts/release-listing-review.test.py -v`. They exercise synthetic records only.
