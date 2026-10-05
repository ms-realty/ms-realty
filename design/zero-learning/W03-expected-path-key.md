# W03 · Receive, own and qualify an inquiry — G1 key (judge copy)

Testers receive only the **Goal (testers)** line of a task, in a fresh context, with the screens of their batch and nothing else (no glossary, no product vocabulary, no frame names). Everything else on this page is for the judge. Gate rules: `design/zero-learning/GATE.md`. Packet (images, prompt, judge steps): `design/zero-learning/W03-packet.md`. Owner zero-learning rules: `design/audit.md` section 7A. Result of the latest gate run: `design/zero-learning/W03-gate-result.md`.

- Source: Figma file "MS Realty — AI-native OS & Website · 2027". First read after the W03 build; re-read after Phase B (copy, DEMO markers, links) and Phase C1b (next-step lines, visible links, states, RTL icon); re-read after Phase C1a, version «After C1a W03+P12» (id 2406915564060113647): staff noun «Сделка» instead of «Случай», the colleague handover on both sides (O23HR … O23HPX), the P12 receipt that names the saved property, the state O27SEPARATE, the O05 field labels, the future scenario dates and the next-step lines on four more screens. Design frames live on pages 03 / 06 (screens), 05 / 08 (Agency OS screens) and 09 (states); prototype copies on page 12 (Desktop) and page 13 (Mobile). Every prototype click below was read back as an ON_CLICK reaction and every path was walked again through those reactions after Phase C1a (section «Prototype walk»). Node ids of earlier frames did not change; frame names, labels and evidence strings below are the current ones. Contract of the new frames: `design/contracts/w03-p12.md`.
- Journey screens (binding, `journeys.json`): P11, P12, O01, O02, O03, O06, O23, O18, O04, O05. O27 (duplicate check) is reached from O03 and is part of the duplicates step; its result states O27PENDING and O27SEPARATE are in the coverage table. The receipt variants of P12 (saved property: public now, not public now, unknown, no saved name, several properties, viewing request) and the handover frames of both sides (O23HR, O23HRA, O23HRD, O23HRDR, O23HRX, O23HPD, O23HPX) are part of the journey since Phase C1a. O01 Loading / Empty / Error / Offline and the revoke state O23OFF stay in the coverage table as reference images.
- Counting rule: one action is a tap or click, or one field entry. Form fields are pre-filled in the frames, so typing counts only where a step lists an entry. Choosing a value in one field (open the field, pick the value) is one entry. The «Изпращаме…» step advances on its own after 1.5 s in the prototype and is not counted.
- Pass rule per tester run: the end frame is reached (or the success criterion is met in words) without hints, in at most expert actions + 1 (median over runs). A step the screens do not cover is a **COVERAGE GAP**, reported separately and never counted as a pass. A tester's END SCREEN is a prediction (testers see no reactions): the judge replays the actions through the prototype reactions, and the RESULT is judged against the replayed end frame. A RESULT that states the opposite of the replayed frame (for example «it arrived» where the frame says «not confirmed») fails.
- Scenario: visitor Алекс asks about property №202 (apartment in the centre of Sandanski, 115 000 €, 76 m² total, 68,5 m² built, 1 bedroom); broker Мария Д. works the inquiry; colleague Никол is the handover receiver. Inquiry number «Номер за проверка: 024». The scenario clock reads 5 October 2026 (the inquiry was saved at 17:12, the handover receipts are time-stamped 18:03 to 18:07); every forward-looking date in the frames is later than that.

## Visitor tasks

### W03-T1 · Send a question about a specific apartment

**Goal (testers):** You are interested in apartment №202 in Sandanski. Your details and your question are already filled in on this page. Send the question to the agency and find out who will answer you and how.

**Start frame:** `P11 · Filled / Запитване за имот №202` — Desktop `597:2224` · Mobile `598:18057` (prototype D `602:19244` · M `602:20111`)

| # | From frame | Action | Control (D proto · M proto) | To frame (Desktop · Mobile) |
|---|---|---|---|---|
| 1 | `P11 · Filled` | tap «Изпратете запитването» | `602:19273` · `602:20146` | `P11 · Sending / Изпращаме запитването` · D `598:17787` · M `602:18214` |
| – | `P11 · Sending` | none (advances after 1.5 s; frame reaction on D `602:19409` · M `602:20262`) | — | `P12 · Committed / Запитването е получено` · D `602:18463` · M `602:18519` |

**Expected actions:** 1 on both viewports. Median pass limit: 2.

**Success criterion:** the tester ends on `P12 · Committed` and says that the inquiry was received, that the sales team in Sandanski is responsible for it, that a broker will write to alex@example.com in Bulgarian, and that no deadline is promised yet. Evidence: «Запитването е получено» (D `602:18480` · M `602:18533`), «Екипът за продажби в Сандански отговаря за запитването от този момент. Брокер още не го е прочел…» (D `602:18483` · M `602:18536`). Since Phase C1a the receipt also names the saved property: block «Имотът в запитването» (D `613:55247` · M `613:55259`) with «Апартамент в центъра на Сандански» (D `613:55252` · M `613:55264`), «№ 202» (D `613:55253` · M `613:55265`), the Quiet button «Вижте имота» (D `I613:55254;6:9` · M `I613:55266;6:9`) and the caption «Името е записано при изпращането на 5 октомври 2026, 17:12…» (D `613:55257` · M `613:55269`). The primary of the receipt is now «Разгледайте още имоти» (D `I602:18486;6:3` · M `I602:18539;6:3`). Fail: «it was read», «they will reply by tomorrow», or any deadline.

**Required states:** submitting (`598:17787` · `602:18214`), committed receipt with the staffed next step and the saved property (`602:18463` · `602:18519`). Both present.

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

**Success criterion:** the tester reports that the result is still not confirmed, keeps the number «Номер за проверка: 024» and does not send again. Evidence: «Резултатът все още не е потвърден» (D `66:34223` · M `66:34263`). Fail: any action that sends a new inquiry, or a RESULT that says the inquiry arrived (the replayed frame says «Резултатът все още не е потвърден»).

**Required states:** unknown outcome (`22:1666` · `24:2203`), status check of the same request (`66:34211` · `66:34251`). Present. Label change since the first key: the check screen's button now says «Към същата заявка» (D `66:34249` · M `66:34289`; it said «Към същата операция» before Phase B1). The second way out on the unknown screen itself is «Свържете се по друг начин» (D `66:36419` · M `66:56359`).

### W03-T6 · Hebrew: send the question (phone, right-to-left)

**Goal (testers, Hebrew):** אתם מתעניינים בדירה №202 בסנדנסקי. הפרטים והשאלה שלכם כבר מולאו בעמוד הזה. שלחו את השאלה לסוכנות וגלו מי יענה לכם ואיך.

*(Judge translation: You are interested in apartment №202 in Sandanski. Your details and question are already filled in on this page. Send the question to the agency and find out who will answer you and how.)*

**Start frame:** `P11 · Filled HE RTL / פנייה לגבי נכס №202` — Mobile `602:18566` (prototype M `602:20889`)

| # | From frame | Action | Control (M proto) | To frame |
|---|---|---|---|---|
| 1 | `P11 · Filled HE RTL` | tap «שליחת הפנייה» | `602:20926` | `P12 · Saved name HE RTL / הפנייה התקבלה` · design M `613:55827` (page 06, next to the superseded `602:18638`) · prototype `P12NAMEDHE` M `613:56367` |

**Expected actions:** 1. Median pass limit: 2. End frame changed in Phase C1a: the control used to lead to `602:20963`; it now leads to `613:56367`. The packet batch VH takes `613:55827` as the end screen.

**Success criterion:** the tester reports that the inquiry was received, that the Sandanski sales team is responsible, and that a broker will write by email in Hebrew with no promised deadline. Evidence: «הפנייה התקבלה» `613:55841`, owner line `613:55844`, next-step row «מה הלאה» `613:55851` → `613:55856`. The saved property is on the receipt: «הנכס בפנייה» `613:55871`, the Bulgarian title in its own isolate `613:55953`, the reference `613:55954` (U+2066…U+2069) and the Quiet button «לצפייה בנכס» `I613:55955;6:9`. The judge also checks that №202, 115,000 €, 76 m², 68.5 m² and alex@example.com read left-to-right inside the Hebrew lines, and that the Cyrillic title keeps its own direction inside the right-aligned row.

