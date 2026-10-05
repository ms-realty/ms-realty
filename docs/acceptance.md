# MS Realty acceptance record

**Verdict: OPEN.** No complete released product or final joint acceptance is evidenced. A green source check, design frame, local browser run, or protected staging page does not close a released journey.

This is the single status and ownership index for the MS Realty completion goal. It points to the normative requirements rather than copying them. MSR-CODEX owns updates to this record. MSR-CLAUDE's ownership and review acknowledgement is **pending**. The existing `CODEX-UI-COORDINATION.md` in the Mindburn-Labs MS Realty output folder is the message relay and detailed screen wiring matrix, not a second acceptance verdict.

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
| Draft PR #280 | `f399038355e0242bd7ad313612557e61448bd740` | CI passed on this head; it is not the complete UI or a released product. |
| Preserved local delivery lineage | `4200c93f1d85df85caa19796905751695e13d0bf` | Fourteen commits beyond the remote #280 head remain unintegrated; preserve and review their unique work. |
| Draft PR #293 | `eb54f3c1eb23789157ec8e59cb9e4073d8953077` stacked on #280 | Claude design/copy work is pending integration and its own exact-head check. |
| Released candidate | None established for the rebuild | No R11 or R12 acceptance can be claimed. |

No production transition is authorized by this record. Source and local checks may continue while operator and human inputs are gathered.

### Preserved source reconciliation

| Lineage | Current finding | Remaining decision |
| --- | --- | --- |
| Local delivery branch beyond #280 | The unique non-design commits are `1fb7cbc3` (isolated staging R2 and honest upload state), `233a53c1` (saved listing names/source locale in inquiry receipt DTOs), and `5ea6b7d9` (monitoring drill receipt issue closure). `4200c93f` merges the Claude design/copy commits into that lineage. All remain in this preserved branch, outside the remote #280 head. | Review each against the final source, obtain Claude's exact-revision review and integrate. The partial staging profile remains unverified. |
| Closed PR #275 | The current-schema `src/server/work/` port covers staff Today/Inbox, contact reads, inquiry acceptance/triage, human contact observations and task outcomes. Case creation, email and handover have current services. The old direct assign/multichannel-send implementation is superseded by receiver acceptance and reviewed email/manual channel contracts in F12 and F18–F19. | W03 still lacks a receiver decline and receiver-owned review time. Check full journey and real provider outcomes before retiring the branch. |
| Closed PR #277 | Its deterministic interpretation is adapted in `src/server/ai/intent.ts` with native reviewed search chips and tests. The old optional model assistance is outside the current launch contract and remains disabled pending a separate evaluation. | Verify discovery on the release candidate, then retire the branch only after peer review confirms no unique required behavior. |
| P12 receipt | `233a53c1` persists and projects the selected listing identity and source locale, including a receipt after withdrawal. The visible `inquiryReceiptView` still renders references alone. | Claude owns the visible saved-name and unavailable-listing presentation; Codex checks the backend contract on a real database and reviews the rendered result. |

Seven Dependabot PRs remain open against `main`; each currently has green isolated CI, which does not qualify the integrated candidate. #287 groups seven patch/minor packages including Sharp 0.35.5; its [release notes](https://github.com/lovell/sharp/releases/tag/v0.35.5) do not establish that the measured OpenNext `createRequire` startup failure is fixed. #267 upgrades TypeScript across a major version. #288 proposes Node 26 types while the selected image runs Node 24. #268–#271 upgrade GitHub Actions used by protected operational workflows; those workflows need their own execution and security review, especially the `workflow_run` auto-merge path. The integration owner must fold in and recheck a chosen update, or close it with a reason, before final PR cleanup.

Other branches with work absent from the preserved #280 lineage remain protected. The client-recovery head `6c8dc2bc` has 24 unique commits by patch comparison, including inquiry-source recovery, saved-search/alert presentation, viewing preferences and private-work recovery; its frontend predecessor `733d804e` is an ancestor. The sibling public-workflows head `72bed8b8` has 13 unique commits with overlapping intent. Concrete files for viewing preferences, inquiry listing summaries and appointment listing context are absent from the current delivery head. Claude's paused locale head `d16d728e` has four unique commits and 47 changed files. The zero-loss launch head `f1a2473b` retains two unique staging/provider-qualification commits whose behavior needs comparison with the later #280 implementation. The Hermes updater head `e080223b` changes the old provider pin and needs an R00 applicability decision. The local `main` checkout has two commits absent from remote `main` plus unrelated local changes; it is left untouched. Commit counts indicate review work, not a claim that every commit should merge verbatim.

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
| Runtime and active documents | ADR 0004 selects Cloudflare Containers and PostgreSQL 16.14 for staging after the OpenNext media blocker. Source commit `ff453639` aligns `docs/architecture.md`, `docs/plan.md` and ADR 0002 with that decision, but is not integrated or peer reviewed. `docs/ux-spec.md` still describes WorkOS/TOTP, Payload and MapTiler as active user journeys. | Obtain Claude's exact-revision review, reconcile the UX/design contracts, qualify the actual runtime and approve the release policy. |
| Search and legacy launch gates | The legacy launch JSON and checklist both say blocked and disagree about media coverage. The rebuild uses PostgreSQL search, while the supplied `AGENTS.md` still requires live Typesense/Meilisearch reports. | Keep the external-report requirement open until Ivan explicitly amends it, or produce genuine reports from the required live services; regenerate a coherent policy/evidence verdict. |
| Identity, queue and assistance | The legacy gate asks for Payload runtime and Hermes worker proof. The rebuild uses first-party identity, Drizzle/pg-boss and bounded Butler tasks; ADR 0002/0003 record the design changes. | Map each old obligation to real replacement evidence with accountable approval; obtain actual provider/worker proof. A renamed component is not a passing report. |
| Legacy inventory and recovery | The earlier 410 route approvals have been revoked for zero-loss parity. The partial route/media profile cannot pass R07. Source-as-is publication approval does not equal factual, media, locale or availability review. Monitoring and production recovery reports remain absent. | Reconcile both legacy domains and all in-scope rows/media, obtain independent parity and human reviews, then prove monitoring and isolated recovery on one candidate. |

