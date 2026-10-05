# W03 · Receive, own and qualify an inquiry — G1 key (judge copy)

Testers receive only the **Goal (testers)** line of a task, in a fresh context, with the screens of their batch and nothing else (no glossary, no product vocabulary, no frame names). Everything else on this page is for the judge. Gate rules: `design/zero-learning/GATE.md`. Packet (images, prompt, judge steps): `design/zero-learning/W03-packet.md`. Owner zero-learning rules: `design/audit.md` section 7A.

- Source: Figma file "MS Realty — AI-native OS & Website · 2027", first read after the W03 build on 2026-10-05 (about 15:00 EEST), re-read after Phase B (copy, DEMO markers, links) and Phase C1b (next-step lines, visible links, states, RTL icon) on 2026-10-05 (about 17:15 EEST). Design frames live on pages 03 / 06 (screens), 05 / 08 (Agency OS screens) and 09 (states); prototype copies on page 12 (Desktop) and page 13 (Mobile). Every prototype click below was read back as an ON_CLICK reaction and every path was walked again through those reactions after Phase C1b (section «Prototype walk»). Node ids did not change; frame names, labels and evidence strings below are the current ones.
- Journey screens (binding, `journeys.json`): P11, P12, O01, O02, O03, O06, O23, O18, O04, O05. O27 (duplicate check) is reached from O03 and is part of the duplicates step. O01 Loading / Empty / Error / Offline (Phase C1b) and the revoke state O23OFF are in the coverage table and in the packet as reference images.
- Counting rule: one action is a tap or click, or one field entry. Form fields are pre-filled in the frames, so typing counts only where a step lists an entry. The «Изпращаме…» step advances on its own after 1.5 s in the prototype and is not counted.
- Pass rule per tester run: the end frame is reached (or the success criterion is met in words) without hints, in at most expert actions + 1 (median over runs). A step the screens do not cover is a **COVERAGE GAP**, reported separately and never counted as a pass.
- Scenario: visitor Алекс asks about property №202 (apartment in the centre of Sandanski, 115 000 €, 76 m² total, 68,5 m² built, 1 bedroom); broker Мария Д. works the inquiry; colleague Никол is the handover receiver. Inquiry number «Номер за проверка: 024».

## Visitor tasks

### W03-T1 · Send a question about a specific apartment

**Goal (testers):** You are interested in apartment №202 in Sandanski. Your details and your question are already filled in on this page. Send the question to the agency and find out who will answer you and how.

**Start frame:** `P11 · Filled / Запитване за имот №202` — Desktop `597:2224` · Mobile `598:18057` (prototype D `602:19244` · M `602:20111`)

| # | From frame | Action | Control (D proto · M proto) | To frame (Desktop · Mobile) |
|---|---|---|---|---|
| 1 | `P11 · Filled` | tap «Изпратете запитването» | `602:19273` · `602:20146` | `P11 · Sending / Изпращаме запитването` · D `598:17787` · M `602:18214` |
| – | `P11 · Sending` | none (advances after 1.5 s; frame reaction on D `602:19409` · M `602:20262`) | — | `P12 · Committed / Запитването е получено` · D `602:18463` · M `602:18519` |

**Expected actions:** 1 on both viewports. Median pass limit: 2.

**Success criterion:** the tester ends on `P12 · Committed` and says that the inquiry was received, that the sales team in Sandanski is responsible for it, that a broker will write to alex@example.com in Bulgarian, and that no deadline is promised yet. Evidence: «Запитването е получено» (D `602:18480` · M `602:18533`), «Екипът за продажби в Сандански отговаря за запитването от този момент. Брокер още не го е прочел…» (D `602:18483` · M `602:18536`).

**Required states:** submitting (`598:17787` · `602:18214`), committed receipt with the staffed next step (`602:18463` · `602:18519`). Both present.

### W03-T2 · Send again after the connection dropped

**Goal (testers):** You were sending a question about an apartment when your phone lost its internet connection. The connection is back. Make sure the agency gets your question, and gets it only once.

**Start frame:** `P11 · Offline / Няма връзка` — Mobile `602:18386` · Desktop `598:17973` (prototype M `602:20421` · D `602:19582`)

| # | From frame | Action | Control (M proto · D proto) | To frame (Mobile · Desktop) |
|---|---|---|---|---|
| 1 | `P11 · Offline` | tap «Изпратете отново» | `602:20457` · `602:19612` | `P11 · Sending` · M `602:18214` · D `598:17787` |
| – | `P11 · Sending` | none (auto) | — | `P12 · Committed` · M `602:18519` · D `602:18463` |

**Expected actions:** 1. Median pass limit: 2.

**Success criterion:** ends on `P12 · Committed` without retyping anything; the tester notes that the same number «Номер за проверка: 024» is reused so the team receives one inquiry. Fail: the tester retypes the form, or chooses «Свържете се по друг начин» believing the question cannot be sent.

**Required states:** offline / retry with values kept (`598:17973` · `602:18386`). Present.

### W03-T3 · The question was not sent — fix it and send

**Goal (testers):** You tried to send a question about an apartment, but it did not go through. Fix only what is wrong and send it again. Do not retype your message.

**Start frame:** `P11 · Rejected / Запитването не е изпратено` — Desktop `598:17886` · Mobile `602:18306` (prototype D `602:19496` · M `602:20342`)

| # | From frame | Action | Control (D proto · M proto) | To frame (Desktop · Mobile) |
|---|---|---|---|---|
| 1 | `P11 · Rejected` | correct «Имейл или телефон» from alex@exmaple.com to a valid address (one entry) | field `602:19519` · `602:20370` (design `598:17907` · `602:18332`) | same frame |
| 2 | `P11 · Rejected` | tap «Изпратете поправеното запитване» | `602:19526` · `602:20378` | `P11 · Sending` → `P12 · Committed` |

**Expected actions:** 2. Median pass limit: 3.

**Success criterion:** only the email field changes; the message, name, language and contact route are kept; the tester ends on `P12 · Committed`. Fail: the tester clears or retypes the message, or leaves the page.

**Required states:** rejected with values kept, error named on the field (`598:17886` · `602:18306`). Present.

### W03-T4 · Fix the contact and send (phone)

**Goal (testers):** Send this question about an apartment to the agency. If the page asks you to fix something, fix it and send.

