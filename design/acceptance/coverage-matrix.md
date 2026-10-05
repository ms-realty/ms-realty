# Design coverage matrix — journeys W01–W14 against the Figma file

Read-only audit of "MS Realty — AI-native OS & Website · 2027". Snapshot: 2026-10-05 14:28 EEST (full re-read, pages 03–09 and 12–14). Another agent is the only writer of the file, so counts can move; re-run the audit after its next publish. Journey → screen mapping is binding (`journeys.json`); W03 is in the matrix but its G1 keys are written elsewhere.

## Summary counts

| Measure | Count |
|---|---|
| Journeys | 14 (W03 matrix only) |
| Journey-screen slots (a screen reused by several journeys counts each time) | 127 |
| Unique journey screens | 73 (24 public P, 17 client C, 32 agency OS O) |
| Missing Desktop 1440 frames | 0 |
| Missing Mobile 390 frames | 0 |
| Missing Hebrew / RTL frames | 71 of 73 screens have no HE frame at all; 2 more have only one device; 0 have both. HE frames found on journey screens: P11 (D **missing**; M `602:18566`), P12 (D **missing**; M `602:18638`). Other RTL frames: `56:114` (390 wide, page 14 «RTL / Hebrew client layout»: a Hebrew property-card specimen with design notes, not a journey screen). The X05 language chooser lists «עברית · За преглед» as review-only. |
| Screens with no state frame on page 09 | 24 of 73: C03, C06, C08, C13, C18, O01, O07, O08, O14, O22, O29, P01, P04, P06, P07, P08, P09, P10, P14, P15, P16, P21, P22, P24 |
| Screens whose state set is incomplete on one device | 2 of 73: P11, P12 |
| Prototype copies on pages 12 and 13 | 73 Desktop + 73 Mobile, one per journey screen; every one has at least one outgoing reaction |
| Outgoing reactions per prototype copy (Desktop) | min 4, median 16, max 29 |
| Outgoing reactions per prototype copy (Mobile) | min 2, median 7, max 45 |
| Journeys without any prototype | 0 |
| Journeys with a break in the click path (a journey screen unreachable by clicks from P01 / C01 / O01 without the harness index) | 9 of 14: W01, W04, W05, W07, W08, W10, W11, W12, W13 |
| Screens with no inbound click at all | 8: C02, C17, O28, O29, P16, P21, P22, P23 |
| Screens whose base frame is not reachable, only variants | 3: C10, C16, O33 |
| G1 task keys written | 45 tasks in 13 key files (W03 excluded) |

Legend. IDs are Figma node ids. «Proto D / Proto M» = copy on page 12 / 13, `frame id · outgoing reactions`. «States» = page-09 frames named `<ID><variant>` plus shared-piece variants on pages 03–08 (`COLL` = COLLECTIVE), counted as variants; a variant needs both a Desktop and a Mobile frame. Global system states X01–X27 are shared across journeys and are not counted per screen.

Method. Frames and sections were read per page with the plugin API (`loadAsync`, `findAll`); Hebrew was searched as Hebrew-script text plus layer names containing HE / RTL / Hebrew on pages 03–09 and 12–14; reactions were counted per prototype frame over all descendants (`reactions` array, every action). Reachability follows `NODE` destinations between prototype frames, ignoring the `@INDEX*` harness frames; in-page scroll anchors and component-variant swaps are not counted as screen changes.

## W01 · Discover a suitable property

Features F01 · F02 · F03 · F08 · F09 · 11 journey steps · 14 screens · G1 key: `design/zero-learning/keys/W01.md` (4 tasks)

| Screen | Desktop 1440 | Mobile 390 | HE / RTL | States on page 09 | Proto D | Proto M | Gaps |
|---|---|---|---|---|---|---|---|
| **P01** По-близо до Вашето място. | `10:102` | `11:8015` | none | 0: none | `63:25603` · 27 | `66:55092` · 22 | **no HE/RTL frame**; no state frames |
| **P02** Имоти в Сандански | `11:780` | `11:8107` | none | 2: P02B, P02R | `63:25688` · 29 | `66:55174` · 24 | **no HE/RTL frame**; specimen p14: Tablet 768 `40:5` |
| **P03** Вашето търсене | `29:622` | `29:1207` | none | 2: P03EMPTY, P03R | `63:25892` · 14 | `66:55543` · 9 | **no HE/RTL frame** |
| **P05** Апартамент в центъра на Сандански | `11:1031` | `11:8334` | none | 1: P05R | `63:26089` · 27 | `66:55737` · 20 | **no HE/RTL frame** |
| **P06** Снимки и планове | `29:476` | `29:1041` | none | 0: none | `63:26200` · 28 | `66:55842` · 21 | **no HE/RTL frame**; no state frames |
| **P11** Запитване до MS Realty | `11:1469` | `11:8704` | D **missing**; M `602:18566` | 9: P11FILLED, P11INVALID, P11SENDING, P11REJECTED, P11OFFLINE, P11COLL (Blank), P11COLL (ContextChanged), P11COLL (DEMO), P11FILLEDHE | `63:26500` · 23 | `66:56163` · 18 | Desktop state missing: P11FILLEDHE |
| **P13** Заявка за оглед | `11:1603` | `12:196` | none | 2: P13R, P13RREV | `63:26916` · 21 | `66:56397` · 16 | **no HE/RTL frame** |
| **P04** Имоти на карта | `11:962` | `11:8274` | none | 0: none | `63:26030` · 18 | `66:55681` · 13 | **no HE/RTL frame**; no state frames |
| **P15** Сандански и районът | `13:627` | `14:3948` | none | 0: none | `63:27110` · 14 | `66:56799` · 9 | **no HE/RTL frame**; no state frames |
| **P16** Услуги и полезна информация | `13:703` | `14:4015` | none | 0: none | `63:27177` · 14 | `66:56863` · 9 | **no HE/RTL frame**; no state frames; orphan in prototype (no inbound click) |
| **P20** Екип и контакти | `13:857` | `14:4151` | none | 4: P20L, P20LREV, P20R, P20RREV | `63:27928` · 22 | `66:57472` · 17 | **no HE/RTL frame** |
| **P24** Помощ, поверителност и достъпност | `13:936` | `14:4223` | none | 0: none | `63:28331` · 17 | `66:58011` · 12 | **no HE/RTL frame**; no state frames |
| **P21** Тази обява не е активна | `11:2171` | `12:697` | none | 0: none | `63:28144` · 11 | `66:57832` · 6 | **no HE/RTL frame**; no state frames; orphan in prototype (no inbound click) |
| **P22** Продължете търсенето | `11:2217` | `12:734` | none | 0: none | `63:28176` · 11 | `66:57861` · 6 | **no HE/RTL frame**; no state frames; orphan in prototype (no inbound click) |

Click-path check: **break** — not reachable by clicks from P01 / C01 / O01 without the harness: P16, P21, P22.

Journey-specific gaps found while writing the G1 keys:

- P22 "Продължете търсенето" (no results) has no inbound click from P03/P02B in the prototype; reachable only through the harness index.
- P06 has no state frames on page 09 (no loading / failed-image / single-photo state).
- The prototype ends on the base P12 receipt, which is generic ("Без избран имот · Общо запитване до екипа") and not tied to the property or viewing the visitor just asked about. The new state P12COMMITTED (D `602:18463`, M `602:18519`) names property №202 but has no prototype copy and no inbound click.
- P13 sale variant has no review-before-send frame (only the rental variant P13RREV).

## W02 · Save, compare, share and subscribe

Features F04 · F05 · F30 · 16 journey steps · 10 screens · G1 key: `design/zero-learning/keys/W02.md` (4 tasks)

| Screen | Desktop 1440 | Mobile 390 | HE / RTL | States on page 09 | Proto D | Proto M | Gaps |
|---|---|---|---|---|---|---|---|
| **P08** Вашите запазени имоти | `11:1254` | `11:8515` | none | 0: none | `63:26325` · 26 | `66:55996` · 21 | **no HE/RTL frame**; no state frames |
| **P07** Сравнете важните разлики | `29:531` | `29:1085` | none | 0: none | `63:26243` · 20 | `66:55880` · 45 | **no HE/RTL frame**; no state frames |
| **P11** Запитване до MS Realty | `11:1469` | `11:8704` | D **missing**; M `602:18566` | 9: P11FILLED, P11INVALID, P11SENDING, P11REJECTED, P11OFFLINE, P11COLL (Blank), P11COLL (ContextChanged), P11COLL (DEMO), P11FILLEDHE | `63:26500` · 23 | `66:56163` · 18 | Desktop state missing: P11FILLEDHE |
| **P12** Състояние на запитването | `11:1545` | `11:8773` | D **missing**; M `602:18638` | 8: P12RRES, P12RU, P12RUCHECK, P12U, P12UCHECK, P12COMMITTED, P12COLL (DEMO receipt), P12COMMITTEDHE | `63:26799` · 12 | `66:56211` · 7 | Desktop state missing: P12COMMITTEDHE |
| **P09** Споделен списък с имоти | `13:551` | `14:3881` | none | 0: none | `63:26399` · 29 | `66:56067` · 24 | **no HE/RTL frame**; no state frames |
| **P20** Екип и контакти | `13:857` | `14:4151` | none | 4: P20L, P20LREV, P20R, P20RREV | `63:27928` · 22 | `66:57472` · 17 | **no HE/RTL frame** |
| **C01** Вход за клиенти | `11:2410` | `11:621` | none | 2: C01HOSTED, C01OK | `63:7036` · 4 | `66:40847` · 3 | **no HE/RTL frame** |
| **C05** Предложени и запазени имоти | `14:2375` | `14:3160` | none | 1: C05S | `63:7779` · 20 | `66:41428` · 11 | **no HE/RTL frame**; specimen p14: Tablet 768 `40:95` |
| **P10** Известия за нови имоти | `11:1410` | `11:8653` | none | 0: none | `63:26457` · 21 | `66:56122` · 16 | **no HE/RTL frame**; no state frames |
| **C13** Контакти и известия | `18:2009` | `18:3349` | none | 0: none | `63:10734` · 15 | `66:43920` · 6 | **no HE/RTL frame**; no state frames |

