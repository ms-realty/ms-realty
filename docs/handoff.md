# MS Realty rebuild — handoff

Written 2026-10-03 by the "Project end-to-end audit" Claude Code session, which ran out of
session budget mid-slice. Everything below is checkable in the repository; verify before you
act, because other sessions also work on this repo.

## 1. What this project is

MS Realty is a human-led real-estate agency in Sandanski, Bulgaria, which also handles Greek
property journeys. The repository `ms-realty/ms-realty` (GitHub, private) holds a **from-scratch
rebuild** of its product: a public site, a client workspace and a staff workspace, in one
Next.js 16 app on PostgreSQL 18. The legacy app was removed from `main`; tag
`legacy-app-final` (commit `a51827be`) preserves it.

**Read these, in this order, before changing anything:**

1. `docs/architecture.md` — final architecture v1.0. This is the normative product authority.
2. `docs/adr/0002-implementation-deviations.md` — where the implementation keeps its own
   component (no Payload, pg-boss, first-party passwordless auth with mandatory staff passkeys,
   Protomaps, Tailwind) and what it must still prove.
3. `docs/ux-spec.md` — UX/UI/frontend contracts v2.0.
4. `CONTEXT.md` — glossary.
5. `docs/plan.md` — slices S1b–S7, gates R00–R12, operator inputs, additions beyond the
   architecture (§7).
6. `docs/research/agency-obligations.md` — AML (ZMIP), consumer withdrawal, GDPR and country
   checklist obligations, with sources.
7. `AGENTS.md` — repository rules: no deploy, crawl parity, the Hermes/AI draft-only rule,
   personal-data policy, dev commands.

## 2. Hard rules

- **Never deploy.** Merges to `main` do not deploy, and CI has no release job. The public
  domain `makler-realty.com` currently serves the legacy WordPress site; do not touch DNS,
  Cloudflare routes or the origin host (`157.230.109.185`). Release happens only after gates
  R00–R12 pass with exact-release evidence and the owner decides.
- Workflow: a short-lived branch, then a PR. Auto-merge squashes once the required check
  `ci / gate` passes; an alias job reports the same result as `npm run check`. Branch
  protection requires the branch to be up to date with `main`; use `gh pr update-branch`.
- Do not force-push shared branches. Do not use bare `git stash`, because the stash stack is
  shared with other worktrees and sessions.
- Unknown stays unknown. Requested ≠ confirmed. Provider-accepted ≠ delivered. Published ≠
  available.
- AI (Hermes, renamed "Butler" by the owner per memory) only drafts. It never publishes,
  sends, indexes, approves or grants.
- No real customer data in code, fixtures or docs. The only public phone number is
  `+359879696870`. Sandanski is inland: never present it as a sea or coast destination.

## 3. Access tricks (macOS, user `ivan`)

- GitHub works only through the `ms-realty` identity:
  - `export GH_TOKEN=$(gh auth token -u ms-realty)`
  - git:
    `git -c http.extraheader="AUTHORIZATION: basic $(printf 'x-access-token:%s' "$GH_TOKEN" | base64)" push ...`
- `ls` is aliased to eza; use `/bin/ls`.
- Integration tests need a disposable PostgreSQL 18:
  `docker run -d --rm --name pg-test -e POSTGRES_PASSWORD=pg -p 55432:5432 postgres:18-alpine`.
  Pass `TEST_DATABASE_URL=postgres://postgres:pg@127.0.0.1:55432/postgres` to the command; never
  export it globally.
- Concurrent builds and e2e runs need their own `NEXT_DIST_DIR` and `E2E_PORT`.
- The network on this machine dropped often (phone hotspot, DNS `192.168.43.1`), and long agent
  runs died with `ENOTFOUND`. Check connectivity before starting long jobs.

## 4. What is merged on `main` (`aa2860d5`)

| PR | Content |
|---|---|
| #260 | Deploy freeze (deploy jobs only on manual `release=production`, since removed with the CI v2 migration) and the first plan |
| #261 | Legacy app removed. Legacy facts extracted to `data/legacy/` (165 listings, 457 URL decisions, 1725 media objects, 31 places, guides), verified by `node data/legacy/verify.mjs`. New scaffold |
| #263 | S1 foundations: domain, schema, server core (authz, sessions, email link, passkeys, operation receipts, transitions, audit, rate limits, pg-boss outbox), UI kit, i18n shells, staged legacy import |
| #265, #272 | CI v2: `.github/workflows/ci.yml` calls `Mindburn-Labs/platform-actions` `ci.yml@v2` (Postgres, `make check`, Playwright, dependency scan). Opened by another session |
| #274 | Design uplift by another session, in a deep-blue + Noto Serif Display direction. That direction is **withdrawn**; architecture §11.3 green wins |
| #278 | S2 server services by another session (inquiry intake, search, listing detail, minimal publication path), built against the old schema |
| #276 | Final architecture adopted as authority; plan rewritten; ADR 0002 |

## 5. The open branch: `rebuild/s1b-foundation` (PR opened with this file)

