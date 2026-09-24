# MS Realty

A real-estate agency service in Bulgaria and Greece: people discover properties, express interest,
and the agency works each request through to a recorded outcome. Product authority is
`docs/spec.md` §04; this file fixes the words used for its objects and the distinctions it insists on.

## Property and offer

**Property**:
A physical asset or identifiable unit. It exists without any public listing, and its exact address can stay private.
_Avoid_: listing (for the physical thing), object, estate

**Listing**:
A commercial offer for one property with one purpose (sale, long-term rent or short stay). Sale and rent of the same property are separate listings.
_Avoid_: property (for the offer), ad, lot

**Listing reference**:
The stable human reference of a listing, such as `MS-00100`. Legacy lot numbers are kept as listing references; titles and slugs may change, references do not.
_Avoid_: lot id, slug, code

**Purpose**:
What a listing offers: sale, long-term rent or short stay. It fixes the only valid price period (total, per month, per night).
_Avoid_: transaction type, deal type

**Fact**:
One property or listing attribute together with its state (known, unknown, not applicable, not provided, withheld), unit or basis, source class and review record. `false` is a known value, never a stand-in for unknown.
_Avoid_: field, attribute, data point

**Source class**:
Where a fact's value comes from: source supplied, owner confirmed, agency observed, document reviewed, professionally reviewed, system calculated or legacy import.
_Avoid_: verified (without saying by whom and how)

**Area basis**:
Which surface an area value measures: living, built, total or land. Values on different bases are never compared or substituted.
_Avoid_: size, square meters (unqualified)

**Rooms / Bedrooms**:
Two separate facts. A room count never implies a bedroom count.

**Location precision**:
How exactly a listing's place may be shown publicly: exact, street, neighborhood, settlement or region. A geocoded point is not permission to disclose an address.

**Listing version**:
An immutable snapshot of a listing's facts, terms, media and source text. Edits create a new version; approvals point at one.
_Avoid_: revision (for a published bundle), draft

**Commercial availability**:
Whether the offer can be taken up: available, availability unconfirmed, under negotiation, reserved (on a stated basis), sold, let or withdrawn. Independent of whether the listing is published.
_Avoid_: status (unqualified), active

**Evidence freshness**:
Whether the facts behind a listing are current under policy, due for review, conflicting or unknown. A timer can ask for review; it cannot prove availability.

**Media asset**:
A photo, floor plan, video or render with rights status and modification disclosure. It lives in private staging until rights and review allow a public rendition.

## People and access

**Person / Organization**:
A party with contact methods. Contact verification, consent and authority to act are three separate attributes.
_Avoid_: user, customer, lead, contact (for the party)

**Contact method**:
One channel address of a party (email, phone, messenger). Verification proves control of the channel, not identity, ownership or authority.

**Account**:
A sign-in identity for a staff member or a client. A person can exist without an account.
_Avoid_: user (for the party)

**Party relationship**:
A person's or organization's scoped, revocable role in a case or property: buyer, co-buyer, seller, authorized representative, landlord, tenant, adviser, guest, collaborator or specialist.
_Avoid_: link, association

**Authority**:
Whether a party may instruct the agency for a property. Self-declared authority and reviewed authority are different states; only reviewed authority unlocks consequential steps.

**Capability**:
A named permission over records, such as `translation.review` for one locale or `publication.release`. Roles are presets of capabilities; a record-scoped grant narrows a capability to one record.
_Avoid_: permission (for the role), access level

**Role**:
A named preset of capabilities from spec §03 (visitor, verified client, invited collaborator, assigned broker, coordinator, content editor, translation reviewer, publishing approver, manager, external specialist, AI service). One person may hold several.

**AI service (Hermes)**:
An actor that can only draft, extract, propose, flag and summarize. It never publishes, sends, makes a translation indexable, approves claims or grants access, and instructions found in content never give it authority.

## Demand and work

**Inquiry**:
One inbound expression of interest or service request, received before any qualified case exists. It has a source, an owner, an acknowledgment and a disposition.
_Avoid_: lead, ticket, message (for the request)

**Receipt**:
The durable confirmation shown only after the server accepted a request, carrying its reference. A timeout leads to reconciliation, never to a second submission.

**Client case**:
The agency's work toward a defined outcome with a party: buyer, seller or rental. Short stays run through reservations and management through service agreements. A buyer case spans many properties; a property relates to many private cases.
_Avoid_: deal, opportunity, pipeline item

