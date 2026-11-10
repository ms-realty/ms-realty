// Pre-approved wording for the deal notice family (ADR 0014, template `deal.notice.v1`). Each
// notice says what changed in one or two sentences and links to the private area; it never
// carries price, terms, address, access detail, free text or a document. Changing a sentence
// here is a template change: bump the template version and record the review.
//
// Rules (UX copy review): the subject says what changed, with the day for viewings; one job per
// sentence; the button names the page it opens with that page's own title (P14 "Property
// viewing", proposal "Proposal terms", "Document requests", "Conversation").
// Address forms follow design/copy/server-messages.md (bg «Вие» capitalised, ru «вы», de «Sie»,
// nl «u», el polite plural, he plural gender-neutral). Clients see «сделка»/"deal", never "case".
// Placeholders: {time} (date and time range, zone named), {day} (weekday and date), {step} (the
// caller's client-visible label). All arrive formatted; the copy never builds a date.
import "server-only";
import type { PublicLocale, StaffLocale } from "@/config/tenant";
import type { ClientNoticeEvent, StaffNoticeEvent } from "./events";

export interface NoticeCopy {
  readonly subject: string;
  /** Used when the notice has no time to show (a viewing cancelled before any time was set). */
  readonly subjectNoTime?: string;
  readonly lead: string;
  readonly leadNoTime?: string;
  /** The button: verb plus the title of the page it opens. */
  readonly action: string;
}

export interface ClientFrame {
  readonly calendarAttached: string;
  readonly calendarCancelAttached: string;
  readonly calendarLink: string;
  readonly reference: string;
  readonly footer: string;
  readonly preferences: string;
}

export interface StaffFrame {
  readonly reference: string;
  readonly footer: string;
}

export const clientNoticeCopy: Readonly<
  Record<PublicLocale, Readonly<Record<ClientNoticeEvent, NoticeCopy>> & { frame: ClientFrame }>
