# MS Realty OS — Bulgaria and Greece Operating Model

Status: implementation contract
Research snapshot: 2026-07-30
Workflow contract: `2026-07-30.bg-gr-v1`

This document maps the end-to-end work of a Sandanski-based real-estate agency into MS Realty OS.
It covers buying, selling, long-term renting, short-term renting, land, commercial property, new
builds, and ongoing property management in Bulgaria and Greece.

It is an operating and engineering control, not legal, tax, notarial, engineering, lending, or
investment advice. Rules change and depend on party nationality and residence, entity structure,
property location and type, protected/border status, intended use, transaction date, and the facts
of the title. Every live case therefore requires a dated regulatory snapshot. The workflow never
treats this document or AI-generated text as an official certificate.

## 1. Product outcome

One `RealtyCase` coordinates every person, property, task, condition, authority, document reference,
payment reference, official filing, and aftercare obligation from first contact to reconciled close.
The case supports two execution modes without changing the legal or evidence standard:

- `manual`: authenticated people perform every mutation.
- `autonomous`: authenticated trusted agents may perform mutations covered by a signed mandate and
  the configured assurance profile.

The user may change mode during a case. A mode change is itself an attributed, authorized event. No
mode can bypass an earlier phase, mandatory step, official evidence, payment verification, freeze,
revocation, or case-closing condition.

The reliability of an AI executor is assumed to be supplied by a separate assurance system. That
assumption removes the need for routine human checking of the agent's reasoning. It does not remove:

- client authority and revocation;
- professional licensing or representation requirements;
- public-authority, bank, notary, lawyer, engineer, insurer, counterparty, and physical-world acts;
- official evidence and receipts;
- privacy, AML, sanctions, accounting, record-retention, and security controls;
- technical failures, unavailable integrations, contradictory evidence, fraud attempts, or disputes.

## 2. Non-negotiable invariants

1. No representation, marketing, offer, signature, payment, filing, handover, or recurring spend
   occurs outside the current mandate.
2. No listing is published without ownership/representation authority and exact-facts authority.
3. Price, area, bedrooms, location, reference, status, source URL, and material disclosures are
   never silently changed.
4. No generated summary, translation, message, valuation, or legal/tax explanation is official
   evidence.
5. Every action records case, actor, executor kind, authority, input references, output references,
   workflow version, time, and result.
6. A condition is never waived by silence, elapsed time, model confidence, or a missing response.
7. A payment destination is independently verified before money moves.
8. Identity, representation, title, technical, AML, funds, tax, contract, and registration gates
   must be green before a purchase/sale closes.
9. Dual representation, referral fees, conflicts, and material commercial interests are disclosed
   and consented to where applicable.
10. Matching and tenant selection cannot use unlawful discriminatory criteria.
11. Client freeze, mandate expiry, revocation, incident response, or contradictory official evidence
    stops autonomous progression.
12. Closing means every required step is completed and every optional step is either completed or
    explicitly marked not applicable with authority and a reason.

## 3. Canonical records

### 3.1 RealtyCase

The orchestration aggregate:

- stable case ID;
- jurisdiction: `BG` or `GR`;
- case type;
- asset kind;
- client and property references;
- execution mode;
- workflow version and immutable opening-step snapshot;
- status: active, frozen, closed, or cancelled;
- progress, current phase, next steps, and blockers;
- created/last-action timestamps and actors.

### 3.2 Mandate

The machine-enforced authority envelope:

- stable mandate reference;
- granting-party reference;
- signature/effective time and optional expiry;
- allowed case actions and step keys;
- negotiation ceilings, price floors, spending limits, payment limits, channels, territories, and
  delegation rules in the source mandate;
- conflict/dual-representation disclosures where applicable;
- revocation and replacement history.

The current implementation persists the mandate reference, grantor reference, dates, and capability
set. Monetary and channel constraints belong in the referenced signed mandate and are a required
integration refinement before agents can initiate funds or outbound customer communications.

### 3.3 PropertyEvidencePack

References only; private source documents live in encrypted document storage:

- ownership/title and acquisition instrument;
- co-owner, marital, corporate, inheritance, guardianship, or power-of-attorney authority;
- cadastral identity, plan, sketch, scheme, boundaries, coordinates, and area;
- encumbrances, mortgages, claims, easements, seizures, leases, occupancy, and possession;
- planning, building permits, lawful use, completion/occupancy, building identity, deviations, and
  legalization where applicable;
- energy and technical certificates;
- condition, defects, systems, meters, equipment, inventory, keys, access, warranties, and insurance;
- taxes, municipal charges, utilities, management/common expenses, debts, and pending works;
- listing facts, source, verification date, disclosures, media rights, and publication authority;
- official extracts, issuer, issue time, validity/staleness, digest, and supersession links.

### 3.4 ConditionLedger

Every offer, reservation, preliminary agreement, lease, or final contract condition:

- condition ID, exact wording reference, obligor, beneficiary, evidence type, deadline, dependency;
- pending, satisfied, waived with authority, failed, disputed, or expired;
- cure/escalation history;
- evidence and authority references.

### 3.5 RegulatorySnapshot

A dated decision record derived from current official sources and case facts:

