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
  hreflangForStart,
  homePath,
  isTranslationIndexable,
  listingPath,
  locationPath,
  matchesPublicLocationScope,
  publicLocationNames,
  sellerPath,
  startPath,
} from "./seo.mjs";
import { approvedTranslationRecordsForListing, listingToPublicViewModel } from "./content.mjs";
import { isLeadDurableStoreEnabled, leadDurableStoreConfigFromEnv } from "./lead-durable-store.mjs";
import {
  geographyRegistryAncestors,
  geographyRegistryArea,
  loadAreaMap,
  loadGeographyCatalog,
  loadGeographyRegistry,
} from "./geography.mjs";
import {
  approvedContentDocumentsForLocation,
  approvedContentGuideGroups,
  isPublishableGuide,
  readApprovedCmsContent,
} from "./approved-content.mjs";
import { publicMediaLibrary } from "./media.mjs";
import { isPublicBrokerContact } from "./broker-contacts.mjs";
import { buildListingSchema } from "./structured-data.mjs";
import { publicTour } from "./tours.mjs";
import { CANONICAL_PROPERTY_FAMILIES, isFactApplicable } from "./listing-facts.mjs";
import { normalizeSearchIntent, searchIntentToQueryFilters } from "./search-intent.mjs";

const APPROVED_GUIDE_GROUPS = approvedContentGuideGroups(readApprovedCmsContent());
const GEOGRAPHY_CATALOG = loadGeographyCatalog();
const AREA_MAP = loadAreaMap();
let publicGeographyRegistryCache = null;

function publicGeographyRegistry() {
  publicGeographyRegistryCache ||= loadGeographyRegistry();
  return publicGeographyRegistryCache;
}