**Required states:** filled and committed with the saved property in Hebrew are present; Hebrew sending, invalid, rejected, offline, unknown, and the Hebrew variants of not public now, availability unknown, no saved name and several properties are **COVERAGE GAPs** (Bulgarian only).

## Staff tasks

### W03-T7 · Take a new inquiry and set when you will look at it again

**Goal (testers):** You are a broker at the agency. A new question about apartment №202 has just arrived and nobody is handling it yet. Take it on yourself and set when you will look at it again.

**Start frame:** `O02 · New in queue / Ново запитване в опашката` — Desktop `602:18685` · Mobile `602:18828` (prototype D `602:19725` · M `602:20548`)

| # | From frame | Action | Control (D proto · M proto) | To frame (Desktop · Mobile) |
|---|---|---|---|---|
| 1 | `O02 · New in queue` | tap «Поемете запитването» (Mobile: «Поемете запитването на Алекс») | `602:19843` · `602:20578` | `O03 · Accept · time required / Поемане на запитването` · D `602:18881` · M `602:19008` |
| 2 | `O03 · Accept · time required` | choose a future day and time in «Кога ще прегледате отново? *» (one entry; prototype: tap the field) | `602:19958` · `602:20624` | `O03 · Accept · ready` · D `602:19066` · M `602:19189` |
| 3 | `O03 · Accept · ready` | tap «Поемете запитването» | `602:20083` · `602:20681` | `O03L / Свързване или създаване на сделка` · D `20:1055` · M `25:2228` (prototype D `63:12845` · M `66:45642`) |

**Expected actions:** 3 on both viewports. Median pass limit: 4.

**Success criterion:** the tester chooses the review time themself, then accepts, and says that the client is not notified. Evidence: rule «Задължително: бъдещ ден и час. Няма час по подразбиране…» (D `602:19000` · M `602:19058`); effect «Записва ви като отговорник с преглед на 6 октомври в 10:00. Клиентът не получава съобщение.» (D `602:19188` · M `602:19242`). Fail: the tester tries to accept with the time empty, or assumes a time was set for them (for example by going straight to the «ready» frame).

**Required states:** new in the owned queue, accept with an empty required future time (no default, button disabled), accept ready. All present.

### W03-T8 · Check for a duplicate without merging

**Goal (testers):** Before you work on Alex's new question, check whether Alex already exists in the system. Do not combine any records unless you are sure they are the same person.

**Start frame:** `O03 / Разговор с Алекс` — Desktop `18:732` · Mobile `16:463` (prototype D `63:12514` · M `66:45509`)

| # | From frame | Action | Control (D proto · M proto) | To frame (Desktop · Mobile) |
|---|---|---|---|---|
| 1 | `O03` | tap «Проверете за дубликат» | `63:12621` · `66:45550` | `O27 / Проверка за дубликати` · D `14:1592` · M `15:1014` (prototype D `63:23379` · M `66:53439`) |
| 2 | `O27` | tap «Отложете за допълнителна проверка» | `63:23481` · `66:53473` | `O27PENDING / Прегледът е отложен със следваща стъпка` · D `52:5335` · M `52:5391` |

**Expected actions:** 2. Median pass limit: 3.

**Success criterion:** nothing is merged; the tester says identity is not confirmed, so the two records stay separate until a check. Two other outcomes are right: «Запазете като отделни контакти» (D `63:23482` · M `66:53474`) now leads to the new state `O27SEPARATE / Контактите остават отделни` (design D `606:44379` · M `606:44430`; prototype D `606:44481` · M `606:44535`; evidence «Записахме, че това са двама различни души. Нищо не е обединено и правата не са променени.» D `606:44390` · M `606:44441`, row «Нищо: двата контакта, историята и достъпът са същите» D `606:44412` · M `606:44463`; its one primary «Към запитването на Алекс» D `I606:44426;6:3` → O03), and «Отказ» (D `63:23483` · M `66:53475`) leads back to O03. Evidence for the deferred outcome: «Прегледът е отложен със следваща стъпка» (D `52:5347` · M `52:5403`), «Идентичностите не са обединени и правата не са променени.» (D `52:5348` · M `52:5404`). Fail: the tester ticks the confirmation and claims a merge, or never opens the duplicate check.

**Required states:** duplicate candidates side by side, deferred review, kept separate. All present. The review time on O27PENDING reads «След 2 работни дни, 10:00 · Europe/Sofia» (D `52:5371` · M `52:5427`).

### W03-T9 · Attach the question to Alex's existing purchase

**Goal (testers):** Alex already has an open purchase with the agency. Attach his new question to it, then tell us what the next step is and who does it.

**Start frame:** `O03 / Разговор с Алекс` — Desktop `18:732` · Mobile `16:463` (prototype D `63:12514` · M `66:45509`)

| # | From frame | Action | Control (D proto · M proto) | To frame (Desktop · Mobile) |
|---|---|---|---|---|
| 1 | `O03` | tap «Свържете или създайте сделка» | `63:12633` · `66:45564` | `O03L` · D `20:1055` · M `25:2228` |
| 2 | `O03L` | tap «Запишете свързването» | `63:12940` · `66:45671` | `O03LR / Записано свързване` · D `20:1175` · M `25:2279` |

**Expected actions:** 2. Median pass limit: 3 (opening the purchase with «Към сделката», D `63:13044` · M `66:45707`, is acceptable).

**Success criterion:** the tester reports that the question is attached and that the next step is the availability check before a viewing proposal, by Мария Д. Evidence: «Запитването е свързано със сделката.» (D `20:1262` · M `25:2295`), «Мария Д. · Проверка на наличността преди предложение за оглед» (D `20:1273` · M `25:2306`). Fail: the tester states another next step (the deal screen O05 reads «Уточнете изискването за асансьор»), or says the attachment happened without tapping «Запишете свързването».

**Required states:** link, link recorded, create after qualifying (`21:2399` · `28:2817`), resolve without a deal with a reason (`20:1288` · `25:2321`). Present. Copy note: the staff noun is «сделка» since Phase C1a (owner decision); «случай», «преписка» and «ангажимент» are gone from the frames.

### W03-T10 · Hand over open work before you are away

**Goal (testers):** You will be away next week. Make sure your open work, including Alex's question, passes to your colleague Nikol and nothing is dropped.

**Start frame:** `O23 / Екип, достъп и заместване` — Desktop `18:1141` · Mobile `16:736` (prototype D `63:20897` · M `66:51729`)

| # | From frame | Action | Control (D proto · M proto) | To frame (Desktop · Mobile) |
|---|---|---|---|---|
| 1 | `O23` | tap «Предайте отворената работа» | `63:21010` · `66:51774` | `O23H / Предаване на отворена работа` · D `21:788` · M `25:2760` (prototype D `63:21162` · M `66:51858`) |
| 2 | `O23H` | tap «Предложете предаване» | `63:21298` · `66:51928` | `O23HP / Изчаква приемане на работата` · D `21:948` · M `25:2851` |

**Expected actions:** 2. Median pass limit: 3.

**Success criterion:** the tester says the handover is proposed and waits for Nikol to accept; until then the work stays with the current owner. Evidence: «Изчаква приемане на работата» (D `21:1032` · M `25:2864`), «Предаването е предложено. Изчаква приемане; дотогава отговаря текущият заместник…» (D `I21:1097;6:408` · M `I25:2931;6:408`). Fail: the tester says Nikol has accepted or that the work already moved (O23HP still shows the primary «Вижте приетото предаване», D `I21:1104;6:3`, which leads to the accepted state O23HD, D `21:1108` · M `25:2942`).

**Required states:** handover proposal, pending acceptance, accepted. Present. Since Phase C1a the pending frame carries two more Quiet buttons: «Оттеглете предложението» (→ O23HPX, task T13b) and «Вижте какво получава Никол» (→ O23HR, tasks T11 and T12). Related state: `O03 · Assign · awaiting acceptance / Чака приемане от Никол` (D `602:21029` · M `602:21140`), entered from O03A «Запишете назначаването» (D `63:12738` · M `66:45603`) through `Prototype / O03ASSIGNWAIT` (D `605:24524` · M `605:24651`).

## Colleague handover tasks (new in Phase C1a)

