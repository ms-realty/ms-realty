# Server-produced copy deck

Wording for every person-facing string the server produces: errors, authentication emails, search alerts, the staff inquiry notice, case and viewing email wrappers, command receipts and Butler receipts. The UI master owns the wording; Codex binds the keys to the server seams after this deck lands in the catalogs (`CODEX-UI-COORDINATION.md`, section "Codex msr-impl · Entire UI zero-training: server text contract and preview gate").

- **Status:** draft, not reviewed. Every locale needs a named human reviewer before it counts (`messages/_status.json`). Hebrew is a layout-review draft until a person approves it.
- **Source head:** `f399038355e0242bd7ad313612557e61448bd740` (key contract `server-copy-key-contract.json`), checked against the worktree sources `src/server/errors.ts`, `src/server/jobs/resend.ts`, `src/server/subscriptions/template.ts`, `src/server/inquiries/notifications.ts`, `src/server/cases/email*.ts`, `src/server/appointments/email-calendar.ts`, `src/domain/butler.ts`, `src/server/operations.ts`.
- **Gate:** `design/zero-learning/GATE.md` G2 (no internal words on primary surfaces) and G3.6–G3.7 (no dead ends; unknown shown as unknown).

## Conventions

**Surfaces and locales.** `P` public site, `C` client area, `S` staff. Public and client strings ship in bg (source), en, ru, de, nl, el, he. Staff-only strings ship in bg, en, ru (owner decision). The `server.errors.*` family is shared by every surface and the key contract requires all seven locales for it, so all 26 pairs get seven locales; where staff need different wording, a **staff override** row is given for the staff catalog set (`messages/staff/<locale>/`).

**Shape.** `message` says in one sentence what happened. `next` says in one sentence what the person can do now. Wire codes, state names and ids never appear as visible text.

**Address forms.**
- bg: polite «Вие» with capitals (Вие, Вас, Ви, Ваш), verb + object («Поискайте нова връзка»).
- ru: «вы» in lower case, matching the existing catalogs.
- de: «Sie».
- nl: «u».
- el: polite plural.
- he: plural, gender-neutral forms (as in `messages/he/*.json`).

**Fixed tokens.** Keep `MS Realty`, `Butler`, references such as `RQ-2026-000061`, listing numbers and the brand line `+359879696870` exactly as they are in every locale, Hebrew included. Never add invisible bidi characters to catalog text. The UI isolates every parameter, reference and phone number (`<bdi>` / `dir="ltr"`) in right-to-left layouts.

**Vocabulary (owner decision).** Staff copy names a client's purchase, sale or rental «Сделка / Сделки» (bg), «Сделка / Сделки» (ru), «Deal / Deals» (en). Clients see «Моята покупка / продажба / наем» and never the staff noun. «Случай», «преписка», «дело» and «case» never appear in any locale; `case` survives only inside key names and code identifiers, which are not visible text.

**Parameters.** ICU MessageFormat. Every `{param}` is listed per row. Date and time parameters arrive already formatted for the locale **with the time zone named**; the catalog never builds a date. Person, property and file names are inserted as given and never translated.

**Recovery truths (binding).**

| Outcome | What the copy must do |
|---|---|
| Known not applied | Keep what the person entered; say exactly what to correct. |
| Sign-in, link or access | Offer a new link, sign-in again or asking for access; never offer a record the person cannot open. |
| Stale data | Show the latest version and ask for a fresh review; never overwrite automatically. |
| Pending or unknown | Say confirmation is missing and what to check; never call it failed or done; never invite a blind resend. |
| Unavailable | Name what is missing and offer the real alternative. |
| Rate limit or outage | Say whether anything was saved and when retrying is safe. |

The UI renders by the response's `outcome`, not only by its code: any response whose `outcome` is `unknown` uses the `server.errors.outcome_unknown` pair, whatever its code. This covers `unavailable` raised with `outcome: "unknown"` in `operations.ts`.

---

## 1. `server.errors.<code>.message` / `.next`

Surfaces: P C S unless noted. Parameters: none unless noted. Source: `src/server/errors.ts` (26 definitions). The English fallback in `errors.ts` stays as the machine fallback until the catalogs are bound.

**Must stay technically true.**
- Each pair matches the code's `outcome`. A `not_applied` code may say nothing was changed. `operation_pending`, `outcome_unknown` and `internal_error` never say failed, done or saved. They never invite a resend, even though `operation_pending` and `internal_error` are `retryable: true`.
- `not_found` also answers unauthorized reads of private records. Its copy must never confirm that the item exists.
- Sign-in links, passkeys and invitations: clients sign in by email link or passkey; staff never sign in by email. Staff override rows remove the email-link route.
- The `correlationId` is a raw id and is never shown as an instruction. A human support reference is an open question (section 9).
- "What you entered is kept" is a UI obligation (G3.6): native and enhanced forms must re-render the submitted safe values for every `not_applied` error.
- `rate_limited` carries `retryAfterSeconds` from `rate-limit.ts` but not from `ai/assistance.ts`. Use `nextTimed` only when the value is present (minutes = ceil(seconds / 60)), otherwise `next`.

### validation_failed · not_applied

| | message | next |
|---|---|---|
| bg | Някои данни трябва да се поправят, преди да можем да приемем това. | Проверете данните, поправете грешното и изпратете отново. |
| en | Some details need to be corrected before we can accept this. | Check the details, correct what is wrong and send again. |
| ru | Некоторые данные нужно исправить, прежде чем мы сможем это принять. | Проверьте данные, исправьте ошибки и отправьте снова. |
| de | Einige Angaben müssen korrigiert werden, bevor wir das annehmen können. | Prüfen Sie die Angaben, korrigieren Sie, was nicht stimmt, und senden Sie erneut. |
| nl | Sommige gegevens moeten worden verbeterd voordat we dit kunnen aannemen. | Controleer de gegevens, verbeter wat niet klopt en verstuur opnieuw. |
| el | Ορισμένα στοιχεία πρέπει να διορθωθούν για να μπορέσουμε να το δεχτούμε. | Ελέγξτε τα στοιχεία, διορθώστε ό,τι είναι λάθος και στείλτε ξανά. |
| he | צריך לתקן כמה פרטים לפני שנוכל לקבל את זה. | בדקו את הפרטים, תקנו את מה שלא נכון ושלחו שוב. |

### unauthenticated · not_applied

| | message | next |
|---|---|---|
| bg | За да продължите, трябва да влезете. | Влезте и ще Ви върнем на тази страница. |
| en | You need to sign in to continue. | Sign in and we will bring you back to this page. |
| ru | Чтобы продолжить, нужно войти. | Войдите, и мы вернём вас на эту страницу. |
| de | Bitte melden Sie sich an, um fortzufahren. | Melden Sie sich an; danach bringen wir Sie zu dieser Seite zurück. |
| nl | U moet zich aanmelden om verder te gaan. | Meld u aan, dan brengen we u terug naar deze pagina. |
| el | Πρέπει να συνδεθείτε για να συνεχίσετε. | Συνδεθείτε και θα σας επιστρέψουμε σε αυτή τη σελίδα. |
| he | כדי להמשיך צריך להתחבר. | התחברו ונחזיר אתכם לדף הזה. |

### step_up_required · not_applied

| | message | next |
|---|---|---|
| bg | За тази стъпка трябва да потвърдим, че сте Вие. | Потвърдете, че сте Вие, и повторете стъпката; засега нищо не е променено. |
| en | For this step we need to confirm it is you. | Confirm it is you, then repeat the step; nothing has changed yet. |
| ru | Для этого шага нужно подтвердить, что это вы. | Подтвердите, что это вы, и повторите шаг — пока ничего не изменено. |
| de | Für diesen Schritt müssen wir bestätigen, dass Sie es sind. | Bestätigen Sie, dass Sie es sind, und wiederholen Sie den Schritt; bisher wurde nichts geändert. |
| nl | Voor deze stap moeten we bevestigen dat u het bent. | Bevestig dat u het bent en herhaal de stap; er is nog niets gewijzigd. |
| el | Για αυτό το βήμα πρέπει να επιβεβαιώσουμε ότι είστε εσείς. | Επιβεβαιώστε ότι είστε εσείς και επαναλάβετε το βήμα· δεν έχει αλλάξει τίποτα ακόμη. |
| he | בשלב הזה עלינו לאשר שזה אתם. | אשרו שזה אתם וחזרו על השלב – עדיין לא שונה דבר. |

### forbidden · not_applied

| | message | next |
|---|---|---|
| bg | Нямате права за това действие, затова нищо не е променено. | Помолете човека, който го управлява, да Ви даде достъп. |
| en | You do not have permission to do this, so nothing was changed. | Ask the person who manages it to give you access. |
| ru | У вас нет прав на это действие, поэтому ничего не изменено. | Попросите того, кто этим управляет, открыть вам доступ. |
| de | Sie haben dafür keine Berechtigung, daher wurde nichts geändert. | Bitten Sie die zuständige Person, Ihnen Zugriff zu geben. |
| nl | U hebt hiervoor geen toestemming, dus er is niets gewijzigd. | Vraag de beheerder om u toegang te geven. |
| el | Δεν έχετε άδεια για αυτή την ενέργεια, οπότε δεν άλλαξε τίποτα. | Ζητήστε από τον υπεύθυνο να σας δώσει πρόσβαση. |
| he | אין לכם הרשאה לפעולה הזו, ולכן לא שונה דבר. | בקשו מהאחראי לתת לכם גישה. |

### butler_approval_required · not_applied

Reached in practice from staff screens; seven locales because the family is shared.

| | message | next |
|---|---|---|
| bg | Butler не извърши тази стъпка. Служител с нужните права трябва да я извърши ръчно. | Прегледайте данните и използвайте ръчното действие или помолете служител с нужните права. |
| en | Butler did not take this step. An authorized staff member must do it manually. | Review the details and use the manual action, or ask an authorized staff member. |
| ru | Butler не выполнил этот шаг. Сотрудник с нужными правами должен выполнить его вручную. | Проверьте данные и выполните шаг вручную или обратитесь к сотруднику с нужными правами. |
| de | Butler hat diesen Schritt nicht ausgeführt. Ein Teammitglied mit den nötigen Rechten muss ihn manuell ausführen. | Prüfen Sie die Angaben und nutzen Sie die manuelle Aktion, oder bitten Sie ein berechtigtes Teammitglied. |
| nl | Butler heeft deze stap niet uitgevoerd. Een medewerker met toestemming moet dit handmatig doen. | Controleer de gegevens en voer de stap handmatig uit, of vraag een bevoegde medewerker. |
| el | Το Butler δεν έκανε αυτό το βήμα. Ένας εξουσιοδοτημένος υπάλληλος πρέπει να το κάνει χειροκίνητα. | Ελέγξτε τα στοιχεία και εκτελέστε το βήμα χειροκίνητα ή ζητήστε το από εξουσιοδοτημένο υπάλληλο. |
| he | Butler לא ביצע את השלב הזה. איש צוות עם הרשאה מתאימה צריך לבצע אותו ידנית. | בדקו את הפרטים ובצעו את השלב ידנית, או פנו לאיש צוות עם ההרשאה המתאימה. |

### not_found · not_applied

| | message | next |
|---|---|---|
| bg | Не намерихме това или то не е споделено с Вас. | Проверете връзката или помолете човека, който я е изпратил, да я сподели отново. |
| en | We could not find this, or it is not shared with you. | Check the link, or ask the person who sent it to share it again. |
| ru | Мы не нашли это, или доступ к нему вам не открыт. | Проверьте ссылку или попросите отправителя поделиться ею ещё раз. |
| de | Wir konnten das nicht finden, oder es ist nicht für Sie freigegeben. | Prüfen Sie den Link oder bitten Sie die Person, die ihn geschickt hat, ihn erneut zu teilen. |
| nl | We konden dit niet vinden, of het is niet met u gedeeld. | Controleer de link of vraag de afzender om hem opnieuw te delen. |
| el | Δεν το βρήκαμε ή δεν έχει κοινοποιηθεί σε εσάς. | Ελέγξτε τον σύνδεσμο ή ζητήστε από όποιον τον έστειλε να τον μοιραστεί ξανά. |
| he | לא מצאנו את זה, או שזה לא שותף איתכם. | בדקו את הקישור או בקשו ממי ששלח אותו לשתף אותו שוב. |

### cross_origin_request · not_applied

| | message | next |
|---|---|---|
| bg | За Ваша сигурност не приехме това, защото е изпратено от друга страница. | Отворете отново тази страница на нашия сайт и изпратете оттам. |
| en | For your safety, we did not accept this because it was sent from another page. | Open this page again on our website and send it from there. |
| ru | В целях безопасности мы не приняли это: запрос пришёл с другой страницы. | Откройте эту страницу заново на нашем сайте и отправьте оттуда. |
| de | Zu Ihrer Sicherheit haben wir das nicht angenommen, weil es von einer anderen Seite gesendet wurde. | Öffnen Sie diese Seite erneut auf unserer Website und senden Sie es von dort. |
| nl | Voor uw veiligheid hebben we dit niet aangenomen, omdat het vanaf een andere pagina is verzonden. | Open deze pagina opnieuw op onze website en verstuur het vanaf daar. |
| el | Για την ασφάλειά σας δεν το δεχτήκαμε, επειδή στάλθηκε από άλλη σελίδα. | Ανοίξτε ξανά αυτή τη σελίδα στον ιστότοπό μας και στείλτε το από εκεί. |
| he | למען ביטחונכם לא קיבלנו את זה, כי זה נשלח מדף אחר. | פתחו שוב את הדף הזה באתר שלנו ושלחו משם. |

### version_conflict · not_applied

The response carries `current`; the UI shows it next to the person's kept entries and never merges automatically.

| | message | next |
|---|---|---|
| bg | Някой е променил това, докато работехте, затова промяната Ви не е запазена. | Отворете последната версия, вижте какво е променено и направете промяната отново, ако още е нужна. |
| en | Someone changed this while you were working, so your change was not saved. | Open the latest version, check what changed, then make your change again if it is still needed. |
| ru | Кто-то изменил это, пока вы работали, поэтому ваше изменение не сохранено. | Откройте последнюю версию, посмотрите, что изменилось, и внесите изменение снова, если оно ещё нужно. |
| de | Jemand hat das geändert, während Sie daran gearbeitet haben, daher wurde Ihre Änderung nicht gespeichert. | Öffnen Sie die neueste Fassung, prüfen Sie die Änderungen und nehmen Sie Ihre Änderung erneut vor, falls sie noch nötig ist. |
| nl | Iemand heeft dit gewijzigd terwijl u eraan werkte, dus uw wijziging is niet opgeslagen. | Open de nieuwste versie, bekijk wat er is veranderd en breng uw wijziging opnieuw aan als die nog nodig is. |
| el | Κάποιος το άλλαξε ενώ δουλεύατε, οπότε η αλλαγή σας δεν αποθηκεύτηκε. | Ανοίξτε την πιο πρόσφατη εκδοχή, δείτε τι άλλαξε και κάντε ξανά την αλλαγή σας, αν χρειάζεται ακόμη. |
| he | מישהו שינה את זה בזמן שעבדתם, ולכן השינוי שלכם לא נשמר. | פתחו את הגרסה העדכנית, בדקו מה השתנה ובצעו את השינוי שוב אם הוא עדיין נחוץ. |

### idempotency_key_reused · not_applied

