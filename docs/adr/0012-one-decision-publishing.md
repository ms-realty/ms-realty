# ADR 0012 — One recorded decision publishes a listing

Status: accepted by the product owner for implementation. Changes the agency's publication path;
the strict path stays available to another brand through the tenant policy.

## Context

The agency is two or three people. It already advertises its listings on its old public site. On
the real imported data (165 listings) the rebuilt site showed no properties at all and the staff
Today page listed every listing as "Facts needed".

Publishing one listing needed six separate approvals, each with its own form, reason field and
checkbox: facts reviewed, photo rights, language approved, the exact version reviewed, the
seller's instructions current, professional claims reviewed. On top of that the seller-consent
predicate (`currentSellerEvidence`) required two uploaded, virus-scanned, sealed and reviewed
documents with matching digests plus a reviewed seller relationship before a listing could even
appear in public search. Imported photos were never sealed or scanned, so every listing with
photos was blocked as well. As built, the agency could not go live.

## Decision

A listing is published by one recorded human decision. The person with publishing rights sees
what the public will see and what the system checked, ticks one attestation and presses Publish:

> I checked this listing. The facts are right, the owner asked us to advertise it on these terms,
> we may use these photos, and it is available.

Underneath, `publishListingByAttestation` (`src/server/publication/attested.ts`) takes, as that
person, every step the detailed review takes, through the existing commands: freeze a saved draft,
confirm imported facts (a new fact revision with the same values and that person's review),
confirm availability, approve the fact revision, submit and approve the listing version, record a
seller instruction on the attestation basis, clear processed photos, prepare and activate the
publication. It is resumable and idempotent: a step that already holds is skipped. The public read
path is unchanged.

The tenant profile carries the policy (`src/config/tenant.ts`):

|                     | this agency                             | strict (`strictPublicationPolicy`)  |
| ------------------- | --------------------------------------- | ----------------------------------- |
| `sellerEvidence`    | `staff_attestation`                     | `reviewed_documents`                |
| `independentReview` | `false`                                 | `true` (the author may not publish) |
| `photosRequired`    | `false` (only cleared photos are shown) | `true` (every placed photo cleared) |

What stays a person's, under either policy:

- The decision. Butler and system actors are refused; the attestation text (in the language it was
  shown), the actor, the time and an optional note are recorded in the audit trail, and every
  approval the command records cites the attestation.
- Translations. A non-source locale goes public only when a person approved that translation for
  the exact version; the command publishes those and leaves every other translation off the site.
- Legal, tax and process claims. Copy that declares regulated claims still needs its own
  professional review; the attestation never covers it.
- Property facts are preserved exactly: price, area, bedrooms, location, reference and source URL
  are copied, never recomputed.

"Checked for you" (`src/domain/publish-checks.ts`) is a pure function. Blockers: no Bulgarian
title or description; a price neither stated nor deliberately withheld; no location; a listing
that is sold, let or withdrawn. Warnings: no photos, photos not processed yet, a very short
description, unknown bedrooms for a dwelling, copy that frames inland Sandanski as a sea, beach or
coast place. No model call.

## Storage

The attestation basis lives in existing JSON: `seller_instructions.commercial_terms.basis =
"staff_attestation"` with the attestation operation id and text. The seller-consent predicate
accepts that basis while the tenant policy allows it and while its author is an active staff
member; the reviewed-documents basis stays valid. One migration
(`0039_seller_attestation_evidence`) relaxes the `seller_instructions_agreed_evidence` CHECK so an
agreed instruction may name the attestation instead of document ids. Uploading documents remains
possible and becomes supporting evidence, not a gate.

## Consequences

- The agency can carry its active imported listings over in one sitting ("Ready to publish" in
  the inventory) and publish a new listing in one screen. The detailed review stays reachable as a
  secondary entry for anyone who wants each check separately.
- An attested seller instruction stops counting when its author leaves the agency (the same
  fail-closed rule as a revoked authority): their listings drop from the public site until a
  colleague publishes them again.
- Under `photosRequired: false` a photo whose details are being edited, or that is not processed
  yet, is left out of a new publication instead of blocking it.
- The strict policy is tested alongside the agency's (`attested-strict.int.test.ts`).