Server truth (`design/contracts/w03-p12.md`, section 1): the receiver accepts with their own next step and review time, or declines with a reason; the work stays with the sender until the accept is read back; the sender can withdraw, which is not a decline; clients receive no message for any handover step. Receiver frames carry the rail user «Никол · Брокер»; sender frames «Мария Д. · Брокер».

### W03-T11 · Accept a colleague's work with your own plan

**Goal (testers):** Your colleague Maria will be away next week and has offered you her open work. Take it over, with your own plan for what you do first and when you will look at it again.

**Start frame:** `O23HR / Мария Д. ви предлага работата си` — Desktop `606:45687` · Mobile `606:45933` (prototype D `606:48758` · M `606:48981`)

| # | From frame | Action | Control (D design · M design) | To frame (Desktop · Mobile) |
|---|---|---|---|---|
| 1 | `O23HR` | enter «Вашата следваща стъпка *» (shown filled: «Обадете се на Алекс за асансьора и достъпа»; entry optional, not wired in the prototype) | `I606:45905;6:61` · `I606:46082;6:61` | same frame |
| 2 | `O23HR` | choose «Кога ще прегледате отново? *» (shown filled: «13 октомври 2026, 10:00 · Europe/Sofia»; entry optional, not wired) | `I606:45909;6:61` · `I606:46086;6:61` | same frame |
| 3 | `O23HR` | tap «Приемете работата» | prototype `606:48921` · `606:49076` (design `I606:45920;6:3` · `I606:46097;6:3`) | `O23HRA / Работата е при вас` · D design `606:46124` · M design `606:46324` (prototype D `606:49138` · M `606:49326`) |

**Expected actions:** 3 when the broker writes own values (two entries and the tap); 1 when the shown values are accepted. Median pass limit: 4.

**Success criterion:** the tester ends on `O23HRA`, says the work is now theirs from this moment, that Мария Д. is notified and that clients receive no message, and names the next step and the review time that were saved. Evidence: «Работата е при вас» (D `606:46203` · M `606:46335`), line «Започнете със стъпката, която записахте. Мария Д. вече е уведомена.» (D `606:46262` · M `606:46393`), «Ваша следваща стъпка» → «Обадете се на Алекс за асансьора и достъпа» (D `606:46275` · M `606:46406`), «Следващ преглед» → «13 октомври 2026, 10:00 · Europe/Sofia» (D `606:46286` · M `606:46417`), «Отговорник от сега» (D `606:46297` · M `606:46428`), receipt «Никол · 5 октомври 2026, 18:05 · потвърждение № 0418» (D `606:46308` · M `606:46439`). Effect line before the tap: «Когато приемете, вие отговаряте за тези три неща от този момент. Мария Д. получава известие; клиентите не получават съобщение.» (D `I606:45913;6:401` · M `I606:46090;6:401`). Fail: the tester says the work was already hers before the tap, or taps «Откажете с причина».

**Required states:** request pending and addressed to me, accepted. Present. **COVERAGE GAP** (design, not a tester failure): there is no «review time required» state like O03 · Accept (empty field, disabled button, rule «Няма час по подразбиране»); O23HR shows both required fields filled, so a tester can accept without writing anything (see key defect K-2). The stale case (`version_conflict`) is not drawn.

### W03-T12 · Turn down a colleague's work and say why

**Goal (testers):** Your colleague Maria will be away next week and has offered you her open work. You cannot take it, because you are away at the same time. Turn it down and say why.

**Start frame:** `O23HR` — Desktop `606:45687` · Mobile `606:45933` (prototype D `606:48758` · M `606:48981`)

| # | From frame | Action | Control (D proto · M proto) | To frame (Desktop · Mobile) |
|---|---|---|---|---|
| 1 | `O23HR` | tap «Откажете с причина» | `606:48922` · `606:49077` | `O23HRD / Откажете предаването` · D design `606:46469` · M `606:46634` (prototype D `606:49448` · M `606:49593`) |
| 2 | `O23HRD` | enter «Причина за отказа *» (shown filled: «Отсъствам по същото време, от 13 до 15 октомври.»; entry optional, not wired) | `I606:46610;6:83` · `I606:46706;6:83` | same frame |
| 3 | `O23HRD` | tap «Изпратете отказа» | `606:49533` · `606:49610` | `O23HRDR / Отказът е записан` · D design `606:46744` · M `606:46933` (prototype D `606:49672` · M `606:49849`) |

**Expected actions:** 3 with an own reason; 2 when the shown reason is accepted. Median pass limit: 4.

**Success criterion:** the tester ends on `O23HRDR` and says the refusal and the reason are recorded, the work stays with Мария Д., she will choose another colleague, and nothing moved to them. Evidence: «Отказът е записан» (D `606:46823` · M `606:46944`), «Не е нужно друго от вас. Мария Д. ще избере друг колега.» (D `606:46882` · M `606:47002`), «Отказано от вас» (D `I606:46883;6:179`), «Причина» → «Отсъствам по същото време, от 13 до 15 октомври.» (D `606:46895` · M `606:47015`), «Работата остава при» → «Мария Д.» (D `606:46906` · M `606:47026`), receipt «Никол · 5 октомври 2026, 18:07 · потвърждение № 0419» (D `606:46917` · M `606:47037`). Effect line before the tap: «Мария Д. ще види причината и ще избере друг колега. Нищо не се прехвърля към вас.» (D `I606:46614;6:401` · M `I606:46710;6:401`). Fail: the tester taps «Приемете работата» or says the work is theirs.

**Required states:** decline form with a required reason, decline recorded (receiver view), sender view `O23HPD`. Present. Not drawn: decline with an empty reason, connection lost, stale request.

### W03-T13a · See that the colleague declined and offer the work to someone else

**Goal (testers):** You offered your open work to your colleague Nikol. She has answered. Find out what she answered, and offer your work to someone else.

**Start frame:** `O23HPD / Никол отказа предаването` — Desktop `606:47386` · Mobile `606:47575` (prototype D `606:50246` · M `606:50423`)

| # | From frame | Action | Control (D proto · M proto) | To frame (Desktop · Mobile) |
|---|---|---|---|---|
| 1 | `O23HPD` | tap «Предложете на друг колега» | `606:50363` · `606:50472` | `O23H / Предаване на отворена работа` · D `21:788` · M `25:2760` (prototype D `63:21162` · M `66:51858`) |

**Expected actions:** 1. Median pass limit: 2.

**Success criterion (words):** the tester says that Никол declined because she is away at the same time (13 to 15 октомври), that the work is still with Мария Д., and that the next step is to offer it to another colleague. Evidence: «Никол отказа предаването» (D `606:47465` · M `606:47586`), «Предложете работата на друг колега или я запазете при себе си.» (D `606:47524` · M `606:47644`), «Отказано от Никол» (D `I606:47525;6:185`), «Причина от Никол» → «Отсъствам по същото време, от 13 до 15 октомври.» (D `606:47537` · M `606:47657`), «Работата е при» → «Вас · Мария Д.» (D `606:47548` · M `606:47668`).

**COVERAGE GAP:** O23H shows the receiver as a fixed row «Получател · Никол»; no frame lets the sender choose a different colleague (key defect K-4). The second half of the goal («to someone else») cannot be completed on these screens, so T13a is reported as a gap, never as a pass.

### W03-T13b · Take back an offer before the colleague answers

**Goal (testers):** You offered your open work to your colleague Nikol, but your plans changed before she answered. Take the offer back.

**Start frame:** `O23HP / Изчаква приемане на работата` — Desktop `21:948` · Mobile `25:2851` (prototype D `63:21610` · M `66:52004`)

| # | From frame | Action | Control (D proto · M proto) | To frame (Desktop · Mobile) |
|---|---|---|---|---|
| 1 | `O23HP` | tap «Оттеглете предложението» | `606:48750` · `606:48754` | `O23HPX / Оттеглихте предложението` · D design `606:47709` · M `606:47898` (prototype D `606:50534` · M `606:50711`) |

**Expected actions:** 1. Median pass limit: 2.

