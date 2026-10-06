# W03 · Receive, own and qualify an inquiry — G1 key (judge copy)

Testers receive only the **Goal (testers)** line of a task, in a fresh context, with the screens of their batch and nothing else (no glossary, no product vocabulary, no frame names). Everything else on this page is for the judge. Gate rules: `design/zero-learning/GATE.md`. Packet (images, prompt, judge steps): `design/zero-learning/W03-packet.md`. Owner zero-learning rules: `design/audit.md` section 7A. Result of the latest gate run: `design/zero-learning/W03-gate-result.md`.

- Source: Figma file "MS Realty — AI-native OS & Website · 2027". First read after the W03 build; re-read after Phase B (copy, DEMO markers, links) and Phase C1b (next-step lines, visible links, states, RTL icon); re-read after Phase C1a, version «After C1a W03+P12» (id 2406915564060113647): staff noun «Сделка» instead of «Случай», the colleague handover on both sides (O23HR … O23HPX), the P12 receipt that names the saved property, the state O27SEPARATE, the O05 field labels, the future scenario dates and the next-step lines on four more screens. Design frames live on pages 03 / 06 (screens), 05 / 08 (Agency OS screens) and 09 (states); prototype copies on page 12 (Desktop) and page 13 (Mobile). Every prototype click below was read back as an ON_CLICK reaction and every path was walked again through those reactions after Phase C1a (section «Prototype walk»). Node ids of earlier frames did not change; frame names, labels and evidence strings below are the current ones. Contract of the new frames: `design/contracts/w03-p12.md`. **Run 3 (W03 fix round):** re-read in the Figma versions «W03 fix public done» (id 2406936889649113691) and «W03 fix staff done» (id 2406943983880794330); node ids of the earlier frames did not change. Tasks T5 to T7 and T10 to T15 are updated in place below, T16a, T16b and T17 are new, and the section «Run 3 changes» lists the new frames. Logs: `design/acceptance/w03-fix-public-log.md`, `design/acceptance/w03-fix-staff-log.md`. Owner decision: a public Butler panel is allowed and is judged like any other screen.
- Journey screens (binding, `journeys.json`): P11, P12, O01, O02, O03, O06, O23, O18, O04, O05. O27 (duplicate check) is reached from O03 and is part of the duplicates step; its result states O27PENDING and O27SEPARATE are in the coverage table. The receipt variants of P12 (saved property: public now, not public now, unknown, no saved name, several properties, viewing request) and the handover frames of both sides (O23HR, O23HRA, O23HRD, O23HRDR, O23HRX, O23HPD, O23HPX) are part of the journey since Phase C1a. O01 Loading / Empty / Error / Offline and the revoke state O23OFF stay in the coverage table as reference images.
- Counting rule: one action is a tap or click, or one field entry. Form fields are pre-filled in the frames, so typing counts only where a step lists an entry. Choosing a value in one field (open the field, pick the value) is one entry. The «Изпращаме…» step advances on its own after 1.5 s in the prototype and is not counted.
- Pass rule per tester run: the end frame is reached (or the success criterion is met in words) without hints, in at most expert actions + 1 (median over runs). A step the screens do not cover is a **COVERAGE GAP**, reported separately and never counted as a pass. A tester's END SCREEN is a prediction (testers see no reactions): the judge replays the actions through the prototype reactions, and the RESULT is judged against the replayed end frame. A RESULT that states the opposite of the replayed frame (for example «it arrived» where the frame says «not confirmed») fails.
- Scenario: visitor Алекс asks about property №202 (apartment in the centre of Sandanski, 115 000 €, 76 m² total, 68,5 m² built, 1 bedroom); broker Мария Д. works the inquiry; colleague Никол is the handover receiver. Request code «Код на заявката: 7K3M9Q» (since fix 7 the one code on every visitor frame, before and after the send; it was «Номер за проверка: 024» on the frames before and after the send and «Код на заявката: 7K3M9Q» only on the unknown-outcome frames until run 6). The scenario clock reads 5 October 2026 (the inquiry was saved at 17:12, the handover receipts are time-stamped 18:03 to 18:07); every forward-looking date in the frames is later than that.

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

**Success criterion:** ends on `P12 · Committed` without retyping anything; the tester notes that the same request code «Код на заявката: 7K3M9Q» is reused so the team receives one inquiry (the offline frame reads «Използваме същия код на заявката 7K3M9Q, така че екипът няма да получи две запитвания.», D `598:18003` · M `602:18422`; the frame read «…същия номер за проверка 024…» before fix 7). Fail: the tester retypes the form, or chooses «Свържете се по друг начин» believing the question cannot be sent.

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