- jurisdiction and municipality/location;
- transaction and intended-use dates;
- party nationality, residence, capacity, tax presence, and entity structure;
- asset type, land component, border/protected/local restriction status, new-build status, and use;
- required professionals, declarations, certificates, registrations, taxes, deadlines, and portals;
- applicable rules and source URLs with retrieval times;
- exceptions and the evidence supporting each exception;
- next review date and change trigger.

### 3.6 EvidenceRef

The append-only case ledger stores identifiers, not raw personal data:

- reference, type, producer kind, issue time, optional digest;
- producer may be client, counterparty, agency, trusted agent, lawyer, notary, engineer, bank,
  insurer, property manager, registry, tax authority, vendor, or system;
- the underlying object records source, custody, access policy, retention, validity, and signature.

## 4. Universal lifecycle

### Phase 1 — Intake

- capture source, campaign/referral, language, preferred channel, timezone, accessibility needs, and
  response deadline;
- classify buyer, seller, tenant, landlord, investor, short-term-rental owner/guest, property manager,
  partner, or general inquiry;
- create or deduplicate contact/account/household/company without exposing raw contact data in the
  workflow ledger;
- record property/reference where known;
- record objectives, geography, intended use, budget/rent/price, financing, timing, occupancy,
  household/business needs, risk tolerance, and deal-breakers;
- assign an owner and SLA; send only an approved confirmation through a configured delivery provider;
- detect emergency, fraud, complaint, data-rights, legal-dispute, or out-of-scope cases and route them.

Exit evidence: attributable intake record and requirements/objective brief.

### Phase 2 — Onboarding and authority

- verify natural person, entity, representative, beneficial owner, and signing capacity;
- verify foreign tax/registry prerequisites and representation route;
- capture privacy notice, communication consent, marketing consent, retention basis, and channel
  restrictions separately;
- perform AML, sanctions, PEP, adverse-information, source-of-funds/wealth, transaction-purpose, and
  risk checks proportionate to the case;
- record conflict, referral, commission, dual-representation, and related-party disclosures;
- agree service scope, fee, exclusivity, expenses, termination, complaint, and dispute terms;
- sign the buyer, seller, letting, management, or autonomous-execution mandate;
- produce the jurisdiction regulatory snapshot;
- establish financing/preapproval and foreign ownership structure where applicable;
- configure power of attorney, translations, apostille/legalization, interpreter, and remote-signing
  route where required.

Exit evidence: identity/representation, consent, AML disposition, signed mandate, and regulatory
snapshot. A watchlist or contradictory identity result freezes the case.

### Phase 3 — Property and counterparty evidence

- establish property identity independently of the public listing;
- obtain current official title/cadastre/encumbrance evidence and match identifiers;
- identify owners, rights holders, occupiers, tenants, managers, lenders, heirs, spouses, and required
  consents;
- verify planning, building, lawful use, technical, energy, safety, utilities, common charges, tax,
  insurance, access, boundary, and environmental facts applicable to the asset;
- inspect condition and material defects; record limitations of visual/remote inspection;
- assemble seller/landlord disclosures and buyer/tenant questions with attributable responses;
- verify listing availability, price, inclusions, media rights, source, and last-check date;
- verify the other party's identity, authority, funds/finance, or rental eligibility at the
  appropriate point;
- refresh time-sensitive extracts before agreement and again before closing if stale.

Exit evidence: property evidence pack with no unresolved identity mismatch or undisclosed blocker.

### Phase 4 — Commercial preparation

- produce comparable-market evidence and an explainable valuation/rent range;
- agree asking price/rent, review cadence, minimum/maximum authority, deposits, inclusions, commission,
  channel budget, and negotiation limits;
- prepare exact verified facts, media, floor plans, captions, privacy-safe map location, translations,
  SEO, portal feeds, viewing instructions, and disclosures;
- obtain exact publication authority and publish only to approved channels;
- match properties/parties to approved requirements, recording reasons and excluding protected traits;
- schedule travel, viewing, access, keys, identity/security checks, interpreters, and remote tour;
- record viewing attendance, condition observations, questions, feedback, and follow-up.

Exit evidence: approved commercial position and, for marketed property, authorized live listing.

### Phase 5 — Offer, application, and negotiation

- receive or create an attributed offer/application containing amount, currency, inclusions, deposit,
  finance, dates, conditions, expiry, identity, and evidence;
- check it against mandate limits before submission or acceptance;
- preserve every version and counteroffer; never overwrite negotiation history;
- verify seriousness, source of funds, lender status, tenant references, and required deposits without
  collecting excessive personal data;
- disclose conflicts and competing-offer process;
- record acceptance, rejection, expiry, withdrawal, or counteroffer and notify through an approved
  channel;
- create the condition ledger and responsible-party deadlines.

Exit evidence: agreed heads of terms or an attributed terminal negotiation result.

### Phase 6 — Reservation, due diligence, finance, and contract

- determine whether a reservation or preliminary agreement is useful and lawful;
- identify deposit holder, refund/forfeit triggers, long-stop date, exclusivity, access, defects,
  financing, title, tax, and document conditions;
- route legal work to the independently appointed lawyer/notary as required;
- complete title, corporate, marital/inheritance, planning, technical, tax, litigation, lease,
  occupancy, insurance, lender, and counterparty due diligence;
- obtain finance offer, valuation, insurance, lender conditions, and drawdown mechanics;
- reconcile every property identifier and material fact across contract, register, cadastre, tax, and
  technical documents;