> = {
  bg: {
    "viewing.proposed": {
      subject: "Предложен час за оглед: {day}",
      lead: "Часът е {time}. Потвърдете го или предложете друг час в кабинета си.",
      action: "Отворете огледа на имот",
    },
    "viewing.confirmed": {
      subject: "Огледът Ви на {day} е потвърден",
      lead: "Часът е {time}.",
      action: "Отворете огледа на имот",
    },
    "viewing.moved": {
      subject: "Огледът Ви е преместен за {day}",
      lead: "Новият час е {time}.",
      action: "Отворете огледа на имот",
    },
    "viewing.cancelled": {
      subject: "Огледът Ви на {day} е отменен",
      subjectNoTime: "Огледът Ви е отменен",
      lead: "Беше насрочен за {time}. В кабинета си можете да поискате нов час.",
      leadNoTime: "В кабинета си можете да поискате нов час.",
      action: "Отворете огледа на имот",
    },
    "proposal.ready": {
      subject: "Предложение очаква Вашия отговор",
      lead: "Отговорете преди крайния срок, посочен в кабинета Ви.",
      action: "Отворете условията на предложението",
    },
    "proposal.withdrawn": {
      subject: "Брокерът оттегли предложение",
      lead: "Вече не е нужно да отговаряте.",
      action: "Отворете условията на предложението",
    },
    "proposal.expired": {
      subject: "Срокът на предложение изтече",
      lead: "Вече не е нужно да отговаряте.",
      action: "Отворете условията на предложението",
    },
    "proposal.agreed": {
      subject: "Двете страни приеха предложението",
      lead: "Брокерът Ви го записа. Следващите стъпки по сделката са в кабинета Ви.",
      action: "Отворете условията на предложението",
    },
    "document.requested": {
      subject: "Брокерът поиска документ от Вас",
      lead: "В кабинета си ще видите какво е нужно и ще можете да го качите сигурно.",
      action: "Отворете заявките за документи",
    },
    "message.from_broker": {
      subject: "Брокерът Ви изпрати съобщение",
      lead: "Можете да го прочетете и да отговорите в кабинета си.",
      action: "Отворете разговора",
    },
    "deal.step_done": {
      subject: "Завършено: {step}",
      lead: "В кабинета си ще видите какво следва.",
      action: "Отворете сделката",
    },
    "deal.completed": {
      subject: "Сделката Ви е приключена",
      lead: "В кабинета Ви остава записът на всяка стъпка.",
      action: "Отворете сделката",
    },
    frame: {
      calendarAttached: "Поканата за календара е приложена към писмото.",
      calendarCancelAttached: "Приложеният файл премахва огледа от календара Ви.",
      calendarLink: "Добавете огледа в календара си:",
      reference: "Номер",
      footer:
        "Това е служебно съобщение за Вашата сделка. Актуалните подробности винаги са в кабинета Ви.",
      preferences: "Настройки за имейли",
    },
  },
  en: {
    "viewing.proposed": {
      subject: "Viewing time proposed for {day}",
      lead: "The time is {time}. Confirm it or suggest another time in your client area.",
      action: "Open property viewing",
    },
    "viewing.confirmed": {
      subject: "Your viewing on {day} is confirmed",
      lead: "It is booked for {time}.",
      action: "Open property viewing",
    },
    "viewing.moved": {
      subject: "Your viewing has moved to {day}",
      lead: "The new time is {time}.",
      action: "Open property viewing",
    },
    "viewing.cancelled": {
      subject: "Your viewing on {day} is cancelled",
      subjectNoTime: "Your viewing is cancelled",
      lead: "It was booked for {time}. You can ask for a new time in your client area.",
      leadNoTime: "You can ask for a new time in your client area.",
      action: "Open property viewing",
    },
    "proposal.ready": {
      subject: "A proposal is waiting for your answer",
      lead: "Please answer before the deadline shown in your client area.",
      action: "Open proposal terms",
    },
    "proposal.withdrawn": {
      subject: "Your broker withdrew a proposal",
      lead: "You no longer need to answer it.",
      action: "Open proposal terms",
    },
    "proposal.expired": {
      subject: "A proposal's deadline has passed",
      lead: "You no longer need to answer it.",
      action: "Open proposal terms",
    },
    "proposal.agreed": {
      subject: "Both sides agreed to the proposal",
      lead: "Your broker recorded it. The next steps of your deal are in your client area.",
      action: "Open proposal terms",
    },
    "document.requested": {
      subject: "Your broker asked you for a document",
      lead: "Your client area shows what is needed and lets you upload it securely.",
      action: "Open document requests",
    },
    "message.from_broker": {
      subject: "Your broker sent you a message",
      lead: "You can read it and reply in your client area.",
      action: "Open the conversation",
    },
    "deal.step_done": {
      subject: "Done: {step}",
      lead: "Your client area shows what comes next.",
      action: "Open your deal",
    },
    "deal.completed": {
      subject: "Your deal is complete",
      lead: "Your client area keeps the record of every step.",
      action: "Open your deal",
    },
    frame: {
      calendarAttached: "The calendar invitation is attached.",
      calendarCancelAttached: "The attached file removes the viewing from your calendar.",
      calendarLink: "Add the viewing to your calendar:",
      reference: "Reference",
      footer:
        "This is a service message about your deal. Your client area always shows the current details.",
      preferences: "Email preferences",
    },
  },
  ru: {
    "viewing.proposed": {
      subject: "Предложено время просмотра: {day}",
      lead: "Время: {time}. Подтвердите его или предложите другое в личном кабинете.",
      action: "Открыть просмотр объекта",
    },
    "viewing.confirmed": {
      subject: "Ваш просмотр {day} подтверждён",
      lead: "Он назначен на {time}.",
      action: "Открыть просмотр объекта",
    },
    "viewing.moved": {
      subject: "Ваш просмотр перенесён на {day}",
      lead: "Новое время: {time}.",
      action: "Открыть просмотр объекта",
    },
    "viewing.cancelled": {
      subject: "Ваш просмотр {day} отменён",
      subjectNoTime: "Ваш просмотр отменён",
      lead: "Он был назначен на {time}. В личном кабинете можно запросить новое время.",
      leadNoTime: "В личном кабинете можно запросить новое время.",
      action: "Открыть просмотр объекта",
    },
    "proposal.ready": {
      subject: "Предложение ждёт вашего ответа",
      lead: "Ответьте до срока, указанного в личном кабинете.",
      action: "Открыть условия предложения",
    },
    "proposal.withdrawn": {
      subject: "Брокер отозвал предложение",
      lead: "Отвечать на него больше не нужно.",
      action: "Открыть условия предложения",
    },
    "proposal.expired": {
      subject: "Срок ответа на предложение истёк",
      lead: "Отвечать на него больше не нужно.",
      action: "Открыть условия предложения",
    },
    "proposal.agreed": {
      subject: "Обе стороны приняли предложение",
      lead: "Ваш брокер это записал. Следующие шаги по сделке — в вашем личном кабинете.",
      action: "Открыть условия предложения",
    },
    "document.requested": {
      subject: "Брокер запросил у вас документ",
      lead: "В личном кабинете указано, что нужно, и там же его можно безопасно загрузить.",
      action: "Открыть запросы документов",
    },
    "message.from_broker": {
      subject: "Брокер отправил вам сообщение",
      lead: "Прочитать его и ответить можно в личном кабинете.",
      action: "Открыть разговор",
    },
    "deal.step_done": {
      subject: "Выполнено: {step}",
      lead: "В личном кабинете видно, что будет дальше.",
      action: "Открыть сделку",
    },
    "deal.completed": {
      subject: "Ваша сделка завершена",
      lead: "В личном кабинете сохранена запись о каждом этапе.",
      action: "Открыть сделку",
    },
    frame: {
      calendarAttached: "Приглашение для календаря приложено к письму.",
      calendarCancelAttached: "Приложенный файл удалит просмотр из вашего календаря.",
      calendarLink: "Добавить просмотр в календарь:",
      reference: "Номер",
      footer:
        "Это служебное сообщение о вашей сделке. Актуальные подробности всегда в вашем личном кабинете.",
      preferences: "Настройки писем",
    },
  },
  de: {
    "viewing.proposed": {
      subject: "Besichtigungstermin vorgeschlagen: {day}",
      lead: "Der Termin ist {time}. Bestätigen Sie ihn oder schlagen Sie im Kundenbereich eine andere Zeit vor.",
      action: "Immobilienbesichtigung öffnen",
    },
    "viewing.confirmed": {
      subject: "Ihre Besichtigung am {day} ist bestätigt",
      lead: "Sie ist für {time} gebucht.",
      action: "Immobilienbesichtigung öffnen",
    },
    "viewing.moved": {
      subject: "Ihre Besichtigung ist auf {day} verschoben",
      lead: "Der neue Termin ist {time}.",
      action: "Immobilienbesichtigung öffnen",
    },
    "viewing.cancelled": {
      subject: "Ihre Besichtigung am {day} ist abgesagt",
      subjectNoTime: "Ihre Besichtigung ist abgesagt",
      lead: "Sie war für {time} gebucht. Im Kundenbereich können Sie einen neuen Termin anfragen.",
      leadNoTime: "Im Kundenbereich können Sie einen neuen Termin anfragen.",
      action: "Immobilienbesichtigung öffnen",
    },
    "proposal.ready": {
      subject: "Ein Angebot wartet auf Ihre Antwort",
      lead: "Bitte antworten Sie vor der Frist, die im Kundenbereich steht.",
      action: "Angebotsbedingungen öffnen",
    },
    "proposal.withdrawn": {
      subject: "Ihr Makler hat ein Angebot zurückgezogen",
      lead: "Sie müssen nicht mehr darauf antworten.",
      action: "Angebotsbedingungen öffnen",
    },
    "proposal.expired": {
      subject: "Die Frist eines Angebots ist abgelaufen",
      lead: "Sie müssen nicht mehr darauf antworten.",
      action: "Angebotsbedingungen öffnen",
    },
    "proposal.agreed": {
      subject: "Beide Seiten haben dem Angebot zugestimmt",
      lead: "Ihr Makler hat es festgehalten. Die nächsten Schritte Ihres Geschäfts finden Sie in Ihrem Kundenbereich.",
      action: "Angebotsbedingungen öffnen",
    },
    "document.requested": {
      subject: "Ihr Makler bittet Sie um ein Dokument",
      lead: "Im Kundenbereich sehen Sie, was benötigt wird, und können es dort sicher hochladen.",
      action: "Dokumentanfragen öffnen",
    },
    "message.from_broker": {
      subject: "Ihr Makler hat Ihnen geschrieben",
      lead: "Sie können sie im Kundenbereich lesen und beantworten.",
      action: "Gespräch öffnen",
    },
    "deal.step_done": {
      subject: "Erledigt: {step}",
      lead: "Im Kundenbereich sehen Sie, wie es weitergeht.",
      action: "Immobiliengeschäft öffnen",
    },
    "deal.completed": {
      subject: "Ihr Immobiliengeschäft ist abgeschlossen",
      lead: "Im Kundenbereich bleibt jeder Schritt dokumentiert.",
      action: "Immobiliengeschäft öffnen",
    },
    frame: {
      calendarAttached: "Die Kalendereinladung ist angehängt.",
      calendarCancelAttached: "Die angehängte Datei entfernt die Besichtigung aus Ihrem Kalender.",
      calendarLink: "Besichtigung in den Kalender übernehmen:",
      reference: "Referenz",
      footer:
        "Dies ist eine Servicenachricht zu Ihrem Immobiliengeschäft. Die aktuellen Angaben finden Sie immer im Kundenbereich.",
      preferences: "E-Mail-Einstellungen",
    },
  },
  nl: {
    "viewing.proposed": {
      subject: "Bezichtigingstijd voorgesteld voor {day}",
      lead: "De tijd is {time}. Bevestig deze of stel in uw persoonlijke omgeving een andere tijd voor.",
      action: "Woningbezichtiging openen",
    },
    "viewing.confirmed": {
      subject: "Uw bezichtiging op {day} is bevestigd",
      lead: "Hij staat gepland voor {time}.",
      action: "Woningbezichtiging openen",
    },
    "viewing.moved": {
      subject: "Uw bezichtiging is verplaatst naar {day}",
      lead: "De nieuwe tijd is {time}.",
      action: "Woningbezichtiging openen",
    },
    "viewing.cancelled": {
      subject: "Uw bezichtiging op {day} is geannuleerd",
      subjectNoTime: "Uw bezichtiging is geannuleerd",
      lead: "Hij stond gepland voor {time}. In uw persoonlijke omgeving kunt u een nieuwe tijd aanvragen.",
      leadNoTime: "In uw persoonlijke omgeving kunt u een nieuwe tijd aanvragen.",
      action: "Woningbezichtiging openen",
    },
    "proposal.ready": {
      subject: "Een voorstel wacht op uw antwoord",
      lead: "Antwoord vóór de termijn die in uw persoonlijke omgeving staat.",
      action: "Voorstelvoorwaarden openen",
    },
    "proposal.withdrawn": {
      subject: "Uw makelaar heeft een voorstel ingetrokken",
      lead: "U hoeft er niet meer op te antwoorden.",
      action: "Voorstelvoorwaarden openen",
    },
    "proposal.expired": {
      subject: "De termijn van een voorstel is verstreken",
      lead: "U hoeft er niet meer op te antwoorden.",
      action: "Voorstelvoorwaarden openen",
    },
    "proposal.agreed": {
      subject: "Beide partijen gingen akkoord met het voorstel",
      lead: "Uw makelaar heeft dit vastgelegd. De volgende stappen van uw deal staan in uw persoonlijke omgeving.",
      action: "Voorstelvoorwaarden openen",
    },
    "document.requested": {
      subject: "Uw makelaar vraagt u om een document",
      lead: "In uw persoonlijke omgeving ziet u wat er nodig is en kunt u het veilig uploaden.",
      action: "Documentverzoeken openen",
    },
    "message.from_broker": {
      subject: "Uw makelaar heeft u een bericht gestuurd",
      lead: "U kunt het lezen en beantwoorden in uw persoonlijke omgeving.",
      action: "Gesprek openen",
    },
    "deal.step_done": {
      subject: "Afgerond: {step}",
      lead: "In uw persoonlijke omgeving ziet u wat er nu komt.",
      action: "Vastgoedzaak openen",
    },
    "deal.completed": {
      subject: "Uw vastgoedzaak is afgerond",
      lead: "In uw persoonlijke omgeving blijft elke stap vastgelegd.",
      action: "Vastgoedzaak openen",
    },
    frame: {
      calendarAttached: "De agenda-uitnodiging zit als bijlage bij dit bericht.",
      calendarCancelAttached: "Het bijgevoegde bestand haalt de bezichtiging uit uw agenda.",
      calendarLink: "Zet de bezichtiging in uw agenda:",
      reference: "Referentie",
      footer:
        "Dit is een servicebericht over uw vastgoedzaak. In uw persoonlijke omgeving staan altijd de actuele gegevens.",
      preferences: "E-mailvoorkeuren",
    },
  },
  el: {
    "viewing.proposed": {
      subject: "Προτάθηκε ώρα επίσκεψης: {day}",
      lead: "Η ώρα είναι {time}. Επιβεβαιώστε την ή προτείνετε άλλη ώρα στον λογαριασμό σας.",
      action: "Άνοιγμα επίσκεψης ακινήτου",
    },
    "viewing.confirmed": {
      subject: "Η επίσκεψή σας στις {day} επιβεβαιώθηκε",
      lead: "Έχει κλειστεί για {time}.",
      action: "Άνοιγμα επίσκεψης ακινήτου",
    },
    "viewing.moved": {
      subject: "Η επίσκεψή σας μεταφέρθηκε στις {day}",
      lead: "Η νέα ώρα είναι {time}.",
      action: "Άνοιγμα επίσκεψης ακινήτου",
    },
    "viewing.cancelled": {
      subject: "Η επίσκεψή σας στις {day} ακυρώθηκε",
      subjectNoTime: "Η επίσκεψή σας ακυρώθηκε",
      lead: "Είχε κλειστεί για {time}. Μπορείτε να ζητήσετε νέα ώρα στον λογαριασμό σας.",
      leadNoTime: "Μπορείτε να ζητήσετε νέα ώρα στον λογαριασμό σας.",
      action: "Άνοιγμα επίσκεψης ακινήτου",
    },
    "proposal.ready": {
      subject: "Μια πρόταση περιμένει την απάντησή σας",
      lead: "Απαντήστε πριν από την προθεσμία που φαίνεται στον λογαριασμό σας.",
      action: "Άνοιγμα όρων πρότασης",
    },
    "proposal.withdrawn": {
      subject: "Ο μεσίτης απέσυρε μια πρόταση",
      lead: "Δεν χρειάζεται πια να απαντήσετε.",
      action: "Άνοιγμα όρων πρότασης",
    },
    "proposal.expired": {
      subject: "Η προθεσμία μιας πρότασης έληξε",
      lead: "Δεν χρειάζεται πια να απαντήσετε.",
      action: "Άνοιγμα όρων πρότασης",
    },
    "proposal.agreed": {
      subject: "Και οι δύο πλευρές αποδέχτηκαν την πρόταση",
      lead: "Ο μεσίτης σας το κατέγραψε. Τα επόμενα βήματα της συμφωνίας σας βρίσκονται στον λογαριασμό σας.",
      action: "Άνοιγμα όρων πρότασης",
    },
    "document.requested": {
      subject: "Ο μεσίτης σας ζήτησε ένα έγγραφο",
      lead: "Στον λογαριασμό σας βλέπετε τι χρειάζεται και μπορείτε να το ανεβάσετε με ασφάλεια.",
      action: "Άνοιγμα αιτημάτων εγγράφων",
    },
    "message.from_broker": {
      subject: "Ο μεσίτης σάς έστειλε μήνυμα",
      lead: "Μπορείτε να το διαβάσετε και να απαντήσετε στον λογαριασμό σας.",
      action: "Άνοιγμα συνομιλίας",
    },
    "deal.step_done": {
      subject: "Ολοκληρώθηκε: {step}",
      lead: "Στον λογαριασμό σας βλέπετε τι ακολουθεί.",
      action: "Άνοιγμα συναλλαγής",
    },
    "deal.completed": {
      subject: "Η συναλλαγή σας ολοκληρώθηκε",
      lead: "Στον λογαριασμό σας παραμένει η καταγραφή κάθε βήματος.",
      action: "Άνοιγμα συναλλαγής",
    },
    frame: {
      calendarAttached: "Η πρόσκληση ημερολογίου επισυνάπτεται.",
      calendarCancelAttached: "Το συνημμένο αρχείο αφαιρεί την επίσκεψη από το ημερολόγιό σας.",
      calendarLink: "Προσθέστε την επίσκεψη στο ημερολόγιό σας:",
      reference: "Αριθμός αναφοράς",
      footer:
        "Αυτό είναι μήνυμα εξυπηρέτησης για τη συναλλαγή σας. Τα τρέχοντα στοιχεία βρίσκονται πάντα στον λογαριασμό σας.",
      preferences: "Προτιμήσεις email",
    },
  },
  he: {
    "viewing.proposed": {
      subject: "הוצע מועד לביקור בנכס: {day}",
      lead: "המועד: {time}. אשרו אותו או הציעו מועד אחר באזור הלקוח.",
      action: "פתיחת הביקור בנכס",
    },
    "viewing.confirmed": {
      subject: "הביקור שלכם בנכס ב{day} אושר",
      lead: "המועד: {time}.",
      action: "פתיחת הביקור בנכס",
    },
    "viewing.moved": {
      subject: "הביקור שלכם בנכס הועבר ל{day}",
      lead: "המועד החדש: {time}.",
      action: "פתיחת הביקור בנכס",
    },
    "viewing.cancelled": {
      subject: "הביקור שלכם בנכס ב{day} בוטל",
      subjectNoTime: "הביקור שלכם בנכס בוטל",
      lead: "הוא נקבע ל־{time}. אפשר לבקש מועד חדש באזור הלקוח.",
      leadNoTime: "אפשר לבקש מועד חדש באזור הלקוח.",
      action: "פתיחת הביקור בנכס",
    },
    "proposal.ready": {
      subject: "הצעה מחכה לתשובתכם",
      lead: "השיבו לפני המועד האחרון שמופיע באזור הלקוח.",
      action: "פתיחת תנאי ההצעה",
    },
    "proposal.withdrawn": {
      subject: "המתווך משך הצעה",
      lead: "אין צורך להשיב עליה עוד.",
      action: "פתיחת תנאי ההצעה",
    },
    "proposal.expired": {
      subject: "המועד האחרון של הצעה עבר",
      lead: "אין צורך להשיב עליה עוד.",
      action: "פתיחת תנאי ההצעה",
    },
    "proposal.agreed": {
      subject: "שני הצדדים הסכימו להצעה",
      lead: "המתווך שלכם רשם זאת. השלבים הבאים בעסקה נמצאים באזור הלקוח שלכם.",
      action: "פתיחת תנאי ההצעה",
    },
    "document.requested": {
      subject: "המתווך ביקש מכם מסמך",
      lead: "באזור הלקוח תראו מה נדרש ותוכלו להעלות אותו בצורה מאובטחת.",
      action: "פתיחת הבקשות למסמכים",
    },
    "message.from_broker": {
      subject: "המתווך שלח לכם הודעה",
      lead: "אפשר לקרוא אותה ולהשיב באזור הלקוח.",
      action: "פתיחת השיחה",
    },
    "deal.step_done": {
      subject: "הושלם: {step}",
      lead: "באזור הלקוח תראו מה הלאה.",
      action: "פתיחת העסקה",
    },
    "deal.completed": {
      subject: "העסקה שלכם הושלמה",
      lead: "באזור הלקוח נשמר התיעוד של כל שלב.",
      action: "פתיחת העסקה",
    },
    frame: {
      calendarAttached: "ההזמנה ליומן מצורפת.",
      calendarCancelAttached: "הקובץ המצורף מסיר את הביקור מהיומן שלכם.",
      calendarLink: "הוסיפו את הביקור ליומן:",
      reference: "מספר אסמכתה",
      footer: "זוהי הודעת שירות על העסקה שלכם. הפרטים העדכניים תמיד מופיעים באזור הלקוח.",
      preferences: "העדפות אימייל",
    },
  },
};