**Success criterion (run 6; replaces the run 2 to 5 wording that required the number 024):** the tester reports that the result of the check is still unknown, that is, the page does not know whether the inquiry arrived, and does not send it again. The number 024 is **no longer required**: the request code «7K3M9Q» replaces it (P12UCHECK «Код на заявката: 7K3M9Q», D `623:113046` · M `623:113048`; P12U alert «…Код на заявката: 7K3M9Q.»); naming the code is welcome, naming neither is not a failure. The primary of the check screen is now the call «Обадете ни се: +359 879 696 870» (D `I115:4825;6:3` · M `I115:4828;6:3`, proto `125:9610` · `129:3518` → P20); «Проверете отново» is secondary (D `I66:34249;6:6` · M `I66:34289;6:6`, proto `66:36455` · `66:56395` → P12U); neither of them resends. Evidence: heading «Още не знаем дали запитването е получено» (D `66:34223` · M `66:34263`), result line «Резултат от проверката: още не знаем дали запитването е получено» (D `66:34237` · M `66:34277`), «Не изпращайте отново.» (D `623:113045` · M `623:113047`). Fail: any action that sends a new inquiry (the offline frame's «Изпратете отново», or the form and the committed receipt), or a RESULT that says the inquiry arrived or was received.

**Required states:** unknown outcome (`22:1666` · `24:2203`), status check of the same request (`66:34211` · `66:34251`). Present. Label change since the first key: the check screen's button now says «Към същата заявка» (D `66:34249` · M `66:34289`; it said «Към същата операция» before Phase B1). The second way out on the unknown screen itself is «Свържете се по друг начин» (D `66:36419` · M `66:56359`). **Run 3:** P12U carries a new line under the status, «Проверката не изпраща запитването отново. Резултатът може и да остане непотвърден. Тогава се свържете с екипа по друг начин и кажете номер 024.» (D `614:56673` · M `614:56674`; proto `614:56675` · `614:56676`). The check screen now reads «Проверихме същата заявка, но резултатът още не е потвърден. Не я изпращайте отново: свържете се с екипа по друг начин и кажете номер 024.» (D `66:34228` · M `66:34268`), status row «Още не е потвърдено дали запитването е получено. Номер за проверка: 024.» (D `66:34238` · M `66:34278`) and a warning «Не приемайте, че запитването е получено…» (D `I66:34242;6:408` · M `I66:34282;6:408`). Hebrew Mobile twins: P12U HE `614:71270`, P12UCHECK HE `614:71325`.

**Run 4 (fix round 3, version «W03 fix 3 done», id 2406992753235358250):** P12U now opens with the heading «Още не знаем дали запитването е получено» (D `22:1678` · M `24:2215`), the Warning alert directly under it, «Връзката прекъсна, преди да получим потвърждение. Номер за проверка: 024.» (D `22:1684` · M `24:2221`), the line «Не изпращайте отново. Проверете същата заявка: проверката не създава второ запитване.» and a second line «Ако проверката покаже, че резултатът още не е потвърден, свържете се с екипа по друг начин и кажете номер 024.». The check screen's heading is «Още не е потвърдено, че запитването е получено» (D `66:34223` · M `66:34263`). Pre-registered judging: PASS when the RESULT says the arrival is not confirmed or unknown, keeps 024 and sends nothing again, with 0 to 2 actions (the heading already tells the state; the check is the expert path); FAIL when the RESULT says the inquiry arrived or was received, or any action sends a new inquiry.

**Run 5 (fix round 4, version «W03 fix 4 done», id 2407015645399752413, G-01):** the check screen's neutral row «Текущо състояние» became the result block «Check result» directly under the heading and the warning icon, above the warning alert: a raised panel with a 1 px warning stroke, a neutral file icon and no success colour or check icon; lines «Резултат от проверката: още не е потвърдено» (semibold; text D `66:34237` · M `66:34277`), «Проверено в 17:14 · Europe/Sofia» (D `66:34238`), «Не изпращайте отново.» (semibold; D `623:113045`), «Номер за проверка: 024» (D `623:113046`); block D `66:34229` · M `66:34269`, prototype `66:36440` · `66:56380`; Hebrew `614:71341` (P12UCHECK HE `614:71325`). The frame is 909 px tall on Mobile (was 871). Path, controls and expected actions unchanged (1 action: «Проверете същата заявка», D `66:36418` · M `66:56358`, → `66:36421` · `66:56361`). Pre-registered judging as in run 4: PASS when the RESULT says the arrival is not confirmed or unknown, keeps 024 and sends nothing again, with 0 to 2 actions; FAIL when the RESULT says the inquiry arrived or was received (the «Запитването е получено» committed frame is not the result of this task), or any action sends a new inquiry.

**Run 6 (fix rounds 5 and 6, code parity; versions «W03 fix 5 done», «P12UCHECK call + no-session», «checkCode on P12U, P12UCHECK, P12UNOSESSION», «W03 fix 6 done», id 2407020704892891115; key updated before the run-6 tester runs):** the check screen P12UCHECK (D `66:34211` · M `66:34251`, proto `66:36421` · `66:56361`) now reads the heading «Още не знаем дали запитването е получено» and the result block «Резултат от проверката: още не знаем дали запитването е получено», «Проверено: 17:14 · Europe/Sofia», «Не изпращайте отново.», «Код на заявката: 7K3M9Q»; the body ends «…не я изпращайте отново: обадете ни се и кажете код 7K3M9Q.» (D `66:34228` · M `66:34268`); the Warning «Не приемайте, че запитването е получено. Повторно изпращане може да създаде второ запитване.» stays. Actions: the **primary is the call «Обадете ни се: +359 879 696 870»** (→ P20 in the prototype; a tel: link in code), the secondary «Проверете отново» (→ P12U, which offers the same check). The old «Към същата заявка» and the line «Номер за проверка: 024» are gone from P12UCHECK and from the P12U alert; **P12U still carries the older line «Ако проверката покаже, че резултатът още не е потвърден, свържете се с екипа по друг начин и кажете номер 024.» (D `614:56673` · M `614:56674`, proto `614:56675` · `614:56676`)**: a leftover, recorded as a finding, so a RESULT that cites 024 or 7K3M9Q is accepted either way. New state P12UNOSESSION (browser without the receipt session; D `623:114235` · M `623:114282`, page 09, no prototype copy: a server-side variant that no click reaches; reference frame for G2 and G3, not in any tester batch). Pre-registered judging (run 6): PASS when the RESULT says the arrival is unknown or not confirmed, nothing was sent again, in 0 to 2 actions (one extra tap on «Проверете отново» or on the call button is not a failure); the call number or the code may be named, 024 is not required; FAIL when the RESULT says the inquiry arrived or was received, or any action sends a new inquiry (for example «Изпратете отново» on the offline frame).

**Run 7 (fix round 7; version «W03 fix 7 done»; key updated before the run-7 tester runs):** the check screen P12UCHECK now answers the check in its own words instead of repeating the start screen: heading **«Проверката приключи: няма потвърждение»** (design D `66:34223` · M `66:34263`; prototype D `66:36434` · M `66:56374`; it was «Още не знаем дали запитването е получено», word for word the heading of P12U, which run 6 read as the same screen, 0 of 4 pass) and result line **«Не можем да потвърдим, че запитването е получено.»** (design D `66:34237` · M `66:34277`; prototype D `66:36448` · M `66:56388`; it said «Резултат от проверката: още не знаем дали запитването е получено»). Body `66:34228` · `66:34268` «Проверихме същата заявка, но още не знаем дали е получена. Не я изпращайте отново: обадете ни се и кажете код 7K3M9Q.», «Проверено: 17:14 · Europe/Sofia», «Не изпращайте отново.», «Код на заявката: 7K3M9Q» (D `623:113046` · M `623:113048`), the call primary and the secondary «Проверете отново» are unchanged. P12U keeps its heading «Още не знаем дали запитването е получено» and its alert, and the leftover line «Ако проверката покаже, че резултатът още не е потвърден, свържете се с екипа по друг начин и кажете **код 7K3M9Q**.» (D `614:56673` · M `614:56674`) now uses the one code (it said «номер 024»). Path, controls, expected actions (1) and limit (2) unchanged. Pre-registered judging (run 7): PASS when the RESULT says that the check could not confirm the arrival («няма потвърждение», «не можем да потвърдим», unknown or not confirmed) and nothing was sent again, in 0 to 2 actions (an extra tap on «Проверете отново» or on the call button is not a failure; naming the code or the call number is welcome, neither is required); a wrong END SCREEN (the committed receipt predicted) with a RESULT that says «not confirmed» is a PASS with a note, as in run 5; FAIL when the RESULT says that the inquiry arrived, was received or is confirmed, or any action sends a new inquiry (for example «Изпратете отново» on the offline frame).

### W03-T6 · Hebrew: send the question (phone, right-to-left)

**Goal (testers, Hebrew):** אתם מתעניינים בדירה №202 בסנדנסקי. הפרטים והשאלה שלכם כבר מולאו בעמוד הזה. שלחו את השאלה לסוכנות וגלו מי יענה לכם ואיך.

*(Judge translation: You are interested in apartment №202 in Sandanski. Your details and question are already filled in on this page. Send the question to the agency and find out who will answer you and how.)*

**Start frame:** `P11 · Filled HE RTL / פנייה לגבי נכס №202` — Mobile `602:18566` (prototype M `602:20889`)

| # | From frame | Action | Control (M proto) | To frame |
|---|---|---|---|---|
| 1 | `P11 · Filled HE RTL` | tap «שליחת הפנייה» | `602:20926` | `P11 · Sending HE RTL` · design M `614:66896` (prototype `P11SENDINGHE` M `614:72131`) → automatic after 1.5 s → `P12 · Saved name HE RTL / הפנייה התקבלה` · design M `613:55827` (page 06, next to the superseded `602:18638`) · prototype `P12NAMEDHE` M `613:56367` |

**Expected actions:** 1 (the automatic sending step is not counted). Median pass limit: 2. End frame changed in Phase C1a: the control used to lead to `602:20963`; it now leads (through the Hebrew sending frame since run 3) to `613:56367`. The packet batch VH takes `613:55827` as the end screen.

**Success criterion:** the tester reports that the inquiry was received, that the Sandanski sales team is responsible, and that a broker will write by email in Hebrew with no promised deadline. Evidence: «הפנייה התקבלה» `613:55841`, owner line `613:55844`, next-step row «מה הלאה» `613:55851` → `613:55856`. The saved property is on the receipt: «הנכס בפנייה» `613:55871`, the Bulgarian title in its own isolate `613:55953`, the reference `613:55954` (U+2066…U+2069) and the Quiet button «לצפייה בנכס» `I613:55955;6:9`. The judge also checks that №202, 115,000 €, 76 m², 68.5 m² and alex@example.com read left-to-right inside the Hebrew lines, and that the Cyrillic title keeps its own direction inside the right-aligned row.

**Required states:** filled, sending, committed with the saved property, and (run 3) the Hebrew default `614:66712`, invalid `614:66799`, rejected `614:67005`, offline `614:67102`, unknown `614:71270`, status check `614:71325`, not public now `614:71390`, availability unknown `614:71470`, no saved name `614:71539` and the Butler answer `614:71849` are present (Mobile 390, Noto Sans Hebrew, mirrored rows, LTR isolates around №, the request code, prices, e-mail and time). **Still COVERAGE GAPs** in Hebrew: several properties (P12MULTI), the viewing-request receipt, and the Butler states «no data», «error» and «offline».

**Run 7 (fix round 7; key updated before the run-7 tester runs):** the request line on the Hebrew committed receipt `613:55827` now reads «קוד הפנייה: ⁦7K3M9Q⁩» (`613:55845`, inside LTR isolates) in place of «מספר מעקב: ⁦024⁩»; the same code stands on the Hebrew sending, offline and unknown frames, and the old «מספר מעקב» and the number 024 are gone from the Hebrew twins. Path, controls (`602:20926` → `P11SENDINGHE` → `P12NAMEDHE` `613:56367`), expected actions (1) and limit (2) are unchanged; the end frame is the same `613:55827`. Pre-registered judging (run 7): as before (inquiry received, the Sandanski sales team is responsible, a broker writes by email in Hebrew, no deadline promised); naming the code is welcome and not required; the Hebrew copy stays a draft until a person approves it. The batch is the 13 Hebrew Mobile frames of run 3 (the Hebrew frames not on the path are the distractors).

## Staff tasks

### W03-T7 · Take a new inquiry and set when you will look at it again

**Goal (testers):** You are a broker at the agency. A new question about apartment №202 has just arrived and nobody is handling it yet. Take it on yourself and set when you will look at it again.

**Start frame:** `O02 · New in queue / Ново запитване в опашката` — Desktop `602:18685` · Mobile `602:18828` (prototype D `602:19725` · M `602:20548`)

| # | From frame | Action | Control (D proto · M proto) | To frame (Desktop · Mobile) |
|---|---|---|---|---|
| 1 | `O02 · New in queue` | tap «Поемете запитването» (Mobile: «Поемете запитването на Алекс») | `602:19843` · `602:20578` | `O03 · Accept · time required / Поемане на запитването` · D `602:18881` · M `602:19008` |
| 2 | `O03 · Accept · time required` | choose a future day and time in «Кога ще прегледате отново? *» (one entry; prototype: tap the field) | `602:19958` · `602:20624` | `O03 · Accept · ready` · D `602:19066` · M `602:19189` |
| 3 | `O03 · Accept · ready` | tap «Поемете запитването» | `602:20083` · `602:20681` | `O03ACCEPTED / Запитването е при вас` · D `614:58096` · M `614:58321` (prototype D `614:68002` · M `614:70108`) |
| (4) | `O03ACCEPTED` | optional: tap «Свържете със сделка» | `614:68130` · `614:70168` | `O03L` · D `20:1055` · M `25:2228` (prototype D `63:12845` · M `66:45642`) |

**Expected actions:** 3 on both viewports (the optional fourth tap is not part of the task). Median pass limit: 4.

**Success criterion:** the tester chooses the review time themself, then accepts, and says that the client is not notified. Since run 3 the claim has a receipt: `O03ACCEPTED` «Запитването е при вас» (D `614:58168` · M `614:58332`), «Следващ преглед» (`614:58198` · `614:58355`) «6 октомври 2026 · 10:00 · Europe/Sofia» (`614:58199` · `614:58356`), «Клиентът» «Не получава съобщение и не вижда часа за преглед.» (`614:58317` · `614:58473`), «Записано» «Мария Д. · 5 октомври 2026, 10:24 · Europe/Sofia» (`614:58221` · `614:58378`), next-step line «Свържете запитването със сделка или подгответе отговор. Клиентът не е уведомен.» (`614:58176` · `614:58333`). Evidence: rule «Задължително: бъдещ ден и час. Няма час по подразбиране…» (D `602:19000` · M `602:19058`); effect «Записва ви като отговорник с преглед на 6 октомври в 10:00. Клиентът не получава съобщение.» (D `602:19188` · M `602:19242`). Fail: the tester tries to accept with the time empty, or assumes a time was set for them (for example by going straight to the «ready» frame).

**Required states:** new in the owned queue, accept with an empty required future time (no default, button disabled), accept ready. All present.

**Run 4:** the third tap now passes through the automatic sending frame `O03ACCSEND` («Поемане на запитването», «Изчакайте няколко секунди, докато запишем поемането. Не натискайте отново.»; design D `614:60438` · M `614:60574`, prototype D `621:78970` · M `621:82756`) and after 1.5 s lands on `O03ACCEPTED` (not counted as an action). The Mobile context bar carries a «Butler» entry (O02 · New in queue M `618:74262`); the Desktop rail item and the in-page «Подгответе с Butler» (D `602:19845`) lead to the Butler panel, not to the accept form, and are not part of this path. Judging as in run 3: choose the review time, accept, say the client is not notified; accepting without choosing a time, or going to assign, fails.

**Run 5 (G-27):** the field «Следваща стъпка» on the whole accept family now reads «Проверка на наличността» (it read «Отговор за асансьора и оглед»): time required `I602:18968;6:61` · `I602:19029;6:61`, ready `I602:19153;6:61` · `I602:19210;6:61`, sending `I614:60526;6:72` · `I614:60596;6:72`, and the conflict, offline and unknown frames; the 12 prototype copies equal the design frames. The path, the controls and the judging are unchanged (3 actions; choose the review time, accept, say the client is not notified). The disabled primary of `O03ACCEPT` (hint «Бутонът се включва, след като изберете бъдещ час.») is unchanged and accepted by the fix-3 convention.

**Run 6 (fix round 6; key updated before the run-6 tester runs):** the automatic sending frame `O03ACCSEND` now carries the heading «Записваме поемането…» (design D `614:60517` · M `614:60585`; prototype D `621:79049` · M `621:82774`; the Desktop breadcrumb keeps «Поемане на запитването»); it said «Поемане на запитването», the same heading as the form, which is why a run-5 tester treated it as the form. Lead «Изчакайте няколко секунди, докато запишем поемането. Не натискайте отново.», the filled values and the pressed «Поемаме запитването…» are unchanged. Path, controls and expected actions unchanged (3 actions; the sending frame is automatic and not counted). Pre-registered judging (run 6): PASS when the tester chooses the review time in «Кога ще прегледате отново? *», accepts, and (when asked in the RESULT) says the client is not notified; FAIL when the tester accepts without choosing a time, ends on a frame other than the accepted one, or uses the sending frame as the form.

**Run 7 (fix round 7; key updated before the run-7 tester runs):** once a review time is chosen, the field on the whole accept family reads **«Избрахте: 6 октомври 2026 · 10:00 · Europe/Sofia»** (design: ready D `I602:19152;6:61` · M `I602:19208;6:61`; the sending, conflict, offline and unknown frames and their prototype copies carry the same line; 20 inputs); the empty field of `O03ACCEPT` is unchanged («Кога ще прегледате отново? *», no default, disabled primary). Run 6 (2 of 2 Haiku runs failed) read the filled frame as the form with a preset time; the line now says who chose it. The path, the controls (`602:19843` · `602:20578` → `602:19958` · `602:20624` → `602:20083` · `602:20681`), the expected actions (3) and the limit (4) are unchanged. Pre-registered judging (run 7): unchanged from run 6; PASS when the tester chooses the review time in «Кога ще прегледате отново? *», accepts and (when asked in the RESULT) says the client is not notified; FAIL when the tester accepts without choosing a time (the «ready» frame used as the form), assumes the system set a time, ends on a frame other than the accepted one, or uses the sending frame as the form.

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
| 1 | `O03` | tap «Свържете със сделката на Алекс» (run 5; it read «Свържете или създайте сделка») | `63:12633` · `66:45564` | `O03L / Свързване със сделката на Алекс` (run 6; it was titled «Свързване или създаване на сделка») · D `20:1055` · M `25:2228` |
| 2 | `O03L` | tap «Запишете свързването» | `63:12940` · `66:45671` | `O03LR / Записано свързване` · D `20:1175` · M `25:2279` |

**Expected actions:** 2. Median pass limit: 3 (since run 6 the acceptable extra tap on the recorded frame is «Към запитването на Алекс», D `63:13044` · M `66:45707` → O03; «Към сделката», D `63:13045` · M `66:45708` → O05, is now the Secondary and an extra route that ends on the deal screen).

**Success criterion:** the tester reports that the question is attached and that the next step is the availability check before a viewing proposal, by Мария Д. Evidence: «Запитването е свързано със сделката.» (D `20:1262` · M `25:2295`), «Мария Д. · Проверка на наличността преди предложение за оглед» (D `20:1273` · M `25:2306`). Fail: the tester states another next step (the deal screen O05 reads «Уточнете изискването за асансьор»), or says the attachment happened without tapping «Запишете свързването».

**Required states:** link, link recorded, create after qualifying (`21:2399` · `28:2817`), resolve without a deal with a reason (`20:1288` · `25:2321`). Present. Copy note: the staff noun is «сделка» since Phase C1a (owner decision); «случай», «преписка» and «ангажимент» are gone from the frames.

**Run 4 (G-07):** the O03 inquiry screen now shows only the inquiry's own next step: field «Следваща стъпка по запитването» with the value «Проверка на наличността» (condition «Преди предложение за оглед» kept; D `18:876` · M `16:539`), the same step that O03LR records. The competing button «Отворете следващите стъпки» is now «Към задачите» (D `63:12635` · M `66:45566`, → O18). The elevator clarification stays as the client's question and in the draft, and as a deal step on O05. A RESULT naming the elevator clarification as the next step still fails.

**Run 5 (G-31):** the three actions of the lead sentence «Поемете запитването, свържете го със сделка и подгответе отговора.» (D `605:25010` · M `605:25011`) now stand in one group «Lead actions» (D `18:857` · M `16:519`, prototype `63:12619` · `66:45548`) directly under it, above the status chip, in the sentence's order: Primary «Поемете или назначете» (`63:12620` · `66:45549` → O03A), Secondary «Свържете със сделката на Алекс» (`63:12633` · `66:45564` → O03L; it was a Primary in the section «Уточняване и следваща стъпка»), AI «Подгответе чернова с Butler» (`63:12642` · `66:45573` → XBUTLERPANEL; it was in «Човешки отговор»). Desktop: one row; Mobile: the same three stacked in that order. «Прегледайте преди изпращане» is now Secondary, so O03 shows one primary (it showed three). Judging unchanged: the end frame is `O03LR` with the availability check by Мария Д.; a RESULT that names the elevator clarification as the next step fails; going through «Поемете или назначете» (assign) first is an extra route and counts against the limit of 3 and the end frame.

**Run 6 (fix round 6; key updated before the run-6 tester runs):** (a) the link form O03L is titled «Свързване със сделката на Алекс» (design D `20:1139`, breadcrumb `20:1130`; M `25:2241`; prototype D `63:12927`, breadcrumb `63:12920`; M `66:45656`), so it echoes the button just tapped; its one primary stays «Запишете свързването» (D `63:12940` · M `66:45671` → O03LR). (b) The receipt O03LR (design D `20:1175` · M `25:2279`; prototype D `63:12943` · M `66:45674`): the **Primary is now «Към запитването на Алекс»** (design D `20:1284` · M `25:2317`; proto D `63:13044` · M `66:45707` → O03, whose field «Следваща стъпка по запитването» shows the same «Проверка на наличността»), the **Secondary «Към сделката»** (design D `20:1286` · M `25:2319`; proto D `63:13045` · M `66:45708` → O05) replaces «Към задачите»; the row «Следваща стъпка по запитването» still opens O18 (D `63:13029` · M `66:45692`). Pre-registered judging (run 6): PASS when the tester taps «Свържете със сделката на Алекс» and «Запишете свързването» (2 actions; a third tap on «Към запитването на Алекс» is acceptable) and names the availability check by Мария Д. before a viewing proposal; FAIL when the tester skips «Запишете свързването» (the receipt is not reachable from the first tap), ends on the deal screen O05 and names the elevator requirement as the next step, or states another next step.

### W03-T10 · Hand over open work before you are away

**Goal (testers):** You will be away next week. Make sure your open work, including Alex's question, passes to your colleague Nikol and nothing is dropped.

**Start frame:** `O23 / Екип, достъп и заместване` — Desktop `18:1141` · Mobile `16:736` (prototype D `63:20897` · M `66:51729`)

| # | From frame | Action | Control (D proto · M proto) | To frame (Desktop · Mobile) |
|---|---|---|---|---|
| 1 | `O23` | tap «Предайте отворената работа» | `63:21010` · `66:51774` | `O23H / Предаване на отворена работа` · D `21:788` · M `25:2760` (prototype D `63:21162` · M `66:51858`) |
| 2 | `O23H` | tap «Предложете предаване» | `63:21298` · `66:51928` | `O23HP / Изчаква приемане на работата` · D `21:948` · M `25:2851` |

**Expected actions:** 2. Median pass limit: 3.

**Success criterion:** the tester says the handover is proposed and waits for Nikol to accept; until then the work stays with the current owner. Evidence: «Изчаква приемане на работата» (D `21:1032` · M `25:2864`), «Предаването е предложено. Изчаква приемане; дотогава отговаря текущият заместник…» (D `I21:1097;6:408` · M `I25:2931;6:408`). Fail: the tester says Nikol has accepted or that the work already moved. Since run 3 O23HP has no shortcut to the accepted state O23HD (D `21:1108` · M `25:2942`): the one primary is «Към текущото заместване» (D `I21:1106;6:3` · M `I25:2940;6:3` → O23), the alert reads «Предложението чака отговор от Никол. Дотогава работата остава при вас. Ако Никол откаже, тук ще видите причината.» (D `I21:1097;6:408` · M `I25:2931;6:408`) and the next-step line «Изчакайте отговора на Никол. Работата остава при вас, докато тя приеме.» (D `615:73381` · M `615:73382`).

**Required states:** handover proposal, pending acceptance, accepted. Present. Since Phase C1a the pending frame carries two more Quiet buttons: «Оттеглете предложението» (→ O23HPC since run 3, then O23HPX, task T13b; D `I606:48742;6:9` · M `I606:48746;6:9`) and «Вижте какво получава Никол» (→ O23HRE since run 3, tasks T11 and T12; D `I606:48744;6:9` · M `I606:48748;6:9`). Related state: `O03 · Assign · awaiting acceptance / Чака приемане от Никол` (D `602:21029` · M `602:21140`), entered from O03A «Запишете назначаването» (D `63:12738` · M `66:45603`) through `Prototype / O03ASSIGNWAIT` (D `605:24524` · M `605:24651`).

**Run 6 (fix round 6; key updated before the run-6 tester runs):** O23H now has a next-step line directly under the title (layer «Next step», MSR / body, muted): «Проверете какво се предава и го предложете на Никол. Работата остава при вас, докато тя приеме.» (design D `623:114231` · M `623:114233`; prototype D `623:114232` · M `623:114234`). The accepted frame O23HD is headed «Никол прие предаването» (design D `21:1192`, breadcrumb `21:1183`; M `25:2955`; prototype D `63:21383`, breadcrumb `63:21376`; M `66:51945`); it read «Прието предаване» with no actor, so a run-3 tester took it as the direct result of «Предложете предаване». Replay: «Предложете предаване» (D `63:21298` · M `66:51928`) → the automatic sending frame `O23HSEND` («Изпраща се», «Изпращаме предложението…»; prototype D `621:79358` · M `621:82908`, not in the tester batch) → after the timeout O23HP (D `63:21610` · M `66:52004`). Pre-registered judging (run 6): as before; FAIL when the RESULT says Никол has accepted or the work has already moved (the end screen O23HD, «Никол прие предаването», is the accepted state and not the result of this task).

## Colleague handover tasks (new in Phase C1a)

Server truth (`design/contracts/w03-p12.md`, sections 1 and 2, server answers of the W03 fix round): the receiver accepts with their own next step and review time (no default), or declines with a reason; the work stays with the sender until the accept is read back; the sender can withdraw with a reason, which is not a decline, and can then offer the work to another colleague; the readback names the person and the time with the zone, with no receipt number; no staff notification is delivered and no screen claims one; clients receive no message for any handover step. Receiver frames carry the rail user «Никол · Координатор» (the O23 team list wins); sender frames «Мария Д. · Брокер».

### W03-T11 · Accept a colleague's work with your own plan

**Goal (testers):** Your colleague Maria will be away next week and has offered you her open work. Take it over, with your own plan for what you do first and when you will look at it again.

**Start frame:** `O23HRE / Мария Д. ви предлага работата си (без час)` — Desktop `614:57627` · Mobile `614:57896` (prototype D `614:67733` · M `614:69908`). Run 3: the receiver's first view is the empty state; the filled frame `O23HR` (D `606:45687` · M `606:45933`, prototype D `606:48758` · M `606:48981`) is the «ready» state that either field reaches.

| # | From frame | Action | Control (D proto · M proto) | To frame (Desktop · Mobile) |
|---|---|---|---|---|
| 1 | `O23HRE` | enter «Вашата следваща стъпка *» (empty, placeholder «Напишете какво ще направите първо»; one entry) | `614:67892` · `614:69999` (design `I614:57786;6:56` · `I614:57987;6:56`) | `O23HR` (filled, ready) |
| 2 | `O23HRE` | choose «Кога ще прегледате отново? *» (empty, placeholder «Изберете ден и час»; one entry) | `614:67893` · `614:70000` (design `I614:57787;6:56` · `I614:57988;6:56`) | `O23HR` |
| 3 | `O23HR` | tap «Приемете работата» | `606:48921` · `606:49076` | `O23HRSEND / Приемаме работата…` (design D `614:63548` · M `614:63831`; prototype D `614:68481` · M `614:70449`) → automatic after 1.5 s → `O23HRA / Работата е при вас` (design D `606:46124` · M `606:46324`; prototype D `606:49138` · M `606:49326`) |

**Expected actions:** 3 (two entries and the tap); the primary of the empty frame is disabled and has no reaction. Median pass limit: 4. In the prototype either field leads to the ready frame.

**Success criterion:** the tester ends on `O23HRA`, says the work is now theirs from this moment and that clients receive no message, and names the next step and the review time that were saved. Evidence: «Работата е при вас» (D `606:46196` · M `606:46335`), «Започнете със задачата, която записахте.» (`606:46262` · `606:46393`), «Ваша задача» (`606:46274` · `606:46405`), «Следващ преглед» (`606:46285` · `606:46416`), «Отговорник от сега» (`606:46296` · `606:46427`), «Записано» «Никол · 5 октомври 2026, 18:05 · Europe/Sofia» (`606:46308` · `606:46439`). Before the tap: rule «Задължително: стъпка и бъдещ ден и час. Няма час по подразбиране…» (D `614:57891` · M `614:58091`), hint «Бутонът се включва, след като напишете стъпката и изберете бъдещ час.» (`614:57893` · `614:58093`), effect «Когато приемете, тези три неща са ваши от този момент. Стъпката става ваша задача, а часът е за вашия преглед. Клиентите не получават съобщение.» (D `I614:57788;6:401` · M `I614:57989;6:401`). Fail: the tester says the work was already theirs before the tap, taps «Откажете с причина», or says Мария Д. gets a notification (no screen claims one any more).

**Required states:** nothing entered (`O23HRE`), ready (`O23HR`), sending (`O23HRSEND`), changed meanwhile (D `614:64045` · M `614:64310`, «Някой е променил това междувременно» → «Заредете предложението отново» → O23HRX), connection lost (D `614:64506` · M `614:64772`, «Опитайте отново» → O23HRSEND), unknown outcome (D `614:64969` · M `614:65252`, «Проверете същата заявка» → O23HRA), accepted. All present.

### W03-T12 · Turn down a colleague's work and say why

**Goal (testers):** Your colleague Maria will be away next week and has offered you her open work. You cannot take it, because you are away at the same time. Turn it down and say why.

**Start frame:** `O23HRE` — Desktop `614:57627` · Mobile `614:57896` (prototype D `614:67733` · M `614:69908`; the same controls exist on the filled frame `O23HR`).

| # | From frame | Action | Control (D proto · M proto) | To frame (Desktop · Mobile) |
|---|---|---|---|---|
| 1 | `O23HRE` | tap «Откажете с причина» | `614:67897` · `614:70004` (filled twin `606:48922` · `606:49077`) | `O23HRD / Откажете предаването` · D design `606:46469` · M `606:46634` (prototype D `606:49448` · M `606:49593`) |
| 2 | `O23HRD` | enter «Причина за отказа *» (shown filled: «Отсъствам по същото време, от 13 до 15 октомври.»; entry optional, not wired) | `I606:46610;6:83` · `I606:46706;6:83` | same frame |
| 3 | `O23HRD` | tap «Изпратете отказа» | `606:49533` · `606:49610` | `O23HRDR / Отказът е записан` · D design `606:46744` · M `606:46933` (prototype D `606:49672` · M `606:49849`) |

**Expected actions:** 3 with an own reason; 2 when the shown reason is accepted. Median pass limit: 4.

**Success criterion:** the tester ends on `O23HRDR` and says the refusal and the reason are recorded, the work stays with Мария Д., she will choose another colleague, and nothing moved to them. Evidence: «Отказът е записан» (D `606:46816` · M `606:46944`), «Не е нужно друго от вас. Мария Д. ще избере друг колега.» (`606:46882` · `606:47002`), «Отказано от вас» (D `I606:46883;6:179`), «Причина» (`606:46894` · `606:47014`), «Работата остава при» → «Мария Д.» (`606:46905` · `606:47025`), «Записано» «Никол · 5 октомври 2026, 18:07 · Europe/Sofia» (`606:46917` · `606:47037`). Effect line before the tap: «Мария Д. ще види причината и ще избере друг колега. Нищо не се прехвърля към вас.» (D `I606:46614;6:401` · M `I606:46710;6:401`). Fail: the tester taps «Приемете работата» or says the work is theirs.

**Required states:** decline form with a reason, decline recorded (receiver view), sender view `O23HPD`, and (design only, run 3) the command states of the decline: sending D `614:65466` · M `614:65662`, changed meanwhile `614:65789` · `614:65973`, connection lost `614:66088` · `614:66273`, unknown outcome `614:66389` · `614:66585`. **Not drawn:** a decline with an empty reason (the reason is shown filled).

### W03-T13a · See that the colleague declined and offer the work to someone else

**Goal (testers):** You offered your open work to your colleague Nikol. She has answered. Find out what she answered, and offer your work to someone else.

**Start frame:** `O23HPD / Никол отказа предаването` — Desktop `606:47386` · Mobile `606:47575` (prototype D `606:50246` · M `606:50423`)

| # | From frame | Action | Control (D proto · M proto) | To frame (Desktop · Mobile) |
|---|---|---|---|---|
| 1 | `O23HPD` | tap «Предложете на друг колега» | `606:50363` · `606:50472` | `O23HC / Предложете работата на друг колега` · D design `614:57059` · M `614:57247` (prototype D `614:67376` · M `614:69689`) |
| 2 | `O23HC` | (optional) choose a colleague in «Получател *»; Петър К. is preselected | rows `I614:57221;6:172` · `I614:57340;6:172` (not wired) | same frame |
| 3 | `O23HC` | tap «Предложете на Петър К.» | `614:67510` · `614:69757` | `O23HCP / Изчаква приемане от Петър К.` · D design `614:57366` · M `614:57531` (prototype D `614:67566` · M `614:69810`) |

**Expected actions:** 2 (open, then the primary with the preselected receiver); 3 with an explicit choice. Median pass limit: 3.

**Success criterion:** the tester says that Никол declined because she is away at the same time (13 to 15 октомври), that the work is still with Мария Д., and that it is now offered to another colleague (Петър К.) and waits for his answer. Evidence: «Никол отказа предаването» (D `606:47458` · M `606:47586`), «Отказано от Никол» (D `I606:47525;6:185`), «Причина от Никол» → «Отсъствам по същото време, от 13 до 15 октомври.» (`606:47536` · `606:47656`), «Работата е при» → «Вас · Мария Д.» (`606:47547` · `606:47667`); on `O23HC`: «Предложете работата на друг колега» (`614:57131` · `614:57258`), «Никол отказа на 5 октомври и не се показва отново…» (D `I614:57139;6:179` · M `I614:57259;6:179`), rows Петър К. (selected), Ваня Т. («отсъства на 13 и 14 октомври»), Стоян В.; on `O23HCP`: «Изчаква приемане от Петър К.» (`614:57438` · `614:57542`), «Изчакайте отговора на Петър К. Работата остава при вас, докато той приеме.» (`614:57527` · `614:57623`), «Записано» (`I614:57497;6:408` · `I614:57596;6:408`). Fail: the tester says the work already moved to the colleague, or offers it to Никол again.

**Required states:** sender sees the refusal, receiver choice (Никол excluded), offer recorded for a second receiver, and (design only) the command states of the offer: sending D `614:61208` · M `614:61390`, changed meanwhile `614:61503` · `614:61665`, connection lost `614:61758` · `614:61925`, unknown outcome `614:62023` · `614:62197`. Closed in run 3 (was a COVERAGE GAP, key defect K-4). **Remaining note:** the primary reads «Предложете на Петър К.» only; the labels for another chosen receiver are not drawn, so a tester who names Ваня Т. or Стоян В. is reported as a note, not a fail.

### W03-T13b · Take back an offer before the colleague answers

**Goal (testers):** You offered your open work to your colleague Nikol, but your plans changed before she answered. Take the offer back.

**Start frame:** `O23HP / Изчаква приемане на работата` — Desktop `21:948` · Mobile `25:2851` (prototype D `63:21610` · M `66:52004`)

| # | From frame | Action | Control (D proto · M proto) | To frame (Desktop · Mobile) |
|---|---|---|---|---|
| 1 | `O23HP` | tap «Оттеглете предложението» | `606:48750` · `606:48754` | `O23HPC / Оттеглете предложението` · D design `614:56770` · M `614:56949` (prototype D `614:67197` · M `614:69579`) |
| 2 | `O23HPC` | enter «Причина *» (shown filled: «Плановете ми се промениха: оставам на работа следващата седмица.»; entry optional, not wired) | `I614:56852;6:83` · `I614:56963;6:83` | same frame |
| 3 | `O23HPC` | tap «Оттеглете предложението» | `614:67282` · `614:69596` | `O23HPX / Оттеглихте предложението` · D design `606:47709` · M `606:47898` (prototype D `606:50534` · M `606:50711`) |

**Expected actions:** 2 when the shown reason is accepted; 3 with an own reason. Median pass limit: 3.

**Success criterion:** the tester ends on `O23HPX` and says the offer is withdrawn with the reason, the work stays with Мария Д., Никол sees «Предложението е оттеглено» and not a refusal, and the work can be offered to someone else later. Evidence: «Оттеглихте предложението» (D `606:47781` · M `606:47909`), «Работата остава при вас. Можете да я предложите на друг колега, когато сте готови.» (`606:47847` · `606:47967`), «Оттеглено от вас» (D `I606:47848;6:179`), «Вашата причина» (`614:56689` · `614:56700`), «Какво вижда Никол» (`606:47859` · `606:47979`), «Записано» (`606:47882` · `606:48002`). Before the tap, on `O23HPC`: «Работата остава при вас. Никол ще види „Предложението е оттеглено“ и причината.» (D `I614:56853;6:401` · M `I614:56964;6:401`). The receiver's view is `O23HRX / Предложението е оттеглено` (D design `606:47067` · M `606:47254`; prototype D `606:49960` · M `606:50136`), reached with «Вижте какво вижда Никол» (D `606:50652` · M `606:50761`), with «Причина от Мария Д.» (`614:56733` · `614:56744`) and «Не е нужно действие. Мария Д. оттегли предложението, преди да отговорите.» Fail: the tester says Nikol declined or accepted, says the withdrawal is a refusal («you declined»), opens the decline form O23HRD, or reports an accepted handover.

**Required states:** pending with a withdraw control, withdraw with a required reason (run 3), withdrawn (sender view), withdrawn (receiver view), and (design only) the command states of the cancel: sending D `614:62302` · M `614:62498`, changed meanwhile (Никол accepted at 18:04) `614:62625` · `614:62809`, connection lost `614:62924` · `614:63109`, unknown outcome `614:63225` · `614:63421`. **Not drawn:** a withdraw with an empty reason.

**Run 6 (fix round 6; key updated before the run-6 tester runs):** the receiver's decline form, which a run-3 tester reached by reading «Оттеглете предложението» as «Отделете предложението», is now titled «Откажете предаването от Мария Д.» (title and Desktop breadcrumb) on O23HRD (design D `606:46548` · M `606:46645`; prototype D `606:49527` · M `606:49604`, breadcrumb D `606:49520`) and on the O23HRDREASON, decline-sending and decline-connection-lost frames (`619:76656` · `619:76785`; `614:65545` · `614:65673`; `614:66167` · `614:66284`; prototypes `621:81149` · `621:83930`, `621:80569` · `621:83586`, `621:80859` · `621:83758`), so a sender can see that the form belongs to the receiver. The task, path and expected actions are unchanged; **opening O23HRD stays a FAIL** (it is the receiver's refusal form, not a withdrawal). Pre-registered judging (run 6): PASS on `O23HPC` then `O23HPX` with the withdrawal described as a withdrawal (the receiver sees «Предложението е оттеглено», the work stays with Мария Д.); FAIL on the decline form, a RESULT that says «you declined» or that Никол accepted.

