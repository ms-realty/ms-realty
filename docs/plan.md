# MS Realty rebuild plan

Status: active · Started 2026-09-23 · Product authority: [`docs/spec.md`](spec.md)

The rebuild replaces the whole application with one that implements the target-state
specification. It keeps the infrastructure that holds real state (the Cloudflare account,
R2 media bucket, the origin host and its Postgres data, both legacy domains) and replaces
everything that was built around the old screens.

## 1. Ground rules

- **No deployment until production-ready.** Merges to `main` never deploy. CI has no release
  job; S9 builds the release path, and it runs only when every launch gate in §7 is green.
  Canonical domains are not touched by any merge.
- **Small, green, merged.** Work lands as short-lived branches → PR → required check
  `ci / gate` (CI) → auto-merge (squash) → branch deleted. No long-lived branches, no parked
  worktrees. `main` is always buildable and tested.
- **The spec wins.** Screen (`P`/`C`/`O`), flow (`F`) and acceptance (`A`) IDs from the spec
  appear in route files, tests and PR descriptions so coverage is traceable.
- **Truth over polish.** Unknown stays unknown, requested is not confirmed, accepted is not
  delivered. Every consequential mutation carries a record version and an operation id.
- **Humans hold consequential authority.** Hermes/AI can only draft. Publishing, indexing,
  sending and approving are recorded human actions bound to exact versions.
- **Production data is never lost.** The live Postgres is migrated by a tested ETL into a new
  schema; the old schema stays read-only until the new release is proven.

## 2. Current state (audit, 2026-09-23)

| Area | Finding | Consequence for the plan |
|---|---|---|
| Canonical domain | `makler-realty.com` serves the legacy WordPress site; all 18 Worker routes were removed out-of-band on 2026-09-17 (not by CI) | Leave as is until launch; the next CI deploy would re-attach routes, so deploys are frozen first |
| `makler-realty.ru` | Registration expired (nic.ru parking page) | Owner must renew before `.ru` can be routed; legacy `.ru` mappings stay evidence-based |
| Live preview | workers.dev + origin run old build `a51827be`; `/api/ready` blocked on `live_services`, `r2_media_coverage`, `production_recovery` | Old gates retire with the old app; §7 defines the new gates |
| CI | Required check red since 2026-09-20 (two date-bound tests); health check red hourly (canonical host serves the legacy site); drill red by design daily | S0 fixes the tests; monitoring stays as is and is rebuilt for the new app in S9 |
| Security (live legacy) | Origin Basic-auth password maps to full admin (H1); media ingest stores arbitrary `Content-Type` on the canonical media path (H2); CSP allows inline script | Fixed by construction in the new app and edge (S1/S9); the live legacy build is not redeployed |
| Dependencies | Payload 3.87.1 advisory GHSA-jg8r-5jh2-v2xj (not exploitable here) | Payload is removed |
| Data | 165 legacy listings (30 active at freeze), 457 terminal legacy URL decisions, 1 714 R2 media objects, 990 translation drafts (0 approved), area missing on every listing | Imported once through the F32 import pipeline with provenance; nothing is auto-approved |
| Code | ~135 k lines in `production/lib`, 86 k lines of tests, custom Node server + Next shell + Payload | Replaced; recoverable from tag `legacy-app-final` |

## 3. Architecture decisions

