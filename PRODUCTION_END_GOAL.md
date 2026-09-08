# MS Realty — production end goal

Audit date: 2026-09-07. Written for the agent that takes the project from its
current state to a full production release. Every claim below was checked on
this date against the repository, GitHub, and the live hosts. Where a claim
can go stale, the command that re-checks it is next to it.

Read `AGENTS.md`, `PRODUCT.md`, `CONTEXT.md`, and `production/DEPLOYMENT.md`
first. This file does not replace them; it says what "done" means and what
stands between here and there.

---

## 1. Definition of done

The project is finished when every line below is true at the same time and
the evidence for each is reproducible.

### 1.1 Repository

- `origin` has exactly one branch: `main`.
- Zero open pull requests. Zero draft pull requests.
- Zero open issues. Monitoring-drill receipt issues are closed once the drill
  passes and the receipt is recorded.
- Every local checkout of this repository on the owner's machine has a clean
  `git status`, no stash entries, and no worktree other than the main checkout.
  (`git worktree list`, `git stash list`, `git branch -vv` all show nothing
  surprising.)
- No file that must be regenerated (`production/data/*`, `public/vendor/*`,
  `search/data/*`) differs from what its generator produces on `main`.
- `SOURCE_OF_TRUTH.md` prose agrees with `production/data/launch-readiness.json`
  and with the live site. No document in the repo says something the code
  contradicts.

### 1.2 Release pipeline

- The commit on `main` is the commit serving production. `/api/health` on
  `https://makler-realty.com` reports `build_marker` and `origin_build_marker`
  equal to `git rev-parse origin/main`.
- `/api/ready` answers `200` with `launch_ready: true` and an empty
  `blockers` array. All twelve launch gates pass, including the four that need
  runtime evidence: `live_services`, `monitoring_rollback`, `payload_runtime`,
  `production_recovery`.
- A routine release (PR → green `npm run check` → auto-merge →
  `repository_dispatch` → origin deploy → Worker deploy → verification) completes
  without rollback three times in a row.
- The scheduled health check (`health-check.yml`, hourly) and the scheduled
  monitoring drill (`monitoring-drill-schedule.yml`, daily) have passed on the
  last seven consecutive runs.
- Rollback keeps readiness evidence: after a forced rollback, `/api/ready` does
  not gain new blockers such as `r2_media_coverage`.

### 1.3 Public website (`makler-realty.com`, seven locales)

- Every route in `production/data/app-route-manifest.json` answers as the
  manifest says, in all of `bg en de nl ru el he`, with `he` fully right-to-left.
- All 457 legacy URLs answer with their approved terminal decision
  (179 × `301`, 268 × `410`, 10 × `200`) under freeze `MSR-LAUNCH-FREEZE-1`,
  verified live, not only in the report.
- The catalogue is the rekeyed one: lot-number ids (`MS-00815` style), 127
  public listings, 38 archived twins answering `200` through the preservation
  page and absent from the sitemap, every crawl-era listing path `301`-ing once
  to its lot-number path.
- Public translations: every published listing and every CMS page has a
  human-approved translation in every public locale, or the locale shows an
  honest, styled fallback. No machine draft is indexable.
- Listing quality warnings in `launch-readiness.json` are zero for
  `missing_area`, `missing_bedrooms`, `missing_public_images`,
  `thin_public_gallery`, or each remaining one has a written owner decision.
- Performance: cold time to first byte for the home page under 1.5 s, cached
  under 0.5 s; Lighthouse performance and accessibility ≥ 90 on home, search,
  listing, contact for mobile and desktop.
- Accessibility: WCAG 2.2 AA on the public pages listed above, checked with an
  automated pass plus a manual keyboard and screen-reader walk.
- Every enquiry intent (viewing, call-back, enquiry, valuation, saved search,
  language request) submits to a durable store, returns a receipt, and appears
  in the admin lead inbox. Verified end to end on production with a test lead
  that is then deleted by the operator.
- `robots.txt`, `sitemap.xml`, hreflang, canonical tags and structured data
  point only at `https://makler-realty.com`. `workers.dev` and the origin host
  never appear in public HTML. Search Console and Yandex Webmaster have the
  property verified and the sitemap accepted.