**Success criterion:** the tester ends on `O23HPX` and says the offer is withdrawn, the work stays with Мария Д., Никол sees «Предложението е оттеглено» and not a refusal, and the work can be offered to someone else later. Evidence: «Оттеглихте предложението» (D `606:47788` · M `606:47909`), «Работата остава при вас. Можете да я предложите на друг колега, когато сте готови.» (D `606:47847` · M `606:47967`), «Оттеглено от вас» (D `I606:47848;6:179`), «„Предложението е оттеглено“. Не се записва като отказ.» (D `606:47860` · M `606:47980`). The receiver's view is `O23HRX / Предложението е оттеглено` (D design `606:47067` · M `606:47254`; prototype D `606:49960` · M `606:50136`), reached with «Вижте какво вижда Никол» (D `606:50652` · M `606:50761`), «Оттеглено от Мария Д.» (D `I606:47206;6:179`), «Мария Д. оттегли предложението. Това не е ваш отказ и не се записва като такъв.» (D `606:47218` · M `606:47336`). Fail: the tester says Nikol declined or accepted, taps «Вижте приетото предаване» and reports an accepted handover, or opens the decline form O23HRD.

**Required states:** pending with a withdraw control, withdrawn (sender view), withdrawn (receiver view). Present. Not drawn: withdraw after the receiver already answered, connection lost.

## Saved-property receipt tasks (new in Phase C1a)

The receipt names the property saved at submission and says whether its listing can be opened now. Rows are built from `{reference, title | null, publicNow: true | false | null}`; the screen never shows live price, area or availability (`design/contracts/w03-p12.md`, section 3). The variants are data variants of one receipt; the prototype reaches them from the harness index, and the batches hand each tester one start screen at a time.

### W03-T14 · Which property was my question about, and can I still open its listing?

One run per data variant and per viewport. Goal and role are the same for every variant.

**Goal (testers):** You sent a question to an estate agency a few minutes ago. The page in front of you is what the website showed afterwards. Find out which property your question was about, and whether you can still open that property's listing. Open it if you can.

| Variant | Start frame (design D · M) | Prototype (D · M) | What the screen says | Control (D proto · M proto) → frame | Right answer |
|---|---|---|---|---|---|
| a · public now | `P12 · Committed` `602:18463` · `602:18519` | `P12COMMITTED` `602:19667` · `602:20499` | «Апартамент в центъра на Сандански», «№ 202», button «Вижте имота» | `613:55969` · `613:55981` → `P05` (D `63:26089` · M `66:55737`) | property №202 named; the listing opens (P05) |
| b · not public now | `P12INACTIVE / Обявата вече не е активна` `613:55523` · `613:55604` | `613:56087` · `613:56157` | name, «№ 202», plain line «Тази обява вече не е активна» (D `613:55596` · M `613:55668`), «Вижте подобни имоти» as the only control about this listing | `613:56114` · `613:56181` → `P22` (D `63:28176` · M `66:57861`) | property №202 named; the listing can **not** be opened; similar properties are offered |
| c · availability unknown | `P12UNKNOWN / Наличността на обявата не е известна` `613:55676` · `613:55756` | `613:56228` · `613:56297` | name, «№ 202», no availability line, button «Потърсете имот № 202» (D `I613:55749;6:9` · M `I613:55820;6:9`) | `613:56254` · `613:56320` → `P02` (D `63:25688` · M `66:55174`) | property №202 named; the page does not say whether the listing is open; the way on is a search by the number |
| d · no saved name | `P12NONAME / Запитване без записано име на имота` `613:55372` · `613:55452` | `606:54293` · `606:54343` | «Имот № 202» (D `613:55443` · M `613:55514`), «Името на имота не е записано в това запитване.» (D `613:55444` · M `613:55515`), button «Вижте имота» | `613:55993` · `613:56005` → `P05` | the question was about property №202, the name was not saved; the listing opens (P05) |

**Expected actions:** 1 for each variant (the tap); b may stop at 0 or 1. Median pass limit: 2.

**Success criterion:** the tester names the property (the number, and the name where one is saved) and states the listing status the variant shows, without claiming more. a and d: the listing is opened through «Вижте имота». b: says the listing is no longer active and cannot be opened; any claim that it was opened fails (the property name is not a control; the batch pages P05 and P02 show №202 as live, key defect K-6, so the claim cannot be taken from them). c: says the page does not tell whether it is still open and takes the search by number; a tester who really opens the listing through the search page (P02 → P05) has the answer by experiment and passes, a flat «it is open» or «it is closed» without that fails. Fail on any variant: tapping the property name as if it were a link and reporting a listing that opened.

**Required states:** a, b, c, d. Present (Desktop and Mobile). Hebrew: only a, in `P12 · Saved name HE RTL` (T6); b, c, d in Hebrew are **COVERAGE GAPs**.

### W03-T15 · Several properties in one question

**Goal (testers):** You asked an estate agency about several apartments in one question and sent it. The page in front of you is what the website showed afterwards. Find out which properties your question was about, and which of them you can still open.

**Start frame:** `P12MULTI / Запитване за три имота` — Desktop `606:54028` · Mobile `606:54113` (prototype D `606:54487` · M `606:54528`)

| # | From frame | Action | Control (D proto · M proto) | To frame |
|---|---|---|---|---|
| 1 | `P12MULTI` | tap «Вижте имота» under «Апартамент в центъра на Сандански» | `613:56041` · `613:56068` | `P05` (D `63:26089` · M `66:55737`) |

**Expected actions:** 1 (reading the three rows is not an action). Median pass limit: 2.

**Success criterion:** the tester lists the three properties and the status of each: №202 «Апартамент в центъра на Сандански» (D `613:55324` · `613:55325` · M `613:55351` · `613:55352`) can be opened with «Вижте имота» (D `I613:55326;6:9` · M `I613:55353;6:9`); №200 «Тристаен апартамент в центъра на Сандански» (D `613:55331` · `613:55332` · M `613:55358` · `613:55359`) is no longer active, «Тази обява вече не е активна.» (D `613:55333` · M `613:55360`), with «Вижте подобни имоти» (D `I613:55334;6:9` → P22, prototype `613:56049` · `613:56076`); №912 (D `613:55339` · M `613:55366`) has no saved name, «Името на имота не е записано в това запитване.» (D `613:55340` · M `613:55367`), with «Потърсете имот № 912» (D `I613:55341;6:9` → P02, prototype `613:56056` · `613:56083`). Heading «Имотите в запитването · 3» (D `613:55319` · M `613:55346`), caption «Имената са записани при изпращането на 5 октомври 2026, 17:12…» (D `613:55344` · M `613:55371`), next-step line «Запазете номера за проверка. Брокер ще ви пише за трите имота.» (D `606:54960` · M `606:54961`). Fail: the tester merges the rows, omits a property, or says №200 or №912 can be opened.

**Required states:** mixed list (public, not public, no saved name and unknown). Present. Reaction note: the primary «Към същото сравнение» (D `606:54515` · M `606:54553`, instance `I606:54055;6:3`) has only an ON_HOVER reaction and no ON_CLICK to P07 (D `63:26243` · M `66:55880`), contrary to the contract (key defect K-1).

## Coverage — step × viewport × state → node id

Design frames. «—» means not required for that viewport; **missing** means required and absent.