const ACTION_LABELS = {
  bg: {
    min: "Мин.",
    max: "Макс.",
    price: "Цена",
    maxPrice: "Макс. цена",
    minPrice: "Мин. цена",
    moreFilters: "Още филтри",
    fewerFilters: "По-малко филтри",
    locationPlaceholder: "Град, село или област",
    applyFilters: "Покажи резултатите",
    allOffers: "Всички",
    browse: "Разгледайте",
    perMonth: "на месец",
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
    keywordSearch: "Ключови думи или референция",
    contact: "Контакт",
    primaryActions: "Основни действия",
    locations: "Локации",
    featuredListings: "Избрани имоти",
    searchResultActions: "Действия за резултат",
    photo: "снимка",
    photos: "снимки",
    location: "Локация",
    country: "Държава",
    region: "Регион / област",
    locationSearchHint: "Град, село, община или област",
    locationSuggestions: "Предложения за локация",
    noLocations: "Няма намерени локации.",
    municipality: "Община",
    district: "Област",
    propertyType: "Тип",
    propertySubtype: "Подтип",
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
    languageUnavailable: "Този език все още не е наличен",
    languageUnavailableText: "MS Realty е достъпен на български, английски, немски, нидерландски, руски, гръцки и иврит. Изберете някой от тях по-горе или заявете този език и ще ви уведомим, когато е готов.",
    languageRequestSent: "Благодарим. Ще ви уведомим, когато този език е готов.",
    browseByArea: "Разгледайте по район",
    howBuyingWorks: "Как протича покупката",
    buyingStepOneTitle: "Кажете ни какво търсите",
    buyingStepOneText: "Район, бюджет и вид имот, който търсите.",
    buyingStepTwoTitle: "Получете подбор от брокер",
    buyingStepTwoText: "Местен брокер подбира подходящи имоти и проверява фактите заедно с вас.",
    buyingStepThreeTitle: "Огледайте и купете с уредени местни документи",
    buyingStepThreeText: "Организираме огледите и ви водим през местната процедура на вашия език.",
    startSearch: "Започнете търсенето",
    trustReviewed: "Всеки факт за имота се проверява от човек, преди да бъде публикуван",
    trustLanguages: "7 езика и брокери, които говорят вашия",
    trustOffices: "Местни офиси",
    whatHappensNext: "Какво следва",
    sellerNextOneTitle: "Местен брокер ви се обажда",
    sellerNextOneText: "Уточняваме данните за имота и отговаряме на въпросите ви.",
    sellerNextTwoTitle: "Договаряте реалистична цена",
    sellerNextTwoText: "Брокерът преглежда имота заедно с вас. Няма автоматична оценка.",
    sellerNextThreeTitle: "Обявата излиза след проверка",
    sellerNextThreeText: "Фактите и снимките се проверяват от човек, преди да публикуваме.",
    sellerPromise: "Местен брокер преглежда имота ви и ви се обажда с реалистична оценка, а не с автоматично изчисление.",
    stepOf: "Стъпка {n} от {total}",
    sellerStepOneQuestion: "Разкажете ни за имота",
    sellerStepTwoQuestion: "Как да се свърже брокерът с вас?",
    sellerStepThreeQuestion: "Проверете и изпратете",
    contactFormTitle: "Пишете ни или заявете обратно обаждане",
    contactTopic: "За какво става дума",
    topicBuying: "Покупка на имот",
    topicRenting: "Наем на имот",
    topicSelling: "Продажба или отдаване на моя имот",
    topicOther: "Друго",
    callOrMessage: "Обадете се или ни пишете",
    ourOffices: "Нашите офиси",
    openMap: "Отвори картата",
    propertiesIn: "Имоти в {area}",
    onThisPage: "На тази страница",
    askBroker: "Попитайте брокер",
    askBrokerText: "Имате въпроси по това ръководство? Брокер отговаря на вашия език.",
    relatedGuides: "Свързани ръководства",
    notFoundTitle: "Не открихме тази страница",
    notFoundText: "Връзката може да е стара или сгрешена. Потърсете актуалните обяви или ни се обадете.",
    goHome: "Към началната страница",
    guidesUnavailable: "Ръководствата за купувачи още не са налични на този език.",
    guidesInEnglish: "Прочетете ги на английски",
    areasEmpty: "Още няма райони за разглеждане.",
    emailOptional: "Имейл (по избор)",
    addPhotos: "Добавете снимки",
    photosUnavailable: "Качването на снимки още не е налично.",
    guideActions: "Действия за ръководството",
    factLabels: { location: "Локация", property_type: "Тип", offer_type: "Оферта", bedrooms: "Спални", premises: "Помещения", hotel_rooms: "Хотелски стаи", storeys: "Етажи", floor: "Етаж", land_area_sqm: "Площ на парцела", condition: "Състояние", location_precision: "Локация" },
  },
  en: {
    min: "Min",
    max: "Max",
    price: "Price",
    maxPrice: "Max price",
    minPrice: "Min price",
    moreFilters: "More filters",
    fewerFilters: "Fewer filters",
    locationPlaceholder: "City, town or region",
    applyFilters: "Show results",
    allOffers: "All",
    browse: "Browse",
    perMonth: "per month",
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
    keywordSearch: "Keywords or reference",
    contact: "Contact",
    primaryActions: "Primary actions",
    locations: "Locations",
    featuredListings: "Featured listings",
    searchResultActions: "Search result actions",
    photo: "photo",
    photos: "photos",
    location: "Location",
    country: "Country",
    region: "Region / district",
    locationSearchHint: "City, town, municipality or region",
    locationSuggestions: "Location suggestions",
    noLocations: "No locations found.",
    municipality: "Municipality",
    district: "District",
    propertyType: "Type",
    propertySubtype: "Subtype",
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
    languageUnavailable: "This language is not available yet",
    languageUnavailableText: "MS Realty is available in Bulgarian, English, German, Dutch, Russian, Greek and Hebrew. Pick one of them above, or request this language and we will tell you when it is ready.",
    languageRequestSent: "Thank you. We will let you know when this language is ready.",
    browseByArea: "Browse by area",
    howBuyingWorks: "How buying works",
    buyingStepOneTitle: "Tell us what you want",
    buyingStepOneText: "Area, budget and the kind of property you are looking for.",
    buyingStepTwoTitle: "Get a broker shortlist",
    buyingStepTwoText: "A local broker picks matching properties and checks the facts with you.",
    buyingStepThreeTitle: "View and buy with local paperwork done",
    buyingStepThreeText: "We arrange viewings and walk you through the local process in your language.",
    startSearch: "Start your search",
    trustReviewed: "Every listing fact is reviewed by a person before it goes live",
    trustLanguages: "7 languages and brokers who speak yours",
    trustOffices: "Local offices",
    whatHappensNext: "What happens next",
    sellerNextOneTitle: "A local broker calls you back",
    sellerNextOneText: "We confirm the details of your property and answer your questions.",
    sellerNextTwoTitle: "You agree a realistic asking price",
    sellerNextTwoText: "The broker reviews your property with you. There is no automated estimate.",
    sellerNextThreeTitle: "Your listing goes live after review",
    sellerNextThreeText: "Facts and photos are checked by a person before we publish.",
    sellerPromise: "A local broker reviews your property and calls you back with a realistic valuation, not an automated estimate.",
    stepOf: "Step {n} of {total}",
    sellerStepOneQuestion: "Tell us about your property",
    sellerStepTwoQuestion: "How can the broker reach you?",
    sellerStepThreeQuestion: "Check and send",
    contactFormTitle: "Send a message or request a callback",
    contactTopic: "What is it about",
    topicBuying: "Buying a property",
    topicRenting: "Renting a property",
    topicSelling: "Selling or letting my property",
    topicOther: "Something else",
    callOrMessage: "Call or message us",
    ourOffices: "Our offices",
    openMap: "Open map",
    propertiesIn: "Properties in {area}",
    onThisPage: "On this page",
    askBroker: "Ask a broker",
    askBrokerText: "Questions about this guide? A broker answers in your language.",
    relatedGuides: "Related guides",
    notFoundTitle: "We could not find that page",
    notFoundText: "The link may be old or mistyped. Search the current listings or call us.",
    goHome: "Go to the home page",
    guidesUnavailable: "Buyer guides are not available in this language yet.",
    guidesInEnglish: "Read them in English",
    areasEmpty: "There are no areas to browse yet.",
    emailOptional: "Email (optional)",
    addPhotos: "Add photos",
    photosUnavailable: "Photo upload is not available yet.",
    guideActions: "Guide actions",
    factLabels: { location: "Location", property_type: "Type", offer_type: "Offer", bedrooms: "Bedrooms", premises: "Premises", hotel_rooms: "Hotel rooms", storeys: "Storeys", floor: "Floor", land_area_sqm: "Land area", condition: "Condition", location_precision: "Location" },
  },
  de: {
    min: "Min.",
    max: "Max.",
    price: "Preis",
    maxPrice: "Max. Preis",
    minPrice: "Min. Preis",
    moreFilters: "Weitere Filter",
    fewerFilters: "Weniger Filter",
    locationPlaceholder: "Stadt, Ort oder Region",
    applyFilters: "Ergebnisse anzeigen",
    allOffers: "Alle",
    browse: "Stöbern",
    perMonth: "pro Monat",
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
    keywordSearch: "Suchbegriff oder Referenz",
    contact: "Kontakt",
    primaryActions: "Hauptaktionen",
    locations: "Orte",
    featuredListings: "Empfohlene Immobilien",
    searchResultActions: "Aktionen zum Suchergebnis",
    photo: "Foto",
    photos: "Fotos",
    location: "Ort",
    country: "Land",
    region: "Region / Bezirk",
    locationSearchHint: "Stadt, Ort, Gemeinde oder Region",
    locationSuggestions: "Ortsvorschläge",
    noLocations: "Keine Orte gefunden.",
    municipality: "Gemeinde",
    district: "Verwaltungsbezirk",
    propertyType: "Typ",
    propertySubtype: "Untertyp",
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
    languageUnavailable: "Diese Sprache ist noch nicht verfügbar",
    languageUnavailableText: "MS Realty gibt es auf Bulgarisch, Englisch, Deutsch, Niederländisch, Russisch, Griechisch und Hebräisch. Wählen Sie oben eine davon oder fordern Sie diese Sprache an, und wir sagen Ihnen Bescheid, sobald sie bereit ist.",
    languageRequestSent: "Vielen Dank. Wir melden uns, sobald diese Sprache bereit ist.",
    browseByArea: "Nach Gebiet stöbern",
    howBuyingWorks: "So läuft der Kauf ab",
    buyingStepOneTitle: "Sagen Sie uns, was Sie suchen",
    buyingStepOneText: "Gebiet, Budget und die Art der Immobilie, die Sie suchen.",
    buyingStepTwoTitle: "Erhalten Sie eine Auswahl vom Makler",
    buyingStepTwoText: "Ein lokaler Makler wählt passende Immobilien aus und prüft die Fakten mit Ihnen.",
    buyingStepThreeTitle: "Besichtigen und kaufen, mit erledigtem Papierkram vor Ort",
    buyingStepThreeText: "Wir organisieren Besichtigungen und begleiten Sie in Ihrer Sprache durch das lokale Verfahren.",
    startSearch: "Suche starten",
    trustReviewed: "Jede Angabe zu einer Immobilie wird vor der Veröffentlichung von einer Person geprüft",
    trustLanguages: "7 Sprachen und Makler, die Ihre sprechen",
    trustOffices: "Lokale Büros",
    whatHappensNext: "Wie es weitergeht",
    sellerNextOneTitle: "Ein lokaler Makler ruft Sie zurück",
    sellerNextOneText: "Wir klären die Details Ihrer Immobilie und beantworten Ihre Fragen.",
    sellerNextTwoTitle: "Sie vereinbaren einen realistischen Angebotspreis",
    sellerNextTwoText: "Der Makler bespricht Ihre Immobilie mit Ihnen. Es gibt keine automatische Schätzung.",
    sellerNextThreeTitle: "Ihr Inserat geht nach der Prüfung online",
    sellerNextThreeText: "Fakten und Fotos werden vor der Veröffentlichung von einer Person geprüft.",
    sellerPromise: "Ein lokaler Makler prüft Ihre Immobilie und ruft Sie mit einer realistischen Bewertung zurück, nicht mit einer automatischen Schätzung.",
    stepOf: "Schritt {n} von {total}",
    sellerStepOneQuestion: "Erzählen Sie uns von Ihrer Immobilie",
    sellerStepTwoQuestion: "Wie erreicht Sie der Makler?",
    sellerStepThreeQuestion: "Prüfen und absenden",
    contactFormTitle: "Schreiben Sie uns oder fordern Sie einen Rückruf an",
    contactTopic: "Worum geht es",
    topicBuying: "Eine Immobilie kaufen",
    topicRenting: "Eine Immobilie mieten",
    topicSelling: "Meine Immobilie verkaufen oder vermieten",
    topicOther: "Etwas anderes",
    callOrMessage: "Rufen Sie an oder schreiben Sie uns",
    ourOffices: "Unsere Büros",
    openMap: "Karte öffnen",
    propertiesIn: "Immobilien in {area}",
    onThisPage: "Auf dieser Seite",
    askBroker: "Makler fragen",
    askBrokerText: "Fragen zu diesem Leitfaden? Ein Makler antwortet in Ihrer Sprache.",
    relatedGuides: "Verwandte Leitfäden",
    notFoundTitle: "Diese Seite konnten wir nicht finden",
    notFoundText: "Der Link ist vielleicht veraltet oder falsch geschrieben. Durchsuchen Sie die aktuellen Angebote oder rufen Sie uns an.",
    goHome: "Zur Startseite",
    guidesUnavailable: "Ratgeber für Käufer sind in dieser Sprache noch nicht verfügbar.",
    guidesInEnglish: "Auf Englisch lesen",
    areasEmpty: "Es gibt noch keine Gebiete zum Stöbern.",
    emailOptional: "E-Mail (optional)",
    addPhotos: "Fotos hinzufügen",
    photosUnavailable: "Der Fotoupload ist noch nicht verfügbar.",
    guideActions: "Ratgeberaktionen",
    factLabels: { location: "Ort", property_type: "Typ", offer_type: "Angebot", bedrooms: "Schlafzimmer", premises: "Räume", hotel_rooms: "Hotelzimmer", storeys: "Stockwerke", floor: "Etage", land_area_sqm: "Grundstücksfläche", condition: "Zustand", location_precision: "Standort" },
  },
  nl: {
    min: "Min.",
    max: "Max.",
    price: "Prijs",
    maxPrice: "Max. prijs",
    minPrice: "Min. prijs",
    moreFilters: "Meer filters",
    fewerFilters: "Minder filters",
    locationPlaceholder: "Stad, dorp of regio",
    applyFilters: "Resultaten tonen",
    allOffers: "Alle",
    browse: "Verkennen",
    perMonth: "per maand",
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
    keywordSearch: "Trefwoord of referentie",
    contact: "Contact",
    primaryActions: "Primaire acties",
    locations: "Locaties",
    featuredListings: "Uitgelichte objecten",
    searchResultActions: "Acties voor zoekresultaat",
    photo: "foto",
    photos: "foto's",
    location: "Locatie",
    country: "Land",
    region: "Regio / district",
    locationSearchHint: "Stad, dorp, gemeente of regio",
    locationSuggestions: "Locatiesuggesties",
    noLocations: "Geen locaties gevonden.",
    municipality: "Gemeente",
    district: "Bestuurlijk district",
    propertyType: "Type",
    propertySubtype: "Subtype",
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
    languageUnavailable: "Deze taal is nog niet beschikbaar",
    languageUnavailableText: "MS Realty is beschikbaar in het Bulgaars, Engels, Duits, Nederlands, Russisch, Grieks en Hebreeuws. Kies er hierboven een, of vraag deze taal aan en wij laten u weten wanneer die klaar is.",
    languageRequestSent: "Dank u. Wij laten u weten wanneer deze taal klaar is.",
    browseByArea: "Verken per gebied",
    howBuyingWorks: "Zo werkt kopen",
    buyingStepOneTitle: "Vertel ons wat u zoekt",
    buyingStepOneText: "Gebied, budget en het soort vastgoed dat u zoekt.",
    buyingStepTwoTitle: "Ontvang een selectie van de makelaar",
    buyingStepTwoText: "Een lokale makelaar kiest passende objecten en controleert de feiten samen met u.",
    buyingStepThreeTitle: "Bezichtigen en kopen, met het lokale papierwerk geregeld",
    buyingStepThreeText: "Wij regelen bezichtigingen en begeleiden u in uw taal door de lokale procedure.",
    startSearch: "Begin uw zoektocht",
    trustReviewed: "Elk feit over een object wordt door een persoon gecontroleerd voordat het online gaat",
    trustLanguages: "7 talen en makelaars die de uwe spreken",
    trustOffices: "Lokale kantoren",
    whatHappensNext: "Wat gebeurt er daarna",
    sellerNextOneTitle: "Een lokale makelaar belt u terug",
    sellerNextOneText: "We bevestigen de gegevens van uw vastgoed en beantwoorden uw vragen.",
    sellerNextTwoTitle: "U spreekt een realistische vraagprijs af",
    sellerNextTwoText: "De makelaar bespreekt uw vastgoed met u. Er is geen automatische schatting.",
    sellerNextThreeTitle: "Uw advertentie gaat na controle online",
    sellerNextThreeText: "Feiten en foto's worden door een persoon gecontroleerd voordat we publiceren.",
    sellerPromise: "Een lokale makelaar beoordeelt uw vastgoed en belt u terug met een realistische waardering, geen automatische schatting.",
    stepOf: "Stap {n} van {total}",
    sellerStepOneQuestion: "Vertel ons over uw vastgoed",
    sellerStepTwoQuestion: "Hoe kan de makelaar u bereiken?",
    sellerStepThreeQuestion: "Controleren en verzenden",
    contactFormTitle: "Stuur een bericht of vraag een terugbelverzoek aan",
    contactTopic: "Waar gaat het over",
    topicBuying: "Vastgoed kopen",
    topicRenting: "Vastgoed huren",
    topicSelling: "Mijn vastgoed verkopen of verhuren",
    topicOther: "Iets anders",
    callOrMessage: "Bel of stuur ons een bericht",
    ourOffices: "Onze kantoren",
    openMap: "Kaart openen",
    propertiesIn: "Vastgoed in {area}",
    onThisPage: "Op deze pagina",
    askBroker: "Vraag het een makelaar",
    askBrokerText: "Vragen over deze gids? Een makelaar antwoordt in uw taal.",
    relatedGuides: "Gerelateerde gidsen",
    notFoundTitle: "We konden deze pagina niet vinden",
    notFoundText: "De link is mogelijk verouderd of verkeerd getypt. Zoek in het actuele aanbod of bel ons.",
    goHome: "Naar de startpagina",
    guidesUnavailable: "Kopersgidsen zijn nog niet beschikbaar in deze taal.",
    guidesInEnglish: "Lees ze in het Engels",
    areasEmpty: "Er zijn nog geen gebieden om te verkennen.",
    emailOptional: "E-mail (optioneel)",
    addPhotos: "Foto's toevoegen",
    photosUnavailable: "Foto's uploaden is nog niet beschikbaar.",
    guideActions: "Gidsacties",
    factLabels: { location: "Locatie", property_type: "Type", offer_type: "Aanbod", bedrooms: "Slaapkamers", premises: "Ruimtes", hotel_rooms: "Hotelkamers", storeys: "Verdiepingen", floor: "Verdieping", land_area_sqm: "Perceeloppervlakte", condition: "Staat", location_precision: "Locatie" },
  },
  ru: {
    min: "Мин.",
    max: "Макс.",
    price: "Цена",
    maxPrice: "Макс. цена",
    minPrice: "Мин. цена",
    moreFilters: "Ещё фильтры",
    fewerFilters: "Меньше фильтров",
    locationPlaceholder: "Город, село или область",
    applyFilters: "Показать результаты",
    allOffers: "Все",
    browse: "Обзор",
    perMonth: "в месяц",
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
    keywordSearch: "Ключевые слова или номер",
    contact: "Контакт",
    primaryActions: "Основные действия",
    locations: "Локации",
    featuredListings: "Рекомендуемые объекты",
    searchResultActions: "Действия с результатом",
    photo: "фото",
    photos: "фото",
    location: "Локация",
    country: "Страна",
    region: "Регион / область",
    locationSearchHint: "Город, посёлок, муниципалитет или регион",
    locationSuggestions: "Подсказки по локации",
    noLocations: "Локации не найдены.",
    municipality: "Муниципалитет",
    district: "Область",
    propertyType: "Тип",
    propertySubtype: "Подтип",
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
    languageUnavailable: "Этот язык пока недоступен",
    languageUnavailableText: "MS Realty доступен на болгарском, английском, немецком, нидерландском, русском, греческом и иврите. Выберите один из них выше или запросите этот язык, и мы сообщим, когда он будет готов.",
    languageRequestSent: "Спасибо. Мы сообщим, когда этот язык будет готов.",
    browseByArea: "Выбор по району",
    howBuyingWorks: "Как проходит покупка",
    buyingStepOneTitle: "Расскажите, что вы ищете",
    buyingStepOneText: "Район, бюджет и тип недвижимости, которую вы ищете.",
    buyingStepTwoTitle: "Получите подборку от брокера",
    buyingStepTwoText: "Местный брокер подбирает подходящие объекты и проверяет факты вместе с вами.",
    buyingStepThreeTitle: "Осмотрите и купите с оформленными местными документами",
    buyingStepThreeText: "Мы организуем просмотры и проводим вас через местную процедуру на вашем языке.",
    startSearch: "Начать поиск",
    trustReviewed: "Каждый факт об объекте проверяет человек до публикации",
    trustLanguages: "7 языков и брокеры, говорящие на вашем",
    trustOffices: "Местные офисы",
    whatHappensNext: "Что дальше",
    sellerNextOneTitle: "Местный брокер перезванивает вам",
    sellerNextOneText: "Мы уточняем данные об объекте и отвечаем на ваши вопросы.",
    sellerNextTwoTitle: "Вы согласуете реалистичную цену",
    sellerNextTwoText: "Брокер рассматривает объект вместе с вами. Автоматической оценки нет.",
    sellerNextThreeTitle: "Объявление выходит после проверки",
    sellerNextThreeText: "Факты и фотографии проверяет человек перед публикацией.",
    sellerPromise: "Местный брокер рассматривает ваш объект и перезванивает с реалистичной оценкой, а не с автоматическим расчётом.",
    stepOf: "Шаг {n} из {total}",
    sellerStepOneQuestion: "Расскажите об объекте",
    sellerStepTwoQuestion: "Как брокеру с вами связаться?",
    sellerStepThreeQuestion: "Проверьте и отправьте",
    contactFormTitle: "Напишите нам или закажите обратный звонок",
    contactTopic: "О чём ваш вопрос",
    topicBuying: "Покупка недвижимости",
    topicRenting: "Аренда недвижимости",
    topicSelling: "Продажа или сдача моего объекта",
    topicOther: "Другое",
    callOrMessage: "Позвоните или напишите нам",
    ourOffices: "Наши офисы",
    openMap: "Открыть карту",
    propertiesIn: "Недвижимость в {area}",
    onThisPage: "На этой странице",
    askBroker: "Спросить брокера",
    askBrokerText: "Есть вопросы по этому руководству? Брокер ответит на вашем языке.",
    relatedGuides: "Похожие руководства",
    notFoundTitle: "Мы не нашли эту страницу",
    notFoundText: "Ссылка могла устареть или содержать ошибку. Поищите актуальные объявления или позвоните нам.",
    goHome: "На главную",
    guidesUnavailable: "Руководства для покупателей пока недоступны на этом языке.",
    guidesInEnglish: "Читать на английском",
    areasEmpty: "Пока нет районов для просмотра.",
    emailOptional: "Эл. почта (необязательно)",
    addPhotos: "Добавить фотографии",
    photosUnavailable: "Загрузка фотографий пока недоступна.",
    guideActions: "Действия руководства",
    factLabels: { location: "Локация", property_type: "Тип", offer_type: "Предложение", bedrooms: "Спальни", premises: "Помещения", hotel_rooms: "Номера", storeys: "Этажи", floor: "Этаж", land_area_sqm: "Площадь участка", condition: "Состояние", location_precision: "Локация" },
  },
  el: {
    min: "Ελάχ.",
    max: "Μέγ.",
    price: "Τιμή",
    maxPrice: "Μέγ. τιμή",
    minPrice: "Ελάχ. τιμή",
    moreFilters: "Περισσότερα φίλτρα",
    fewerFilters: "Λιγότερα φίλτρα",
    locationPlaceholder: "Πόλη, χωριό ή περιοχή",
    applyFilters: "Εμφάνιση αποτελεσμάτων",
    allOffers: "Όλα",
    browse: "Περιήγηση",
    perMonth: "ανά μήνα",
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
    keywordSearch: "Λέξη-κλειδί ή κωδικός",
    contact: "Επικοινωνία",
    primaryActions: "Κύριες ενέργειες",
    locations: "Τοποθεσίες",
    featuredListings: "Προτεινόμενα ακίνητα",
    searchResultActions: "Ενέργειες αποτελέσματος",
    photo: "φωτογραφία",
    photos: "φωτογραφίες",
    location: "Τοποθεσία",
    country: "Χώρα",
    region: "Περιφέρεια / ενότητα",
    locationSearchHint: "Πόλη, οικισμός, δήμος ή περιφέρεια",
    locationSuggestions: "Προτάσεις τοποθεσίας",
    noLocations: "Δεν βρέθηκαν τοποθεσίες.",
    municipality: "Δήμος",
    district: "Διοικητική περιφέρεια",
    propertyType: "Τύπος",
    propertySubtype: "Υποτύπος",
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
    languageUnavailable: "Αυτή η γλώσσα δεν είναι ακόμη διαθέσιμη",
    languageUnavailableText: "Η MS Realty είναι διαθέσιμη στα βουλγαρικά, αγγλικά, γερμανικά, ολλανδικά, ρωσικά, ελληνικά και εβραϊκά. Επιλέξτε μία από αυτές παραπάνω ή ζητήστε αυτή τη γλώσσα και θα σας ενημερώσουμε μόλις είναι έτοιμη.",
    languageRequestSent: "Ευχαριστούμε. Θα σας ενημερώσουμε μόλις αυτή η γλώσσα είναι έτοιμη.",
    browseByArea: "Περιήγηση ανά περιοχή",
    howBuyingWorks: "Πώς γίνεται η αγορά",
    buyingStepOneTitle: "Πείτε μας τι ψάχνετε",
    buyingStepOneText: "Περιοχή, προϋπολογισμός και το είδος ακινήτου που ψάχνετε.",
    buyingStepTwoTitle: "Λάβετε μια επιλογή από μεσίτη",
    buyingStepTwoText: "Ένας τοπικός μεσίτης επιλέγει κατάλληλα ακίνητα και ελέγχει τα στοιχεία μαζί σας.",
    buyingStepThreeTitle: "Δείτε και αγοράστε με τα τοπικά έγγραφα τακτοποιημένα",
    buyingStepThreeText: "Οργανώνουμε τις επισκέψεις και σας καθοδηγούμε στην τοπική διαδικασία στη γλώσσα σας.",
    startSearch: "Ξεκινήστε την αναζήτηση",
    trustReviewed: "Κάθε στοιχείο ακινήτου ελέγχεται από άνθρωπο πριν δημοσιευτεί",
    trustLanguages: "7 γλώσσες και μεσίτες που μιλούν τη δική σας",
    trustOffices: "Τοπικά γραφεία",
    whatHappensNext: "Τι ακολουθεί",
    sellerNextOneTitle: "Ένας τοπικός μεσίτης σας καλεί",
    sellerNextOneText: "Επιβεβαιώνουμε τα στοιχεία του ακινήτου σας και απαντάμε στις ερωτήσεις σας.",
    sellerNextTwoTitle: "Συμφωνείτε μια ρεαλιστική τιμή",
    sellerNextTwoText: "Ο μεσίτης εξετάζει το ακίνητο μαζί σας. Δεν υπάρχει αυτόματη εκτίμηση.",
    sellerNextThreeTitle: "Η αγγελία δημοσιεύεται μετά από έλεγχο",
    sellerNextThreeText: "Τα στοιχεία και οι φωτογραφίες ελέγχονται από άνθρωπο πριν τη δημοσίευση.",
    sellerPromise: "Ένας τοπικός μεσίτης εξετάζει το ακίνητό σας και σας καλεί με μια ρεαλιστική εκτίμηση, όχι με αυτόματο υπολογισμό.",
    stepOf: "Βήμα {n} από {total}",
    sellerStepOneQuestion: "Πείτε μας για το ακίνητό σας",
    sellerStepTwoQuestion: "Πώς μπορεί να επικοινωνήσει μαζί σας ο μεσίτης;",
    sellerStepThreeQuestion: "Ελέγξτε και στείλτε",
    contactFormTitle: "Στείλτε μήνυμα ή ζητήστε επανάκληση",
    contactTopic: "Σχετικά με τι",
    topicBuying: "Αγορά ακινήτου",
    topicRenting: "Ενοικίαση ακινήτου",
    topicSelling: "Πώληση ή εκμίσθωση του ακινήτου μου",
    topicOther: "Κάτι άλλο",
    callOrMessage: "Καλέστε μας ή στείλτε μήνυμα",
    ourOffices: "Τα γραφεία μας",
    openMap: "Άνοιγμα χάρτη",
    propertiesIn: "Ακίνητα σε {area}",
    onThisPage: "Σε αυτή τη σελίδα",
    askBroker: "Ρωτήστε έναν μεσίτη",
    askBrokerText: "Ερωτήσεις για αυτόν τον οδηγό; Ένας μεσίτης απαντά στη γλώσσα σας.",
    relatedGuides: "Σχετικοί οδηγοί",
    notFoundTitle: "Δεν βρήκαμε αυτή τη σελίδα",
    notFoundText: "Ο σύνδεσμος μπορεί να είναι παλιός ή λανθασμένος. Αναζητήστε τις τρέχουσες αγγελίες ή καλέστε μας.",
    goHome: "Στην αρχική σελίδα",
    guidesUnavailable: "Οι οδηγοί αγοραστή δεν είναι ακόμη διαθέσιμοι σε αυτή τη γλώσσα.",
    guidesInEnglish: "Διαβάστε τους στα αγγλικά",
    areasEmpty: "Δεν υπάρχουν ακόμη περιοχές για περιήγηση.",
    emailOptional: "Email (προαιρετικό)",
    addPhotos: "Προσθήκη φωτογραφιών",
    photosUnavailable: "Η μεταφόρτωση φωτογραφιών δεν είναι ακόμη διαθέσιμη.",
    guideActions: "Ενέργειες οδηγού",
    factLabels: { location: "Τοποθεσία", property_type: "Τύπος", offer_type: "Προσφορά", bedrooms: "Υπνοδωμάτια", premises: "Χώροι", hotel_rooms: "Δωμάτια ξενοδοχείου", storeys: "Όροφοι", floor: "Όροφος", land_area_sqm: "Εμβαδόν οικοπέδου", condition: "Κατάσταση", location_precision: "Τοποθεσία" },
  },
  he: {
    min: "מינימום",
    max: "מקסימום",
    price: "מחיר",
    maxPrice: "מחיר מקסימלי",
    minPrice: "מחיר מינימלי",
    moreFilters: "עוד מסננים",
    fewerFilters: "פחות מסננים",
    locationPlaceholder: "עיר, יישוב או אזור",
    applyFilters: "הצג תוצאות",
    allOffers: "הכול",
    browse: "עיון",
    perMonth: "לחודש",
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
    keywordSearch: "מילת חיפוש או מזהה",
    contact: "יצירת קשר",
    primaryActions: "פעולות ראשיות",
    locations: "אזורים",
    featuredListings: "נכסים מובילים",
    searchResultActions: "פעולות תוצאה",
    photo: "תמונה",
    photos: "תמונות",
    location: "מיקום",
    country: "מדינה",
    region: "אזור / מחוז",
    locationSearchHint: "עיר, יישוב, רשות או אזור",
    locationSuggestions: "הצעות מיקום",
    noLocations: "לא נמצאו מיקומים.",
    municipality: "רשות מקומית",
    district: "מחוז",
    propertyType: "סוג",
    propertySubtype: "תת-סוג",
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
    languageUnavailable: "השפה הזו עדיין אינה זמינה",
    languageUnavailableText: "MS Realty זמין בבולגרית, אנגלית, גרמנית, הולנדית, רוסית, יוונית ועברית. בחרו אחת מהן למעלה, או בקשו את השפה הזו ונודיע לכם כשהיא תהיה מוכנה.",
    languageRequestSent: "תודה. נודיע לכם כשהשפה הזו תהיה מוכנה.",
    browseByArea: "עיון לפי אזור",
    howBuyingWorks: "איך מתבצעת הרכישה",
    buyingStepOneTitle: "ספרו לנו מה אתם מחפשים",
    buyingStepOneText: "אזור, תקציב וסוג הנכס שאתם מחפשים.",
    buyingStepTwoTitle: "קבלו רשימה מצומצמת מהמתווך",
    buyingStepTwoText: "מתווך מקומי בוחר נכסים מתאימים ובודק את הפרטים יחד אתכם.",
    buyingStepThreeTitle: "צפו וקנו כשהניירת המקומית מסודרת",
    buyingStepThreeText: "אנחנו מארגנים ביקורים ומלווים אתכם בתהליך המקומי בשפה שלכם.",
    startSearch: "התחילו את החיפוש",
    trustReviewed: "כל פרט על נכס נבדק על ידי אדם לפני הפרסום",
    trustLanguages: "7 שפות ומתווכים שמדברים את שלכם",
    trustOffices: "משרדים מקומיים",
    whatHappensNext: "מה קורה בהמשך",
    sellerNextOneTitle: "מתווך מקומי חוזר אליכם",
    sellerNextOneText: "אנחנו מאשרים את פרטי הנכס ועונים על השאלות שלכם.",
    sellerNextTwoTitle: "אתם מסכמים מחיר מבוקש ריאלי",
    sellerNextTwoText: "המתווך בוחן את הנכס יחד אתכם. אין הערכה אוטומטית.",
    sellerNextThreeTitle: "המודעה עולה לאוויר אחרי בדיקה",
    sellerNextThreeText: "הפרטים והתמונות נבדקים על ידי אדם לפני שאנחנו מפרסמים.",
    sellerPromise: "מתווך מקומי בוחן את הנכס שלכם וחוזר אליכם עם הערכה ריאלית, לא עם חישוב אוטומטי.",
    stepOf: "שלב {n} מתוך {total}",
    sellerStepOneQuestion: "ספרו לנו על הנכס",
    sellerStepTwoQuestion: "איך המתווך יכול להשיג אתכם?",
    sellerStepThreeQuestion: "בדקו ושלחו",
    contactFormTitle: "שלחו הודעה או בקשו שיחה חוזרת",
    contactTopic: "במה מדובר",
    topicBuying: "קניית נכס",
    topicRenting: "שכירת נכס",
    topicSelling: "מכירה או השכרה של הנכס שלי",
    topicOther: "משהו אחר",
    callOrMessage: "התקשרו או שלחו לנו הודעה",
    ourOffices: "המשרדים שלנו",
    openMap: "פתיחת מפה",
    propertiesIn: "נכסים ב-{area}",
    onThisPage: "בעמוד הזה",
    askBroker: "שאלו מתווך",
    askBrokerText: "יש שאלות על המדריך הזה? מתווך עונה בשפה שלכם.",
    relatedGuides: "מדריכים קשורים",
    notFoundTitle: "לא מצאנו את העמוד הזה",
    notFoundText: "ייתכן שהקישור ישן או שגוי. חפשו בנכסים העדכניים או התקשרו אלינו.",
    goHome: "לעמוד הבית",
    guidesUnavailable: "מדריכי הרוכשים עדיין אינם זמינים בשפה הזו.",
    guidesInEnglish: "לקריאה באנגלית",
    areasEmpty: "אין עדיין אזורים לעיון.",
    emailOptional: "אימייל (אופציונלי)",
    addPhotos: "הוספת תמונות",
    photosUnavailable: "העלאת תמונות עדיין אינה זמינה.",
    guideActions: "פעולות מדריך",
    factLabels: { location: "מיקום", property_type: "סוג", offer_type: "הצעה", bedrooms: "חדרי שינה", premises: "חללים", hotel_rooms: "חדרי מלון", storeys: "קומות", floor: "קומה", land_area_sqm: "שטח מגרש", condition: "מצב", location_precision: "מיקום" },
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
    propertyTypes: { commercial: "Търговски имот", multi_unit: "Апартаменти", apartment: "Апартамент", hotel: "Хотел", house: "Къща", plot: "Парцел", agricultural_land: "Земеделска земя", land: "Парцел", property: "Имот" },
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
    propertyTypes: { commercial: "Commercial property", multi_unit: "Apartments", apartment: "Apartment", hotel: "Hotel", house: "House", plot: "Plot", agricultural_land: "Agricultural land", land: "Land", property: "Property" },
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
    propertyTypes: { commercial: "Gewerbeimmobilie", multi_unit: "Apartments", apartment: "Wohnung", hotel: "Hotel", house: "Haus", plot: "Grundstück", agricultural_land: "Landwirtschaftsfläche", land: "Grundstück", property: "Immobilie" },
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
    propertyTypes: { commercial: "Commercieel vastgoed", multi_unit: "Appartementen", apartment: "Appartement", hotel: "Hotel", house: "Huis", plot: "Kavel", agricultural_land: "Landbouwgrond", land: "Grond", property: "Object" },
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
    propertyTypes: { commercial: "Коммерческая недвижимость", multi_unit: "Апартаменты", apartment: "Квартира", hotel: "Отель", house: "Дом", plot: "Участок", agricultural_land: "Сельхозземля", land: "Участок", property: "Объект" },
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
    propertyTypes: { commercial: "Επαγγελματικό ακίνητο", multi_unit: "Διαμερίσματα", apartment: "Διαμέρισμα", hotel: "Ξενοδοχείο", house: "Κατοικία", plot: "Οικόπεδο", agricultural_land: "Αγροτική γη", land: "Οικόπεδο", property: "Ακίνητο" },
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
    propertyTypes: { commercial: "נכס מסחרי", multi_unit: "דירות", apartment: "דירה", hotel: "מלון", house: "בית", plot: "מגרש", agricultural_land: "קרקע חקלאית", land: "מגרש", property: "נכס" },
    offerTypes: { sale: "למכירה", rent: "להשכרה" },
  },
};

