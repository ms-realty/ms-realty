# Phase B3 log — prototype reactions (pages 12/13) and W03 G3 layout fixes

- 2026-10-05 15:49 start (resumed after 529; no prior log, no prior B3 jobs found in bridge queue)
- 16:12 steps 1+2 (system states) written on pages 12 and 13, ON_CLICK → NAVIGATE, instant, on elements that had no reaction (layer renamed `Go / <DEST> / …`); no existing reaction changed:
  - C01 subtitle «Продължете с имейла…» → C02 (D `63:7048`, M `66:40863`)
  - C08 permission row «Участници по…» → C17 (D `63:8927`, M `66:42539`)
  - O12 source reference «Факти от BG източника» → O28 (D `63:16894`, M `66:48146`)
  - O27 «DEMO-CASE-02 · Консултация» → O29 (D `63:23474`, M `66:53466`)
  - P01 service promise block → P16 (D `63:25673`, M `66:55159`)
  - P01 listing №912 «Наличност за потвърждение» → P21 (D `63:25668`, M `66:55154`)
  - P02R «Няма проверени активни предложения…» → P22 (D `63:25844`, M `66:55321`)
  - P03R field «Продължителност» → P23 (D `63:26011`, M `66:55662`)
  - O16 review card «Кандидат за публикуване» → O17 (D `63:18062`, M `66:49154`)
  - O15 «Български · източник» block → O33 (D `63:17646`, M `66:48632`)
  - C05 candidate №202 price → C10 (D `63:7859`, M `66:41450`); C10 «Какво още е нужно» card → C16 (D `190:10259`, M `190:9709`)
  - C12 «За версия 3 на български» → X16 (D `63:10381`, M `66:43743`)
  - C01HOSTED alert «…Отказан достъп…» → X22 (D `63:7114`, M `66:40927`)
  - C13 alert «Промяна на адреса за вход…» → X23 (D `63:10827`, M `66:43956`)
  - P11 field «Имейл или телефон» → X24 (D `63:26522`, M `66:56183`)
  - O32 Butler draft side «Butler · Чернова за отговор» → X26 (D `I63:24440;6:299`, M `I66:54310;6:299`)
  - O32COPY source line «Източник: O12 · BG…» → X27 (D `201:15811`, M `201:15819`)
- 16:16 step 2 (O03 assign awaiting acceptance): prototype copies `Prototype / O03ASSIGNWAIT` cloned from `602:21029` → D `605:24524` (section `578:17696`, x 9720 y 6160) and from `602:21140` → M `605:24651` (section `578:17716`, x 7820 y 2328). Rail/back/actions wired by `Go /` names to page-local prototype frames; the «Следваща стъпка · Никол приема или отказва» row → O03AR (renamed `Go / O03AR / Следваща стъпка`). O03A «Запиши DEMO назначаване» re-pointed O03AR → O03ASSIGNWAIT (D `63:12738`, M `66:45603`); O03AR stays reachable through the awaiting copy. This is the only existing reaction changed, as the task asked.
- 16:24 step 3a Butler entry: UI04 / Button `State=AI` (component `6:18`, violet AI tint + sparkle), layer `Butler entry / UI04 / Button`, label «Попитайте Butler» (HE «שאלו את ⁦Butler⁩», Noto Sans Hebrew SemiBold, right-aligned), appended as the last secondary action; the manual primary stays unchanged. 36 frames: P11 support card (`Task context`) on P11 D/M `11:1469` `11:8704`, Filled `597:2224` `598:18057`, Invalid `598:17700` `602:18134`, Sending `598:17787` `602:18214`, Rejected `598:17886` `602:18306`, Offline `598:17973` `602:18386`, HE `602:18566`, and prototype copies `63:26500` `66:56163` `602:19244` `602:19323` `602:19409` `602:19496` `602:19582` `602:20111` `602:20183` `602:20262` `602:20342` `602:20421` `602:20889`; P12 `Actions` row on P12 D/M `11:1545` `11:8773`, Committed `602:18463` `602:18519`, HE `602:18638`, and prototype copies `63:26799` `66:56211` `602:19667` `602:20499` `602:20963`. New instances `605:24696`…`605:24941`. Skipped: P11/P12 COLLECTIVE pieces and P12U/P12UCHECK/P12RU*/P12RRES (different focused-state layout). Prototype entry is not wired: no public Butler answer screen exists to navigate to.
- 16:20 step 3b O02UNCLAIMED: the first coverage action «Провери заместването · Алекс» swapped Secondary → Primary (D `75:19308`, M `75:19487`, prototype D `75:19402`, M `75:19513`); «… · Никол» and «Всички разговори» stay secondary, so the empty state has exactly one primary action. Text and click reactions unchanged.
- 16:20 step 3c O27PENDING «Следващ преглед»: «30 септември 2026 · Europe/Sofia» → «След 2 работни дни, 10:00 · Europe/Sofia» (D `52:5371`, M `52:5427`, prototype D `63:23523`, M `66:53515`); text read right before the edit.
- 16:31 annotations for the two new prototype copies (B2 convention, cloned from the O03ACCEPTREADY annotation): D `605:24952`, M `605:24954`.
- 16:32 screenshots: all 36 Butler frames, O02UNCLAIMED ×4, O27PENDING ×4, O03ASSIGNWAIT ×2 exported and reviewed; programmatic check on the 36 Butler frames: 0 sibling overlaps, 0 frames past their section, 0 clipped or truncated labels, 0 text past the frame edge. Design roots are hug-height, so mobile frames grew 56–64 px. Note: O27PENDING mobile now wraps «Europe/ Sofia» onto a second line (no clipping).
- 16:33 primary-action check (owner rule): O03ASSIGNWAIT 1 primary («Към запитването»); O02UNCLAIMED 1 primary; O27PENDING 1 primary; X16, X22, X23, X24, X26, X27 (D and M) 1 primary each; the Butler entry is the AI variant, never primary.

