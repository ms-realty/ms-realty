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
| R07 | BLOCKED | Complete reviewed two-domain URL/content/listing/media map and fresh delta, with independent zero-loss parity. The current staging artifact is partial. |
| R08 | BLOCKED | Full load budgets, live alerts, isolated restore, independent safety replay and rollback proof. The latest recorded full local load missed its unchanged latency budgets. |
| R09 | BLOCKED | Accepted W01–W14 interactions, seven-locale public/client copy and RTL, accessibility, rendered design parity and measured performance. |
| R10 | BLOCKED | One immutable candidate with all earlier gates and named operator sign-off. |
| R11–R12 | NOT STARTED | Actual cutover verification, then a staffed operating cycle and joint handoff on the same released revision. |

## Owned next outcomes

| ID | Owner and reserved surface | Finish condition |
| --- | --- | --- |
| C-01 | MSR-CODEX: this record, requirements and decisions | Claude acknowledges the same scope revision; every open gate and valid commitment has an owner and evidence boundary. |
| C-02 | MSR-CODEX: source/PR reconciliation only; no Figma, JSX or approved copy | Preserve and classify the local delivery commits and the unique #275/#277 work. Integrate each valid change or record exact supersession evidence; verify the resulting source and obtain Claude review before consequential integration. |
| C-03 | MSR-CODEX: backend/server seams after the W03 contract is accepted | Complete the W03 receiver decision and P12 saved-property receipt contracts; focused real database and browser checks, then Claude review. |
| U-01 | MSR-CLAUDE, requested: Figma W03 and its UI/copy contract, then exact review of C-02 | Return saved node/version references, explicit receiver accept/decline and receipt states, G1–G4 evidence and bounded defects. No complete-journey pass from a design frame alone. |
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
