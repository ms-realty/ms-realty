import {
  adminLocales,
  getLocale,
  publicIndexableLocales,
  resolvePublicLocale,
  websiteLanguageCoverage,
} from "./locales.mjs";
import { adminSurfaceCatalog } from "./admin-workflows.mjs";
import {
  contactPath,
  hreflangForListing,
  hreflangForLocation,
  hreflangForHome,
  hreflangForContact,
  hreflangForSeller,
  homePath,
  isTranslationIndexable,
  listingPath,
  locationPath,
  sellerPath,
} from "./seo.mjs";
import { approvedTranslationRecordsForListing, listingToPublicViewModel } from "./content.mjs";
import {
  approvedContentDocumentsForLocation,
  approvedContentGuideGroups,
  isPublishableGuide,
  readApprovedCmsContent,
} from "./approved-content.mjs";
import { publicMediaLibrary } from "./media.mjs";
import { buildListingSchema } from "./structured-data.mjs";
import { publicTour } from "./tours.mjs";

const APPROVED_GUIDE_GROUPS = approvedContentGuideGroups(readApprovedCmsContent());

const ACTION_LABELS = {
  bg: {
    inquiry: "Запитване",
    valuation: "Оценка за продавач",
    callback: "Обратно обаждане",
    viewing: "Оглед",
    phone: "Телефон",
    save: "Запази",
    saved: "Запазено",
    savedListings: "Запазени",
    savedEmpty: "Все още нямате запазени имоти.",
    browseListings: "Разгледайте имоти",
    share: "Сподели",
    print: "Печат/PDF",
    results: "Назад към резултатите",
    search: "Търсене",
    contact: "Контакт",
    primaryActions: "Основни действия",
    locations: "Локации",
    featuredListings: "Избрани имоти",
    searchResultActions: "Действия за резултат",
    photo: "снимка",
    photos: "снимки",
    location: "Локация",
    propertyType: "Тип",
    area: "Площ (m²)",
    areaMin: "Мин. площ (m²)",
    areaMax: "Макс. площ (m²)",
    priceMin: "Мин. цена (EUR)",
    priceMax: "Макс. цена (EUR)",
    clearFilters: "Изчисти филтрите",
    any: "Всички",
    sort: "Сортиране",
    view: "Изглед",
    saveSearch: "Запази търсенето",
    saveSearchSuccess: "Търсенето е запазено. Ще ви известим при нови съвпадения.",
    activeFilters: "Активни филтри",
    searchResults: "Резултати от търсене",
    matches: "съвпадения",
    previous: "Предишна",
    next: "Следваща",
    page: "Страница",
    reviewedListings: "проверени обяви",
    locationListings: "Имоти в локацията",
    noLocationListings: "В момента няма проверени обяви за тази локация.",
    browseAllListings: "Разгледайте всички имоти",
    saveAndShare: "Запази и сподели",
    listingActions: "Действия за имота",
    brokerContact: "Контакт с брокер",
    listingSummary: "Обобщение на имота",
    listingContent: "Съдържание на имота",
    listingMediaFacts: "Медия и факти за имота",
    listingMedia: "Медия на имота",
    gallery: "Галерия",
    tour360: "360 тур",
    floorPlans: "Планове",
    videos: "Видео",
    contactBroker: "Свържете се с брокер",
    relatedListings: "Подобни имоти",
    reviewedTranslation: "проверен превод",
    approvedSource: "одобрен източник",
    priceOnRequest: "Цена при запитване",
    reviewRequired: "изисква преглед",
    propertyDetails: "Данни за имота",
    brokerReview: "Преглед от брокер",
    name: "Име",
    preferredContact: "Предпочитан контакт",
    email: "Имейл",
    alertDelivery: "Къде да получите известието",
    alertFrequency: "Колко често",
    alertInstant: "Веднага",
    alertDaily: "Веднъж дневно",
    alertWeekly: "Веднъж седмично",
    alertConsent: "Съгласен/на съм брокер да се свърже с мен за нови съвпадения.",
    preferredCallbackTime: "Предпочитано време за обаждане",
    preferredViewingDate: "Предпочитана дата",
    preferredViewingTime: "Предпочитан час",
    message: "Съобщение",
    contactActions: "Действия за контакт",
    sellerValuation: "Оценка за продавач",
    requestLanguage: "Заяви този език",
    guideActions: "Действия за ръководството",
    factLabels: { location: "Локация", property_type: "Тип", offer_type: "Оферта", bedrooms: "Спални", floor: "Етаж", land_area_sqm: "Площ на парцела", condition: "Състояние", location_precision: "Локация" },
  },
  en: {
    inquiry: "Inquiry",
    valuation: "Seller valuation",
    callback: "Callback",
    viewing: "Viewing",
    phone: "Phone",
    save: "Save",
    saved: "Saved",
    savedListings: "Saved",
    savedEmpty: "You have not saved any properties yet.",
    browseListings: "Explore properties",
    share: "Share",
    print: "Print/PDF",
    results: "Back to results",
    search: "Search",
    contact: "Contact",
    primaryActions: "Primary actions",
    locations: "Locations",
    featuredListings: "Featured listings",
    searchResultActions: "Search result actions",
    photo: "photo",
    photos: "photos",
    location: "Location",
    propertyType: "Type",
    area: "Area (m²)",
    areaMin: "Min. area (m²)",
    areaMax: "Max. area (m²)",
    priceMin: "Min. price (EUR)",
    priceMax: "Max. price (EUR)",
    clearFilters: "Clear filters",
    any: "Any",
    sort: "Sort",
    view: "View",
    saveSearch: "Save search",
    saveSearchSuccess: "Search saved. We will alert you when new properties match.",
    activeFilters: "Active filters",
    searchResults: "Search results",
    matches: "matches",
    previous: "Previous",
    next: "Next",
    page: "Page",
    reviewedListings: "reviewed listings",
    locationListings: "Location listings",
    noLocationListings: "There are no reviewed listings in this location right now.",
    browseAllListings: "Browse all properties",
    saveAndShare: "Save and share",
    listingActions: "Listing actions",
    brokerContact: "Broker contact",
    listingSummary: "Listing summary",
    listingContent: "Listing content",
    listingMediaFacts: "Listing media and facts",
    listingMedia: "Listing media",
    gallery: "Gallery",
    tour360: "360 tour",
    floorPlans: "Floor plans",
    videos: "Videos",
    contactBroker: "Contact broker",
    relatedListings: "Related listings",
    reviewedTranslation: "reviewed translation",
    approvedSource: "approved source",
    priceOnRequest: "Price on request",
    reviewRequired: "review required",
    propertyDetails: "Property details",
    brokerReview: "Broker review",
    name: "Name",
    preferredContact: "Preferred contact",
    email: "Email",
    alertDelivery: "Where to receive the alert",
    alertFrequency: "How often",
    alertInstant: "As soon as possible",
    alertDaily: "Once a day",
    alertWeekly: "Once a week",
    alertConsent: "I agree that a broker may contact me about new matches.",
    preferredCallbackTime: "Preferred callback time",
    preferredViewingDate: "Preferred viewing date",
    preferredViewingTime: "Preferred viewing time",
    message: "Message",
    contactActions: "Contact actions",
    sellerValuation: "Seller valuation",
    requestLanguage: "Request this language",
    guideActions: "Guide actions",
    factLabels: { location: "Location", property_type: "Type", offer_type: "Offer", bedrooms: "Bedrooms", floor: "Floor", land_area_sqm: "Land area", condition: "Condition", location_precision: "Location" },
  },
  de: {
    inquiry: "Anfrage",
    valuation: "Verkaufsbewertung",
    callback: "Rückruf",
    viewing: "Besichtigung",
    phone: "Telefon",
    save: "Speichern",
    saved: "Gespeichert",
    savedListings: "Favoriten",
    savedEmpty: "Sie haben noch keine Immobilien gespeichert.",
    browseListings: "Immobilien entdecken",
    share: "Teilen",
    print: "Drucken/PDF",
    results: "Zurück zu den Ergebnissen",
    search: "Suchen",
    contact: "Kontakt",
    primaryActions: "Hauptaktionen",
    locations: "Orte",
    featuredListings: "Empfohlene Immobilien",
    searchResultActions: "Aktionen zum Suchergebnis",
    photo: "Foto",
    photos: "Fotos",
    location: "Ort",
    propertyType: "Typ",
    area: "Fläche (m²)",
    areaMin: "Mindestfläche (m²)",
    areaMax: "Höchstfläche (m²)",
    priceMin: "Mindestpreis (EUR)",
    priceMax: "Höchstpreis (EUR)",
    clearFilters: "Filter löschen",
    any: "Alle",
    sort: "Sortieren",
    view: "Ansicht",
    saveSearch: "Suche speichern",
    saveSearchSuccess: "Die Suche wurde gespeichert. Wir informieren Sie über neue Treffer.",
    activeFilters: "Aktive Filter",
    searchResults: "Suchergebnisse",
    matches: "Treffer",
    previous: "Zurück",
    next: "Weiter",
    page: "Seite",
    reviewedListings: "geprüfte Anzeigen",
    locationListings: "Immobilien am Ort",
    noLocationListings: "Für diesen Ort sind derzeit keine geprüften Angebote verfügbar.",
    browseAllListings: "Alle Immobilien ansehen",
    saveAndShare: "Speichern und teilen",
    listingActions: "Immobilienaktionen",
    brokerContact: "Maklerkontakt",
    listingSummary: "Immobilienübersicht",
    listingContent: "Immobilieninhalt",
    listingMediaFacts: "Medien und Fakten",
    listingMedia: "Immobilienmedien",
    gallery: "Galerie",
    tour360: "360-Tour",
    floorPlans: "Grundrisse",
    videos: "Videos",
    contactBroker: "Makler kontaktieren",
    relatedListings: "Ähnliche Immobilien",
    reviewedTranslation: "geprüfte Übersetzung",
    approvedSource: "genehmigte Quelle",
    priceOnRequest: "Preis auf Anfrage",
    reviewRequired: "Prüfung erforderlich",
    propertyDetails: "Immobiliendetails",
    brokerReview: "Maklerprüfung",
    name: "Name",
    preferredContact: "Bevorzugter Kontakt",
    email: "E-Mail",
    alertDelivery: "Benachrichtigung erhalten über",
    alertFrequency: "Häufigkeit",
    alertInstant: "So bald wie möglich",
    alertDaily: "Einmal täglich",
    alertWeekly: "Einmal wöchentlich",
    alertConsent: "Ich stimme zu, dass mich ein Makler zu neuen Treffern kontaktiert.",
    preferredCallbackTime: "Bevorzugte Rückrufzeit",
    preferredViewingDate: "Bevorzugtes Besichtigungsdatum",
    preferredViewingTime: "Bevorzugte Besichtigungszeit",
    message: "Nachricht",
    contactActions: "Kontaktaktionen",
    sellerValuation: "Verkaufsbewertung",
    requestLanguage: "Diese Sprache anfragen",
    guideActions: "Ratgeberaktionen",
    factLabels: { location: "Ort", property_type: "Typ", offer_type: "Angebot", bedrooms: "Schlafzimmer", floor: "Etage", land_area_sqm: "Grundstücksfläche", condition: "Zustand", location_precision: "Standort" },
  },
  nl: {
    inquiry: "Aanvraag",
    valuation: "Verkoopwaardering",
    callback: "Terugbellen",
    viewing: "Bezichtiging",
    phone: "Telefoon",
    save: "Bewaren",
    saved: "Bewaard",
    savedListings: "Bewaard",
    savedEmpty: "U hebt nog geen objecten bewaard.",
    browseListings: "Objecten bekijken",
    share: "Delen",
    print: "Print/PDF",
    results: "Terug naar resultaten",
    search: "Zoeken",
    contact: "Contact",
    primaryActions: "Primaire acties",
    locations: "Locaties",
    featuredListings: "Uitgelichte objecten",
    searchResultActions: "Acties voor zoekresultaat",
    photo: "foto",
    photos: "foto's",
    location: "Locatie",
    propertyType: "Type",
    area: "Oppervlakte (m²)",
    areaMin: "Min. oppervlakte (m²)",
    areaMax: "Max. oppervlakte (m²)",
    priceMin: "Min. prijs (EUR)",
    priceMax: "Max. prijs (EUR)",
    clearFilters: "Filters wissen",
    any: "Alle",
    sort: "Sorteren",
    view: "Weergave",
    saveSearch: "Zoekopdracht bewaren",
    saveSearchSuccess: "Zoekopdracht opgeslagen. We melden het wanneer er nieuwe matches zijn.",
    activeFilters: "Actieve filters",
    searchResults: "Zoekresultaten",
    matches: "resultaten",
    previous: "Vorige",
    next: "Volgende",
    page: "Pagina",
    reviewedListings: "beoordeelde objecten",
    locationListings: "Objecten op locatie",
    noLocationListings: "Er zijn momenteel geen beoordeelde objecten op deze locatie.",
    browseAllListings: "Bekijk alle objecten",
    saveAndShare: "Bewaren en delen",
    listingActions: "Objectacties",
    brokerContact: "Makelaarscontact",
    listingSummary: "Objectoverzicht",
    listingContent: "Objectinhoud",
    listingMediaFacts: "Media en feiten",
    listingMedia: "Objectmedia",
    gallery: "Galerij",
    tour360: "360-tour",
    floorPlans: "Plattegronden",
    videos: "Video's",
    contactBroker: "Neem contact op met makelaar",
    relatedListings: "Vergelijkbare objecten",
    reviewedTranslation: "beoordeelde vertaling",
    approvedSource: "goedgekeurde bron",
    priceOnRequest: "Prijs op aanvraag",
    reviewRequired: "beoordeling vereist",
    propertyDetails: "Objectgegevens",
    brokerReview: "Makelaarsbeoordeling",
    name: "Naam",
    preferredContact: "Voorkeurscontact",
    email: "E-mail",
    alertDelivery: "Melding ontvangen via",
    alertFrequency: "Hoe vaak",
    alertInstant: "Zo snel mogelijk",
    alertDaily: "Eenmaal per dag",
    alertWeekly: "Eenmaal per week",
    alertConsent: "Ik ga ermee akkoord dat een makelaar contact opneemt over nieuwe matches.",
    preferredCallbackTime: "Voorkeurstijd voor terugbellen",
    preferredViewingDate: "Voorkeursdatum voor bezichtiging",
    preferredViewingTime: "Voorkeurstijd voor bezichtiging",
    message: "Bericht",
    contactActions: "Contactacties",
    sellerValuation: "Verkoopwaardering",
    requestLanguage: "Vraag deze taal aan",
    guideActions: "Gidsacties",
    factLabels: { location: "Locatie", property_type: "Type", offer_type: "Aanbod", bedrooms: "Slaapkamers", floor: "Verdieping", land_area_sqm: "Perceeloppervlakte", condition: "Staat", location_precision: "Locatie" },
  },
  ru: {
    inquiry: "Запрос",
    valuation: "Оценка для продавца",
    callback: "Обратный звонок",
    viewing: "Просмотр",
    phone: "Телефон",
    save: "Сохранить",
    saved: "Сохранено",
    savedListings: "Избранное",
    savedEmpty: "В избранном пока нет объектов.",
    browseListings: "Смотреть объекты",
    share: "Поделиться",
    print: "Печать/PDF",
    results: "Назад к результатам",
    search: "Поиск",
    contact: "Контакт",
    primaryActions: "Основные действия",
    locations: "Локации",
    featuredListings: "Рекомендуемые объекты",
    searchResultActions: "Действия с результатом",
    photo: "фото",
    photos: "фото",
    location: "Локация",
    propertyType: "Тип",
    area: "Площадь (м²)",
    areaMin: "Мин. площадь (м²)",
    areaMax: "Макс. площадь (м²)",
    priceMin: "Мин. цена (EUR)",
    priceMax: "Макс. цена (EUR)",
    clearFilters: "Очистить фильтры",
    any: "Любые",
    sort: "Сортировка",
    view: "Вид",
    saveSearch: "Сохранить поиск",
    saveSearchSuccess: "Поиск сохранён. Мы сообщим о новых подходящих объектах.",
    activeFilters: "Активные фильтры",
    searchResults: "Результаты поиска",
    matches: "совпадений",
    previous: "Назад",
    next: "Далее",
    page: "Страница",
    reviewedListings: "проверенных объявлений",
    locationListings: "Объекты в локации",
    noLocationListings: "Сейчас в этой локации нет проверенных объявлений.",
    browseAllListings: "Смотреть все объекты",
    saveAndShare: "Сохранить и поделиться",
    listingActions: "Действия с объектом",
    brokerContact: "Контакт брокера",
    listingSummary: "Сводка объекта",
    listingContent: "Содержание объекта",
    listingMediaFacts: "Медиа и факты объекта",
    listingMedia: "Медиа объекта",
    gallery: "Галерея",
    tour360: "360 тур",
    floorPlans: "Планировки",
    videos: "Видео",
    contactBroker: "Связаться с брокером",
    relatedListings: "Похожие объекты",
    reviewedTranslation: "проверенный перевод",
    approvedSource: "одобренный источник",
    priceOnRequest: "Цена по запросу",
    reviewRequired: "требуется проверка",
    propertyDetails: "Данные объекта",
    brokerReview: "Проверка брокером",
    name: "Имя",
    preferredContact: "Предпочтительный контакт",
    email: "Эл. почта",
    alertDelivery: "Куда присылать уведомление",
    alertFrequency: "Как часто",
    alertInstant: "Как можно скорее",
    alertDaily: "Раз в день",
    alertWeekly: "Раз в неделю",
    alertConsent: "Я согласен(-на), чтобы брокер связался со мной по новым совпадениям.",
    preferredCallbackTime: "Удобное время для звонка",
    preferredViewingDate: "Предпочтительная дата просмотра",
    preferredViewingTime: "Предпочтительное время просмотра",
    message: "Сообщение",
    contactActions: "Действия контакта",
    sellerValuation: "Оценка для продавца",
    requestLanguage: "Запросить этот язык",
    guideActions: "Действия руководства",
    factLabels: { location: "Локация", property_type: "Тип", offer_type: "Предложение", bedrooms: "Спальни", floor: "Этаж", land_area_sqm: "Площадь участка", condition: "Состояние", location_precision: "Локация" },
  },
  el: {
    inquiry: "Ερώτηση",
    valuation: "Εκτίμηση πωλητή",
    callback: "Επανάκληση",
    viewing: "Ραντεβού προβολής",
    phone: "Τηλέφωνο",
    save: "Αποθήκευση",
    saved: "Αποθηκεύτηκε",
    savedListings: "Αποθηκευμένα",
    savedEmpty: "Δεν έχετε αποθηκευμένα ακίνητα ακόμη.",
    browseListings: "Δείτε ακίνητα",
    share: "Κοινή χρήση",
    print: "Εκτύπωση/PDF",
    results: "Πίσω στα αποτελέσματα",
    search: "Αναζήτηση",
    contact: "Επικοινωνία",
    primaryActions: "Κύριες ενέργειες",
    locations: "Τοποθεσίες",
    featuredListings: "Προτεινόμενα ακίνητα",
    searchResultActions: "Ενέργειες αποτελέσματος",
    photo: "φωτογραφία",
    photos: "φωτογραφίες",
    location: "Τοποθεσία",
    propertyType: "Τύπος",
    area: "Εμβαδόν (m²)",
    areaMin: "Ελάχ. εμβαδόν (m²)",
    areaMax: "Μέγ. εμβαδόν (m²)",
    priceMin: "Ελάχ. τιμή (EUR)",
    priceMax: "Μέγ. τιμή (EUR)",
    clearFilters: "Εκκαθάριση φίλτρων",
    any: "Όλα",
    sort: "Ταξινόμηση",
    view: "Προβολή",
    saveSearch: "Αποθήκευση αναζήτησης",
    saveSearchSuccess: "Η αναζήτηση αποθηκεύτηκε. Θα σας ειδοποιήσουμε για νέα ακίνητα που ταιριάζουν.",
    activeFilters: "Ενεργά φίλτρα",
    searchResults: "Αποτελέσματα αναζήτησης",
    matches: "αποτελέσματα",
    previous: "Προηγούμενη",
    next: "Επόμενη",
    page: "Σελίδα",
    reviewedListings: "ελεγμένες αγγελίες",
    locationListings: "Ακίνητα τοποθεσίας",
    noLocationListings: "Δεν υπάρχουν αυτή τη στιγμή ελεγμένες αγγελίες σε αυτή την τοποθεσία.",
    browseAllListings: "Δείτε όλα τα ακίνητα",
    saveAndShare: "Αποθήκευση και κοινή χρήση",
    listingActions: "Ενέργειες ακινήτου",
    brokerContact: "Επικοινωνία με μεσίτη",
    listingSummary: "Σύνοψη ακινήτου",
    listingContent: "Περιεχόμενο ακινήτου",
    listingMediaFacts: "Μέσα και στοιχεία ακινήτου",
    listingMedia: "Μέσα ακινήτου",
    gallery: "Συλλογή",
    tour360: "360 περιήγηση",
    floorPlans: "Κατόψεις",
    videos: "Βίντεο",
    contactBroker: "Επικοινωνία με μεσίτη",
    relatedListings: "Παρόμοια ακίνητα",
    reviewedTranslation: "ελεγμένη μετάφραση",
    approvedSource: "εγκεκριμένη πηγή",
    priceOnRequest: "Τιμή κατόπιν αιτήματος",
    reviewRequired: "απαιτείται έλεγχος",
    propertyDetails: "Στοιχεία ακινήτου",
    brokerReview: "Έλεγχος μεσίτη",
    name: "Όνομα",
    preferredContact: "Προτιμώμενη επικοινωνία",
    email: "Email",
    alertDelivery: "Πού να λάβετε την ειδοποίηση",
    alertFrequency: "Πόσο συχνά",
    alertInstant: "Το συντομότερο δυνατό",
    alertDaily: "Μία φορά την ημέρα",
    alertWeekly: "Μία φορά την εβδομάδα",
    alertConsent: "Συμφωνώ να επικοινωνήσει μαζί μου μεσίτης για νέες αντιστοιχίες.",
    preferredCallbackTime: "Προτιμώμενη ώρα επανάκλησης",
    preferredViewingDate: "Προτιμώμενη ημερομηνία προβολής",
    preferredViewingTime: "Προτιμώμενη ώρα προβολής",
    message: "Μήνυμα",
    contactActions: "Ενέργειες επικοινωνίας",
    sellerValuation: "Εκτίμηση πωλητή",
    requestLanguage: "Ζητήστε αυτή τη γλώσσα",
    guideActions: "Ενέργειες οδηγού",
    factLabels: { location: "Τοποθεσία", property_type: "Τύπος", offer_type: "Προσφορά", bedrooms: "Υπνοδωμάτια", floor: "Όροφος", land_area_sqm: "Εμβαδόν οικοπέδου", condition: "Κατάσταση", location_precision: "Τοποθεσία" },
  },
  he: {
    inquiry: "פנייה",
    valuation: "הערכת מוכר",
    callback: "שיחה חוזרת",
    viewing: "תיאום סיור",
    phone: "טלפון",
    save: "שמירה",
    saved: "נשמר",
    savedListings: "שמורים",
    savedEmpty: "עדיין לא שמרתם נכסים.",
    browseListings: "צפייה בנכסים",
    share: "שיתוף",
    print: "הדפסה/PDF",
    results: "חזרה לתוצאות",
    search: "חיפוש",
    contact: "יצירת קשר",
    primaryActions: "פעולות ראשיות",
    locations: "אזורים",
    featuredListings: "נכסים מובילים",
    searchResultActions: "פעולות תוצאה",
    photo: "תמונה",
    photos: "תמונות",
    location: "מיקום",
    propertyType: "סוג",
    area: "שטח (מ״ר)",
    areaMin: "שטח מינימלי (מ״ר)",
    areaMax: "שטח מרבי (מ״ר)",
    priceMin: "מחיר מינימום (EUR)",
    priceMax: "מחיר מקסימום (EUR)",
    clearFilters: "ניקוי מסננים",
    any: "הכול",
    sort: "מיון",
    view: "תצוגה",
    saveSearch: "שמירת חיפוש",
    saveSearchSuccess: "החיפוש נשמר. נעדכן אתכם כשיימצאו נכסים חדשים מתאימים.",
    activeFilters: "מסננים פעילים",
    searchResults: "תוצאות חיפוש",
    matches: "תוצאות",
    previous: "הקודם",
    next: "הבא",
    page: "עמוד",
    reviewedListings: "נכסים מאושרים",
    locationListings: "נכסים באזור",
    noLocationListings: "אין כרגע נכסים מאושרים במיקום הזה.",
    browseAllListings: "לכל הנכסים",
    saveAndShare: "שמירה ושיתוף",
    listingActions: "פעולות נכס",
    brokerContact: "יצירת קשר עם מתווך",
    listingSummary: "תקציר נכס",
    listingContent: "תוכן נכס",
    listingMediaFacts: "מדיה ופרטי נכס",
    listingMedia: "מדיית נכס",
    gallery: "גלריה",
    tour360: "סיור 360",
    floorPlans: "תוכניות קומה",
    videos: "סרטונים",
    contactBroker: "יצירת קשר עם מתווך",
    relatedListings: "נכסים דומים",
    reviewedTranslation: "תרגום מאושר",
    approvedSource: "מקור מאושר",
    priceOnRequest: "מחיר לפי בקשה",
    reviewRequired: "נדרש אישור",
    propertyDetails: "פרטי נכס",
    brokerReview: "בדיקת מתווך",
    name: "שם",
    preferredContact: "העדפת קשר",
    email: "דוא״ל",
    alertDelivery: "היכן לקבל את ההתראה",
    alertFrequency: "באיזו תדירות",
    alertInstant: "בהקדם האפשרי",
    alertDaily: "פעם ביום",
    alertWeekly: "פעם בשבוע",
    alertConsent: "אני מסכים/ה שסוכן יצור איתי קשר לגבי התאמות חדשות.",
    preferredCallbackTime: "זמן מועדף לשיחה חוזרת",
    preferredViewingDate: "תאריך מועדף לסיור",
    preferredViewingTime: "שעה מועדפת לסיור",
    message: "הודעה",
    contactActions: "פעולות קשר",
    sellerValuation: "הערכת מוכר",
    requestLanguage: "בקשת שפה זו",
    guideActions: "פעולות מדריך",
    factLabels: { location: "מיקום", property_type: "סוג", offer_type: "הצעה", bedrooms: "חדרי שינה", floor: "קומה", land_area_sqm: "שטח מגרש", condition: "מצב", location_precision: "מיקום" },
  },
};

