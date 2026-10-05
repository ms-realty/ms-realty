# W03 · Receive, own and qualify an inquiry — zero-learning gate result (run 2, Figma stage)

Run 3 (after the fix round) follows at the end of this file. Independent evaluator run of `design/zero-learning/GATE.md` on the W03 journey and the new P12 receipt states. The evaluator read the Figma file and exported frames only; nothing in Figma was changed. Key: `design/zero-learning/W03-expected-path-key.md`. Raw material: `/Users/ivan/Code/Mindburn-Labs/output/msr-launch/visual/w03-gate-packet/run-2/` (frames, tester folders, prompts, judge mapping, raw answers).

## Verdict

| Gate | Verdict | Why |
|---|---|---|
| G1 first-time task success | **FAIL** | Success on the first try: Haiku 20 of 32 covered runs (62.5%), GPT 26 of 32 (81.3%); both below 90%. Five runs fail in both tiers: T5 (Desktop and Mobile), T14 not public now (Desktop and Mobile), T14 availability unknown (Mobile). Median actions are within expert + 1 for every task in both tiers. T13a is a coverage gap. |
| G2 plain language | **PASS on the letter**, 24 advisory strings | 0 banned terms in 2,691 visible text nodes of 123 frames; the staff noun «Сделка» is allowed. 24 distinct strings (53 nodes, 13 staff screens) from the judgement list of `g2-terms.md` remain, one of them borderline. |
| G3 leader parity | **FAIL** | Items 2, 4, 5 and checks A and B pass. Items 1, 3, 6, 7 and 8 fail (partly or fully), item 9 has no frame evidence beyond static contrast and target size, item 10 is open. |
| G4 side-by-side | **PASS (no «worse»)** | 3 better, 4 equal, 0 worse on the seven jobs, from public pages and help-centre documentation only; the leaders' own screens were not observed. |
| **W03 overall** | **FAIL, does not go to code** | G1 and G3 fail; 18 defects below, 9 of them high. |

## Version under test and method

- Figma version «After C1a W03+P12» (id 2406915564060113647), the version named in `design/acceptance/phase-c1a-log.md` and `design/contracts/w03-p12.md`. The plugin API cannot read a version id, so the match was checked by content: all 125 frame ids of the key resolved on the expected pages, their names equal the C1a log, and the live text of the new frames equals the contract. The Phase C2 logs place their work on page 14, outside these frames.
- Frames: 125 exported in two sets. Desktop at scale 0.5 and Mobile at scale 1 in `run-2/frames/`; Desktop at scale 1 in `run-2/frames-desktop-scale1/`. Every frame of every batch and the new frames are in it (the 90 packet frames, the 7 + 7 handover frames, O27SEPARATE, P12MULTI, P12NONAME, P12INACTIVE, P12UNKNOWN, P12VIEW, the Hebrew saved-name receipt `613:55827`, and the destination frames P05, P02, P22, P20).
- **Deviation 1, Desktop scale.** A readability pilot at scale 0.5 (720 px wide) failed for both tiers: Haiku read «Приемете работата» as «Преместие работата» and the review time «10:00» as «15:00», GPT called the smallest text unreliable. As `W03-packet.md` prescribes for this case, Desktop testers got the scale 1 exports (1,440 px wide) for every run; the pilot replaced the rerun the packet would otherwise require. Mobile stayed at scale 1; frames taller than about 1,570 px (the P11 forms, O03 default 2,466 px, O05 default 2,335 px) are downscaled by the vision input, and Haiku mis-spelled several words there (for example «Согласен», «ведънък»). Nothing in a verdict rests on a misspelling alone.
- **Deviation 2, batches.** The 20-image limit and «split by start screen» gave six batches instead of five. VD and VM are as in the packet, VH holds the new Hebrew receipt, VR (6 images: start, P05, P02, P22, P12 generic, P11 default) serves T14 and T15, SD1 (20 images) serves T7 to T9 and now includes O27SEPARATE, and H (19 images) serves T10 to T13b. 34 runs per tier, one tester folder per run (`run-2/tester/rNN`), neutral names `s01.png …`, start screen first, the rest shuffled; the mapping is in `run-2/judge/mapping.json` and `mapping.md`.
- **Tiers.** Haiku: Agent tool, `model: haiku`, fresh context per run; the packet prompt plus one added sentence naming the folder and «Do not read any other file» (38 agents read only their own folder). GPT: `codex exec --ephemeral --skip-git-repo-check -s read-only -i s01.png …` run from the folder, model `gpt-5.6-sol` with medium reasoning because the default `gpt-6-sol` is rejected for this ChatGPT account; no shell command was run by any GPT tester. Raw answers: `run-2/answers/haiku-rNN.txt`, `codex-rNN.txt`, logs in `answers/logs/`.
- **Judging.** Actions replayed through the page 12 / 13 reactions (all new paths were read first; section «Prototype walk» of the key). Counting as in the key: tap, click or one field entry; opening and choosing in one field is one entry; automatic and waiting steps are not counted. A RESULT is judged against the replayed end frame, not against the tester's guessed END SCREEN (testers see no reactions); the key's explicit fail conditions apply. «Client not notified» in T7 is a secondary statement and does not fail a run by itself.
- **Extra diagnostic runs** (r35 to r38, not counted in G1): T14 not public now and availability unknown again with a batch that holds only the screens reachable from the start screen (start, P22, P20, P12 generic, P11 default), to separate the receipt's own wording from the contradicting listing and search pages of the main batch.

## G1 first-time task success

### Per task × viewport × tester (verdict, actions in brackets)

PASS and FAIL as defined above; GAP is a coverage gap, reported separately and not counted in the rates. «Expert / limit» is the key's expert path and the limit of expert + 1.

| Task | Runs (D · M) | Expert / limit | Desktop · Haiku | Desktop · GPT | Mobile · Haiku | Mobile · GPT |
|---|---|---|---|---|---|---|
| T1 Send a question about a specific apartment | r01 · r02 | 1 / 2 | PASS (1) | PASS (1) | PASS (1) | PASS (1) |
| T2 Send again after the connection dropped | r03 | 1 / 2 | — | — | PASS (1) | PASS (1) |
| T3 The question was not sent: fix it and send | r04 | 2 / 3 | PASS (2) | PASS (2) | — | — |
| T4 Fix the contact and send (phone) | r05 | 2 / 3 | — | — | PASS (2) | PASS (2) |
| T5 Did my question arrive? | r06 · r07 | 1 / 2 | FAIL (1) | FAIL (1) | FAIL (1) | FAIL (1) |
| T6 Hebrew: send the question | r08 | 1 / 2 | — | — | PASS (1) | PASS (1) |
| T7 Take a new inquiry and set the review time | r19 · r20 | 3 / 4 | PASS (3) | PASS (3) | FAIL (2) | PASS (3) |
| T8 Check for a duplicate without merging | r21 · r22 | 2 / 3 | FAIL (2) | PASS (2) | FAIL (1) | PASS (1) |
| T9 Attach the question to Alex's purchase | r23 · r24 | 2 / 3 | FAIL (2) | PASS (2) | PASS (2) | PASS (2) |
| T10 Hand over open work | r25 · r26 | 2 / 3 | FAIL (3) | PASS (3) | PASS (2) | PASS (2) |
| T11 Accept a colleague's work | r27 · r28 | 3 / 4 | PASS (3) | PASS (3) | PASS (2) | PASS (3) |
| T12 Turn down a colleague's work | r29 · r30 | 3 / 4 | PASS (3) | PASS (3) | PASS (2) | PASS (3) |
| T13a See the refusal, offer to someone else | r31 · r32 | — / — | GAP (2) | GAP (2) | GAP (2) | GAP (3) |
| T13b Take back an offer | r33 · r34 | 1 / 2 | FAIL (1) | PASS (1) | PASS (1) | PASS (1) |
| T14a Saved property · public now | r09 · r13 | 1 / 2 | FAIL (1) | PASS (1) | PASS (1) | PASS (1) |
| T14b Saved property · not public now | r10 · r14 | 1 / 2 | FAIL (1) | FAIL (2) | FAIL (1) | FAIL (2) |
| T14c Saved property · availability unknown | r11 · r15 | 1 / 2 | PASS (2) | FAIL (1) | FAIL (1) | FAIL (1) |
| T14d Saved property · no saved name | r12 · r16 | 1 / 2 | PASS (2) | PASS (1) | PASS (1) | PASS (1) |
| T15 Several properties in one question | r17 · r18 | 1 / 2 | PASS (1) | PASS (1) | PASS (1) | PASS (1) |

### Success rates and medians

| Measure | Haiku (novice proxy) | GPT (second family) | Threshold |
|---|---|---|---|
| Covered runs | 32 (T13a excluded as a gap) | 32 | |
| First-try success | 20 of 32 = **62.5%** | 26 of 32 = **81.3%** | at least 90% in each tier: **fails in both** |
| Desktop · Mobile | 8 of 15 · 12 of 17 | 12 of 15 · 14 of 17 | |
| Runs failing in both tiers | 5: r06 and r07 (T5 on both viewports), r10 and r14 (T14 not public now on both viewports), r15 (T14 availability unknown, Mobile) | | none allowed: **fails** |
| Median actions within expert + 1 | yes for every task | yes for every task | **passes** |

Median actions per task and tier (all runs of the task, failed ones included):

| Task | Expert | Limit | Median Haiku | Median GPT | Within limit |
|---|---|---|---|---|---|
| T1 | 1 | 2 | 1 | 1 | yes |
| T2 | 1 | 2 | 1 | 1 | yes |
| T3 | 2 | 3 | 2 | 2 | yes |
| T4 | 2 | 3 | 2 | 2 | yes |
| T5 | 1 | 2 | 1 | 1 | yes |
| T6 | 1 | 2 | 1 | 1 | yes |
| T7 | 3 | 4 | 2.5 | 3 | yes |
| T8 | 2 | 3 | 1.5 | 1.5 | yes |
| T9 | 2 | 3 | 2 | 2 | yes |
| T10 | 2 | 3 | 2.5 | 2.5 | yes |
| T11 | 3 | 4 | 2.5 | 3 | yes |
| T12 | 3 | 4 | 2.5 | 3 | yes |
| T13a | gap | — | 2 | 2.5 | n/a |
| T13b | 1 | 2 | 1 | 1 | yes |
| T14a | 1 | 2 | 1 | 1 | yes |
| T14b | 1 | 2 | 1 | 2 | yes |
| T14c | 1 | 2 | 1.5 | 1 | yes |
| T14d | 1 | 2 | 1.5 | 1 | yes |
| T15 | 1 | 2 | 1 | 1 | yes |

