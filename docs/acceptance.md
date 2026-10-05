# MS Realty acceptance record

**Verdict: OPEN.** No complete released product or final joint acceptance is evidenced. A green source check, design frame, local browser run, or protected staging page does not close a released journey.

This is the single status and ownership index for the MS Realty completion goal. It points to the normative requirements rather than copying them. MSR-CODEX owns updates to this record. MSR-CLAUDE acknowledged its full scope at revision `5525ced8`; later factual amendments remain available for review. The existing `CODEX-UI-COORDINATION.md` in the Mindburn-Labs MS Realty output folder is the message relay and detailed screen wiring matrix, not a second acceptance verdict.

## Scope and authority

- Product: public site, client workspace, staff workspace, their jobs and provider paths, on the three separate hosts; both legacy domains and all reviewed legacy content, URLs and media; seven public/client locales with Hebrew RTL and three staff locales.
- Complete inventory: `docs/architecture.md` AT01–AT68 and R00–R12; `docs/ux-spec.md` UX01–UX24; Figma journey map W01–W14 and `design/zero-learning/GATE.md` G1–G4. The screen route and server gap matrix is in the existing coordination log. Every ID remains in scope unless Ivan explicitly changes the commitment.
- Ivan names OpenAI, Anthropic and Linear as quality benchmarks for the experience, architecture and operations. Apply that comparison to first value, task clarity, reliable state, accessibility and maintainability in actual journey reviews; no benchmark verdict is accepted from aspiration alone. Extend the existing G4 comparison with reviewed public evidence and actual MS Realty behavior before declaring parity.
- The current launch authority is `production/data/launch-readiness.json` with `production/data/launch-input-checklist.md`. Their blocked gates stay blocked. The successor R00 decision must reconcile those legacy Payload/search obligations with the current rebuild. The partial staging route manifest has `productionAllowed: false`.
- Search Console, Yandex Webmaster and backlink exports are optional historical analytics under `AGENTS.md`; their absence never blocks readiness. Exact crawl parity and reviewed SEO behavior still do.
- The reported owner sequence is final Figma, then accepted code, then protected staging. Staging infrastructure preparation may proceed without claiming a shipped journey. This reported sequence needs acknowledgement in the controller exchange before any conflicting reordering.

## Evidence rule

An item is **accepted** only when its behavior is checked on the exact released source, image, configuration and policy, with a traceable destination and required human review. Record the source and deployed identifiers, environment, test or observation, reviewer, and remaining limits. `source`, `local`, `CI`, `staging`, `released`, and `human accepted` are distinct states. Unknown or unobserved means open. A blocked dependency cannot be converted into a waiver or hidden behind a feature flag while claiming the full release complete.

## Current source and delivery boundary

| Surface | Checked revision or state | Consequence |
| --- | --- | --- |
| Remote default branch | `5651039c7d3fe8a47fd43b7822c8cc9659b3a105` | Foundation is merged; the main checkout also has local, unrelated changes and is not the integration checkout. |
| Draft PR #280 | `1057ae48e0eff0cab40863d6eb7b6f7ba78f5e8e` | The selected rebuild, acceptance docs, design merge, dependency updates and C-06 appointment slice are integrated here. Earlier integrated runs failed at `npm ci` because the lock omitted Sharp optional dependencies; this head repairs the lock and its exact-head CI is running. It is not a complete UI or released product. |
| Preserved delivery ancestor | `4200c93f1d85df85caa19796905751695e13d0bf` | Preserved as an ancestor of #280; use it as the reviewed base for bounded server ports. |
| PR #293 | `eb54f3c1eb23789157ec8e59cb9e4073d8953077` | Merged into the #280 lineage; its design/copy result still needs complete journey and release acceptance. |
| C-03 receipt contract | `e082917a384803fcb17d08ae02fd927fcdb74962` | Claude accepted the tri-state contract and integrated the two UI fixture repairs at local candidate `5ec491a4`; remote #280 and P12 UI remain pending. A reported immediate-receipt concern is answered by the existing post-transaction publication read and database test. |
| C-06 server recovery | `f855dc2bc369251886d0e5fbc49344e2dfb45b22` | Separate Codex branch. Appointment context was reviewed and integrated into #280; Claude accepted the scoped file receipt and privacy paging at `b957e1ce`/`4bc4f268` and integrated them locally. Private viewing preference intake at `f855dc2b` awaits review and UI binding. |
| Released candidate | None established for the rebuild | No R11 or R12 acceptance can be claimed. |