// UI labels that are not sourced from a listing record. Keeping these values
// here makes card facts, filters, and review states readable in every core
// public locale while new locales continue to fall back to English safely.
const UI_COPY = {
  bg: {
    searchTitle: "Търсене на имоти | MS Realty",
    searchDescription: "Потърсете проверени имоти на MS Realty.",
    details: "Детайли",
    list: "Списък",
    map: "Карта",
    recommended: "Препоръчани",
    newest: "Най-нови",
    priceLowToHigh: "Цена: ниска към висока",
    priceHighToLow: "Цена: висока към ниска",
    verifiedInventory: "Проверена обява",
    locationPrecisions: { area_only: "само район", approximate: "приблизителна локация", exact: "точна локация" },
    sourceFallback: "Версия на изходния език",
    breadcrumb: "Навигационна пътека",
    propertyTypes: { commercial: "Търговски имот", multi_unit: "Апартаменти", apartment: "Апартамент", hotel: "Хотел", house: "Къща", land: "Парцел", property: "Имот" },
    offerTypes: { sale: "За продажба", rent: "Под наем" },
  },
  en: {
    searchTitle: "Property search | MS Realty",
    searchDescription: "Search reviewed MS Realty property inventory.",
    details: "Details",
    list: "List",
    map: "Map",
    recommended: "Recommended",
    newest: "Newest",
    priceLowToHigh: "Price: low to high",
    priceHighToLow: "Price: high to low",
    verifiedInventory: "Verified listing",
    locationPrecisions: { area_only: "area only", approximate: "approximate location", exact: "exact location" },
    sourceFallback: "Source-language version",
    breadcrumb: "Breadcrumb",
    propertyTypes: { commercial: "Commercial property", multi_unit: "Apartments", apartment: "Apartment", hotel: "Hotel", house: "House", land: "Land", property: "Property" },
    offerTypes: { sale: "For sale", rent: "For rent" },
  },
  de: {
    searchTitle: "Immobiliensuche | MS Realty",
    searchDescription: "Durchsuchen Sie geprüfte MS Realty Immobilien.",
    details: "Details",
    list: "Liste",
    map: "Karte",
    recommended: "Empfohlen",
    newest: "Neueste",
    priceLowToHigh: "Preis: niedrig zu hoch",
    priceHighToLow: "Preis: hoch zu niedrig",
    verifiedInventory: "Geprüfte Immobilie",
    locationPrecisions: { area_only: "nur Gebiet", approximate: "ungefährer Standort", exact: "genauer Standort" },
    sourceFallback: "Version in Ausgangssprache",
    breadcrumb: "Brotkrümelnavigation",
    propertyTypes: { commercial: "Gewerbeimmobilie", multi_unit: "Apartments", apartment: "Wohnung", hotel: "Hotel", house: "Haus", land: "Grundstück", property: "Immobilie" },
    offerTypes: { sale: "Zum Kauf", rent: "Zur Miete" },
  },
  nl: {
    searchTitle: "Vastgoed zoeken | MS Realty",
    searchDescription: "Zoek in beoordeeld vastgoed van MS Realty.",
    details: "Details",
    list: "Lijst",
    map: "Kaart",
    recommended: "Aanbevolen",
    newest: "Nieuwste",
    priceLowToHigh: "Prijs: laag naar hoog",
    priceHighToLow: "Prijs: hoog naar laag",
    verifiedInventory: "Beoordeeld object",
    locationPrecisions: { area_only: "alleen gebied", approximate: "benaderde locatie", exact: "exacte locatie" },
    sourceFallback: "Versie in brontaal",
    breadcrumb: "Kruimelpad",
    propertyTypes: { commercial: "Commercieel vastgoed", multi_unit: "Appartementen", apartment: "Appartement", hotel: "Hotel", house: "Huis", land: "Grond", property: "Object" },
    offerTypes: { sale: "Te koop", rent: "Te huur" },
  },
  ru: {
    searchTitle: "Поиск недвижимости | MS Realty",
    searchDescription: "Ищите проверенные объекты MS Realty.",
    details: "Подробнее",
    list: "Список",
    map: "Карта",
    recommended: "Рекомендуемые",
    newest: "Новые",
    priceLowToHigh: "Цена: по возрастанию",
    priceHighToLow: "Цена: по убыванию",
    verifiedInventory: "Проверенный объект",
    locationPrecisions: { area_only: "только район", approximate: "приблизительная локация", exact: "точная локация" },
    sourceFallback: "Версия на исходном языке",
    breadcrumb: "Навигационная цепочка",
    propertyTypes: { commercial: "Коммерческая недвижимость", multi_unit: "Апартаменты", apartment: "Квартира", hotel: "Отель", house: "Дом", land: "Участок", property: "Объект" },
    offerTypes: { sale: "Продажа", rent: "Аренда" },
  },
  el: {
    searchTitle: "Αναζήτηση ακινήτων | MS Realty",
    searchDescription: "Αναζητήστε ελεγμένα ακίνητα της MS Realty.",
    details: "Λεπτομέρειες",
    list: "Λίστα",
    map: "Χάρτης",
    recommended: "Προτεινόμενα",
    newest: "Νεότερα",
    priceLowToHigh: "Τιμή: χαμηλή προς υψηλή",
    priceHighToLow: "Τιμή: υψηλή προς χαμηλή",
    verifiedInventory: "Ελεγμένο ακίνητο",
    locationPrecisions: { area_only: "μόνο περιοχή", approximate: "κατά προσέγγιση τοποθεσία", exact: "ακριβής τοποθεσία" },
    sourceFallback: "Έκδοση στη γλώσσα προέλευσης",
    breadcrumb: "Διαδρομή πλοήγησης",
    propertyTypes: { commercial: "Επαγγελματικό ακίνητο", multi_unit: "Διαμερίσματα", apartment: "Διαμέρισμα", hotel: "Ξενοδοχείο", house: "Κατοικία", land: "Οικόπεδο", property: "Ακίνητο" },
    offerTypes: { sale: "Προς πώληση", rent: "Προς ενοικίαση" },
  },
  he: {
    searchTitle: "חיפוש נכסים | MS Realty",
    searchDescription: "חפשו נכסים מאושרים של MS Realty.",
    details: "פרטים",
    list: "רשימה",
    map: "מפה",
    recommended: "מומלצים",
    newest: "החדשים ביותר",
    priceLowToHigh: "מחיר: מהנמוך לגבוה",
    priceHighToLow: "מחיר: מהגבוה לנמוך",
    verifiedInventory: "נכס מאושר",
    locationPrecisions: { area_only: "אזור בלבד", approximate: "מיקום משוער", exact: "מיקום מדויק" },
    sourceFallback: "גרסה בשפת המקור",
    breadcrumb: "נתיב ניווט",
    propertyTypes: { commercial: "נכס מסחרי", multi_unit: "דירות", apartment: "דירה", hotel: "מלון", house: "בית", land: "מגרש", property: "נכס" },
    offerTypes: { sale: "למכירה", rent: "להשכרה" },
  },
};