Click-path check: every journey screen is reachable by clicks from P01 / C01 / O01.

Journey-specific gaps found while writing the G1 keys:

- No frame for "nothing saved yet" on P08 or "fewer than two properties" on P07.
- The act of saving (heart / "Запази") happens on P01, P02, P04 and P05, which are outside W02's binding screen list; "Запази" only navigates to P08 and no state shows an item being added.
- P10 "Изпрати линк за потвърждение" leads to P12, whose copy is the inquiry receipt ("Състояние на запитването", "Без избран имот") and not a subscription confirmation.
- P10 has no state frames (invalid email, link expired, unsubscribed).
- The prototype ends on the base P12 receipt, which is generic ("Без избран имот · Общо запитване до екипа") and not tied to the property or viewing the visitor just asked about. The new state P12COMMITTED (D `602:18463`, M `602:18519`) names property №202 but has no prototype copy and no inbound click.
- X22 (access denied) and X23 (session expired) have no inbound click from any screen.

## W03 · Receive, own and qualify an inquiry

Features F06 · F18 · F19 · 12 journey steps · 10 screens · G1 key: written elsewhere (not this audit)

| Screen | Desktop 1440 | Mobile 390 | HE / RTL | States on page 09 | Proto D | Proto M | Gaps |
|---|---|---|---|---|---|---|---|
| **P11** Запитване до MS Realty | `11:1469` | `11:8704` | D **missing**; M `602:18566` | 9: P11FILLED, P11INVALID, P11SENDING, P11REJECTED, P11OFFLINE, P11COLL (Blank), P11COLL (ContextChanged), P11COLL (DEMO), P11FILLEDHE | `63:26500` · 23 | `66:56163` · 18 | Desktop state missing: P11FILLEDHE |
| **P12** Състояние на запитването | `11:1545` | `11:8773` | D **missing**; M `602:18638` | 8: P12RRES, P12RU, P12RUCHECK, P12U, P12UCHECK, P12COMMITTED, P12COLL (DEMO receipt), P12COMMITTEDHE | `63:26799` · 12 | `66:56211` · 7 | Desktop state missing: P12COMMITTEDHE |
| **O01** Добро утро, Мария. | `10:203` | `14:4343` | none | 0: none | `63:12217` · 23 | `66:45141` · 12 | **no HE/RTL frame**; no state frames; specimen p14: Laptop 1024 `40:157`; Dark `40:364` |
| **O02** Входящи | `11:4257` | `18:2905` | none | 2: O02MINE, O02UNCLAIMED | `63:12390` · 17 | `66:45246` · 6 | **no HE/RTL frame** |
| **O03** Разговор с Алекс | `18:732` | `16:463` | none | 26: O03A, O03AR, O03L, O03LR, O03N, O03NR, O03R, O03RASSIGN, O03RASSIGNED, O03RCREATE, O03RCREATED, O03RINT, O03RLINK, O03RLINKED, O03RMSG, O03RMSGS, O03RMSGU, O03RMSGUCHECK, O03RRESOLVE, O03RRESOLVED, O03Z, O03ZR, O03COLL (Избор от сравнение), O03COLLACCEPT, O03COLLREOPEN, O03COLLRESULT | `63:12514` · 20 | `66:45509` · 9 | **no HE/RTL frame** |
| **O06** Лице или организация | `11:4823` | `14:4583` | none | 1: O06R | `63:15447` · 15 | `66:47227` · 4 | **no HE/RTL frame** |
| **O23** Екип, достъп и заместване | `18:1141` | `16:736` | none | 21: O23A, O23D, O23G, O23H, O23HD, O23HP, O23M, O23OFF, O23OFFAUTH, O23OFFCONFLICT, O23OFFDIR, O23OFFFORMER, O23OFFRECEIPT, O23OFFSELF, O23OFFUNKNOWN, O23OFFVALID, O23Q, O23R, O23S, O23T, O23V | `63:20897` · 18 | `66:51729` · 7 | **no HE/RTL frame** |
| **O18** Задачи | `14:1979` | `15:436` | none | 3: O18CASE, O18MINE, O18NEEDS | `63:18902` · 22 | `66:49755` · 11 | **no HE/RTL frame** |
| **O04** Преписки | `14:1847` | `14:4522` | none | 2: O04MINE, O04NEEDS | `63:14199` · 21 | `66:46558` · 10 | **no HE/RTL frame** |
| **O05** Покупка в Сандански | `18:914` | `16:578` | none | 8: O05C, O05CR, O05L, O05R, O05RNEW, O05S, O05W, O05WR | `63:14413` · 23 | `66:46704` · 12 | **no HE/RTL frame** |

Click-path check: every journey screen is reachable by clicks from P01 / C01 / O01.

## W04 · Enter private work and preserve responsibility

Features F13 · F14 · F19 · F20 · F30 · 16 journey steps · 13 screens · G1 key: `design/zero-learning/keys/W04.md` (4 tasks)

| Screen | Desktop 1440 | Mobile 390 | HE / RTL | States on page 09 | Proto D | Proto M | Gaps |
|---|---|---|---|---|---|---|---|
| **C01** Вход за клиенти | `11:2410` | `11:621` | none | 2: C01HOSTED, C01OK | `63:7036` · 4 | `66:40847` · 3 | **no HE/RTL frame** |
| **C02** Покана за клиентски достъп | `11:2432` | `11:645` | none | 4: C02OK, C02REVIEW, C02RI, C02WR | `63:7139` · 4 | `66:40952` · 3 | **no HE/RTL frame**; orphan in prototype (no inbound click) |
| **C04** Вашите изисквания | `11:2591` | `12:921` | none | 4: C04EMPTY, C04R, C04RESET, C04REVIEW | `63:7492` · 15 | `66:41251` · 6 | **no HE/RTL frame** |
| **C18** Заявка за Вашите лични данни | `18:2134` | `18:3414` | none | 0: none | `63:11494` · 13 | `66:44628` · 4 | **no HE/RTL frame**; no state frames |
| **C13** Контакти и известия | `18:2009` | `18:3349` | none | 0: none | `63:10734` · 15 | `66:43920` · 6 | **no HE/RTL frame**; no state frames |
| **C03** Вашето търсене, на едно място. | `11:2456` | `11:671` | none | 0: none | `63:7361` · 15 | `66:41178` · 6 | **no HE/RTL frame**; no state frames |
| **C17** Участници и достъп | `11:4029` | `12:1691` | none | 3: C17INFO, C17REQ, C17REQS | `63:11277` · 15 | `66:44296` · 6 | **no HE/RTL frame**; orphan in prototype (no inbound click) |
| **O23** Екип, достъп и заместване | `18:1141` | `16:736` | none | 21: O23A, O23D, O23G, O23H, O23HD, O23HP, O23M, O23OFF, O23OFFAUTH, O23OFFCONFLICT, O23OFFDIR, O23OFFFORMER, O23OFFRECEIPT, O23OFFSELF, O23OFFUNKNOWN, O23OFFVALID, O23Q, O23R, O23S, O23T, O23V | `63:20897` · 18 | `66:51729` · 7 | **no HE/RTL frame** |
| **O05** Покупка в Сандански | `18:914` | `16:578` | none | 8: O05C, O05CR, O05L, O05R, O05RNEW, O05S, O05W, O05WR | `63:14413` · 23 | `66:46704` · 12 | **no HE/RTL frame** |
| **O18** Задачи | `14:1979` | `15:436` | none | 3: O18CASE, O18MINE, O18NEEDS | `63:18902` · 22 | `66:49755` · 11 | **no HE/RTL frame** |
| **O26** История и заявки за лични данни | `11:7067` | `15:953` | none | 5: O26L, O26MINE, O26NEEDS, O26P, O26PR | `63:22858` · 21 | `66:53160` · 10 | **no HE/RTL frame** |
| **O04** Преписки | `14:1847` | `14:4522` | none | 2: O04MINE, O04NEEDS | `63:14199` · 21 | `66:46558` · 10 | **no HE/RTL frame** |
| **C16** Резултат и оставащи стъпки | `14:2840` | `14:3381` | none | 1: C16R | `63:11051` · 14 | `66:44184` · 5 | **no HE/RTL frame**; only variants reachable by click |

Click-path check: **break** — not reachable by clicks from P01 / C01 / O01 without the harness: C02, C17, C16.

Journey-specific gaps found while writing the G1 keys:

- C02 invitation has no inbound click from any screen (reachable only from the harness index; acceptable only if the email link is the real entry).
- Case numbers like DEMO-CASE-01 are the visible row titles on O04/O05 (see g2-terms.md).

## W05 · Match, decide and close buyer / tenant work

Features F14 · F16 · F20 · F21 · F26 · 14 journey steps · 11 screens · G1 key: `design/zero-learning/keys/W05.md` (4 tasks)

