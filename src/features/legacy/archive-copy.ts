import type { PublicLocale } from "@/domain/ids";

type ArchiveCopy = {
  listing: string;
  page: string;
  post: string;
  taxonomy: string;
  availability: string;
  historical: string;
  facts: string;
  factsNote: string;
  reading: string;
  media: string;
  mediaNote: string;
  openImage: string;
  contact: string;
  quote: string;
  call: string;
  search: string;
  source: string;
  sourceLinks: string;
  emptyArchive: string;
  noText: string;
};

// Interface copy only. The captured title, prose, fields and media stay in their
// recorded source language; this grants no translation or publication approval.
const copy: Record<PublicLocale, ArchiveCopy> = {
  bg: {
    listing: "Архивна обява",
    page: "Архивна страница",
    post: "Архивна статия",
    taxonomy: "Архивна колекция",
    availability: "Актуалната наличност и условия не са потвърдени.",
    historical:
      "Запазена информация от предишния сайт. Съдържанието и услугите може да са променени.",
    facts: "Данни от оригиналния източник",
    factsNote: "Данните са исторически и не са потвърдени като актуални.",
    reading: "Описание от източника",
    media: "Снимки от източника",
    mediaNote: "Запазени снимки от оригиналния сайт. Текущото състояние не е потвърдено.",
    openImage: "Отвори снимка",
    contact: "Попитайте MS Realty",
    quote: "При обаждане посочете номера на обявата или заглавието на тази страница.",
    call: "Обадете се",
    search: "Търсене на актуални имоти",
    source: "Адрес на оригиналния източник",
    sourceLinks: "Връзки от оригиналния източник",
    emptyArchive: "В запазената колекция няма записи.",
    noText: "Няма допълнителен текст за четене в този архив.",
  },
  en: {
    listing: "Archive listing",
    page: "Archive page",
    post: "Archive article",
    taxonomy: "Archive collection",
    availability: "Current availability and conditions are unconfirmed.",
    historical:
      "Preserved information from the previous website. Content and services may have changed.",
    facts: "Details from the original source",
    factsNote: "These are historical source details, not confirmed current facts.",
    reading: "Source description",
    media: "Source images",
    mediaNote: "Preserved images from the original website. Current condition is unconfirmed.",
    openImage: "Open image",
    contact: "Ask MS Realty",
    quote: "When calling, quote the listing reference or this page title.",
    call: "Call",
    search: "Search current properties",
    source: "Original source address",
    sourceLinks: "Links from the original source",
    emptyArchive: "There were no entries in this captured collection.",
    noText: "There is no additional readable text in this archive.",
  },
  ru: {
    listing: "Архивное объявление",
    page: "Архивная страница",
    post: "Архивная статья",
    taxonomy: "Архивная коллекция",
    availability: "Актуальная доступность и условия не подтверждены.",
    historical: "Сохранённая информация с прежнего сайта. Содержание и услуги могли измениться.",
    facts: "Данные из оригинального источника",
    factsNote: "Это исторические данные источника, их актуальность не подтверждена.",
    reading: "Описание из источника",
    media: "Изображения из источника",
    mediaNote: "Сохранённые изображения с оригинального сайта. Текущее состояние не подтверждено.",
    openImage: "Открыть изображение",
    contact: "Спросите MS Realty",
    quote: "При звонке укажите номер объявления или заголовок этой страницы.",
    call: "Позвонить",
    search: "Поиск актуальной недвижимости",
    source: "Адрес оригинального источника",
    sourceLinks: "Ссылки из оригинального источника",
    emptyArchive: "В сохранённой коллекции не было записей.",
    noText: "В этом архиве нет дополнительного текста для чтения.",
  },
  de: {
    listing: "Archiviertes Angebot",
    page: "Archivseite",
    post: "Archivierter Artikel",
    taxonomy: "Archivierte Sammlung",
    availability: "Aktuelle Verfügbarkeit und Bedingungen sind nicht bestätigt.",
    historical:
      "Gesicherte Informationen der früheren Website. Inhalte und Leistungen können sich geändert haben.",
    facts: "Angaben aus der Originalquelle",
    factsNote: "Historische Quellenangaben, deren Aktualität nicht bestätigt ist.",
    reading: "Beschreibung aus der Quelle",
    media: "Bilder aus der Quelle",
    mediaNote:
      "Gesicherte Bilder der ursprünglichen Website. Der aktuelle Zustand ist nicht bestätigt.",
    openImage: "Bild öffnen",
    contact: "MS Realty fragen",
    quote: "Nennen Sie beim Anruf die Angebotsnummer oder den Titel dieser Seite.",
    call: "Anrufen",
    search: "Aktuelle Immobilien suchen",
    source: "Adresse der Originalquelle",
    sourceLinks: "Links aus der Originalquelle",
    emptyArchive: "Diese gesicherte Sammlung enthielt keine Einträge.",
    noText: "Dieses Archiv enthält keinen weiteren lesbaren Text.",
  },
  nl: {
    listing: "Gearchiveerd aanbod",
    page: "Archiefpagina",
    post: "Gearchiveerd artikel",
    taxonomy: "Gearchiveerde collectie",
    availability: "De huidige beschikbaarheid en voorwaarden zijn niet bevestigd.",
    historical:
      "Bewaarde informatie van de vorige website. Inhoud en diensten kunnen zijn gewijzigd.",
    facts: "Gegevens uit de oorspronkelijke bron",
    factsNote: "Historische brongegevens waarvan de actualiteit niet is bevestigd.",
    reading: "Beschrijving uit de bron",
    media: "Afbeeldingen uit de bron",
    mediaNote:
      "Bewaarde afbeeldingen van de oorspronkelijke website. De huidige staat is niet bevestigd.",
    openImage: "Afbeelding openen",
    contact: "Vraag het MS Realty",
    quote: "Vermeld bij uw oproep het referentienummer of de titel van deze pagina.",
    call: "Bellen",
    search: "Actuele woningen zoeken",
    source: "Adres van de oorspronkelijke bron",
    sourceLinks: "Links uit de oorspronkelijke bron",
    emptyArchive: "Deze bewaarde collectie bevatte geen vermeldingen.",
    noText: "Dit archief bevat geen verdere leesbare tekst.",
  },
  el: {
    listing: "Αρχειοθετημένη αγγελία",
    page: "Αρχειοθετημένη σελίδα",
    post: "Αρχειοθετημένο άρθρο",
    taxonomy: "Αρχειοθετημένη συλλογή",
    availability: "Η τρέχουσα διαθεσιμότητα και οι όροι δεν έχουν επιβεβαιωθεί.",
    historical:
      "Διατηρημένες πληροφορίες από τον προηγούμενο ιστότοπο. Το περιεχόμενο και οι υπηρεσίες μπορεί να έχουν αλλάξει.",
    facts: "Στοιχεία από την αρχική πηγή",
    factsNote:
      "Πρόκειται για ιστορικά στοιχεία της πηγής, χωρίς επιβεβαίωση της σημερινής τους ισχύος.",
    reading: "Περιγραφή από την πηγή",
    media: "Εικόνες από την πηγή",
    mediaNote:
      "Διατηρημένες εικόνες από τον αρχικό ιστότοπο. Η τρέχουσα κατάσταση δεν έχει επιβεβαιωθεί.",
    openImage: "Άνοιγμα εικόνας",
    contact: "Ρωτήστε την MS Realty",
    quote: "Στην κλήση αναφέρετε τον κωδικό της αγγελίας ή τον τίτλο αυτής της σελίδας.",
    call: "Κλήση",
    search: "Αναζήτηση τρεχόντων ακινήτων",
    source: "Διεύθυνση αρχικής πηγής",
    sourceLinks: "Σύνδεσμοι από την αρχική πηγή",
    emptyArchive: "Δεν υπήρχαν καταχωρίσεις σε αυτή την αποθηκευμένη συλλογή.",
    noText: "Δεν υπάρχει επιπλέον αναγνώσιμο κείμενο σε αυτό το αρχείο.",
  },
  he: {
    listing: "מודעה מהארכיון",
    page: "עמוד מהארכיון",
    post: "מאמר מהארכיון",
    taxonomy: "אוסף מהארכיון",
    availability: "הזמינות והתנאים הנוכחיים לא אומתו.",
    historical: "מידע שנשמר מהאתר הקודם. ייתכן שהתוכן והשירותים השתנו.",
    facts: "פרטים מהמקור המקורי",
    factsNote: "אלה פרטים היסטוריים מהמקור. עדכניותם לא אומתה.",
    reading: "תיאור מהמקור",
    media: "תמונות מהמקור",
    mediaNote: "תמונות שנשמרו מהאתר המקורי. המצב הנוכחי לא אומת.",
    openImage: "פתיחת תמונה",
    contact: "שאלו את MS Realty",
    quote: "בשיחה ציינו את מספר המודעה או את כותרת העמוד הזה.",
    call: "התקשרו",
    search: "חיפוש נכסים עדכניים",
    source: "כתובת המקור המקורי",
    sourceLinks: "קישורים מהמקור המקורי",
    emptyArchive: "באוסף שנשמר לא היו רשומות.",
    noText: "אין טקסט נוסף לקריאה בארכיון הזה.",
  },
};

export const archiveCopy = (locale: PublicLocale) => copy[locale];
