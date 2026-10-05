# W03 · Receive, own and qualify an inquiry — G1 key (judge copy)

Testers receive only the **Goal (testers)** line of a task, in a fresh context, with the screens of their batch and nothing else (no glossary, no product vocabulary, no frame names). Everything else on this page is for the judge. Gate rules: `design/zero-learning/GATE.md`. Packet (images, prompt, judge steps): `design/zero-learning/W03-packet.md`. Owner zero-learning rules: `design/audit.md` section 7A.

- Source: Figma file "MS Realty — AI-native OS & Website · 2027", read after the W03 build on 2026-10-05 (about 15:00 EEST). Design frames live on pages 03 / 06 (screens), 05 / 08 (Agency OS screens) and 09 (states); prototype copies on page 12 (Desktop) and page 13 (Mobile). Every prototype click below was read back as an ON_CLICK reaction.
- Journey screens (binding, `journeys.json`): P11, P12, O01, O02, O03, O06, O23, O18, O04, O05. O27 (duplicate check) is reached from O03 and is part of the duplicates step.
- Counting rule: one action is a tap or click, or one field entry. Form fields are pre-filled in the frames, so typing counts only where a step lists an entry. The «Изпращаме…» step advances on its own after 1.5 s in the prototype and is not counted.
- Pass rule per tester run: the end frame is reached (or the success criterion is met in words) without hints, in at most expert actions + 1 (median over runs). A step the screens do not cover is a **COVERAGE GAP**, reported separately and never counted as a pass.
- Scenario: visitor Алекс asks about property №202 (apartment in the centre of Sandanski, 115 000 €, 76 m² total, 68,5 m² built, 1 bedroom); broker Мария Д. works the inquiry; colleague Никол is the handover receiver. Inquiry number DEMO-Q-024.

## Visitor tasks

### W03-T1 · Send a question about a specific apartment

**Goal (testers):** You are interested in apartment №202 in Sandanski. Your details and your question are already filled in on this page. Send the question to the agency and find out who will answer you and how.

**Start frame:** `P11 · Filled / Запитване за имот №202` — Desktop `597:2224` · Mobile `598:18057` (prototype D `602:19244` · M `602:20111`)

| # | From frame | Action | Control (D proto · M proto) | To frame (Desktop · Mobile) |
|---|---|---|---|---|
| 1 | `P11 · Filled` | tap «Изпрати запитването» | `602:19273` · `602:20146` | `P11 · Sending / Изпращаме запитването` · D `598:17787` · M `602:18214` |
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

**Success criterion:** ends on `P12 · Committed` without retyping anything; the tester notes that the same number DEMO-Q-024 is reused so the team receives one inquiry. Fail: the tester retypes the form, or chooses «Друг начин за контакт» believing the question cannot be sent.

**Required states:** offline / retry with values kept (`598:17973` · `602:18386`). Present.

### W03-T3 · The question was not sent — fix it and send

**Goal (testers):** You tried to send a question about an apartment, but it did not go through. Fix only what is wrong and send it again. Do not retype your message.

**Start frame:** `P11 · Rejected / Запитването не е изпратено` — Desktop `598:17886` · Mobile `602:18306` (prototype D `602:19496` · M `602:20342`)

| # | From frame | Action | Control (D proto · M proto) | To frame (Desktop · Mobile) |
|---|---|---|---|---|
| 1 | `P11 · Rejected` | correct «Имейл или телефон» from alex@exmaple.com to a valid address (one entry) | field `602:19519` · `602:20370` (design `598:17907` · `602:18332`) | same frame |
| 2 | `P11 · Rejected` | tap «Изпрати поправеното запитване» | `602:19526` · `602:20378` | `P11 · Sending` → `P12 · Committed` |

**Expected actions:** 2. Median pass limit: 3.

**Success criterion:** only the email field changes; the message, name, language and contact route are kept; the tester ends on `P12 · Committed`. Fail: the tester clears or retypes the message, or leaves the page.

**Required states:** rejected with values kept, error named on the field (`598:17886` · `602:18306`). Present.

### W03-T4 · Fix the contact and send (phone)

**Goal (testers):** Send this question about an apartment to the agency. If the page asks you to fix something, fix it and send.

