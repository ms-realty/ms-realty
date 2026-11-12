# ADR 0016 — Photos from the old website are carried over, and images are admitted by re-encode

Status: accepted by the product owner for implementation. Changes how this brand admits images;
the scanner-first rule stays available to another brand through the tenant profile.

## Context

The agency's 165 listings were imported from its old public website (`npm run import:legacy`).
The import recorded about 1,725 legacy media objects (1,659 created as media assets, 53 left for
review because they are shared between properties, 13 blocked because no listing shows them),
each with only its legacy R2 key, gallery position and caption. None was ever stored, scanned or
turned into renditions in the new system, so a listing published with the one-decision flow
(ADR 0012) went live without a single photo. A property site without photos is useless to a
buyer.

The photos are already public on the agency's current site, and the publish attestation states
"we may use these photos". Reviewing 1,700 files one by one would bring back the gate ADR 0012
removed.

## Decision

1. **A one-time carry-over job, not a review queue.** `npm run media:carry-over` (code in
   `src/server/media/carry-over.ts`) reads each imported photo's original from the legacy media
   source by its `original_key`, decodes it, stores the original under `sealed/<asset>/<sha256>`
   and fresh WebP renditions under `derivatives/<asset>/<sha256>.webp` in the system's own
   storage, and records the photo as processed with the basis "carried over from the agency's
   public site" (audit action `media.carried_over`). The gallery order, cover (the first photo)
   and captions stay exactly as imported. Rights and review stay with the person who publishes:
   the attestation clears processed photos as it does for uploads.
2. **Images may be admitted by decode and re-encode.** The tenant profile carries
   `mediaPolicy.imageAdmission`: `"reencode"` for this brand, `"virus_scan"` (the
   `scanFirstMediaPolicy`) for a brand that wants every file scanned. Under `reencode` an image
   is admitted by decoding it fully and writing new renditions; nothing but pixels survives, and
   the original is never served. Documents, PDFs and anything that is not a decodable raster image
   keep the scanner rule under either policy. The same rule applies to new uploads: under
   `reencode` the file worker admits an uploaded image without a scanner.
3. **A photo that cannot be used is left out and reported.** Missing at the source, larger than
   the 25 MB image limit, not an image, or not decodable: the job marks it `processing = failed`
   (audit `media.carry_over.skipped` with the reason), lists it in its report and moves on. It
   never blocks its listing.

## How it is recorded

- `media_assets.admission` (`virus_scan` | `reencode`, migration `0041_media_admission`) names the
  check whose outcome `scan` and the scan evidence columns record for the exact sealed digest. A
  re-encode writes `scan = clean`, `scanned_sha256 = sha256` and a `scanner_version` of the form
  `reencode sharp/<version> libvips/<version>`.
- `admissionAccepted` (`src/domain/media.ts`) is the single rule: a scanner result always counts;
  a re-encode counts only for a raster image while the brand's policy is `reencode`. Public
  eligibility (`mediaAssetEligible`), the publish readiness of a photo and the photo review all use
  it, so a brand that moves to scanner-first stops serving re-encoded media at once and the worker
  scans those files again.
- `FileServices.mediaPolicy` is set by `fileServices()` from the tenant profile. Services built by
  hand without it scan first, so no caller skips a scan by omission.

## The job

- Source: `LEGACY_MEDIA_SOURCE=directory` with `LEGACY_MEDIA_DIR` (a local mirror laid out like
  the bucket), or `LEGACY_MEDIA_SOURCE=r2` with `LEGACY_MEDIA_BUCKET` (default `ms-realty-media`,
  the manifest's bucket), `LEGACY_MEDIA_R2_JURISDICTION` (default `default`) and credentials from
  `LEGACY_MEDIA_R2_*`, falling back to `R2_*`. Both sources only read; the job refuses to treat the
  application's own bucket as the legacy one. Keys outside `<legacy host>/wp-content/uploads/` are
  never read.
- Options: `--listing MS-…`, `--limit N`, `--dry-run`, `--concurrency N` (default 4),
  `--report <file.json>`. Each photo commits in its own transaction; keys derive from the asset
  and digest, so a stopped run resumes and a finished photo is skipped. Memory is bounded by the
  photos in flight (one original and its renditions each) with sharp's cache off.
- Under `virus_scan` the job stores and seals the original and leaves it for the scanner; nothing
  is admitted without a scan.
- The report gives counts by outcome, bytes read and written, the left-out keys with their
  listings, the listings with at least one usable photo and the references of those with none.
- It runs as a CLI, not as a pg-boss job: it is one-time work, bounded by `--limit` and resumable,
  and a queue job would add a job type, permissions and an operations listing for a single run.

## Publishing

- "Checked for you" warns `photos_not_copied` while a listing still has photos the job has not
  copied, besides the existing `no_photos` warning. The Publish screen says so in plain words and
  offers one button, "Copy photos from the old website", which runs the same job for that listing
  as the staff member (it needs `media.manage` and a configured legacy source; otherwise the screen
  says who to ask).
- Photos copied after a listing went live make the Publish screen offer the decision again, so
  they reach the public site with the next publish.
- The Photos tab treats carried-over photos like any other (reorder, cover, hide) and notes where
  they came from; a left-out photo says it could not be copied and asks to hide it.

## Consequences

- The agency can publish its carried-over inventory with its photos in one sitting.
- The 53 photos the import left for review (shown on more than one property) and the 13 blocked
  objects have no media asset, so the job does not see them; they stay with the import review.
- The original legacy bytes are kept privately, so the renditions can be regenerated.
- Out of scope: video and floor-plan tooling, watermarking, AI captions, document scanning,
  deploying a ClamAV service.
