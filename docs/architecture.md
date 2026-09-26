# MS Realty — Final Product and Release Architecture

Version 1.0 · 24 September 2026  
Status: final development baseline, not evidence of implementation or production readiness  
Scope: the complete first public release of the agency product, including its public, client, staff, data, integration, operational, migration, and acceptance contracts

## 0. Authority and reading guide

This is the single normative specification for the proposed development program. It resolves the architectural alternatives left open in the 21 September experience specification and 24 September greenfield memo. Those documents are historical reasoning and coverage references; where they disagree with this specification, this specification controls the new design.

This document does not authorize deployment, purchases, DNS changes, customer communication, data deletion, or a waiver of an existing launch gate. Existing production approvals and the current launch-authority files remain in force until a named operator approves their explicit transition. Writing a final design does not make the current product production-ready.

The product is a human-led real-estate agency application. It is not an open marketplace, configurable CRM SaaS, accounting system, legal-advice system, or short-stay booking platform. The first release must complete the supported agency workflows; it must not ship a polished catalogue with an unfinished operating process behind it.

“Must” is normative. Numeric engineering targets are release requirements to test, not measured current performance. Operational values marked operator-supplied have an assigned owner, safe disabled state, and release gate; they are not unresolved choices of architecture.

The companion [domain glossary](../CONTEXT.md) fixes terminology. The [core architecture decision](adr/0001-owned-agency-core.md) records the principal rejected alternatives.

Readers can start with §1–3 for decisions and scope, §4–9 for domain and workflow contracts, §10–13 for designer/frontend work, §14–18 for implementation and operations, and §19–22 for coverage and release acceptance. No prior specification is necessary to implement these requirements.

## 1. Self-audit and corrections

The earlier work had useful experience detail but did not constitute a final architecture. The audit changes the recommendation, not just its wording.

| Finding | Consequence if left unresolved | Final correction |
|---|---|---|
| Back-office ownership depended on an uncompleted vendor trial | Engineering could not choose its schema or write path | Own the agency core and its authoritative database; no external CRM or property-platform dependency at launch |
| Catalogue plus CRM divided the central buyer–property relationship | Duplicate entry, conflicting stages, permanent reconciliation | A first-class Case–Listing Interest lives with the Case, Brief, viewing, feedback, and commitments |
| “Simplify” risked losing the earlier multidimensional listing lifecycle | Published could be mistaken for available or approved | Separate factual revision, editorial review, translation approval, availability, publication, and distribution |
| Publication was described as a package without a concrete execution contract | Stale approval, stale jobs, or an admin bypass could publish incorrect data | Immutable publication manifests, explicit eligibility, guarded commands, transactionally switched pointers, and withdrawal fencing |
| Material corrections lacked a complete propagation policy | Old prices or claims could survive in another locale or channel | Atomic local restriction, dependency invalidation, scoped replacement approval, and external reconciliation |
| Secure client continuity was deferred behind AI | The core service story would break across repeated visits | Brief, shortlist, case access, viewing, messages, documents, and next action are release scope; AI follows those contracts |
| Seven-locale and Hebrew coverage became vaguely “multilingual” | Forms and recovery could fail outside the default language | BG, EN, RU, DE, NL, EL, HE public/client support; BG, EN, RU staff support; complete Hebrew RTL acceptance |
| Identity, storage, mail, and deployment remained abstract | Important security and delivery work was hidden | Select concrete providers, isolate authentication contexts, define application authorization, and test the integration |
| Adjacent services were inconsistently presented as both core and optional | A small agency could acquire an unbounded product backlog | Sale and long-term brokerage are complete release workflows; stays/management use bounded service intake only where actually offered |
| Checked-in readiness views conflict | A stale or permissive report could become a false release verdict | Mandatory policy/evidence reconciliation gate; no silent replacement or waiver |
| The prior screen count could be mistaken for a build count | Redundant pages and duplicated business rules | Map every previous flow/screen to a smaller set of shared surfaces, with explicit exclusions |
| “Current tools” was insufficiently distinguished from proven fit | Beta features or retiring products could become critical dependencies | Use stable documented primitives, pinned versions, qualification tests, and replaceable provider adapters |
| The first final-draft upload flow did not freeze uploaded bytes before scan | A still-valid upload URL could replace an approved file | Seal a server-only immutable copy first; bind scan, review and serving to its verified digest |
| The first final-draft restore flow relied on an older snapshot's restrictions | Recovery could resurrect revoked access, consent or publication | Independently retain the newer safety ledger; replay it or fail closed before reopening |
| Staging identity and outage detection were not isolated explicitly enough | Test identities could share production scope; failed infrastructure could hide its own failure | Separate WorkOS environments and independent external monitoring/heartbeat alerts |
| “Independent recovery” did not name the restored runtime or failure scenario | Off-site backup could be mistaken for whole-provider failover | Specify fresh DigitalOcean/R2 recovery resources and the available-provider assumption; do not promise a second cloud |

The final choice is not a claim that custom development is always cheaper. It is a decision that this product's versioned property truth, multilingual authority, and private Case–Listing relationship must remain coherent. The owned scope is deliberately narrower than a general CRM.

## 2. Final architecture decisions

| ID | Binding decision | Rejected launch alternative |
|---|---|---|
| D01 | One TypeScript modular application using Next.js, React, Payload, and PostgreSQL | Independent microservices or a second canonical CRM |
| D02 | Application modules own business transitions; Payload supplies persistence, admin, access, and draft primitives | Letting generated CRUD, hooks, or UI state independently define business authority |
| D03 | PostgreSQL owns canonical records, search projections, command receipts, audit references, and durable work | Concurrent authorities in spreadsheets, vendor CRM, search engine, or model memory |
| D04 | PostgreSQL structured search plus tested aliases/trigram matching | Typesense and Meilisearch as additional required runtime dependencies |
| D05 | Payload jobs, one dedicated worker process, application-owned outbox and external-action ledger | Inngest/Temporal/n8n plus a competing native queue |
| D06 | DigitalOcean App Platform Frankfurt web/worker processes and HA Managed PostgreSQL | Edge-only execution of the full Node application; self-managed Kubernetes |
| D07 | Cloudflare edge protection and a thin gateway; R2 EU-jurisdiction object storage | Serving private evidence from a public bucket or relying on a location hint as a residency guarantee |
| D08 | WorkOS AuthKit with separate staff/client applications; local authorization remains authoritative | Homegrown password/MFA flows or email address as a role |
| D09 | Resend for application email and reply ingestion; the application owns conversations and delivery records | Rebuilding a general mailbox or requiring full personal mailbox synchronization |
| D10 | Application-owned viewing calendar and ICS invitations/updates | Unverified instant booking or mandatory bidirectional Google/Microsoft calendar sync |
| D11 | MapLibre renderer with MapTiler tiles; list mode always works independently | A map-only interface or a bespoke map stack |
| D12 | Hermes is a draft-only module, initially using OpenAI Responses API through a small adapter | Autonomous agents with publish/send permissions or a mandatory self-hosted model |
| D13 | Public/client/staff share domain modules and design tokens, not private caches or authentication contexts | Separate duplicate applications with competing records |
| D14 | One release manifest and machine-readable gate evaluation generate readiness views | Manually maintained reports that can disagree on the same release |
| D15 | Better Stack for independent uptime/heartbeat alerting and centralized redacted telemetry, alongside provider-native metrics | Detecting a provider outage only through that provider or through the application email queue |
| D16 | Independently controlled S3 recovery archive, with rehearsed restoration into clean resources of the selected runtime | Calling an off-site backup a working second cloud or promising automatic whole-provider failover |

Version targets are Node 24 LTS, Next.js 16, React 19, Payload 3, and PostgreSQL 18. Exact compatible patch versions, container digests, SDK versions, schemas, and model snapshot are pinned in the release manifest after qualification. “Latest” tags are forbidden in a release. A failed compatibility test requires an explicit patch/minor adjustment or versioned architecture change, not an undocumented fallback.

The public/customer-facing product is first-party. No purchase of Apimo, Pipedrive, or Attio is required to complete the release. Those products remain alternatives for a future formally approved change, not parallel implementations to maintain.

## 3. Complete release scope

### 3.1 Included before public release

**Public discovery:** home and service entry; sale and long-term rental search; list/map; property detail, photos, floor plans and optional approved tours; saved items and comparison; public-facts shortlist sharing; approved area/service/guidance pages; contacts; inquiry and viewing requests with durable receipts; seller/landlord intake; preferences, privacy, accessibility, and recovery paths.

**Client continuity:** invitation and verified return; permitted cases; agreed requirements; shortlist and feedback; appointments; case messages; requested document exchange; versioned proposals and owner listing previews; recorded next action; participants and access information; service preferences; privacy requests; completion and remaining obligations.

**Agency work:** Today queue; inquiry triage; parties and relationships; cases and interests; assignment and handover; tasks/commitments; viewing calendar; proposals and closeout; property/listing/media workbench; source review; translation and publication review; material corrections; content editing; duplicate resolution; controlled imports; integration exceptions; access/privacy operations; operational reports and release evidence.

**AI assistance:** source-linked intake extraction, BG-based translation drafts, and broker summaries/reply drafts. These are complete bounded task paths with evaluation and manual alternatives, not prerequisites for receiving or answering inquiries.

**Operations:** real authentication, transactional email, secure storage, jobs, monitoring, backups, recovery, migration, rollback, and agency handoff. A release with simulated versions of these dependencies is not complete.

### 3.2 Service and language boundaries

Build public/client interfaces for `bg`, `en`, `ru`, `de`, `nl`, `el`, and `he`. Build staff labels for `bg`, `en`, and `ru`. BG is the public editorial source locale; original evidence keeps its original language. Review the complete interface dictionary, forms, errors, confirmations, and notification templates for each enabled locale. Hebrew is a complete RTL composition, not a translated homepage.

Not every listing needs seven published translations to exist. Every published locale of every listing must be approved for the relevant revision. An unavailable translation is explicitly unavailable; it must not silently fall back into an indexable page. Search in a locale may offer a separately labeled switch to approved BG inventory, not mix unapproved fallback prose into localized cards.

Geographic service coverage is an operator-owned registry of actually supported locations. Sandanski is inland. Bulgarian and Greek properties use country-aware facts, terminology, and professional-process checklists; the application does not invent local legal requirements. A region or service without accepted operating coverage is not advertised.

Short stays and ongoing management are not booking/accounting modules in this release. If the agency confirms that it offers those services, a service page may accept an inquiry and create an owned service case for manual coordination. It must explicitly say request/consultation, not instant reservation, rent collection, managed repair, or guaranteed payout. No stay availability engine, owner statement, maintenance-dispatch promise, or client-money ledger is exposed.

### 3.3 Explicit non-goals

No open listing marketplace, multitenant agency SaaS, campaign suite, arbitrary custom-object builder, workflow-design canvas, payment custody, escrow, lending decision, tenant scoring, autonomous negotiation, automated legal approval, automatic valuation, investment-return promise, native mobile application, or default call recording.

No general public generative chatbot at launch. Public search may use optional natural-language-to-filter assistance after its evaluation gate, but approved content and human contact remain sufficient to complete every journey.

## 4. Domain and authoritative data

All business IDs are immutable opaque identifiers, independent of slugs, titles, locale, email, or provider IDs. Preserve existing listing references through an explicit legacy-identity map. Original records and provider references remain traceable after merge, withdrawal, and migration.

### 4.1 Required records and relationships

| Record | Purpose and essential relationships |
|---|---|
| Property | Physical asset; country/location, private address, public location precision, current approved fact revision, source relationships |
| PropertyFactRevision | Versioned typed facts, source references, review decisions, unknown/conflict states, material-change classification |
| Listing | Commercial purpose for one Property; stable reference, availability, current approved terms, editorial draft and publication generation |
| ListingRevision | Immutable review candidate: fact revision, commercial terms, BG copy, ordered media manifest, disclosure instructions |
| LocalizedRevision | Locale-specific copy bound to a source revision; translation state and explicit reviewed factual references |
| PublicationManifest | Immutable binding of ListingRevision, LocalizedRevision, media, policy, approvals, locale and destination |
| CurrentPublication | One authoritative active publication pointer per listing/locale/destination, subject to the listing's current publication generation |
| Party / ContactMethod | Person or organization; verified contact methods, language/contact preferences, matching aliases; not a sign-in permission |
| Principal / StaffMembership / Grant | Authenticated identity, active staff role and record/action grants; external identity mapping by immutable issuer/subject |
| Inquiry | Original request, channel/source, submission receipt, property/criteria snapshot, contact route, owner/disposition and linked Case |
| Case / CaseParticipant | One agency outcome; type, stage, disposition, responsible broker, explicitly scoped participant roles and client-visible summary |
| BriefRevision | Case requirements, hard constraints, preferences, unknowns, timing, author and client acknowledgment |
| Interest | Unique current relationship between a Case and Listing; shortlist state, fit explanation, questions, feedback and relevant listing revision |
| Appointment | Case/Interest, participants, host, resource interval, timezone, access check, confirmation and notification state |
| ProposalRevision | Exact parties, terms, amounts/currency, conditions, expiry, source listing revision and recorded decision thread |
| Task / Commitment | Owner, due condition, dependency, completion evidence, relation to Case/Property and whether promised to a client |
| Message / MessageAttempt | Explicit audience, channel, approved content/attachments, logical send ID, provider reference and observed outcomes |
| Document / MediaAsset / MediaRelation | Purpose, classification, original object and digest, scan/processing state, rights, audience, review and ordered placement |
| Approval / SellerInstruction | Subject revision/hash, actor, capability, scope, decision, evidence, time, invalidation and expiry where relevant |
| Subscription / ConsentEvent | Purpose-specific contact eligibility, channel verification, policy/template version and changes |
| Operation / OutboxEvent / ExternalAction | Durable command result, pending work, logical effect identity, source generation, attempts and reconciliation |
| ImportBatch / MergeRecord | Staged source/mapping/diffs, per-row outcomes, legacy aliases and reversible identity changes |
| AuditEvent / PrivacyRequest / ReleaseEvidence | Restricted attributable history, owned privacy work and release-bound proof |

