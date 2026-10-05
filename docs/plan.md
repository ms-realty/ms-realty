# MS Realty rebuild plan

Status: active, not release-qualified · Started 2026-09-23 · Realigned 2026-09-26 · Recovery audited 2026-09-27

The current execution record is [delivery/2026-09-27-recovery.md](delivery/2026-09-27-recovery.md). The interrupted workflow status is not acceptance evidence.

Authority, in order: [`docs/architecture.md`](architecture.md) (final architecture v1.0,
normative), [`docs/adr/0002-implementation-deviations.md`](adr/0002-implementation-deviations.md)
(where the implementation differs and what it must still prove), [`docs/ux-spec.md`](ux-spec.md)
(UX/UI and frontend contracts v2.0), [`CONTEXT.md`](../CONTEXT.md) (glossary). This file says
how and in what order the rebuild reaches the architecture's release gates.

## 1. Ground rules

- **No deployment until production-ready.** Merges to `main` never deploy; CI has no release
  job. The release path is built in S6 and runs only on an exact release that passes R00–R10.
  Canonical domains and DNS are never touched by a merge.
- **Small, green, merged.** Short-lived branch → PR → required check `ci / gate` → auto-merge
  (squash) → branch deleted. `main` is always buildable and tested.
- **Architecture wins.** Screen (`P`/`C`/`O`), flow (`F`), acceptance (`AT01`–`AT68`, `UX01`–`UX24`)
  and gate (`R00`–`R12`) IDs appear in route files, tests and PR descriptions.
- **Truth over polish.** Unknown stays unknown, requested is not confirmed, provider-accepted
  is not delivered, published is not available. Every consequential command carries an
  operation id and expected revision.
- **Humans hold consequential authority.** Hermes drafts; publishing, sending, indexing,
  approving and granting access are recorded human commands bound to exact revisions.
- **Production data is never lost.** Legacy data enters through the staged import; the live
  legacy database stays untouched until the rehearsed cutover (architecture §18).

## 2. Goal and what "production-ready" means here

The goal is the complete first public release in architecture §3.1, accepted through gates
R00–R12 (§20.3). The repository can produce the software, the tests, the evidence tooling,
the infrastructure definitions and the runbooks for every gate. Some gate evidence can only
come from the agency: provider accounts and billing, DNS, legal and retention policy, locale
reviewers, real approvals and the cutover decision (§21.4, §8 below). The rebuild delivers
everything up to those inputs, keeps each missing input visible as a blocked gate with its
safe default, and never reports a gate as passed on local or synthetic evidence.

## 3. Current state (2026-09-27)

The recovered implementation is tracked in the delivery record above. The legacy deployment
description below is the 26 September baseline, not a fresh live-service observation.