**Start frame:** `P11 · Invalid / Поправете контакта` — Mobile `602:18134` · Desktop `598:17700` (prototype M `602:20183` · D `602:19323`)

| # | From frame | Action | Control (M proto · D proto) | To frame |
|---|---|---|---|---|
| 1 | `P11 · Invalid` | complete «Имейл или телефон» (alex@ → alex@example.com, one entry) | field `602:20211` · `602:19346` (design `602:18160` · `598:17721`) | same frame |
| 2 | `P11 · Invalid` | tap «Изпрати запитването» | `602:20219` · `602:19353` | `P11 · Sending` → `P12 · Committed` |

**Expected actions:** 2. Median pass limit: 3.

**Success criterion:** the tester names the contact field as the only problem, fixes it and sends; ends on `P12 · Committed`.

**Required states:** validation error (`598:17700` · `602:18134`). Present.

### W03-T5 · Did my question arrive?

**Goal (testers):** You sent a question to the agency, but the page never said whether it arrived. Find out whether it arrived, without sending it a second time.

**Start frame:** `P12U / Проверяваме получаването` — Desktop `22:1666` · Mobile `24:2203` (prototype D `63:26892` · M `66:56337`)

| # | From frame | Action | Control (D proto · M proto) | To frame (Desktop · Mobile) |
|---|---|---|---|---|
| 1 | `P12U` | tap «Провери същата заявка» | `66:36418` · `66:56358` | `P12UCHECK / Резултатът все още не е потвърден` · D `66:34211` · M `66:34251` |

**Expected actions:** 1. Median pass limit: 2 (a second tap on «Друг начин за контакт», D `125:9610` · M `129:3518`, is acceptable).

**Success criterion:** the tester reports that the result is still not confirmed, keeps the number DEMO-Q-024 and does not send again. Evidence: «Резултатът все още не е потвърден» (D `66:34223` · M `66:34263`). Fail: any action that sends a new inquiry.

**Required states:** unknown outcome (`22:1666` · `24:2203`), status check of the same request (`66:34211` · `66:34251`). Present. G2 note: the check screen's button says «Към същата операция».

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
| 1 | `O02 · New in queue` | tap «Поеми запитването» (Mobile: «Поеми запитването на Алекс») | `602:19843` · `602:20578` | `O03 · Accept · time required / Поемане на запитването` · D `602:18881` · M `602:19008` |
| 2 | `O03 · Accept · time required` | choose a future day and time in «Кога ще прегледате отново? *» (one entry; prototype: tap the field) | `602:19958` · `602:20624` | `O03 · Accept · ready` · D `602:19066` · M `602:19189` |
| 3 | `O03 · Accept · ready` | tap «Поеми запитването» | `602:20083` · `602:20681` | `O03L / Свързване или създаване на преписка` · D `20:1055` · M `25:2228` (prototype D `63:12845` · M `66:45642`) |

**Expected actions:** 3 on both viewports. Median pass limit: 4.

**Success criterion:** the tester chooses the review time themself, then accepts, and says that the client is not notified. Evidence: rule «Задължително: бъдещ ден и час. Няма час по подразбиране…» (D `602:19000` · M `602:19058`); effect «Записва ви като отговорник с преглед на 6 октомври в 10:00. Клиентът не получава съобщение.» (D `602:19188` · M `602:19242`). Fail: the tester tries to accept with the time empty, or assumes a time was set for them.

**Required states:** new in the owned queue, accept with an empty required future time (no default, button disabled), accept ready. All present.

### W03-T8 · Check for a duplicate without merging

**Goal (testers):** Before you work on Alex's new question, check whether Alex already exists in the system. Do not combine any records unless you are sure they are the same person.

**Start frame:** `O03 / Разговор с Алекс` — Desktop `18:732` · Mobile `16:463` (prototype D `63:12514` · M `66:45509`)

| # | From frame | Action | Control (D proto · M proto) | To frame (Desktop · Mobile) |
|---|---|---|---|---|
| 1 | `O03` | tap «Провери възможен дубликат» | `63:12621` · `66:45550` | `O27 / Проверка за дубликати` · D `14:1592` · M `15:1014` (prototype D `63:23379` · M `66:53439`) |
| 2 | `O27` | tap «Запази за допълнителна проверка» | `63:23481` · `66:53473` | `O27PENDING / Прегледът е отложен с ангажимент` · D `52:5335` · M `52:5391` |