| Step | State | Desktop 1440 | Mobile 390 | Hebrew RTL 390 |
|---|---|---|---|---|
| V1 Review intent, listing, contact route and language (P11) | default | `11:1469` | `11:8704` | **missing** |
| | filled | `597:2224` | `598:18057` | `602:18566` |
| | validation error | `598:17700` | `602:18134` | **missing** |
| V2 Send once, keep the reference (P11) | submitting | `598:17787` | `602:18214` | **missing** |
| | offline / retry | `598:17973` | `602:18386` | **missing** |
| V3 Result: committed (P12) | committed receipt, saved property public now (a) | `602:18463` | `602:18519` | `613:55827` (superseded `602:18638`) |
| | no saved name (c) | `613:55372` | `613:55452` | **missing** |
| | not public now (d) | `613:55523` | `613:55604` | **missing** |
| | availability unknown (e) | `613:55676` | `613:55756` | **missing** |
| | several properties, mixed (b) | `606:54028` | `606:54113` | **missing** |
| | viewing request receipt | `606:53901` | `606:53969` | **missing** |
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
| | kept separate (new) | `606:44379` | `606:44430` | — |
| | person or organisation | `11:4823` | `14:4583` | — |
| S3 Claim or assign with receiving-owner acceptance (O03 / O23) | accept, future review time required | `602:18881` | `602:19008` | — |
| | accept, ready | `602:19066` | `602:19189` | — |
| | assign review | `20:825` | `25:2138` | — |
| | assign awaiting the receiver | `602:21029` | `602:21140` | — |
| | assign recorded | `20:942` | `25:2186` | — |
| | receiver is offered the work (O23HR) | `606:45687` | `606:45933` | — |
| | receiver accepts with own next step and review time (O23HRA) | `606:46124` | `606:46324` | — |
| | receiver declines, form (O23HRD) | `606:46469` | `606:46634` | — |
| | receiver declines, recorded (O23HRDR) | `606:46744` | `606:46933` | — |
| | sender withdrew, receiver view (O23HRX) | `606:47067` | `606:47254` | — |
| | receiver «accept with an empty required time» | **missing** | **missing** | — |
| S4 Typed deal, link existing or resolve with reason (O03 / O04) | link | `20:1055` | `25:2228` | — |
| | link recorded | `20:1175` | `25:2279` | — |
| | create after qualifying | `21:2399` | `28:2817` | — |
| | created | `21:2525` | `28:2875` | — |
| | resolve without a deal | `20:1288` | `25:2321` | — |
| | resolve recorded | `20:1405` | `25:2369` | — |
| | deal list | `14:1847` | `14:4522` | — |
| S5 Useful response and next commitment (O05 / O18) | deal | `18:914` | `16:578` | — |
| | wait with owner and date | `20:341` | `25:1934` | — |
| | wait recorded | `20:464` | `25:1988` | — |
| | tasks | `14:1979` | `15:436` | — |
| S6 Absence or revocation keeps assignments, records a handover plan (O23 / O18) | team and cover | `18:1141` | `16:736` | — |
| | handover | `21:788` | `25:2760` | — |
| | handover pending (with withdraw) | `21:948` | `25:2851` | — |
| | handover accepted | `21:1108` | `25:2942` | — |
| | sender sees the refusal (O23HPD) | `606:47386` | `606:47575` | — |
| | sender withdrew (O23HPX) | `606:47709` | `606:47898` | — |
| | choose a different receiver | **missing** | **missing** | — |
| | revoke staff access | `327:15031` | `327:15174` | — |

Destination frames used by the receipt tasks (design D · M): P05 `11:1031` · `11:8334`, P02 `11:780` · `11:8107`, P22 `11:2217` · `12:734`, P20 `13:857` · `14:4151`, P07 `29:531` · `29:1085`.

Prototype copies — page 12 (Desktop): P11FILLED `602:19244`, P11INVALID `602:19323`, P11SENDING `602:19409`, P11REJECTED `602:19496`, P11OFFLINE `602:19582`, P12COMMITTED `602:19667`, O02NEW `602:19725`, O03ACCEPT `602:19870`, O03ACCEPTREADY `602:19990`, O03ASSIGNWAIT `605:24524`, O27SEPARATE `606:44481`, O23HR `606:48758`, O23HRA `606:49138`, O23HRD `606:49448`, O23HRDR `606:49672`, O23HRX `606:49960`, O23HPD `606:50246`, O23HPX `606:50534`, P12NONAME `606:54293`, P12MULTI `606:54487`, P12VIEW `606:54390`, P12INACTIVE `613:56087`, P12UNKNOWN `613:56228`. Page 13 (Mobile): P11FILLED `602:20111`, P11INVALID `602:20183`, P11SENDING `602:20262`, P11REJECTED `602:20342`, P11OFFLINE `602:20421`, P12COMMITTED `602:20499`, O02NEW `602:20548`, O03ACCEPT `602:20603`, O03ACCEPTREADY `602:20654`, O03ASSIGNWAIT `605:24651`, O27SEPARATE `606:44535`, O23HR `606:48981`, O23HRA `606:49326`, O23HRD `606:49593`, O23HRDR `606:49849`, O23HRX `606:50136`, O23HPD `606:50423`, O23HPX `606:50711`, P12NONAME `606:54343`, P12MULTI `606:54528`, P12VIEW `606:54440`, P12INACTIVE `613:56157`, P12UNKNOWN `613:56297`, P11FILLEDHE `602:20889`, P12NAMEDHE `613:56367` (the old `P12COMMITTEDHE` `602:20963` is no longer the end of the Hebrew flow). Flow starts: «Website · inquiry №202 · send and result», «Agency · new inquiry №202 · accept with review time», on Mobile «Website · inquiry №202 · Hebrew RTL»; the C1a sections «C1a · W03 · Резултати и предаване» (p12 `606:44377` · p13 `606:44378`) and «C1a · P12 · Запитване и Butler» (p12 `606:54291` · p13 `606:54292`) hold the new copies and the @INDEX entries.

## Prototype walk — expected paths through the reactions on pages 12 / 13

Re-walked after Phase C1a: for every task and viewport the start frame was opened, the control was found by its visible text among the visible ON_CLICK reaction-bearing nodes of that frame, and the destination was followed (including the 1.5 s AFTER_TIMEOUT of `P11SENDING`). Every tapped label in the key was compared with the current text of its control: 0 mismatches (the labels «Свържете или създайте сделка» and «Към сделката» replace the earlier «…случай» labels, same control ids). **All paths below reach the expected end frame.** The entry fields of O23HR and O23HRD have no reaction (they are shown filled), and the primaries have an additional ON_HOVER state swap, which is not navigation.

| Task | Walk (control node D · M) | End frame D · M | Result |
|---|---|---|---|
| T1 | P11FILLED «Изпратете запитването» `602:19273` · `602:20146` → P11SENDING → after 1.5 s → P12COMMITTED | `602:19667` · `602:20499` | pass · pass |
| T2 | P11OFFLINE «Изпратете отново» `602:19612` · `602:20457` → P11SENDING → P12COMMITTED | `602:19667` · `602:20499` | pass · pass |
| T3 | P11REJECTED entry in the email field, «Изпратете поправеното запитване» `602:19526` · `602:20378` → P11SENDING → P12COMMITTED | `602:19667` · `602:20499` | pass · pass |
| T4 | P11INVALID entry in the contact field, «Изпратете запитването» `602:19353` · `602:20219` → P11SENDING → P12COMMITTED | `602:19667` · `602:20499` | pass · pass |
| T5 | P12U «Проверете същата заявка» `66:36418` · `66:56358` → P12UCHECK | `66:36421` · `66:56361` | pass · pass |
| T6 | Mobile only: P11FILLEDHE «שליחת הפנייה» `602:20926` → P12NAMEDHE (direct; no Hebrew sending frame) | — · `613:56367` | — · pass |
| T7 | O02NEW «Поемете запитването» `602:19843` · `602:20578` → O03ACCEPT; field «Кога ще прегледате отново? *» `602:19958` · `602:20624` → O03ACCEPTREADY; «Поемете запитването» `602:20083` · `602:20681` → O03L. The accept button of O03ACCEPT is disabled and has no reaction | `63:12845` · `66:45642` | pass · pass |
| T8 | O03 «Проверете за дубликат» `63:12621` · `66:45550` → O27; «Отложете за допълнителна проверка» `63:23481` · `66:53473` → O27PENDING. Alternatives: «Запазете като отделни контакти» `63:23482` · `66:53474` → O27SEPARATE → «Към запитването на Алекс» `606:44529` · `606:44583` → O03; «Отказ» `63:23483` · `66:53475` → O03 | `63:23486` · `66:53478` (O27SEPARATE `606:44481` · `606:44535`) | pass · pass |
| T9 | O03 «Свържете или създайте сделка» `63:12633` · `66:45564` → O03L; «Запишете свързването» `63:12940` · `66:45671` → O03LR (then «Към сделката» `63:13044` · `66:45707` → O05) | `63:12943` · `66:45674` | pass · pass |
| T10 | O23 «Предайте отворената работа» `63:21010` · `66:51774` → O23H; «Предложете предаване» `63:21298` · `66:51928` → O23HP (then «Вижте приетото предаване» `63:21746` · `66:52074` → O23HD) | `63:21610` · `66:52004` | pass · pass |
| T11 | O23HR «Приемете работата» `606:48921` · `606:49076` → O23HRA (then «Към моите задачи» `606:49266` · `606:49386` → O18) | `606:49138` · `606:49326` | pass · pass |
| T12 | O23HR «Откажете с причина» `606:48922` · `606:49077` → O23HRD; «Изпратете отказа» `606:49533` · `606:49610` → O23HRDR (then «Вижте какво вижда Мария Д.» `606:49790` · `606:49899` → O23HPD) | `606:49672` · `606:49849` | pass · pass |
| T13a | O23HPD «Предложете на друг колега» `606:50363` · `606:50472` → O23H | `63:21162` · `66:51858` | pass · pass (goal half-covered, see gap) |
| T13b | O23HP «Оттеглете предложението» `606:48750` · `606:48754` → O23HPX (then «Вижте какво вижда Никол» `606:50652` · `606:50761` → O23HRX); O23HP «Вижте какво получава Никол» `606:48752` · `606:48756` → O23HR | `606:50534` · `606:50711` | pass · pass |
| T14a | P12COMMITTED «Вижте имота» `613:55969` · `613:55981` → P05 | `63:26089` · `66:55737` | pass · pass |
| T14b | P12INACTIVE «Вижте подобни имоти» `613:56114` · `613:56181` → P22 | `63:28176` · `66:57861` | pass · pass |
| T14c | P12UNKNOWN «Потърсете имот № 202» `613:56254` · `613:56320` → P02 | `63:25688` · `66:55174` | pass · pass |
| T14d | P12NONAME «Вижте имота» `613:55993` · `613:56005` → P05 | `63:26089` · `66:55737` | pass · pass |
| T15 | P12MULTI «Вижте имота» `613:56041` · `613:56068` → P05; «Вижте подобни имоти» `613:56049` · `613:56076` → P22; «Потърсете имот № 912» `613:56056` · `613:56083` → P02; «Към същото сравнение» `606:54515` · `606:54553`: ON_HOVER only, **no click** | `63:26089` · `66:55737` | pass · pass |

