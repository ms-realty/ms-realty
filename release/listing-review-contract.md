# R02 listing review inputs

Ivan can use this local Python 3.10+ command to prepare one CSV and inspect its coverage. Its JSON output is an unsigned checklist for the independent reviewer. The release evaluator separately requires a trusted, signed human `listing_review_report`, R02 acceptance evidence and a passing R00. No checklist result grants publication, indexing or deployment authority.

```sh
python3 scripts/release-listing-review.py draft \
  --dataset /operator/listings.json --pins /operator/frozen-pins.json > /operator/ivan-review.csv
python3 scripts/release-listing-review.py check \
  --dataset /operator/listings.json --pins /operator/frozen-pins.json \
  --review /operator/ivan-review.csv --receipts /operator/redacted-receipts > /operator/r02-checklist.json
```

Use separate input and output paths. The commands read local files and write to standard output. A draft always starts pending. A v2 checklist reports inventory review completeness separately from proposed publication and reviewed non-public rows. Check exits **2** for a blocked checklist, **1** for invalid input, or **0** when the input is structurally complete and awaits independent verification. The checklist always has null `humanAttestation` and `gateDecision`. A valid checklist also records null `publicationAuthority`. Treat any failed command or output write as unusable.

## Freeze the candidate independently

Supply the following two JSON files. Keep the pin file under the release operator's independent custody, outside the editable review packet. The caller could replace a whole collection of locally generated hashes. The independent reviewer must verify where the pins and records came from.

**Pin file.** Each unknown input is explicitly null. `releaseSha` is the exact 40-character lowercase Git SHA. `releaseContextDigest` comes from the evaluator's `releaseContextDigest(manifest)`. `datasetDigest` hashes the exact dataset file bytes. `scope` addresses the independently frozen reconciliation record described below. Every addressed digest is `sha256:` followed by 64 lowercase hexadecimal digits.

```json
{"schemaVersion":1,"releaseSha":null,"releaseContextDigest":null,"datasetDigest":null,"scope":null}
```

**Dataset v2.** Freeze one row per exact, case-sensitive reference, including withheld rows, legacy references and missing values. Preserve the original redacted public observations separately from the candidate facts. The row digest and CSV bind both. Changing a fact or its state requires a fresh freeze. The earlier v1 dataset requires explicit conversion and new pins. The example below is synthetic. Include only public-scope facts and opaque references or digests for private evidence. Omit customer identities, private coordinates, seller instructions, credentials and keys from this packet.

