import type { Capability } from "@/domain/capabilities";

const labels = {
  "inquiry.submit": ["Send an inquiry", "Изпращане на запитване", "Отправка запроса"],
  "portal.case.read": [
    "View deal overview and progress",
    "Преглед на сделката и напредъка ѝ",
    "Просмотр сделки и её хода",
  ],
  "portal.access.request": [
    "Request access to a deal",
    "Заявка за достъп до сделка",
    "Запрос доступа к сделке",
  ],
  "portal.brief.acknowledge": [
    "Acknowledge deal requirements",
    "Потвърждаване на изискванията по сделката",
    "Подтверждение требований по сделке",
  ],
  "portal.interest.respond": [
    "Give feedback on suggested properties",
    "Обратна връзка за предложени имоти",
    "Отзывы о предложенных объектах",
  ],
  "portal.message.write": [
    "Send messages to the agency",
    "Съобщения до агенцията",
    "Сообщения агентству",
  ],
  "portal.document.upload": [
    "Upload requested documents",
    "Качване на поискани документи",
    "Загрузка запрошенных документов",
  ],
  "portal.appointment.request": [
    "Request viewings and appointments",
    "Заявки за огледи и срещи",
    "Запросы просмотров и встреч",
  ],
  "portal.proposal.respond": [
    "Respond to proposals",
    "Отговор на предложения",
    "Ответы на предложения",
  ],
  "portal.listing.acknowledge": [
    "Review the listing preview",
    "Преглед на обявата преди публикуване",
    "Просмотр объявления перед публикацией",
  ],
  "inquiry.read": ["Read inquiries", "Преглед на запитвания", "Просмотр запросов"],
  "inquiry.assign": [
    "Assign inquiry responsibility",
    "Възлагане на отговорност за запитване",
    "Назначение ответственного за запрос",
  ],
  "inquiry.respond": ["Respond to inquiries", "Отговор на запитвания", "Ответы на запросы"],
  "case.read": [
    "Read deal information",
    "Преглед на данни по сделки",
    "Просмотр сведений по сделкам",
  ],
  "case.read_internal": [
    "Read internal deal information",
    "Преглед на вътрешни данни по сделки",
    "Просмотр внутренних сведений по сделкам",
  ],
  "case.transition": [
    "Change deal stage and outcome",
    "Промяна на етапа и изхода на сделка",
    "Изменение этапа и исхода сделки",
  ],
  "task.manage": [
    "Manage tasks and commitments",
    "Управление на задачи и ангажименти",
    "Управление задачами и обязательствами",
  ],
  "interest.manage": [
    "Manage properties suggested for a deal",
    "Управление на предложени имоти по сделка",
    "Управление объектами, предложенными по сделке",
  ],
  "listing.read": ["Read property listings", "Преглед на обяви за имоти", "Просмотр объявлений"],
  "listing.edit": [
    "Edit listing drafts",
    "Редактиране на чернови на обяви",
    "Редактирование черновиков объявлений",
  ],
  "listing.review_facts": [
    "Review property facts",
    "Проверка на данни за имот",
    "Проверка сведений об объекте",
  ],
  "media.manage": [
    "Manage listing images and media",
    "Управление на изображения към обяви",
    "Управление изображениями объявлений",
  ],
  "translation.draft": [
    "Prepare translation drafts",
    "Подготовка на чернови на преводи",
    "Подготовка черновиков переводов",
  ],
  "translation.review": ["Review translations", "Преглед на преводи", "Проверка переводов"],
  "publication.release": [
    "Release reviewed publications",
    "Публикуване на прегледани версии",
    "Публикация проверенных версий",
  ],
  "content.edit": [
    "Edit website content",
    "Редактиране на съдържание на сайта",
    "Редактирование содержимого сайта",
  ],
  "claim.approve": [
    "Approve qualified legal, tax or process statements",
    "Одобряване на правни, данъчни или процедурни твърдения от квалифициран рецензент",
    "Утверждение правовых, налоговых или процедурных утверждений квалифицированным рецензентом",
  ],
  "compliance.review": [
    "Review compliance evidence",
    "Преглед на данни за съответствие",
    "Проверка сведений о соблюдении требований",
  ],
  "compliance.suspicion": [
    "Access the restricted suspicion register",
    "Достъп до ограничения регистър за съмнения",
    "Доступ к ограниченному реестру подозрений",
  ],
  "message.draft": [
    "Prepare message drafts",
    "Подготовка на чернови на съобщения",
    "Подготовка черновиков сообщений",
  ],
  "message.send_external": [
    "Send approved external messages",
    "Изпращане на одобрени външни съобщения",
    "Отправка одобренных внешних сообщений",
  ],
  "appointment.manage": [
    "Manage viewings and appointments",
    "Управление на огледи и срещи",
    "Управление просмотрами и встречами",
  ],
  "document.read_restricted": [
    "Read restricted documents",
    "Преглед на документи с ограничен достъп",
    "Просмотр документов с ограниченным доступом",
  ],
  "document.review": ["Review documents", "Преглед на документи", "Проверка документов"],
  "proposal.manage": [
    "Manage proposed terms",
    "Управление на предложени условия",
    "Управление предложенными условиями",
  ],
  "access.grant": [
    "Manage access grants",
    "Управление на права за достъп",
    "Управление правами доступа",
  ],
  "report.read": [
    "Read operational reports",
    "Преглед на оперативни отчети",
    "Просмотр операционных отчётов",
  ],
  "settings.manage": [
    "Manage agency settings",
    "Управление на настройките на агенцията",
    "Управление настройками агентства",
  ],
  "import.run": [
    "Run reviewed data imports",
    "Изпълнение на прегледан импорт на данни",
    "Выполнение проверенного импорта данных",
  ],
  "privacy.manage": [
    "Manage privacy requests",
    "Управление на искания за лични данни",
    "Управление запросами о персональных данных",
  ],
  "complaint.manage": ["Manage complaints", "Управление на оплаквания", "Управление жалобами"],
  "key.manage": [
    "Manage property key custody",
    "Управление на поверени ключове за имоти",
    "Управление передачей ключей от объектов",
  ],
  "audit.read": [
    "Read the audit history",
    "Преглед на историята на действията",
    "Просмотр истории действий",
  ],
  "ai.draft": ["Request Butler drafts", "Заявки за чернови от Butler", "Запросы черновиков Butler"],
} as const satisfies Record<Capability, readonly [string, string, string]>;