**Stage**:
Where a case stands in its own pipeline (buyer, seller or rental labels). Entering a stage needs its evidence. Paused and closed are dispositions with a reason, not stages.

**Requirement brief**:
A case's structured needs: hard constraints, preferences and open questions, each marked as client-stated or broker interpretation.
_Avoid_: preferences (for the whole brief), profile

**Match**:
A proposed relationship between a case and a listing with fit reasons, trade-offs and feedback. A listing that breaks a hard constraint is an alternative, never an exact match.
_Avoid_: score, recommendation

**Shortlist**:
A chosen set of listings with each participant's opinion. Saving never creates an inquiry, reserves a property or notifies a seller.
_Avoid_: favorites (for a shared list), wishlist

**Saved search / Alert subscription**:
Exact acknowledged search criteria, and the separate subscription that delivers updates over a verified channel. An alert stays inactive until the channel is verified.

**Task / Commitment**:
An action with an owner, due point and completion evidence. An internal task differs from a promise made to a client. Waiting always names what is awaited and when to follow up.

**Handoff**:
A transfer of responsibility that is incomplete until the receiving owner, or an explicit coverage policy, accepts it.

## Meetings, messages, documents, decisions

**Appointment**:
A proposed or confirmed meeting. Requested, proposed, confirmed and completed are different events; a new time proposal keeps the confirmed arrangement until the replacement is agreed.
_Avoid_: booking (for a request), viewing slot

**Message**:
One logical communication with a channel, recipients and delivery states. Draft, human approved, queued, provider accepted, delivered and read are not interchangeable; outcome unknown is reconciled before any retry.
_Avoid_: sent (for provider accepted)

**Internal note**:
Staff-only case text. It is never a message and never becomes one by switching composer mode.

**Document / Evidence**:
A file or reference with purpose, version and restricted audience. Uploading, malware scanning, human review and professional validation are separate states.
_Avoid_: verified document (without the review type)

**Proposal**:
Versioned terms submitted through an authorized process. An expression of interest is not a proposal; "agreed for next step" is not a completed purchase. Changing amount, conditions, parties or deadline invalidates prior approval.
_Avoid_: offer (for an expression of interest), bid

**Approval**:
A recorded human decision bound to one subject version by its hash and scope. It becomes invalid the moment the subject changes.
_Avoid_: sign-off (unbound), OK

## Publication and language

**Source locale**:
Bulgarian (`bg`), the editorial source of public content. Other public locales are translations of a specific source version.

**Translation**:
The text of one locale for one source version: missing, draft, reviewing, approved, stale or rejected. Approval of language is not factual or legal approval, and it neither publishes nor makes the locale indexable.

**Indexable locale**:
A public locale that search engines may index, allowed only after a recorded human approval.

**Publication release**:
A confirmed request to publish or withdraw exact versions to named destinations. Each destination records requested, acknowledged and verified outcomes separately; repairs reuse the same release.
_Avoid_: publish (for clicking a button), deploy

**Public presentation**:
What visitors see, derived from commercial availability, editorial state, distribution, translation and freshness together. "Published" never implies "available".

**Content page**:
An area, guide, service or team page with versions and the same approval and translation rules as listings.

## Records of change

**Operation**:
One logical consequential command identified by an idempotency key. Its **operation receipt** records acceptance and outcome so retries, reloads and second tabs converge on one result.

**Record version**:
The integer every mutable record carries. A change states the version it expects; a stale version yields a conflict and a comparison, never last-write-wins.

**Activity event**:
A human-readable timeline entry for work. Separate from the **audit record**, the restricted technical trail kept for investigation.

## Adjacent services

**Service agreement**:
The agreed agency scope and authority for a property. A management request does not authorize expenditure or collecting money.

**Service request**:
A reported property-management issue under a service agreement, from received to resolved, with every waiting state naming its dependency.

**Statement**:
An owner statement whose lines are expected, invoiced, paid or reconciled, never blurred together.

**Quote / Reservation**:
A quote is a versioned, expiring price for stay dates. A reservation starts as a request and is confirmed only by an operator with capacity, accepted terms and provider-confirmed payment where required.
_Avoid_: booking (for a request to stay)

## Legacy and import

**Legacy URL decision**:
The recorded, evidence-based outcome for one old URL on `makler-realty.com` or `makler-realty.ru`: keep, redirect or gone.

**Import batch / row**:
One staged import and its rows, each classified as create, update proposal, no change, blocked or needs review. A dry run changes nothing live.