**Start frame:** `P11 · Invalid / Поправете контакта` — Mobile `602:18134` · Desktop `598:17700` (prototype M `602:20183` · D `602:19323`)

| # | From frame | Action | Control (M proto · D proto) | To frame |
|---|---|---|---|---|
| 1 | `P11 · Invalid` | complete «Имейл или телефон» (alex@ → alex@example.com, one entry) | field `602:20211` · `602:19346` (design `602:18160` · `598:17721`) | same frame |
| 2 | `P11 · Invalid` | tap «Изпратете запитването» | `602:20219` · `602:19353` | `P11 · Sending` → `P12 · Committed` |

**Expected actions:** 2. Median pass limit: 3.

**Success criterion:** the tester names the contact field as the only problem, fixes it and sends; ends on `P12 · Committed`.

**Required states:** validation error (`598:17700` · `602:18134`). Present.

### W03-T5 · Did my question arrive?

**Goal (testers):** You sent a question to the agency, but the page never said whether it arrived. Find out whether it arrived, without sending it a second time.

**Start frame:** `P12U / Проверяваме получаването` — Desktop `22:1666` · Mobile `24:2203` (prototype D `63:26892` · M `66:56337`)

| # | From frame | Action | Control (D proto · M proto) | To frame (Desktop · Mobile) |
|---|---|---|---|---|
| 1 | `P12U` | tap «Проверете същата заявка» | `66:36418` · `66:56358` | `P12UCHECK / Резултатът все още не е потвърден` · D `66:34211` · M `66:34251` |

**Expected actions:** 1. Median pass limit: 2 (a second tap on «Свържете се по друг начин», D `125:9610` · M `129:3518`, is acceptable).

**Success criterion:** the tester reports that the result is still not confirmed, keeps the number «Номер за проверка: 024» and does not send again. Evidence: «Резултатът все още не е потвърден» (D `66:34223` · M `66:34263`). Fail: any action that sends a new inquiry.

**Required states:** unknown outcome (`22:1666` · `24:2203`), status check of the same request (`66:34211` · `66:34251`). Present. Label change since the first key: the check screen's button now says «Към същата заявка» (D `66:34249` · M `66:34289`; it said «Към същата операция» before Phase B1). The second way out on the unknown screen itself is «Свържете се по друг начин» (D `66:36419` · M `66:56359`).

### W03-T6 · Hebrew: send the question (phone, right-to-left)

**Goal (testers, Hebrew):** אתם מתעניינים בדירה №202 בסנדנסקי. הפרטים והשאלה שלכם כבר מולאו בעמוד הזה. שלחו את השאלה לסוכנות וגלו מי יענה לכם ואיך.

*(Judge translation: You are interested in apartment №202 in Sandanski. Your details and question are already filled in on this page. Send the question to the agency and find out who will answer you and how.)*

**Start frame:** `P11 · Filled HE RTL / פנייה לגבי נכס №202` — Mobile `602:18566` (prototype M `602:20889`)

| # | From frame | Action | Control (M proto) | To frame |
|---|---|---|---|---|
| 1 | `P11 · Filled HE RTL` | tap «שליחת הפנייה» | `602:20926` | `P12 · Committed HE RTL / הפנייה התקבלה` · M `602:18638` (prototype `602:20963`) |

**Expected actions:** 1. Median pass limit: 2.

**Success criterion:** the tester reports that the inquiry was received, that the Sandanski sales team is responsible, and that a broker will write by email in Hebrew with no promised deadline. Evidence: «הפנייה התקבלה» `602:18652`, owner line `602:18655`. The judge also checks that №202, 115,000 €, 76 m², 68.5 m² and alex@example.com read left-to-right inside the Hebrew lines.

**Required states:** filled and committed in Hebrew are present; Hebrew sending, invalid, rejected, offline and unknown are **COVERAGE GAPs** (Bulgarian only).

## Staff tasks

### W03-T7 · Take a new inquiry and set when you will look at it again

**Goal (testers):** You are a broker at the agency. A new question about apartment №202 has just arrived and nobody is handling it yet. Take it on yourself and set when you will look at it again.

**Start frame:** `O02 · New in queue / Ново запитване в опашката` — Desktop `602:18685` · Mobile `602:18828` (prototype D `602:19725` · M `602:20548`)

| # | From frame | Action | Control (D proto · M proto) | To frame (Desktop · Mobile) |
|---|---|---|---|---|
| 1 | `O02 · New in queue` | tap «Поемете запитването» (Mobile: «Поемете запитването на Алекс») | `602:19843` · `602:20578` | `O03 · Accept · time required / Поемане на запитването` · D `602:18881` · M `602:19008` |
| 2 | `O03 · Accept · time required` | choose a future day and time in «Кога ще прегледате отново? *» (one entry; prototype: tap the field) | `602:19958` · `602:20624` | `O03 · Accept · ready` · D `602:19066` · M `602:19189` |
| 3 | `O03 · Accept · ready` | tap «Поемете запитването» | `602:20083` · `602:20681` | `O03L / Свързване или създаване на случай` · D `20:1055` · M `25:2228` (prototype D `63:12845` · M `66:45642`) |

**Expected actions:** 3 on both viewports. Median pass limit: 4.

**Success criterion:** the tester chooses the review time themself, then accepts, and says that the client is not notified. Evidence: rule «Задължително: бъдещ ден и час. Няма час по подразбиране…» (D `602:19000` · M `602:19058`); effect «Записва ви като отговорник с преглед на 6 октомври в 10:00. Клиентът не получава съобщение.» (D `602:19188` · M `602:19242`). Fail: the tester tries to accept with the time empty, or assumes a time was set for them.

**Required states:** new in the owned queue, accept with an empty required future time (no default, button disabled), accept ready. All present.

### W03-T8 · Check for a duplicate without merging

**Goal (testers):** Before you work on Alex's new question, check whether Alex already exists in the system. Do not combine any records unless you are sure they are the same person.

**Start frame:** `O03 / Разговор с Алекс` — Desktop `18:732` · Mobile `16:463` (prototype D `63:12514` · M `66:45509`)