### What the failures say

1. **T5 (r06, r07, four of four runs).** Every tester tapped the right control, «Проверете същата заявка», and then named the committed receipt «Запитването е получено» as the screen they expect, although the batch also holds «Резултатът все още не е потвърден». The replayed frame says the opposite of what they report, which the key fails (false reassurance on an unknown outcome). The button reads as «give me the answer», and P12U nowhere prepares the visitor that the check can stay inconclusive (defect G-01).
2. **T14 not public now (r10, r14, both tiers, both viewports).** All four protocol runs say the listing can be opened although the page says «Тази обява вече не е активна.» Haiku tapped the property name as if it were a link (it has no reaction); GPT tapped «Вижте подобни имоти» and then opened №202 from the search page, which in the batch still shows №202 as a live card. In the diagnostic batch without P05 and P02, GPT (2 of 2) and Haiku on Mobile reached the right answer, Haiku on Desktop did not: the line is a plain caption of the same weight as the reference line (defect G-02), the name looks tappable (G-04), and the listing and search frames contradict the receipt (G-18).
3. **T14 availability unknown (r11 GPT, r15 both, r37 and r38 GPT).** The page draws no line about the unknown availability, only a button «Потърсете имот № 202». Of the eight runs, four asserted «open» without having opened the listing, one said «closed», two Haiku runs hedged (pass, no claim) and one found the listing through the search page (pass); nobody said that the page does not tell (defect G-03).
4. **T7.** All 3 runs that passed guessed another end screen than the claimed inquiry (O27PENDING, O03LR, O02 default, O03 default): the claim has no receipt, unlike the handover (defect G-05). Haiku on Mobile went straight to the «ready» frame and said the system had set the time; the key fails this.
5. **T8.** Both Haiku runs never opened the duplicate check (inbox search; a menu icon), both GPT runs did: the check is a quiet secondary button (G-06).
6. **T9.** One Haiku run reported the deal screen's «Уточнете изискването за асансьор» as the next step instead of the receipt's «Проверка на наличността преди предложение за оглед»: two different next steps for one deal (G-07).
7. **T10 and T13b.** One Haiku run reported that Nikol accepted: O23HP still carries the primary «Вижте приетото предаване» (G-08). Two Haiku runs read «Оттеглете предложението» as «reject» and one landed on the decline form (G-09).
8. **T13a, coverage gap in 4 of 4 runs.** All testers found Nikol's refusal and the button «Предложете на друг колега». The form that follows names Никол as a fixed receiver; GPT said STUCK once, the other three invented a picker (G-10).
9. **Passes that matter.** T1, T2, T3, T4, T6 and T15 pass in 16 of 16 tester runs; T11 and T12 pass in 8 of 8 (they typed or confirmed the shown values, so the empty required state of G-11 was not exercised); T13b passes in 3 of 4; the receipt with a saved name or a public listing (T14 a and d) passes in 7 of 8, the one failure being Haiku tapping the title.

### Coverage gaps (reported separately, never counted as passes)

- T13a: choosing a different colleague has no frame (O23H shows «Получател · Никол»; key defect K-4, G-10).
- T11: no «review time required» state for the receiver (G-11).
- T6 and the other Hebrew states: Hebrew sending, invalid, rejected, offline, unknown, status check, and the Hebrew variants of not public now, availability unknown, no saved name and several properties are not drawn.
- Job J6 of G4 (respond and set the next step) has no G1 task.
- Not drawn: stale (`version_conflict`), connection lost and empty-reason states of the handover commands; withdraw after the receiver answered.

### Raw answers and per-run verdicts

Each run, both tiers, with the reason. Raw text: `run-2/answers/`.

| Run | Task | Viewport | Haiku (actions) · reason | GPT (actions) · reason |
|---|---|---|---|---|
| r01 | T1 | Desktop | PASS (1) tapped «Изпратете запитването»; ended on the receipt; owner, language and number named | PASS (1) same; the automatic «Изпращаме…» step not counted |
| r02 | T1 | Mobile | PASS (1) same | PASS (1) same |
| r03 | T2 | Mobile | PASS (1) «Изпратете отново»; says number 024 prevents a second inquiry | PASS (1) same; waited, did not tap again |
| r04 | T3 | Desktop | PASS (2) replaced the email, kept the message; did not see the typo «exmaple» and invented a reason, but the path is right | PASS (2) replaced the email, kept the message |
| r05 | T4 | Mobile | PASS (2) named the contact field only; fixed and sent | PASS (2) same |
| r06 | T5 | Desktop | FAIL (1) right control, but predicted «Запитването е получено» (P12 committed); replayed end is «Резултатът все още не е потвърден»; says it arrived | FAIL (1) right control; predicted committed receipt; says it arrived and no second send was made |
| r07 | T5 | Mobile | FAIL (1) same: says «Запитванието е получено» | FAIL (1) same: says it arrived |
| r08 | T6 | Mobile | PASS (1) tapped «שליחת הפנייה»; received; a broker will contact by phone or email (loose) | PASS (1) received, Sandanski team, email alex@example.com, number 024 |
| r09 | T14a | Desktop | FAIL (1) tapped the property name, which has no reaction; reports a listing that opened | PASS (1) «Вижте имота»; names №202; listing opens |
| r10 | T14b | Desktop | FAIL (1) tapped the name; reports the listing opened though the page says it is not active | FAIL (2) tapped «Вижте подобни имоти», then a card in P02; says the listing can still be opened |
| r11 | T14c | Desktop | PASS (2) used «Разгледайте още имоти» and the search card, found and opened №202 through search | FAIL (1) tapped «Потърсете имот № 202» and states the listing opens (replay lands on P02); asserts «open» |
| r12 | T14d | Desktop | PASS (2) found №202 through search (not through «Вижте имота»); names it | PASS (1) «Вижте имота»; names №202 |
| r13 | T14a | Mobile | PASS (1) «Вижте имота»; names №202 | PASS (1) same |
| r14 | T14b | Mobile | FAIL (1) tapped the name although it reads «marked as inactive»; reports the listing opens | FAIL (2) «Вижте подобни имоти», then a card; says it can still be opened though the page says no longer active |
| r15 | T14c | Mobile | FAIL (1) tapped the name; says the link opens the listing | FAIL (1) «Потърсете имот № 202»; says the listing still opens (price 115 000 €) |
| r16 | T14d | Mobile | PASS (1) «Виж имота»; names №202 | PASS (1) «Вижте имота»; names №202 and that the name was not stored |
| r17 | T15 | Desktop | PASS (1) lists №202, №200 inactive, №912 not saved; opens №202 | PASS (1) same |
| r18 | T15 | Mobile | PASS (1) same | PASS (1) same |
| r19 | T7 | Desktop | PASS (3) tap, choose the time, tap; end screen guessed wrongly (O27PENDING or O03LR) | PASS (3) tap, choose 6 октомври 10:00, tap; says the client is not notified; end screen guessed O02 |
| r20 | T7 | Mobile | FAIL (2) went straight to the «ready» frame, says the system set the review time itself | PASS (3) tap, choose the time, tap; end screen guessed O03 default |
| r21 | T8 | Desktop | FAIL (2) used the inbox search; never opened the duplicate check; concludes Alex exists because of the new inquiry | PASS (2) duplicate check, then «Запазете като отделни контакти»; two records, identity unconfirmed, nothing merged |
| r22 | T8 | Mobile | FAIL (1) tapped a menu icon; concludes from reading the O27 screen, no valid control path | PASS (1) «Проверете за дубликат»; identity unconfirmed, no merge |
| r23 | T9 | Desktop | FAIL (2) did not name «Запишете свързването»; ends on the deal screen; next step «clarify the elevator access», not the availability check | PASS (2) link, record; next step availability check by Мария Д. |
| r24 | T9 | Mobile | PASS (2) link, record; next step availability check by Мария Д. | PASS (2) same |
| r25 | T10 | Desktop | FAIL (3) says Nikol accepts and the handover is complete (O23HD) | PASS (3) proposes; third tap «Вижте какво получава Никол»; says nothing moves until Nikol accepts |
| r26 | T10 | Mobile | PASS (2) proposes; waits for Nikol | PASS (2) same; work stays with the sender |
| r27 | T11 | Desktop | PASS (3) entered own next step, confirmed the time, accepted; ended on «Работата е при вас» | PASS (3) same (typed the shown values) |
| r28 | T11 | Mobile | PASS (2) accepted with the shown values, then «Към моите задачи» | PASS (3) entered both fields, accepted |
| r29 | T12 | Desktop | PASS (3) «Откажете с причина», reason, «Изпратете отказа»; work stays with Мария Д. | PASS (3) same |
| r30 | T12 | Mobile | PASS (2) decline, confirmed the shown reason, sent | PASS (3) same with a typed reason |
| r31 | T13a | Desktop | GAP (2) tapped «Предложете на друг колега»; invented a colleague picker | GAP (2) tapped it; «Получател» shows only Никол: STUCK |
| r32 | T13a | Mobile | GAP (2) invented a colleague picker; low confidence, notes the missing screen | GAP (3) chose «another colleague» that is not on screen |
| r33 | T13b | Desktop | FAIL (1) read «Оттеглете предложението» as «reject»; ended on the decline form | PASS (1) «Оттеглете предложението»; work stays with the sender |
| r34 | T13b | Mobile | PASS (1) right control and end frame; calls it «rejected» but the work stays with the sender | PASS (1) withdrawn before the answer |

### Diagnostic runs (reachable-only batch, not counted in G1)

Start screen plus P22, P20, P12 generic and P11 default; no P05, no P02.

