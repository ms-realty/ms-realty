# MS Realty — Target-State Experience & Workflow Specification

Version 1.0 · 21 September 2026 · Product strategy, UX, UI, layout, and frontend handoff

**Design status:** proposed future target, ready for design exploration and validation. This is not an inventory of the current implementation, an approved legal process, or evidence of production readiness.

> Repository note: this file is the product authority for the rebuild described in `docs/plan.md`. Screen (`P`/`C`/`O`), flow (`F`), layout (`L`) and acceptance (`A`) identifiers are referenced from code, tests and pull requests.

## 00. How to use this document

This specification starts from the decisions people must make and the work an agency must reliably perform. It deliberately does not use existing MS Realty screens, source code, technical architecture, or internal specifications as design authority. Existing implementation effort must not constrain the target experience.

The business frame carried into the brief is a human-led real-estate agency serving Sandanski and relevant Bulgarian and Greek property journeys, with multilingual customers. Sandanski is an inland destination; the interface must not imply a seaside location. Geographic coverage and individual services must be confirmed before they are advertised. The language planning set is Bulgarian, English, Russian, German, Dutch, Greek, and Hebrew for the public experience, and Bulgarian, Russian, and English for staff. These are design coverage assumptions, not claims that those services or translations are currently available.

Three kinds of statement appear here:

- **Requirement:** a rule of this proposed experience. “Must” means the designer and implementer must preserve it unless an explicit product decision changes the specification.
- **Recommendation:** a deliberately chosen starting point, to be validated with customers and operators. Numeric layout, capacity, and usability targets are recommendations unless identified as a published standard.
- **External guidance:** a narrowly attributed principle or standard with a linked primary source. Applying general research to real estate is our design inference, not a measured MS Realty result.

“State of the art” means a coherent, accessible, resilient, evidence-aware experience with carefully designed human handoffs. It does not mean that novelty is valuable by itself, that AI should own every interaction, or that this proposal has already outperformed alternatives in user research.

The intended readers and their starting points:

| Reader | Read first | Expected output |
|---|---|---|
| Product/service designer | Chapters 01–07, then 08–13 | Service blueprint, roles, journey prototypes, validated product decisions |
| UI/visual designer | Chapters 06, 14–18 | Responsive screen system, content hierarchy, components and state variants |
| Frontend designer/engineer | Chapters 07, 15–20, 22 | Route and state model, component contracts, integration seams, accessible behavior |
| Agency operator | Chapters 03, 05, 07, 11–13, 23 | Ownership rules, operational policies, exception handling, approval configuration |
| QA/research | Chapters 17, 20–23 | Scenario coverage, task studies, acceptance evidence and unresolved risks |

Identifiers are stable handoff references: `F` = flow, `P` = public screen, `C` = client screen, `O` = operator screen, `L` = layout recipe, `A` = acceptance scenario. A screen identifier describes a meaningful task surface, not a mandatory separate URL. A panel can fulfill a screen contract on desktop and become a full page on mobile.

## 01. The product thesis

**MS Realty should help a person move from an uncertain property intention to a well-understood, human-supported next step, while giving the agency a dependable way to carry that commitment through.**

The signature experience is continuity. A buyer's requirements survive search, comparison, an inquiry, a broker conversation, a viewing, and an offer. A seller's facts and instructions survive intake, preparation, publication, inquiries, feedback, and completion. Neither party should have to reconstruct their story because they changed channel, device, language, or assigned broker.

The target has three connected experiences:

1. **Discover:** a fast public website for finding properties, understanding places and services, evaluating evidence, and contacting a real person.
2. **My property journey:** a lightweight, private client workspace for a shortlist, conversations, appointments, documents, and the next agreed action.
3. **Agency workspace:** a task-led operating environment for the people delivering the service: inquiries, client cases, property preparation, publication, calendars, approvals, and follow-through.

These experiences share identity and records, but not information visibility. Public discovery must not expose private client data; a buyer and seller connected to the same property must not acquire access to one another's private case.

### 01.1 The eight decisive design choices

| Decision | Reason | Visible consequence |
|---|---|---|
| Browse and inquire without an account | People arrive to solve a property question, not to manage software | No registration wall before search, contact, or a viewing request |
| Keep structured search primary; offer language assistance as an accelerator | Property criteria need to be inspectable and correctable | Every interpreted criterion becomes an editable filter; uncertain criteria remain questions |
| Use a shared decision workspace after interest becomes meaningful | A property decision usually unfolds over repeated visits and conversations | Private shortlist, agreed requirements, next action and correspondence in one place |
| Separate property, listing, inquiry, case, offer, and appointment | Each changes for a different reason | Independent states; no single ambiguous “status” field |
| Make the next action more prominent than aggregate metrics | Staff must deliver commitments before analyzing performance | Today is a work queue; reporting is a separate destination |
| Show evidence and uncertainty at the point of decision | Trust depends on understanding what is known and who checked it | Field-specific provenance and freshness; unknowns stay visible |
| Put assistance inside the task | A separate chat interface adds context-switching for routine work | Explain a filter, draft a reply, compare differences, summarize a case in context |
| Require deliberate human action for consequential external effects | Publication, customer communication and transaction decisions carry real consequences | Review the exact recipient, content, scope and version before execution |

### 01.2 What success looks like

A visitor can answer: “Does this agency cover my need?”, “Which properties are worth discussing?”, “What is uncertain?”, and “What happens if I contact them?” A client can answer: “Where are we?”, “What do I need to do?”, and “Who is handling it?” A broker can answer: “What needs attention now?”, “What was agreed?”, and “Can I safely do the next thing?”

The target does not attempt to become a nationwide open marketplace, an autonomous legal adviser, a lending decision engine, a social network, or a general-purpose ERP. Transaction coordination belongs in scope; making legal determinations and independently verifying ownership do not become software capabilities merely because a checklist exists.

## 02. First principles and jobs to be done

### 02.1 The design reasoning

**A property is expensive to investigate and difficult to reverse.** Prioritize disqualifying facts, clarity of costs, useful comparison, and human verification over engagement tricks. Do not optimize for the number of inquiries irrespective of fit.

**The decision is distributed over people and time.** Preserve criteria, reasons, questions and approved information across sessions. Shared participation must be explicit; a spouse, co-owner or adviser is not automatically authorized to see every document.

**Inventory is heterogeneous and incomplete.** A uniform card is helpful, but a blank fact is not a negative fact. Area bases, bedroom definitions, renovation condition, availability and location precision must retain their meanings.

**An agency is a service organization with limited attention.** Every accepted request needs ownership, a next action, and an exception path. The UI should reveal workload and failures early enough for a human to act.

**Useful trust is specific.** “Price confirmed with owner on [date]” means something; a general “verified” seal can imply checks that never occurred. Distinguish supplied facts, reviewed documents, professional advice, and system calculations.

**Mobile users are often interrupted.** A journey must tolerate a phone call, switching to a map, returning from a messaging app, spotty reception, and resuming on a laptop. Page state and server-confirmed outcomes must survive those transitions.

**Multilingual service creates version risk.** Language choice changes presentation, not the underlying property identity. Material fact changes require cross-language reconciliation, and publishing authority remains human.

### 02.2 Audiences, needs, and proof of success

| Audience and situation | Primary job | Anxiety or failure to remove | Proof the experience worked |
|---|---|---|---|
| Local buyer with a clear budget | Find plausible options and arrange a useful viewing | Attractive listings hide decisive defects or are unavailable | A small shortlist meets explicit requirements; viewing details are confirmed |
| Cross-border buyer exploring remotely | Understand places, service scope and what requires local expertise | Language gaps, invented certainty, wasted travel | Requirements and open questions are documented; an appropriate adviser owns next steps |
| Household or co-buyers | Reach agreement on priorities and options | Preferences disappear in message threads | Shared shortlist distinguishes each person's view and a jointly chosen next step |
| Long-term tenant | Find a suitable home for a date and understandable monthly cost | Hidden charges, unclear eligibility or availability | Known costs and unknowns are clear; application has an owner and status |
| Seller or co-owner | Understand a credible route to selling and control publication | Losing control of price, privacy or agency commitments | Recorded instructions, reviewed listing preview, understandable activity updates |
| Landlord | Let and, if contracted, manage a property with accountable follow-up | Unclear approvals, maintenance and payment reporting | Defined service scope and a visible record of requests, decisions and reconciled statements |
| Returning client | Resume without explaining everything again | Duplicate forms, missing conversation history | Secure return directly to their next relevant task |
| Broker working across phone and desktop | Respond, coordinate, remember and progress cases | Duplicates, dropped handoffs, overloaded inbox | Every active commitment has a responsible person and next action |
| Listing/content specialist | Turn approved facts into accurate public material | Copy drift, stale translations, broken media | Versioned, reviewable publication bundle with clear blocking issues |
| Agency manager | Keep service reliable and capacity realistic | Unowned work, artificial pipeline progress, invisible failures | Explainable exceptions and ownership; operational metrics derived from actual events |

Do not build behavioral personas around inferred nationality, wealth, ethnicity, disability or family status. Locale, contact preference, accessibility requests and self-declared requirements serve the task; they are not proxies for lead value or eligibility.

## 03. Roles, access, and authority

Permissions are capabilities over specific records and fields, not simply menu visibility. Enforce them on the server. The UI communicates allowed actions and why a legitimate action is blocked, without revealing records the person must not know exist.

| Role | Can see and do | Cannot do by default |
|---|---|---|
| Visitor | Public approved content; device-local saved properties; submit own inquiry | Private documents, owner identity, hidden addresses, other people's interests |
| Verified client | Their invited cases, own messages, shared shortlist, permitted documents and requests | Internal notes, competing parties, unpublished broker assessments |
| Invited collaborator | Exactly the resources and actions granted by invitation | Inherit full household, financial or identity-document access automatically |
| Assigned broker | Authorized client/property cases, communications and appointments; drafts and task execution | Override publishing, legal review, financial reconciliation or access controls without capability |
| Coordinator | Scheduling and selected operational fields for assigned work | Read all confidential documents merely to arrange a viewing |
| Content editor | Approved source facts, media and draft translations | Approve their own restricted publication changes without separate capability |
| Translation reviewer | Assigned locale, source version, diff and language approval | Change commercial facts or approve legal claims through a language approval |
| Publishing approver | Review and release exact eligible versions and channels | Treat a language approval as factual or legal approval |
| Manager | Allocate work, see operational reports, approve configured exceptions | Bypass auditability or imply professional qualifications they do not hold |
| External specialist | Time-limited access to explicitly shared questions/documents | Discover unrelated clients, properties or messages |
| Hermes/AI service | Draft, extract, propose, flag inconsistencies and summarize within authorized sources | Publish; make a translation indexable; send customer messages; approve legal/tax/process claims |

Small-team reality: one person can hold several human capabilities. The UI still separates “edit,” “review,” and “publish” as recorded actions. The agency must decide where independent second-person review is mandatory; the interface supports it and does not silently invent a second reviewer.

### 03.1 Visibility and invitation rules

- Every private item has an audience: internal only, named case participants, a selected external specialist, or an explicitly approved public version.
- A share dialog names what will be shared and with whom, includes expiry/revocation, and previews the recipient view. It never defaults to “anyone with the link” for private case material.
- Shortlist public-link sharing can be offered for approved public property facts only; personal notes and identity details require explicit authenticated sharing.
- A client invitation proves control of a channel, not ownership of property or legal authority to act. Represent those checks separately.
- Removing a participant immediately revokes future access. Explain that already downloaded files or messages cannot be recalled.
- Client-visible case progress is a curated, factual summary. Internal deliberation and raw automation logs stay internal.

## 04. The information model behind the experience

The frontend can only be coherent if the conceptual objects are clear. This is a product model, not a prescription for database tables.

| Object | Meaning | Important distinctions |
|---|---|---|
| Property | A physical asset or identifiable unit | Can exist without a public listing; exact address can be private |
| Listing | A commercial offer for a property | Has purpose, commercial terms, availability and publication versions; sale and rent can be separate offers |
| Person / organization | A party with contact methods | Contact verification, consent and authority to act are separate attributes |
| Party relationship | A person's role in a case or property | Buyer, co-buyer, seller, authorized representative, landlord, tenant, adviser; scoped and revocable |
| Requirement brief | Structured needs and priorities | Hard constraints vs preferences vs unanswered questions; client-stated vs broker interpretation |
| Shortlist | A selected set of listings with decisions | Saving does not create an inquiry, reserve a property or notify the seller |
| Inquiry | One inbound expression of interest or service request | Received before a qualified case exists; has source, owner, acknowledgment and disposition |
| Client case | The agency's work toward a defined outcome with a party | A buyer case can span many properties; a property can relate to many private cases |
| Match | A proposed property-case relationship | Carries fit reasons, trade-offs, version and feedback; not a universal AI score |
| Appointment | A proposed or confirmed meeting | Request, tentative arrangement, confirmation and completion are different events |
| Offer / proposal | Versioned terms submitted through an authorized process | An expression of interest is not an offer; an accepted proposal is not proof of legal completion |
| Task / commitment | An action, owner, due point and completion evidence | Internal suggestion vs a promise made to a client must be distinguishable |
| Message | A communication with channel, recipients and delivery states | Draft, approved, queued, accepted by provider, delivered and read are not interchangeable |
| Document / evidence | A file or reference with purpose, version and restricted audience | Uploading, malware scanning, human review and professional validation are separate states |
| Publication version | Immutable reviewed content bundle | Source facts, media rights, locale text, approvals and destinations bound together |
| Activity event | A meaningful recorded change | Human-readable timeline for work; protected technical audit for investigation |
| Service agreement | Agreed agency scope and authority | A property-management request does not authorize expenditure or collecting money |

### 04.1 Relationship map

```text
Person / organization ── scoped relationship ── Client case
                                                │
                           requirements ─ matches ─ shortlist
                                                │
Property ── Listing ──────────────────────────────┘
   │           │                      │
source facts   publication versions    appointments / proposals
   │           │                      │
evidence       public locales         tasks / messages / restricted documents
```

Every consequential view must carry the object's stable reference, relevant version, owner if applicable, and last meaningful update. Names and slugs may change; references preserve continuity.

## 05. Service blueprint: the complete loop

### 05.1 Buyer and tenant service

| Phase | Client action | Visible agency response | Backstage work | Exit evidence / recovery |
|---|---|---|---|---|
| Discover | Search, explore an area, inspect property | Accurate facts and contact choices | Source review, inventory freshness, approved localization | Client understands fit and uncertainty; failed search offers recovery |
| Express interest | Ask a question, request help/viewing | Receipt with reference and realistic next step | Deduplicate safely, assign owner, check contact reachability | Accepted request exists; uncertain submission has reconciliation |
| Agree needs | Clarify requirements and availability | Concise editable brief | Broker confirms constraints and service coverage | Client can correct brief; unsupported requests get a clear disposition |
| Evaluate | Compare matches and ask questions | Reasons, trade-offs, sourced answers | Verify material facts; gather appropriate expertise | Explicit shortlist decisions and unresolved questions |
| View | Agree time and attend remotely/in person | Confirmed logistics and accessible contact | Coordinate access, host, travel and conflicts | Completed/no-show/cancelled state with follow-up |
| Decide | Proceed, revise criteria, pause or decline | Agency acknowledges chosen next action | Maintain separate offer and case records | No implicit commitment from a click or unread message |
| Coordinate | Exchange permitted documents and decisions | Milestones with owners and dependencies | Human/professional checks and external coordination | Completion recorded only against appropriate evidence |
| Continue relationship | Receive handover and chosen aftercare | Organized record and optional new service | Close commitments and retain/delete by policy | Client understands what remains and whom to contact |

### 05.2 Seller and landlord service

```text
Request advice → Confirm authority and service scope → Inspect / assess
→ Agree instructions → Prepare listing → Review exact preview
→ Authorize publication → Handle inquiries and viewings
→ Review proposals → Coordinate transaction / tenancy → Handover
```

Parallel work must be visible. Photography can proceed while a document is awaited; publishing cannot proceed while a required authority or factual check is blocked. A task checklist expresses this better than a misleading percentage-complete indicator.

### 05.3 Handoff contract

Every handoff, including between staff, contains: purpose; involved records; the last agreed facts; unresolved questions; relevant permissions; next action; receiving owner; due point; source links; and whether the customer has been informed. A transfer is incomplete until the receiving owner or an explicit coverage policy accepts responsibility. The previous owner remains accountable until then.