**Run 7 (fix round 7; key updated before the run-7 tester runs):** on the pending frame O23HP the two quiet actions are now bordered Secondary buttons: **«Оттеглете предложението»** (design D `I606:48742;6:6` · M `I606:48746;6:6`; prototype control D `606:48750` · M `606:48754` → O23HPC, unchanged) and **«Вижте какво получава Никол»** (design D `I606:48744;6:6` · M `I606:48748;6:6`; → O23HRE). Run 6 (Haiku Mobile failed) took the green primary «Към текущото заместване» first, then **«Откажи»** on the handover form O23H (read as «reject») and ended on the receiver's refusal; every button label «Откажи» is now **«Назад»** (84 renamed buttons; on O23H design D `I21:946;6:6` · M `I25:2849;6:6`, → O23). Path (`606:48750` · `606:48754` → `614:67282` · `614:69596` → O23HPCSEND → O23HPX), expected actions (2 or 3) and limit (3) unchanged. Pre-registered judging (run 7): unchanged from run 6; PASS on `O23HPC` then `O23HPX` with the withdrawal described as a withdrawal (the receiver sees «Предложението е оттеглено», the work stays with Мария Д.); FAIL on the receiver's decline form O23HRD, a RESULT that says «you declined» or that Никол accepted, or an end on O23 or O23H without a withdrawal.

## Saved-property receipt tasks (new in Phase C1a)

The receipt names the property saved at submission and says whether its listing can be opened now. Rows are built from `{reference, title | null, publicNow: true | false | null}`; the screen never shows live price, area or availability (`design/contracts/w03-p12.md`, section 3). The variants are data variants of one receipt; the prototype reaches them from the harness index, and the batches hand each tester one start screen at a time.

### W03-T14 · Which property was my question about, and can I still open its listing?

One run per data variant and per viewport. Goal and role are the same for every variant.

**Goal (testers):** You sent a question to an estate agency a few minutes ago. The page in front of you is what the website showed afterwards. Find out which property your question was about, and whether you can still open that property's listing. Open it if you can.