| Run | Variant | Viewport | Haiku (actions) · reason | GPT (actions) · reason |
|---|---|---|---|---|
| r35 | T14b | Desktop | FAIL (1) tapped the name; says the page may still be viewable | PASS (1) tapped the name, stayed; says it cannot be opened (not active) |
| r36 | T14b | Mobile | PASS (1) «Разгледайте още имоти», sees no match; says it cannot be opened | PASS (1) says no longer active, only similar properties are offered |
| r37 | T14c | Desktop | PASS (1) «Потърсете имот № 202»; no definite claim (hedged) | FAIL (1) «Потърсете имот № 202»; says the listing can still be opened |
| r38 | T14c | Mobile | PASS (1) «Потърсете имот № 202»; no definite claim (hedged) | FAIL (1) «Потърсете имот № 202»; says the search finds nothing, so it can no longer be opened |

## G2 plain language

Full read of the visible text of 123 frames (2,691 nodes visible, 712 hidden and skipped), scanned against the GATE.md G2 table in bg, en and ru, `design/acceptance/g2-terms.md` (owner starter list, extra terms and judgement candidates) and the demo fragments. Details and node ids are in the key, section «G2 check».

- **Banned terms on primary surfaces: 0** in every group (case object «Случай / Преписка / дело / case» 0, was 113 nodes before the rename to «Сделка»; DEMO markers 0; «Ангажимент / Мандат», «Покритие», «Бриф», «Интерес», «операция / идентификатор», version labels, assumed states, technical jargon, Hermes / Jev: all 0). The four O05 field labels are fixed. Public frames, Hebrew included: 0 hits of any kind. The staff noun «Сделка / Сделки» is allowed and consistent (rail, titles, buttons, receipts).
- Reviewed and not counted: «безопасен статус на обявата» in the O03 lead sentence (`18:864` · `16:526`), prose about the listing, not a field.
- **Advisory, 24 distinct strings on 13 staff screens (53 nodes)**, outside the GATE list: «Кандидатът е проверен от човек» (O03L, `I20:1153;6:61`, the party-candidate family: borderline), «Квалифициране и продължение» (`18:863`), «Създаване след квалифициране» (O03N `21:2483`), «Идентичност», «самоличност» (O03L `I20:1164;6:408`, O27 `I14:1677;6:408`, `I14:1689;6:185`, `I14:1701;6:99`, O23OFF `327:15163`), «Обхват» (O23H and states `I21:886;6:59`, O23 `18:1233`, O05 `18:1086`, O02MINE `75:19649`), «Още няма назначен» (O03 `I18:847;6:61`), «неавтентикирани» (O23 `18:1266`), «втори фактор» (O23 `18:1282`, the plain-language form of MFA that the list says to rephrase), «границата с доставчика» (O23 `18:1273`), «упълномощеният ръководител» (O23HP `I21:1097;6:408`), «Действащ акаунт» and «активните сесии, ключовете за вход» (O23OFF `327:15138` · `327:15157`), «общата опашка на екипа» (O02 new `I602:18822;6:401`); the time-zone name «Europe/Sofia» in 12 date lines. Domain words that need an explanation on first use are explained in place (оглед on P12VIEW, отговорник on O02 new in queue, заместване on O23).
- Server text: `design/copy/server-messages.md` section 6 (handover and inquiry receipts): 0 hits outside code spans.
- Locales: the frames are Bulgarian (Hebrew for two public frames); en, ru, de, nl and el are covered only by the copy deck and are not scanned at frame level.

## G3 leader parity

Item by item for the W03 packet; node-level evidence is in the key, section «G3 checklist». Tester evidence is cited by run.

| # | Item | Verdict | Frames and evidence |
|---|---|---|---|
| 1 | One Butler entry everywhere | **FAIL (partial)** | Present on all 33 P11 / P12 frames (Desktop, Mobile, Hebrew) including P12U, P12UCHECK and the six receipt variants; rail item on every Desktop staff frame except the rail-less receipts O27PENDING (`52:5335`) and O27SEPARATE (`606:44379`); none on Mobile staff frames beyond O01 and O03. Not wired, no answer frame, «Ще го направя аз» in 0 nodes, no keyboard shortcut annotation (G-13). |
| 2 | Fast first value | PASS | T1 1 action (4 of 4 testers); T7 3 actions; T11 and T12 1 to 3 actions (all 8 tester runs passed). |
| 3 | Live state and stop | **FAIL (partial)** | `P11 · Sending` and `O01 · Loading` pass. No running, sent-once or connection-drop state for the staff atomic commands: O03 accept (`602:19066`), O03L link (`20:1055`), O23H propose (`21:788`), O23HR accept (`606:45687`), O23HRD send (`606:46469`), O23HP withdraw (`21:948`) (G-12). |
| 4 | Consequences before irreversible actions | PASS | Send, accept (`602:19188`), merge (O27), propose (`I21:937;6:408`), receiver accept (`I606:45913;6:401`), receiver decline (`I606:46614;6:401`). Advisory: «Оттеглете предложението» has no effect line (G-09). |
| 5 | One primary action per empty state | PASS | `O02UNCLAIMED`, `O01 · Empty`, `O01 · Error`, `O01 · Offline` each have one primary. |
| 6 | No dead ends | **FAIL (partial)** | P11 invalid, rejected and offline pass (T2 to T4 passed 6 of 6 tester runs); the new receipts always give a way on. No error, conflict, connection-lost or empty-reason frame for the handover commands (G-12). |
| 7 | Unknown shown as unknown | **FAIL** | `P12U` and `P12UCHECK` carry the words, but T5 fails 4 of 4 (G-01); `P12UNKNOWN` (`613:55676` · `613:55756`) says nothing about the unknown availability and testers read it as open or closed (G-03); no unknown-outcome frame for the handover commands (G-12). |
| 8 | Phone parity | **FAIL** | Bulgarian: every state exists at 390 and the action counts equal Desktop. Hebrew: only P11 filled and the P12 saved-name receipt; missing P11 default, invalid, sending, rejected, offline, P12U, P12UCHECK and the Hebrew not public now, availability unknown, no saved name, several properties, viewing request (G-14). |
| 9 | Keyboard and WCAG 2.2 AA | **NO EVIDENCE (counts as fail)** | Static: 0 of 2,691 visible text nodes below AA contrast (lowest 5.74:1); 1,033 click targets on the 102 prototype frames of the journey, 0 below 24 × 24 px. Not provable in Figma: focus order, visible focus colour #174EA6, dark-mode contrast, right-to-left mirroring (G-15). |
| 10 | Speed without jumps | OPEN | `P11 · Sending` keeps the pressed button in place; timings need the PR-preview run. |
| A | Next-step line on each screen | PASS | 59 of 59 W03 screens (key table). |
| B | No past dates | PASS | Scenario clock 5 октомври 2026; every forward date is later (6, 7, 8, 9, 13 октомври, «След 2 работни дни»). |

Right-to-left check of the Hebrew receipt `613:55827` (Mobile): №202, 115,000 € style numbers, «№ 202» and alex@example.com read left to right inside the Hebrew lines, the Bulgarian title keeps its own direction in a right-aligned row, the link «לצפייה בנכס» and the three buttons are mirrored. No defect found.

## G4 side-by-side with leaders

Evidence: public listing pages and public help-centre or documentation pages only, collected by a separate research agent (no account, no sign-in, nothing sent to any leader). The leaders' own post-send and failure screens were not observable, so verdicts compare the designs with the documented behaviour. Evidence gaps: Idealista's pages were behind a bot challenge and were not bypassed (no verdict rests on Idealista alone); Zillow's help centre partly returned 403; Airbnb's composer is behind log-in.