function humanizeIdentifier(value) {
  return String(value || "").replaceAll("_", " ");
}

const LOCATION_NAMES = {
  bg: { Sandanski: "Сандански", Petrich: "Петрич", Hotovo: "Хотово", Bansko: "Банско", "Sveti Vlas": "Свети Влас" },
  ru: { Sandanski: "Сандански", Petrich: "Петрич", Hotovo: "Хотово", Bansko: "Банско", "Sveti Vlas": "Свети-Влас" },
  el: { Sandanski: "Σαντάνσκι", Petrich: "Πετρίτσι", Hotovo: "Χότοβο", Bansko: "Μπάνσκο", "Sveti Vlas": "Σβέτι Βλας" },
  he: { Sandanski: "סנדנסקי", Petrich: "פטריץ׳", Hotovo: "חוטובו", Bansko: "בנסקו", "Sveti Vlas": "סבטי ולאס" },
};

export function uiCopyFor(localeCode) {
  return UI_COPY[localeCode] || UI_COPY.en;
}

export function localizedListingValue(localeCode, key, value) {
  const copy = uiCopyFor(localeCode);
  if (key === "property_type") return copy.propertyTypes[value] || humanizeIdentifier(value);
  if (key === "offer_type") return copy.offerTypes[value] || humanizeIdentifier(value);
  return humanizeIdentifier(value);
}