| # | From frame | Action | Control (D proto · M proto) | To frame (Desktop · Mobile) |
|---|---|---|---|---|
| 1 | `O03` | tap «Проверете за дубликат» | `63:12621` · `66:45550` | `O27 / Проверка за дубликати` · D `14:1592` · M `15:1014` (prototype D `63:23379` · M `66:53439`) |
| 2 | `O27` | tap «Отложете за допълнителна проверка» | `63:23481` · `66:53473` | `O27PENDING / Прегледът е отложен със следваща стъпка` · D `52:5335` · M `52:5391` |

**Expected actions:** 2. Median pass limit: 3.

**Success criterion:** nothing is merged; the tester says identity is not confirmed, so the two records stay separate until a check. «Запазете като отделни контакти» is accepted in words; its prototype reaction (D `63:23482` · M `66:53474`) leads to O04 «Случаи» (D `63:14199` · M `66:46558`), a list with no confirmation, see defect D-2 in «Defects found in this re-check». Evidence: «Прегледът е отложен със следваща стъпка» (D `52:5347` · M `52:5403`), «Идентичностите не са обединени и правата не са променени.» (D `52:5348`). Fail: the tester ticks the confirmation and claims a merge.

**Required states:** duplicate candidates side by side, deferred review. Present. The review time on O27PENDING now reads «След 2 работни дни, 10:00 · Europe/Sofia» (D `52:5371` · M `52:5427`), a future time next to the «6 октомври 2026» of O03 · Accept (Phase B3 closed the earlier past-date finding).

### W03-T9 · Attach the question to Alex's existing purchase

**Goal (testers):** Alex already has an open purchase with the agency. Attach his new question to it, then tell us what the next step is and who does it.

**Start frame:** `O03 / Разговор с Алекс` — Desktop `18:732` · Mobile `16:463` (prototype D `63:12514` · M `66:45509`)

| # | From frame | Action | Control (D proto · M proto) | To frame (Desktop · Mobile) |
|---|---|---|---|---|
| 1 | `O03` | tap «Свържете или създайте случай» | `63:12633` · `66:45564` | `O03L` · D `20:1055` · M `25:2228` |
| 2 | `O03L` | tap «Запишете свързването» | `63:12940` · `66:45671` | `O03LR / Записано свързване` · D `20:1175` · M `25:2279` |

**Expected actions:** 2. Median pass limit: 3 (opening the purchase with «Към случая», D `63:13044` · M `66:45707`, is acceptable).

**Success criterion:** the tester reports that the question is attached and that the next step is the availability check before a viewing proposal, by Мария Д. Evidence: «Запитването е свързано със случая.» (D `20:1262` · M `25:2295`), «Мария Д. · Проверка на наличността преди предложение за оглед» (D `20:1273` · M `25:2306`).

**Required states:** link, link recorded, create after qualifying (`21:2399` · `28:2817`), resolve without a case with a reason (`20:1288` · `25:2321`). Present. Copy note: the path uses the staff noun «случай» (audit §9); «преписка» and «ангажимент» are gone from it since Phase B1.

### W03-T10 · Hand over open work before you are away

**Goal (testers):** You will be away next week. Make sure your open work, including Alex's question, passes to your colleague Nikol and nothing is dropped.

**Start frame:** `O23 / Екип, достъп и заместване` — Desktop `18:1141` · Mobile `16:736` (prototype D `63:20897` · M `66:51729`)

| # | From frame | Action | Control (D proto · M proto) | To frame (Desktop · Mobile) |
|---|---|---|---|---|
| 1 | `O23` | tap «Предайте отворената работа» | `63:21010` · `66:51774` | `O23H / Предаване на отворена работа` · D `21:788` · M `25:2760` (prototype D `63:21162` · M `66:51858`) |
| 2 | `O23H` | tap «Предложете предаване» | `63:21298` · `66:51928` | `O23HP / Изчаква приемане на работата` · D `21:948` · M `25:2851` |

**Expected actions:** 2. Median pass limit: 3.

**Success criterion:** the tester says the handover is proposed and waits for Nikol to accept; until then the work stays with the current owner. Evidence: «Изчаква приемане на работата» (D `21:1032` · M `25:2864`).

**Required states:** handover proposal, pending acceptance, accepted (`21:1108` · `25:2942`). Present. Related state: `O03 · Assign · awaiting acceptance / Чака приемане от Никол` (D `602:21029` · M `602:21140`). Phase B3 added prototype copies `Prototype / O03ASSIGNWAIT` (D `605:24524` · M `605:24651`): O03A «Запишете назначаването» (D `63:12738` · M `66:45603`) now leads there, and its «Следваща стъпка» row leads on to O03AR.

## Coverage — step × viewport × state → node id

Design frames. «—» means not required for that viewport; **missing** means required and absent.