| Variant | Start frame (design D · M) | Prototype (D · M) | What the screen says | Control (D proto · M proto) → frame | Right answer |
|---|---|---|---|---|---|
| a · public now | `P12 · Committed` `602:18463` · `602:18519` | `P12COMMITTED` `602:19667` · `602:20499` | «Апартамент в центъра на Сандански», «№ 202», button «Вижте имота» | `613:55969` · `613:55981` → `P05` (D `63:26089` · M `66:55737`); since run 3 the saved title (D `613:55252` · M `613:55264`, proto `613:55967` · `613:55979`) is a link to the same P05 | property №202 named; the listing opens (P05) |
| b · not public now | `P12INACTIVE / Обявата вече не е активна` `613:55523` · `613:55604` | `613:56087` · `613:56157` | run 3: an archived listing that is on no live public frame: title «Тристаен апартамент в центъра на гр.Сандански» (D `613:55594` · M `613:55666`, plain, no link), «№ 242» (D `613:55595` · M `613:55667`), Warning alert «Тази обява вече не е активна и не може да се отвори.» (D `I614:56620;6:408` · M `I614:56626;6:408`; proto `614:56644` · `614:56661`), «Вижте подобни имоти» (D `I613:55597;6:9` · M `I613:55669;6:9`); the primary «Разгледайте още имоти» (D `I613:55557;6:3`, proto `613:56133` → P02) | `613:56114` · `613:56181` → `P22` (D `63:28176` · M `66:57861`) | property №242 named (run 2 used №202; the fixture was changed so that no live page shows it); the listing can **not** be opened; similar properties are offered |
| c · availability unknown | `P12UNKNOWN / Наличността на обявата не е известна` `613:55676` · `613:55756` | `613:56228` · `613:56297` | name, «№ 202», run 4: status row «Не можем да проверим дали обявата е активна» (D `618:73385` · M `618:73391`); run 5: Quiet button «Проверете дали обявата още е активна» (D `I613:55749;6:9` · M `I613:55820;6:9`, named «Go / P05 / UI04 / Button»; it read «Потърсете имот № 202» and opened the search P02) | `613:56254` · `613:56320` → `P05` (D `63:26089` · M `66:55737`; run 5, was P02); run 6: the saved title (D `613:55747` · M `613:55818` · HE `614:71491`; proto `613:56252` · `613:56318` · HE `614:72452`, layer «Go / P05 / Listing / saved title») → the same `P05` | property №202 named; the page does not say whether the listing is open; the way on is the check button or the title link, both open the listing's detail page |
| d · no saved name | `P12NONAME / Запитване без записано име на имота` `613:55372` · `613:55452` | `606:54293` · `606:54343` | «Имот № 202» (D `613:55443` · M `613:55514`), «Името на имота не е записано в това запитване.» (D `613:55444` · M `613:55515`), button «Вижте имота» | `613:55993` · `613:56005` → `P05` | the question was about property №202, the name was not saved; the listing opens (P05) |

**Expected actions:** 1 for each variant (the tap); b may stop at 0 or 1. Median pass limit: 2.

**Success criterion:** the tester names the property (the number, and the name where one is saved) and states the listing status the variant shows, without claiming more. a and d: the listing is opened through «Вижте имота». b: says the listing (№242) is no longer active and cannot be opened; any claim that it was opened fails (the property name is a control only where a listing exists, variant a and the №202 row of P12MULTI; since run 3 no live batch page shows №242, closing key defect K-6). c: says the page does not tell whether it is still open and takes the search by number; a tester who really opens the listing through the search page (P02 → P05) has the answer by experiment and passes, a flat «it is open» or «it is closed» without that fails. Fail on variants b and d (and on the №200 and №912 rows of T15, whose titles stay plain): tapping the property name as if it were a link and reporting a listing that opened. **Run 6: this fail clause no longer applies to variant c (P12UNKNOWN)**, whose saved title is now a real link to the listing page (see the run-6 note below); tapping it is a valid path.

**Required states:** a, b, c, d. Present (Desktop and Mobile). Hebrew: a in `P12 · Saved name HE RTL` (T6) and, since run 3, b `614:71390`, c `614:71470` and d `614:71539` (Mobile; no Hebrew G1 run for b to d, frame evidence only).

**Run 4 (G-03, G-24):** c: the muted line is hidden and a status row sits directly under the reference, «Не можем да проверим дали обявата е активна» (UI26 Info alert; D `618:73385` · M `618:73391`, prototype `618:73397` · `618:73403`; Hebrew `618:73409`). Pre-registered judging for c: PASS when the RESULT says the page does not tell whether the listing is open (or the tester opens it by search and reports what P05 shows), FAIL on a flat «it is open» or «it is closed» without that. b, d and the non-link headings (G-24): every saved title that is not a link is now muted, regular weight, no underline, with the reference line directly under it (P12INACTIVE D `613:55594` · M `613:55666`, P12NONAME D `613:55443` · M `613:55514`, P12UNKNOWN D `613:55747` · M `613:55818`); tapping such a title and reporting an opened listing still fails.

**Run 5 (G-03, fix round 4):** c: the button «Потърсете имот № {reference}» is replaced by the Quiet button «Проверете дали обявата още е активна» (Hebrew «לבדוק אם המודעה עדיין פעילה»), which opens the listing's detail route by reference (the prototype has one detail frame, so P05 stands for it, D `63:26089` · M `66:55737`); the Info status row under the reference stays («Не можем да проверим дали обявата е активна»; the Mobile BG button fills the row, 302 / 318 wide, label wraps). P12UNKNOWN D `613:55749` · M `613:55820` (design buttons; frames `613:55676` · `613:55756`), prototype `613:56254` · `613:56320`; P12MULTI №912 button `613:55341` · `613:55368` (proto `613:56056` · `613:56083`, also → P05); Hebrew P12UNKNOWN `614:71493` (proto `614:72455`), Hebrew P12MULTI №912 `620:78265`. **Pre-registered judging for c (run 5):** PASS when the RESULT says the page cannot tell whether the listing is still open or active (status row, or «cannot be confirmed here»), or when the tester taps «Проверете дали обявата още е активна» and reports what the detail page shows (the check by experiment, expert path 1 action); FAIL on a flat «it is open», «it is closed», «it still opens» or «it can be accessed» without the unknown statement and without the check tap. The tester files include P05 and P02 (as in run 4).

**Run 6 (fix round 6; key updated before the run-6 tester runs):** c: the saved title «Апартамент в центъра на Сандански» is a real link to the listing page, in the link style of `publicNow = true` (semibold, action colour, underline), design D `613:55747` · M `613:55818` · HE `614:71491`, prototype D `613:56252` → P05 `63:26089`, M `613:56318` → `66:55737`, HE `614:72452` → `66:55737`; the status row and the Quiet button «Проверете дали обявата още е активна» stay (the button is the same route). **The fail clause «tapped a plain title» is removed for P12UNKNOWN only**: on c it is now a valid path, and a tester who taps the title or the button and reports what the listing page shows has done the check by experiment (1 action). The clause stays in force for b (P12INACTIVE), d (P12NONAME) and the plain rows of T15. Pre-registered judging for c (run 6): PASS when the RESULT says the page cannot tell whether the listing is still open or active, or when the tester taps the title or the button (or goes through the search to the card) and reports what the detail page shows; FAIL on a flat «it is open», «it is closed», «it still opens» without the unknown statement and without a tap that opens the listing page.

### W03-T15 · Several properties in one question

**Goal (testers):** You asked an estate agency about several apartments in one question and sent it. The page in front of you is what the website showed afterwards. Find out which properties your question was about, and which of them you can still open.

**Start frame:** `P12MULTI / Запитване за три имота` — Desktop `606:54028` · Mobile `606:54113` (prototype D `606:54487` · M `606:54528`)

| # | From frame | Action | Control (D proto · M proto) | To frame |
|---|---|---|---|---|
| 1 | `P12MULTI` | tap «Вижте имота» under «Апартамент в центъра на Сандански» | `613:56041` · `613:56068` | `P05` (D `63:26089` · M `66:55737`) |

**Expected actions:** 1 (reading the three rows is not an action). Median pass limit: 2.

**Success criterion:** the tester lists the three properties and the status of each: №202 «Апартамент в центъра на Сандански» (D `613:55324` · `613:55325` · M `613:55351` · `613:55352`) can be opened with «Вижте имота» (D `I613:55326;6:9` · M `I613:55353;6:9`); №200 «Тристаен апартамент в центъра на Сандански» (D `613:55331` · `613:55332` · M `613:55358` · `613:55359`) is no longer active, Warning alert «Тази обява вече не е активна и не може да се отвори.» (run 3: D `I614:56606;6:408` · M `I614:56613;6:408`), with «Вижте подобни имоти» (D `I613:55334;6:9` → P22, prototype `613:56049` · `613:56076`); №912 (D `613:55339` · M `613:55366`) has no saved name, «Името на имота не е записано в това запитване.» (D `613:55340` · M `613:55367`) and, since run 3, the muted line «Сега не можем да проверим дали обявата още е публикувана.» (D `614:56612` · M `614:56619`), with «Потърсете имот № 912» (D `I613:55341;6:9` → P02, prototype `613:56056` · `613:56083`). Heading «Имотите в запитването · 3» (D `613:55319` · M `613:55346`), caption «Имената са записани при изпращането на 5 октомври 2026, 17:12…» (D `613:55344` · M `613:55371`), next-step line «Запазете номера за проверка. Брокер ще ви пише за трите имота.» (D `606:54960` · M `606:54961`). Fail: the tester merges the rows, omits a property, or says №200 or №912 can be opened.

**Required states:** mixed list (public, not public, no saved name and unknown). Present. Reaction note: the primary «Към същото сравнение» (D `606:54515` · M `606:54553`, instance `I606:54055;6:3`) now has ON_CLICK → P07 (D `63:26243` · M `66:55880`) (key defect K-1 closed in the public fix round). The №202 title is a link to P05 (proto `613:56039` · `613:56066`); the №200 and №912 titles are plain.

## Run 3 changes (W03 fix round)

New or changed frames since «After C1a W03+P12»; node ids Desktop · Mobile, design frames unless a prototype copy is named. Full lists: `design/acceptance/w03-fix-public-log.md`, `design/acceptance/w03-fix-staff-log.md`.

| Frame | Design D · M | Proto D · M | Used by |
|---|---|---|---|
| O03ACCEPTED · Запитването е при вас | `614:58096` · `614:58321` | `614:68002` · `614:70108` | T7 end |
| O23HRE · receiver form, nothing entered | `614:57627` · `614:57896` | `614:67733` · `614:69908` | T11, T12 start |
| O23HRSEND · accept sending | `614:63548` · `614:63831` | `614:68481` · `614:70449` | T11 (automatic) |
| O23HPC · cancel with reason | `614:56770` · `614:56949` | `614:67197` · `614:69579` | T13b |
| O23HC · choose another receiver | `614:57059` · `614:57247` | `614:67376` · `614:69689` | T13a |
| O23HCP · offered to the second receiver | `614:57366` · `614:57531` | `614:67566` · `614:69810` | T13a end |
| Command states, 5 families × 4 (sending, changed meanwhile, connection lost, unknown) | contract section 1 and 2 (`614:60438` … `614:66585`) | O23HR accept only (`614:68481` … `614:71056`) | G3 items 3, 6, 7 |
| XBUTLERPANEL · what Butler will do (staff) | `614:58477` · `614:58731` | `614:68227` · `614:70264` | T17 |
| PBUTLER · first question | `614:58920` · `614:58987` | `614:59777` · `614:59808` | T16 |
| PBUTLERANSWER · answer with quoted facts | `614:59055` · `614:59128` | `614:59839` · `614:59882` | T16a end |
| PBUTLERNOFACT · no data, hand-off | `614:59201` · `614:59246` | `614:59925` · `614:59961` | T16b |
| PBUTLERERROR · blocked | `614:59291` · `614:59333` | `614:59997` · `614:60030` | G3 items 1, 6 |
| PBUTLEROFFLINE · no connection | `614:59375` · `614:59422` | `614:60063` · `614:60096` | G3 items 1, 6 |
| P05 entry «Попитайте Butler» | `I614:59749;6:17` · `I614:59756;6:17` | `614:59763` · `614:59770` | T16 start |
| Hebrew Mobile P11 default, invalid, sending, rejected, offline | `614:66712`, `614:66799`, `614:66896`, `614:67005`, `614:67102` | `614:72025` … `614:72243` | T6, G3 item 8 |
| Hebrew Mobile P12U, P12UCHECK, not public now, availability unknown, no saved name, Butler answer | `614:71270`, `614:71325`, `614:71390`, `614:71470`, `614:71539`, `614:71849` | `614:72299` … `614:72545` | G3 item 8 |
| Focus-order annotations (outside the frames) | 105 on pages 03, 05, 06, 08, 09; shortcut note `614:58916` | — | G3 item 9 |

Butler entries: all 32 Bulgarian public entries and the Hebrew ones lead to the panel (`PBUTLER`, `PBUTLERANSWERHE`); the staff rail item «Butler» leads to `XBUTLERPANEL` on 112 Desktop prototype frames; on Mobile the panel is wired from 3 frames only, and the in-page buttons «Подгответе чернова с Butler» (O02, O03; D `I18:901;6:17`, M `I16:565;6:17`) lead to the draft screen O32 (D `18:1610` · M `18:3070`), not to the panel.

### W03-T16a · Ask the website assistant about apartment №202 (answerable question)

**Goal (testers):** You are looking at apartment №202 in Sandanski on an estate agency's website. You want to know how big it is and what it costs, and you would like to ask the website's assistant instead of calling. Ask it, and tell us exactly what it answered.

**Start frame:** `P05 / Обява №202` — Desktop `11:1031` · Mobile `11:8334` (prototype D `63:26089` · M `66:55737`)

| # | From frame | Action | Control (D proto · M proto) | To frame (Desktop · Mobile) |
|---|---|---|---|---|
| 1 | `P05` | tap «Попитайте Butler» | `614:59763` · `614:59770` | `PBUTLER` D `614:58920` · M `614:58987` (proto `614:59777` · `614:59808`) |
| 2 | `PBUTLER` | tap a suggested question («Каква е площта?», `614:59800`) or enter a question in «Напишете въпрос за имот №202» and tap «Изпратете въпроса» (`614:59804` · `614:59835`) | see left | `PBUTLERANSWER` D `614:59055` · M `614:59128` (proto `614:59839` · `614:59882`) |

**Expected actions:** 2 with a suggested question; 3 with a typed one. Median pass limit: 3.

**Success criterion:** the tester quotes the answer exactly: «Цена: 115 000 €», «Обща площ: 76 m²», «Застроена площ: 68,5 m²», «Спалня: 1», «Местоположение: Сандански · център» (D `614:59095` … `614:59099` · M `614:59168` … `614:59172`), and says that availability and a viewing are confirmed by a broker (D `614:59114` · M `614:59187`) and that the answer came from the approved listing №202 (source row, `Обява №202 · Апартамент в центъра на Сандански`). Verdict label «Изпълнено автоматично» (D `I614:59090;6:191`). Before the question: limit line «Butler отговаря само с данни от одобрената обява №202 и ги цитира точно. Не резервира оглед и не потвърждава наличност.» (D `614:58935` · M `614:59002`) and «Какво ще направи Butler» (D `614:58957`). Fail: any fact that differs from the listing, or a claim that Butler confirmed availability, booked a viewing or sent anything to a broker.

**Required states:** first question, answer with quoted facts, blocked (`PBUTLERERROR`, «Блокирано», the question kept, «Опитайте отново»), no connection (`PBUTLEROFFLINE`, +359879696870). Present. **Not drawn:** Butler working with a Stop (G3 item 3).

### W03-T16b · Ask the assistant something the listing does not say, and reach a broker

**Goal (testers):** You are looking at apartment №202 in Sandanski on an estate agency's website. You want to know whether there is an elevator to its floor. Ask the website's assistant. If it cannot tell you, make sure your question reaches a person at the agency.

**Start frame:** `P05` as in T16a.

| # | From frame | Action | Control (D proto · M proto) | To frame (Desktop · Mobile) |
|---|---|---|---|---|
| 1 | `P05` | tap «Попитайте Butler» | `614:59763` · `614:59770` | `PBUTLER` |
| 2 | `PBUTLER` | enter «Има ли асансьор до етажа?» in «Напишете въпрос за имот №202» | field `I614:58975;6:275` · `I614:59042;6:275` (not wired) | same frame |
| 3 | `PBUTLER` | tap «Изпратете въпроса» | `614:59804` · `614:59835` | logical target `PBUTLERNOFACT` D `614:59201` · M `614:59246` (proto `614:59925` · `614:59961`); wired: `PBUTLERANSWER`, whose «Изпратете въпроса» (`614:59878` · `614:59921`) leads to `PBUTLERNOFACT` |
| 4 | `PBUTLERNOFACT` | tap «Попълнете запитването с въпроса ми» | `614:59957` · `614:59993` | `P11 · Filled` D `597:2224` · M `598:18057` (proto `602:19244` · `602:20111`) |
| 5 | `P11 · Filled` | tap «Изпратете запитването» | `602:19273` · `602:20146` | `P11 · Sending` → `P12 · Committed` D `602:18463` · M `602:18519` |

