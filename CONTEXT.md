# MS Realty

A human-led real-estate agency service in Bulgaria and Greece: people discover properties, ask
and request viewings, and the agency works each request through to a recorded outcome. Product
authority is `docs/architecture.md`; this file fixes the words used for its records and the
distinctions it insists on. Where the two disagree, the architecture's meaning wins.

## Property and offer

**Property**:
A physical asset or identifiable unit. It exists without any public listing; its exact address and point stay private, and its public location precision is a separate approved choice.
_Avoid_: listing (for the physical thing), object, estate

**Property fact revision**:
One immutable, numbered set of a property's typed facts with their sources, review decisions and unknown or conflicting states. A correction is a new revision; the property points at the revision a reviewer approved.
_Avoid_: facts (unversioned), property record

**Fact**:
One attribute with its state (known, unknown, not supplied, not applicable, withheld or conflicting), unit or basis, source, source language, observation time and review scope. `false` is a known value, never a stand-in for unknown; a conflict keeps its candidates as evidence, not as the value.
_Avoid_: field, attribute, data point

**Source class**:
Where a fact's value comes from: source supplied, owner confirmed, agency observed, document reviewed, professionally reviewed, system calculated or legacy import.
_Avoid_: verified (without saying by whom and how)

**Material change**:
A change that alters or retracts a known fact or records a credible dispute, so a presentation built on the old facts may now be inaccurate. Filling in an unknown value is not material.
_Avoid_: correction (for any edit), update

**Area basis**:
Which surface an area value measures: living, usable, built, gross floor, total or land. Values on different bases are never compared or substituted.
_Avoid_: size, square meters (unqualified)

**Rooms / Bedrooms**:
Two separate facts. A room count never implies a bedroom count.

**Location precision**:
How exactly a property's place may be shown publicly: exact, street, neighborhood, settlement or region. A geocoded point is not permission to disclose an address.

**Listing**:
The commercial offer for one property with one purpose: sale or long-term rent. Sale and letting of the same property are separate listings. It carries the stable reference, commercial availability, the editorial draft and the publication generation.
_Avoid_: property (for the offer), ad, lot

**Listing reference**:
The stable human reference of a listing, such as `MS-00100`. Legacy lot numbers are kept as listing references; titles and slugs may change, references do not.
_Avoid_: lot id, slug, code

**Purpose**:
What a listing offers: sale or long-term rent. It fixes the only valid price period (total for sale, per month for rent). Short stays are not a listing purpose.
_Avoid_: transaction type, deal type

**Money**:
An amount in integer minor units with its currency, period, basis and named inclusions. Euro is the default presentation for new prices; a historical amount keeps its original currency and is converted only for presentation.
_Avoid_: price (without currency and period)

**Listing revision**:
An immutable review candidate of a listing: the fact revision it binds, commercial terms, Bulgarian copy, the ordered media manifest and disclosure instructions. Editing creates a new revision; approvals point at one by its digest.
_Avoid_: version (for a published bundle), draft

**Commercial availability**:
Whether the offer can be taken up: available, confirmation required, negotiating, reserved on a recorded basis, sold, let or withdrawn. Independent of publication.
_Avoid_: status (unqualified), active

**Freshness**:
Whether a listing's availability confirmation is current under policy, due for review, conflicting or unknown. A timer creates review work; it never confirms availability. Default review intervals are 14 days for sale and 7 for long-term rent.
_Avoid_: evidence freshness, stale (unqualified)

**Seller instruction**:
The seller's or landlord's recorded instruction at a defined revision: commercial terms, privacy and location disclosure, media usage rights, representation scope, exclusivity, commission terms and publication permission. It is evidence of the brokerage agreement, not a substitute for staff publishing authority or title review.
_Avoid_: mandate (unrecorded), listing agreement (for the whole record)

**Media asset**:
Stored bytes with purpose, sealed digest, scan and processing state, rights, audience, review and modification disclosure. Nothing about an asset alone makes it publishable.

**Media relation**:
The placement of a media asset in a listing's gallery, with a stable identity and position. One asset may be placed more than once; hidden relations keep their place.
_Avoid_: gallery index, photo order (as a number on the asset)

**Document**:
A file with purpose, classification, explicit audience and versions. Uploading, sealing, malware scanning, human review and professional validation are separate states.
_Avoid_: verified document (without the review type)

## Publication and language

**Source locale**:
Bulgarian (`bg`), the editorial source of public content. Original evidence keeps its original language.