| Step | State | Desktop 1440 | Mobile 390 | Hebrew RTL 390 |
|---|---|---|---|---|
| V1 Review intent, listing, contact route and language (P11) | default | `11:1469` | `11:8704` | **missing** |
| | filled | `597:2224` | `598:18057` | `602:18566` |
| | validation error | `598:17700` | `602:18134` | **missing** |
| V2 Send once, keep the reference (P11) | submitting | `598:17787` | `602:18214` | **missing** |
| | offline / retry | `598:17973` | `602:18386` | **missing** |
| V3 Result: committed (P12) | committed receipt + staffed next step | `602:18463` | `602:18519` | `602:18638` |
| | generic receipt (no listing) | `11:1545` | `11:8773` | — |
| V4 Result: unknown (P12) | unknown outcome | `22:1666` | `24:2203` | **missing** |
| | check the same request | `66:34211` | `66:34251` | **missing** |
| V5 Result: rejected (P11) | rejected, values kept | `598:17886` | `602:18306` | **missing** |
| S1 Accepted inquiry in the owned queue (O01 / O02) | Today | `10:203` | `14:4343` | — |
| | inbox | `11:4257` | `18:2905` | — |
| | new in queue, no owner | `602:18685` | `602:18828` | — |
| | unowned tab (empty) | `66:34531` | `66:34558` | — |
| | mine | `66:34585` | `66:34636` | — |
| | Today · loading | `605:37147` | `605:37367` | — |
| | Today · empty | `605:37516` | `605:37732` | — |
| | Today · error | `605:37877` | `605:38093` | — |
| | Today · offline | `605:38238` | `605:38454` | — |
| S2 Duplicates / party candidates without merging (O03 / O27 / O06) | conversation | `18:732` | `16:463` | — |
| | duplicate check | `14:1592` | `15:1014` | — |
| | review deferred | `52:5335` | `52:5391` | — |
| | person or organisation | `11:4823` | `14:4583` | — |
| S3 Claim or assign with receiving-owner acceptance (O03 / O23) | accept, future review time required | `602:18881` | `602:19008` | — |
| | accept, ready | `602:19066` | `602:19189` | — |
| | assign review | `20:825` | `25:2138` | — |
| | assign awaiting the receiver | `602:21029` | `602:21140` | — |
| | assign recorded | `20:942` | `25:2186` | — |
| | receiver accepts with own review time | **missing** | **missing** | — |
| | receiver declines | **missing** | **missing** | — |
| S4 Typed case, link existing or resolve with reason (O03 / O04) | link | `20:1055` | `25:2228` | — |
| | link recorded | `20:1175` | `25:2279` | — |
| | create after qualifying | `21:2399` | `28:2817` | — |
| | created | `21:2525` | `28:2875` | — |
| | resolve without a case | `20:1288` | `25:2321` | — |
| | resolve recorded | `20:1405` | `25:2369` | — |
| | case list | `14:1847` | `14:4522` | — |
| S5 Useful response and next commitment (O05 / O18) | case | `18:914` | `16:578` | — |
| | wait with owner and date | `20:341` | `25:1934` | — |
| | wait recorded | `20:464` | `25:1988` | — |
| | tasks | `14:1979` | `15:436` | — |
| S6 Absence or revocation keeps assignments, records a handover plan (O23 / O18) | team and cover | `18:1141` | `16:736` | — |
| | handover | `21:788` | `25:2760` | — |
| | handover pending | `21:948` | `25:2851` | — |
| | handover accepted | `21:1108` | `25:2942` | — |
| | revoke staff access | `327:15031` | `327:15174` | — |

Prototype copies built in this pass — page 12 (Desktop): P11FILLED `602:19244`, P11INVALID `602:19323`, P11SENDING `602:19409`, P11REJECTED `602:19496`, P11OFFLINE `602:19582`, P12COMMITTED `602:19667`, O02NEW `602:19725`, O03ACCEPT `602:19870`, O03ACCEPTREADY `602:19990`. Page 13 (Mobile): the same nine (`602:20111`, `602:20183`, `602:20262`, `602:20342`, `602:20421`, `602:20499`, `602:20548`, `602:20603`, `602:20654`) plus P11FILLEDHE `602:20889` and P12COMMITTEDHE `602:20963`. Phase B3 added `Prototype / O03ASSIGNWAIT` (D `605:24524` · M `605:24651`). Flow starts added on both pages: «Website · inquiry №202 · send and result», «Agency · new inquiry №202 · accept with review time»; page 13 also «Website · inquiry №202 · Hebrew RTL».

## Prototype walk — expected paths through the reactions on pages 12 / 13

Re-walked on 2026-10-05 (about 17:15 EEST) after Phase C1b: for every task and viewport the start frame was opened, the control was found by its visible text among the visible reaction-bearing nodes of that frame, and the ON_CLICK destination was followed (including the 1.5 s AFTER_TIMEOUT of `P11SENDING`). **19 of 19 walks reach the expected end frame; no expected path is broken.** Every tapped label in the key above was compared with the current text of its control on Desktop and Mobile: 0 mismatches. The stale strings were in evidence lines, frame names and notes only (`Запитването е свързано с преписката`, `Мария Д. · DEMO · …`, `Прегледът е отложен с ангажимент`, `Към същата операция`, the frame names of O03L and O27PENDING, «no prototype reaction» for «Запазете като отделни контакти», «static only» for O03 · Assign · awaiting acceptance, the O27PENDING date note); they are corrected in the task sections.

| Task | Walk (control node D · M) | End frame D · M | Result |
|---|---|---|---|
| T1 | P11FILLED «Изпратете запитването» `602:19273` · `602:20146` → P11SENDING → after 1.5 s → P12COMMITTED | `602:19667` · `602:20499` | pass · pass |
| T2 | P11OFFLINE «Изпратете отново» `602:19612` · `602:20457` → P11SENDING → P12COMMITTED | `602:19667` · `602:20499` | pass · pass |
| T3 | P11REJECTED entry in the email field, «Изпратете поправеното запитване» `602:19526` · `602:20378` → P11SENDING → P12COMMITTED | `602:19667` · `602:20499` | pass · pass |
| T4 | P11INVALID entry in the contact field, «Изпратете запитването» `602:19353` · `602:20219` → P11SENDING → P12COMMITTED | `602:19667` · `602:20499` | pass · pass |
| T5 | P12U «Проверете същата заявка» `66:36418` · `66:56358` → P12UCHECK | `66:36421` · `66:56361` | pass · pass |
| T6 | Mobile only: P11FILLEDHE «שליחת הפנייה» `602:20926` → P12COMMITTEDHE (direct; no Hebrew sending frame) | — · `602:20963` | — · pass |
| T7 | O02NEW «Поемете запитването» `602:19843` · `602:20578` → O03ACCEPT; field «Кога ще прегледате отново? *» `602:19958` · `602:20624` → O03ACCEPTREADY; «Поемете запитването» `602:20083` · `602:20681` → O03L. The accept button of O03ACCEPT is disabled and has no reaction | `63:12845` · `66:45642` | pass · pass |
| T8 | O03 «Проверете за дубликат» `63:12621` · `66:45550` → O27; «Отложете за допълнителна проверка» `63:23481` · `66:53473` → O27PENDING | `63:23486` · `66:53478` | pass · pass |
| T9 | O03 «Свържете или създайте случай» `63:12633` · `66:45564` → O03L; «Запишете свързването» `63:12940` · `66:45671` → O03LR (then «Към случая» `63:13044` · `66:45707` → O05) | `63:12943` · `66:45674` | pass · pass |
| T10 | O23 «Предайте отворената работа» `63:21010` · `66:51774` → O23H; «Предложете предаване» `63:21298` · `66:51928` → O23HP (then «Вижте приетото предаване» `63:21746` · `66:52074` → O23HD) | `63:21610` · `66:52004` | pass · pass |