| Screen | Desktop 1440 | Mobile 390 | HE / RTL | States on page 09 | Proto D | Proto M | Gaps |
|---|---|---|---|---|---|---|---|
| **C04** Вашите изисквания | `11:2591` | `12:921` | none | 4: C04EMPTY, C04R, C04RESET, C04REVIEW | `63:7492` · 15 | `66:41251` · 6 | **no HE/RTL frame** |
| **C05** Предложени и запазени имоти | `14:2375` | `14:3160` | none | 1: C05S | `63:7779` · 20 | `66:41428` · 11 | **no HE/RTL frame**; specimen p14: Tablet 768 `40:95` |
| **C10** Преглед на предложение | `11:3275` | `12:1304` | none | 29: C10CH, C10CHREVIEW, C10CHS, C10CHU, C10CHUCHECK, C10DEC, C10DU, C10DUCHECK, C10ELIG, C10ELIGGUARD, C10ELIGNEXT, C10ELIGREC, C10ELIGREVIEW, C10ELIGSUB, C10ELIGU, C10ELIGUCHECK, C10EX, C10Q, C10QREVIEW, C10QS, C10QU, C10QUCHECK, C10R, C10REC, C10RECREVIEW, C10RECS, C10RECU, C10RECUCHECK, C10WD | `63:9350` · 13 | `66:42904` · 4 | **no HE/RTL frame**; only variants reachable by click |
| **O07** Подбор на имоти | `14:748` | `14:4632` | none | 0: none | `63:15676` · 17 | `66:47324` · 6 | **no HE/RTL frame**; no state frames |
| **O32** Прегледайте предложението | `18:1610` | `18:3070` | none | 7: O32CMS, O32CONS, O32COPY, O32MATCH, O32PROP, O32RENT, O32TRANS | `63:24354` · 17 | `66:54292` · 6 | **no HE/RTL frame** |
| **O08** Календар и маршрут | `11:38` | `14:4719` | none | 0: none | `63:15793` · 18 | `66:47373` · 7 | **no HE/RTL frame**; no state frames |
| **O19** Подготовка на предложение | `11:6120` | `15:509` | none | 17: O19CO, O19COMSG, O19COMSGS, O19COMSGU, O19COMSGUCHECK, O19ELIGNEXT, O19MSG, O19MSGS, O19MSGU, O19MSGUCHECK, O19R, O19REVIEW, O19RMSG, O19RMSGS, O19RMSGU, O19RMSGUCHECK, O19SAVED | `63:19128` · 16 | `66:49913` · 5 | **no HE/RTL frame** |
| **C08** Документи и необходими действия | `11:3049` | `12:1103` | none | 0: none | `63:8846` · 11 | `66:42516` · 2 | **no HE/RTL frame**; no state frames |
| **C09** Добавяне или замяна на документ | `11:3169` | `12:1259` | none | 4: C09QR, C09RD, C09RP, C09SE | `63:8929` · 13 | `66:42541` · 4 | **no HE/RTL frame** |
| **C16** Резултат и оставащи стъпки | `14:2840` | `14:3381` | none | 1: C16R | `63:11051` · 14 | `66:44184` · 5 | **no HE/RTL frame**; only variants reachable by click |
| **O05** Покупка в Сандански | `18:914` | `16:578` | none | 8: O05C, O05CR, O05L, O05R, O05RNEW, O05S, O05W, O05WR | `63:14413` · 23 | `66:46704` · 12 | **no HE/RTL frame** |

Click-path check: **break** — not reachable by clicks from P01 / C01 / O01 without the harness: C10, C16.

Journey-specific gaps found while writing the G1 keys:

- C10 (offer review) has no inbound click from C04/C05/C06/C07 in the sale flow; only rental variants link to C10R from C04R and C16R.
- O19 "Изпрати за преглед" saves a local draft ("Запиши тази DEMO чернова"); no state shows the reviewer receiving it.
- O32MATCH "Добави избраното в черновата" returns to the unchanged O07; no frame shows the accepted suggestions inside the draft.
- Closing the deal: C16 "Резултат и оставащи стъпки" is reachable only from C10R (rental variant); no frame shows an accepted/closed sale outcome.

## W06 · Request, propose and confirm a viewing

Features F07 · F22 · F26 · 13 journey steps · 7 screens · G1 key: `design/zero-learning/keys/W06.md` (4 tasks)

| Screen | Desktop 1440 | Mobile 390 | HE / RTL | States on page 09 | Proto D | Proto M | Gaps |
|---|---|---|---|---|---|---|---|
| **P13** Заявка за оглед | `11:1603` | `12:196` | none | 2: P13R, P13RREV | `63:26916` · 21 | `66:56397` · 16 | **no HE/RTL frame** |
| **C06** Детайли за огледа | `11:2846` | `12:1057` | none | 0: none | `63:7989` · 13 | `66:41522` · 4 | **no HE/RTL frame**; no state frames |
| **O09** Организиране на оглед | `14:906` | `14:4756` | none | 3: O09CC, O09CF, O09DST | `63:15969` · 18 | `66:47398` · 7 | **no HE/RTL frame** |
| **O08** Календар и маршрут | `11:38` | `14:4719` | none | 0: none | `63:15793` · 18 | `66:47373` · 7 | **no HE/RTL frame**; no state frames |
| **P14** Вашият оглед | `11:1678` | `12:264` | none | 0: none | `63:27076` · 11 | `66:56768` · 6 | **no HE/RTL frame**; no state frames |
| **C01** Вход за клиенти | `11:2410` | `11:621` | none | 2: C01HOSTED, C01OK | `63:7036` · 4 | `66:40847` · 3 | **no HE/RTL frame** |
| **O18** Задачи | `14:1979` | `15:436` | none | 3: O18CASE, O18MINE, O18NEEDS | `63:18902` · 22 | `66:49755` · 11 | **no HE/RTL frame** |

Click-path check: every journey screen is reachable by clicks from P01 / C01 / O01.

Journey-specific gaps found while writing the G1 keys:

- The prototype ends on the base P12 receipt, which is generic ("Без избран имот · Общо запитване до екипа") and not tied to the property or viewing the visitor just asked about. The new state P12COMMITTED (D `602:18463`, M `602:18519`) names property №202 but has no prototype copy and no inbound click.
- C06 has no state frames on page 09 (confirmed viewing, time no longer available, cancelled).
- C06 "Часът ми е удобен" opens the message thread (C07); the acceptance is a message, not a recorded status on the viewing.
- X06 "Преглед на уговорката" shows the confirmation as blocked ("Потвърждението остава блокирано, докато брокерът не провери всички условия") and its only actions are "Към организацията" and "Отказ"; no frame shows the unblocked confirm / send step or the resulting "proposal sent" state, so the broker cannot finish "propose and confirm".
- P14 "Вашият оглед" has no state frames (no viewing, cancelled, changed).

## W07 · Agree seller / landlord instructions

Features F10 · F11 · F12 · F26 · 12 journey steps · 11 screens · G1 key: `design/zero-learning/keys/W07.md` (3 tasks)

| Screen | Desktop 1440 | Mobile 390 | HE / RTL | States on page 09 | Proto D | Proto M | Gaps |
|---|---|---|---|---|---|---|---|
| **P17** Следващата глава за Вашия имот. | `13:781` | `14:4084` | none | 1: P17R | `63:27246` · 14 | `66:56929` · 9 | **no HE/RTL frame** |
| **P18** Разкажете ни за имота | `11:1954` | `12:504` | none | 3: P18R, P18REV, P18RREV | `63:27369` · 12 | `66:57046` · 7 | **no HE/RTL frame** |
| **C12** Преглед на обявата и Вашите указания | `14:2627` | `14:3290` | none | 3: C12G, C12GALL, C12R | `63:10292` · 15 | `66:43712` · 6 | **no HE/RTL frame** |
| **O05** Покупка в Сандански | `18:914` | `16:578` | none | 8: O05C, O05CR, O05L, O05R, O05RNEW, O05S, O05W, O05WR | `63:14413` · 23 | `66:46704` · 12 | **no HE/RTL frame** |
| **O11** Идентичност и връзки на имота | `14:1039` | `14:4884` | none | 1: O11R | `63:16541` · 15 | `66:48006` · 4 | **no HE/RTL frame** |
| **O12** Редактиране на обява | `11:356` | `14:4933` | none | 5: O12D200, O12D200S, O12D912, O12D912S, O12SAVED | `63:16795` · 21 | `66:48113` · 10 | **no HE/RTL frame** |
| **O14** Факти и източници | `11:5466` | `14:5090` | none | 0: none | `63:17449` · 14 | `66:48571` · 3 | **no HE/RTL frame**; no state frames |
| **O16** Преглед за публикуване | `18:1471` | `18:3002` | none | 3: O16AQ, O16EL, O16G | `63:17977` · 19 | `66:49137` · 8 | **no HE/RTL frame** |
| **C11** Вашият имот за продажба или наем | `14:2498` | `14:3222` | none | 1: C11R | `63:10026` · 15 | `66:43562` · 6 | **no HE/RTL frame** |
| **P19** Състояние на заявката за имот | `11:2035` | `12:579` | none | 5: P19RRES, P19RU, P19RUCHECK, P19U, P19UCHECK | `63:27608` · 12 | `66:57286` · 7 | **no HE/RTL frame** |
| **C16** Резултат и оставащи стъпки | `14:2840` | `14:3381` | none | 1: C16R | `63:11051` · 14 | `66:44184` · 5 | **no HE/RTL frame**; only variants reachable by click |

Click-path check: **break** — not reachable by clicks from P01 / C01 / O01 without the harness: C16.

Journey-specific gaps found while writing the G1 keys:

- P17, P18 are the only sell/let entry steps; P18 has no error states (invalid field, upload failed) on page 09.
- X16 "Версията се е променила" has no inbound click from any screen.
- No state frames for O14 (fact missing, source conflict).

## W08 · Prepare, translate, review and publish

Features F23 · F24 · 12 journey steps · 11 screens · G1 key: `design/zero-learning/keys/W08.md` (4 tasks)

| Screen | Desktop 1440 | Mobile 390 | HE / RTL | States on page 09 | Proto D | Proto M | Gaps |
|---|---|---|---|---|---|---|---|
| **O10** Имоти и обяви | `11:5103` | `14:4820` | none | 2: O10MINE, O10NEEDS | `63:16325` · 21 | `66:47858` · 10 | **no HE/RTL frame** |
| **O11** Идентичност и връзки на имота | `14:1039` | `14:4884` | none | 1: O11R | `63:16541` · 15 | `66:48006` · 4 | **no HE/RTL frame** |
| **O14** Факти и източници | `11:5466` | `14:5090` | none | 0: none | `63:17449` · 14 | `66:48571` · 3 | **no HE/RTL frame**; no state frames |
| **O13** Медии и подредба | `11:5356` | `18:2957` | none | 3: O13GALL, O13ORDER, O13ORDERSAVED | `63:17151` · 20 | `66:48403` · 7 | **no HE/RTL frame** |
| **O12** Редактиране на обява | `11:356` | `14:4933` | none | 5: O12D200, O12D200S, O12D912, O12D912S, O12SAVED | `63:16795` · 21 | `66:48113` · 10 | **no HE/RTL frame** |
| **O21** Текстове, услуги и районни материали | `14:1157` | `15:657` | none | 4: O21E, O21NEEDS, O21REVIEW, O21REVIEWED | `63:20443` · 20 | `66:51257` · 9 | **no HE/RTL frame** |
| **O15** Преводи | `11:5582` | `15:255` | none | 5: O15D200, O15PF, O15REVIEW, O15REVIEWED, O15ST | `63:17557` · 18 | `66:48611` · 7 | **no HE/RTL frame** |
| **O32** Прегледайте предложението | `18:1610` | `18:3070` | none | 7: O32CMS, O32CONS, O32COPY, O32MATCH, O32PROP, O32RENT, O32TRANS | `63:24354` · 17 | `66:54292` · 6 | **no HE/RTL frame** |
| **O16** Преглед за публикуване | `18:1471` | `18:3002` | none | 3: O16AQ, O16EL, O16G | `63:17977` · 19 | `66:49137` · 8 | **no HE/RTL frame** |
| **O17** Публикации и разпространение | `11:5844` | `15:375` | none | 4: O17MINE, O17MV, O17NEEDS, O17WD | `63:18518` · 21 | `66:49439` · 10 | **no HE/RTL frame** |
| **O25** Интеграции, проблеми и възстановяване | `14:1439` | `15:871` | none | 2: O25CHECK, O25RS | `63:22608` · 15 | `66:52916` · 4 | **no HE/RTL frame** |