export function localizedLocationValue(localeCode, value) {
  return LOCATION_NAMES[localeCode]?.[value] || String(value || "");
}

export function localizedSearchFilterValue(localeCode, key, value) {
  if (key === "property_type" || key === "offer_type") return localizedListingValue(localeCode, key, value);
  if (key === "location") return localizedLocationValue(localeCode, value);
  return humanizeIdentifier(value);
}

const PUBLIC_COPY = {
  en: {
    title: (view) => `MS Realty property ${view.id} in ${view.location || "Sandanski"}`,
    description: (view) => `Reviewed MS Realty property facts for ${view.location || "Sandanski"}.`,
  },
  de: {
    title: (view) => `MS Realty Immobilie ${view.id} in ${view.location || "Sandanski"}`,
    description: (view) => `Geprüfte MS Realty Immobiliendaten für ${view.location || "Sandanski"}.`,
  },
  nl: {
    title: (view) => `MS Realty vastgoed ${view.id} in ${view.location || "Sandanski"}`,
    description: (view) => `Goedgekeurde MS Realty vastgoedgegevens voor ${view.location || "Sandanski"}.`,
  },
  ru: {
    title: (view) => `Объект MS Realty ${view.id} в ${view.location || "Sandanski"}`,
    description: (view) => `Проверенные данные объекта MS Realty для ${view.location || "Sandanski"}.`,
  },
  el: {
    title: (view) => `Ακίνητο MS Realty ${view.id} στο ${view.location || "Sandanski"}`,
    description: (view) => `Ελεγμένα στοιχεία ακινήτου MS Realty για το ${view.location || "Sandanski"}.`,
  },
  he: {
    title: (view) => `נכס MS Realty ${view.id} ב-${view.location || "Sandanski"}`,
    description: (view) => `פרטי נכס מאושרים של MS Realty עבור ${view.location || "Sandanski"}.`,
  },
};

const SELLER_COPY = {
  bg: {
    title: "Продайте имота си с MS Realty",
    description: "Заявете брокерска оценка и обратна връзка от екипа на MS Realty.",
    h1: "Продайте имота си",
  },
  en: {
    title: "Sell your property with MS Realty",
    description: "Request a broker valuation and follow-up from the MS Realty team.",
    h1: "Sell your property",
  },
  de: {
    title: "Verkaufen Sie Ihre Immobilie mit MS Realty",
    description: "Fordern Sie eine Maklerbewertung und Rückmeldung vom MS Realty Team an.",
    h1: "Immobilie verkaufen",
  },
  nl: {
    title: "Verkoop uw vastgoed met MS Realty",
    description: "Vraag een makelaarswaardering en opvolging van het MS Realty team aan.",
    h1: "Vastgoed verkopen",
  },
  ru: {
    title: "Продайте недвижимость с MS Realty",
    description: "Запросите брокерскую оценку и обратную связь от команды MS Realty.",
    h1: "Продайте недвижимость",
  },
  el: {
    title: "Πουλήστε το ακίνητό σας με τη MS Realty",
    description: "Ζητήστε εκτίμηση από μεσίτη και επικοινωνία από την ομάδα της MS Realty.",
    h1: "Πουλήστε το ακίνητό σας",
  },
  he: {
    title: "מכירת נכס עם MS Realty",
    description: "בקשו הערכת מתווך וחזרה מצוות MS Realty.",
    h1: "מכירת נכס",
  },
};

const HOME_COPY = {
  bg: {
    title: "MS Realty имоти в Югозападна България",
    h1: "Намерете имот с MS Realty",
    description: "Търсете проверени имоти, райони и продавачески услуги от MS Realty.",
  },
  en: {
    title: "MS Realty property search",
    h1: "Find property with MS Realty",
    description: "Search reviewed listings, locations, and seller services from MS Realty.",
  },
  de: {
    title: "MS Realty Immobiliensuche",
    h1: "Immobilien mit MS Realty finden",
    description: "Suchen Sie geprüfte Immobilien, Orte und Verkäuferleistungen von MS Realty.",
  },
  nl: {
    title: "MS Realty vastgoed zoeken",
    h1: "Vind vastgoed met MS Realty",
    description: "Zoek beoordeeld vastgoed, locaties en verkoopdiensten van MS Realty.",
  },
  ru: {
    title: "Поиск недвижимости MS Realty",
    h1: "Найдите недвижимость с MS Realty",
    description: "Ищите проверенные объекты, локации и услуги для продавцов от MS Realty.",
  },
  el: {
    title: "Αναζήτηση ακινήτων MS Realty",
    h1: "Βρείτε ακίνητο με τη MS Realty",
    description: "Αναζητήστε ελεγμένα ακίνητα, τοποθεσίες και υπηρεσίες πωλητών από τη MS Realty.",
  },
  he: {
    title: "חיפוש נכסים MS Realty",
    h1: "מצאו נכס עם MS Realty",
    description: "חפשו נכסים, אזורים ושירותי מוכרים מאושרים של MS Realty.",
  },
};

const CONTACT_COPY = {
  bg: {
    title: "Свържете се с MS Realty",
    h1: "Свържете се с брокер",
    description: "Изпратете запитване или заявка за обратно обаждане към екипа на MS Realty.",
  },
  en: {
    title: "Contact MS Realty",
    h1: "Contact a broker",
    description: "Send a question or callback request to the MS Realty team.",
  },
  de: {
    title: "MS Realty kontaktieren",
    h1: "Makler kontaktieren",
    description: "Senden Sie eine Frage oder Rückrufanfrage an das MS Realty Team.",
  },
  nl: {
    title: "Neem contact op met MS Realty",
    h1: "Neem contact op met een makelaar",
    description: "Stuur een vraag of terugbelverzoek naar het MS Realty team.",
  },
  ru: {
    title: "Связаться с MS Realty",
    h1: "Связаться с брокером",
    description: "Отправьте вопрос или запрос на обратный звонок команде MS Realty.",
  },
  el: {
    title: "Επικοινωνία με τη MS Realty",
    h1: "Επικοινωνήστε με μεσίτη",
    description: "Στείλτε ερώτηση ή αίτημα επανάκλησης στην ομάδα της MS Realty.",
  },
  he: {
    title: "יצירת קשר עם MS Realty",
    h1: "יצירת קשר עם מתווך",
    description: "שלחו שאלה או בקשה לשיחה חוזרת לצוות MS Realty.",
  },
};