| # | Decision | Why |
|---|---|---|
| AD1 | One **Next.js 16 App Router** app (React 19, TypeScript `strict`) serving public, client and agency surfaces | Server components give fast semantic HTML (§19.1); one design system and one domain layer across three surfaces |
| AD2 | **PostgreSQL 17 + Drizzle ORM**, SQL migrations checked into `db/migrations` | The domain (§04) is relational with versioned records; Drizzle keeps SQL visible and typed |
| AD3 | **No CMS.** Guides, areas, services and team pages are domain records edited in the agency workspace (O21) with the same versioned approval as listings | The spec's approval/translation model applies to all public content; a CMS admin would be a second, weaker workflow |
| AD4 | Pure **domain layer** (`src/domain`): state machines for inquiry, cases, listing dimensions, appointment, message, document, proposal, task; transition contract = capability + version + evidence | §07 rules live in one testable place; UI and API cannot diverge |
| AD5 | **Capability-based authorization** over record scopes, enforced in application services (`src/server`); party relationships grant case-scoped access | §03: permissions are capabilities over records, server-enforced |
| AD6 | **Operation receipts**: every consequential command carries an idempotency key and expected version; outcomes are durable and reconcilable | §19.4, A18/A40/A72 |
| AD7 | **Sessions**: opaque, hashed, server-side; email-link sign-in with an explicit confirm step (scanner-safe); WebAuthn passkeys for staff (`@simplewebauthn/server`); no account enumeration | F13, A33/A34 |
| AD8 | **UI**: React Aria Components for accessible primitives (i18n, RTL, dates) + Tailwind CSS v4 on semantic tokens; self-hosted Noto Sans / Noto Sans Hebrew | WCAG 2.2 AA, Hebrew RTL, multilingual type (§16, §20) |
| AD9 | **i18n**: `next-intl`; public `bg en ru de nl el he` (bg = source), staff `bg ru en`; a locale is routable only when enabled and indexable only when its content is human-approved | §18.2, §20.4 |
| AD10 | **Search** in Postgres (structured filters + `tsvector` + `pg_trgm`), explicit unknown semantics, exact counts | §F02, A03–A07; no separate search service to operate |
| AD11 | **Jobs/outbox** on Postgres (`pg-boss`): alerts, publication, outbound messages; delivery states per §07.5 | Durable, idempotent, no extra infrastructure |
| AD12 | **Media** in R2 (`ms-realty-media`), private staging vs public renditions, content-type allowlist, rights/modification metadata | §F23, A54; fixes H2 |
| AD13 | **Edge**: a small Cloudflare Worker for legacy URL decisions (both domains), public media, preview-host `noindex`, and origin proxy with a single auth model | §F09, §20.4; fixes H1 by removing the shared-password admin path |
| AD14 | **Hermes** is an external draft service behind a narrow API with the `ai_service` capability (draft-only); untrusted content is never instruction | §F29, A65/A66 |
| AD15 | **Testing**: Vitest (unit + integration on real Postgres), Playwright end-to-end with axe-core, per-locale and RTL runs; CI provides Postgres as a service container | §20, §22.4 |
| AD16 | **Tooling**: npm, Node 24 LTS, Biome (lint/format), `tsc --noEmit` | One fast toolchain |

Hosting stays: Worker in front, origin on the existing host (Docker Compose: app, Postgres,
job worker, Hermes, Caddy). Container/infra changes happen in S9 only.

## 4. Repository layout (target)

```text
app/                      routes only (thin): [locale]/(public), [locale]/journey, workspace, api
src/domain/               pure types, state machines, rules — no IO
src/server/               services, authz, repositories, jobs, integrations
src/db/                   Drizzle schema, migrations runner, seed, legacy import
src/ui/                   tokens + components (design system)
src/features/             feature UI modules (search, listing, inquiry, today, inbox, …)
src/i18n/ + messages/     locale config and catalogs
workers/                  Cloudflare edge Worker
data/legacy/              frozen legacy sources used by the one-time import
e2e/                      Playwright journeys (T1–T6) and a11y checks
infra/                    Dockerfile, compose, Caddy, release scripts
docs/                     spec.md, plan.md, adr/
```

## 5. Delivery slices

Each slice ends merged on `main` with green CI. Slices follow spec §23.1; a slice can span
several PRs.

