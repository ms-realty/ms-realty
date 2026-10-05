# MS Realty zero-learning gate

MS Realty adaptation of the HELM zero-training gate (`Mindburn-Labs/output/helm-control/ZERO-TRAINING-GATE.md`). Owner rules: `design/audit.md` section 7A (zero learning, D10), the object → label table in section 9, and the journey rules in the canonical FigJam journeys (W01–W14).

Goal: a first-time visitor, client, broker or coordinator finishes their job without training, a manual or a colleague. Every screen says in one sentence what to do next, internal model names stay out of primary surfaces, buttons name a verb and an object and state their effect and limit, empty states start the work, and Butler is optional help with a manual path always available.

This is a gate, not a report. A journey that fails any threshold does not pass its stage:

- a Figma journey does not go to code;
- a journey PR does not merge;
- the deployed staging build does not count towards launch evidence.

Passing this gate does not make the system production-ready. Launch authority stays with `production/data/launch-readiness.json` and `production/data/launch-input-checklist.md`.

Scope (owner rule: the entire UI is zero-training, no exemptions): every screen and state of every journey W01–W14 on the public website (visitor), the client area and Agency OS (staff), at Desktop 1440 and Mobile 390, plus Hebrew right-to-left at Mobile 390 for public and client screens. No screen ships on any surface without passing. User-facing text produced by the server counts too (errors, receipts, notifications and emails). G2 applies in every supported locale of the surface: seven (bg, en, ru, de, nl, el, he) on public and client surfaces, three (bg, en, ru) on staff surfaces (owner decision). Bulgarian is the source locale; Hebrew frames are drafts for layout review until a person approves the copy.

## G1 First-time task success

- Tasks: one key per journey (`design/zero-learning/W03-expected-path-key.md`, `design/zero-learning/keys/Wnn.md`). Each task has a plain goal for testers and, for the judge only, the expected path as frame names and node ids, the expected action count, a success criterion and the required states (for example unknown outcome).
- Testers: a fresh context per tester and per batch, given only the screens and the goal. No docs, no glossary, no frame or layer names, no MS Realty vocabulary, no hints in the prompt. Image files are renamed to neutral names (`s01.png` …) before they reach a tester; the mapping stays in the judge copy.
- Two tiers, both required:
  - **Novice proxy:** Claude Haiku (a Claude Code subagent with `model: haiku`, fresh context, no tools other than reading the batch images).
  - **Second model family:** a GPT tester through the Codex CLI at `/Applications/Codex.app/Contents/Resources/codex`, for example `codex exec --ephemeral --skip-git-repo-check -s read-only -i s01.png -i s02.png … "<prompt>"`.
- Batch limit: at most **20 images per tester batch**. A task whose path needs more screens is split across batches by start screen, never by dropping screens from the path.
- Protocol: the tester gets the start screen first and the remaining batch screens in shuffled order, then answers with the ordered actions (the visible control text, plus any value typed) and the screen they expect to end on. The judge replays the answer against the expected path and the wired prototype reactions on pages 12 / 13.
- Pass requires all of:
  - at least **90%** of covered tasks succeed on the first try **in each tier**;
  - **no task fails in both tiers**;
  - the **median number of actions is at most the expert path + 1** (an action is a tap, a click, a key press that submits, or one field entry).
- A task the screens do not cover is a **coverage gap**. It is reported separately and never counted as a pass.

## G2 Plain language

Primary surfaces (navigation, headings, body copy, buttons, field labels, alerts, empty states) use everyday words. The terms below may appear only inside an explicit «Технически подробности / Technical details / Технические подробности» disclosure. Sources: `design/audit.md` 7A (Z-1, Z-6) and section 9, the owner starter list in `design/acceptance/g2-terms.md`, and the W03 journey brief.

| Internal concept | bg (banned) | en (banned) | ru (banned) | Say instead |
|---|---|---|---|---|
| Case object | Случай, Преписка / преписки, `DEMO-CASE-NN` | case, case file | дело, кейс, случай | owner pick: «Сделка / Сделки» (en «Deal / Deals», ru «Сделка / Сделки») in staff nav, titles, search and buttons; titles name the person and the deal («Покупката на Алекс») |
| Disposition | Разпореждане, диспозиция | disposition | распоряжение, диспозиция | a sentence: «Приключено без сделка, защото …» |
| Brief | Бриф, Brief vN | brief | бриф | «Какво търси клиентът» |
| Coverage / queue ownership | Покритие, опашка за покритие | coverage | покрытие | «Още няма отговорник», «екипът в Сандански» |
| Engagement / commitment / mandate as an object | Ангажимент, Мандат | engagement, commitment, mandate | обязательство, мандат | «Следваща стъпка»; for the Mandate object the section 9 labels «Възлагане» (staff) and «Нашето споразумение» (client) |
| Interest (lettered) | Интерес A / B, интереси | interest A / B | интерес A / B | name the property («Имот №202») |
| Operation / operation id | операция, идентификатор на операцията, `DEMO-OP-NNN` | operation, operation id, idempotency key | операция, идентификатор операции | «същата заявка», «номер на запитването» |
| Party / party candidate | страна, кандидат-страна | party, party candidate | сторона | «човек или фирма», «възможен дубликат» |
| Editable model fields | Етап, Състояние (as fields), Цел | stage, state, purpose (as fields) | этап, статус (as fields) | one sentence that says where the work stands |
| Version labels on work screens | v3, Версия N | v3, version N | версия N | «последна промяна …»; the number stays in the history view |
| Technical jargon | worker, runtime, Payload, MFA, principal, ai_service, idempotency, receipt hash, digest, webhook | same | same | «потвърждение с втора стъпка», «фонова услуга» |
| Assistant internal names | Hermes, Jev | Hermes, Jev | Hermes, Jev | Butler |
| Assumed states (Z-6) | «Остаряло следващо действие», «Конфликт на версии» | stale next action, version conflict | устаревшее действие, конфликт версий | «Следващата стъпка е просрочена», «Някой е променил това междувременно» |
| Prototype markers | DEMO, ДЕМО, Демонстрационен, Демо среда | DEMO | ДЕМО | one «Пример» ribbon outside the product area in prototypes; never shipped |