| Commit | State |
|---|---|
| `c60c9050` Realign schema and domain | **Green** when made. Architecture records: fact, listing and localized revisions; publication manifests and current-publication pointer with generation; Interest; SellerInstruction; ExternalAction/InboxEvent; privacy and release evidence. Retired scope removed. Fresh PostgreSQL 18 migration baseline. Legacy import rewritten (dry run, apply and re-apply verified: 165 listings unpublished, 1659 media private, 990 draft translations) |
| `34e66afa` Merge `main` | Brought in #274 and #278 |
| `5d2c87e2` WIP | #278 services ported onto the new schema (green per stage report: 586 tests, build). Three-host routing started |
| `6bab7df5` WIP | Three-host routing finished (`app/public`, `app/client`, `app/staff`; `proxy.ts` adds the host prefix; `src/server/config/hosts.ts`; 146/146 Playwright on its own build). Plus **unfinished** work from four stages cut off by the session limit (see §6) |

### State after the CI fix (2026-10-03)

The branch is green locally:
- lint and typecheck pass;
- 670/670 Vitest tests (unit, jsdom, integration on PostgreSQL 18);
- the production build passes;
- 146/146 Playwright.

To get there, the CI fix:
- **Removed the unfinished identity stage from the PR.** It had changed the auth APIs without
  updating their tests. Removed: invitations, access/pages modules, the staff access action,
  `src/features/identity/` and migration `0004_invitations`. `src/server/auth/*` and
  `src/server/http/request.ts` were restored to the pre-identity state. The work stays
  readable in commit `6bab7df5` (`git show 6bab7df5 -- src/server/auth src/features/identity
  db/migrations`).
- **Removed the unfinished Storybook / visual-test tooling.** `@storybook/addon-vitest` does
  not support vitest 5. Also in `6bab7df5`.
- **Finished the half-done frontend refactor so it builds:**
  - per-namespace message types;
  - native `<details>` menu disclosure plus `DisclosureBehavior` in every shell;
  - `preloadFonts` in place of `fontVariables`;
  - `/fonts/*` excluded from host rewriting in `proxy.ts`;
  - token tests updated to the architecture §11.3 type scale and single sans family.
- **Test PostgreSQL now runs with `-c max_locks_per_transaction=256`.** Parallel migrations of
  the 66-table baseline exhausted the default lock table ("out of shared memory").
- **Added scripts:** `tokens:build`, `openapi`, `release:evaluate`.

## 6. What each interrupted stage was doing

Full briefs are in the workflow script; the recipient cannot run it, but it lists the
requirements precisely:
`~/.claude/projects/-Users-ivan-Code-MS-Realty--claude-worktrees-project-e2e-audit-12f308/fce40629-a3e3-40d6-a72c-ec1a34b9ed4c/workflows/scripts/rebuild-s1b-foundation-wf_0752d9ce-e88.js`

1. **Identity** (backend, `src/server/auth`, staff/client access pages), per architecture
   §8.1–§8.3 and ADR 0002:
   - staff and client contexts on separate hosts, with host-only cookies and a WebAuthn RP per
     host;
   - staff: 12 h absolute / 30 min idle; step-up within 5 min; enrolment by invitation (72 h,
     GET shows, POST accepts, reissue invalidates), then two passkeys mandatory; audited
     recovery; `npm run staff:bootstrap` for the first manager;
   - clients: invitation and e-mail-link sign-in with a confirm POST; 7 d / 24 h; step-up
     within 15 min for documents.
   
   Partial files: `src/server/auth/{access,invitations,pages}.ts`,
   `db/migrations/0004_invitations.sql`, `app/staff/[locale]/access/`,
   `app/client/[locale]/(journey)/access/`, `src/features/identity/`.
   Reusable older work by another session (old schema, local only): commit `090436cb` on
   branch `rebuild/s2-staff-sign-in`, readable with `git show 090436cb`.
2. **Design platform**:
   - DTCG tokens (`design/tokens.json`) → `src/ui/tokens.css` + `design/figma-variables.json`;
     architecture §11.3 palette;
   - Noto Sans (`public/fonts/`);
   - per-namespace catalogs plus a staff catalog;
   - bundle diet (public page ≤ 120 KB gzip JS);
   - display-locale map.
3. **Form pattern + Storybook + visual tests**:
   - `src/ui/form/`: server action + `useActionState` + server-minted operationId + typed §5.1
     outcomes, working without JS;
   - colocated stories, `.storybook/`;
   - `e2e/visual.spec.ts` + `playwright.visual.config.ts`, with baselines generated in the
     Playwright Docker image;
   - WebKit project;
   - `scripts/bundle-budget.mjs`.
4. **Transport + release evidence**:
   - `src/server/transport/` registry → `docs/api/openapi.json`;
   - `src/release/` + `release/policy.json`: R00–R12 policy, legacy-gate mapping, an evaluator
     producing `release/readiness.json` and `release/readiness.md` from one snapshot, Ed25519
     verification;
   - `app/api/ops/`, `src/server/ops/`.

