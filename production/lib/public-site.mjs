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
import { publicMediaLibrary } from "./media.mjs";
import { buildListingSchema } from "./structured-data.mjs";
import { publicTour } from "./tours.mjs";

const ACTION_LABELS = {
  bg: {
    inquiry: "Запитване",
    valuation: "Оценка за продавач",
    callback: "Обратно обаждане",
    viewing: "Оглед",
    phone: "Телефон",
    save: "Запази",
    share: "Сподели",
    print: "Печат/PDF",
    results: "Назад към резултатите",
    search: "Търсене",
    contact: "Контакт",
    primaryActions: "Основни действия",
    locations: "Локации",
    featuredListings: "Избрани имоти",
    searchResultActions: "Действия за резултат",
    photos: "снимки",
    location: "Локация",
    propertyType: "Тип",
    sort: "Сортиране",
    view: "Изглед",
    saveSearch: "Запази търсенето",
    activeFilters: "Активни филтри",
    searchResults: "Резултати от търсене",
    matches: "съвпадения",
    reviewedListings: "проверени обяви",
    locationListings: "Имоти в локацията",
    saveAndShare: "Запази и сподели",
    listingActions: "Действия за имота",
    brokerContact: "Контакт с брокер",
    listingSummary: "Обобщение на имота",
    listingContent: "Съдържание на имота",
    listingMediaFacts: "Медия и факти за имота",
    listingMedia: "Медия на имота",
    gallery: "Галерия",
    tour360: "360 тур",
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
    message: "Съобщение",
    contactActions: "Действия за контакт",
    sellerValuation: "Оценка за продавач",
    requestLanguage: "Заяви този език",
    askInLanguage: "Попитай на този език",
    guideActions: "Действия за ръководството",
    factLabels: { location: "Локация", property_type: "Тип", offer_type: "Оферта", bedrooms: "Спални" },
  },
  en: {
    inquiry: "Inquiry",
    valuation: "Seller valuation",
    callback: "Callback",
    viewing: "Viewing",
    phone: "Phone",
    save: "Save",
    share: "Share",
    print: "Print/PDF",
    results: "Back to results",
    search: "Search",
    contact: "Contact",
    primaryActions: "Primary actions",
    locations: "Locations",
    featuredListings: "Featured listings",
    searchResultActions: "Search result actions",
    photos: "photos",
    location: "Location",
    propertyType: "Type",
    sort: "Sort",
    view: "View",
    saveSearch: "Save search",
    activeFilters: "Active filters",
    searchResults: "Search results",
    matches: "matches",
    reviewedListings: "reviewed listings",
    locationListings: "Location listings",
    saveAndShare: "Save and share",
    listingActions: "Listing actions",
    brokerContact: "Broker contact",
    listingSummary: "Listing summary",
    listingContent: "Listing content",
    listingMediaFacts: "Listing media and facts",
    listingMedia: "Listing media",
    gallery: "Gallery",
    tour360: "360 tour",
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
    message: "Message",
    contactActions: "Contact actions",
    sellerValuation: "Seller valuation",
    requestLanguage: "Request this language",
    askInLanguage: "Ask in this language",
    guideActions: "Guide actions",
    factLabels: { location: "Location", property_type: "Type", offer_type: "Offer", bedrooms: "Bedrooms" },
  },
  de: {
    inquiry: "Anfrage",
    valuation: "Verkaufsbewertung",
    callback: "Rückruf",
    viewing: "Besichtigung",
    phone: "Telefon",
    save: "Speichern",
    share: "Teilen",
    print: "Drucken/PDF",
    results: "Zurück zu den Ergebnissen",
    search: "Suchen",
    contact: "Kontakt",
    primaryActions: "Hauptaktionen",
    locations: "Orte",
    featuredListings: "Empfohlene Immobilien",
    searchResultActions: "Aktionen zum Suchergebnis",
    photos: "Fotos",
    location: "Ort",
    propertyType: "Typ",
    sort: "Sortieren",
    view: "Ansicht",
    saveSearch: "Suche speichern",
    activeFilters: "Aktive Filter",
    searchResults: "Suchergebnisse",
    matches: "Treffer",
    reviewedListings: "geprüfte Anzeigen",
    locationListings: "Immobilien am Ort",
    saveAndShare: "Speichern und teilen",
    listingActions: "Immobilienaktionen",
    brokerContact: "Maklerkontakt",
    listingSummary: "Immobilienübersicht",
    listingContent: "Immobilieninhalt",
    listingMediaFacts: "Medien und Fakten",
    listingMedia: "Immobilienmedien",
    gallery: "Galerie",
    tour360: "360-Tour",
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
    message: "Nachricht",
    contactActions: "Kontaktaktionen",
    sellerValuation: "Verkaufsbewertung",
    requestLanguage: "Diese Sprache anfragen",
    askInLanguage: "In dieser Sprache fragen",
    guideActions: "Ratgeberaktionen",
    factLabels: { location: "Ort", property_type: "Typ", offer_type: "Angebot", bedrooms: "Schlafzimmer" },
  },
  nl: {
    inquiry: "Aanvraag",
    valuation: "Verkoopwaardering",
    callback: "Terugbellen",
    viewing: "Bezichtiging",
    phone: "Telefoon",
    save: "Bewaren",
    share: "Delen",
    print: "Print/PDF",
    results: "Terug naar resultaten",
    search: "Zoeken",
    contact: "Contact",
    primaryActions: "Primaire acties",
    locations: "Locaties",
    featuredListings: "Uitgelichte objecten",
    searchResultActions: "Acties voor zoekresultaat",
    photos: "foto's",
    location: "Locatie",
    propertyType: "Type",
    sort: "Sorteren",
    view: "Weergave",
    saveSearch: "Zoekopdracht bewaren",
    activeFilters: "Actieve filters",
    searchResults: "Zoekresultaten",
    matches: "resultaten",
    reviewedListings: "beoordeelde objecten",
    locationListings: "Objecten op locatie",
    saveAndShare: "Bewaren en delen",
    listingActions: "Objectacties",
    brokerContact: "Makelaarscontact",
    listingSummary: "Objectoverzicht",
    listingContent: "Objectinhoud",
    listingMediaFacts: "Media en feiten",
    listingMedia: "Objectmedia",
    gallery: "Galerij",
    tour360: "360-tour",
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
    message: "Bericht",
    contactActions: "Contactacties",
    sellerValuation: "Verkoopwaardering",
    requestLanguage: "Vraag deze taal aan",
    askInLanguage: "Vraag in deze taal",
    guideActions: "Gidsacties",
    factLabels: { location: "Locatie", property_type: "Type", offer_type: "Aanbod", bedrooms: "Slaapkamers" },
  },
  ru: {
    inquiry: "Запрос",
    valuation: "Оценка для продавца",
    callback: "Обратный звонок",
    viewing: "Просмотр",
    phone: "Телефон",
    save: "Сохранить",
    share: "Поделиться",
    print: "Печать/PDF",
    results: "Назад к результатам",
    search: "Поиск",
    contact: "Контакт",
    primaryActions: "Основные действия",
    locations: "Локации",
    featuredListings: "Рекомендуемые объекты",
    searchResultActions: "Действия с результатом",
    photos: "фото",
    location: "Локация",
    propertyType: "Тип",
    sort: "Сортировка",
    view: "Вид",
    saveSearch: "Сохранить поиск",
    activeFilters: "Активные фильтры",
    searchResults: "Результаты поиска",
    matches: "совпадений",
    reviewedListings: "проверенных объявлений",
    locationListings: "Объекты в локации",
    saveAndShare: "Сохранить и поделиться",
    listingActions: "Действия с объектом",
    brokerContact: "Контакт брокера",
    listingSummary: "Сводка объекта",
    listingContent: "Содержание объекта",
    listingMediaFacts: "Медиа и факты объекта",
    listingMedia: "Медиа объекта",
    gallery: "Галерея",
    tour360: "360 тур",
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
    message: "Сообщение",
    contactActions: "Действия контакта",
    sellerValuation: "Оценка для продавца",
    requestLanguage: "Запросить этот язык",
    askInLanguage: "Спросить на этом языке",
    guideActions: "Действия руководства",
    factLabels: { location: "Локация", property_type: "Тип", offer_type: "Предложение", bedrooms: "Спальни" },
  },
  el: {
    inquiry: "Ερώτηση",
    valuation: "Εκτίμηση πωλητή",
    callback: "Επανάκληση",
    viewing: "Ραντεβού προβολής",
    phone: "Τηλέφωνο",
    save: "Αποθήκευση",
    share: "Κοινή χρήση",
    print: "Εκτύπωση/PDF",
    results: "Πίσω στα αποτελέσματα",
    search: "Αναζήτηση",
    contact: "Επικοινωνία",
    primaryActions: "Κύριες ενέργειες",
    locations: "Τοποθεσίες",
    featuredListings: "Προτεινόμενα ακίνητα",
    searchResultActions: "Ενέργειες αποτελέσματος",
    photos: "φωτογραφίες",
    location: "Τοποθεσία",
    propertyType: "Τύπος",
    sort: "Ταξινόμηση",
    view: "Προβολή",
    saveSearch: "Αποθήκευση αναζήτησης",
    activeFilters: "Ενεργά φίλτρα",
    searchResults: "Αποτελέσματα αναζήτησης",
    matches: "αποτελέσματα",
    reviewedListings: "ελεγμένες αγγελίες",
    locationListings: "Ακίνητα τοποθεσίας",
    saveAndShare: "Αποθήκευση και κοινή χρήση",
    listingActions: "Ενέργειες ακινήτου",
    brokerContact: "Επικοινωνία με μεσίτη",
    listingSummary: "Σύνοψη ακινήτου",
    listingContent: "Περιεχόμενο ακινήτου",
    listingMediaFacts: "Μέσα και στοιχεία ακινήτου",
    listingMedia: "Μέσα ακινήτου",
    gallery: "Συλλογή",
    tour360: "360 περιήγηση",
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
    message: "Μήνυμα",
    contactActions: "Ενέργειες επικοινωνίας",
    sellerValuation: "Εκτίμηση πωλητή",
    requestLanguage: "Ζητήστε αυτή τη γλώσσα",
    askInLanguage: "Ρωτήστε σε αυτή τη γλώσσα",
    guideActions: "Ενέργειες οδηγού",
    factLabels: { location: "Τοποθεσία", property_type: "Τύπος", offer_type: "Προσφορά", bedrooms: "Υπνοδωμάτια" },
  },
  he: {
    inquiry: "פנייה",
    valuation: "הערכת מוכר",
    callback: "שיחה חוזרת",
    viewing: "תיאום סיור",
    phone: "טלפון",
    save: "שמירה",
    share: "שיתוף",
    print: "הדפסה/PDF",
    results: "חזרה לתוצאות",
    search: "חיפוש",
    contact: "יצירת קשר",
    primaryActions: "פעולות ראשיות",
    locations: "אזורים",
    featuredListings: "נכסים מובילים",
    searchResultActions: "פעולות תוצאה",
    photos: "תמונות",
    location: "מיקום",
    propertyType: "סוג",
    sort: "מיון",
    view: "תצוגה",
    saveSearch: "שמירת חיפוש",
    activeFilters: "מסננים פעילים",
    searchResults: "תוצאות חיפוש",
    matches: "תוצאות",
    reviewedListings: "נכסים מאושרים",
    locationListings: "נכסים באזור",
    saveAndShare: "שמירה ושיתוף",
    listingActions: "פעולות נכס",
    brokerContact: "יצירת קשר עם מתווך",
    listingSummary: "תקציר נכס",
    listingContent: "תוכן נכס",
    listingMediaFacts: "מדיה ופרטי נכס",
    listingMedia: "מדיית נכס",
    gallery: "גלריה",
    tour360: "סיור 360",
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
    message: "הודעה",
    contactActions: "פעולות קשר",
    sellerValuation: "הערכת מוכר",
    requestLanguage: "בקשת שפה זו",
    askInLanguage: "שאלה בשפה זו",
    guideActions: "פעולות מדריך",
    factLabels: { location: "מיקום", property_type: "סוג", offer_type: "הצעה", bedrooms: "חדרי שינה" },
  },
};

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