Also checked: the Phase B3 prototype copy `Prototype / O03ASSIGNWAIT` (D `605:24524` · M `605:24651`) is entered from O03A «Запишете назначаването» (D `63:12738` · M `66:45603`) and leaves through «Следваща стъпка» to O03AR, «Към запитването» to O03 and «Към задачите» to O18. The flow starts «Website · inquiry №202 · send and result» (`602:19244` · `602:20111`), «Agency · new inquiry №202 · accept with review time» (`602:19725` · `602:20548`) and, on Mobile, «Website · inquiry №202 · Hebrew RTL» (`602:20889`) exist.

## Defects found in this re-check (recorded, not fixed here)

| # | Defect | Node ids | Effect |
|---|---|---|---|
| D-1 | The Butler entry «Попитайте Butler» on public screens has no prototype reaction and no answer screen exists, so «what it will do» and «Ще го направя аз» cannot be shown (the string appears in no W03 frame) | prototype instances D `605:24787` `605:24801` `605:24808` `605:24815` `605:24822` `605:24829` `605:24913` `605:24927`; M `605:24794` `605:24836` `605:24843` `605:24850` `605:24857` `605:24864` `605:24871` `605:24920` `605:24934` `605:24941` | G3 item 1; none of the ten tasks |
| D-2 | On O27, «Запазете като отделни контакти» and «Отказ» both lead to the case list O04, with no confirmation that the records stay separate | D `63:23482` · `63:23483` → `63:14199`; M `66:53474` · `66:53475` → `66:46558` | T8 expected path unaffected; a tester who picks the keep-separate button ends on a list: judge accepts the words, reports a COVERAGE GAP |
| D-3 | After accepting (T7 step 3) the prototype lands on O03L; no «accepted» receipt frame exists, so the success criterion rests on the effect line shown before the tap | D `602:20083` → `63:12845`; M `602:20681` → `66:45642`; effect line D `602:19188` · M `602:19242` | T7 passes by the key; a stricter judge may call it a COVERAGE GAP |
| D-4 | Past dates in the scenario (today reads as 5–6 October 2026 on O03 · Accept · ready) | O01 «29 септември · 16:00 · Предложен час» D `10:325` · M `14:4394` (prototype `63:12334` · `66:45190`); O03N «30 септември 2026 · Europe/Sofia» D `I21:2506;6:61` · M `I28:2855;6:61` (prototype `I63:13139;6:61` · `I66:45736;6:61`); O05W same text D `I20:439;6:61` · M `I25:1962;6:61` (prototype `I63:15334;6:61` · `I66:47181;6:61`); O05WR «Преглед на 30 септември» D `20:568` · M `25:2021` (prototype `63:15438` · `66:47218`) | G3 check «no past dates» fails; none of the ten tasks |
| D-5 | Model-field labels «Цел» and «Състояние» are still visible as input labels on O05 | D `I18:1003;6:59` · `I18:1016;6:59`; M `I16:596;6:59` · `I16:611;6:59` | G2 |
| D-6 | No next-step line on four screens (state frames not covered by Phase C1b) | O03L D `20:1055` · M `25:2228`; O05W D `20:341` · M `25:1934`; O23HD D `21:1108` · M `25:2942`; O23OFF D `327:15031` · M `327:15174` | G3 check «next-step line» |
| D-7 | No Butler entry on the focused unknown-outcome screens (Phase B3 skipped them) | P12U D `22:1666` · M `24:2203`; P12UCHECK D `66:34211` · M `66:34251` | G3 item 1 |
| D-8 | GATE.md bg column lists «Случай» as banned while audit §9 and Phase B1 use it as the staff noun: 113 nodes, see G2 | table in «G2 check» | needs an owner decision |

Still missing, unchanged since the build: Hebrew right-to-left default, invalid, sending, rejected, offline, unknown and status-check frames; the receiving owner's accept and decline frames (Desktop and Mobile); a prototype branch from «Изпращаме…» to the rejected or unknown result (T3 and T5 start on those screens).

## G2 check — W03 visible copy after Phases B and C1b

Re-run on 2026-10-05 (about 17:15 EEST) over the 90 frames of the packet folder: every coverage-table frame, plus O01 Loading / Empty / Error / Offline (Phase C1b) and the revoke state `327:15031` · `327:15174`. Every text node was read through the plugin API with hidden layers skipped: 2,276 text nodes, 1,951 visible, 325 hidden (118 of them the DEMO markers hidden by Phase B2). Terms: the GATE.md G2 table in bg, en and ru, plus the demo fragments of the Phase B1 re-scan («измислен», «прототип», «синтетичен», «примерни данни»). No W03 frame has a technical-details disclosure, so every hit is on a primary surface. Public screens (P11, P12, including Hebrew): 0 hits of any kind.

**Result: FAIL on the letter of GATE.md.** Two groups remain.

1. **4 real hits:** the model-field labels «Цел» and «Състояние» on O05 (table A).
2. **113 nodes of the staff noun «Случай / Случаи»** on 49 frames, all staff screens (table B). GATE.md lists «Случай» as banned in the bg column, but audit section 9 fixes «Случай» as the staff label (clients see «Моята покупка / продажба / наем») and Phase B1 applied it as the one noun per object. The owner must settle it: either strike «Случай» from the bg banned column for staff surfaces (the gate then reads 4 hits) or choose another noun and rename these 113 nodes (defect D-8). Until then it counts as open.

Every other group is at 0: DEMO markers (visible), «Преписка», «Ангажимент / Мандат», «DEMO-CASE» codes, «Разпореждане», «Бриф», «Покритие», «Интерес», «операция / идентификатор», «Етап», version labels, assumed states, Hermes / Jev, technical jargon (worker, runtime, Payload, MFA, principal, digest, webhook, CSV).

**Pre-Phase-B baseline (the key as built, 80 frames):** FAIL with 319 DEMO-marker nodes on 79 frames, 96 «Преписка» nodes (42 frames), 24 «Ангажимент» (22), 28 «Case / DEMO-CASE» (18), 26 «Покритие» (12), 12 version labels (8), 8 «Интерес» (4), 4 «операция» (4), 4 technical-jargon nodes (2), 2 «Бриф» (2), 2 «Етап» (2). All of these groups are now 0.

### A. Model-field labels (real hits)

| Visible text | Where (screen · viewport `node id`) |
|---|---|
| «Цел» | O05 default D `I18:1003;6:59` · M `I16:596;6:59` |
| «Състояние» | O05 default D `I18:1016;6:59` · M `I16:611;6:59` |