**Expected actions:** 5 (the typed question counts as one entry). Median pass limit: 6. The manual path «Ще го направя аз» (D `I614:58938;6:9` → P11) is an equal alternative.

**Success criterion:** the tester ends on `P12 · Committed` (or on the filled form after typing the question themselves), says that Butler did not know, citing «Не знам. В одобрената обява №202 няма данни за асансьор…» (D `614:59239` · M `614:59284`), and that the visitor sends the first message to the broker: «Първото съобщение до брокер изпращате вие.» (D `614:59238` · M `614:59283`), «Какво ще направи Butler»: «Ще попълни запитване за имот №202 с вашия въпрос… Без вас нищо не се изпраща.» (`614:59241` · `614:59286`), verdict «Чака Вашето одобрение» (D `I614:59236;6:185`). Fail: the question stays in the Butler panel; the tester says Butler sent it, or invents an elevator answer.

**Required states:** no data with hand-off (present); first contact with a new person stays with a human (the panel says so).

**Run 6 (fix round 6; key updated before the run-6 tester runs):** (a) the lead of PBUTLERANSWER now names the control that leads to a person: «Попитайте още нещо. За оглед, наличност или въпрос без отговор пишете на брокер с „Ще го направя аз“.» (design D `614:59076` · M `614:59149`; prototype D `614:59855` · M `614:59898`; Hebrew design `614:71870`, prototype `614:72561`); it said «…пишете на брокер.» with no control named, and a run-3 tester stayed on the answer frame and typed in «Напишете още един въпрос». «Ще го направя аз» on PBUTLERANSWER (proto D `614:59879` · M `614:59922`) leads to P11 (D `63:26500` · M `66:56163`; the filled form is `P11FILLED`, D `602:19244` · M `602:20111`). (b) The Mobile primary of PBUTLERNOFACT «Попълнете запитването с въпроса ми» now fills the row and wraps (design `614:59263`, prototype `614:59993`); it overflowed its 310 px row by 43 px. (c) Seen in the run-6 walk: PBUTLER carries the suggested-question chip «Има ли асансьор до етажа?» wired straight to PBUTLERNOFACT (proto D `I619:74770;6:132` · M `I619:74776;6:132`), so a **valid shorter route** is P05 «Попитайте Butler» → chip → «Попълнете запитването с въпроса ми» (D `614:59957` · M `614:59993` → P11FILLED) → «Изпратете запитването» (4 actions). Wired routes: typed question or other chips → PBUTLERANSWER → its «Изпратете въпроса» (D `614:59878` · M `614:59921`) → PBUTLERNOFACT. Pre-registered judging (run 6): PASS when the tester ends on the filled form or the receipt (through «Попълнете запитването с въпроса ми» or «Ще го направя аз» → the form), says Butler did not know the elevator answer and that the visitor sends the first message to a broker; FAIL when the question stays in the Butler panel (typing in «Напишете още един въпрос» as the last step), when the tester says Butler sent it, or invents an elevator answer. Expected actions 5 (4 by the chip); median limit 6.

**Run 7 (fix round 7; key updated before the run-7 tester runs):** on the answer frame PBUTLERANSWER the manual route **«Ще го направя аз»** is a bordered Secondary button (design D `I614:59073;6:6` · M `I614:59146;6:6`; prototype D `614:59879` · M `614:59922` → P11, unchanged), next to the field and «Изпратете въпроса»; it was a text button under the field, and both Haiku runs of run 6 took the frame for the panel and typed in «Напишете още един въпрос». The lead sentence naming «Ще го направя аз» (D `614:59076` · M `614:59149`), the chip route, the typed route and the end frames are unchanged; the request code «7K3M9Q» replaces the number 024 on the receipt P12COMMITTED. Path, expected actions (5; 4 by the chip) and limit (6) unchanged. Pre-registered judging (run 7): unchanged from run 6; PASS when the tester ends on the filled form or the receipt (through «Попълнете запитването с въпроса ми» or «Ще го направя аз» → the form), says Butler did not know the elevator answer and that the visitor sends the first message to a broker; FAIL when the question stays in the Butler panel (typing in «Напишете още един въпрос» as the last step), when the tester says Butler sent it, or invents an elevator answer.

### W03-T17 · Staff: open Butler on an inquiry and see what it would do before it acts

**Goal (testers):** You are a broker at the agency and you have opened a new question from a client. You would like the app's built-in assistant to help with the reply, but before you let it do anything you want to know exactly what it would do. Find that out. Then say whether you can do the reply yourself instead, and how.

**Start frame:** `O03 / Разговор с Алекс` — Desktop `18:732` · Mobile `16:463` (prototype D `63:12514` · M `66:45509`)

| # | From frame | Action | Control (D proto · M proto) | To frame (Desktop · Mobile) |
|---|---|---|---|---|
| 1 | `O03` | tap the rail item «Butler» (Mobile: none; the panel is reachable from @INDEX_STAFF only) | D `63:12565` | `XBUTLERPANEL` D design `614:58477` (proto `614:68227`) · M design `614:58731` (proto `614:70264`) |
| 2 | `XBUTLERPANEL` | tap «Ще го направя аз» | D `614:68476` · M `614:70444` (BACK) | back to `O03` |

**Expected actions:** 2 on Desktop and, since run 4, 2 on Mobile. Median pass limit: 3. **Run 4 (G-19):** every Butler entry on the inquiry screen now opens the preview, not the draft: the rail item «Butler» (D `63:12565`), the in-page button «Подгответе чернова с Butler» (D `63:12642` · M `66:45573`; renamed «Go / XBUTLERPANEL / UI04 / Button») and the new Mobile context-bar entry «Butler» (M `618:73458`; design `618:73451`), all → `XBUTLERPANEL` (D `614:68227` · M `614:70264`). The panel's «Подгответе черновата» (D `614:68469` · M `614:70437`) now goes to the working state `XBUTLERWORKING` (design D `619:74783` · M `619:75041`, prototype D `619:75671` · M `619:76187`: «Какво прави Butler сега», «Butler работи», progress «Butler чете запитването на Алекс и обява №202…», «Нищо не е изпратено. Черновата ще видите, преди да я изпратите.», «Спрете» → BACK, «Ще го направя аз» → BACK, after 3 s → O32). The blocked state `XBUTLERBLOCKED` (D `619:75230` · M `619:75485`) is drawn and reached only from nothing (reference for G3).

**Success criterion:** the tester opens Butler, reads «Какво ще направи Butler, преди да започне»: «1. Прочита запитването на Алекс и одобрените данни за обява №202.», «2. Пише чернова на отговора на български.», «3. Не изпраща нищо. Вие преглеждате черновата и я изпращате.» (D `614:58714` … `614:58716` · M `614:58899` … `614:58901`), sees the verdict «Чака Вашето одобрение» (D `I614:58717;6:185`) and the limit «Butler не изпраща, не публикува и не променя цени или условия. Всяка стъпка оставя запис.» (D `614:58730`), and says that the reply can be done by hand with «Ще го направя аз» (D `I614:58728;6:6`), which returns to the same screen. Fail: the tester opens the draft screen O32 and calls it the preview, accepts the inquiry first, or says Butler sends the reply.

**Required states:** preview before acting (present), manual path (present). **Not drawn:** Butler working with a Stop, an error or offline state of the staff panel. Shortcut annotation: «⌘ J (Mac) · Ctrl + J (Windows, Linux)» (`614:58916`).

**Run 4 judging (pre-registered):** the expected path is two actions (open the panel through any of the three entries, then «Ще го направя аз»). PASS when the RESULT names what Butler will do first (reads the inquiry and the approved listing data, writes a draft in Bulgarian, sends nothing; the broker reviews and sends), says the reply can be written by hand through «Ще го направя аз» (back to the same screen), and claims nothing was sent, in at most 3 actions. A tester who also taps «Подгответе черновата» and watches the working state (with «Спрете») is one extra action, not a failure by itself; the RESULT must still describe the plan and the manual path and must not say Butler sent anything. FAIL: STUCK; accepts the inquiry first; calls the draft screen O32 the preview or says Butler sends the reply; or no manual path.

**Run 5 (G-26, fix round 4):** a single Butler destination. Every staff «Butler» entry opens `XBUTLERPANEL`: the 160 Desktop rail items «Go / XBUTLERPANEL / Butler» on page 12 and the 117 Mobile header items on page 13 (the 56 + 15 items that opened the legacy picker, including O06 `63:15498` and O06R `63:15600`, are re-pointed; names changed from «Go / XBUTLER / Butler»), and the in-page buttons of O15 «Поискайте предложение от Butler» and O19R «Поискайте чернова от Butler». The old picker `XBUTLER` (`63:30796` · `66:60456`) is kept with the note «[annotation] Butler task picker · second step only» (`623:113021` · `623:113023`) and is not an entry. On O03 the in-page button «Подгответе чернова с Butler» is now the third action of the lead row (D `63:12642` · M `66:45573`), directly under the lead sentence; the rail item is D `63:12565`, the Mobile header entry M `618:73458`; all three → `XBUTLERPANEL` (D `614:68227` · M `614:70264`). The panel's «Ще го направя аз» (D `614:68476` · M `614:70444`) → BACK, as before. New staff panel state `XBUTLEROFFLINE` (D `623:113057` · M `623:113315`, prototype D `623:113504` · M `623:113765`; retry → `XBUTLERWORKING`; reference frame for G3 item 6, no tester sees it). Run 5 judging as in run 4 (pre-registered above): the new lead row sits next to the two other O03 actions, so a tester who taps «Поемете или назначете» first still fails.

## Run 4 changes (W03 fix round 3) and run-4 prototype walk

Version «W03 fix 3 done» (id 2406992753235358250). Log: `design/acceptance/w03-fix-3-log.md`; contract: `design/contracts/w03-p12.md`. Node ids Desktop · Mobile, design frames unless a prototype copy is named; the earlier frames kept their ids.

| Frame | Design D · M | Proto D · M | Used by |
|---|---|---|---|
| P12U (new heading, alert under it, reason line) and P12UCHECK (new heading) | `22:1666` · `24:2203`; `66:34211` · `66:34251` | `63:26892` · `66:56337`; `66:36421` · `66:56361` | T5 |
| P12UNKNOWN status row «Не можем да проверим дали обявата е активна» | `618:73385` · `618:73391` | `618:73397` · `618:73403` | T14c |
| Non-link saved titles in muted, regular, no underline (P12NONAME, P12INACTIVE, P12UNKNOWN, P12MULTI №200 and №912) | `613:55443` · `613:55514`, `613:55594` · `613:55666`, `613:55747` · `613:55818` | `613:55991` … `613:56318` | T14b, T14c, T14d |
| O03 next step «Следваща стъпка по запитването · Проверка на наличността»; «Към задачите» | `18:876` · `16:539`; `18:889` · `16:553` | `63:12630` · `66:45560`; `63:12635` · `66:45566` | T9 |
| O03ACCSEND · accept sending | `614:60438` · `614:60574` | `621:78970` · `621:82756` | T7 (automatic) |
| O03ACCCONFLICT, O03ACCOFFLINE, O03ACCUNKNOWN | `614:60641`, `614:60822`, `614:61003` · `614:60766`, `614:60947`, `614:61140` | `621:79067` … `621:82870` | G3 items 3, 6, 7 |
| XBUTLERWORKING · Butler works, with «Спрете» | `619:74783` · `619:75041` | `619:75671` · `619:76187` | T17, G3 item 3 |
| XBUTLERBLOCKED · Butler could not prepare the draft | `619:75230` · `619:75485` | `619:75932` · `619:76379` | G3 item 6 |
| PBUTLERWORKING · public Butler works, with «Спрете» | `618:74582` · `618:74622` | `618:74662` · `618:74705` | G3 items 1, 3 |
| O23HRDREASON, O23HPCREASON (empty required reason, error summary, enabled primary) | `619:76577` · `619:76767`, `619:76895` · `619:77085` | `621:81070` …, `621:81218` … | G3 item 6 |
| Mobile context-bar entry «Butler» on 152 Mobile staff frames | e.g. O03 M `618:73451` | `618:73458` | T17 Mobile |

Run-4 batches (tester folders `s01.png` …, start screen first, the rest shuffled, Desktop and Mobile at scale 1): VD and VM (10, T5, unchanged set), VR (6 each, T14b to T14d, unchanged set), SD (20, T7 and T9: the run-3 set with `O04-default` replaced by `O03-accept-sending`), SX (15, T17: the run-3 set plus `XBUTLERWORKING`).

Run-4 walk (reactions read from the file for these controls, all reach the expected end frame; the Mobile T17 route has an entry now):

| Task | Walk (control node D · M) | End frame D · M |
|---|---|---|
| T5 | P12U «Проверете същата заявка» `66:36418` · `66:56358` → P12UCHECK; «Свържете се по друг начин» `66:36419` · `66:56359` → P20 | `66:36421` · `66:56361` |
| T7 | O02NEW «Поемете запитването» `602:19843` · `602:20578` → O03ACCEPT; field `602:19958` · `602:20624` → O03ACCEPTREADY; «Поемете запитването» `602:20083` · `602:20681` → O03ACCSEND → after 1.5 s → O03ACCEPTED | `614:68002` · `614:70108` |
| T9 | O03 «Свържете или създайте сделка» `63:12633` · `66:45564` → O03L; «Запишете свързването» `63:12940` · `66:45671` → O03LR | `63:12943` · `66:45674` |
| T14b | P12INACTIVE «Вижте подобни имоти» `613:56114` · `613:56181` → P22; «Разгледайте още имоти» `613:56133` · `613:56200` → P02 | `63:28176` · `66:57861` |
| T14c | P12UNKNOWN «Потърсете имот № 202» `613:56254` · `613:56320` → P02; the №202 card on P02 (`66:36267` · `66:55200`) → P05 | `63:26089` · `66:55737` |
| T14d | P12NONAME «Вижте имота» `613:55993` · `613:56005` → P05 | `63:26089` · `66:55737` |
| T17 | O03 rail «Butler» `63:12565`, in-page «Подгответе чернова с Butler» `63:12642` · `66:45573`, Mobile header «Butler» `618:73458` → XBUTLERPANEL; «Ще го направя аз» `614:68476` · `614:70444` → BACK (O03); optional «Подгответе черновата» `614:68469` · `614:70437` → XBUTLERWORKING; «Спрете» `619:75883` · `619:76333` → BACK; after 3 s → O32 | `614:68227` · `614:70264` |

Found in the run-4 walk (details in `W03-gate-result.md`, «Run 4 · defects»): the public working state's «Ще го направя аз» (D `I618:74692;6:9` · M `I618:74735;6:9`, named «Go / P11») has no reaction; the rail «Butler» of 56 Desktop and the header «Butler» of 15 Mobile frames (including O06 `63:15498` and O06R `63:15600` of this journey) still go to the legacy task picker `XBUTLER` (`63:30796` · `66:60456`), not to `XBUTLERPANEL`.

## Run 5 changes (W03 fix round 4) and run-5 prototype walk

Version «W03 fix 4 done» (id 2407015645399752413). Log: `design/acceptance/w03-fix-4-log.md`; contract: `design/contracts/w03-p12.md`. The plugin API cannot read a version id; the match was checked by content (P12UCHECK result block, P12UNKNOWN button «Проверете дали обявата още е активна» → P05, O03 «Lead actions» row, O03 and accept-family field «Проверка на наличността», rail «Butler» → XBUTLERPANEL on O03). Node ids Desktop · Mobile, design frames unless a prototype copy is named; the earlier frames kept their ids.