export function humanizeIdentifier(value) {
  return String(value || "").replaceAll("_", " ");
}

const LOCATION_NAMES = {
  bg: { Sandanski: "Сандански", Petrich: "Петрич", Hotovo: "Хотово", Bansko: "Банско", "Sveti Vlas": "Свети Влас", Blagoevgrad: "Благоевград", Burgas: "Бургас" },
  ru: { Sandanski: "Сандански", Petrich: "Петрич", Hotovo: "Хотово", Bansko: "Банско", "Sveti Vlas": "Свети-Влас", Blagoevgrad: "Благоевград", Burgas: "Бургас" },
  el: { Sandanski: "Σαντάνσκι", Petrich: "Πετρίτσι", Hotovo: "Χότοβο", Bansko: "Μπάνσκο", "Sveti Vlas": "Σβέτι Βλας", Blagoevgrad: "Μπλαγκόεβγκραντ", Burgas: "Μπουργκάς" },
  he: { Sandanski: "סנדנסקי", Petrich: "פטריץ׳", Hotovo: "חוטובו", Bansko: "בנסקו", "Sveti Vlas": "סבטי ולאס", Blagoevgrad: "בלגואבגרד", Burgas: "בורגס" },
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
  const catalogArea = GEOGRAPHY_CATALOG.areas.find((area) => area.names?.en === value);
  if (LOCATION_NAMES[localeCode]?.[value]) return LOCATION_NAMES[localeCode][value];
  if (catalogArea && (localeCode === "bg" || (localeCode === "el" && catalogArea.country_code === "GR"))) {
    return catalogArea.names.native;
  }
  return catalogArea?.names?.en || String(value || "");
}

function localizedLocationForView(localeCode, view) {
  return localeCode === "bg" && view.location_native ? view.location_native : localizedLocationValue(localeCode, view.location);
}

export function localizedSearchFilterValue(localeCode, key, value) {
  if (key === "property_type" || key === "property_family" || key === "offer_type") {
    return localizedListingValue(localeCode, key === "property_family" ? "property_type" : key, value);
  }
  if (key === "location" || key === "municipality" || key === "district") return localizedLocationValue(localeCode, value);
  if (key === "country_code") {
    const country = GEOGRAPHY_CATALOG.countries.find((candidate) => candidate.code === value);
    if (!country) return humanizeIdentifier(value);
    return (localeCode === "bg" && value === "BG") || (localeCode === "el" && value === "GR")
      ? country.names.native
      : country.names.en;
  }
  if (key === "geography_id" || key === "region_id") {
    const area =
      GEOGRAPHY_CATALOG.areas.find((candidate) => candidate.id === value) ||
      geographyRegistryArea(publicGeographyRegistry(), value);
    if (!area) return humanizeIdentifier(value);
    return (localeCode === "bg" && area.country_code === "BG") || (localeCode === "el" && area.country_code === "GR")
      ? area.names.native
      : area.names.en;
  }
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
    form_unavailable: "Формата е временно недостъпна. Обадете се или ни пишете, отговаряме бързо.",
  },
  en: {
    title: "Sell your property with MS Realty",
    description: "Request a broker valuation and follow-up from the MS Realty team.",
    h1: "Sell your property",
    form_unavailable: "The form is temporarily unavailable. Call or message us instead. We reply quickly.",
  },
  de: {
    title: "Verkaufen Sie Ihre Immobilie mit MS Realty",
    description: "Fordern Sie eine Maklerbewertung und Rückmeldung vom MS Realty Team an.",
    h1: "Immobilie verkaufen",
    form_unavailable: "Das Formular ist vorübergehend nicht verfügbar. Rufen Sie uns an oder schreiben Sie uns.",
  },
  nl: {
    title: "Verkoop uw vastgoed met MS Realty",
    description: "Vraag een makelaarswaardering en opvolging van het MS Realty team aan.",
    h1: "Vastgoed verkopen",
    form_unavailable: "Het formulier is tijdelijk niet beschikbaar. Bel of stuur ons een bericht.",
  },
  ru: {
    title: "Продайте недвижимость с MS Realty",
    description: "Запросите брокерскую оценку и обратную связь от команды MS Realty.",
    h1: "Продайте недвижимость",
    form_unavailable: "Форма временно недоступна. Позвоните или напишите нам, мы быстро отвечаем.",
  },
  el: {
    title: "Πουλήστε το ακίνητό σας με τη MS Realty",
    description: "Ζητήστε εκτίμηση από μεσίτη και επικοινωνία από την ομάδα της MS Realty.",
    h1: "Πουλήστε το ακίνητό σας",
    form_unavailable: "Η φόρμα δεν είναι προσωρινά διαθέσιμη. Καλέστε μας ή στείλτε μήνυμα.",
  },
  he: {
    title: "מכירת נכס עם MS Realty",
    description: "בקשו הערכת מתווך וחזרה מצוות MS Realty.",
    h1: "מכירת נכס",
    form_unavailable: "הטופס אינו זמין זמנית. התקשרו או שלחו לנו הודעה.",
  },
};