Also checked: P05 «Изпратете запитване» `63:26138` · `66:55780` now leads to P11FILLED (it led to the generic P11 before; W01-T3 changes, see `design/zero-learning/keys/W01.md`); the Hebrew «שליחת הפנייה» leads to `613:56367`; O23HP carries four reaction-bearing buttons (the two older ones and the two new Quiet buttons); O23HRA and O23HRDR each carry «Към моите задачи» → O18 and a second control (to O23 or to O23HPD).

## Defects found in this re-check (recorded, not fixed here)

Status of the defects D-1 to D-8 of the previous key after Phase C1a, then the new defects K-1 to K-6 found while updating the key. The defects found by the testers and by the G2 / G3 / G4 reads are in `design/zero-learning/W03-gate-result.md`.

| # | Defect | Node ids | Status |
|---|---|---|---|
| D-1 | The Butler entry «Попитайте Butler» on public screens has no prototype reaction and no answer screen exists, so «what it will do» and «Ще го направя аз» cannot be shown (the string «Ще го направя аз» appears in no W03 frame) | public Butler instances on every P11 / P12 frame, for example D `I613:55408;6:17` (P12NONAME), `I605:24892;6:17` (P12 committed); not wired | **open** |
| D-2 | On O27, «Запазете като отделни контакти» and «Отказ» led to the deal list with no confirmation | D `63:23482` → `606:44481`, `63:23483` → `63:12514`; M `66:53474` → `606:44535`, `66:53475` → `66:45509` | **closed** (O27SEPARATE) |
| D-3 | After accepting (T7 step 3) the prototype lands on O03L; no «accepted» receipt frame exists | D `602:20083` → `63:12845`; M `602:20681` → `66:45642`; effect line D `602:19188` · M `602:19242` | **open**; the handover has the receipts, the claim of an inquiry does not |
| D-4 | Past dates in the scenario | O01, O03N, O05W, O05WR | **closed** (dates now 7–9 октомври; the scenario clock is 5 октомври) |
| D-5 | Model-field labels «Цел» and «Състояние» on O05 | D `I18:1003;6:59` · `I18:1016;6:59` | **closed** («Какво иска клиентът», «Работим ли по покупката?») |
| D-6 | No next-step line on O03L, O05W, O23HD, O23OFF | `606:44360` · `606:44361`, `606:44362` · `606:44363`, `606:44364` · `606:44365`, `606:44366` · `606:44367` | **closed** |
| D-7 | No Butler entry on P12U and P12UCHECK | D `606:44304` · `606:44311`; M `606:44318` · `606:44325` | **closed** |
| D-8 | GATE.md bg column lists «Случай» while audit §9 used it as the staff noun | 113 nodes | **closed** (owner pick «Сделка»; 0 nodes left, G2 scan below). `GATE.md` G2 row «Case object» already names the pick |
| K-1 | P12MULTI primary «Към същото сравнение» has only ON_HOVER, no click to P07 | D `606:54515` · M `606:54553` (instance `I606:54055;6:3`) | open |
| K-2 | O23HR shows both required fields filled (next step «Обадете се на Алекс…», review «13 октомври 2026, 10:00»); there is no empty state with a disabled primary like O03 · Accept; the fields have no reaction | D `I606:45905;6:61` · `I606:45909;6:61`; M `I606:46082;6:61` · `I606:46086;6:61` | open |
| K-3 | O23HP (pending) keeps the primary «Вижте приетото предаване», which leads to the accepted state O23HD | D `I21:1104;6:3` → `63:21301`; M `I25:2938;6:3` → `66:51931` | open |
| K-4 | After «Предложете на друг колега» (O23HPD → O23H) the form still names «Получател · Никол» as a fixed row; no frame chooses a different colleague | D `I21:881;6:61` · M `I25:2783;6:61` | open |
| K-5 | The rail user of the receiver frames is «Никол · Брокер» while the team list says «Никол · Координатор» | D `606:45756` (O23HR), D `18:1254` (O23) | open |
| K-6 | The listing page P05 and the search page P02 still show №202 as a live listing while P12INACTIVE says «Тази обява вече не е активна» (fixture contradiction inside one journey) | P05 D `11:1031`; P02 D `11:780` | open |

Still missing, unchanged: Hebrew right-to-left default, invalid, sending, rejected, offline, unknown and status-check frames; the Hebrew variants of the new P12 receipts; the receiver's accept state with an empty required time; a frame to choose a different receiver; error, conflict and connection-lost states of the handover commands; a prototype branch from «Изпращаме…» to the rejected or unknown result (T3 and T5 start on those screens).

## G2 check — W03 visible copy after Phase C1a

Re-run after Phase C1a over the 123 frames of the packet folder `run-2/frames` (every coverage-table frame, the new frames, and the destination frames P05, P02, P22, P20). Every text node was read through the plugin API with hidden layers skipped: 2,691 text nodes visible, 712 hidden (the replaced base content of the handover frames, the hidden DEMO markers and similar). Terms: the GATE.md G2 table in bg, en and ru, the owner starter list in `design/acceptance/g2-terms.md`, and the demo fragments of the Phase B1 re-scan. No W03 frame has a technical-details disclosure, so every hit would sit on a primary surface.

**Result on the letter of GATE.md: PASS, 0 hits.** Case object («Случай», «Преписка», `DEMO-CASE`, «дело», «кейс», «case»): 0 (it was 113 nodes before the rename to «Сделка / Сделки», which is allowed). Disposition, brief, coverage, engagement / mandate, lettered interest, operation / identifier, party candidate as the listed words, stage / state / purpose labels as fields, version labels, assumed states, technical jargon (worker, runtime, Payload, MFA, principal, `ai_service`, idempotency, digest, webhook, CSV, JSON, API), Hermes / Jev, prototype markers (DEMO, ДЕМО, «Демонстрационен», «прототип», «синтетичен», «примерни данни»): 0 in every group. The four earlier hits on O05 are gone («Цел» → «Какво иска клиентът», «Състояние» → «Работим ли по покупката?»). Public screens (P11, P12 and the variants, Hebrew included): 0 hits of any kind.

Reviewed and not counted: «…текущия безопасен статус на обявата…» in the O03 lead sentence (D `18:864` · M `16:526`), plain prose about the listing, not a «Статус» field.