// Site-chrome copy (header nav, footer, language switcher) per public locale.
// Mirrors the design-system SiteChrome content model with production routes.
const CHROME_COPY = {
  bg: {
    navBuy: "Купете",
    navRent: "Под наем",
    navSell: "Продайте",
    navContact: "Контакти",
    explore: "Разгледайте",
    getInTouch: "Свържете се",
    tagline:
      "Имоти за продажба и под наем в Сандански и Пирин, по Черноморието и в съседна Гърция — с местни офиси и брокери, които говорят вашия език.",
    copyright: "Всички права запазени.",
    requestSent: "Запитването е изпратено. Брокер ще се свърже с вас.",
    requestFailed: "Изпращането не бе успешно. Опитайте отново.",
    shareCopied: "Връзката е копирана.",
    close: "Затвори",
    callBroker: "Обади се на брокер",
    languageLabel: "Език",
    menuLabel: "Основна навигация",
    skipToContent: "Към съдържанието",
    filters: "Филтри",
    offices: "Сандански · Банско · Свети Влас",
  },
  en: {
    navBuy: "Buy",
    navRent: "Rent",
    navSell: "Sell",
    navContact: "Contact",
    buyerGuides: "Buyer guides",
    explore: "Explore",
    getInTouch: "Get in touch",
    tagline:
      "Properties for sale and rent in Sandanski and the Pirin mountains, along the Black Sea coast, and in neighbouring Greece — with local offices and brokers who speak your language.",
    copyright: "All rights reserved.",
    requestSent: "Your inquiry was sent. A broker will contact you.",
    requestFailed: "The request could not be sent. Please try again.",
    shareCopied: "Link copied.",
    close: "Close",
    callBroker: "Call a broker",
    languageLabel: "Language",
    menuLabel: "Primary navigation",
    skipToContent: "Skip to content",
    filters: "Filters",
    offices: "Sandanski · Bansko · Sveti Vlas",
  },
  de: {
    navBuy: "Kaufen",
    navRent: "Mieten",
    navSell: "Verkaufen",
    navContact: "Kontakt",
    explore: "Entdecken",
    getInTouch: "Kontakt aufnehmen",
    tagline:
      "Immobilien zum Kauf und zur Miete in Sandanski und im Pirin-Gebirge, an der Schwarzmeerküste und im benachbarten Griechenland — mit lokalen Büros und Maklern, die Ihre Sprache sprechen.",
    copyright: "Alle Rechte vorbehalten.",
    requestSent: "Ihre Anfrage wurde gesendet. Ein Makler meldet sich bei Ihnen.",
    requestFailed: "Die Anfrage konnte nicht gesendet werden. Bitte versuchen Sie es erneut.",
    shareCopied: "Link kopiert.",
    close: "Schließen",
    callBroker: "Makler anrufen",
    languageLabel: "Sprache",
    menuLabel: "Hauptnavigation",
    skipToContent: "Zum Inhalt springen",
    filters: "Filter",
    offices: "Sandanski · Bansko · Sveti Vlas",
  },
  nl: {
    navBuy: "Kopen",
    navRent: "Huren",
    navSell: "Verkopen",
    navContact: "Contact",
    explore: "Ontdekken",
    getInTouch: "Neem contact op",
    tagline:
      "Vastgoed te koop en te huur in Sandanski en het Pirin-gebergte, aan de Zwarte Zeekust en in buurland Griekenland — met lokale kantoren en makelaars die uw taal spreken.",
    copyright: "Alle rechten voorbehouden.",
    requestSent: "Uw aanvraag is verzonden. Een makelaar neemt contact met u op.",
    requestFailed: "De aanvraag kon niet worden verzonden. Probeer het opnieuw.",
    shareCopied: "Link gekopieerd.",
    close: "Sluiten",
    callBroker: "Bel een makelaar",
    languageLabel: "Taal",
    menuLabel: "Hoofdnavigatie",
    skipToContent: "Naar inhoud",
    filters: "Filters",
    offices: "Sandanski · Bansko · Sveti Vlas",
  },
  ru: {
    navBuy: "Купить",
    navRent: "Аренда",
    navSell: "Продать",
    navContact: "Контакты",
    explore: "Обзор",
    getInTouch: "Связаться с нами",
    tagline:
      "Недвижимость для покупки и аренды в Сандански и горах Пирин, на черноморском побережье и в соседней Греции — с местными офисами и брокерами, говорящими на вашем языке.",
    copyright: "Все права защищены.",
    requestSent: "Запрос отправлен. Брокер свяжется с вами.",
    requestFailed: "Не удалось отправить запрос. Попробуйте ещё раз.",
    shareCopied: "Ссылка скопирована.",
    close: "Закрыть",
    callBroker: "Позвонить брокеру",
    languageLabel: "Язык",
    menuLabel: "Основная навигация",
    skipToContent: "К содержанию",
    filters: "Фильтры",
    offices: "Сандански · Банско · Свети-Влас",
  },
  el: {
    navBuy: "Αγορά",
    navRent: "Ενοικίαση",
    navSell: "Πώληση",
    navContact: "Επικοινωνία",
    explore: "Εξερευνήστε",
    getInTouch: "Επικοινωνήστε",
    tagline:
      "Ακίνητα προς πώληση και ενοικίαση στο Σαντάνσκι και τον Πιρίν, στις ακτές της Μαύρης Θάλασσας και στη γειτονική Ελλάδα — με τοπικά γραφεία και μεσίτες που μιλούν τη γλώσσα σας.",
    copyright: "Με την επιφύλαξη παντός δικαιώματος.",
    requestSent: "Το αίτημά σας εστάλη. Ένας μεσίτης θα επικοινωνήσει μαζί σας.",
    requestFailed: "Δεν ήταν δυνατή η αποστολή του αιτήματος. Προσπαθήστε ξανά.",
    shareCopied: "Ο σύνδεσμος αντιγράφηκε.",
    close: "Κλείσιμο",
    callBroker: "Καλέστε μεσίτη",
    languageLabel: "Γλώσσα",
    menuLabel: "Κύρια πλοήγηση",
    skipToContent: "Μετάβαση στο περιεχόμενο",
    filters: "Φίλτρα",
    offices: "Σαντάνσκι · Μπάνσκο · Σβετί Βλας",
  },
  he: {
    navBuy: "קנייה",
    navRent: "השכרה",
    navSell: "מכירה",
    navContact: "צור קשר",
    explore: "גלו עוד",
    getInTouch: "יצירת קשר",
    tagline:
      "נכסים למכירה ולהשכרה בסנדנסקי ובהרי פירין, לאורך חוף הים השחור וביוון השכנה — עם משרדים מקומיים ומתווכים שמדברים בשפה שלכם.",
    copyright: "כל הזכויות שמורות.",
    requestSent: "הפנייה נשלחה. מתווך ייצור אתכם קשר.",
    requestFailed: "לא ניתן היה לשלוח את הפנייה. נסו שוב.",
    shareCopied: "הקישור הועתק.",
    close: "סגירה",
    callBroker: "התקשרו למתווך",
    languageLabel: "שפה",
    menuLabel: "ניווט ראשי",
    skipToContent: "דלגו לתוכן",
    filters: "סינון",
    offices: "סנדנסקי · בנסקו · סבטי ולאס",
  },
};

// Reviewed brand office contact (design-system SiteChrome handoff).
const BRAND_CONTACT = {
  phone_label: "+359 879 69 68 70",
  phone_href: "tel:+359879696870",
  email: "office@makler-realty.com",
};

export function chromeCopyFor(localeCode) {
  return CHROME_COPY[localeCode] || CHROME_COPY.en;
}

function publicChrome(registry, locale, { hreflang = [], active = null, locations = [], currentPath = null } = {}) {
  const copy = chromeCopyFor(locale.code);
  const labels = labelsFor(locale.code);
  const searchBase = `/${locale.code}/${locale.route_segments.search}`;
  const guideLinks = approvedGuideLinksFor(locale.code, currentPath);
  const alternates = new Map(
    (hreflang || []).filter((link) => link.hreflang !== "x-default").map((link) => [link.hreflang, link.href]),
  );
  return {
    copy,
    home: { href: homePath(registry, locale.code), label: "MS Realty" },
    nav: [
      { id: "buy", href: searchBase, label: copy.navBuy, active: active === "search" || active === "listing" || active === "location" },
      { id: "rent", href: `${searchBase}?offer_type=rent`, label: copy.navRent, active: false },
      { id: "sell", href: sellerPath(registry, locale.code), label: copy.navSell, active: active === "seller" },
      { id: "contact", href: contactPath(registry, locale.code), label: copy.navContact, active: active === "contact" },
    ],
    languages: publicIndexableLocales(registry).map((entry) => ({
      code: entry.code,
      label: entry.native_name || entry.code.toUpperCase(),
      href: alternates.get(entry.code) || homePath(registry, entry.code),
      active: entry.code === locale.code,
      dir: entry.direction || "ltr",
    })),
    contact: { ...BRAND_CONTACT, offices: copy.offices },
    resources: guideLinks.length
      ? {
          label: copy.buyerGuides || copy.explore,
          links: guideLinks,
        }
      : null,
    footer: {
      locations: locations.slice(0, 5).map((entry) => ({ href: entry.path, label: entry.location })),
      locationsLabel: labels.locations,
      searchLabel: labels.search,
    },
  };
}

export function labelsFor(localeCode) {
  return ACTION_LABELS[localeCode] || ACTION_LABELS.en;
}

function descriptionFor(listing) {
  return listing.description || listing.h1 || listing.title || `MS Realty listing ${listing.id}`;
}

function localizedCopy(localeCode, view) {
  const template = PUBLIC_COPY[localeCode];
  if (!template || localeCode === view.source_locale) {
    const sourceTitle = view.h1 || view.title;
    return {
      // A legacy metadata title can belong to a different site language. The
      // visible H1 is the crawl's strongest source-language signal.
      title: sourceTitle,
      h1: sourceTitle,
      description: view.description && view.description !== view.title ? view.description : sourceTitle,
    };
  }
  const localizedView = { ...view, location: localizedLocationValue(localeCode, view.location) };
  const title = template.title(localizedView);
  return {
    title,
    h1: title,
    description: template.description(localizedView),
  };
}

function guideDescription(documents) {
  const facts = documents.flatMap((doc) => doc.facts || []);
  const description = facts.join(" ");
  return documents.length === 1 && description.length > 240 ? facts[0] : description.slice(0, 240);
}

function approvedGuideLinksFor(localeCode, currentPath = null) {
  return APPROVED_GUIDE_GROUPS.filter((group) => group.documents[0]?.locale === localeCode).map(({ path, documents }) => {
    const first = documents[0];
    return {
      id: first.id,
      href: path,
      label: first.title,
      summary: first.facts[0],
      reviewer: first.reviewer,
      active: path === currentPath,
    };
  });
}

function guideSchema({ path, locale, documents }) {
  const first = documents[0];
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: first.title,
    inLanguage: locale.code,
    url: path,
    publisher: {
      "@type": "Organization",
      name: "MS Realty",
    },
  };
}

function translationFor(translations, localeCode) {
  return translations.find((translation) => translation.locale === localeCode) || null;
}

function sellerCopy(localeCode) {
  return SELLER_COPY[localeCode] || SELLER_COPY.en;
}

function homeCopy(localeCode) {
  return HOME_COPY[localeCode] || HOME_COPY.en;
}

function contactCopy(localeCode) {
  return CONTACT_COPY[localeCode] || CONTACT_COPY.en;
}

function translationsForSearchListing(registry, listing) {
  return listing.translations || approvedTranslationRecordsForListing(registry, listing);
}

const ACTIVE_LISTING_STATUSES = new Set(["available", "reserved"]);

export function isActiveListing(listing) {
  return ACTIVE_LISTING_STATUSES.has(listingToPublicViewModel(listing).listing_status || "available");
}

function searchTranslationState(registry, listing, locale) {
  const translation = translationFor(translationsForSearchListing(registry, listing), locale.code);
  const indexable = translation ? isTranslationIndexable(registry, translation) : false;
  const display = indexable
    ? "reviewed_translation"
    : translation?.status === "stale"
      ? "stale_translation_fallback"
      : "fallback_source_locale";

  return {
    translation,
    indexable,
    display,
  };
}