// Buyer onboarding ("Start your search", /{locale}/start). Every string exists
// in all seven public locales; sentence case, no dashes, no exclamation marks.
// The two notes in step 4 restate the verified market facts from
// SOURCE_OF_TRUTH.md section 2 (land ownership and the financing gap).
const START_COPY = {
  bg: {
    title: "Започнете търсенето си | MS Realty",
    description: "Отговорете на четири кратки въпроса и вижте подходящи имоти от MS Realty, заедно с местните правила за чуждестранни купувачи.",
    h1: "Започнете търсенето си",
    intro: "Четири кратки въпроса, след това подходящи имоти и местните правила, които важат за вас.",
    stepOf: "Стъпка {current} от {total}",
    steps: { intent: "Какво търсите", where: "Къде", budget: "Бюджет и спални", about: "За вас" },
    buyOrRent: "Покупка или наем",
    propertyType: "Тип имот",
    anyType: "Всякакъв тип",
    whereTitle: "Къде търсите?",
    anywhere: "Навсякъде, където работим",
    areas: { sandanski: "Сандански", bansko: "Банско", blagoevgrad_district: "Област Благоевград", black_sea_coast: "Черноморие", greece: "Гърция" },
    areaNotes: { sandanski: "Централен офис", bansko: "Местен офис", blagoevgrad_district: "Цялата област", black_sea_coast: "Офис в Свети Влас", greece: "Отвъд границата" },
    budgetTitle: "Вашият бюджет",
    bedroomsHint: "Не е нужно за парцели, земя, търговски имоти и хотели.",
    aboutTitle: "За вас",
    citizenship: "Вашето гражданство",
    eu: "Гражданин на ЕС или ЕИП",
    nonEu: "Гражданин извън ЕС",
    landRule: "Граждани извън ЕС не могат да притежават земя на свое име в България и я държат чрез българско дружество, докато граждани на ЕС и ЕИП могат да купуват земя директно.",
    financing: "Как ще платите?",
    cash: "В брой",
    mortgage: "Нужно ми е финансиране",
    financingGap: "Българските банки не предлагат стандартна ипотека на чужденци, затова планирайте финансирането преди огледа.",
    timeline: "Кога планирате да купите или да се нанесете?",
    timelines: { soon: "До 3 месеца", year: "До една година", browsing: "Само разглеждам" },
    chooseOption: "Изберете една от опциите, за да продължите.",
    review: "Преглед на отговорите",
    seeMatches: "Вижте подходящите имоти",
    matchCount: "{count} подходящи имота",
    noMatches: "Засега няма подходящи имоти, но брокер пак може да помогне.",
    summaryTitle: "Вашите отговори",
    changeAnswers: "Промяна на отговорите",
    shortlistTitle: "Получете подбор от брокер",
    shortlistIntro: "Брокер, който говори вашия език, подбира имоти за вас и се свързва с вас.",
    shortlistSubmit: "Заявете подбор",
    shortlistSent: "Заявката е изпратена. Брокер ще се свърже с вас с подбор.",
    formUnavailable: "Формата е временно недостъпна. Обадете се или ни пишете и брокер ще помогне.",
    widenTitle: "Опитайте по-широко търсене",
    widen: { price: "Без ограничение за бюджет", bedrooms: "Всякакъв брой спални", type: "Всякакъв тип имот", area: "Навсякъде, където работим" },
    alertTitle: "Известете ме за нови съвпадения",
    alertIntro: "Ще ви пишем, когато се появи имот по тези критерии.",
    alertSubmit: "Включете известията",
    alertSent: "Известията са включени. Ще ви пишем при ново съвпадение.",
    comingSoon: "Очаквайте скоро",
    planTrip: "Планирайте пътуване за огледи",
    planTripNote: "Онлайн заявката за два или три дни огледи предстои. Дотогава брокер ги организира по телефона.",
    financingOptions: "Вижте вариантите за финансиране",
    financingOptionsNote: "Подготвяме списък с партньори за финансиране. Дотогава брокер обсъжда вариантите с вас.",
    sending: "Изпращане...",
  },
  en: {
    title: "Start your property search | MS Realty",
    description: "Answer four short questions and see matching MS Realty properties, with the local rules for foreign buyers explained.",
    h1: "Start your search",
    intro: "Four short questions, then matching properties and the local rules that apply to you.",
    stepOf: "Step {current} of {total}",
    steps: { intent: "What you need", where: "Where", budget: "Budget and bedrooms", about: "About you" },
    buyOrRent: "Buy or rent",
    propertyType: "Property type",
    anyType: "Any type",
    whereTitle: "Where are you looking?",
    anywhere: "Anywhere we work",
    areas: { sandanski: "Sandanski", bansko: "Bansko", blagoevgrad_district: "Blagoevgrad district", black_sea_coast: "Black Sea coast", greece: "Greece" },
    areaNotes: { sandanski: "Head office", bansko: "Local office", blagoevgrad_district: "The whole district", black_sea_coast: "Sveti Vlas office", greece: "Across the border" },
    budgetTitle: "Your budget",
    bedroomsHint: "Not needed for plots, land, commercial property and hotels.",
    aboutTitle: "About you",
    citizenship: "Your citizenship",
    eu: "EU or EEA citizen",
    nonEu: "Non-EU citizen",
    landRule: "Non-EU citizens cannot own land in their own name in Bulgaria and hold it through a Bulgarian company, while EU and EEA citizens can buy land directly.",
    financing: "How will you pay?",
    cash: "Cash",
    mortgage: "I need financing",
    financingGap: "Bulgarian banks offer no standard mortgage to foreign nationals, so plan your financing before you view.",
    timeline: "When do you plan to buy or move?",
    timelines: { soon: "Within 3 months", year: "Within a year", browsing: "Just looking" },
    chooseOption: "Choose one of the options to continue.",
    review: "Review my answers",
    seeMatches: "See matching properties",
    matchCount: "{count} matching properties",
    noMatches: "No matching properties yet, but a broker can still help.",
    summaryTitle: "Your answers",
    changeAnswers: "Change answers",
    shortlistTitle: "Get a broker shortlist",
    shortlistIntro: "A broker who speaks your language picks properties for you and gets in touch.",
    shortlistSubmit: "Request a shortlist",
    shortlistSent: "Your request was sent. A broker will contact you with a shortlist.",
    formUnavailable: "The form is temporarily unavailable. Call or message us instead and a broker will help.",
    widenTitle: "Try a wider search",
    widen: { price: "Without the budget limit", bedrooms: "Any number of bedrooms", type: "Any property type", area: "Anywhere we work" },
    alertTitle: "Alert me about new matches",
    alertIntro: "We write to you when a property matching these criteria appears.",
    alertSubmit: "Turn on alerts",
    alertSent: "Alerts are on. We will write to you when a property matches.",
    comingSoon: "Coming soon",
    planTrip: "Plan a viewing trip",
    planTripNote: "Booking two or three days of viewings online is on the way. A broker arranges it by phone in the meantime.",
    financingOptions: "See financing options",
    financingOptionsNote: "A list of financing partners is in preparation. Until then a broker talks the options through with you.",
    sending: "Sending...",
  },
  de: {
    title: "Starten Sie Ihre Immobiliensuche | MS Realty",
    description: "Beantworten Sie vier kurze Fragen und sehen Sie passende MS Realty Immobilien, mit den lokalen Regeln für ausländische Käufer.",
    h1: "Starten Sie Ihre Suche",
    intro: "Vier kurze Fragen, dann passende Immobilien und die lokalen Regeln, die für Sie gelten.",
    stepOf: "Schritt {current} von {total}",
    steps: { intent: "Was Sie suchen", where: "Wo", budget: "Budget und Schlafzimmer", about: "Über Sie" },
    buyOrRent: "Kaufen oder mieten",
    propertyType: "Immobilientyp",
    anyType: "Jeder Typ",
    whereTitle: "Wo suchen Sie?",
    anywhere: "Überall, wo wir tätig sind",
    areas: { sandanski: "Sandanski", bansko: "Bansko", blagoevgrad_district: "Bezirk Blagoevgrad", black_sea_coast: "Schwarzmeerküste", greece: "Griechenland" },
    areaNotes: { sandanski: "Hauptbüro", bansko: "Lokales Büro", blagoevgrad_district: "Der ganze Bezirk", black_sea_coast: "Büro in Sveti Vlas", greece: "Jenseits der Grenze" },
    budgetTitle: "Ihr Budget",
    bedroomsHint: "Entfällt bei Grundstücken, Land, Gewerbeimmobilien und Hotels.",
    aboutTitle: "Über Sie",
    citizenship: "Ihre Staatsangehörigkeit",
    eu: "EU- oder EWR-Bürger",
    nonEu: "Nicht-EU-Bürger",
    landRule: "Nicht-EU-Bürger können in Bulgarien kein Land auf ihren eigenen Namen besitzen und halten es über eine bulgarische Gesellschaft, während EU- und EWR-Bürger Land direkt kaufen können.",
    financing: "Wie bezahlen Sie?",
    cash: "Bar",
    mortgage: "Ich brauche eine Finanzierung",
    financingGap: "Bulgarische Banken bieten ausländischen Staatsangehörigen keine Standardhypothek an, planen Sie Ihre Finanzierung also vor der Besichtigung.",
    timeline: "Wann möchten Sie kaufen oder einziehen?",
    timelines: { soon: "Innerhalb von 3 Monaten", year: "Innerhalb eines Jahres", browsing: "Ich schaue mich nur um" },
    chooseOption: "Wählen Sie eine Option, um fortzufahren.",
    review: "Antworten prüfen",
    seeMatches: "Passende Immobilien ansehen",
    matchCount: "{count} passende Immobilien",
    noMatches: "Noch keine passenden Immobilien, ein Makler kann trotzdem helfen.",
    summaryTitle: "Ihre Antworten",
    changeAnswers: "Antworten ändern",
    shortlistTitle: "Eine Makler-Auswahl erhalten",
    shortlistIntro: "Ein Makler, der Ihre Sprache spricht, wählt Immobilien für Sie aus und meldet sich bei Ihnen.",
    shortlistSubmit: "Auswahl anfordern",
    shortlistSent: "Ihre Anfrage wurde gesendet. Ein Makler meldet sich mit einer Auswahl.",
    formUnavailable: "Das Formular ist vorübergehend nicht verfügbar. Rufen Sie uns an oder schreiben Sie uns, ein Makler hilft Ihnen.",
    widenTitle: "Versuchen Sie eine breitere Suche",
    widen: { price: "Ohne Budgetgrenze", bedrooms: "Beliebig viele Schlafzimmer", type: "Jeder Immobilientyp", area: "Überall, wo wir tätig sind" },
    alertTitle: "Über neue Treffer benachrichtigen",
    alertIntro: "Wir schreiben Ihnen, sobald eine Immobilie zu diesen Kriterien erscheint.",
    alertSubmit: "Benachrichtigungen aktivieren",
    alertSent: "Die Benachrichtigungen sind aktiv. Wir schreiben Ihnen bei einem Treffer.",
    comingSoon: "Demnächst",
    planTrip: "Besichtigungsreise planen",
    planTripNote: "Zwei oder drei Besichtigungstage online zu buchen ist in Arbeit. Bis dahin organisiert ein Makler das telefonisch.",
    financingOptions: "Finanzierungsoptionen ansehen",
    financingOptionsNote: "Eine Liste mit Finanzierungspartnern wird vorbereitet. Bis dahin bespricht ein Makler die Optionen mit Ihnen.",
    sending: "Wird gesendet...",
  },
  nl: {
    title: "Start uw zoektocht naar vastgoed | MS Realty",
    description: "Beantwoord vier korte vragen en bekijk passend MS Realty vastgoed, met de lokale regels voor buitenlandse kopers.",
    h1: "Start uw zoektocht",
    intro: "Vier korte vragen, daarna passend vastgoed en de lokale regels die voor u gelden.",
    stepOf: "Stap {current} van {total}",
    steps: { intent: "Wat u zoekt", where: "Waar", budget: "Budget en slaapkamers", about: "Over u" },
    buyOrRent: "Kopen of huren",
    propertyType: "Type vastgoed",
    anyType: "Elk type",
    whereTitle: "Waar zoekt u?",
    anywhere: "Overal waar wij werken",
    areas: { sandanski: "Sandanski", bansko: "Bansko", blagoevgrad_district: "District Blagoevgrad", black_sea_coast: "Zwarte Zeekust", greece: "Griekenland" },
    areaNotes: { sandanski: "Hoofdkantoor", bansko: "Lokaal kantoor", blagoevgrad_district: "Het hele district", black_sea_coast: "Kantoor in Sveti Vlas", greece: "Over de grens" },
    budgetTitle: "Uw budget",
    bedroomsHint: "Niet nodig voor kavels, grond, commercieel vastgoed en hotels.",
    aboutTitle: "Over u",
    citizenship: "Uw nationaliteit",
    eu: "EU- of EER-burger",
    nonEu: "Burger van buiten de EU",
    landRule: "Burgers van buiten de EU kunnen in Bulgarije geen grond op eigen naam bezitten en houden die via een Bulgaarse vennootschap, terwijl EU- en EER-burgers grond rechtstreeks kunnen kopen.",
    financing: "Hoe betaalt u?",
    cash: "Contant",
    mortgage: "Ik heb financiering nodig",
    financingGap: "Bulgaarse banken bieden buitenlanders geen standaardhypotheek, dus regel uw financiering voordat u gaat bezichtigen.",
    timeline: "Wanneer wilt u kopen of verhuizen?",
    timelines: { soon: "Binnen 3 maanden", year: "Binnen een jaar", browsing: "Ik kijk alleen rond" },
    chooseOption: "Kies een van de opties om verder te gaan.",
    review: "Antwoorden bekijken",
    seeMatches: "Bekijk passend vastgoed",
    matchCount: "{count} passende objecten",
    noMatches: "Nog geen passend vastgoed, een makelaar kan alsnog helpen.",
    summaryTitle: "Uw antwoorden",
    changeAnswers: "Antwoorden wijzigen",
    shortlistTitle: "Ontvang een selectie van een makelaar",
    shortlistIntro: "Een makelaar die uw taal spreekt, kiest vastgoed voor u uit en neemt contact op.",
    shortlistSubmit: "Selectie aanvragen",
    shortlistSent: "Uw aanvraag is verzonden. Een makelaar neemt contact op met een selectie.",
    formUnavailable: "Het formulier is tijdelijk niet beschikbaar. Bel of stuur ons een bericht en een makelaar helpt u.",
    widenTitle: "Probeer een bredere zoekopdracht",
    widen: { price: "Zonder budgetlimiet", bedrooms: "Elk aantal slaapkamers", type: "Elk type vastgoed", area: "Overal waar wij werken" },
    alertTitle: "Waarschuw mij bij nieuwe resultaten",
    alertIntro: "We sturen u bericht zodra er vastgoed verschijnt dat aan deze criteria voldoet.",
    alertSubmit: "Meldingen inschakelen",
    alertSent: "De meldingen staan aan. We sturen u bericht bij een match.",
    comingSoon: "Binnenkort",
    planTrip: "Een bezichtigingsreis plannen",
    planTripNote: "Twee of drie dagen bezichtigingen online boeken is in voorbereiding. Tot die tijd regelt een makelaar het telefonisch.",
    financingOptions: "Financieringsopties bekijken",
    financingOptionsNote: "Een lijst met financieringspartners is in voorbereiding. Tot die tijd bespreekt een makelaar de opties met u.",
    sending: "Verzenden...",
  },
  ru: {
    title: "Начните поиск недвижимости | MS Realty",
    description: "Ответьте на четыре коротких вопроса и посмотрите подходящие объекты MS Realty, а также местные правила для иностранных покупателей.",
    h1: "Начните поиск",
    intro: "Четыре коротких вопроса, затем подходящие объекты и местные правила, которые касаются вас.",
    stepOf: "Шаг {current} из {total}",
    steps: { intent: "Что вы ищете", where: "Где", budget: "Бюджет и спальни", about: "О вас" },
    buyOrRent: "Покупка или аренда",
    propertyType: "Тип недвижимости",
    anyType: "Любой тип",
    whereTitle: "Где вы ищете?",
    anywhere: "Везде, где мы работаем",
    areas: { sandanski: "Сандански", bansko: "Банско", blagoevgrad_district: "Благоевградская область", black_sea_coast: "Черноморское побережье", greece: "Греция" },
    areaNotes: { sandanski: "Главный офис", bansko: "Местный офис", blagoevgrad_district: "Вся область", black_sea_coast: "Офис в Свети-Влас", greece: "За границей" },
    budgetTitle: "Ваш бюджет",
    bedroomsHint: "Не нужно для участков, земли, коммерческой недвижимости и отелей.",
    aboutTitle: "О вас",
    citizenship: "Ваше гражданство",
    eu: "Гражданин ЕС или ЕЭЗ",
    nonEu: "Гражданин страны вне ЕС",
    landRule: "Граждане стран вне ЕС не могут владеть землёй в Болгарии на своё имя и оформляют её через болгарскую компанию, а граждане ЕС и ЕЭЗ могут покупать землю напрямую.",
    financing: "Как вы будете платить?",
    cash: "Наличными",
    mortgage: "Мне нужно финансирование",
    financingGap: "Болгарские банки не предлагают иностранцам стандартную ипотеку, поэтому спланируйте финансирование до просмотра.",
    timeline: "Когда вы планируете купить или переехать?",
    timelines: { soon: "В течение 3 месяцев", year: "В течение года", browsing: "Пока присматриваюсь" },
    chooseOption: "Выберите один из вариантов, чтобы продолжить.",
    review: "Проверить ответы",
    seeMatches: "Смотреть подходящие объекты",
    matchCount: "{count} подходящих объектов",
    noMatches: "Подходящих объектов пока нет, но брокер всё равно поможет.",
    summaryTitle: "Ваши ответы",
    changeAnswers: "Изменить ответы",
    shortlistTitle: "Получить подборку от брокера",
    shortlistIntro: "Брокер, говорящий на вашем языке, подберёт объекты для вас и свяжется с вами.",
    shortlistSubmit: "Запросить подборку",
    shortlistSent: "Запрос отправлен. Брокер свяжется с вами с подборкой.",
    formUnavailable: "Форма временно недоступна. Позвоните или напишите нам, и брокер поможет.",
    widenTitle: "Попробуйте более широкий поиск",
    widen: { price: "Без ограничения бюджета", bedrooms: "Любое число спален", type: "Любой тип недвижимости", area: "Везде, где мы работаем" },
    alertTitle: "Сообщить мне о новых совпадениях",
    alertIntro: "Мы напишем вам, когда появится объект по этим критериям.",
    alertSubmit: "Включить уведомления",
    alertSent: "Уведомления включены. Мы напишем вам при новом совпадении.",
    comingSoon: "Скоро",
    planTrip: "Запланировать поездку на просмотры",
    planTripNote: "Онлайн-заявка на два или три дня просмотров готовится. Пока брокер организует их по телефону.",
    financingOptions: "Посмотреть варианты финансирования",
    financingOptionsNote: "Список партнёров по финансированию готовится. До этого брокер обсуждает варианты с вами.",
    sending: "Отправка...",
  },
  el: {
    title: "Ξεκινήστε την αναζήτηση ακινήτου | MS Realty",
    description: "Απαντήστε σε τέσσερις σύντομες ερωτήσεις και δείτε ακίνητα της MS Realty που σας ταιριάζουν, μαζί με τους τοπικούς κανόνες για ξένους αγοραστές.",
    h1: "Ξεκινήστε την αναζήτησή σας",
    intro: "Τέσσερις σύντομες ερωτήσεις, έπειτα ακίνητα που ταιριάζουν και οι τοπικοί κανόνες που ισχύουν για εσάς.",
    stepOf: "Βήμα {current} από {total}",
    steps: { intent: "Τι ψάχνετε", where: "Πού", budget: "Προϋπολογισμός και υπνοδωμάτια", about: "Σχετικά με εσάς" },
    buyOrRent: "Αγορά ή ενοικίαση",
    propertyType: "Τύπος ακινήτου",
    anyType: "Οποιοσδήποτε τύπος",
    whereTitle: "Πού ψάχνετε;",
    anywhere: "Οπουδήποτε δραστηριοποιούμαστε",
    areas: { sandanski: "Σαντάνσκι", bansko: "Μπάνσκο", blagoevgrad_district: "Περιφέρεια Μπλαγκόεβγκραντ", black_sea_coast: "Ακτές Μαύρης Θάλασσας", greece: "Ελλάδα" },
    areaNotes: { sandanski: "Κεντρικό γραφείο", bansko: "Τοπικό γραφείο", blagoevgrad_district: "Ολόκληρη η περιφέρεια", black_sea_coast: "Γραφείο στο Σβέτι Βλας", greece: "Πέρα από τα σύνορα" },
    budgetTitle: "Ο προϋπολογισμός σας",
    bedroomsHint: "Δεν χρειάζεται για οικόπεδα, γη, επαγγελματικά ακίνητα και ξενοδοχεία.",
    aboutTitle: "Σχετικά με εσάς",
    citizenship: "Η υπηκοότητά σας",
    eu: "Πολίτης ΕΕ ή ΕΟΧ",
    nonEu: "Πολίτης εκτός ΕΕ",
    landRule: "Οι πολίτες εκτός ΕΕ δεν μπορούν να κατέχουν γη στη Βουλγαρία στο όνομά τους και την κατέχουν μέσω βουλγαρικής εταιρείας, ενώ οι πολίτες ΕΕ και ΕΟΧ μπορούν να αγοράσουν γη απευθείας.",
    financing: "Πώς θα πληρώσετε;",
    cash: "Μετρητά",
    mortgage: "Χρειάζομαι χρηματοδότηση",
    financingGap: "Οι βουλγαρικές τράπεζες δεν προσφέρουν τυπικό στεγαστικό δάνειο σε αλλοδαπούς, οπότε σχεδιάστε τη χρηματοδότηση πριν από την επίσκεψη.",
    timeline: "Πότε σκοπεύετε να αγοράσετε ή να μετακομίσετε;",
    timelines: { soon: "Μέσα σε 3 μήνες", year: "Μέσα σε ένα έτος", browsing: "Απλώς κοιτάζω" },
    chooseOption: "Επιλέξτε μία από τις επιλογές για να συνεχίσετε.",
    review: "Έλεγχος απαντήσεων",
    seeMatches: "Δείτε τα ακίνητα που ταιριάζουν",
    matchCount: "{count} ακίνητα που ταιριάζουν",
    noMatches: "Δεν υπάρχουν ακόμη ακίνητα που ταιριάζουν, ένας μεσίτης μπορεί ωστόσο να βοηθήσει.",
    summaryTitle: "Οι απαντήσεις σας",
    changeAnswers: "Αλλαγή απαντήσεων",
    shortlistTitle: "Λάβετε επιλογή από μεσίτη",
    shortlistIntro: "Ένας μεσίτης που μιλά τη γλώσσα σας επιλέγει ακίνητα για εσάς και επικοινωνεί μαζί σας.",
    shortlistSubmit: "Ζητήστε επιλογή",
    shortlistSent: "Το αίτημά σας εστάλη. Ένας μεσίτης θα επικοινωνήσει μαζί σας με μια επιλογή.",
    formUnavailable: "Η φόρμα δεν είναι προσωρινά διαθέσιμη. Καλέστε μας ή στείλτε μήνυμα και ένας μεσίτης θα βοηθήσει.",
    widenTitle: "Δοκιμάστε ευρύτερη αναζήτηση",
    widen: { price: "Χωρίς όριο προϋπολογισμού", bedrooms: "Οποιοσδήποτε αριθμός υπνοδωματίων", type: "Οποιοσδήποτε τύπος ακινήτου", area: "Οπουδήποτε δραστηριοποιούμαστε" },
    alertTitle: "Ειδοποιήστε με για νέα αποτελέσματα",
    alertIntro: "Σας γράφουμε μόλις εμφανιστεί ακίνητο που ταιριάζει σε αυτά τα κριτήρια.",
    alertSubmit: "Ενεργοποίηση ειδοποιήσεων",
    alertSent: "Οι ειδοποιήσεις είναι ενεργές. Θα σας γράψουμε μόλις ταιριάξει ένα ακίνητο.",
    comingSoon: "Έρχεται σύντομα",
    planTrip: "Σχεδιάστε ταξίδι για επισκέψεις",
    planTripNote: "Η κράτηση δύο ή τριών ημερών επισκέψεων μέσω διαδικτύου ετοιμάζεται. Μέχρι τότε ένας μεσίτης τη διοργανώνει τηλεφωνικά.",
    financingOptions: "Δείτε επιλογές χρηματοδότησης",
    financingOptionsNote: "Ετοιμάζεται λίστα συνεργατών χρηματοδότησης. Μέχρι τότε ένας μεσίτης συζητά τις επιλογές μαζί σας.",
    sending: "Αποστολή...",
  },
  he: {
    title: "התחילו את חיפוש הנכס | MS Realty",
    description: "ענו על ארבע שאלות קצרות וראו נכסים מתאימים של MS Realty, יחד עם הכללים המקומיים לרוכשים זרים.",
    h1: "התחילו את החיפוש",
    intro: "ארבע שאלות קצרות, ואחריהן נכסים מתאימים והכללים המקומיים שחלים עליכם.",
    stepOf: "שלב {current} מתוך {total}",
    steps: { intent: "מה אתם מחפשים", where: "איפה", budget: "תקציב וחדרי שינה", about: "עליכם" },
    buyOrRent: "קנייה או השכרה",
    propertyType: "סוג הנכס",
    anyType: "כל סוג",
    whereTitle: "איפה אתם מחפשים?",
    anywhere: "בכל מקום שבו אנחנו פועלים",
    areas: { sandanski: "סנדנסקי", bansko: "בנסקו", blagoevgrad_district: "מחוז בלגואבגרד", black_sea_coast: "חוף הים השחור", greece: "יוון" },
    areaNotes: { sandanski: "המשרד הראשי", bansko: "משרד מקומי", blagoevgrad_district: "המחוז כולו", black_sea_coast: "משרד בסבטי ולאס", greece: "מעבר לגבול" },
    budgetTitle: "התקציב שלכם",
    bedroomsHint: "לא נדרש למגרשים, קרקע, נכסים מסחריים ומלונות.",
    aboutTitle: "עליכם",
    citizenship: "האזרחות שלכם",
    eu: "אזרח האיחוד האירופי או האזור הכלכלי האירופי",
    nonEu: "אזרח מחוץ לאיחוד האירופי",
    landRule: "אזרחים מחוץ לאיחוד האירופי אינם יכולים להחזיק קרקע בבולגריה על שמם ומחזיקים בה באמצעות חברה בולגרית, בעוד אזרחי האיחוד האירופי והאזור הכלכלי האירופי יכולים לרכוש קרקע ישירות.",
    financing: "איך תשלמו?",
    cash: "במזומן",
    mortgage: "אני זקוק למימון",
    financingGap: "בנקים בבולגריה אינם מציעים משכנתה רגילה לאזרחים זרים, לכן תכננו את המימון לפני הביקור בנכס.",
    timeline: "מתי אתם מתכננים לקנות או לעבור?",
    timelines: { soon: "תוך 3 חודשים", year: "תוך שנה", browsing: "רק מסתכלים" },
    chooseOption: "בחרו אחת מהאפשרויות כדי להמשיך.",
    review: "בדיקת התשובות",
    seeMatches: "הצגת נכסים מתאימים",
    matchCount: "{count} נכסים מתאימים",
    noMatches: "עדיין אין נכסים מתאימים, אבל מתווך עדיין יכול לעזור.",
    summaryTitle: "התשובות שלכם",
    changeAnswers: "שינוי התשובות",
    shortlistTitle: "קבלו רשימה מותאמת ממתווך",
    shortlistIntro: "מתווך שמדבר בשפה שלכם בוחר עבורכם נכסים ויוצר אתכם קשר.",
    shortlistSubmit: "בקשת רשימה מותאמת",
    shortlistSent: "הבקשה נשלחה. מתווך ייצור אתכם קשר עם רשימה מותאמת.",
    formUnavailable: "הטופס אינו זמין זמנית. התקשרו או שלחו לנו הודעה ומתווך יעזור.",
    widenTitle: "נסו חיפוש רחב יותר",
    widen: { price: "בלי הגבלת תקציב", bedrooms: "כל מספר חדרי שינה", type: "כל סוג נכס", area: "בכל מקום שבו אנחנו פועלים" },
    alertTitle: "עדכנו אותי על נכסים חדשים",
    alertIntro: "נכתוב לכם ברגע שיופיע נכס שמתאים לקריטריונים האלה.",
    alertSubmit: "הפעלת התראות",
    alertSent: "ההתראות פעילות. נכתוב לכם כשיימצא נכס מתאים.",
    comingSoon: "בקרוב",
    planTrip: "תכנון נסיעת ביקורים",
    planTripNote: "הזמנת יומיים או שלושה ימי ביקורים באינטרנט נמצאת בהכנה. עד אז מתווך מארגן אותם בטלפון.",
    financingOptions: "הצגת אפשרויות מימון",
    financingOptionsNote: "רשימת שותפי מימון נמצאת בהכנה. עד אז מתווך עובר אתכם על האפשרויות.",
    sending: "שולח...",
  },
};