| Frame | Design D · M | Proto D · M | Used by |
|---|---|---|---|
| P12UCHECK result block «Check result» (G-01) | block `66:34229` · `66:34269` (frames `66:34211` · `66:34251`; Hebrew `614:71341`) | `66:36440` · `66:56380` | T5 |
| P12UNKNOWN button «Проверете дали обявата още е активна» → P05 (G-03) | `613:55749` · `613:55820` (frames `613:55676` · `613:55756`) | `613:56254` · `613:56320` | T14c |
| O03 «Lead actions» (G-31): «Поемете или назначете», «Свържете със сделката на Алекс», «Подгответе чернова с Butler» | `18:857` · `16:519` (frames `18:732` · `16:463`) | `63:12619` · `66:45548` (buttons `63:12620` · `66:45549`, `63:12633` · `66:45564`, `63:12642` · `66:45573`) | T9, T17 |
| O03 accept family, field «Следваща стъпка» = «Проверка на наличността» (G-27) | `602:18881` · `602:19008`, `602:19066` · `602:19189`, `614:60438` · `614:60574`, conflict, offline, unknown | `621:78970` · `621:82756` … | T7 |
| Single Butler destination (G-26): rail and header items → XBUTLERPANEL | 160 Desktop and 117 Mobile prototype items | `614:68227` · `614:70264` | T17, G3 item 1 |
| XBUTLEROFFLINE (G-28) | `623:113057` · `623:113315` | `623:113504` · `623:113765` | G3 item 6 (reference) |
| PBUTLERWORKING «Ще го направя аз» → P11 (G-30) | `618:74582` · `618:74622` | `618:74692;6:9` · `618:74735;6:9` (ON_CLICK → `63:26500` · `66:56163`) | G3 item 1 |
| PBUTLERWORKING HE RTL (G-29) | `623:113965` (Mobile) | `623:114036` and `623:114111` (Mobile) | G3 items 3, 8 |

Run-5 tester batches (neutral folders, start screen first, the rest shuffled with a fixed seed; Desktop and Mobile at scale 1): VD and VM (10, T5), VR (6 each, T14c), SD (20, T7 and T9: the run-4 set), SX (15, T17: the run-4 set).

Run-5 walk (reactions read from the file; every path reaches the expected end frame):

| Task | Walk (control node D · M) | End frame D · M |
|---|---|---|
| T5 | P12U «Проверете същата заявка» `66:36418` · `66:56358` → P12UCHECK (result block «Резултат от проверката: още не е потвърдено») | `66:36421` · `66:56361` |
| T7 | O02NEW «Поемете запитването» `602:19843` · `602:20578` → O03ACCEPT; field `602:19958` · `602:20624` → O03ACCEPTREADY; «Поемете запитването» `602:20083` · `602:20681` → O03ACCSEND → after 1.5 s → O03ACCEPTED | `614:68002` · `614:70108` |
| T9 | O03 «Свържете със сделката на Алекс» `63:12633` · `66:45564` → O03L; «Запишете свързването» `63:12940` · `66:45671` → O03LR | `63:12943` · `66:45674` |
| T14c | P12UNKNOWN «Проверете дали обявата още е активна» `613:56254` · `613:56320` → P05 (the listing detail route; P12MULTI №912 `613:56056` · `613:56083` → P05 as well) | `63:26089` · `66:55737` |
| T17 | O03 rail «Butler» `63:12565`, in-page «Подгответе чернова с Butler» `63:12642` · `66:45573`, Mobile header «Butler» `618:73458` → XBUTLERPANEL; «Ще го направя аз» `614:68476` · `614:70444` → BACK (O03); optional «Подгответе черновата» `614:68469` · `614:70437` → XBUTLERWORKING | `614:68227` · `614:70264` |

## Run 6 changes (W03 fix rounds 5 and 6, code parity) and run-6 prototype walk

Versions «W03 fix 5 done», «P12UCHECK call + no-session», «checkCode on P12U, P12UCHECK, P12UNOSESSION» and «W03 fix 6 done» (id 2407020704892891115). Logs: `design/acceptance/w03-fix-4-log.md` (sections «Fix 5» and «Code parity…»), `design/acceptance/w03-fix-6-log.md`; contract: `design/contracts/w03-p12.md`. The plugin API cannot read a version id; the match was checked by content (P12UCHECK «Код на заявката: 7K3M9Q» and the call primary, P12UNKNOWN title link, O03L title, O03LR primary «Към запитването на Алекс», O03ACCSEND heading, O23H next-step line, O23HD and O23HRD headings, PBUTLERANSWER lead). **The key was updated before any run-6 tester run** (T5 success criterion without the number 024; T14c title link and removal of the plain-title fail clause for P12UNKNOWN; the fix-6 path changes under T7, T9, T10, T13b and T16b). Node ids Desktop · Mobile, design frames unless a prototype copy is named; the earlier frames kept their ids.

| Frame | Design D · M | Proto D · M | Used by |
|---|---|---|---|
| P12UCHECK: heading, result block, code «7K3M9Q», primary «Обадете ни се: +359 879 696 870» (→ P20), secondary «Проверете отново» (→ P12U) | `66:34211` · `66:34251`; call `I115:4825;6:3` · `I115:4828;6:3`; again `I66:34249;6:6` · `I66:34289;6:6`; code `623:113046` · `623:113048` | `66:36421` · `66:56361`; call `125:9610` · `129:3518`; again `66:36455` · `66:56395` | T5 |
| P12U: heading, alert with the code (the older line «…кажете номер 024» is still there) | `22:1666` · `24:2203` | `63:26892` · `66:56337` | T5 start |
| P12UNOSESSION (server-side variant, no prototype copy) | `623:114235` · `623:114282` | — | G2, G3 item 7 (reference) |
| P12UNKNOWN: saved title is a link to P05 | title `613:55747` · `613:55818` (frames `613:55676` · `613:55756`) | `613:56252` · `613:56318` | T14c |
| O03L titled «Свързване със сделката на Алекс» | `20:1055` · `25:2228` (title `20:1139` · `25:2241`) | `63:12845` · `66:45642` (title `63:12927` · `66:45656`) | T9 |
| O03LR: Primary «Към запитването на Алекс» (→ O03), Secondary «Към сделката» (→ O05) | `20:1175` · `25:2279` (buttons `20:1284` · `25:2317`; `20:1286` · `25:2319`) | `63:12943` · `66:45674` (buttons `63:13044` · `66:45707`; `63:13045` · `66:45708`) | T9 end |
| O03ACCSEND heading «Записваме поемането…» | `614:60438` · `614:60574` (heading `614:60517` · `614:60585`) | `621:78970` · `621:82756` (heading `621:79049` · `621:82774`) | T7 (automatic) |
| PBUTLERANSWER lead names «Ще го направя аз»; PBUTLERNOFACT Mobile primary fills the row | `614:59055` · `614:59128` (lead `614:59076` · `614:59149`); `614:59201` · `614:59246` (primary `614:59263`) | `614:59839` · `614:59882` (lead `614:59855` · `614:59898`); `614:59925` · `614:59961` (primary `614:59957` · `614:59993`) | T16b |
| O23H next-step line; O23HD heading «Никол прие предаването» | O23H `21:788` · `25:2760` (line `623:114231` · `623:114233`); O23HD `21:1108` · `25:2942` (heading `21:1192` · `25:2955`) | O23H `63:21162` · `66:51858` (line `623:114232` · `623:114234`); O23HD `63:21301` · `66:51931` (heading `63:21383` · `66:51945`) | T10 |
| O23HRD family titled «Откажете предаването от Мария Д.» | `606:46469` · `606:46634` (title `606:46548` · `606:46645`) | `606:49448` · `606:49593` (title `606:49527` · `606:49604`) | T13b (fail path) |

Run-6 tester batches (neutral folders, start screen first, the rest shuffled with a fixed seed; Desktop and Mobile at scale 1): VD and VM (10, T5: the run-5 set), VR (6 each, T14c: the run-5 set), SD (20, T7 and T9: the run-5 set), VB (13 each, T16b: the run-3 set), HS (20 each, T10 and T13b: the run-3 set). Only the tasks touched by fix rounds 5 and 6 are re-run (T5, T14c, T9, T7, T16b, T10, T13b, 14 runs per tier); the other tasks keep their latest verdicts.

Run-6 walk (reactions read from the file; every path reaches the expected end frame):

| Task | Walk (control node D · M) | End frame D · M |
|---|---|---|
| T5 | P12U «Проверете същата заявка» `66:36418` · `66:56358` → P12UCHECK; optional «Обадете ни се: +359 879 696 870» `125:9610` · `129:3518` → P20; optional «Проверете отново» `66:36455` · `66:56395` → P12U | `66:36421` · `66:56361` |
| T14c | P12UNKNOWN «Проверете дали обявата още е активна» `613:56254` · `613:56320` → P05, or the saved title `613:56252` · `613:56318` → P05 | `63:26089` · `66:55737` |
| T9 | O03 «Свържете със сделката на Алекс» `63:12633` · `66:45564` → O03L; «Запишете свързването» `63:12940` · `66:45671` → O03LR; optional «Към запитването на Алекс» `63:13044` · `66:45707` → O03 | `63:12943` · `66:45674` |
| T7 | O02NEW «Поемете запитването» `602:19843` · `602:20578` → O03ACCEPT; field `602:19958` · `602:20624` → O03ACCEPTREADY; «Поемете запитването» `602:20083` · `602:20681` → O03ACCSEND → after 1.5 s → O03ACCEPTED | `614:68002` · `614:70108` |
| T16b | P05 «Попитайте Butler» `614:59763` · `614:59770` → PBUTLER; chip «Има ли асансьор до етажа?» `I619:74770;6:132` · `I619:74776;6:132` → PBUTLERNOFACT (or a typed question → «Изпратете въпроса» `614:59804` · `614:59835` → PBUTLERWORKING → after 3 s → PBUTLERANSWER, whose «Изпратете въпроса» `614:59878` · `614:59921` → PBUTLERNOFACT; the prototype always answers a typed question with the price answer); «Попълнете запитването с въпроса ми» `614:59957` · `614:59993` → P11FILLED; «Изпратете запитването» `602:19273` · `602:20146` → P11SENDING → P12COMMITTED. Manual path: «Ще го направя аз» `614:59879` · `614:59922` / `614:59958` · `614:59994` → P11 | `602:19667` · `602:20499` (P12COMMITTED) |
| T10 | O23 «Предайте отворената работа» `63:21010` · `66:51774` → O23H; «Предложете предаване» `63:21298` · `66:51928` → O23HSEND → after the timeout → O23HP | `63:21610` · `66:52004` |
| T13b | O23HP «Оттеглете предложението» `606:48750` · `606:48754` → O23HPC; «Оттеглете предложението» `614:67282` · `614:69596` → O23HPCSEND → O23HPX | `606:50534` · `606:50711` |

## Run 7 changes (W03 fix 7) and run-7 prototype walk

Versions «Before W03 fix 7» and «W03 fix 7 done». Log: `design/acceptance/w03-fix-6-log.md`, section «Fix 7». The plugin API cannot read a version id; the match was checked by content on the file: P12UCHECK heading «Проверката приключи: няма потвърждение» (D `66:34223` · M `66:34263`, proto `66:36434`) and result line «Не можем да потвърдим, че запитването е получено.» (D `66:34237` · M `66:34277`, proto `66:36448`); «Код на заявката: 7K3M9Q» on P11 sending (`I598:17880;6:401` · `I602:18300;6:401`), P11 offline (`598:18003` · `602:18422`), P12 committed (`602:18484` · `602:18537`), P12U (`I22:1684;6:408`) and P12UCHECK (`623:113046`), and «קוד הפנייה: ⁦7K3M9Q⁩» on the Hebrew receipt (`613:55845`); «Ще го направя аз» on PBUTLERANSWER is an Instance with one stroke (D `I614:59073;6:6` · M `I614:59146;6:6`); «Избрахте: 6 октомври 2026 · 10:00 · Europe/Sofia» in the O03 accept «ready» input (`I602:19152;6:61` · `I602:19208;6:61`); O23HP «Оттеглете предложението» and «Вижте какво получава Никол» are Instances with one stroke (`I606:48742;6:6` · `I606:48746;6:6`, `I606:48744;6:6` · `I606:48748;6:6`); O23H «Назад» replaces «Откажи» (`I21:946;6:6` · `I25:2849;6:6`). A file-wide text search finds no «024», no «Откажи» button and no Hebrew «מספר מעקב» next to a number in any W03 frame; the generic label «Номер за проверка» and other numbers (030, 0209, 0217, 0311, 0312, 0313) belong to other journeys (P23, C10, O16, O25, O28), and the Hebrew P12MULTI (a frame in no tester batch) still says «שמרו את מספר המעקב» (a noun, no number). **The key was updated before any run-7 tester run** (T2 and the scenario line: request code; T5, T6, T7, T13b and T16b: run-7 paragraphs and pre-registered judging).

| Frame | Design D · M | Proto D · M | Used by |
|---|---|---|---|
| P12UCHECK: heading «Проверката приключи: няма потвърждение», result line «Не можем да потвърдим, че запитването е получено.», code «7K3M9Q», primary call, secondary «Проверете отново» | `66:34211` · `66:34251` (heading `66:34223` · `66:34263`, line `66:34237` · `66:34277`) | `66:36421` · `66:56361` (heading `66:36434` · `66:56374`, line `66:36448` · `66:56388`) | T5 end |
| P12U (start; its leftover line now says «кажете код 7K3M9Q») | `22:1666` · `24:2203` (line `614:56673` · `614:56674`) | `63:26892` · `66:56337` | T5 start |
| P11 sending, P11 offline, P12 committed: the code «7K3M9Q» | `598:17787` · `602:18214`; `598:17973` · `602:18386`; `602:18463` · `602:18519` | `602:19409` · `602:20262`; `602:19582` · `602:20421`; `602:19667` · `602:20499` | T1, T2, T3, T4, T16b (receipt), T5 (distractors) |
| P12 · Saved name HE RTL: «קוד הפנייה: ⁦7K3M9Q⁩» | `613:55827` (line `613:55845`) | `613:56367` | T6 end |
| O03 accept family: «Избрахте: …» in the chosen-time field (ready, sending, conflict, offline, unknown) | ready `602:19066` · `602:19189` (field `I602:19152;6:61` · `I602:19208;6:61`); sending `614:60438` · `614:60574` | ready `602:19990` · `602:20654`; sending `621:78970` · `621:82756` | T7 |
| O23HP: «Оттеглете предложението» and «Вижте какво получава Никол» as bordered Secondary; O23H «Назад» (was «Откажи») | O23HP `21:948` · `25:2851`; O23H `21:788` · `25:2760` | O23HP `63:21610` · `66:52004`; O23H `63:21162` · `66:51858` | T13b (start), T10 (O23H) |
| PBUTLERANSWER: «Ще го направя аз» as bordered Secondary | `614:59055` · `614:59128` (button `I614:59073;6:6` · `I614:59146;6:6`) | `614:59839` · `614:59882` (button `614:59879` · `614:59922`) | T16b |

Run-7 tester batches (neutral folders, start screen first, the rest shuffled with the fixed seed 7000 + run number; Desktop and Mobile at scale 1; the same frame sets as the latest run of each task, so the batch composition rule is unchanged): VD and VM (10 each, T5: the run-5 and run-6 set), SD (20 each, T7: the run-5 and run-6 set), HS (20 each, T13b: the run-3 and run-6 set), VB (13 each, T16b: the run-3 and run-6 set), VH (13, T6: the run-3 Hebrew set). Only T5, T7, T13b, T16b and T6 are re-run (9 runs per tier); every other task keeps its latest verdict. The Hebrew twin of the check screen (P12UCHECK HE `614:71325`, a distractor in the T6 batch) keeps the run-5 wording («עדיין לא אושר שהפנייה התקבלה»; result «תוצאת הבדיקה: עדיין לא אושר») and was not given the fix-7 heading; it carries the code «7K3M9Q».

Run-7 walk (reactions read from the file; every path reaches the expected end frame, none changed since run 6):