function listingCard(registry, listing, locale) {
  const view = listingToPublicViewModel(listing);
  const state = searchTranslationState(registry, listing, locale);
  const copyLocale = state.indexable ? locale.code : view.source_locale || registry.source_locale;
  const copy = localizedCopy(copyLocale, view);
  const ui = uiCopyFor(locale.code);
  const reviewedTranslation = state.indexable && copyLocale !== view.source_locale && state.translation?.human_approved === true;
  const publicMedia = publicMediaLibrary(view.media, {
    fallback: view.thumbnail_url
      ? {
          url: view.thumbnail_url,
          alt: view.thumbnail_alt || copy.title,
        }
      : null,
  });
  const thumbnail = publicMedia.gallery[0] || null;
  return {
    id: listing.id,
    title: copy.title,
    path: listingPath(registry, locale.code, listing.id),
    review_badge: reviewedTranslation ? "reviewed_translation" : null,
    translation_display: state.display,
    translation_locale: state.translation?.locale || locale.code,
    translation_status: state.translation?.status || "missing",
    translation_indexable: state.indexable,
    translation_human_approved: state.translation?.human_approved === true,
    source_locale: listing.locale,
    content_locale: copyLocale,
    location: localizedLocationValue(locale.code, view.location),
    property_type: view.property_type,
    property_type_label: localizedListingValue(locale.code, "property_type", view.property_type),
    offer_type: view.offer_type,
    offer_type_label: localizedListingValue(locale.code, "offer_type", view.offer_type),
    bedrooms: view.bedrooms,
    bedrooms_not_applicable: view.bedrooms_not_applicable,
    area_sqm: view.area_sqm,
    price_eur: view.price_eur,
    price_on_request: view.price_on_request,
    listing_status: view.listing_status,
    listing_active: isActiveListing(listing),
    // Public claims must describe the reviewed media we can actually render,
    // not a legacy page's unverified gallery counter.
    image_count: publicMedia.gallery_count,
    legacy_image_count: Number(view.image_count || listing.image_count || 0),
    thumbnail,
    actions: {
      detail: { label: ui.details, href: listingPath(registry, locale.code, listing.id) },
      inquiry: {
        label: labelsFor(locale.code).inquiry,
        endpoint: "/api/leads",
        method: "POST",
        payload: {
          leadType: "buyer",
          language: locale.code,
          listingReference: listing.id,
          source: "website_search_result",
        },
      },
      save: {
        label: labelsFor(locale.code).save,
        saved_label: labelsFor(locale.code).saved,
        endpoint: "/api/saved-searches",
        storage_key: "ms-realty:saved-listings",
        listing_id: listing.id,
      },
    },
  };
}

function relatedListingCards(registry, listings, locale, currentListing) {
  const current = listingToPublicViewModel(currentListing);
  const fallbackLocale = locale.fallback_locale || registry.source_locale;

  return listings
    .filter((candidate) => candidate.id !== currentListing.id && isActiveListing(candidate))
    .map((candidate, index) => {
      const card = listingCard(registry, candidate, locale);
      const languageRank =
        card.content_locale === locale.code
          ? card.translation_indexable
            ? 0
            : 1
          : card.content_locale === fallbackLocale
            ? 2
            : 3;
      const offerRank = card.offer_type === current.offer_type ? 0 : 1;
      const propertyTypeRank = card.property_type === current.property_type ? 0 : 1;

      return { card, index, languageRank, offerRank, propertyTypeRank };
    })
    .sort(
      (left, right) =>
        left.languageRank - right.languageRank ||
        left.offerRank - right.offerRank ||
        left.propertyTypeRank - right.propertyTypeRank ||
        left.index - right.index,
    )
    .slice(0, 3)
    .map(({ card }) => card);
}

function indexableListingForLocale(registry, listing, locale) {
  return searchTranslationState(registry, listing, locale).indexable;
}

function locationNamesFromListings(listings) {
  return [...new Set(listings.map((listing) => listingToPublicViewModel(listing).location).filter(Boolean))].sort();
}

const CYRILLIC_TO_LATIN = Object.freeze({
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m",
  н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sht",
  ъ: "a", ы: "y", ь: "y", э: "e", ю: "yu", я: "ya", ѝ: "i",
});

function norm(value) {
  return String(value ?? "")
    .toLocaleLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "");
}

function transliterateCyrillic(value) {
  return [...norm(value)].map((character) => CYRILLIC_TO_LATIN[character] || character).join("");
}

function searchVariants(value) {
  const source = norm(value);
  const transliterated = transliterateCyrillic(source);
  return [...new Set([source, transliterated].filter(Boolean))];
}

function queryTokens(query) {
  return norm(query)
    .split(/\s+/)
    .filter(Boolean)
    .map(searchVariants);
}

function searchableText(view) {
  const source = [view.id, view.title, view.h1, view.description, view.location, view.property_type, view.offer_type].join(" ");
  return searchVariants(source).join(" ");
}

function includesSearchValue(haystack, needle) {
  const indexed = searchVariants(haystack).join(" ");
  return searchVariants(needle).some((candidate) => indexed.includes(candidate));
}

function numberFilter(value, min, max) {
  if (min === undefined && max === undefined) return true;
  if (value === null || value === undefined || value === "") return false;
  const number = Number(value);
  if (!Number.isFinite(number)) return false;
  if (min !== undefined && number < Number(min)) return false;
  if (max !== undefined && number > Number(max)) return false;
  return true;
}

function matchesSearch(view, query, filters = {}) {
  const text = searchableText(view);
  if (!queryTokens(query).every((variants) => variants.some((token) => text.includes(token)))) return false;
  if (filters.location && !includesSearchValue(view.location, filters.location)) return false;
  if (filters.property_type && norm(view.property_type) !== norm(filters.property_type)) return false;
  if (filters.offer_type && norm(view.offer_type) !== norm(filters.offer_type)) return false;
  if (filters.status && norm(view.listing_status) !== norm(filters.status)) return false;
  if (!numberFilter(view.price_eur, filters.price_min, filters.price_max)) return false;
  if (!numberFilter(view.bedrooms, filters.bedrooms_min, undefined)) return false;
  if (!numberFilter(view.area_sqm, filters.area_min, filters.area_max)) return false;
  return true;
}

const PUBLIC_SEARCH_SORTS = new Set(["recommended", "price_asc", "price_desc"]);

function publicSearchSort(value) {
  return PUBLIC_SEARCH_SORTS.has(value) ? value : "recommended";
}

function sortListingsForPublicSearch(listings, sort) {
  if (sort === "recommended") return listings;

  const direction = sort === "price_desc" ? -1 : 1;
  return listings
    .map((listing, index) => ({ listing, index, price: Number(listingToPublicViewModel(listing).price_eur) }))
    .sort((left, right) => {
      const leftHasPrice = Number.isFinite(left.price) && left.price > 0;
      const rightHasPrice = Number.isFinite(right.price) && right.price > 0;
      if (!leftHasPrice || !rightHasPrice) {
        if (leftHasPrice === rightHasPrice) return left.index - right.index;
        return leftHasPrice ? -1 : 1;
      }
      const comparison = (left.price - right.price) * direction;
      return comparison || left.index - right.index;
    })
    .map(({ listing }) => listing);
}

const HOME_MEDIA_PROPERTY_TYPES = new Set(["apartment", "house", "villa", "multi_unit"]);
const EDITORIAL_HERO_LISTING_IDS = ["MS-CRAWL-0074", "MS-CRAWL-0038", "MS-CRAWL-0003"];

function isEditorialHeroAsset(media) {
  return Boolean(media?.url) && !/DJI_0696|907-dron/i.test(media.url);
}

function primaryCardMedia(cards = [], { preferResidential = false } = {}) {
  const card =
    (preferResidential ? cards.find((candidate) => HOME_MEDIA_PROPERTY_TYPES.has(candidate.property_type) && candidate.thumbnail?.url) : null) ||
    cards.find((candidate) => candidate.thumbnail?.url);
  if (!card) return null;
  return {
    url: card.thumbnail.url,
    alt: card.thumbnail.alt || card.title,
    listing_id: card.id,
    path: card.path,
  };
}

function editorialHeroMedia(registry, listings, locale, fallbackCards) {
  for (const listingId of EDITORIAL_HERO_LISTING_IDS) {
    const listing = listings.find((candidate) => candidate.id === listingId && isActiveListing(candidate));
    if (!listing) continue;
    const card = listingCard(registry, listing, locale);
    if (!isEditorialHeroAsset(card.thumbnail)) continue;
    return {
      url: card.thumbnail.url,
      alt: card.thumbnail.alt || card.title,
      listing_id: card.id,
      path: card.path,
    };
  }
  return primaryCardMedia(fallbackCards, { preferResidential: true });
}

function contactChannelLabel(channel, labels) {
  if (channel === "phone") return labels.phone;
  if (channel === "whatsapp") return "WhatsApp";
  return "Viber";
}

function listingActions(locale, view, path, labels, brokerContact = null) {
  const leadPayload = { leadType: "buyer", language: locale.code, listingReference: view.id };
  const searchPath = `/${locale.code}/${locale.route_segments?.search || "search"}`;
  return {
    sticky_mobile: true,
    minimum_tap_target_px: 44,
    primary: [
      {
        id: "inquiry",
        label: labels.inquiry,
        kind: "lead",
        method: "POST",
        endpoint: "/api/leads",
        payload: { ...leadPayload, source: "website_listing_detail" },
      },
      {
        id: "callback",
        label: labels.callback,
        kind: "lead",
        method: "POST",
        endpoint: "/api/leads",
        payload: {
          ...leadPayload,
          source: "website_callback_request",
          contact_preference: "phone",
        },
      },
      {
        id: "request_viewing",
        label: labels.viewing,
        kind: "lead",
        method: "POST",
        endpoint: "/api/leads",
        payload: {
          ...leadPayload,
          source: "website_viewing_request",
          contact_preference: "phone",
        },
      },
    ],
    direct_contact: {
      review_status: brokerContact ? "approved_broker_contact" : "needs_broker_contact_review",
      broker: brokerContact?.broker || null,
      reviewer: brokerContact?.reviewer || null,
      channels: ["phone", "whatsapp", "viber"].map((channel) => ({
        id: channel,
        label: contactChannelLabel(channel, labels),
        enabled: Boolean(brokerContact?.channels?.[channel]),
        href: brokerContact?.channels?.[channel] || null,
      })),
    },
    secondary: [
      { id: "back_to_results", label: labels.results || ACTION_LABELS.en.results, kind: "link", url: searchPath },
      {
        id: "save",
        label: labels.save,
        saved_label: labels.saved,
        kind: "client_saved_listing",
        storage_key: "ms-realty:saved-listings",
        listing_id: view.id,
      },
      { id: "share_family", label: labels.share, kind: "share", url: path },
      {
        id: "print",
        label: labels.print,
        kind: "print",
        url: `${path}?print=1`,
        pdf_status: "browser_print_ready",
      },
    ],
  };
}