**Advisory, outside the GATE list** (the «Judgement candidates» table of `g2-terms.md` and the technical-jargon row «MFA → потвърждение с втора стъпка»): 24 distinct strings, 53 nodes on 13 staff screens. Examples: «Кандидатът е проверен от човек» (O03L, D `I20:1153;6:61`; the party-candidate family, borderline), «Квалифициране и продължение» (O03, D `18:863`), «Създаване след квалифициране» (O03N, D `21:2483`), «Идентичност» (O03L, D `I20:1153;6:59`), «самоличност» (O03L `I20:1164;6:408`, O27 `I14:1677;6:408` · `I14:1689;6:185` · `I14:1701;6:99`, O23OFF `327:15163`), «Обхват» (O23H and the handover states `I21:886;6:59`, O23 `18:1233`, O05 `18:1086`, O02MINE `75:19649`), «Още няма назначен» (O03, D `I18:847;6:61`), «неавтентикирани» (O23, `18:1266`), «втори фактор» (O23, `18:1282`), «границата с доставчика» (O23, `18:1273` · `18:1283`), «упълномощеният ръководител» (O23HP, `I21:1097;6:408`), «Действащ акаунт», «активните сесии, ключовете за вход» (O23OFF, `327:15138` · `327:15157`), «общата опашка на екипа» (O02 new in queue, `I602:18822;6:401`). The time-zone name «Europe/Sofia» appears in 12 date lines (O03 accept ready `I602:19152;6:61`, O03N `I21:2506;6:61`, O05W `I20:439;6:61`, O27PENDING `52:5371`, O23HR `I606:45909;6:61` and their Mobile twins) and the test address «staff@example.test» on O23OFF (D `327:15141`).

Server-produced text: `design/copy/server-messages.md` section 6 (handover and inquiry receipts, bg · en · ru staff, seven locales public) was scanned for the same terms outside code spans: 0 hits; the only matches are the rule that forbids them.

Locale coverage: the frames are Bulgarian (Hebrew for two public frames). English, Russian, German, Dutch and Greek wording is only in the copy deck, not in frames; those locales are not scanned at frame level.

## G3 checklist — W03 with frame evidence (re-run after Phase C1a)

Verdicts of the Figma stage. The tester evidence per item is in `W03-gate-result.md`.