No production transition is authorized by this record. Source and local checks may continue while operator and human inputs are gathered.

### Preserved source reconciliation

| Lineage | Current finding | Remaining decision |
| --- | --- | --- |
| Preserved delivery lineage | The unique non-design commits `1fb7cbc3` (isolated staging R2 and honest upload state), `233a53c1` (saved listing names/source locale in inquiry receipt DTOs), and `5ea6b7d9` (monitoring drill receipt issue closure) are now reachable through `4200c93f` on #280. | Their presence is source integration evidence only. Qualify the protected staging and receipt behavior on the eventual exact candidate; the partial staging profile remains unverified. |
| Closed PR #275 | The current-schema `src/server/work/` port covers staff Today/Inbox, contact reads, inquiry acceptance/triage, human contact observations and task outcomes. Case creation, email and handover have current services. The old direct assign/multichannel-send implementation is superseded by receiver acceptance and reviewed email/manual channel contracts in F12 and F18–F19. | W03 still lacks a receiver decline and receiver-owned review time. Check full journey and real provider outcomes before retiring the branch. |
| Closed PR #277 | Its deterministic interpretation is adapted in `src/server/ai/intent.ts` with native reviewed search chips and tests. The old optional model assistance is outside the current launch contract and remains disabled pending a separate evaluation. | Verify discovery on the release candidate, then retire the branch only after peer review confirms no unique required behavior. |
| P12 receipt | `e082917a` extends the saved identity with a canonical source URL or null and a tri-state current publication check; its PostgreSQL inquiry tests passed 23/23. Claude accepted the contract and repaired the two synthetic UI fixtures in local candidate `5ec491a4`, whose typecheck passed. | Push and qualify the exact integrated head, bind the visible saved-name, source and honest unknown/withdrawn presentation, then verify the real browser flow. |

Seven Dependabot PRs remain open against `main`. Claude folded #267, #287 and #268–#271 into #280 after local review and added an ignore for the unsuitable Node 26 types proposed by #288. The exact #280 head still needs green CI, including its container smoke. The integration owner must close or reconcile each superseded PR with its reason before a default-branch merge; the `workflow_run` auto-merge path makes non-draft stale PRs consequential. Sharp 0.35.5 does not by itself establish a fix for the measured OpenNext `createRequire` startup failure; the selected Containers image has a separate qualification path.

Other branches with work absent from the #280 lineage remain protected. The client-recovery head `6c8dc2bc` has 24 unique commits by patch comparison, including inquiry-source recovery, saved-search/alert presentation, viewing preferences and private-work recovery; its frontend predecessor `733d804e` is an ancestor. The sibling public-workflows head `72bed8b8` has 13 unique commits with overlapping intent. Appointment listing context has been ported and reviewed; viewing preference server intake is ported on the C-06 branch, while its UI mapping and inquiry-listing presentation still need integration. Claude's paused locale head `d16d728e` has four unique commits and 47 changed files. The zero-loss launch head `f1a2473b` retains two unique staging/provider-qualification commits whose behavior needs comparison with the later #280 implementation. The Hermes updater head `e080223b` changes the old provider pin and needs an R00 applicability decision. The local `main` checkout has two commits absent from remote `main` plus unrelated local changes; it is left untouched. Commit counts indicate review work, not a claim that every commit should merge verbatim.