| Side | Job | Screens | Best leader for the job and what it does | MS Realty | Verdict |
|---|---|---|---|---|---|
| Public | Contact the agent about a specific listing | P05 → P11FILLED → P11SENDING | Zillow and Rightmove: a «Contact» control on the listing opens a short form with the listing prefilled, 2 steps; Rightmove sends as a guest, Airbnb needs a log-in and dates ([Rightmove FAQ 7000049007](https://faq.rightmove.co.uk/support/solutions/articles/7000049007-i-m-interested-in-a-property-what-do-i-next-), [Zillow help zd213787577](https://www.zillow.help/article/how-do-i-contact-a-listing-provider-or-buyers-agent-zd213787577), [Airbnb help 147](https://www.airbnb.com/help/article/147)). | 2 interactions from the listing to a prefilled form, 1 to send; no account; the limit of the send is stated before it («Не резервира оглед и не потвърждава наличност»). | **equal** (same step count; clearer limit) |
| Public | Know the inquiry arrived, who has it and what happens next | P12 committed and the receipt variants | Airbnb: host named, response rate and typical response time on the listing, one persistent thread in Messages, read receipts ([help 3702](https://www.airbnb.com/help/article/3702), [help 3558](https://www.airbnb.com/help/article/3558)); Rightmove lists sent enquiries with the date for accounts, Zillow names an agent only after a live call connects ([Rightmove guide](https://www.rightmove.co.uk/guides/keep-track-of-your-sent-enquiries-to-estate-agents/)). | Names the responsible team, the channel and language, «брокер още не го е прочел», no deadline until a broker confirms, the number, and the saved property with its listing status. No persistent thread and no response-time cue for an anonymous visitor. | **equal** (clearer than Rightmove and Zillow on who and what next, below Airbnb on the persistent thread) |
| Public | Recover from a failed or uncertain send without sending twice | P11 invalid / rejected / offline, P12U, P12UCHECK | The public help of all four shows no failed, pending or retry wording; Airbnb offers a 15-minute edit and a 24-hour unsend and advises against several requests for the same dates; Rightmove documents only the New Homes case of an unverified email that silently drops the enquiry ([Airbnb help 3558](https://www.airbnb.com/help/article/3558), [Rightmove New Homes FAQ](https://customerfaq.rightmove.co.uk/support/solutions/articles/7000098055-buyer-profile-and-appointment-booking-new-homes-)). | Four drawn states keep every value, name the field, reuse the same number on retry and show an unknown outcome with a same-request check. G1 shows the unknown state is not yet understood (T5, G-01). | **better** on documented coverage; the T5 defect must close before this counts in the build |
| Staff | See new inquiries in a shared inbox and know which are unowned | O02 default, new in queue, unclaimed, mine | Front: tabs «Unassigned» and «Assigned» with counters; HubSpot: «Unassigned», «Assigned to me», «All open»; Linear Triage is an inbox of unreviewed items ([Front 2159](https://help.front.com/en/articles/2159), [HubSpot inbox](https://knowledge.hubspot.com/inbox/use-the-conversations-inbox), [Linear triage](https://linear.app/docs/triage.md)). | Tabs for unclaimed and mine, per-row «Отговорник: още няма», an empty state that explains why «още няма» is not «свободен», a one-line next step. Counters were not verified. | **equal** |
| Staff | Take or assign an inquiry with an owner and a follow-up time | O02 new, O03 accept (time required, ready), O03 assign | Front: assign in the toolbar, snooze with presets as a separate step; HubSpot: owner dropdown, snooze or task separately; Linear: accepting in Triage does not assign, due date and «Remind me» are optional ([Front 2344](https://help.front.com/en/articles/2344), [Front 2088](https://help.front.com/en/articles/2088), [Linear assigning](https://linear.app/docs/assigning-issues.md)). | One required step sets the owner and a future review time (no default), states «клиентът не получава съобщение», 3 actions; T7 passed 3 of 4 runs. | **better** (follow-up cannot be skipped; same step count) |
| Staff | Respond and set the next step | O03 default (reply, next action, condition) | Front: «Send & snooze» sets the follow-up with the send; HubSpot: reply plus status or snooze; Linear: comment plus status, assignee, due date ([Front 2088](https://help.front.com/en/articles/2088), [Linear triage](https://linear.app/docs/triage.md)). | Draft with a human review, «Следващо действие» and a condition on the same screen; manual path next to Butler. Not exercised by a G1 task. | **equal** (design read only) |
| Staff | Hand over open work before an absence | O23, O23H, O23HP, O23HR and its four states, O23HPD, O23HPX | Front: reassign before leaving, bulk up to 10,000, no receiver approval; HubSpot: out-of-office only stops new auto-assignment, removal unassigns, no accept or decline; Linear: bulk reassign, the assignee is notified, no accept or decline ([Front 2197](https://help.front.com/en/articles/2197), [HubSpot working hours](https://knowledge.hubspot.com/user-management/manage-user-working-hours-for-inbox-and-help-desk), [Linear members](https://linear.app/docs/members-roles.md)). | Explicit offer, the receiver accepts with an own next step and review time or declines with a reason, withdraw differs from decline, the work stays with the sender until the accept is read back, receipts on both sides. Slower than a bulk reassign; no receiver picker or scope selection yet (G-10). T11, T12 and T13b pass. | **better** |

**G4 result: no «worse», so the gate passes at the Figma stage.** 3 better, 4 equal. Two of the verdicts carry a condition from this run: the «better» on the failed or uncertain send needs G-01 closed, and the staff handover needs the receiver picker (G-10) before it counts in a build.

## Defect list (bounded: 18)

Severity: **high** fails a gate item or a G1 task in both tiers; **medium** fails a task in one tier or a gate item in part; **low** advisory. Node ids are Desktop · Mobile design frames unless a prototype id is named. «Smallest fix» means the smallest change in the Figma file that removes the failure.

| ID | Sev | Frame | Node id | What fails | Smallest fix |
|---|---|---|---|---|---|
| G-01 | high | P12U unknown outcome | line `22:1683` · `24:2220`; button `I22:1691;6:3` · `I24:2228;6:3` (proto `66:36418` · `66:56358`) | T5: 4 of 4 testers tap «Проверете същата заявка» and expect «Запитването е получено»; nothing says the check can stay inconclusive (G1, G3-7). | Add one sentence under the line: «Проверката не изпраща ново запитване. Може да покаже, че резултатът още не е потвърден.» |
| G-02 | high | P12INACTIVE not public now | line `613:55596` · `613:55668` | T14b: all 4 protocol runs and 1 of 4 diagnostic runs say the listing opens; the status is a plain caption of the same weight as the reference line (G1). | Rewrite the line to «Тази обява вече не е активна и не може да се отвори.», set it in the warning text style above the button; keep «Вижте подобни имоти». |
| G-03 | high | P12UNKNOWN availability unknown | block `613:55742` · `613:55813`; button `I613:55749;6:9` · `I613:55820;6:9` | T14c: 4 of 8 runs assert «open», 1 «closed», none says the page does not know; the contract row (e) draws no availability line (G1, G3-7). | Add one muted line under «№ 202»: «Не можем да проверим сега дали обявата още е активна.» and update row (e) of the contract. |
| G-04 | high | All P12 receipt variants and P12MULTI rows | titles `613:55252`, `613:55594`, `613:55747`, `613:55324` (+ Mobile twins) | The saved title looks like the link: 7 of 24 T14 tester runs tapped it and reported a listing that opened; it has no reaction (G1). | Make the title the link target wherever «Вижте имота» exists; where no link exists keep the title plain with the line under it. |
| G-05 | medium | O03 · Accept · ready (claim of an inquiry) | primary `I602:19156;6:3` (proto `602:20083` · `602:20681`) → O03L | T7: no receipt after the claim; all 3 passing runs guessed another end screen (O27PENDING, O03LR, O02 default, O03 default); key D-3. | Add an «accepted» receipt in the pattern of O23HRA («Запитването е при вас. Преглед: 6 октомври, 10:00. Клиентът не е уведомен.») and point the primary at it. |
| G-06 | medium | O03 default | button `I18:860;6:6` · `I16:522;6:6` | T8: both Haiku runs never opened the duplicate check (inbox search, a menu icon). | Rename to «Проверете дали Алекс вече е в системата» and place it beside the contact row. |
| G-07 | medium | O03LR link recorded vs O05 deal | `20:1273` · `25:2306` vs `18:1031` · `16:626` | T9: one run reported the deal's next action («Уточнете изискването за асансьор») instead of the receipt's («Проверка на наличността…»): two next steps for one deal. | Use one wording for both, or label them «по запитването» and «по сделката». |
| G-08 | medium | O23HP pending | primary `I21:1104;6:3` · `I25:2938;6:3` → O23HD | T10: one run reported that Nikol accepted; the pending state keeps a shortcut to the accepted state (K-3; contract: no screen may say the work moved before the accept). | Remove the shortcut from the pending frame; make «Към текущото заместване» the primary. |
| G-09 | medium | O23HP pending | button `I606:48742;6:9` · `I606:48746;6:9` | T13b: two Haiku runs read «Оттеглете предложението» as «reject»; one ended on the decline form; no effect line before the tap (G3-4 advisory). | Add «Работата остава при вас. Никол ще види „Предложението е оттеглено“.» next to the button. |
| G-10 | high | O23H after «Предложете на друг колега» | row `I21:881;6:61` · `I25:2783;6:61` | T13a: coverage gap in 4 of 4 runs; the form fixes «Получател · Никол» (K-4). | Add a receiver choice that excludes the colleague who declined, and its recorded state. |
| G-11 | medium | O23HR | fields `I606:45905;6:61` · `I606:45909;6:61` (Mobile `I606:46082;6:61` · `I606:46086;6:61`) | T11: both fields are shown filled, there is no empty state with a disabled primary and the rule «Няма час по подразбиране» as on O03 · Accept; the filled review time reads as a default (K-2). | Add `O23HR · time required` (fields empty, primary disabled, the O03 rule line) and keep the filled frame as «ready». |
| G-12 | high | Staff atomic commands | O03 accept `602:19066`; O23H `21:788`; O23HP `21:948`; O23HR `606:45687`; O23HRD `606:46469` | G3-3, 6, 7: no running, sent-once, conflict, connection-lost or unknown state; the stale case is not drawn. | Add sending, «Някой е променил това междувременно» and unknown frames for O23HR accept in the pattern of P11SENDING and P12U; reuse for the others. |
| G-13 | high | Butler entry, all frames | public `I605:24892;6:17` and the other 32 instances; staff rail `18:1198`; O27PENDING `52:5335`, O27SEPARATE `606:44379` (no rail) | G3-1: not wired, no «what it will do» frame, «Ще го направя аз» in 0 nodes, no shortcut annotation (D-1). | Add one Butler answer frame (what it will do, «Ще го направя аз» to the same screen), wire all entries to it, annotate the shortcut. |
| G-14 | high | Hebrew set | P11 `11:1469`-class frames, P12U `22:1666`, P12UCHECK `66:34211`, P12 variants | G3-8: Hebrew P11 default, invalid, sending, rejected, offline, P12U, P12UCHECK and the new receipt variants are not drawn. | Draw the Hebrew Mobile frames of the same states (Phase C2 holds the Desktop public set on page 14). |
| G-15 | high | All W03 frames | none | G3-9: focus order, focus colour, dark-mode contrast and right-to-left mirroring are not shown in any frame; static contrast and target size pass. | Add a focus-order annotation to the journey key frames, then prove on the PR preview. |
| G-16 | medium | P12MULTI | `606:54515` · `606:54553` (instance `I606:54055;6:3`) | The primary «Към същото сравнение» has only ON_HOVER and no click to P07 (`63:26243` · `66:55880`) (K-1). | Add the ON_CLICK reaction. |
| G-17 | low | Staff screens | O03L `I20:1153;6:61` and 23 more strings (G2 section) | Advisory G2: «Кандидатът е проверен от човек» (borderline), «квалифициране», «самоличност», «обхват», «втори фактор», «акаунт», «сесии» and others. | Replace with the plain forms listed in `g2-terms.md`, for example «Човекът е проверен» and «потвърждение с втора стъпка». |
| G-18 | low | O23HR rail and O23 team list; P02 / P05 vs P12INACTIVE | `606:45756` vs `18:1254`; P02 `11:780`, P05 `11:1031` | Role mismatch «Брокер» vs «Координатор» for Никол (K-5); the listing and search frames show №202 live next to a receipt that says it is not active (K-6), which misled both tiers in the protocol batch. | Use one role; in the T14b fixture remove №202 from P02 or mark it «не се показва». |

### Notes on the defect list

- 18 defects: **9 high** (G-01, G-02, G-03, G-04, G-10, G-12, G-13, G-14, G-15), 7 medium, 2 low. G-02, G-03 and G-04 are one-line copy or link changes and carry the three T14 both-tier failures; G-01 closes the two T5 failures.
- Not a defect: the right-to-left read of the Hebrew saved-name receipt `613:55827` found nothing.
- Sequence for the next design pass (no dates): first G-01 to G-04 and G-08 to G-11 (copy, links, one empty state), then G-05, G-10 and G-12 (new frames), then G-13 to G-15 (Butler panel, Hebrew set, accessibility annotations); re-run T5, T7 to T14 and the diagnostic batch after each group.

## Files

- `design/zero-learning/W03-expected-path-key.md` (updated), `design/zero-learning/keys/W01.md` (one line), this file.
- `/Users/ivan/Code/Mindburn-Labs/output/msr-launch/visual/w03-gate-packet/run-2/`: `frames/` (Desktop 0.5, Mobile 1, 125 PNG), `frames-desktop-scale1/` (61 PNG), `tester/rNN/` (38 neutral folders), `judge/` (`mapping.json`, `mapping.md`, `prompts/`), `answers/` (`haiku-rNN.txt`, `codex-rNN.txt`, `logs/`).

<!-- RUN3-START -->

# Run 3 — W03 + P12 after the fix round (Figma stage)

Independent evaluator re-run of `design/zero-learning/GATE.md` on W03 and P12 after the public and staff fix rounds. Nothing in Figma was changed (exports, text and reaction reads only). Key: `design/zero-learning/W03-expected-path-key.md` (updated for this run). Raw material: `/Users/ivan/Code/Mindburn-Labs/output/msr-launch/visual/w03-gate-packet/run-3/` (`frames/` 139 PNG, `tester/` folders, `judge/mapping.json`, `judge/mapping.md`, `judge/prompts/`, `answers/`).

## Run 3 · version under test and method

- Figma versions «W03 fix public done» (id 2406936889649113691) and «W03 fix staff done» (id 2406943983880794330). The plugin API cannot read a version id; the match was checked by content: all node ids named in `design/acceptance/w03-fix-public-log.md` and `w03-fix-staff-log.md` resolved, 200 frames (Desktop and Mobile) were read through the bridge, and the live text of the new frames equals `design/contracts/w03-p12.md`.
- Frames: 139 PNG at scale 1 (Desktop 1440 and Mobile 390; Desktop at scale 1 for testers, as in run 2 after the readability pilot), neutral names, one tester folder per run (`s01.png` is the start screen, the rest shuffled, at most 20 images). Batches: VD (10) and VM (10) for T5, VH (13 Hebrew) for T6, VR (6) for T14 and T15, VB (13) for T16, SD1 (20) for T7 to T9, HS (20, sender side) for T10, T13a, T13b, HR (20, receiver side) for T11 and T12, SX (14) for T17. 35 runs, 70 tester runs.
- Tiers: Haiku through the Agent tool (`model: haiku`, fresh context, the template prompt plus the folder sentence and «Do not read any other file»); GPT through `/Applications/Codex.app/Contents/Resources/codex exec --ephemeral --skip-git-repo-check -s read-only -m gpt-5.6-sol -c model_reasoning_effort=medium -i s01.png …` from the run folder, as in run 2. Raw answers: `answers/haiku-rNN.txt`, `answers/codex-rNN.txt`, logs in `answers/logs/`.
- Same protocol and counting rule as run 2. Judging replays the actions through the page 12 / 13 reactions (the reactions were re-read for all 432 Desktop and 446 Mobile prototype frames, section «Prototype walk» of the key). A RESULT is judged against the replayed end frame.
- **Re-run set.** Requested: T5, T6, T7, T10, T11, T12, T13a, T13b, T14 (four variants), T16, T17. Added by the evaluator because their frames changed and run 2 had failures or the fix targeted them: T8 (G-06), T9 (G-07), T15 (P12MULTI rows). T16 has two variants (a: answerable question, b: no data and hand-off to a broker); T17 is new.
- **Kept run-2 verdicts (frames unchanged for the task):** T1, T2, T3, T4 (all 10 tester runs passed in run 2; their P11 start frames did not change, only the Butler wiring and focus annotations outside the frames; the P12 receipt only gained the title link and the time in the caption). These 5 runs per tier are counted in the combined rate below.
- T6: Hebrew only at Mobile. T17 Desktop starts on the inquiry screen with the rail; Mobile has no rail, so its start is the same inquiry screen at 390.

## Run 3 · G1 first-time task success

PASS, FAIL as in run 2; actions in brackets (taps, clicks and field entries; the automatic «Изпращаме…» and «Приемаме работата…» steps are not counted). «Expert / limit» is the key's expert path and expert + 1.

| Task | Expert / limit | Desktop · Haiku | Desktop · GPT | Mobile · Haiku | Mobile · GPT |
|---|---|---|---|---|---|
| T5 Did my question arrive? | 1 / 2 | FAIL (1) | FAIL (2) | PASS (1) | PASS (1) |
| T6 Hebrew: send the question | 1 / 2 | — | — | PASS (1) | PASS (1) |
| T7 Take a new inquiry and set the review time | 3 / 4 | FAIL (6) | PASS (3) | PASS (3) | PASS (3) |
| T8 Check for a duplicate without merging | 2 / 3 | PASS (1) | PASS (3) | PASS (1) | PASS (2) |
| T9 Attach the question to Alex's purchase | 2 / 3 | FAIL (3) | PASS (2) | FAIL (2) | PASS (2) |
| T10 Hand over open work | 2 / 3 | PASS (2) | PASS (2) | FAIL (2) | PASS (2) |
| T11 Accept a colleague's work (empty form) | 3 / 4 | PASS (3) | PASS (3) | PASS (3) | PASS (3) |
| T12 Turn down a colleague's work | 3 / 4 | PASS (2) | PASS (3) | PASS (3) | PASS (3) |
| T13a See the refusal, offer to someone else | 2 / 3 | PASS (3) | PASS (2) | PASS (2) | PASS (2) |
| T13b Take back an offer (with reason) | 2 / 3 | PASS (2) | PASS (3) | FAIL (3) | PASS (3) |
| T14a Saved property · public now | 1 / 2 | PASS (1) | PASS (1) | PASS (1) | PASS (1) |
| T14b Saved property · not public now (№242) | 1 / 2 | PASS (1) | PASS (1) | FAIL (1) | PASS (1) |
| T14c Saved property · availability unknown | 1 / 2 | FAIL (1) | FAIL (1) | FAIL (1) | FAIL (1) |
| T14d Saved property · no saved name | 1 / 2 | FAIL (1) | PASS (1) | PASS (1) | PASS (1) |
| T15 Several properties in one question | 1 / 2 | PASS (1) | PASS (1) | PASS (1) | PASS (1) |
| T16a Ask Butler about №202 (answerable) | 2 / 3 | PASS (3) | PASS (3) | PASS (3) | PASS (3) |
| T16b Ask Butler, no data, reach a broker | 5 / 6 | PASS (4) | PASS (5) | FAIL (3) | PASS (5) |
| T17 Broker opens Butler on an inquiry | 2 / 3 | FAIL (2) | FAIL (6) | FAIL (2) | FAIL (3) |

### Run 3 · success rates and medians

| Measure | Haiku (novice proxy) | GPT (second family) | Threshold |
|---|---|---|---|
| Re-run runs | 35 | 35 | |
| First-try success, re-run set | 22 of 35 = **62.9%** | 30 of 35 = **85.7%** | at least 90% in each tier: **fails in both** |
| Combined with the 5 kept run-2 runs (T1 to T4) | 27 of 40 = 67.5% | 35 of 40 = 87.5% | |
| Desktop · Mobile (re-run set) | 11 of 17 · 11 of 18 | 14 of 17 · 16 of 18 | |
| Runs failing in both tiers | 5: r01 (T5 Desktop), r06 (T14c Desktop), r10 (T14c Mobile), r34 (T17 Desktop), r35 (T17 Mobile) | | none allowed: **fails** |
| Median actions within expert + 1 | no: T7 (Haiku 4.5 against 4) | no: T17 (GPT 4.5 against 3) | every task: **fails** (2 of 18 tasks) |

Run 2 for comparison: Haiku 62.5%, GPT 81.3%, five both-tier runs. The GPT rate moved up (81.3% to 85.7%), the Haiku rate is unchanged (62.5% to 62.9%), the sets differ (35 runs now, 32 covered runs then), and the both-tier failures moved from T5 (both viewports), T14b (both) and T14c (Mobile) to T5 (Desktop only), T14c (both) and the new T17 (both).

Median actions per task and tier (all runs of the task, failed ones included):

| Task | Expert | Limit | Median Haiku | Median GPT | Within limit |
|---|---|---|---|---|---|
| T5 | 1 | 2 | 1 | 1.5 | yes |
| T6 | 1 | 2 | 1 | 1 | yes |
| T7 | 3 | 4 | 4.5 | 3 | no |
| T8 | 2 | 3 | 1 | 2.5 | yes |
| T9 | 2 | 3 | 2.5 | 2 | yes |
| T10 | 2 | 3 | 2 | 2 | yes |
| T11 | 3 | 4 | 3 | 3 | yes |
| T12 | 3 | 4 | 2.5 | 3 | yes |
| T13a | 2 | 3 | 2.5 | 2 | yes |
| T13b | 2 | 3 | 2.5 | 3 | yes |
| T14a | 1 | 2 | 1 | 1 | yes |
| T14b | 1 | 2 | 1 | 1 | yes |
| T14c | 1 | 2 | 1 | 1 | yes |
| T14d | 1 | 2 | 1 | 1 | yes |
| T15 | 1 | 2 | 1 | 1 | yes |
| T16a | 2 | 3 | 3 | 3 | yes |
| T16b | 5 | 6 | 3.5 | 5 | yes |
| T17 | 2 | 3 | 2 | 4.5 | no |

### Run 3 · what the failures say

1. **T5 (Desktop, both tiers; Mobile passes in both).** All four runs tap the right control. On Desktop both testers expect the committed receipt «Запитването е получено» as the end screen and report that the question arrived; the replayed frame says «още не е потвърдено». On Mobile Haiku hedges (the check may show either) and GPT ends on the check screen and says it is unconfirmed. The new sentence on P12U (G-01) halves the failures (4 of 4 in run 2, 2 of 4 now) but does not remove them.
2. **T14c availability unknown (4 of 4 runs fail).** Every tester taps «Потърсете имот № 202» and then states that the listing can still be opened, without tapping a search card; the replay stops on the search page. The new muted line «Сега не можем да проверим дали обявата още е публикувана.» is not read as a status. The batch pages P02 and P05 show №202 as live, which makes the flat claim easy.
3. **T14b not public now (3 of 4 pass, was 0 of 4).** The warning «Тази обява вече не е активна и не може да се отвори.» and the archived №242 (not on any live public frame) close G-02 and G-18. The one failure is Haiku Mobile: it read the warning and still tapped the plain title.
4. **T14a and T14d.** The saved title is now a link where a listing exists: T14a passes in 4 of 4 (Haiku Desktop tapped the title and it works). T14d fails once (Haiku Desktop tapped the plain heading «Имот № 202», which has no link).
5. **T16 public Butler (7 of 8 pass per tier; one Haiku Mobile failure).** The answer frame is read exactly (115 000 €, 76 m², 68,5 m², 1 bedroom, Сандански · център, availability by a broker) in 4 of 4 runs. In the no-data variant 7 of 8 testers reach the committed receipt through «Попълнете запитването с въпроса ми» and send it themselves; Haiku Mobile stops on the answer frame. Two Haiku runs say Butler «submitted» the question (loose; the screen says the visitor sends it).
6. **T17 staff Butler (4 of 4 fail).** Every tester who goes for Butler uses the in-page button «Подгответе чернова с Butler» (O03), not the rail item; the prototype wires that button to the draft screen O32 (`63:12642` · `66:45573`), which shows a finished draft, not what Butler will do. Their RESULT describes the preview panel from the batch, which the route does not reach. GPT Desktop first accepted the inquiry (6 actions) before it used the rail. On Mobile there is no rail entry at all.
7. **T7.** The claim receipt `O03ACCEPTED` closes G-05: both GPT runs and Haiku Mobile end on it with the right review time. Haiku Desktop followed the assign and create-deal screens and never chose the review time.
8. **T8 (4 of 4 pass).** All four testers open the duplicate check at once; the renamed button next to the contact row (G-06) works.
9. **T9.** Both GPT runs state the availability check by Мария Д.; both Haiku runs state the elevator clarification instead, a phrase from the inquiry screen (G-07 half closed).
10. **T10.** One failure again: Haiku Mobile predicts the accepted frame although O23HP has no shortcut to it any more. GPT Mobile writes STUCK because the move needs Nikol, with the right end frame and result (scored PASS; a note).
11. **T11 and T12 (8 of 8 pass).** The empty receiver form `O23HRE` is used: all four T11 runs enter both fields and accept (G-11 closed).
12. **T13a (4 of 4 pass, was a coverage gap) and T13b (3 of 4 pass).** The receiver choice and the cancel with a reason work; Haiku Mobile ends on the receiver's decline form and says «you declined».

### Run 3 · coverage gaps

- T13a: none left. A tester who names Ваня Т. or Стоян В. (one did) is a note: the primary for another receiver is not drawn.
- T6 and the Hebrew states: P12MULTI, the viewing-request receipt and the Butler states «no data», «error», «offline» are not drawn in Hebrew.
- Not drawn: decline and withdraw with an empty reason; an error, offline or blocked state of the staff Butler panel; a running state of Butler with a Stop in either panel.
- Prototype note: the public panel's first send always leads to the answer frame; the no-data frame is reached after a second send (the 8 T16b tester runs went to the no-data frame directly, scored on the logical path). The command states are wired only for the O23HR accept path.

### Run 3 · per-run verdicts

Each run, both tiers, with the reason. Raw text: `run-3/answers/`.

| Run | Task | Viewport | Haiku (actions) · reason | GPT (actions) · reason |
|---|---|---|---|---|
| r01 | T5 | Desktop | FAIL (1) right control; says «Запитването е получено» (replay: not confirmed) | FAIL (2) check, then «Към същата заявка»; says the question arrived (replay: not confirmed) |
| r02 | T5 | Mobile | PASS (1) hedged: the check may show unconfirmed; no claim of arrival, no second send | PASS (1) result still unconfirmed, not sent twice |
| r03 | T6 | Mobile | PASS (1) sent; received; reads 024 as an agent number (loose) | PASS (1) received; Sandanski sales team; e-mail in Hebrew |
| r04 | T14a | Desktop | PASS (1) tapped the saved title, now a link → listing №202 | PASS (1) «Вижте имота»; names №202 |
| r05 | T14b | Desktop | PASS (1) names №242; not active and not in search | PASS (1) names №242; cannot be opened; only similar properties |
| r06 | T14c | Desktop | FAIL (1) «Потърсете имот № 202», then says the listing opened (replay: search page) | FAIL (1) same flat claim «can still be opened» without opening it |
| r07 | T14d | Desktop | FAIL (1) tapped the plain heading «Имот № 202» and reports an opened listing | PASS (1) «Вижте имота»; names №202 |
| r08 | T14a | Mobile | PASS (1) «Вижте имота»; names №202 | PASS (1) same |
| r09 | T14b | Mobile | FAIL (1) read the warning but tapped the plain title and reports it opens | PASS (1) №242 inactive, cannot be opened (title tap had no effect) |
| r10 | T14c | Mobile | FAIL (1) search button, then flat «still available» | FAIL (1) same flat claim «can still be opened» |
| r11 | T14d | Mobile | PASS (1) «Вижте имота»; names №202 | PASS (1) same; names the price |
| r12 | T15 | Desktop | PASS (1) three properties; №202 opens, №200 not; №912 called an error (loose) | PASS (1) №202 opens, №200 inactive, №912 «not recorded» (loose) |
| r13 | T15 | Mobile | PASS (1) three properties; only №202 opens; invented prices noted | PASS (1) only №202 opens; №200 inactive; №912 not openable |
| r14 | T16a | Desktop | PASS (3) Butler, typed question, send; exact facts, no confirmation claimed | PASS (3) exact facts quoted; availability by a broker |
| r15 | T16a | Mobile | PASS (3) exact facts; no availability claim | PASS (3) exact facts; availability by a broker |
| r16 | T16b | Desktop | PASS (4) Butler, no data, «Попълнете запитването…», sent by the visitor; says Butler «submitted» (loose) | PASS (5) ends on the committed receipt, number 024 |
| r17 | T16b | Mobile | FAIL (3) stops on the answer frame; no «Попълнете запитването…», nothing reaches a broker | PASS (5) ends on the committed receipt |
| r18 | T7 | Desktop | FAIL (6) assign and create-deal path, never chose the review time on the accept form | PASS (3) choose 6 октомври 10:00, accept; client not notified |
| r19 | T7 | Mobile | PASS (3) accept, time, accept; client gets no deadline | PASS (3) same; end on «Запитването е при вас» |
| r20 | T8 | Desktop | PASS (1) opened the check; two records, identity unconfirmed, no merge | PASS (3) kept separate, back to the inquiry; nothing merged |
| r21 | T8 | Mobile | PASS (1) opened the check; identity unconfirmed; no merge | PASS (2) postponed for a check; nothing merged |
| r22 | T9 | Desktop | FAIL (3) next step stated as the elevator clarification, not the availability check | PASS (2) availability check by Мария Д. |
| r23 | T9 | Mobile | FAIL (2) next step stated as the elevator clarification | PASS (2) availability check by Мария Д. |
| r24 | T10 | Desktop | PASS (2) proposed; waits for Nikol | PASS (2) offered; stays with the sender until Nikol accepts |
| r25 | T10 | Mobile | FAIL (2) says Nikol accepted and the work is hers (replay: pending) | PASS (2) wrote STUCK because the move needs Nikol; end frame and result match the criterion |
| r26 | T13a | Desktop | PASS (3) refusal and reason; offered to another colleague (chose Ваня Т., shown away) | PASS (2) refusal and reason; offered to Петър К.; waits |
| r27 | T13a | Mobile | PASS (2) refusal and reason; offered to Петър К.; pending | PASS (2) same; work stays with the sender |
| r28 | T13b | Desktop | PASS (2) withdraw, confirm; work stays; calls it «rejected» (loose) | PASS (3) withdrawn with the reason; work stays |
| r29 | T13b | Mobile | FAIL (3) ends on the receiver decline form; says «you declined» | PASS (3) withdrawn; work stays with me |
| r30 | T11 | Desktop | PASS (3) own step and time, accept | PASS (3) own step and time, accept |
| r31 | T11 | Mobile | PASS (3) own step and time, accept | PASS (3) own step and time, accept |
| r32 | T12 | Desktop | PASS (2) decline with the shown reason; work stays with Мария Д. | PASS (3) decline with a typed reason; recorded |
| r33 | T12 | Mobile | PASS (3) decline with a typed reason; work stays | PASS (3) same |
| r34 | T17 | Desktop | FAIL (2) used the in-page «Подгответе чернова с Butler» (replay: draft screen, not the preview) | FAIL (6) accepted the inquiry first (6 actions); preview seen via the rail |
| r35 | T17 | Mobile | FAIL (2) in-page button (replay: draft screen); result describes the panel | FAIL (3) in-page button (replay: draft screen); result describes the panel |

<!-- RUN3-G1-END -->

## Run 3 · G2 plain language

Full read of the visible text of 200 frames (every frame of `ids3.json`: the run-2 coverage set at Desktop and Mobile, the 12 Hebrew Mobile frames, the Butler panels, the receiver and sender frames, the 40 command-state frames), 4,342 text nodes visible, 1,506 hidden and skipped. Scanned against the GATE.md G2 table (bg, en, ru), `design/acceptance/g2-terms.md` (starter list, extra terms, judgement candidates) and the demo fragments.

- **Banned terms on primary surfaces: 0** in every group (case object, disposition, brief, coverage, engagement and mandate, lettered interest, operation and identifier, party candidate, stage / state / purpose field labels, version labels, assumed states, technical jargon, Hermes and Jev, prototype markers). The Butler panels, the command states and the receiver form add 0 hits. Public frames, Hebrew included: 0 hits of any kind.
- Reviewed and not counted: «…текущия безопасен статус на обявата…» in the O03 lead sentence (D `18:864` · M `16:526`), prose about the listing and not a «Статус» field (as in run 2).
- **Advisory strings: 23 of the 24 run-2 strings are gone (G-17 closed).** Left: the time-zone name «Europe/Sofia» in 17 distinct date lines (67 nodes; kept on purpose, the named zone is the receipt rule) and «ключовете за вход» in the revoke state O23OFF (D `327:15157` · M `327:15231`, 2 nodes, G-23). The test addresses (`alex@example.com`, `alex.other@example.com`, `buyer@example.com`, `staff@example.test`) are placeholders; the Latin tokens «Butler», «MS Realty» and the listing URL are allowed.
- Server text: `design/copy/server-messages.md` section 6 was not re-scanned (not edited in the fix round).
- Locales: the frames are Bulgarian plus the 12 Hebrew frames; en, ru, de, nl and el are covered only by the copy deck and are not scanned at frame level.

**G2 result: PASS on the letter; 1 advisory string (G-23).**

## Run 3 · G3 leader parity

Re-run of the items that failed or lacked evidence (1, 3, 6, 7, 8, 9) with frame, reaction and tester evidence; items 2, 4, 5 and the two extra checks were re-read and are unchanged. Node-level evidence is in the key, section «G3 checklist» (run 3 additions) and «Run 3 changes».

| # | Item | Run 2 | Run 3 | Frames and evidence |
|---|---|---|---|---|
| 1 | One Butler entry everywhere | FAIL (partial) | **FAIL (partial, improved)** | **Passes:** the entry «Попитайте Butler» (Hebrew «שאלו את Butler») is on every public frame and wired to the panel (32 Bulgarian entries, the Hebrew ones to `PBUTLERANSWERHE`); the panel says what it will do before it does it («Какво ще направи Butler», limit line, verdict «Изпълнено автоматично» · «Чака Вашето одобрение» · «Блокирано»), quotes facts exactly with the source, and offers «Ще го направя аз» in every state (5 Bulgarian states, Hebrew answer); T16 passes 7 of 8 per tier. Staff: the rail item «Butler» is on all 68 Desktop staff frames of the set (including O27PENDING and O27SEPARATE, closed from run 2) and opens `XBUTLERPANEL` on 112 prototype frames; the shortcut is annotated (`614:58916`: ⌘ J / Ctrl + J, Esc, focus returns; to be proven in the PR preview). **Fails:** the in-page staff buttons «Подгответе с Butler» and «Подгответе чернова с Butler» (O02, O02NEW, O03, O03COLLECTIVE; O15 and O19R) lead straight to a finished draft (O32 and its siblings), not to the preview; on Mobile no Butler entry opens the panel; T17 fails 4 of 4 (G-19). Plain language in the field: Bulgarian and Hebrew only in frames. |
| 3 | Live state and stop | FAIL (partial) | **FAIL (partial, improved)** | **Passes:** the atomic staff commands now have a sending state with the press kept and the drop line, for five families (O03 accept, O23H offer, O23HP withdraw, O23HR accept, O23HRD decline; 20 frames, 1 primary each, values kept in disabled fields, «Записваме … веднъж. Ако връзката прекъсне … проверяваме същата заявка»); `P11 · Sending` and `O01 · Loading` as before. **Fails:** no frame shows Butler working with progress and a Stop («Спрете»), in either panel (0 nodes with Stop wording in the Butler frames) (G-20). |
| 6 | No dead ends | FAIL (partial) | **FAIL (partial, improved)** | **Passes:** every command family has «changed meanwhile» (what changed, one reload primary), «connection lost» (nothing saved, same request again) and «unknown» frames; the public panel has blocked and offline states that keep the question and offer the manual path and the phone line; P11 invalid, rejected and offline as before (T2 to T4 kept). **Fails:** the decline and withdraw forms show the reason filled, so the empty required reason is not drawn (G-22); the staff panel itself has no blocked or offline state (the older `X26` «Butler е временно недостъпен» covers the draft path). |
| 7 | Unknown shown as unknown | FAIL | **FAIL** | **Passes:** `P12U`, `P12UCHECK` and the five command «unknown» frames carry the words «Още не е потвърдено» and the same-request check, no resend. **Fails:** T5 Desktop fails in both tiers (G-01), and T14c fails 4 of 4 (G-03): the unknown is drawn but still read as success or as «open». |
| 8 | Phone parity | FAIL | **FAIL (partial, improved)** | **Passes:** every Bulgarian state exists at 390; T7, T8, T10 to T13b pass on Mobile in both tiers except the failures listed; the Hebrew set grew from 2 to 13 frames (default, filled, invalid, sending, rejected, offline, saved-name receipt, P12U, P12UCHECK, not public now, availability unknown, no saved name, Butler answer; T6 passes in both tiers). **Fails:** Hebrew P12MULTI, the viewing-request receipt and the Butler states «no data», «error», «offline» are not drawn (G-21); on Mobile staff no Butler entry opens the preview (G-19). |
| 9 | Keyboard and WCAG 2.2 AA | NO EVIDENCE | **OPEN (annotated, not proven in Figma)** | Static: 0 of 4,342 visible text nodes below AA contrast; 569 click targets on the new and changed prototype frames, 0 below 24 × 24 px. New: 105 «[annotation] Focus order» frames (pages 03: 3, 05: 4, 06: 16, 08: 4, 09: 78) listing the controls in reading order with the ring colour #174EA6 and the Tab / Shift + Tab rule, Hebrew lists right to left; the staff shortcut note. Not provable in Figma: that the focus order and the visible ring really work, dark-mode contrast, right-to-left mirroring in the build; the PR preview must prove them (G-15). |
| 10 | Speed without jumps | OPEN | OPEN | Needs the PR-preview timings. |
| 2, 4, 5 | Fast first value; consequences before irreversible actions; one primary per empty state | PASS | PASS | T7 3 actions (3 of 4 runs pass), T11 and T12 3 actions (8 of 8), T16a 3 actions; new effect lines on O23HPC, O23HC, O23HR, O03ACCEPTED («Клиентът не получава съобщение»), the Butler limit lines; the empty states are unchanged. |
| A | Next-step line on each screen | PASS | PASS | Every new or changed frame has one: 85 of 90 carry a layer named «Next step»; the other 5 (P12U D·M, O03LR D·M, P12U HE) carry the line as lead sentence, labelled row or Hebrew sentence (key table). |
| B | No past dates | PASS | PASS | Dates found: 5 октомври (records), 6, 7, 8, 9, 12, 13 октомври; the scenario clock is 5 октомври 2026. |

**G3 result for W03: FAIL.** Items 1, 3, 6, 7 and 8 fail in part (improved), item 9 stays open, item 10 is open; items 2, 4, 5 and checks A and B pass.

## Run 3 · G4 side-by-side with leaders (Butler panels only)

Evidence: public pages and public help or product pages only, collected by a separate research agent (no account, no sign-in, nothing sent to any product); statements marked «not documented publicly» are not counted for the leader. The 7 jobs of run 2 are not re-run here (only the Butler panels were requested); the conditions of run 2 stand: G-10 is closed, G-01 is still open.

| Side | Job | Screens | Best leader for the job and what it documents | MS Realty | Verdict |
|---|---|---|---|---|---|
| Public | Ask a question about one listing and get an answer limited to approved facts, with a person one step away | PBUTLER, PBUTLERANSWER, PBUTLERNOFACT, PBUTLERERROR, PBUTLEROFFLINE | Rightmove «Ask Rightmove» on listings: sources button, missing data shown as «not available», the user is encouraged to contact the agent, but it also uses Google location, school and sold-price data and carries the disclaimer «AI is smart, but it can be inaccurate» ([FAQ 7000100087](https://faq.rightmove.co.uk/support/solutions/articles/7000100087-ai-search-and-ask-rightmove-), [hub](https://hub.rightmove.co.uk/latest-ai-innovations/)). Zillow «AI mode» and «AI Assist»: verified listings data, can connect to an agent, no documented behaviour when it cannot answer ([press release](https://zillow.mediaroom.com/2026-03-25-Zillow-debuts-AI-mode,-bringing-guided-intelligence-to-every-step-of-the-housing-journey), [HousingWire](https://www.housingwire.com/articles/eliseai-to-integrate-conversational-ai-into-zillow-rentals-listings/)). Airbnb: AI auto-replies from the listing and house manual, the host can delete and replace them ([Resource Center](https://www.airbnb.com/resources/hosting-homes/a/respond-faster-in-the-messages-tab-770)). Idealista: no listing-level assistant found. | Answers only from the approved listing, quotes price, areas, bedrooms and place exactly with the source link, says «Не знам… не отговарям с догадки» when the listing has no data, hands the question to a person through a prefilled form that the visitor sends, shows a verdict on every answer, keeps the question on an error or offline state, and offers «Ще го направя аз» in every state. Testers: 7 of 8 reach the exact facts or the broker. No Stop while Butler works (G-20). | **better** on documented behaviour (limited to approved data, exact source, no-data answer, hand-off and manual path in one panel); Zillow's help pages returned 403 and Idealista and Airbnb document no listing-level button, so no verdict rests on them alone |
| Staff | An AI helper in the shared inbox that shows what it will do before it acts, and a manual path | XBUTLERPANEL (and O32 for the draft) | Front Copilot: a draft in the composer, nothing sent without the agent ([help 2344960](https://help.front.com/en/articles/2344960)); Autopilot sends without action and carries «Generated by AI» ([help 3737408](https://help.front.com/en/articles/3737408)); an AI replies hub lists all AI replies ([community](https://community.front.com/product-updates/see-all-ai-generated-replies-in-one-place-with-the-new-ai-replies-hub-3608)). HubSpot reply recommendations: drafts that can be edited, dismissed or traced to the source, «nothing is sent automatically», no suggestion log documented ([doc](https://knowledge.hubspot.com/help-desk/use-reply-recommendations-in-help-desk)). Linear Triage Intelligence: suggestions accepted, declined or inspected, every agent action leaves a record, auto-apply exists ([doc](https://linear.app/docs/triage-intelligence), [AI](https://linear.app/ai)). No leader documents a plan shown before the draft. | Shows three steps before it starts, the verdict «Чака Вашето одобрение», what it cannot do (never sends, publishes or changes prices), the record it leaves, and «Ще го направя аз» back to the same screen; the draft is then reviewed by the broker. G1: T17 fails 4 of 4 because the in-page buttons skip the panel (G-19). | **equal** (design read only: the panel itself is ahead of the documented leaders, the route to it is not yet); becomes **better** when G-19 is closed and T17 passes |

**G4 result for the Butler panels: no «worse».** Public better, staff equal. The G4 gate holds at the Figma stage.

<!-- RUN3-G2G3G4-END -->

## Run 3 · defects

### Status of the run-2 defects (G-01 to G-18)

| ID | Run 3 status | Evidence |
|---|---|---|
| G-01 P12U unknown | **open, high (narrower)** | T5 Desktop fails in both tiers (r01); Mobile passes in both. 2 of 4 runs fail, was 4 of 4. Both Desktop testers expect the committed receipt as end screen. |
| G-02 P12INACTIVE line | **closed** | Warning alert «Тази обява вече не е активна и не може да се отвори.» (`614:56620` · `614:56626`); T14b 3 of 4 pass, was 0 of 4; nobody opens a similar-properties card as the listing. One Haiku Mobile run still taps the plain title (G-24). |
| G-03 P12UNKNOWN line | **open, high** | T14c 4 of 4 runs fail: «Потърсете имот № 202» then a flat «can still be opened»; the muted line `614:56632` · `614:56633` is not read as a status. |
| G-04 title as link | **closed** | T14a passes 4 of 4 (Haiku Desktop taps the title and it works). Residual on the plain headings: G-24. |
| G-05 claim receipt | **closed** | `O03ACCEPTED`: three of four T7 runs end on it with the right time; the fourth did not follow the accept path. |
| G-06 duplicate check | **closed** | T8 passes 4 of 4, every tester opens the check at once. |
| G-07 two next steps | **open, medium** | T9: GPT 2 of 2 name the availability check; Haiku 0 of 2 (both state the elevator clarification from the inquiry screen). The labels «по запитването» and «по сделката» are in place. |
| G-08 O23HP shortcut | **closed** | The shortcut is hidden and the primary is «Към текущото заместване»; one Haiku Mobile run still guesses the accepted frame (a guess, not a route). |
| G-09 withdraw wording | **closed, residual noted** | T13b 3 of 4 pass, was 2 of 4 fail; the effect line is on the compose form O23HPC; Haiku Mobile ends on the decline form. |
| G-10 receiver choice | **closed** | `O23HC`, `O23HCP`; T13a passes 4 of 4. |
| G-11 empty receiver form | **closed** | `O23HRE`; T11 passes 4 of 4 with both fields entered. |
| G-12 command states | **closed for design, residual G-22** | 20 frames, 5 families × sending, changed meanwhile, connection lost, unknown; wired for the O23HR accept path only. |
| G-13 Butler entry | **closed for the public panel and the Desktop rail, rest moved to G-19** | See G3 item 1. |
| G-14 Hebrew set | **closed for the listed states, residual G-21** | 13 Hebrew frames; T6 passes in both tiers. |
| G-15 accessibility | **open (stage rule)** | 105 focus-order annotations; the proof belongs to the PR preview. |
| G-16 P12MULTI click | **closed** | ON_CLICK → P07 on D `606:54515` and M `606:54553`. |
| G-17 advisory G2 | **closed, residual G-23** | 23 of 24 strings gone. |
| G-18 fixture and role | **closed** | №242 on no live frame; all receiver frames read «Никол · Координатор». |

### New bounded defects (G-19 to G-25)

Severity as in run 2. Node ids Desktop · Mobile.

| ID | Sev | Frame | Node id | What fails | Smallest fix |
|---|---|---|---|---|---|
| G-19 | high | Staff in-page Butler buttons and Mobile staff | O03 button `I18:901;6:17` · `I16:565;6:17` (proto `63:12642` · `66:45573`); O02 `63:12511`, O02NEW `602:19845`, O03COLLECTIVE `500:4386` · `501:3712` (all → O32); panel `614:58477` · `614:58731` | T17 fails 4 of 4: testers use the visible button, which leads to a finished draft (O32), not to what Butler will do; GPT Desktop accepts the inquiry first (6 actions). On Mobile no entry opens the panel. G3-1. | Point the buttons «Подгответе с Butler» and «Подгответе чернова с Butler» (O02, O02NEW, O03, O03COLLECTIVE, Desktop and Mobile) to `XBUTLERPANEL` and keep «Подгответе черновата» → O32 as its primary; add a Butler item to the Mobile top bar or the O03 Mobile header that opens the same panel. |
| G-20 | high | PBUTLER · PBUTLERANSWER (public), XBUTLERPANEL (staff) | `614:58920` · `614:58987`, `614:59055` · `614:59128`, `614:58477` · `614:58731` | G3-3: no frame shows Butler working with progress and a Stop; 0 nodes with Stop wording. | Add one working state per panel («Butler търси отговора в обява №202…», «Спрете», «Нищо не е изпратено») and wire the send buttons through it. |
| G-21 | medium | Hebrew set | P12MULTI `606:54028` · `606:54113`, P12VIEW `606:53901` · `606:53969`, PBUTLERNOFACT `614:59201` · `614:59246`, PBUTLERERROR `614:59291` · `614:59333`, PBUTLEROFFLINE `614:59375` · `614:59422` | G3-8: no Hebrew twin; the hand-off to a broker (T16b) cannot run in Hebrew. | Draw the five Hebrew Mobile twins. |
| G-22 | medium | O23HRD, O23HPC, XBUTLERPANEL | `606:46469` · `606:46634`, `614:56770` · `614:56949`, `614:58477` · `614:58731` | G3-6: the decline and withdraw forms show the required reason filled; no empty state with a disabled primary (the pattern of O23HRE). The staff panel has no blocked or offline state of its own. | Add `O23HRD · reason required` and `O23HPC · reason required` (field empty, primary disabled, rule line) and one blocked state for the panel in the pattern of PBUTLERERROR. |
| G-23 | low | O23OFF | `327:15157` · `327:15231` | Advisory G2: «ключовете за вход». | «Прекратяват се членството, всички отворени входове и достъпът до приложението…». |
| G-24 | low | P12NONAME, P12INACTIVE, P12UNKNOWN, P12MULTI №200 and №912 | `613:55443` · `613:55514`, `613:55594` · `613:55666`, `613:55747` · `613:55818` | The plain heading or title still invites a tap: T14d Haiku Desktop and T14b Haiku Mobile tap it and report an opened listing; GPT Mobile taps it on T14b and stays. | Set the heading in a clearly non-link style with no underline and put the reference line directly under it. |
| G-25 | low | Prototype wiring | `614:59804` · `614:59835` (PBUTLER primary), O03 accept `614:60438`…, O23H `614:61208`…, O23HP `614:62302`…, O23HRD `614:65466`… | The public first send always leads to the answer frame; the no-data frame needs a second send. The command states of O03 accept, O23H, the cancel and the decline are not wired. Judged on the logical path, not a G1 failure. | Wire a second suggested question or the typed question to PBUTLERNOFACT; wire the four command families like O23HR. |

Sequence for the next design pass (no dates): first G-19, G-01 and G-03 (wiring and copy), then G-20, G-21 and G-22 (new frames), then G-07, G-23, G-24 and G-25; then re-run T5, T7, T9, T14c and T17 and the changed batches; G-15 and G3 item 10 move to the PR preview.

## Run 3 · overall verdict

| Gate | Verdict | Why |
|---|---|---|
| G1 first-time task success | **FAIL** | Success on the first try in the re-run set: Haiku 22 of 35 (62.9%), GPT 30 of 35 (85.7%); both tiers below 90%; combined with the 5 kept run-2 runs 67.5% and 87.5%. Five runs fail in both tiers: T5 Desktop, T14c Desktop and Mobile, T17 Desktop and Mobile. Median actions exceed expert + 1 for T7 (Haiku) and T17 (GPT). T13a is no longer a coverage gap. |
| G2 plain language | **PASS** | 0 banned terms in 4,342 visible text nodes of 200 frames; 1 advisory string (G-23); the staff noun «Сделка» is allowed. |
| G3 leader parity | **FAIL** | Items 1, 3, 6, 7 and 8 fail in part (all improved), item 9 is annotated but not proven in Figma, item 10 is open; items 2, 4, 5 and checks A and B pass. |
| G4 side-by-side (Butler panels) | **PASS (no «worse»)** | Public Butler better, staff Butler equal, from public pages only. |
| **W03 overall** | **FAIL, does not go to code** | G1 and G3 fail; no journey pass is claimed. Closed from run 2: G-02, G-04, G-05, G-06, G-08, G-09, G-10, G-11, G-12 (design), G-13 (public panel and Desktop rail), G-14, G-16, G-17, G-18; open: G-01, G-03, G-07, G-15; new: G-19 to G-25 (2 high, 2 medium, 3 low). |

## Run 3 · files

- `design/zero-learning/W03-expected-path-key.md` (updated for run 3: T5 to T7 and T10 to T15 in place, new T16a, T16b, T17, section «Run 3 changes», coverage, prototype walk, defect statuses, next-step lines), this file.
- `/Users/ivan/Code/Mindburn-Labs/output/msr-launch/visual/w03-gate-packet/run-3/`: `frames/` (139 PNG, scale 1), `tester/` (35 neutral folders), `judge/` (`mapping.json`, `mapping.md`, `prompts/`), `answers/` (`haiku-rNN.txt`, `codex-rNN.txt`, `logs/`).
- Figma: read only (exports, text and reaction reads); nothing edited, nothing committed.

<!-- RUN3-END -->