| Slice | Scope (spec) | Screens | Exit evidence |
|---|---|---|---|
| **S0** Freeze & baseline | Deploy freeze, green CI, tag `legacy-app-final` | — | PR merged, no deploy job ran |
| **S1 / D0** Foundations | Clean slate; domain model, state machines, capabilities, operation receipts, activity/audit; DB schema + migrations; tokens + core components; i18n/RTL; test harness; new CI; legacy import (dry-run → apply) | shells only | Domain + service tests green; import dry-run report; a11y checks on components |
| **S2 / D1** Discover → human response | Public home, search/filters/map-optional, property detail, gallery, inquiry + receipt + reconciliation, areas/guides/services/team/contact/help, unavailable listing, search recovery; staff sign-in, Today, Inbox, inquiry triage, contact record, tasks; sitemap/robots/hreflang; legacy URL decisions | P01–P06 P11 P12 P15–P17 P20–P22 P24 · O01–O03 O06 O18 | T1 up to broker response; A01–A10 A16–A19 A23–A25 A43–A45 |
| **S3 / D2** Evaluate → viewing | Saved/compare/shared shortlist, saved-search alerts, client access + invitation, overview, requirements, private properties, messages, appointments; cases, matching, calendar | P07–P10 P13 P14 · C01–C07 C13 · O04 O05 O07–O09 | T1 complete, T3; A11–A15 A20–A22 A33–A36 A41 A42 A46–A52 |
| **S4 / D3** Owner → approved publication | Owner intake + receipt, seller overview + preview approval, property/listing editor, media, facts/evidence, translation review, release/distribution, content, material correction | P18 P19 · C11 C12 · O10–O17 O21 O33 | T2; A27–A32 A53–A56 A69 A70 |
| **S5 / D4** Case coordination | Documents + upload/scan/review, proposals, closeout, participants | C08–C10 C16 C17 · O19 O20 | A37–A40 A48 A68 |
| **S6 / D5** Operational reliability | Reports, team/access, service policy, integration health, audit/privacy, duplicates/merge, import/bulk, data requests | C18 · O22–O28 | T4; A57 A58 A67 A71 A72 |
| **S7 / D6** Adjacent services (flagged off) | Rental specifics, short-stay quote/reservation, management requests and statements | P23 · C14 C15 · O29–O31 | T6; A59–A64 (behind flags) |
| **S8 / D7** Assistance | Hermes draft service, AI draft review, public source-bounded assistance | O32 + contextual | A65 A66 |
| **S9** Production cutover engineering | Infra (image, compose, Worker), production data ETL from the legacy schema, backups + restore drill, monitoring/alerting, performance budgets, full a11y/locale/security review, launch gates | — | Every gate in §7 green on the preview host |

## 6. How each slice is executed

1. **Contract** — one agent reads the spec sections for the slice and writes the route,
   view-model and service contracts (`docs/adr/` only when a decision is new).
2. **Build** — parallel agents on disjoint directories (domain/server, UI features, tests);
   `package.json` changes are made once, up front, by the orchestrator.
3. **Integrate** — typecheck, lint, unit + integration tests, build, Playwright journeys.
4. **Review** — independent reviewers per lens (spec conformance by A-IDs, security/authz,
   accessibility/RTL, data truth); findings verified before fixing.
5. **Merge** — PR with screen/flow/acceptance IDs; auto-merge on green; branch deleted.

## 7. Launch gates (replace the legacy twelve)

Deployment is allowed only when all are true and recorded:

1. All slices S1–S6 and S8 merged; S7 flags off unless the owner enables a service.
2. `npm run check` green on the release commit; Playwright T1–T5 green in every enabled locale.
3. Production data ETL rehearsed on a restored copy of the live database with row-count and
   checksum reconciliation; backup + isolated restore drill passed within 30 days.
4. Security review of auth, authz, uploads, edge and secrets with no open high findings.
5. WCAG 2.2 AA task checks (keyboard, screen reader, zoom, RTL) on T1–T5 recorded.
6. Core Web Vitals lab budgets met on the preview host for P01, P02, P05.
7. Monitoring and alerting live (health, error rate, job queue, outbox failures) with a named
   on-call owner.
8. Owner inputs in spec §23.3 supplied: coverage, enabled locales + reviewers, service hours,
   response promises, disclosure policies, retention/privacy policy, staff capabilities.
9. Owner launch decision recorded; `.ru` renewed if it is to be routed.

## 8. Owner inputs needed (spec §23.3)

Coverage statement; which public locales launch and who reviews each; service hours and
response promise; viewing policy; price/commission disclosures; address/media disclosure
policy; messaging channels to expose; retention/privacy/consent policy; staff list with
capabilities; brand assets and photography rights; renewal of `makler-realty.ru`; the
Cloudflare audit-log answer for the 2026-09-17 route removal.

## 9. Progress log

| Date | Slice | PR | Result |
|---|---|---|---|
| 2026-09-23 | S0 | — | Plan and spec committed; deploy freeze in progress |