## Owned next outcomes

| ID | Owner and reserved surface | Finish condition |
| --- | --- | --- |
| C-01 | MSR-CODEX: this record, requirements and decisions | Claude acknowledges the same scope revision; every open gate and valid commitment has an owner and evidence boundary. |
| C-02 | MSR-CODEX: source/PR reconciliation only; no Figma, JSX or approved copy | Preserve and classify the local delivery commits and the unique #275/#277 work. Integrate each valid change or record exact supersession evidence; verify the resulting source and obtain Claude review before consequential integration. |
| C-03 | MSR-CODEX: backend/server seams after the W03 contract is accepted | Complete the W03 receiver decision and real-database verification of the existing P12 saved-property receipt DTO; focused browser checks after Claude's presentation lands, then Claude review. |
| C-04 | MSR-CODEX: R00 policy map and active architecture/plan docs | Remove provider/runtime drift under the existing owner decision; preserve blocked launch obligations, obtain Claude review and the accountable operator's policy acceptance before a new release verdict. |
| U-01 | MSR-CLAUDE, requested: Figma W03 and its UI/copy contract, then exact review of C-02 | Return saved node/version references, explicit receiver accept/decline and review-time states, P12 saved-name/withdrawn-listing presentation, G1–G4 evidence and bounded defects. No complete-journey pass from a design frame alone. |
| U-02 | MSR-CLAUDE, requested after U-01: `docs/ux-spec.md` identity/map/runtime contract and affected Figma frames | Replace stale WorkOS/TOTP, Payload and MapTiler journey assumptions with the accepted first-party passkey, pg-boss and Protomaps contracts; keep denial/recovery states and return changed node/version references for Codex review. |
| U-03 | MSR-CLAUDE, queued: JSX/copy/catalog/test ownership in client-recovery/public-workflows and paused locale branches | Compare the preserved heads with accepted Figma and current source, port valid P10–P14/inquiry/privacy presentation and seven-locale behavior, record exact supersession for discarded patches, then send the integrated revision for Codex review. Do not take the server modules reserved to C-06. |
| C-05 | MSR-CODEX: zero-loss launch and legacy Hermes updater branches | Compare their unique provider/operational behavior with the selected candidate and R00; preserve or integrate valid work before any branch retirement, with Claude review of consequential integration. |
| C-06 | MSR-CODEX, after a file-boundary ACK: server/transport modules from client-recovery and public-workflows | Reconcile appointment listing context, inquiry source and viewing acceptance, subscriptions and privacy queue readback with current schema; port valid behavior, run focused database/browser checks and obtain Claude's consequential review. |
| O-01 | Integration/release owner to acknowledge; operator resources and staging | Bind the accepted source to one image digest, private database/R2/Access/scanner/email proof and independent checker before protected rollout. The current partial staging profile may only be called a partial preview. |

Existing coordination names Codex as the #280 integration owner. The attached controller brief proposes Claude as the default integration owner. Neither a proposal nor silence transfers a live checkout; the two controllers must explicitly acknowledge the integration owner and in-flight branches before merging or deploying.

## Reconciliation and final sign-off

- GitHub currently has draft #280 and #293 plus dependency update PRs. #275 and #277 are closed but their unique modules require a port-or-supersede decision. The local delivery branch has unique commits; the removed worktree directory did not remove them. No branch or worktree with unique work is discarded for cosmetic cleanup.
- GitHub has no open issues; the completed Linear Wayfinder project is a historical map, not proof that this rebuild is complete. New valid defects remain open in this record until fixed and released. Close only with an outcome and evidence, and reconcile tracker items as they arise.
- Final acceptance requires no valid unfinished issue, open project PR, unmerged required change, unnecessary development branch, abandoned worktree, or obsolete active code/docs/assets/config. Preserve canonical branches, required history and recovery paths.

| Sign-off | Scope revision | Released source/image/config | Result |
| --- | --- | --- | --- |
| MSR-CODEX | This record, pending peer acknowledgement | Not established | OPEN |
| MSR-CLAUDE | Pending acknowledgement | Not established | OPEN |
| Ivan / required operators | R00 and later release approvals pending | Not established | OPEN |