The `client-recovery` inquiry intake diff has a specific integration conflict: it adds viewing preferences and replay-safe future-time validation, but removes the saved listing identity and source-locale fields projected by `233a53c1` into `InquiryReceipt`. C-06 combines the valid server preference contract on its own branch and still needs integrated receipt and browser checks. A wholesale branch merge would also delete Butler authorization/verdicts, protected legacy-parity modules and staging file safeguards, and would drop inquiry contact evidence and database transport options. Both preserved client/public branches have no changed subscription server implementation; their unique alert work is UI presentation under U-03. Their README-only rename from Butler to Hermes is not the selected rebuild contract. Preserve the old branches until every required UI patch is reviewed or exactly superseded.

C-05 branch comparison: `bf99c03c` changes CI and database tests from PostgreSQL 18 to 16.14; the current delivery source already pins 16.14 and additionally qualifies the container image, so that patch's behavior is present through later edits. `d230086a` introduced the guarded staging workflow, gateway and preflight scripts; the current source contains later revisions with private connectivity, isolation and upload-state checks, and its local staging contracts pass. This is source supersession evidence, not a staging execution receipt. `e080223b` updates a pinned Hermes Agent image in the retired local-compose/provider files; those files and package commands are absent from the selected rebuild, while the launch checklist still instructs operators to run them. Keep the branch preserved until R00 decides the active Hermes worker obligation and the checklist is corrected.

Focused local checks on this preserved branch: intent and inquiry-form tests passed (167); staging/runtime/files tests passed (13) and the staging contract script passed (20). Inquiry intake, file workflow, work commands and handover passed on disposable PostgreSQL 16.14 (45 passed; the real ClamAV case was skipped because no scanner endpoint was provided). These checks do not verify a deployed journey or a live provider.

## Complete acceptance coverage

All groups below are **OPEN** at the released-product level. The ranges partition every AT and UX requirement exactly once; the detailed pass condition remains in its source specification. Local implementation evidence in `docs/delivery/` is useful for choosing the next check, not final acceptance.

| Requirements | Outcome to verify | Primary review |
| --- | --- | --- |
| AT01–AT14; UX01–UX06 | Public discovery, saved/compare/share, inquiry and accountable first response | Codex behavior; Claude experience |
| AT15–AT17; UX10–UX11 | Case continuity, audience grants, retained work and handover | Codex behavior; Claude experience |
| AT18–AT28; UX07–UX08, UX19–UX20 | Seller instruction, exact facts, media, locale review, publication and correction | Codex behavior; Claude experience |
| AT29–AT35; UX12–UX13, UX17 | Viewing, resources, proposal and completion without false confirmation | Codex behavior; Claude experience |
| AT36–AT43; UX09, UX14–UX15, UX18 | Identity, private access, upload and revocation | Codex behavior; Claude experience |
| AT44–AT49; UX16 | Consent, privacy and real communication outcomes | Codex behavior; Claude experience |
| AT50–AT54; UX21 | Durable work and draft-only Butler with a manual path | Codex behavior; Claude experience |
| AT55–AT59; UX22–UX23 | Import, duplicate recovery, legacy parity and restored safety | Codex behavior; Claude experience |
| AT60–AT68; UX24 | Packaging, performance, alerts, recovery, cutover and operating acceptance | Joint release review |

Every W01–W14 journey is open. W01–W03 cover public discovery and inquiry ownership; W04–W06 private access, buyer work and viewings; W07–W08 seller instruction and publication; W09–W10 assistance and documents; W11–W12 correction and import; W13–W14 bounded services and release judgment. Each journey needs the accepted Figma contract, working code and G1–G4 result on its exact preview, then deployed verification of success, denial, validation, empty, loading, error and uncertain-result recovery where relevant. Counts of frames or prototype reactions are coverage evidence only.

## Release gates and highest blockers