| | message | next |
|---|---|---|
| bg | Тази заявка повтаря по-ранен опит, но с други данни, затова не я изпълнихме. | Презаредете страницата, за да проверите текущото състояние, и започнете отначало, ако промяната още е нужна. |
| en | This request repeats an earlier attempt with different details, so we did not carry it out. | Reload the page to check the current state, then start again if the change is still needed. |
| ru | Этот запрос повторяет более раннюю попытку, но с другими данными, поэтому мы его не выполнили. | Обновите страницу, чтобы проверить текущее состояние, и начните заново, если изменение ещё нужно. |
| de | Diese Anfrage wiederholt einen früheren Versuch mit anderen Angaben, daher haben wir sie nicht ausgeführt. | Laden Sie die Seite neu, um den aktuellen Stand zu prüfen, und beginnen Sie neu, falls die Änderung noch nötig ist. |
| nl | Dit verzoek herhaalt een eerdere poging met andere gegevens, dus we hebben het niet uitgevoerd. | Laad de pagina opnieuw om de huidige stand te controleren en begin opnieuw als de wijziging nog nodig is. |
| el | Αυτό το αίτημα επαναλαμβάνει μια προηγούμενη προσπάθεια με άλλα στοιχεία, οπότε δεν το εκτελέσαμε. | Ανανεώστε τη σελίδα για να ελέγξετε την τρέχουσα κατάσταση και ξεκινήστε από την αρχή, αν η αλλαγή χρειάζεται ακόμη. |
| he | הבקשה הזו חוזרת על ניסיון קודם עם פרטים אחרים, ולכן לא ביצענו אותה. | טענו מחדש את הדף כדי לבדוק את המצב הנוכחי, והתחילו מחדש אם השינוי עדיין נחוץ. |

### operation_pending · unknown

| | message | next |
|---|---|---|
| bg | Все още обработваме предишната Ви заявка и тя още не е потвърдена. | Изчакайте малко и презаредете страницата, за да видите резултата; не я изпращайте отново. |
| en | We are still working on your earlier request, and it is not confirmed yet. | Wait a moment and reload this page to see the result; do not send it again. |
| ru | Мы ещё обрабатываем ваш предыдущий запрос, и он пока не подтверждён. | Подождите немного и обновите страницу, чтобы увидеть результат; не отправляйте повторно. |
| de | Wir bearbeiten Ihre vorherige Anfrage noch; sie ist noch nicht bestätigt. | Warten Sie kurz und laden Sie die Seite neu, um das Ergebnis zu sehen; senden Sie sie nicht erneut. |
| nl | We zijn nog bezig met uw eerdere verzoek; het is nog niet bevestigd. | Wacht even en laad deze pagina opnieuw om het resultaat te zien; verstuur het niet opnieuw. |
| el | Επεξεργαζόμαστε ακόμη το προηγούμενο αίτημά σας και δεν έχει επιβεβαιωθεί. | Περιμένετε λίγο και ανανεώστε τη σελίδα για να δείτε το αποτέλεσμα· μην το στείλετε ξανά. |
| he | אנחנו עדיין מטפלים בבקשה הקודמת שלכם, והיא עוד לא אושרה. | המתינו רגע וטענו מחדש את הדף כדי לראות את התוצאה – אל תשלחו שוב. |

### outcome_unknown · unknown

The English fallback's "We are checking it" is dropped: no automatic reconciler is promised for every command.

| | message | next |
|---|---|---|
| bg | Не успяхме да потвърдим дали това е изпълнено. | Презаредете страницата и проверете дали промяната е там, преди да опитате отново. |
| en | We could not confirm whether this went through. | Reload this page and check whether the change is there before you try again. |
| ru | Мы не смогли подтвердить, выполнено ли это. | Обновите страницу и проверьте, есть ли изменение, прежде чем повторять. |
| de | Wir konnten nicht bestätigen, ob das durchgeführt wurde. | Laden Sie die Seite neu und prüfen Sie, ob die Änderung da ist, bevor Sie es erneut versuchen. |
| nl | We konden niet bevestigen of dit is gelukt. | Laad deze pagina opnieuw en controleer of de wijziging er staat voordat u het opnieuw probeert. |
| el | Δεν μπορέσαμε να επιβεβαιώσουμε αν ολοκληρώθηκε. | Ανανεώστε τη σελίδα και ελέγξτε αν η αλλαγή υπάρχει πριν το επαναλάβετε. |
| he | לא הצלחנו לאשר אם הפעולה בוצעה. | טענו מחדש את הדף ובדקו אם השינוי מופיע לפני שתנסו שוב. |

### approval_stale · not_applied

| | message | next |
|---|---|---|
| bg | Това е променено след одобрението, затова одобрението вече не важи. | Прегледайте текущата версия и я одобрете отново или помолете човека, който одобрява. |
| en | This changed after it was approved, so the approval no longer applies. | Review the current version and approve it again, or ask the person who approves it. |
| ru | Это изменилось после одобрения, поэтому одобрение больше не действует. | Проверьте текущую версию и одобрите её снова или попросите того, кто одобряет. |
| de | Das wurde nach der Freigabe geändert, daher gilt die Freigabe nicht mehr. | Prüfen Sie die aktuelle Fassung und geben Sie sie erneut frei, oder bitten Sie die freigebende Person darum. |
| nl | Dit is gewijzigd na de goedkeuring, dus die goedkeuring geldt niet meer. | Bekijk de huidige versie en keur die opnieuw goed, of vraag het aan degene die goedkeurt. |
| el | Αυτό άλλαξε μετά την έγκριση, οπότε η έγκριση δεν ισχύει πια. | Ελέγξτε την τρέχουσα εκδοχή και εγκρίνετέ την ξανά ή ζητήστε το από αυτόν που εγκρίνει. |
| he | זה השתנה אחרי שאושר, ולכן האישור כבר לא בתוקף. | עברו על הגרסה הנוכחית ואשרו אותה שוב, או בקשו זאת ממי שמאשר. |

### publication_ineligible · not_applied

| | message | next |
|---|---|---|
| bg | Тази обява още не може да се публикува, защото липсват одобрения. | Отворете списъка за публикуване, за да видите какво липсва и кой може да го одобри. |
| en | This listing cannot be published yet because some approvals are missing. | Open the publishing checklist to see what is missing and who can approve it. |
| ru | Это объявление пока нельзя опубликовать: не хватает одобрений. | Откройте список для публикации, чтобы увидеть, чего не хватает и кто может это одобрить. |
| de | Dieses Inserat kann noch nicht veröffentlicht werden, weil Freigaben fehlen. | Öffnen Sie die Checkliste zur Veröffentlichung, um zu sehen, was fehlt und wer es freigeben kann. |
| nl | Deze advertentie kan nog niet worden gepubliceerd, omdat er goedkeuringen ontbreken. | Open de publicatiechecklist om te zien wat ontbreekt en wie het kan goedkeuren. |
| el | Αυτή η αγγελία δεν μπορεί να δημοσιευτεί ακόμη, επειδή λείπουν εγκρίσεις. | Ανοίξτε τη λίστα ελέγχου δημοσίευσης για να δείτε τι λείπει και ποιος μπορεί να το εγκρίνει. |
| he | עדיין אי אפשר לפרסם את המודעה הזו, כי חסרים אישורים. | פתחו את רשימת הבדיקה לפרסום כדי לראות מה חסר ומי יכול לאשר. |

### listing_unavailable · not_applied

| | message | next |
|---|---|---|
| bg | Този имот в момента не се предлага. | Разгледайте подобни имоти или ни попитайте за този. |
| en | This property is not available at the moment. | Browse similar properties, or ask us about this one. |
| ru | Этот объект сейчас не предлагается. | Посмотрите похожие объекты или спросите нас об этом. |
| de | Diese Immobilie wird derzeit nicht angeboten. | Sehen Sie sich ähnliche Immobilien an oder fragen Sie uns nach dieser. |
| nl | Deze woning wordt op dit moment niet aangeboden. | Bekijk vergelijkbare woningen of vraag ons naar deze. |
| el | Αυτό το ακίνητο δεν διατίθεται αυτή τη στιγμή. | Δείτε παρόμοια ακίνητα ή ρωτήστε μας για αυτό. |
| he | הנכס הזה לא מוצע כרגע. | עיינו בנכסים דומים או שאלו אותנו עליו. |

### transition_denied · not_applied

| | message | next |
|---|---|---|
| bg | Тази стъпка не е възможна в момента, затова нищо не е променено. | Презаредете страницата, за да видите докъде е стигнало. |
| en | This step is not possible right now, so nothing was changed. | Reload the page to see where things stand now. |
| ru | Сейчас этот шаг невозможен, поэтому ничего не изменено. | Обновите страницу, чтобы увидеть текущее положение. |
| de | Dieser Schritt ist gerade nicht möglich, daher wurde nichts geändert. | Laden Sie die Seite neu, um den aktuellen Stand zu sehen. |
| nl | Deze stap is nu niet mogelijk, dus er is niets gewijzigd. | Laad de pagina opnieuw om te zien hoe het er nu voor staat. |
| el | Αυτό το βήμα δεν είναι δυνατό τώρα, οπότε δεν άλλαξε τίποτα. | Ανανεώστε τη σελίδα για να δείτε πού βρίσκεται τώρα. |
| he | אי אפשר לבצע את השלב הזה כרגע, ולכן לא שונה דבר. | טענו מחדש את הדף כדי לראות את המצב העדכני. |

### link_invalid · not_applied

Surfaces: P C (client email sign-in). Staff override covers staff invitation links that reach this code.

| | message | next |
|---|---|---|
| bg | Тази връзка за вход не работи. | Поискайте нова връзка за вход. |
| en | This sign-in link does not work. | Request a new sign-in link. |
| ru | Эта ссылка для входа не работает. | Запросите новую ссылку для входа. |
| de | Dieser Anmeldelink funktioniert nicht. | Fordern Sie einen neuen Anmeldelink an. |
| nl | Deze aanmeldlink werkt niet. | Vraag een nieuwe aanmeldlink aan. |
| el | Αυτός ο σύνδεσμος σύνδεσης δεν λειτουργεί. | Ζητήστε νέο σύνδεσμο σύνδεσης. |
| he | קישור ההתחברות הזה לא עובד. | בקשו קישור התחברות חדש. |
| **staff** bg | Тази връзка не работи. | Помолете Вашия ръководител за нова покана. |
| **staff** en | This link does not work. | Ask your manager for a new invitation. |
| **staff** ru | Эта ссылка не работает. | Попросите руководителя прислать новое приглашение. |

### link_expired · not_applied

| | message | next |
|---|---|---|
| bg | Връзката за вход е изтекла; тези връзки важат кратко време. | Поискайте нова връзка и я отворете скоро след като пристигне. |
| en | This sign-in link has expired; these links work only for a short time. | Request a new link and open it soon after it arrives. |
| ru | Срок действия ссылки для входа истёк: такие ссылки действуют недолго. | Запросите новую ссылку и откройте её вскоре после получения. |
| de | Dieser Anmeldelink ist abgelaufen; solche Links gelten nur kurz. | Fordern Sie einen neuen Link an und öffnen Sie ihn bald nach Erhalt. |
| nl | Deze aanmeldlink is verlopen; zulke links werken maar kort. | Vraag een nieuwe link aan en open die kort nadat u hem ontvangt. |
| el | Ο σύνδεσμος σύνδεσης έληξε· αυτοί οι σύνδεσμοι ισχύουν για λίγο. | Ζητήστε νέο σύνδεσμο και ανοίξτε τον σύντομα μόλις φτάσει. |
| he | תוקף קישור ההתחברות פג – קישורים כאלה תקפים לזמן קצר. | בקשו קישור חדש ופתחו אותו זמן קצר אחרי שיגיע. |

### link_consumed · not_applied

| | message | next |
|---|---|---|
| bg | Тази връзка за вход вече е използвана. | Ако не сте влезли, поискайте нова връзка. |
| en | This sign-in link has already been used. | If you are not signed in, request a new link. |
| ru | Эта ссылка для входа уже использована. | Если вы не вошли, запросите новую ссылку. |
| de | Dieser Anmeldelink wurde bereits verwendet. | Wenn Sie nicht angemeldet sind, fordern Sie einen neuen Link an. |
| nl | Deze aanmeldlink is al gebruikt. | Bent u niet aangemeld, vraag dan een nieuwe link aan. |
| el | Αυτός ο σύνδεσμος σύνδεσης έχει ήδη χρησιμοποιηθεί. | Αν δεν έχετε συνδεθεί, ζητήστε νέο σύνδεσμο. |
| he | כבר השתמשו בקישור ההתחברות הזה. | אם אינכם מחוברים, בקשו קישור חדש. |

### link_revoked · not_applied

The English fallback's "withdrawn" stays neutral: no server path today records why a sign-in link was revoked, so the copy gives no reason.

| | message | next |
|---|---|---|
| bg | Тази връзка за вход е отменена и вече не работи. | Поискайте нова връзка за вход. |
| en | This sign-in link has been cancelled and no longer works. | Request a new sign-in link. |
| ru | Эта ссылка для входа отменена и больше не работает. | Запросите новую ссылку для входа. |
| de | Dieser Anmeldelink wurde aufgehoben und funktioniert nicht mehr. | Fordern Sie einen neuen Anmeldelink an. |
| nl | Deze aanmeldlink is ingetrokken en werkt niet meer. | Vraag een nieuwe aanmeldlink aan. |
| el | Αυτός ο σύνδεσμος σύνδεσης ακυρώθηκε και δεν λειτουργεί πια. | Ζητήστε νέο σύνδεσμο σύνδεσης. |
| he | קישור ההתחברות הזה בוטל ואינו עובד עוד. | בקשו קישור התחברות חדש. |

### invitation_expired · not_applied

| | message | next |
|---|---|---|
| bg | Тази покана е изтекла. | Помолете човека, който Ви е поканил, да изпрати нова. |
| en | This invitation has expired. | Ask the person who invited you to send a new one. |
| ru | Срок действия приглашения истёк. | Попросите пригласившего вас человека прислать новое. |
| de | Diese Einladung ist abgelaufen. | Bitten Sie die Person, die Sie eingeladen hat, um eine neue. |
| nl | Deze uitnodiging is verlopen. | Vraag degene die u heeft uitgenodigd om een nieuwe. |
| el | Αυτή η πρόσκληση έληξε. | Ζητήστε από το άτομο που σας προσκάλεσε να σας στείλει νέα. |
| he | תוקף ההזמנה הזו פג. | בקשו מהאדם שהזמין אתכם לשלוח הזמנה חדשה. |

### invitation_used · not_applied

| | message | next |
|---|---|---|
| bg | На тази покана вече е отговорено. | Влезте, за да видите до какво имате достъп. |
| en | This invitation has already been answered. | Sign in to see what you have access to. |
| ru | На это приглашение уже ответили. | Войдите, чтобы увидеть, к чему у вас есть доступ. |
| de | Diese Einladung wurde bereits beantwortet. | Melden Sie sich an, um zu sehen, worauf Sie Zugriff haben. |
| nl | Deze uitnodiging is al beantwoord. | Meld u aan om te zien waartoe u toegang hebt. |
| el | Αυτή η πρόσκληση έχει ήδη απαντηθεί. | Συνδεθείτε για να δείτε σε τι έχετε πρόσβαση. |
| he | ההזמנה הזו כבר נענתה. | התחברו כדי לראות למה יש לכם גישה. |

### invitation_revoked · not_applied

Raised when a reissue replaced the invitation, the inviter lost authority, or the membership ended (`invitations.ts`); the copy names only the first, hedged.

| | message | next |
|---|---|---|
| bg | Тази покана вече не е валидна; може да е заменена с по-нова. | Използвайте най-новата покана в пощата си или попитайте човека, който Ви е поканил. |
| en | This invitation is no longer valid; a newer one may have replaced it. | Use the newest invitation in your email, or ask the person who invited you. |
| ru | Это приглашение больше не действует; возможно, его заменило более новое. | Воспользуйтесь последним приглашением в вашей почте или спросите пригласившего вас человека. |
| de | Diese Einladung gilt nicht mehr; möglicherweise wurde sie durch eine neuere ersetzt. | Verwenden Sie die neueste Einladung in Ihrem Postfach oder fragen Sie die Person, die Sie eingeladen hat. |
| nl | Deze uitnodiging is niet meer geldig; misschien is ze vervangen door een nieuwere. | Gebruik de nieuwste uitnodiging in uw e-mail, of vraag het aan degene die u heeft uitgenodigd. |
| el | Αυτή η πρόσκληση δεν ισχύει πια· ίσως την αντικατέστησε νεότερη. | Χρησιμοποιήστε την πιο πρόσφατη πρόσκληση στο email σας ή ρωτήστε το άτομο που σας προσκάλεσε. |
| he | ההזמנה הזו כבר לא בתוקף; ייתכן שהזמנה חדשה יותר החליפה אותה. | השתמשו בהזמנה האחרונה בתיבת הדואר שלכם, או פנו לאדם שהזמין אתכם. |