**Expected actions:** 2. Median pass limit: 3.

**Success criterion:** nothing is merged; the tester says identity is not confirmed, so the two records stay separate until a check. «Запази като отделни контакти» is accepted in words (it has no prototype reaction). Evidence: «Прегледът е отложен с ангажимент» (D `52:5347` · M `52:5403`). Fail: the tester ticks the confirmation and claims a merge.

**Required states:** duplicate candidates side by side, deferred review. Present. Note: O27PENDING shows the review time «30 септември 2026», earlier than the «6 октомври 2026» used in O03 · Accept; align the scenario dates so the review time reads as future (D05).

### W03-T9 · Attach the question to Alex's existing purchase

**Goal (testers):** Alex already has an open purchase with the agency. Attach his new question to it, then tell us what the next step is and who does it.

**Start frame:** `O03 / Разговор с Алекс` — Desktop `18:732` · Mobile `16:463` (prototype D `63:12514` · M `66:45509`)

| # | From frame | Action | Control (D proto · M proto) | To frame (Desktop · Mobile) |
|---|---|---|---|---|
| 1 | `O03` | tap «Свържи или създай преписка» | `63:12633` · `66:45564` | `O03L` · D `20:1055` · M `25:2228` |
| 2 | `O03L` | tap «Запиши DEMO свързване» | `63:12940` · `66:45671` | `O03LR / Записано свързване · DEMO` · D `20:1175` · M `25:2279` |

**Expected actions:** 2. Median pass limit: 3 (opening the purchase with «Към служебната преписка», D `63:13044` · M `66:45707`, is acceptable).

**Success criterion:** the tester reports that the question is attached and that the next step is the availability check before a viewing proposal, by Мария Д. Evidence: «Запитването е свързано с преписката.» (D `20:1262` · M `25:2295`), «Мария Д. · DEMO · Проверка на наличността преди предложение за оглед» (D `20:1273` · M `25:2306`).

**Required states:** link, link recorded, create after qualifying (`21:2399` · `28:2817`), resolve without a case with a reason (`20:1288` · `25:2321`). Present. G2 note: «преписка», «ангажимент» on every screen of this path.

### W03-T10 · Hand over open work before you are away

**Goal (testers):** You will be away next week. Make sure your open work, including Alex's question, passes to your colleague Nikol and nothing is dropped.

**Start frame:** `O23 / Екип, достъп и заместване` — Desktop `18:1141` · Mobile `16:736` (prototype D `63:20897` · M `66:51729`)

| # | From frame | Action | Control (D proto · M proto) | To frame (Desktop · Mobile) |
|---|---|---|---|---|
| 1 | `O23` | tap «Предай отворена работа» | `63:21010` · `66:51774` | `O23H / Предаване на отворена работа` · D `21:788` · M `25:2760` (prototype D `63:21162` · M `66:51858`) |
| 2 | `O23H` | tap «Предложи DEMO предаване» | `63:21298` · `66:51928` | `O23HP / Изчаква приемане на работата` · D `21:948` · M `25:2851` |

**Expected actions:** 2. Median pass limit: 3.

**Success criterion:** the tester says the handover is proposed and waits for Nikol to accept; until then the work stays with the current owner. Evidence: «Изчаква приемане на работата» (D `21:1032` · M `25:2864`).

**Required states:** handover proposal, pending acceptance, accepted (`21:1108` · `25:2942`). Present. Related state built in this pass: `O03 · Assign · awaiting acceptance / Чака приемане от Никол` (D `602:21029` · M `602:21140`), static only.

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
| | generic DEMO receipt (no listing) | `11:1545` | `11:8773` | — |
| V4 Result: unknown (P12) | unknown outcome | `22:1666` | `24:2203` | **missing** |
| | check the same request | `66:34211` | `66:34251` | **missing** |
| V5 Result: rejected (P11) | rejected, values kept | `598:17886` | `602:18306` | **missing** |
| S1 Accepted inquiry in the owned queue (O01 / O02) | Today | `10:203` | `14:4343` | — |
| | inbox | `11:4257` | `18:2905` | — |
| | new in queue, no owner | `602:18685` | `602:18828` | — |
| | unowned tab (empty) | `66:34531` | `66:34558` | — |
| | mine | `66:34585` | `66:34636` | — |
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