Click-path check: **break** — not reachable by clicks from P01 / C01 / O01 without the harness: O17.

Journey-specific gaps found while writing the G1 keys:

- O15 draws only the English draft (tab "Английски"); review states for DE, RU, EL, NL and HE are not drawn ("Още езици" opens the interface-language chooser X05).
- COVERAGE GAP: O16 shows only the blocked state ("Публикуването остава блокирано до всички човешки одобрения"). No frame has an enabled publish button, a published confirmation or a published row on O17.
- O17 "Основен сайт" links back to O16; the published result is never shown.

## W09 · Assist a task, then review and send

Features F17 · F29 · 14 journey steps · 7 screens · G1 key: `design/zero-learning/keys/W09.md` (3 tasks)

| Screen | Desktop 1440 | Mobile 390 | HE / RTL | States on page 09 | Proto D | Proto M | Gaps |
|---|---|---|---|---|---|---|---|
| **C07** Съобщения по Вашата задача | `11:2953` | `11:745` | none | 15: C07L, C07LREVIEW, C07LREVIEWS, C07LREVIEWU, C07LREVIEWUCHECK, C07R, C07RREVIEW, C07RREVIEWS, C07RREVIEWU, C07RREVIEWUCHECK, C07S, C07SREVIEW, C07SREVIEWS, C07SREVIEWU, C07SREVIEWUCHECK | `63:8087` · 12 | `66:41562` · 3 | **no HE/RTL frame** |
| **O02** Входящи | `11:4257` | `18:2905` | none | 2: O02MINE, O02UNCLAIMED | `63:12390` · 17 | `66:45246` · 6 | **no HE/RTL frame** |
| **O03** Разговор с Алекс | `18:732` | `16:463` | none | 26: O03A, O03AR, O03L, O03LR, O03N, O03NR, O03R, O03RASSIGN, O03RASSIGNED, O03RCREATE, O03RCREATED, O03RINT, O03RLINK, O03RLINKED, O03RMSG, O03RMSGS, O03RMSGU, O03RMSGUCHECK, O03RRESOLVE, O03RRESOLVED, O03Z, O03ZR, O03COLL (Избор от сравнение), O03COLLACCEPT, O03COLLREOPEN, O03COLLRESULT | `63:12514` · 20 | `66:45509` · 9 | **no HE/RTL frame** |
| **O05** Покупка в Сандански | `18:914` | `16:578` | none | 8: O05C, O05CR, O05L, O05R, O05RNEW, O05S, O05W, O05WR | `63:14413` · 23 | `66:46704` · 12 | **no HE/RTL frame** |
| **O32** Прегледайте предложението | `18:1610` | `18:3070` | none | 7: O32CMS, O32CONS, O32COPY, O32MATCH, O32PROP, O32RENT, O32TRANS | `63:24354` · 17 | `66:54292` · 6 | **no HE/RTL frame** |
| **O24** Работен статус | `11:6813` | `15:797` | none | 6: O24CSV, O24BUTLER, O24MINE, O24NEEDS, O24PAYLOAD, O24SEARCH | `63:22097` · 22 | `66:52293` · 11 | **no HE/RTL frame** |
| **O25** Интеграции, проблеми и възстановяване | `14:1439` | `15:871` | none | 2: O25CHECK, O25RS | `63:22608` · 15 | `66:52916` · 4 | **no HE/RTL frame** |

Click-path check: every journey screen is reachable by clicks from P01 / C01 / O01.

Journey-specific gaps found while writing the G1 keys:

- X26 "Butler е временно недостъпен" has no inbound click; the assistant-unavailable path is not wired to O32.
- O25 copy uses "операция" and "идентификатор" (see g2-terms.md).

## W10 · Exchange and review purpose-bound documents

Features F15 · 12 journey steps · 4 screens · G1 key: `design/zero-learning/keys/W10.md` (3 tasks)

| Screen | Desktop 1440 | Mobile 390 | HE / RTL | States on page 09 | Proto D | Proto M | Gaps |
|---|---|---|---|---|---|---|---|
| **C08** Документи и необходими действия | `11:3049` | `12:1103` | none | 0: none | `63:8846` · 11 | `66:42516` · 2 | **no HE/RTL frame**; no state frames |
| **C09** Добавяне или замяна на документ | `11:3169` | `12:1259` | none | 4: C09QR, C09RD, C09RP, C09SE | `63:8929` · 13 | `66:42541` · 4 | **no HE/RTL frame** |
| **O20** Преглед на документ | `11:6278` | `15:598` | none | 4: O20R, O20S, O20SEALED, O20UPLOAD | `63:20078` · 13 | `66:50960` · 2 | **no HE/RTL frame** |
| **C17** Участници и достъп | `11:4029` | `12:1691` | none | 3: C17INFO, C17REQ, C17REQS | `63:11277` · 15 | `66:44296` · 6 | **no HE/RTL frame**; orphan in prototype (no inbound click) |

Click-path check: **break** — not reachable by clicks from P01 / C01 / O01 without the harness: C17.

Journey-specific gaps found while writing the G1 keys:

- C09 "Избери файл" returns to the unchanged C08; no frame shows the file as uploaded or being checked.
- C09SE "Файлът не е допуснат за преглед" has no inbound click.
- C17 "Участници и достъп" (who can see what) has no inbound click from C08 or any other screen.

## W11 · Correct exposure and recover uncertain work

Features F25 · F31 · 12 journey steps · 15 screens · G1 key: `design/zero-learning/keys/W11.md` (3 tasks)

| Screen | Desktop 1440 | Mobile 390 | HE / RTL | States on page 09 | Proto D | Proto M | Gaps |
|---|---|---|---|---|---|---|---|
| **O33** Съществена корекция и оставащо разпространение | `18:1293` | `16:1077` | none | 2: O33E, O33R | `63:25142` · 20 | `66:54833` · 9 | **no HE/RTL frame**; only variants reachable by click |
| **O12** Редактиране на обява | `11:356` | `14:4933` | none | 5: O12D200, O12D200S, O12D912, O12D912S, O12SAVED | `63:16795` · 21 | `66:48113` · 10 | **no HE/RTL frame** |
| **O15** Преводи | `11:5582` | `15:255` | none | 5: O15D200, O15PF, O15REVIEW, O15REVIEWED, O15ST | `63:17557` · 18 | `66:48611` · 7 | **no HE/RTL frame** |
| **O16** Преглед за публикуване | `18:1471` | `18:3002` | none | 3: O16AQ, O16EL, O16G | `63:17977` · 19 | `66:49137` · 8 | **no HE/RTL frame** |
| **O17** Публикации и разпространение | `11:5844` | `15:375` | none | 4: O17MINE, O17MV, O17NEEDS, O17WD | `63:18518` · 21 | `66:49439` · 10 | **no HE/RTL frame** |
| **O25** Интеграции, проблеми и възстановяване | `14:1439` | `15:871` | none | 2: O25CHECK, O25RS | `63:22608` · 15 | `66:52916` · 4 | **no HE/RTL frame** |
| **O05** Покупка в Сандански | `18:914` | `16:578` | none | 8: O05C, O05CR, O05L, O05R, O05RNEW, O05S, O05W, O05WR | `63:14413` · 23 | `66:46704` · 12 | **no HE/RTL frame** |
| **C05** Предложени и запазени имоти | `14:2375` | `14:3160` | none | 1: C05S | `63:7779` · 20 | `66:41428` · 11 | **no HE/RTL frame**; specimen p14: Tablet 768 `40:95` |
| **C06** Детайли за огледа | `11:2846` | `12:1057` | none | 0: none | `63:7989` · 13 | `66:41522` · 4 | **no HE/RTL frame**; no state frames |
| **C10** Преглед на предложение | `11:3275` | `12:1304` | none | 29: C10CH, C10CHREVIEW, C10CHS, C10CHU, C10CHUCHECK, C10DEC, C10DU, C10DUCHECK, C10ELIG, C10ELIGGUARD, C10ELIGNEXT, C10ELIGREC, C10ELIGREVIEW, C10ELIGSUB, C10ELIGU, C10ELIGUCHECK, C10EX, C10Q, C10QREVIEW, C10QS, C10QU, C10QUCHECK, C10R, C10REC, C10RECREVIEW, C10RECS, C10RECU, C10RECUCHECK, C10WD | `63:9350` · 13 | `66:42904` · 4 | **no HE/RTL frame**; only variants reachable by click |
| **C07** Съобщения по Вашата задача | `11:2953` | `11:745` | none | 15: C07L, C07LREVIEW, C07LREVIEWS, C07LREVIEWU, C07LREVIEWUCHECK, C07R, C07RREVIEW, C07RREVIEWS, C07RREVIEWU, C07RREVIEWUCHECK, C07S, C07SREVIEW, C07SREVIEWS, C07SREVIEWU, C07SREVIEWUCHECK | `63:8087` · 12 | `66:41562` · 3 | **no HE/RTL frame** |
| **O32** Прегледайте предложението | `18:1610` | `18:3070` | none | 7: O32CMS, O32CONS, O32COPY, O32MATCH, O32PROP, O32RENT, O32TRANS | `63:24354` · 17 | `66:54292` · 6 | **no HE/RTL frame** |
| **O22** Работни отчети | `14:1296` | `15:725` | none | 0: none | `63:20765` · 19 | `66:51665` · 8 | **no HE/RTL frame**; no state frames |
| **O24** Работен статус | `11:6813` | `15:797` | none | 6: O24CSV, O24BUTLER, O24MINE, O24NEEDS, O24PAYLOAD, O24SEARCH | `63:22097` · 22 | `66:52293` · 11 | **no HE/RTL frame** |
| **O26** История и заявки за лични данни | `11:7067` | `15:953` | none | 5: O26L, O26MINE, O26NEEDS, O26P, O26PR | `63:22858` · 21 | `66:53160` · 10 | **no HE/RTL frame** |