### passkey_failed · not_applied

Passkey terms follow the platform wording people already see on their devices: bg «ключ за достъп», ru «ключ доступа», de «Passkey», nl «toegangssleutel», el «κλειδί πρόσβασης», he «מפתח גישה».

| | message | next |
|---|---|---|
| bg | Не успяхме да потвърдим Вашия ключ за достъп. | Опитайте отново или влезте с връзка по имейл. |
| en | We could not confirm your passkey. | Try again, or sign in with an email link instead. |
| ru | Не удалось подтвердить ваш ключ доступа. | Попробуйте ещё раз или войдите по ссылке из письма. |
| de | Wir konnten Ihren Passkey nicht bestätigen. | Versuchen Sie es erneut oder melden Sie sich stattdessen mit einem Link per E-Mail an. |
| nl | We konden uw toegangssleutel niet bevestigen. | Probeer het opnieuw of meld u aan met een link per e-mail. |
| el | Δεν μπορέσαμε να επιβεβαιώσουμε το κλειδί πρόσβασής σας. | Δοκιμάστε ξανά ή συνδεθείτε με σύνδεσμο μέσω email. |
| he | לא הצלחנו לאמת את מפתח הגישה שלכם. | נסו שוב, או התחברו עם קישור במייל. |
| **staff** bg | Не успяхме да потвърдим Вашия ключ за достъп. | Опитайте отново; ако пак не стане, помолете Вашия ръководител да възстанови достъпа Ви. |
| **staff** en | We could not confirm your passkey. | Try again; if it still fails, ask your manager to restore your access. |
| **staff** ru | Не удалось подтвердить ваш ключ доступа. | Попробуйте ещё раз; если не получится, попросите руководителя восстановить доступ. |

### rate_limited · not_applied

`nextTimed` parameter: `{minutes}` (integer, plural).