| Gate | State | Required next proof |
| --- | --- | --- |
| R00 | BLOCKED | Reconcile legacy launch files with the rebuild, selected hosting/database/search contract, owner policy and final scope. |
| R01–R06 | OPEN | Exact-head behavior and authority checks; real identity, communication and assistance provider paths; manual fallback. |
| R07 | BLOCKED | Complete reviewed two-domain URL/content/listing/media map and fresh delta, with independent zero-loss parity. The pinned partial staging manifest has 1,108 unique routes and 243 explicit exclusions, `completeCurrentDelta: false`, `productionAllowed: false`; local legacy verification passes 54/54 checks but cannot clear parity. |
| R08 | BLOCKED | Full load budgets, live alerts, isolated restore, independent safety replay and rollback proof. The latest recorded full local load missed its unchanged latency budgets. |
| R09 | BLOCKED | Accepted W01–W14 interactions, seven-locale public/client copy and RTL, accessibility, rendered design parity and measured performance. |
| R10 | BLOCKED | One immutable candidate with all earlier gates and named operator sign-off. The staging workflow exists only on the delivery branch, so GitHub Actions has no registered default-branch staging workflow or rollout receipt for this candidate. |
| R11–R12 | NOT STARTED | Actual cutover verification, then a staffed operating cycle and joint handoff on the same released revision. |

### R00 decisions that remain open

| Subject | Current evidence | Required resolution |
| --- | --- | --- |
| Runtime and active documents | ADR 0004 selects Cloudflare Containers and PostgreSQL 16.14 for staging after the OpenNext media blocker. Claude reviewed and integrated the architecture/plan/ADR correction. Claude's U-02 UX-spec correction at `ab6b37ed` was accepted by Codex and merged locally as `f8a25133`, but the affected Figma frames and exact remote integration remain unverified. | Finish the Figma identity/map/runtime contract, qualify the actual image and approve the release policy. |
| Search and legacy launch gates | The legacy launch JSON and checklist both say blocked and disagree about media coverage. The rebuild uses PostgreSQL search, while the supplied `AGENTS.md` still requires live Typesense/Meilisearch reports. | Keep the external-report requirement open until Ivan explicitly amends it, or produce genuine reports from the required live services; regenerate a coherent policy/evidence verdict. |
| Identity, queue and assistance | The legacy gate asks for Payload runtime and Hermes worker proof. The rebuild uses first-party identity, Drizzle/pg-boss and bounded Butler tasks; ADR 0002/0003 record the design changes. The active launch checklist still names `PAYLOAD_SECRET`, a Neon target, the removed local Hermes compose profile and package commands. | Map each old obligation to real replacement evidence with accountable approval; repair the launch checklist only after policy acceptance and obtain actual provider/worker proof. A renamed component is not a passing report. |
| Legacy inventory and recovery | The earlier 410 route approvals have been revoked for zero-loss parity. The partial route/media profile cannot pass R07. Source-as-is publication approval does not equal factual, media, locale or availability review. Monitoring and production recovery reports remain absent. | Reconcile both legacy domains and all in-scope rows/media, obtain independent parity and human reviews, then prove monitoring and isolated recovery on one candidate. |

## Owned next outcomes

The priority is the shortest path to an honest released verdict. First, settle R00 policy and the accepted Figma/source contract while keeping #280 draft; in parallel, finish bounded backend and UI ports with reciprocal reviews. Next, verify every W01–W14 journey, locale and provider path on one protected candidate, together with independent two-domain parity and recovery evidence. Then obtain operator sign-off, release that same candidate, verify the staffed operating cycle, and retire only branches or files whose unique required work is integrated or explicitly superseded. A locally green slice never advances a released gate by itself.