| Task | Walk (control node D · M) | End frame D · M |
|---|---|---|
| T5 | P12U «Проверете същата заявка» `66:36418` · `66:56358` → P12UCHECK; optional «Обадете ни се: +359 879 696 870» `125:9610` · `129:3518` → P20; optional «Проверете отново» `66:36455` · `66:56395` → P12U | `66:36421` · `66:56361` |
| T7 | O02NEW «Поемете запитването» `602:19843` · `602:20578` → O03ACCEPT; field `602:19958` · `602:20624` → O03ACCEPTREADY; «Поемете запитването» `602:20083` · `602:20681` → O03ACCSEND → after 1.5 s → O03ACCEPTED | `614:68002` · `614:70108` |
| T13b | O23HP «Оттеглете предложението» `606:48750` · `606:48754` → O23HPC; «Оттеглете предложението» `614:67282` · `614:69596` → O23HPCSEND (`621:79910` · `621:83224`) → after 1.5 s → O23HPX | `606:50534` · `606:50711` |
| T16b | P05 «Попитайте Butler» `614:59763` · `614:59770` → PBUTLER; chip `I619:74770;6:132` · `I619:74776;6:132` → PBUTLERNOFACT, or a typed question → «Изпратете въпроса» `614:59804` · `614:59835` → PBUTLERWORKING (after 3 s → PBUTLERANSWER; its «Изпратете въпроса» `614:59878` · `614:59921` → PBUTLERNOFACT); «Попълнете запитването с въпроса ми» `614:59957` · `614:59993` → P11FILLED; «Изпратете запитването» `602:19273` · `602:20146` → P11SENDING → P12COMMITTED. Manual path: «Ще го направя аз» `614:59879` · `614:59922` / `614:59958` · `614:59994` → P11 | `602:19667` · `602:20499` |
| T6 | P11FILLED HE «שליחת הפנייה» `602:20926` → P11SENDINGHE (`614:72131`) → after 1.5 s → P12NAMEDHE | `613:56367` |

## Coverage — step × viewport × state → node id

Design frames. «—» means not required for that viewport; **missing** means required and absent.

| Step | State | Desktop 1440 | Mobile 390 | Hebrew RTL 390 |
|---|---|---|---|---|
| V1 Review intent, listing, contact route and language (P11) | default | `11:1469` | `11:8704` | `614:66712` |
| | filled | `597:2224` | `598:18057` | `602:18566` |
| | validation error | `598:17700` | `602:18134` | `614:66799` |
| V2 Send once, keep the reference (P11) | submitting | `598:17787` | `602:18214` | `614:66896` |
| | offline / retry | `598:17973` | `602:18386` | `614:67102` |
| V3 Result: committed (P12) | committed receipt, saved property public now (a) | `602:18463` | `602:18519` | `613:55827` (superseded `602:18638`) |
| | no saved name (c) | `613:55372` | `613:55452` | `614:71539` |
| | not public now (d) | `613:55523` | `613:55604` | `614:71390` |
| | availability unknown (e) | `613:55676` | `613:55756` | `614:71470` |
| | several properties, mixed (b) | `606:54028` | `606:54113` | **missing** |
| | viewing request receipt | `606:53901` | `606:53969` | **missing** |
| | generic receipt (no listing) | `11:1545` | `11:8773` | — |
| V4 Result: unknown (P12) | unknown outcome | `22:1666` | `24:2203` | `614:71270` |
| | check the same request | `66:34211` | `66:34251` | `614:71325` |
| V5 Result: rejected (P11) | rejected, values kept | `598:17886` | `602:18306` | `614:67005` |
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
| | receiver form, nothing entered (O23HRE) | `614:57627` | `614:57896` | — |
| | receiver accept sending / changed meanwhile / connection lost / unknown (O23HR) | `614:63548` · `614:64045` · `614:64506` · `614:64969` | `614:63831` · `614:64310` · `614:64772` · `614:65252` | — |
| | claim receipt (O03ACCEPTED) | `614:58096` | `614:58321` | — |
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
| | sender cancel with reason (O23HPC) | `614:56770` | `614:56949` | — |
| | choose a different receiver (O23HC) | `614:57059` | `614:57247` | — |
| | offered to the second receiver (O23HCP) | `614:57366` | `614:57531` | — |
| | revoke staff access | `327:15031` | `327:15174` | — |
| V6 Butler, visitor (PBUTLER) | first question | `614:58920` | `614:58987` | — |
| | answer with quoted facts | `614:59055` | `614:59128` | `614:71849` |
| | no data, hand-off to a broker | `614:59201` | `614:59246` | **missing** |
| | blocked | `614:59291` | `614:59333` | **missing** |
| | no connection | `614:59375` | `614:59422` | **missing** |
| S7 Butler, staff (XBUTLERPANEL) | what Butler will do, manual path | `614:58477` | `614:58731` | — |

Destination frames used by the receipt tasks (design D · M): P05 `11:1031` · `11:8334`, P02 `11:780` · `11:8107`, P22 `11:2217` · `12:734`, P20 `13:857` · `14:4151`, P07 `29:531` · `29:1085`.

Prototype copies — page 12 (Desktop): P11FILLED `602:19244`, P11INVALID `602:19323`, P11SENDING `602:19409`, P11REJECTED `602:19496`, P11OFFLINE `602:19582`, P12COMMITTED `602:19667`, O02NEW `602:19725`, O03ACCEPT `602:19870`, O03ACCEPTREADY `602:19990`, O03ASSIGNWAIT `605:24524`, O27SEPARATE `606:44481`, O23HR `606:48758`, O23HRA `606:49138`, O23HRD `606:49448`, O23HRDR `606:49672`, O23HRX `606:49960`, O23HPD `606:50246`, O23HPX `606:50534`, P12NONAME `606:54293`, P12MULTI `606:54487`, P12VIEW `606:54390`, P12INACTIVE `613:56087`, P12UNKNOWN `613:56228`. Page 13 (Mobile): P11FILLED `602:20111`, P11INVALID `602:20183`, P11SENDING `602:20262`, P11REJECTED `602:20342`, P11OFFLINE `602:20421`, P12COMMITTED `602:20499`, O02NEW `602:20548`, O03ACCEPT `602:20603`, O03ACCEPTREADY `602:20654`, O03ASSIGNWAIT `605:24651`, O27SEPARATE `606:44535`, O23HR `606:48981`, O23HRA `606:49326`, O23HRD `606:49593`, O23HRDR `606:49849`, O23HRX `606:50136`, O23HPD `606:50423`, O23HPX `606:50711`, P12NONAME `606:54343`, P12MULTI `606:54528`, P12VIEW `606:54440`, P12INACTIVE `613:56157`, P12UNKNOWN `613:56297`, P11FILLEDHE `602:20889`, P12NAMEDHE `613:56367` (the old `P12COMMITTEDHE` `602:20963` is no longer the end of the Hebrew flow). Flow starts: «Website · inquiry №202 · send and result», «Agency · new inquiry №202 · accept with review time», on Mobile «Website · inquiry №202 · Hebrew RTL»; the C1a sections «C1a · W03 · Резултати и предаване» (p12 `606:44377` · p13 `606:44378`) and «C1a · P12 · Запитване и Butler» (p12 `606:54291` · p13 `606:54292`) hold the new copies and the @INDEX entries.

## Prototype walk — expected paths through the reactions on pages 12 / 13

Re-walked after Phase C1a: for every task and viewport the start frame was opened, the control was found by its visible text among the visible ON_CLICK reaction-bearing nodes of that frame, and the destination was followed (including the 1.5 s AFTER_TIMEOUT of `P11SENDING`). Every tapped label in the key was compared with the current text of its control: 0 mismatches (the labels «Свържете или създайте сделка» and «Към сделката» replace the earlier «…случай» labels, same control ids). Run 3 re-walked T5 to T7 and T10 to T17 after the fix round (the reactions of all 432 Desktop and 446 Mobile prototype frames were re-read). **All paths below reach the expected end frame**, except the Mobile staff Butler route of T17 (no wired entry) and the typed no-data question of T16b (see its row). The entry fields of O23HR and O23HRD have no reaction (they are shown filled), and the primaries have an additional ON_HOVER state swap, which is not navigation.

| Task | Walk (control node D · M) | End frame D · M | Result |
|---|---|---|---|
| T1 | P11FILLED «Изпратете запитването» `602:19273` · `602:20146` → P11SENDING → after 1.5 s → P12COMMITTED | `602:19667` · `602:20499` | pass · pass |
| T2 | P11OFFLINE «Изпратете отново» `602:19612` · `602:20457` → P11SENDING → P12COMMITTED | `602:19667` · `602:20499` | pass · pass |
| T3 | P11REJECTED entry in the email field, «Изпратете поправеното запитване» `602:19526` · `602:20378` → P11SENDING → P12COMMITTED | `602:19667` · `602:20499` | pass · pass |
| T4 | P11INVALID entry in the contact field, «Изпратете запитването» `602:19353` · `602:20219` → P11SENDING → P12COMMITTED | `602:19667` · `602:20499` | pass · pass |
| T5 | P12U «Проверете същата заявка» `66:36418` · `66:56358` → P12UCHECK | `66:36421` · `66:56361` | pass · pass |
| T6 | Mobile only: P11FILLEDHE «שליחת הפנייה» `602:20926` → P11SENDINGHE `614:72131` → after 1.5 s → P12NAMEDHE | — · `613:56367` | — · pass |
| T7 | O02NEW «Поемете запитването» `602:19843` · `602:20578` → O03ACCEPT; field «Кога ще прегледате отново? *» `602:19958` · `602:20624` → O03ACCEPTREADY; «Поемете запитването» `602:20083` · `602:20681` → O03ACCEPTED (then «Свържете със сделка» `614:68130` · `614:70168` → O03L). The accept button of O03ACCEPT is disabled and has no reaction | `614:68002` · `614:70108` | pass · pass |
| T8 | O03 «Проверете за дубликат» `63:12621` · `66:45550` → O27; «Отложете за допълнителна проверка» `63:23481` · `66:53473` → O27PENDING. Alternatives: «Запазете като отделни контакти» `63:23482` · `66:53474` → O27SEPARATE → «Към запитването на Алекс» `606:44529` · `606:44583` → O03; «Отказ» `63:23483` · `66:53475` → O03 | `63:23486` · `66:53478` (O27SEPARATE `606:44481` · `606:44535`) | pass · pass |
| T9 | O03 «Свържете или създайте сделка» `63:12633` · `66:45564` → O03L; «Запишете свързването» `63:12940` · `66:45671` → O03LR (then «Към сделката» `63:13044` · `66:45707` → O05) | `63:12943` · `66:45674` | pass · pass |
| T10 | O23 «Предайте отворената работа» `63:21010` · `66:51774` → O23H; «Предложете предаване» `63:21298` · `66:51928` → O23HP (the shortcut to O23HD is gone; the primary «Към текущото заместване» `I21:1106;6:3` → O23) | `63:21610` · `66:52004` | pass · pass |
| T11 | O23HRE field «Вашата следваща стъпка *» `614:67892` · `614:69999` → O23HR; field «Кога ще прегледате отново? *» `614:67893` · `614:70000` → O23HR; O23HR «Приемете работата» `606:48921` · `606:49076` → O23HRSEND → after 1.5 s → O23HRA (then «Към моите задачи» `606:49266` · `606:49386` → O18). Alternatives: O23HRCONFLICT «Заредете предложението отново» → O23HRX; O23HROFFLINE «Опитайте отново» → O23HRSEND; O23HRUNKNOWN «Проверете същата заявка» → O23HRA | `606:49138` · `606:49326` | pass · pass |
| T12 | O23HRE «Откажете с причина» `614:67897` · `614:70004` → O23HRD; «Изпратете отказа» `606:49533` · `606:49610` → O23HRDR (then «Вижте какво вижда Мария Д.» `606:49790` · `606:49899` → O23HPD) | `606:49672` · `606:49849` | pass · pass |
| T13a | O23HPD «Предложете на друг колега» `606:50363` · `606:50472` → O23HC; «Предложете на Петър К.» `614:67510` · `614:69757` → O23HCP (then «Към текущото заместване» `614:67701` · `614:69879` → O23). «Назад» → O23HPD | `614:67566` · `614:69810` | pass · pass |
| T13b | O23HP «Оттеглете предложението» `606:48750` · `606:48754` → O23HPC; «Оттеглете предложението» `614:67282` · `614:69596` → O23HPX (then «Вижте какво вижда Никол» `606:50652` · `606:50761` → O23HRX); «Назад към предложението» → O23HP; O23HP «Вижте какво получава Никол» `606:48752` · `606:48756` → O23HRE | `606:50534` · `606:50711` | pass · pass |
| T14a | P12COMMITTED «Вижте имота» `613:55969` · `613:55981` → P05 | `63:26089` · `66:55737` | pass · pass |
| T14b | P12INACTIVE «Вижте подобни имоти» `613:56114` · `613:56181` → P22; primary «Разгледайте още имоти» `613:56133` → P02 | `63:28176` · `66:57861` | pass · pass |
| T14c | P12UNKNOWN «Потърсете имот № 202» `613:56254` · `613:56320` → P02 | `63:25688` · `66:55174` | pass · pass |
| T14d | P12NONAME «Вижте имота» `613:55993` · `613:56005` → P05 | `63:26089` · `66:55737` | pass · pass |
| T15 | P12MULTI «Вижте имота» `613:56041` · `613:56068` and the №202 title `613:56039` · `613:56066` → P05; «Вижте подобни имоти» `613:56049` · `613:56076` → P22; «Потърсете имот № 912» `613:56056` · `613:56083` → P02; «Към същото сравнение» `606:54515` · `606:54553` → P07 (ON_CLICK since run 3) | `63:26089` · `66:55737` | pass · pass |
| T16a | P05 «Попитайте Butler» `614:59763` · `614:59770` → PBUTLER; suggested question `614:59800` · `614:59831` or «Изпратете въпроса» `614:59804` · `614:59835` → PBUTLERANSWER | `614:59839` · `614:59882` | pass · pass |
| T16b | P05 → PBUTLER; «Изпратете въпроса» → PBUTLERANSWER (always, the prototype does not route by question); «Изпратете въпроса» `614:59878` · `614:59921` → PBUTLERNOFACT; «Попълнете запитването с въпроса ми» `614:59957` · `614:59993` → P11FILLED; «Изпратете запитването» → P11SENDING → P12COMMITTED. The judged logical path goes from the typed question straight to PBUTLERNOFACT | `602:19667` · `602:20499` | pass (one extra wired send) · pass |
| T17 | O03 rail «Butler» `63:12565` → XBUTLERPANEL; «Ще го направя аз» `614:68476` → BACK (O03). In-page «Подгответе чернова с Butler» `63:12642` · `66:45573` → O32, not the panel. Mobile: no wired entry to the panel from O03 | `614:68227` · none | pass · **no entry** |

Also checked: P05 «Изпратете запитване» `63:26138` · `66:55780` now leads to P11FILLED (it led to the generic P11 before; W01-T3 changes, see `design/zero-learning/keys/W01.md`); the Hebrew «שליחת הפנייה» leads to `613:56367`; O23HP carries four reaction-bearing buttons (the two older ones and the two new Quiet buttons); O23HRA and O23HRDR each carry «Към моите задачи» → O18 and a second control (to O23 or to O23HPD).

## Defects found in this re-check (recorded, not fixed here)

Status of the defects D-1 to D-8 of the previous key after Phase C1a, then the new defects K-1 to K-6 found while updating the key. The defects found by the testers and by the G2 / G3 / G4 reads are in `design/zero-learning/W03-gate-result.md`.