export function labelsFor(localeCode) {
  return ACTION_LABELS[localeCode] || ACTION_LABELS.en;
}

function descriptionFor(listing) {
  return listing.description || listing.h1 || listing.title || `MS Realty listing ${listing.id}`;
}

function localizedCopy(localeCode, view) {
  const template = PUBLIC_COPY[localeCode];
  if (!template || localeCode === view.source_locale) {
    return {
      title: view.title,
      h1: view.h1,
      description: descriptionFor(view),
    };
  }
  const title = template.title(view);
  return {
    title,
    h1: title,
    description: template.description(view),
  };
}

function guideDescription(documents) {
  return documents
    .flatMap((doc) => doc.facts || [])
    .join(" ")
    .slice(0, 240);
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
  const verified = state.indexable || view.source_locale === locale.code || listing.locale === locale.code;
  return {
    id: listing.id,
    title: copy.title,
    path: listingPath(registry, locale.code, listing.id),
    review_badge: verified ? "verified_inventory" : "source_locale_fallback",
    translation_display: state.display,
    translation_locale: state.translation?.locale || locale.code,
    translation_status: state.translation?.status || "missing",
    translation_indexable: state.indexable,
    translation_human_approved: state.translation?.human_approved === true,
    source_locale: listing.locale,
    location: view.location,
    property_type: view.property_type,
    offer_type: view.offer_type,
    bedrooms: view.bedrooms,
    bedrooms_not_applicable: view.bedrooms_not_applicable,
    price_eur: view.price_eur,
    price_on_request: view.price_on_request,
    listing_status: view.listing_status,
    listing_active: isActiveListing(listing),
    image_count: Number(listing.image_count || 0),
    thumbnail: view.thumbnail_url
      ? {
          url: view.thumbnail_url,
          alt: view.thumbnail_alt || copy.title,
        }
      : null,
    actions: {
      detail: { label: "Details", href: listingPath(registry, locale.code, listing.id) },
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
        endpoint: "/api/saved-searches",
        storage_key: "ms-realty:saved-listings",
        listing_id: listing.id,
      },
    },
  };
}