```json
{
  "schemaVersion": 2,
  "listings": [{
    "reference": "MS-00001",
    "sourceLocale": "bg",
    "sourceUrls": ["https://legacy.example/listing/one"],
    "sourceRevision": null,
    "observations": {"price": null, "area": {"unit":"sqm","recordedOnListing":[],"recordedOnProperty":[]}, "bedrooms": null, "location": null},
    "facts": {
      "price": {"state":"unknown","value":null}, "area": {"state":"unknown","value":null},
      "bedrooms": {"state":"unknown","value":null}, "location": {"state":"unknown","value":null}
    },
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

- Retain the exact public-safe source values under `observations`. Historical amounts, missing units, empty recorded-area arrays and placeholder flags retain their original content. The command preserves JSON decimal precision. Each candidate fact has exactly `state` and `value`. States `unknown`, `not_supplied`, `not_applicable`, `withheld` and `conflicting` require a null value. A retained current facts record must bind all four typed values and states before the review counts.
- For `known` price supply `{amountMinor,currency,period,basis}`, with nonnegative safe integer minor units, a supported currency (EUR/BGN/USD/GBP), period `total` or `month`, and basis `asking`, `negotiable`, `fixed` or `indicative`. Known area is `{value,unit:"m2",basis}` with positive numeric value and basis `living`, `usable`, `built`, `gross_floor`, `total` or `land`. Bedrooms are a nonnegative safe integer. Known location is `{publicLabel,publicPrecision}`, with a nonempty approved public label and precision `exact`, `street`, `neighborhood`, `settlement` or `region`. Only current evidence can support any conversion or resolution.
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
| `broker_decision`, `publication_decision` | Broker chooses `approve`, `hold`, `reject` or `pending`. Publication chooses `publish`, `withhold`, `withdraw`, `hold` or `pending`. A hold blocks completeness. A final withhold/withdraw needs the independently frozen negative projection evidence below. |
| `source_decision`, `availability_decision`, `seller_authority`, `media_rights` | `verified`, `unknown`, `hold`, `denied` or `pending` for each separate decision. An explicit final non-public decision may record a reviewed unknown or denial. Pending and hold still block. |
| `fact_decisions` | JSON object with separate price, area, bedrooms and location decisions. Match each frozen state to `verified`, `retain_unknown`, `retain_not_supplied`, `accept_not_applicable`, `retain_withheld` or `retain_conflicting`. Proposed publication requires known location and either known price or explicitly withheld price (price on request). A conflict blocks proposed publication. Reviewed non-public rows may retain unknown price and location. `hold` and `pending` block inventory completeness. |
| `warning_decisions` | Preserve each occurrence and one choice from `retain_unknown`, `not_applicable`, `accepted_limitation`, `corrected`, `non_public`, `hold` or `pending`. A corrected occurrence requires a bound `correctionDigest`. Other dispositions use null. A non-public disposition requires verified absence across every projection. |
| `translation_decisions` | Preserve each locale's `revision` and `indexable`. Explicit `noindex` uses null `receiptDigest`. Proposed indexing requires `approve_indexing` and a separate exact-revision translation receipt. `hold` and `pending` block. |
| `review_receipt_digest` | Digest of Ivan's retained review record. The command displays the exact expected `decisionDigest` for each row even while its record is missing. A batch review record can cover multiple listings. |

## Retained redacted records

Put each JSON record at `<receipts>/<64 hex>.json`. Its filename is the SHA-256 of its exact bytes. Every mention of **context** below means the three fields `releaseSha`, `releaseContextDigest` and `datasetDigest` with the independently frozen values. Missing files, mismatched bytes or stale bindings block the relevant check.

1. **Independent scope.** The file addressed by `pins.scope` has `kind:"r02.scope.v1"`, context, `expectedReferences` (exact unique listing IDs), `candidateLocales`, `warningCounts` (all five exact family keys, including zeros), `unresolvedCount`, `sourceInventoryDigest` and `deltaEvidenceDigest`. Scope and delta must be complete before this record is supplied.
2. **Source inventory and reconciliation.** The inventory has `kind:"r02.source-identities.v1"` and an `identities` array from independently retained baseline/current inventories, including source-only identities, new listings and candidates requiring disposition. Use stable, case-sensitive opaque tokens such as `makler-realty.com:123`. The delta has `kind:"r02.identity-reconciliation.v1"`, context, the same `sourceInventoryDigest`, `openItems:[]` and a `dispositions` object keyed by every inventory identity. Each entry is exactly `{"reference":"MS-00001"}` or `{"exclusionDigest":"sha256:…"}`. Every frozen reference needs a mapped identity. An exclusion addresses a record with exactly `kind:"r02.scope-exclusion.v1"`, context, `identity` and `decision:"exclude"`. Retain the source/reason and owner authority for exclusions for independent inspection. Leave `scope:null` when the authoritative census or delta is unavailable.
3. **Human review.** Ivan's record has `kind:"r02.human-review.v1"`, context, `reviewer:"Ivan"` and `decisions:{"MS-00001":{"decisionDigest":"sha256:…","basisDigest":"sha256:…"}}`. Obtain the actual human record through an authenticated channel. Its basis record has `kind:"r02.listing-basis.v1"`, the exact `reference` and `rowDigest`, and four evidence fields named `factSourceDigest`, `availabilityDigest`, `sellerInstructionDigest` and `mediaRightsDigest`. `factSourceDigest` addresses a retained `r02.current-facts.v1` record with context, `reference`, `rowDigest`, `sourceRevision` and the exact four typed `facts` from the current source review. Independently inspect the underlying evidence and provenance. For an explicitly reviewed unknown on a non-public outcome, its availability, seller-instruction or media-rights pointer may be null. A verified or denied decision requires a digest for that field.
4. **Locale approval.** A distinct translation receipt contains exactly `kind:"r02.translation-review.v1"`, context, `reviewer:"Ivan"`, `reference`, `sourceRevision`, `locale`, its translated `revision` and `decision:"approve_indexing"`. Changing either revision invalidates approval for the proposed candidate.

5. **Warning correction.** Each `correctionDigest` addresses `kind:"r02.warning-correction.v1"`, context, `reference`, `rowDigest`, `sourceRevision` and `warning` equal to that single frozen family/URL/locale/occurrence object. For missing area/bedrooms also include the reviewed `factSourceDigest` and require a verified known typed value. For images include `mediaDigest`, the observed `publicAssets` and `surface:"jsonld_images"` or `"public_gallery"`. The source media digest must address an actual `r02.media-selection.v1` record binding `reference`, `sourceRevision` and the eligible ordered `publicAssets`. Each asset contains exactly `digest` and public HTTPS `url`. Every observed pair must exist in that selection. The structured-data warning requires one image and the thin-gallery warning requires three distinct assets and URLs. An unbound media digest or repeated image cannot close either condition.
6. **Non-public outcome.** A final withhold/withdraw can complete inventory review while preventing proposed publication. Retain every row, fact state, warning and locale decision, return explicit noindex for each translation, and record Ivan's final broker decision. The independently frozen scope record must contain `projectionInventoryDigest`, addressing `kind:"r02.projections.v1"`, context, the exact `expectedReferences` and a `surfaces` object. Provide a capture for each of `web`, `public_api`, `structured_data`, `sitemap`, `hreflang`, `search`, `comparison`, `alerts`, `feeds`, `public_media` and `indexable`. Each surface maps all seven supported locales plus `global` to capture digests. Each capture contains `kind:"r02.projection-members.v1"`, context, `surface`, `locale`, `openItems:[]` and the actual complete `references` visible on that projection. Check locale-independent routes, direct media and unscoped endpoints under `global`. Any matching member, unresolved item, incomplete capture or stale scope blocks the non-public outcome. The independent reviewer verifies actual capture coverage and the source of each observation.

Ivan can review the observed data and choices, run the blocked check to obtain the row and decision digests, record his decision through the accountable channel, then insert the received receipt digest and rerun. The digest excludes its own receipt address. The independent reviewer checks the original evidence, authenticity and timing of Ivan's decisions, authority for every scope exclusion, warning dispositions, exact manifests and R02's other acceptance evidence. A structurally complete checklist still awaits this review and the release policy's trusted signature.

Run the focused command tests with `python3 scripts/release-listing-review.test.py -v`. They exercise synthetic records only.