- `makler-realty.ru` has an owner decision that is implemented: either it
  serves the site (routes in `wrangler.jsonc`, sitemap and robots pointing at
  its own host or at `.com` per the SEO decision) or it redirects `301` to `.com`
  per legacy URL. Today it serves a `503` construction page whose `robots.txt`
  points at a `workers.dev` sitemap. That is not an acceptable end state.

### 1.4 Admin workspace (`/admin`, `bg ru en`)

- Every one of the 27 admin routes renders, is reachable from navigation, and
  performs its purpose against Payload/Postgres, not fixtures.
- The capability inventory at
  `.claude/handoff-admin-redesign/capability-inventory-349-gaps.json` reports
  zero missing operations for its five objects (Listing, Media asset, Website
  page, Document and case checklist, Workspace settings). Each operation is
  either exposed in the UI or removed from the backend with a reason.
- Design parity: the shipped admin and public UI match the Paper file
  "MS Realty — Website and Admin" (id `01M1RXGNF7RN4QVT2NBBX0AT2H`), or the
  Paper file is updated to match what shipped, with the owner's sign-off. The
  older `.dc.html` canvas is archived, not a second source of truth.
- Audit log, RBAC, session handling, forced password change, team management,
  and the Hermes draft boundary are covered by tests that go through the real
  whitelists (`createAuditLogEntry`, launch gate ids, search projection kinds).
- Every admin screen works at 390 px width without horizontal scrolling.

### 1.5 Operations and security

- `npm run audit` is clean at the `high` threshold and the Payload advisory
  (moderate, `payload ≤ 3.88.0`) is resolved by upgrade or by a written
  accepted-risk note.
- GitHub: branch protection on `main` requiring the `npm run check` job;
  Dependabot alerts enabled; repository visibility matches the owner's intent
  (it is **public** today, which was not the case earlier; confirm with the owner).
- Backups: an encrypted off-site backup exists, a restore drill has been run in
  isolation, and its Ed25519-signed report is imported so `production_recovery`
  passes.
- The Hermes live-service evidence has a documented operator routine (the
  seven-day source-review task) and it is either automated safely or on the
  owner's calendar.
- Every secret name in GitHub and Cloudflare matches what the code reads.

---

## 2. Where the project actually is (2026-09-07)

### 2.1 Production is ten commits behind `main`