Click-path check: **break** — not reachable by clicks from P01 / C01 / O01 without the harness: O33, O17, C10.

Journey-specific gaps found while writing the G1 keys:

- O33 has no inbound click except from O17WD; the correction cannot be started from O12 or O16.

## W12 · Stage, import and merge safely

Features F32 · 11 journey steps · 5 screens · G1 key: `design/zero-learning/keys/W12.md` (3 tasks)

| Screen | Desktop 1440 | Mobile 390 | HE / RTL | States on page 09 | Proto D | Proto M | Gaps |
|---|---|---|---|---|---|---|---|
| **O28** Импорт и групови промени | `14:1717` | `16:817` | none | 3: O28CHECK, O28M, O28PR | `63:23628` · 15 | `66:53620` · 4 | **no HE/RTL frame**; orphan in prototype (no inbound click) |
| **O13** Медии и подредба | `11:5356` | `18:2957` | none | 3: O13GALL, O13ORDER, O13ORDERSAVED | `63:17151` · 20 | `66:48403` · 7 | **no HE/RTL frame** |
| **O27** Проверка за дубликати | `14:1592` | `15:1014` | none | 2: O27PENDING, O27SP | `63:23379` · 16 | `66:53439` · 5 | **no HE/RTL frame** |
| **O06** Лице или организация | `11:4823` | `14:4583` | none | 1: O06R | `63:15447` · 15 | `66:47227` · 4 | **no HE/RTL frame** |
| **O25** Интеграции, проблеми и възстановяване | `14:1439` | `15:871` | none | 2: O25CHECK, O25RS | `63:22608` · 15 | `66:52916` · 4 | **no HE/RTL frame** |

Click-path check: **break** — not reachable by clicks from P01 / C01 / O01 without the harness: O28.

Journey-specific gaps found while writing the G1 keys:

- O28 has no inbound click from any screen (reachable only from the harness index).
- No frame shows the result of an actual merge.

## W13 · Offer bounded services only when staffed

Features F27 · F28 · 9 journey steps · 6 screens · G1 key: `design/zero-learning/keys/W13.md` (3 tasks)

| Screen | Desktop 1440 | Mobile 390 | HE / RTL | States on page 09 | Proto D | Proto M | Gaps |
|---|---|---|---|---|---|---|---|
| **P16** Услуги и полезна информация | `13:703` | `14:4015` | none | 0: none | `63:27177` · 14 | `66:56863` · 9 | **no HE/RTL frame**; no state frames; orphan in prototype (no inbound click) |
| **P20** Екип и контакти | `13:857` | `14:4151` | none | 4: P20L, P20LREV, P20R, P20RREV | `63:27928` · 22 | `66:57472` · 17 | **no HE/RTL frame** |
| **P23** Запитване за кратък престой | `11:2263` | `12:771` | none | 2: P23RES, P23REV | `63:28208` · 12 | `66:57890` · 7 | **no HE/RTL frame**; orphan in prototype (no inbound click) |
| **C14** Вашата консултация | `14:2739` | `14:3341` | none | 4: C14MSG, C14MSGS, C14MSGU, C14MSGUCHECK | `63:10832` · 12 | `66:43961` · 3 | **no HE/RTL frame** |
| **O29** Заявки за поддържани консултации | `11:7470` | `16:876` | none | 0: none | `63:24050` · 15 | `66:54122` · 4 | **no HE/RTL frame**; no state frames; orphan in prototype (no inbound click) |
| **O30** Работа по консултация | `11:7585` | `16:921` | none | 2: O30REVIEW, O30SAVED | `63:24150` · 16 | `66:54155` · 5 | **no HE/RTL frame** |

Click-path check: **break** — not reachable by clicks from P01 / C01 / O01 without the harness: P16, P23, O29.

Journey-specific gaps found while writing the G1 keys:

- P16 has no link to P23 and P23 has no inbound click except its own variants; the "only when staffed" service entry is not wired.
- O29 has no inbound click from any screen.

## W14 · Judge launch from release-bound evidence

Features F25 · 11 journey steps · 3 screens · G1 key: `design/zero-learning/keys/W14.md` (3 tasks)

| Screen | Desktop 1440 | Mobile 390 | HE / RTL | States on page 09 | Proto D | Proto M | Gaps |
|---|---|---|---|---|---|---|---|
| **O24** Работен статус | `11:6813` | `15:797` | none | 6: O24CSV, O24BUTLER, O24MINE, O24NEEDS, O24PAYLOAD, O24SEARCH | `63:22097` · 22 | `66:52293` · 11 | **no HE/RTL frame** |
| **O26** История и заявки за лични данни | `11:7067` | `15:953` | none | 5: O26L, O26MINE, O26NEEDS, O26P, O26PR | `63:22858` · 21 | `66:53160` · 10 | **no HE/RTL frame** |
| **O25** Интеграции, проблеми и възстановяване | `14:1439` | `15:871` | none | 2: O25CHECK, O25RS | `63:22608` · 15 | `66:52916` · 4 | **no HE/RTL frame** |

Click-path check: every journey screen is reachable by clicks from P01 / C01 / O01.

Journey-specific gaps found while writing the G1 keys:

- O24 labels the blockers "worker", "Payload runtime" and "CSV"; see g2-terms.md.
- No frame shows the launch decision itself (go / no-go) with the evidence it was bound to.

## Appendix A · State frame index for journey screens

Variant code · title · Desktop id · Mobile id (`-` = no frame, which is a gap). Source: page 09 unless marked `shared`.

**C01** (2 variants)

| Variant | Title | Desktop | Mobile | Source |
|---|---|---|---|---|
| `C01HOSTED` | Вход чрез доставчика за идентичност | `46:4691` | `46:4755` | p09 |
| `C01OK` | Разрешен достъп · DEMO | `46:4819` | `46:4838` | p09 |

**C02** (4 variants)

| Variant | Title | Desktop | Mobile | Source |
|---|---|---|---|---|
| `C02OK` | Поканата е приета · DEMO | `46:5011` | `46:5030` | p09 |
| `C02REVIEW` | Прегледайте точния обхват на поканата | `46:4857` | `46:4934` | p09 |
| `C02RI` | Тази покана е заменена | `23:1229` | `30:5476` | p09 |
| `C02WR` | Поканата е за друг получател | `23:1174` | `30:5421` | p09 |

**C04** (4 variants)

| Variant | Title | Desktop | Mobile | Source |
|---|---|---|---|---|
| `C04EMPTY` | Нова чернова на изискванията | `45:8917` | `45:8958` | p09 |
| `C04R` | Изисквания за дългосрочен наем | `21:1612` | `28:2346` | p09 |
| `C04RESET` | Изчистване само на работния избор | `45:8879` | `45:8898` | p09 |
| `C04REVIEW` | Преглед на предложени изисквания | `45:8999` | `45:9057` | p09 |

**C05** (1 variants)

| Variant | Title | Desktop | Mobile | Source |
|---|---|---|---|---|
| `C05S` | Лично запазени имоти | `21:2748` | `28:3009` | p09 |

**C07** (15 variants)

| Variant | Title | Desktop | Mobile | Source |
|---|---|---|---|---|
| `C07L` | Разговор по отдаването | `42:5693` | `42:5755` | p09 |
| `C07LREVIEW` | Разговор по отдаването · Преглед | `42:5817` | `42:5885` | p09 |
| `C07LREVIEWS` | Съобщението е прието за изпращане | `42:5953` | `42:5972` | p09 |
| `C07LREVIEWU` | Резултатът от съобщението още се проверява | `48:5169` | `48:5224` | p09 |
| `C07LREVIEWUCHECK` | Резултатът все още не е потвърден | `66:32943` | `66:33009` | p09 |
| `C07R` | Разговор по търсенето под наем | `42:5395` | `42:5457` | p09 |
| `C07RREVIEW` | Разговор по търсенето под наем · Преглед | `42:5519` | `42:5587` | p09 |
| `C07RREVIEWS` | Съобщението е прието за изпращане | `42:5655` | `42:5674` | p09 |
| `C07RREVIEWU` | Резултатът от съобщението още се проверява | `48:5059` | `48:5114` | p09 |
| `C07RREVIEWUCHECK` | Резултатът все още не е потвърден | `66:33075` | `66:33141` | p09 |
| `C07S` | Разговор за Вашия имот | `42:5991` | `42:6053` | p09 |
| `C07SREVIEW` | Разговор за Вашия имот · Преглед | `43:3255` | `43:3323` | p09 |
| `C07SREVIEWS` | Съобщението е прието за изпращане | `43:3391` | `43:3410` | p09 |
| `C07SREVIEWU` | Резултатът от съобщението още се проверява | `48:5279` | `48:5334` | p09 |
| `C07SREVIEWUCHECK` | Резултатът все още не е потвърден | `66:33207` | `66:33273` | p09 |

**C09** (4 variants)

| Variant | Title | Desktop | Mobile | Source |
|---|---|---|---|---|
| `C09QR` | Файлът не е допуснат за преглед | `23:1652` | `30:5899` | p09 |
| `C09RD` | Документът е готов за конкретен преглед | `23:1733` | `30:5980` | p09 |
| `C09RP` | Замяна с нова версия | `23:1825` | `30:6072` | p09 |
| `C09SE` | Качването е завършено; проверката продължава | `23:1562` | `30:5809` | p09 |

**C10** (29 variants)