Not started for S1b: the identity stage (redo it from `6bab7df5` against the current tests), Storybook/visual tests, design review, and the five-lens review. Transport and release tooling are in the PR but unreviewed.

## 7. Ownership — check before you edit

Read the memory notes in
`~/.claude/projects/-Users-ivan-Code-MS-Realty/memory/` (`MEMORY.md` indexes them), and run
`ListAgents` or ask the owner which sessions are active.

- Since **2026-10-02 the owner assigned the whole frontend** to the "MS Realty UI/UX redesign"
  session, which works from current `main`: Figma, `src/ui`, `src/features`, every `app/`
  route on all three hosts, and the token pipeline. Consequence: the frontend parts of this
  branch (design platform, Storybook/visual tests, shells, page placeholders, and possibly the
  `app/` host restructure) belong to that session. Agree with it before merging them, or drop
  them from this PR and keep only backend work.
- Backend (`src/domain`, `src/db`, `src/server`, `src/release`, migrations, import, `proxy.ts`
  host logic) continues with whoever takes this handoff.
- The "MS-realty frontend design audit" session made #274, #275 (draft: Today/Inbox services)
  and #277 (draft: natural language → filters). It agreed to leave #275 and #277 for the
  backend owner to port and close. Figma file: `jlaAGjGBCyI6dw87DH59D2`.
- Model routing set by the owner (memory `subagent-model-opus-5-5.md`): Opus 5.5 only for
  implementation; audits, reviews, tests and research on Sonnet 5.5; mechanical reads on
  Haiku.

## 8. Next steps, in order

1. Decide the frontend/backend split for this branch with the owner and the redesign session.
   The recommended path is to split it:
   - **PR A (backend):** schema realign, port of #278, identity server work, transport,
     release evidence, `proxy.ts`/`hosts.ts`, migration `0004`. Make it green and merge it.
   - **PR B (frontend):** hand to the redesign session or close it, and let that session
     rebuild on top of PR A.
2. Make the backend green. Fix `npm ci`, the identity tests, and migration ordering:
   `0003_search_projection` comes from the port and `0004_invitations` from identity; check
   that the meta snapshots are consistent with `npx drizzle-kit generate` → "No schema changes".
   Then:
   - remap `operations` statuses to the §5.1 result kinds;
   - have `outbox.ts` write Message/MessageAttempt;
   - rebuild `listing_search_documents` from manifests.
3. Run the S1b review lenses: architecture conformance, security (identity!), data truth,
   test quality. Fix the confirmed findings.
4. Continue with the slices in `docs/plan.md` §5:
   - **S2** inventory → public truth: property workbench, upload → seal → ClamAV scan →
     derivatives in R2 EU buckets, locale review, publish/restrict/withdraw with generation
     fencing, material correction, human disposition per legacy listing, legacy URL map in the
     gateway;
   - **S3** discovery and inquiry (public UI belongs to the frontend owner);
   - **S4** case continuity, including the AML ComplianceCheck and ServiceAgreement from
     `docs/plan.md` §7;
   - **S5** Butler/Hermes tasks with an evaluation corpus, plus operations;
   - **S6** release qualification: App Platform spec, images, backups/S3 archive, Better Stack,
     load test at 10 000 listings, security/accessibility reviews, migration rehearsal, release
     manifest;
   - **S7** cutover: owner only.
5. Housekeeping:
   - Dependabot PRs #266–#271: TypeScript 7 and @types/node 26 need care. Do not let a major
     TypeScript bump auto-merge without a full check.
   - The local `main` in `/Users/ivan/Code/MS-Realty` carries two stray local commits
     (`d9d9df5c`, `d50f2358`) that edit deleted legacy files. Reset only with the owner's
     consent.
   - Old Codex worktrees under `/Users/ivan/Code/MS-Realty-worktrees/` and agent worktrees under
     `.claude/worktrees/agent-*` belong to other sessions. Do not delete them without asking.

## 9. Owner inputs still missing (block release, not development)

Full list in `docs/plan.md` §8. In short:
- legal entity, contacts and coverage;
- team roles and business hours;
- a reviewer for each locale;
- media rights and seller authority per listing;
- retention/privacy policy;
- an AML officer, internal rules and a risk assessment;
- provider accounts: DigitalOcean App Platform + HA PostgreSQL, Cloudflare R2 EU buckets,
  Resend, OpenAI, Better Stack, AWS S3 Object Lock;
- DNS for `my.` and `app.`, and renewal of the expired `makler-realty.ru`;
- the SEO evidence decision;
- the recovery signing-key custodian;
- the Cloudflare audit-log answer for the route removal on 2026-09-17.

## 10. Live legacy system (still running, frozen)

- workers.dev and the origin serve the old app at `a51827be`.
- The workflows that monitor it (health check, drill, route reclaim, R2 repair) run scripts
  checked out from tag `legacy-app-final`.
- Known live security issues in the legacy origin (not redeployed on purpose):
  - a shared Basic-auth password grants full admin;
  - media ingest accepts any `Content-Type`.
  
  The rebuild fixes both by construction.