| Area | State |
|---|---|
| Legacy site | `makler-realty.com` serves the legacy WordPress site (Worker routes removed out-of-band on 2026-09-17); `makler-realty.ru` registration expired. The old Next/Payload app still runs on workers.dev and the origin at `a51827be`, watched by the legacy monitoring workflows pinned to tag `legacy-app-final` |
| Merged | S0 deploy freeze (#260); S1 scaffold and legacy extraction (#261); S1 foundations (#263): domain model, schema, server core, UI kit, i18n shells, staged legacy import; CI v2 (`ci / gate`, #265/#272) |
| Legacy data | `data/legacy/`: 165 listings (30 active at freeze), 457 exact URL decisions (179×301, 268×410, 10×200), 1725 R2 media objects, 31 places, approved guide content; verified by `data/legacy/verify.mjs` |
| Recovered foundation | Three-host routing, mandatory two-passkey staff identity, revisioned publication/generation, split catalogs, architecture tokens, native forms and release evaluator implemented; production image, migrator and worker have local smoke evidence |
| Delivery work | Inventory/publication, discovery/intake, case continuity, private files, process controls, draft assistance and opt-in alert rule implemented with scoped database/browser evidence. Integrated verification and review fixes in progress; remaining software and external inputs are enumerated in the delivery record |
| Launch authority | Original `production/data/launch-readiness.json` and `launch-input-checklist.md` preserved; R00 and live qualification remain blocked |

## 4. Implementation decisions

Architecture §2 as amended by [ADR 0002](adr/0002-implementation-deviations.md), [ADR 0003](adr/0003-openrouter-jev.md) and [ADR 0004](adr/0004-cloudflare-staging.md). In practice:

| Concern | Choice |
|---|---|
| Application | Next.js 16 App Router, React 19, TypeScript strict, Node 24; one app serving three hosts: `makler-realty.com` (public), `my.makler-realty.com` (client), `app.makler-realty.com` (staff), routed by host in `proxy.ts`; local equivalents `*.localhost` |
| Data | PostgreSQL 16.14 for the selected provider contract, Drizzle ORM, committed SQL migrations (expand/backfill/contract), atomic revision guards; actual private staging connectivity remains unverified |
| Work | pg-boss in a dedicated worker; outbox + external-action ledger; lanes; leases |
| Identity | First-party passwordless (ADR 0002): staff passkeys ×2 mandatory, client e-mail link with confirm POST; host-only cookies per context |
| UI | React Aria Components + Tailwind v4 on DTCG-sourced semantic tokens (architecture §11.3 palette); server components by default; forms work without JavaScript |
| i18n | next-intl; public/client `bg en ru de nl el he`, staff `bg en ru`; per-namespace catalogs; locale published only when its content is approved |
| Rendering | Mutable public pages render per request from PostgreSQL (architecture §7.5); only static assets and approved media derivatives are cached |
| Media | R2 EU jurisdiction: quarantine, private, public buckets via the S3 API; seal → scan (ClamAV) → derivatives; private downloads through the app |
| Providers | Resend (mail), OpenRouter hosted Jev Router + typed Jev Decisions (Hermes; ADR 0003), Protomaps + MapLibre (maps), Better Stack (monitoring), AWS S3 Object Lock (independent archive); synthetic checks until live qualification |
| Tests | Vitest (unit, jsdom, integration on real PostgreSQL), Playwright (Chromium desktop/mobile + WebKit mobile) with axe and screenshot baselines in the pinned Playwright image |
| Hosting | Cloudflare gateway and protected Containers candidate: web, persistent worker and serialized migration use one immutable image digest with distinct credentials; separate PostgreSQL 16.14 staging service and private TLS path require live qualification before promotion |

## 5. Delivery slices

Order follows architecture §22.1. Each slice ends merged with green CI and a slice report.

| Slice | Scope | Surfaces | Acceptance | Gate prepared |
|---|---|---|---|---|
| **S1b Realign foundation** | Adopt architecture names and records (PropertyFactRevision, ListingRevision, LocalizedRevision, PublicationManifest + CurrentPublication with generation, Interest, SellerInstruction, ExternalAction, Subscription/ConsentEvent, PrivacyRequest, ReleaseEvidence); drop retired scope (reservations, statements, service-request dispatch, short-stay purpose, night/week periods, spending capability); qualify PostgreSQL 16.14 under ADR 0004; three hosts; staff passkey MFA, recovery, §8.1 timers, 72 h invitations; DTCG tokens with the §11.3 palette; bundle diet; shared form/mutation pattern; display-locale map; per-namespace and staff catalogs; component stories + screenshot tests + WebKit; transport-schema (OpenAPI) generation; release-evidence schema | shells, sign-in, access recovery | AT19, AT26, AT36–AT40 (local), AT41 | R01 |
| **S2 Inventory → public truth** | Seller/landlord intake and receipt; property workbench (facts & sources, listings/terms, media, BG copy, locales, review/publish, distribution/history); upload → seal → scan → derivatives; locale revisions and review; manifests, eligibility, atomic publish/restrict/withdraw with generation fencing; material correction; editorial content; legacy import staging with a human disposition per listing; legacy URL map in the gateway | P17–P19, O10–O17, O21, O33, O28 | AT18–AT28, AT42, AT55, AT57, AT58 | R02, R07 (prep) |
| **S3 Discovery → owned inquiry** | Public home, results/filters/map (Protomaps), property detail and media viewer, unavailable/legacy states, saved/compare/share, alerts with verified opt-in, areas/services/guides/contact/help/preferences, inquiry with no-JS receipt session, viewing request; staff Today, inquiry triage, assignment, first response, tasks; Resend adapter and inbound replies | P01–P16, P20–P24, O01–O03, O18 | AT01–AT14, AT44, AT46–AT49 | R03 |
| **S4 Case continuity** | Client host: access, invitations, Case overview, Brief, Interests/feedback, appointments, messages, documents, proposals, owner listing preview, participants, preferences, privacy requests, closeout; staff Cases, Case workspace, parties, matching, calendar with exclusive resources and ICS, proposals, document review, handover; country process checklists and AML/KYC record-keeping (§7) | C01–C18 (not C15), O04–O09, O19, O20 | AT15–AT17, AT29–AT35, AT38–AT40, AT43, AT45 | R04, R05 |
| **S5 Assistance and operations** | Hermes tasks `intake.extract`, `locale.draft`, `case.assist` with evaluation corpus, budgets, manual fallback; duplicate merge/split; privacy operations; reports; integration exceptions; team/access and service policy settings; kill switches | O22–O27, O32, O29/O30 as bounded service intake | AT50–AT56 | R06 |
| **S6 Release qualification** | One immutable Containers image for web, worker and migration roles; protected gateway and Access, private database path, secrets matrix, backups + sealed recovery points + safety ledger + S3 archive, independent telemetry and heartbeats, load test at 10 000 listings, security review, accessibility and seven-locale review, performance budgets, migration rehearsal, release manifest and gate evaluator, runbooks | — | AT57–AT67 | R07–R10 |
| **S7 Cutover and acceptance** | Owner-authorized final delta import, routing change, deployed checks, SEO observations, operating-cycle acceptance, custody handoff | — | AT68 | R11, R12 |

## 6. How each slice is executed

1. **Contract.** One agent writes the slice contract from the architecture and UX spec: routes,
   commands, view models, states, AT/UX IDs, file ownership.
2. **Shared patterns first.** Components and commands every screen needs are built once
   before screens fan out.
3. **Parallel build** on disjoint paths; package and schema changes are owned by one stage.
4. **Integrate.** `make check` and the Playwright suite green on the selected PostgreSQL 16.14 contract; run the independent provider qualification before release.
5. **Design review.** Screenshots of every screen and state at 390 and 1440 in bg and he,
   judged against the UX spec, fixed within tokens.
6. **Review.** Independent lenses (architecture conformance by AT/UX ID, security and
   authorization, accessibility/RTL, data truth and copy, performance), each finding
   adversarially verified before fixing.
7. **Merge** with a PR that lists the IDs covered and what remains blocked.

Use the model and effort selected for the active delivery session. Assign one owner per write surface, cap independent work to available capacity, and verify the integrated result. Historical Claude workflow model selections do not change the active session settings.

## 7. Additions beyond the architecture

Found missing by the 2026-09-24/26 review and checked against primary sources (articles,
links and unverified points: [`docs/research/agency-obligations.md`](research/agency-obligations.md)).
The software records, reminds and blocks; it never decides a legal question. Lawyers and an
accountant confirm the content.

| Addition | Basis | Minimal product support | Slice |
|---|---|---|---|
| AML/CFT customer due diligence | ZMIP art. 4 item 18 makes real-estate intermediaries obliged entities (lettings only from EUR 10 000 monthly rent); CDD at relationship start, one-off ≥ EUR 15 000 or cash ≥ EUR 5 000 (art. 10–11); ID copy (art. 53), representatives (art. 65), PEP (art. 36), sanctions, source of funds (art. 66), 5-year retention (art. 67), report to SANS FID before execution (art. 72); EU AMLR 2024/1624 from 10 July 2027 adds both-party checks | Restricted `ComplianceCheck` per party on a Case/Proposal, triggered at `agreed_for_next_step` or cash ≥ EUR 5 000; its own document class with 5-year retention that blocks erasure; compliance-only suspicion register; Hermes excluded; operator inputs: AML officer, internal rules, risk assessment | S4 |
| Service agreement and withdrawal right | Consumer Rights Directive art. 7(3), 8(8), 9, 14(4)(a) for distance/off-premises agreements; Greece: written brokerage agreement with tax numbers | `ServiceAgreement` for sellers and buyers/tenants: channel, withdrawal information and express-start request timestamps, computed deadline, signed copy, commission basis and payer; services cannot start before the recorded request; commission record with external invoice reference | S2 (seller), S4 (buyer/tenant) |
| GDPR operations | GDPR art. 12(3) (one month, extendable), 28, 30, 33 (72 h); cookies under the Electronic Commerce Act art. 4a (the receipt cookie is strictly necessary) | Processing register, processor/transfer register, breach log with a 72 h timer, default DSR due date, consent banner only if analytics/embeds are added | S5 |
| Country transaction checklists | BG: preliminary contract, deposit, notarial deed, tax assessment; non-EU land restrictions (Constitution art. 22); GR: AFM, notary, cadastre, ENFIA; border-area permits (Law 1892/1990) | Versioned checklist templates by country × sale/let × EU/non-EU buyer; human-completed items with owner, professional, evidence and due date | S4 |
| Complaints and reviews | UCPD art. 7(6) and Annex I 23b–c on reviews; ADR information | Complaint record (receipt, owner, due, outcome); review-consent event on completed Cases; reviews shown only with a verification statement | S5 |
| Agency operations | Good practice | Key register with check-out and due-back; photography as a property-work appointment tied to media rights; periodic owner report approved by a human; partner/referral records with fee terms; staff offboarding checklist; portal name and reference on manually entered inquiries | S2–S5 |
| European Accessibility Act | Directive 2019/882 art. 4(5): microenterprise service providers exempt | WCAG 2.2 AA stays the target; the annual microenterprise test is recorded in release evidence | S6 |

## 8. Operator inputs (architecture §21.4)

Blocked gates stay blocked until these exist; the safe default applies meanwhile.

| Input | Safe default until supplied | Gate |
|---|---|---|
| Legal entity, contact details, office, supported regions and services | No invented contact, coverage or service claims | R00/R09 |
| Named team, roles (reviewer, publisher, privacy, release), business hours | No response-time promise; intake owned by the coverage queue | R00/R03 |
| Locale reviewers for each enabled language | Locale content unpublished | R02/R09 |
| Seller authority, media rights and public-address precision per listing | Listing stays unpublished | R02 |
| Country process copy and document policy (BG, GR) reviewed by professionals | No process claims shown | R02/R04 |
| Retention, deletion, contact-purpose and vendor-processing policy | No production personal-data capture | R00/R05 |
| Provider accounts owned by the agency: Cloudflare gateway/Containers/R2, private PostgreSQL, Resend, qualified OpenRouter/explicit model adapters, independent monitoring and AWS S3 Object Lock | Local fakes and synthetic tests only | R01/R08 |
| DNS for `my.` and `app.` hosts, the reply subdomain and cutover; renewal of `makler-realty.ru` | No cutover, no mail-DNS change | R07/R10 |
| Historical SEO analytics (Search Console, Yandex, backlinks) | Optional at every lifecycle stage by owner decision of 2026-09-24; never a release blocker | — |
| Recovery custody, Ed25519 signing key holder, incident contacts | No release | R08/R10 |
| AML officer, internal AML rules and risk assessment (ZMIP art. 98, 101) | Proposal steps that need due diligence stay blocked | R04 |
| Accountant decision on VAT for commission on Greek properties | Commission recorded without tax treatment | R04 |
| Cloudflare audit-log answer for the 2026-09-17 route removal | Treat routes as unowned; cutover re-asserts them deliberately | R10 |

## 9. Progress log

| Date | Slice | PR | Result |
|---|---|---|---|
| 2026-09-23 | S0 | #260 | Deploy freeze; plan and spec recorded; tag `legacy-app-final` |
| 2026-09-24 | S1 | #261 | Legacy app removed; legacy facts extracted; scaffold and CI |
| 2026-09-24 | S1 | #263 | Foundations: domain, schema, server core, UI, i18n, import; 27 verified review findings fixed |
| 2026-09-26 | S1b | — | Realigned to the final architecture (this document, ADR 0002) |