- verify final contract/lease language, translations, representation, signatures, annexes, inventory,
  notices, and copies;
- verify payment destination out of band, payment schedule, currency/FX, bank limits, escrow/client
  account, taxes, fees, commission, and receipts;
- resolve, extend, waive with authority, or fail every condition.

Exit evidence: final agreement ready, all prerequisites satisfied, signing authority and verified
funding route.

### Phase 7 — Completion and registration

- perform last-minute title/encumbrance, authority, property, vacancy/occupancy, condition, and payment
  checks;
- execute the notarial deed, final contract, or lease with valid attendance/representation;
- pay assessed taxes, notary/registry/municipal/bank/legal/agency costs through verified destinations;
- file/register the transfer or required lease/operating declaration;
- record authority acceptance, rejection, fees, registration number, and cure if rejected;
- confirm cleared settlement/proceeds rather than relying on a screenshot;
- complete inventory, readings, defects, keys, access credentials, possession, and signed handover;
- issue agency invoice/commission/referral accounting and reconcile client money.

Exit evidence: executed agreement, official filing/result where required, cleared settlement, and
signed handover.

### Phase 8 — Aftercare and lifecycle

- update tax/property records, utilities, building/management association, insurance, bank, address,
  local registrations, and emergency contacts;
- deliver an indexed closing pack with retention and access controls;
- schedule defects, warranties, snagging, repairs, inspections, renewals, rent review, notice, and tax
  dates;
- operate rent/booking collection, owner payout, invoices, platform reconciliation, guest/tenant
  support, maintenance, vendors, incidents, and emergencies under limits;
- process renewals, termination, checkout, final balances, damage evidence, deposit reconciliation,
  keys, and possession;
- request feedback/referral only under communication consent;
- reconcile outstanding tasks, evidence, commission, complaints, data retention, and lessons learned;
- close, cancel, or open the next management period.

Exit evidence: no unowned task or balance and a reconciled case pack.

## 5. Case-type differences

### Buyer purchase

The buyer mandate, requirements, funds/finance, ownership structure, independent property evidence,
viewing, valuation, offer ceiling, due diligence, conditions, payment verification, title transfer,
registration, possession, and post-acquisition records are mandatory controls.

For land, mixed-use, development, agricultural, protected, border, or new-build property, add:

- exact boundaries, access, easements, zoning, buildability, utilities, environmental/heritage/forest/
  agricultural status, and development parameters;
- developer title, permits, construction stage, completion/occupancy evidence, specification, changes,
  common parts, warranties, escrow/payment stages, delay/termination remedies, and insolvency risk;
- foreign-person land ownership restrictions and lawful structure;
- tax treatment specific to land/new build/VAT and intended business use.

### Seller sale

The owner/representative authority, agency mandate, disclosure pack, title/cadastre/technical/tax
readiness, pricing, verified listing, publication authority, access security, offer handling,
buyer qualification, discharge/consent conditions, proceeds destination, registration, handover, and
net-proceeds accounting are mandatory controls.

### Tenant rental

The tenant requirements, lawful eligibility checks, property/rent/charge/energy/inventory evidence,
viewing, application, agreed occupants/pets/term/deposit/conditions, lease review, payment destination,
signature, inventory, possession, repair/notice channel, exit inspection, balances, and deposit
reconciliation are controlled. Screening uses only lawful, necessary, proportionate criteria.

### Landlord rental

The ownership/letting authority, safety/condition/compliance, rent/deposit/charge strategy, exact
listing authority, lawful tenant screening, selection decision, lease, payment route, inventory,
possession, rent/maintenance/notices, tax/accounting, renewal/termination, and exit reconciliation are
controlled.

### Short-term rental

The operating authority, local registration/classification eligibility, registry number, safety,
insurance, tax, guest reporting, channel rules, calendar/rate synchronization, booking terms, fraud
controls, payment/payout destinations, access, stay support, incident response, checkout, damage,
refund, platform statement, per-stay declaration, and annual reconciliation are controlled.

One open-ended property case cannot prove every stay. Production orchestration should use one property
operating case plus child booking/stay runs or evidence batches, with idempotent provider event IDs.

### Property management

The management mandate must contain explicit spending, vendor, emergency, tenant/guest, collection,
payout, access, key, reporting, and sub-delegation limits. Baseline condition, insurance/compliance,
budget/reserve, vendors, service levels, collection routes, active contracts, maintenance, incidents,
statements, inspections, renewals/exits, and period close are controlled.

## 6. Bulgaria overlay

### Purchase and sale

The executable workflow adds:

- a dated Bulgaria regulatory snapshot;
- foreign-person land eligibility/structure for applicable land and mixed-use acquisitions;
- current Property Register ownership, act, mortgage, claim, and encumbrance evidence;
- current cadastral sketch/scheme and identifier reconciliation;
- municipal tax valuation;
- seller income-tax analysis;
- competent-notary and notarial-deed readiness;
- local acquisition tax assessment/payment;
- executed notarial deed;
- Property Register filing/entry result;
- buyer post-acquisition municipal property-tax and waste-fee setup.

Operational details:

- determine the competent notary and registry jurisdiction from the property, not client convenience;
- reconcile the contract property description against both title and cadastral records;
- calculate acquisition tax from the applicable municipal rate and statutory base at the transaction
  date; do not hardcode one national percentage;