export function renderListingPage({ registry, listing, localeCode, translations, brokerContact = null, relatedListings = [] }) {
  const resolved = resolvePublicLocale(registry, localeCode);
  const locale = resolved.locale;
  const view = listingToPublicViewModel(listing);
  const allTranslations = translations || approvedTranslationRecordsForListing(registry, listing);
  const translation = translationFor(allTranslations, locale.code);
  const translationIndexable = translation ? isTranslationIndexable(registry, translation) : false;
  const indexable = resolved.available && translationIndexable;
  const path = listingPath(registry, locale.code, listing.id);
  const hreflang = indexable ? hreflangForListing(registry, listing.id, allTranslations) : [];
  const labels = labelsFor(locale.code);
  const copy = localizedCopy(translationIndexable ? locale.code : view.source_locale, view);
  const sourceSeo = locale.code === view.source_locale && view.seo?.human_approved === true ? view.seo : {};
  const canonical = sourceSeo.canonical_override === path ? sourceSeo.canonical_override : path;
  const metadataTitle = sourceSeo.title || copy.title;
  const metadataDescription = sourceSeo.description || copy.description;
  const publicMedia = publicMediaLibrary(view.media, {
    fallback: view.thumbnail_url
      ? {
          url: view.thumbnail_url,
          alt: view.thumbnail_alt || copy.title,
        }
      : null,
  });

  return {
    kind: "listing",
    status: 200,
    requested_locale: localeCode,
    locale: locale.code,
    lang: locale.code,
    dir: locale.direction,
    path,
    canonical,
    indexable,
    fallback: {
      active: !resolved.available || !translationIndexable,
      requested_locale: localeCode,
      resolved_locale: locale.code,
    },
    metadata: {
      title: metadataTitle,
      description: metadataDescription,
      og_title: sourceSeo.og_title || metadataTitle,
      og_description: sourceSeo.og_description || metadataDescription,
      robots: indexable ? sourceSeo.robots || "index,follow" : "noindex,follow",
    },
    hreflang,
    chrome: publicChrome(registry, locale, { hreflang, active: "listing" }),
    schema: buildListingSchema({ path: canonical, view, copy: { ...copy, title: metadataTitle, description: metadataDescription }, publicMedia }),
    translation: {
      locale: translation?.locale || locale.code,
      status: translation?.status || "missing",
      human_approved: translation?.human_approved === true,
      reviewer: translation?.reviewer || null,
    },
    body: {
      content_locale: translationIndexable ? locale.code : view.source_locale || registry.source_locale,
      h1: copy.h1,
      description: copy.description,
      facts: {
        id: view.id,
        location: localizedLocationValue(locale.code, view.location),
        property_type: view.property_type,
        offer_type: view.offer_type,
        bedrooms: view.bedrooms,
        area_sqm: view.area_sqm,
        floor: view.floor,
        total_floors: view.total_floors,
        land_area_sqm: view.land_area_sqm,
        condition: view.condition,
        location_precision: view.location_precision,
        price_eur: view.price_eur,
        price_on_request: view.price_on_request,
        listing_status: view.listing_status,
        image_count: view.image_count,
      },
      lifecycle: {
        status: view.listing_status,
        active_in_search: isActiveListing(listing),
        seo_kept_live: true,
        publish_approved: view.workflow?.publish_approved === true,
        publish_approved_at: view.workflow?.publish_approved_at || null,
        last_edited_at: view.workflow?.last_edited_at || null,
      },
      verification: {
        availability_verified_at: view.workflow?.availability_verified_at || null,
        availability_verified_by: view.workflow?.availability_verified_by || null,
        verified: Boolean(view.workflow?.availability_verified_at),
      },
      quality_flags: {
        bedrooms_not_applicable: view.bedrooms_not_applicable === true,
        location_precision: view.location_precision,
      },
      media: {
        ...publicMedia,
        tour: publicTour(view.tour),
      },
      ctas: {
        inquiry: labels.inquiry,
        seller_valuation: labels.valuation,
      },
      actions: listingActions(locale, view, path, labels, brokerContact),
      related_listings: relatedListingCards(registry, relatedListings, locale, listing),
      source: {
        old_url: view.source_url,
        source_domain: view.source_domain,
        source_locale: view.source_locale,
        source_title: view.title,
      },
    },
  };
}

export function renderSearchPage({
  registry,
  localeCode,
  listings,
  query = "",
  filters = {},
  sort = "recommended",
  page = 1,
  pageSize = 12,
  savedView = false,
}) {
  const resolved = resolvePublicLocale(registry, localeCode);
  const locale = resolved.locale;
  const ui = uiCopyFor(locale.code);
  const labels = labelsFor(locale.code);
  const activeListings = listings.filter(isActiveListing);
  const localeMatches = activeListings.filter((listing) => listing.locale === locale.code);
  const fallbackMatches = activeListings.filter(
    (listing) => listing.locale === (locale.fallback_locale || registry.source_locale) || listing.locale === registry.source_locale,
  );
  const searchableListings = localeMatches.length ? localeMatches : fallbackMatches;
  const filterViews = searchableListings.map((listing) => listingToPublicViewModel(listing));
  const filterOptions = {
    locations: [...new Set(filterViews.map((listing) => listing.location).filter(Boolean))].sort(),
    property_types: [...new Set(filterViews.map((listing) => listing.property_type).filter(Boolean))].sort(),
    offer_types: [...new Set(filterViews.map((listing) => listing.offer_type).filter(Boolean))].sort(),
    bedrooms: [...new Set(filterViews.map((listing) => listing.bedrooms).filter((value) => Number.isInteger(value) && value >= 0))].sort((left, right) => left - right),
  };
  const matchedListings = searchableListings.filter((listing) =>
    matchesSearch(listingToPublicViewModel(listing), query, filters),
  );
  const selectedSort = publicSearchSort(sort);
  const sortedListings = sortListingsForPublicSearch(matchedListings, selectedSort);
  const requestedPage = Number(page);
  const normalizedPage = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const requestedPageSize = savedView || pageSize === null ? Math.max(sortedListings.length, 1) : Number(pageSize);
  const normalizedPageSize = Number.isInteger(requestedPageSize) && requestedPageSize > 0 ? Math.min(requestedPageSize, 1000) : 12;
  const totalPages = Math.max(1, Math.ceil(sortedListings.length / normalizedPageSize));
  const currentPage = Math.min(normalizedPage, totalPages);
  const offset = (currentPage - 1) * normalizedPageSize;
  const cards = sortedListings
    .slice(offset, offset + normalizedPageSize)
    .map((listing) => listingCard(registry, listing, locale));
  const activeFilterChips = ["location", "property_type", "offer_type", "price_min", "price_max", "bedrooms_min", "area_min", "area_max", "status"]
    .map((key) => ({ key, value: filters[key] || "", active: Boolean(filters[key]) }))
    .filter((chip) => chip.active);

  return {
    kind: "search",
    status: 200,
    requested_locale: localeCode,
    locale: locale.code,
    lang: locale.code,
    dir: locale.direction,
    path: `/${locale.code}/${locale.route_segments.search}`,
    canonical: `/${locale.code}/${locale.route_segments.search}`,
    // Search results are a private, mutable utility surface. Curated location
    // and listing pages carry indexable inventory; query/filter combinations
    // must not become thin or duplicate landing pages.
    indexable: false,
    metadata: {
      title: savedView ? `${labels.savedListings} | MS Realty` : ui.searchTitle,
      description: savedView ? labels.savedEmpty : ui.searchDescription,
      robots: savedView ? "noindex,nofollow" : "noindex,follow",
    },
    mobile_policy: {
      list_first_mobile: true,
      // Listing coordinates are not reviewed yet. Do not expose a map switch
      // that implies address-level geography until that source is available.
      map_optional: false,
      sticky_contact_actions: true,
      minimum_tap_target_px: 44,
    },
    chrome: publicChrome(registry, locale, { active: savedView ? "saved" : "search" }),
    search: {
      saved_view: savedView === true,
      engines: ["typesense", "meilisearch"],
      query,
      sort: selectedSort,
      filters: {
        locale: locale.code,
        public_enabled: true,
        indexable: true,
        ...filters,
      },
      total_matches: matchedListings.length,
      returned: cards.length,
      pagination: {
        page: currentPage,
        per_page: normalizedPageSize,
        total_pages: totalPages,
        has_previous: currentPage > 1,
        has_next: currentPage < totalPages,
      },
      controls: {
        view_modes: [{ id: "list", label: ui.list, default: true }],
        sort_options: [
          { id: "recommended", label: ui.recommended, default: true },
          { id: "price_asc", label: ui.priceLowToHigh },
          { id: "price_desc", label: ui.priceHighToLow },
        ],
        save_search: {
          endpoint: "/api/saved-searches",
          method: "POST",
          payload: {
            language: locale.code,
            query,
            filters: { ...filters },
            source: "website_search",
          },
        },
        active_filter_chips: activeFilterChips,
        filter_options: filterOptions,
      },
      fallback: {
        enabled: true,
        locale: locale.fallback_locale || registry.source_locale,
        label: ui.sourceFallback,
      },
    },
    cards,
  };
}

export function renderHomePage({ registry, localeCode, listings }) {
  const resolved = resolvePublicLocale(registry, localeCode);
  const locale = resolved.locale;
  const path = homePath(registry, locale.code);
  const copy = homeCopy(locale.code);
  const search = renderSearchPage({ registry, localeCode: locale.code, listings, query: "" });
  const locations = locationNamesFromListings(listings)
    .map((location) => {
      const page = renderLocationPage({ registry, localeCode: locale.code, location, listings });
      return page.indexable
        ? {
            location: localizedLocationValue(locale.code, location),
            path: page.path,
            listing_count: page.body.listing_count,
            image: primaryCardMedia(page.cards, { preferResidential: true }),
          }
        : null;
    })
    .filter(Boolean);
  const chrome = publicChrome(registry, locale, {
    hreflang: resolved.available ? hreflangForHome(registry) : [],
    active: "home",
    locations,
  });

  return {
    kind: "home",
    status: 200,
    requested_locale: localeCode,
    locale: locale.code,
    lang: locale.code,
    dir: locale.direction,
    path,
    canonical: path,
    indexable: resolved.available,
    metadata: {
      title: copy.title,
      description: copy.description,
      robots: resolved.available ? "index,follow" : "noindex,follow",
    },
    hreflang: resolved.available ? hreflangForHome(registry) : [],
    chrome,
    body: {
      h1: copy.h1,
      intro: copy.description,
      hero: {
        image: editorialHeroMedia(registry, listings, locale, search.cards),
      },
      search: {
        path: search.path,
        endpoint: "/api/search",
        method: "GET",
        query_param: "q",
      },
      seller: {
        path: sellerPath(registry, locale.code),
        label: labelsFor(locale.code).valuation,
        title: sellerCopy(locale.code).h1,
        description: sellerCopy(locale.code).description,
      },
      contact: {
        path: contactPath(registry, locale.code),
        label: labelsFor(locale.code).callback,
      },
      guides: chrome.resources,
      locations,
    },
    cards: search.cards.slice(0, 6),
  };
}