// Staff wording: «Сделка»/"Deal" (owner decision), staff locales bg, en, ru.
export const staffNoticeCopy: Readonly<
  Record<StaffLocale, Readonly<Record<StaffNoticeEvent, NoticeCopy>> & { frame: StaffFrame }>
> = {
  bg: {
    "client.viewing_confirmed": {
      subject: "Клиентът потвърди огледа на {day}",
      lead: "Потвърденият час е {time}.",
      action: "Отворете огледа на имот",
    },
    "client.viewing_cancelled": {
      subject: "Клиентът отмени огледа",
      lead: "Причината е записана в огледа.",
      action: "Отворете огледа на имот",
    },
    "client.viewing_new_time": {
      subject: "Клиентът поиска друг час за оглед",
      lead: "Удобните му часове са записани в огледа.",
      action: "Отворете огледа на имот",
    },
    "client.proposal_accepted": {
      subject: "Клиентът прие предложението",
      lead: "Проверете следващата стъпка в предложението.",
      action: "Отворете условията на предложението",
    },
    "client.proposal_declined": {
      subject: "Клиентът отказа предложението",
      lead: "Причината е записана в предложението.",
      action: "Отворете условията на предложението",
    },
    "client.proposal_countered": {
      subject: "Клиентът изпрати насрещно предложение",
      lead: "Новите условия очакват Вашия преглед.",
      action: "Отворете условията на предложението",
    },
    "client.document_uploaded": {
      subject: "Клиентът качи поискан документ",
      lead: "Файлът очаква Вашия преглед.",
      action: "Отворете заявките за документи",
    },
    "client.message": {
      subject: "Клиентът Ви изпрати съобщение",
      lead: "Можете да го прочетете и да отговорите в сделката.",
      action: "Отворете сделката",
    },
    frame: {
      reference: "Номер",
      footer: "Служебно известие. Подробностите са в сделката в работното пространство.",
    },
  },
  en: {
    "client.viewing_confirmed": {
      subject: "Client confirmed the viewing on {day}",
      lead: "The confirmed time is {time}.",
      action: "Open property viewing",
    },
    "client.viewing_cancelled": {
      subject: "Client cancelled the viewing",
      lead: "Their reason is recorded on the viewing.",
      action: "Open property viewing",
    },
    "client.viewing_new_time": {
      subject: "Client asked for another viewing time",
      lead: "The times that suit them are recorded on the viewing.",
      action: "Open property viewing",
    },
    "client.proposal_accepted": {
      subject: "Client accepted the proposal",
      lead: "Check the next step on the proposal.",
      action: "Open proposal terms",
    },
    "client.proposal_declined": {
      subject: "Client declined the proposal",
      lead: "Their reason is recorded on the proposal.",
      action: "Open proposal terms",
    },
    "client.proposal_countered": {
      subject: "Client sent a counteroffer",
      lead: "The new terms are waiting for your review.",
      action: "Open proposal terms",
    },
    "client.document_uploaded": {
      subject: "Client uploaded a requested document",
      lead: "The file is waiting for your review.",
      action: "Open document requests",
    },
    "client.message": {
      subject: "Client sent you a message",
      lead: "You can read it and reply in the Deal.",
      action: "Open the Deal",
    },
    frame: {
      reference: "Reference",
      footer: "Service notice. The details are in the Deal in your workspace.",
    },
  },
  ru: {
    "client.viewing_confirmed": {
      subject: "Клиент подтвердил просмотр {day}",
      lead: "Подтверждённое время: {time}.",
      action: "Открыть просмотр объекта",
    },
    "client.viewing_cancelled": {
      subject: "Клиент отменил просмотр",
      lead: "Причина записана в просмотре.",
      action: "Открыть просмотр объекта",
    },
    "client.viewing_new_time": {
      subject: "Клиент попросил другое время просмотра",
      lead: "Удобное ему время записано в просмотре.",
      action: "Открыть просмотр объекта",
    },
    "client.proposal_accepted": {
      subject: "Клиент принял предложение",
      lead: "Проверьте следующий шаг в предложении.",
      action: "Открыть условия предложения",
    },
    "client.proposal_declined": {
      subject: "Клиент отклонил предложение",
      lead: "Причина записана в предложении.",
      action: "Открыть условия предложения",
    },
    "client.proposal_countered": {
      subject: "Клиент прислал встречное предложение",
      lead: "Новые условия ждут вашей проверки.",
      action: "Открыть условия предложения",
    },
    "client.document_uploaded": {
      subject: "Клиент загрузил запрошенный документ",
      lead: "Файл ждёт вашей проверки.",
      action: "Открыть запросы документов",
    },
    "client.message": {
      subject: "Клиент отправил вам сообщение",
      lead: "Прочитать его и ответить можно в сделке.",
      action: "Открыть сделку",
    },
    frame: {
      reference: "Номер",
      footer: "Служебное уведомление. Подробности — в сделке в рабочем пространстве.",
    },
  },
};