Response-time promises come from configured service hours, available coverage and real queue policy. Start with a next-business-period acknowledgment policy chosen by the agency; do not print “we reply in five minutes” from a template. Show the timezone and exact promised date/time when a commitment is made. A breach creates actionable work; it does not silently move the deadline.

## 06. Information architecture and navigation

### 06.1 Public site

Primary navigation: **Buy · Rent · Sell / Let · Areas · How we help**. Utilities: **Saved · Language · Contact**. A returning verified client has **My journey**. Agency information, named team and office details remain easy to find under How we help and in the footer. Search stays reachable from every property/area page.

The home page answers four questions in order: where and how the agency can help; how to begin a search; what useful options or places are available; why trust a conversation with this team. Use real properties and real people. Avoid an oversized aesthetic hero that pushes the first useful task below the fold.

Buy and long-term rent share structural components but differ in fields and copy. Short stays, if offered, live under a clearly separate service with date-based availability and terms. Never mix per-night, per-month and total purchase prices in a single unlabeled list.

### 06.2 Client workspace

Top-level destinations: **Overview · Properties · Appointments · Messages · Documents**. Context-specific **Proposals**, **My listing**, **Service requests** or **Statements** appear only when relevant to an authorized case. A case switcher names the purpose and property/area; it does not force one person with two journeys into two accounts.

Overview is the arrival page: next agreed action, active milestone, open questions, relevant appointment, latest meaningful update, and named human contact. No empty financial dashboard for a buyer who only needs to confirm a viewing.

### 06.3 Agency workspace

Primary destinations: **Today · Inbox · Cases · Properties · Calendar**. Secondary: **Content & approvals · Service operations · Reports · Settings**. Global search finds authorized records by name, reference, address and communication context. Recent items are private to the operator.

Navigation is stable across roles; only relevant destinations appear. A command palette is optional acceleration, never the only route to an action. On mobile, Today, Inbox and Calendar are the primary work surfaces; deeper record editing remains available without squeezing desktop tables into a phone.

### 06.4 Deep links, breadcrumbs, and return context

- A record has a canonical route. The same record in a side panel must be openable as a full page.
- Back from a property restores the result set, filters, sort, page/cursor, scroll position and focused card when still available.
- Shared public search links contain non-sensitive structured criteria; free-text notes, private requirements and identities do not belong in URLs.
- Language switching preserves the property or journey context where an approved equivalent exists. Explain the fallback when it does not.
- Notifications open the exact authorized action or relevant historical result; a completed request never becomes a broken link without explanation.
- Tabs describing sections are navigation when they change addressable content. Use real links and browser history; reserve ARIA tabs for true in-page panels.

## 07. State machines and workflow rules

### 07.1 Inquiry pipeline

| State | Entry condition | Owner's next action | Exit condition |
|---|---|---|---|
| Received | Server accepted an identifiable request | Assign/review | An owner or explicit coverage queue accepts it |
| Assigned | Ownership recorded | First meaningful response | Actual response recorded or failed-delivery action created |
| Awaiting client | A specific question or proposal was sent | Follow up on agreed date | Client replies, declines, or follow-up policy ends |
| Ready for case | Need and service scope sufficiently understood | Create/link case and confirm next action | Case linked; client sees appropriate continuation |
| Resolved without case | Question answered or request declined/out of scope | Record reason and any promised follow-up | No unfulfilled commitment remains |
| Suspected duplicate / spam | Evidence suggests duplication or abuse | Human or narrowly defined safe review | Merge/link/discard with reason; original receipt remains traceable |

“New” is not a permanent stage. An inquiry can be linked to an existing case without creating another person or duplicating obligations. Identity matching proposes; uncertain merges need human review and must be reversible.

### 07.2 Buyer case pipeline

| Stage | Required evidence to enter | Meaningful next action | Allowed exit |
|---|---|---|---|
| Needs agreed | Acknowledged brief, responsible broker, contact route | Present or refine options | Evaluating / paused / closed |
| Evaluating | At least one reviewed option or an explicit sourcing task | Resolve questions, choose viewings | Viewing / needs revised / paused / closed |
| Viewing | An appointment workflow exists | Confirm, attend, collect feedback | Evaluating / proposal preparation / paused / closed |
| Proposal preparation | Client requests a defined proposal process | Check parties, terms, authority and required advice | Proposal active / evaluating / closed |
| Proposal active | Authorized version submitted through the agreed process | Obtain response, track expiry/counterproposal | Coordination / revised proposal / evaluating / closed |
| Coordination | Parties intend to proceed and broker records supporting evidence | Complete dependencies with appropriate specialists | Completed / failed / on hold |
| Completed | Required completion and handover evidence recorded by authorized human | Aftercare / archive commitments | New linked service, not silent reopening |

Paused and closed are dispositions with reason, date, outstanding obligations and optional resume point. Do not equate “no response” with “lost to competitor.” A failure of one property's proposal need not close the buyer's entire case.

### 07.3 Seller case and property preparation

Seller stages: **Request received → Scope/authority confirmed → Assessment → Instructions agreed → Preparing → Marketing → Proposal coordination → Completion/handover**. Each stage has a responsible broker. Preparing contains parallel tasks for factual verification, media, copy, pricing instructions and publication review. The owner's approval attaches to an exact preview/version and stated commercial instructions.

Price changes, pauses, altered terms and removing a property from marketing are recorded instructions. They do not silently rewrite an existing proposal. A seller can ask for correction from their workspace; the request creates a tracked task rather than directly changing public facts.

### 07.4 Listing state is multi-dimensional

| Dimension | States | Rule |
|---|---|---|
| Commercial availability | Available, availability unconfirmed, under negotiation, reserved subject to stated basis, sold/let, withdrawn | Each transition needs actor, time, reason and appropriate evidence; jurisdiction-specific meanings require approved copy |
| Editorial | Draft, needs facts, in review, approved version, changes requested | Approval is bound to content; edits produce a new revision |
| Public distribution | Never published, scheduled, publishing, published, partially published, failed, withdrawing, withdrawn | Success is destination-specific and based on acknowledgments/read-back, not a button click |
| Translation | Missing, draft, reviewing, approved for source version, stale, rejected | Translation approval alone does not publish or grant indexability |
| Evidence freshness | Current under configured policy, review due, conflicting, unknown | A timer can request review; it cannot prove continued availability |

Public presentation derives from these dimensions. “Available” is not inferred from “published.” A listing can be published while marked sold with an appropriate historical purpose, or remain privately available while unpublished.

For material fact changes, the safe default is to pause affected locale publication until reconciliation and human approval. Already public stale text must be replaced, withdrawn or clearly restricted by an approved policy; it must not keep advertising old prices merely because a translation task exists. Other locales with approved correct versions can remain live.

### 07.5 Appointments, messages, and documents

Appointments: **Requested → Proposed → Confirmed → Completed**, with explicit **Declined / Cancelled / Reschedule requested / No-show** paths. A time suggestion is not confirmation. New time proposals retain the old confirmed arrangement until the replacement is agreed, unless a participant explicitly cancels it. Check host availability, property access and participant timezone before final confirmation.

Messages: **Draft → Human approved → Queued → Provider accepted → Delivered**, with **Failed / Outcome unknown** branches. “Read” appears only if the channel supplies a reliable receipt and its meaning is explained. A provider accepting a request is not proof of delivery. Automatic retries must preserve one logical message and stop when a duplicate risk is unresolved.

Documents: **Selected → Uploading → Uploaded → Scanning → Ready for review → Reviewed**, with **Rejected / Needs replacement / Expired / Superseded** branches. A clean malware scan proves neither document authenticity nor legal sufficiency. Use the precise type of review in the UI.

### 07.6 Proposal and task rules

A proposal has versions and one active decision thread: **Draft → Reviewed → Submitted → Awaiting response → Countered / Declined / Withdrawn / Expired / Agreed for next step**. Changing amount, conditions, parties or deadline invalidates prior approval. Show the controlling timezone. “Agreed for next step” must not be labeled “Property purchased.” A jurisdiction-approved transaction flow determines any legally significant step.

Tasks have **Open / In progress / Waiting on named dependency / Done / Cancelled** states. Completion records what happened. “Waiting” includes who or what is awaited and a follow-up date. Bulk completion must not manufacture completion evidence. High-impact tasks, publishing, communication and access grants are excluded from generic “complete all.”

### 07.7 Universal transition contract

Before any meaningful transition, the interface knows: actor capability, current record version, required evidence, affected people/surfaces, reversibility and external consequences. The server validates the same conditions. A conflict produces a comparison and recovery, not last-write-wins data loss. Timeline entries explain business changes in human language; restricted audit records preserve technical detail separately.

## 08. Public discovery and buyer flows

### F01 — Arrive with an intention

**Actor:** new visitor. **Entry:** home, campaign, area page, search engine or shared listing. **Screens:** P01, P02, P15–P17, P20.

1. Identify the agency's actual geographic and service scope in one clear sentence and a relevant, real visual.
2. Choose Buy, Rent, Sell/Let, or Help me decide. These are distinct intentions, not a mandatory questionnaire.
3. For search, enter a place or listing reference; transaction type remains explicit. The initial form can also accept a budget, but never demands it.
4. For a service need, open a concise explanation of deliverables, process, limitations, human contact and what the first conversation requires.
5. Continue directly to a relevant result or request. A returning visitor may resume a saved public search; never expose private activity on a shared device without authentication.

Locale detection can suggest a language in a dismissible control; it cannot forcibly redirect a visitor away from an explicitly selected language or deep link. Unsupported geography returns service-scope clarity and a human contact option without implying inventory exists.

**Success:** the visitor understands the service and enters an appropriate journey without registering. **Observe:** task choice and successful destination, not merely hero-button clicks.

### F02 — Search, refine, and recover

**Actor:** buyer or tenant. **Entry:** P01, an area page, a deep link, or a saved search. **Screens:** P02–P04, P22.

1. Set transaction type and geography. Place suggestions show country/region and recognizable local names; ambiguous names require selection.
2. Apply high-value filters: budget, property type, bedrooms, area and availability/date where meaningful. Reveal specialized attributes under More filters.
3. Keep every active constraint visible and removable. Within a multi-select category, use OR; across categories, use AND. Explain exceptions in plain language.
4. Show result count, current sort, active criteria and cards together. Counts are exact only when the underlying response supports that claim.
5. Open a property and return to the same context. Use explicit pagination or Load more with a recoverable URL/state; do not make endless scrolling the only navigation.
6. Save or share the structured search without leaking personal notes.

**Filter semantics:** budget uses source price and price period; a missing price is not zero. Bedrooms and rooms remain distinct. Apartment living area, total/built area and land area are labeled separately. An unknown lift or accessibility feature does not satisfy a required-feature filter. “Must have” excludes unknowns and offers a separate, clearly labeled “Include properties needing confirmation” choice.

**Natural-language assistance:** “Two-bedroom apartment near the park under my budget” produces a reviewable set of interpreted criteria. Ask for the actual budget if not previously and legitimately known. “Quiet” and “good investment” are subjective questions, not hidden hard filters. Apply only acknowledged constraints; show what could not be interpreted. No invented commute times, scenic views or yield claims.

**Update model:** desktop quick filters commit individually; multi-field range changes commit on Apply. Mobile uses a full-height filter sheet with a draft selection and one Apply action. Closing discards uncommitted filter edits after warning only when meaningful. Result updates keep existing cards visible with a busy indication until replacement is ready; focus stays at the initiating control. Announce the new count once.

**Zero results:** preserve criteria; identify candidate relaxations with actual counts when available; let the visitor choose one. Never silently expand the budget, country or transaction type. **Failure:** retain prior results with an explicit stale label; distinguish service failure from zero matches. **Map:** moving the map reveals Search this area; panning alone does not change results. An approximate location must look approximate. List-only functionality remains complete when maps fail.

Applied-filter visibility is supported by Baymard's original research, updated May 2026. Its findings come from commerce; their application here is a design inference. [Baymard: applied filters](https://baymard.com/research-articles/how-to-design-applied-filters)

### F03 — Evaluate a property

**Actor:** buyer/tenant or shared-link recipient. **Screens:** P05, P06, P11, P13.

1. See the property identity, place, commercial purpose, availability, price with basis, and the most decision-relevant facts before lengthy promotional copy.
2. Explore real photographs, floor plans and available video. Controls expose image count, type and descriptive labels; swiping is optional, not required.
3. Inspect grouped facts: space, building, condition, access, facilities, location, costs, and known constraints. Unknowns are labeled, not erased.
4. Read a factual description and a short “What to confirm” section. Material limitations belong near the relevant facts, not in a legal footnote.
5. Inspect provenance/freshness and request clarification about a specific fact. The inquiry carries the fact and listing reference automatically.
6. Save, compare, ask about the property, or request a viewing. One dominant next action is chosen according to availability; secondary options remain visible.

The sticky contact panel shows a named accountable team member or truthful team identity, supported languages, contact options and what happens next. Do not invent a personally assigned agent before assignment. Sold, withdrawn or unconfirmed availability changes the action and copy immediately.

**Trust detail:** show source-supplied, owner-confirmed or professionally reviewed facts only when evidence supports the label. Renovation images, virtual staging and plan redraws must be identified next to the media. Original images remain available. Do not alter structural features or imply an unapproved renovation is the present property.

**Success:** the person can explain why the property fits, what might disqualify it, and what remains unknown. Public browsing never claims to replace inspection or professional advice.

### F04 — Save, compare, and decide together

**Actor:** individual or invited household. **Screens:** P07–P09, C05, C17.

1. Save a property immediately. For an anonymous visitor, label persistence accurately: “Saved on this device.” Account creation is optional.
2. Group properties into a shortlist; allow a short name and optional private notes. A default list works without setup.
3. Compare selected properties using a consistent fact vocabulary. Start with two on mobile and up to three visible columns on wide screens; support a fourth only through explicit selection, not cramped automatic scaling.
4. Pin priorities such as total known monthly cost, step-free access, or outdoor space. Display differences and unknowns. Calculated comparisons disclose assumptions and do not silently compare unlike area definitions.
5. Mark Interested, Question, Maybe or No for each property; preserve a reason if the person chooses to give one.
6. Share approved public facts with a revocable link, or invite a named collaborator to private shared notes. Preview exactly which notes are included.

The shared shortlist records individual opinions without manufacturing household consensus. “Choose for viewing” is a deliberate shared or authorized action. Removing a property is recoverable; deletion of a private note is not announced to unauthorized recipients.

If a saved property's price or availability changes, keep the item, show the changed field and timestamp, and offer the appropriate next action. Do not silently substitute a similar listing. **Success:** a manageable decision set and explicit unanswered questions, not a large collection of hearts.

### F05 — Save a search and receive useful alerts

**Actor:** returning seeker. **Screens:** P10, C13.

1. Review a human-readable summary of the exact criteria to be saved.
2. Choose frequency: recommended daily digest, immediate where supported, weekly, or paused. State supported channels honestly.
3. Enter or select a verified contact route. Explain the purpose and separate this subscription from unrelated marketing.
4. Confirm channel ownership without losing the search. Show pending verification until it is complete.
5. Receive only authorized, currently eligible listing updates, with a concise explanation of match and material changes. Consolidate duplicates.
6. Edit criteria, pause, change frequency or unsubscribe directly from a safe management route.

Default recommendation: one digest per search/day with deduplication across overlapping searches. Quiet hours and timezone are visible. This is an operational design default, not a measured ideal. Transaction/service updates use separate preferences and are not silently disabled by marketing unsubscribe. A delivery failure is not a subscriber rejection. No alerts may advertise an unapproved translation or stale critical fact.

### F06 — Ask a question or request a callback

**Actor:** visitor. **Screens:** P11, P12; operator continuation O02, O03.

1. Start from property, comparison, service or contact context; keep the relevant reference visible.
2. Choose a purpose only if it changes routing: question, callback, viewing help, selling/letting, other property service.
3. Provide a preferred name and one reachable contact method. Name may be optional for a simple question; the agency must justify any required field. Phone is required only for a chosen phone-based response. Language and callback window are optional refinements.
4. Review the short message and delivery destination. Privacy information is close to submission; marketing opt-in is separate and unchecked.
5. Submit once. A durable receipt appears only after the server accepts the request. Include reference, submitted context, expected next step and a way to correct it.
6. Offer optional private workspace access after the request succeeds; never make it a second gate to being contacted.

Clicking an external WhatsApp/Viber/email link means opening another application, not sending an inquiry. Label it accordingly. If the site cannot verify delivery, do not show “Your message was sent.” A phone button means Call, not Request received.