**Localized revision**:
One locale's copy bound to exactly one source listing revision: missing, draft, reviewing, approved for source, stale or rejected. Approval of language is not factual, legal or publishing approval, and covers only the source it was reviewed against.
_Avoid_: translation (as an unbound text), approved (without the source)

**Indexable locale**:
A public locale that search engines may index, allowed only after a recorded human approval.

**Publication manifest**:
An immutable binding of everything one public presentation shows — listing, fact and localized revisions, media, disclosure, availability basis, policy revision, decisions and digests — for one locale and one destination.
_Avoid_: release, snapshot, package

**Current publication**:
The one authoritative pointer per listing, locale and destination to the manifest that is active, restricted or withdrawn. Publishing, restricting and withdrawing switch it; old manifests stay history, never a second public path.
_Avoid_: published version (as a column), live flag

**Publication generation**:
A listing's counter that every restriction, withdrawal and material correction increments. Queued publication work carries the generation it was created under and is cancelled when the generation moved on, so a delayed job never resurrects older content.

**Destination delivery**:
The outcome of one publish or withdrawal at one destination: queued, attempting, acknowledged, verified, failed, outcome unknown, withdrawing or withdrawn. The website is one destination; manual portals are others.
_Avoid_: sync, distributed (for a queued job)

**Public presentation**:
What visitors see, derived from the current publication, commercial availability and freshness together. Published never implies available; restricted and withdrawn listings keep a truthful unavailable surface.