- verify current payment-form and value thresholds from the live rule snapshot, especially through
  Bulgaria's euro transition;
- do not assume an obsolete static seller declaration process: tax/public-liability verification and
  notarial requirements must come from the current snapshot;
- obtain fresh register evidence close enough to signing to detect intervening acts;
- treat notarial execution, tax payment, and registry entry as separate evidence.

### Long-term rental

Add applicable energy documentation, rent/tax/invoicing/withholding treatment, payment records,
retention schedule, and recurring landlord tax/accounting tasks. Municipality, use, landlord type,
tenant type, and service bundle may change the tax/VAT treatment.

### Short-term rental

Before publication or accepting a booking:

- prove the accommodation is registered/classified as required;
- match its National Tourism Register entry;
- configure ESTI access or the approved system-to-system/operator reporting path;
- determine guest-data fields, submission timing, retention, and outage retry;
- determine income-tax, patent-tax/VAT, social-security, invoicing, tourist-tax, platform-reporting,
  and municipality obligations for the actual operator;
- synchronize the public registration/classification details across every channel.

For each stay, preserve booking, guest-reporting receipt, payment, invoice/tax, access, incident,
checkout, damage/refund, payout, and reconciliation evidence.

## 7. Greece overlay

### Purchase and sale

The executable workflow adds:

- a dated Greece regulatory snapshot;
- AFM/TAXIS/tax-representative readiness;
- border-area acquisition clearance where applicable;
- current Cadastre/title/claim/lien evidence;
- Electronic Building Identity or applicable unit certificate;
- applicable energy certificate;
- seller E9/ENFIA match and transfer clearance;
- objective-value, declared-consideration, exemption, and transfer-tax basis review;
- digital transfer file and notary authorities;
- myPROPERTY declaration and party acceptance;
- transfer-tax assessment/payment or exemption;
- Hellenic Cadastre filing and acceptance/rejection resolution;
- buyer post-transfer E9 verification/filing.

Operational details:

- obtain the buyer's AFM before the tax/contract path requires it; a foreign resident may require a
  Greek tax representative and TAXIS credentials;
- check nationality and precise property location for border-area restrictions before committing a
  deposit;
- reconcile KAEK/cadastre, title, E9, building identity, survey/plan, address, area, use, and contract;
- seller-side certificates and technical corrections can be long-lead tasks—start them before
  marketing claims a property is closing-ready;
- the buyer and seller authorize the notary's digital transfer file; the notary gathers supported
  records and submits the signed deed to the Hellenic Cadastre;
- the buyer's transfer-tax declaration/payment precedes the final contract unless an applicable
  exemption is evidenced;
- distinguish deed signature, Cadastre fee payment, filing, and accepted registration;
- verify whether E9 was updated automatically for the eligible digital transfer and file/correct it
  otherwise.

### Long-term rental

The landlord and tenant workflows add:

- applicable energy certificate;
- AADE lease information declaration containing the current required property, energy, rent, term,
  and party data;
- tenant/co-owner acceptance, rejection, or deadline outcome;
- rent payment, amendment, extension, termination, tax, and record-retention schedule.

The signed private lease and the AADE declaration/party outcome are separate evidence.

### Short-term rental

Before publication or accepting a booking:

- prove current registry eligibility based on property, manager, precise location, intended start
  date, transfer history, and local first-registration restrictions;
- obtain and match the AMA or valid exemption on every platform/listing;
- verify current safety, insurance, electrical, fire, ventilation, emergency, and inspection
  requirements;
- configure booking, cancellation, payment, invoice/tax, guest, incident, and declaration records.

Current high-change example: Law 5313/2026 restricts first Short-Term Stay Property Registry entries
in Thessaloniki's First Municipal Community from 2026-07-01 through 2026-12-31 and contains
transfer-related consequences. The system does not decide eligibility from the word “Thessaloniki”;
the dated snapshot must resolve the exact address, registry history, transaction, operator, and date.

For each stay, submit/amend/cancel the Short-Term Stay Declaration by the current deadline and retain
the receipt. Reconcile and finalize the annual registry data against bookings, cancellations, payouts,
fees, refunds, and tax records.

## 8. Manual and autonomous execution

| Control | Manual | Autonomous |
|---|---|---|
| Workflow and steps | Same versioned snapshot | Same versioned snapshot |
| Executor | Authenticated human | Authenticated trusted agent or human |
| Agent assurance reference | Prohibited | Required for agent actions |
| Mandate | Required | Required |
| Step authority | Mandate capability | Mandate capability |
| Evidence producer | Required accepted producer | Required accepted producer |
| Phase ordering | Enforced | Enforced |
| Optional step | Authority + reason | Authority + reason |
| Freeze/resume/cancel | Attributed event | Attributed event |
| Close | Every step resolved | Every step resolved |
| External professional/public act | External evidence | External evidence |
| Audit | Append-only | Append-only plus assurance reference |

The current `agent` credential is intentionally restricted to `cases:read`, `cases:write`,
`activity:read`, and workspace access. It cannot bypass the case mandate through legacy reply,
assignment, listing, translation, payment, or deal-closing routes.

Hermes remains a separate draft-only component. It may prepare grounded text and structured drafts
under the existing review policy, but it is not the trusted case executor and cannot inherit the
executor's credentials.

## 9. Autonomous agent topology