| | |
|---|---|
| `origin/main` | `4e336a9b` (2026-09-07) |
| Live `build_marker` on `.com` and `workers.dev` | `db7cd103` (2026-09-01, PR #175) |
| Unreleased on `main` | #180 #181 #185 #186 #188 #190 #191 #192 #193 #196 |

The whole Atlas redesign (#190 and its follow-ups) is merged but **not live**.
The public still runs the pre-Atlas UI.

Why: the construction-hold variable `MS_REALTY_PUBLIC_CONSTRUCTION_HOLD` was
set to `false` at 06:11 today, so the next auto-merge (#196) fired a full
release, run `34116389982`. `npm run check` and `Deploy durable origin`
passed; `Deploy production` failed at "Verify deployed Worker" after 100
attempts of `503`, and CI rolled the Worker and origin back to `db7cd103`. The
run before it (`34090202809`) rolled back earlier, at Hermes evidence capture
(`Hermes worker must attempt at least one draft`, dispatch file has zero rows).

Live readiness right now:

```
GET https://makler-realty.com/api/ready   -> 503
{"status":"blocked","launch_ready":false,"blockers":["live_services","r2_media_coverage"]}
```

`r2_media_coverage` is only a blocker because the rollback discarded the
per-release R2 report (PR #178 addresses exactly this and is still a draft).

Re-check: `curl -s https://makler-realty.com/api/health | jq '{build_marker,origin_build_marker,blockers}'`

### 2.2 The canonical-site probes fail on latency, not only on logic

The two "Reclaim the public routes" runs today (`34119481989`, `34123670036`)
failed the journey probe with `home returned 503`, `search 503 is not the
branded fallback page`, `canonical public host must remain indexable`, then
`19/37 passed` with several `This operation was aborted` (client timeouts) and
`admin · api requires auth: status 502`.

Measured from outside:

| URL | cold TTFB | cached TTFB |
|---|---|---|
| `https://makler-realty.com/bg` | 13.4 s (`cf-cache-status: DYNAMIC`) | 1.0 s (`HIT`) |
| `https://makler-realty.com/bg/imoti/MS-CRAWL-0013` | | 0.23 s (`HIT`) |
| any uncached 404 | 4.5–4.8 s | |

A 13 second cold render trips every probe timeout in CI and the hourly health
check (5 of the last 20 health-check runs failed). Treat origin cold-start and
render time as a release blocker, not a polish item.

### 2.3 Launch gates

Committed baseline `production/data/launch-readiness.json` (generated
2026-08-27): 12 gates, 8 pass, 4 blocked:

- `live_services` — needs Postgres search sync/query reports and a Hermes
  worker report with ≥ 1 real attempt. The translation dispatch is empty, so
  only a human-confirmed source-review task can produce one
  (`DEPLOYMENT.md` → "Hermes live-service evidence", `--confirm-task`).
- `monitoring_rollback` — the daily drill has failed **10 of the last 10** runs
  with `health must report expected build marker`. Nine receipt issues are
  open (#124 #147 #150 #162 #164 #179 #183 #187 #195). The gate cannot pass
  until the drill passes.
- `payload_runtime` — no runtime report imported; needs the deploy host's
  `PAYLOAD_SECRET` and `DATABASE_URL`.
- `production_recovery` — needs the signed recovery report;
  `MS_REALTY_RECOVERY_SIGNING_PRIVATE_KEY` exists as a GitHub secret, the
  public key is not set where the gate reads it.

Baseline warnings: `missing_area` 165, `missing_bedrooms` 10,
`missing_public_images` 9, `thin_public_gallery` 18.

### 2.4 Catalogue and translations

- Live catalogue is still crawl-keyed: 165 listings, `MS-CRAWL-nnnn` ids,
  sitemap has 197 URLs. PR #182 (`feat/legacy-lot-identity`, 229 files) rekeys
  to lot numbers, merges 38 twins, recovers the area for 148 listings, and adds
  slug-history redirects. It is deliberately excluded from #190 and must be
  landed on its own with the two-pass minter order written at the top of
  `migration/rename_listing_ids.mjs`.
- `production/data/cms-seed.json` has 0 listings; public inventory comes from
  the Payload publication sync on the origin, not from the seed.
- Translation coverage report (generated 2026-07-05, stale): 990 open
  `draft_review_required` tasks across en/de/nl/ru/el/he. `translation-tasks.jsonl`
  has 5 rows, 1 published (el). Hermes dispatch: 0 rows. English listing pages
  exist (`/en/properties/MS-CRAWL-0013` → 200) but whether their body is
  translated or Bulgarian fallback must be checked per locale.

### 2.5 Admin

27 routes exist (`/admin/today`, `/leads`, `/listings`, `/listings/edit`,
`/contacts`, `/cases`, `/pipeline`, `/viewings`, `/documents`, `/media`,
`/translations`, `/locales`, `/approved-content`, `/migration/review`,
`/hermes`, `/tasks`, `/requests`, `/consents`, `/activity`, `/reports`,
`/settings`, `/team`, `/connect`, `/login`, `/logout`, `/admin`,
`/documents/records`). Login works on production; everything behind it is
`401` without a session, as intended.

Capability inventory: **349 backend operations with no UI**:

| Object | operations | missing |
|---|---|---|
| Listing | 104 | 80 |
| Media asset (photo, 360 tour) | 91 | 50 |
| Website page and content blocks | 72 | 53 |
| Document and case checklist | 109 | 88 |
| Workspace settings, team, security, integrations | 120 | 78 |

PR #189's own description says: "Full Paper parity, remaining admin/public
screens and production acceptance are incomplete." The owner confirmed on
2026-09-06 that the Paper design itself is not finished.

### 2.6 Open pull requests (all drafts)

| PR | branch | state | what to do |
|---|---|---|---|
| #197 | `claude/release-public-hold` | green, +167 | Adds `release-public-hold.mjs` (route hand-over without unrouting). Review, undraft, merge. Needed for any future hold/release cycle. |
| #194 | `claude/ms-realty-launch-2e8364` | green | Its content is already on `main` as #196; branch is 2 ahead / 1 behind. Close, delete branch. Re-check with `git diff origin/main origin/claude/ms-realty-launch-2e8364 --stat`. |
| #189 | `codex/production-completion-20260906` | CI red (2 tests: lead inbox primary action, hero numeric controls) | Superseded by #190 except a 48-file delta (admin/public CSS and React composition). Codex has 42 uncommitted files in its worktree fixing CI. Either finish and merge that delta or extract what is still wanted and close. |
| #184 | `claude/ms-realty-redesign-finish-981bcd` | CONFLICTING | Fully contained in #189/#190 lineage. Close, delete branch. |
| #182 | `feat/legacy-lot-identity` | green, 229 files | The lot-number rekey. Rebase on current `main`, run the validate chain twice, land. |
| #178 | `codex/rollback-readiness-evidence-fix` | green, +126 | Preserves readiness evidence during rollback. Rebase, merge. Fixes the `r2_media_coverage` blocker seen today. |
| #177 | `codex/admin-login-owned-origin-pair` | green, +261 | Scoped admin-login origin exception. Verify still needed after #176/#174 merged; rebase and merge or close. |
| #173 | `codex/work-automation-backend` | green, +3877 | Durable tasks and owner-approved automation runs. Decide with owner: land (then build its UI) or close. |

### 2.7 Branches that exist nowhere but on this machine

Merged and safe to delete (their PR is merged, `git cherry` shows nothing
unique): `codex/complete-listing-translations` (#153),
`codex/durable-media-lifecycle` (#167), `codex/durable-media-production-fix`
(#169), `codex/apex-root-retain-200` (#168), `codex/production-safe-rollout`
(#170), `codex/reconcile-production-cms-seed` (#154),
`codex/workers-dev-final-origin` (#134), `fix/preview-admin-access` (#127),
`codex/remove-production-mocks` (#137), `codex/ms-realty-owner-operator-release`
(#128, still on origin), `claude/canonical-site-probe` (#181), plus every
branch whose diff against `origin/main` is empty or whose upstream is `gone`
and whose PR is merged (see `git branch -vv | grep gone`).

Contained in #182 and deletable once #182 lands: `hold/search-facet-pages`,
`hold/search-facet-readiness-gate`, `worktree-agent-a5cc82b17359e2f46`,
`worktree-agent-ad02c3f0fe7c77f80`, `claude/relaxed-mestorf-fbd4b7`,
`claude/ms-realty-integration`.

Unmerged work with no PR — each needs a keep-or-drop decision, then a PR or a
deletion:

| branch | last commit | unique code | note |
|---|---|---|---|
| `codex/hermes-owner-os-{integration,oauth-layer,documents-layer,operations-ui}` | 2026-09-02 | 38 files, +4599 | four names, one commit `6db4cd43`; `operations-ui` worktree has 5 dirty files |
| `codex/website-cms-pages` | 2026-09-02 | 22 files, +2413 | CMS page editor |
| `codex/media-library-admin-ui` | 2026-09-02 | 16 files, +1480 | media library UI |
| `codex/operator-artboard-shell` | 2026-09-01 | 8 files, +359 | admin search state |
| `codex/ms-realty-owner-operator-package` | 2026-08-27 | 16 files, +1139 | operator plugin copy |
| `codex/com-canonical-production` / `-release` / `canonical-production-proof` | 2026-09-01 | 17 files, +328 | canonical identity checks; two stashes belong here |
| `codex/fix-worker-module-import` (on origin) | 2026-08-27 | 2 files | tiny; merge or drop |
| `codex/remove-legacy-public-origin-secret` (on origin) | 2026-08-27 | 5 files | PR #139 was closed; delete |
| `codex/makler-realty-cloudflare-cutover` | 2026-09-01 | 0 commits, 15 dirty files in `~/.codex/worktrees/7e0d` | uncommitted cutover changes to `wrangler.jsonc`, `public-origin.mjs`, `health-check.yml` |
| `codex/ms-realty-product-spec` | 2026-08-30 | 18 files, docs + screenshots | product spec and atlas diagrams; land under `docs/` or archive |
| `claude/admin-panel-redesign-56f213` | 2026-09-01 | 3 files | operator rail flattening |
| `claude/ms-realty-redesign-finish-3f309b` | 2026-09-03 | 12 files, +327 | price-range search fix; check whether #190 already has it |

Worktrees: 27 (`git worktree list`), including two detached `~/.codex`
worktrees at `4258e1ba` with nothing in them. Stashes: 9, dated 2026-07-31 to
2026-09-01, on branches that are mostly merged. Untracked in the main
checkout: `HANDOFF-astra-2026-09-04.md`, `components-first-pass.png`.

The canvas under `.claude/handoff-admin-redesign/canvas/` is tracked on `main`
(151 files) although `.claude/` is in `.git/info/exclude`; two Claude
worktrees show 85 modified canvas files each. Decide once whether the canvas
lives in git or only in the published artifact, then make every checkout agree.

### 2.8 Documents that disagree with reality

- `SOURCE_OF_TRUTH.md`: "Last updated 2026-08-09"; still describes 292
  unresolved legacy URLs (the gate says 0 of 457).
- `production/REMEDIATION_REPORT_RU.md` is dated 30 July 2026.
- `.claude/handoff-admin-redesign/PROMPT.md` points the next agent at the
  `admin-panel-redesign-56f213` worktree, which is now the #197 branch.
- `translation-coverage-report.json`, `locale-rollout-report.json`,
  `hermes-draft-dispatch.json` carry `generated_at: 2026-07-05`.

### 2.9 Security and repository settings

- Repository visibility is **public**. Earlier notes describe it as private.
- No branch protection on `main`; auto-merge relies on the workflow alone.
- Dependabot alerts disabled.
- `npm audit --omit=dev`: 6 moderate, all Payload 3.87.1 (`≤ 3.88.0`),
  `@payloadcms/next` reports no fix in the current range.
- GitHub secrets present: `CLOUDFLARE_API_TOKEN`,
  `MS_REALTY_BOOTSTRAP_ADMIN_CREDENTIALS`, `MS_REALTY_DEPLOY_KNOWN_HOSTS`,
  `MS_REALTY_DEPLOY_SSH_PRIVATE_KEY`, `MS_REALTY_ORIGIN_TOKEN`,
  `MS_REALTY_PRODUCTION_ENV_FILE`, `MS_REALTY_RECOVERY_SIGNING_PRIVATE_KEY`.
  Variables: `MS_REALTY_DEPLOY_HOST=157.230.109.185`,
  `MS_REALTY_PUBLIC_CONSTRUCTION_HOLD=false`.

---

## 3. The plan, in the order that does not waste work

Each phase ends with a gate you can check. Do not start the next phase while
the gate is red.

### Phase 0 — Stop the bleeding (same day)

1. Decide with the owner whether the public site should stay open on the old
   build (`db7cd103`) or go back under the construction hold until Phase 2
   is done. Today it is open, on the old design, with `/api/ready` at 503 and
   a 13 s cold render. Never flip `MS_REALTY_PUBLIC_CONSTRUCTION_HOLD` without
   that decision.
2. Merge #197 so the hold can be released and restored without unrouting.
3. Merge #178 so a rollback does not lose the R2 report.
4. Fix `makler-realty.ru/robots.txt` pointing at the `workers.dev` sitemap
   (the holding Worker's response), even if `.ru` stays on hold.

Gate: `/api/health` blockers on the live host do not include
`r2_media_coverage` after a deliberate rollback drill.

### Phase 1 — Repository hygiene

1. Close #184 and #194; delete their branches.
2. Triage the "no PR" table in 2.7 with the owner: keep → rebase onto `main`
   and open a PR; drop → delete branch and worktree.
3. Commit or discard the 15 dirty files in `~/.codex/worktrees/7e0d` and the
   5 in `hermes-owner-os-operations-ui`.
4. Delete every merged local branch, every stale worktree
   (`git worktree remove`, then `git worktree prune`), and every stash after
   reading it once (`git stash show -p stash@{n}`).
5. Decide where the canvas lives; make `.git/info/exclude`, the tracked files,
   and the two dirty worktrees agree.
6. Move `HANDOFF-astra-2026-09-04.md` out of the checkout or into `docs/`.

Gate: `git worktree list` shows one entry; `git stash list` is empty;
`git branch -r` shows `origin/main` plus only branches with an open PR.

### Phase 2 — A release that stays up

1. Origin performance: profile the cold render on the deploy host
   (`157.230.109.185`). Targets in 1.3. Suspects: Payload/Postgres cold
   connections, uncached search projection, Next cold start after
   `docker compose` restarts. Add a warm-up step to the deploy script and an
   edge cache rule for anonymous HTML if the render cannot be made fast.
2. Make the journey probe and canonical-site probe pass against `workers.dev`
   before touching `.com`.
3. Hermes evidence: run the source-review task per `DEPLOYMENT.md` (human
   confirms `--confirm-task`), verify the report is on `/runtime-evidence`, and
   put the seven-day renewal on the owner's calendar or automate it with an
   explicit human step.
4. `payload_runtime`: run `npm run payload:runtime` on the host, import the
   redacted report, `npm run payload:preflight`.
5. `production_recovery`: backup, isolated restore, `recovery:r2:approve`,
   import the signed report; set the public key where the gate reads it.
6. `monitoring_rollback`: make the daily drill pass; find why `health must
   report expected build marker` fails (Worker version vs origin marker after
   the isolated rollback). Then close the nine receipt issues.
7. Release `main` (now with #178, #197) and watch it verify. Repeat twice.

Gate: `/api/ready` → 200, `launch_ready: true`, live `build_marker` equals
`origin/main`, three consecutive green releases, seven green health checks.

### Phase 3 — Catalogue truth

1. Rebase #182 on `main`; follow the two-pass minter order exactly; run
   `npm run validate` twice; update `APPROVED_LAUNCH_FREEZE_SHA256` and
   `based_on_freeze_sha256` together. When the change forces a
   `launch-readiness.json` rebuild off the deploy host, extract the embedded
   R2 record from `gates[r2_media_coverage].evidence.report` to
   `production/data/r2-media-coverage-report.json` (gitignored) and run
   `MS_REALTY_R2_MEDIA_COVERAGE_REPORT_PATH=production/data/r2-media-coverage-report.json npm run launch:readiness`,
   saying in the commit that the R2 record was carried forward, not re-measured.
2. Land it; verify live that every crawl-era listing path `301`s once and
   every twin answers `200` noindex.
3. Clear or decide each listing-quality warning.

Gate: sitemap lists 127 lot-number listing URLs; a sample of 20 crawl-era
paths and 10 of each legacy decision class behave as approved, checked live.

### Phase 4 — Public site complete

1. Translations: for each of the six non-BG locales, either approve human
   translations for all published listings and CMS pages through
   `/admin/translations`, or ship an honest fallback. Regenerate the coverage
   report; it must not be dated 2026-07-05.
2. Enquiry flows end to end on production, one per intent, with receipts and
   lead-inbox visibility.
3. Accessibility and performance passes (targets in 1.3); fix, re-measure.
4. `.ru` decision implemented (serve or redirect); Search Console and Yandex
   verification and sitemap submission for whatever hosts are canonical.
5. SEO evidence gate inputs (`npm run seo:preflight`) satisfied with real
   Search Console / Yandex data.

Gate: the full canonical-site probe (`probe-canonical-site.mjs`) passes 37/37
on `.com`; Lighthouse and axe reports are committed under `production/data/`
or attached to the release.

### Phase 5 — Admin complete

1. Land or close #173 and the Codex UI streams (2.7) so the backend surface is
   fixed.
2. Work the 349-item capability inventory object by object (start with
   Listing and Media, the two the agency touches daily). For each operation:
   UI exists, is tested through the real whitelist, and is in the Paper file.
3. Paper parity review with the owner per page; update the Coverage index
   board in Paper as each area closes.
4. Mobile pass at 390 px on every admin route.

Gate: inventory rerun reports 0 missing; owner signs off the Coverage index
with every area "Saved".

### Phase 6 — Documents and settings

1. Rewrite `SOURCE_OF_TRUTH.md` sections that disagree with the gate report
   and the live site; date it.
2. Archive or delete `REMEDIATION_REPORT_RU.md`, the Astra handoff, and
   `PROMPT.md`; replace with one current handoff.
3. Branch protection on `main`, Dependabot on, repository visibility per the
   owner, Payload upgraded past 3.88.0 (run the full check; the publication
   sync and access policies are the risk area).
4. Regenerate every `generated_at: 2026-07-05` report or delete the report.

Gate: every checklist line in section 1 is true; a fresh agent can read only
`AGENTS.md`, `DEPLOYMENT.md`, and this file and reach the same conclusions.

---

## 4. Rules that already cost a day each

- **Identity.** Pushing and `gh` need the `ms-realty` account:
  `GH_TOKEN=$(gh auth token -u ms-realty)` for `gh`; for git, fetch/push with
  `-c http.extraheader="AUTHORIZATION: basic $(printf 'x-access-token:%s' "$T" | base64)"`.
  The default keychain identity gets 403 or a bare 404.
- **Check env split.** `PAYLOAD_SECRET` and `DATABASE_URL` belong only to
  `next:build` and `next:smoke`. Exporting them for `npm test` fakes 32
  failures. Run the check in two parts.
- **Validate rewrites tracked files.** `npm run validate` regenerates
  `production/data/{admin-fixtures,http-smoke,node-server-smoke,public-fixtures,runtime-smoke}.json`;
  commit them only when the change is the point. `design:build` writes a new
  hashed logo pair into `public/vendor/`; prune the old ones.
- **Two-pass minter.** Never run `search/build_search_indexes.py` between the id
  flip and `migration/rename_listing_ids.mjs`. Order is at the top of that file.
- **Whitelists are contracts.** A new audit action must be in `ADMIN_ACTIONS`
  (`production/lib/audit-log.mjs`) or the deploy dies after a green unit test.
  Same for launch gate ids and search projection kinds.
- **Squash merges.** "Is it merged?" is `git diff origin/main..branch`, never
  `merge-base --is-ancestor`. A follow-up branch cut before its parent was
  squashed conflicts everywhere; recreate it from `main`.
- **Auto-merge is real.** A green PR merges and deploys without a human. Keep
  PRs draft until they may go live.
- **The hold variable is a launch decision.** Clearing it also re-asserts the
  sixteen `makler-realty.com` routes.
- **Rollback loses per-release evidence** (R2 coverage) until #178 lands.
- **Hermes evidence needs a human** (`--confirm-task`). Do not fabricate a
  worker report from CI.
- **Container disk is ephemeral.** Nothing durable may live on it.
- **Tests are markup contracts.** A redesign rewrites the affected tests on
  purpose; it does not work around them.
- **Parallel agents.** Two other Claude Code sessions are running on this
  machine right now; Codex has 42 uncommitted files in
  `.codex/worktrees/production-completion-20260906`. Fetch `origin/main` before
  every plan and read the other worktree's diff before touching the same
  files (`client.mjs`, `react-admin-site.mjs`, `react-public-site.mjs`,
  `adapter-public-*.css`, `http.mjs`, `app-api-adapter.mjs`).

---

## 5. Actions only the owner can take

The agent prepares each of these to the last step and hands over the exact
command or click; it does not perform them.

1. Cloudflare dashboard changes (the local `wrangler` login is the wrong
   account; deploys go only through CI's token).
2. DNS and the `.ru` cutover decision.
3. Confirming the Hermes source-review task (`--confirm-task`).
4. Creating admin accounts and entering passwords (`/admin/team`).
5. Search Console and Yandex Webmaster ownership.
6. Approving public translations and listing facts.
7. Signing the recovery report (private key holder).
8. Repository visibility, branch protection, Dependabot (needs admin scope
   the local tokens do not have).
9. Deciding keep-or-drop for each unmerged Codex stream and for PR #173.
10. Clearing or setting `MS_REALTY_PUBLIC_CONSTRUCTION_HOLD`.

---

## 6. Re-audit script

Run this before claiming any phase is done.

```bash
T=$(gh auth token -u ms-realty)
git -c http.extraheader="AUTHORIZATION: basic $(printf 'x-access-token:%s' "$T" | base64)" fetch origin --prune
git branch -r | grep -v main                      # want: only branches with open PRs
GH_TOKEN=$T gh pr list --state open               # want: empty at the end
GH_TOKEN=$T gh issue list --state open            # want: empty at the end
git worktree list; git stash list                 # want: one worktree, no stash
curl -s https://makler-realty.com/api/health | jq '{build_marker,origin_build_marker,launch_ready,blockers}'
git rev-parse origin/main                         # must equal build_marker
curl -s -o /dev/null -w 'cold ttfb %{time_starttransfer}\n' "https://makler-realty.com/bg?nocache=$RANDOM"
GH_TOKEN=$T gh run list --workflow health-check.yml --limit 7 --json conclusion --jq '[.[].conclusion]'
GH_TOKEN=$T gh run list --workflow monitoring-drill.yml --limit 7 --json conclusion --jq '[.[].conclusion]'
node production/scripts/probe-canonical-site.mjs   # want: 37/37 on makler-realty.com
```

---

## 7. Execution log

### 2026-09-07, first pass (agent, auto mode)

Done:
- Closed #184 (contained in #190) and deleted its remote branch.
- Deleted remote branches `codex/remove-legacy-public-origin-secret` (closed
  PR #139) and `codex/ms-realty-owner-operator-release` (merged #128).
- Deleted six merged local `claude/*` branches.
- Rebased #178 onto main (26 tests pass), published as
  `claude/pr178-rebased-on-main`.
- Rebased #177 onto main clean, published as `claude/pr177-rebased-on-main`.
- Merged main into #182, resolved eight conflicts plus a duplicate
  `searchPath`, restored the editor heading, rekeyed nine tests; validate ×2,
  2007 tests, Next build and smoke all green; published as
  `claude/pr182-merged-main`.
- Corrected the stale legacy-route paragraph in `SOURCE_OF_TRUTH.md`.
- Found that #194 is not redundant (Email Workers commit) and that the origin
  already passes `payload_runtime`, `monitoring_rollback`, `production_recovery`
  at runtime: live blockers are only `live_services` and the rollback-induced
  `r2_media_coverage`.

Blocked for the agent (classifier or credentials), handed to the owner in
`OWNER_RUNBOOK_2026-09-07.md`: SSH to the origin host, the Hermes
source-review task, force-pushes over PR branches, undrafting PRs, PR edits,
bulk branch/worktree/stash deletion, repository settings, Cloudflare and DNS.

### 2026-09-08, second pass

Owner actions completed: the Hermes source-review task was opened on the
origin from the `4e336a9b` release image (report at
`/runtime-evidence/hermes-draft-worker-report.json`, attempted 1, persisted 1);
#178 and #197 were undrafted and merged; #177 and #173 were closed; #194 was
retitled to its remaining Email Workers change; #182 was force-updated to the
merged-and-green tree (`claude/pr182-merged-main`) and returned to draft until a
release is live.

Releases, in order:
- `fa83ae1f` (#178): rolled back at Hermes evidence, captured eight minutes
  before the report existed.
- `4576bf3d` (#197): Hermes evidence accepted; rolled back at
  `r2_media_coverage` because the origin reads the evidence volume, which still
  held the `db7cd103` report. The deploy also rewrote the Worker routes to the
  sixteen declared patterns and dropped the two zone wildcards, so every
  unprefixed canonical path (sitemap, admin, media, legacy URLs) answered a
  cPanel suspended page.
- `d9f7538d` (#200, wildcards declared + exact-release R2 adoption): Worker
  verified with `launch_ready: true` and no blockers for the first time. Rolled
  back only because the canonical journey probe ran once, seconds before the
  zone routes converged. The wildcards stayed: `/sitemap.xml` and `/admin/login`
  answer 200 on the canonical domain again.
- #202 gives the two canonical probes a convergence window; #201 lands the
  task-queue wording fix. Their releases are the next candidates to go live.

Screen audit: 264 local renders (25 admin routes × bg/ru/en × 1440 light, 1440
dark, 390 light, plus ten public routes) with no overflow, no page errors and
no raw `undefined`/`NaN` text. One systematic defect found and fixed in #201:
the task queue named rows by ledger id. `/admin/team` answers 403 to the smoke
bearer by design; `/bg/start` is not a route in this build.

Paper: the file's semantic tokens (`--canvas`, `--surface`, `--sunken`,
`--border`, `--text-*`, `--accent`, `--field`, `--sb-*`, `--r-edge`,
`--r-panel`) and the `--dark-*` set now alias the Atlas values shipped by
`adapter-admin-workspace.css` and `adapter-public-z-atlas.css`. Foundations
light and dark carry the Atlas palette, re-measured contrast (13 pairs each,
all pass), Atlas radii and the 216px rail; Components and Interaction inherit
the flip. The Coverage index row for Foundations records this. Still open on
that page: a pass over Components and Interaction control radii and copy.