If the response times out after submission, show “We’re checking whether your request was received,” reconcile by the same submission identifier, and prevent duplicate sends. Validation errors keep every entered value, focus a linked summary and explain corrections. Confirmation and error design draw on GOV.UK's service patterns. [Confirmation pages](https://design-system.service.gov.uk/patterns/confirmation-pages/), [error summary](https://design-system.service.gov.uk/components/error-summary/)

### F07 — Request, confirm, and attend a viewing

**Actor:** seeker, coordinator, broker, property-access contact. **Screens:** P13, P14, C06, O08, O09.

1. Choose in-person or remote viewing if genuinely offered. State accessibility or communication needs optionally and privately.
2. See verified bookable slots only when the system has reliable capacity and property-access authority. Otherwise choose preferred windows and label the action Request a time.
3. Display date, timezone, approximate duration, property reference and meeting format. The system does not assume a traveller's device timezone is the property's timezone.
4. Submit preferences. The coordinator checks host, access, conflicts, travel buffer and parties; proposes or confirms explicitly.
5. Confirm the appointment with a stable status page, calendar download/update, responsible person and appropriate meeting-point disclosure.
6. Send approved reminders under the service policy. A client can cancel or request rescheduling through the same record.
7. Record actual outcome. Invite a brief private reflection: fit, unresolved question, next step. Feedback is optional and is not automatically sent verbatim to the seller.

Slot conflicts return alternative times with entered details preserved. A confirmation timeout is reconciled before retry. Rescheduling records cancellation/update of previous calendar invitations. A multi-property itinerary is an explicit coordinated plan; travel estimates are labeled estimates and cannot guarantee access. No-show handling begins with a factual check, not an automated penalty.

### F08 — Understand an area or cross-border process

**Actor:** explorer or relocating client. **Screens:** P15, P16, P20; optional C04.

1. Enter through an area, practical question or property location.
2. Read what the area is actually like: location, transport context, daily services, seasonality and property characteristics, supported by dated sources or clearly attributed local observations.
3. Separate general education from person-specific legal, tax, financing or residency advice. Include jurisdiction, reviewer and review date for reviewed process content.
4. Open relevant listings with the area criterion visible, or submit a question with the article and topic attached.
5. A broker clarifies the scenario and routes questions to an appropriately qualified professional where needed.

No “safe neighborhood,” guaranteed return, guaranteed residency, or nationality-based eligibility claims should be inferred from content or AI. Travel times identify origin, method and source/time if shown. Unsupported destinations are not introduced as inventory categories. A guide can be helpful without inventing exact costs or legal steps.

### F09 — Arrive at an unavailable or old listing

**Actor:** search-engine visitor, saved-list user or previous inquirer. **Screens:** P21, P05, P02.

Resolve the stable property/listing reference; display truthful current status, the last meaningful update and limited historical context where appropriate. If the property is sold or withdrawn, say so before presenting a contact action. Offer similar available properties only with visible matching criteria and a link to modify them.

An old URL must not redirect a specific property inquiry to a generic home page and imply the requested property still exists. When removal is necessary, use an appropriate unavailable/not-found experience and exact migration rules. Preserve the different histories of the `.com` and `.ru` legacy domains during any later migration; the designer must not invent page mappings. This document does not define redirects from guesses.

If a buyer already has a case for the listing, their private journey remains accessible according to permission and retention policy. Do not delete appointments, messages or proposal history because the public page is no longer available.

## 09. Seller and landlord onboarding flows

### F10 — Request an assessment or selling/letting consultation

**Actor:** owner or representative. **Screens:** P17–P19.

1. Understand the agency's service and the difference between an initial conversation, a market assessment and any formal valuation service.
2. Select Sell or Let and enter approximate property location/type. Exact address is optional initially unless needed for a clearly explained next step.
3. Provide what is known about area, condition, occupancy and timing. “Not sure” is a legitimate answer. Do not demand a listing-ready record at first contact.
4. Indicate the person's relationship to the property and preferred contact method. Do not present this self-declaration as verified authority.
5. Add optional photos; explain they are private intake material, not permission to publish. Documents proving identity/title belong in a later secure flow.
6. Review and submit. A receipt states what will happen, who will arrange the next conversation and what may be useful to prepare.

Use a short sequence of coherent question groups: property; intention/timing; contact; review. Save/resume becomes available through an explicitly verified route. No fabricated instant market price. If a rough estimate is later introduced, it needs its own validated method, range, assumptions and professional review policy.

