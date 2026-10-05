# MS Realty — UI/UX audit (Redesign v2, Phase 1)

Date: 2 October 2026 · Branch: `claude/ms-realty-redesign-v2` (from `main` @ `aa2860d5`)
Status: read-only audit. Nothing in the Figma file or the application code was changed.
FigJam map (Phase 2): https://www.figma.com/board/9wVxMy0XMh6PzxWVuvLsLM

## 0. Scope, inputs and authority

| Input | What was audited |
|---|---|
| Figma design file | "MS Realty — Frontend audit — 2027 direction", key `jlaAGjGBCyI6dw87DH59D2`, built 27 Sep 2026. Pages: Cover, 00 Foundations, 01 Components, 02 Public · Discover, 03 Client · Journey, 04 Agency · Workspace. ~18 800 nodes, ~220 top-level frames. |
| Earlier FigJam | "MS Realty — frontend audit, IA & flows", key `j8Wb9E38A6LMetbCSAxhB4` (26 Sep). Read for context; its legacy findings L1–L12 and rebuild findings R1–R10 are not repeated here unless still open. |
| Inaccessible | Design file `pHKpwG94RxGKEBSMcwQHCr` ("End-to-end Experience v2.0"): the Figma MCP returns "no permission". Not audited. |
| Canonical design (added 2 Oct) | "AI-native redesign" design file `PxfBJ2tdrj9A923fpgqzDn` and workflow FigJam `dUh3qIj3lIc9PXBEQ5RvPf`, named by the owner's handoff `output/msr-launch/VISUAL-HANDOFF.md` (1 Oct). Audited in section 2A. |
| Owner handoffs | `output/msr-launch/VISUAL-HANDOFF.md` and `NONVISUAL-SOURCE-HANDOFF.md` (1 Oct): Claude owns all Figma, visual design, frontend UI/UX, layout, copy and visual acceptance; Codex keeps deployment, migration, URL mapping, SEO plumbing, inquiry backend and parity inputs. |
| Current frontend source | Not on `main`. Codex checkpoints: launch candidate `codex/msr-zero-loss-launch` @ `f1a2473b` (base `e23d17b1`, PR #280 draft), frontend finish `codex/msr-frontend-finish-20260930` @ `733d804e` (PR #284 draft, CI failing). Audited read-only in section 4A. |
| Code | `main` @ `aa2860d5` (rebuild scaffold, PRs #261–#278). The worktree branch this session started on was 8 commits behind and still held the legacy app; it was not used. |
| Authority | `docs/architecture.md` v1.0 (24 Sep), `docs/ux-spec.md` v2.0, `CONTEXT.md`, `AGENTS.md`. Where the redesign brief and these disagree, section 1 lists the conflict instead of silently choosing. |

Owner directions received during the audit (2 Oct 2026):

- **Product framing:** MS Realty is an AI-native operating system with full manual support. Agent work is first-class on every surface, and every agent step has a complete manual path.
- **Zero learning:** no staff member, client or partner should need training or a manual. Every screen states what to do next in plain language, internal model names never reach the UI, and Butler can do, explain or find anything in context.
- **Butler:** the assistant is renamed from Hermes to Butler in every user-facing surface and document. On `main` the old name appears in about 20 files (AGENTS.md, CONTEXT.md, architecture, ux-spec, plan, ADR 0002, domain/server tests, `src/db/schema/accounts.ts`); code identifiers already use `ai_service`. The frontend renames its copy and docs; DB and test identifiers are coordinated with the backend owner.
- **Ownership:** this session owns the entire frontend end-to-end (Figma, `src/ui`, `src/features`, all `app/` routes, the token pipeline), working only from current `main`. No legacy branches, code or clutter.

Inferred values for the brief's unfilled placeholders (confirm or correct):

- Market / jurisdiction: Bulgaria and Greece (architecture §3.2). Sandanski is inland and is never framed as a sea destination.
- Languages: public and client `bg` (source), `en`, `ru`, `de`, `nl`, `el`, `he` (RTL); staff `bg`, `en`, `ru` (architecture §3.2).
- Surfaces: public site, client portal, agency workspace (three hosts, architecture §11.1). No native mobile app (§3.3); mobile means responsive web from 320 px.
- Roles: ux-spec §02.2 (visitor, invited client, client collaborator, assigned broker, coordinator, editor/translator, publisher, manager/privacy operator, Butler — formerly Hermes). The brief's "counterparty professionals" map to external specialist / adviser / invited collaborator with record-scoped grants.

## 1. Brief vs. repository — conflicts to resolve before Phase 3

**Resolved on 2 Oct by the owner (via the controller):**
- C2: Butler autonomy Option 2 at launch; `AGENTS.md` and `CONTEXT.md` amended on this branch.
- C4: palette B (architecture §11.3: warm canvas, green action, Noto Sans only, Butler violet), applied to the Figma `PxfBJ2` variables and text styles; the code tokens follow in the first slice.
- C5: this session owns the whole frontend.
- C9: no plan upgrade and no Code Connect; the `design/tokens.json` → `tokens.css` pipeline on #280 is the bridge.

**Still open:** C3 (dark mode; the Figma Dark mode is kept but not reviewed), C6 (P05 public Q&A), C7 (scope order, which the controller set: W03 inquiry → consent → legacy renderer → #284), C8 (mandate exclusivity and expiry).

| # | Conflict | Evidence | Recommendation |
|---|---|---|---|
| C1 | The brief's backbone objects (RealtyCase, Mandate, PropertyEvidencePack, ConditionLedger, RegulatorySnapshot) do not exist on `main`. They are the legacy "MS Realty OS" model, deleted by the rebuild. | `grep` over `docs/`, `src/`, `CONTEXT.md` on `main` finds none of the names. The legacy app at `a51827be` had them (`production/REALTY_OS_OPERATING_MODEL.md`, `production/lib/realty-case*.mjs`); #261 removed that code and architecture v1.0 does not carry the model (section 4.6). | Reinstate the concepts in the v2 frontend under plain-language labels (section 9), without porting legacy code. The frontend defines typed view-model contracts and fixtures; the domain records behind them (condition ledger, mandate, regulatory snapshot, agent action) need an ADR and backend work. |
| C2 | Autonomy boundary. Owner: AI-native with full manual support. The legacy model had per-case execution modes `manual` and `autonomous` (agents act inside a signed mandate and an assurance profile, i.e. HELM). The current repo rules make the assistant (Hermes, now Butler) draft-only: it never sends, publishes, approves or grants access. No HELM integration exists on `main`. | Legacy `REALTY_OS_OPERATING_MODEL.md` §1 and `realty-cases.mjs:6,720-724`; `AGENTS.md` "Hermes Agent Rules"; `CONTEXT.md` "AI service (Hermes)"; architecture D12, §14. | Design both modes now. Every step shows the system's verdict (**Done automatically · Awaiting your approval · Blocked**) with a receipt, next to a **Do it myself** path. Which consequential actions (send, schedule, file) may run autonomously stays a decision: until then the autonomous variants are drawn but marked "requires mandate + AGENTS.md change". |
| C3 | Brief wants light and dark tokens. | Architecture §11.3: "Dark mode is explicitly outside this release." | Build mode-ready variable collections with a Light mode only; add Dark later by ADR. |
| C4 | Brief asks for a redesign "with a real point of view" and 2–3 directions. | Architecture §11.3 and ux-spec §06.1 fix the palette (`#214F3C` action on `#F8F7F3`), Noto Sans only, no display face, no decorative gradients. A blue + Noto Serif Display direction (PR #274) was withdrawn on 27 Sep. | The three Phase 2 directions stay inside these rules; leaving them needs an ADR. |
| C5 | Ownership — **resolved 2 Oct**. | The 27 Sep split gave the Figma file and public UI to the "frontend design audit" session and `src/ui` plus the private hosts to the orchestrator. | Owner: this session owns the whole frontend end-to-end, from `main`, with no legacy branches or code. Backend paths (`src/domain`, `src/db`, `src/server`) are unchanged. |
| C6 | Existing P05 design has a public "Ask about this property" generative panel. | Architecture §3.3: "No general public generative chatbot at launch." | Keep only as an evaluated, source-bound FAQ, or remove from v2. |
| C7 | Scope size. | ux-spec defines 73 active screen contracts (P01–P24, C01–C18, O01–O33; C15 and O31 retired). Figma covers about 28. | v2 delivers the system and signature screens first, then fills the remaining contracts screen by screen. |
| C8 | Mandate fields. | Seller Instructions (architecture §6.3) record terms, disclosure, media rights, scope and publication permission. Exclusivity and expiry, named in the brief, are not modelled. | Treat exclusivity and expiry as open product questions; show placeholders, do not invent rules. |
| C9 | Code Connect is unavailable on the current Figma plan. | `get_code_connect_map` on the file returns "You need a Dev or Full seat on an Organization or Enterprise plan"; `whoami` shows team "Mindburn Labs", tier `pro`. The figma-code-connect skill also requires components to be published to a team library. | Either upgrade to Organization, or keep the mapping in the repo (component descriptions in Figma + `.figma.ts` templates committed, published later). Phase 5 cannot send mappings until then. |

## 2. Figma file `jlaAG…` — system level

Strengths worth keeping:

- Colour is fully variable-bound. A scan of every page found only 13 unbound solid fills (white/black on image overlays). 30 colour variables, 8 space, 4 radius; WEB code syntax set on each (`var(--color-action)` etc.).
- Contrast of the palette is good: text/muted `#52625A` on canvas 6.0:1, white on action 9.3:1, every status text on its soft background 6.5–7.0:1.
- Screens model real states, not just happy paths: 190+ state frames (loading, partial failure, version conflict, unknown delivery, revoked invitation, DST ambiguity, and more). Synthetic private data is labelled "synthetic".
- Components carry usage notes in their descriptions (Button "One Primary per view", Status "text + icon, never colour alone").

Problems:

| ID | Finding | Evidence | Severity |
|---|---|---|---|
| F-S1 | Spacing is not tokenised in practice. | 5 252 auto-layout frames use an `itemSpacing` that is not bound to a Space variable (public 1 165, client 1 342, agency 2 587, components 92, foundations 66). Padding is likewise unbound. | High |
| F-S2 | No semantic tokens for the brief's core states. | No variables or Status variants for condition status (open, at risk, overdue, cleared, waived) or agent verdicts (done, blocked, awaiting approval). Status has 8 listing/appointment tones only. | High |
| F-S3 | No direction (LTR/RTL) or locale handling in the system. | One colour mode ("Light"); no direction mode. RTL is handled by separate one-off components (`Listing card · RTL`, `Public header · 390 · HE`). | High |
| F-S4 | Components scattered across pages. | 13 client components and 3 agency components live in page-local "Local patterns" sections, not in 01 Components. `Icon/menu` exists twice (client and agency pages). Icons `document`, `upload`, `download`, `help`, `more` are outside the icon set. | Medium |
| F-S5 | Most components the product needs do not exist. | Library has Icons, Button, Chip, Status, Text field, Property card, Avatar, Nav item, Task row. Missing: case header, timeline, condition row, document card with provenance, mandate summary, party chip, price display, approval request, receipt, language switcher, table, modal/sheet, toast, empty/loading/error/blocked state blocks. They are drawn as one-off frames on screens. | High |
| F-S6 | Type specimen disagrees with the text styles. | Foundations specimen labels show Public/Display 56/64, Public/Title 36/44, Work/Page title 24/32; the actual text styles are Public/H1 32/40 and Work/H1 28/36 (ux-spec §06.1 matches the styles). The specimen has no Hebrew sample although Noto Sans Hebrew is required. | Medium |
| F-S7 | Code-syntax names collide. | `assist/soft` → `var(--color-soft)`, `assist/line` → `var(--color-line)`, `action/hover` → `var(--color-hover)`: generic names that will clash with other families in code. | Medium |
| F-S8 | Naming chaos in layers. | ~1 540 layers named `Frame`, `Rectangle`, `Group` or `Text` (public 758, client 414, agency 229). | Low |
| F-S9 | Build debris on canvas. | Text nodes "agency2 · temp build helpers (delete when done)" (4 435 × 585 px, contains plugin source), "agent helpers · P13–P24 (temporary — delete after build)", "agent layout (temporary…)". | Low |
| F-S10 | Collapsed state frames. | Six "390" client state frames hug to 121–592 px wide, so text wraps one word per line: C07 participant removed (132 × 2 426), C07 session expiry (539), C08 no requests (132), C08 verification before download (121 × 2 176), C08 safe download failure (245), C08 restricted (592). | High (unusable as specs) |
| F-S11 | Header inconsistency. | Public nav reads "Купуване · Наем · Продажба и отдаване · Райони · Екип и контакт" on P01/P02 and "… · Как помагаме" on P05. Architecture §11.1 lists Buy, Rent, Sell/Let, Areas, About/Contact, Saved, language. | Medium |
| F-S12 | Touch targets below the product's own 44 px rule. | Property card Save is 40 × 40; Nav item is 36 px tall (also used in the mobile menu). Avatar S 24 px is not interactive. | Medium |

## 2A. Figma file `PxfBJ2…` — the AI-native redesign (canonical candidate)

Added after the owner's 1 Oct handoff (`output/msr-launch/VISUAL-HANDOFF.md`), which names this file and FigJam `dUh3qIj3lIc9PXBEQ5RvPf` as the saved design references. Built by Codex 27–29 Sep; documented in `output/design/2026-09-27/ai-native-redesign/` (README, DESIGN.md, ledger). Read only; nothing was changed.

| Measure | Value |
|---|---|
| Pages | 15: Start & audit, Foundations, Components, Website/Client/Agency OS at Desktop 1440 and Mobile 390, Interaction states, Handoff, Source assets, Prototype Desktop, Prototype Mobile, Responsive & localization |
| Coverage | All 73 active contracts at 1440 and 390; 385 logical identities; 770 canonical/prototype pairs; ten scenario indexes (ledger, 29 Sep) |
| Variables | `MSR / Primitive` 23, `MSR / Semantic` 20 with Light and Dark modes, `MSR / Metrics` 24 (space 0–96, radius 0–999, control 44–64), plus DEMO fixture collections |
| Type | Manrope SemiBold for Display 64/48 and Title 32/24; Noto Sans for Heading 20 down to Label 12 |
| Components | 32 families UI01–UI32 (Button 10 variants, AI suggestion, AI composer, Source reference, Review diff, Permission row, Action bar…) plus one O03 disclosure set; all have usage descriptions |
| Hygiene (desktop pages) | 0 unbound fills, 0 generic layer names, 0 unstyled text on public and client; agency 9 unstyled texts, 34 unbound gaps, 86 unbound paddings |
| FigJam `dUh3q…` | 14 swimlane workflows W01–W14 covering F01–F32, personas, status/decisions, scenario/route traceability, Hermes (now Butler) source-entry branch |

What it gets right:

- **AI-native with a manual path is already a pattern.** O01 Today has an assistant panel, still labelled Hermes in the file ("Под Ваш контрол", "Подготви предложение") with "Предпочитате сами? · Продължи ръчно" and a scoped composer. O32 shows question, source, Hermes draft, an editable reply, two review checkboxes and "Само в локалната чернова. Изпращането е отделно" with "Приложи в черновата · Редактирай ръчно · Откажи". This is the owner's framing, drawn.
- Provenance on P05 ("Източник · Обява №202" with the source URL) and UI18 Source reference (Available / Stale).
- Prototypes at both widths with audited navigation; full-coverage state work; authentic logo on every page.

What fails the brief:

| ID | Finding | Evidence | Severity |
|---|---|---|---|
| X-1 | Visually generic and sparse. Near-black buttons on white, small grey list rows with chevrons, one tinted band per page. Nothing would be remembered; the forest brand colour appears only as a tint. | P01, P05, C03, O01, O05 screenshots | High |
| X-2 | The Case view (O05) is a hub of links. "Следващо действие" is first, which is good, but there is no path to completion, no conditions with owner and due date, and the stage/owner/status sit as editable inputs at the bottom of the overview. Staff density is low (≈7 rows per 1 000 px). | O05 `18:914` | High |
| X-3 | Palette and type contradict the architecture: action `#172029` (not green `#214F3C`), canvas `#FFFFFF` (not `#F8F7F3`), Manrope display (architecture: Noto Sans only), Dark mode present (architecture: out of release). DESIGN.md says the divergence is deliberate. | `MSR / Semantic` values; DESIGN.md "Current artifact and authority" | High (needs an owner decision) |
| X-4 | No semantic tokens for condition status or agent verdicts; no `success`/positive colour role at all (Status "Positive" has no matching semantic variable). | `MSR / Semantic` list | High |
| X-5 | Dark mode loses meaning: `danger` resolves to `#FFF0EF` (near-white) and `warning` to `#F2CC8F`, so danger text is indistinguishable from body text. DESIGN.md documents dark `warning` as `#ABC5F7`, which disagrees with the file. | Variable values vs DESIGN.md table | Medium |
| X-6 | Focus `#315BA6` is 2.49:1 against the dark action button; keep the offset or the ring disappears on primary buttons. `line` `#E1E5E9` is 1.27:1 and must never be the only input edge (DESIGN.md says the same). | Contrast computed from variables | Medium |
| X-7 | Localization coverage is thin: base content Bulgarian, one Hebrew 390 specimen (`56:114`), three intermediate responsive frames; no DE/RU/EL/NL compositions. | Page 14 | Medium |
| X-8 | Two parallel MS Realty design systems now exist (`PxfBJ2` and `jlaAG`) plus two older FigJam boards and this session's board. | Sections 0, 2 | High (clutter, drift) |

Text contrast is good: text 14.9:1, muted 6.1:1 on canvas and 5.5:1 on subtle, every status text on its tint 5.5–7.1:1, control edge 3.51:1.

## 3. Figma file `jlaAG…` — per screen (designed screens)

Role key: V visitor, C client, B broker/coordinator, E editor/publisher, M manager.

| Screen | Purpose · role | What works | What is broken or missing |
|---|---|---|---|
| P01 Home (1440, 390, 390 HE + 7 states) | Choose buy/rent/sell, search, see inventory · V | Immediate structured search, real photos, service strip, area cards, RTL mobile variant, locale-suggestion and no-inventory states. | Generic portal composition (hero + card row + 4 steps); nothing says "this agency" beyond copy. Area cards for Pirin and Hotovo show a placeholder icon instead of photos. Language list in the footer is one 467 px line with 0 px slack. |
| P02 Results (1440, 390, 390 HE + 9 states) | Inspect criteria, compare, open a listing · V | Filter rail, active-criteria chips, compare tray, honest "Цена при запитване" handling, partial-failure and changed-inventory states. | "Цена при запитване" becomes the card headline (legacy finding L3 returns) and overflows its row by 17 px. One listing photo carries a hand-drawn red ellipse from the source. Back-link on P05 says "4 results" while P02 shows 6. |
| P03 Filter editor (1440, 390 + 6 states) | Edit draft criteria · V | Draft vs applied, preview count, RTL ordering state, keyboard-open state. | Long sheet with no grouping summary at the top; the Apply button is the only sticky element. |
| P04 Map (1440, 390 + 7 states) | Map results · V | Exact vs approximate position, cluster, blocked tiles, denied geolocation. | Map states are 600 px fragments without the surrounding page, so list/map toggle behaviour is unspecified. |
| P05 Property (1440) | Evaluate one listing · V | Fact rows with source and review state ("По описанието на собственика · предстои проверка"), "What to confirm before a viewing", request-vs-booking copy. | No 390 or HE frame. Price sits below the gallery, not with identity (architecture §11.2 asks for identity, location, price/basis and availability immediately visible). Generative Q&A panel conflicts with architecture §3.3 (C6). |
| P11 Inquiry · P12 Receipt (1440) | Ask and get a durable reference · V | Minimal form, receipt with reference and next staffed period. | No 390 or HE frames; no unknown-outcome or rejected receipt states drawn (they exist only as FigJam notes). |
| P13 Viewing request (1440, started) | Request windows · V | Header/footer instances. | Body is an empty form/side skeleton. |
| C01 Access · C02 Invitation (1440, 390, 390 HE + 15 states) | Verify and accept · C | Thorough failure states (expired, revoked, wrong recipient, rate limited, provider down). | Button "Изпратете код до p•••••a@example.com" overflows by 26 px at 390. |
| C03 Overview (1440, 390, 390 HE + 7 states) | Where are we, what do I do · C | Strongest screen: "Next step" card first, owner and deadline, "Докъде сме" progress, honest waiting states. | Progress is a text list with no sense of distance to completion; desktop is a stack of nine bordered cards (card soup). "Отговорете на предложението" overflows its button by 7 px. |
| C04 Brief · C05 Interests (1440, 390 + 12 states) | Agree needs, give feedback · C | Client-stated vs broker interpretation, participant disagreement, private-note boundary. | Dense for an occasional mobile user; feedback controls not grouped per property. |
| C06 Appointment (1440, 390 + 8 states) | Respond to a proposed time · C | Proposed vs confirmed distinction, access-pending, DST/timezone stated. | — |
| C07 Messages · C08 Documents · C09 Upload (1440, 390 + 12 states) | Converse, exchange documents · C | Audience shown, unsafe-attachment and queued/unknown delivery states. | Six state frames collapsed (F-S10). Upload progress is a percentage bar; ux-spec §06.3 allows a percentage only when byte progress supports it — needs a note. |
| C10 Proposal (1440, 390 + 2 states) | Review exact terms · C | Version diff v1→v2, "not legal advice" boundary, conditions table. | Conditions are rows inside one proposal; nothing carries them forward into a path to completion. |
| O01 Today (1440, 1024, 390 + 5 states) | Work requiring action · B | Grouped queues with reason, owner and one action; coverage and agenda rail; empty vs failed distinguished. | All rows have equal weight; overdue and consequential items differ only by a 4 px left bar and icon. No "awaiting my approval" group for assistant drafts. |
| O02–O03 Inquiries (1440, 1024, 390 + 13 states) | Triage and qualify · B | Original request preserved, duplicate and suspicious-inbound states. | — |
| O04 Cases (list, board + 4 states) | Find a case · B | Stale-next-action state. | List columns do not show "blocking item" or "due"; you open each case to learn what blocks it. |
| O05 Case workspace (1440, 1024 + 5 tabs + 6 states) | Progress one case · B | Header shows stage, disposition, owner, next action and promised date; dependencies panel lists awaited items with dates. | Fails the brief's five-second test: the blocking condition, its owner and due date are split between the header card and a right-rail "Зависимости" list. No path-to-completion view; conditions from the agreed proposal are not visible here. |
| O06 Party · O07 Matching · O08 Calendar · O09 Appointment (+ 30 states) | Relationships, matching, scheduling · B | Agenda default, keyboard scheduling, conflict and DST states. | — |
| O19 Proposal record (1440) | Prepare and record revisions · B | Terms table with basis and change vs previous revision; "not an e-signature, escrow or legal document" notice; communications history with delivery states. | Desktop only. |

Not designed (45 of 73 active contracts; P13 started): P06–P10, P14–P24, C11–C14, C16–C18, O10–O18, O20–O30, O32–O33. The full coverage table is in section 10.

## 4. Code UI layer on `main` @ `aa2860d5` (baseline, superseded by 4A)

Paths are repository-relative. Nothing was run against a database; pages render without one.

Provenance note: this section came from a subagent that, by configuration, ran on Sonnet 5.5. Its key claims (tokens, focus width, `cx`, anonymous `/workspace`, English fallbacks, `formatArea`) were re-checked by hand on Opus 5.5. A full Opus 5.5 re-verification is running together with the audit of the Codex frontend branches (section 4A), per the owner's rule that all visual and frontend work runs on Opus 5.5 at xhigh or max.

### 4.1 Routes

| URL | File | Contract | State |
|---|---|---|---|
| `/{locale}` | `app/[locale]/(public)/page.tsx` | P01 | Placeholder: an `h1` and one sentence. |
| `/{locale}/*` chrome | `app/[locale]/(public)/layout.tsx` → `PublicShell` | L01 | Real shell. |
| `/{locale}/journey` | `app/[locale]/journey/layout.tsx` | C01–C18 | Shell only; no `page.tsx`, so `/bg/journey` is a 404. |
| `/workspace` | `app/workspace/layout.tsx`, `page.tsx` | O01 | Shell real, page is an `h1`. Locale from a cookie, `dir="ltr"` fixed. Answers 200 to anonymous requests (`e2e/shells.spec.ts:327-333`). |
| `/{locale}/design` | `app/[locale]/(dev)/design/page.tsx` | — | Dev-only component specimen (needs `ENABLE_DESIGN_SPECIMEN=1`). |
| `POST /api/inquiries` | `app/api/inquiries/route.ts` | P11 | Real, JSON only (`:19-24`), so a no-JS form post fails. |

Missing: every other contract, `loading.tsx`, `error.tsx`, `global-error.tsx`, `forbidden.tsx`, any sign-in route. `src/features/shell/navigation.ts` defines 26 nav items and only `today` has a path. No page consumes the server view models (`ListingCard`, `PublicListingDetail`, `SearchResponse`).

Route shape deviates from architecture §11.1 (separate `my.` and `app.` hosts with `/{locale}/cases`, `/{locale}/today`), and staff nav labels (Inbox, Properties, Content & approvals, Service operations, Reports — `navigation.ts:68-81`) differ from the spec (Inquiries, Inventory, Reviews, Content, Operations).

### 4.2 Components

Primitives are React Aria Components 1.21.1 with Tailwind v4 and a custom 45-icon set. About 45 components exist in `src/ui`; shipped pages use 7 (Button, ButtonLink, Link, Select, LanguageSwitcher, SkipLink, Banner). Notable: `Button` with `isPending` and `disabledReason`, `DatePicker` with mandatory `timeZoneLabel`, `Sheet` backed by history, `FactRow`, `PriceDisplay`, `Receipt`, `StatusBadge` (availability, approval, delivery families), `TaskRow` (consequential, due, planned, draft), `Timeline`, `EmptyState` (new, filtered, failed, inaccessible).

Problems:

- No component maps the domain's `FactState` or `SourceClass`; `FactRow` takes one free-text `provenance`.
- `Receipt` is not bound to the domain `OperationReceipt`.
- Missing ux-spec §17 contracts: facets, result toolbar, map, gallery, comparison, composer, upload queue, document, revision diff, readiness checklist, operation result, invitation, AI review.
- Six separate tone→icon/colour maps (`notice.tsx:7`, `status-badge.tsx:25-53`, `task-row.tsx:20-37`, `timeline.tsx:15`, `empty-state.tsx:12`, `chip.tsx:18`), three field chromes, three popover chromes, four tab-style navs, three language-switch UIs.
- `cx` (`src/ui/cx.ts:1`) concatenates without merging, so overrides silently lose when the base utility sorts later: `Button` base `px-5` beats `px-3 md:px-4` (`public-shell.tsx:87`), `justify-center` beats `justify-between` (`menu-disclosure.tsx:37`), `underline` beats `no-underline` (`pagination.tsx:30`).
- About 35 of 45 components have no unit test; coverage is the specimen e2e.

### 4.3 i18n

- next-intl 4.14.6; whole catalog per request (`src/i18n/request.ts`); keys typed from `en.json`. No client provider: strings arrive as props.
- Locales `bg en ru de nl el he`, default and source `bg`; staff `bg ru en` from a cookie.
- RTL: `he` only, via `localeDirection` (`src/i18n/config.ts:29`). Logical utilities throughout; directional icons flip with `rtl:-scale-x-100`. `src/i18n/bidi.tsx` exists but isolates only the phone number.
- 119 keys per locale with enforced parity (`messages.test.ts`). 62 of them are unused by shipped code, including all 44 `states.*`.
- Formatters (`src/i18n/format.ts`): money, number, area, date/time with explicit `Europe/Sofia`. No address, phone, relative-time or list formatter. `formatArea` hardcodes "m²" for every locale (`:50`) while the specimen shows "м²" and "מ״ר".
- Hardcoded user-facing text in shipped code: English fallback "Remove" (`src/ui/chip.tsx:90`), English "workspace" in the staff `<title>` (`app/workspace/layout.tsx:15`), hand-joined "region, country" without isolation (`src/ui/combobox.tsx:91,119`). P01 and O01 set no localized page title. The dev specimen has its own second copy system (`src/ui/specimen/copy.ts`).
- `bg` is indexable although `messages/_status.json` marks every catalog `draft_unreviewed` with no reviewer (`config.ts:92` short-circuits the source locale).

### 4.4 States, accessibility, tests

- State components exist (Skeleton, Progress, EmptyState, ErrorSummary, Notice, StatusBadge pending/draft, TaskRow due/overdue, Receipt). No page uses them except the 404. Offline, stale, partial, session-expired, unknown-outcome, version-conflict, unsaved and rate-limited exist only as message text.
- Focus: global 2 px `:focus-visible` outline with 2 px offset (`src/ui/tokens.css:169-172`); spec asks for 3 px. Listbox options show focus by background only (`field.tsx:82`, 1.16:1).
- Targets: 44 px enforced by `e2e/design-system.spec.ts:114-139`, except 40 px workspace nav rows and 32 × 28 date segments.
- Landmarks: journey has no `contentinfo`; workspace uses two `<header>` elements. No route-change announcement or focus management; `announce()` has no caller.
- axe (WCAG 2.2 AA tags) runs on `/bg`, `/he`, 404 and `/workspace` plus the specimen. No WebKit project, no screenshot baselines.
- No-JS: `DatePicker` renders nothing before hydration; the inquiry endpoint is JSON only.

### 4.5 Code Connect and token pipeline

None: no `@figma/code-connect`, no `.figma.ts(x)`, no `figma.config.json`, no Style Dictionary, no DTCG file, no Storybook. `tokens.test.ts` regex-parses `tokens.css`. The comment at `tokens.css:4-5` claims the Figma file binds the same values; it does not (section 5).

### 4.6 Domain support for the brief's model

| Brief need | On `main` | Nearest existing pieces |
|---|---|---|
| ConditionLedger | None | Free-text `ProposalTerms.conditions: string[]` (`src/domain/proposal.ts:40`), `Task` with owner, due, `waitingOn`, evidence (`task.ts`), `outstandingObligations` strings (`case-disposition.ts:10-14`). |
| Mandate | None (`SellerInstruction` from architecture §4.1 is absent) | `service_agreements` with scope, authority, publication permissions, effective dates (`src/db/schema/services.ts:35-52`); `AuthorityState` with expiry/revocation (`parties.ts:32-43`). No exclusivity or commission fields. |
| RegulatorySnapshot | None | Versioned `service_policies` (`settings.ts:36-47`); `ApprovalKind` `legal_process_claim`; content `jurisdiction` field. AML and country checklists are planned for S4 (`docs/plan.md:102-105`). |
| Agent action record with verdicts | None | `ActorKind "ai_service"` limited to draft capabilities (`capabilities.ts:182,218`); human-only approvals; `OperationStatus` accepted / in progress / succeeded / failed / outcome unknown (`records.ts:55-81`). |
| Provenance | Partial | `FactState` (5 values; "conflicting" from architecture §4.2 missing), `SourceClass` (7), re-encoded server-side to a 4-value `FactVerification`. |

Also: paused and closed are modelled as stages in all three case state machines and the DB checks, while `CONTEXT.md` calls them dispositions. Retired scope (reservations, service requests, `spending.approve`) is still in the tree.

These concepts did exist in the legacy application (`production/REALTY_OS_OPERATING_MODEL.md` and `production/lib/realty-case*.mjs` at `a51827be`, workflow `2026-07-30.bg-gr-v1`): RealtyCase with `manual` / `autonomous` execution modes, Mandate as an authority envelope, PropertyEvidencePack, ConditionLedger, RegulatorySnapshot, EvidenceRef and BG/GR jurisdiction steps. The rebuild deleted that code in #261 and architecture v1.0 does not carry the model. Per the owner's instruction, v2 reinstates the concepts in the new frontend and does not port legacy code.

### 4.7 Running it

No Postgres or env is needed to render pages. `npm ci`, then `ENABLE_DESIGN_SPECIMEN=1 npm run dev` serves `/bg`, `/he`, `/workspace` and `/{locale}/design`. There are no fixtures for listings, cases or staff screens; implementation work will need typed fixtures.

## 4A. Current frontend source — PR #280 head `9d4ef652` (audited on Opus 5.5)

The real frontend is not on `main`. The launch candidate `codex/msr-zero-loss-launch` @ `f1a2473b` has a frontend byte-identical to PR #280's head `9d4ef652`, which is this branch's base. `codex/msr-frontend-finish-20260930` @ `733d804e` (PR #284 work) diverged at `e89cc0b3` with 23 own commits (P13/P14 viewing, inquiry-form rework, privacy cursor pages, search-alert fixes). It should be ported as a reviewed cherry-pick series, not merged. The two Codex worktree folders have been removed; both branches remain in the object store.

What exists on `9d4ef652`:

- **Hosts and routes.** Three hosts through `proxy.ts` rewrites to `app/{public,client,staff}/[locale]`. 110 pages: public 16, client 25, staff 57 + 9 access. Staff pages are gated by `requireStaffPage`.
- **Real UI.** P01–P05, P07, P08, P10–P12, P19, C01–C13, C17, C18, O01–O06, O08–O26, O32 render real data. Areas, services, sell/let, contact and help render only approved CMS content.
- **Missing spec surfaces.** P09 share, P15 index, guides, C14, O07, a reviews hub, settings, O27–O30, O33.
- **Token pipeline.** `design/tokens.json` (W3C format) → `scripts/tokens-build.mjs` → `src/ui/tokens.css` + `design/figma-variables.json`, Light mode only. The values follow the AI-native file (white canvas, action `#172029`, Manrope titles), with leftovers from architecture §11.3. They must be re-pointed to the owner-approved palette B.
- **Domain added since `main`.**
  - SellerInstruction / mandate (`src/domain/seller-instruction.ts`).
  - Process policies and checklists per BG/GR with policy hashes (`compliance.ts`), the nearest thing to a regulatory snapshot.
  - `assistanceRuns` (draft review only), external actions and operations.
  - Still no condition ledger: only `proposalRevisions.conditions` jsonb.
- **Assistant.** Staff only, with a "Hermes" nav item and O32 drafts that show source, review checkboxes and accept/reject. Manual paths exist everywhere. There is no unified verdict model, no approval queue and no execution modes. 21 user-facing "Hermes" strings and 3 "Jev" strings remain; "Butler" appears 0 times.

Defects, in order of severity:

| # | Defect | Evidence |
|---|---|---|
| K-1 | **Invisible primary buttons.** `bg-action` is combined with the undefined `text-on-action`, giving about 1.1:1 contrast on the client document-upload submit and two staff AI screens. | `src/features/document-requests/screens.tsx:292`, `src/features/ai/intake-screen.tsx:103`, `src/features/ai/locale-screen.tsx:84` |
| K-2 | **Ten utility classes generate no CSS** across 70+ call sites, so section headings collapse to body size and reading width is lost. | `text-section` ×28, `max-w-reading` ×20, `rounded-card` ×18, `text-accent` ×4, `text-on-action` ×3, `border-rule`, `rounded-sm`/`rounded-lg`, chip hover/pressed |
| K-3 | **Two component systems.** Product screens hand-write 137 `<input>`, 52 `<select>` and 48 `<button>` elements, while the React Aria library is effectively specimen-only. | Zero product imports of Select, Checkbox, RadioGroup, Dialog, Sheet, Tabs, Table, PropertyCard and others |
| K-4 | **Split visual authority.** Commit `3513727c` rewrote `docs/ux-spec.md:287-307` to bind the Figma file, while `docs/architecture.md:457-459` still states §11.3. | Resolved by the owner on 2 Oct: palette B |
| K-5 | **About 90% of UI copy is outside the reviewed catalogs** (43 TypeScript copy modules). All catalogs are `draft_unreviewed`; "m²" is hardcoded; inline `Intl` calls bypass the formatters. | `src/i18n/format.ts:79-95`, `src/features/*/copy.ts` |
| K-6 | **Visual baselines are stale and narrow.** 96 PNGs of 2 stories, captured before the token swap; CI likely fails. There are no page-level, 320/768 or WebKit baselines. | `playwright.visual.config.ts`, `ci.yml:48` |
| K-7 | **Consent UI.** It renders below the footer and uses a dead class. Once analytics consent is granted, `document-navigation.ts` turns hash links (including the skip link) into reloads (inferred). Its seven copy sets are unreviewed. | `src/features/tracking/consent.tsx:130-175`, `document-navigation.ts:21-38` |
| K-8 | **Legacy renderer.** A plain-text projection at 1440 px with raw `<img>` elements and no reading width; 0 of 586 pages are equivalence-reviewed. | `app/public/[locale]/(site)/legacy/[id]/page.tsx:36-79` |
| K-9 | **Internal terms shown to users.** Case "Случай" vs "Дело" (inconsistent), "My journey", "Stage", "Commitment", "Operation receipt", "Activate reviewed manifest", "Source digest", "Provider cost (USD micro-units)". | `messages/*/nav.json`, `src/features/*/copy.ts` |
| K-10 | **The `cx` override bug is still present.** | `public-shell.tsx:88`, `pagination.tsx:29-30` |
| K-11 | **25 route files mix JSX rendering with metadata or JSON-LD** (Codex owns SEO, Claude owns rendering). The list is kept for controller relay before any edit. | Public, client and staff layouts and pages |

The logo `public/brand/logo-ms-realty.png` (172×88) is the authentic brand asset verified against the live site. It stays; only its presentation is in scope.

## 5. Token drift: Figma ↔ code

The two disagree on almost every value. Figma follows architecture §11.3 / ux-spec §06; `src/ui/tokens.css` still holds the superseded direction from PR #274 (which `docs/plan.md:45` itself calls superseded).

| Token | Figma (`jlaAG…`) | Code (`src/ui/tokens.css`) | Spec |
|---|---|---|---|
| Canvas | `#F8F7F3` | `#f7f5f0` | `#F8F7F3` |
| Text / muted | `#192E27` / `#52625A` | `#1b1a17` / `#5a5750` | Figma values |
| Action | `#214F3C` green | `#1d4690` blue | green |
| Focus | `#174EA6`, 3 px | `#1d4690`, 2 px | `#174EA6`, 3 px |
| Border / divider | `#687A6F` / `#D9DFD8` | `#817d73` / `#e4e0d7` | Figma values |
| Status success / warning / error | `#21603C` / `#775000` / `#A12A25` | `#1e6a43` / `#7a4a00` / `#b3261e` | Figma values |
| Assist | `#5B45A0` | `#5b45a0` | — (matches) |
| Radius control / card / sheet | 6 / 8 / 12 | 10 / 16 / 20 | 6 / 8 |
| Headings | 32/40, 28/36, 22/30, 18/26 | 36/44, 24/32, 20/28 (+ display 56/60) | Figma values |
| Body | 16/26 public, 16/24 work | 18/28 body, 16/24 compact, 15/22 operational | 16, 1.5–1.65 |
| Fonts | Noto Sans | Noto Sans + Noto Serif Display (loaded, never applied) | Noto Sans + Noto Sans Hebrew |
| Breakpoints | frames 390 / 1024 / 1440 | 600 / 1024 / 1280, Tailwind default `md` 768 still used | 640 / 1024 / 1440 |
| Max width | 1440 | 1320 | ≈1440 |
| Motion | not specified | 120 / 200 / 320 ms, `cubic-bezier(.22,1,.36,1)` | 150–200 ms |
| Spacing | 4-based scale 4…64 (mostly unbound) | 0.25 rem base; 57 off-scale uses (1.5, 2.5, 3.5, 5, 14 steps) in 24 files | 4, 8, 12, 16, 24, 32, 48, 64 |

Tailwind's default palette, radii and spacing are not disabled, so off-system values are one class away (`bg-black/5`, `rounded-md`, `rounded-[3px]`, `border-[1.5px]`, `size-[1.125rem]`). Untested low-contrast pairs in use: `assist-line` on `assist-soft` 2.28:1 (`chip.tsx:20`), listbox focus 1.16:1.

Because components reference roles, not values, re-pointing `tokens.css` at the Figma variables is mostly a one-file change once a generated pipeline exists.

## 6. Multilingual audit

### 6.1 Text expansion

The Figma file is drawn in Bulgarian. The longest in-scope locales for UI strings are Russian and German. Measured on the 119 shared keys in `messages/*.json` (character totals relative to English): bg 1.16×, ru 1.23×, de 1.21×, el 1.19×, nl 1.13×, he 0.87×. Short labels expand much more than the average: `footer.privacy` ru "Конфиденциальность" is 2.6× English, `nav.workspace.inbox` de "Posteingang" 2.2×, `states.success.title` el "Ολοκληρώθηκε" 3.0×. Relative to the Bulgarian design text, German and Russian labels typically add 5–40 %.

A read-only scan of every single-line text in a fixed-width horizontal auto-layout on the three screen pages flagged 221 candidates where +35 % would not fit (public 40, client 58, agency 123). The heuristic ignores siblings set to Fill, so treat it as an upper bound; these are confirmed already-overflowing or zero-slack cases in Bulgarian:

| Where | Text | Slack |
|---|---|---|
| P02 property card price row | "Цена при запитване" + "продажба" | −17 px |
| C01 reauthentication button (390) | "Изпратете код до p•••••a@example.com" | −26 px |
| C03 next-step button (1440) | "Отговорете на предложението" | −7 px |
| C03 broker contact (1440) | "Съобщение" | −11 px |
| P01/P02 footer | language list "Български · English · Русский · Deutsch · Nederlands · Ελληνικά · עברית" | 0 px |
| P12 receipt | reference, timestamp and listing rows | 0 px |
| O01 Today group headers | "Неразпределени запитвания", "Корекции и прегледи" with right-aligned links | 0 px |

None of these use truncation or fixed-height boxes (0 truncated text nodes, 0 fixed text boxes), so in a longer language they will push neighbours or wrap mid-control. Buttons need a wrap or stack rule; the language list needs a wrapping layout.

No screen has been drawn in German, Russian, Greek or Dutch. Hebrew exists for P01, P02, P03 (one state), C01 and C03 at 390 px only.

### 6.2 RTL

- Mirroring is done by duplicating components (`Listing card · RTL`, `Public header · 390 · HE`) instead of a direction mode. Each RTL fix must be made twice.
- In the C03 Hebrew frame, Cyrillic person names and listing titles sit inside Hebrew sentences ("Ива Стоянова", "Тристаен апартамент…"). That is correct content (names and unapproved titles are not translated) but needs explicit bidi isolation in code (`<bdi>` / `dir="auto"`), and the design should show the isolation.
- Hebrew listing cards show the Bulgarian title with a note "translation not yet approved — shown in original". This matches architecture §3.2 (no silent fallback into indexable pages) but the note uses the warning colour; it is information, not a warning.
- Chevrons and arrows flip correctly in the HE frames checked. Photos and the logo are not mirrored (correct).
- No Hebrew sample in the type specimen; Noto Sans Hebrew metrics (taller ascenders, different x-height) are untested against the 16/24 and 14/20 styles.

### 6.3 Formats

| Format | In Figma | Spec / code expectation | Issue |
|---|---|---|---|
| Currency | "206 000 €" (BG), same string in HE | Locale-aware `Intl.NumberFormat`; EUR | Hebrew and English should not share the Bulgarian group separator and suffix position. Not shown per locale. |
| Dates and times | "Събота, 3 октомври 2026, 11:00 · София (EEST, UTC+3)" | Timezone always stated (ux-spec F07/F22) | Good. No other locale drawn. |
| Area | "120 m² застроена", "70 m² living" | Area basis always qualified (CONTEXT: Area basis) | Good; keep basis in every locale. |
| Phone | "+359 879 696 870" | Phone numbers as isolated LTR runs in RTL | Renders correctly in the HE footer frame; code must isolate it (`dir="ltr"` / `<bdi>`). |
| Addresses | "Сандански, централна част · точният адрес се уточнява с брокера" | Location precision (CONTEXT) | Good; mixed-script addresses in RTL untested. |
| References | MS-00242, INQ-2026-00418, C-0192 | Stable references never translated | Good. |

### 6.4 Text in images and hardcoded strings

- The logo is a raster image with its wordmark and tagline ("MS REALTY · makler real estate") baked in; the tagline is Latin-only, unreadable at header size (86 × 44 px) and cannot be translated or mirrored. A vector logo with a separate, optional text tagline is needed.
- The listing photos on 00 Foundations (legacy R2 mirror and Wikimedia) carry no baked-in text, but one aerial photo has a hand-drawn red ellipse from the source (used on P02, MS-00907).
- In Figma every string is literal text; there is no key naming. Code findings are in section 4.

## 7. Accessibility (WCAG 2.1 AA; product target WCAG 2.2 AA per ux-spec §06.3)

| Check | Result |
|---|---|
| Text contrast (Figma tokens) | Pass. Lowest normal-text pair is text/muted on subtle 5.7:1; status text on soft backgrounds 6.5–7.0:1; disabled text 5.0:1 (exempt but readable). |
| Non-text contrast | `line/border` #687A6F is 4.6:1 on white and 4.3:1 on canvas: passes 3:1 for inputs. `line/divider` #D9DFD8 is 1.4:1: fine for decoration but it is used as the only edge of every card. `assist/line` #A796D6 is 2.6:1 on white and is the dashed edge that marks AI drafts — fails 1.4.11 if the edge is the only cue (a text label is present on the frames checked). |
| Focus | Button has a Focus variant; focus colour #174EA6 is 7.3:1 on canvas but 1.2:1 against the action green, so the 2 px offset must always be kept; check focus on dark segmented controls and the selected nav item. Text field has Focus. Chip, Nav item, Property card and Task row have no focus variant. |
| Target size | 44 px rule (ux-spec §06.2) broken by Save (40 × 40) and Nav item (36 px). Both pass WCAG 2.2 24 px minimum. |
| Keyboard flow | Only O08 has a keyboard-scheduling state. No focus-order annotations on any frame; reading order for RTL frames not annotated. |
| Colour alone | Status always pairs text + icon (good). Today rows encode severity by a 4 px bar plus icon; the icon carries meaning, so it passes, but severity is weak at a glance. |
| Motion | No prototype interactions or motion specs exist in the file. |

## 7A. Zero-learning audit (owner direction, 2 Oct)

Test: could a first-time broker, client, lawyer or translator finish their task without training, a manual or asking a colleague? Judged on the designed screens of both files and the shipped code.

| ID | Finding | Where | Severity |
|---|---|---|---|
| Z-1 | Internal model words reach the UI. Clients see "Случай CASE-2026-0142 · Етап: огледи · Състояние: активен"; brokers see "Разпореждане", "Бриф · версия 3", "Интереси", "Покритие". In `PxfBJ2` staff see "Преписки", "Ангажимент", "DEMO Brief v3", "Интерес A" and editable "Цел / Отговорник / Етап / Състояние" fields. Each term must be learned. | `jlaAG` C03, O05, O01; `PxfBJ2` O05, O01 | High |
| Z-2 | Navigation is organised by data type, not by job. Staff rails list 8–10 nouns (Днес, Запитвания, Случаи, Календар, Имоти, Прегледи, Съдържание, Операции); code uses yet another set (Inbox, Properties, Content & approvals, Service operations, Reports). A newcomer must learn where each job lives. | Both files; `src/features/shell/navigation.ts` | High |
| Z-3 | No universal "ask Butler" entry. `PxfBJ2` has a rail search field, a "Hermes" rail item and assistant panels on Today and O32, but no in-context entry on other screens; `jlaAG` has none. A user who does not know where something is has no single place to say what they want. | Shell components | High |
| Z-4 | Consequential steps rely on knowing the rules. Proposal, publication and document review screens explain boundaries in footnotes ("not an e-signature…", "Само в локалната чернова") rather than in the action itself. The button should say what will happen and what will not. | O19, O32, C10 | Medium |
| Z-5 | Empty and first-use states describe absence instead of doing the first step. O04 first-use empty, C05 no suggestions and O07 no match explain the state; none offers "Butler can set this up from your inquiry" or a one-click first action. | `jlaAG` O04, C05, O07 | Medium |
| Z-6 | Dense staff tables (O04 list, O19 terms) have no inline explanation of columns or states; meaning of "Disposition", "Stale next action" or "Version conflict" is assumed. | `jlaAG` O04, O19 | Medium |
| Z-7 | What works: C03 and `PxfBJ2` O01 open with the next step in a sentence; O32 lets a person accept, edit or reject a draft without leaving the task; status always pairs text with an icon. Keep these patterns. | — | Keep |

Design rules that follow (proposed for the v2 system docs):

1. Every screen answers "what should I do now?" in one sentence above the fold, with one primary action named as a verb plus object ("Send the reply to Alex").
2. No internal model name appears in the UI; the object → label table (section 9) is the only vocabulary, per locale, reviewed by a person.
3. Butler is reachable from everywhere with one key and one button, accepts plain language in all seven locales, and always shows what it will do before it does it, with a "Do it myself" path to the same screen.
4. Each consequential button states its effect and its limit in its own label or a single line next to it, not in a footnote.
5. Empty states start the work: a prefilled first action or "Let Butler prepare it", never only a description.
6. New staff are productive on day one: Today shows only their work, each row says why it is there and what one click does; nothing requires knowing which menu holds it.

## 8. Ranked findings (all sources)

| Rank | Finding | Theme | Section |
|---|---|---|---|
| 0 | **Shipped defect:** primary buttons with invisible labels (`text-on-action` undefined, ~1.1:1) on client document upload and two staff AI screens; ten utility classes generate no CSS. Fix first. | Code, accessibility | 4A K-1, K-2 |
| 1 | The Case view fails the five-second test; there is no path to completion in design or code, and the domain on `main` has no condition, mandate, regulatory or agent-action records. | Signature, model | 3, 4.6 |
| 2 | Code tokens are the superseded blue system; Figma and code disagree on colour, focus, radius, type, breakpoints. No token pipeline. | System | 5, 4.5 |
| 3 | The product is meant to be AI-native with full manual support, but nothing shows agent work: no verdicts, no approval queue, no receipts in UI, no "do it myself" path. | Trust | 2, 4.6 |
| 4 | The Figma library lacks most product components, and no semantic tokens exist for condition status or agent verdicts. | System | 2 |
| 5 | Shipped code is two placeholders; 71 of 73 contracts have no route; private surfaces answer anonymously. | Coverage, security | 4.1 |
| 6 | RTL is handled by duplicate components in Figma; code handles direction well but bidi isolation covers only the phone number. | Multilingual | 6.2, 4.3 |
| 7 | 45 of 73 contracts are not designed in Figma; six state frames are collapsed. | Coverage | 3, 10 |
| 8 | Labels already overflow in Bulgarian; no frame exists in DE, RU, EL or NL; buttons have no wrap rule. | Multilingual | 6.1 |
| 9 | Global states exist only as message text in code; 62 of 119 keys unused. | States | 4.4 |
| 10 | `cx` without merge silently drops overrides in three shipped places. | Code quality | 4.2 |
| 11 | Spacing is unbound in Figma (5 252 auto-layouts) and off-scale in code (57 uses). | System | 2, 5 |
| 12 | Duplicate patterns: six tone maps, three field chromes, four tab navs, three language switchers in code; 16 page-local components and a duplicate icon in Figma. | System | 2, 4.2 |
| 13 | Focus is 2 px in code (spec 3 px); listbox focus 1.16:1; Chip, Nav item, Property card, Task row have no focus variant in Figma. | Accessibility | 7, 4.4 |
| 14 | Raster logo with a baked-in Latin tagline. | Multilingual | 6.4 |
| 15 | Public generative Q&A panel on P05 conflicts with architecture §3.3. | Trust | 1 |
| 16 | Targets below 44 px: Save 40, nav rows 36–40, date segments 32 × 28. | Accessibility | 7, 4.4 |
| 17 | Hardcoded English fallbacks, no localized page titles, "m²" for every locale, no address/phone formatter. | Multilingual | 4.3 |
| 18 | No-JS paths broken (JSON-only inquiry endpoint, DatePicker blank before hydration). | Resilience | 4.4 |
| 19 | Type specimen disagrees with text styles; code-syntax name collisions; Noto Serif Display loaded but unused. | System | 2, 5 |
| 20 | Build debris and ~1 540 generic layer names in Figma; stale spec section references in 146 code comments. | Hygiene | 2 |
| 21 | Today rows all carry equal weight; overdue vs planned differs by a 4 px bar and icon (O01). | Signature | 3 |
| 22 | Home and results read as a generic portal; nothing says "this agency, this place" beyond copy. | Signature | 3 |
| 23 | Mixed-script names inside Hebrew sentences need visible bidi isolation in specs. | Multilingual | 6.2 |
| 24 | P05, P11, P12 exist only at 1440; no unknown-outcome receipt drawn. | Coverage | 3 |
| 25 | Provenance is excellent on P05 fact rows but absent on Case, Today and client progress. | Trust | 3 |
| 26 | AI-draft dashed edge `#A796D6` is 2.6:1; acceptable only while the text label stays. | Accessibility | 7 |
| 27 | No focus-order or RTL reading-order annotations; no motion specs or prototype links. | Accessibility | 7 |

## 9. Object → user label mapping (draft, for the design system docs)

Internal names stay in code. Labels are drafts in EN and BG; every catalog in `messages/_status.json` is `draft_unreviewed`, so a named reviewer must approve them per locale.

| Brief object | Repository equivalent (authority) | Label · EN | Label · BG (draft) | Status |
|---|---|---|---|---|
| RealtyCase | Client case — buyer, seller or rental — with Interests, Stage, Disposition (CONTEXT.md; architecture §6.2–6.3) | Client: My purchase / My sale / My rental · Staff: Deal (owner pick) | Клиент: Моята покупка / продажба / наем · Екип: Сделка | Exists · O05, C03 designed |
| Mandate | Legacy: authority envelope (grantor, effective/expiry, allowed actions and steps, limits, revocation history). `main`: Seller Instructions (spec only), `service_agreements`, party `AuthorityState` | Client: Our agreement · Staff: Mandate | Клиент: Нашето споразумение · Екип: Възлагане | Partial · also bounds what agents may do in autonomous mode |
| PropertyEvidencePack | Facts with state, source class, review record, freshness; Documents/Evidence; Media rights | Property file | Досие на имота | Exists in spec · O14 not designed |
| ConditionLedger | No single record: Proposal revision conditions + Tasks/Commitments + country/service checklist with named professional (§6.5) | Path to completion | Път до приключване | Gap · proposed read model |
| RegulatorySnapshot | Not modelled; architecture §3.2 forbids inventing local legal requirements | Rules that applied (checklist version) | Приложими правила (версия) | Not in spec · needs decision |
| Source provenance | Source class + review record + listing version + activity event | Source · How we know this | Източник · Откъде знаем | Exists |
| Agent action verdict | Legacy: executor kind human/agent per action, execution mode manual/autonomous per case. `main`: Butler (ex-Hermes) draft → human Approval bound to a version → Operation receipt | Done automatically · Awaiting your approval · Blocked · Do it myself | Изпълнено автоматично · Чака вашето одобрение · Блокирано · Ще го направя сам | Decision C2 (autonomy boundary) |
| Receipt | Operation receipt; Inquiry receipt (P12) | Receipt | Потвърждение | Exists |
| Counterparty professional | External specialist / adviser / invited collaborator, record-scoped grant | Lawyer · Notary · Lender (invited) | Адвокат · Нотариус · Кредитор (поканен) | Partial · task link not designed |

## 10. Screen coverage (ux-spec §14–§16 vs both Figma files)

| Id | Contract | `jlaAG…` status | `jlaAG…` frames | `PxfBJ2…` |
|---|---|---|---|---|
| P01 | Home and intent entry | Designed | 1440 · 390 · 390 HE · 7 states | 1440 · 390 · prototype |
| P02 | Results | Designed | 1440 · 390 · 390 HE · 9 states | 1440 · 390 · prototype |
| P03 | Filter editor | Designed | 1440 · 390 · 6 states (1 HE) | 1440 · 390 · prototype |
| P04 | Map results | Designed | 1440 · 390 · 7 states | 1440 · 390 · prototype |
| P05 | Property detail | Designed | 1440 | 1440 · 390 · prototype |
| P06 | Media viewer | Not designed | — | 1440 · 390 · prototype |
| P07 | Comparison | Not designed | — | 1440 · 390 · prototype |
| P08 | Saved properties | Not designed | — | 1440 · 390 · prototype |
| P09 | Shared shortlist | Not designed | — | 1440 · 390 · prototype |
| P10 | Saved-search subscription | Not designed | — | 1440 · 390 · prototype |
| P11 | Inquiry or callback form | Designed | 1440 | 1440 · 390 · prototype |
| P12 | Inquiry receipt and reconciliation | Designed | 1440 (accepted) | 1440 · 390 · prototype |
| P13 | Viewing request | Started | 1440 skeleton only | 1440 · 390 · prototype |
| P14 | Verified viewing status | Not designed | — | 1440 · 390 · prototype |
| P15 | Area index and detail | Not designed | — | 1440 · 390 · prototype |
| P16 | Service and guidance content | Not designed | — | 1440 · 390 · prototype |
| P17 | Sell/Let entry | Not designed | — | 1440 · 390 · prototype |
| P18 | Owner intake | Not designed | — | 1440 · 390 · prototype |
| P19 | Owner-intake receipt | Not designed | — | 1440 · 390 · prototype |
| P20 | Team and contact | Not designed | — | 1440 · 390 · prototype |
| P21 | Unavailable and legacy property | Not designed | — | 1440 · 390 · prototype |
| P22 | Search recovery | Not designed | — | 1440 · 390 · prototype |
| P23 | Short-stay consultation | Not designed | — | 1440 · 390 · prototype |
| P24 | Help, privacy and accessibility | Not designed | — | 1440 · 390 · prototype |
| C01 | Client access and safe return | Designed | 1440 · 390 · 390 HE · 8 states | 1440 · 390 · prototype |
| C02 | Invitation acceptance | Designed | 1440 · 390 · 7 states | 1440 · 390 · prototype |
| C03 | Buyer/tenant overview and Case index | Designed | 1440 · 390 · 390 HE · 7 states | 1440 · 390 · prototype |
| C04 | Requirements/Brief | Designed | 1440 · 390 · 5 states | 1440 · 390 · prototype |
| C05 | Interests, shortlist and feedback | Designed | 1440 · 390 · 9 states/variants | 1440 · 390 · prototype |
| C06 | Appointment detail and response | Designed | 1440 · 390 · 8 states | 1440 · 390 · prototype |
| C07 | Case conversation | Designed | 1440 · 390 · 8 states (2 collapsed) | 1440 · 390 · prototype |
| C08 | Document requests and library | Designed | 1440 · 390 · 4 states (4 collapsed) | 1440 · 390 · prototype |
| C09 | Upload and replacement task | Designed | 1440 · 390 | 1440 · 390 · prototype |
| C10 | Proposal review and response | Designed | 1440 · 390 · 2 states | 1440 · 390 · prototype |
| C11 | Seller/landlord overview | Not designed | — | 1440 · 390 · prototype |
| C12 | Listing preview and instruction decision | Not designed | — | 1440 · 390 · prototype |
| C13 | Contact and subscription preferences | Not designed | — | 1440 · 390 · prototype |
| C14 | Supported-service consultation Case | Not designed | — | 1440 · 390 · prototype |
| C15 | Owner statement: retired | Retired | — | Retired |
| C16 | Closeout and remaining obligations | Not designed | — | 1440 · 390 · prototype |
| C17 | Participants and access | Not designed | — | 1440 · 390 · prototype |
| C18 | Personal-data request | Not designed | — | 1440 · 390 · prototype |
| O01 | Today | Designed | 1440 · 1024 · 390 · 5 states | 1440 · 390 · prototype |
| O02 | Inquiries and application-message triage | Designed | 1440 · 1024 · 390 · 7 states | 1440 · 390 · prototype |
| O03 | Inquiry detail and qualification | Designed | 1440 · 390 · 7 states | 1440 · 390 · prototype |
| O04 | Cases index | Designed | list · board · 390 · 4 states | 1440 · 390 · prototype |
| O05 | Case workspace | Designed | 1440 · 1024 · 4 tabs · 6 states | 1440 · 390 · prototype |
| O06 | Party and authorized relationships | Designed | 1440 · 5 states | 1440 · 390 · prototype |
| O07 | Matching and shortlist preparation | Designed | 1440 · 5 states | 1440 · 390 · prototype |
| O08 | Calendar and itinerary | Designed | agenda · week · 1024 · 390 · 7 states | 1440 · 390 · prototype |
| O09 | Appointment workbench | Designed | 1440 · 7 states | 1440 · 390 · prototype |
| O10 | Inventory | Not designed | — | 1440 · 390 · prototype |
| O11 | Property identity and relationships | Not designed | — | 1440 · 390 · prototype |
| O12 | Listing source editor | Not designed | — | 1440 · 390 · prototype |
| O13 | Media and placement | Not designed | — | 1440 · 390 · prototype |
| O14 | Facts and source evidence | Not designed | — | 1440 · 390 · prototype |
| O15 | Locale translation work | Not designed | — | 1440 · 390 · prototype |
| O16 | Approval and publication review | Not designed | — | 1440 · 390 · prototype |
| O17 | Publication destinations and outcome | Not designed | — | 1440 · 390 · prototype |
| O18 | Tasks and commitments | Not designed | — | 1440 · 390 · prototype |
| O19 | Proposal preparation and negotiation record | Designed | 1440 | 1440 · 390 · prototype |
| O20 | Document review | Not designed | — | 1440 · 390 · prototype |
| O21 | Editorial content | Not designed | — | 1440 · 390 · prototype |
| O22 | Operational reports | Not designed | — | 1440 · 390 · prototype |
| O23 | Team, access and coverage | Not designed | — | 1440 · 390 · prototype |
| O24 | Service policy and release controls | Not designed | — | 1440 · 390 · prototype |
| O25 | Integration and recovery exceptions | Not designed | — | 1440 · 390 · prototype |
| O26 | Audit and privacy operations | Not designed | — | 1440 · 390 · prototype |
| O27 | Duplicate comparison, merge and split | Not designed | — | 1440 · 390 · prototype |
| O28 | Import and durable batch result | Not designed | — | 1440 · 390 · prototype |
| O29 | Supported-service consultation queue | Not designed | — | 1440 · 390 · prototype |
| O30 | Supported-service request detail | Not designed | — | 1440 · 390 · prototype |
| O31 | Owner-statement reconciliation: retired | Retired | — | Retired |
| O32 | Contextual assistance review | Not designed | — | 1440 · 390 · prototype |
| O33 | Material correction and exposure reconciliation | Not designed | — | 1440 · 390 · prototype |