The minimum production topology can be implemented behind one case API; separate deployable agents are
only needed when isolation, scaling, licensing, or provider credentials require them.

- Case orchestrator: owns next-step selection, dependencies, deadlines, retries, freeze, and close.
- Identity/consent agent: identity-provider, representation, privacy, and data-rights workflows.
- AML agent: sanctions/PEP/adverse information, source-of-funds/wealth, risk, escalation, retention.
- Property evidence agent: registry/cadastre/tax/utility/association evidence and identifier matching.
- Technical agent: inspection, engineer, energy, building, planning, safety, defects, and snagging.
- Valuation agent: comparable evidence, pricing/rent range, assumptions, review triggers.
- Marketing agent: verified facts, media, translations, channel feeds, provenance, availability.
- Match agent: requirements/inventory ranking with explainable lawful criteria.
- Scheduling/logistics agent: viewings, access, keys, travel, remote attendance, interpreter.
- Negotiation agent: mandate-bounded offers/counters, deadlines, version history, notification.
- Legal/tax coordinator: lawyer/notary/tax-authority tasks and evidence, never a substitute for a
  reserved professional act.
- Finance/insurance agent: preapproval, valuation, offer conditions, policy, drawdown, expiry.
- Payment agent: beneficiary verification, payment request, bank/escrow status, receipt, reconciliation.
- Closing/registry agent: signing pack, filing, fees, authority result, rejection cure.
- Handover agent: inventory, readings, defects, keys, possession, utilities, closing pack.
- Property manager: bookings/leases, collection, payout, vendors, maintenance, incidents, inspections.
- Accounting agent: invoices, commission/referral, tax schedule, platform/bank/owner reconciliation.
- Audit/incident agent: immutable events, anomalies, contradictory evidence, access, incident response.

Every agent call should carry:

- authenticated principal and assurance profile;
- case, step, workflow version, jurisdiction, and asset;
- exact mandate capability and remaining limits;
- only the minimum data/evidence references needed;
- idempotency key and deadline;
- policy/rule snapshot reference;
- expected output/evidence schema;
- callback or polling contract;
- retry class, compensation, and freeze conditions.

## 10. State, retries, and exceptions

### Step state

`pending → completed | not_applicable | blocked`

A step may be reopened only with authority and a reason, and not after a later phase has resolved.
Completed/not-applicable steps otherwise remain immutable; corrections append superseding evidence or
open a controlled replacement case/version.

### Case state

`active ⇄ frozen → closed | cancelled`

Closed and cancelled cases are immutable. A new issue after close opens an aftercare/management case
or a linked correction/dispute case.

### Mandatory exception paths

- identity/representation mismatch;
- AML/sanctions/PEP escalation;
- client revocation, expiry, death/incapacity, lost authority, conflict;
- title/cadastre/tax/technical identifiers disagree;
- missing owner/co-owner/spouse/heir/lender/public consent;
- occupied property, tenant rights, possession refusal, lost keys;
- hidden defect, failed inspection, damage, safety incident, force majeure;
- financing refusal, expired offer, valuation shortfall, FX/bank limit;
- payment beneficiary change, fraud signal, failed/duplicate/reversed payment;
- offer/condition expiry, breach, dispute, deposit refund/forfeit;
- portal/provider outage, rate limit, stale credential, schema change;
- filing rejection, fee shortfall, authority correction request;
- STR registration restriction or revoked/suspended registration;
- data breach, access anomaly, subject request, retention/deletion hold;
- complaint, professional-negligence allegation, litigation, regulator request.

Each exception records detection evidence, impact, freeze scope, owner, deadline, permitted actions,
notifications, recovery evidence, and resolution authority. No retry may duplicate an offer, message,
booking, payment, filing, or guest report.

## 11. Integrations

### Required internal seams

- contacts/accounts and encrypted contact vault;
- properties/listings/translations/media and source provenance;
- leads, assignments, SLA, pipelines, viewings, tasks, communications, deals, documents, consent;
- RealtyCase event ledger and query projection;
- private document/evidence store with digest and retention;
- audit/activity log;
- notification outbox and delivery ledger;
- scheduler/queue with idempotency and dead-letter handling;
- accounting/reconciliation and reporting.

### Bulgaria external seams

- Property Register inquiry/filing evidence;
- Cadastre sketch/scheme and identifier evidence;
- municipality tax valuation, acquisition/property/waste/tourist-tax evidence;
- notary workflow and executed deed;
- NRA tax/accounting evidence;
- Ministry of Tourism/National Tourism Register;
- ESTI operator or system-to-system reporting;
- banks, insurers, utilities, building managers, lawyers, engineers, interpreters, e-signature/provider.

### Greece external seams

- AADE AFM/TAXIS, myPROPERTY, E9/ENFIA, lease, and short-term-rental services;
- Hellenic Cadastre extracts, digital transfer file, filing/result;
- Electronic Building Identity and engineer/energy evidence;
- municipality/local restriction evidence;
- notary, lawyer, tax representative, bank, insurer, utility, building manager, interpreter, power of
  attorney/consular process.

### Integration contract

For every provider:

- owner, legal basis, terms/licence, environment, credentials, scopes, IP/network restrictions;
- request/response schema and version;
- stable external ID/idempotency key;
- synchronous, async callback, polling, and timeout behavior;
- rate limits, retry/backoff, duplicate detection, ordering, reconciliation;
- signed webhook verification and replay protection;
- PII/data residency, encryption, retention, audit, deletion, incident contacts;
- sandbox/production separation and evidence that production credentials were used;
- health/SLO, alert, circuit breaker, manual continuation, export/import, and provider exit plan.

Browser automation is a last-mile adapter where no supported API exists. It must preserve screenshots/
receipts and detect UI/schema changes; it is not treated as a stable API.

## 12. Security, privacy, and audit

- per-person and per-agent credentials; no shared production mutation token;
- least-privilege role plus case mandate; short-lived provider tokens where supported;
- separate agent identity from service/provider identity;
- encrypted private contact/document/payment stores; references only in workflow/audit ledgers;
- secrets only in deployment secret storage, never logs, prompts, evidence, or committed files;
- TLS, network allowlists/private links, egress allowlist, webhook signatures, replay protection;
- immutable attributable events with time, workflow/rule/assurance versions, evidence digests;
- data classification, lawful basis, consent separation, minimization, retention, legal hold, access,
  rectification, portability, erasure, and breach process;
- AML records isolated from general CRM visibility;
- payment instructions display verified beneficiary and last verification evidence;
- backup, restore, regional failure, queue recovery, provider outage, and audit-export drills;
- anomaly alerts for permission changes, evidence replacement, beneficiary change, bulk access,
  repeated rejection, deadline breach, duplicate external action, and case progression after freeze.

## 13. Current MS Realty OS implementation

Implemented in this change:

- shared `RealtyCase` workflow engine for six case types and five asset kinds in BG/GR;
- versioned immutable workflow snapshot;
- manual/autonomous modes and controlled mode change;
- signed-mandate reference/capability enforcement and expiry;
- required assurance reference for agent execution;
- append-only SQLite/JSONL event persistence with JSONL audit mirror;
- reference-only evidence schema and accepted-producer gate;
- phase ordering, blockers, optional-step authority, reopen, freeze/resume, close/cancel;
- local SQLite/JSONL, case-scoped reference-only condition ledger with mandate-bound open, satisfy,
  block, expire, human-waive, and human-reopen actions plus a deterministic due queue;
- autonomous intent planning and a local, result-file-driven executor that rechecks eligibility,
  requires a mandate-authorized result, and may append terminal `case_closed` only after the
  workflow is complete;
- local AES-256-GCM JSONL evidence vault, scoped to workspace/case with payload-digest checks and
  idempotent reference writes; the case ledger and projections retain references rather than document
  content;
- Payload-compatible PostgreSQL collection definitions and registered migrations for case, event,
  mandate, evidence, and outbox records, including a forward mandate-idempotency correction that
  preserves append-only historical versions and permits safe mandate-reference reuse across cases;
- deterministic, reference-only Payload import manifest plus a transaction-backed projector for
  cases, immutable events, and mandate versions. It uses Payload's serializable Local API
  transaction, resolves workspace-scoped relationship IDs, retries bounded database races, rejects
  immutable conflicts, and updates only the mutable case projection after ledger rows append;
- `npm run case:project` is a scoped dry run by default. It requires `MS_REALTY_WORKSPACE_ID` and
  respects `MS_REALTY_CASE_LEDGER_PATH`; applying requires an approved Payload runtime plus
  `MS_REALTY_CASE_PROJECTOR_APPLY=1`;
- regulatory-source snapshot primitives that bind official-source receipt references and SHA-256
  content digests, compare changes/staleness, and require professional and approval-evidence
  references before an all-successful snapshot can be approved;
- BG and GR regulatory steps and official-source catalog;
- derived queue, progress, current phase, next steps, and summary;
- authenticated Next App Router and standalone Node JSON/form APIs;
- BG/RU/EN React operator workbench;
- dedicated trusted-agent role restricted to case routes;
- attributable RealtyCase audit events;
- domain, authorization, Next-route, and standalone-runtime tests.

Endpoints:

- `GET /admin/cases?locale=bg|ru|en`
- `GET /api/admin/cases`
- `GET /api/admin/cases/intents`
- `GET /api/admin/cases/conditions`
- `POST /api/admin/cases`
- `POST /api/admin/cases/actions`
- `POST /api/admin/cases/conditions`
- `POST /api/admin/cases/conditions/actions`

Configuration:

- `MS_REALTY_CASE_LEDGER_PATH`: local preview case-ledger location.
- `MS_REALTY_CASE_CONDITION_LEDGER_PATH`: local preview condition-ledger location.
- `MS_REALTY_CASE_RECORDED_AT`: deterministic test/smoke timestamp only.
- `MS_REALTY_WORKSPACE_ID`: required scope for `case:manifest` and `case:project`.
- `MS_REALTY_CASE_PROJECTOR_APPLY=1`: explicit opt-in to write a manifest through Payload; omission
  remains a dry run.
- `MS_REALTY_ADMIN_CREDENTIALS_JSON`: per-human/per-agent credentials and roles.
- `MS_REALTY_EVIDENCE_VAULT_KEY`: local evidence-vault encryption key; it belongs in secret storage,
  never in a ledger, manifest, prompt, or committed file.

Not yet production-complete:

- applying the committed Payload/PostgreSQL schema in an approved runtime and proving the
  transaction-backed projector against migrated Postgres with read-back reconciliation of the
  preview ledger; the manifest remains reference-only and is not a database source of truth;