Prototype copies built in this pass — page 12 (Desktop): P11FILLED `602:19244`, P11INVALID `602:19323`, P11SENDING `602:19409`, P11REJECTED `602:19496`, P11OFFLINE `602:19582`, P12COMMITTED `602:19667`, O02NEW `602:19725`, O03ACCEPT `602:19870`, O03ACCEPTREADY `602:19990`. Page 13 (Mobile): the same nine (`602:20111`, `602:20183`, `602:20262`, `602:20342`, `602:20421`, `602:20499`, `602:20548`, `602:20603`, `602:20654`) plus P11FILLEDHE `602:20889` and P12COMMITTEDHE `602:20963`. Flow starts added on both pages: «Website · inquiry №202 · send and result», «Agency · new inquiry №202 · accept with review time»; page 13 also «Website · inquiry №202 · Hebrew RTL».

## G2 check — remaining banned terms in W03 visible copy

Scan of every visible text node in the 80 W03 frames exported for the packet (every coverage-table frame except the revoke state `327:15031` · `327:15174`; hidden layers skipped), against the list in `GATE.md` G2. No W03 frame has a technical-details disclosure, so every hit is on a primary surface. **Result: FAIL.** Frames built in this pass carry only the inherited rail item «Преписки» and the prototype DEMO markers.

| Term group | Text nodes | Frames | Distinct strings |
|---|---|---|---|
| DEMO marker (prototype only) | 319 | 79 | 82 |
| Operation / операция / identifier | 4 | 4 | 2 |
| Преписка / преписки (case object) | 96 | 42 | 34 |
| Ангажимент / Engagement / Mandate | 24 | 22 | 8 |
| Case / Случай / Дело (incl. DEMO-CASE ids) | 28 | 18 | 11 |
| Version label (v3 / Версия N) | 12 | 8 | 5 |
| Coverage / Покритие | 26 | 12 | 13 |
| Interest / Интерес (object) | 8 | 4 | 4 |
| Brief / Бриф | 2 | 2 | 1 |
| Stage / Етап field | 2 | 2 | 1 |
| Technical jargon (worker, runtime, MFA, Payload, idempotency, principal, Hermes) | 4 | 2 | 2 |

#### DEMO marker (prototype only)

319 nodes on 79 of 80 frames. These are prototype markers, not product copy; they must not ship and are tracked as one item. Most frequent strings:

- «Демо среда · Измислени частни записи» × 52
- «Демонстрационен профил» × 28
- «Мария Д. · DEMO» × 18
- «DEMO-Q-024 · Точен приет контекст» × 16
- «DEMO · Примерни данни. Не се изпраща съобщение до екипа.» × 12
- «DEMO резултат · Локалното решение е прието. Доставката на съобщение остава отделен резултат.» × 8
- «Мария Д. · DEMO · Проверка на наличността преди предложение за оглед» × 8
- «Демонстрационен сценарий» × 6

#### Operation / операция / identifier

| Visible text | Where (screen · state · viewport `node id`) |
|---|---|
| «Към същата операция» | P12 unknown-check D `I66:34249;6:3` · P12 unknown-check M `I66:34289;6:3` |
| «Демонстрационен резултат от приета локална операция. Това не е реална клиентска преписка.» | O05 wait-recorded D `I20:551;6:401` · O05 wait-recorded M `I25:2004;6:401` |

#### Преписка / преписки (case object)