- Any remaining domain word (оглед, отговорник, възлагане) is explained where it first appears on that screen by a subtitle, an example or a hover.
- Pass: **0 banned terms on primary surfaces**, counted per text node across every journey frame at every width and locale.

## G3 Leader parity (binary; every item must pass)

1. **One Butler entry everywhere.** The same Butler entry (rail item and one keyboard shortcut on staff screens, one «Попитайте Butler» entry on public and client screens) accepts plain language in all seven locales, shows what it will do before it does it, and always offers «Ще го направя аз» to the same screen.
2. **Fast first value.** A visitor sends an inquiry from a listing in at most 3 interactions and 2 minutes; a broker takes a new inquiry from Today or Inbox in at most 3 interactions.
3. **Live state and stop.** Anything long-running (Butler drafts, imports, bulk publishing) shows live progress and a Stop one step away. An atomic send shows that it is running, that it is sent once, and what happens if the connection drops.
4. **Consequences before irreversible actions.** Send, accept, assign, merge, publish, revoke and resolve state their effect and their limit in the button or one line next to it, never in a footnote.
5. **One primary action per empty state.** Every empty state offers exactly one primary next action that starts the work.
6. **No dead ends.** Every error says what happened and what to do next in plain words, keeps everything the person entered, and asks to correct only the stated fields.
7. **Unknown shown as unknown.** An unknown outcome is shown as «още не е потвърдено» with «провери същата заявка», never as success, failure, 0 or a guess, and never with a blind resend.
8. **Phone parity.** Send an inquiry, respond, accept or assign, and approve all work fully at 390 px, including Hebrew right-to-left.
9. **Keyboard and WCAG 2.2 AA.** Everything is reachable by keyboard in a logical order, focus is visible (focus colour #174EA6), targets are at least 24 × 24 px, text contrast meets AA in light and dark, and right-to-left layouts mirror reading order and directional icons.
10. **Speed without jumps.** Visible feedback on any interaction within 100 ms, a skeleton within 200 ms, and no layout shift: the control a person just pressed does not move.

## G4 Side-by-side with leaders

For each job, one verdict against the best leader for that job: **better / equal / worse**, with a one-line reason and the evidence used. A single «worse» fails the gate. Evidence comes from public pages and public help-centre documentation only; the evaluator does not create accounts, sign in or send inquiries to a leader.

| Side | Job | Leaders compared |
|---|---|---|
| Public | Contact the agent about a specific listing | Rightmove, Zillow, Idealista, Airbnb |
| Public | Know the inquiry arrived, who has it and what happens next | Rightmove, Zillow, Idealista, Airbnb |
| Public | Recover from a failed or uncertain send without sending twice | Rightmove, Zillow, Idealista, Airbnb |
| Staff | See new inquiries in a shared inbox and know which are unowned | Front, HubSpot inbox, Linear |
| Staff | Take or assign an inquiry with an owner and a follow-up time | Front, HubSpot inbox, Linear |
| Staff | Respond and set the next step | Front, HubSpot inbox, Linear |
| Staff | Hand over open work before an absence | Front, HubSpot inbox, Linear |

## Where it runs

The gate runs in dependency order. A stage starts when its inputs pass and ships when its gate passes.

| Stage | Input that must exist | Run by | Fixes by |
|---|---|---|---|
| Figma journey, before code | journey frames at Desktop 1440 and Mobile 390 (and Hebrew 390 for public journeys), wired prototype on pages 12 / 13, journey key, gate packet | an independent evaluator, never the designer | design session |
| Journey PR, before merge | PR preview deployed, same key | the PR owner with evidence attached to the PR | owning frontend session |
| Staging, before it counts as launch evidence | staging build with live services | controller acceptance | owning lane |

Results go to `Mindburn-Labs/output/msr-launch/zero-learning/<journey>-<stage>-<run timestamp>.md`, with the screens, the raw tester answers per tier and the verdicts.