- condition workbench UI, durable Payload/PostgreSQL condition collection and projector, and
  production multi-writer/reconciliation coverage; the committed condition ledger/API is local only;
- signed structured mandate limits beyond the current capability set;
- child booking/stay/management-period runs;
- official-source retrieval, receipt custody, source-refresh monitoring, geographic rules, and
  lawyer/notary rule-pack publication/versioning; snapshot metadata and a digest do not constitute
  legal, tax, notarial, or other professional advice or approval;
- production evidence storage and operations: managed key lifecycle, multi-writer safety,
  upload/scanner/signature/virus/DLP controls, retention, access UI, backup/restore, and audit;
  the committed evidence vault is a local single-writer storage primitive, not a production service;
- identity, AML, registry, cadastre, tax, notary, bank, payment, e-signature, portal, messaging,
  accounting, ESTI, AADE, and property-management integrations;
- provider outbox/inbox, webhook, reconciliation, dead-letter, compensation, and scheduler runtime;
- continuous autonomous scheduling, assurance-provider verification, and provider-action dispatch;
  the committed executor is an explicitly invoked local runner over externally supplied result data,
  not a continuously running provider worker;
- monetary/channel/territory/delegation limits enforced from the signed mandate;
- production observability, SLOs, alerts, incident playbooks, backup/restore, and disaster-recovery
  evidence for the new case data;
- dependency audit clean-up beyond the scoped Next.js patch upgrade, if any advisory remains after
  the final locked install;
- legal/tax/privacy/AML/professional review and live end-to-end acceptance in both countries.

The repository's existing launch gates remain authoritative. This implementation must not be called
production-ready while `production/data/launch-readiness.json` or
`production/data/launch-input-checklist.md` is blocked.

## 14. Delivery plan and acceptance gates

### Slice A — case kernel and workbench

Status: implemented locally. Authenticated intent exposure and the local executor are part of this
slice, but the executor is not a production scheduler or provider-action worker.

Acceptance:

- manual and autonomous cases share the same workflow;
- agent cannot act on manual case or without assurance;
- no case can skip phase/evidence/mandate controls;
- an autonomous intent is rechecked before append, and terminal closure is offered only when the
  workflow is complete and the mandate authorizes it;
- local condition events are case-scoped and reference-only; satisfaction requires its declared
  evidence producers, while waiver and reopen require a human authority/reason record;
- both runtimes expose the same authenticated condition queue and mutation API, with agents limited
  to open/satisfy/block/expire actions;
- agent cannot call legacy broker mutations;
- BG/GR overlays appear at opening and persist as the versioned snapshot;
- Next and standalone runtimes return the same contract;
- focused and repository regression tests pass.

### Slice B — durable domain persistence

Status: a serializable, retry-bounded Payload Local API projector is implemented for the current
case/event/mandate manifest, with fake-transaction crash/retry coverage and an explicit dry-run/apply
CLI. It has not been executed against an approved migrated Postgres runtime; condition, evidence, and
outbox durability remain outside the projector.

- apply the normalized PostgreSQL/Payload schema for cases, immutable events, mandate versions,
  evidence metadata, links, deadlines, and projections;
- run the committed migration chain against approved Postgres and prove projector read-back
  reconciliation by IDs/digests;
- extend the transaction path to evidence and outbox only after their source contracts exist;
- add a durable condition collection/projector and reconcile it with the local condition ledger;
- keep the manifest reference-only and keep database read-back mandatory before making it a runtime
  source of operational truth;
- enforce tenant/workspace, uniqueness, immutability, chronological ordering, and least privilege in
  the database;
- include case data in backup/restore and recovery drills.

Acceptance: crash/retry/concurrency tests show no lost, duplicated, reordered, or partly applied
mutation; restore reproduces event and projection digests.

### Slice C — evidence and regulatory control plane

Status: local evidence-vault and source-snapshot primitives are implemented. They do not retrieve
official material, operate a production evidence service, or replace professional approval.

- production encrypted document store with managed keys, upload/scanner/signature/virus/DLP controls,
  metadata, digest, versions, retention, access, and recovery;
- regulatory snapshot service with official-source retrieval, receipt/digest custody, source-change
  handling, and professionally approved version publication;
- geographic/nationality/asset applicability rules and change alerts;
- professional assignment/approval/evidence routes.

Acceptance: a BG and GR lawyer/notary can reproduce why every required step applied using current
sources and cited case facts; obsolete rules freeze affected open cases for resnapshot.

### Slice D — communications, scheduler, and autonomous runner

Status: intent planning and a local explicit executor are implemented. No continuously running
scheduler/queue, assurance-provider verifier, or provider-action worker exists.

- transactional outbox, templates, consent/channel/time-window checks, delivery callbacks;
- deadline/scheduler/queue/dead-letter runtime;
- assurance verification, mandate limit evaluation, next-step selection, tool/provider scopes;
- freeze, cancellation, compensation, and human/manual takeover remain available.

Acceptance: deterministic simulations cover duplicates, timeouts, late callbacks, revoked mandate,
provider outage, contradictory evidence, and mode switching without duplicate external action.

### Slice E — country integrations