| Variant | Title | Desktop | Mobile | Source |
|---|---|---|---|---|
| `C10CH` | Промяна за обсъждане | `189:16757` | `189:17702` | p09 |
| `C10CHREVIEW` | Промяна за обсъждане | `189:16815` | `189:17760` | p09 |
| `C10CHS` | Промяна за обсъждане | `189:16879` | `189:17824` | p09 |
| `C10CHU` | Промяна за обсъждане | `189:16901` | `189:17846` | p09 |
| `C10CHUCHECK` | Промяна за обсъждане | `189:16974` | `189:17919` | p09 |
| `C10DEC` | Решение за точната версия | `23:2077` | `30:6324` | p09 |
| `C10DU` | Проверяваме решението по предложението | `23:3375` | `33:3432` | p09 |
| `C10DUCHECK` | Резултатът от решението още не е потвърден | `189:17337` | `189:18282` | p09 |
| `C10ELIG` | Подготовка за професионален преглед | `244:8703` | `244:10170` | p09 |
| `C10ELIGGUARD` | Версия 2 е заменена | `244:10010` | `244:10981` | p09 |
| `C10ELIGNEXT` | Вашата следваща стъпка | `244:9377` | `244:10600` | p09 |
| `C10ELIGREC` | Указанието е записано · ДЕМО | `244:9213` | `244:10497` | p09 |
| `C10ELIGREVIEW` | Потвърдете само следващата стъпка | `244:8887` | `244:10293` | p09 |
| `C10ELIGSUB` | Записваме указанието · ДЕМО | `244:9058` | `244:10403` | p09 |
| `C10ELIGU` | Резултатът още не е потвърден | `244:9688` | `244:10781` | p09 |
| `C10ELIGUCHECK` | Проверката още няма резултат | `244:9849` | `244:10881` | p09 |
| `C10EX` | Предложението е изтекло | `23:1915` | `30:6162` | p09 |
| `C10Q` | Въпрос по предложението | `189:16467` | `189:17412` | p09 |
| `C10QREVIEW` | Въпрос по предложението | `189:16525` | `189:17470` | p09 |
| `C10QS` | Въпрос по предложението | `189:16589` | `189:17534` | p09 |
| `C10QU` | Въпрос по предложението | `189:16611` | `189:17556` | p09 |
| `C10QUCHECK` | Въпрос по предложението | `189:16684` | `189:17629` | p09 |
| `C10R` | Наемни условия за преглед | `21:1740` | `28:2416` | p09 |
| `C10REC` | Проверка с брокера | `189:17047` | `189:17992` | p09 |
| `C10RECREVIEW` | Проверка с брокера | `189:17105` | `189:18050` | p09 |
| `C10RECS` | Проверка с брокера | `189:17169` | `189:18114` | p09 |
| `C10RECU` | Проверка с брокера | `189:17191` | `189:18136` | p09 |
| `C10RECUCHECK` | Проверка с брокера | `189:17264` | `189:18209` | p09 |
| `C10WD` | Предложението е оттеглено | `23:1996` | `30:6243` | p09 |

**C11** (1 variants)

| Variant | Title | Desktop | Mobile | Source |
|---|---|---|---|---|
| `C11R` | Вашият имот за отдаване | `23:3619` | `31:5546` | p09 |

**C12** (3 variants)

| Variant | Title | Desktop | Mobile | Source |
|---|---|---|---|---|
| `C12G` | Снимки за преглед · Версия 3 | `21:2871` | `28:3071` | p09 |
| `C12GALL` | Личен преглед на снимките · Версия 3 | `29:4011` | `33:2984` | p09 |
| `C12R` | Преглед на наемните условия | `23:3768` | `31:5634` | p09 |

**C14** (4 variants)

| Variant | Title | Desktop | Mobile | Source |
|---|---|---|---|---|
| `C14MSG` | Уточнение по консултацията | `42:5221` | `42:5289` | p09 |
| `C14MSGS` | Съобщението е прието за изпращане | `42:5357` | `42:5376` | p09 |
| `C14MSGU` | Резултатът от съобщението още се проверява | `48:4949` | `48:5004` | p09 |
| `C14MSGUCHECK` | Резултатът все още не е потвърден | `66:33339` | `66:33405` | p09 |

**C16** (1 variants)

| Variant | Title | Desktop | Mobile | Source |
|---|---|---|---|---|
| `C16R` | Предаване и оставащи стъпки при наем | `21:2179` | `28:2662` | p09 |

**C17** (3 variants)

| Variant | Title | Desktop | Mobile | Source |
|---|---|---|---|---|
| `C17INFO` | Участници и текущ обхват | `44:6701` | `44:6759` | p09 |
| `C17REQ` | Поискайте покана за участник | `44:3697` | `44:3730` | p09 |
| `C17REQS` | Заявката за участник е записана | `44:3763` | `44:3782` | p09 |

**O02** (2 variants)

| Variant | Title | Desktop | Mobile | Source |
|---|---|---|---|---|
| `O02MINE` | Входящи · Мои | `66:34585` | `66:34636` | p09 |
| `O02UNCLAIMED` | Входящи · Непоети | `66:34531` | `66:34558` | p09 |

**O03** (26 variants)

| Variant | Title | Desktop | Mobile | Source |
|---|---|---|---|---|
| `O03A` | Преглед на назначаването | `20:825` | `25:2138` | p09 |
| `O03AR` | Записано назначаване · DEMO | `20:942` | `25:2186` | p09 |
| `O03L` | Свързване или създаване на преписка | `20:1055` | `25:2228` | p09 |
| `O03LR` | Записано свързване · DEMO | `20:1175` | `25:2279` | p09 |
| `O03N` | Създаване след квалифициране | `21:2399` | `28:2817` | p09 |
| `O03NR` | Преписка е създадена · DEMO | `21:2525` | `28:2875` | p09 |
| `O03R` | Разговор за дългосрочен наем | `21:2966` | `28:3097` | p09 |
| `O03RASSIGN` | Поемане на наемното запитване | `45:8037` | `45:8072` | p09 |
| `O03RASSIGNED` | Отговорникът е записан | `45:8107` | `45:8126` | p09 |
| `O03RCREATE` | Нова преписка след квалифициране | `45:8315` | `45:8364` | p09 |
| `O03RCREATED` | Новата наемна преписка е създадена | `45:8413` | `45:8432` | p09 |
| `O03RINT` | Наемно запитване · Никол | `45:7887` | `45:7962` | p09 |
| `O03RLINK` | Свързване с наемна преписка | `45:8145` | `45:8211` | p09 |
| `O03RLINKED` | Запитването е свързано | `45:8277` | `45:8296` | p09 |
| `O03RMSG` | Отговор по наемното запитване | `45:8705` | `45:8773` | p09 |
| `O03RMSGS` | Съобщението е прието за изпращане | `45:8841` | `45:8860` | p09 |
| `O03RMSGU` | Резултатът от съобщението още се проверява | `48:5389` | `48:5444` | p09 |
| `O03RMSGUCHECK` | Резултатът все още не е потвърден | `66:33471` | `66:33537` | p09 |
| `O03RRESOLVE` | Приключване на запитване без преписка | `45:8593` | `45:8630` | p09 |
| `O03RRESOLVED` | Решението е записано | `45:8667` | `45:8686` | p09 |
| `O03Z` | Приключване без преписка | `20:1288` | `25:2321` | p09 |
| `O03ZR` | Записано решение · DEMO | `20:1405` | `25:2369` | p09 |
| `O03COLLECTIVE` | Избор от сравнение | `497:767` | `498:674` | shared-4_6 |
| `O03COLLECTIVEACCEPT` | Приемане и следващо действие | `506:816` | `507:720` | shared-4_6 |
| `O03COLLECTIVEREOPEN` | Приетото запитване е отворено | `506:1182` | `507:944` | shared-4_6 |
| `O03COLLECTIVERESULT` | Приемането е записано | `506:1001` | `507:834` | shared-4_6 |

**O04** (2 variants)

| Variant | Title | Desktop | Mobile | Source |
|---|---|---|---|---|
| `O04MINE` | Преписки · Мои | `52:4317` | `52:4362` | p09 |
| `O04NEEDS` | Преписки · Нужно действие | `52:4219` | `52:4268` | p09 |

**O05** (8 variants)

| Variant | Title | Desktop | Mobile | Source |
|---|---|---|---|---|
| `O05C` | Преглед на приключването | `20:583` | `25:2036` | p09 |
| `O05CR` | Приключено без сделка · DEMO | `20:706` | `25:2090` | p09 |
| `O05L` | Преписка при отдаване | `46:5293` | `46:5351` | p09 |
| `O05R` | Наемателска преписка · Никол | `44:7153` | `44:7215` | p09 |
| `O05RNEW` | Нова наемна преписка | `45:8451` | `45:8522` | p09 |
| `O05S` | Преписка за продажба · Собственик | `44:7277` | `44:7337` | p09 |
| `O05W` | Изчакване с отговорник и дата | `20:341` | `25:1934` | p09 |
| `O05WR` | Записано изчакване · DEMO | `20:464` | `25:1988` | p09 |

**O06** (1 variants)

| Variant | Title | Desktop | Mobile | Source |
|---|---|---|---|---|
| `O06R` | Участници и цел на документите при наем | `21:1879` | `28:2498` | p09 |

**O09** (3 variants)

| Variant | Title | Desktop | Mobile | Source |
|---|---|---|---|---|
| `O09CC` | Предложеният час вече е зает | `23:1413` | `30:5660` | p09 |
| `O09CF` | Преглед на потвърждението за оглед | `23:1297` | `30:5544` | p09 |
| `O09DST` | Уточнете часа и часовата зона | `23:1494` | `30:5741` | p09 |

**O10** (2 variants)

| Variant | Title | Desktop | Mobile | Source |
|---|---|---|---|---|
| `O10MINE` | Имоти и обяви · Мои | `52:4505` | `52:4548` | p09 |
| `O10NEEDS` | Имоти и обяви · Нужно действие | `52:4407` | `52:4456` | p09 |

**O11** (1 variants)

| Variant | Title | Desktop | Mobile | Source |
|---|---|---|---|---|
| `O11R` | Имот за дългосрочен наем | `48:4065` | `48:4136` | p09 |