| # | Item | Verdict | Evidence |
|---|---|---|---|
| 1 | One Butler entry everywhere | **FAIL (partial)** | Public entry «Попитайте Butler» (Hebrew «שאלו את Butler») is on all 33 P11 / P12 frames of the packet, including P12U and P12UCHECK (closed D-7) and the six receipt variants. Staff: rail item «Butler» on every Desktop staff frame except O27PENDING (`52:5335`) and O27SEPARATE (`606:44379`), which draw no rail; no Mobile staff frame shows it outside O01 and O03; «Подгответе с Butler» next to the manual primary on O02 default / new and «Подгответе чернова с Butler» on O03. The entry is not wired and no answer screen exists, so «shows what it will do» and «Ще го направя аз» have no frame (the string is in 0 nodes, D-1); no keyboard shortcut is annotated. |
| 2 | Fast first value | PASS | Visitor: 1 action from the filled form to the committed receipt (T1). Broker: 3 actions from the new-inquiry inbox to an owned inquiry with a review time (T7); a handover is taken or declined in 1 to 3 actions (T11, T12). |
| 3 | Live state and stop | **FAIL (partial)** | `P11 · Sending` (`598:17787` · `602:18214`) shows the running state, «sent once» and the connection-drop line, and `O01 · Loading` (`605:37147` · `605:37367`) is a skeleton line. The staff atomic commands have no running state: O03 accept, O03L link, O23H propose, O23HR accept, O23HRD send, O23HP withdraw. |
| 4 | Consequences before irreversible actions | PASS | Send (`598:17699`), accept (`602:19188` · `602:19242`), merge (O27 `I14:1711;6:401`), handover proposal (O23H `I21:937;6:408`), receiver accept (`I606:45913;6:401`), receiver decline (`I606:46614;6:401`). Advisory: the Quiet button «Оттеглете предложението» (O23HP, `I606:48742;6:9` · `I606:48746;6:9`) has no effect line before the tap (withdraw is not in the item's verb list and is reversible). |
| 5 | One primary action per empty state | PASS | `O02UNCLAIMED` (`66:34531` · `66:34558`) one primary «Провери заместването · Алекс»; `O01 · Empty` one primary «Отворете входящите»; `O01 · Error` and `O01 · Offline` one primary «Заредете страницата отново». |
| 6 | No dead ends | **FAIL (partial)** | Invalid, rejected and offline states name the field, keep every value and offer one way on. The new receipts always offer a way on (similar properties, search by number, contact the team). No error, conflict or connection-lost frame exists for the handover commands (the contract marks the stale `version_conflict` as not drawn) or for the empty required reason of O23HRD. |
| 7 | Unknown shown as unknown | **FAIL** | `P12U` / `P12UCHECK` pass («Не изпращайте повторно…», «Резултатът все още не е потвърден»). `P12UNKNOWN` (`613:55676` · `613:55756`) draws no line at all about the unknown availability, only the button «Потърсете имот № 202»: in the run every tester read it as «open» or «closed» (see the result file). No unknown-outcome frame exists for the handover commands. |
| 8 | Phone parity | **FAIL** | Bulgarian passes: every W03 state exists at 390 and every task has the same action count on phone. Hebrew right-to-left has the filled and committed (saved property) screens only; its default, invalid, sending, rejected, offline, unknown, status-check frames and the Hebrew variants of not public now, availability unknown, no saved name and several properties are missing. |
| 9 | Keyboard and WCAG 2.2 AA | **NO EVIDENCE (counts as fail)** | Static reads of the Figma file: text contrast, 0 of 2,691 visible text nodes below AA (lowest 5.74:1, muted text on the cream and mint surfaces); target size, 1,033 click-reaction nodes on the 102 prototype frames of the journey, 0 below 24 × 24 px. Not proven in Figma: focus order, visible focus colour #174EA6, dark-mode contrast, right-to-left reading order and mirrored icons (no W03 frame annotates them); the PR preview must prove them. |
| 10 | Speed without jumps | OPEN | Design check: in `P11 · Sending` the reference note sits below the buttons and the instruction keeps the same height. Timings need the PR-preview run. |

Two more checks from the owner's rules (GATE intro «every screen says in one sentence what to do next»; scenario dates, audit D05):

| Check | Verdict | Evidence |
|---|---|---|
| A. A next-step line on each W03 screen | **PASS: 59 of 59 screens** | Every W03 screen of the packet carries a lead sentence, a labelled row or a sentence in the body (table below). The four screens that had none (O03L, O05W, O23HD, O23OFF) got one in Phase C1a; the new frames each have one. |
| B. No past dates | **PASS** | The scenario clock reads 5 октомври 2026. Forward-looking dates: 6, 7, 8, 9, 13 октомври and «След 2 работни дни»; absence 12 to 16 октомври; the 15 октомври of the sample refusal reason. The only earlier moments are time-stamped records of things that happened (17:12 saved name, 17:40 kept separate, 18:03 to 18:07 handover receipts). |

**G3 result for W03: FAIL.** Items 2, 4 and 5 and both extra checks pass; items 1, 3, 6, 7 and 8 fail (partially or fully), item 9 has no frame evidence beyond contrast and target size, item 10 is open.

### Next-step line per screen (check A)

Kinds: lead sentence under the title; labelled row or field («Следваща стъпка», «Какво следва», «Следващ преглед»), the line is the value; sentence in the body or in an alert. Hebrew has the Mobile frame only.

| Screen (packet name) | Kind | Line | Node id D · M |
|---|---|---|---|
| `P11-default` | lead sentence | «Напишете въпроса си и прегледайте запитването, преди да го изпратите.» | `605:24976` · `605:24977` |
| `P11-filled` | lead sentence | «Проверете данните и изпратете запитването. Брокер от екипа ще ви отговори по нач…» | `597:2274` · `598:18125` |
| `P11-invalid` | lead sentence | «Поправете имейла или телефона и изпратете запитването.» | `598:17714` · `602:18145` |
| `P11-sending` | lead sentence | «Изчакайте няколко секунди, докато изпратим запитването. Не затваряйте страницата…» | `598:17801` · `602:18225` |
| `P11-rejected` | lead sentence | «Поправете имейла и изпратете отново. Всичко останало е запазено.» | `598:17900` · `602:18317` |
| `P11-offline` | lead sentence | «Свържете се с интернет и опитайте отново. Въведеното е запазено.» | `598:17987` · `602:18397` |
| `P11-filled-he-rtl` | lead sentence | «בדקו את הפרטים ושלחו את הפנייה. מתווך מהצוות יחזור אליכם בדרך שתבחרו.» | — · `602:18577` |
| `P12-committed` | labelled row | «Брокер от екипа в Сандански ще ви пише по имейл» | `602:18495` · `602:18548` |
| `P12-saved-name-he-rtl` | labelled row | «מתווך מהצוות בסנדנסקי יכתוב לכם באימייל» | — · `613:55856` |
| `P12-generic-demo` | sentence in body | «Запазете номера на заявката. Потвърждението на наличност и уговорка е отделна ст…» | `11:1571` · `11:8790` |
| `P12-unknown` | lead sentence | «Запазете номера за проверка 024. Резултатът от същата заявка още се проверява.» | `22:1683` · `24:2220` |
| `P12-unknown-check` | lead sentence | «Не изпращайте повторно. Запазете същата заявка и нейния номер, докато получите п…» | `66:34228` · `66:34268` |
| `P12-multi` | lead sentence | «Запазете номера за проверка. Брокер ще ви пише за трите имота.» | `606:54960` · `606:54961` |
| `P12-no-saved-name` | labelled row | «Брокер от екипа в Сандански ще ви пише по имейл» | `613:55416` · `613:55493` |
| `P12-not-public-now` | labelled row | «Брокер от екипа в Сандански ще ви пише по имейл» | `613:55567` · `613:55645` |
| `P12-availability-unknown` | labelled row | «Брокер от екипа в Сандански ще ви пише по имейл» | `613:55720` · `613:55797` |
| `P12-viewing-request` | labelled row | «Брокер ще ви пише с предложение за час» | `606:53934` · `606:53999` |
| `O01-default` | lead sentence | «Започнете с трите неща, които чакат действие днес.» | `10:288` · `14:4357` |
| `O01-loading` | lead sentence | «Изчакайте няколко секунди, докато заредим задачите за днес.» | `605:37227` · `605:37379` |
| `O01-empty` | lead sentence | «Проверете входящите за нови запитвания.» | `605:37596` · `605:37744` |
| `O01-error` | lead sentence | «Заредете страницата отново. Ако не стане, проверете състоянието на системата.» | `605:37957` · `605:38105` |
| `O01-offline` | lead sentence | «Свържете се с интернет и заредете страницата отново.» | `605:38318` · `605:38466` |
| `O02-default` | lead sentence | «Изберете разговор и поемете следващото действие.» | `11:4342` · `18:2919` |
| `O02-new-in-queue` | lead sentence | «Ново запитване чака отговорник. Поемете го или го назначете на колега.» | `602:18765` · `602:18840` |
| `O02-unclaimed` | sentence in body | «Неясният отговорник не означава свободен разговор. Проверете заместването, преди…» | `75:19305` · `75:19484` |
| `O02-mine` | sentence in body | «Проверете кой замества в момента преди следващото действие.» | `75:19664` · `75:19844` |
| `O03-default` | lead sentence | «Поемете запитването, свържете го със сделка и подгответе отговора.» | `605:25008` · `605:25009` |
| `O03-accept-time-required` | lead sentence | «Изберете кога ще прегледате запитването отново и го поемете.» | `602:18996` · `602:19054` |
| `O03-accept-ready` | lead sentence | «Изберете кога ще прегледате запитването отново и го поемете.» | `602:19181` · `602:19235` |
| `O03-assign-review` | labelled row | «Уточняване на достъп до имота» | `I20:927;6:61` · `I25:2171;6:61` |
| `O03-assign-awaiting-acceptance` | labelled row | «Никол приема или отказва · вие получавате известие» | `602:21121` · `602:21164` |
| `O03-assign-recorded` | labelled row | «Мария Д. · Проверка на наличността преди предложение за оглед» | `20:1040` · `25:2213` |
| `O03-link-or-create` | lead sentence | «Проверете дали това е сделката на Алекс и запишете свързването.» | `606:44360` · `606:44361` |
| `O03-link-recorded` | labelled row | «Мария Д. · Проверка на наличността преди предложение за оглед» | `20:1273` · `25:2306` |
| `O03-create-after-qualify` | labelled row | «Уточняване на изискванията» | `I21:2501;6:61` · `I28:2850;6:61` |
| `O03-created` | labelled row | «Мария Д. · Проверка на наличността преди предложение за оглед» | `21:2623` · `28:2902` |
| `O03-resolve-without-case` | labelled row | «Предложен контакт за уточнение» | `I20:1390;6:61` · `I25:2354;6:61` |
| `O03-resolve-recorded` | labelled row | «Мария Д. · Проверка на наличността преди предложение за оглед» | `20:1503` · `25:2396` |
| `O04-default` | lead sentence | «Отворете сделката, която чака действие, или потърсете по име или номер.» | `605:25012` · `605:25013` |
| `O05-default` | labelled row | «Уточнете изискването за асансьор» | `18:1031` · `16:626` |
| `O05-wait-with-owner-date` | lead sentence | «Изберете кога ще прегледате отново и запишете изчакването.» | `606:44362` · `606:44363` |
| `O05-wait-recorded` | labelled row | «Мария Д. · Уточняване на документ · Преглед на 9 октомври» | `20:568` · `25:2021` |
| `O06-default` | lead sentence | «Прегледайте разрешените връзки на лицето, преди да продължите по сделката.» | `605:25016` · `605:25017` |
| `O18-default` | lead sentence | «Изберете задача и отворете сделката, към която принадлежи.» | `605:25060` · `605:25061` |
| `O23-default` | lead sentence | «Прегледайте кой има достъп и кой замества при отсъствие. Достъпът, публикуването…» | `I18:1226;6:401` · `I16:750;6:401` |
| `O23-handover` | sentence in body | «Прегледайте капацитет, права и изрично приемане. Отнемането на членство не отмен…» | `I21:937;6:408` · `I25:2840;6:408` |
| `O23-handover-pending` | sentence in body | «Предаването е предложено. Изчаква приемане; дотогава отговаря текущият заместник…» | `I21:1097;6:408` · `I25:2931;6:408` |
| `O23-handover-accepted` | lead sentence | «Никол вече отговаря за тази работа. Прегледайте задачите на екипа.» | `606:44364` · `606:44365` |
| `O23-revoke-staff-access` | lead sentence | «Впишете основание, отметнете проверката и прекратете достъпа.» | `606:44366` · `606:44367` |
| `O23-receive-offer` | lead sentence | «Приемете работата и запишете своята следваща стъпка и кога ще прегледате. Ако не…» | `606:45825` · `606:46002` |
| `O23-receive-accepted` | lead sentence | «Започнете със стъпката, която записахте. Мария Д. вече е уведомена.» | `606:46262` · `606:46393` |
| `O23-receive-decline` | lead sentence | «Напишете защо отказвате и изпратете. Работата остава при Мария Д.» | `606:46607` · `606:46703` |
| `O23-receive-decline-recorded` | lead sentence | «Не е нужно друго от вас. Мария Д. ще избере друг колега.» | `606:46882` · `606:47002` |
| `O23-receive-withdrawn` | lead sentence | «Не е нужно действие. Мария Д. оттегли предложението, преди да отговорите.» | `606:47205` · `606:47323` |
| `O23-sender-declined` | lead sentence | «Предложете работата на друг колега или я запазете при себе си.» | `606:47524` · `606:47644` |
| `O23-sender-withdrawn` | lead sentence | «Работата остава при вас. Можете да я предложите на друг колега, когато сте готови.» | `606:47847` · `606:47967` |
| `O27-duplicate-check` | lead sentence | «Не сливайте записи само заради сходно име. Първо потвърдете самоличността и засе…» | `I14:1677;6:408` · `I15:1028;6:408` |
| `O27-review-pending` | labelled row | «След 2 работни дни, 10:00 · Europe/Sofia» | `52:5371` · `52:5427` |
| `O27-kept-separate` | lead sentence | «Записахме, че това са двама различни души. Нищо не е обединено и правата не са п…» | `606:44390` · `606:44441` |

