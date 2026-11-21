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

|                             | this agency                              | strict (`strictPublicationPolicy`)            |
| --------------------------- | ---------------------------------------- | --------------------------------------------- |
| `sellerEvidence`            | `staff_attestation`                      | `reviewed_documents`                          |
| `independentReview`         | `false`                                  | `true` (the author may not publish)           |
| `photosRequired`            | `false` (only cleared photos are shown)  | `true` (every placed photo cleared)           |
| `signIn`                    | `active_session` (publish and unpublish) | `recent` (the 5-minute step-up)               |
| `attestationOutlivesAuthor` | `true`                                   | `false` (lapses with the author's membership) |

What stays a person's, under either policy:

- The decision. Butler and system actors are refused; the attestation text (in the language it was
  shown), the actor, the time and an optional note are recorded in the audit trail, and every
  approval the command records cites the attestation.
- Translations. A non-source locale goes public only when a person approved that translation for
  the exact version; the command publishes those and leaves every other translation off the site.
- Legal, tax and process claims. Copy that declares regulated claims still needs its own
  professional review; the attestation never covers it.
- Property facts are preserved exactly: price, area, bedrooms, location, reference and source URL
  are copied, never recomputed. Publishing keeps the location precision the listing already has,
  including region-level imports, also when a saved draft is published.
- A rent the legacy import recorded without its period is never guessed: the Publish screen shows
  the amount with a "Rent period" field ("per month" preselected), and the person's confirmation
  is recorded with the same decision. The amount is kept exactly.
- Two listings of one property (a sale and a rental, or two adverts) share its reviewed facts: the
  second binds the fact revision the first already had reviewed instead of creating a competing
  one that would take the first off the site.

"Checked for you" (`src/domain/publish-checks.ts`) is a pure function. Blockers: no Bulgarian
title or description; a price neither stated nor deliberately withheld; no location; a listing
that is sold, let or withdrawn; a rent without its confirmed period (fixed in place). Warnings: no photos, photos not processed yet, a very short
description, unknown bedrooms for a dwelling, copy that frames inland Sandanski as a sea, beach or
coast place. No model call.

## Storage

The attestation basis lives in existing JSON: `seller_instructions.commercial_terms.basis =
"staff_attestation"` with the attestation operation id and text. The seller-consent predicate
accepts that basis while the tenant policy allows it; the command only records it for an active
staff member, and under `attestationOutlivesAuthor` it keeps counting after that person leaves.
The reviewed-documents basis stays valid. One migration (`0040_seller_attestation_evidence`) relaxes the `seller_instructions_agreed_evidence` CHECK so an
agreed instruction may name the attestation instead of document ids. Uploading documents remains
possible and becomes supporting evidence, not a gate.

## Consequences

- The agency can carry its active imported listings over in one sitting ("Ready to publish" in
  the inventory) and publish a new listing in one screen. The detailed review stays reachable as a
  secondary entry for anyone who wants each check separately.
- A listing does not drop off the site when the broker who published it leaves. A brand that
  wants the fail-closed rule sets `attestationOutlivesAuthor: false`.
- Publishing and unpublishing need an active staff session for this brand; every other sensitive
  action keeps its own step-up rule.
- Under `photosRequired: false` a photo whose details are being edited, or that is not processed
  yet, is left out of a new publication instead of blocking it.
- The strict policy is tested alongside the agency's (`attested-strict.int.test.ts`).

## Round 4 amendments

- The attestation stores what the person saw (latest version digest, saved-draft digest, location
  precision, publication generation). Every call, including a replay or a resume, compares the
  listing with it: a changed saved text, a version someone else wrote, or an unpublish since stops
  with "This listing changed since you opened it."
- A recorded refusal (the latest agreed seller instruction without publication permission) is a
  blocker; only a new recorded agreement lifts it. Expired or missing documents stay attestable.
  Sea, beach or coast wording for Sandanski is a blocker for the source text and every language.
- A photo with pending details is left out. Publishing never widens the location precision.
  Languages still showing an older version go offline until approved again.
- Every permission a later step needs is checked before a live version goes offline; a sibling
  live on the same facts blocks before this listing is touched; a later stop says the previous
  version is offline.
- "Ready to publish" reads one page of candidates per request (cursor, search by pasted
  references or title); the Today count is capped and worded "N or more".
- Under `publisherApprovesLanguages` (this agency) whoever may publish approves a ticked language;
  the strict policy needs the translation-reviewer role.
- Import: the live record carries the agency's lot number. An active crawl twin of an archived lot
  listing takes the lot reference and the archived record takes the crawl-era one (URL decisions
  and photos follow their record); an active twin of an active lot listing is attached as an
  archived duplicate.