| Visible text | Where (screen · state · viewport `node id`) |
|---|---|
| «Преписки» (staff navigation rail item) | 30 nodes, every staff frame in scope (O01, O02, O03, O04, O05, O06, O18, O23, O27); e.g. O01 · default · D `10:226` |
| «Свържи или създай преписка» | O03 default D `I18:885;6:3` · O03 default M `I16:549;6:3` |
| «Приключи без преписка» | O03 default D `I18:887;6:6` · O03 default M `I16:551;6:6` |
| «Агенция / Свързване или създаване на преписка» | O03 link-or-create D `20:1130` |
| «Свързване или създаване на преписка» | O03 link-or-create D `20:1139` · O03 link-or-create M `25:2241` |
| «Свързване със съществуваща преписка · DEMO» | O03 link-or-create D `I20:1144;6:61` · O03 link-or-create M `I25:2246;6:61` |
| «Преписка» | O03 link-or-create D `I20:1148;6:59` · O03 link-or-create M `I25:2251;6:59` |
| «Няма подходяща преписка — прегледай създаване» | O03 link-or-create D `I20:1162;6:6` · O03 link-or-create M `I25:2266;6:6` |
| «Съвпадение по имейл не е доказана идентичност. Новата преписка изисква тип, отговорник и следващо действие; свързването » | O03 link-or-create D `I20:1164;6:408` · O03 link-or-create M `I25:2268;6:408` · O03 create-after-qualify D `I21:2514;6:408` · O03 create-after-qualify M `I28:2864;6:408` |
| «Запитването е свързано с преписката.» | O03 link-recorded D `20:1262` · O03 link-recorded M `25:2295` |
| «Към служебната преписка» | O03 link-recorded D `I20:1284;6:3` · O03 link-recorded M `I25:2317;6:3` · O03 created D `I21:2634;6:3` · O03 created M `I28:2913;6:3` |
| «Тип преписка» | O03 create-after-qualify D `I21:2488;6:59` · O03 create-after-qualify M `I28:2835;6:59` |
| «Създай DEMO преписка» | O03 create-after-qualify D `I21:2521;6:3` · O03 create-after-qualify M `I28:2871;6:3` |
| «Агенция / Преписка е създадена · DEMO» | O03 created D `21:2600` |
| «Преписка е създадена · DEMO» | O03 created D `21:2609` · O03 created M `28:2888` |
| «Преписката е създадена след квалифициране.» | O03 created D `21:2612` · O03 created M `28:2891` |
| «Агенция / Приключване без преписка» | O03 resolve-without-case D `20:1363` |
| «Приключване без преписка» | O03 resolve-without-case D `20:1372` · O03 resolve-without-case M `25:2334` |
| «Запитването е приключено без преписка.» | O03 resolve-recorded D `20:1492` · O03 resolve-recorded M `25:2385` |
| «Свързаните преписки, документи, права и ограничения се проверяват поотделно. Историята на двата записа се запазва. Разли» | O27 duplicate-check D `14:1700` · O27 duplicate-check M `15:1051` |
| «Проверете преписката, версията на източника и кой поема следващото действие.» | O06 default D `11:4937` · O06 default M `14:4628` |
| «Към преписката» | O06 default D `I11:4939;6:9` · O06 default M `I14:4629;6:6` |
| «Агенция / Преписки» | O04 default D `14:1922` |
| «DEMO · Частна преписка DEMO-CASE-01» | O05 default D `I18:999;6:179` · O05 default M `I16:592;6:179` |
| «Активната преписка има отговорник и действие или условие за изчакване.» | O05 default D `18:1022` · O05 default M `16:617` |
| «Интерес B · Отказът от един имот не затваря преписката» | O05 default D `18:1080` · O05 default M `16:675` |
| «Работа по преписката» | O05 default D `18:1085` · O05 default M `16:680` |
| «Ролята в преписката не дава достъп до всички документи» | O05 default D `18:1131` · O05 default M `16:726` |
| «Демонстрационен резултат от приета локална операция. Това не е реална клиентска преписка.» | O05 wait-recorded D `I20:551;6:401` · O05 wait-recorded M `I25:2004;6:401` |
| «Преписката изчаква отговор.» | O05 wait-recorded D `20:557` · O05 wait-recorded M `25:2010` |
| «Нито един имот не е отбелязан автоматично като продаден или отдаден. Другите преписки не са променени.» | O05 wait-recorded D `I20:572;6:401` · O05 wait-recorded M `I25:2025;6:401` |
| «Към преписките» | O05 wait-recorded D `I20:581;6:6` · O05 wait-recorded M `I25:2034;6:6` |
| «Към преписката на Алекс» | O18 default D `I14:2119;6:3` · O18 default M `I15:505;6:3` |
| «Активно членство · Задачи и възложени преписки · MFA проверка: демонстрация» | O23 default D `18:1243` · O23 default M `16:767` |