## Reachability result (step 4)

From P01, C01 and O01 on pages 12 and 13 (harness `@INDEX*` frames excluded; NAVIGATE/OVERLAY/SWAP and conditional destinations counted): **0 of 73** journey screens unreachable on Desktop and 0 on Mobile (before: 12 Desktop, 13 Mobile).

Counting only natural, in-context triggers (excluding the hotspots below): **8 of 73** still unreachable on both pages: C02, O28, O29, O33, P16, P21, P22, P23.

## Screens with no natural trigger (owner rule: log with node id)

A hotspot on existing, non-link content was wired so the prototype is complete, but a first-time user would not find it. Each needs a visible link or row in a layout pass.

| Screen | Where a natural trigger is missing | Hotspot wired (D · M) | Natural fix |
|---|---|---|---|
| C02 | C01 `63:7036` · `66:40847` has no invitation link (real entry is the email link) | subtitle `63:7048` · `66:40863` | «Имам покана» link on C01 |
| O28 | staff tools X02 `63:28535` · `66:58212` and O10 `63:16325` · `66:47858` have no import entry | O12 source card `63:16894` · `66:48146` | X02 row «Импорт и групови промени» or O10 action |
| O29 | X02 `63:28535` · `66:58212` and O01 `63:12217` · `66:45141` have no consultations entry | O27 «DEMO-CASE-02 · Консултация» `63:23474` · `66:53466` | X02 row or O01 item for consultation requests |
| O33 | O12 `63:16795` · `66:48113` and O15 `63:17557` · `66:48611` have no correction action | O15 BG source block `63:17646` · `66:48632` | «Съществена корекция» action on O12 |
| P16 | P01 `63:25603` · `66:55092` and the public footer have no services link | P01 service promise block `63:25673` · `66:55159` | footer or P01 link «Услуги» |
| P21 | no saved or shared listing is shown as inactive | P01 №912 availability line `63:25668` · `66:55154` | inactive item on P08 or P09 |
| P22 | P03 `63:25892` · `66:55543` / P02B have no no-results path | P02R no-offers line `63:25844` · `66:55321` | no-results branch from P03 |
| P23 | P16 `63:27177` · `66:56863` has no short-stay row | P03R «Продължителност» field `63:26011` · `66:55662` | P16 row «Кратък престой» |

System states: X16, X22, X23, X24, X27 are failure branches of buttons that already lead to the success screen (C12/X15 save, C01HOSTED sign-in, C13 save, P11 send, O32COPY apply); a prototype cannot branch on an outcome, so they hang on in-context hotspots: C12 «За версия 3 на български» `63:10381` · `66:43743`, C01HOSTED alert `63:7114` · `66:40927`, C13 alert `63:10827` · `66:43956`, P11 contact field `63:26522` · `66:56183`, O32COPY source line `201:15811` · `201:15819`. X26 hangs on the Butler draft side of O32 (`I63:24440;6:299` · `I66:54310;6:299`), which is in context.

Natural triggers wired: C08 permission row → C17; C05 candidate price → C10 and C10 «Какво още е нужно» card → C16 (in context, not styled as links); O16 publication card → O17 (same); O03A «Запиши DEMO назначаване» → O03ASSIGNWAIT → «Следваща стъпка» row → O03AR.

Still not reachable by clicks (not journey base screens): W03 task-start frames O02NEW (`602:19725` · `602:20548`), P11FILLED (`602:19244` · `602:20111`), P11FILLEDHE `602:20889` and their downstream P11SENDING/P12COMMITTED/P12COMMITTEDHE; P11INVALID/REJECTED/OFFLINE; O02UNCLAIMED Desktop `66:35305` (Mobile is reachable by tab); X26 variants X26CMS…X26TRANS. The public Butler entry has no prototype target because no public Butler answer screen exists.
- 16:35 version saved: "Phase B3 links and W03 G3" (id 2406864307929384898). Not committed.