function indexableListingForLocale(registry, listing, locale) {
  return searchTranslationState(registry, listing, locale).indexable;
}

function locationNamesFromListings(listings) {
  return [...new Set(listings.map((listing) => listingToPublicViewModel(listing).location).filter(Boolean))].sort();
}

function norm(value) {
  return String(value ?? "").toLocaleLowerCase();
}

function queryTokens(query) {
  return norm(query).split(/\s+/).filter(Boolean);
}

function searchableText(view) {
  return norm([view.id, view.title, view.h1, view.description, view.location, view.property_type, view.offer_type].join(" "));
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
  if (!queryTokens(query).every((token) => text.includes(token))) return false;
  if (filters.location && !norm(view.location).includes(norm(filters.location))) return false;
  if (filters.property_type && norm(view.property_type) !== norm(filters.property_type)) return false;
  if (filters.offer_type && norm(view.offer_type) !== norm(filters.offer_type)) return false;
  if (filters.status && norm(view.listing_status) !== norm(filters.status)) return false;
  if (!numberFilter(view.price_eur, filters.price_min, filters.price_max)) return false;
  if (!numberFilter(view.bedrooms, filters.bedrooms_min, undefined)) return false;
  return true;
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
  const copy = localizedCopy(locale.code, view);
  const publicMedia = publicMediaLibrary(view.media);

  return {
    kind: "listing",
    status: 200,
    requested_locale: localeCode,
    locale: locale.code,
    lang: locale.code,
    dir: locale.direction,
    path,
    canonical: path,
    indexable,
    fallback: {
      active: !resolved.available,
      requested_locale: localeCode,
      resolved_locale: locale.code,
    },
    metadata: {
      title: copy.title,
      description: copy.description,
      robots: indexable ? "index,follow" : "noindex,follow",
    },
    hreflang,
    schema: buildListingSchema({ path, view, copy, publicMedia }),
    translation: {
      locale: translation?.locale || locale.code,
      status: translation?.status || "missing",
      human_approved: translation?.human_approved === true,
      reviewer: translation?.reviewer || null,
    },
    body: {
      h1: copy.h1,
      description: descriptionFor(view),
      facts: {
        id: view.id,
        location: view.location,
        property_type: view.property_type,
        offer_type: view.offer_type,
        bedrooms: view.bedrooms,
        price_eur: view.price_eur,
        price_on_request: view.price_on_request,
        listing_status: view.listing_status,
        image_count: view.image_count,
      },
      lifecycle: {
        status: view.listing_status,
        active_in_search: isActiveListing(listing),
        seo_kept_live: true,
      },
      quality_flags: {
        bedrooms_not_applicable: view.bedrooms_not_applicable === true,
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
      related_listings: relatedListings
        .filter((candidate) => candidate.id !== listing.id && isActiveListing(candidate))
        .slice(0, 3)
        .map((candidate) => listingCard(registry, candidate, locale)),
      source: {
        old_url: view.source_url,
        source_domain: view.source_domain,
        source_locale: view.source_locale,
        source_title: view.title,
      },
    },
  };
}

export function renderSearchPage({ registry, localeCode, listings, query = "", filters = {} }) {
  const resolved = resolvePublicLocale(registry, localeCode);
  const locale = resolved.locale;
  const activeListings = listings.filter(isActiveListing);
  const localeMatches = activeListings.filter((listing) => listing.locale === locale.code);
  const fallbackMatches = activeListings.filter(
    (listing) => listing.locale === (locale.fallback_locale || registry.source_locale) || listing.locale === registry.source_locale,
  );
  const matchedListings = (localeMatches.length ? localeMatches : fallbackMatches).filter((listing) =>
    matchesSearch(listingToPublicViewModel(listing), query, filters),
  );
  const cards = matchedListings.slice(0, 12).map((listing) => listingCard(registry, listing, locale));
  const activeFilterChips = ["location", "property_type", "offer_type", "price_min", "price_max", "bedrooms_min", "status"]
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
    indexable: resolved.available,
    metadata: {
      title: "MS Realty property search",
      description: "Locale-scoped property search backed by reviewed MS Realty inventory.",
      robots: resolved.available ? "index,follow" : "noindex,follow",
    },
    mobile_policy: {
      list_first_mobile: true,
      map_optional: true,
      sticky_contact_actions: true,
      minimum_tap_target_px: 44,
    },
    search: {
      engines: ["typesense", "meilisearch"],
      query,
      filters: {
        locale: locale.code,
        public_enabled: true,
        indexable: true,
        ...filters,
      },
      total_matches: matchedListings.length,
      returned: cards.length,
      controls: {
        view_modes: [
          { id: "list", label: "List", default: true },
          { id: "map", label: "Map", optional: true },
        ],
        sort_options: [
          { id: "recommended", label: "Recommended", default: true },
          { id: "newest", label: "Newest" },
          { id: "price_asc", label: "Price low to high" },
          { id: "price_desc", label: "Price high to low" },
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
      },
      fallback: {
        enabled: true,
        locale: locale.fallback_locale || registry.source_locale,
        label: "fallback_source_locale",
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
      return page.indexable ? { location, path: page.path, listing_count: page.body.listing_count } : null;
    })
    .filter(Boolean);

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
    body: {
      h1: copy.h1,
      intro: copy.description,
      search: {
        path: search.path,
        endpoint: "/api/search",
        method: "GET",
        query_param: "q",
      },
      seller: {
        path: sellerPath(registry, locale.code),
        label: labelsFor(locale.code).valuation,
      },
      contact: {
        path: contactPath(registry, locale.code),
        label: labelsFor(locale.code).callback,
      },
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
    body: {
      h1: copy.h1,
      intro: copy.description,
      callback: {
        endpoint: "/api/leads",
        method: "POST",
        minimum_tap_target_px: 44,
        required_fields: ["contact.name", "message"],
        payload: {
          source: "website_contact_callback",
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
  const docs = documents.filter((doc) => doc.status === "approved" && doc.locale === locale.code);
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
    schema: indexable ? guideSchema({ path, locale, documents: docs }) : null,
    body: {
      h1: first.title,
      intro: description,
      sections: docs.map((doc) => ({
        id: doc.id,
        title: doc.title,
        facts: doc.facts,
        reviewer: doc.reviewer,
      })),
      ctas: {
        search: { path: `/${locale.code}/${locale.route_segments.search}` },
        seller: { path: sellerPath(registry, locale.code) },
        contact: { path: contactPath(registry, locale.code) },
      },
    },
  };
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
      title: `MS Realty properties in ${location}`,
      description: `Reviewed MS Realty property inventory for ${location}.`,
      robots: indexable ? "index,follow" : "noindex,follow",
    },
    hreflang: indexable ? hreflangForLocation(registry, location, locales) : [],
    body: {
      h1: `Properties in ${location}`,
      location,
      listing_count: matchedListings.length,
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
    body: {
      h1: copy.h1,
      intro: copy.description,
      valuation: {
        endpoint: "/api/leads",
        method: "POST",
        minimum_tap_target_px: 44,
        required_fields: ["contact.name", "message"],
        payload: {
          source: "website_seller_valuation",
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
    requested_locale: requestedLocale,
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
    hermes_chat_available: true,
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
