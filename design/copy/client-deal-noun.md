# Client wording for the deal object («случай» / "case" sweep)

Owner pick: the staff noun is «Сделка / Сделки». Clients see the same object, named by its kind when the screen knows it, and «сделка» when it does not. Never «случай», «преписка», «дело», "case" or "matter" in any locale. Bulgarian uses the polite «Вие / Ви» with a capital letter. Non-bg strings are drafts until a named reviewer approves them (translation workflow, `design/i18n-uncatalogued-copy-plan.md` §3.5).

## Kind-specific titles (use when the kind is known)

| Kind | bg | en | ru | de | nl | el | he |
|---|---|---|---|---|---|---|---|
| buy | Моята покупка | My purchase | Моя покупка | Mein Kauf | Mijn aankoop | Η αγορά μου | הרכישה שלי |
| sell | Моята продажба | My sale | Моя продажа | Mein Verkauf | Mijn verkoop | Η πώληση μου | המכירה שלי |
| rent (tenant) | Моят наем | My rental | Моя аренда | Meine Miete | Mijn huur | Η μίσθωσή μου | השכירות שלי |
| let (landlord) | Моето отдаване под наем | My letting | Моя сдача в аренду | Meine Vermietung | Mijn verhuur | Η εκμίσθωσή μου | ההשכרה שלי |
| unknown (fallback) | Моята сделка | My deal | Моя сделка | Mein Immobiliengeschäft | Mijn vastgoedzaak | Η συναλλαγή μου | העסקה שלי |

## Generic strings

| # | Where | bg | en | ru | de | nl | el | he |
|---|---|---|---|---|---|---|---|---|
| 1 | Client nav item | Моите сделки | My deals | Мои сделки | Meine Immobiliengeschäfte | Mijn vastgoedzaken | Οι συναλλαγές μου | העסקאות שלי |
| 2a | Overview title | Моите сделки | My deals | Мои сделки | Meine Immobiliengeschäfte | Mijn vastgoedzaken | Οι συναλλαγές μου | העסקאות שלי |
| 2b | Overview empty state | Още нямате достъп до сделка. Когато брокерът Ви покани, ще я видите тук. | You don't have access to a deal yet. When a broker invites you, it will appear here. | У Вас пока нет доступа к сделке. Когда брокер пригласит Вас, она появится здесь. | Sie haben noch keinen Zugriff auf ein Immobiliengeschäft. Sobald ein Makler Sie einlädt, erscheint es hier. | U heeft nog geen toegang tot een vastgoedzaak. Zodra een makelaar u uitnodigt, ziet u die hier. | Δεν έχετε ακόμη πρόσβαση σε συναλλαγή. Όταν σας προσκαλέσει ένας μεσίτης, θα εμφανιστεί εδώ. | עדיין אין לכם גישה לעסקה. כשמתווך יזמין אתכם, היא תופיע כאן. |
| 3a | Invitation (email + page) | {inviter} Ви кани в сделката „{title}“ (№ {reference}). | {inviter} has invited you to the deal “{title}” (No. {reference}). | {inviter} приглашает Вас в сделку «{title}» (№ {reference}). | {inviter} lädt Sie zum Immobiliengeschäft „{title}“ (Nr. {reference}) ein. | {inviter} nodigt u uit voor de vastgoedzaak ‘{title}’ (nr. {reference}). | Ο/Η {inviter} σας προσκαλεί στη συναλλαγή «{title}» (αρ. {reference}). | {inviter} מזמין/ה אתכם לעסקה ״{title}״ (מס׳ {reference}). |
| 3b | Invitation explainer | Когато брокерът сподели сделка с Вас, ще получите покана по имейл. | When a broker shares a deal with you, you'll get an invitation by email. | Когда брокер откроет Вам доступ к сделке, Вы получите приглашение по почте. | Wenn ein Makler ein Immobiliengeschäft mit Ihnen teilt, erhalten Sie eine Einladung per E-Mail. | Als een makelaar een vastgoedzaak met u deelt, krijgt u een uitnodiging per e-mail. | Όταν ένας μεσίτης μοιραστεί μαζί σας μια συναλλαγή, θα λάβετε πρόσκληση με email. | כשמתווך ישתף אתכם בעסקה, תקבלו הזמנה באימייל. |
| 4a | Email preference (privacy) | имейли за моите сделки | emails about my deals | письма о моих сделках | E-Mails zu meinen Immobiliengeschäften | e-mails over mijn vastgoedzaken | email για τις συναλλαγές μου | אימיילים על העסקאות שלי |
| 4b | Email preference (settings label) | Имейли за сделките | Emails about deals | Письма о сделках | E-Mails zu Immobiliengeschäften | E-mails over vastgoedzaken | Email για συναλλαγές | אימיילים על עסקאות |
| 5a | Button | Отворете сделката | Open the deal | Откройте сделку | Immobiliengeschäft öffnen | Vastgoedzaak openen | Ανοίξτε τη συναλλαγή | פתחו את העסקה |
| 5b | Button | Обратно към сделката | Back to the deal | Назад к сделке | Zurück zum Immobiliengeschäft | Terug naar de vastgoedzaak | Πίσω στη συναλλαγή | חזרה לעסקה |
| 6a | C17 lead | Управлявайте кой има достъп до сделката. | Manage who can see this deal. | Управляйте тем, у кого есть доступ к сделке. | Legen Sie fest, wer dieses Immobiliengeschäft sehen kann. | Bepaal wie deze vastgoedzaak kan zien. | Ορίστε ποιος βλέπει αυτή τη συναλλαγή. | קבעו מי יכול לראות את העסקה. |
| 6b | C17 action | Отнемете достъпа до сделката | Remove access to the deal | Закройте доступ к сделке | Zugriff auf das Immobiliengeschäft entziehen | Toegang tot de vastgoedzaak intrekken | Αφαιρέστε την πρόσβαση στη συναλλαγή | הסירו את הגישה לעסקה |
| 7 | Owner preview | какво сте възложили на агенцията по тази сделка | what you've authorised the agency to do for this deal | что Вы поручили агентству по этой сделке | wozu Sie die Agentur für dieses Immobiliengeschäft beauftragt haben | waarvoor u het kantoor voor deze vastgoedzaak hebt ingeschakeld | τι έχετε αναθέσει στο γραφείο για αυτή τη συναλλαγή | מה הסמכתם את הסוכנות לעשות בעסקה הזו |

Notes:
- A client screen that knows the kind uses the kind title from the first table in titles, buttons and emails («Отворете покупката», «Обратно към продажбата»); the generic strings above are the fallback.
- Item 7 keeps the meaning of the mandate («пълномощие») in plain words; the legal document itself keeps its own name where it is shown as a document.
- Staff strings: «Сделка / Сделки», en "Deal / Deals", ru «Сделка / Сделки».