#### Ангажимент / Engagement / Mandate

| Visible text | Where (screen · state · viewport `node id`) |
|---|---|
| «Подредено по следващ ангажимент» | O01 default D `10:300` · O01 default M `14:4369` |
| «Запазете намерението, текущия безопасен статус на обявата и нужния следващ ангажимент.» | O03 default D `18:864` · O03 default M `16:526` |
| «Отвори ангажиментите» | O03 default D `I18:889;6:6` · O03 default M `I16:553;6:6` |
| «Следващ ангажимент» | O03 assign-review D `I20:927;6:59` · O03 assign-review M `I25:2171;6:59` · O03 assign-recorded D `20:1039` · O03 assign-recorded M `25:2212` · O03 link-recorded D `20:1272` · O03 link-recorded M `25:2305` (+4 more) |
| «Оставащ ангажимент» | O03 resolve-without-case D `I20:1390;6:59` · O03 resolve-without-case M `I25:2354;6:59` |
| «Прегледът е отложен с ангажимент» | O27 review-pending D `52:5347` · O27 review-pending M `52:5403` |
| «Разговор и следващ ангажимент» | O05 default D `18:1092` · O05 default M `16:687` |
| «DEMO: получателят прие; текущите права и наличността са проверени. DEMO-OP-HANDOVER-4 записва отговорността и запазва ан» | O23 handover-accepted D `I21:1257;6:401` · O23 handover-accepted M `I25:3022;6:401` |

#### Case / Случай / Дело (incl. DEMO-CASE ids)

| Visible text | Where (screen · state · viewport `node id`) |
|---|---|
| «DEMO-CASE-01 · Уточняване на изисквания» | O01 default D `10:347` · O01 default M `14:4416` |
| «Имот №202 · DEMO-CASE-01» | O02 mine D `I75:19656;6:164` · O02 mine M `I75:19836;6:164` |
| «DEMO-CASE-01 · Покупка» | O03 link-or-create D `I20:1148;6:61` · O03 link-or-create M `I25:2251;6:61` · O27 duplicate-check D `14:1688` · O27 duplicate-check M `15:1039` · O04 default D `14:1951` · O04 default M `14:4555` |
| «DEMO-CASE-02 · Консултация» | O27 duplicate-check D `14:1695` · O27 duplicate-check M `15:1046` |
| «DEMO-CASE-02 · Наем» | O04 default D `14:1960` · O04 default M `14:4564` |
| «DEMO-CASE-03 · Продажба» | O04 default D `14:1969` · O04 default M `14:4573` |
| «Отвори DEMO-CASE-01» | O04 default D `I14:1975;6:3` · O04 default M `I14:4579;6:3` |
| «DEMO · Частна преписка DEMO-CASE-01» | O05 default D `I18:999;6:179` · O05 default M `I16:592;6:179` |
| «DEMO · DEMO-CASE-01 · v4» | O05 wait-with-owner-date D `I20:426;6:179` · O05 wait-with-owner-date M `I25:1948;6:179` · O05 wait-recorded D `I20:549;6:179` · O05 wait-recorded M `I25:2002;6:179` |
| «Мария Д. · Алекс · DEMO-CASE-01 ⏎ Преди подбора · Очаква отговор от клиента» | O18 default D `189:15443` · O18 default M `189:15455` |
| «Подбор на имоти · DEMO-CASE-01» | O18 default D `14:2100` · O18 default M `15:486` |

#### Version label (v3 / Версия N)

| Visible text | Where (screen · state · viewport `node id`) |
|---|---|
| «Текущ запис · v3» | O01 default D `I10:375;6:217` · O01 default M `I14:4444;6:217` |
| «DEMO Brief v3 · Непотвърдените критерии остават въпроси.» | O05 default D `18:1045` · O05 default M `16:640` |
| «Текущи изисквания · v3» | O05 default D `18:1051` · O05 default M `16:646` |
| «DEMO · DEMO-CASE-01 · v4» | O05 wait-with-owner-date D `I20:426;6:179` · O05 wait-with-owner-date M `I25:1948;6:179` · O05 wait-recorded D `I20:549;6:179` · O05 wait-recorded M `I25:2002;6:179` |
| «Преглед на точната версия v4. Ако е променена междувременно, решението се връща за нов преглед; въведеното се запазва.» | O05 wait-with-owner-date D `I20:447;6:408` · O05 wait-with-owner-date M `I25:1971;6:408` |