| ID | Owner and reserved surface | Finish condition |
| --- | --- | --- |
| C-01 | MSR-CODEX: this record, requirements and decisions | Claude acknowledges the same scope revision; every open gate and valid commitment has an owner and evidence boundary. |
| C-02 | MSR-CODEX: source/PR reconciliation only; no Figma, JSX or approved copy | Preserve and classify the local delivery commits and the unique #275/#277 work. Integrate each valid change or record exact supersession evidence; verify the resulting source and obtain Claude review before consequential integration. |
| C-03 | MSR-CODEX: backend/server receipt and W03 seams | Claude accepted `e082917a` and integrated the two UI fixture updates locally. Codex verifies the exact remote integrated head and rendered P12. W03 receiver decision and real outcome remain open. |
| C-04 | MSR-CODEX: R00 policy map and active architecture/plan docs | Remove provider/runtime drift under the existing owner decision; preserve blocked launch obligations, obtain Claude review and the accountable operator's policy acceptance before a new release verdict. |
| U-01 | MSR-CLAUDE, requested: Figma W03 and its UI/copy contract, then exact review of C-02 | Return saved node/version references, explicit receiver accept/decline and review-time states, P12 saved-name/withdrawn-listing presentation, G1–G4 evidence and bounded defects. No complete-journey pass from a design frame alone. |
| U-02 | MSR-CLAUDE, requested after U-01: `docs/ux-spec.md` identity/map/runtime contract and affected Figma frames | Replace stale WorkOS/TOTP, Payload and MapTiler journey assumptions with the accepted first-party passkey, pg-boss and Protomaps contracts; keep denial/recovery states and return changed node/version references for Codex review. |
| U-03 | MSR-CLAUDE, queued: JSX/copy/catalog/test ownership in client-recovery/public-workflows and paused locale branches | Compare the preserved heads with accepted Figma and current source, port valid P10–P14/inquiry/privacy presentation and seven-locale behavior, record exact supersession for discarded patches, then send the integrated revision for Codex review. Do not take the server modules reserved to C-06. |
| C-05 | MSR-CODEX: zero-loss launch and legacy Hermes updater branches | Compare their unique provider/operational behavior with the selected candidate and R00; preserve or integrate valid work before any branch retirement, with Claude review of consequential integration. |
| C-06 | MSR-CODEX: server/transport modules from client-recovery and public-workflows, under acknowledged file boundaries | `8a58cd61` appointment context was reviewed and integrated; Claude accepted `b957e1ce` scoped file receipt and `4bc4f268` privacy paging. Claude reviews `f855dc2b` viewing preference intake; U-03 binds displayed targets, queue cursors and preference fields. Codex binds the server-action path after UI values land, classifies remaining transport, and both verify the integrated flows. |
| O-01 | Integration/release owner to acknowledge; operator resources and staging | Bind the accepted source to one image digest, private database/R2/Access/scanner/email proof and independent checker before protected rollout. The current partial staging profile may only be called a partial preview. |

The controllers exchanged `ACK MSR-HELLO-1` and `RELEASE #280` in the relay. MSR-CLAUDE now owns integration and release of #280/#293 from the preserved `4200c93f` local delivery head. MSR-CODEX retains this acceptance record and separate server/operational branches for review; neither controller may infer deployment readiness from the handover.

## Reconciliation and final sign-off

- GitHub currently has draft #280, merged #293 and seven dependency update PRs. #275 and #277 are closed but their unique modules require a port-or-supersede decision. The preserved delivery lineage is reachable through #280; other branches with unique work remain protected. No branch or worktree with unique work is discarded for cosmetic cleanup.
- GitHub has no open issues; the completed Linear Wayfinder project is a historical map, not proof that this rebuild is complete. New valid defects remain open in this record until fixed and released. Close only with an outcome and evidence, and reconcile tracker items as they arise.
- Final acceptance requires no valid unfinished issue, open project PR, unmerged required change, unnecessary development branch, abandoned worktree, or obsolete active code/docs/assets/config. Preserve canonical branches, required history and recovery paths.

| Sign-off | Scope revision | Released source/image/config | Result |
| --- | --- | --- | --- |
| MSR-CODEX | This record; peer scope ACK at `5525ced8`, later amendments pending review | Not established | OPEN |
| MSR-CLAUDE | Scope ACK at `5525ced8`; #280/#293 integration and release ownership accepted | Not established | OPEN |
| Ivan / required operators | R00 and later release approvals pending | Not established | OPEN |