export function renderContactPage({ registry, localeCode }) {
  const resolved = resolvePublicLocale(registry, localeCode);
  const locale = resolved.locale;
  const path = contactPath(registry, locale.code);
  const labels = labelsFor(locale.code);
  const copy = contactCopy(locale.code);

  return {
    kind: "contact",
    status: 200,
    requested_locale: localeCode,
    locale: locale.code,
    lang: locale.code,
    dir: locale.direction,
    path,
    canonical: path,
    indexable: resolved.available,
    metadata: {
      title: copy.title,
      description: copy.description,
      robots: resolved.available ? "index,follow" : "noindex,follow",
    },
    hreflang: resolved.available ? hreflangForContact(registry) : [],
    chrome: publicChrome(registry, locale, { hreflang: resolved.available ? hreflangForContact(registry) : [], active: "contact" }),
    body: {
      h1: copy.h1,
      intro: copy.description,
      callback: {
        endpoint: "/api/leads",
        method: "POST",
        minimum_tap_target_px: 44,
        required_fields: ["contact.name", "contact.phone"],
        payload: {
          source: "website_contact_callback",
          intent: "callback",
          leadType: "general",
          language: locale.code,
          contact_preference: "phone",
        },
        label: labels.callback,
      },
      search: {
        path: `/${locale.code}/${locale.route_segments.search}`,
      },
      seller: {
        path: sellerPath(registry, locale.code),
      },
    },
  };
}

export function renderGuidePage({ registry, localeCode, path, documents }) {
  const resolved = resolvePublicLocale(registry, localeCode);
  const locale = resolved.locale;
  const docs = documents.filter((doc) => isPublishableGuide(doc) && doc.locale === locale.code);
  const first = docs[0];
  if (!first) return { kind: "not_found", status: 404, path, indexable: false };
  const indexable = resolved.available && locale.public_enabled && locale.indexable;
  const description = guideDescription(docs);

  return {
    kind: "guide",
    status: indexable ? 200 : 404,
    requested_locale: localeCode,
    locale: locale.code,
    lang: locale.code,
    dir: locale.direction,
    path,
    canonical: path,
    indexable,
    metadata: {
      title: first.title,
      description,
      robots: indexable ? "index,follow" : "noindex,follow",
    },
    hreflang: indexable
      ? [
          { hreflang: locale.code, href: path },
          { hreflang: "x-default", href: path },
        ]
      : [],
    chrome: publicChrome(registry, locale, { active: "guide", currentPath: path }),
    schema: indexable ? guideSchema({ path, locale, documents: docs }) : null,
    body: {
      h1: first.title,
      intro: description,
      sections: docs.map((doc) => ({
        id: doc.id,
        title: doc.title,
        facts: doc.facts,
        reviewer: doc.reviewer,
        sources_label: doc.sources_label || "",
        sources: doc.sources || [],
      })),
      ctas: {
        search: { path: `/${locale.code}/${locale.route_segments.search}` },
        seller: { path: sellerPath(registry, locale.code) },
        contact: { path: contactPath(registry, locale.code) },
      },
    },
  };
}

function locationPageCopy(localeCode, location) {
  const copy = {
    bg: {
      title: `Имоти в ${location} | MS Realty`,
      description: `Проверени обяви на MS Realty за имоти в ${location}.`,
      heading: `Имоти в ${location}`,
    },
    en: {
      title: `Properties in ${location} | MS Realty`,
      description: `Reviewed MS Realty property listings in ${location}.`,
      heading: `Properties in ${location}`,
    },
    de: {
      title: `Immobilien in ${location} | MS Realty`,
      description: `Geprüfte Immobilienangebote von MS Realty in ${location}.`,
      heading: `Immobilien in ${location}`,
    },
    nl: {
      title: `Vastgoed in ${location} | MS Realty`,
      description: `Gecontroleerd vastgoedaanbod van MS Realty in ${location}.`,
      heading: `Vastgoed in ${location}`,
    },
    ru: {
      title: `Недвижимость в ${location} | MS Realty`,
      description: `Проверенные объявления MS Realty о недвижимости в ${location}.`,
      heading: `Недвижимость в ${location}`,
    },
    el: {
      title: `Ακίνητα: ${location} | MS Realty`,
      description: `Ελεγμένες αγγελίες ακινήτων της MS Realty στην περιοχή ${location}.`,
      heading: `Ακίνητα: ${location}`,
    },
    he: {
      title: `נכסים ב-${location} | MS Realty`,
      description: `נכסים שנבדקו על ידי MS Realty ב-${location}.`,
      heading: `נכסים ב-${location}`,
    },
  };
  return copy[localeCode] || copy.en;
}

export function renderLocationPage({ registry, localeCode, location, listings }) {
  const resolved = resolvePublicLocale(registry, localeCode);
  const locale = resolved.locale;
  const matchedListings = listings.filter((listing) => {
    const view = listingToPublicViewModel(listing);
    return norm(view.location) === norm(location) && isActiveListing(listing) && indexableListingForLocale(registry, listing, locale);
  });
  const path = locationPath(registry, locale.code, location);
  const indexable = resolved.available && matchedListings.length > 0;
  const copy = locationPageCopy(locale.code, localizedLocationValue(locale.code, location));
  const contextGuide = indexable
    ? approvedContentDocumentsForLocation(readApprovedCmsContent(), location, locale.code)[0]
    : null;
  const context = contextGuide?.facts?.[0]
    ? {
        href: contextGuide.path,
        title: contextGuide.title,
        summary: contextGuide.facts[0],
      }
    : null;
  const locales = publicIndexableLocales(registry)
    .filter((candidate) =>
      listings.some((listing) => {
        const view = listingToPublicViewModel(listing);
        return norm(view.location) === norm(location) && isActiveListing(listing) && indexableListingForLocale(registry, listing, candidate);
      }),
    )
    .map((candidate) => candidate.code);

  return {
    kind: "location",
    status: indexable ? 200 : 404,
    requested_locale: localeCode,
    locale: locale.code,
    lang: locale.code,
    dir: locale.direction,
    path,
    canonical: path,
    indexable,
    metadata: {
      title: copy.title,
      description: copy.description,
      robots: indexable ? "index,follow" : "noindex,follow",
    },
    hreflang: indexable ? hreflangForLocation(registry, location, locales) : [],
    chrome: publicChrome(registry, locale, { hreflang: indexable ? hreflangForLocation(registry, location, locales) : [], active: "location" }),
    body: {
      h1: copy.heading,
      location,
      listing_count: matchedListings.length,
      ...(context ? { context } : {}),
    },
    cards: matchedListings.slice(0, 12).map((listing) => listingCard(registry, listing, locale)),
  };
}

export function renderSellerPage({ registry, localeCode }) {
  const resolved = resolvePublicLocale(registry, localeCode);
  const locale = resolved.locale;
  const path = sellerPath(registry, locale.code);
  const labels = labelsFor(locale.code);
  const copy = sellerCopy(locale.code);

  return {
    kind: "seller",
    status: 200,
    requested_locale: localeCode,
    locale: locale.code,
    lang: locale.code,
    dir: locale.direction,
    path,
    canonical: path,
    indexable: resolved.available,
    metadata: {
      title: copy.title,
      description: copy.description,
      robots: resolved.available ? "index,follow" : "noindex,follow",
    },
    hreflang: resolved.available ? hreflangForSeller(registry) : [],
    chrome: publicChrome(registry, locale, { hreflang: resolved.available ? hreflangForSeller(registry) : [], active: "seller" }),
    body: {
      h1: copy.h1,
      intro: copy.description,
      valuation: {
        endpoint: "/api/leads",
        method: "POST",
        minimum_tap_target_px: 44,
        required_fields: ["contact.name", "contact.phone", "property.location", "property.type", "message"],
        payload: {
          source: "website_seller_valuation",
          intent: "valuation",
          leadType: "seller",
          language: locale.code,
          contact_preference: "phone",
        },
        label: labels.valuation,
      },
      callback: {
        endpoint: "/api/leads",
        method: "POST",
        payload: {
          source: "website_seller_callback",
          leadType: "seller",
          language: locale.code,
          contact_preference: "phone",
        },
        label: labels.callback,
      },
    },
  };
}

export function renderLanguageFallback({ registry, requestedLocale }) {
  const resolved = resolvePublicLocale(registry, requestedLocale);
  return {
    kind: "language_fallback",
    status: 200,
    chrome: publicChrome(registry, resolved.locale, { active: null }),
    requested_locale: requestedLocale,
    requested_path: `/${requestedLocale}/`,
    locale: resolved.locale.code,
    lang: resolved.locale.code,
    dir: resolved.locale.direction,
    path: `/${resolved.locale.code}/`,
    canonical: `/${resolved.locale.code}/`,
    indexable: false,
    metadata: {
      title: "MS Realty language request",
      description: "Fallback route for languages that are not yet reviewed and approved for indexing.",
      robots: "noindex,follow",
    },
    request_language_available: true,
    public_translation_available: resolved.available,
  };
}

export function renderAdminShell({ registry, requestedLocale = "en" }) {
  const allowed = adminLocales(registry);
  const selectedCode = allowed.includes(requestedLocale) ? requestedLocale : "en";
  const selected = getLocale(registry, selectedCode);
  const surface = adminSurfaceCatalog(registry, requestedLocale);

  return {
    kind: "admin_shell",
    status: 200,
    requested_locale: requestedLocale,
    locale: selected.code,
    lang: selected.code,
    dir: selected.direction,
    path: "/admin",
    modules: ["crm", "cms"],
    localized_surface: surface,
    interface_locales: allowed.map((code) => {
      const locale = getLocale(registry, code);
      return {
        code: locale.code,
        native_name: locale.native_name,
        admin_name: locale.admin_name,
        direction: locale.direction,
      };
    }),
    website_locales: publicIndexableLocales(registry).map((locale) => locale.code),
    website_language_coverage: websiteLanguageCoverage(registry),
    language_policy: {
      lead_language: "dynamic_bcp47",
      broker_assignment_uses_language_skills: true,
      hermes_reply_drafts_require_broker_approval: true,
      cms_translations_require_human_approval_before_indexing: true,
    },
  };
}