#### Coverage / Покритие

| Visible text | Where (screen · state · viewport `node id`) |
|---|---|
| «Разговори с потвърдено свободно покритие.» | O02 unclaimed D `75:19297` · O02 unclaimed M `75:19476` |
| «Неясният отговорник не означава свободен разговор. Проверете покритието, преди да го поемете.» | O02 unclaimed D `75:19305` · O02 unclaimed M `75:19484` |
| «Проверка на покритието» | O02 unclaimed D `75:19307` · O02 unclaimed M `75:19486` |
| «Провери покритието · Алекс» | O02 unclaimed D `I75:19308;6:6` · O02 unclaimed M `I75:19487;6:6` |
| «Провери покритието · Никол» | O02 unclaimed D `I75:19310;6:6` · O02 unclaimed M `I75:19489;6:6` |
| «Проверете текущото покритие преди следващото действие.» | O02 mine D `75:19664` · O02 mine M `75:19844` |
| «Покритие» | O03 default D `I18:843;6:59` · O03 default M `I16:504;6:59` |
| «Приетата заявка остава в опашката за покритие дори при проблем с имейла или Butler. Автоматичната разписка не е човешки » | O03 default D `I18:851;6:401` · O03 default M `I16:513;6:401` |
| «Покритие и език» | O03 assign-review D `I20:918;6:59` · O03 assign-review M `I25:2161;6:59` |
| «Проверяват се текущите права, език, отсъствия и поемане на отговорността. При липса на получател задачата остава под пок» | O03 assign-review D `I20:931;6:408` · O03 assign-review M `I25:2175;6:408` |
| «Огледи и покритие · Без автоматичен достъп до финансови документи» | O23 default D `18:1255` · O23 default M `16:779` |
| «Предаването е предложено в демонстрацията. Изчаква приемане; текущото покритие остава отговорно. При отсъстващ/неподходя» | O23 handover-pending D `I21:1097;6:408` · O23 handover-pending M `I25:2931;6:408` |
| «Към текущото покритие» | O23 handover-pending D `I21:1106;6:6` · O23 handover-pending M `I25:2940;6:6` |

#### Interest / Интерес (object)

| Visible text | Where (screen · state · viewport `node id`) |
|---|---|
| «Изисквания и интерес към имоти» | O05 default D `18:1044` · O05 default M `16:639` |
| «Интерес A · Наличността и достъпът се проверяват» | O05 default D `18:1070` · O05 default M `16:665` |
| «Интерес B · Отказът от един имот не затваря преписката» | O05 default D `18:1080` · O05 default M `16:675` |
| «Изчакването запазва етапа, интересите и историята; задачата за последващ преглед остава активна.» | O05 wait-with-owner-date D `I20:453;6:401` · O05 wait-with-owner-date M `I25:1977;6:401` |

#### Brief / Бриф

| Visible text | Where (screen · state · viewport `node id`) |
|---|---|
| «DEMO Brief v3 · Непотвърдените критерии остават въпроси.» | O05 default D `18:1045` · O05 default M `16:640` |

#### Stage / Етап field

| Visible text | Where (screen · state · viewport `node id`) |
|---|---|
| «Етап» | O05 default D `I18:1012;6:59` · O05 default M `I16:606;6:59` |

#### Technical jargon (worker, runtime, MFA, Payload, idempotency, principal, Hermes)

| Visible text | Where (screen · state · viewport `node id`) |
|---|---|
| «Активно членство · Задачи и възложени преписки · MFA проверка: демонстрация» | O23 default D `18:1243` · O23 default M `16:767` |
| «Вход и MFA» | O23 default D `18:1272` · O23 default M `16:796` |

## G3 checklist — W03 with frame evidence