### B. Staff noun «Случай / Случаи» (open decision, 113 nodes)

| Visible text | Where (screen · viewport `node id`) |
|---|---|
| «Случаи» | O01-default D `10:226`; O02-default D `11:4280`; O02-new-in-queue D `602:18705` (+30 more screens) |
| «Имот №202 · Случай № 0142» | O02-mine D `I75:19656;6:164` · M `I75:19836;6:164` |
| «Поемете запитването, свържете го със случай и подгответе отговора.» | O03-default D `605:25008` · M `605:25009` |
| «Свържете или създайте случай» | O03-default D `I18:885;6:3` · M `I16:549;6:3` |
| «Приключете без случай» | O03-default D `I18:887;6:6` · M `I16:551;6:6` |
| «Свързаните случаи, документи, права и ограничения се проверяват поотделно. Историята на двата записа се запазва. Разли…» | O27-duplicate-check D `14:1700` · M `15:1051` |
| «Прегледайте разрешените връзки на лицето, преди да продължите по случая.» | O06-default D `605:25016` · M `605:25017` |
| «Проверете случая, последната промяна на източника и кой поема следващото действие.» | O06-default D `11:4937` · M `14:4628` |
| «Към случая» | O06-default D `I11:4939;6:9` · M `I14:4629;6:6`; O03-link-recorded D `I20:1284;6:3` · M `I25:2317;6:3`; O03-created D `I21:2634;6:3` · M `I28:2913;6:3` |
| «Агенция / Свързване или създаване на случай» | O03-link-or-create D `20:1130` |
| «Свързване или създаване на случай» | O03-link-or-create D `20:1139` · M `25:2241` |
| «Свързване със съществуващ случай» | O03-link-or-create D `I20:1144;6:61` · M `I25:2246;6:61` |
| «Случай» | O03-link-or-create D `I20:1148;6:59` · M `I25:2251;6:59` |
| «Създайте нов случай» | O03-link-or-create D `I20:1162;6:6` · M `I25:2266;6:6` |
| «Съвпадение по имейл не е доказана самоличност. Новият случай изисква тип, отговорник и следващо действие; свързването …» | O03-link-or-create D `I20:1164;6:408` · M `I25:2268;6:408`; O03-create-after-qualify D `I21:2514;6:408` · M `I28:2864;6:408` |
| «Запитването е свързано със случая.» | O03-link-recorded D `20:1262` · M `25:2295` |
| «Тип случай» | O03-create-after-qualify D `I21:2488;6:59` · M `I28:2835;6:59` |
| «Създайте случай» | O03-create-after-qualify D `I21:2521;6:3` · M `I28:2871;6:3` |
| «Агенция / Случаят е създаден» | O03-created D `21:2600` |
| «Случаят е създаден» | O03-created D `21:2609` · M `28:2888` |
| «Случаят е създаден след уточняване.» | O03-created D `21:2612` · M `28:2891` |
| «Агенция / Приключване без случай» | O03-resolve-without-case D `20:1363` |
| «Приключване без случай» | O03-resolve-without-case D `20:1372` · M `25:2334` |
| «Запитването е приключено без случай.» | O03-resolve-recorded D `20:1492` · M `25:2385` |
| «Агенция / Случаи» | O04-default D `14:1922` |
| «Отворете случая, който чака действие, или потърсете по име или номер.» | O04-default D `605:25012` · M `605:25013` |
| «Отворете случай № 0142» | O04-default D `I14:1975;6:3` · M `I14:4579;6:3` |
| «Частен случай № 0142» | O05-default D `I18:999;6:179` · M `I16:592;6:179` |
| «Активният случай има отговорник и действие или условие за изчакване.» | O05-default D `18:1022` · M `16:617` |
| «Харесан имот · Отказът от един имот не затваря случая» | O05-default D `18:1080` · M `16:675` |
| «Работа по случая» | O05-default D `18:1085` · M `16:680` |
| «Ролята в случая не дава достъп до всички документи» | O05-default D `18:1131` · M `16:726` |
| «Случаят изчаква отговор.» | O05-wait-recorded D `20:557` · M `25:2010` |
| «Нито един имот не е отбелязан автоматично като продаден или отдаден. Другите случаи не са променени.» | O05-wait-recorded D `I20:572;6:401` · M `I25:2025;6:401` |
| «Към случаите» | O05-wait-recorded D `I20:581;6:6` · M `I25:2034;6:6` |
| «Изберете задача и отворете случая, към който принадлежи.» | O18-default D `605:25060` · M `605:25061` |
| «Към случая на Алекс» | O18-default D `I14:2119;6:3` · M `I15:505;6:3` |
| «Активно членство · Задачи и възложени случаи · Вход с потвърждение» | O23-default D `18:1243` · M `16:767` |
| «Отворени и спрени случаи» | O23-revoke-staff-access D `327:15148` · M `327:15222` |

### Reviewed and not counted

- «…текущия безопасен статус на обявата…» in the O03 lead sentence (D `18:864` · M `16:526`): plain prose about the listing, not an editable «Статус» field.
- Outside the GATE list, for the editor of the list: the time-zone name «Europe/Sofia» in 8 date lines (O03 accept ready D `I602:19152;6:61` · M `I602:19208;6:61`; O03N D `I21:2506;6:61` · M `I28:2855;6:61`; O05W D `I20:439;6:61` · M `I25:1962;6:61`; O27PENDING D `52:5371` · M `52:5427`) and the test address «staff@example.test» on O23OFF (D `327:15141` · M `327:15215`).

## G3 checklist — W03 with frame evidence (re-run after Phases B and C1b)