**O12** (5 variants)

| Variant | Title | Desktop | Mobile | Source |
|---|---|---|---|---|
| `O12D200` | Работен контекст · Обява №200 | `44:7397` | `44:7495` | p09 |
| `O12D200S` | Черновата е записана · №200 | `45:3569` | `45:3588` | p09 |
| `O12D912` | Работен контекст · Обява №912 | `45:3607` | `45:3705` | p09 |
| `O12D912S` | Черновата е записана · №912 | `45:3803` | `45:3822` | p09 |
| `O12SAVED` | Работната чернова е записана | `42:4285` | `42:4304` | p09 |

**O13** (3 variants)

| Variant | Title | Desktop | Mobile | Source |
|---|---|---|---|---|
| `O13GALL` | Личен преглед на снимките · Версия 3 | `29:4124` | `33:3039` | p09 |
| `O13ORDER` | Преглед на новата подредба | `46:5049` | `46:5107` | p09 |
| `O13ORDERSAVED` | Новата подредба е записана | `46:5165` | `46:5184` | p09 |

**O15** (5 variants)

| Variant | Title | Desktop | Mobile | Source |
|---|---|---|---|---|
| `O15D200` | Езиков преглед · Обява №200 | `45:3841` | `45:3922` | p09 |
| `O15PF` | Преводът променя защитен факт | `23:2296` | `30:6543` | p09 |
| `O15REVIEW` | Човешки езиков преглед | `44:6983` | `44:7049` | p09 |
| `O15REVIEWED` | Езиковото решение е записано | `44:7115` | `44:7134` | p09 |
| `O15ST` | Източникът е променен по време на превода | `23:2390` | `30:6637` | p09 |

**O16** (3 variants)

| Variant | Title | Desktop | Mobile | Source |
|---|---|---|---|---|
| `O16AQ` | Активирането още се проверява | `23:2587` | `30:6834` | p09 |
| `O16EL` | Точният кандидат е допустим за решение | `23:2471` | `30:6718` | p09 |
| `O16G` | Какво остава преди публикуване | `22:1724` | `24:2261` | p09 |

**O17** (4 variants)

| Variant | Title | Desktop | Mobile | Source |
|---|---|---|---|---|
| `O17MINE` | Публикации и разпространение · Мои | `52:4689` | `52:4734` | p09 |
| `O17MV` | Ръчен канал: нужно е сверяване | `23:2677` | `30:6924` | p09 |
| `O17NEEDS` | Публикации и разпространение · Нужно действие | `52:4591` | `52:4640` | p09 |
| `O17WD` | Оттеглянето има оставащи проверки | `23:2767` | `30:7014` | p09 |

**O18** (3 variants)

| Variant | Title | Desktop | Mobile | Source |
|---|---|---|---|---|
| `O18CASE` | Изискване за асансьор | `189:4795` | `189:4920` | p09 |
| `O18MINE` | Задачи · Мои | `52:4877` | `52:4922` | p09 |
| `O18NEEDS` | Задачи · Нужно действие | `52:4779` | `52:4828` | p09 |

**O19** (17 variants)

| Variant | Title | Desktop | Mobile | Source |
|---|---|---|---|---|
| `O19CO` | Насрещни условия създават нова версия | `23:2193` | `30:6440` | p09 |
| `O19COMSG` | Насрещни условия v3 · Съобщение | `42:4873` | `42:4941` | p09 |
| `O19COMSGS` | Съобщението е прието за изпращане | `42:5009` | `42:5028` | p09 |
| `O19COMSGU` | Резултатът от съобщението още се проверява | `48:4729` | `48:4784` | p09 |
| `O19COMSGUCHECK` | Резултатът все още не е потвърден | `66:33603` | `66:33669` | p09 |
| `O19ELIGNEXT` | Подгответе искането за обхват | `244:9542` | `244:10704` | p09 |
| `O19MSG` | Предложение v2 · Съобщение | `42:4699` | `42:4767` | p09 |
| `O19MSGS` | Съобщението е прието за изпращане | `42:4835` | `42:4854` | p09 |
| `O19MSGU` | Резултатът от съобщението още се проверява | `48:4619` | `48:4674` | p09 |
| `O19MSGUCHECK` | Резултатът все още не е потвърден | `66:33735` | `66:33801` | p09 |
| `O19R` | Подготовка на наемно предложение | `21:2027` | `28:2577` | p09 |
| `O19REVIEW` | Човешки преглед на предложение | `42:4323` | `42:4400` | p09 |
| `O19RMSG` | Наемно предложение · Съобщение | `42:5047` | `42:5115` | p09 |
| `O19RMSGS` | Съобщението е прието за изпращане | `42:5183` | `42:5202` | p09 |
| `O19RMSGU` | Резултатът от съобщението още се проверява | `48:4839` | `48:4894` | p09 |
| `O19RMSGUCHECK` | Резултатът все още не е потвърден | `66:33867` | `66:33933` | p09 |
| `O19SAVED` | Предложението е записано като чернова | `42:4477` | `42:4498` | p09 |

**O20** (4 variants)

| Variant | Title | Desktop | Mobile | Source |
|---|---|---|---|---|
| `O20R` | Документи на наемателя | `43:3707` | `43:3782` | p09 |
| `O20S` | Документи на продавача | `43:3857` | `43:3932` | p09 |
| `O20SEALED` | Версията е запечатана; сканирането предстои | `43:3583` | `43:3645` | p09 |
| `O20UPLOAD` | Нова версия на служебен документ | `43:3429` | `43:3506` | p09 |

**O21** (4 variants)

| Variant | Title | Desktop | Mobile | Source |
|---|---|---|---|---|
| `O21E` | Редакция на съдържание | `20:173` | `25:1837` | p09 |
| `O21NEEDS` | Страници и съдържание · За преглед | `66:34687` | `66:34725` | p09 |
| `O21REVIEW` | Човешки преглед на съдържанието | `44:6817` | `44:6881` | p09 |
| `O21REVIEWED` | Редакционното решение е записано | `44:6945` | `44:6964` | p09 |

**O23** (21 variants)

| Variant | Title | Desktop | Mobile | Source |
|---|---|---|---|---|
| `O23A` | Служебен вход | `20:1518` | `25:2411` | p09 |
| `O23D` | Служебен достъп е отказан | `20:1632` | `25:2525` | p09 |
| `O23G` | Записано решение за достъп · DEMO | `21:690` | `25:2733` | p09 |
| `O23H` | Предаване на отворена работа | `21:788` | `25:2760` | p09 |
| `O23HD` | Прието предаване · DEMO | `21:1108` | `25:2942` | p09 |
| `O23HP` | Изчаква приемане на работата | `21:948` | `25:2851` | p09 |
| `O23M` | Hosted вход и MFA | `20:1542` | `25:2435` | p09 |
| `O23OFF` | Прекратяване на служебен достъп | `327:15031` | `327:15174` | p09 |
| `O23OFFAUTH` | Прекратяване на служебен достъп | `327:15471` | `327:15514` | p09 |
| `O23OFFCONFLICT` | Прекратяване на служебен достъп | `327:15557` | `327:15702` | p09 |
| `O23OFFDIR` | Прекратяване на служебен достъп | `327:14758` | `327:14930` | p09 |
| `O23OFFFORMER` | Прекратяване на служебен достъп | `327:16132` | `327:16258` | p09 |
| `O23OFFRECEIPT` | Прекратяване на служебен достъп | `327:15943` | `327:16073` | p09 |
| `O23OFFSELF` | Прекратяване на служебен достъп | `327:16315` | `327:16354` | p09 |
| `O23OFFUNKNOWN` | Прекратяване на служебен достъп | `327:15778` | `327:15896` | p09 |
| `O23OFFVALID` | Прекратяване на служебен достъп | `327:15248` | `327:15394` | p09 |
| `O23Q` | Текущ обхват след повторна проверка | `21:571` | `25:2683` | p09 |
| `O23R` | Възстановяване на втория фактор | `20:1656` | `25:2549` | p09 |
| `O23S` | Промяна на права: необходима проверка | `21:452` | `25:2633` | p09 |
| `O23T` | Потвърждение преди чувствителна промяна | `20:1716` | `25:2609` | p09 |
| `O23V` | Проверен служебен контекст · DEMO | `20:1608` | `25:2501` | p09 |

**O24** (6 variants)

| Variant | Title | Desktop | Mobile | Source |
|---|---|---|---|---|
| `O24CSV` | Човешки преглед на обявите · Доказателство | `46:4271` | `46:4346` | p09 |
| `O24BUTLER` | Butler worker · Доказателство | `46:3971` | `46:4046` | p09 |
| `O24MINE` | Работен статус · Мои | `52:5069` | `52:5112` | p09 |
| `O24NEEDS` | Работен статус · Нужно действие | `52:4967` | `52:5018` | p09 |
| `O24PAYLOAD` | Payload runtime · Доказателство | `46:4121` | `46:4196` | p09 |
| `O24SEARCH` | Търсене · Доказателство | `45:9115` | `45:9190` | p09 |

**O25** (2 variants)

| Variant | Title | Desktop | Mobile | Source |
|---|---|---|---|---|
| `O25CHECK` | Резултатът все още не е потвърден | `66:33999` | `66:34065` | p09 |
| `O25RS` | Възстановената среда остава затворена | `23:3050` | `30:7297` | p09 |

**O26** (5 variants)

| Variant | Title | Desktop | Mobile | Source |
|---|---|---|---|---|
| `O26L` | История на обявата | `46:4421` | `46:4466` | p09 |
| `O26MINE` | История и лични данни · Мои действия | `52:5245` | `52:5290` | p09 |
| `O26NEEDS` | История и лични данни · Нужно действие | `52:5155` | `52:5200` | p09 |
| `O26P` | История на предложението | `46:4511` | `46:4556` | p09 |
| `O26PR` | Заявка за лични данни | `46:4601` | `46:4646` | p09 |

**O27** (2 variants)