| # | Item | Verdict | Evidence |
|---|---|---|---|
| 1 | One Butler entry everywhere | **FAIL** | Staff screens have the rail item «Butler» (O02 `11:4308`) and «Подготви с Butler» (O02 · New `602:18685`), with the manual path beside it. Public P11 / P12 frames (`597:2224`, `602:18463`, `602:18566`) have no Butler entry at all. |
| 2 | Fast first value | PASS | Visitor: 1 action from the filled form to the committed receipt (T1). Broker: 3 actions from the new-inquiry inbox to an owned inquiry with a review time (T7). |
| 3 | Live state and stop | PASS | `P11 · Sending` (`598:17787` · `602:18214`): button in loading state, fields locked, «Изпращаме го веднъж. Ако връзката прекъсне, проверяваме същото запитване, без да създаваме ново.» The send is atomic, so there is no Stop; no long-running W03 job lacks one. |
| 4 | Consequences before irreversible actions | PASS | Send: «Изпращаме го веднъж. Това не резервира оглед и не потвърждава наличност.» (`597:2224`). Accept: «Записва ви като отговорник… Клиентът не получава съобщение.» (`602:19188`). Merge: «Окончателното сливане е блокирано до потвърждение…» (O27 `14:1592`). Handover: alert on O23H `21:788`. |
| 5 | One primary action per empty state | **FAIL** | `O02UNCLAIMED` (`66:34531` · `66:34558`): «Няма потвърдени непоети разговори» with two secondary «Провери покритието · …» buttons and no primary action. |
| 6 | No dead ends | PASS | Invalid, rejected and offline states name the field, keep every value and offer one way on (`598:17700`, `598:17886`, `598:17973` and Mobile twins). Unknown check offers «Друг начин за контакт» (`66:34211`). |
| 7 | Unknown shown as unknown | PASS | `P12U` (`22:1666`): «Не изпращайте повторно, докато текущият резултат е неизвестен.» `P12UCHECK` (`66:34223`): «Резултатът все още не е потвърден». Receipt says «Брокер още не го е прочел» (`602:18483`) instead of implying it was read. |
| 8 | Phone parity | **FAIL** | Bulgarian passes: every W03 state exists at 390 and T1–T5, T7–T10 have the same action count on phone. Hebrew right-to-left has only the filled and committed screens; its error, sending, offline and unknown states are missing. |
| 9 | Keyboard and WCAG 2.2 AA | **NO EVIDENCE (counts as fail)** | The design system has focus variants (UI04 / UI06 «Focus»), but no W03 frame annotates focus order, and contrast / target size / RTL reading order can only be proven on the PR preview. |
| 10 | Speed without jumps | OPEN | Design check passed: in `P11 · Sending` the reference note now sits below the buttons and the instruction keeps the same height, so the pressed button does not move. Timings (100 ms feedback, 200 ms skeleton) need the PR-preview performance run. |

**G3 result for W03: FAIL** (items 1, 5, 8 fail; 9 has no evidence; 10 open).

## Gap list (state of W03 after this pass)

Built in this pass (design frames): P11 · Invalid / Sending / Rejected / Offline at Mobile 390 (`602:18134`, `602:18214`, `602:18306`, `602:18386`); P12 · Committed at 1440 and 390 (`602:18463`, `602:18519`); Hebrew RTL 390 P11 · Filled (`602:18566`) and P12 · Committed (`602:18638`); O02 · New in queue (`602:18685`, `602:18828`); O03 · Accept · time required and · ready (`602:18881`, `602:19008`, `602:19066`, `602:19189`); O03 · Assign · awaiting acceptance (`602:21029`, `602:21140`).

Still missing:

1. Hebrew RTL 390: P11 default, invalid, sending, rejected, offline; P12 unknown and status check.
2. Receiving-owner side of an assignment: the colleague accepts with their own future review time, or declines (Desktop and Mobile).
3. A prototype path from «Изпращаме…» to the rejected or unknown result: a prototype cannot branch on a server outcome, so T3 and T5 start on those screens.
4. G2 copy debt on existing staff screens (table above), led by the case noun «Преписка / Преписки», «Покритие», «ангажимент», DEMO-CASE codes and version labels.
5. Public Butler entry on P11 / P12 and one primary action on the empty unowned-inbox state.
6. Scenario date on O27PENDING («30 септември 2026») reads as past next to the accept screens; D05 requires a future review time.