| # | Item | Verdict | Evidence |
|---|---|---|---|
| 1 | One Butler entry everywhere | **FAIL (partial)** | The public entry «Попитайте Butler» (Hebrew «שאלו את Butler» with the right-to-left variant) is on 18 of the 22 P11 / P12 frames: P11 default D `11:1469` · M `11:8704`, filled `597:2224` · `598:18057`, invalid `598:17700` · `602:18134`, sending `598:17787` · `602:18214`, rejected `598:17886` · `602:18306`, offline `598:17973` · `602:18386`, Hebrew filled `602:18566`; P12 committed `602:18463` · `602:18519`, Hebrew committed `602:18638`, generic `11:1545` · `11:8773` (design instances `605:24696` to `605:24941`). Missing on P12U and P12UCHECK (D-7). The entry is not wired and no answer screen exists, so «shows what it will do» and «Ще го направя аз» have no frame (D-1). Staff: rail item «Butler» on every Desktop staff frame, «Подгответе с Butler» next to the manual primary on O02 default / new (`11:4257`, `602:18685`) and «Подгответе чернова с Butler» on O03; no keyboard shortcut is annotated on any frame. Before: no public entry at all. |
| 2 | Fast first value | PASS | Visitor: 1 action from the filled form to the committed receipt (T1, walked on both viewports). Broker: 3 actions from the new-inquiry inbox to an owned inquiry with a review time (T7, walked on both viewports). |
| 3 | Live state and stop | PASS | `P11 · Sending` (`598:17787` · `602:18214`): button in loading state, fields locked, «Изчакайте няколко секунди, докато изпратим запитването. Не затваряйте страницата и не натискайте отново.» and «Изпращаме го веднъж. Ако връзката прекъсне, проверяваме същото запитване, без да създаваме ново.» (`598:17817` · `602:18250`). The send is atomic, so there is no Stop; no long-running W03 job lacks one. `O01 · Loading` (`605:37147` · `605:37367`) says «Изчакайте няколко секунди, докато заредим задачите за днес.» |
| 4 | Consequences before irreversible actions | PASS | Send: «Изпращаме го веднъж. Това не резервира оглед и не потвърждава наличност.» (`598:17699` on P11 filled D). Accept: «Записва ви като отговорник с преглед на 6 октомври в 10:00. Клиентът не получава съобщение.» (`602:19188` · `602:19242`). Merge: «Окончателното сливане е блокирано до потвърждение…» (O27 `I14:1711;6:401` · `I15:1062;6:401`). Handover: «Прегледайте капацитет, права и изрично приемане. Отнемането на членство не отменя отворени обещания или уговорки.» (O23H `I21:937;6:408`). |
| 5 | One primary action per empty state | PASS | `O02UNCLAIMED` (D `66:34531` · M `66:34558`): «Няма потвърдени непоети разговори» (`75:19304` · `75:19483`) with exactly one primary, «Провери заместването · Алекс» (`75:19308` · `75:19487`), and two secondary actions («Провери заместването · Никол» `75:19310`, «Всички разговори» `75:19301`). Before Phase B3 it had none. `O01 · Empty` (D `605:37516` · M `605:37732`): one primary «Отворете входящите» (`605:37728` · `605:37873`). Error and Offline states of O01 each carry one primary «Заредете страницата отново» (`605:38089` · `605:38234`, `605:38450` · `605:38595`). |
| 6 | No dead ends | PASS | Invalid, rejected and offline states name the field, keep every value and offer one primary way on (`598:17700`, `598:17886`, `598:17973` and Mobile twins; invalid: «Поправете 1 поле, за да изпратите. Нищо не е изпратено.» `I598:17781;6:415`). Unknown check offers «Свържете се по друг начин» (`66:34211`). |
| 7 | Unknown shown as unknown | PASS | `P12U` (`22:1666`): «Не изпращайте повторно, докато текущият резултат е неизвестен.» (`I22:1684;6:408`). `P12UCHECK` (`66:34211`): «Резултатът все още не е потвърден» (`66:34223`) with «Към същата заявка». Receipt says «Брокер още не го е прочел» (`602:18483`) instead of implying it was read. |
| 8 | Phone parity | **FAIL** | Bulgarian passes: every W03 state exists at 390 and T1–T5, T7–T10 have the same action count on phone. Hebrew right-to-left has only the filled and committed screens; its default, invalid, sending, rejected, offline, unknown and status-check frames are missing. |
| 9 | Keyboard and WCAG 2.2 AA | **NO EVIDENCE (counts as fail)** | The design system has focus variants (UI04 / UI06 «Focus»), but no W03 frame annotates focus order, and contrast / target size / right-to-left reading order can only be proven on the PR preview. |
| 10 | Speed without jumps | OPEN | Design check passed earlier: in `P11 · Sending` the reference note sits below the buttons and the instruction keeps the same height, so the pressed button does not move. Timings (100 ms feedback, 200 ms skeleton) need the PR-preview performance run. |

Two more checks from the owner's rules (GATE intro «every screen says in one sentence what to do next»; scenario dates, audit D05):

| Check | Verdict | Evidence |
|---|---|---|
| A. A next-step line on each W03 screen | **FAIL: 42 of 46 screens** | 24 screens have a lead sentence under the title, 13 a labelled row, 5 a sentence in the body (table below). Missing on O03L, O05W, O23HD and O23OFF (D-6). |
| B. No past dates | **FAIL** | O01 «29 септември · 16:00 · Предложен час», O03N and O05W «30 септември 2026», O05WR «Преглед на 30 септември» read as past next to «6 октомври 2026» on O03 · Accept · ready (D-4). The earlier O27PENDING finding is closed («След 2 работни дни, 10:00»). |

**G3 result for W03: FAIL.** Item 5 now passes (was FAIL). Items 1 and 8 fail, item 9 has no evidence, item 10 is open, checks A and B fail.

### Next-step line per screen (check A)

Kinds: lead sentence under the title; labelled row or field («Следваща стъпка», «Какво следва», …); sentence in the body or in an alert. Hebrew has the Mobile frame only.