| Variant | Title | Desktop | Mobile | Source |
|---|---|---|---|---|
| `O27PENDING` | Прегледът е отложен с ангажимент | `52:5335` | `52:5391` | p09 |
| `O27SP` | Възстановяване след погрешно обединяване | `23:2857` | `30:7104` | p09 |

**O28** (3 variants)

| Variant | Title | Desktop | Mobile | Source |
|---|---|---|---|---|
| `O28CHECK` | Проблемни редове преди импорт | `52:5447` | `52:5516` | p09 |
| `O28M` | Съпоставяне и проверка на импорта | `20:32` | `25:1767` | p09 |
| `O28PR` | Импортът е приключил частично | `23:2947` | `30:7194` | p09 |

**O30** (2 variants)

| Variant | Title | Desktop | Mobile | Source |
|---|---|---|---|---|
| `O30REVIEW` | Преглед на следващия ангажимент | `42:4519` | `42:4590` | p09 |
| `O30SAVED` | Следващата задача е записана | `42:4661` | `42:4680` | p09 |

**O32** (7 variants)

| Variant | Title | Desktop | Mobile | Source |
|---|---|---|---|---|
| `O32CMS` | Butler · Чернова за страницата | `42:3329` | `42:3399` | p09 |
| `O32CONS` | Butler · Обобщение на консултацията | `42:3609` | `42:3679` | p09 |
| `O32COPY` | Butler · Чернова за BG описанието | `23:3157` | `30:7404` | p09 |
| `O32MATCH` | Butler · Обяснение за подбора | `42:3189` | `42:3259` | p09 |
| `O32PROP` | Butler · Чернова за предложение | `42:3469` | `42:3539` | p09 |
| `O32RENT` | Butler · Чернова за наемни условия | `42:3749` | `42:3819` | p09 |
| `O32TRANS` | Butler · Чернова за EN превод | `23:3266` | `33:3323` | p09 |

**O33** (2 variants)

| Variant | Title | Desktop | Mobile | Source |
|---|---|---|---|---|
| `O33E` | Оставащо разпространение и задачи | `21:1433` | `28:2238` | p09 |
| `O33R` | Ограничение преди замяна · DEMO | `21:1268` | `28:2144` | p09 |

**P02** (2 variants)

| Variant | Title | Desktop | Mobile | Source |
|---|---|---|---|---|
| `P02B` | Апартаменти до 130 000 € | `29:3926` | `33:2908` | p09 |
| `P02R` | Имоти под наем | `21:3114` | `28:3176` | p09 |

**P03** (2 variants)

| Variant | Title | Desktop | Mobile | Source |
|---|---|---|---|---|
| `P03EMPTY` | Критериите са изчистени | `46:5203` | `46:5248` | p09 |
| `P03R` | Вашето търсене под наем | `21:3189` | `28:3242` | p09 |

**P05** (1 variants)

| Variant | Title | Desktop | Mobile | Source |
|---|---|---|---|---|
| `P05R` | Дългосрочен наем · Демонстрационен пример | `21:2319` | `28:2743` | p09 |

**P11** (9 variants)

| Variant | Title | Desktop | Mobile | Source |
|---|---|---|---|---|
| `P11FILLED` | Запитване за имот №202 | `597:2224` | `598:18057` | p09 |
| `P11INVALID` | Поправете контакта | `598:17700` | `602:18134` | p09 |
| `P11SENDING` | Изпращаме запитването | `598:17787` | `602:18214` | p09 |
| `P11REJECTED` | Запитването не е изпратено | `598:17886` | `602:18306` | p09 |
| `P11OFFLINE` | Няма връзка | `598:17973` | `602:18386` | p09 |
| `P11COLLECTIVE` | Blank | `527:515` | `529:412` | shared-4_4 |
| `P11COLLECTIVE` | ContextChanged | `527:731` | `529:614` | shared-4_4 |
| `P11COLLECTIVE` | DEMO | `527:624` | `529:514` | shared-4_4 |
| `P11FILLEDHE` | פנייה לגבי נכס №202 | `-` | `602:18566` | shared-4_7 |

**P12** (8 variants)

| Variant | Title | Desktop | Mobile | Source |
|---|---|---|---|---|
| `P12RRES` | Наемното запитване е получено | `45:4553` | `45:4572` | p09 |
| `P12RU` | Наемното приемане още се проверява | `48:4503` | `48:4532` | p09 |
| `P12RUCHECK` | Резултатът все още не е потвърден | `66:34131` | `66:34171` | p09 |
| `P12U` | Проверяваме получаването | `22:1666` | `24:2203` | p09 |
| `P12UCHECK` | Резултатът все още не е потвърден | `66:34211` | `66:34251` | p09 |
| `P12COMMITTED` | Запитването е получено | `602:18463` | `602:18519` | p09 |
| `P12COLLECTIVE` | DEMO receipt | `527:839` | `529:715` | shared-4_4 |
| `P12COMMITTEDHE` | הפנייה התקבלה | `-` | `602:18638` | shared-4_7 |

**P13** (2 variants)

| Variant | Title | Desktop | Mobile | Source |
|---|---|---|---|---|
| `P13R` | Оглед на имот под наем | `23:3552` | `28:3457` | p09 |
| `P13RREV` | Преглед на заявката за оглед под наем | `45:4361` | `45:4438` | p09 |

**P17** (1 variants)

| Variant | Title | Desktop | Mobile | Source |
|---|---|---|---|---|
| `P17R` | Отдайте своя имот | `21:3272` | `28:3319` | p09 |

**P18** (3 variants)

| Variant | Title | Desktop | Mobile | Source |
|---|---|---|---|---|
| `P18R` | Заявка за отдаване | `23:3465` | `28:3375` | p09 |
| `P18REV` | Преглед на заявката за продажба | `48:4207` | `48:4278` | p09 |
| `P18RREV` | Преглед на заявката за отдаване | `45:4207` | `45:4284` | p09 |

**P19** (5 variants)

| Variant | Title | Desktop | Mobile | Source |
|---|---|---|---|---|
| `P19RRES` | Заявката за отдаване е получена | `45:4515` | `45:4534` | p09 |
| `P19RU` | Приемането на заявката за отдаване се проверява | `48:4561` | `48:4590` | p09 |
| `P19RUCHECK` | Резултатът все още не е потвърден | `66:34291` | `66:34331` | p09 |
| `P19U` | Проверяваме заявката за имота | `22:1695` | `24:2232` | p09 |
| `P19UCHECK` | Резултатът все още не е потвърден | `66:34371` | `66:34411` | p09 |

**P20** (4 variants)

| Variant | Title | Desktop | Mobile | Source |
|---|---|---|---|---|
| `P20L` | Обсъдете отдаването | `45:4789` | `45:4830` | p09 |
| `P20LREV` | Преглед · Посредничество при отдаване | `45:4871` | `45:4929` | p09 |
| `P20R` | Обсъдете търсенето под наем | `45:4591` | `45:4632` | p09 |
| `P20RREV` | Преглед · Дългосрочно наемане | `45:4673` | `45:4731` | p09 |

**P23** (2 variants)

| Variant | Title | Desktop | Mobile | Source |
|---|---|---|---|---|
| `P23RES` | Консултационното запитване е получено | `48:4465` | `48:4484` | p09 |
| `P23REV` | Преглед на консултационното запитване | `48:4349` | `48:4407` | p09 |

## Appendix B · Page-14 specimens

| Frame | Id | Note |
|---|---|---|
| Responsive / P02 / Имоти в Сандански / Tablet 768 | `40:5` | 768×3171 |
| Responsive / C05 / Предложени и запазени имоти / Tablet 768 | `40:95` | 768×1787 |
| Responsive / O01 / Добро утро, Мария. / Laptop 1024 | `40:157` | 1024×1270 |
| Dark / Agency Today | `40:364` | 1440×1124 |
| RTL / Hebrew client layout | `56:114` | 390×980 |
| SPEC / Offboarding narrow stress | `327:17695` | 320×900 |

## Appendix C · Visual spot-check and overflow scan

One Desktop and one Mobile frame per journey were exported at 0.3× and viewed as contact sheets (whole frame first). At that scale layout-level faults are visible (clipped cards, overlapping blocks, content past the frame edge); small-text faults are not, so a programmatic scan backs it.

| Journey | Desktop frame | Mobile frame | Result |
|---|---|---|---|
| W01 | P05 `11:1031` | P01 `11:8015` | no clipping, overlap or content past the edge seen |
| W02 | P07 `29:531` | P08 `11:8515` | no clipping, overlap or content past the edge seen |
| W03 | O03 `18:732` | O02 `18:2905` | no clipping, overlap or content past the edge seen |
| W04 | O05 `18:914` | C03 `11:671` | no clipping, overlap or content past the edge seen |
| W05 | O19 `11:6120` | C10 `12:1304` | no clipping, overlap or content past the edge seen |
| W06 | O09 `14:906` | C06 `12:1057` | no clipping, overlap or content past the edge seen |
| W07 | C12 `14:2627` | P18 `12:504` | no clipping, overlap or content past the edge seen |
| W08 | O12 `11:356` | O16 `18:3002` | no clipping, overlap or content past the edge seen |
| W09 | O32 `18:1610` | C07 `11:745` | no clipping, overlap or content past the edge seen |
| W10 | C08 `11:3049` | O20 `15:598` | no clipping, overlap or content past the edge seen |
| W11 | O33 `18:1293` | O25 `15:871` | no clipping, overlap or content past the edge seen |
| W12 | O28 `14:1717` | O27 `15:1014` | no clipping, overlap or content past the edge seen |
| W13 | P20 `13:857` | C14 `14:3341` | no clipping, overlap or content past the edge seen |
| W14 | O24 `11:6813` | O26 `15:953` | no clipping, overlap or content past the edge seen |

Programmatic scan over all 146 journey frames (73 screens × Desktop and Mobile): 0 text nodes extending beyond their parent, 0 text nodes with ending truncation, 0 visible nodes extending beyond the frame width, 0 clipped text. Extra frames viewed at 0.55–0.6×: `16:1077` (O33 Mobile, densest copy) and the Hebrew specimen `56:114` — no defects.

Content defects (not visual) found while checking: the receipt P12 shows «Без избран имот · Общо запитване до екипа» after a property or viewing request; see the W01, W02 and W06 keys.