- BG: registry/cadastre/municipality/notary/NRA/tourism/NTR/ESTI;
- GR: AADE/Cadastre/building identity/notary/lease/STR;
- both: identity/AML, bank/payment, e-signature, insurer, utilities, maps, messaging, accounting.

Acceptance: provider contract tests plus real sandbox/live evidence for one purchase, sale, lease, and
short-term-rental operating cycle per country. Unsupported official acts use an evidenced professional
task, not fabricated API success.

### Slice F — production hardening and rollout

- role/mandate/agent penetration tests, privacy/AML review, professional review;
- load, race, chaos, outage, backup/restore, RPO/RTO, audit-export, and incident drills;
- shadow mode, manual production pilot, autonomous dry run, bounded autonomous pilot, then full mode;
- dashboards for case latency, blocked age, evidence staleness, provider errors, duplicates,
  reconciliation difference, mandate expiry, and unauthorized attempts.

Acceptance: every repository launch gate passes with live evidence; country professionals sign off
the rule packs and pilot cases; no critical reconciliation difference or unresolved security/privacy/
legal finding remains.

## 15. Official source catalog

The code keeps the subset used by executable workflow steps in `REALTY_RULE_SOURCES`. Research inputs:

### Bulgaria

- [Property Register](https://www.registryagency.bg/bg/registri/imoten-registar/)
- [Registering an act concerning immovable property](https://justice.government.bg/home/index/57b4f1d6-c88a-4d45-8114-6a0ecd87fb4f)
- [Cadastre sketch/scheme purpose](https://www.cadastre.bg/faq/za-kakvo-sluzhi-skicata-shemata-na-nedvizhim-imot-ot-kadastralnata-karta)
- [Cadastre and Property Register Act](https://www.cadastre.bg/zakoni/zakon-za-kadastura-i-imotniya-registur)
- [Local acquisition tax](https://www.minfin.bg/bg/784)
- [Property tax](https://www.minfin.bg/bg/778)
- [Sale income tax](https://www.minfin.bg/bg/827)
- [Buying and selling property / foreign ownership](https://www.identity.egov.bg/wps/portal/egov/vashata%20evropa/prebivavane%20v%20druga%20darzhava%20chlenka/kupuvane%20i%20prodazhba%20na%20nedvizhimo%20imushtestvo/)
- [Building energy-efficiency certification documents](https://www.seea.government.bg/bg/dokumenti/neobhodimi-dokumenti-sgradi)
- [Accommodation registration/classification](https://www.tourism.government.bg/bg/kategorii/uslugi-v-turizma/kategorizirane-na-mesta-za-nastanyavane)
- [Unified Tourist Information System, ESTI](https://www.tourism.government.bg/bg/kategorii/edinnata-sistema-za-turisticheska-informaciya)
- [Short-term rental tax information](https://nra.bg/wps/portal/nra/taxes/godishen-danak-varhu-dohdite/kratkosrochno.otdavane.pod.naem.online.platform/kratkosrochno.otdavane.naem.online.platform/)

### Greece

- [Property transfer digital file](https://www.gov.gr/upourgeia/upourgeio-psephiakes-diakuberneses/elleniko-ktematologio-ae/metavivasi)
- [myPROPERTY transfer declarations](https://www.aade.gr/dilosi-foroy-metabibasis-akiniton-doreas-gonikis-parohis-kai-klironomias)
- [AADE buyer guide and transfer tax](https://www.aade.gr/exypiretisi-enimerosi/hristikoi-odigoi/agora-akinitoy/prin-tin-agora-akinitoy)
- [Foreign resident AFM and tax representative](https://aade.gr/omogeneis-katoikoi-exoterikoy/eggrafi-sto-forologiko-mitroo/apodosi-afm-kleidarithmoy-kai-orismos-forologikoy-ekprosopoy)
- [E9 and ENFIA](https://aade.gr/en/greeks-abroad-non-residents/property-taxation/unified-tax-ownership-real-estate-e9-enfia)
- [Electronic Building Identity](https://ypen.gov.gr/ilektroniki-taftotita-ktiriou-ypochreotiki-apo-01-02-2021/)
- [Hellenic Cadastre declaration information](https://www.ktimatologio.gr/pliroforiako-yliko/ktimatografisi/9)
- [AADE lease declarations](https://www.aade.gr/diloseis-misthosis-akiniton)
- [AADE decision A.1068/2025 on tenant/co-owner lease-declaration outcomes](https://www.aade.gr/egkyklioi-kai-apofaseis/1068-28-05-2025)
- [Short-term rental registry and declarations](https://aade.gr/brahyhronia-misthosi-akiniton)
- [Ministry of Tourism short-term-rental safety implementation circular](https://mintour.gov.gr/wp-content/uploads/2025/09/%CE%A86%CE%9B%CE%98465%CE%A7%CE%98%CE%9F-%CE%93%CE%9F7.pdf)
- [Law 5313/2026 excerpt containing 2026 STR restrictions](https://www.aade.gr/sites/default/files/2026-07/apospasma-FEK%20%CE%91%20102%20%CE%9D%205313_2026.pdf)
- [Border-area transaction clearance](https://www.apdaigaiou.gov.gr/arsi-apagorefsis-dikaiopraxion/)

Official sources are inputs, not permanent truth. Before reliance, the regulatory snapshot service or
assigned professional must check currency, scope, amendments, linked decisions/circulars, portal
availability, and the exact case facts.