| Screen (packet name) | Kind | Line | Node id D · M |
|---|---|---|---|
| `P11-default` | lead sentence | «Напишете въпроса си и прегледайте запитването, преди да го изпратите.» | `605:24976` · `605:24977` |
| `P11-filled` | lead sentence | «Проверете данните и изпратете запитването. Брокер от екипа ще ви отговори по на…» | `597:2274` · `598:18125` |
| `P11-filled-he-rtl` | lead sentence | «בדקו את הפרטים ושלחו את הפנייה. מתווך מהצוות יחזור אליכם בדרך שתבחרו.» | — · `602:18577` |
| `P11-invalid` | lead sentence | «Поправете имейла или телефона и изпратете запитването.» | `598:17714` · `602:18145` |
| `P11-sending` | lead sentence | «Изчакайте няколко секунди, докато изпратим запитването. Не затваряйте страницат…» | `598:17801` · `602:18225` |
| `P11-rejected` | lead sentence | «Поправете имейла и изпратете отново. Всичко останало е запазено.» | `598:17900` · `602:18317` |
| `P11-offline` | lead sentence | «Свържете се с интернет и опитайте отново. Въведеното е запазено.» | `598:17987` · `602:18397` |
| `P12-committed` | labelled row | «Какво следва» → «Брокер от екипа в Сандански ще ви пише по имейл» | `602:18495` · `602:18548` |
| `P12-committed-he-rtl` | labelled row | «מה הלאה» → «מתווך מהצוות בסנדנסקי יכתוב לכם באימייל» | — · `602:18667` |
| `P12-generic-demo` | sentence in body | «Запазете номера на заявката. Потвърждението на наличност и уговорка е отделна с…» | `11:1571` · `11:8790` |
| `P12-unknown` | lead sentence | «Запазете номера за проверка 024. Резултатът от същата заявка още се проверява.» | `22:1683` · `24:2220` |
| `P12-unknown-check` | lead sentence | «Не изпращайте повторно. Запазете същата заявка и нейния номер, докато получите …» | `66:34228` · `66:34268` |
| `O01-default` | lead sentence | «Започнете с трите неща, които чакат действие днес.» | `10:288` · `14:4357` |
| `O02-default` | lead sentence | «Изберете разговор и поемете следващото действие.» | `11:4342` · `18:2919` |
| `O02-new-in-queue` | lead sentence | «Ново запитване чака отговорник. Поемете го или го назначете на колега.» | `602:18765` · `602:18840` |
| `O02-unclaimed` | sentence in body | «Неясният отговорник не означава свободен разговор. Проверете заместването, пред…» | `75:19305` · `75:19484` |
| `O02-mine` | sentence in body | «Проверете кой замества в момента преди следващото действие.» | `75:19664` · `75:19844` |
| `O03-default` | lead sentence | «Поемете запитването, свържете го със случай и подгответе отговора.» | `605:25008` · `605:25009` |
| `O27-duplicate-check` | lead sentence | «Не сливайте записи само заради сходно име. Първо потвърдете самоличността и зас…» | `I14:1677;6:408` · `I15:1028;6:408` |
| `O27-review-pending` | labelled row | «Следващ преглед» → «След 2 работни дни, 10:00 · Europe/Sofia» | `52:5371` · `52:5427` |
| `O06-default` | lead sentence | «Прегледайте разрешените връзки на лицето, преди да продължите по случая.» | `605:25016` · `605:25017` |
| `O03-accept-time-required` | lead sentence | «Изберете кога ще прегледате запитването отново и го поемете.» | `602:18996` · `602:19054` |
| `O03-accept-ready` | lead sentence | «Изберете кога ще прегледате запитването отново и го поемете.» | `602:19181` · `602:19235` |
| `O03-assign-review` | labelled row | «Следваща стъпка» → «Уточняване на достъп до имота» | `I20:927;6:61` · `I25:2171;6:61` |
| `O03-assign-awaiting-acceptance` | labelled row | «Следваща стъпка» → «Никол приема или отказва · вие получавате известие» | `602:21121` · `602:21164` |
| `O03-assign-recorded` | labelled row | «Следваща стъпка» → «Мария Д. · Проверка на наличността преди предложение за оглед» | `20:1040` · `25:2213` |
| `O03-link-or-create` | none | no next-step line (frames D `20:1055` · M `25:2228`) | — |
| `O03-link-recorded` | labelled row | «Следваща стъпка» → «Мария Д. · Проверка на наличността преди предложение за оглед» | `20:1273` · `25:2306` |
| `O03-create-after-qualify` | labelled row | «Следващо действие» → «Уточняване на изискванията» | `I21:2501;6:61` · `I28:2850;6:61` |
| `O03-created` | labelled row | «Следваща стъпка» → «Мария Д. · Проверка на наличността преди предложение за оглед» | `21:2623` · `28:2902` |
| `O03-resolve-without-case` | labelled row | «Оставаща стъпка» → «Предложен контакт за уточнение» | `I20:1390;6:61` · `I25:2354;6:61` |
| `O03-resolve-recorded` | labelled row | «Следваща стъпка» → «Мария Д. · Проверка на наличността преди предложение за оглед» | `20:1503` · `25:2396` |
| `O04-default` | lead sentence | «Отворете случая, който чака действие, или потърсете по име или номер.» | `605:25012` · `605:25013` |
| `O05-default` | labelled row | «Следващо действие» → «Уточнете изискването за асансьор» | `18:1031` · `16:626` |
| `O05-wait-with-owner-date` | none | no next-step line (frames D `20:341` · M `25:1934`) | — |
| `O05-wait-recorded` | labelled row | «Оставащо действие» → «Мария Д. · Уточняване на документ · Преглед на 30 септември» | `20:568` · `25:2021` |
| `O18-default` | lead sentence | «Изберете задача и отворете случая, към който принадлежи.» | `605:25060` · `605:25061` |
| `O23-default` | lead sentence | «Прегледайте кой има достъп и кой замества при отсъствие. Достъпът, публикуванет…» | `I18:1226;6:401` · `I16:750;6:401` |
| `O23-handover` | sentence in body | «Прегледайте капацитет, права и изрично приемане. Отнемането на членство не отме…» | `I21:937;6:408` · `I25:2840;6:408` |
| `O23-handover-pending` | sentence in body | «Предаването е предложено. Изчаква приемане; дотогава отговаря текущият заместни…» | `I21:1097;6:408` · `I25:2931;6:408` |
| `O23-handover-accepted` | none | no next-step line (frames D `21:1108` · M `25:2942`) | — |
| `O01-loading` | lead sentence | «Изчакайте няколко секунди, докато заредим задачите за днес.» | `605:37227` · `605:37379` |
| `O01-empty` | lead sentence | «Проверете входящите за нови запитвания.» | `605:37596` · `605:37744` |
| `O01-error` | lead sentence | «Заредете страницата отново. Ако не стане, проверете състоянието на системата.» | `605:37957` · `605:38105` |
| `O01-offline` | lead sentence | «Свържете се с интернет и заредете страницата отново.» | `605:38318` · `605:38466` |
| `O23-revoke-staff-access` | none | no next-step line (frames D `327:15031` · M `327:15174`) | — |
