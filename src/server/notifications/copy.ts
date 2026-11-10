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
      lead: "Брокерът Ви предложи час за оглед: {time}. Потвърдете го или предложете друг час в кабинета си.",
      action: "Отворете огледа на имот",
    },
    "viewing.confirmed": {
      subject: "Огледът Ви на {day} е потвърден",
      lead: "Огледът Ви е потвърден за {time}.",
      action: "Отворете огледа на имот",
    },
    "viewing.moved": {
      subject: "Огледът Ви е преместен за {day}",
      lead: "Огледът Ви е преместен за {time}.",
      action: "Отворете огледа на имот",
    },
    "viewing.cancelled": {
      subject: "Огледът Ви на {day} е отменен",
      subjectNoTime: "Огледът Ви е отменен",
      lead: "Огледът Ви за {time} е отменен. В кабинета си можете да поискате нов час.",
      leadNoTime: "Огледът Ви е отменен. В кабинета си можете да поискате нов час.",
      action: "Отворете огледа на имот",
    },
    "proposal.ready": {
      subject: "Предложение очаква Вашия отговор",
      lead: "Имате предложение, което очаква Вашия отговор. Отговорете преди крайния срок, посочен в кабинета Ви.",
      action: "Отворете условията на предложението",
    },
    "proposal.withdrawn": {
      subject: "Брокерът оттегли предложение",
      lead: "Брокерът оттегли това предложение. Вече не е нужно да отговаряте.",
      action: "Отворете условията на предложението",
    },
    "proposal.expired": {
      subject: "Срокът на предложение изтече",
      lead: "Крайният срок на това предложение изтече. Вече не е нужно да отговаряте.",
      action: "Отворете условията на предложението",
    },
    "document.requested": {
      subject: "Брокерът поиска документ от Вас",
      lead: "Брокерът Ви поиска документ. В кабинета си ще видите какво е нужно и ще можете да го качите сигурно.",
      action: "Отворете заявките за документи",
    },
    "message.from_broker": {
      subject: "Брокерът Ви изпрати съобщение",
      lead: "Брокерът Ви изпрати съобщение. Можете да го прочетете и да отговорите в кабинета си.",
      action: "Отворете разговора",
    },
    "deal.step_done": {
      subject: "Завършено: {step}",
      lead: "Тази стъпка от сделката Ви е завършена: {step}.",
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
      lead: "Your broker proposed a viewing time: {time}. Confirm it or suggest another time in your client area.",
      action: "Open property viewing",
    },
    "viewing.confirmed": {
      subject: "Your viewing on {day} is confirmed",
      lead: "Your viewing is confirmed for {time}.",
      action: "Open property viewing",
    },
    "viewing.moved": {
      subject: "Your viewing has moved to {day}",
      lead: "Your viewing has moved to {time}.",
      action: "Open property viewing",
    },
    "viewing.cancelled": {
      subject: "Your viewing on {day} is cancelled",
      subjectNoTime: "Your viewing is cancelled",
      lead: "Your viewing on {time} is cancelled. You can ask for a new time in your client area.",
      leadNoTime: "Your viewing is cancelled. You can ask for a new time in your client area.",
      action: "Open property viewing",
    },
    "proposal.ready": {
      subject: "A proposal is waiting for your answer",
      lead: "A proposal is waiting for your answer. Please answer before the deadline shown in your client area.",
      action: "Open proposal terms",
    },
    "proposal.withdrawn": {
      subject: "Your broker withdrew a proposal",
      lead: "Your broker withdrew this proposal. You no longer need to answer it.",
      action: "Open proposal terms",
    },
    "proposal.expired": {
      subject: "A proposal's deadline has passed",
      lead: "The deadline for this proposal has passed. You no longer need to answer it.",
      action: "Open proposal terms",
    },
    "document.requested": {
      subject: "Your broker asked you for a document",
      lead: "Your broker asked you for a document. Your client area shows what is needed and lets you upload it securely.",
      action: "Open document requests",
    },
    "message.from_broker": {
      subject: "Your broker sent you a message",
      lead: "Your broker sent you a message. You can read it and reply in your client area.",
      action: "Open the conversation",
    },
    "deal.step_done": {
      subject: "Done: {step}",
      lead: "This step of your deal is done: {step}.",
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
      lead: "Брокер предложил время просмотра: {time}. Подтвердите его или предложите другое время в личном кабинете.",
      action: "Открыть просмотр объекта",
    },
    "viewing.confirmed": {
      subject: "Ваш просмотр {day} подтверждён",
      lead: "Ваш просмотр подтверждён на {time}.",
      action: "Открыть просмотр объекта",
    },
    "viewing.moved": {
      subject: "Ваш просмотр перенесён на {day}",
      lead: "Ваш просмотр перенесён на {time}.",
      action: "Открыть просмотр объекта",
    },
    "viewing.cancelled": {
      subject: "Ваш просмотр {day} отменён",
      subjectNoTime: "Ваш просмотр отменён",
      lead: "Ваш просмотр на {time} отменён. В личном кабинете можно запросить новое время.",
      leadNoTime: "Ваш просмотр отменён. В личном кабинете можно запросить новое время.",
      action: "Открыть просмотр объекта",
    },
    "proposal.ready": {
      subject: "Предложение ждёт вашего ответа",
      lead: "Предложение ждёт вашего ответа. Ответьте до срока, указанного в личном кабинете.",
      action: "Открыть условия предложения",
    },
    "proposal.withdrawn": {
      subject: "Брокер отозвал предложение",
      lead: "Брокер отозвал это предложение. Отвечать на него больше не нужно.",
      action: "Открыть условия предложения",
    },
    "proposal.expired": {
      subject: "Срок ответа на предложение истёк",
      lead: "Срок ответа на это предложение истёк. Отвечать на него больше не нужно.",
      action: "Открыть условия предложения",
    },
    "document.requested": {
      subject: "Брокер запросил у вас документ",
      lead: "Брокер запросил у вас документ. В личном кабинете указано, что нужно, и там же его можно безопасно загрузить.",
      action: "Открыть запросы документов",
    },
    "message.from_broker": {
      subject: "Брокер отправил вам сообщение",
      lead: "Брокер отправил вам сообщение. Прочитать его и ответить можно в личном кабинете.",
      action: "Открыть разговор",
    },
    "deal.step_done": {
      subject: "Выполнено: {step}",
      lead: "Этап вашей сделки выполнен: {step}.",
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
      lead: "Ihr Makler hat einen Besichtigungstermin vorgeschlagen: {time}. Bestätigen Sie ihn oder schlagen Sie im Kundenbereich eine andere Zeit vor.",
      action: "Immobilienbesichtigung öffnen",
    },
    "viewing.confirmed": {
      subject: "Ihre Besichtigung am {day} ist bestätigt",
      lead: "Ihre Besichtigung ist für {time} bestätigt.",
      action: "Immobilienbesichtigung öffnen",
    },
    "viewing.moved": {
      subject: "Ihre Besichtigung ist auf {day} verschoben",
      lead: "Ihre Besichtigung wurde auf {time} verschoben.",
      action: "Immobilienbesichtigung öffnen",
    },
    "viewing.cancelled": {
      subject: "Ihre Besichtigung am {day} ist abgesagt",
      subjectNoTime: "Ihre Besichtigung ist abgesagt",
      lead: "Ihre Besichtigung am {time} ist abgesagt. Im Kundenbereich können Sie einen neuen Termin anfragen.",
      leadNoTime:
        "Ihre Besichtigung ist abgesagt. Im Kundenbereich können Sie einen neuen Termin anfragen.",
      action: "Immobilienbesichtigung öffnen",
    },
    "proposal.ready": {
      subject: "Ein Angebot wartet auf Ihre Antwort",
      lead: "Ein Angebot wartet auf Ihre Antwort. Bitte antworten Sie vor der Frist, die im Kundenbereich steht.",
      action: "Angebotsbedingungen öffnen",
    },
    "proposal.withdrawn": {
      subject: "Ihr Makler hat ein Angebot zurückgezogen",
      lead: "Ihr Makler hat dieses Angebot zurückgezogen. Sie müssen nicht mehr darauf antworten.",
      action: "Angebotsbedingungen öffnen",
    },
    "proposal.expired": {
      subject: "Die Frist eines Angebots ist abgelaufen",
      lead: "Die Frist für dieses Angebot ist abgelaufen. Sie müssen nicht mehr darauf antworten.",
      action: "Angebotsbedingungen öffnen",
    },
    "document.requested": {
      subject: "Ihr Makler bittet Sie um ein Dokument",
      lead: "Ihr Makler bittet Sie um ein Dokument. Im Kundenbereich sehen Sie, was benötigt wird, und können es dort sicher hochladen.",
      action: "Dokumentanfragen öffnen",
    },
    "message.from_broker": {
      subject: "Ihr Makler hat Ihnen geschrieben",
      lead: "Ihr Makler hat Ihnen eine Nachricht geschickt. Sie können sie im Kundenbereich lesen und beantworten.",
      action: "Gespräch öffnen",
    },
    "deal.step_done": {
      subject: "Erledigt: {step}",
      lead: "Dieser Schritt Ihres Immobiliengeschäfts ist erledigt: {step}.",
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
      lead: "Uw makelaar heeft een tijd voor de bezichtiging voorgesteld: {time}. Bevestig deze of stel in uw persoonlijke omgeving een andere tijd voor.",
      action: "Woningbezichtiging openen",
    },
    "viewing.confirmed": {
      subject: "Uw bezichtiging op {day} is bevestigd",
      lead: "Uw bezichtiging is bevestigd voor {time}.",
      action: "Woningbezichtiging openen",
    },
    "viewing.moved": {
      subject: "Uw bezichtiging is verplaatst naar {day}",
      lead: "Uw bezichtiging is verplaatst naar {time}.",
      action: "Woningbezichtiging openen",
    },
    "viewing.cancelled": {
      subject: "Uw bezichtiging op {day} is geannuleerd",
      subjectNoTime: "Uw bezichtiging is geannuleerd",
      lead: "Uw bezichtiging op {time} is geannuleerd. In uw persoonlijke omgeving kunt u een nieuwe tijd aanvragen.",
      leadNoTime:
        "Uw bezichtiging is geannuleerd. In uw persoonlijke omgeving kunt u een nieuwe tijd aanvragen.",
      action: "Woningbezichtiging openen",
    },
    "proposal.ready": {
      subject: "Een voorstel wacht op uw antwoord",
      lead: "Een voorstel wacht op uw antwoord. Antwoord vóór de termijn die in uw persoonlijke omgeving staat.",
      action: "Voorstelvoorwaarden openen",
    },
    "proposal.withdrawn": {
      subject: "Uw makelaar heeft een voorstel ingetrokken",
      lead: "Uw makelaar heeft dit voorstel ingetrokken. U hoeft er niet meer op te antwoorden.",
      action: "Voorstelvoorwaarden openen",
    },
    "proposal.expired": {
      subject: "De termijn van een voorstel is verstreken",
      lead: "De termijn voor dit voorstel is verstreken. U hoeft er niet meer op te antwoorden.",
      action: "Voorstelvoorwaarden openen",
    },
    "document.requested": {
      subject: "Uw makelaar vraagt u om een document",
      lead: "Uw makelaar vraagt u om een document. In uw persoonlijke omgeving ziet u wat er nodig is en kunt u het veilig uploaden.",
      action: "Documentverzoeken openen",
    },
    "message.from_broker": {
      subject: "Uw makelaar heeft u een bericht gestuurd",
      lead: "Uw makelaar heeft u een bericht gestuurd. U kunt het lezen en beantwoorden in uw persoonlijke omgeving.",
      action: "Gesprek openen",
    },
    "deal.step_done": {
      subject: "Afgerond: {step}",
      lead: "Deze stap van uw vastgoedzaak is afgerond: {step}.",
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
      lead: "Ο μεσίτης σας πρότεινε ώρα για την επίσκεψη: {time}. Επιβεβαιώστε την ή προτείνετε άλλη ώρα στον λογαριασμό σας.",
      action: "Άνοιγμα επίσκεψης ακινήτου",
    },
    "viewing.confirmed": {
      subject: "Η επίσκεψή σας στις {day} επιβεβαιώθηκε",
      lead: "Η επίσκεψή σας επιβεβαιώθηκε για {time}.",
      action: "Άνοιγμα επίσκεψης ακινήτου",
    },
    "viewing.moved": {
      subject: "Η επίσκεψή σας μεταφέρθηκε στις {day}",
      lead: "Η επίσκεψή σας μεταφέρθηκε για {time}.",
      action: "Άνοιγμα επίσκεψης ακινήτου",
    },
    "viewing.cancelled": {
      subject: "Η επίσκεψή σας στις {day} ακυρώθηκε",
      subjectNoTime: "Η επίσκεψή σας ακυρώθηκε",
      lead: "Η επίσκεψή σας για {time} ακυρώθηκε. Μπορείτε να ζητήσετε νέα ώρα στον λογαριασμό σας.",
      leadNoTime: "Η επίσκεψή σας ακυρώθηκε. Μπορείτε να ζητήσετε νέα ώρα στον λογαριασμό σας.",
      action: "Άνοιγμα επίσκεψης ακινήτου",
    },
    "proposal.ready": {
      subject: "Μια πρόταση περιμένει την απάντησή σας",
      lead: "Μια πρόταση περιμένει την απάντησή σας. Απαντήστε πριν από την προθεσμία που φαίνεται στον λογαριασμό σας.",
      action: "Άνοιγμα όρων πρότασης",
    },
    "proposal.withdrawn": {
      subject: "Ο μεσίτης απέσυρε μια πρόταση",
      lead: "Ο μεσίτης απέσυρε αυτή την πρόταση. Δεν χρειάζεται πια να απαντήσετε.",
      action: "Άνοιγμα όρων πρότασης",
    },
    "proposal.expired": {
      subject: "Η προθεσμία μιας πρότασης έληξε",
      lead: "Η προθεσμία αυτής της πρότασης έληξε. Δεν χρειάζεται πια να απαντήσετε.",
      action: "Άνοιγμα όρων πρότασης",
    },
    "document.requested": {
      subject: "Ο μεσίτης σας ζήτησε ένα έγγραφο",
      lead: "Ο μεσίτης σας ζήτησε ένα έγγραφο. Στον λογαριασμό σας βλέπετε τι χρειάζεται και μπορείτε να το ανεβάσετε με ασφάλεια.",
      action: "Άνοιγμα αιτημάτων εγγράφων",
    },
    "message.from_broker": {
      subject: "Ο μεσίτης σάς έστειλε μήνυμα",
      lead: "Ο μεσίτης σάς έστειλε μήνυμα. Μπορείτε να το διαβάσετε και να απαντήσετε στον λογαριασμό σας.",
      action: "Άνοιγμα συνομιλίας",
    },
    "deal.step_done": {
      subject: "Ολοκληρώθηκε: {step}",
      lead: "Αυτό το βήμα της συναλλαγής σας ολοκληρώθηκε: {step}.",
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
      lead: "המתווך הציע מועד לביקור בנכס: {time}. אשרו אותו או הציעו מועד אחר באזור הלקוח.",
      action: "פתיחת הביקור בנכס",
    },
    "viewing.confirmed": {
      subject: "הביקור שלכם בנכס ב{day} אושר",
      lead: "הביקור שלכם בנכס אושר למועד {time}.",
      action: "פתיחת הביקור בנכס",
    },
    "viewing.moved": {
      subject: "הביקור שלכם בנכס הועבר ל{day}",
      lead: "הביקור שלכם בנכס הועבר למועד {time}.",
      action: "פתיחת הביקור בנכס",
    },
    "viewing.cancelled": {
      subject: "הביקור שלכם בנכס ב{day} בוטל",
      subjectNoTime: "הביקור שלכם בנכס בוטל",
      lead: "הביקור שלכם בנכס במועד {time} בוטל. אפשר לבקש מועד חדש באזור הלקוח.",
      leadNoTime: "הביקור שלכם בנכס בוטל. אפשר לבקש מועד חדש באזור הלקוח.",
      action: "פתיחת הביקור בנכס",
    },
    "proposal.ready": {
      subject: "הצעה מחכה לתשובתכם",
      lead: "הצעה מחכה לתשובתכם. השיבו לפני המועד האחרון שמופיע באזור הלקוח.",
      action: "פתיחת תנאי ההצעה",
    },
    "proposal.withdrawn": {
      subject: "המתווך משך הצעה",
      lead: "המתווך משך את ההצעה הזו. אין צורך להשיב עליה עוד.",
      action: "פתיחת תנאי ההצעה",
    },
    "proposal.expired": {
      subject: "המועד האחרון של הצעה עבר",
      lead: "המועד האחרון של ההצעה הזו עבר. אין צורך להשיב עליה עוד.",
      action: "פתיחת תנאי ההצעה",
    },
    "document.requested": {
      subject: "המתווך ביקש מכם מסמך",
      lead: "המתווך ביקש מכם מסמך. באזור הלקוח תראו מה נדרש ותוכלו להעלות אותו בצורה מאובטחת.",
      action: "פתיחת הבקשות למסמכים",
    },
    "message.from_broker": {
      subject: "המתווך שלח לכם הודעה",
      lead: "המתווך שלח לכם הודעה. אפשר לקרוא אותה ולהשיב באזור הלקוח.",
      action: "פתיחת השיחה",
    },
    "deal.step_done": {
      subject: "הושלם: {step}",
      lead: "השלב הזה בעסקה שלכם הושלם: {step}.",
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
      lead: "Клиентът потвърди часа за оглед: {time}.",
      action: "Отворете огледа на имот",
    },
    "client.viewing_cancelled": {
      subject: "Клиентът отмени огледа",
      lead: "Клиентът отмени огледа. Причината е записана в огледа.",
      action: "Отворете огледа на имот",
    },
    "client.viewing_new_time": {
      subject: "Клиентът поиска друг час за оглед",
      lead: "Клиентът поиска огледът да бъде преместен. Удобните му часове са записани в огледа.",
      action: "Отворете огледа на имот",
    },
    "client.proposal_accepted": {
      subject: "Клиентът прие предложението",
      lead: "Клиентът прие предложението. Проверете следващата стъпка в предложението.",
      action: "Отворете условията на предложението",
    },
    "client.proposal_declined": {
      subject: "Клиентът отказа предложението",
      lead: "Клиентът отказа предложението. Причината е записана в предложението.",
      action: "Отворете условията на предложението",
    },
    "client.proposal_countered": {
      subject: "Клиентът изпрати насрещно предложение",
      lead: "Клиентът отговори с нови условия. Те очакват Вашия преглед.",
      action: "Отворете условията на предложението",
    },
    "client.document_uploaded": {
      subject: "Клиентът качи поискан документ",
      lead: "Клиентът качи файл, който поискахте. Той очаква Вашия преглед.",
      action: "Отворете заявките за документи",
    },
    "client.message": {
      subject: "Клиентът Ви изпрати съобщение",
      lead: "Клиентът написа съобщение в сделката. Можете да го прочетете и да отговорите там.",
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
      lead: "The client confirmed the viewing time: {time}.",
      action: "Open property viewing",
    },
    "client.viewing_cancelled": {
      subject: "Client cancelled the viewing",
      lead: "The client cancelled the viewing. Their reason is recorded on the viewing.",
      action: "Open property viewing",
    },
    "client.viewing_new_time": {
      subject: "Client asked for another viewing time",
      lead: "The client asked to move the viewing. The times that suit them are recorded on the viewing.",
      action: "Open property viewing",
    },
    "client.proposal_accepted": {
      subject: "Client accepted the proposal",
      lead: "The client accepted the proposal. Check the next step on the proposal.",
      action: "Open proposal terms",
    },
    "client.proposal_declined": {
      subject: "Client declined the proposal",
      lead: "The client declined the proposal. Their reason is recorded on the proposal.",
      action: "Open proposal terms",
    },
    "client.proposal_countered": {
      subject: "Client sent a counteroffer",
      lead: "The client answered with new terms. They are waiting for your review.",
      action: "Open proposal terms",
    },
    "client.document_uploaded": {
      subject: "Client uploaded a requested document",
      lead: "The client uploaded a file you asked for. It is waiting for your review.",
      action: "Open document requests",
    },
    "client.message": {
      subject: "Client sent you a message",
      lead: "The client wrote a message in the Deal. You can read it and reply there.",
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
      lead: "Клиент подтвердил время просмотра: {time}.",
      action: "Открыть просмотр объекта",
    },
    "client.viewing_cancelled": {
      subject: "Клиент отменил просмотр",
      lead: "Клиент отменил просмотр. Причина записана в просмотре.",
      action: "Открыть просмотр объекта",
    },
    "client.viewing_new_time": {
      subject: "Клиент попросил другое время просмотра",
      lead: "Клиент попросил перенести просмотр. Удобное ему время записано в просмотре.",
      action: "Открыть просмотр объекта",
    },
    "client.proposal_accepted": {
      subject: "Клиент принял предложение",
      lead: "Клиент принял предложение. Проверьте следующий шаг в предложении.",
      action: "Открыть условия предложения",
    },
    "client.proposal_declined": {
      subject: "Клиент отклонил предложение",
      lead: "Клиент отклонил предложение. Причина записана в предложении.",
      action: "Открыть условия предложения",
    },
    "client.proposal_countered": {
      subject: "Клиент прислал встречное предложение",
      lead: "Клиент ответил новыми условиями. Они ждут вашей проверки.",
      action: "Открыть условия предложения",
    },
    "client.document_uploaded": {
      subject: "Клиент загрузил запрошенный документ",
      lead: "Клиент загрузил файл, который вы запросили. Он ждёт вашей проверки.",
      action: "Открыть запросы документов",
    },
    "client.message": {
      subject: "Клиент отправил вам сообщение",
      lead: "Клиент написал сообщение в сделке. Прочитать его и ответить можно там.",
      action: "Открыть сделку",
    },
    frame: {
      reference: "Номер",
      footer: "Служебное уведомление. Подробности — в сделке в рабочем пространстве.",
    },
  },
};