**Public share**:
An unguessable, revocable link to public listing references only. It carries no participant, note, budget or case, and possessing it grants no private access.
_Avoid_: shared shortlist (for a Case's Interests)

**Content page**:
An area, guide, service, team or help page with versions and the same approval and localization rules as listings.

## People and access

**Party**:
A person or organization with contact methods, language and contact preferences, and matching aliases. Being a party is not a sign-in permission.
_Avoid_: user, customer, lead, contact (for the party)

**Contact method**:
One channel address of a party (email, phone, messenger). Verification proves control of the channel, not identity, ownership or authority.

**Principal**:
An authenticated identity in exactly one context, staff or client, keyed by an immutable issuer and subject. The same person may hold a staff and a client principal; a client identity never opens the staff interface. An email address is a sign-in address, not an identity or a role.
_Avoid_: account, user

**Staff membership**:
The active staff role of a staff principal. Without an active membership a staff principal holds nothing.

**Grant**:
A role preset or single capability given to a principal or service, optionally narrowed to one record, locale or expiry.
_Avoid_: permission (for the role), access level

**Capability**:
A named permission over records, such as `translation.review` for one locale or `publication.release`. Roles are presets of capabilities.

**Role**:
A named preset of capabilities: visitor, verified client, invited collaborator, assigned broker, coordinator, content editor, translation reviewer, publishing approver, manager, external specialist or AI service. One person may hold several.

**Case participant**:
A party's explicitly scoped, revocable role in a case: buyer, co-buyer, tenant, seller, landlord, authorized representative, adviser, collaborator, specialist or guest. Participation in a case does not open every document of it.
_Avoid_: link, association, household

**Authority**:
Whether a party may instruct the agency for a property. Self-declared and reviewed authority are different states; only reviewed authority unlocks consequential steps.

**Audience**:
Who may see a private item: internal, case participants, specialist or public. Internal notes and client messages are separate records, never two views of one body.

**Butler (AI service, formerly Hermes)**:
An actor that drafts, extracts, proposes and summarizes within a selected task. Under the owner-approved R00 mapping it is draft-only (see `AGENTS.md`): a person owns every send, booking, publication, indexability, access change, cancellation and any step with legal, tax or money effect, and no autonomous routine action is enabled without a separate accepted policy and release proof. Instructions found in content never give it authority. Every Butler step shows its source, draft, review state, a receipt and a "Do it myself" path.
_Avoid_: Hermes (retired name), bot, agent (for this actor in user-facing copy)

## Demand and work

**Inquiry**:
One inbound request received before any qualified case exists: received, assigned, awaiting client, linked to a case or resolved without one. Suspected spam, duplicate candidate and unreachable contact are review states, never silent deletion.
_Avoid_: lead, ticket, message (for the request)

**Coverage queue**:
The configured owner of new work until a named broker accepts it. Work is never unowned.

**Receipt**:
The durable confirmation shown only after the server committed a request, carrying its reference. A timeout leads to reconciliation, never to a second submission.

**Case**:
The agency's work toward one outcome with a party: buyer, tenant, seller, landlord or service intake. Its stage follows the pipeline of its kind; its disposition (active, paused, closed) is separate. Every active case has one accountable broker and a next action or a dated dependency.
_Avoid_: deal, opportunity, pipeline item

**Stage**:
Where a case stands in its pipeline. Buyers and tenants: needs agreed, evaluating, viewing, proposal preparation, proposal active, coordination, completed. Sellers and landlords: request received, scope and authority review, assessment, instructions agreed, preparing, marketing, proposal coordination, completion and handover.

**Disposition**:
Whether a case is active, paused or closed. A pause names its reason, dependency and review date; closure records an outcome and a disposition for every open commitment.

**Service intake**:
A case for a bounded short-stay or property-management consultation where the agency offers one. It records the request and its manual coordination; it never books a stay, keeps an owner ledger or dispatches repairs.
_Avoid_: reservation, booking, service request

**Brief revision**:
A case's requirements at one revision: hard constraints, preferences, unknowns and timing, each marked client-stated or broker interpretation, with the client's acknowledgment.
_Avoid_: preferences (for the whole brief), profile

**Interest**:
The one current relationship between a case and a listing: suggested, shortlisted, viewing requested, viewed, proposal, declined or unavailable, with fit explanation, questions and revisioned feedback judged against a listing revision. Losing one interest never closes the others or the case.
_Avoid_: match, score, recommendation, favorite

**Task / Commitment**:
An action with an owner, due condition, dependency and completion evidence: open, in progress, waiting, done or cancelled. A commitment promised to a client is marked as such.

**Handover**:
A transfer of responsibility that stays with the current owner until the receiving broker accepts it.

## Meetings, messages, decisions

**Appointment**:
A requested, proposed or confirmed meeting on a case or interest, with a host, a timezone and exclusive resource intervals. A reschedule keeps the confirmed arrangement until its replacement is accepted.
_Avoid_: booking (for a request), viewing slot

**Message**:
One logical communication with an explicit audience and channel: draft, approved, queued, attempting, provider accepted, delivered, bounced, failed or outcome unknown. One logical send is bound to one exact payload; its attempts are separate.
_Avoid_: sent (for provider accepted)

**Internal note**:
Staff-only case text. It is never a message and never becomes one by switching composer mode.

**Proposal revision**:
One revision of offered terms: parties, amount and currency, conditions and deadline. Any change or counteroffer is a new revision and invalidates prior approval; "agreed for next step" is not a completed sale.
_Avoid_: offer (for an expression of interest), bid

**Approval**:
A recorded human decision of one kind bound to one subject revision by its digest and scope, with evidence and optional expiry. It becomes invalid the moment the subject changes.
_Avoid_: sign-off (unbound), OK

**Subscription / Consent event**:
Purpose-specific contact eligibility (service updates, search alerts, marketing) on a verified channel under a policy and template version, and the append-only history of its opt-in, changes and withdrawal. One purpose never implies another.
_Avoid_: consent (unqualified), opted in (without purpose)

## Records of change

**Operation**:
One logical consequential command identified by its idempotency key and payload digest. Its recorded result lets retries, reloads and second tabs converge on one outcome.

**Record revision**:
The integer every mutable record carries. A change states the revision it expects; a stale one yields a conflict and a comparison, never last-write-wins.

**Outbox event**:
Durable business intent committed with the change that caused it; the queue job is only its execution.

**External action**:
One logical effect at a provider — an email send, a destination publish or withdrawal — with its own identity, source generation, payload digest, attempts and reconciliation. An unknown outcome suspends resend.

**Inbox event**:
One signed provider webhook, recorded and deduplicated before it is processed.

**Activity event / Audit event**:
A human-readable timeline entry for work, and the separate restricted, attributable technical history.

**Privacy request**:
Owned privacy work with a receipt, verification, a responsible person, a due condition, scope, legal-hold disposition and recorded completion.

**Release evidence**:
Release-bound proof: schema version, environment, release SHA and digests, policy revision, observation time, source, reviewer, assertions and redaction status. Evidence for another release or policy never clears a gate.

## Legacy and import

**Legacy URL decision**:
The recorded, evidence-based outcome for one old URL on `makler-realty.com` or `makler-realty.ru`: retain, redirect or gone.

**Import batch / row**:
One staged import and its rows, each classified as create, update proposal, no change, blocked or needs review. A dry run changes nothing live; an import never publishes, approves or verifies.

**Source-as-is exception**:
The legacy owner decision `MSR-LISTING-PUBLICATION-1` to publish the source-locale catalogue as it stood. It is evidence of that decision only: not factual review, translation approval, indexability or media review.

**Merge record**:
An approved merge of two duplicate parties or properties that keeps the merged identity as an alias, can be reversed or split, and never widens anyone's access.