Use foreign keys, explicit uniqueness, check constraints, and atomic revision guards. PostgreSQL constraints are part of the protection; UI validation is not a substitute. [PostgreSQL constraints](https://www.postgresql.org/docs/current/ddl-constraints.html)

One Property can have sequential or simultaneous sale/letting Listings. A Case can consider many Listings; a Listing can belong to many private Cases through Interests. An Appointment and Proposal refer to the relevant Interest where one exists. Losing one property does not close the buyer's whole Case. A contact can participate in several Cases with different roles and visibility.

### 4.2 Facts, money, location, and time

A material fact uses a tagged representation: known value, unknown, not supplied, not applicable, withheld, or conflicting. The public view may intentionally collapse private reasons to a safe “not available” explanation; it must not reveal hidden evidence.

Store value, unit/basis, source document/reference, source language, effective/observed time, review scope and actor. Separate bedrooms from rooms, usable area from total built area, and building area from land. Never infer a missing value from a photograph or a translated label.

Money uses integer minor units, ISO currency, purpose/period, and named inclusions or charges. Never use floating-point arithmetic for authoritative amounts. EUR is the default new BG/GR presentation currency; retain original historical currency and source amounts. Bulgaria adopted the euro on 1 January 2026 at the fixed conversion rate recorded by the Council; that does not authorize silently rewriting historical records or inventing complete transaction costs. [Council decision](https://www.consilium.europa.eu/en/press/press-releases/2025/07/08/bulgaria-ready-to-use-the-euro-from-1-january-2026-council-takes-final-steps/)

Location contains country, region, settlement, approved aliases, private exact coordinates/address, and separately approved public precision. Approximate map points must be generated without leaking the exact point into HTML, source maps, metadata, media EXIF, client requests, or JSON.

Store timestamps as UTC instants with the relevant IANA timezone for appointments and deadlines. Preserve local input and offset when ambiguity matters. Reject nonexistent DST times and require a choice for ambiguous ones. Formatting changes with locale; facts and instants do not.

### 4.3 Data ownership rule

The application owns every record above. WorkOS owns authentication credentials and provider sessions, not case permissions. Resend owns observed transport events, not the conversation's business meaning. Object storage owns bytes, not publication eligibility. The model provider owns no canonical business record. The search projection, notification payload, PDF, and portal copy are derived presentations with source versions.

## 5. Deep modules and command contracts

Use a small number of deep modules: substantial business behavior behind a narrow, testable interface. A module is not automatically a separate process. No module may bypass another module's consequential invariants by writing its records directly.

| Module | Interface responsibilities | Implementation kept inside |
|---|---|---|
| Identity & Access | Resolve Principal; authorize action/resource; invite/revoke scoped access | WorkOS adapter, session mapping, local revocation, capability and audience evaluation |
| Inventory | Revise facts/listing; record seller instruction; manage media placement | Provenance, units, duplicate candidates, revision guards, material-impact computation |
| Publication | Submit review; decide approval; publish/restrict/withdraw exact version | Eligibility, locale dependencies, manifests, pointer changes, generation fencing, read-back |
| Agency Work | Receive inquiry; update Case/Brief/Interest; assign/hand over; record commitment | Dedupe suggestions, private relationships, stage guards, ownership and escalation |
| Scheduling & Proposals | Propose/confirm/change Appointment; submit/version/respond to Proposal | Resource conflict checks, timezone, authority, expiry, ICS sequence, next-action requirements |
| Communication | Draft/approve/send logical Message; ingest authenticated transport event | Audience checks, consent, templates, provider idempotency window, delivery reconciliation |
| Evidence & Media | Start/finalize upload; authorize download; record review/export | Quarantine, scans, object integrity, metadata stripping, derivatives, grants, retention |
| Search & Discovery | Execute normalized search; resolve approved public presentation | Locale-aware aliases, indices, safe filters, availability eligibility and pagination |
| Assistance | Produce typed draft for one authorized task | Prompt/schema/model version, scoped sources, budget, validators, evaluated inference adapter |
| Operations | Run/reconcile work; import staged data; evaluate release evidence | Retry scheduling, dead-letter work, audit, metrics, backup/restore controls |

Each consequential command requires authenticated or explicitly public submission context, a stable logical operation ID, expected record revision where applicable, a validated payload, and a declared purpose. Successful business mutation, audit reference, and required outbox event commit together. Provider calls occur after commit, never inside the database transaction.

Use explicit domain endpoints for publishing, sending, confirming, changing access, material correction, merge, and batch execution. Generated Payload REST/GraphQL must not provide a parallel route to those transitions. Generated ordinary draft forms may be retained with field restrictions and domain enforcement. Client and anonymous users never receive raw internal collections.

Payload Local API calls that represent a user action must carry request/Principal context and deliberate access settings; privileged defaults are not a permission policy. Joined writes and job enqueueing must use the same awaited transaction context. Payload documents transaction propagation through `req`; integration tests must prove rollback of the complete command, not just its first write. [Payload transactions](https://payloadcms.com/docs/database/transactions)

### 5.1 Mutation envelope and result semantics

The transport contract includes `operationId`, `expectedRevision`, `payload`, and server-derived Principal. An idempotency record is unique within Principal/submission scope and command type, with a canonical payload digest. Reusing the same key with a different payload returns a conflict and performs no new action. Durable operation identity outlives browser retries.

Return one of: confirmed local result; accepted durable work with status URL; validation rejection; permission rejection; revision conflict with authorized latest state; or unknown external outcome requiring reconciliation. Do not return a successful publication/send merely because a job was queued.

Standard error codes include `VALIDATION_FAILED`, `NOT_AUTHORIZED`, `REVISION_CONFLICT`, `APPROVAL_STALE`, `PUBLICATION_INELIGIBLE`, `LISTING_UNAVAILABLE`, `APPOINTMENT_CONFLICT`, `RATE_LIMITED`, `DEPENDENCY_UNAVAILABLE`, and `OUTCOME_UNKNOWN`. Responses contain a safe explanation, field errors where relevant, retryability, operation/correlation ID, and allowed recovery. Use a non-enumerating not-found response for inaccessible private objects.

Record revisions must use an atomic compare-and-update or appropriate row lock, not an unlocked read followed by an unconditional write. Approval and execution re-read current permissions, eligibility and generation inside the relevant transactional decision.

## 6. End-to-end service workflows and state machines

### 6.1 Inquiry receipt, assignment, and recovery

Accept anonymous questions, callbacks, viewing requests, and seller/landlord consultations without registration. Ask for intent, relevant property or criteria, one reachable contact method, preferred language/channel, and only the information needed for the next step. Marketing permission is separate and optional.

The server validates, applies abuse controls, and atomically stores the Inquiry, original context, logical receipt, coverage-queue ownership and notification outbox event. A receipt is shown only after commit. AI, email delivery, broker availability, and a queue consumer are not prerequisites for durable acceptance.

The server-rendered form contains a high-entropy logical submission key bound to an anonymous receipt session in a host-only Secure HttpOnly cookie. This supports idempotent submission, POST/Redirect/GET and receipt reconciliation without JavaScript. The enhanced client may keep the non-secret logical submission identity in session storage, but the receipt-session capability remains in the cookie. Neither contact details nor private free text enter a URL. A status request returns only receipt/acceptance state, not the original personal information. Possession of a public reference alone cannot retrieve a private request. Refreshing or retrying the same logical submission must not create a second Inquiry; a changed payload requires a deliberate new submission identity.

State sequence: `received → assigned → awaiting_client → linked_to_case` or `resolved_without_case`. `suspected_spam`, `duplicate_candidate`, and `contact_unreachable` are explicit review/disposition states, not silent deletion. A duplicate suggestion requires human confirmation unless the exact logical submission is identical. Preserve original receipt aliases after an approved merge.

The configured coverage queue owns new work until a named broker accepts it. At first acceptance, the UI records a follow-up commitment. Initial operating targets are assignment within one staffed business hour and first useful human response within four staffed business hours. These are internal starting policies; no public response-time promise is shown until staffing and coverage support it. Outside business hours, receipts state the actual next staffed period.

When email is unavailable, the Inquiry remains visible and an integration exception is owned. When the application/database is unavailable, do not display a success-looking receipt: preserve the in-tab draft where safe, show a retry/status path, and offer the verified phone/email fallback from the static maintenance page.

### 6.2 Buyer/tenant Case and Interest

After an inquiry is qualified or attached to an existing relationship, create/link one Case with an assigned broker, scoped participants, agreed purpose, BriefRevision, and next action. Qualification records needs and supported service scope; it is not a wealth, nationality, or tenant-quality score.

Buyer case stages: `needs_agreed → evaluating → viewing → proposal_preparation → proposal_active → coordination → completed`. A case may move back to evaluating without losing prior Interests. Disposition is separately `active`, `paused`, or `closed`; a pause has a reason, dependency and review date. Closure has a recorded outcome and disposition for every open commitment.

An Interest tracks `suggested`, `shortlisted`, `viewing_requested`, `viewed`, `proposal`, `declined`, or `unavailable`, with revisioned feedback and reasons. One Interest's loss or listing withdrawal does not close other Interests or the Case. A new listing revision marks relevant old comparison/proposal information stale without silently rewriting previously agreed terms.

Long-term letting uses the same Case/Interest foundation with tenant/landlord-specific labels, recurring rent period, known charges/deposit, availability date, and human-managed application/selection steps. Do not collect identity or financial documents at casual browsing or initial viewing stages. Criteria and document requests must follow the approved country/service policy.

The client workspace shows the current Brief, permitted Interests, agreed appointments, requested actions, and named broker. Client changes to requirements create a new proposal/acknowledgment state; they do not silently alter an active Proposal or the agency's prior commitments.

### 6.3 Seller/landlord intake through marketing

Intake records the party's self-declared relationship to the property, approximate location, property type, purpose, contact route, and optional safe supporting media. It does not establish ownership or authority. A broker reviews duplicate candidates, service coverage, relevant authority, and the proposed scope of representation.

Seller case stages: `request_received → scope_authority_review → assessment → instructions_agreed → preparing → marketing → proposal_coordination → completion_handover`. Preparing contains parallel fact, media, disclosure, price, BG-copy, and translation work; it is not a sequence that forces completed work to restart unnecessarily.

Seller Instructions record commercial terms, privacy/location disclosure, media usage rights, representation scope, and publication permission at a defined version. An owner preview shows exactly the relevant revision and consequences. Owner acknowledgment is evidence for the agency; it is not a substitute for staff publishing capability or professional title review.

Price changes, marketing pauses, withdrawals and altered terms use explicit instructions and the material-correction workflow. A client can request a correction; they cannot directly mutate public commercial facts through their workspace.

### 6.4 Viewings and calendar

Public UI offers preferred windows or a request, not instant confirmed slots. States are `requested`, `proposed`, `confirmed`, `completed`, `declined`, `cancelled`, `reschedule_requested`, and `no_show`. Tentative proposals are visually different from confirmed arrangements.

Before confirmation, validate current Interest/Listing eligibility, host, property access permission, participants, local time, working hours, travel buffers and internal resource conflicts. Store occupied resource intervals for broker and property access; use transactional exclusion/locking so simultaneous confirmations cannot double-book the same resource. Group viewings require an explicit shared appointment, not overlapping independent bookings.

The application's calendar is authoritative for agency viewing commitments. Staff must enter external busy periods or check their external calendar before confirming; this manual operational step is explicit in the confirmation form. Launch does not claim automatic visibility into Google/Microsoft calendars.

Send ICS invitations through authorized service email with stable UID and increasing SEQUENCE. An email provider accepting an invitation does not confirm participant attendance. Rescheduling creates a proposed replacement; retain the old confirmed arrangement until replacement acceptance unless a participant explicitly cancels it. Commit the replacement interval, old-state change, audit and notification work atomically. Cancellation releases the internal resource and emits the correct update; stale reminders recheck appointment version and do not fire.

Record completion/no-show and follow-up against the Interest. Meeting logistics and access codes are private and time-scoped; public map precision does not imply permission to disclose an exact meeting location to every visitor.

### 6.5 Proposals, coordination, completion

Proposal states are `draft → reviewed → submitted → awaiting_response`, followed by `countered`, `declined`, `withdrawn`, `expired`, or `agreed_for_next_step`. Every change to parties, amount, currency, conditions or deadline creates a new revision and invalidates the relevant prior approval. Decisions reference a specific revision; counteroffers never overwrite it.

The application coordinates professional review and records dependencies. It does not certify title, draft unapproved legal terms, execute a legal signature, hold money, or label “agreed for next step” as a completed sale. Show the applicable country/service checklist and the named qualified person responsible for professional conclusions.

Completion requires a human-recorded outcome, supporting evidence appropriate to the approved process, property/listing status update where applicable, handover status, remaining obligations, and a retention/aftercare disposition. Competing buyer Cases retain their own privacy and receive only an appropriately reviewed availability update. An incomplete transaction can close with a truthful reason without marking the Property sold.

### 6.6 Ownership, tasks and handover

Every active Case has one accountable broker and at least one next action or an explicit waiting dependency/review date. Tasks use `open`, `in_progress`, `waiting`, `done`, `cancelled`. Completion requires the declared evidence or recorded outcome. A count of activities is not completion evidence.

Handover presents open commitments, recent communications, upcoming appointments, restricted documents, outstanding approvals, and the receiving broker's access. The receiving broker accepts; management handles an absent recipient. Staff revocation or absence cannot leave active work unowned: reassign to the coverage queue in the same administrative workflow.

## 7. Publication, localization and material correction

### 7.1 Independent lifecycle dimensions

| Dimension | States | Controlling meaning |
|---|---|---|
| Commercial availability | available, confirmation_required, negotiating, reserved_with_recorded_basis, sold/let, withdrawn | Publication does not establish current availability |
| Editorial | draft, needs_facts, in_review, approved_revision, changes_requested | Draft edits never alter an already approved revision |
| Locale | missing, draft, reviewing, approved_for_source, stale, rejected | Approved text is tied to the source it was reviewed against |
| Publication | never_published, eligible, active, restricted, withdrawn | Derived from current permissions, manifest and generation |
| Destination delivery | queued, attempting, acknowledged, verified, failed, outcome_unknown, withdrawing, withdrawn | Local website and each external destination have separate outcomes |
| Freshness | current_under_policy, review_due, conflicting, unknown | A timer creates work; it cannot verify availability |

Default availability-review interval is 14 days for sale and 7 days for long-term rental. These are conservative operational defaults, not market facts. At expiry, display confirmation required, stop describing a listing as newly confirmed, and require broker reconfirmation before a viewing is confirmed. A known conflicting price, rights issue, or withdrawal restricts publication immediately instead of merely adding a freshness badge.

### 7.2 Eligibility and approval

A publication manifest includes listing/property identifiers; fact and listing revision; locale revision; media relation IDs, derivatives and rights references; public-location disclosure; commercial availability basis; policy revision; reviewer/publisher decisions; and content digests. It is immutable after creation.

Activation requires valid source/fact review at its stated scope, commercial instruction, usable approved media, approved localized copy, relevant professional review for any regulated claim, explicit publishing authority, and no newer restriction or withdrawal generation. Publishing approval is a recorded human command. Hermes cannot create that approval.

Same-person editing and routine approval are allowed for a small team when that human has both capabilities; record them as separate decisions and do not fabricate an independent reviewer. Privilege changes, production release and destructive restore require the separately designated accountable approver. Legal/tax/process claims require the relevant approved professional-review policy, not a translation reviewer.

Do not use Payload's localized draft status as the sole business gate: current locale-specific status support is experimental. Explicit Approval and Publication records control public eligibility independently. [Payload localization](https://payloadcms.com/docs/configuration/localization)

### 7.3 Atomic publication and stale-job fencing

Inside one transaction, validate the approved manifest against current revisions/permissions, switch CurrentPublication, update the local search projection and publication generation, and record audit/outbox work. Publish only the approved current pointer. Old manifests remain historical records, not alternative public read paths.

Each queued publication/distribution action carries listing ID, manifest ID and expected generation. Before execution, re-read the generation and current eligibility. A withdrawn or superseded generation cancels obsolete work. A delayed job may never resurrect an old price, locale, asset or withdrawn Listing.

Public HTML, public API responses, JSON-LD, cards, comparison, sitemap, hreflang and outbound publication feeds use the same eligible presentation function. They cannot choose their own approval shortcut. Private preview uses authenticated authorized access and is never an indexable public URL.

### 7.4 Material-change protocol

Draft-only edits do not affect live content. Once an authoritative material change or credible dispute is recorded, compute the affected publications, prose, proposals, viewings, alerts, downloads and destinations.

For an affected inaccurate public presentation, atomically restrict its current pointer and increment the generation before dispatching corrections. Preserve a truthful unavailable/confirmation surface where appropriate. Do not inject a new price into old prose that still states the old price. Unaffected correctly approved locales may stay active only when the dependency analysis proves they are unaffected.

Prepare replacement revisions, review source and affected locale copy, then activate the replacement. Withdrawal is a removal of exposure and never waits for a new translation. Seller/client notifications remain reviewed messages; a page edit is not proof that someone who received an earlier email or PDF was informed.

Track failed external removals and manual portal actions as owned exceptions. Completion means each affected destination and commitment is verified corrected or has an explicit unresolved disposition. Previously downloaded material cannot be recalled; mark controlled copies superseded and explain that limitation.

### 7.5 Cache and public-media policy

At launch, mutable listing HTML, search, public data endpoints, sitemap and hreflang responses are not edge/full-route cached. They read current eligibility from PostgreSQL on each request; immutable approved content may be internally addressed by manifest digest only after that check. This deliberately trades some caching efficiency for simpler correctness at agency scale.

Static build assets and approved public media derivatives use content-addressed caching. All R2 buckets remain inaccessible through direct public bucket URLs; “public derivative” describes approved content, not unrestricted storage access. A public media route checks current asset eligibility at the application origin before serving a cache miss. Use a maximum five-minute browser freshness lifetime and one-hour edge lifetime for these derivatives, with targeted emergency purge. A withdrawn asset cannot be fetched from a bypass URL after origin restriction.

Private content is always `no-store`. A public media withdrawal revokes origin eligibility, requests CDN purge and verifies it; it cannot erase previously downloaded bytes or guarantee instant deletion from every external cache. No exact private coordinates or identity documents are ever placed in public derivatives.

Do not add mutable CDN caching later without revision-aware invalidation, a documented maximum stale window, emergency withdrawal, and tests across every public representation. A cache-purge request is not proof of cache removal.

## 8. Identity, privacy, and authorization

### 8.1 Identity architecture

Use two WorkOS applications in one production environment: staff and invited clients. They have separate client IDs, callbacks, credentials and session policies. WorkOS documents a shared issuer across applications and a distinct `client_id`; issuer validation alone is insufficient to distinguish the two. [WorkOS applications](https://workos.com/docs/authkit/applications)

Use host-only secure HttpOnly cookies with separate names/contexts for `app.makler-realty.com` and `my.makler-realty.com`; the public host receives neither private session cookie. The WorkOS SDK handles the supported authentication protocol. Server verification requires signature, expiry, expected issuer, exact application context, and the tested audience contract for the configured tokens. Reject missing/mismatched mandatory claims; do not invent an `aud` assumption from another token type.

Staff access additionally requires the dedicated staff organization and an active local StaffMembership. Require TOTP MFA for staff; social/SSO login is not enabled at launch. WorkOS's MFA policy does not apply to SSO users, so enabling SSO later requires independently enforced IdP MFA and requalification. [WorkOS organization policies](https://workos.com/docs/authkit/organization-policies)

Client access uses verified email authentication through the client application and local invitation/grant matching. A client identity does not join the staff organization. The same person may legitimately be both staff and client, but a client-context token never authenticates the staff interface.

Payload uses a custom authentication strategy with its local password strategy disabled. Mapping to the appropriate internal Principal uses immutable identity, not email-based auto-promotion. The AuthKit-to-Payload bridge, admin login/logout, token context, CSRF and error behavior are implementation work that must be tested; they are not an out-of-box integration claim. [Payload custom strategies](https://payloadcms.com/docs/authentication/custom-strategies)

Initial session limits: staff 12-hour absolute/30-minute idle; clients 7-day absolute/24-hour idle. Access grants, exports, production controls and other sensitive staff actions require recent reauthentication within 5 minutes. Sensitive client document actions require recent verification within 15 minutes. Enforce these locally even if a provider session lasts longer.

### 8.2 Role plus record plus field

Authorization is `Principal capability + active membership/grant + record relationship + field/audience + current action state`. Navigation visibility is never enforcement.

| Actor | Allowed scope | Required exclusions |
|---|---|---|
| Visitor | Approved public records, own anonymous submissions, local saves | Owners, exact private addresses, private evidence, case counts |
| Invited client/collaborator | Explicit Case participation and permitted actions/documents | Other participants' confidential documents, internal notes, competing Cases |
| Assigned broker | Assigned/team-authorized Cases, permitted property work and commitments | Unrelated sensitive documents, publishing without capability |
| Coordinator | Scheduling, coverage and necessary contact/access fields | Broad financial/identity evidence access |
| Editor / translator | Relevant source/draft material and assigned locale work | Client documents unrelated to the task, commercial approval by translation alone |
| Publisher | Exact eligible publication decisions and correction/withdrawal | Implicit legal approval or unrestricted team administration |
| Manager / privacy operator | Explicit allocation, access/privacy and audit capabilities | Unlogged bypass of document purpose or professional authority |
| Hermes task | Scoped approved source/draft inputs and draft output | Publish/send/index/access-grant/authority commands |

Property staff visibility does not imply visibility of every buyer Case connected to that Property. Private documents have an explicit audience independent of general Case participation. Internal notes and client messages are separate fields/record types; they are never two display modes of the same unrestricted body.

Recheck local membership, session revocation and record grants on every protected request and consequential job. Local revocation takes effect after its committed change for subsequent requests; provider revocation/events are additional synchronization. Offline JWT signature verification alone is not immediate revocation.

### 8.3 Invitations and shares

Invitations are scoped, recipient-bound and expire after 72 hours. GET/link preview must not consume an invitation or grant access. After authentication, an explicit POST accepts it against the current recipient and scope. Wrong-account recovery must not reveal the private Case to the wrong person. Reissue invalidates the old invitation.

Public shortlist shares contain approved public listing facts only, with no participant names, private notes, budgets, contact data or unpublished inventory. Use unguessable revocable tokens; token possession never grants private-case access. Private collaborators are invited by an authorized staff action; clients may request an invitation but cannot expand sensitive permissions themselves.

Keep authentication/share tokens out of analytics, logs and referrers. Apply restrictive referrer policy, no third-party widgets on private/auth pages, and cache clearing on sign-out/revocation. Already downloaded documents cannot be recalled; the UI states that explicitly.

### 8.4 Privacy operations

Contact verification, service communications, saved-search alerts, and marketing consent are distinct. Recheck recipient eligibility when a job executes. Unsubscribe stops future matching work even if it was queued before revocation. Do not use hidden protected-trait proxies or behavioral eligibility scores.

The operator-approved retention policy must define unconverted inquiries, Cases, document classes, messages, logs, audit/operation records, backups, legal holds and response deadlines. Missing policy blocks production personal-data capture; the software must not invent country-specific legal deadlines or retain everything forever.

Privacy requests have a receipt, verification step, responsible person, due condition, scope, legal-hold disposition and recorded completion. Exports exclude other parties' protected material, use private expiring delivery and require reauthentication. Deletion/restriction propagates to derived stores and providers where supported; backup rehydration re-applies the deletion/revocation ledger before reopening access or jobs.

## 9. Communications, subscriptions, and external effects

Resend is the selected application email transport and inbound reply processor. Existing human business mailboxes remain available; this product does not clone their complete history or require bidirectional mailbox synchronization. Replies to application messages use a dedicated reply subdomain and opaque thread identifiers. DNS additions must preserve existing MX/SPF/DKIM/DMARC behavior and be explicitly approved.

Outbound content is either an exact human-approved Message revision or an authorized deterministic service template under an approved rule. Hermes-generated text always enters the human-review path. Receipts, appointment notices and opted-in search digests may execute automatically only under a pre-approved template/rule and current recipient eligibility.

Message states are `draft`, `approved`, `queued`, `attempting`, `provider_accepted`, `delivered`, `bounced/failed`, and `outcome_unknown`. Show read state only when the actual channel provides a meaningful receipt; do not enable email open tracking by default. In-app message availability and email notification delivery are separate facts.

The logical message ID and payload digest are stored before execution. Reuse the same provider idempotency key for retries of that exact payload. Resend's documented idempotency window is 24 hours; after that window, an ambiguous send must be reconciled or escalated, never blindly replayed. The application ledger remains authoritative even after provider deduplication expires. [Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys)

Authenticate webhook signatures using the raw request body, deduplicate event IDs, record receipt durably before processing, and accept only known event types/transitions. Handle out-of-order delivery/bounce events without regressing state or discarding an adverse outcome. [Resend webhook verification](https://resend.com/docs/webhooks/verify-webhooks-requests)

Inbound email is untrusted content. Thread tokens aid correlation but do not grant permissions or verify the sender's authority. Ambiguous sender/case matches go to triage. Quarantine attachments, sanitize HTML, and keep forwarded content from widening audience. Inbound provider receipt and downstream case ingestion have independently observable states. [Resend receiving](https://resend.com/docs/dashboard/receiving/introduction)

Phone and WhatsApp are launch contact/handoff channels, not promised synchronized inboxes. A link click is not a sent/received message. Brokers can record a truthful communication summary and follow-up. Native WhatsApp transport or external portal distribution is disabled until a separately tested adapter is approved; no beta integration is a hidden launch dependency.

Saved-search alerts require channel verification and purpose-specific opt-in. Default to a daily digest in the subscriber's timezone; provide pause/edit/unsubscribe. Snapshot approved criteria, deduplicate listing/revision notifications, recheck publication eligibility at send time, and do not turn an alert subscription into a marketing subscription. AI is not required to generate the digest.

## 10. Search, discovery and public content

Use PostgreSQL parameterized queries over a public-eligible read model. Store approved location aliases/transliterations; prioritize exact stable listing references; use trigram matching for appropriate text fields. Trigram support is a primitive, not proof that every language's retrieval is good. [PostgreSQL pg_trgm](https://www.postgresql.org/docs/current/pgtrgm.html)

The normalized filter schema includes transaction purpose, country, location IDs, property types, explicit price currency/period and range, bedroom range, area value/basis, known features, public map bounds, sort and cursor. OR applies within a multi-selected facet; AND applies across facets. Unknown is not false. A “has lift” filter includes confirmed true, not unknown. An explicit include-unconfirmed control must explain its effect.

Search URLs contain only non-sensitive filters. Private free-text Briefs, contact details and accessibility disclosures stay in Case records. Validate ranges, maximum list sizes, text length and query cost; use allowlisted sort/field names and no arbitrary query language. Page size is 24, maximum 60. Every sort includes an immutable ID tie-breaker; cursors are bound to query/sort identity. When inventory changes between pages, deduplicate records and offer refresh instead of claiming an immutable historical snapshot.

Responses include query identity, normalized applied filters, authorized result items, pagination, exact/estimated count classification, source timestamp and any partial-scope failure. Counts and facets apply the same public eligibility and locale rules as results. Never leak unpublished inventory through counts, autocomplete, map pins or “similar” suggestions.

Default ordering is a documented combination of exact criteria fit and listing freshness, with explicit price/recent alternatives. No hidden paid placement or sensitive-trait personalization. Unknown criteria generate questions, not invented match scores. Zero results retain the user's criteria and offer individually explained relaxations that require consent.

Natural-language assistance, if enabled, produces only a proposed typed filter object and unresolved terms. The user sees and can correct the interpretation. Enforce hard constraints and eligibility in ordinary server queries, not in a prompt. Timeout or model failure leaves structured search fully functional.

MapLibre and MapTiler provide map rendering/tiles with required attribution and restricted public keys. Store approved public coordinates; no automatic geolocation request or runtime disclosure of private exact addresses. The list remains a task-equivalent alternative when maps are blocked, slow or unavailable. Tile and third-party data-handling terms require procurement acceptance. [MapTiler API](https://docs.maptiler.com/cloud/api/)

Property detail shows price basis, availability and last meaningful confirmation, source-supported area/rooms/features, public location precision, authentic media, known limitations, useful guidance and a named contact path. An old listing shows its actual state and legitimate alternatives. A withdrawn or sold listing does not remain in active available search merely to retain traffic.

Editorial area/service/guide content uses review dates, geographic scope and named content responsibility. Structured data must match visible eligible content. Curated useful landing pages may be indexed; arbitrary filter combinations, private pages, previews, token links and thin duplicates are excluded under an explicit SEO policy. Google's AI search guidance does not require a special AI-file or markup program; ordinary useful, crawlable and accurate content remains the chosen foundation. [Google AI-search guidance](https://developers.google.com/search/docs/appearance/ai-features)

## 11. UI/UX and layout contract

### 11.1 Navigation and route families

Use three hosts with one application: public `makler-realty.com`, client `my.makler-realty.com`, and staff `app.makler-realty.com`. The new private hostnames are target configuration requiring domain approval; they do not authorize a change to either legacy domain. Local/staging equivalents use isolated host/cookie contexts.

| Surface | Route family | Primary job and information |
|---|---|---|
| Public home | `/{locale}` | Choose Buy/Rent/Sell/Let; understand actual service coverage; search/contact |
| Results | `/{locale}/properties` | Inspect applied filters, count, sort, cards and optional map without losing context |
| Property | `/{locale}/properties/{reference}/{slug}` | Evaluate one eligible Listing; ask or request viewing; inspect media/facts/unknowns |
| Saved / compare | `/{locale}/saved`, `/{locale}/compare` | Device-local persistence, up to three comparison columns, explicit signed-in merge |
| Shared shortlist | `/{locale}/share/{token}` | Public facts only; expired/revoked/unavailable variants |
| Inquiry / receipt | `/{locale}/inquire`, `/{locale}/requests/{receiptId}` | Minimal request, durable outcome and actual next step |
| Viewing request | `/{locale}/viewings/request` | Preferred windows, timezone, contact method; no false booking claim |
| Owner entry/intake | `/{locale}/sell`, `/{locale}/let`, `/{locale}/owners/request` | Scope, minimum facts, unknown answers, preview and receipt |
| Editorial/contact | `/{locale}/areas/{slug}`, `/services/{slug}`, `/guides/{slug}`, `/contact` under the locale | Accurate local context, supported service and reachable staff |
| Help/preferences | `/{locale}/help/{topic}`, `/{locale}/preferences` | Assistance, privacy/accessibility information and verified subscription control |
| Client access | `/{locale}/access`, `/{locale}/invitations/{id}` on client host | Verify correct identity and explicitly accept the permitted invitation |
| Client home/case | `/{locale}/cases`, `/{locale}/cases/{id}` on client host | Next action, broker, progress, Brief, Interests and permitted participants |
| Client case tasks | Case subroutes `/properties`, `/appointments`, `/messages`, `/documents`, `/proposals`, `/listing-preview`, `/closeout` | Complete a specific private task with explicit audience and version |
| Client settings | `/{locale}/preferences`, `/privacy-requests`, `/participants` where scoped | Contact choices, data request, view/revoke permitted participation |
| Staff Today/inquiries | `/{locale}/today`, `/inquiries`, `/inquiries/{id}` on staff host | Work requiring action, coverage queue, original request and disposition |
| Staff Cases | `/{locale}/cases`, `/cases/{id}`, `/parties/{id}` | Case/Brief/Interest/commitment work and scoped relationship history |
| Staff scheduling | `/{locale}/calendar`, `/appointments/{id}` | Agenda/day/week, conflicts, proposals, confirmations and changes |
| Staff inventory | `/{locale}/inventory`, `/inventory/{propertyId}` | Property, Listings, facts/evidence, media, source copy and lifecycle |
| Staff reviews | `/{locale}/reviews`, `/publications/{id}`, `/corrections/{id}` | Exact-version translation/approval, destination outcome and material correction |
| Staff content | `/{locale}/content` and record routes | Approved area/service/guide authoring with the same publication rules |
| Staff operations | `/{locale}/operations/{section}` | Imports, duplicates, privacy, integrations, delivery exceptions, audit and reports |
| Staff settings | `/{locale}/settings/{section}` | Team/access, coverage, policy and release evidence; capability-gated |

Route names above are canonical for new surfaces. Existing legacy URLs remain governed by the reviewed migration manifest. A slug mismatch may redirect to the current canonical form only under that route policy; it never changes the stable identity.

Primary public navigation: Buy, Rent, Sell/Let, Areas, About/Contact, Saved, language. Expose only supported services. Client navigation: Overview, Properties, Appointments, Messages, Documents, with proposals/owner preview appearing in context. Staff navigation: Today, Inquiries, Cases, Calendar, Inventory, Reviews, Content, Operations; settings remains secondary.

### 11.2 Layout recipes

**Home:** compact service proposition, immediate search, actual inventory, local/service evidence, and reachable team. No full-screen intro, auto-playing hero video, artificial scarcity, or chat overlay blocking search.

**Results:** stable search/filter summary above the results. Desktop can show a 240–280 px filter rail where useful; map mode uses a deliberate split only when both panes remain readable. Mobile uses one list or map at a time, with a full-height filter sheet, visible draft selections and Apply/Clear controls. Back closes the sheet before leaving results.

**Property:** identity, location, price/basis and availability immediately visible; gallery followed by key facts, decision-relevant details, location, evidence/unknowns and related guidance. Desktop contact panel can be sticky without obscuring content; mobile has a compact bottom action area respecting keyboard and safe-area insets. “Ask” and “Request viewing” carry the selected reference and revision into the request.

**Comparison:** two or three listings on desktop, a deliberate pair view on narrow screens. Align meaningful facts and clearly distinguish unknown/not applicable. Highlight changed values and unavailable Listings without silently replacing them. Public sharing never includes private commentary.

**Forms:** group questions by purpose; seller intake may use staged sections, while a simple inquiry stays short. Show required/optional/unknown choices, preserve valid inputs after failure, give a linked error summary, and review consequential instructions before submission. Receipt pages provide reference, exactly confirmed outcome, next step and real help.

**Client Case:** lead with the next action and broker, then a concise status and relevant appointments/properties. Avoid an administrative dashboard. Timeline is curated client-visible business history, never a raw audit dump. A seller view emphasizes requested instructions and listing preview; buyer and tenant views emphasize Brief/Interests.

**Staff Today:** grouped actionable queues—unassigned inquiries, due commitments, upcoming viewings, approvals/corrections and delivery failures. Every row explains why it needs attention and who owns it. Counts link to actual records; empty data differs from failed loading.

**Case workspace:** persistent case identity, role/type, stage/disposition, owner and next action; task tabs for Brief/Interests, timeline/messages, appointments, proposals and documents. Use a secondary details panel on wide screens and a dedicated route on mobile. Internal-note and client-message composers remain unmistakably distinct.

**Property workbench:** one record shell with Facts & sources, Listings/terms, Media, BG copy, Locales, Review/Publish, and Distribution/History. A completion checklist distinguishes missing facts from optional enhancements. Draft edits show local/unsaved/server-saved states. Publication is a separate reviewed action, not the same Save button.

**Review:** source and proposed revision side by side on wide screens, stacked with persistent identity on mobile. Show changed protected fields, affected locales, media/rights, approvals and destination consequences. A reviewer's language capability does not reveal irrelevant client documents.

**Calendar:** agenda is the mobile default and the accessible alternative to a visual grid. Distinguish proposed/confirmed/conflicting with labels, not color alone. Keyboard entry and explicit date/time forms can complete every action without drag-and-drop.

**Operations:** filterable tables with stable row identity, progressive detail and a durable result route for batch jobs. Bulk selection explicitly states selected page vs all matching records. Approval, sending, access grants and material fact changes never hide inside a generic bulk-complete action.

### 11.3 Design system

Use a light-first system, CSS custom-property semantic tokens and CSS Modules; accessible unstyled primitives may supply complex interaction behavior, but native semantics remain preferred. No second CSS/design framework is introduced for the staff app.

Starting visual tokens: canvas `#F8F7F3`, surface `#FFFFFF`, primary text `#192E27`, secondary text `#52625A`, border `#D9DFD8`, primary action `#214F3C`, inverse text `#FFFFFF`. Focus and status colors must pass contrast independently of this palette. Status always includes text/icon meaning; low-contrast borders are not the only input or state affordance.

Use self-hosted, properly licensed Noto Sans with an appropriate Noto Sans Hebrew subset/fallback. Default body is 16 px with comfortable line height; staff secondary data can be 14 px but essential content remains readable at zoom. Numeric comparisons use tabular figures. Headlines scale by content, not fixed-height boxes that clip translated text.

Spacing uses a 4 px base with a restrained shared scale. Comfort target for primary touch controls is at least 44×44 CSS px. Breakpoints are content-tested at compact 320–639, medium 640–1023, desktop 1024–1439 and wide 1440+; these are layout adaptation ranges, not device detection. Maximum content width is approximately 1440 px, with narrower reading/form columns. Do not force operational tables into card layouts that lose their relationships; provide a labeled scroll container or task-specific narrow alternative.

Honor reduced motion, forced colors and browser zoom. Dark mode is explicitly outside this release; it must not consume effort needed for complete light/RTL/error-state coverage. Motion is limited to orientation and feedback, not scroll hijacking or decorative delays.

### 11.4 Global states every surface must design

Initial loading, refreshing, empty-new, empty-filtered, partial, stale, permission-limited, session-expired, offline, slow, validation-error, rejected, unknown-outcome, version-conflict, unsaved, server-saved, confirmed-success, revoked/deleted, rate-limited and unsupported capability.

Design each relevant state with preserved context and a truthful recovery. Toasts are not the sole record of an inquiry, publication, message or appointment. Pending is not disabled forever. A disabled legitimate action explains its missing prerequisite without revealing protected data. Do not automatically execute a previously requested consequential action after reauthentication.

Full Hebrew testing covers layout direction, keyboard order, focus, comparison, forms, calendar, numbers, phone numbers, stable references and mixed-language addresses. Use logical CSS properties and directional isolation; do not mirror photographs, logos or media controls indiscriminately. [W3C RTL guidance](https://www.w3.org/International/questions/qa-html-dir)

## 12. Frontend data and interaction contracts

Server-render public semantic content and core forms. React Server Components handle route data where appropriate; client code owns local form drafts, interactive media and task controls. Ordinary search, listing access and inquiry must have a usable HTML/form baseline when JavaScript is delayed or unavailable. Maps and AI are progressive enhancements.

Use shared validated transport schemas, but treat server validation/authorization as decisive. Frontend view models contain only the authorized projection and enough explicit state to avoid guessing. Do not send a complete internal object and hide fields in CSS.

| View model | Mandatory contract |
|---|---|
| Public listing | Stable reference, current manifest/revision, locale, purpose, typed price/facts, public location precision, availability/freshness, approved media, allowed actions |
| Search | Query identity, normalized filters, count type, result eligibility, cursor and partial/stale scope |
| Case summary | Type, stage, disposition, owner, next action, blockers, permitted participant view and revision |
| Interest | Listing reference/revision, explicit selection/feedback, known match reasons and unresolved criteria |
| Approval view | Subject/source hashes, reviewer scope, diff, missing prerequisites, affected destinations and current eligibility |
| Message | Explicit audience, channel, draft/approval revision, logical send and observed transport state |
| Appointment | Proposal/current arrangement, time/zone, access/host state, revision and notification outcome |
| Document | Purpose, classification, audience, upload/scan/review state, allowed actions and current version |
| Operation | ID, accepted/local/external outcome, status route, per-item results and permitted recovery |

Keep committed and draft filters separate. Every async read/mutation callback carries request identity, record revision, and current identity/session generation. Ignore responses from a previous route, query or authenticated Principal. Test A→B→A navigation and sign-out/sign-in while requests are pending; an old response must not populate another person's view.

Optimistic updates are limited to reversible selections/favorites and local draft text. Server-saved state appears only after acknowledgment. Sending, confirming, approving, publishing, merging and access changes require authoritative outcomes. Timeouts reconcile the existing Operation before offering another logical attempt.

Saved items distinguish device-local, syncing, server-confirmed and failed. On sign-in, merge set intent without dropping existing server items. Do not automatically transfer a local private note to a shared Case. Storage failure explains that saving is temporary rather than pretending persistence.

Autosave drafts with an explicit revision guard; conflicts preserve the operator's input and show a field-level comparison/reapply path. No last-write-wins for material facts. Presence indicators are advisory, not locks. Poll durable operation/queue status with bounded backoff; real-time sockets are not required for launch. Refresh relevant status after tab visibility return without discarding unsaved work.

Media ordering uses stable MediaRelation identity and an atomic move-before/move-after command against the complete server-side relation set. Hidden, unsupported or paginated items retain their relative order. A bulk full-order replacement, if offered, must submit and validate the complete stored permutation. The visible subset is never treated as the whole gallery.

Private pages and downloads are `no-store`. Sign-out, a revoked-session response, or detected membership change clears in-memory private caches; restoring a page from browser history reauthorizes before revealing protected content. Refresh authorization on focus/visibility return and during bounded active-view polling. Server revocation applies to subsequent protected requests, not retroactive erasure of bytes already delivered to an open or offline browser. Service workers do not cache authenticated records or silently queue consequential offline actions.

## 13. Files, media, evidence and imports

Use separate R2 buckets/namespaces for private originals/evidence, quarantined uploads and approved public derivatives. Select EU jurisdiction explicitly; an `eu` location hint alone is not equivalent. Node uses the S3 storage adapter, not the Workers-only native R2 binding. [R2 location rules](https://developers.cloudflare.com/r2/reference/data-location/), [Payload storage adapters](https://payloadcms.com/docs/upload/storage-adapters)

Upload flow: authorize purpose and scope → reserve a staging object ID → short-lived staging upload authorization → upload → server seals a copy under a new server-only immutable key → verify that sealed object's size/type/digest → quarantine/scan the sealed bytes → safe processing → human review where required → eligible private document or approved public derivative. A client completion callback is not proof that scanning or processing succeeded.

A still-valid upload URL must never target the sealed original or a derivative. Reusing that URL after finalization can change only the staging object; it cannot replace approved bytes. Finalization is idempotent, binds the sealed object's digest to its scan/review results, and does not trust a digest asserted by the client. Replacement creates a new asset/version. Clean staging objects by an explicit expiry policy after all relevant jobs have released them.

Allow-list file types. Initial client-document inputs are PDF and common raster image formats; reject executables, HTML, SVG, scripts, macro documents and archives. Default limits are 20 MB per document and 25 MB per image; larger video/360 imports use a staff-controlled workflow with explicit quotas and timeouts. Validate actual file signatures and decoder limits, not only extension/content-type. Bundle a maintained malware scanner in the worker deployment with current signatures; unavailable/stale scanning leaves files quarantined.

Private download uses an authenticated application proxy with current record/action checks on every request, including range requests. This is the chosen mechanism for immediate future-access revocation; a previously issued signed URL would remain usable until expiry. Private bytes are never cached publicly. Public media originals keep EXIF/private-location data private; derivatives strip it and retain visible captions, rights and modification disclosures.

Malware scanning, readable extraction, human document review and professional legal validation are separate states. UI labels name the actual review scope. An attractive image or clean scan proves neither ownership nor absence of defects.

Media derivatives are immutable/content-addressed. Replacing or reordering them creates a new manifest; public approval references exact relations/assets. Broken or missing public assets block the relevant publication. Gallery/tour failures show a useful fallback without turning unavailable media into fabricated imagery.

Imports are staged. Record source, authorization, batch ID, source digest, field/unit mapping and per-row create/update/no-change/conflict decisions. Preview diffs against current revisions and protected human-reviewed fields. Explicitly select the accepted scope, execute idempotently, and expose durable per-row outcomes. Import cannot publish, mark translations approved or convert supplied facts into professional verification.

Duplicate Party/Property merges show both identities, affected private relationships and permission implications. Keep aliases and an auditable reversal/split route. A merge cannot automatically grant one party access to another's documents. Fetching remote import assets uses an allowlisted source policy, bounded downloads and SSRF protection; arbitrary submitted URLs cannot access internal networks or cloud metadata.

## 14. Hermes assistance implementation and evaluation

Hermes is a product role implemented by bounded worker tasks, not a separate autonomous agency. Its initial inference provider is OpenAI Responses API. Keep one small adapter for request/response normalization and provider failure; do not build a universal agent framework or model marketplace.

The release manifest pins an evaluated model snapshot, prompt revision, schema revision and budget limits. Model selection is a release-qualification input within this chosen architecture, like a dependency patch version; it does not delegate business authority to the model. A model/provider change reruns the relevant evaluation suite before activation.

| Task | Authorized inputs | Output and review |
|---|---|---|
| `intake.extract` | Selected permissioned property sources and broker notes | Candidate typed facts with document/page/span references, missing/conflicting values; human review before authoritative change |
| `locale.draft` | Approved BG revision, protected facts and terminology | Draft for one target locale, source binding and warnings; human language approval required |
| `case.assist` | Permitted Case summary and approved relevant property facts | Internal summary, proposed next action or reply draft; broker decides and sends |

Identity documents, financial records, legal evidence and entire mailboxes are not default model inputs. Redact/minimize inputs and require explicit purpose-appropriate permission for any exceptional source. Provider data handling and processing terms must pass the operator's procurement/privacy review before real customer material is used. EU database/object placement is not a claim that every vendor processes all data exclusively in the EU.

Use schema-constrained outputs and deterministic validation, but never treat schema validity as factual truth. PDF processing and structured outputs are available provider capabilities; the output still requires evidence and review. [OpenAI file inputs](https://developers.openai.com/api/docs/guides/file-inputs), [Structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs)

Treat every uploaded document, incoming message and retrieved excerpt as untrusted data. No document instruction can authorize tools, change recipients, widen access or select a publishing action. The model has no tools for database writes, external sending, permissions or publication. The task handler can create only a draft record after validation, using the initiating actor's recorded authorized scope.

Every draft stores input-source IDs/digests, relevant revision, model/prompt/schema version, validation result, generation time and review state. Validate source pointers against actual supplied documents; a plausible citation or URL is not evidence. Do not show an uncalibrated percentage as proof of accuracy. Use explicit unknown/conflicting/unsupported states.

Before accepting a draft, recheck source revision and current actor permission. Changed protected facts reject the stale acceptance and offer regeneration/diff. AI timeout/failure preserves the human draft and offers a manual path. Apply per-user/task concurrency and token/file/page limits; enforce a daily provider-spend ceiling with an operator-visible exception, not unlimited retries.

Release evaluation must include at least 20 broker/language-reviewed examples per public locale, 30 source-extraction examples, and 30 adversarial/conflict/authority examples, with categories balanced and overlap recorded. This is coverage, not a statistical guarantee of general accuracy. Require zero unauthorized effects, zero silently altered protected facts, and zero fabricated source pointers in the gate set. Review language quality and correction effort with competent humans; model graders are supplementary and calibrated.

The three bounded workflows must have live provider proof and manual fallback before the full release is accepted. Optional public natural-language filter assistance is disabled until separately evaluated; it cannot block ordinary search. Agent Builder and the hosted Evals dashboard/API are not dependencies: OpenAI currently schedules them for shutdown on 30 November 2026. Keep evaluation cases and prompts in the repository/application-owned tooling. [OpenAI deprecations](https://developers.openai.com/api/docs/deprecations)

## 15. Jobs, consistency, and integration recovery

Payload jobs is the sole executable queue. Run a dedicated persistent worker; disable web-process auto-run and reject public/client queue/run/schedule endpoints. The worker checks schedules with a database-backed singleton lease and idempotent period keys. Payload documents separate queues and a standalone jobs runner; application tests must establish the actual recovery behavior used here. [Payload queues](https://payloadcms.com/docs/jobs-queue/queues)

OutboxEvent is the durable business intent/journal; Payload's job record is the execution work item. Create the event, unique dispatch binding and queued work in the same awaited transaction as the originating business change. A reconciler repairs missing/cancelled dispatch bindings without creating a second queue or a second logical effect. Keep business approval and delivery outcome in domain records, not only the scheduler's status field.

Use lanes within the one worker system: urgent delivery/restriction, ordinary notifications, media processing, assistance, and maintenance/import/backup. Bound per-lane concurrency so a large media batch cannot starve an inquiry notification or withdrawal. Long human waits are saved business states; release the worker and enqueue a new task after the human event.

Every handler is safe under at-least-once execution. Claim work with a lease; persist progress/checkpoints; fence old generations; record external action ID and immutable payload before invoking a provider. Crash between provider success and local acknowledgment must enter reconciliation, not a second logical action. Exactly-once distributed delivery is not assumed.

Retry only transient failures with exponential backoff/jitter, capped attempts and deadline. Initial default is eight attempts, with provider-specific limits; a provider's idempotency deadline can end safe automatic retries earlier. Permanent validation/permission errors are not retried. Unknown consequential outcomes suspend resend and create owned operator work. An operator retry preserves the logical key and scope unless they deliberately authorize a new action.

Signed webhooks enter a deduplicated inbox event table before acknowledgment; process them asynchronously. Validate event tenant/account identity, expected object mapping and monotonic revisions. Reconcile active external actions periodically through supported provider read-back or recorded human verification. No “connected” green badge stands in for actual create/update/withdraw/delivery proof.

The only launch external business transport is application email, plus identity, maps, storage and AI provider use. Portal publication and bidirectional calendar/messaging adapters are future additions behind explicit capabilities. An external listing already managed manually remains a named manual destination/task with evidence; the product must not claim automated distribution.

## 16. Deployment, network, and supply chain

### 16.1 Concrete topology

```text
Public / Client / Staff browsers
                |
Cloudflare DNS + WAF + thin gateway (no business-state authority)
                |
DigitalOcean App Platform, Frankfurt (fra)
  ├─ Next.js / Payload web processes, at least two production instances
  ├─ Dedicated Payload worker, one active worker deployment initially
  └─ One serialized PRE_DEPLOY migration job
                |
      private VPC (fra1) + TLS
                |
HA Managed PostgreSQL primary + standby

R2 EU jurisdiction: quarantine / private originals / public derivatives
WorkOS: separate staff and client authentication applications
Resend: application email and authenticated inbound events
MapTiler: approved public map tiles
OpenAI Responses: scoped draft inference only
Better Stack: independent uptime / heartbeat alerts and redacted telemetry
Separate AWS account, S3 eu-central-1: encrypted recovery-point archive
```

App Platform uses region `fra`, whose directly connected VPC location is `fra1`; authorize its private egress as a database trusted source. Keep the database off an unrestricted public access list. App Platform's current VPC support is documented; do not combine it with an incompatible dedicated-egress configuration. [DO VPC](https://docs.digitalocean.com/products/app-platform/how-to/enable-vpc/)

Choose an HA managed database plan with standby, not the entry single-node plan. PostgreSQL 18 is the target supported major; Payload/driver/migration/jobs compatibility is a required real integration test because provider version availability is not an application certification. [DO PostgreSQL versions](https://docs.digitalocean.com/products/databases/postgresql/how-to/create/), [HA plan distinction](https://docs.digitalocean.com/products/databases/postgresql/details/pricing/)

Use one immutable application release to build distinct runnable web, worker and migration images/commands. Next standalone web output alone is not evidence that Payload config, jobs, migrations, scanners and media tools are packaged for the worker. Pin Node 24 LTS and compatible framework versions; do not select an EOL runtime merely because it satisfies a package's minimum. [Node release schedule](https://nodejs.org/en/about/previous-releases), [Payload installation](https://payloadcms.com/docs/getting-started/installation)

### 16.2 Edge and origin controls

The gateway handles approved host/legacy-route mapping, edge abuse controls and origin forwarding; it does not contain a second catalogue, permission model or application database. It strips incoming internal headers and supplies a private rotating origin-authentication secret and validated host context over TLS. The origin rejects requests without that trusted context, except deliberately minimal health endpoints. This transport authentication is separate from user authentication.

Test direct provider/default-origin URLs, forged host/internal headers, alternate HTTP methods and hidden Payload routes. WAF protection alone does not prevent direct-origin bypass. Protect all staff/client endpoints again at the application, including generated CRUD, file download, job runner and internal administrative surfaces. No anonymous GraphQL or unrestricted collection enumeration is exposed.

Set appropriate CSP, frame restrictions, MIME sniffing protection, strict HTTPS and route-sensitive referrer policy. Use same-origin CSRF protection for cookie-authenticated mutations, validate Origin/Host, and require intentional POST for state changes. Tokens/IDs are not CSRF protection. Normalize and validate redirect destinations; invitations and login return paths cannot become open redirects.

Secrets belong in provider secret stores/environment configuration, never Git, browser bundles or reports. Separate runtime, migration, backup and provider credentials with least privilege. Staging has separate databases, buckets, mail/model keys and a non-production WorkOS environment with its own applications/users/organizations. Separate applications within the production identity environment are not staging isolation. Staging cannot send to real customers or index copied production data.

### 16.3 Build and migration

Build without production database credentials/network dependence. Apply committed migrations using one authorized `PRE_DEPLOY` job after the build, with a migration lock. App Platform builds cannot access a managed database protected by trusted sources; weakening that protection to make a build pass is not the solution. [DO database integration](https://docs.digitalocean.com/products/app-platform/how-to/manage-databases/)

Use expand/backfill/verify/contract migrations. Old and new web/worker versions must coexist safely during rollout; destructive contraction occurs only after rollback is no longer required and an approved backup exists. A backfill is a resumable controlled job, not an unbounded startup hook. Do not run schema auto-push in production.

CI runs types/lint, domain and permission tests, real PostgreSQL/queue/storage integration tests, schema migration tests, UI/accessibility flows, security/dependency checks and container packaging checks. Produce a software bill of materials and immutable artifact digests. Reachable critical/high vulnerabilities block release unless a specifically documented, expiring risk disposition is approved by the responsible owner; a green scanner alone is not security proof.

## 17. Reliability, observability, recovery and cost

### 17.1 Engineering targets

| Concern | Initial release target and measurement |
|---|---|
| Public performance | Core Web Vitals good thresholds at p75: LCP ≤2.5 s, INP ≤200 ms, CLS ≤0.1; test lab conditions before launch and observe field data after sufficient traffic |
| Interactive API | p95 ≤500 ms for ordinary reads/search and ≤800 ms for local commands, excluding deliberately queued external work, under the recorded baseline load |
| Load qualification | At least 10× frozen launch inventory (minimum 10,000 test Listings), 50 concurrent public sessions and 10 active staff sessions; include worst realistic multilingual queries and media |
| Inquiry durability | One committed receipt per logical accepted submission across double-submit, process restart and lost acknowledgment; no dependency on AI/mail completion |
| Queue timeliness | Eligible urgent delivery/restriction jobs start within 30 s at baseline; backlog age and lease health are monitored |
| Service objective | 99.9% monthly availability objective for core read/intake paths; this is a target, not a guaranteed provider SLA or measured result |
| Local database recovery | Target RPO ≤5 min and RTO ≤4 h for supported within-provider recovery scenarios, proved by drill |
| Independent recovery | Sealed off-site recovery point age ≤60 min and full product RTO ≤8 h for the rehearsed loss-of-primary-data scenario, restoring into clean selected-runtime resources while required providers are available |

Web Vitals targets follow current published definitions. Low-traffic field data may be insufficient at first release; do not replace missing field evidence with a claimed measured percentile. [Web Vitals](https://web.dev/articles/vitals)

Capacity targets are explicit qualification assumptions, not traffic forecasts. If tests fail, profile and scale the chosen architecture first. A new search service or orchestration system requires evidence of the bottleneck and an architecture amendment; it is not silently added during implementation.

### 17.2 Signals and operating ownership

Record structured logs and traces with correlation/operation IDs, actor class, module, action, outcome, duration and safe error codes. Redact contact details, tokens, document bodies, prompt contents and sensitive query text. Use OpenTelemetry-compatible instrumentation and Better Stack centralized telemetry, with its Germany data region selected and approved retention; retain provider-native infrastructure metrics. Send through supported application SDK/OTLP or log-drain interfaces, not a privileged host collector unavailable on App Platform. Session replay and automated AI analysis of private logs are off. [Better Stack tracing](https://betterstack.com/docs/logs/tracing/), [Telemetry source regions](https://betterstack.com/docs/logs/api/create-a-source/)

Better Stack is also the independent uptime/on-call provider. Configure external HTTP/content checks for the canonical public paths and separately scoped readiness checks; worker progress and sealed-backup completion send heartbeats only after successful work. Exercise the first heartbeat and then an actual missed-heartbeat alert: creating a pending monitor is not proof that it will alert. Select an agency-owned plan that supports the required frequency, retention and escalation. Alerts must reach the on-call person through a tested provider-managed push/phone or equivalent independent channel, not the application's Resend queue alone. [External monitoring and alerting](https://betterstack.com/docs/uptime/monitoring-start/), [Heartbeat behavior](https://betterstack.com/docs/uptime/cron-and-heartbeat-monitor/)

Monitor external public health, inquiry transaction success, notification backlog, unowned work, publication restrictions/read-back failures, queue lease health, database saturation, object/backup coverage, failed sign-ins/permission anomalies and provider cost. Every alert has an owner, severity, response path and runbook. Alert delivery must be tested outside the same infrastructure whose failure it reports.

Separate technical measures from service measures: first useful human response within staffed hours; Cases with accountable next action; freshness/conflicts; appropriate inquiries reaching completed viewings; broker correction/re-entry effort; and failure recovery without duplicate effects. Do not optimize on raw leads or AI calls alone.

### 17.3 Backups and restore

Managed PostgreSQL provides daily backup/WAL-based recovery with a documented seven-day window; its restore procedure creates a new cluster rather than reversing the existing one in place. Verify the purchased configuration and drill it. These provider backups do not by themselves satisfy independent recovery. [DO PostgreSQL backup features](https://docs.digitalocean.com/products/databases/postgresql/details/features/), [Restore procedure](https://docs.digitalocean.com/products/databases/postgresql/how-to/restore-from-backups/)

Create a consistent recovery point every 30 minutes: database snapshot, all referenced private/public/media objects or verified immutable copies, schema/config/release references, authority policy, identity mappings, revocation/deletion ledger, operation/external-action records, and checksums. Copy immutable objects incrementally; each manifest proves completeness against its database snapshot, rather than assuming the latest bucket listing matches it. Prevent retention cleanup from deleting objects still needed by a retained recovery point. Seal the manifest only when every reference is recoverable. Alert when the newest sealed point exceeds 45 minutes; exceeding 60 minutes fails the recovery target and blocks release promotion.

Store encrypted independent copies in a separately controlled AWS account/S3 EU region. Versioning and governance-mode Object Lock protect the archive under an operator-approved retention period; backup runtime credentials cannot bypass retention or delete archives. Do not choose irreversible compliance retention without a separate policy decision. Object Lock does not itself create a complete recovery point or legal compliance. [S3 Object Lock](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.html)

Maintain an independently replicated append-only safety ledger for access revocations, deletion/restriction decisions, consent withdrawal and publication withdrawal, with sequence numbers and an acknowledged archive watermark. It is additional to the ledger in each database snapshot. Replicate changes promptly and expose replication lag; a revocation takes effect locally even when its archive copy is pending. A restore must replay the latest verifiable safety tail after the snapshot. If the tail is unavailable or completeness cannot be established, fail closed on potentially affected grants, disclosures and external actions until revalidated; if scope is unknown, that means all restored private grants and public publications. Replaying only the older snapshot's ledger does not establish current permission.

Rehearse an isolated restore with named operator and separate reviewer. The recovery destination is newly provisioned DigitalOcean application/database resources and restored R2 namespaces, using the independently held archive, release artifacts and agency-owned credentials. The eight-hour target covers primary-data loss when those required providers remain available; this release does not maintain a second active cloud or promise an eight-hour recovery during a whole-provider outage. Such an outage invokes the independently monitored maintenance/contact procedure and an explicit incident recovery decision.

Start restored systems with all external effects disabled. Validate records, object digests, the latest safety ledger, current permissions/publication, pending commitments and scheduler state; invalidate restored sessions and require fresh authentication; reconcile provider outcomes after the recovery point before enabling sending/publication. Never replay the entire old outbox automatically. Document the acknowledged data-loss window and any unrecoverable accepted activity rather than asserting zero RPO.

### 17.4 Rollback and incident modes

Rollback means reverting compatible application artifacts/configuration while preserving current customer data and operation history. Do not restore an older database merely to undo a code deployment. If data repair is required, use an explicitly approved recovery/correction procedure and preserve post-cutover inquiries.

Provide narrowly scoped switches for model tasks, outbound email, public submissions, publication, and external distribution. A kill switch stops new effects and exposes owned recovery work; it does not erase queued records or falsely mark work complete. Public maintenance mode uses a truthful static fallback and verified contact routes. Returning to normal requires health, authority, backlog and duplicate-risk checks.

### 17.5 Cost and custody

The agency owns provider accounts, domains, billing, source, artifacts and recovery keys. Use named role-based access, not a developer's personal subscription as production infrastructure. Maintain a monthly budget by hosting/database, storage/egress, identity, mail, maps, models, monitoring and independent backups. Provider plan entitlements and budgets are procurement inputs, not reasons to swap architecture silently.

Model, mail, storage and import work have enforceable quotas and cost alerts. Reduce or disable nonessential assistance on budget exhaustion; never silently discard accepted inquiries. Keep data-export and provider-exit procedures testable even though a full vendor migration is not launch scope.

## 18. Migration and public cutover

### 18.1 Preserve the whole historical surface

Migration includes properties/listings, parties and existing Cases where present, original and derived media, editorial pages/posts, taxonomies, locale routes, references, permissions, evidence, contact routes, search attribution and exact URL behavior—not only active property cards.

The checked-in historical baseline reports 457 legacy URLs across `makler-realty.com` and `makler-realty.ru`, including 165 listing routes. These are dated inventory counts to reconcile, not a fresh claim about the live sites. Media rows, accepted references and normalized object keys are different units and must have separate manifests and completeness checks.

For each exact legacy URL, record an approved retained 200, equivalent one-hop 301, or 410 decision, with rationale and target identity where applicable. Do not invent blanket homepage/search redirects. Equally, do not delete an exact previously reviewed homepage mapping merely because a general heuristic dislikes it; inspect its actual approval and equivalence. Preserve crawl parity and verify both hosts.

`makler-realty.com` is the target indexable public origin. The actual retained/redirect/terminal behavior of `.ru` comes from the reviewed mapping, not a hostname-wide assumption. Public/private host creation and DNS/certificate changes require authorized ownership and change approval. Preserve mail-related DNS and existing business email during cutover.

### 18.2 Data migration procedure

Capture read-only source exports and checksums. Build stable legacy-ID mappings and a staging import report. Reconcile creates, updates, duplicates, conflicts, unsupported records and missing media. Preserve protected facts exactly and retain the source URL; do not let extraction/translation “clean up” commercial data.

Each source listing receives a human-reviewed disposition: approved active publication, truthful historical/preservation surface, pending/unpublished, or approved terminal removal. Unknown facts can be truthfully represented; contradictory facts, missing rights or absent required authority cannot be disguised as verified inventory. An old as-is publication exception is not new factual review or automatic translation permission. Record the exception's exact scope and reconcile it against the current release rules.

Rehearse migration on production-shaped data in isolated infrastructure; compare counts, keys, relationships, revisions, permissions and presentation. Prove every referenced approved public asset exists and private assets are inaccessible. Run the full legacy URL map against the candidate gateway/application, including canonical, hreflang, metadata and sitemap consistency.

### 18.3 Controlled ownership transition

Prefer a short controlled write freeze for the final delta over improvised bidirectional synchronization. Before the freeze, capture all existing accepted inquiries and commitments. During the freeze, keep one clearly designated durable intake path or show the truthful contact fallback; do not let both old and new systems accept untracked authoritative writes.

Import the final delta, reconcile, seal the pre-cutover recovery point, disable old consequential workers, and switch the approved routing. Test public detail/search, inquiry/receipt, staff access, client access, media, mail and legacy routes immediately. Record exact artifact, schema, policy and infrastructure versions. Keep the old deployment read-only for investigation and rollback compatibility; do not let its delayed jobs send or republish.

Search Console, Yandex Webmaster, backlinks and crawl baselines remain required evidence under the current instructions. Collect pre-cutover ownership/baseline evidence where feasible, then post-cutover routing, sitemap/submission and observed coverage evidence at the appropriate stage. No claim of immediate indexing, ranking recovery or backlink transfer is permitted. Explicitly distinguish candidate acceptance, authorized cutover, and verified public operation.

Map existing staff identities and authorized client relationships into the new authentication model through an approved migration table. Preserve business IDs and grants; do not auto-promote a newly authenticated user because an email resembles a former administrator's address. Staff must complete the new invitation/MFA flow before cutover. Old sessions and old privileged endpoints are revoked/disabled at the ownership transition.

## 19. Complete flow and screen traceability

The earlier identifiers are retained solely to demonstrate that consolidation has not lost a requirement. “Included” means a complete release obligation in the surfaces and contracts above; it does not mean already implemented. “Bounded intake” means the explicitly supported request path, not the omitted underlying business platform.

### 19.1 All 32 prior flows

| Flow | Final disposition and implementation home |
|---|---|
| F01 Arrive with intention | Included: public home/service entry and supported geography/locale |
| F02 Search/refine/recover | Included: results/filter/map with normalized query and recovery |
| F03 Evaluate property | Included: approved property detail, facts/media/uncertainty |
| F04 Save/compare/decide together | Included: local saves, authenticated Interests and scoped sharing |
| F05 Saved-search alerts | Included: verified opt-in, deterministic daily digest and revocation |
| F06 Question/callback | Included: durable anonymous Inquiry and staffed follow-through |
| F07 Viewing | Included: request/propose/confirm/reschedule/complete; no instant booking claim |
| F08 Area/process guidance | Included: approved content with country/service scope and professional-review rules |
| F09 Old/unavailable listing | Included: truthful historical/preservation surface and exact legacy mapping |
| F10 Seller/landlord assessment | Included: minimal intake, source context, scope/authority review |
| F11 Service and instructions | Included: Seller Instructions, participant scope and agreement evidence |
| F12 Publication/marketing progress | Included: exact preview, instructions, publication and client-visible factual summary |
| F13 Verify/return | Included: client-context AuthKit, invitation and safe recovery |
| F14 Progress/next action | Included: contextual client Case overview and owned commitments |
| F15 Documents | Included: purpose-bound upload, quarantine, audience, review and private download |
| F16 Proposal/decision | Included: versioned terms and coordination; no electronic-signature or legal-completion claim |
| F17 Conversation continuity | Included: Case messages, application email/reply ingestion, truthful manual external-channel notes |
| F18 Triage | Included: Inquiry queue, duplicate suggestion, assignment and disposition |
| F19 Today/handover | Included: commitments, coverage and receiving-owner acceptance |
| F20 Case work | Included: stage/disposition/next action and closeout |
| F21 Matching | Included: deterministic criteria and Interest explanations; no opaque eligibility score |
| F22 Calendar/itinerary | Included: internal resources, manual external-busy check and ICS updates |
| F23 Property preparation | Included: integrated property workbench and source/media review |
| F24 Translate/publish/withdraw | Included: exact manifests, human approvals, atomic eligibility and generation fences |
| F25 Service quality/integrations | Included: actionable metrics, delivery exceptions and ownership |
| F26 Long-term renting/letting | Included: brokerage workflow with rental vocabulary/cost basis; ongoing management excluded |
| F27 Short stay | Bounded intake only where staffed: request/quote coordination; no reservation/payment engine |
| F28 Property management | Bounded intake/referral only where offered: no dispatch, owner ledger or statements |
| F29 AI assistance | Included: three private draft workflows; no general public chatbot |
| F30 Preferences/access/privacy | Included: purpose-specific eligibility, grants, export/correction/deletion work |
| F31 Material correction | Included: affected-publication restriction and dependency reconciliation |
| F32 Import/merge/bulk work | Included: staged diffs, exact scope, durable per-item outcomes and safe reversal |

### 19.2 All 75 prior screen contracts

Grouped rows enumerate every ID exactly once. Panels share record shells and business commands; they still require the relevant states in §11.4.

| Prior IDs | Final surface and disposition |
|---|---|
| P01 | Home/service entry — included |
| P02, P03, P04, P22 | Results with filter sheet, map and recovery states — included |
| P05, P06, P21 | Property detail with media viewer and unavailable/preservation states — included |
| P07, P08, P09 | Compare, saved and public-facts shortlist — included |
| P10 | Saved-search subscription/preferences — included |
| P11, P12 | Inquiry and durable receipt — included |
| P13, P14 | Viewing request and authorized appointment status — included |
| P15, P16 | Areas and approved service/guidance content — included |
| P17, P18, P19 | Sell/Let entry, owner intake and receipt — included |
| P20, P24 | Contact, help, privacy/preferences and accessibility — included |
| P23 | Supported short-stay service request — bounded intake only; no booking surface |
| C01, C02 | Client sign-in and invitation acceptance — included |
| C03, C11, C16 | Role-appropriate Case overview and closeout — included |
| C04, C05 | Brief and Interests/shortlist/feedback — included |
| C06 | Appointment detail and change proposals — included |
| C07 | Scoped Case messages — included |
| C08, C09 | Documents and upload workflow — included |
| C10, C12 | Proposal review and owner listing preview — included |
| C13, C17, C18 | Preferences, scoped participants and privacy requests — included |
| C14 | Service-intake receipt/owned Case only; maintenance lifecycle excluded |
| C15 | Owner financial statement — explicitly excluded; no empty placeholder route |
| O01, O18 | Today and commitments — included |
| O02, O03 | Inquiry/communications triage with original request — included |
| O04, O05, O06, O07 | Cases, Case detail, Party relationships and Interest matching — included |
| O08, O09 | Calendar and Appointment — included |
| O10, O11, O12, O13, O14 | Inventory and property workbench tabs — included |
| O15, O16, O17, O33 | Translation/release/distribution/material-correction review — included |
| O19, O20 | Proposal and document review in Case workspace — included |
| O21 | Editorial content workspace — included |
| O22, O25, O26 | Reports, integration exceptions, audit/privacy operations — included |
| O23, O24 | Team/access and service-policy settings — included |
| O27, O28 | Duplicate resolution and staged import/bulk results — included |
| O29, O30 | Supported service-intake Case handling only; booking/dispatch operations excluded |
| O31 | Owner-statement reconciliation — explicitly excluded; no financial ledger |
| O32 | Contextual AI draft review within each owning task — included, not a separate chat app |

### 19.3 Required transport surface

These are application endpoints, not a promise to expose raw collections. The same domain command implementation serves UI forms and authenticated API routes. Public/client/staff routes are mounted only on their appropriate host and validate the correct Principal context.

| Group | Required endpoints/commands | Contract |
|---|---|---|
| Public read | Search, published listing, approved editorial content | Public projection only, locale/eligibility enforced, bounded query |
| Public submission | Receive Inquiry, reconcile receipt, seller intake, viewing request | Payload-bound idempotency, rate/abuse controls, durable acceptance |
| Client read/update | Permitted Cases/Interests; propose Brief/feedback; request change; post Case message | Record/field audience and revision checks |
| Invitations/preferences | Accept/revoke invitation, verify contact, edit/unsubscribe alert, privacy request | Explicit POST, current recipient identity, purpose-specific state |
| Agency commands | Assign/handover Case, transition stage, manage Interest/commitment, confirm/change Appointment, version Proposal | Capability, revision, evidence and atomic side-effect intent |
| Inventory/publication | Revise facts/listing/media, submit review, approve, publish/restrict/withdraw/correct | Exact manifest, source/actor checks, generation fence |
| Files | Start/finalize upload, request/review document, authorized download/export | Purpose, type/size/digest, scan, audience and no public caching |
| Jobs/imports | Preview/execute selected batch, inspect Operation, reconcile/retry allowed work | Stable logical identity, no unsafe replay or public queue runner |
| Provider ingress | WorkOS/Resend webhook receivers | Signature/account checks, durable deduplicated inbox, no untrusted authority |
| Operations | Minimal health; authorized readiness/audit/provider status | No secrets; exact release/evidence identity; permissioned detail |

Produce a versioned OpenAPI/transport-schema artifact for these endpoints during implementation. It must include status/error shapes, pagination, idempotency, authorization class, revisions and representative examples. Do not invent a separate API implementation whose behavior diverges from the UI command path.

## 20. Acceptance portfolio and release gates

### 20.1 Evidence hierarchy

Design frames establish intended interaction. Unit/integration tests establish behavior under their recorded conditions. Authenticated provider tests establish a particular connected path. Deployed observations establish what happened on a particular release. Human review establishes its stated scope only. None automatically substitutes for the others.

Every evidence artifact records schema version, environment, release SHA/image/gateway digest, policy revision, relevant data/config digest, observation time, source/tool identity, actor/reviewer where required, assertion results and redaction status. Evidence for another release or policy does not clear a gate by filename alone. Generated views carry the same snapshot ID.

### 20.2 Required executable acceptance scenarios

| ID | Scenario and required result |
|---|---|
| AT01 | Anonymous browse/search/detail/inquiry completes without registration and with delayed/disabled JavaScript |
| AT02 | Filters survive detail/back/refresh; an old query response cannot overwrite a newer query |
| AT03 | All seven locales complete search, inquiry, receipt and recovery; Hebrew passes full RTL/mixed-direction review |
| AT04 | Unknown feature/area/price basis remains unknown; hard filters never silently relax |
| AT05 | Draft/unapproved/stale-locale records appear in no public result, count, map, metadata or sitemap |
| AT06 | Map provider failure leaves a usable list, facts, filters and contact path |
| AT07 | Exact reference, misspelling and approved Cyrillic/Latin/local-name variants return the reviewed expected inventory |
| AT08 | Saved/compare works with unavailable storage, changed price and withdrawn listing; sign-in merge does not drop server items |
| AT09 | Public share contains public facts only; revoked/expired links reveal no private Case information |
| AT10 | Double tap, browser retry and lost response create one Inquiry receipt for one logical payload |
| AT11 | Reusing an Inquiry key with a different payload is rejected; receipt enumeration cannot read personal data |
| AT12 | Process restart/mail/AI outage after commit retains accepted Inquiry and its accountable queue ownership |
| AT13 | DB outage returns no false receipt and shows verified contact fallback; safe draft is retained in the current tab |
| AT14 | Unowned/due Inquiry escalates under actual staffed hours; first useful response is distinct from auto-acknowledgment |
| AT15 | One buyer considers five Listings with separate Interests/feedback and one Case; declining one does not close the others |
| AT16 | A party with buyer and seller roles sees only each explicitly permitted Case audience |
| AT17 | Handover preserves commitments, context and grants; revoked staff cannot leave live Cases unowned |
| AT18 | Seller intake does not infer ownership; exact Seller Instruction and preview scope are recorded before publishing |
| AT19 | Two simultaneous draft/fact edits produce a revision conflict with preserved input, not last-write-wins loss |
| AT20 | Media reorder preserves hidden/paginated/unsupported relations and duplicate asset placements |
| AT21 | Price, area, bedroom, location, reference and source URL survive import/translation without silent transformation |
| AT22 | Same-person review is honestly recorded; a locale reviewer cannot approve publication or legal claims without separate capability |
| AT23 | Source changes after translation approval invalidate affected publication and stale acceptance |
| AT24 | Material correction removes inaccurate affected views before replacement; unaffected eligible locales remain consistent |
| AT25 | Old queued publication after withdrawal cannot resurrect any locale/destination |
| AT26 | Direct CRUD, internal admin, job and API paths cannot bypass publication or authorization commands |
| AT27 | Website, public API, JSON-LD, sitemap, hreflang, comparison, alert and enabled feed agree on eligibility/current revision |
| AT28 | Public-media restriction/purge is verified; private originals, EXIF location and documents never leak |
| AT29 | Viewing request is never shown as confirmed before host/access/resource checks |
| AT30 | Concurrent Appointment confirmations cannot overlap the same exclusive resource |
| AT31 | DST ambiguity, travel buffer and client/broker timezone displays preserve the intended instant |
| AT32 | Rescheduling retains the old confirmation until replacement; ICS UID/SEQUENCE and reminders reflect the committed change |
| AT33 | Cancellation/no-show/completion releases or preserves resources correctly and creates appropriate follow-up |
| AT34 | Proposal amount/party/deadline change invalidates old approval; expired/countered version cannot be accepted as current |
| AT35 | Completion needs the configured evidence and remaining-obligation disposition; it does not assert legal completion automatically |
| AT36 | Client-token substitution, wrong application/issuer/audience, expired token and missing staff membership are rejected |
| AT37 | Staff MFA, reauthentication and recovery are exercised through real provider configuration |
| AT38 | Invite preview/scanner GET cannot consume or accept; wrong-recipient and revoked-invite cases are safe |
| AT39 | Local revocation blocks subsequent requests/downloads; detected revocation clears private view caches; history restoration reauthorizes before revealing content |
| AT40 | Client/co-buyer/broker/coordinator/reviewer permissions pass explicit allow-and-deny tests for records and fields |
| AT41 | CSRF, forged origin/internal headers, direct provider origin and hidden collection/runner paths cannot bypass controls |
| AT42 | Upload interruption, wrong type, oversize, malicious file, stale scan and missing object remain non-public/quarantined; reusing an upload URL cannot change sealed/scanned bytes |
| AT43 | Private download/range/export reauthorizes; public bucket and CDN cannot retrieve restricted evidence |
| AT44 | Consent withdrawal stops already queued alerts; service and marketing choices do not merge |
| AT45 | Privacy export excludes other parties; deletion/revocation survives derived stores and a restore |
| AT46 | Human-reviewed Message sends once across retry/crash; changed payload cannot reuse approval/idempotency identity |
| AT47 | Provider timeout is unknown; replay beyond the 24-hour dedupe window requires reconciliation, not blind send |
| AT48 | Forged/replayed/out-of-order webhooks do not grant access, duplicate work or falsify delivery |
| AT49 | Incoming spoofed/ambiguous sender or attachment reaches safe triage/quarantine, not automatic private access |
| AT50 | Worker crash, expired lease, repeat schedule and partial batch complete without lost or duplicated logical effects |
| AT51 | Revoked actor or stale source generation prevents queued consequential action |
| AT52 | AI injected instructions cannot publish/send/grant access; outputs have verified source pointers and protected-field checks |
| AT53 | AI source changes, refusal, timeout, budget exhaustion and provider outage leave manual workflows intact |
| AT54 | AI locale/extraction/adversarial corpus meets §14 gates and records human correction effort |
| AT55 | Import dry run changes no live record; selected execution preserves reviewed fields and gives per-row outcomes |
| AT56 | Duplicate merge cannot widen access; alias references and split/recovery preserve history |
| AT57 | Every frozen legacy URL on both domains matches its exact approved response and canonical/locale behavior |
| AT58 | Media completeness compares the correct unit/key manifest, with zero missing public runtime references |
| AT59 | Old and new write paths/workers cannot both own consequential work during cutover |
| AT60 | Web/worker/migration images run the pinned release, with build-time DB isolation and backward-compatible migration |
| AT61 | Accessible complete tasks pass keyboard/screen-reader/zoom/reduced-motion/forced-colors and mobile virtual-keyboard checks |
| AT62 | Performance/load targets hold under the frozen dataset/network assumptions; queue maintenance does not starve urgent work |
| AT63 | Alerts reach the named owner during representative dependency, queue, publication, intake and backup failures |
| AT64 | Managed and independent recovery drills restore coherent data/media, replay the newer safety ledger or fail closed, invalidate restored sessions and prevent external-action replay |
| AT65 | Application rollback preserves inquiries and commitments accepted after deployment |
| AT66 | Provider account custody, budgets, secrets rotation, access revocation and operational runbooks are usable by the agency |
| AT67 | Readiness JSON, checklist and signed evidence views agree on one release/policy/scope; any blocked gate prevents a pass |
| AT68 | Post-cutover host/certificate/mail-DNS/search/intake/auth/media checks and required external SEO observations are recorded |

Cross-cut this portfolio by representative desktop/mobile widths (including 320 px), the three staff languages, seven public/client locales, guest/client/collaborator/staff role contexts, and success/failure/recovery. Do not run every cosmetic combination mechanically; cover every authority/behavior distinction and every advertised complete journey.

### 20.3 Gate order and pass conditions

| Gate | Required exit evidence | Dependency |
|---|---|---|
| R00 Authority and release contract | Current instruction/artifact conflicts explicitly reconciled; final scope, owners, policy and evidence schema accepted | Before a new readiness verdict or production transition |
| R01 Foundation | Typed domain/migrations; real identity context; allow/deny tests; command/transaction/queue invariants | Before private operational features depend on it |
| R02 Inventory/publication | Seller/source/media review, exact manifests, locales, correction/withdrawal and historical dispositions | Before public inventory is enabled |
| R03 Discovery/intake | Complete approved search/detail/saved/compare plus durable inquiry and staffed assignment/response | Before acquisition traffic is routed to the candidate |
| R04 Case continuity | Brief/Interests, handover, viewing/resource/ICS, proposals, documents and closeout | Before complete agency-service acceptance |
| R05 Communication/privacy | Real provider send/receive/failure proof, grants/revocation, consent and privacy workflows | Before customer messaging/private access is enabled |
| R06 Assistance | Three evaluated draft workflows, live provider evidence and manual fallback | Before AI capability is enabled or full feature acceptance |
| R07 Migration/media | Complete URL/data/media mapping and rehearsed final-delta procedure | Before canonical-domain cutover |
| R08 Reliability/security | Packaging/load/security checks, alerts, HA, independent recovery and rollback drills | Before cutover authorization |
| R09 UX/content | All advertised task paths, seven-locale/RTL/accessibility review, real approved copy and measured performance | Before general public release |
| R10 Candidate attestation | Fresh exact-release evidence; no unmet pre-cutover gate; operator custody and cutover approval | Before the authorized routing change |
| R11 Cutover verification | Real domains/certificates/mail DNS, intake, identity, media, URL/SEO observations and external proof for the deployed release | Before declaring the public deployment verified |
| R12 Operational acceptance | A complete staffed operating cycle including overnight scheduled work and backup completes without an unresolved release-severity incident; named owner signs handoff | Final release acceptance, with ongoing monitoring thereafter |

These are dependency gates, not an implementation calendar. Some work can proceed in parallel, but an upstream invariant cannot be replaced by a downstream polished screen. Controlled cutover is an explicitly authorized verification stage, not permission to call unmet post-cutover evidence passed beforehand.

Security/privacy leakage, unauthorized effect, lost acknowledged request, incorrect commercial fact exposure, stale publication resurrection, failed recovery or broken critical task is release-blocking. Minor visual defects may be accepted only with a named owner, bounded impact and recorded disposition. An unavailable core provider cannot be hidden behind a feature flag while claiming the specified full release complete.

## 21. Current authority reconciliation and operator inputs

### 21.1 What the self-audit actually observed

The following are observations of checked-in files read on 24 September 2026, not live-service findings:

- `launch-readiness.json` (legacy, tag legacy-app-final) is dated 27 August 2026 and reports `launch_ready: false`, with live services, monitoring/rollback, Payload runtime and production recovery blocked.
- `launch-input-checklist.md` (legacy, tag legacy-app-final) is dated 4 September and also blocks R2 media coverage, which the JSON marks passed.
- The checklist describes PostgreSQL live search evidence, while the supplied AGENTS instructions require live Typesense/Meilisearch reports.
- Required Search Console, Yandex and backlink evidence is not consistently staged across the instructions, checklist and repository glossary; one artifact calls historical SEO evidence optional.
- A recorded source-catalogue publication pass coexists with outstanding broker verification and zero publish-ready candidates in a separate manual audit. These are different claims and evidence classes; they cannot be collapsed into “all facts verified.”

The governing instruction is explicit: “Do not call the system production-ready while any launch gate is blocked.” This specification does not clear those gates, invalidate a real existing approval, or assume the dated files describe current live infrastructure.

### 21.2 Required R00 decision record

Before using a new release verdict, the agency's accountable owner and technical release owner must approve a policy revision that:

1. Names the selected architecture and maps every old gate to its retained obligation, explicit replacement proof, or explicitly approved retirement.
2. Resolves the Typesense/Meilisearch-versus-PostgreSQL evidence conflict. PostgreSQL is the final runtime design; the existing external-report requirement is not silently satisfied or waived by a PostgreSQL report. Until an explicit authority amendment exists, the conflicting required proof remains outstanding.
3. Retains Search Console, Yandex, backlinks and crawl evidence, assigns feasible pre/post-cutover stages, and documents any later requested change explicitly.
4. Reconciles media counts/units and evaluates coverage from the same actual release and object manifest.
5. Distinguishes source-as-is authorization, factual review, media rights review, translation approval and current availability. Records one valid human-review disposition for every in-scope listing row.
6. Maps old Payload identity/runtime and Hermes service checks to actual new runtime/identity/task evidence. A renamed component or a stub endpoint is not replacement proof.
7. Defines signed recovery/release evidence, trusted verification keys, reviewers, freshness and immutable release/config references.
8. Regenerates JSON and human-readable checklist from one policy/evidence snapshot and verifies their verdicts agree.

This is a required governance transition, not a reopening of the chosen architecture. Reversible development and tests can proceed; public release cannot bypass it. Do not modify AGENTS, current approvals or readiness files as a side effect of generating documentation.

### 21.3 Release manifest and freshness

The manifest must contain product/spec version; Git SHA; web/worker/migration/gateway image or artifact digests; dependency/model/prompt/schema revisions; environment and provider account references without secrets; database schema and migration state; domain/redirect/media/data-import manifest digests; scope/services/regions/locales/channels; policy/role/retention/template revisions; evidence IDs; named operator/reviewer approvals; backup/recovery-point identity; and the approved cutover/rollback procedure.

Critical deployed-path checks, provider connectivity and monitoring/rollback evidence must be no older than 24 hours at candidate attestation; repeat the actual routing/auth/intake/media checks at cutover. Recovery-point age follows §17's stricter limit. Human approvals are revision/scope-bound rather than merely “recent”; availability review follows its own policy. Evidence freshness cannot be refreshed by copying a timestamp.

Keep the required human listing review CSV, redacted live search/worker/runtime reports, R2 coverage, recovery report, SEO evidence and release attestations. Preserve the current requirement for operator-authorized Ed25519-signed recovery evidence until a specifically approved successor policy replaces it. The private signing key stays outside committed files and ordinary application runtime. A valid signature establishes the signer and unchanged artifact, not the truth of invented test data.

### 21.4 Inputs required from the operating business

| Input | Accountable owner | Safe behavior until supplied | Gate |
|---|---|---|---|
| Legal entity, real contact details, office/service coverage and supported regions | Agency owner | No invented contact or geographic/service claim | R00/R09 |
| Named team, reviewer/publisher/privacy/release roles, absences and business hours | Agency manager | No public speed promise; no unowned live intake operation | R00/R03 |
| Locale reviewers and supported response arrangements for all enabled languages | Content/service lead | Unapproved locale content remains unpublished | R02/R09 |
| Seller authority, rights, public-address precision and review dispositions | Assigned broker/publisher | Restricted/unpublished material remains private | R02 |
| Country-specific commercial/professional-process copy and document policy | Agency plus appropriate professionals | No legal/tax/ownership conclusion asserted by software | R02/R04 |
| Contact purpose, retention, deletion/hold and vendor data-processing policy | Authorized privacy owner | No production personal-data capture without accepted policy | R00/R05 |
| Agency-owned provider accounts, plans, data terms, quotas and billing | Agency/technical owner | Staging/synthetic tests only; no silent use of personal accounts | R01/R08 |
| Domain/DNS/certificate ownership and change authorization | Domain owner | No cutover or mail-DNS change | R07/R10 |
| Actual legacy exports, approvals, URL/media maps and source reconciliation | Migration owner | No invented redirect or asset-completeness assertion | R07 |
| Required external search/SEO/Hermes/Payload/media evidence and policy conflict resolution | Release owner | Readiness remains blocked | R00/R10/R11 |
| Recovery custody, signing authority, tested fallback and incident contacts | Operations owner | No release without usable recovery and accountable response | R08/R10 |

These inputs do not choose between competing products or data models. They supply the real-world authority, accounts, content and operating conditions that no architecture document can truthfully manufacture.

## 22. Development handoff and definition of done

### 22.1 Dependency-based delivery slices

1. **Foundation and executable contracts:** implement domain schema, exact identity contexts, authorization, revisions, command receipts, transactional work and the release-evidence schema. Qualify the concrete provider/runtime topology in isolated accounts.
2. **Inventory-to-public truth:** implement seller intake, source/media review, BG/localized revisions, publication eligibility, correction/withdrawal and migration staging. Use approved realistic data, not fabricated public inventory.
3. **Discovery-to-owned inquiry:** complete public layouts, seven-locale forms, search/saved/compare and durable intake with actual broker assignment/response. Begin accessibility/performance checks on complete paths.
4. **Case continuity:** finish Brief/Interests, invitations/private workspace, messages, documents, appointments, proposals, handover and closeout. Prove the multi-party privacy and failure paths.
5. **Assistance and operations:** add the three evaluated draft tasks, imports/merges, privacy work, operational metrics and exception handling on the already proven domain commands.
6. **Release qualification:** rehearse data/URL/media migration, packaging, load/security, recovery, rollback and operator runbooks; resolve R00; assemble exact-release evidence.
7. **Authorized cutover and acceptance:** perform the reviewed ownership/routing transition, run deployed checks and required external observations, complete the operating-cycle acceptance and transfer custody.

Independent work can run in parallel where its interface and ownership are clear. Do not allow parallel implementation to create competing schemas, auth middleware, publication logic or design systems. Merge by complete behavior with focused tests, not by counting pages or agent outputs.

### 22.2 Required implementation artifacts

The engineering handoff must include one schema/migration history; typed domain/transport contracts; capability/record-field authorization matrix; state-transition tests; complete design tokens/components and representative responsive/RTL states; generated endpoint schema; provider configuration/runbooks; import/redirect/media manifests; evaluated AI corpus and configuration; automated acceptance evidence; recovery/cutover/rollback procedures; and the release manifest with operator sign-off.

The designer's file must organize public, client, staff and shared components, then group task flows and exceptional states. Each frame/prototype identifies the route/surface, actor, data state, relevant command/outcome and acceptance IDs. Use fictional private data and genuinely approved public examples. A desktop hero or static frame does not demonstrate a complete task.

Definition of done for a feature: its actual authorized actor can complete the task in the deployed candidate, the relevant negative/recovery cases pass, state survives the documented interruptions, dependent external outcomes are represented truthfully, permissions are enforced server-side, and a named operator can support it.

Definition of done for this public release: all included scope is accepted; all required gates and existing authority obligations have passed or have an explicitly approved, visible successor decision; exact deployed evidence and human approvals are bound to the release; real cutover and operating-cycle checks pass; no release-severity incident is unresolved; agency custody and recovery are exercised. This document itself satisfies none of those runtime gates.

### 22.3 Research and confidence limits

Current capability checks used official documentation for Payload transactions/authentication/jobs/localization/storage, PostgreSQL constraints/search, DigitalOcean runtime/VPC/database/restore, WorkOS application/session/MFA behavior, Resend delivery/ingress, R2 data location, MapTiler maps, OpenAI document/structured-output/lifecycle behavior, Better Stack telemetry/monitoring, AWS recovery storage, and W3C/Google web standards. Links appear beside the claims they support.

Accessibility acceptance targets WCAG 2.2 AA across complete tasks, with manual assistive-technology testing; neither chosen components nor this specification establish conformance. [WCAG 2.2](https://www.w3.org/TR/WCAG22/)

The research skill informed provider verification and the independent challenge of prior recommendations. Domain modeling fixed Property/Listing/Case/Interest/Proposal meanings; module-design principles concentrated invariants behind shared interfaces. The final design remains an engineering judgment derived from the agency's jobs, failure costs and current capabilities, not a proven claim of universal optimality or legal compliance.

No application implementation, provider provisioning, production validation or customer study was performed by writing this specification. The final architecture is selected; implementation quality and public-release readiness must now be earned against the explicit contracts above.