| # | Defect | Node ids | Status |
|---|---|---|---|
| D-1 | The Butler entry «Попитайте Butler» on public screens has no prototype reaction and no answer screen exists, so «what it will do» and «Ще го направя аз» cannot be shown (the string «Ще го направя аз» appears in no W03 frame) | public Butler instances on every P11 / P12 frame, for example D `I613:55408;6:17` (P12NONAME), `I605:24892;6:17` (P12 committed); not wired in run 2 | **closed for the public panel and the Desktop staff rail in run 3** (wired, preview, «Ще го направя аз»); the in-page buttons and Mobile staff remain open, see G-19 in `W03-gate-result.md` |
| D-2 | On O27, «Запазете като отделни контакти» and «Отказ» led to the deal list with no confirmation | D `63:23482` → `606:44481`, `63:23483` → `63:12514`; M `66:53474` → `606:44535`, `66:53475` → `66:45509` | **closed** (O27SEPARATE) |
| D-3 | After accepting (T7 step 3) the prototype lands on O03L; no «accepted» receipt frame exists | D `602:20083` → `63:12845`; M `602:20681` → `66:45642`; effect line D `602:19188` · M `602:19242` | **closed** in run 3 (O03ACCEPTED) |
| D-4 | Past dates in the scenario | O01, O03N, O05W, O05WR | **closed** (dates now 7–9 октомври; the scenario clock is 5 октомври) |
| D-5 | Model-field labels «Цел» and «Състояние» on O05 | D `I18:1003;6:59` · `I18:1016;6:59` | **closed** («Какво иска клиентът», «Работим ли по покупката?») |
| D-6 | No next-step line on O03L, O05W, O23HD, O23OFF | `606:44360` · `606:44361`, `606:44362` · `606:44363`, `606:44364` · `606:44365`, `606:44366` · `606:44367` | **closed** |
| D-7 | No Butler entry on P12U and P12UCHECK | D `606:44304` · `606:44311`; M `606:44318` · `606:44325` | **closed** |
| D-8 | GATE.md bg column lists «Случай» while audit §9 used it as the staff noun | 113 nodes | **closed** (owner pick «Сделка»; 0 nodes left, G2 scan below). `GATE.md` G2 row «Case object» already names the pick |
| K-1 | P12MULTI primary «Към същото сравнение» has only ON_HOVER, no click to P07 | D `606:54515` · M `606:54553` (instance `I606:54055;6:3`) | **closed in the public fix round (ON_CLICK → P07)** |
| K-2 | O23HR shows both required fields filled (next step «Обадете се на Алекс…», review «13 октомври 2026, 10:00»); there is no empty state with a disabled primary like O03 · Accept; the fields have no reaction | D `I606:45905;6:61` · `I606:45909;6:61`; M `I606:46082;6:61` · `I606:46086;6:61` | **closed in run 3 (O23HRE: empty fields, disabled primary, rule line)** |
| K-3 | O23HP (pending) keeps the primary «Вижте приетото предаване», which leads to the accepted state O23HD | D `I21:1104;6:3` → `63:21301`; M `I25:2938;6:3` → `66:51931` | **closed in run 3 (shortcut hidden; the primary is «Към текущото заместване»)** |
| K-4 | After «Предложете на друг колега» (O23HPD → O23H) the form still names «Получател · Никол» as a fixed row; no frame chooses a different colleague | D `I21:881;6:61` · M `I25:2783;6:61` | **closed in run 3 (O23HC, O23HCP)** |
| K-5 | The rail user of the receiver frames is «Никол · Брокер» while the team list says «Никол · Координатор» | D `606:45756` (O23HR), D `18:1254` (O23) | **closed in run 3 (all receiver frames read «Никол · Координатор»)** |
| K-6 | The listing page P05 and the search page P02 still show №202 as a live listing while P12INACTIVE says «Тази обява вече не е активна» (fixture contradiction inside one journey) | P05 D `11:1031`; P02 D `11:780` | **closed in run 3 (the receipt shows archived №242, on no live frame)** |

Still missing after run 3: the Hebrew P12MULTI, the Hebrew viewing-request receipt and the Hebrew Butler states «no data», «error», «offline»; the decline and withdraw forms with an empty reason; a running state of Butler with a Stop (public and staff); an error or offline state of the staff Butler panel; a Mobile entry to the staff Butler panel; a prototype branch from «Изпращаме…» to the rejected or unknown result (T3 and T5 start on those screens). New defects found by the testers and the re-reads are G-19 to G-25 in `W03-gate-result.md`.

## G2 check — W03 visible copy after Phase C1a

Re-run after Phase C1a over the 123 frames of the packet folder `run-2/frames` (every coverage-table frame, the new frames, and the destination frames P05, P02, P22, P20). Every text node was read through the plugin API with hidden layers skipped: 2,691 text nodes visible, 712 hidden (the replaced base content of the handover frames, the hidden DEMO markers and similar). Terms: the GATE.md G2 table in bg, en and ru, the owner starter list in `design/acceptance/g2-terms.md`, and the demo fragments of the Phase B1 re-scan. No W03 frame has a technical-details disclosure, so every hit would sit on a primary surface.

**Result on the letter of GATE.md: PASS, 0 hits.** Case object («Случай», «Преписка», `DEMO-CASE`, «дело», «кейс», «case»): 0 (it was 113 nodes before the rename to «Сделка / Сделки», which is allowed). Disposition, brief, coverage, engagement / mandate, lettered interest, operation / identifier, party candidate as the listed words, stage / state / purpose labels as fields, version labels, assumed states, technical jargon (worker, runtime, Payload, MFA, principal, `ai_service`, idempotency, digest, webhook, CSV, JSON, API), Hermes / Jev, prototype markers (DEMO, ДЕМО, «Демонстрационен», «прототип», «синтетичен», «примерни данни»): 0 in every group. The four earlier hits on O05 are gone («Цел» → «Какво иска клиентът», «Състояние» → «Работим ли по покупката?»). Public screens (P11, P12 and the variants, Hebrew included): 0 hits of any kind.

Reviewed and not counted: «…текущия безопасен статус на обявата…» in the O03 lead sentence (D `18:864` · M `16:526`), plain prose about the listing, not a «Статус» field.

**Advisory, outside the GATE list** (the «Judgement candidates» table of `g2-terms.md` and the technical-jargon row «MFA → потвърждение с втора стъпка»): 24 distinct strings, 53 nodes on 13 staff screens. Examples: «Кандидатът е проверен от човек» (O03L, D `I20:1153;6:61`; the party-candidate family, borderline), «Квалифициране и продължение» (O03, D `18:863`), «Създаване след квалифициране» (O03N, D `21:2483`), «Идентичност» (O03L, D `I20:1153;6:59`), «самоличност» (O03L `I20:1164;6:408`, O27 `I14:1677;6:408` · `I14:1689;6:185` · `I14:1701;6:99`, O23OFF `327:15163`), «Обхват» (O23H and the handover states `I21:886;6:59`, O23 `18:1233`, O05 `18:1086`, O02MINE `75:19649`), «Още няма назначен» (O03, D `I18:847;6:61`), «неавтентикирани» (O23, `18:1266`), «втори фактор» (O23, `18:1282`), «границата с доставчика» (O23, `18:1273` · `18:1283`), «упълномощеният ръководител» (O23HP, `I21:1097;6:408`), «Действащ акаунт», «активните сесии, ключовете за вход» (O23OFF, `327:15138` · `327:15157`), «общата опашка на екипа» (O02 new in queue, `I602:18822;6:401`). The time-zone name «Europe/Sofia» appears in 12 date lines (O03 accept ready `I602:19152;6:61`, O03N `I21:2506;6:61`, O05W `I20:439;6:61`, O27PENDING `52:5371`, O23HR `I606:45909;6:61` and their Mobile twins) and the test address «staff@example.test» on O23OFF (D `327:15141`).

Server-produced text: `design/copy/server-messages.md` section 6 (handover and inquiry receipts, bg · en · ru staff, seven locales public) was scanned for the same terms outside code spans: 0 hits; the only matches are the rule that forbids them.

**Run 3 re-run** (200 frames, 4,342 visible nodes, 1,506 hidden skipped; the run-2 set plus the Butler panels, the receiver and sender frames, the 40 command-state frames and 12 Hebrew frames): **0 hits on the letter of GATE.md** (the only regex match is again «…текущия безопасен статус на обявата…», D `18:864` · M `16:526`, prose and not a field). Advisory strings: 23 of the 24 run-2 strings are gone; left are «Europe/Sofia» (17 distinct date lines, 67 nodes, kept as the named zone) and «ключовете за вход» (O23OFF, D `327:15157` · M `327:15231`). Public frames, Hebrew included: 0 hits. Result in `W03-gate-result.md`, section «Run 3 · G2».

**Run 4 re-run** (94 distinct frames of the run-4 packet and the changed state frames, 2,269 visible text nodes, 402 hidden skipped): **0 hits on the letter of GATE.md**; the advisory «ключовете за вход» is gone (G-23 closed, O23OFF `327:15157` read directly); left are «Europe/Sofia» (6 distinct date lines, 38 nodes) and the placeholder addresses. Three prose strings with the word «версия» («Окончателното сливане е блокирано до потвърждение на точен запис, последствия, права и актуална версия.» O27, «Запазена работна версия» O01, «Текущата версия, аудиторията и следващото решение» O05) are not version labels and are not counted. Result in `W03-gate-result.md`, section «Run 4 · G2».

**Run 5 re-run** (195 frames: the 76 tester frames, the judge frames, 11 Hebrew Mobile frames, the Butler panel sets, O06, O06R, O15, O19R and the O07 states; 4,582 visible text nodes, 2,214 hidden skipped): 0 hits on the 76 tester frames; **1 string, 2 nodes** elsewhere: «Отделна страна: наемодател» on O06R (D `21:1986` · M `28:2536`, party family, G-32). The value «Отговор за асансьора и оглед» is gone (G-27). Left: «Europe/Sofia» (21 distinct date lines) and placeholder addresses. Result in `W03-gate-result.md`, section «Run 5 · G2».

Locale coverage: the frames are Bulgarian (Hebrew for two public frames in run 2, 13 in run 3). English, Russian, German, Dutch and Greek wording is only in the copy deck, not in frames; those locales are not scanned at frame level.

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

**Run 3 re-run of items 1, 3, 6, 7, 8, 9 (still FAIL, all improved):** item 1, the public panel (5 states, wired from all 32 Bulgarian entries) and the Desktop staff rail (`XBUTLERPANEL` on 112 prototype frames, shortcut annotated `614:58916`) pass; the in-page staff buttons lead to the draft O32 and Mobile has no entry (T17 fails 4 of 4, G-19). Item 3, the five command families have sending frames; Butler has no working state with a Stop (G-20). Item 6, conflict, offline and unknown frames exist for the five families and the public panel; the empty required reason of the decline and withdraw forms is not drawn (G-22). Item 7, T5 Desktop and T14c still fail (G-01, G-03). Item 8, 13 Hebrew frames; Hebrew P12MULTI, P12VIEW and three Butler states are missing (G-21). Item 9, 105 focus-order annotations, 4,342 text nodes at AA or better, 569 targets of at least 24 × 24 px; the proof stays with the PR preview (G-15). Check A: 85 of 90 new or changed frames carry a layer named «Next step», the other 5 carry the line in another form; check B: pass. Details: `W03-gate-result.md`, section «Run 3 · G3».

**Run 4 re-check of items 1, 3, 6, 7, 8 on the changed frames:** item 1 FAIL (partial): the W03 inquiry frames, O02, O04, O05, O18 and O23 lead every Butler entry (rail, Mobile header, in-page buttons) to the preview and T17 reaches it in 3 of 4 runs, but O06 and O06R and 54 other Desktop and 15 Mobile frames still open the legacy picker `XBUTLER` (G-26) and the public working state's manual-path button has no reaction (G-30); item 3 PASS (both panels have a working state with progress, «Нищо не е изпратено» and one Stop; the accept command has a sending state); item 6 FAIL (partial, narrowed to one undrawn state): the blocked state, the empty-reason errors and the server errors are drawn, the staff panel still has no offline state (G-28; run 3 counted the missing state, so it stays counted); item 7 FAIL (G-01 and G-03 still produce success or «open» readings); item 8 FAIL (partial): no Hebrew working state (G-29). Items 9 and 10 stay with the PR preview.

**Run 5 re-check of items 1, 6, 7, 8 on the changed frames:** item 1 PASS at the Figma stage (160 Desktop rail and 117 Mobile header items and the 10 in-page staff buttons → `XBUTLERPANEL`; the public working state's manual path → P11; shortcut and five locales stay with the preview); item 6 PASS (XBUTLEROFFLINE drawn and wired, Hebrew working state and its retry paths); item 7 FAIL (T5 Desktop fails in both tiers, G-01); item 8 PASS (all states at 390, Hebrew working state, no phone-specific failure). Items 9 and 10 stay with the PR preview. Details: `W03-gate-result.md`, section «Run 5 · G3».

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
| `P12-unknown` | lead sentence | «Не изпращайте отново. Проверете същата заявка: проверката не създава второ запитване.» (run 7; read from the file) | `22:1683` · `24:2220` |
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
| `O23-receive-time-required` | lead sentence | «Приемете работата и запишете своята следваща стъпка и кога ще прегледате. Ако не можете, откажете с причина.» | `614:57707` · `614:57908` |
| `O23-sender-cancel-reason` | lead sentence | «Напишете защо оттегляте и потвърдете. Работата остава при вас.» | `614:56850` · `614:56961` |
| `O23-sender-choose-receiver` | lead sentence | «Изберете колега, който е на работа, и изпратете предложението. Работата остава при вас, докато някой приеме.» | `614:57217` · `614:57336` |
| `O23-sender-offered-other` | lead sentence | «Изчакайте отговора на Петър К. Работата остава при вас, докато той приеме.» | `614:57527` · `614:57623` |
| `O03-accepted` | lead sentence | «Свържете запитването със сделка или подгответе отговор. Клиентът не е уведомен.» | `614:58176` · `614:58333` |
| `O23-receive-accept-SEND` · `-CONFLICT` · `-OFFLINE` · `-UNKNOWN` | lead sentence | «Изчакайте няколко секунди, докато запишем приемането. Не натискайте отново.» · «Заредете предложението отново, за да видите какво е сега…» · «Свържете се с интернет и опитайте отново. Стъпката и часът са запазени.» · «Не приемайте отново. Проверете същата заявка.» | `614:63628`, `614:64125`, `614:64586`, `614:65049` (Mobile `614:63843`, `614:64322`, `614:64784`, `614:65264`) |
| `X-Butler-panel` (staff) | sentence in the panel | «Butler може само да подготви черновата. Изпращането до Алекс одобрявате вие.» | `614:58719` · `614:58904` |
| `PBUTLER` · `-answer` · `-nofact` · `-error` · `-offline` (public) | lead sentence | «Напишете въпроса си или изберете готов въпрос.» · «Попитайте още нещо. За оглед или наличност пишете на брокер.» · «Позволете на Butler да попълни запитването или го напишете сами.» · «Опитайте отново или потърсете отговора сами с «Ще го направя аз».» · «Опитайте отново, когато връзката се върне, или се обадете на +359879696870.» | `614:58955`, `614:59076`, `614:59222`, `614:59312`, `614:59402` (Mobile `614:59022`, `614:59149`, `614:59267`, `614:59354`, `614:59449`) |
| Hebrew P11 default · invalid · sending · rejected · offline, P12 check, not public, availability unknown, no saved name, Butler answer | lead sentence (Hebrew) | each carries its Hebrew next-step line | Mobile `614:66723`, `614:66810`, `614:66907`, `614:67016`, `614:67113`, `614:71340`, `614:71418`, `614:71498`, `614:71567`, `614:71870` |
| `O23-sender-declined` | lead sentence | «Предложете работата на друг колега или я запазете при себе си.» | `606:47524` · `606:47644` |
| `O23-sender-withdrawn` | lead sentence | «Работата остава при вас. Можете да я предложите на друг колега, когато сте готови.» | `606:47847` · `606:47967` |
| `O27-duplicate-check` | lead sentence | «Не сливайте записи само заради сходно име. Първо потвърдете самоличността и засе…» | `I14:1677;6:408` · `I15:1028;6:408` |
| `O27-review-pending` | labelled row | «След 2 работни дни, 10:00 · Europe/Sofia» | `52:5371` · `52:5427` |
| `O27-kept-separate` | lead sentence | «Записахме, че това са двама различни души. Нищо не е обединено и правата не са п…» | `606:44390` · `606:44441` |