| | message | next | nextTimed |
|---|---|---|---|
| bg | Имаше твърде много опити за кратко време, затова този не е изпълнен. | Изчакайте малко и опитайте отново. | Опитайте отново след {minutes, plural, one {# минута} other {# минути}}. |
| en | There were too many attempts in a short time, so this one was not carried out. | Wait a little, then try again. | Try again in {minutes, plural, one {# minute} other {# minutes}}. |
| ru | Слишком много попыток за короткое время, поэтому эта не выполнена. | Подождите немного и попробуйте снова. | Попробуйте снова через {minutes, plural, one {# минуту} few {# минуты} many {# минут} other {# минуты}}. |
| de | Es gab zu viele Versuche in kurzer Zeit, daher wurde dieser nicht ausgeführt. | Warten Sie kurz und versuchen Sie es dann erneut. | Versuchen Sie es in {minutes, plural, one {# Minute} other {# Minuten}} erneut. |
| nl | Er waren te veel pogingen in korte tijd, dus deze is niet uitgevoerd. | Wacht even en probeer het dan opnieuw. | Probeer het over {minutes, plural, one {# minuut} other {# minuten}} opnieuw. |
| el | Έγιναν πάρα πολλές προσπάθειες σε λίγο χρόνο, οπότε αυτή δεν εκτελέστηκε. | Περιμένετε λίγο και δοκιμάστε ξανά. | Δοκιμάστε ξανά σε {minutes, plural, one {# λεπτό} other {# λεπτά}}. |
| he | היו יותר מדי ניסיונות בזמן קצר, ולכן הניסיון הזה לא בוצע. | המתינו מעט ונסו שוב. | נסו שוב בעוד {minutes, plural, one {דקה} two {שתי דקות} other {# דקות}}. |

### unavailable · not_applied

Rendered only when `outcome` is `not_applied`; with `outcome: "unknown"` the UI uses `outcome_unknown`.

| | message | next |
|---|---|---|
| bg | Част от услугата ни не работи в момента, затова нищо не е запазено. | Опитайте отново след няколко минути; ако е спешно, обадете ни се на +359879696870. |
| en | Part of our service is not working right now, so nothing was saved. | Try again in a few minutes; if it is urgent, call us on +359879696870. |
| ru | Часть нашего сервиса сейчас не работает, поэтому ничего не сохранено. | Попробуйте снова через несколько минут; если срочно, позвоните нам: +359879696870. |
| de | Ein Teil unseres Dienstes funktioniert gerade nicht, daher wurde nichts gespeichert. | Versuchen Sie es in einigen Minuten erneut; wenn es dringend ist, rufen Sie uns an: +359879696870. |
| nl | Een deel van onze dienst werkt nu niet, dus er is niets opgeslagen. | Probeer het over een paar minuten opnieuw; bel ons bij spoed op +359879696870. |
| el | Ένα μέρος της υπηρεσίας μας δεν λειτουργεί αυτή τη στιγμή, οπότε δεν αποθηκεύτηκε τίποτα. | Δοκιμάστε ξανά σε λίγα λεπτά· αν είναι επείγον, καλέστε μας στο +359879696870. |
| he | חלק מהשירות שלנו לא פועל כרגע, ולכן שום דבר לא נשמר. | נסו שוב בעוד כמה דקות; בעניין דחוף התקשרו אלינו: +359879696870. |
| **staff** bg | Част от услугата не работи в момента, затова нищо не е запазено. | Опитайте отново след няколко минути. |
| **staff** en | Part of the service is not working right now, so nothing was saved. | Try again in a few minutes. |
| **staff** ru | Часть сервиса сейчас не работает, поэтому ничего не сохранено. | Попробуйте снова через несколько минут. |

### internal_error · unknown

Page loads that fail use the existing `errors.generic` catalog entry; this pair is for commands.

| | message | next |
|---|---|---|
| bg | Нещо се обърка при нас и не можем да потвърдим дали промяната Ви е запазена. | Презаредете страницата и проверете, преди да опитате отново. |
| en | Something went wrong on our side, and we cannot confirm whether your change was saved. | Reload the page and check before you try again. |
| ru | У нас что-то пошло не так, и мы не можем подтвердить, сохранено ли ваше изменение. | Обновите страницу и проверьте, прежде чем пробовать снова. |
| de | Bei uns ist etwas schiefgelaufen, und wir können nicht bestätigen, ob Ihre Änderung gespeichert wurde. | Laden Sie die Seite neu und prüfen Sie es, bevor Sie es erneut versuchen. |
| nl | Er ging bij ons iets mis, en we kunnen niet bevestigen of uw wijziging is opgeslagen. | Laad de pagina opnieuw en controleer het voordat u het opnieuw probeert. |
| el | Κάτι πήγε στραβά από τη δική μας πλευρά και δεν μπορούμε να επιβεβαιώσουμε αν η αλλαγή σας αποθηκεύτηκε. | Ανανεώστε τη σελίδα και ελέγξτε πριν δοκιμάσετε ξανά. |
| he | משהו השתבש אצלנו, ואיננו יכולים לאשר אם השינוי שלכם נשמר. | טענו מחדש את הדף ובדקו לפני שתנסו שוב. |

---

## 2. `server.email.auth.<template>.subject` / `.instructions` / `.expiry` / `.next`

Source: `src/server/jobs/resend.ts` (`authEmail`), `src/server/auth/email-link.ts`, `src/server/auth/invitations.ts`. Plain text body, in this order: `MS Realty`, `instructions`, the link (inserted by the server, never in the catalog), `expiry`, `next`.

Parameter on every `expiry`: `{expiresAt}`, the link's expiry instant formatted for the email's locale with the time zone named (for example `5 October 2026, 14:32 UTC`). This replaces today's raw ISO string plus `(UTC)`.

| Key segment | Template id in code | Surface | Locales |
|---|---|---|---|
| `clientAccess` | `auth.email_link` | P C | 7 |
| `reauth` | none yet (see note) | C | 7 |
| `clientInvitation` | `auth.client_invitation` | C | 7 |
| `staffEnrolment` | `auth.staff_enrolment` | S | bg en ru |
| `staffRecovery` | `auth.staff_recovery` | S | bg en ru |

**Must stay technically true.**
- **Seven-locale gap.** Today `authEmail` collapses de, nl, el and he to English. These keys close that gap only once the renderer reads them.
- **Client sign-in link.** Single use, valid for 15 minutes (`emailLinkTtlMs`), and bound to the client host. Opening it only shows a confirm page; the explicit confirm signs in. The copy therefore says "confirm on the page", never "click to sign in".
- **Forwarding.** The sign-in and staff links travel as secret parameters, so their copy says not to forward. The client invitation link is not secret: it works only inside the invited person's own signed-in session. Its copy asks them to sign in with this address and does not warn about forwarding.
- **Invitations.** Valid for 72 hours (`invitationTtlMs`). Opening one never uses it up; an explicit accept, decline or redeem does.
- **Staff enrolment.** It opens a session that can only add two passkeys.
- **Staff recovery.** It is issued by a manager, has already ended the member's sessions and passkeys, and requires two new passkeys.
- **Staff locales.** Staff templates render only bg, en or ru. Any other locale value is an explicit rejection, never a silent fallback.
- **Existing subjects.** The bg, en and ru subjects already in `resend.ts` are carried over intact.

### clientAccess

| | subject | instructions | expiry | next |
|---|---|---|---|---|
| bg | Вход в MS Realty | Отворете връзката по-долу и потвърдете на страницата, която се отваря, за да влезете; не препращайте това писмо, защото с връзката може да влезе всеки, който я използва. | Връзката може да се използва веднъж, до {expiresAt}. | Ако не сте поискали вход, игнорирайте това писмо; нищо няма да се промени. |
| en | Sign in to MS Realty | Open the link below and confirm on the page that opens to sign in; do not forward this email, because anyone who uses the link can sign in. | The link works once, until {expiresAt}. | If you did not ask to sign in, ignore this email; nothing will change. |
| ru | Вход в MS Realty | Откройте ссылку ниже и подтвердите вход на открывшейся странице; не пересылайте это письмо: по ссылке может войти любой, кто её использует. | Ссылкой можно воспользоваться один раз, до {expiresAt}. | Если вы не запрашивали вход, просто проигнорируйте письмо — ничего не изменится. |
| de | Anmeldung bei MS Realty | Öffnen Sie den Link unten und bestätigen Sie die Anmeldung auf der folgenden Seite; leiten Sie diese E-Mail nicht weiter, denn mit dem Link kann sich jeder anmelden, der ihn verwendet. | Der Link funktioniert einmal und gilt bis {expiresAt}. | Wenn Sie keine Anmeldung angefordert haben, ignorieren Sie diese E-Mail; es ändert sich nichts. |
| nl | Aanmelden bij MS Realty | Open de link hieronder en bevestig de aanmelding op de pagina die opent; stuur deze e-mail niet door, want iedereen die de link gebruikt, kan zich aanmelden. | De link werkt één keer, tot {expiresAt}. | Hebt u niet gevraagd om aan te melden, negeer deze e-mail dan; er verandert niets. |
| el | Σύνδεση στο MS Realty | Ανοίξτε τον σύνδεσμο παρακάτω και επιβεβαιώστε τη σύνδεση στη σελίδα που θα ανοίξει· μην προωθήσετε αυτό το email, γιατί με τον σύνδεσμο μπορεί να συνδεθεί όποιος τον χρησιμοποιήσει. | Ο σύνδεσμος λειτουργεί μία φορά, έως {expiresAt}. | Αν δεν ζητήσατε σύνδεση, αγνοήστε αυτό το email· δεν θα αλλάξει τίποτα. |
| he | התחברות ל-MS Realty | פתחו את הקישור שלמטה ואשרו את ההתחברות בדף שייפתח; אל תעבירו את המייל הזה, כי כל מי שמשתמש בקישור יכול להתחבר. | הקישור פועל פעם אחת, עד {expiresAt}. | אם לא ביקשתם להתחבר, התעלמו מהמייל; שום דבר לא ישתנה. |

### reauth (provisional)

No reauthentication email exists in code: step-up today is a passkey assertion (`passkeys.ts`, `reauthenticate`), and `auth.email_link` has only the `sign_in` purpose. This wording is ready if the backend adds an email route for clients without a passkey (open question in section 9).

| | subject | instructions | expiry | next |
|---|---|---|---|---|
| bg | MS Realty: потвърдете, че сте Вие | Отворете връзката по-долу и потвърдете на страницата, която се отваря, за да продължите започнатата стъпка; не препращайте това писмо. | Връзката може да се използва веднъж, до {expiresAt}. | Ако не сте започвали такава стъпка, игнорирайте това писмо; нищо няма да се промени. |
| en | MS Realty: confirm it is you | Open the link below and confirm on the page that opens to continue the step you started; do not forward this email. | The link works once, until {expiresAt}. | If you did not start this, ignore this email; nothing will change. |
| ru | MS Realty: подтвердите, что это вы | Откройте ссылку ниже и подтвердите на открывшейся странице, чтобы продолжить начатый шаг; не пересылайте это письмо. | Ссылкой можно воспользоваться один раз, до {expiresAt}. | Если вы ничего не начинали, проигнорируйте письмо — ничего не изменится. |
| de | MS Realty: Bestätigen Sie, dass Sie es sind | Öffnen Sie den Link unten und bestätigen Sie auf der folgenden Seite, um den begonnenen Schritt fortzusetzen; leiten Sie diese E-Mail nicht weiter. | Der Link funktioniert einmal und gilt bis {expiresAt}. | Wenn Sie nichts begonnen haben, ignorieren Sie diese E-Mail; es ändert sich nichts. |
| nl | MS Realty: bevestig dat u het bent | Open de link hieronder en bevestig op de pagina die opent om de begonnen stap voort te zetten; stuur deze e-mail niet door. | De link werkt één keer, tot {expiresAt}. | Bent u niets begonnen, negeer deze e-mail dan; er verandert niets. |
| el | MS Realty: επιβεβαιώστε ότι είστε εσείς | Ανοίξτε τον σύνδεσμο παρακάτω και επιβεβαιώστε στη σελίδα που θα ανοίξει για να συνεχίσετε το βήμα που ξεκινήσατε· μην προωθήσετε αυτό το email. | Ο σύνδεσμος λειτουργεί μία φορά, έως {expiresAt}. | Αν δεν ξεκινήσατε κάτι τέτοιο, αγνοήστε αυτό το email· δεν θα αλλάξει τίποτα. |
| he | MS Realty: אשרו שזה אתם | פתחו את הקישור שלמטה ואשרו בדף שייפתח כדי להמשיך את השלב שהתחלתם; אל תעבירו את המייל הזה. | הקישור פועל פעם אחת, עד {expiresAt}. | אם לא התחלתם פעולה כזו, התעלמו מהמייל; שום דבר לא ישתנה. |

### clientInvitation

| | subject | instructions | expiry | next |
|---|---|---|---|---|
| bg | Покана за Вашия кабинет в MS Realty | Отворете връзката, влезте с този имейл адрес и след това приемете или откажете поканата. | Поканата е валидна до {expiresAt}. | Ако не я очаквате, можете да я игнорирате; достъп получавате само след като я приемете. |
| en | Your MS Realty client invitation | Open the link, sign in with this email address, and then accept or decline the invitation. | The invitation is valid until {expiresAt}. | If you did not expect it, you can ignore it; you get access only after you accept. |
| ru | Приглашение в личный кабинет MS Realty | Откройте ссылку, войдите с этим адресом электронной почты, а затем примите или отклоните приглашение. | Приглашение действует до {expiresAt}. | Если вы его не ждали, его можно проигнорировать; доступ появится только после того, как вы его примете. |
| de | Einladung in Ihren Bereich bei MS Realty | Öffnen Sie den Link, melden Sie sich mit dieser E-Mail-Adresse an und nehmen Sie die Einladung dann an oder lehnen Sie sie ab. | Die Einladung gilt bis {expiresAt}. | Wenn Sie sie nicht erwartet haben, können Sie sie ignorieren; Zugriff erhalten Sie erst, wenn Sie annehmen. |
| nl | Uitnodiging voor uw persoonlijke omgeving bij MS Realty | Open de link, meld u aan met dit e-mailadres en neem de uitnodiging daarna aan of wijs ze af. | De uitnodiging is geldig tot {expiresAt}. | Verwachtte u dit niet, dan kunt u het negeren; u krijgt pas toegang nadat u hebt aangenomen. |
| el | Πρόσκληση στον προσωπικό σας χώρο στο MS Realty | Ανοίξτε τον σύνδεσμο, συνδεθείτε με αυτή τη διεύθυνση email και μετά αποδεχτείτε ή απορρίψτε την πρόσκληση. | Η πρόσκληση ισχύει έως {expiresAt}. | Αν δεν την περιμένατε, μπορείτε να την αγνοήσετε· αποκτάτε πρόσβαση μόνο αφού την αποδεχτείτε. |
| he | הזמנה לאזור האישי שלכם ב-MS Realty | פתחו את הקישור, התחברו עם כתובת המייל הזו, ואז קבלו את ההזמנה או דחו אותה. | ההזמנה בתוקף עד {expiresAt}. | אם לא ציפיתם לה, אפשר להתעלם ממנה; הגישה ניתנת רק אחרי שתקבלו אותה. |

### staffEnrolment (staff: bg, en, ru)

| | subject | instructions | expiry | next |
|---|---|---|---|---|
| bg | Покана за екипа на MS Realty | Отворете връзката по-долу, за да се присъедините към екипа и да настроите два ключа за достъп на устройствата си; не препращайте това писмо, защото връзката е единственото доказателство, че сте Вие. | Връзката може да се използва веднъж, до {expiresAt}. | Ако не очаквате тази покана, игнорирайте писмото; нищо не се случва, докато връзката не бъде използвана. |
| en | Your MS Realty staff invitation | Open the link below to join the team and set up two passkeys on your devices; do not forward this email, because the link is the only proof that it is you. | The link works once, until {expiresAt}. | If you did not expect this invitation, ignore this email; nothing happens unless the link is used. |
| ru | Приглашение в команду MS Realty | Откройте ссылку ниже, чтобы присоединиться к команде и настроить два ключа доступа на своих устройствах; не пересылайте это письмо: ссылка — единственное подтверждение, что это вы. | Ссылкой можно воспользоваться один раз, до {expiresAt}. | Если вы не ждали приглашения, проигнорируйте письмо — ничего не произойдёт, пока ссылкой не воспользуются. |

### staffRecovery (staff: bg, en, ru)

`instructions` has two sentences: the consequence that already happened, then the action.

| | subject | instructions | expiry | next |
|---|---|---|---|---|
| bg | Възстановяване на достъпа до MS Realty | Вашият ръководител нулира достъпа Ви и старите Ви ключове за достъп вече не работят. Отворете връзката по-долу, за да настроите два нови, и не препращайте това писмо. | Връзката може да се използва веднъж, до {expiresAt}. | Ако не сте искали това, уведомете веднага Вашия ръководител. |
| en | Recover your MS Realty access | Your manager has reset your access, and your old passkeys no longer work. Open the link below to set up two new ones, and do not forward this email. | The link works once, until {expiresAt}. | If you did not ask for this, tell your manager straight away. |
| ru | Восстановление доступа к MS Realty | Руководитель сбросил ваш доступ, и старые ключи доступа больше не работают. Откройте ссылку ниже, чтобы настроить два новых, и не пересылайте это письмо. | Ссылкой можно воспользоваться один раз, до {expiresAt}. | Если вы этого не запрашивали, сразу сообщите руководителю. |

---

## 3. `server.email.searchAlerts.*`

Surface: P C (saved-search email to a person who opted in). Locales: 7. Source: `src/server/subscriptions/template.ts` (`alertTemplateCopy`, `renderSearchAlert`).

Body order:
1. `currentFacts`
2. `scanIncomplete`, only when `digest.scanIncomplete` is true
3. One block per listing: `{reference} — {title}`, then `needsConfirmation` when `match` is `needs_confirmation`, then the listing URL
4. `next`
5. `preferences`, followed by the preferences URL

Item lines are data, not catalog text. The reference, title and URL come from the approved listing record exactly as stored.

| Key | Parameters | Status |
|---|---|---|
| `subject` | none | existing, carried intact |
| `currentFacts` | none | existing, carried intact |
| `needsConfirmation` | none | existing, carried intact |
| `preferences` | none (the URL follows on its own line) | existing, carried intact |
| `next` | none | new |
| `scanIncomplete` | none | new, proposed (see note) |

**Must stay technically true.**
- **Existing strings.** The seven-language strings move into the catalogs intact (coordination rule). A later reviewer may change en «withdraw alerts» to «stop alerts»; this deck does not.
- **Listing titles.** A title appears exactly as approved for that locale, or as the stored source title when no translation is approved. It is never machine-translated in the email, and listing facts are never restated.
- **Managing alerts.** Manage, pause and unsubscribe stay reachable through the preferences URL on the client host.
- **`scanIncomplete`.** The digest already carries this flag, but today's renderer drops it. Without this line, a partial scan reads as a complete one.
- **`next`.** It points to the inquiry form on the listing page. The digest has no `reply_to`, so the copy never suggests replying to the email.

| | subject | currentFacts | needsConfirmation | preferences |
|---|---|---|---|---|
| bg | Обновления по запазеното търсене | Прегледайте актуалните данни в обявата. | Някои критерии изискват потвърждение. | Управление, пауза или отказ от известия: |
| en | Saved search updates | Check the listing for current details. | Some criteria need confirmation. | Manage, pause or withdraw alerts: |
| ru | Обновления сохранённого поиска | Проверьте актуальные сведения в объявлении. | Некоторые критерии требуют подтверждения. | Настроить, приостановить или отключить уведомления: |
| de | Neuigkeiten zur gespeicherten Suche | Aktuelle Angaben finden Sie im Inserat. | Einige Kriterien müssen bestätigt werden. | Benachrichtigungen verwalten, pausieren oder abbestellen: |
| nl | Updates voor uw opgeslagen zoekopdracht | Bekijk de advertentie voor actuele informatie. | Sommige criteria moeten worden bevestigd. | Meldingen beheren, pauzeren of stopzetten: |
| el | Ενημερώσεις αποθηκευμένης αναζήτησης | Ελέγξτε την αγγελία για τα τρέχοντα στοιχεία. | Ορισμένα κριτήρια χρειάζονται επιβεβαίωση. | Διαχείριση, παύση ή διακοπή ειδοποιήσεων: |
| he | עדכונים לחיפוש השמור | בדקו את הפרטים העדכניים במודעה. | חלק מהקריטריונים דורשים אישור. | ניהול, השהיה או ביטול התראות: |

| | next | scanIncomplete |
|---|---|---|
| bg | За да попитате за имот, използвайте формата на страницата му. | Този път не успяхме да проверим всички нови обяви, затова в писмото може да липсват съвпадения. |
| en | To ask about a property, use the form on its page. | We could not check every new listing this time, so some matches may be missing from this email. |
| ru | Чтобы спросить об объекте, воспользуйтесь формой на его странице. | В этот раз мы не смогли проверить все новые объявления, поэтому в письме могут быть не все совпадения. |
| de | Um nach einer Immobilie zu fragen, nutzen Sie das Formular auf ihrer Seite. | Diesmal konnten wir nicht alle neuen Inserate prüfen, daher fehlen in dieser E-Mail möglicherweise Treffer. |
| nl | Wilt u iets vragen over een woning, gebruik dan het formulier op de pagina ervan. | Deze keer konden we niet alle nieuwe advertenties controleren, dus er kunnen resultaten ontbreken in deze e-mail. |
| el | Για να ρωτήσετε για ένα ακίνητο, χρησιμοποιήστε τη φόρμα στη σελίδα του. | Αυτή τη φορά δεν μπορέσαμε να ελέγξουμε όλες τις νέες αγγελίες, οπότε ίσως λείπουν αποτελέσματα από αυτό το email. |
| he | כדי לשאול על נכס, השתמשו בטופס שבדף שלו. | הפעם לא הצלחנו לבדוק את כל המודעות החדשות, ולכן ייתכן שחסרות במייל הזה התאמות. |

---

## 4. `server.notification.inquiry.received.*`

Surface: S (email to the team inbox). Locales: bg, en, ru. Source: `src/server/inquiries/notifications.ts` (`renderInquiryCoverageNotice`). Parameters: `{reference}` is the inquiry reference (`RQ-2026-000061` format), shown because staff need it to find the inquiry. The incoming-list URL follows `next` on its own line and is inserted by the server.

| Key | Use |
|---|---|
| `subject` | Any future production send. |
| `stagingSubject` | The current staging-only notice; replaces `MS Realty staging: {reference}`. |
| `body` | One sentence, no customer content. |
| `next` | Ends with a colon; the URL follows. |
| `stagingNote` | Last line of every staging notice. |

**Must stay technically true.**
- **Content.** The notice shows only the RQ reference and the team's incoming-list link. The inquiry id, event id and queue name stay in the hidden payload (today they are printed in the body). The worker never reads the person's contact details or message, so the copy never summarises them.
- **Staging.** Sends happen only on staging, only with the three enablement flags, and only to the reviewed test inbox from the approved sender. The staging subject and note say so plainly, without the word "staging".
- **Ownership.** "Waits until someone takes it" is true at intake. The inquiry stays with the shared incoming list until a named broker accepts it.

| | subject | stagingSubject | body | next | stagingNote |
|---|---|---|---|---|---|
| bg | Ново запитване {reference} | Тест: ново запитване {reference} | Ново запитване {reference} постъпи през сайта и чака във входящите на екипа, докато някой го поеме. | Отворете входящите, за да го поемете или да го предадете на колега: | Това е тестово известие от пробната версия на сайта; изпратено е само до одобрената тестова поща. |
| en | New inquiry {reference} | Test: new inquiry {reference} | A new inquiry {reference} came in through the website and waits in the team's incoming list until someone takes it. | Open the incoming list to take it or pass it to a colleague: | This is a test notice from the trial version of the site; it went only to the approved test inbox. |
| ru | Новое обращение {reference} | Тест: новое обращение {reference} | Новое обращение {reference} пришло через сайт и ждёт во входящих команды, пока кто-нибудь его не возьмёт. | Откройте входящие, чтобы взять его или передать коллеге: | Это тестовое уведомление с пробной версии сайта; оно отправлено только на одобренный тестовый адрес. |

---

## 5. `server.email.case.*` and `server.email.viewing.*`

Sources: `src/server/cases/email.ts`, `email-contract.ts`, `email-dispatch.ts`, `email-files-contract.ts`, `src/server/appointments/email-calendar.ts`, `src/server/jobs/outbox.ts`, `src/server/jobs/resend-inbox.ts`, `src/domain/message.ts`.

The staff member writes the subject and body of a case email, and that text is reviewed content. This family covers only:
- the wrapper lines the server adds below that text, for the recipient;
- the status lines staff see for each email;
- the viewing lines added when a calendar file is attached.

**Must stay technically true.**
- **Authored text.** The authored subject and body are never translated, rewritten or replaced. Wrapper lines are appended in the recipient's locale (the locale of their email consent) after the authored text and before the attachments.
- **Sending is human-approved.** A staff member approves the exact reviewed content. A change to recipient, consent or attached files after approval stops the send (`case_email_eligibility_changed`, `version_conflict`).
- **No "sent" before the provider confirms.**
  - `provider_accepted` means the provider accepted the email.
  - `delivered` and `bounced` come only from the provider's signed delivery events.
  - `outcome_unknown` suspends any resend until it is reconciled.
- **Replies.** The `reply_to` address routes replies into the team's incoming mail for triage, so "your reply reaches the MS Realty team" is true. The copy does not promise that a named person reads it.
- **Calendar files.** They are attached only for confirmed, reschedule-requested and cancelled viewings. A reschedule request keeps the confirmed time in force and in the calendar file. A cancellation sends a calendar cancel (`method=CANCEL`). The calendar data itself is not UI wording.
- **Cancellations.** They stay human-approved (Butler never cancels).

### 5a. Recipient wrapper lines · `server.email.case.wrapper.*` (C, 7 locales)

Parameters:
- `attachments` takes `{count}`, the number of attached documents. It excludes the calendar file and is shown only when `count` is at least 1.

| | replyHint | attachments | why |
|---|---|---|---|
| bg | Можете да отговорите на това писмо; отговорът Ви ще стигне до екипа на MS Realty. | {count, plural, one {Приложен е # документ.} other {Приложени са # документа.}} | Получавате това писмо, защото сте избрали да получавате известия от MS Realty по имейл; можете да промените това в настройките за имейли. |
| en | You can reply to this email; your reply reaches the MS Realty team. | {count, plural, one {# document is attached.} other {# documents are attached.}} | You receive this email because you chose to get updates from MS Realty by email; you can change this in your email settings. |
| ru | Вы можете ответить на это письмо — ответ получит команда MS Realty. | {count, plural, one {Приложен # документ.} few {Приложено # документа.} many {Приложено # документов.} other {Приложено # документа.}} | Вы получили это письмо, потому что выбрали получать уведомления от MS Realty по электронной почте; это можно изменить в настройках писем. |
| de | Sie können auf diese E-Mail antworten; Ihre Antwort erreicht das Team von MS Realty. | {count, plural, one {# Dokument ist angehängt.} other {# Dokumente sind angehängt.}} | Sie erhalten diese E-Mail, weil Sie Nachrichten von MS Realty per E-Mail gewählt haben; das können Sie in Ihren E-Mail-Einstellungen ändern. |
| nl | U kunt op deze e-mail antwoorden; uw antwoord komt bij het team van MS Realty. | {count, plural, one {Er is # document bijgevoegd.} other {Er zijn # documenten bijgevoegd.}} | U ontvangt deze e-mail omdat u hebt gekozen voor berichten van MS Realty per e-mail; u kunt dit wijzigen in uw e-mailinstellingen. |
| el | Μπορείτε να απαντήσετε σε αυτό το email· η απάντησή σας φτάνει στην ομάδα του MS Realty. | {count, plural, one {Επισυνάπτεται # έγγραφο.} other {Επισυνάπτονται # έγγραφα.}} | Λαμβάνετε αυτό το email επειδή επιλέξατε να λαμβάνετε ενημερώσεις από το MS Realty μέσω email· μπορείτε να το αλλάξετε στις ρυθμίσεις email. |
| he | אפשר להשיב למייל הזה; התשובה שלכם תגיע לצוות של MS Realty. | {count, plural, one {מצורף מסמך אחד.} two {מצורפים שני מסמכים.} other {מצורפים # מסמכים.}} | קיבלתם את המייל הזה כי בחרתם לקבל עדכונים מ-MS Realty במייל; אפשר לשנות זאת בהגדרות המייל. |

### 5b. Staff status of a case email · `server.email.case.<state>.message` / `.next` (S: bg, en, ru)

`<state>` is the message state from `src/domain/message.ts`. An external send that was cancelled shows as `failed` with a reason from 5c.

| state | | message | next |
|---|---|---|---|
| draft | bg | Това писмо е чернова и не е изпратено. | Проверете текста, получателя и прикачените файлове и след това одобрете изпращането. |
| | en | This email is a draft and has not been sent. | Check the text, recipient and attachments, then approve sending. |
| | ru | Это письмо — черновик, оно не отправлено. | Проверьте текст, получателя и вложения, затем одобрите отправку. |
| approved | bg | Изпращането е одобрено; писмото още не е излязло. | Засега не е нужно нищо; редът ще се обнови, когато писмото бъде предадено на пощенската услуга. |
| | en | Sending is approved; the email has not gone out yet. | Nothing to do now; this line updates when the email is handed to the email service. |
| | ru | Отправка одобрена; письмо ещё не ушло. | Сейчас ничего делать не нужно; строка обновится, когда письмо передадут почтовому сервису. |
| queued | bg | Писмото чака реда си, за да бъде предадено на пощенската услуга. | Засега не е нужно нищо; не го изпращайте отново. |
| | en | The email is waiting its turn to go to the email service. | Nothing to do now; do not send it again. |
| | ru | Письмо ждёт своей очереди на передачу почтовому сервису. | Сейчас ничего делать не нужно; не отправляйте его повторно. |
| attempting | bg | В момента предаваме писмото на пощенската услуга. | Изчакайте резултата тук; не го изпращайте отново. |
| | en | We are handing this email to the email service right now. | Wait for the result here; do not send it again. |
| | ru | Прямо сейчас мы передаём письмо почтовому сервису. | Дождитесь результата здесь; не отправляйте его повторно. |
| provider_accepted | bg | Пощенската услуга прие писмото, но доставката още не е потвърдена. | Изчакайте потвърждението за доставка тук; не го изпращайте отново. |
| | en | The email service accepted the email, but delivery is not confirmed yet. | Wait for the delivery confirmation here; do not send it again. |
| | ru | Почтовый сервис принял письмо, но доставка ещё не подтверждена. | Дождитесь подтверждения доставки здесь; не отправляйте письмо повторно. |
| delivered | bg | Доставката до пощенския доставчик на получателя е потвърдена. | Ако човекът не го намира, помолете го да провери папката за спам. |
| | en | Delivery to the recipient's email provider is confirmed. | If the person cannot find it, ask them to check their spam folder. |
| | ru | Доставка почтовому сервису получателя подтверждена. | Если человек не находит письмо, попросите его проверить папку «Спам». |
| bounced | bg | Писмото не можа да бъде доставено на този адрес. | Проверете адреса с човека и изпратете ново писмо, след като бъде поправен. |
| | en | The email could not be delivered to this address. | Check the address with the person, then send a new email once it is corrected. |
| | ru | Письмо не удалось доставить на этот адрес. | Уточните адрес у человека и отправьте новое письмо после исправления. |
| failed | bg | Това писмо не е изпратено. | Прочетете причината по-долу, отстранете я и опитайте да изпратите отново. |
| | en | This email was not sent. | Read the reason below, fix it, then try sending again. |
| | ru | Это письмо не отправлено. | Прочитайте причину ниже, устраните её и попробуйте отправить снова. |
| outcome_unknown | bg | Не успяхме да потвърдим дали пощенската услуга е приела писмото. | Не го изпращайте отново, докато това не се провери; можете да попитате човека дали го е получил. |
| | en | We could not confirm whether the email service accepted this email. | Do not send it again until this is checked; you can ask the person whether it arrived. |
| | ru | Мы не смогли подтвердить, принял ли почтовый сервис это письмо. | Не отправляйте его повторно, пока это не проверено; можно спросить человека, пришло ли письмо. |

### 5c. Why a case email was not sent · `server.email.case.failed.reason.<reason>` (S: bg, en, ru)

| reason key | code in `email-dispatch.ts` / `resend.ts` | bg | en | ru |
|---|---|---|---|---|
| eligibilityChanged | `case_email_eligibility_changed` | Преди изпращането съгласието или адресът на получателя се промениха или той вече не участва в сделката, затова писмото е спряно. | Before sending, the recipient's email consent or address changed, or they are no longer part of the deal, so it was stopped. | До отправки изменились согласие или адрес получателя либо он больше не участвует в сделке, поэтому письмо остановлено. |
| attemptLimitReached | `attempt_limit_reached` | Пощенската услуга го отказа няколко пъти подред. | The email service turned it away several times in a row. | Почтовый сервис несколько раз подряд не принял письмо. |
| retryWindowExpired | `retry_window_expired` | Мина твърде много време, преди писмото да може да излезе. | Too much time passed before the email could go out. | Прошло слишком много времени, прежде чем письмо смогло уйти. |
| providerRejected | `provider_rejected_<status>` | Пощенската услуга отказа това писмо. | The email service refused this email. | Почтовый сервис отклонил это письмо. |
| notAsApproved | `unsupported_or_expired_message` | Писмото не можа да бъде подготвено точно както е одобрено, затова е спряно. | The email could not be prepared exactly as approved, so it was stopped. | Письмо не удалось подготовить точно в одобренном виде, поэтому оно остановлено. |

### 5d. Viewing lines · `server.email.viewing.<state>.message` / `.next` (C, 7 locales)

Added to the case email that carries the calendar file. Parameter: `{when}`, the confirmed start, formatted in the property's time zone with the zone named (ux-spec F07), for example `Saturday, 3 October 2026, 11:00 EEST`. `<state>` is the appointment state that froze the calendar snapshot.

| state | | message | next |
|---|---|---|---|
| confirmed | bg | Огледът Ви е уговорен за {when}. | Отворете прикачения файл за календар, за да го добавите в календара си. |
| | en | Your viewing is booked for {when}. | Open the attached calendar file to add it to your calendar. |
| | ru | Ваш просмотр назначен на {when}. | Откройте приложенный файл календаря, чтобы добавить просмотр в свой календарь. |
| | de | Ihre Besichtigung ist für {when} vereinbart. | Öffnen Sie die angehängte Kalenderdatei, um den Termin in Ihren Kalender zu übernehmen. |
| | nl | Uw bezichtiging staat vast op {when}. | Open het bijgevoegde agendabestand om de afspraak aan uw agenda toe te voegen. |
| | el | Η επίσκεψή σας στο ακίνητο κλείστηκε για {when}. | Ανοίξτε το συνημμένο αρχείο ημερολογίου για να την προσθέσετε στο ημερολόγιό σας. |
| | he | הסיור שלכם בנכס נקבע ל-{when}. | פתחו את קובץ היומן המצורף כדי להוסיף אותו ליומן שלכם. |
| reschedule_requested | bg | Поискан е нов час; докато не бъде уговорен, огледът остава за {when}. | Запазете този час свободен, докато не получите потвърждение за нов. |
| | en | A new time has been asked for; until one is agreed, your viewing stays at {when}. | Keep this time free until you receive a confirmed new one. |
| | ru | Запрошено другое время; пока его не согласуют, просмотр остаётся на {when}. | Оставьте это время свободным, пока не получите подтверждение нового. |
| | de | Ein neuer Termin wurde angefragt; bis er vereinbart ist, bleibt Ihre Besichtigung am {when}. | Halten Sie diesen Termin frei, bis Sie einen bestätigten neuen erhalten. |
| | nl | Er is een nieuw tijdstip gevraagd; tot dat is afgesproken, blijft uw bezichtiging op {when}. | Houd dit tijdstip vrij tot u een bevestigd nieuw tijdstip ontvangt. |
| | el | Ζητήθηκε νέα ώρα· μέχρι να συμφωνηθεί, η επίσκεψή σας παραμένει για {when}. | Κρατήστε αυτή την ώρα ελεύθερη μέχρι να λάβετε επιβεβαίωση για νέα. |
| | he | התבקש מועד חדש; עד שיסוכם, הסיור נשאר ב-{when}. | שמרו את המועד הזה פנוי עד שתקבלו אישור למועד חדש. |
| cancelled | bg | Огледът Ви за {when} е отменен. | Отворете прикачения файл за календар, за да го премахнете от календара си. |
| | en | Your viewing on {when} is cancelled. | Open the attached calendar file to remove it from your calendar. |
| | ru | Ваш просмотр на {when} отменён. | Откройте приложенный файл календаря, чтобы удалить просмотр из своего календаря. |
| | de | Ihre Besichtigung am {when} ist abgesagt. | Öffnen Sie die angehängte Kalenderdatei, um den Termin aus Ihrem Kalender zu entfernen. |
| | nl | Uw bezichtiging op {when} is geannuleerd. | Open het bijgevoegde agendabestand om de afspraak uit uw agenda te verwijderen. |
| | el | Η επίσκεψή σας για {when} ακυρώθηκε. | Ανοίξτε το συνημμένο αρχείο ημερολογίου για να την αφαιρέσετε από το ημερολόγιό σας. |
| | he | הסיור שלכם ב-{when} בוטל. | פתחו את קובץ היומן המצורף כדי להסיר אותו מהיומן שלכם. |

---

## 6. `server.receipt.<command>.<state>.message` / `.next`

A receipt is what the person sees after a command, read back from what was actually saved.

| `<command>` | Server command | Journey | Surface | Locales |
|---|---|---|---|---|
| `inquiryIntake` | `submitInquiry`, `readInquiryReceipt` (`inquiries/intake.ts`) | W01, P12 | P | 7 |
| `documentUpload` | `startDocumentUpload`, `receiveUpload`, `finalizeUpload`, `processFile` (`documents/commands.ts`, `files/*`) | W10, C08, C09, O20 | C S | 7 |
| `proposalResponse` | `recordProposalDecision` (`proposals/service.ts`) | W05 | C | 7 |
| `appointmentResponse` | `respondToAppointment` (`appointments/service.ts`) | W06 | C | 7 |
| `handover` | `handoverTask` (`work/handover.ts`) | W03 | S | bg en ru |
| `publicationActivate` | `activateManifest` (`publication/commands.ts`) | W08 | S | bg en ru |

**Must stay technically true (all receipts).**
- **Readback, not acceptance.** A receipt renders only from the persisted readback: the operation's saved status and the saved record. A query string or an accepted request never establishes success (`files/receipts.ts`).
- **No raw ids.** Operation, idempotency and principal ids are never shown. Only human references (`RQ-…`), file names, listing titles, person names and formatted times are parameters.
- **Replays.** A replay of the same request returns the same saved receipt; the `already…` states say so instead of implying a second effect.
- **Stale answers.** A stale answer (`version_conflict`, `approval_stale`) uses the `changed` state: show the latest, ask for a fresh answer, never re-apply the old one.
- **Unknown outcomes.** An unknown outcome uses `server.errors.outcome_unknown`, or the command's own `outcomeUnknown` state where one is given. It never says done or failed.

### 6a. `inquiryIntake` (P, 7 locales)

Parameter: `{reference}` (RQ reference). The person needs it to quote when they call or write.

- **Receipt.** "Received" is not a reply. The inquiry sits with the team's shared incoming list until a named broker takes it.
- **No promises.** The receipt promises no reply time. It does not book a viewing or confirm availability; P12 states that limit next to the receipt from the UI catalog.

| state | | message | next |
|---|---|---|---|
| accepted | bg | Получихме Вашето запитване {reference}. | Запазете номера {reference}; можете да го посочите, ако ни се обадите или пишете. |
| | en | We received your inquiry {reference}. | Keep the number {reference}; you can quote it if you call or write to us. |
| | ru | Мы получили ваше обращение {reference}. | Сохраните номер {reference} — его можно назвать, если вы позвоните или напишете нам. |
| | de | Wir haben Ihre Anfrage {reference} erhalten. | Notieren Sie sich die Nummer {reference}; Sie können sie nennen, wenn Sie uns anrufen oder schreiben. |
| | nl | We hebben uw aanvraag {reference} ontvangen. | Bewaar het nummer {reference}; u kunt het noemen als u ons belt of schrijft. |
| | el | Λάβαμε το αίτημά σας {reference}. | Κρατήστε τον αριθμό {reference}· μπορείτε να τον αναφέρετε αν μας τηλεφωνήσετε ή μας γράψετε. |
| | he | קיבלנו את הפנייה שלכם {reference}. | שמרו את המספר {reference}; אפשר לציין אותו אם תתקשרו או תכתבו לנו. |
| alreadyReceived | bg | Вече имаме това запитване под номер {reference}, затова не е изпратено два пъти. | Не е нужно нищо повече; запазете номера {reference}, ако се свържете с нас. |
| | en | We already have this inquiry as {reference}, so it was not sent twice. | Nothing more to do; keep the number {reference} for when you contact us. |
| | ru | Это обращение уже у нас под номером {reference}, поэтому оно не отправлено дважды. | Больше ничего делать не нужно; сохраните номер {reference} — он пригодится, если вы свяжетесь с нами. |
| | de | Diese Anfrage liegt uns bereits unter {reference} vor, daher wurde sie nicht doppelt gesendet. | Sie müssen nichts weiter tun; notieren Sie sich die Nummer {reference} für den Fall, dass Sie uns kontaktieren. |
| | nl | We hebben deze aanvraag al onder {reference}, dus ze is niet twee keer verzonden. | U hoeft niets meer te doen; bewaar het nummer {reference} voor als u contact met ons opneemt. |
| | el | Έχουμε ήδη αυτό το αίτημα με αριθμό {reference}, οπότε δεν στάλθηκε δύο φορές. | Δεν χρειάζεται να κάνετε κάτι άλλο· κρατήστε τον αριθμό {reference} αν επικοινωνήσετε μαζί μας. |
| | he | הפנייה הזו כבר אצלנו במספר {reference}, ולכן היא לא נשלחה פעמיים. | אין צורך לעשות דבר נוסף; שמרו את המספר {reference} למקרה שתפנו אלינו. |

### 6b. `documentUpload` (C S, 7 locales)

Parameter: `{fileName}`, the person's own file name, inserted as given.

W10 order: received → checking → passed or rejected → human review.

- **Received is not checked.** The `received` and `unverified` states never say scanned, checked, clean or safe.
- **Staging.** The protected staging profile has no scanner (owner decision). Every upload there stays in `unverified`: no download, no review, no publication eligibility.
- **Passed is not reviewed.** A passed check is not a review, and a review is not legal or professional validation (`files/README.md`).
- **Unknown transfer.** It uses `outcomeUnknown` and asks the person to check the list before uploading again.
- **Another check.** `checkFailed` points to the "check again" control (`file.scan.request`). Anyone with access to the file can use it, so the client document page must show it too.

| state | | message | next |
|---|---|---|---|
| received | bg | Получихме {fileName}; файлът още не е проверен. | Не е нужно да го изпращате отново; резултатът от проверката ще се появи тук. |
| | en | We received {fileName}; it has not been checked yet. | You do not need to send it again; the check result will appear here. |
| | ru | Мы получили {fileName}; файл ещё не проверен. | Отправлять его повторно не нужно; результат проверки появится здесь. |
| | de | Wir haben {fileName} erhalten; die Datei ist noch nicht geprüft. | Sie müssen sie nicht erneut senden; das Prüfergebnis erscheint hier. |
| | nl | We hebben {fileName} ontvangen; het bestand is nog niet gecontroleerd. | U hoeft het niet opnieuw te sturen; de uitkomst van de controle verschijnt hier. |
| | el | Λάβαμε το {fileName}· δεν έχει ελεγχθεί ακόμη. | Δεν χρειάζεται να το στείλετε ξανά· το αποτέλεσμα του ελέγχου θα εμφανιστεί εδώ. |
| | he | קיבלנו את {fileName}; הקובץ עוד לא נבדק. | אין צורך לשלוח אותו שוב; תוצאת הבדיקה תופיע כאן. |
| unverified | bg | Получихме {fileName}, но тук той не може да бъде проверен, затова засега никой не може да го отвори или прегледа. | Не е нужно да го изпращате отново; запазете си свое копие. |
| | en | We received {fileName}, but it cannot be checked here, so nobody can open or review it yet. | You do not need to send it again; keep your own copy. |
| | ru | Мы получили {fileName}, но здесь его нельзя проверить, поэтому пока никто не может его открыть или просмотреть. | Отправлять его повторно не нужно; сохраните у себя копию. |
| | de | Wir haben {fileName} erhalten, können die Datei hier aber nicht prüfen, daher kann sie noch niemand öffnen oder durchsehen. | Sie müssen sie nicht erneut senden; bewahren Sie Ihre eigene Kopie auf. |
| | nl | We hebben {fileName} ontvangen, maar het kan hier niet worden gecontroleerd, dus niemand kan het nog openen of beoordelen. | U hoeft het niet opnieuw te sturen; bewaar uw eigen kopie. |
| | el | Λάβαμε το {fileName}, αλλά εδώ δεν μπορεί να ελεγχθεί, οπότε κανείς δεν μπορεί ακόμη να το ανοίξει ή να το εξετάσει. | Δεν χρειάζεται να το στείλετε ξανά· κρατήστε ένα δικό σας αντίγραφο. |
| | he | קיבלנו את {fileName}, אבל אי אפשר לבדוק אותו כאן, ולכן עדיין איש אינו יכול לפתוח אותו או לעיין בו. | אין צורך לשלוח אותו שוב; שמרו עותק משלכם. |
| checking | bg | Проверяваме {fileName} за вируси. | Можете да излезете от страницата; резултатът ще се появи тук. |
| | en | We are checking {fileName} for viruses. | You can leave this page; the result will appear here. |
| | ru | Проверяем {fileName} на вирусы. | Можно уйти с этой страницы; результат появится здесь. |
| | de | Wir prüfen {fileName} auf Viren. | Sie können diese Seite verlassen; das Ergebnis erscheint hier. |
| | nl | We controleren {fileName} op virussen. | U kunt deze pagina verlaten; de uitkomst verschijnt hier. |
| | el | Ελέγχουμε το {fileName} για ιούς. | Μπορείτε να φύγετε από αυτή τη σελίδα· το αποτέλεσμα θα εμφανιστεί εδώ. |
| | he | אנחנו בודקים את {fileName} לאיתור וירוסים. | אפשר לצאת מהדף; התוצאה תופיע כאן. |
| passed | bg | {fileName} премина проверката за вируси и чака преглед от човек. | Засега не е нужно нищо от Вас; резултатът от прегледа ще се появи тук. |
| | en | {fileName} passed the virus check and is waiting for a person to review it. | Nothing else is needed from you now; the review result will appear here. |
| | ru | {fileName} прошёл проверку на вирусы и ждёт просмотра сотрудником. | Сейчас от вас ничего не требуется; результат просмотра появится здесь. |
| | de | {fileName} hat die Virenprüfung bestanden und wartet auf die Durchsicht durch eine Person. | Von Ihnen wird jetzt nichts weiter benötigt; das Ergebnis der Durchsicht erscheint hier. |
| | nl | {fileName} is door de viruscontrole gekomen en wacht op beoordeling door een medewerker. | Er is nu niets meer van u nodig; de uitkomst van de beoordeling verschijnt hier. |
| | el | Το {fileName} πέρασε τον έλεγχο για ιούς και περιμένει εξέταση από άνθρωπο. | Δεν χρειάζεται τίποτε άλλο από εσάς τώρα· το αποτέλεσμα της εξέτασης θα εμφανιστεί εδώ. |
| | he | {fileName} עבר את בדיקת הווירוסים וממתין לעיון של אדם. | כרגע לא נדרש מכם דבר נוסף; תוצאת העיון תופיע כאן. |
| rejected | bg | Проверката за безопасност откри проблем в {fileName}, затова не го приехме. | Качете друго копие, например ново сканиране или наново запазен PDF. |
| | en | The safety check found a problem in {fileName}, so we did not accept it. | Upload a different copy, for example a new scan or a PDF saved again. |
| | ru | Проверка безопасности нашла проблему в {fileName}, поэтому мы его не приняли. | Загрузите другую копию, например новый скан или заново сохранённый PDF. |
| | de | Die Sicherheitsprüfung hat in {fileName} ein Problem gefunden, daher haben wir die Datei nicht angenommen. | Laden Sie eine andere Kopie hoch, zum Beispiel einen neuen Scan oder ein neu gespeichertes PDF. |
| | nl | De veiligheidscontrole vond een probleem in {fileName}, dus we hebben het niet aangenomen. | Upload een andere kopie, bijvoorbeeld een nieuwe scan of een opnieuw opgeslagen pdf. |
| | el | Ο έλεγχος ασφαλείας βρήκε πρόβλημα στο {fileName}, οπότε δεν το δεχτήκαμε. | Ανεβάστε άλλο αντίγραφο, για παράδειγμα νέα σάρωση ή PDF αποθηκευμένο ξανά. |
| | he | בדיקת האבטחה מצאה בעיה ב-{fileName}, ולכן לא קיבלנו אותו. | העלו עותק אחר, למשל סריקה חדשה או PDF שנשמר מחדש. |
| checkFailed | bg | Все още не успяхме да проверим {fileName}, затова той още не е приет. | Не е нужно да го качвате отново; поискайте нова проверка на този файл. |
| | en | We could not check {fileName} yet, so it is not accepted yet. | You do not need to upload it again; ask for another check of this file. |
| | ru | Пока не удалось проверить {fileName}, поэтому он ещё не принят. | Загружать его повторно не нужно; запросите повторную проверку этого файла. |
| | de | Wir konnten {fileName} noch nicht prüfen, daher ist die Datei noch nicht angenommen. | Sie müssen sie nicht erneut hochladen; fordern Sie für diese Datei eine neue Prüfung an. |
| | nl | We konden {fileName} nog niet controleren, dus het is nog niet aangenomen. | U hoeft het niet opnieuw te uploaden; vraag een nieuwe controle van dit bestand aan. |
| | el | Δεν μπορέσαμε ακόμη να ελέγξουμε το {fileName}, οπότε δεν έχει γίνει ακόμη δεκτό. | Δεν χρειάζεται να το ανεβάσετε ξανά· ζητήστε νέο έλεγχο για αυτό το αρχείο. |
| | he | עדיין לא הצלחנו לבדוק את {fileName}, ולכן הוא עוד לא התקבל. | אין צורך להעלות אותו שוב; בקשו בדיקה חוזרת של הקובץ הזה. |
| incomplete | bg | {fileName} не се качи докрай, затова не сме го получили. | Качете файла отново от тази страница. |
| | en | {fileName} did not finish uploading, so we did not receive it. | Upload the file again from this page. |
| | ru | {fileName} загрузился не полностью, поэтому мы его не получили. | Загрузите файл ещё раз с этой страницы. |
| | de | {fileName} wurde nicht vollständig hochgeladen, daher haben wir die Datei nicht erhalten. | Laden Sie die Datei auf dieser Seite erneut hoch. |
| | nl | {fileName} is niet volledig geüpload, dus we hebben het niet ontvangen. | Upload het bestand opnieuw via deze pagina. |
| | el | Το {fileName} δεν ανέβηκε ολόκληρο, οπότε δεν το λάβαμε. | Ανεβάστε ξανά το αρχείο από αυτή τη σελίδα. |
| | he | ההעלאה של {fileName} לא הושלמה, ולכן לא קיבלנו אותו. | העלו את הקובץ שוב מהדף הזה. |
| outcomeUnknown | bg | Не успяхме да потвърдим дали {fileName} е пристигнал. | Проверете списъка с документи на тази страница, преди да го качите отново. |
| | en | We could not confirm whether {fileName} arrived. | Check the list of documents on this page before you upload it again. |
| | ru | Мы не смогли подтвердить, дошёл ли {fileName}. | Проверьте список документов на этой странице, прежде чем загружать файл снова. |
| | de | Wir konnten nicht bestätigen, ob {fileName} angekommen ist. | Prüfen Sie die Dokumentenliste auf dieser Seite, bevor Sie die Datei erneut hochladen. |
| | nl | We konden niet bevestigen of {fileName} is aangekomen. | Controleer de lijst met documenten op deze pagina voordat u het opnieuw uploadt. |
| | el | Δεν μπορέσαμε να επιβεβαιώσουμε αν το {fileName} έφτασε. | Ελέγξτε τη λίστα εγγράφων σε αυτή τη σελίδα πριν το ανεβάσετε ξανά. |
| | he | לא הצלחנו לאשר אם {fileName} הגיע. | בדקו את רשימת המסמכים בדף הזה לפני שתעלו אותו שוב. |

### 6c. `proposalResponse` (C, 7 locales)

Parameter: `{listingTitle}`, the property's approved title in this locale, or the stored source title.

- **Agreement is not closing.** Agreement moves the terms to `agreed_for_next_step`. That is never "bought", "rented" or "signed"; closing needs reviewed evidence.
- **Changed terms.** Any change to parties, amount, currency, conditions or deadline creates a new version, so an answer to an older version is `changed`.
- **Approvals.** Only the client records this decision. Butler never answers terms.

| state | | message | next |
|---|---|---|---|
| agreed | bg | Записахме, че приемате тези условия за {listingTitle}. | Следващите стъпки ще виждате на тази страница; засега нищо не е подписано или платено. |
| | en | We recorded that you agree to these terms for {listingTitle}. | You will see the next steps on this page; nothing is signed or paid at this point. |
| | ru | Мы записали, что вы согласны с этими условиями для объекта {listingTitle}. | Следующие шаги будут видны на этой странице; пока ничего не подписано и не оплачено. |
| | de | Wir haben festgehalten, dass Sie diesen Bedingungen für {listingTitle} zustimmen. | Die nächsten Schritte sehen Sie auf dieser Seite; bisher ist nichts unterschrieben oder bezahlt. |
| | nl | We hebben vastgelegd dat u akkoord gaat met deze voorwaarden voor {listingTitle}. | De volgende stappen ziet u op deze pagina; er is nog niets ondertekend of betaald. |
| | el | Καταγράψαμε ότι συμφωνείτε με αυτούς τους όρους για {listingTitle}. | Τα επόμενα βήματα θα τα βλέπετε σε αυτή τη σελίδα· προς το παρόν τίποτα δεν έχει υπογραφεί ή πληρωθεί. |
| | he | רשמנו שאתם מסכימים לתנאים האלה עבור {listingTitle}. | את השלבים הבאים תראו בדף הזה; בינתיים שום דבר לא נחתם ולא שולם. |
| declined | bg | Записахме, че отказвате тези условия за {listingTitle}. | Ако искате да обсъдите други условия, изпратете съобщение на Вашия брокер. |
| | en | We recorded that you decline these terms for {listingTitle}. | If you want to discuss other terms, send your broker a message. |
| | ru | Мы записали, что вы отклоняете эти условия для объекта {listingTitle}. | Если хотите обсудить другие условия, напишите своему брокеру. |
| | de | Wir haben festgehalten, dass Sie diese Bedingungen für {listingTitle} ablehnen. | Wenn Sie andere Bedingungen besprechen möchten, schreiben Sie Ihrem Makler eine Nachricht. |
| | nl | We hebben vastgelegd dat u deze voorwaarden voor {listingTitle} afwijst. | Wilt u andere voorwaarden bespreken, stuur uw makelaar dan een bericht. |
| | el | Καταγράψαμε ότι απορρίπτετε αυτούς τους όρους για {listingTitle}. | Αν θέλετε να συζητήσετε άλλους όρους, στείλτε μήνυμα στον μεσίτη σας. |
| | he | רשמנו שאתם דוחים את התנאים האלה עבור {listingTitle}. | אם תרצו לדון בתנאים אחרים, שלחו הודעה למתווך שלכם. |
| alreadyAnswered | bg | Отговорът Ви на тези условия вече е записан. | Можете да го видите на тази страница; нищо не е записано два пъти. |
| | en | Your answer to these terms was already recorded. | You can see it on this page; nothing was recorded twice. |
| | ru | Ваш ответ на эти условия уже записан. | Его можно увидеть на этой странице; ничего не записано дважды. |
| | de | Ihre Antwort auf diese Bedingungen ist bereits festgehalten. | Sie sehen sie auf dieser Seite; nichts wurde doppelt festgehalten. |
| | nl | Uw antwoord op deze voorwaarden is al vastgelegd. | U ziet het op deze pagina; er is niets dubbel vastgelegd. |
| | el | Η απάντησή σας σε αυτούς τους όρους έχει ήδη καταγραφεί. | Μπορείτε να τη δείτε σε αυτή τη σελίδα· τίποτα δεν καταγράφηκε δύο φορές. |
| | he | התשובה שלכם לתנאים האלה כבר נרשמה. | אפשר לראות אותה בדף הזה; שום דבר לא נרשם פעמיים. |
| changed | bg | Тези условия са променени, след като ги отворихте, затова отговорът Ви не е записан. | Прочетете новите условия и отговорете отново. |
| | en | These terms changed after you opened them, so your answer was not recorded. | Read the new terms and answer again. |
| | ru | Эти условия изменились после того, как вы их открыли, поэтому ваш ответ не записан. | Прочитайте новые условия и ответьте снова. |
| | de | Diese Bedingungen wurden geändert, nachdem Sie sie geöffnet hatten, daher wurde Ihre Antwort nicht festgehalten. | Lesen Sie die neuen Bedingungen und antworten Sie erneut. |
| | nl | Deze voorwaarden zijn gewijzigd nadat u ze opende, dus uw antwoord is niet vastgelegd. | Lees de nieuwe voorwaarden en antwoord opnieuw. |
| | el | Αυτοί οι όροι άλλαξαν αφού τους ανοίξατε, οπότε η απάντησή σας δεν καταγράφηκε. | Διαβάστε τους νέους όρους και απαντήστε ξανά. |
| | he | התנאים האלה השתנו אחרי שפתחתם אותם, ולכן התשובה שלכם לא נרשמה. | קראו את התנאים החדשים וענו שוב. |
| expired | bg | Срокът на тези условия изтече преди отговора Ви, затова той не е записан. | Ако все още проявявате интерес, изпратете съобщение на Вашия брокер. |
| | en | These terms expired before your answer, so it was not recorded. | If you are still interested, send your broker a message. |
| | ru | Срок этих условий истёк до вашего ответа, поэтому он не записан. | Если вы всё ещё заинтересованы, напишите своему брокеру. |
| | de | Diese Bedingungen sind vor Ihrer Antwort abgelaufen, daher wurde sie nicht festgehalten. | Wenn Sie weiterhin interessiert sind, schreiben Sie Ihrem Makler eine Nachricht. |
| | nl | Deze voorwaarden zijn verlopen vóór uw antwoord, dus het is niet vastgelegd. | Bent u nog steeds geïnteresseerd, stuur uw makelaar dan een bericht. |
| | el | Αυτοί οι όροι έληξαν πριν από την απάντησή σας, οπότε δεν καταγράφηκε. | Αν σας ενδιαφέρει ακόμη, στείλτε μήνυμα στον μεσίτη σας. |
| | he | תוקף התנאים האלה פג לפני שעניתם, ולכן התשובה לא נרשמה. | אם אתם עדיין מעוניינים, שלחו הודעה למתווך שלכם. |

### 6d. `appointmentResponse` (C, 7 locales)

Parameter: `{when}`, the slot start formatted in the property's time zone with the zone named.

- **Bound to one time.** Each person's answer is bound to one version of the proposed time. A reschedule makes earlier answers void, so they become `changed`.
- **Booking.** A viewing is booked only when both sides accepted the same time and the resource checks passed. `accepted` therefore never says booked.
- **Reschedule.** A reschedule request keeps the confirmed time in force until a replacement is confirmed.

| state | | message | next |
|---|---|---|---|
| accepted | bg | Записахме, че {when} Ви е удобно. | Огледът е уговорен едва когато и другата страна потвърди същия час; ще го видите тук. |
| | en | We recorded that {when} suits you. | The viewing is booked only when the other side confirms the same time; you will see it here. |
| | ru | Мы записали, что вам подходит {when}. | Просмотр назначен, только когда другая сторона подтвердит то же время; это будет видно здесь. |
| | de | Wir haben festgehalten, dass Ihnen {when} passt. | Die Besichtigung steht erst fest, wenn die andere Seite denselben Termin bestätigt; Sie sehen das hier. |
| | nl | We hebben vastgelegd dat {when} u past. | De bezichtiging staat pas vast als de andere kant hetzelfde tijdstip bevestigt; u ziet dat hier. |
| | el | Καταγράψαμε ότι η ώρα {when} σας βολεύει. | Η επίσκεψη κλείνει μόνο όταν και η άλλη πλευρά επιβεβαιώσει την ίδια ώρα· θα το δείτε εδώ. |
| | he | רשמנו ש-{when} מתאים לכם. | הסיור נקבע רק כשגם הצד השני יאשר את אותו מועד; תראו זאת כאן. |
| confirmed | bg | Огледът Ви е уговорен за {when}. | Добавете го в календара си от тази страница; оттук можете и да поискате друг час. |
| | en | Your viewing is booked for {when}. | Add it to your calendar from this page; you can also ask for a different time here. |
| | ru | Ваш просмотр назначен на {when}. | Добавьте его в календарь с этой страницы; здесь же можно попросить другое время. |
| | de | Ihre Besichtigung ist für {when} vereinbart. | Übernehmen Sie den Termin von dieser Seite in Ihren Kalender; hier können Sie auch einen anderen Termin anfragen. |
| | nl | Uw bezichtiging staat vast op {when}. | Zet de afspraak vanaf deze pagina in uw agenda; hier kunt u ook een ander tijdstip vragen. |
| | el | Η επίσκεψή σας στο ακίνητο κλείστηκε για {when}. | Προσθέστε την στο ημερολόγιό σας από αυτή τη σελίδα· από εδώ μπορείτε επίσης να ζητήσετε άλλη ώρα. |
| | he | הסיור שלכם בנכס נקבע ל-{when}. | הוסיפו אותו ליומן שלכם מהדף הזה; כאן אפשר גם לבקש מועד אחר. |
| declined | bg | Записахме, че {when} не Ви е удобно. | Изберете други удобни за Вас часове на тази страница. |
| | en | We recorded that {when} does not suit you. | Choose other times that suit you on this page. |
| | ru | Мы записали, что {when} вам не подходит. | Выберите на этой странице другое удобное время. |
| | de | Wir haben festgehalten, dass Ihnen {when} nicht passt. | Wählen Sie auf dieser Seite andere Zeiten, die Ihnen passen. |
| | nl | We hebben vastgelegd dat {when} u niet past. | Kies op deze pagina andere tijden die u passen. |
| | el | Καταγράψαμε ότι η ώρα {when} δεν σας βολεύει. | Επιλέξτε σε αυτή τη σελίδα άλλες ώρες που σας βολεύουν. |
| | he | רשמנו ש-{when} לא מתאים לכם. | בחרו בדף הזה מועדים אחרים שמתאימים לכם. |
| rescheduleRequested | bg | Записахме молбата Ви за нов час; докато не бъде уговорен, огледът остава за {when}. | Запазете {when} свободно, докато тук не бъде потвърден нов час. |
| | en | We recorded your request for a new time; until one is agreed, the viewing stays at {when}. | Keep {when} free until a new time is confirmed here. |
| | ru | Мы записали вашу просьбу о другом времени; пока его не согласуют, просмотр остаётся на {when}. | Оставьте {when} свободным, пока здесь не подтвердят новое время. |
| | de | Wir haben Ihre Bitte um einen neuen Termin festgehalten; bis er vereinbart ist, bleibt die Besichtigung am {when}. | Halten Sie {when} frei, bis hier ein neuer Termin bestätigt ist. |
| | nl | We hebben uw verzoek om een nieuw tijdstip vastgelegd; tot dat is afgesproken, blijft de bezichtiging op {when}. | Houd {when} vrij tot hier een nieuw tijdstip is bevestigd. |
| | el | Καταγράψαμε το αίτημά σας για νέα ώρα· μέχρι να συμφωνηθεί, η επίσκεψη παραμένει για {when}. | Κρατήστε ελεύθερη την ώρα {when} μέχρι να επιβεβαιωθεί εδώ νέα ώρα. |
| | he | רשמנו את בקשתכם למועד חדש; עד שיסוכם, הסיור נשאר ב-{when}. | השאירו את {when} פנוי עד שיאושר כאן מועד חדש. |
| cancelled | bg | Огледът Ви за {when} е отменен. | Можете да поискате нов оглед от страницата на имота. |
| | en | Your viewing on {when} is cancelled. | You can ask for a new viewing from the property's page. |
| | ru | Ваш просмотр на {when} отменён. | Новый просмотр можно запросить на странице объекта. |
| | de | Ihre Besichtigung am {when} ist abgesagt. | Eine neue Besichtigung können Sie auf der Seite der Immobilie anfragen. |
| | nl | Uw bezichtiging op {when} is geannuleerd. | U kunt een nieuwe bezichtiging aanvragen op de pagina van de woning. |
| | el | Η επίσκεψή σας για {when} ακυρώθηκε. | Μπορείτε να ζητήσετε νέα επίσκεψη από τη σελίδα του ακινήτου. |
| | he | הסיור שלכם ב-{when} בוטל. | אפשר לבקש סיור חדש מדף הנכס. |
| changed | bg | Часът е променен, след като отворихте страницата, затова отговорът Ви не е записан. | Вижте новия час и отговорете отново. |
| | en | The time changed after you opened the page, so your answer was not recorded. | Look at the new time and answer again. |
| | ru | Время изменилось после того, как вы открыли страницу, поэтому ваш ответ не записан. | Посмотрите новое время и ответьте снова. |
| | de | Der Termin wurde geändert, nachdem Sie die Seite geöffnet hatten, daher wurde Ihre Antwort nicht festgehalten. | Sehen Sie sich den neuen Termin an und antworten Sie erneut. |
| | nl | Het tijdstip is gewijzigd nadat u de pagina opende, dus uw antwoord is niet vastgelegd. | Bekijk het nieuwe tijdstip en antwoord opnieuw. |
| | el | Η ώρα άλλαξε αφού ανοίξατε τη σελίδα, οπότε η απάντησή σας δεν καταγράφηκε. | Δείτε τη νέα ώρα και απαντήστε ξανά. |
| | he | המועד השתנה אחרי שפתחתם את הדף, ולכן התשובה שלכם לא נרשמה. | עיינו במועד החדש וענו שוב. |

### 6e. `handover` (S: bg, en, ru)

Parameters:
- `{taskTitle}`: the task's own title.
- `{receiverName}`: the colleague asked to take it.
- `{ownerName}`: the person who keeps it.

Names are inserted as given. The Russian rows avoid inflecting them.

- **Ownership.** It changes only when the receiver accepts. A request changes only the pending receiver. Only the receiver can accept, and no manager accepts on their behalf.
- **W03 acceptance.** Accepting asks for the receiver's own review time and next step.
- **Decline.** The `declined` state is the W03 design. `handoverTask` today supports only request, accept and cancel (section 9).

| state | | message | next |
|---|---|---|---|
| requested | bg | Помолихме {receiverName} да поеме задачата {taskTitle}. | Задачата остава Ваша, докато {receiverName} не я приеме; дотогава можете да оттеглите молбата. |
| | en | We asked {receiverName} to take over {taskTitle}. | It stays yours until {receiverName} accepts; until then you can withdraw the request. |
| | ru | Запрос на передачу задачи {taskTitle} отправлен коллеге {receiverName}. | Задача остаётся за вами, пока коллега её не примет; до этого запрос можно отозвать. |
| accepted | bg | Вече отговаряте за задачата {taskTitle}. | Посочете кога ще я прегледате отново и каква е следващата стъпка. |
| | en | You are now responsible for {taskTitle}. | Set when you will look at it next and what the next step is. |
| | ru | Теперь задача {taskTitle} за вами. | Укажите, когда вы вернётесь к ней и какой следующий шаг. |
| declined | bg | Отказахте да поемете задачата {taskTitle}, затова тя остава при {ownerName}. | {ownerName} вижда причината Ви и може да помоли някой друг. |
| | en | You declined to take over {taskTitle}, so it stays with {ownerName}. | {ownerName} sees your reason and can ask someone else. |
| | ru | Вы отказались брать задачу {taskTitle}, поэтому ответственным остаётся {ownerName}. | {ownerName} видит вашу причину и может попросить кого-то другого. |
| cancelled | bg | Оттеглихте молбата за предаване, затова задачата {taskTitle} остава при Вас. | Помолете някой друг да я поеме или продължете работата по нея. |
| | en | You withdrew the handover request, so {taskTitle} stays with you. | Ask someone else to take it, or keep working on it. |
| | ru | Вы отозвали запрос на передачу, поэтому задача {taskTitle} остаётся за вами. | Попросите взять её кого-то другого или продолжайте работать над ней. |
| changed | bg | Молбата за предаване се промени, преди да отговорите, затова нищо не е записано. | Отворете задачата, за да видите при кого е сега. |
| | en | This handover request changed before you answered, so nothing was recorded. | Open the task to see who has it now. |
| | ru | Запрос на передачу изменился до вашего ответа, поэтому ничего не записано. | Откройте задачу, чтобы увидеть, за кем она сейчас. |

### 6f. `publicationActivate` (S: bg, en, ru)

Parameters:
- `{listingTitle}`: the listing's title.
- `{localeName}`: the language name in the reader's locale, for example «английски».
- `{destinationName}`: the destination's display name, for example a property portal.

W08 saved result, three distinct outcomes:
- live on the website (`liveOnSite`);
- destination queued (`destinationQueued`, or `portalPending` for a manual portal);
- external delivery unknown (`deliveryUnknown`).

- **Human-only.** Publishing is a recorded human command; Butler never publishes.
- **Destinations.** Automated external distribution is not a launch capability, so a manual portal is "ready, not there until posted".
- **Unknown delivery.** It never prompts a blind resend.

| state | | message | next |
|---|---|---|---|
| liveOnSite | bg | Обявата {listingTitle} вече е на сайта (език: {localeName}). | Отворете публичната страница, за да я проверите. |
| | en | The listing {listingTitle} is now on the website (language: {localeName}). | Open the public page to check it. |
| | ru | Объявление {listingTitle} уже на сайте (язык: {localeName}). | Откройте публичную страницу, чтобы проверить его. |
| destinationQueued | bg | Обявата {listingTitle} е одобрена за {destinationName} и чака да бъде изпратена там. | Засега не е нужно нищо; редът ще се промени, когато {destinationName} потвърди. |
| | en | The listing {listingTitle} is approved for {destinationName} and waiting to be sent there. | Nothing to do now; this line changes when {destinationName} confirms it. |
| | ru | Объявление {listingTitle} одобрено для площадки {destinationName} и ждёт отправки туда. | Сейчас ничего делать не нужно; строка изменится, когда площадка {destinationName} подтвердит получение. |
| portalPending | bg | Обявата {listingTitle} е готова за {destinationName}, но няма да се появи там, докато някой не я публикува ръчно. | Публикувайте я в {destinationName} и след това отбележете тук, че е публикувана. |
| | en | The listing {listingTitle} is ready for {destinationName}, but it will not appear there until someone posts it by hand. | Post it on {destinationName}, then mark it as posted here. |
| | ru | Объявление {listingTitle} готово для площадки {destinationName}, но не появится там, пока его не опубликуют вручную. | Опубликуйте его на площадке {destinationName}, а затем отметьте здесь, что оно опубликовано. |
| deliveryUnknown | bg | Още не е потвърдено дали обявата {listingTitle} е стигнала до {destinationName}. | Проверете обявата в {destinationName}, преди да опитате отново. |
| | en | It is not confirmed yet whether the listing {listingTitle} reached {destinationName}. | Check the listing on {destinationName} before you try again. |
| | ru | Пока не подтверждено, дошло ли объявление {listingTitle} до площадки {destinationName}. | Проверьте объявление на площадке {destinationName}, прежде чем пробовать снова. |
| alreadyLive | bg | Тази версия на обявата {listingTitle} вече е на сайта (език: {localeName}). | Не е нужно нищо; отворете публичната страница, за да я проверите. |
| | en | This version of the listing {listingTitle} is already on the website (language: {localeName}). | Nothing to do; open the public page to check it. |
| | ru | Эта версия объявления {listingTitle} уже на сайте (язык: {localeName}). | Ничего делать не нужно; откройте публичную страницу, чтобы проверить. |
| changed | bg | Обявата {listingTitle} е променена, след като я прегледахте, затова нищо не е публикувано. | Прегледайте последната версия и след това я публикувайте. |
| | en | The listing {listingTitle} changed after you reviewed it, so nothing was published. | Review the latest version, then publish it. |
| | ru | Объявление {listingTitle} изменилось после вашей проверки, поэтому ничего не опубликовано. | Проверьте последнюю версию, затем опубликуйте. |

---

## 7. `server.butler.*`

Sources: `src/domain/butler.ts` (`butlerEligibility`, `butlerReceipt`), `src/server/operations.ts` (Butler denial and unknown paths), `src/server/butler/authority.ts`, `src/server/butler/receipts.ts`, `docs/butler-authorization.md`.

**Must stay technically true.**
- **Verdicts.** Every settled Butler receipt shows its verdict, a reason line and «Do it myself». New intents are `awaitingApproval` or `blocked`, with `outcome: "not_applied"`.
  - «Done automatically» appears only for a historical receipt whose `outcome` is `applied`, including confirmed reconciliation of a historical unknown effect.
  - `blocked` with `outcome: "unknown"` uses `outcome_unknown` and never says failed or done.
- **«Do it myself».** It is always shown and routes to the separately authorized human command for the same step. It is a choice of workflow, not a grant: a person without the capability still meets `forbidden`. When `manual.requiresReconciliation` is true, the button carries `manual.checkFirst`.
- **Limits.** Butler may draft within a selected task. It never creates an internal task, sends to a customer, books, approves, publishes, makes a translation indexable, grants access, cancels or takes a legal, tax or money step. Instructions found in content never give it authority.
- **Current execution.** No autonomous step is enabled. The `task.create` adapter validates old intents and records a denial without creating a task or activity. Send and booking adapters are unregistered; registering an adapter cannot grant execution authority.
- **Surfaces.** Butler receipts are staff-only today (`readButlerReceipt` requires a live staff session), so reasons ship in bg, en, ru. The three verdict labels and «Do it myself» are shared with the public and client Butler entry, so they ship in all seven locales.
- **Layout.** The action label (7c) is shown next to the verdict, so reason lines carry no `{action}` parameter and no grammar depends on it.
- **Unlisted reasons.** A reason equal to an error code (`denialReason ?? known.code` in `operations.ts`) renders `server.errors.<code>.message` from the staff catalog plus `server.butler.blocked.error.next`.

### 7a. Verdict labels and the manual path (P C S, 7 locales)

`doItMyself` for bg is the G3.1 gate literal; see section 9 on its gendered form.

| | verdict.doneAutomatically | verdict.awaitingApproval | verdict.blocked | doItMyself |
|---|---|---|---|---|
| bg | Изпълнено автоматично | Чака Вашето одобрение | Блокирано | Ще го направя аз |
| en | Done automatically | Awaiting your approval | Blocked | Do it myself |
| ru | Выполнено автоматически | Ждёт вашего одобрения | Заблокировано | Сделать самостоятельно |
| de | Automatisch erledigt | Wartet auf Ihre Freigabe | Blockiert | Selbst erledigen |
| nl | Automatisch gedaan | Wacht op uw goedkeuring | Geblokkeerd | Zelf doen |
| el | Έγινε αυτόματα | Περιμένει την έγκρισή σας | Μπλοκαρίστηκε | Θα το κάνω εγώ |
| he | בוצע אוטומטית | ממתין לאישור שלכם | חסום | לעשות את זה בעצמי |

`server.butler.manual.checkFirst` (S: bg, en, ru), shown under «Do it myself» when the receipt requires reconciliation:

| | text |
|---|---|
| bg | Първо проверете дали стъпката на Butler вече не е изпълнена. |
| en | First check whether Butler's step already happened. |
| ru | Сначала проверьте, не выполнен ли уже шаг Butler. |

### 7b. Reasons · `server.butler.<verdict>.<reason>.message` / `.next` (S: bg, en, ru)

`<verdict>` is `awaitingApproval` or `blocked` for new draft-only intents. `<reason>` is the reason code exactly as the server stores it. `awaitingApproval` records an intent that cannot resume automatically: a person uses a separately authorized manual command. The `doneAutomatically` rows below are historical receipt copy only, including confirmed reconciliation of an old unknown effect; they grant no current execution authority.

| verdict · reason | | message | next |
|---|---|---|---|
| awaitingApproval · draft_only | bg | Butler не извърши тази стъпка. Тя трябва да бъде изпълнена от човек. | Прегледайте я и използвайте «Ще го направя аз», за да я извършите лично. |
| | en | Butler did not take this step. A person must do it. | Review it, then use «Do it myself» to take the step yourself. |
| | ru | Butler не выполнил этот шаг. Его должен выполнить человек. | Проверьте его и нажмите «Сделать самостоятельно», чтобы выполнить шаг лично. |
| doneAutomatically · owner_option_2 | bg | Butler извърши тази рутинна стъпка сам и я записа. | Проверете резултата тук; ако нещо не е наред, използвайте «Ще го направя аз», за да го оправите ръчно. |
| | en | Butler did this routine step on its own and kept a record. | Check the result here; if something is off, use «Do it myself» to fix it by hand. |
| | ru | Butler выполнил этот обычный шаг сам и сохранил запись. | Проверьте результат здесь; если что-то не так, нажмите «Сделать самостоятельно» и исправьте вручную. |
| doneAutomatically · reconciled_applied | bg | Вече потвърдихме, че стъпката на Butler е изпълнена. | Проверете резултата тук; не повтаряйте стъпката. |
| | en | We have now confirmed that Butler's step went through. | Check the result here; do not repeat the step. |
| | ru | Теперь подтверждено, что шаг Butler выполнен. | Проверьте результат здесь; не повторяйте шаг. |
| awaitingApproval · human_required | bg | Тази стъпка може да направи само човек, затова Butler не я е извършил. | Прегледайте я и използвайте «Ще го направя аз». |
| | en | Only a person can take this step, so Butler did not do it. | Review it, then use «Do it myself». |
| | ru | Этот шаг может сделать только человек, поэтому Butler его не выполнил. | Проверьте его и нажмите «Сделать самостоятельно». |
| awaitingApproval · protected_effect | bg | Тази стъпка има правно, данъчно или финансово значение, затова трябва да я одобри човек. | Прегледайте я и използвайте «Ще го направя аз». |
| | en | This step would have a legal, tax or money effect, so a person must approve it. | Review it, then use «Do it myself». |
| | ru | У этого шага есть юридические, налоговые или денежные последствия, поэтому его должен одобрить человек. | Проверьте его и нажмите «Сделать самостоятельно». |
| awaitingApproval · template_not_approved | bg | Съобщението се различава от одобрения шаблон, затова трябва да го одобри човек. | Прегледайте текста и използвайте «Ще го направя аз». |
| | en | The message differs from the approved template, so a person must approve it. | Review the text, then use «Do it myself». |
| | ru | Сообщение отличается от одобренного шаблона, поэтому его должен одобрить человек. | Проверьте текст и нажмите «Сделать самостоятельно». |
| awaitingApproval · first_contact_requires_human | bg | Това би било първото съобщение до някого нов, затова е нужно одобрение от човек. | Прегледайте съобщението и използвайте «Ще го направя аз». |
| | en | This would be the first message to someone new, so a person must approve it. | Review the message, then use «Do it myself». |
| | ru | Это было бы первое сообщение новому человеку, поэтому нужно одобрение сотрудника. | Проверьте сообщение и нажмите «Сделать самостоятельно». |
| awaitingApproval · client_promise_requires_human | bg | Тази задача би обещала нещо на клиента, затова трябва да я одобри човек. | Прегледайте задачата и използвайте «Ще го направя аз». |
| | en | This task would promise something to the client, so a person must approve it. | Review the task, then use «Do it myself». |
| | ru | Эта задача содержала бы обещание клиенту, поэтому её должен одобрить человек. | Проверьте задачу и нажмите «Сделать самостоятельно». |
| blocked · action_not_allowlisted | bg | Butler няма право да прави такава стъпка, затова нищо не е направено. | Използвайте «Ще го направя аз», за да я направите ръчно. |
| | en | Butler is not allowed to take this kind of step, so nothing was done. | Use «Do it myself» to do it by hand. |
| | ru | Butler не может выполнять такие шаги, поэтому ничего не сделано. | Нажмите «Сделать самостоятельно», чтобы сделать это вручную. |
| blocked · action_not_registered | bg | Butler не може да изпълни тази стъпка, затова нищо не е направено. | Служител с нужните права може да я извърши ръчно чрез «Ще го направя аз». |
| | en | Butler cannot perform this step, so nothing was done. | An authorized staff member can take it manually through «Do it myself». |
| | ru | Butler не может выполнить этот шаг, поэтому ничего не сделано. | Сотрудник с нужными правами может выполнить его вручную через «Сделать самостоятельно». |
| blocked · server_authority_required | bg | Butler спря, защото не можа да потвърди, че стъпката е разрешена, затова нищо не е направено. | Използвайте «Ще го направя аз», за да я направите ръчно. |
| | en | Butler stopped because it could not confirm this step was allowed, so nothing was done. | Use «Do it myself» to do it by hand. |
| | ru | Butler остановился: не удалось подтвердить, что шаг разрешён, поэтому ничего не сделано. | Нажмите «Сделать самостоятельно», чтобы сделать это вручную. |
| blocked · case_scope_not_current | bg | Butler спря, защото сделката, към която е стъпката, е приключена или променена, затова нищо не е направено. | Отворете сделката, за да видите докъде е стигнала, и използвайте «Ще го направя аз», ако стъпката още е нужна. |
| | en | Butler stopped because the deal this step belongs to is closed or has changed, so nothing was done. | Open the deal to see where it stands, and use «Do it myself» if the step is still needed. |
| | ru | Butler остановился: сделка, к которой относится шаг, закрыта или изменилась, поэтому ничего не сделано. | Откройте сделку, чтобы увидеть, что с ней сейчас, и нажмите «Сделать самостоятельно», если шаг ещё нужен. |
| blocked · template_unavailable | bg | Butler спря, защото одобреният шаблон за съобщение не е наличен, затова нищо не е изпратено. | Напишете съобщението сами чрез «Ще го направя аз». |
| | en | Butler stopped because the approved message template is not available, so nothing was sent. | Write the message yourself with «Do it myself». |
| | ru | Butler остановился: одобренный шаблон сообщения недоступен, поэтому ничего не отправлено. | Напишите сообщение сами через «Сделать самостоятельно». |
| blocked · recipient_not_eligible | bg | Butler спря, защото някой от получателите не може да получи това съобщение, затова нищо не е изпратено. | Проверете кой трябва да го получи и използвайте «Ще го направя аз». |
| | en | Butler stopped because someone on the list cannot receive this message, so nothing was sent. | Check who should get it, then use «Do it myself». |
| | ru | Butler остановился: кто-то из получателей не может получить это сообщение, поэтому ничего не отправлено. | Проверьте, кто должен его получить, и нажмите «Сделать самостоятельно». |
| blocked · slot_not_agreed | bg | Butler не уговори огледа, защото двете страни не са приели един и същ час. | Уговорете час с двете страни или организирайте огледа чрез «Ще го направя аз». |
| | en | Butler did not book the viewing because both sides have not accepted the same time. | Agree a time with both sides, or arrange it with «Do it myself». |
| | ru | Butler не назначил просмотр: обе стороны не приняли одно и то же время. | Согласуйте время с обеими сторонами или организуйте просмотр через «Сделать самостоятельно». |
| blocked · viewing_resources_unavailable | bg | Butler не уговори огледа, защото брокерът, достъпът до имота или обявата не са налични за този час. | Изберете друг час или организирайте огледа чрез «Ще го направя аз». |
| | en | Butler did not book the viewing because the broker, access to the property or the listing is not available at that time. | Choose another time, or arrange it with «Do it myself». |
| | ru | Butler не назначил просмотр: брокер, доступ к объекту или само объявление недоступны в это время. | Выберите другое время или организуйте просмотр через «Сделать самостоятельно». |
| blocked · document_receipt_not_proven | bg | Butler не отбеляза документа като получен, защото качването не е потвърдено. | Проверете списъка с документи и използвайте «Ще го направя аз». |
| | en | Butler did not mark the document as received because the upload is not confirmed. | Check the document list, then use «Do it myself». |
| | ru | Butler не отметил документ как полученный: загрузка не подтверждена. | Проверьте список документов и нажмите «Сделать самостоятельно». |
| blocked · task_scope_invalid | bg | Butler не създаде задачата, защото тя не е вътрешна или няма кой да отговаря за нея. | Създайте задачата сами чрез «Ще го направя аз». |
| | en | Butler did not create the task because it is not an internal task or nobody is available to own it. | Create the task yourself with «Do it myself». |
| | ru | Butler не создал задачу: она не внутренняя или за неё некому отвечать. | Создайте задачу сами через «Сделать самостоятельно». |
| blocked · outcome_unknown | bg | Butler не можа да потвърди дали тази стъпка е изпълнена. | Проверете дали вече е станала, преди някой да я повтори, включително чрез «Ще го направя аз». |
| | en | Butler could not confirm whether this step went through. | Check whether it already happened before anyone repeats it, including with «Do it myself». |
| | ru | Butler не смог подтвердить, выполнен ли этот шаг. | Проверьте, не выполнен ли он уже, прежде чем кто-то повторит его, в том числе через «Сделать самостоятельно». |
| blocked · error (fallback, `next` only) | bg | (uses `server.errors.<code>.message`) | Използвайте «Ще го направя аз», ако стъпката още е нужна. |
| | en | (uses `server.errors.<code>.message`) | Use «Do it myself» if the step is still needed. |
| | ru | (uses `server.errors.<code>.message`) | Нажмите «Сделать самостоятельно», если шаг ещё нужен. |

### 7c. Action labels · `server.butler.action.<action>` (S: bg, en, ru)

`<action>` is the action string from `butlerRoutineActions`, `butlerHumanActions`, or `unclassified`. These labels name intents; they grant no execution authority.

| action | bg | en | ru |
|---|---|---|---|
| acknowledgement.send | Потвърждение, че запитването е получено | Confirm the inquiry was received | Подтверждение получения обращения |
| reminder.send | Напомняне по одобрен шаблон | Reminder from an approved template | Напоминание по одобренному шаблону |
| chaser.send | Напомняне за липсващ документ | Reminder about a missing document | Напоминание о недостающем документе |
| viewing.book | Уговаряне на оглед, приет от двете страни | Book a viewing both sides accepted | Назначение просмотра, принятого обеими сторонами |
| document.record_received | Отбелязване на документ като получен, чакащ преглед | Mark a document as received, waiting for review | Отметка «документ получен, ждёт проверки» |
| task.create | Създаване на вътрешна задача | Create an internal task | Создание внутренней задачи |
| contact.first | Първо съобщение до нов човек | First message to a new person | Первое сообщение новому человеку |
| price.change | Промяна на цена | Change a price | Изменение цены |
| offer.make | Отправяне на оферта | Make an offer | Отправка предложения |
| terms.change | Промяна на условия | Change terms | Изменение условий |
| condition.clear | Отбелязване на условие като изпълнено | Mark a condition as met | Отметка об исполнении условия |
| condition.waive | Отказ от условие | Waive a condition | Отказ от условия |
| publication.publish | Публикуване на обява | Publish a listing | Публикация объявления |
| publication.withdraw | Сваляне на обява | Take a listing down | Снятие объявления |
| translation.index | Показване на превод в търсачките | Let search engines show a translation | Показ перевода в поисковых системах |
| access.grant | Даване на достъп | Give access | Предоставление доступа |
| action.cancel | Отмяна на уговорено | Cancel something already arranged | Отмена договорённого |
| legal.act | Стъпка с правно или данъчно значение | A step with legal or tax effect | Шаг с юридическими или налоговыми последствиями |
| money.act | Стъпка, свързана с пари | A step involving money | Шаг, связанный с деньгами |
| unclassified | Неразпозната стъпка | Unrecognised step | Нераспознанный шаг |

---

## 8. Counts

A string is one key in one locale. Staff override rows count as separate strings in the staff catalog set.

| Family | Keys | bg | en | ru | de | nl | el | he | Strings |
|---|---|---|---|---|---|---|---|---|---|
| 1. `server.errors` (26 codes, `rate_limited.nextTimed`, 6 staff overrides) | 53 + 6 | 59 | 59 | 59 | 53 | 53 | 53 | 53 | 389 |
| 2. `server.email.auth` (5 templates × 4) | 20 | 20 | 20 | 20 | 12 | 12 | 12 | 12 | 108 |
| 3. `server.email.searchAlerts` (4 carried intact, 2 new) | 6 | 6 | 6 | 6 | 6 | 6 | 6 | 6 | 42 |
| 4. `server.notification.inquiry.received` | 5 | 5 | 5 | 5 | – | – | – | – | 15 |
| 5. `server.email.case` + `server.email.viewing` | 32 | 32 | 32 | 32 | 9 | 9 | 9 | 9 | 132 |
| 6. `server.receipt` (6 commands, 32 states) | 64 | 64 | 64 | 64 | 42 | 42 | 42 | 42 | 360 |
| 7. `server.butler` (verdicts, 17 reasons, 20 actions) | 60 | 60 | 60 | 60 | 4 | 4 | 4 | 4 | 196 |
| **Total** | | **246** | **246** | **246** | **126** | **126** | **126** | **126** | **1,242** |

## 9. Keys not worded and open questions

### Not worded

| Key family | Blocking question |
|---|---|
| `server.validation.<command>.<field>.<reason>` | Which commands, fields and stable reason keys can the server return? Codex lists the full inline-validator inventory as the next backend slice; without it, any wording would invent reasons the server never sends. |
| `server.activity.<event>` | Which activity and audit event keys reach a screen, and with which allowlisted parameters? The event inventory has not been delivered. |

### Worded, but blocked on a decision

| Key | Question |
|---|---|
| `server.email.auth.reauth.*` | Will clients without a passkey get an email route for "confirm it is you"? Today step-up is passkey-only and `auth.email_link` has only the `sign_in` purpose. If the answer is no, drop these four keys. |
| `server.receipt.handover.declined.*` | Will `handoverTask` gain a `decline` action that stores a reason the current owner can see (W03)? Today it supports only request, accept and cancel. |
| `server.receipt.publicationActivate.portalPending.next` | Is there a command to record "posted on the manual portal"? If not, `next` must instead say who posts it and where that is tracked. |
| `server.email.viewing.*`, `server.receipt.appointmentResponse.*` | Are calendar emails and responses only for property viewings? Remote or consultation appointments would need neutral «appointment» variants. |
| `server.receipt.appointmentResponse.accepted.*` | Does `respondToAppointment` record one participant's acceptance bound to the slot version (W06)? Or does it only move the whole appointment to `confirmed`? The `accepted` state assumes the former. |
| `server.butler.doItMyself` (bg, ru) | Keep the gate literal «Ще го направя аз» (masculine), or switch to the gender-neutral «Ще го направя аз»? ru uses the neutral infinitive «Сделать самостоятельно». The gate text G3.1 must change with any bg switch. |
| `server.errors.outcome_unknown`, `operation_pending`, `internal_error` | Should the server return a short human support reference? G3.7 asks to «провери същата заявка», but `correlationId` is a raw UUID and is never shown. Today these pairs carry no reference. |

### Non-blocking binding notes

| Key | Note |
|---|---|
| `server.notification.inquiry.received.next` | The incoming-list URL is fixed to `/bg/inquiries`. Should it follow the recipient's staff locale? The inquiry purpose is available in the event but not in the notice; it could be added as a parameter. |
| `server.email.case.wrapper.why` | The case email payload has no preferences URL. Should the server add the client preferences link so the line can point to it? |
| `server.receipt.documentUpload.checkFailed.next` | The client document page must show the "check again" control; `file.scan.request` already allows anyone with access to the file. |
| `{when}`, `{expiresAt}`, `{localeName}`, `{destinationName}` | The server or UI formatter must supply these per locale with the time zone named; the catalogs never build them. |