The decision to ask only necessary questions, permit uncertainty and provide a review step is informed by GOV.UK. The actual field set and groupings above are MS Realty recommendations. [Question pages](https://design-system.service.gov.uk/patterns/question-pages/), [check answers](https://design-system.service.gov.uk/patterns/check-answers/)

### F11 — Agree service, authority and instructions

**Actor:** owner, broker and authorized representatives. **Screens:** C11, C08, O05, O11, O20.

1. Broker acknowledges the request, verifies scope and records who may instruct the agency.
2. Arrange an inspection or remote fact-gathering session. Record accessibility, occupancy and access constraints privately.
3. Prepare an assessment with supporting rationale and limitations; distinguish asking-price discussion from a formal professional valuation.
4. Explain proposed service deliverables, agency charges where applicable, exclusivity if relevant, responsibilities and cancellation/change process using approved documents.
5. Obtain the necessary human-authorized agreement through an appropriate process. A checkbox saying “I own this” is not a substitute.
6. Record publication permissions separately: identity/address disclosure, media usage, contact handling and approved commercial instructions.
7. Create preparation tasks with owners and dependencies. The client can see what is awaited from them and why.

Multiple owners or representatives are separate participants with separately checked authority. Missing authority blocks consequential steps, not a harmless preliminary conversation. The interface records review status; it does not certify legal authority by itself.

### F12 — Review publication and follow marketing progress

**Actor:** seller/landlord and publishing team. **Screens:** C11, C12, O12–O17.

1. Client opens a versioned preview with price, factual fields, photos, location precision and the proposed destinations/languages.
2. Review changes against any previous version; identify what approval does and does not authorize.
3. Approve the exact material within the client's authority or request corrections tied to a field/image. A correction creates work; it is not a direct public edit.
4. Staff complete independent factual, media, translation and publication checks according to capability.
5. Publish through a deliberate release step. Client sees Pending publication until destination results are known.
6. Show marketing activity as understandable summaries: qualified inquiries, viewings, themes from feedback and next recommendation. Exclude identities and confidential details of other parties.
7. Client requests price/availability changes or pause through a tracked instruction flow with acknowledgment and completion status.

Approval expires for changed material. Price changes cannot be smuggled into a previously approved description. When only some channels update, show a partial state and owner of repair. A seller-facing graph must never imply exposure, impressions or performance that the underlying channels cannot reliably measure.

## 10. Private client workspace flows

### F13 — Verify access and return safely

**Actor:** client or invited collaborator. **Screens:** C01, C02, C17.

Provide email-link access or another accessible supported method, with passkeys as an optional repeat-use enhancement if the security design supports them. Show which channel receives access without exposing account existence to unauthorized visitors. Allow password-manager/paste support wherever credentials or codes are used. Provide a human-assisted recovery route with appropriate verification.

After verification, return to the originally authorized destination. Expired, consumed, revoked and wrong-account invitations have distinct recovery messages. Opening an invitation from another device must not lose the case context. A link preview/scanner must not accidentally consume a one-time user action.

An invitation shows inviter, purpose, access scope and accept/decline. Accepting a shortlist invitation does not grant access to identity documents or other cases. On shared devices, allow explicit sign-out; sensitive cached views clear on sign-out and permission changes. Sessions require re-verification before high-risk actions under an approved security policy.

**Success:** authorized access with correct scope and return context. Authentication mechanics must be security-reviewed before implementation; accessibility requirements follow WCAG, not an assumption that any “magic link” design is automatically safe.

### F14 — Understand progress and complete the next action

**Actor:** active client. **Screens:** C03, C04, C05, C06, C16.

1. Open Overview and see the next required action, its purpose, owner and due date if one exists.
2. Inspect progress as completed, active, waiting and upcoming milestones. Distinguish confirmed milestones from a tentative plan.
3. Open an action in context: confirm requirements, choose a viewing, review a document, answer a question, review a proposal.
4. Complete or ask for help. Server confirmation updates the overview and timeline.
5. If no action is needed, state what the agency is doing and the next expected update, using an actual recorded commitment.

The client can correct a requirements brief; material changes return to the broker for acknowledgment before they drive new external commitments. A client changing a preference does not cancel appointments automatically. Multiple active cases remain separate and visibly named. A finished journey provides a concise closeout, outstanding obligations if any, contact and controlled access to retained records.

### F15 — Exchange and review documents

**Actor:** client, broker or invited specialist. **Screens:** C08, C09, O20.

1. Open a named document request with purpose, requester, acceptable formats, maximum size and audience.
2. Select files or use camera capture. Show legibility guidance; permit multi-page grouping and reordering with button alternatives to dragging.
3. Upload with per-file progress, pause/cancel where supported, and clear network recovery. A failed upload never appears complete.
4. Scan and process server-side; isolate content until safe to make available. Client sees Processing, not Reviewed.
5. Human reviewer records accepted-for-purpose, needs replacement or reviewed-with-open-questions. Explain exactly what was checked.
6. Request correction against the specific version; retain authorized history and mark superseded versions.

Sensitive identity/title/financial files never attach automatically to a public inquiry, shared shortlist or AI prompt. Before external sharing, review recipient, scope and expiry. Unsupported/oversized/encrypted/unreadable documents get actionable recovery and a human-assisted alternative. Retention and deletion are policy-controlled, with holds explained when relevant.

### F16 — Review a proposal and coordinate a decision

**Actor:** authorized party with broker support. **Screens:** C10, O19, O05.

Show property, parties, source currency, amount and payment basis, conditions, inclusions, deadline/timezone, document version and open questions. Offer side-by-side changes from the previous version. Separate “Ask a question,” “Request a change,” and the jurisdiction-approved consequential action.

Before any consequential submission, use an explicit review step naming the recipient, exact terms and effect. Avoid generic “Continue” or “Accept” labels whose legal meaning is unclear. This target does not authorize in-app legal signatures or payments until an appropriate provider, legal design and identity/authority requirements are approved.

Submission remains pending until its outcome is confirmed. Expired or superseded proposals cannot be acted upon; preserve the person's draft response where safe and explain the new state. A counterproposal creates a new version. Conflicts and competing negotiations are broker-controlled and confidential. No public bidding pressure, invented competing offers, or countdown urgency unrelated to a real deadline.

### F17 — Converse without losing the case

**Actor:** client and agency. **Screens:** C07, O02, O05, O32.

Messages belong to a case and carry an explicit audience. Compose in that context with property/document links and visible recipients. Keep an internal-note composer visually and structurally separate from a customer-message composer. Switching mode must not carry confidential internal text into a public send field automatically.

Show supported delivery status with timestamps. Incoming messages from connected channels are linked only when identity and record association are reliable; uncertain matches go to review. Unsupported channel history may be summarized manually with provenance, never displayed as a complete synced transcript.

Drafts survive ordinary navigation under a safe retention policy. Attachments have audience checks and upload/scanning states. Outbound AI text requires human review, including factual links, recipients and language. Unknown delivery enters reconciliation; operators can see and resolve it before retry. Client-visible copy remains plain: “Delivery is not yet confirmed” rather than a technical provider error.

## 11. Agency operating flows

### F18 — Triage an inbound inquiry

**Actor:** duty broker/coordinator. **Screens:** O01–O03, O06, O27.

1. Inbox shows unassigned, assigned to me, awaiting reply and delivery problems as distinct views. Order by commitments and age, not opaque lead score.
2. Open an inquiry with original source, context, language, contact route and submission reference.
3. Inspect suggested identity/case matches. Link a known record; compare ambiguous matches without exposing extra data to the customer.
4. Claim or assign ownership, checking capacity and language/service coverage. A team queue has a named responsible duty role.
5. Answer a simple question or clarify the minimum need. Use approved source facts; surface any stale/conflicting facts before sending.
6. Create/link a case only when useful; otherwise resolve with a reason and recorded response.
7. Set the next action and due point before moving away from an active obligation.

Quick actions include assign, draft reply, create task and link record. Deleting, merging, bulk messaging and changing access never appear as single-key accidental actions. Spam controls preserve an audit and support correction. Missing contact reachability produces an explicit issue, not a permanently “active” lead.

### F19 — Work the day and hand off coverage

**Actor:** broker or manager. **Screens:** O01, O18, O23, O24.

Today prioritizes: unresolved consequential failures; overdue client commitments; today's appointments; requests awaiting first response; approvals blocking active work; then planned tasks. Each row explains why it is here, affected case, owner, deadline and direct action. Severity indicates consequences, not merely red decoration.

An operator can group by time, case or type; personalize density without hiding critical unowned work. Snooze requires a next review point and cannot erase a missed commitment. A manager can rebalance workload using visible capacity and skills; the receiving owner accepts the handoff or the coverage policy records acceptance.

End-of-day review highlights open external commitments and unconfirmed tomorrow appointments. Absence/leave settings route new work and request reassignment of existing commitments explicitly. No automation promises coverage that the team has not staffed. Completing a task confirms an outcome; a missed phone call is recorded as an attempted contact, not a successful response.

### F20 — Work a case with a dependable next action

**Actor:** assigned broker. **Screens:** O04–O06, O18–O20.

Open a case into a stable workspace: purpose and stage, participants, next action, requirements, relevant properties, timeline, messages and documents. Show blockers near the next action. One case can have parallel workstreams without inventing multiple incompatible stage values.

Editing requirements shows what came from the client, what the broker inferred and what needs acknowledgment. Stage movement validates entry/exit conditions and records the reason. A board offers overview; the table and case page support the same transitions without drag-and-drop.

Add a note with explicit internal visibility, create a task, propose an appointment, prepare a message or request a document in context. Every action inherits relevant record links but asks for additional audience scope before external sharing. A paused case retains future obligations; a closed case explains the outcome and handles remaining tasks. Reopening records a new event and does not erase previous closeout.

### F21 — Match inventory to requirements

**Actor:** broker with optional AI assistance. **Screens:** O07, C05.

1. Review the acknowledged requirements and identify hard constraints, preferences and unresolved questions.
2. Retrieve eligible inventory with known source freshness. Exclude non-public or unapproved material from client-shareable output unless a separate authorized off-market process exists.
3. Show per-property reasons and trade-offs, such as “within stated budget; lift not yet confirmed.” Avoid a deceptively precise fit percentage.
4. Inspect suggested options, remove unsuitable matches, add human rationale and identify facts to check.
5. Preview the exact client collection, including language and facts. Choose recipients and deliberately send/share it.
6. Record feedback on the match; revise requirements only with acknowledgment where material.

A property that violates a hard constraint belongs in an explicitly labeled alternative group requiring operator intent, never blended into exact matches. The system must not learn discriminatory preferences from staff behavior. Feedback affects the specific case unless a reviewed aggregate learning policy exists.

### F22 — Coordinate the calendar and viewing itinerary

**Actor:** coordinator/broker. **Screens:** O08, O09, C06.

Start from either a case, property or Calendar. Select participants, purpose, format, property/access contact and time; inspect each dependency. Use agenda view as the complete accessible baseline, with day/week views for spatial planning. Mobile defaults to agenda.

Show tentative and confirmed events differently using text as well as color. Travel buffers and working hours are configurable; external calendars are authoritative only to the extent of their actual synchronization status. A stale integration displays uncertainty and prevents unsupported instant-confirmation claims.

Before finalizing, check conflicts again against current versions. Send authorized proposals/confirmations separately from saving an internal draft. Changes identify who has been notified and whose acknowledgment is pending. Record cancellation/no-show/actual attendance without destroying the original schedule history. For itineraries, show each stop's confirmation independently and provide a printable/shareable client version with authorized meeting information only.

### F23 — Prepare a property and listing

**Actor:** broker/editor. **Screens:** O10–O14, O20.

1. Find or create the physical property; check for likely duplicates using address/unit/reference and human review.
2. Create the commercial listing purpose. Capture facts with units, source and review state, not as a single free-text paragraph.
3. Add commercial instructions, availability and location disclosure level. Keep exact address and public location separately permissioned.
4. Upload media into a private staging area; track rights/consent, type, captions, floor-plan basis and any modifications.
5. Draft Bulgarian source copy from approved facts. Description generation cannot fill missing facts through inference.
6. Resolve readiness issues by category: facts, commercial instruction, media, privacy, language, destination.
7. Produce a versioned preview and route required human reviews.

Importing source material is a proposal, not an overwrite of verified records. Field conflicts show original, incoming, source and affected public surfaces. Autosave preserves a draft; it never publishes. Material unit conversion displays original value and conversion rule and must not blur living/total/land area.

### F24 — Translate, review, publish, and withdraw

**Actor:** translator/reviewer/publisher. **Screens:** O15–O17, O21, O32, O33.

1. Choose a source version and intended locale. Show a source/draft comparison with factual tokens highlighted.
2. Draft or revise the language. Hermes may help, but protected facts remain exact: price, area, bedrooms, location, reference and source URL.
3. Human language reviewer accepts/rejects that version and records unresolved terminology. Specialist claims require their own approval.
4. Publisher sees the complete release: versions, channels, preview, indexability eligibility, schedule, approvals and blocking checks.
5. Confirm the exact release. The system records requested, acknowledged and verified destination outcomes separately.
6. Repair partial failures using the same release identity. Do not republish successful destinations blindly.
7. For withdrawal or critical correction, show all affected locales/channels, execute authorized action and verify outcomes; failed removal is urgent operational work.

Source changes invalidate affected approvals according to field-level impact rules. Numeric/property facts are shared structured data, but surrounding prose may also become misleading and needs review. Human approval before indexing is non-negotiable. The UI cannot hide stale translations behind a “100% translated” statistic.

### F25 — Manage service quality and integrations

**Actor:** manager/authorized administrator. **Screens:** O22–O26.

Reports answer operational questions: which commitments were missed; where cases wait; which sources produce relevant inquiries; where information is stale; whether publication and messages reached destinations. Each aggregate can be explained by authorized underlying records and a clear definition/window.

Integration health is a separate operational view, showing last successful synchronization, current failures, affected work and responsible owner. “Connected” means credentials/configuration exist; it must not imply data is current or delivery is working. Retrying a consequential job requires its idempotency/reconciliation state.

Configuration covers service hours, holidays, routing, languages, notification templates, review capabilities and retention. Preview the impact of a rule change, validate it, record the version, and avoid retroactively changing promises already made to clients. Role changes warn about affected ownership and scheduled work. Reports should support learning, not pressure staff into moving pipeline cards without evidence.

## 12. Adjacent service flows and explicit boundaries

These capabilities belong to the target architecture but must only become visible when the agency actually offers and can operate them. They are not prerequisites for delivering the core buy/sell experience.

### F26 — Long-term renting and letting

**Actor:** tenant, landlord and broker. **Screens:** P02, P05, P11, C03, C08, C10, C11, O05, O19.

Search distinguishes rent period, available-from date, expected term, known recurring charges, deposit information and listed conditions. Unknown costs stay unknown. A viewing request precedes unnecessary document collection. After expressed intent and a supported process, the client receives a proportionate application checklist and knows who receives each item.

The landlord reviews an appropriately limited candidate/proposal view. Do not create opaque tenant “quality scores,” protected-trait filters or automatic eligibility decisions. Any selection criteria and compliance process need human/legal review. A declined application is communicated respectfully with an appropriate reason policy.

The rental case coordinates agreed terms, appropriate document/signature process, confirmed handover and an inventory/condition record. A tenancy start is recorded with evidence. Ongoing rent collection, deposits, notices and maintenance do not become supported merely because the listing says Rent; they require an explicit management scope. Buyer/seller pipeline vocabulary must be replaced with rental-specific stage labels.

### F27 — Short-stay inquiry and confirmed reservation

**Actor:** guest and stay coordinator. **Screens:** P23, C06, C10, O29.

The target defaults to inquiry/quote unless reliable inventory, rates, terms and reservation authority exist. Enter dates, guest count and relevant needs; show nights, currency, itemized known charges, cancellation terms and availability timestamp. A quote has an expiry and version.

“Request to stay” creates a request, not a reservation. The operator confirms capacity and terms; the client completes the approved reservation process. Payment is handled only through an approved provider and independently confirmed status, never a success-looking local animation. Show requested, awaiting confirmation, payment pending if applicable, confirmed, cancelled and completed distinctly.

Arrival information, guest data and access codes are private and time-scoped. A booking conflict preserves the original request and offers actual alternatives. Changes/cancellations display applicable terms before submission. No booking engine UI should launch until double-booking prevention, refunds/cancellation operations and customer support are operationally proven.

### F28 — Property management and service requests

**Actor:** contracted owner/tenant, coordinator and selected provider. **Screens:** C14, C15, O29–O31.

1. Owner sees the actual contracted service scope and relevant properties.
2. A client reports an issue with location, description, urgency and optional photos; the form warns that immediate danger needs appropriate emergency assistance and is not handled by an ordinary web queue.
3. Coordinator triages, assigns responsibility and checks spending/entry authority. AI may suggest categorization but cannot approve expenditure.
4. Obtain quotes/owner approval where required; share only necessary details with an authorized provider.
5. Schedule, record attendance and completion evidence, then request confirmation or resolve disagreement.
6. Reconcile approved costs against invoices and payment evidence before reflecting them in an owner statement.

States: received, triaged, awaiting access/approval/parts, scheduled, work performed, awaiting verification, resolved, reopened, cancelled. Each waiting state names its dependency. Statements distinguish expected, invoiced, paid and reconciled amounts; currency/period and adjustments remain visible. This is accountable coordination, not a claim that the platform holds client money or performs accounting compliance.

## 13. Assistance, privacy, and data maintenance flows

### F29 — Use AI assistance with a visible human boundary

**Actor:** visitor or authorized operator. **Screens:** contextual P02/P05/P16 assistance; O32 review.

Public assistance is optional and source-bounded. The initial public mode retrieves approved explanations and structured listing facts, helps interpret search intent, shows source links and offers a human handoff. It must distinguish available evidence from missing information. Free-form generated customer replies remain drafts for human review; this public retrieval interface does not grant Hermes permission to send messages. Questions about an individual's legal/tax/process situation route to appropriate human review. No unaudited web retrieval or unrelated document upload becomes a public property fact.

Staff assistance begins from a selected task: draft reply, draft translation, extract candidate fields, summarize authorized case, or explain suggested matches. The UI shows scope, input sources, timestamps/version, intended audience and what remains human-controlled. Output is a draft with editable content and field-level differences. Accept selected changes, reject, undo or regenerate without erasing human edits.

If source content changes before approval, invalidate or clearly flag the affected draft. AI errors are correctable in the ordinary editor. The normal task remains usable if assistance times out or is unavailable. Do not use a numerical confidence badge unless calibrated for that exact outcome; show concrete source support and missing evidence instead.

Human approval for a message binds recipients, channel, attachments and exact content; approval for a publication binds version, locale and destinations. Hermes has no publish/send/index/claim-approval control. AI instructions inside customer messages, uploaded files or listing descriptions are untrusted content, never permissions.

The interaction choices align with Microsoft's HAX guidance on capability clarity, correction, uncertainty and user control. The concrete authority model is a product requirement, not a claim that the research mandates this exact architecture. [Microsoft HAX Design Library](https://www.microsoft.com/en-us/haxtoolkit/library/)

### F30 — Control contact preferences, access and personal data

**Actor:** client and authorized privacy operator. **Screens:** C13, C17, C18, O23, O26.

Give a clear preference center separating search alerts, marketing and service communications. Show actual channel verification and subscription state. Revocation updates future scheduled work; a job must re-check eligibility at execution time. Explain unavoidable service communications according to approved policy without treating marketing permission as mandatory.

Clients can inspect participants, revoke invitations within their authority, request a copy of their information, and request correction/deletion. These requests produce a receipt and an owned workflow. Identity checks are proportionate; privacy deadlines and retention/holds are configured from approved legal policy, not invented here. Export excludes other parties' confidential information and uses expiring authenticated delivery. Completion is confirmed only when the authorized process finishes.

### F31 — Correct a material fact already in circulation

**Actor:** broker/publisher. **Screens:** O14, O16, O17, O33; affected P05, C05.

Identify the disputed fact, evidence and affected records. Freeze consequential pending actions that rely on it where necessary. Compare old/new facts, determine the approved correction and record authority. Generate a dependency list: public languages, channels, scheduled alerts, shared matches, active proposals and upcoming viewings.

Publish/withdraw approved corrections with destination verification. Notify affected clients only through reviewed, purpose-appropriate messages; do not assume that changing a webpage informs someone who received a PDF. Mark outdated downloadable versions as superseded where controllable and explain the limits of recall. Reopen any relevant review gates. The correction closes only when failed destinations and dependent actions have an explicit disposition.

### F32 — Import, reconcile, and bulk-edit safely

**Actor:** authorized operator. **Screens:** O27, O28, O10, O14, O17.

Import to a preview/staging area. Show source, scope, row counts and field mapping. Validate units, references, duplicate candidates, rights and required fields. Classify each row as create, update proposal, no change, blocked or needs review. A dry run does not alter live data.

For updates, show diffs against current versions; preserve human-verified fields unless an authorized reviewer chooses the replacement. Preview affected public versions and approval invalidation. Execute an explicit selected set with batch identity and per-item outcomes. Large jobs continue server-side with a durable progress page; closing the tab does not imply cancellation.

Offer recovery according to actual reversibility: restore previous internal version where safe; create corrective external actions for already distributed material. Never label an external publication rollback “undo” if it cannot recall copies. Merges show both identities, dependent cases and visibility implications, retain aliases and an auditable split/reversal path.

## 14. Layout and interaction recipes

These are structural directions for design, not finished visual comps. Dimensions are starting recommendations to test with realistic multilingual content. The public experience should express local knowledge through real place/property photography and precise editorial content. Operational interfaces should feel focused, legible and dependable. Shared typography, controls and semantics connect them; they do not need identical density.

### 14.1 Responsive foundations

| Range / test width | Structural behavior | Constraint |
|---|---|---|
| Narrow: 320–599 CSS px; design at 390 and test 320 | One content column; mobile navigation; filters and complex editors become full-height/full-page surfaces | No essential information or task lost; browser zoom and keyboard remain usable |
| Medium: 600–1023; test 768 | Two-column cards where they fit; compact navigation; optional secondary panes below content | Do not force a cramped desktop sidebar into tablet portrait |
| Wide: 1024–1279 | Persistent navigation where useful; two-column task layouts only with adequate text/controls | Search map may remain a toggle instead of permanent split |
| Extra wide: 1280+; design/test 1440 | Split list/map, case plus context panel, expanded comparison | Cap public content around 1320 px; cap reading prose around 70 characters |

Use content-driven adjustments between these bands. At 200% zoom, a wide viewport can require the narrow composition. At 400% zoom, essential reading and action paths must remain available without two-dimensional page scrolling, with appropriate exceptions for intrinsically two-dimensional content. Horizontal scrolling of a table/map is contained and has an equivalent usable task route.

Spacing foundation: a 4 px base with 8, 12, 16, 24, 32, 48 and 64 px roles. Public gutters begin at 16–20 px on phones and 32–48 px on wide screens. App panes use 16–24 px interior spacing. Density is a deliberate variant, not smaller click targets.

### L01 — Public home and service entry

**Applies:** P01, P17. **Mode:** decide and begin.

First viewport: compact header; one specific service/geography statement; an immediately usable intent/search module; one real visual that establishes place or service; and a nearby human-contact alternative. At 390 × 844, the chosen intent and its first actionable control must be visible without scrolling. Avoid a carousel competing with search.

Below the fold: selected relevant properties or area entry points; concise service process; real team/office proof; practical guides; contact. Show only modules backed by actual content. Empty inventory replaces “Featured properties” with a useful service path, not fake cards.

Sell/Let entry leads with the owner's question, explains the first consultation and keeps a clear Request an assessment action. Testimonials require genuine permission/source context; no numeric success counters without evidence.

### L02 — Search, list and map

**Applies:** P02–P04, P22. **Mode:** narrow a decision set.

```text
WIDE / LIST MODE
┌───────────────────────────────────────────────────────────────┐
│ Brand   Buy   Rent   Sell/Let   Areas     Saved  Language Help │
├───────────────────────────────────────────────────────────────┤
│ Buy · Place [________]   Budget [____]      [Search]            │
│ Active: Place ×   2 bedrooms ×   Budget ×    Clear filters     │
├───────────────┬───────────────────────────────────────────────┤
│ FILTERS       │ Result count + freshness    Sort    List | Map │
│ Type          │ ┌───────────┐ ┌───────────┐ ┌───────────┐       │
│ Bedrooms      │ │ image     │ │ image     │ │ image     │       │
│ Area          │ │ price     │ │ price     │ │ price     │       │
│ More          │ │ key facts │ │ key facts │ │ key facts │       │
│               │ └───────────┘ └───────────┘ └───────────┘       │
│               │ More results / pagination                     │
└───────────────┴───────────────────────────────────────────────┘

NARROW
┌──────────────────────────┐
│ Brand     Saved   Menu    │
│ Buy · Place              │
│ [Search] [Filters (3)]    │
│ Active criteria          │
│ Results     Sort  Map    │
│ ┌──────────────────────┐ │
│ │ Photo                │ │
│ │ Price · purpose      │ │
│ │ Place · key facts    │ │
│ └──────────────────────┘ │
│ Next result              │
└──────────────────────────┘
```

List mode: ~248 px filter rail on sufficiently wide screens; remaining space uses two or three cards based on minimum readable card width. Map mode: replace permanent rail with a filter toolbar/drawer, then split results and map roughly 45:55. Do not attempt filters + three-card grid + map simultaneously.

A card's reading order is price/period, short factual identity, locality, area basis/bedrooms/type, availability and meaningful differentiators. The photograph attracts attention but is not the sole link label. Use a main property link plus independent Save/Compare controls; avoid nested interactive elements. Show a maximum of a few genuinely distinguishing attributes, not a row of unexplained icons.

Filter sheet has a title, result preview status, grouped controls, Clear and Apply. Scrollable body and fixed action region must account for device safe areas and the on-screen keyboard. Map markers show price or grouped count; focus/selection coordinates with the list. Approximate-location circles never masquerade as exact building pins.

### L03 — Property detail

**Applies:** P05, P06, P21. **Mode:** understand fit and choose a next step.

```text
┌───────────────────────────────────────────────────────────────┐
│ Header / return to results                                    │
│ Property identity · locality                 Save  Compare    │
│ Price + basis · availability · critical facts                  │
├───────────────────────────────────────┬───────────────────────┤
│ REAL MEDIA                            │ NEXT STEP             │
│ Photograph + gallery / floor plan     │ Named agent/team      │
│                                       │ Viewing / question    │
├───────────────────────────────────────┤ Response expectation  │
│ Facts → description → costs → place  │ Other contact choices │
│ What to confirm → evidence → guides   │ Reference             │
└───────────────────────────────────────┴───────────────────────┘
```

Use an approximately 2:1 main/action split at wide sizes, with the action panel ~320–360 px where space allows. Sticky behavior begins after the panel's normal position and stops before it overlaps the footer. A section-jump bar is useful only for a genuinely long detail page.

Mobile order: identity/status/price, media, key facts, primary next step, remaining detail. A compact bottom action strip may appear after the inline action leaves view; it must not obscure content, focus, cookie controls or the software keyboard. One dominant action plus one secondary contact action is enough.

The gallery is an accessible modal or dedicated route with close/back, image position, previous/next buttons, caption, floor-plan labels and zoom controls. Escape returns to the invoker. Essential property facts are outside the gallery. Video does not autoplay with sound. Floor-plan text needs an accessible textual alternative.

### L04 — Comparison and shortlist

**Applies:** P07–P09, C05. **Mode:** deliberate trade-offs.

Wide: stable attribute column; two/three selected property columns; sticky compact property identities after scroll; grouped rows for cost, space, location, condition, availability and priorities. Place unknowns inline. Show differences is an optional toggle with a clear way back to all facts.

Mobile: two selected property summaries followed by stacked attribute groups with corresponding A/B values. Avoid squeezing a four-column spreadsheet into 390 px. A property selector switches one comparison slot while preserving the other. Selected property identity stays visible within the comparison region.

Private notes and household opinions appear below objective facts and identify audience/author. A share control previews scope. Never mix an internal broker risk note into a public comparison export. Printable comparison includes generation date, listing references, source prices and a freshness warning where warranted.

### L05 — Guided forms and review

**Applies:** P11–P14, P18–P19, C09, C18. **Mode:** provide information with confidence.

Recommended content width: 560–720 px for ordinary forms. Wide supporting context can sit alongside, but the input order stays linear. Use visible labels, short hints, examples with locale-appropriate formatting, and “optional” labels where needed. Native controls take precedence unless there is a proven task reason for a custom widget.

One coherent decision group per step, not one trivial input per page. Progress names meaningful steps and supports going back without losing data. Only show a completion percentage if the denominator is stable and meaningful. Review pages summarize exact values with specific Change links returning to the same review context.

An error summary sits before the form and links to fields; inline errors use the same wording. Validation begins at a meaningful point, usually submit or after a completed field interaction, not while a person is typing the first character. Processing disables the consequential action, announces status, and keeps the content legible. A receipt is a durable page with reference, outcome and next step.

### L06 — Client overview

**Applies:** C03, C11, C16. **Mode:** know where things stand.

```text
┌─────────────────────────────────────────────────────────┐
│ My journey     Case selector                 Help       │
├─────────────────────────────────┬───────────────────────┤
│ NEXT ACTION                     │ Your contact          │
│ What / why / due / [Do it]       │ Person, channel, time │
├─────────────────────────────────┤                       │
│ Progress: done → active → next  │ Next appointment      │
│ Waiting on ...                  │ or agreed update     │
├─────────────────────────────────┴───────────────────────┤
│ Relevant properties / open questions                    │
│ Recent meaningful updates                               │
└─────────────────────────────────────────────────────────┘
```

Choose the next action from actual assigned tasks and permissions; no AI-invented instruction appears here. Where multiple actions are equally important, show a short ordered list. On mobile, human contact follows the current action; it is not buried under a long activity feed. Empty states explain what the broker is doing or how to ask for help.

Seller mode substitutes preparation/marketing status, pending approvals and owner instructions for a buyer's shortlist. Shared components retain the same action/status semantics.

### L07 — Agency Today

**Applies:** O01, O18. **Mode:** deliver commitments.

```text
┌────────────┬─────────────────────────────────────────────────┐
│ TODAY      │ Global search                     Operator     │
│ Inbox      ├─────────────────────────────────────────────────┤
│ Cases      │ Today · coverage · workload                     │
│ Properties │ Needs intervention                              │
│ Calendar   │ [issue / impact / owner / next action]          │
│ ...        │ Due / overdue commitments                       │
│            │ [case / action / due / direct action]           │
│            │ Appointments → unanswered → approvals → planned │
└────────────┴─────────────────────────────────────────────────┘
```

No top-of-page wall of revenue cards. Use compact counts as navigation aids, not decoration. A row contains enough context to choose an action without opening three records. Show record details in a side inspector at wide widths and a full page at narrow widths. The row remains in context until the outcome is confirmed; completed work moves with an accessible announcement and recoverable navigation.

### L08 — Inbox and communication

**Applies:** O02, O03, C07, O32. **Mode:** understand and respond.

Three panes only when width permits: queue ~280 px; conversation flexible; record context ~300 px. Collapse context first, then queue into navigation. At narrow sizes show one pane at a time, with a clear Back to inbox and unread position preserved.

Queue row: person/channel, subject or property, latest meaningful snippet, age, owner and required-action status. Avoid simultaneous badge clutter for every metadata field. Conversation messages group by actor/time while preserving channel and delivery state. Composer has a conspicuous recipient/channel line, attachments, draft status and named Send action. Internal notes use a separate mode/region with persistent audience label.

An AI draft opens as editable proposed content with source checks; it does not immediately replace a human draft. If two operators reply, show presence/draft activity and resolve conflicting sends through server state, not solely an advisory avatar.

### L09 — Case workspace

**Applies:** O05, O06, O19. **Mode:** progress a client outcome.

Top: case purpose/reference, stage, owner and client relationship. Next: a prominent next-action/blocker area. Sections: Overview, Properties, Activity & messages, Appointments, Documents, Proposals where applicable. A persistent side context shows parties, contact preferences, core requirements and important constraints; keep confidential details behind appropriate permission.

The default Overview presents the brief, active property relationships, outstanding questions and recent decisions. Activity is a meaningful business timeline with filters, not a dump of every autosave. Major decisions are linkable entries. Each embedded object can open fully with return context.

Do not allow side panel → modal → nested modal editing chains. A complex task becomes a dedicated page with its own save/recovery state. Stage transitions preview what is required and affected. The stage indicator never becomes the only action control.

### L10 — Property and listing editor

**Applies:** O11–O14, O21. **Mode:** prepare accurate material.

```text
┌────────────────────────────────────────────────────────────┐
│ Property / listing reference · Draft saved · Preview        │
├────────────┬────────────────────────────┬──────────────────┤
│ Sections   │ EDITABLE CONTENT           │ READINESS        │
│ Facts      │ Labels, units, source      │ Blocking issues  │
│ Terms      │ Last reviewed / unknown    │ Review required  │
│ Media      │ Field-level differences    │ Next task        │
│ Copy       │                            │ Affected locales │
│ Languages  │                            │                  │
├────────────┴────────────────────────────┴──────────────────┤
│ Save draft state · Request review (separate from publish)  │
└────────────────────────────────────────────────────────────┘
```

The section list indicates errors/review needs without turning everything into completion percentages. A readiness panel lists actionable issues and the actor who can resolve them. Source evidence is adjacent to a fact, available without abandoning the editor. A clean form is not equivalent to an approved listing.

Autosave status has four explicit meanings: editing, saving, saved at time, save failed. A publication button is unavailable until capability and version-bound gates allow it. On mobile, the editor uses sections and a readable preview toggle; readiness becomes an accessible summary page/panel.

### L11 — Review, translation and publication

**Applies:** C12, O15–O17, O32, O33. **Mode:** understand exact consequences.

Wide: source/previous version and proposed version side-by-side, synchronized by section rather than forcing identical text heights. Separate protected facts from language prose. A change summary lists material differences, warnings, reviewer scope and affected destinations. Narrow: toggle Previous / Proposed with a persistent diff summary and no dependence on color alone.

Approval controls name the action precisely: Approve Bulgarian facts, Approve Hebrew translation, Approve owner preview, Publish selected versions. Do not combine these into a single generic green Approve button. Comment/request changes identifies the specific field or passage and intended reviewer.

The final publication review contains destination checklist, version identifiers, relevant approvals, schedule/timezone and an explicit consequence statement. Post-action view is a destination-status list with failure repair actions. Withdraw uses the same rigor and makes partial withdrawal visible.

### L12 — Calendar and scheduling

**Applies:** C06, O08, O09. **Mode:** agree and keep a time.

Agenda is always available. Day/week views show real time scale, overlaps, travel buffers and tentative/confirmed labels. Use accessible event links rather than hundreds of focusable grid cells for a read-only calendar. Editing a time works through ordinary fields with date/timezone labels; dragging is optional acceleration and always has an equivalent form.

The schedule editor places participant/access conflicts beside the time, then logistics, then notification preview. Accessible arrival needs are private and shared only with people arranging them. When selecting multiple days, preserve local date semantics; daylight-saving ambiguity requires an explicit timezone-aware resolution.

### L13 — Documents and evidence

**Applies:** C08–C09, O20. **Mode:** provide or verify the right evidence.

Group by purpose/request, then show file versions inside each group. Rows include document type, owner/requester, version/date, processing/review state and audience. Upload status appears per file. Preview controls include download when authorized, accessible text where available, version history and replacement action.

A review pane shows the question being answered, review scope and outcome; it does not imply the reviewer has certified more than they checked. Do not show identity-document thumbnails in broad case lists. Failed scanning or unsupported preview has a safe recovery path without opening untrusted content in a normal app frame.

### L14 — Managed service operations

**Applies:** C14–C15, O29–O31. **Mode:** resolve an issue and account for it.

Client view: current request status, next action, agreed appointment, updates and approved costs. Operator view: triage queue, property/access context, approvals, provider assignment and completion evidence. Financial rows carry source currency, period and reconciliation state; amounts never use green checkmarks simply because someone entered them.

Emergency guidance appears before routine request submission when the stated scenario warrants it. Use jurisdiction-appropriate, human-approved contact instructions. A normal “urgent” flag must not imply a monitored emergency response service.

### L15 — Area, service and guide content

**Applies:** P15–P16, P20, P24. **Mode:** understand and choose help.

Use a readable single-column article body with section navigation for long guides. Lead with scope, jurisdiction/topic and the reader's main question. Place relevant listings/contact next to the point where they become useful, not as repeated obstructive overlays. Show named authors/reviewers only where real, plus review date for time-sensitive claims.

Maps, costs and timelines have source context and accessible alternatives. Legal/process material distinguishes general education from case-specific professional advice. The language switcher is a text-based menu with endonyms, not flags used as language labels.

### L16 — Reports, settings and durable job results

**Applies:** O22–O28. **Mode:** inspect cause and make a controlled change.

Reports lead with the question, reporting period, definition and data completeness. Charts have a table alternative and a link to authorized contributing records. Counts suppressed by missing integrations are labeled unavailable rather than zero.

Settings group by operational purpose. High-impact changes have a preview/diff and summary of affected future work. Bulk/import jobs have a durable route with scope, progress, per-item outcomes, errors and recovery options. A job's completion banner appears only when every item has a terminal or explicitly actionable partial outcome.

## 15. Screen contract register

All screens inherit Chapter 17's relevant loading/error/permission/responsive states. “States to draw” lists the additional states that must appear in the design file. These are coverage obligations, not optional polish.

### 15.1 Public screens

| ID | Surface / layout | Primary action and mandatory information | States to draw |
|---|---|---|---|
| P01 | Home / L01 | Choose intent; scope, useful search, human contact | First visit, return, empty inventory, locale suggestion |
| P02 | Results / L02 | Refine/open property; criteria, count, sort, availability | Initial, filtered, updating, zero, partial, restored back |
| P03 | Filters / L02 | Apply draft; semantic groups, selected values, count status | Pristine, dirty, invalid range, unavailable count |
| P04 | Map results / L02 | Search area/select listing; bounds and location precision | Approximate/exact, cluster, selected, denied location, map failure |
| P05 | Property / L03 | Ask/request viewing; facts, price basis, status, evidence | Available, unconfirmed, negotiating, reserved, sold/let, incomplete facts |
| P06 | Media / L03 | Inspect photo/plan; caption, type, position, provenance | Loading, unavailable, zoom, video, plan text alternative |
| P07 | Compare / L04 | Choose next step; aligned facts and unknowns | Two/three selected, changed price, missing fact, narrow pair mode |
| P08 | Saved / L04 | Organize/compare; persistence scope | Empty, device-local, signed-in merge proposal, removed with recovery |
| P09 | Shared shortlist / L04 | Inspect/comment if authorized; audience and owner | Public-facts link, invited private, expired, revoked |
| P10 | Search alert / L05 | Save subscription; exact criteria, frequency, channel | Verification pending, active, edit, paused, unsubscribed |
| P11 | Inquiry / L05 | Send request; context, purpose, one contact route | Blank, prefilled, error, submitting, unknown outcome |
| P12 | Inquiry receipt / L05 | Understand next step; reference, accepted context | Accepted, amendment request, duplicate reconciled |
| P13 | Viewing request / L05 | Propose/book if supported; format, timezone, access needs | Preferred windows, real slots, conflict, request pending |
| P14 | Viewing status / L12 | Confirm/reschedule/cancel; exact arrangement | Proposed, confirmed, change pending, cancelled, expired access |
| P15 | Areas / L15 | Explore/search an actual area; source-backed context | Area index/detail, no inventory, map unavailable |
| P16 | Services/guides / L15 | Understand/request help; scope, reviewer/date where needed | Country variants, stale review warning, service unavailable |
| P17 | Sell/Let entry / L01 | Request consultation; deliverables and first step | Sell, let, unsupported area/service |
| P18 | Owner intake / L05 | Provide minimal facts; privacy and progress | Unknown answers, draft, upload failure, review, submit |
| P19 | Owner receipt / L05 | Follow next step; reference and expectations | Accepted, missing reachable contact, resume invitation |
| P20 | Team/contact / L15 | Choose a real contact route; office/service hours | In hours, out of hours, supported languages, external-app handoff |
| P21 | Unavailable listing / L03 | Understand status/find alternatives | Sold, withdrawn, removed, replaced with exact mapping |
| P22 | Search recovery / L02 | Retry/change explicit criteria | Zero matches, service outage, partial stale results |
| P23 | Short-stay request / L05 | Request quote; dates, known costs, terms | Inquiry-only, quote expired, conflict, confirmed by approved process |
| P24 | Help/privacy/accessibility / L15 | Get assistance/manage consent; actual support paths | Preferences, accessible alternative, policy version, request receipt |

### 15.2 Client screens

| ID | Surface / layout | Primary action and mandatory information | States to draw |
|---|---|---|---|
| C01 | Access/sign-in / L05 | Verify channel; return context and safe recovery | Link sent, expired, consumed, wrong account, rate-limited |
| C02 | Invitation / L05 | Accept/decline; inviter, case, access scope | Valid, revoked, expired, already accepted |
| C03 | Overview / L06 | Complete next action; progress, owner, commitments | New case, action due, waiting, paused, multiple cases |
| C04 | Requirements / L05 | Confirm/edit brief; hard/preferences/unknown | Draft, awaiting acknowledgment, agreed, material revision |
| C05 | Private properties / L04 | Review matches and feedback; audience | Suggested, saved, question, declined, unavailable, collaborator conflict |
| C06 | Appointments / L12 | Confirm or manage arrangement | Proposal, confirmed, reschedule, no-show follow-up |
| C07 | Messages / L08 | Converse in case; recipients/channel | Empty, drafting, uploading, pending, failed, unknown delivery |
| C08 | Documents / L13 | Respond to request; purpose/audience/review | Missing, processing, needs replacement, reviewed, superseded |
| C09 | Upload / L13 | Submit permitted files | Selected, progress, offline, too large, unsafe, unreadable |
| C10 | Proposal / L11 | Review/ask/respond through approved process | Draft preview, current, changed, expired, submitted, unknown outcome |
| C11 | Seller/landlord overview / L06 | Give needed instruction; marketing/preparation facts | Awaiting owner, preparing, publishing, marketing, paused, completed |
| C12 | Listing preview / L11 | Approve/request change; exact version and scope | First preview, diff, approved, stale approval, restricted locale |
| C13 | Preferences / L05 | Control alerts and contact choices | Verified/unverified routes, active/paused subscriptions, revoked permission |
| C14 | Service request / L14 | Report/track issue; scope and next action | Routine, possible emergency, awaiting approval, scheduled, dispute/reopen |
| C15 | Statement / L14 | Understand period and amounts; evidence links | Draft, available, adjustment, disputed, unreconciled |
| C16 | Closeout / L06 | Understand completion and remaining obligations | Completed, failed/withdrawn, aftercare, retained-record access |
| C17 | Participants / L05 | Invite/revoke scoped access | Pending invite, collaborator, expired access, capability denied |
| C18 | Data request / L05 | Request correction/export/deletion | Verification, received, in progress, policy restriction, completed |

### 15.3 Agency screens

| ID | Surface / layout | Primary action and mandatory information | States to draw |
|---|---|---|---|
| O01 | Today / L07 | Act on commitments; reason/owner/due | Normal, overloaded, unowned, outage, no tasks |
| O02 | Inbox / L08 | Triage/respond; channel/context/delivery | Unassigned, mine, awaiting, duplicate candidate, provider failure |
| O03 | Inquiry / L08 | Resolve/link/create case; original request | New, assigned, contact failed, ready, resolved |
| O04 | Cases / L09 | Find and prioritize; stage/owner/next action | Table/board, filters, stale records, empty, access-limited |
| O05 | Case / L09 | Progress outcome; brief, participants, next action | Active, waiting, conflict, paused, closed, reopened |
| O06 | Contact/relationships / L09 | Understand scoped relationships/contact | Verified channel, suspected duplicate, multiple roles, restricted fields |
| O07 | Matching / L04 | Review/share reasons and trade-offs | Exact matches, alternatives, unknown facts, no matches, draft share |
| O08 | Calendar / L12 | Plan with availability/coverage | Agenda/day/week, tentative, conflict, stale sync |
| O09 | Appointment / L12 | Propose/confirm/update | Draft, access pending, confirmed, reschedule, cancelled, no-show |
| O10 | Property inventory / L16 | Find asset/listing and freshness issues | Sale/rent, duplicates, unpublished, outdated, archived |
| O11 | Property record / L09 | Manage asset, parties and linked listings | Intake, shared asset, conflicting facts, restricted address |
| O12 | Listing editor / L10 | Prepare source version and terms | Pristine, dirty, autosaved, save failed, conflict, review-ready |
| O13 | Media / L10 | Upload/organize with rights and labels | Processing, failed, missing rights, modified image, superseded |
| O14 | Facts/evidence / L10 | Reconcile exact facts and sources | Missing, conflicting, owner-supplied, reviewed, stale |
| O15 | Translation / L11 | Review locale against source version | Missing, draft, reviewing, rejected, approved, source changed |
| O16 | Approval/release / L11 | Review exact consequences | Blocked, eligible, approval stale, scheduled, executing |
| O17 | Distribution / L11 | Inspect/repair destination outcomes | Published, partial, failed, unknown, withdrawing, withdrawn |
| O18 | Tasks / L07 | Complete actual work or manage dependency | Open, due, waiting, done with evidence, cancelled |
| O19 | Proposals / L11 | Prepare/version/coordinate terms | Draft, reviewed, submitted, countered, expired, agreed-next-step |
| O20 | Document review / L13 | Review for named purpose | Scanning, ready, rejected, replaced, restricted sharing |
| O21 | Content / L10 | Prepare approved guides/areas/services | Draft, review due, locale incomplete, published, withdrawn |
| O22 | Reports / L16 | Answer operational question | Complete/incomplete data, changed definition, drill-down denied |
| O23 | Team/access / L16 | Assign capabilities and coverage | Invite, active, absence, revoke, ownership transfer pending |
| O24 | Service policy / L16 | Configure hours/routing/notifications | Draft, impact preview, validated, active, conflicting rules |
| O25 | Integration health / L16 | Diagnose affected work | Connected/current, delayed, failed, reauthorization required |
| O26 | Audit/privacy work / L16 | Trace authorized event/request | Restricted, filter, redacted export, policy hold, complete |
| O27 | Duplicate/merge / L11 | Compare and safely resolve identities | Candidate, reviewed, merge impact, merged, reversal |
| O28 | Import/bulk job / L16 | Preview/execute/reconcile selected items | Mapping, validation, dry run, running, partial, recovery |
| O29 | Service operations / L14 | Coordinate supported stays/management | Inquiry, scheduled work, conflict, approval needed, closed |
| O30 | Service request detail / L14 | Own triage, provider and evidence | Waiting reason, quote, owner approval, completed, disputed |
| O31 | Statement reconciliation / L14 | Explain actual amounts and adjustments | Imported, unmatched, proposed adjustment, reviewed, released |
| O32 | AI draft review / L11 | Inspect/edit/accept a proposed change | Generating, partial draft, sourced, unsupported, stale, rejected |
| O33 | Material correction / L11 | Reconcile affected public/client records | Disputed, approved correction, dependent work, partial repair, resolved |

## 16. Visual system and component contract

### 16.1 Art-direction brief

Recommended direction: **clear local expertise**. Public pages earn character from genuine properties, place, people and well-edited information. Use daylight-readable light surfaces, a dark ink text color, one deep blue primary action color and restrained supporting neutrals. This is a starting visual recommendation, not an inherited brand specification. Preserve any subsequently confirmed legal logo/brand assets without importing incumbent layouts.

Typography should support Latin, Cyrillic, Greek and Hebrew convincingly. Start with a humanist multilingual sans family or coordinated script families; use actual mixed-language specimens before choosing a font. Noto Sans and a compatible Hebrew family are practical candidates, not a mandatory final selection. Avoid decorative letter spacing in running text, tiny uppercase labels, and display typography in dense operational controls.

Proposed type roles: public body 18/28 px; compact public/support text 16/24; operational body 15–16/22–24; dense table text 14/20 only when comfortable and zoomable; captions 14/20. Public headings can be expressive but bounded; operational headings use a compact fixed scale. These are product targets, not WCAG font-size requirements.

Use radius, borders and elevation consistently. Cards group independently actionable objects; they are not wrappers for every paragraph. Status color has meaning and always accompanies text/icon. Reserve red for error/destructive consequence; overdue does not automatically mean emergency. Availability and approval need distinct labels, not matching green pills.

Photographs must be authentic, appropriately licensed and accurate to the property/place. Generated imagery may illustrate clearly labeled concepts only; it must never stand in for actual listing evidence. No cosmetic image edits that conceal defects or change represented structure. Cropping must not make key space features misleading.

### 16.2 Token roles to define

Define semantic tokens before component production: canvas/surface/subtle-surface; primary/muted/inverse text; border/divider/focus; action default/hover/pressed; link/visited; selected; success/warning/error/info; overlay; spacing; typography; control heights; radius; elevation; motion duration; z-index layers. Tokens must support disabled, selected and error combinations without relying on opacity alone.

Use a single default light theme initially. Dark mode is optional future scope and needs its own full media, contrast and state review; a token inversion does not count as a designed theme. Honor reduced-motion and forced-colors settings in the initial scope.

### 16.3 Components with full state ownership

| Component family | Required design contract | Extra cases |
|---|---|---|
| Buttons/links | Purposeful text, primary/secondary/destructive roles, loading label, focus | Pending vs disabled, external navigation, icon-only accessible name |
| Inputs/selects/comboboxes | Visible label, hint, value, validation, keyboard semantics | Unknown answer, optional, autofill, mixed direction, long values |
| Filters/chips | Selected criteria, removable item, clear/apply semantics | Counts pending, impossible combination, explicit relaxation |
| Property card | Stable reading order, real media, price basis, key facts, status | Missing photo/price, stale availability, saved, compare-selected |
| Fact/evidence row | Value, units, basis, provenance and unknown state | Conflict, changed value, permission-limited detail |
| Timeline | Human event, actor, time, source, linked consequence | Same-time events, correction, restricted event, delayed synchronization |
| Task/commitment row | Action, reason, owner, due, dependency | Overdue, unassigned, waiting, completed with evidence |
| Stage/milestone | State, entry evidence, current step, next dependency | Parallel work, pause, failure, reopen; non-color indicators |
| Data table | Real headers, meaningful row actions, sort/filter state | Bulk selection scope, horizontal container, responsive alternative |
| File/upload | Per-file state, purpose, audience, progress and recovery | Partial failure, resume, scan rejection, version replacement |
| Gallery/map/calendar | Standard controls plus task-equivalent alternatives | Keyboard-only, touch, reduced motion, failed third-party asset |
| Message composer | Audience/channel, draft status, attachments, explicit send | Internal-note separation, collision, stale draft, unknown outcome |
| Diff/approval | Before/after, changed fields, review scope, consequence | Source changes mid-review, partial approval, insufficient capability |
| Notification/receipt | Outcome and next action at appropriate persistence | Long-running, duplicate reconciliation, delayed delivery |
| Dialog/sheet/popover | Correct semantics, close path, focus lifecycle | Dirty state, long content, virtual keyboard, route/back integration |
| Empty/error panel | Situation, reason where known, next action | Empty vs inaccessible vs failed vs incomplete response |

Every component includes default, hover where relevant, focus-visible, pressed/selected, pending, disabled with reason where needed, error and read-only variants. A status display does not need an artificial hover state, but every actual interaction needs a complete contract.

## 17. Global interaction states and recovery

### 17.1 State inventory

| State | What the person sees | Required recovery or persistence |
|---|---|---|
| Initial loading | Stable skeleton only where structure is known; real page identity | Keep navigation/help available; do not announce dozens of skeletons |
| Refreshing | Existing data plus updating indicator | Preserve focus/scroll; distinguish older data from confirmed current data |
| Empty-new | Why the area is empty and a useful first action | No fabricated records or irrelevant onboarding tour |
| Empty-filtered | Exact criteria and deliberate ways to change them | Preserve search; no automatic broadening |
| Partial data | Which sections are available and which failed | Retry failed scope without wiping successful work |
| Stale data | Last confirmed update and limitations | Refresh/check action; block consequential use where required |
| Permission-limited | Safe explanation and legitimate request-access path | Do not reveal the existence/details of unauthorized records |
| Session expired | Need to sign in again without losing safe draft context | Return to allowed destination; no automatic post-login consequential action |
| Offline | Connectivity state and exactly what is/isn't saved | Preserve safe local edits explicitly; never queue high-impact effects invisibly |
| Slow response | Action-specific pending message and safe alternatives | After a reasonable threshold, show status/retry/cancel only where truthful |
| Validation error | Linked summary and inline correction | Keep valid values, selection and uploaded safe files |
| Server rejection | Reason in task language and reference if needed | Correct, retry or contact owner; no fake success |
| Unknown outcome | Submission/operation identity and checking state | Reconcile before another logical send/publish/booking |
| Version conflict | What changed, by whom if appropriate, before/after | Keep own draft; choose merge/reapply against latest version |
| Dirty draft | Whether changes are local or server-saved | Navigation warning only when something would actually be lost |
| Saved draft | Scope and time of save | Distinguish saved from reviewed/published/sent |
| Success | Exact confirmed result and next step | Durable result for important operations; no toast-only evidence |
| Revoked/deleted | Safe terminal state; authorized alternatives | Clear sensitive caches; prevent stale Back navigation from revealing data |
| Rate-limited | Why temporarily unavailable and retry timing if known | Preserve draft; accessible support path; no infinite spinner |
| Unsupported capability | What is unavailable in this service/channel/device | Offer a real alternative without a dead-end teaser |

### 17.2 Interaction rules across screens

- Use inline feedback for field/local changes, a persistent banner for record-wide risk, and a dedicated receipt/job page for consequential operations. Toasts may confirm reversible minor actions but cannot be the sole record of publication, booking or delivery.
- Optimistic UI is suitable for a reversible local save/selection with rollback. External messages, bookings, approvals, publications and financial state wait for authoritative outcomes.
- A disabled action explains the blocking prerequisite when the user is legitimately allowed to know it. Hiding an unauthorized action is not access enforcement.
- Navigation preserves coherent context but never embeds private free text in public URL parameters, analytics or referer data.
- Mobile full-screen filters respect browser Back. Back closes an active route-like sheet before abandoning the search; it does not unexpectedly submit changes.
- Destructive confirmations name the object, effect and recoverability. Avoid repeated generic “Are you sure?” for harmless actions; demand deliberate confirmation for genuine consequence.
- Errors have stable support references but never expose stack traces, credentials, provider secrets or another party's personal information.
- Draft persistence is classified: public non-sensitive search state can remain on device; private/sensitive forms use authenticated server drafts or carefully scoped session storage. Do not claim unsent confidential text is recoverable after sign-out unless a secure design actually provides that guarantee.
- Updates arriving while someone is reading are non-disruptive. Material conflicts are shown before the person acts; do not reorder an active queue underneath their pointer.

### 17.3 Notification policy

| Event | In-app behavior | External behavior |
|---|---|---|
| Request accepted | Durable receipt | Transactional acknowledgment if supported and authorized |
| Broker asks a question | Action in client overview/messages | Preferred service channel under policy |
| New property match | Collection update | Opted-in alert/digest; deduplicated |
| Viewing confirmed/changed | Appointment status and clear diff | Approved service notification/calendar update |
| Price/availability correction | Mark changed values and affected next steps | Reviewed notification to relevant recipients where appropriate |
| Internal task due | Today queue | Staff notification according to role/preferences |
| Publication/message failure | Persistent actionable issue | Responsible operator/escalation; never customer-facing technical detail |
| AI draft ready | Contextual draft indicator | No unsolicited customer message |

Quiet hours, frequency and escalation policy are explicit. Critical operational warnings may override ordinary staff digest timing under a configured policy; marketing never gains that privilege. A notification does not mark a message read or a task complete merely because it was displayed.

Deterministic receipts, reminders and opted-in listing digests may run automatically only under an authorized human-approved template/rule, verified event and current recipient eligibility. Their automatic execution is separate from generative drafting. Changes to recipient scope, factual meaning or generated prose require fresh appropriate review. Hermes never becomes the outbound executor through an indirect automation rule.

## 18. Content, localization, and property truth

### 18.1 Required property content contract

| Information | Required representation | Never infer |
|---|---|---|
| Identity | Stable listing reference and physical-property relationship | A changed title creates a new property |
| Purpose | Sale, long-term rent or supported short stay | Price period from the size of the number |
| Price | Amount, source currency, period/basis, known inclusions and meaningful update | Missing price equals zero; an indicative conversion is a contractual quote |
| Fees/costs | Named known charge, basis, payer if known, source and date | Complete transaction cost from an incomplete list |
| Area | Value, unit, area basis and source | Built/total area equals usable living area; land equals indoor space |
| Rooms | Separate room and bedroom fields with local terminology explanation | A translated room count implies a bedroom count |
| Location | Country, region, settlement/neighborhood, public precision level | A geocoder's point is a permission to disclose exact address |
| Condition | Source-supported description and date | Attractive photos prove absence of defects |
| Access/features | Explicitly known values and unknowns | A missing field means no lift, no step, no restriction, or full accessibility |
| Availability | Commercial state, basis and last check | Published means available; reserved means legally completed |
| Media | Type, capture/source context, rights, modification disclosure | A rendered renovation is the present physical property |
| Evidence | Source reference, review type, reviewer capability/date | An administrative review proves title or legal compliance |
| Public description | Approved editorial facts and appropriate limitations | Unverified yields, legal eligibility, panoramic views or distances |

Unknown facts should invite a useful question at the relevant place. “Ask us to confirm lift access” is clearer than a blank cell or an undocumented “Verified property” badge. A disclosure cannot repair an inaccurate headline; high-impact facts must be correct where the decision is made.

### 18.2 Language and direction

Bulgarian is the default editorial source locale for public content. Original source evidence retains its original language. A Bulgarian summary of a Greek document is not itself an authoritative legal translation. Public translations require human approval before release/indexing; record source version and approved locale version separately.

Support the planned public languages through complete task paths, including search vocabulary, errors, confirmations, receipt emails if offered, accessibility labels and unsubscribe/preferences. A translated landing page with an untranslated form is incomplete. Staff language choice changes labels and formatting, not underlying data or permissions.

Use explicit HTML language and base direction; use logical layout properties; isolate mixed-direction references, addresses, numbers and URLs. Hebrew requires a full RTL composition review, including navigation, input behavior, icons, tables, calendar and comparisons. Directional arrows mirror where meaning requires; photographs, logos and media playback controls do not mirror indiscriminately. These implementation principles follow W3C's direction guidance. [W3C: structural markup and RTL](https://www.w3.org/International/questions/qa-html-dir)

Field labels are localized; stable references remain unchanged. Store source amounts with currency and represent timestamps as instants plus meaningful timezone where appropriate. Display currency/date/number formats for locale without changing the source fact. Locale switching must not reinterpret an already entered decimal or swap the meaning of a date.

Location search supports local names, approved aliases/transliterations and exact listing references. Confirm ambiguous geographic matches. Language preference must not be treated as citizenship, residency or financial eligibility.

### 18.3 Copy and microcopy

Write action labels as specific verbs with objects: Request a viewing, Send question to the team, Save draft, Request translation review, Publish these versions. Use “Continue” only within a clear multi-step sequence. Avoid “Submit” where the consequence can be named.

Use outcome language precisely:

| Situation | Preferred meaning | Misleading meaning to avoid |
|---|---|---|
| Inquiry accepted | “Your request was received. Reference …” | “An agent is reviewing it” before assignment |
| Viewing requested | “We’ll confirm a time after checking access.” | “Your viewing is booked” |
| Provider accepted outbound message | “Sent to the messaging service; delivery pending.” | “Customer received your message” |
| Availability not recently confirmed | “Availability needs confirmation.” | “Available now” |
| Translation draft | “Draft translation — awaiting human review.” | “Ready for international buyers” |
| Document uploaded | “Uploaded. Processing and review are next.” | “Document approved” |
| Transaction progress | “Documents under review by …” | “Legally verified” without the actual scope |
| Unknown external action outcome | “We’re checking whether this completed.” | “Failed — send again” when duplication is possible |

Examples in prototypes must be explicitly fictional. No real customer identity, private exact address, identity-document scan or confidential proposal enters a shared design file. Use realistic data shapes without manufacturing public business claims.

## 19. Frontend behavior and integration contracts

This chapter describes observable contracts. It does not select a frontend framework, CMS, search engine or backend from the current implementation.

### 19.1 Application boundaries

- Public discovery and approved content must render useful semantic HTML quickly and support deep linking. Search, forms and navigation should retain a meaningful baseline under delayed JavaScript; map and AI assistance are progressive enhancements.
- Private client and staff applications enforce access server-side and do not place confidential data in public/static caches. Their route shells can be shared structurally without sharing data eligibility.
- A single semantic design system supplies common controls, statuses and accessibility patterns. Public, client and staff surfaces can choose different density/layout variants.
- Feature flags advertise only operationally supported capabilities. A half-connected channel must not appear as an available contact or instant-booking option.

### 19.2 Minimum view-model guarantees

| View model | Fields the UI needs | Reason |
|---|---|---|
| Listing summary/detail | Stable ID/ref, version, purpose, price object, fact values/bases, location precision, commercial status, media metadata, locale approval, freshness | Correct cards, details, comparison and status actions |
| Fact | Value or explicit unknown, unit/basis, source class, source reference where allowed, review status/time | Prevent unknown/false and verified/unverified confusion |
| Search response | Query identity, normalized applied filters, items, pagination/cursor, count type, freshness, partial/error scopes | Accurate criteria, count and restoration behavior |
| Case summary | ID, type, stage, disposition, participants/capabilities, owner, next action, blockers, version | Role-appropriate overview and transitions |
| Task | Purpose, owner, due instant/timezone, dependency, status, evidence requirement, related records | Explainable Today queue and completion |
| Appointment | ID/version, state, local date/time plus zone, participants, format, access status, notification status | Separate proposal from confirmed logistics |
| Message | Logical message ID, audience, channel, content/attachment versions, approval, provider/status timestamps | Safe draft/send/reconcile behavior |
| Operation receipt | Operation ID, idempotency key binding, accepted state, current outcome, result links, retry/cancel capabilities | Durable handling of uncertain/long-running actions |
| Document | ID/version, classification, audience, upload/scan/review states, purpose, expiry/retention policy indicator | Sensitive handling and truthful progress |
| Approval | Actor capability, subject version/hash, scope, decision, time, invalidation reason | Avoid stale or cross-scope authority |
| Error | Stable code, safe user message, field errors, retryability, correlation ID, known outcome state | Task-specific recovery without leaking internals |

Represent **unknown**, **not applicable**, **not provided**, **withheld**, and **false** as distinct semantics where the task needs them. JSON null without a meaning is insufficient for important property facts. UI models must not require the frontend to guess whether a missing key is a privacy rule or a failed API response.

### 19.3 State and URL ownership

Public search criteria, sort and pagination are addressable non-sensitive state. Temporary open panels, focus and scroll are local navigation state. Private personal requirements belong to authenticated case state, referenced by opaque authorized identifiers rather than descriptive URL parameters.

Maintain separate committed and draft filter state. Search requests carry a query identity; cancel or ignore obsolete responses so a slow earlier query cannot overwrite the current one. Opening a card must not reset the search. Refreshing inventory can mark a removed result without silently moving the person's focus to another property.

Saved lists distinguish device-local, syncing, server-confirmed and sync-failed. On sign-in, propose a merge preserving distinct saved items and explain duplicates; do not replace the server list with the local list. Browser storage failure falls back gracefully and does not claim permanent persistence.

### 19.4 Mutations and external effects

Every consequential command includes the latest relevant record version and a stable logical operation identifier. The backend determines acceptance and outcome. The frontend can display an immediate pressed/pending state, but it cannot assert an external result before confirmation.

Use an operation-specific recovery strategy:

| Action | Optimistic UI? | On timeout | On version conflict |
|---|---|---|---|
| Save favorite | Yes, if reversible and rollback is clear | Show unsynced state; retry safely | Merge set intent without dropping other saves |
| Edit internal draft | Local edit immediately; saved only after acknowledgment | Keep draft and indicate unsaved | Three-way comparison or field-level reapply |
| Submit inquiry | Receipt only after acceptance | Query same logical submission | Preserve content; reconcile destination/context |
| Confirm appointment | No confirmed state before server outcome | Reconcile booking identity | Recheck slot/access; offer actual alternatives |
| Send message | No delivered claim optimistically | Reconcile provider operation | Re-approve changed content/recipient scope |
| Approve/publish | No | Inspect same release/destination outcomes | Invalidate approval and review new version |
| Grant access | No | Reconcile invitation/grant | Recheck intended scope and authority |
| Financial/proposal step | No | Freeze duplicate action; human-visible status | Preserve draft; require fresh authorized review |

Idempotency is a system guarantee, not a disabled button. Page reload, a second tab, touch double-tap, browser retry and background worker must preserve one logical outcome. For jobs with partial success, expose per-item outcomes and safe resume; do not restart the entire batch as a new operation.

### 19.5 Drafts, collaboration and realtime updates

Drafts carry version and saved-at status. Use clear conflict resolution for two operators editing the same content. Presence indicators are helpful but not locks or authority. A material source change during translation/review invalidates the relevant approval even if a stale browser tab remains open.

Realtime events are hints to refresh/reconcile, not standalone authority for sensitive transitions. Recover dropped connections using the latest server state and event/version cursor. Revalidate on visibility return and after reconnect where freshness matters, without discarding an unsaved draft. Explain removed permissions promptly and clear restricted client caches.

Do not make collaboration depend on simultaneous online presence. Every participant must be able to resume from durable state, readable history and explicit ownership.

### 19.6 Integration seams that require designed failure behavior

Search: partial results, stale index and unavailable count. Maps: blocked scripts, permission denial, ambiguous geocode and absent exact coordinates. Messaging: accepted/delivered disagreement, opt-out change and unsupported attachment. Calendar: stale sync, tentative events and participant timezone. Media: processing, unsafe file and missing rendition. AI: unsupported answer, source change and timeout. Publishing: destination-specific failure and read-back mismatch. Authentication: expired link, revoked access and cross-device return.

Each seam has a named product owner, visible health state, retry policy and human recovery path. “An error occurred” without a task-preserving route is not a complete contract.

## 20. Accessibility, performance and trust requirements

### 20.1 Accessibility baseline

Target WCAG 2.2 AA across public, client and staff experiences. Verify actual task paths with keyboard and screen readers; automated scanning alone is insufficient. Important baseline checks include text contrast of 4.5:1 for ordinary text and 3:1 for qualifying large text, non-text contrast where required, meaningful labels, reflow and zoom, errors, names/roles/values and status announcements. This is a conformance target, not a claim of certification. [W3C WCAG 2.2](https://www.w3.org/TR/WCAG22/)

WCAG 2.2 adds relevant requirements around obscured focus, non-drag alternatives, minimum target sizing, consistent help, redundant entry and accessible authentication. The AA target-size criterion uses 24 CSS px with defined exceptions; this product recommends 44 × 44 px interactive targets where practical for comfortable touch use. The 44 px recommendation is a product choice, not a restatement of the AA minimum. [W3C: what's new in WCAG 2.2](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/)

**Task-specific acceptance:** a keyboard-only buyer can filter, inspect, compare and request a viewing; a screen-reader seller can review a listing change; a touch user can reorder media without dragging; a magnification user can locate the active field despite sticky controls. Every important state must be understandable without color, animation, precise gestures or sound.

Use semantic HTML before ARIA. Modal dialogs require correct focus entry, containment, escape/close behavior and restoration; long dialog content needs thoughtful initial focus. Comboboxes must preserve ordinary editing keys and expose name, expanded state and active option correctly. Prefer tested patterns and validate actual assistive-technology behavior. [WAI-ARIA modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/), [combobox pattern](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/)

Maps, charts and calendars have list/table equivalents that complete the same task. Images need useful alternatives; purely decorative images are ignored by assistive technology. Reduced motion removes nonessential transitions. Motion used for feedback must not be the only indication of completion or error.

### 20.2 Performance targets

Use the current Core Web Vitals good thresholds: LCP ≤ 2.5 seconds, INP ≤ 200 ms, CLS ≤ 0.1, assessed at the 75th percentile and segmented by mobile/desktop. These are external thresholds, not observed MS Realty performance. Measure field data and use lab diagnostics to identify causes. [Google web.dev: Web Vitals](https://web.dev/articles/vitals)

Additional **proposed product budgets**, to validate against actual devices and services:

| Interaction | Initial design target | Experience when exceeded |
|---|---|---|
| Local press/focus/selection feedback | Visible within 100 ms | Keep input responsive; avoid main-thread blocking |
| Search result refresh | p95 within 1.5 s under defined representative network/load | Preserve old list with updating state; explain partial/stale state |
| First useful property content | Main facts available with initial document/content response | Independent media loading; no blank-page dependency on map/AI |
| Ordinary record save | p95 confirmation within 2 s under defined conditions | Explicit Saving, then delayed/save-failed recovery |
| Gallery navigation | Immediate control response; adjacent media prefetch bounded | Reserved dimensions, meaningful loading/error per image |
| AI assistance | Immediate task acknowledgment; no fixed correctness/time promise | Cancel/dismiss and continue manually; preserve partial draft if safe |
| Large import/publication | Durable job acceptance, then honest progress | Resumeable status page, per-item failures and reconciliation |

Do not ship all gallery media, maps, staff-app code and chat tooling with every public page. Size images to display needs, reserve their dimensions, lazy-load offscreen media, and defer nonessential third-party code. A hidden image carousel must not spend the initial mobile bandwidth budget. The search list remains functional without map download.

Test on an ordinary midrange phone, not only a developer workstation. Benchmark with representative photo counts, long localized text and degraded network/CPU. Budgets need recorded device/network assumptions before they become release gates.

### 20.3 Privacy, safety and information integrity

Classify data as public approved, client-private, internal operational, or restricted evidence. The design file must label boundaries. Minimize collection and audience; keep personal content out of analytics, URLs, screenshots and public previews. Raw identity/financial documents are never default AI input.

Consent and lawful processing rules require a jurisdiction-appropriate legal review; this document specifies understandable controls and auditable decisions, not legal compliance conclusions. Cookie/analytics choices must not block essential contact, and optional choices must not use misleading visual hierarchy. Expiry, retention and deletion policy require actual responsible owners.

Anti-abuse controls should be proportionate and accessible: rate limits, suspicious-request review and alternatives to an inaccessible challenge. The UI must not reveal whether a private email has an account. Public forms must not become a way to retrieve private case content.

### 20.4 Search discovery and migration requirements

Approved, useful public pages need stable canonical identities, locale metadata and navigable links. Private workspaces are excluded from public indexing through proper access control; indexing directives are not security boundaries. Generated parameter combinations must not create an uncontrolled crawl space.

Define curated indexable search/area landing pages separately from arbitrary user filter combinations. Engineering and SEO must agree the crawl/index policy, including robots, canonicals and not-found behavior; do not assume that a canonical tag prevents crawling or that a robots block allows a crawler to see noindex. Google's faceted-navigation guidance describes the crawl-cost trade-off; the exact MS Realty policy needs a dedicated verified URL plan. [Google: faceted navigation](https://developers.google.com/crawling/docs/faceted-navigation)

Every migration retains evidence-based mappings for both legacy domains. An unavailable property and a migrated property require different handling. Locale routes become indexable only after human content approval. No design approval in this document supersedes blocked operational launch gates or substitutes for live provider/runtime evidence.

## 21. Measurement and validation

### 21.1 Measure successful service, not activity volume

| Question | Metric / definition | Guardrail |
|---|---|---|
| Can visitors find plausible options? | Task success in studies; proportion reaching a relevant saved/compared/property-detail outcome | Do not treat low inquiry volume alone as failure |
| Can people ask for help? | Accepted inquiries / started inquiry forms, segmented by purpose/device/locale | Separate validation, abandonment and service failure |
| Does the agency respond? | Time from server acceptance to first meaningful human response, in stated service hours | Automated acknowledgment is not the first meaningful response |
| Do viewings get arranged reliably? | Confirmed arrangements / requests that are serviceable; conflict/cancellation reasons | Do not pressure operators to call tentative events confirmed |
| Are clients kept informed? | Overdue communicated commitments; unanswered client questions | A sent message without delivery evidence is not a confirmed update |
| Are records trustworthy? | Critical-fact review overdue rate; correction propagation completion | An approval count alone says nothing about correctness |
| Does the workspace reduce dropped work? | Unowned active inquiries; cases without a next action; handoffs not accepted | Closing a case to remove it from a queue is not success |
| Does assistance help? | Human-rated draft usefulness, correction types, task time and error changes | No automated-send rate goal; protect accuracy and consent |
| Is the service inclusive? | Task failures by device, locale, access need and input mode where ethically collected | Do not infer sensitive traits or store unnecessary personal data |

Set business improvement targets after a baseline exists. The numerical usability targets below are proposed design acceptance goals, not evidence of present performance or statistically proven gains.

### 21.2 Event taxonomy

Use events such as search_committed, filter_applied, property_opened, compare_started, inquiry_accepted, viewing_requested, viewing_confirmed, case_next_action_set, message_outcome_changed, approval_invalidated and publication_destination_verified. Capture event version, anonymous/session identifier where appropriate, surface, device class, locale, result category and duration.

Never send free-text inquiry content, email, phone, exact private address, document names containing personal data or authentication tokens to general analytics. Meaningful service events should come from confirmed server state. A frontend button click is an intent event, not a completed transaction. Repeated delivery of the same event needs deduplication.

### 21.3 Research plan

Run small, iterative task-based sessions with relevant cohorts: local buyers, remote/cross-border seekers, sellers/landlords, and brokers/coordinators. A starting round of roughly 5–8 people per materially different cohort can reveal problems; it is not a statistically representative outcome study. Include older adults and people using keyboard, screen reader or magnification. Cover Bulgarian/Russian/English core usage and dedicated Hebrew RTL validation; every offered language still needs end-to-end linguistic and functional QA.

Use realistic tasks with imperfect information, not guided tours. Ask participants to explain what a status means before clicking. Observe whether they distinguish requested from confirmed, unknown from no, source-supplied from independently reviewed, and saved draft from published.

Proposed critical-task target: at least 90% unassisted completion in a suitably sized validation study, with zero high-severity misunderstanding of financial/appointment/publication consequences. Small formative sessions are for finding problems, not asserting the 90% estimate. Record confidence intervals when later reporting quantitative completion rates.

Validate structural alternatives where uncertain: list-first versus split-map entry for actual inventory; pairwise mobile comparison; guided seller intake length; next-action-first agency homepage; and whether a lightweight client workspace adds value relative to the customer's preferred channel. Preserve the invariants even if research changes the visual composition.

## 22. Designer handoff and acceptance coverage

### 22.1 Required design-file organization

Create pages/sections for: brief and principles; domain/role map; service blueprint; user flows; public screens; client screens; agency screens; component library; responsive/RTL variants; interaction states; content specimens; prototype paths; acceptance/evidence. Use this document's IDs on frames and annotations.

Each screen contract must include:

1. Actor, permission scope, entry path and primary job.
2. Actual content hierarchy, required fields, realistic data and primary/secondary actions.
3. State transitions, downstream effect and outcome authority.
4. Loading, empty, error, stale, pending and permission states relevant to that screen.
5. Small/wide layout and intermediate collapse rules; long-text and RTL behavior where applicable.
6. Keyboard order, focus movement, screen-reader announcements and non-drag alternatives.
7. Save, cancel, Back, refresh, deep-link and interrupted-session behavior.
8. Data/API assumptions, source of truth, unresolved operational configuration and acceptance IDs.

The handoff must include connected prototypes for actual end-to-end work, not only detached happy-path frames. A prototype may use clearly labeled synthetic data, but it must not imply that simulated requests prove persistence, authentication, provider delivery or deployment.

### 22.2 Prototype scenarios to build first

| Prototype | Required connected route | Why it leads |
|---|---|---|
| T1 Buyer decision | Search → filters → detail → compare → inquiry → receipt → broker response → viewing confirmation | Proves the main public-to-human service loop |
| T2 Seller publication | Intake → service/authority work → preparation → client preview → correction → locale review → publication outcomes | Proves trust, review scope and cross-surface continuity |
| T3 Broker working day | Today → inbox → existing-case match → reply → next action → scheduling conflict → accepted handoff | Proves realistic operational work rather than a dashboard image |
| T4 Failure recovery | Timed-out inquiry/message → outcome check → confirmed single result; stale edit → conflict resolution | Proves the system stays truthful when external actions are uncertain |
| T5 Inclusive mobile | Hebrew RTL search → compare → inquiry correction; keyboard-only gallery/filter and seller review | Proves responsive and accessibility structure |
| T6 Ongoing service | Management request → approval → provider work → evidence → statement reconciliation | Proves adjacent service readiness before those services are exposed |

### 22.3 Acceptance scenario register

These scenarios are behavioral requirements for prototypes and later implementation. Passing a prototype test proves comprehension/interaction design only. Integration and live-service assertions require the corresponding real environment.

| ID | Flow | Scenario and pass condition |
|---|---|---|
| A01 | F01 | New mobile visitor identifies service scope and starts the intended journey without registration |
| A02 | F01 | Direct property link opens the same property in an available approved locale; language suggestion is dismissible |
| A03 | F02 | Active filters remain visible; remove one changes only that criterion and updates the result count accurately |
| A04 | F02 | Ambiguous place name asks for country/region resolution instead of selecting silently |
| A05 | F02 | Unknown lift/access fact does not satisfy a hard must-have filter |
| A06 | F02 | Zero matches preserve criteria and require an explicit choice before any relaxation |
| A07 | F02 | Old slow search response cannot replace newer committed results; Back restores prior context |
| A08 | F02 | Map failure leaves a complete list/filter/contact path; approximate locations are visibly approximate |
| A09 | F03 | Viewer can identify source price/period, area basis, availability and material unknowns without reading promotional copy |
| A10 | F03 | Gallery is operable by keyboard with correct focus restoration; floor plan has a usable alternative |
| A11 | F04 | Saving anonymously says device-local; later sign-in offers a non-destructive merge |
| A12 | F04 | Comparison retains unknowns and different area bases; mobile supports a readable pairwise decision |
| A13 | F04 | Shared public shortlist excludes private notes; revoked private invitation no longer exposes content |
| A14 | F05 | Saved alert uses exact acknowledged criteria and remains inactive until the required channel verification |
| A15 | F05 | Unsubscribe/pause stops relevant future alert jobs without silently altering separate service communications |
| A16 | F06 | Inquiry requires only purpose-appropriate contact information; marketing consent remains separate |
| A17 | F06 | Validation preserves input and moves focus to a linked, coherent error summary |
| A18 | F06 | Double submission/time-out/reload reconciles to one logical receipt; no unsupported success claim |
| A19 | F06 | External messenger link shows an application handoff, not a confirmed sent message |
| A20 | F07 | Requested viewing is visibly different from confirmed; real slot/access conflict offers actual alternatives |
| A21 | F07 | Traveller sees explicit timezone; rescheduling updates previous arrangement and calendar status coherently |
| A22 | F07 | Cancellation/no-show preserves history and creates an appropriate owned follow-up |
| A23 | F08 | Guide separates general education from personal legal/tax advice and identifies review scope/date |
| A24 | F08 | Area content does not imply Sandanski is coastal or invent availability/distance/return claims |
| A25 | F09 | Old listing URL communicates its actual status; similar alternatives do not impersonate the original property |
| A26 | F09 | Public withdrawal does not erase private authorized case/appointment history |
| A27 | F10 | Owner can submit with valid unknown facts; exact address and private evidence are not unnecessarily demanded |
| A28 | F10 | Intake photos remain private; submission does not authorize public use or publication |
| A29 | F11 | Self-declared ownership is distinguishable from reviewed authority; consequential steps respect the gate |
| A30 | F11 | Service agreement, publication permissions and commercial instructions are independently legible |
| A31 | F12 | Owner approval binds an exact version/scope; changed price invalidates the affected approval |
| A32 | F12 | Seller sees partial channel publication truthfully and cannot see other parties' private details |
| A33 | F13 | Expired/revoked/wrong-account access has safe recovery without leaking private account existence |
| A34 | F13 | Authentication supports accessible credential entry and returns to the permitted original task |
| A35 | F14 | Client can name next action, owner, waiting dependency and next agreed update |
| A36 | F14 | Multiple cases stay separate; requirements edits do not silently cancel existing appointments |
| A37 | F15 | Interrupted multi-file upload preserves valid progress and never labels an unuploaded file complete |
| A38 | F15 | Scanning, human review and professional validation remain different; unsafe files are not exposed |
| A39 | F16 | Proposal review exposes version, parties, terms, deadline/timezone and consequence before action |
| A40 | F16 | Expired/superseded proposal rejects stale action safely; unknown submission cannot duplicate the decision |
| A41 | F17 | Internal note content cannot accidentally become an external message when changing composer mode |
| A42 | F17 | Delivery unknown/provider accepted/delivered are distinct and source-supported |
| A43 | F18 | Inquiry linking suggests uncertain duplicates without merging automatically; first response has real ownership |
| A44 | F18 | Simple resolved question need not create a fake active case; outstanding commitments remain tracked |
| A45 | F19 | Today exposes overdue and unowned work with reasons; snoozing cannot erase a missed promise |
| A46 | F19 | Coverage transfer preserves ownership until acceptance or configured coverage rule takes responsibility |
| A47 | F20 | Stage transition requires appropriate evidence and records a human-readable event |
| A48 | F20 | Closed/paused case retains remaining obligations; reopen does not delete closeout history |
| A49 | F21 | Match rationale distinguishes constraint satisfaction, preference and unknown; alternatives are labeled |
| A50 | F21 | Client collection is reviewed for recipient, facts, locale and permissions before external sharing |
| A51 | F22 | Stale calendar synchronization prevents an unsupported instant-confirmation claim |
| A52 | F22 | Agenda and form controls accomplish scheduling without dragging or reading a visual calendar grid |
| A53 | F23 | Editing/saving a listing draft does not publish; facts retain source, unit and area basis |
| A54 | F23 | Media lacks publication eligibility until rights/required review are resolved; modified imagery is labeled |
| A55 | F24 | Source change makes affected translation approval stale; no automatic indexability follows AI drafting |
| A56 | F24 | Partial publication/withdrawal shows destination-specific results and retries only safe affected operations |
| A57 | F25 | Report differentiates zero from missing/incomplete data and explains its numerator/denominator/window |
| A58 | F25 | Policy change previews effect and does not retroactively rewrite promised response times |
| A59 | F26 | Rental price/period, known charges, deposit and unknowns are distinguishable from sale terms |
| A60 | F26 | Application document collection is purpose-limited; no opaque discriminatory tenant score is created |
| A61 | F27 | Inquiry/quote/payment-pending/confirmed reservation are distinct; no unsupported instant booking |
| A62 | F27 | Concurrent availability conflict is reconciled; cancellation displays actual applicable terms before submission |
| A63 | F28 | Management request shows contracted scope and named waiting dependency; emergencies have appropriate guidance |
| A64 | F28 | Owner statement distinguishes invoiced, paid and reconciled amounts with supported adjustments |
| A65 | F29 | AI draft exposes source/version and can be corrected/dismissed; normal workflow survives AI failure |
| A66 | F29 | Hermes cannot publish, index, send customer messages or approve claims; untrusted content cannot grant authority |
| A67 | F30 | Preference revocation is checked by queued jobs; private export requires appropriate verification/scope |
| A68 | F30 | Revoked participant loses future private access and cached content is cleared appropriately |
| A69 | F31 | Material correction enumerates affected locales/channels/cases and does not close with silent unresolved failures |
| A70 | F31 | Outdated shared/downloaded material is handled honestly; interface does not promise impossible recall |
| A71 | F32 | Import dry run makes no live changes and shows conflicts against current verified values |
| A72 | F32 | Partial bulk job has per-item outcomes, stable identity and safe recovery without duplicate external effects |

### 22.4 Cross-cutting validation matrix

| Axis | Required evidence |
|---|---|
| Screen coverage | All 75 contracts mapped to a frame, shared template or explicitly gated service; no unexplained omissions |
| Flow coverage | All 32 flows have entry, main path, alternate/cancel, failure and terminal/next-owner state |
| Responsive | Critical flows at 390 and 1440, structural tests at 320/768/1024; zoom/reflow and real keyboard checks |
| Locale | Complete critical paths in every offered locale; long-copy expansion; BG/RU Cyrillic, EL Greek, HE RTL; locale switch preserving context |
| Accessibility | Keyboard, screen reader, touch, magnification, reduced motion and forced colors; actual accessible names and focus evidence |
| Data realism | Empty/one/many; no photo; missing price; long names; multiple properties/cases/participants; unknown/conflicting facts |
| Concurrency | Two editors, two booking requests, updated source during review, permission revocation in an open tab |
| Connectivity | Offline start/return, slow response, partial service failure, timeout after server acceptance, reconnect |
| Authority | Visitor/client/collaborator/broker/reviewer/publisher access and denied cases; no UI-only permission enforcement |
| External outcome | Live integration proof for message delivery, search freshness, publication, calendar and runtime behavior before operational claims |

Recommended synthetic content stress set: listing titles 20–140 characters; people/organization names up to 120; addresses with long mixed-script segments; one to eight participants; one to fifty saved properties; zero to sixty media items; short and multi-page documents; zero to hundreds of queue records through pagination. These are QA specimens, not actual limits. Define validated operational limits separately and expose them before users exceed them.

### 22.5 Definition of design completion

Design is complete for a delivery slice when its full critical journey is connected; material states and permission boundaries are drawn; small/wide and relevant RTL compositions work with realistic content; all named actions have specified consequences and recovery; frontend contracts are agreed; and a task-based review finds no unresolved critical misunderstanding. A polished home page alone does not meet this definition.

Implementation completion additionally requires automated and manual verification against actual interfaces. Production readiness additionally requires real configured services, operator inputs and launch evidence. These levels must be reported separately.

## 23. Dependency-gated delivery and decisions

### 23.1 Recommended delivery order

| Slice | End-to-end capability | Dependency / exit gate |
|---|---|---|
| D0 — Truth and task foundations | Objects, roles, terminology, state transitions, content model, component accessibility | Operators can validate vocabulary/authority; representative multilingual content available |
| D1 — Discover to human response | Public search/detail/contact plus staffed inquiry triage and receipt/recovery | One real request can be accepted, owned and answered; no unowned inbox behind a polished site |
| D2 — Evaluate to viewing | Saved/compare, requirements, matches, client continuation and scheduling | Identity/scope, availability/access checks and truthful confirmation behavior proven |
| D3 — Owner to approved publication | Intake, preparation, client review, translation, release and correction | Human approvals/versioning and destination-specific outcomes proven |
| D4 — Case coordination | Documents, proposals, milestones, permissions and closeout | Jurisdiction-appropriate process, qualified review, secure evidence handling and explicit consequences |
| D5 — Operational reliability | Coverage, policy configuration, reports, bulk reconciliation and recovery | Real workload/failed-integration exercises; auditable ownership and no duplicate effects |
| D6 — Supported adjacent services | Rental-specific process, short-stay or management modules | Actual service agreements, capacity, inventory/payment/provider operations and support procedures |
| D7 — Advanced assistance | Bounded drafting, matching explanations, extraction and quality support | Evaluated usefulness, grounded sources, human authority and non-AI fallback across failures |

Basic safe drafting can be introduced earlier inside a proven human workflow; D7 is the point to broaden it, not a reason to make AI a prerequisite for ordinary service. Advanced visual effects, live maps and additional dashboards do not displace completion of the core service loops.

The sequence is dependency-based rather than calendar-based. It neither authorizes implementation nor claims the current system is at any particular maturity level.

### 23.2 Decisions already made by this proposal

Use a task-led agency homepage; allow anonymous discovery/contact; separate cases from listings; show source-aware facts and unknowns; support a lightweight private continuation space; use explicit filter semantics; keep AI drafts human-controlled; bind approvals to exact versions; expose external outcome uncertainty; prioritize mobile and multilingual accessibility from the start. These are intentional target choices rather than placeholders for the designer to invent.

### 23.3 Operational inputs required before launch or binding implementation

| Input | Recommended safe starting position | Responsible decision owner |
|---|---|---|
| Geographic/service coverage | Expose only explicitly staffed, supported scope | Agency leadership |
| Public locales and review capacity | Enable each locale only with human review and support coverage | Content lead / service manager |
| Business hours, response promises, escalation | Configured real coverage; no fabricated speed guarantee | Service manager |
| Authority/document requirements by jurisdiction | Qualified human-designed process; UI records scope/status only | Agency leadership + relevant professionals |
| Instant viewing availability | Request windows until reliable access/calendar authority exists | Operations lead |
| Price/cost/commission disclosures | Approved explicit terms and unknowns; no invented calculator | Commercial owner + appropriate reviewer |
| Exact-address and media disclosure | Minimal public precision until permission is recorded | Property owner/authorized agency role |
| Messaging/calendar integrations | Expose only channels with proven supported semantics | Technical + operations owners |
| Retention, privacy, consent and accessibility obligations | Documented policy and responsible review; no assumed legal compliance | Authorized privacy/legal owner |
| Property management/short-stay operations | Keep gated until service and reconciliation workflows exist | Service owner |
| Staff capability separation | Explicit capabilities; independent review where policy requires | Agency manager |
| Brand assets, photography, final type/color | Develop within these functional constraints using real assets | Brand/UI designer |

Unresolved operational values are configuration inputs, not reasons to postpone designing the service. Where uncertainty changes a promise or legal consequence, use the safe request/review path until the responsible owner supplies a verified policy.

### 23.4 Deliberately excluded until separately justified

Autonomous publication or customer communication by Hermes; unsupported legal/tax advice; invented investment returns; automatic property valuation; hidden personalized ranking based on sensitive characteristics; unreviewed public machine translation; unverified instant booking; holding client funds; unapproved electronic-signature claims; and custom infrastructure choices justified only by the current codebase.

## 24. Research basis and evidence limits

The following primary sources were consulted on 21 September 2026. They inform specific interaction requirements; they do not prove that the whole proposed MS Realty product is optimal. The target architecture, service design, screen structure, pipelines, numeric layout defaults and delivery sequence are original recommendations derived from the jobs and risks in this brief.

| Source | What it supports | Application and boundary |
|---|---|---|
| [W3C WCAG 2.2](https://www.w3.org/TR/WCAG22/) | Accessibility conformance baseline | Target AA across complete tasks; no current conformance claim |
| [W3C: new in WCAG 2.2](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/) | Focus, target sizing, drag alternatives, help, redundant entry and authentication additions | Applied to sticky bars, editors, forms and sign-in; product comfort targets are labeled separately |
| [WAI-ARIA modal dialog](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) | Dialog semantics and focus lifecycle | Galleries and necessary modal confirmation; prefer full pages for complex work |
| [WAI-ARIA combobox](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/) | Autocomplete and keyboard behavior | Place/reference search, preserving normal text editing |
| [W3C RTL structural markup](https://www.w3.org/International/questions/qa-html-dir) | Base direction, language and logical layout | Complete Hebrew composition, mixed-direction content and forms |
| [GOV.UK question pages](https://design-system.service.gov.uk/patterns/question-pages/) | Purposeful questions and manageable form structure | Minimal inquiry/intake fields and valid unknown answers; no British property process imported |
| [GOV.UK check answers](https://design-system.service.gov.uk/patterns/check-answers/) | Review and correction before submission | Seller intake and consequential review screens |
| [GOV.UK confirmation pages](https://design-system.service.gov.uk/patterns/confirmation-pages/) | Reference, next step and contact after a transaction | Durable request receipts; does not make external delivery automatically true |
| [GOV.UK error summary](https://design-system.service.gov.uk/components/error-summary/) | Linked errors and deliberate focus management | Accessible form recovery with retained values |
| [Baymard applied filters](https://baymard.com/research-articles/how-to-design-applied-filters) | Visible overview of active filters; updated 13 May 2026 | Adapted from commerce research to property search; no imported conversion statistic |
| [Microsoft HAX guidelines](https://www.microsoft.com/en-us/haxtoolkit/ai-guidelines/) and [design library](https://www.microsoft.com/en-us/haxtoolkit/library/) | AI capability clarity, correction, uncertainty and control | Contextual, inspectable assistance; authority restrictions are explicit product policy |
| [Google web.dev Web Vitals](https://web.dev/articles/vitals) | Current LCP/INP/CLS thresholds and field measurement | Quality targets only; actual service performance must be measured |
| [Google faceted-navigation guidance](https://developers.google.com/crawling/docs/faceted-navigation) | Crawl implications of filter-generated URLs | Separately designed curated landing pages and verified migration policy |

No competitor interface was copied. No current repository architecture was treated as a design constraint. No live customer study, legal review, production deployment, authenticated journey or provider verification was performed as part of writing this target-state document. Those are explicit future validation gates, not hidden assumptions behind the word “SOTA.”

## 25. The designer's final brief

Design MS Realty as one continuous human-supported property journey, expressed through three appropriately different interfaces. Give the public clear discovery and decision tools; give clients a calm, secure record of what is agreed and what happens next; give the agency an accountable workspace for delivering it.

Make the important distinctions visible: known versus unknown, draft versus approved, requested versus confirmed, published versus available, provider-accepted versus delivered, and agreed-next-step versus completed transaction. Build continuity around stable records, explicit audiences, versioned evidence and named ownership.

The strongest visual result will make this complexity feel understandable without hiding it. The strongest frontend result will keep that understanding intact when data changes, a connection fails, a second person edits, a client switches language, or an external action has not yet been confirmed.