// Client-facing permission labels are drafts; they do not approve publication or access.
const clientLocales = ["de", "nl", "el", "he"] as const;
const clientLabels = {
  "inquiry.submit": [
    "Anfrage senden",
    "Een aanvraag versturen",
    "Αποστολή αιτήματος",
    "שליחת פנייה",
  ],
  "portal.case.read": [
    "Vorgang und Fortschritt ansehen",
    "Traject en voortgang bekijken",
    "Προβολή υπόθεσης και προόδου",
    "צפייה בעסקה ובהתקדמותה",
  ],
  "portal.access.request": [
    "Zugriff auf einen Vorgang anfragen",
    "Toegang tot een traject aanvragen",
    "Αίτημα πρόσβασης σε υπόθεση",
    "בקשת גישה לעסקה",
  ],
  "portal.brief.acknowledge": [
    "Anforderungen des Vorgangs bestätigen",
    "Wensen voor het traject bevestigen",
    "Επιβεβαίωση απαιτήσεων υπόθεσης",
    "אישור דרישות העסקה",
  ],
  "portal.interest.respond": [
    "Rückmeldung zu vorgeschlagenen Immobilien geben",
    "Reageren op voorgestelde woningen",
    "Σχόλια για προτεινόμενα ακίνητα",
    "משוב על נכסים שהוצעו",
  ],
  "portal.message.write": [
    "Nachrichten an die Agentur senden",
    "Berichten naar het kantoor sturen",
    "Αποστολή μηνυμάτων στο γραφείο",
    "שליחת הודעות לסוכנות",
  ],
  "portal.document.upload": [
    "Angeforderte Dokumente hochladen",
    "Gevraagde documenten uploaden",
    "Μεταφόρτωση ζητούμενων εγγράφων",
    "העלאת מסמכים שהתבקשו",
  ],
  "portal.appointment.request": [
    "Besichtigungen und Termine anfragen",
    "Bezichtigingen en afspraken aanvragen",
    "Αίτημα για επισκέψεις και ραντεβού",
    "בקשת ביקורים ופגישות",
  ],
  "portal.proposal.respond": [
    "Auf vorgeschlagene Konditionen antworten",
    "Reageren op voorgestelde voorwaarden",
    "Απάντηση σε προτεινόμενους όρους",
    "תגובה לתנאים שהוצעו",
  ],
  "portal.listing.acknowledge": [
    "Inseratsvorschau prüfen",
    "Voorbeeld van de advertentie beoordelen",
    "Έλεγχος προεπισκόπησης αγγελίας",
    "בדיקת התצוגה המקדימה של המודעה",
  ],
} as const satisfies Record<
  Extract<Capability, `portal.${string}`> | "inquiry.submit",
  readonly [string, string, string, string]
>;

export function capabilityLabel(locale: string, capability: string): string {
  const clientIndex = clientLocales.indexOf(locale as (typeof clientLocales)[number]);
  if (clientIndex >= 0) {
    const row = clientLabels[capability as keyof typeof clientLabels];
    return (
      row?.[clientIndex] ??
      [
        "Berechtigung muss geprüft werden",
        "Toegangsrecht moet worden gecontroleerd",
        "Το δικαίωμα χρειάζεται έλεγχο",
        "ההרשאה דורשת בדיקה",
      ][clientIndex] ??
      "Permission requires review"
    );
  }
  const row = labels[capability as Capability];
  return (
    row?.[locale === "bg" ? 1 : locale === "ru" ? 2 : 0] ??
    (locale === "bg"
      ? "Правото изисква преглед"
      : locale === "ru"
        ? "Право требует проверки"
        : "Permission requires review")
  );
}