// The onboarding area tiles. Only areas that exist in the geography catalog
// or registry may appear here; renderStartPage verifies every id. Each tile
// maps to the search filter the results page already understands, so the
// finish step lands on real matches. `location` is the English requirement
// label the broker sees on the shortlist lead.
const START_AREAS = Object.freeze([
  { id: "sandanski", search: { geography_id: "BG:municipality:BLG40" }, location: "Sandanski" },
  { id: "bansko", search: { geography_id: "BG:municipality:BLG01" }, location: "Bansko" },
  { id: "blagoevgrad_district", search: { region_id: "BG:district:BLG" }, location: "Blagoevgrad district" },
  // The agency's coastal office is in Sveti Vlas (Burgas district), which is
  // the only coastal scope the geography registry can express as one filter.
  { id: "black_sea_coast", search: { region_id: "BG:district:BGS" }, location: "Black Sea coast" },
  { id: "greece", search: { country_code: "GR" }, location: "Greece" },
]);
const START_OFFER_TYPES = Object.freeze(["sale", "rent"]);
const START_CITIZENSHIPS = Object.freeze(["eu", "non_eu"]);
const START_FINANCING = Object.freeze(["cash", "mortgage"]);
const START_TIMELINES = Object.freeze(["soon", "year", "browsing"]);
const START_BEDROOMS = Object.freeze([1, 2, 3, 4]);
const START_PRICE_PRESETS = Object.freeze({
  sale: [50000, 75000, 100000, 150000, 200000, 300000, 500000, 750000, 1000000],
  rent: [300, 400, 500, 700, 1000, 1500, 2000],
});
// English vocabulary for the broker-facing lead message and requirements
// (the admin workbench reads bg, ru and en; the lead keeps the visitor's
// language separately).
const START_LEAD_LABELS = Object.freeze({
  prefix: "Buyer onboarding",
  offer: { sale: "buy", rent: "rent" },
  citizenship: { eu: "EU or EEA citizen", non_eu: "non-EU citizen" },
  financing: { cash: "cash buyer", mortgage: "needs financing" },
  timelines: { soon: "Within 3 months", year: "Within a year", browsing: "Just looking" },
});

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
    description: "Изпратете запитване или заявка за обратно обаждане към екипа на MS Realty. За обратно обаждане посочете име, телефон и предпочитано време.",
    form_unavailable: "Формата е временно недостъпна. Обадете се или ни пишете, отговаряме бързо.",
    search_unavailable_title: "Търсенето е временно недостъпно",
    search_unavailable_description: "Работим по него. Обадете се или разгледайте страниците ни, брокерът ще помогне веднага.",
  },
  en: {
    title: "Contact MS Realty",
    h1: "Contact a broker",
    description: "Send a question or callback request to the MS Realty team.",
    form_unavailable: "The form is temporarily unavailable. Call or message us instead. We reply quickly.",
    search_unavailable_title: "Search is temporarily unavailable",
    search_unavailable_description: "We are working on it. Call us or browse our pages. A broker will help right away.",
  },
  de: {
    title: "MS Realty kontaktieren",
    h1: "Makler kontaktieren",
    description: "Senden Sie eine Frage oder Rückrufanfrage an das MS Realty Team.",
    form_unavailable: "Das Formular ist vorübergehend nicht verfügbar. Rufen Sie uns an oder schreiben Sie uns.",
    search_unavailable_title: "Die Suche ist vorübergehend nicht verfügbar",
    search_unavailable_description: "Wir arbeiten daran. Rufen Sie uns an, ein Makler hilft sofort.",
  },
  nl: {
    title: "Neem contact op met MS Realty",
    h1: "Neem contact op met een makelaar",
    description: "Stuur een vraag of terugbelverzoek naar het MS Realty team.",
    form_unavailable: "Het formulier is tijdelijk niet beschikbaar. Bel of stuur ons een bericht.",
    search_unavailable_title: "Zoeken is tijdelijk niet beschikbaar",
    search_unavailable_description: "We werken eraan. Bel ons, een makelaar helpt direct.",
  },
  ru: {
    title: "Связаться с MS Realty",
    h1: "Связаться с брокером",
    description: "Отправьте вопрос или запрос на обратный звонок команде MS Realty.",
    form_unavailable: "Форма временно недоступна. Позвоните или напишите нам, мы быстро отвечаем.",
    search_unavailable_title: "Поиск временно недоступен",
    search_unavailable_description: "Мы работаем над этим. Позвоните нам, брокер поможет сразу.",
  },
  el: {
    title: "Επικοινωνία με τη MS Realty",
    h1: "Επικοινωνήστε με μεσίτη",
    description: "Στείλτε ερώτηση ή αίτημα επανάκλησης στην ομάδα της MS Realty.",
    form_unavailable: "Η φόρμα δεν είναι προσωρινά διαθέσιμη. Καλέστε μας ή στείλτε μήνυμα.",
    search_unavailable_title: "Η αναζήτηση δεν είναι προσωρινά διαθέσιμη",
    search_unavailable_description: "Εργαζόμαστε πάνω σε αυτό. Καλέστε μας, ένας μεσίτης θα βοηθήσει άμεσα.",
  },
  he: {
    title: "יצירת קשר עם MS Realty",
    h1: "יצירת קשר עם מתווך",
    description: "שלחו שאלה או בקשה לשיחה חוזרת לצוות MS Realty.",
    form_unavailable: "הטופס אינו זמין זמנית. התקשרו או שלחו לנו הודעה.",
    search_unavailable_title: "החיפוש אינו זמין זמנית",
    search_unavailable_description: "אנחנו עובדים על זה. התקשרו אלינו, מתווך יעזור מיד.",
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
    buyerGuides: "Ръководства за купувачи",
    explore: "Разгледайте",
    getInTouch: "Свържете се",
    tagline:
      "Имоти за продажба и под наем в Сандански и Пирин, по Черноморието и в съседна Гърция, с местни офиси и брокери, които говорят вашия език.",
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
      "Properties for sale and rent in Sandanski and the Pirin mountains, along the Black Sea coast, and in neighbouring Greece, with local offices and brokers who speak your language.",
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
    buyerGuides: "Ratgeber für Käufer",
    explore: "Entdecken",
    getInTouch: "Kontakt aufnehmen",
    tagline:
      "Immobilien zum Kauf und zur Miete in Sandanski und im Pirin-Gebirge, an der Schwarzmeerküste und im benachbarten Griechenland, mit lokalen Büros und Maklern, die Ihre Sprache sprechen.",
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
    buyerGuides: "Kopersgidsen",
    explore: "Ontdekken",
    getInTouch: "Neem contact op",
    tagline:
      "Vastgoed te koop en te huur in Sandanski en het Pirin-gebergte, aan de Zwarte Zeekust en in buurland Griekenland, met lokale kantoren en makelaars die uw taal spreken.",
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
    buyerGuides: "Руководства для покупателей",
    explore: "Обзор",
    getInTouch: "Связаться с нами",
    tagline:
      "Недвижимость для покупки и аренды в Сандански и горах Пирин, на черноморском побережье и в соседней Греции, с местными офисами и брокерами, говорящими на вашем языке.",
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
    buyerGuides: "Οδηγοί αγοραστή",
    explore: "Εξερευνήστε",
    getInTouch: "Επικοινωνήστε",
    tagline:
      "Ακίνητα προς πώληση και ενοικίαση στο Σαντάνσκι και τον Πιρίν, στις ακτές της Μαύρης Θάλασσας και στη γειτονική Ελλάδα, με τοπικά γραφεία και μεσίτες που μιλούν τη γλώσσα σας.",
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
    buyerGuides: "מדריכי רוכשים",
    explore: "גלו עוד",
    getInTouch: "יצירת קשר",
    tagline:
      "נכסים למכירה ולהשכרה בסנדנסקי ובהרי פירין, לאורך חוף הים השחור וביוון השכנה, עם משרדים מקומיים ומתווכים שמדברים בשפה שלכם.",
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

const BRAND_CONTACT = {
  email: "office@makler-realty.com",
  // Agency line verified against the live legacy site (makler-realty.com
  // header/footer, 2026-08-09); reachable on WhatsApp and Viber.
  phone: "+359879696870",
  phone_display: "+359 879 69 68 70",
  whatsapp: "https://wa.me/359879696870",
  viber: "viber://chat?number=%2B359879696870",
};

// Office towns as listed in the site chrome (CHROME_COPY.offices, verified
// against the legacy site header/footer). Canonical names feed the location
// filter; display names are localized per public locale.
const AGENCY_OFFICES = ["Sandanski", "Bansko", "Sveti Vlas"];

export function chromeCopyFor(localeCode) {
  return CHROME_COPY[localeCode] || CHROME_COPY.en;
}

export function leadWritesDisabledFromEnv(env = process.env) {
  return !isLeadDurableStoreEnabled(leadDurableStoreConfigFromEnv(env));
}

function publicChrome(
  registry,
  locale,
  {
    hreflang = [],
    active = null,
    locations = [],
    currentPath = null,
    leadWritesDisabled = leadWritesDisabledFromEnv(),
  } = {},
) {
  const copy = chromeCopyFor(locale.code);
  const labels = labelsFor(locale.code);
  const searchBase = `/${locale.code}/${locale.route_segments.search}`;
  const guideLinks = approvedGuideLinksFor(locale.code, currentPath);
  const alternates = new Map(
    (hreflang || []).filter((link) => link.hreflang !== "x-default").map((link) => [link.hreflang, link.href]),
  );
  const indexableLocales = publicIndexableLocales(registry);
  const listingAlternates = indexableLocales.filter((entry) => alternates.has(entry.code));
  // Listing pages keep visitors on approved translations of the same listing.
  // A listing without any approved translation must still offer every public
  // language (at its home page) instead of hiding the switcher altogether.
  const languageLocales = active === "listing" && listingAlternates.length ? listingAlternates : indexableLocales;
  return {
    copy,
    lead_writes_disabled: leadWritesDisabled,
    home: { href: homePath(registry, locale.code), label: "MS Realty" },
    nav: [
      { id: "buy", href: searchBase, label: copy.navBuy, active: active === "search" || active === "listing" || active === "location" },
      { id: "rent", href: `${searchBase}?offer_type=rent`, label: copy.navRent, active: false },
      { id: "sell", href: sellerPath(registry, locale.code), label: copy.navSell, active: active === "seller" },
      { id: "contact", href: contactPath(registry, locale.code), label: copy.navContact, active: active === "contact" },
    ],
    languages: languageLocales.map((entry) => ({
      code: entry.code,
      label: entry.native_name || entry.code.toUpperCase(),
      href: alternates.get(entry.code) || homePath(registry, entry.code),
      active: entry.code === locale.code,
      dir: entry.direction || "ltr",
    })),
    contact: { ...BRAND_CONTACT, path: contactPath(registry, locale.code), label: copy.navContact, offices: copy.offices },
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
  const localizedView = { ...view, location: localizedLocationForView(localeCode, view) };
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

function startCopy(localeCode) {
  return START_COPY[localeCode] || START_COPY.en;
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

function searchListingPath(registry, localeCode, listing) {
  const projected = String(listing.locale_path || "").trim();
  if (projected.startsWith("/") && !projected.startsWith("//") && !/[\\?#\u0000-\u001f]/u.test(projected)) return projected;
  return listingPath(registry, localeCode, listing.id);
}

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
  const path = searchListingPath(registry, locale.code, listing);
  return {
    id: listing.id,
    title: copy.title,
    path,
    review_badge: reviewedTranslation ? "reviewed_translation" : null,
    translation_display: state.display,
    translation_locale: state.translation?.locale || locale.code,
    translation_status: state.translation?.status || "missing",
    translation_indexable: state.indexable,
    translation_human_approved: state.translation?.human_approved === true,
    source_locale: listing.locale,
    content_locale: copyLocale,
    location: localizedLocationForView(locale.code, view),
    property_type: view.property_type,
    property_type_label: localizedListingValue(locale.code, "property_type", view.property_family || view.property_type),
    offer_type: view.offer_type,
    offer_type_label: localizedListingValue(locale.code, "offer_type", view.offer_type),
    bedrooms: view.bedrooms,
    bedrooms_not_applicable: view.bedrooms_not_applicable,
    area_sqm: view.area_sqm,
    land_area_sqm: view.land_area_sqm,
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
      detail: { label: ui.details, href: path },
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
  const source = [
    view.id,
    view.title,
    view.h1,
    view.description,
    view.location,
    view.location_native,
    view.municipality,
    view.district,
    view.region,
    view.country_code,
    view.property_type,
    view.offer_type,
  ].join(" ");
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

function listingGeographyIds(view) {
  const ids = new Set(Array.isArray(view.geography_path) ? view.geography_path : []);
  if (view.geography_id) {
    ids.add(view.geography_id);
    if (!view.geography_path?.length) {
      for (const area of geographyRegistryAncestors(publicGeographyRegistry(), view.geography_id)) ids.add(area.id);
    }
  }
  if (view.country_code === "BG") {
    if (view.district_code) ids.add(`BG:district:${view.district_code}`);
    if (view.municipality_code) ids.add(`BG:municipality:${view.municipality_code}`);
    if (view.settlement_ekatte) ids.add(`BG:settlement:${view.settlement_ekatte}`);
  }
  return ids;
}

function matchesGeography(view, areaId) {
  if (!areaId) return true;
  const area = geographyRegistryArea(publicGeographyRegistry(), areaId);
  return Boolean(area && area.country_code === view.country_code && listingGeographyIds(view).has(area.id));
}

function officialAreaMaps(views, filters) {
  const nonGeographicFilters = { ...filters };
  for (const key of ["country_code", "location", "geography_id", "region_id", "municipality", "district"]) {
    delete nonGeographicFilters[key];
  }
  const facetViews = views.filter((view) => matchesSearch(view, "", nonGeographicFilters));
  const facetGeographyIds = facetViews.map(listingGeographyIds);
  const selectedIds = new Set();
  for (const areaId of [filters.region_id, filters.geography_id].filter(Boolean)) {
    for (const area of geographyRegistryAncestors(publicGeographyRegistry(), areaId)) selectedIds.add(area.id);
  }
  return AREA_MAP.countries.map((country) => ({
    ...country,
    areas: country.areas.map((area) => {
      const count = facetGeographyIds.filter((ids) => ids.has(area.id)).length;
      return { ...area, count, selected: selectedIds.has(area.id) };
    }),
  }));
}

function matchesSearch(view, query, filters = {}) {
  const text = searchableText(view);
  if (!queryTokens(query).every((variants) => variants.some((token) => text.includes(token)))) return false;
  if (filters.exact_reference && norm(view.id) !== norm(filters.exact_reference)) return false;
  if (filters.location && !includesSearchValue([view.location, view.location_native, view.country_code].join(" "), filters.location)) return false;
  if (filters.country_code && view.country_code !== String(filters.country_code).toUpperCase()) return false;
  if (!matchesGeography(view, filters.region_id) || !matchesGeography(view, filters.geography_id)) return false;
  if (
    filters.municipality &&
    (!view.geography_id || norm(view.municipality) !== norm(filters.municipality))
  ) {
    return false;
  }
  if (filters.district && norm(view.district) !== norm(filters.district)) return false;
  if (filters.property_family && norm(view.property_family || view.property_type) !== norm(filters.property_family)) return false;
  if (filters.property_type && norm(view.property_type) !== norm(filters.property_type)) return false;
  if (filters.property_subtype && norm(view.property_subtype) !== norm(filters.property_subtype)) return false;
  if (filters.offer_type && norm(view.offer_type) !== norm(filters.offer_type)) return false;
  if (filters.status && norm(view.listing_status) !== norm(filters.status)) return false;
  if (!numberFilter(view.price_eur, filters.price_min, filters.price_max)) return false;
  if (!numberFilter(view.bedrooms ?? view.bedrooms_count, filters.bedrooms_min, filters.bedrooms_max)) return false;
  if (!numberFilter(view.premises_count, filters.premises_min, undefined)) return false;
  if (!numberFilter(view.hotel_room_count, filters.hotel_rooms_min, undefined)) return false;
  if (!numberFilter(view.primary_area_sqm ?? view.area_sqm, filters.area_min, filters.area_max)) return false;
  if (!numberFilter(view.land_area_sqm, filters.land_area_min, filters.land_area_max)) return false;
  if (!numberFilter(view.floor ?? view.floor_number, filters.floor_min, filters.floor_max)) return false;
  if (!numberFilter(view.storeys_count, filters.storeys_min, filters.storeys_max)) return false;
  if (filters.parking_kind && norm(view.parking_kind) !== norm(filters.parking_kind)) return false;
  if (filters.construction_status && norm(view.construction_status) !== norm(filters.construction_status)) return false;
  if (filters.has_approved_tour && view.tour?.is_public !== true) return false;
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
  const approvedBrokerContact = isPublicBrokerContact(brokerContact) ? brokerContact : null;
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
      review_status: approvedBrokerContact ? "approved_broker_contact" : "needs_broker_contact_review",
      broker: approvedBrokerContact?.broker || null,
      reviewer: approvedBrokerContact?.reviewer || null,
      channels: ["phone", "whatsapp", "viber"].map((channel) => ({
        id: channel,
        label: contactChannelLabel(channel, labels),
        enabled: Boolean(approvedBrokerContact?.channels?.[channel]),
        href: approvedBrokerContact?.channels?.[channel] || null,
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
        location: localizedLocationForView(locale.code, view),
        property_type: view.property_family || view.property_type,
        property_family: view.property_family || view.property_type,
        offer_type: view.offer_type,
        bedrooms: view.bedrooms,
        bedrooms_not_applicable: view.bedrooms_not_applicable === true,
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
  view = "list",
  databasePage = false,
  totalMatches = null,
}) {
  const resolved = resolvePublicLocale(registry, localeCode);
  const locale = resolved.locale;
  const ui = uiCopyFor(locale.code);
  const labels = labelsFor(locale.code);
  const searchIntent = normalizeSearchIntent(
    {
      ...filters,
      locale: locale.code,
      q: query,
      sort,
      page,
      ...(pageSize === null ? {} : { page_size: pageSize }),
    },
    { defaultLocale: locale.code },
  );
  const intentFilters = Object.fromEntries(
    Object.entries(searchIntentToQueryFilters(searchIntent)).filter(([, value]) => value !== "" && value !== null && value !== undefined),
  );
  const activeListings = listings.filter(isActiveListing);
  const localeMatches = activeListings.filter((listing) => listing.locale === locale.code);
  const fallbackMatches = activeListings.filter(
    (listing) => listing.locale === (locale.fallback_locale || registry.source_locale) || listing.locale === registry.source_locale,
  );
  const searchableListings = localeMatches.length ? localeMatches : fallbackMatches;
  const filterViews = searchableListings.map((listing) => listingToPublicViewModel(listing));
  const catalogDistricts = GEOGRAPHY_CATALOG.areas
    .filter((area) => area.country_code === "BG" && area.level === "district")
    .map((area) => area.names.en);
  const filterOptions = {
    countries: GEOGRAPHY_CATALOG.countries.map((country) => ({
      code: country.code,
      names: country.names,
    })),
    regions: GEOGRAPHY_CATALOG.areas
      .filter((area) => (area.country_code === "BG" && area.level === "district") || (area.country_code === "GR" && area.level === "region"))
      .map((area) => ({
        id: area.id,
        country_code: area.country_code,
        level: area.level,
        official_code: area.official_code,
        names: area.names,
      }))
      .sort((left, right) =>
        localizedSearchFilterValue(locale.code, "region_id", left.id).localeCompare(
          localizedSearchFilterValue(locale.code, "region_id", right.id),
      ),
    ),
    locations: [...new Set(filterViews.map((listing) => listing.location).filter(Boolean))].sort(),
    municipalities: [
      ...new Set(
        filterViews
          .filter((listing) => listing.country_code === "BG" && listing.location_review_status === "confirmed_settlement")
          .map((listing) => listing.municipality)
          .filter(Boolean),
      ),
    ].sort((left, right) => localizedLocationValue(locale.code, left).localeCompare(localizedLocationValue(locale.code, right))),
    districts: [...new Set([...catalogDistricts, ...filterViews.filter((listing) => listing.country_code === "BG").map((listing) => listing.district).filter(Boolean)])].sort(
      (left, right) => localizedSearchFilterValue(locale.code, "district", left).localeCompare(localizedSearchFilterValue(locale.code, "district", right)),
    ),
    property_families: [...CANONICAL_PROPERTY_FAMILIES],
    property_types: [...CANONICAL_PROPERTY_FAMILIES],
    property_subtypes: [...new Set(filterViews.map((listing) => listing.property_subtype).filter(Boolean))].sort(),
    offer_types: [...new Set(filterViews.map((listing) => listing.offer_type).filter(Boolean))].sort(),
    price_presets: {
      sale: [50000, 75000, 100000, 150000, 200000, 300000, 500000, 750000, 1000000],
      rent: [300, 400, 500, 700, 1000, 1500, 2000],
    },
    bedrooms: [...new Set(filterViews.map((listing) => listing.bedrooms ?? listing.bedrooms_count).filter((value) => Number.isInteger(value) && value >= 0))].sort((left, right) => left - right),
    premises: [...new Set(filterViews.map((listing) => listing.premises_count).filter((value) => Number.isInteger(value) && value >= 0))].sort((left, right) => left - right),
    hotel_rooms: [...new Set(filterViews.map((listing) => listing.hotel_room_count).filter((value) => Number.isInteger(value) && value >= 0))].sort((left, right) => left - right),
  };
  const selectedFamilies = searchIntent.property_families;
  const selectedSubtype = searchIntent.property_subtypes[0] || null;
  const familyScopedFacts = new Set(["premises_count", "hotel_room_count", "land_area_sqm", "floor_number", "storeys_count"]);
  const applicable = (field) => {
    if (!selectedFamilies.length) return !familyScopedFacts.has(field);
    return selectedFamilies.every((family) => isFactApplicable(family, field, selectedSubtype));
  };
  const applicableFilterFields = [
    "property_subtype",
    "bedrooms_min",
    "premises_min",
    "hotel_rooms_min",
    "area_min",
    "area_max",
    "land_area_min",
    "land_area_max",
    "floor_min",
    "floor_max",
    "storeys_min",
    "storeys_max",
  ].filter((field) => {
    if (!selectedFamilies.length && field === "property_subtype") return false;
    const fact = {
      bedrooms_min: "bedrooms_count",
      premises_min: "premises_count",
      hotel_rooms_min: "hotel_room_count",
      land_area_min: "land_area_sqm",
      land_area_max: "land_area_sqm",
      floor_min: "floor_number",
      floor_max: "floor_number",
      storeys_min: "storeys_count",
      storeys_max: "storeys_count",
    }[field];
    return !fact || applicable(fact);
  });
  if (databasePage && (!Number.isSafeInteger(totalMatches) || totalMatches < 0)) {
    throw new Error("Database search page requires a non-negative integer total");
  }
  const matchedListings = databasePage
    ? searchableListings
    : searchableListings.filter((listing) => matchesSearch(listingToPublicViewModel(listing), searchIntent.text_query, intentFilters));
  const selectedSort = publicSearchSort(searchIntent.sort);
  const selectedView = !savedView && view === "map" ? "map" : "list";
  const sortedListings = databasePage ? matchedListings : sortListingsForPublicSearch(matchedListings, selectedSort);
  const requestedPage = Number(page);
  const normalizedPage = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const requestedPageSize = savedView || pageSize === null ? Math.max(sortedListings.length, 1) : Number(pageSize);
  const normalizedPageSize = Number.isInteger(requestedPageSize) && requestedPageSize > 0 ? Math.min(requestedPageSize, 1000) : 12;
  const matchedTotal = databasePage ? totalMatches : sortedListings.length;
  const totalPages = Math.max(1, Math.ceil(matchedTotal / normalizedPageSize));
  const currentPage = databasePage ? normalizedPage : Math.min(normalizedPage, totalPages);
  const offset = (currentPage - 1) * normalizedPageSize;
  const cards = (databasePage ? sortedListings : sortedListings.slice(offset, offset + normalizedPageSize)).map((listing) =>
    listingCard(registry, listing, locale),
  );
  const activeFilterChips = [
    "exact_reference",
    "location",
    "country_code",
    "geography_id",
    "region_id",
    "municipality",
    "district",
    "property_family",
    "property_subtype",
    "offer_type",
    "price_min",
    "price_max",
    "bedrooms_min",
    "bedrooms_max",
    "premises_min",
    "hotel_rooms_min",
    "area_min",
    "area_max",
    "land_area_min",
    "land_area_max",
    "floor_min",
    "floor_max",
    "storeys_min",
    "storeys_max",
    "status",
  ]
    .map((key) => ({ key, value: intentFilters[key], active: intentFilters[key] !== undefined && intentFilters[key] !== "" }))
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
      // This is an official-area browser, not a property-pin map. Listing
      // coordinates remain private until individually reviewed.
      map_optional: true,
      sticky_contact_actions: true,
      minimum_tap_target_px: 44,
    },
    chrome: publicChrome(registry, locale, { active: savedView ? "saved" : "search" }),
    search: {
      saved_view: savedView === true,
      engines: ["postgres"],
      intent: searchIntent,
      query: searchIntent.text_query,
      sort: selectedSort,
      view: selectedView,
      filters: {
        locale: locale.code,
        public_enabled: true,
        indexable: true,
        ...intentFilters,
      },
      total_matches: matchedTotal,
      returned: cards.length,
      pagination: {
        page: currentPage,
        per_page: normalizedPageSize,
        total_pages: totalPages,
        has_previous: currentPage > 1,
        has_next: currentPage < totalPages,
      },
      controls: {
        view_modes: [
          { id: "list", label: ui.list, default: selectedView === "list" },
          { id: "map", label: ui.map, default: selectedView === "map" },
        ],
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
            query: searchIntent.text_query,
            filters: { ...intentFilters },
            search_intent: searchIntent,
            source: "website_search",
          },
        },
        active_filter_chips: activeFilterChips,
        filter_options: filterOptions,
        area_maps: selectedView === "map" ? officialAreaMaps(filterViews, intentFilters) : [],
        area_map_source: AREA_MAP.source,
        applicable_filter_fields: applicableFilterFields,
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
  const locations = publicLocationNames(listings)
    .map((location) => {
      const page = renderLocationPage({ registry, localeCode: locale.code, location, listings });
      return page.status === 200
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
        // Keep the home hero and the catalog on one filter contract. The
        // client may progressively disclose these controls, while the GET
        // form remains usable without JavaScript.
        controls: search.search.controls,
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
      // "How buying works" hands off to the buyer onboarding flow. The locale
      // registry gains a localized `start` segment with that route; until it
      // lands the default segment keeps the link stable.
      start: {
        path: `/${locale.code}/${locale.route_segments.start || "start"}`,
        label: labelsFor(locale.code).startSearch,
      },
      guides: chrome.resources,
      // Approved guides exist per locale. Where this language has none, the
      // home rail says so and points at the English originals instead of
      // hiding the section (no machine translation, no invented copy).
      guides_alternate: chrome.resources ? null : { locale: "en", links: approvedGuideLinksFor("en") },
      locations,
    },
    cards: search.cards.slice(0, 6),
  };
}

export function renderContactPage({
  registry,
  localeCode,
  // The UI uses the same durable-store readiness predicate as the API and
  // Worker edge. MCP automation remains independently disabled.
  leadWritesDisabled = leadWritesDisabledFromEnv(),
} = {}) {
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
    chrome: publicChrome(registry, locale, {
      hreflang: resolved.available ? hreflangForContact(registry) : [],
      active: "contact",
      leadWritesDisabled,
    }),
    body: {
      h1: copy.h1,
      intro: copy.description,
      contact_channels: {
        phone: { href: `tel:${BRAND_CONTACT.phone}`, label: BRAND_CONTACT.phone_display },
        whatsapp: { href: BRAND_CONTACT.whatsapp, label: "WhatsApp" },
        viber: { href: BRAND_CONTACT.viber, label: "Viber" },
        email: { href: `mailto:${BRAND_CONTACT.email}`, label: BRAND_CONTACT.email },
      },
      offices: AGENCY_OFFICES.map((location) => ({
        id: location.toLowerCase().replace(/\s+/g, "-"),
        location,
        name: localizedLocationValue(locale.code, location),
        search_path: `/${locale.code}/${locale.route_segments.search}?location=${encodeURIComponent(location)}`,
        map_href: `https://www.openstreetmap.org/search?query=${encodeURIComponent(`${location}, Bulgaria`)}`,
      })),
      form_unavailable: leadWritesDisabled ? copy.form_unavailable : null,
      callback: leadWritesDisabled
        ? null
        : {
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

export function renderSearchUnavailablePage({ registry, localeCode }) {
  const resolved = resolvePublicLocale(registry, localeCode);
  const locale = resolved.locale;
  const copy = contactCopy(locale.code);
  const path = `/${locale.code}/${locale.route_segments.search}`;
  return {
    kind: "search_unavailable",
    status: 503,
    requested_locale: localeCode,
    locale: locale.code,
    lang: locale.code,
    dir: locale.direction,
    path,
    canonical: path,
    indexable: false,
    metadata: {
      title: copy.search_unavailable_title,
      description: copy.search_unavailable_description,
      robots: "noindex,follow",
    },
    hreflang: [],
    chrome: publicChrome(registry, locale, { active: "search" }),
    body: {
      h1: copy.search_unavailable_title,
      intro: copy.search_unavailable_description,
      contact_channels: {
        phone: { href: `tel:${BRAND_CONTACT.phone}`, label: BRAND_CONTACT.phone_display },
        whatsapp: { href: BRAND_CONTACT.whatsapp, label: "WhatsApp" },
      },
      ctas: {
        contact: { path: contactPath(registry, locale.code) },
        seller: { path: sellerPath(registry, locale.code) },
      },
    },
  };
}

export function renderGuidePage({ registry, localeCode, path, documents }) {
  const resolved = resolvePublicLocale(registry, localeCode);
  const locale = resolved.locale;
  const docs = documents.filter((doc) => isPublishableGuide(doc) && doc.locale === locale.code);
  const first = docs[0];
  if (!first) return renderNotFoundPage({ registry, path });
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

export function renderLegacyArchivePage({ registry, entry, path }) {
  const locale = resolvePublicLocale(registry, registry.source_locale).locale;
  const title = "Архив от предишния сайт | MS Realty";
  return {
    kind: "legacy_archive",
    status: 200,
    locale: locale.code,
    lang: locale.code,
    dir: locale.direction,
    path,
    canonical: path,
    indexable: false,
    metadata: {
      title,
      description: "Историческо съдържание, запазено от предишния сайт на MS Realty.",
      robots: "noindex,nofollow",
    },
    hreflang: [],
    schema: null,
    chrome: publicChrome(registry, locale, { active: null }),
    body: {
      h1: "Архив от предишния сайт",
      notice: "Текстът по-долу е запазен от предишния сайт и не е превеждан, редактиран или потвърждаван като актуален.",
      text: entry.extracted_body_text,
      source: {
        url: entry.source_url,
        domain: entry.source_domain,
        type: entry.source_type,
        captured_at_utc: entry.captured_at_utc,
        text_sha256: entry.text_sha256,
      },
    },
  };
}

const LISTING_PRESERVATION_COPY = {
  bg: {
    archived: {
      title: "Архивирана обява | MS Realty",
      h1: "Тази обява вече не е активна",
      notice: "Запазваме този адрес за коректна история на сайта. Обявата е архивирана и не участва в активното търсене.",
    },
    active: {
      title: "Обява в проверка | MS Realty",
      h1: "Тази обява се проверява",
      notice: "Обявата е била активна при фиксирането на каталога, но фактите и публикуването ѝ още не са одобрени.",
    },
    reference: "Референция",
    checked: "Проверено на",
    contact: "Свържете се с брокер",
  },
  ru: {
    archived: {
      title: "Архивное объявление | MS Realty",
      h1: "Это объявление больше не активно",
      notice: "Мы сохраняем этот адрес для корректной истории сайта. Объявление архивировано и не участвует в активном поиске.",
    },
    active: {
      title: "Объявление на проверке | MS Realty",
      h1: "Это объявление проверяется",
      notice: "Объявление было активно на момент фиксации каталога, но его факты и публикация ещё не одобрены.",
    },
    reference: "Референция",
    checked: "Проверено",
    contact: "Связаться с брокером",
  },
};

export function renderListingPreservationPage({ registry, entry, path }) {
  const locale = resolvePublicLocale(registry, entry.source_locale).locale;
  const copy = LISTING_PRESERVATION_COPY[locale.code] || LISTING_PRESERVATION_COPY.bg;
  const stateCopy = copy[entry.catalog_state] || copy.archived;
  return {
    kind: "listing_preservation",
    status: 200,
    locale: locale.code,
    lang: locale.code,
    dir: locale.direction,
    path,
    canonical: path,
    indexable: false,
    metadata: {
      title: stateCopy.title,
      description: stateCopy.notice,
      robots: "noindex,follow",
    },
    hreflang: [],
    schema: null,
    chrome: publicChrome(registry, locale, { active: null, currentPath: path }),
    body: {
      h1: stateCopy.h1,
      notice: stateCopy.notice,
      reference: { label: copy.reference, value: entry.id },
      checked_at: { label: copy.checked, value: entry.checked_at },
      catalog_state: entry.catalog_state,
      contact: { label: copy.contact, path: contactPath(registry, locale.code) },
    },
  };
}

function locationPageCopy(localeCode, location) {
  const bgDescriptions = {
    Сандански: "Проверени обяви на MS Realty в Сандански и официални източници за кадастър, Имотен регистър и удостоверения.",
    Хотово: "Проверени обяви на MS Realty в Хотово. Община Сандански посочва, че селото е в западното подножие на Среден Пирин.",
    Петрич: "Проверени обяви на MS Realty в Петрич. Община Петрич посочва, че територията ѝ е в южната част на Санданско-Петричката котловина.",
  };
  const copy = {
    bg: {
      title: `Имоти в ${location} | MS Realty`,
      description: bgDescriptions[location] || `Проверени обяви на MS Realty за имоти в ${location}.`,
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
  const localizedMatches = listings.filter((listing) => {
    const view = listingToPublicViewModel(listing);
    return matchesPublicLocationScope(view, location) && isActiveListing(listing) && indexableListingForLocale(registry, listing, locale);
  });
  const fallbackLocale = locale.fallback_locale || registry.source_locale;
  const fallbackMatches = listings.filter((listing) => {
    const view = listingToPublicViewModel(listing);
    return (
      matchesPublicLocationScope(view, location) &&
      isActiveListing(listing) &&
      (listing.locale === fallbackLocale || listing.locale === registry.source_locale)
    );
  });
  const matchedListings = localizedMatches.length ? localizedMatches : fallbackMatches;
  const path = locationPath(registry, locale.code, location);
  const indexable = resolved.available && localizedMatches.length > 0;
  const hasInventory = matchedListings.length > 0;
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
        return matchesPublicLocationScope(view, location) && isActiveListing(listing) && indexableListingForLocale(registry, listing, candidate);
      }),
    )
    .map((candidate) => candidate.code);

  return {
    kind: "location",
    status: hasInventory ? 200 : 404,
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

export function renderSellerPage({
  registry,
  localeCode,
  // Same durable-store readiness predicate the contact page, API, and Worker
  // edge use. Without it the seller page renders a live POST form that the
  // edge rejects, so the highest-intent seller lead ends on a generic error.
  leadWritesDisabled = leadWritesDisabledFromEnv(),
} = {}) {
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
    chrome: publicChrome(registry, locale, {
      hreflang: resolved.available ? hreflangForSeller(registry) : [],
      active: "seller",
      leadWritesDisabled,
    }),
    body: {
      h1: copy.h1,
      intro: copy.description,
      contact_channels: {
        phone: { href: `tel:${BRAND_CONTACT.phone}`, label: BRAND_CONTACT.phone_display },
        whatsapp: { href: BRAND_CONTACT.whatsapp, label: "WhatsApp" },
        viber: { href: BRAND_CONTACT.viber, label: "Viber" },
        email: { href: `mailto:${BRAND_CONTACT.email}`, label: BRAND_CONTACT.email },
      },
      form_unavailable: leadWritesDisabled ? copy.form_unavailable : null,
      valuation: leadWritesDisabled
        ? null
        : {
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
      callback: leadWritesDisabled
        ? null
        : {
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

function startParam(params, key) {
  if (!params) return "";
  const value = typeof params.get === "function" ? params.get(key) : params[key];
  if (value === undefined || value === null) return "";
  return String(Array.isArray(value) ? value[0] : value).trim();
}

// Answers arrive as the GET query of the onboarding form (no JavaScript) or as
// a plain object in tests. Unknown values fall back to "not answered".
function startAnswersFromParams(params) {
  const pick = (key, options) => {
    const value = startParam(params, key);
    return options.includes(value) ? value : "";
  };
  const price = startParam(params, "price_max");
  const bedrooms = startParam(params, "bedrooms_min");
  return {
    offer_type: pick("offer_type", START_OFFER_TYPES),
    property_family: pick("property_family", CANONICAL_PROPERTY_FAMILIES),
    area: pick(
      "area",
      START_AREAS.map((area) => area.id),
    ),
    price_max: /^\d{1,9}$/.test(price) && Number(price) > 0 ? Number(price) : null,
    bedrooms_min: /^[1-9]$/.test(bedrooms) ? Number(bedrooms) : null,
    citizenship: pick("citizenship", START_CITIZENSHIPS),
    financing: pick("financing", START_FINANCING),
    timeline: pick("timeline", START_TIMELINES),
  };
}

function startResidential(answers) {
  return !answers.property_family || isFactApplicable(answers.property_family, "bedrooms_count");
}

function startArea(answers) {
  return START_AREAS.find((area) => area.id === answers.area) || null;
}

// Every tile must resolve in the geography data the search already uses.
function assertStartAreas() {
  for (const area of START_AREAS) {
    for (const [key, value] of Object.entries(area.search)) {
      const known =
        key === "country_code"
          ? GEOGRAPHY_CATALOG.countries.some((country) => country.code === value)
          : Boolean(geographyRegistryArea(publicGeographyRegistry(), value));
      if (!known) throw new Error(`Buyer onboarding area ${area.id} points outside the geography catalog: ${value}`);
    }
  }
}

export function startSearchParams(answers) {
  const params = new URLSearchParams();
  if (answers.offer_type) params.set("offer_type", answers.offer_type);
  if (answers.property_family) params.set("property_family", answers.property_family);
  for (const [key, value] of Object.entries(startArea(answers)?.search || {})) params.set(key, value);
  if (answers.price_max) params.set("price_max", String(answers.price_max));
  // Plots, land, commercial space and hotels carry no bedroom count; a
  // bedroom filter on them would be rejected by the search request.
  if (answers.bedrooms_min && startResidential(answers)) params.set("bedrooms_min", String(answers.bedrooms_min));
  return params;
}

function startLeadType(answers) {
  if (answers.offer_type === "rent") return "renter";
  if (answers.citizenship === "non_eu") return "foreign_buyer";
  return "buyer";
}

function startLeadMessage(answers) {
  const area = startArea(answers);
  const parts = [
    START_LEAD_LABELS.offer[answers.offer_type] || "",
    answers.property_family || "",
    area ? area.location : "",
    answers.price_max ? `max EUR ${answers.price_max}` : "",
    answers.bedrooms_min && startResidential(answers) ? `${answers.bedrooms_min}+ bedrooms` : "",
    START_LEAD_LABELS.citizenship[answers.citizenship] || "",
    START_LEAD_LABELS.financing[answers.financing] || "",
    START_LEAD_LABELS.timelines[answers.timeline] || "",
  ].filter(Boolean);
  return parts.length ? `${START_LEAD_LABELS.prefix}: ${parts.join("; ")}` : START_LEAD_LABELS.prefix;
}

function startEuro(value, localeCode) {
  try {
    return new Intl.NumberFormat(localeCode, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(Number(value));
  } catch {
    return `€${Number(value).toLocaleString("en-US")}`;
  }
}

function startMatchCount(registry, localeCode, listings, params) {
  if (!Array.isArray(listings) || !listings.length) return 0;
  try {
    const page = renderSearchPage({ registry, localeCode, listings, query: "", filters: Object.fromEntries(params), pageSize: 1 });
    return Number(page.search?.total_matches) || 0;
  } catch {
    return null;
  }
}

// When the chosen filters return nothing, relax one dimension at a time and
// keep the variants that do have listings, so the visitor is never sent to an
// empty results page.
function startWidenSuggestions(registry, localeCode, listings, answers, copy, searchPathForLocale) {
  const candidates = [];
  if (answers.price_max) candidates.push({ id: "price", label: copy.widen.price, answers: { ...answers, price_max: null } });
  if (answers.bedrooms_min && startResidential(answers)) {
    candidates.push({ id: "bedrooms", label: copy.widen.bedrooms, answers: { ...answers, bedrooms_min: null } });
  }
  if (answers.property_family) candidates.push({ id: "type", label: copy.widen.type, answers: { ...answers, property_family: "" } });
  if (answers.area) {
    // Sandanski and Bansko are municipalities inside Blagoevgrad district, so
    // the district is the natural next step outwards; everything else widens
    // to the whole coverage area.
    const district = answers.area === "sandanski" || answers.area === "bansko";
    candidates.push({
      id: "area",
      label: district ? copy.areas.blagoevgrad_district : copy.widen.area,
      answers: { ...answers, area: district ? "blagoevgrad_district" : "" },
    });
  }
  const suggestions = [];
  for (const candidate of candidates) {
    const params = startSearchParams(candidate.answers);
    const count = startMatchCount(registry, localeCode, listings, params);
    if (!count) continue;
    suggestions.push({
      id: candidate.id,
      label: candidate.label,
      match_count: count,
      url: params.toString() ? `${searchPathForLocale}?${params.toString()}` : searchPathForLocale,
    });
    if (suggestions.length === 3) break;
  }
  return suggestions;
}

// "Start your search": a four-step buyer onboarding page that works as one GET
// form without JavaScript (the query renders the finish step server-side) and
// becomes a stepper with JavaScript. The finish step links to the locale
// search route with the chosen filters and offers an optional broker
// shortlist lead (name plus preferred contact) with source
// website_buyer_onboarding, using the same lead_writes_disabled fallback as
// the contact and seller pages.
export function renderStartPage({
  registry,
  localeCode,
  listings = [],
  searchParams = null,
  leadWritesDisabled = leadWritesDisabledFromEnv(),
} = {}) {
  assertStartAreas();
  const resolved = resolvePublicLocale(registry, localeCode);
  const locale = resolved.locale;
  const path = startPath(registry, locale.code);
  const searchPathForLocale = `/${locale.code}/${locale.route_segments.search}`;
  const labels = labelsFor(locale.code);
  const copy = startCopy(locale.code);
  const chromeCopy = chromeCopyFor(locale.code);
  const answers = startAnswersFromParams(searchParams);
  const answered = START_OFFER_TYPES.includes(startParam(searchParams, "offer_type"));
  const residential = startResidential(answers);
  const area = startArea(answers);
  const query = startSearchParams(answers);
  const searchUrl = query.toString() ? `${searchPathForLocale}?${query.toString()}` : searchPathForLocale;
  const hreflang = resolved.available ? hreflangForStart(registry) : [];
  const leadType = startLeadType(answers);
  const matchCount = answered ? startMatchCount(registry, locale.code, listings, query) : null;
  const summary = answered
    ? [
        { id: "offer_type", label: copy.buyOrRent, value: answers.offer_type === "rent" ? chromeCopy.navRent : chromeCopy.navBuy },
        {
          id: "property_family",
          label: copy.propertyType,
          value: answers.property_family ? localizedListingValue(locale.code, "property_type", answers.property_family) : copy.anyType,
        },
        { id: "area", label: labels.location, value: area ? copy.areas[area.id] : copy.anywhere },
        { id: "price_max", label: labels.maxPrice, value: answers.price_max ? startEuro(answers.price_max, locale.code) : labels.any },
        ...(residential
          ? [{ id: "bedrooms_min", label: labels.factLabels?.bedrooms || "Bedrooms", value: answers.bedrooms_min ? `${answers.bedrooms_min}+` : labels.any }]
          : []),
        ...(answers.citizenship ? [{ id: "citizenship", label: copy.citizenship, value: answers.citizenship === "eu" ? copy.eu : copy.nonEu }] : []),
        ...(answers.financing ? [{ id: "financing", label: copy.financing, value: answers.financing === "cash" ? copy.cash : copy.mortgage }] : []),
        ...(answers.timeline ? [{ id: "timeline", label: copy.timeline, value: copy.timelines[answers.timeline] }] : []),
      ]
    : [];

  return {
    kind: "start",
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
      // Query variants (the no-JavaScript finish step) stay out of the index;
      // the canonical points at the clean route.
      robots: resolved.available && !answered ? "index,follow" : "noindex,follow",
    },
    hreflang,
    chrome: publicChrome(registry, locale, { hreflang, active: "start", leadWritesDisabled }),
    body: {
      h1: copy.h1,
      intro: copy.intro,
      copy,
      state: answered ? "finish" : "answer",
      steps: [
        { id: "intent", label: copy.steps.intent },
        { id: "where", label: copy.steps.where },
        { id: "budget", label: copy.steps.budget },
        { id: "about", label: copy.steps.about },
      ],
      offer_types: START_OFFER_TYPES.map((value) => ({
        value,
        label: value === "rent" ? chromeCopy.navRent : chromeCopy.navBuy,
        lead_label: START_LEAD_LABELS.offer[value],
      })),
      property_families: CANONICAL_PROPERTY_FAMILIES.map((family) => ({
        value: family,
        label: localizedListingValue(locale.code, "property_type", family),
        residential: isFactApplicable(family, "bedrooms_count"),
      })),
      areas: START_AREAS.map((entry) => ({
        id: entry.id,
        label: copy.areas[entry.id],
        note: copy.areaNotes[entry.id],
        location: entry.location,
        search: entry.search,
      })),
      price_presets: START_PRICE_PRESETS,
      bedrooms: [...START_BEDROOMS],
      citizenships: START_CITIZENSHIPS.map((value) => ({
        value,
        label: value === "eu" ? copy.eu : copy.nonEu,
        lead_label: START_LEAD_LABELS.citizenship[value],
      })),
      financing: START_FINANCING.map((value) => ({
        value,
        label: value === "cash" ? copy.cash : copy.mortgage,
        lead_label: START_LEAD_LABELS.financing[value],
      })),
      timelines: START_TIMELINES.map((value) => ({ value, label: copy.timelines[value], lead_label: START_LEAD_LABELS.timelines[value] })),
      notes: { land_rule: copy.landRule, financing_gap: copy.financingGap },
      answers,
      search: { path: searchPathForLocale },
      finish: answered
        ? {
            search_url: searchUrl,
            match_count: matchCount,
            summary,
            widen:
              matchCount === 0 ? startWidenSuggestions(registry, locale.code, listings, answers, copy, searchPathForLocale) : [],
          }
        : null,
      // Saved-search alerts reuse the existing /api/saved-searches contract, so
      // a visitor with no matches today can still be told when one appears.
      alert: {
        endpoint: "/api/saved-searches",
        method: "POST",
        payload: { locale: locale.code, query: "", filters: Object.fromEntries(query) },
        label: copy.alertSubmit,
        success: copy.alertSent,
      },
      // Front ends for work the backend cannot do yet. Both render as clearly
      // disabled controls with a "coming soon" badge instead of a hole.
      upcoming: [
        { id: "viewing_trip", label: copy.planTrip, note: copy.planTripNote, icon: "calendar-days", when: "always", visible: true },
        {
          id: "financing",
          label: copy.financingOptions,
          note: copy.financingOptionsNote,
          icon: "banknote",
          when: "mortgage",
          visible: answers.financing === "mortgage",
        },
      ],
      contact_channels: {
        phone: { href: `tel:${BRAND_CONTACT.phone}`, label: BRAND_CONTACT.phone_display },
        whatsapp: { href: BRAND_CONTACT.whatsapp, label: "WhatsApp" },
        viber: { href: BRAND_CONTACT.viber, label: "Viber" },
        email: { href: `mailto:${BRAND_CONTACT.email}`, label: BRAND_CONTACT.email },
      },
      form_unavailable: leadWritesDisabled ? copy.formUnavailable : null,
      shortlist: leadWritesDisabled
        ? null
        : {
            endpoint: "/api/leads",
            method: "POST",
            minimum_tap_target_px: 44,
            required_fields: ["contact.name", "contact.phone"],
            payload: {
              source: "website_buyer_onboarding",
              intent: "consultation",
              leadType,
              language: locale.code,
              contact_preference: "phone",
            },
            requirements: {
              locations: area ? area.location : "",
              property_types: answers.property_family || "",
              budget_max_eur: answers.price_max ? String(answers.price_max) : "",
              bedrooms_min: answers.bedrooms_min && residential ? String(answers.bedrooms_min) : "",
              timeline: START_LEAD_LABELS.timelines[answers.timeline] || "",
              finance_status: answers.financing || "",
            },
            message: startLeadMessage(answers),
            lead_labels: START_LEAD_LABELS,
            label: copy.shortlistSubmit,
            success: copy.shortlistSent,
          },
    },
  };
}

export function renderLanguageFallback({ registry, requestedLocale }) {
  const resolved = resolvePublicLocale(registry, requestedLocale);
  const labels = labelsFor(resolved.locale.code);
  return {
    kind: "language_fallback",
    status: 200,
    body: {
      h1: labels.languageUnavailable,
      intro: labels.languageUnavailableText,
      success: labels.languageRequestSent,
      search: { path: `/${resolved.locale.code}/${resolved.locale.route_segments.search}` },
      contact_channels: {
        phone: { href: `tel:${BRAND_CONTACT.phone}`, label: BRAND_CONTACT.phone_display },
      },
    },
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

// Branded 404 on the shared utility template, in the language the path asked
// for (unknown locales fall back like everywhere else). The page keeps kind
// "not_found" / status 404 so route resolution, sitemaps and tests keep their
// contract; only the rendered body gains the site chrome and real actions.
export function renderNotFoundPage({ registry, path = "/" }) {
  const requested = (String(path || "").match(/^\/([a-z]{2})(?:\/|$)/) || [])[1] || "en";
  const resolved = resolvePublicLocale(registry, requested);
  const locale = resolved.locale;
  const labels = labelsFor(locale.code);
  return {
    kind: "not_found",
    status: 404,
    requested_locale: requested,
    locale: locale.code,
    lang: locale.code,
    dir: locale.direction,
    path,
    canonical: path,
    indexable: false,
    metadata: {
      title: `${labels.notFoundTitle} | MS Realty`,
      description: labels.notFoundText,
      robots: "noindex,follow",
    },
    hreflang: [],
    schema: null,
    chrome: publicChrome(registry, locale, { active: null }),
    body: {
      h1: labels.notFoundTitle,
      intro: labels.notFoundText,
      contact_channels: {
        phone: { href: `tel:${BRAND_CONTACT.phone}`, label: BRAND_CONTACT.phone_display },
      },
      ctas: {
        search: { path: `/${locale.code}/${locale.route_segments.search}` },
        home: { path: homePath(registry, locale.code) },
        contact: { path: contactPath(registry, locale.code) },
      },
    },
  };
}

