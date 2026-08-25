import {
  adminLocales,
  getLocale,
  publicIndexableLocales,
  resolvePublicLocale,
  websiteLanguageCoverage,
} from "./locales.mjs";
import { adminSurfaceCatalog } from "./admin-workflows.mjs";
import {
  aboutPath,
  alertsPath,
  comparePath,
  contactPath,
  hreflangForAbout,
  hreflangForListing,
  hreflangForLocation,
  hreflangForHome,
  hreflangForContact,
  hreflangForSeller,
  hreflangForStart,
  homePath,
  isTranslationIndexable,
  listingPath,
  localeAlternatesForAlerts,
  localeAlternatesForCompare,
  locationPath,
  matchesPublicLocationScope,
  publicLocationNames,
  PUBLIC_LOCATION_SCOPES,
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
// Package B3 owns the saved-search self-service vocabulary.
import { SAVED_SEARCH_FREQUENCIES, SAVED_SEARCH_MANAGE_ACTIONS } from "./saved-search-manage.mjs";
import {
  DEFAULT_APPROVED_AREA_GUIDES_PATH,
  areaGuidePayloadFor,
  readApprovedAreaGuides,
} from "./area-guides.mjs";
import {
  DEFAULT_APPROVED_TEAM_PROFILES_PATH,
  publicTeamProfilesFor,
  readApprovedTeamProfiles,
  teamAbsence,
} from "./team-profiles.mjs";
import {
  DEFAULT_APPROVED_FINANCING_PARTNERS_PATH,
  financingAbsence,
  publicFinancingPartnersFor,
  readApprovedFinancingPartners,
} from "./financing-partners.mjs";
import {
  DEFAULT_APPROVED_PURCHASE_FEES_PATH,
  PURCHASE_FEE_BUYER_SCOPES,
  purchaseFeeEstimate,
  purchaseFeeTableStatus,
  readApprovedPurchaseFees,
} from "./purchase-fees.mjs";
import { readThroughCached } from "./file-cache.mjs";
import { publicMediaLibrary } from "./media.mjs";
import { mediaUploadLimitsFromEnv } from "./media-uploads.mjs";
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
    carousel: "въртележка",
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
    viewingSlot: "Свободен час",
    viewingSlotPlaceholder: "Изберете свободен час",
    viewingSlotLoading: "Зареждане на свободните часове…",
    viewingSlotEmpty: "Няма свободни часове онлайн. Посочете предпочитани дата и час.",
    viewingSlotRequest: "Часът е заявка. Брокер го потвърждава.",
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
    trustOffices: "Местен офис",
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
    ourOffices: "Нашият офис",
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
    allPhotos: "Всички {count} снимки",
    description: "Описание",
    factGroups: { property: "Имот", building: "Сграда", land: "Земя", status: "Статус" },
    reference: "Референция",
    availability: "Наличност",
    listingStatuses: { available: "Наличен", reserved: "Резервиран", sold: "Продаден", rented: "Отдаден под наем" },
    factsReviewed: "Фактите са проверени",
    sourceLanguage: "Изходен език",
    office: "Офис",
    moreInLocation: "Още имоти в {location}",
    viewOnMap: "Вижте района на картата",
    savedHint: "Запазените имоти се пазят на това устройство.",
    saveSearchHint: "Направете търсене и изберете „Запази търсенето“ във филтрите, за да получавате известие при нови съвпадения.",
    areas: "Райони",
    sellInLocation: "Продавате имот в {location}?",
    mapComingSoon: "Картата на имота идва скоро",
    photoLoading: "Снимката се зарежда",
    photoUnavailable: "Снимката не е налична",
    priceHistory: "История на цената",
    priceHistoryComingSoon: "Историята на цената идва скоро",
    factLabels: { area_sqm: "Площ", location: "Локация", property_type: "Тип", offer_type: "Оферта", bedrooms: "Спални", premises: "Помещения", hotel_rooms: "Хотелски стаи", storeys: "Етажи", floor: "Етаж", land_area_sqm: "Площ на парцела", condition: "Състояние", location_precision: "Локация" },
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
    carousel: "carousel",
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
    viewingSlot: "Available time",
    viewingSlotPlaceholder: "Choose an available time",
    viewingSlotLoading: "Loading available times…",
    viewingSlotEmpty: "No times to pick online. Tell us your preferred date and time instead.",
    viewingSlotRequest: "The time is a request. A broker confirms it.",
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
    trustOffices: "Local office",
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
    ourOffices: "Our office",
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
    allPhotos: "All {count} photos",
    description: "Description",
    factGroups: { property: "Property", building: "Building", land: "Land", status: "Status" },
    reference: "Reference",
    availability: "Availability",
    listingStatuses: { available: "Available", reserved: "Reserved", sold: "Sold", rented: "Rented" },
    factsReviewed: "Facts reviewed",
    sourceLanguage: "Source language",
    office: "Office",
    moreInLocation: "More properties in {location}",
    viewOnMap: "View area on map",
    savedHint: "Saved properties stay on this device.",
    saveSearchHint: "Run a search, then choose Save search in the filters to get an alert when new properties match.",
    areas: "Areas",
    sellInLocation: "Selling in {location}?",
    mapComingSoon: "Property map coming soon",
    photoLoading: "Photo loading",
    photoUnavailable: "Photo unavailable",
    priceHistory: "Price history",
    priceHistoryComingSoon: "Price history coming soon",
    factLabels: { area_sqm: "Area", location: "Location", property_type: "Type", offer_type: "Offer", bedrooms: "Bedrooms", premises: "Premises", hotel_rooms: "Hotel rooms", storeys: "Storeys", floor: "Floor", land_area_sqm: "Land area", condition: "Condition", location_precision: "Location" },
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
    carousel: "Karussell",
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
    viewingSlot: "Freier Termin",
    viewingSlotPlaceholder: "Freien Termin wahlen",
    viewingSlotLoading: "Freie Termine werden geladen…",
    viewingSlotEmpty: "Online sind keine Termine wahlbar. Nennen Sie uns Wunschdatum und Uhrzeit.",
    viewingSlotRequest: "Der Termin ist eine Anfrage. Ein Makler bestatigt ihn.",
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
    trustOffices: "Lokales Büro",
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
    ourOffices: "Unser Büro",
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
    allPhotos: "Alle {count} Fotos",
    description: "Beschreibung",
    factGroups: { property: "Immobilie", building: "Gebäude", land: "Grundstück", status: "Status" },
    reference: "Referenz",
    availability: "Verfügbarkeit",
    listingStatuses: { available: "Verfügbar", reserved: "Reserviert", sold: "Verkauft", rented: "Vermietet" },
    factsReviewed: "Fakten geprüft",
    sourceLanguage: "Ausgangssprache",
    office: "Büro",
    moreInLocation: "Weitere Immobilien in {location}",
    viewOnMap: "Gebiet auf der Karte ansehen",
    savedHint: "Gespeicherte Immobilien bleiben auf diesem Gerät.",
    saveSearchHint: "Starten Sie eine Suche und wählen Sie in den Filtern „Suche speichern“, um bei neuen Treffern benachrichtigt zu werden.",
    areas: "Gebiete",
    sellInLocation: "Verkaufen Sie in {location}?",
    mapComingSoon: "Immobilienkarte folgt in Kürze",
    photoLoading: "Foto wird geladen",
    photoUnavailable: "Foto nicht verfügbar",
    priceHistory: "Preisverlauf",
    priceHistoryComingSoon: "Preisverlauf folgt in Kürze",
    factLabels: { area_sqm: "Fläche", location: "Ort", property_type: "Typ", offer_type: "Angebot", bedrooms: "Schlafzimmer", premises: "Räume", hotel_rooms: "Hotelzimmer", storeys: "Stockwerke", floor: "Etage", land_area_sqm: "Grundstücksfläche", condition: "Zustand", location_precision: "Standort" },
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
    print: "Afdrukken/PDF",
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
    carousel: "carrousel",
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
    viewingSlot: "Vrij tijdstip",
    viewingSlotPlaceholder: "Kies een vrij tijdstip",
    viewingSlotLoading: "Vrije tijdstippen laden…",
    viewingSlotEmpty: "Er zijn online geen tijdstippen te kiezen. Geef uw voorkeursdatum en -tijd door.",
    viewingSlotRequest: "Het tijdstip is een aanvraag. Een makelaar bevestigt het.",
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
    trustOffices: "Lokaal kantoor",
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
    ourOffices: "Ons kantoor",
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
    allPhotos: "Alle {count} foto's",
    description: "Beschrijving",
    factGroups: { property: "Object", building: "Gebouw", land: "Grond", status: "Status" },
    reference: "Referentie",
    availability: "Beschikbaarheid",
    listingStatuses: { available: "Beschikbaar", reserved: "Gereserveerd", sold: "Verkocht", rented: "Verhuurd" },
    factsReviewed: "Feiten gecontroleerd",
    sourceLanguage: "Brontaal",
    office: "Kantoor",
    moreInLocation: "Meer vastgoed in {location}",
    viewOnMap: "Gebied op de kaart bekijken",
    savedHint: "Opgeslagen objecten blijven op dit apparaat.",
    saveSearchHint: "Start een zoekopdracht en kies in de filters „Zoekopdracht bewaren“ om een melding te krijgen bij nieuwe matches.",
    areas: "Gebieden",
    sellInLocation: "Verkoopt u in {location}?",
    mapComingSoon: "Objectkaart komt binnenkort",
    photoLoading: "Foto wordt geladen",
    photoUnavailable: "Foto niet beschikbaar",
    priceHistory: "Prijsgeschiedenis",
    priceHistoryComingSoon: "Prijsgeschiedenis komt binnenkort",
    factLabels: { area_sqm: "Oppervlakte", location: "Locatie", property_type: "Type", offer_type: "Aanbod", bedrooms: "Slaapkamers", premises: "Ruimtes", hotel_rooms: "Hotelkamers", storeys: "Verdiepingen", floor: "Verdieping", land_area_sqm: "Perceeloppervlakte", condition: "Staat", location_precision: "Locatie" },
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
    carousel: "карусель",
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
    viewingSlot: "Свободное время",
    viewingSlotPlaceholder: "Выберите свободное время",
    viewingSlotLoading: "Загрузка свободного времени…",
    viewingSlotEmpty: "Онлайн нет свободного времени. Укажите желаемые дату и время.",
    viewingSlotRequest: "Время это заявка. Брокер её подтверждает.",
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
    trustOffices: "Местный офис",
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
    ourOffices: "Наш офис",
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
    allPhotos: "Все {count} фото",
    description: "Описание",
    factGroups: { property: "Объект", building: "Здание", land: "Участок", status: "Статус" },
    reference: "Референс",
    availability: "Доступность",
    listingStatuses: { available: "Доступен", reserved: "Зарезервирован", sold: "Продан", rented: "Сдан" },
    factsReviewed: "Факты проверены",
    sourceLanguage: "Язык оригинала",
    office: "Офис",
    moreInLocation: "Ещё объекты в {location}",
    viewOnMap: "Посмотреть район на карте",
    savedHint: "Сохранённые объекты хранятся на этом устройстве.",
    saveSearchHint: "Выполните поиск и нажмите «Сохранить поиск» в фильтрах, чтобы получать уведомления о новых совпадениях.",
    areas: "Районы",
    sellInLocation: "Продаёте недвижимость в {location}?",
    mapComingSoon: "Карта объекта скоро появится",
    photoLoading: "Фото загружается",
    photoUnavailable: "Фото недоступно",
    priceHistory: "История цены",
    priceHistoryComingSoon: "История цены скоро появится",
    factLabels: { area_sqm: "Площадь", location: "Локация", property_type: "Тип", offer_type: "Предложение", bedrooms: "Спальни", premises: "Помещения", hotel_rooms: "Номера", storeys: "Этажи", floor: "Этаж", land_area_sqm: "Площадь участка", condition: "Состояние", location_precision: "Локация" },
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
    carousel: "καρουζέλ",
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
    email: "Ηλ. ταχυδρομείο",
    alertDelivery: "Πού να λάβετε την ειδοποίηση",
    alertFrequency: "Πόσο συχνά",
    alertInstant: "Το συντομότερο δυνατό",
    alertDaily: "Μία φορά την ημέρα",
    alertWeekly: "Μία φορά την εβδομάδα",
    alertConsent: "Συμφωνώ να επικοινωνήσει μαζί μου μεσίτης για νέες αντιστοιχίες.",
    preferredCallbackTime: "Προτιμώμενη ώρα επανάκλησης",
    preferredViewingDate: "Προτιμώμενη ημερομηνία προβολής",
    viewingSlot: "Διαθέσιμη ώρα",
    viewingSlotPlaceholder: "Επιλέξτε διαθέσιμη ώρα",
    viewingSlotLoading: "Φόρτωση διαθέσιμων ωρών…",
    viewingSlotEmpty: "Δεν υπάρχουν ώρες για ηλεκτρονική επιλογή. Πείτε μας ημερομηνία και ώρα προτίμησης.",
    viewingSlotRequest: "Η ώρα είναι αίτημα. Ένας μεσίτης την επιβεβαιώνει.",
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
    trustOffices: "Τοπικό γραφείο",
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
    ourOffices: "Το γραφείο μας",
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
    emailOptional: "Ηλ. ταχυδρομείο (προαιρετικό)",
    addPhotos: "Προσθήκη φωτογραφιών",
    photosUnavailable: "Η μεταφόρτωση φωτογραφιών δεν είναι ακόμη διαθέσιμη.",
    guideActions: "Ενέργειες οδηγού",
    allPhotos: "Όλες οι {count} φωτογραφίες",
    description: "Περιγραφή",
    factGroups: { property: "Ακίνητο", building: "Κτίριο", land: "Γη", status: "Κατάσταση" },
    reference: "Κωδικός",
    availability: "Διαθεσιμότητα",
    listingStatuses: { available: "Διαθέσιμο", reserved: "Κρατημένο", sold: "Πωλήθηκε", rented: "Ενοικιάστηκε" },
    factsReviewed: "Τα στοιχεία ελέγχθηκαν",
    sourceLanguage: "Γλώσσα προέλευσης",
    office: "Γραφείο",
    moreInLocation: "Περισσότερα ακίνητα: {location}",
    viewOnMap: "Δείτε την περιοχή στον χάρτη",
    savedHint: "Τα αποθηκευμένα ακίνητα μένουν σε αυτή τη συσκευή.",
    saveSearchHint: "Κάντε μια αναζήτηση και επιλέξτε «Αποθήκευση αναζήτησης» στα φίλτρα για να ειδοποιηθείτε όταν ταιριάζουν νέα ακίνητα.",
    areas: "Περιοχές",
    sellInLocation: "Πουλάτε ακίνητο στην περιοχή {location};",
    mapComingSoon: "Ο χάρτης του ακινήτου έρχεται σύντομα",
    photoLoading: "Η φωτογραφία φορτώνεται",
    photoUnavailable: "Η φωτογραφία δεν είναι διαθέσιμη",
    priceHistory: "Ιστορικό τιμής",
    priceHistoryComingSoon: "Το ιστορικό τιμής έρχεται σύντομα",
    factLabels: { area_sqm: "Εμβαδόν", location: "Τοποθεσία", property_type: "Τύπος", offer_type: "Προσφορά", bedrooms: "Υπνοδωμάτια", premises: "Χώροι", hotel_rooms: "Δωμάτια ξενοδοχείου", storeys: "Όροφοι", floor: "Όροφος", land_area_sqm: "Εμβαδόν οικοπέδου", condition: "Κατάσταση", location_precision: "Τοποθεσία" },
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
    carousel: "קרוסלה",
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
    viewingSlot: "שעה פנויה",
    viewingSlotPlaceholder: "בחרו שעה פנויה",
    viewingSlotLoading: "טוענים שעות פנויות…",
    viewingSlotEmpty: "אין שעות לבחירה באינטרנט. ציינו תאריך ושעה מועדפים.",
    viewingSlotRequest: "השעה היא בקשה. מתווך מאשר אותה.",
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
    trustOffices: "משרד מקומי",
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
    ourOffices: "המשרד שלנו",
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
    emailOptional: "דוא״ל (אופציונלי)",
    addPhotos: "הוספת תמונות",
    photosUnavailable: "העלאת תמונות עדיין אינה זמינה.",
    guideActions: "פעולות מדריך",
    allPhotos: "כל {count} התמונות",
    description: "תיאור",
    factGroups: { property: "נכס", building: "בניין", land: "קרקע", status: "סטטוס" },
    reference: "מספר נכס",
    availability: "זמינות",
    listingStatuses: { available: "זמין", reserved: "שמור", sold: "נמכר", rented: "הושכר" },
    factsReviewed: "העובדות נבדקו",
    sourceLanguage: "שפת המקור",
    office: "משרד",
    moreInLocation: "נכסים נוספים ב-{location}",
    viewOnMap: "הצגת האזור במפה",
    savedHint: "נכסים שמורים נשארים במכשיר הזה.",
    saveSearchHint: "בצעו חיפוש ובחרו „שמירת חיפוש“ במסננים כדי לקבל התראה כשנכסים חדשים מתאימים.",
    areas: "אזורים",
    sellInLocation: "מוכרים נכס ב-{location}?",
    mapComingSoon: "מפת הנכס בקרוב",
    photoLoading: "התמונה נטענת",
    photoUnavailable: "התמונה אינה זמינה",
    priceHistory: "היסטוריית מחיר",
    priceHistoryComingSoon: "היסטוריית המחיר בקרוב",
    factLabels: { area_sqm: "שטח", location: "מיקום", property_type: "סוג", offer_type: "הצעה", bedrooms: "חדרי שינה", premises: "חללים", hotel_rooms: "חדרי מלון", storeys: "קומות", floor: "קומה", land_area_sqm: "שטח מגרש", condition: "מצב", location_precision: "מיקום" },
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
    propertyTypes: { commercial: "Gewerbeimmobilie", multi_unit: "Wohnungen", apartment: "Wohnung", hotel: "Hotel", house: "Haus", plot: "Grundstück", agricultural_land: "Landwirtschaftsfläche", land: "Grundstück", property: "Immobilie" },
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
  // Bulgarian districts and settlements keep the Latin transliteration the
  // catalog already carries (Plovdiv, Varna): that spelling *is* the English,
  // German and Dutch exonym. Only Sofia city needs the disambiguating suffix.
  // The Greek regions are the ones the catalog cannot serve on its own — its
  // `names.en` are raw transliterations ("Kriti", "Dytiki Elláda"), never the
  // names a reader of these languages knows.
  en: {
    "Sofia (stolitsa)": "Sofia (capital city)",
    Attiki: "Attica",
    "Nisia Aigaiou, Kriti": "Aegean Islands and Crete",
    "Northern Greece": "Northern Greece",
    // EL6 is the NUTS-1 grouping, EL64 the administrative region. English
    // calls both "Central Greece", so the region carries its Greek name too.
    "Kentriki Elláda": "Central Greece",
    "Voreio Aigaio": "North Aegean",
    "Notio Aigaio": "South Aegean",
    Kriti: "Crete",
    "Eastern Macedonia and Thrace": "Eastern Macedonia and Thrace",
    "Central Macedonia": "Central Macedonia",
    "Western Macedonia": "Western Macedonia",
    Epirus: "Epirus",
    Thessalia: "Thessaly",
    "Ionia Nisia": "Ionian Islands",
    "Dytiki Elláda": "Western Greece",
    "Sterea Elláda": "Central Greece (Sterea Ellada)",
    Peloponnisos: "Peloponnese",
  },
  de: {
    "Sofia (stolitsa)": "Sofia (Hauptstadt)",
    Attiki: "Attika",
    "Nisia Aigaiou, Kriti": "Ägäische Inseln und Kreta",
    "Northern Greece": "Nordgriechenland",
    "Kentriki Elláda": "Zentralgriechenland",
    "Voreio Aigaio": "Nördliche Ägäis",
    "Notio Aigaio": "Südliche Ägäis",
    Kriti: "Kreta",
    "Eastern Macedonia and Thrace": "Ostmakedonien und Thrakien",
    "Central Macedonia": "Zentralmakedonien",
    "Western Macedonia": "Westmakedonien",
    Epirus: "Epirus",
    Thessalia: "Thessalien",
    "Ionia Nisia": "Ionische Inseln",
    "Dytiki Elláda": "Westgriechenland",
    "Sterea Elláda": "Mittelgriechenland",
    Peloponnisos: "Peloponnes",
  },
  nl: {
    "Sofia (stolitsa)": "Sofia (hoofdstad)",
    Attiki: "Attika",
    "Nisia Aigaiou, Kriti": "Egeïsche Eilanden en Kreta",
    "Northern Greece": "Noord-Griekenland",
    "Kentriki Elláda": "Centraal-Griekenland",
    "Voreio Aigaio": "Noord-Egeïsche Eilanden",
    "Notio Aigaio": "Zuid-Egeïsche Eilanden",
    Kriti: "Kreta",
    "Eastern Macedonia and Thrace": "Oost-Macedonië en Thracië",
    "Central Macedonia": "Centraal-Macedonië",
    "Western Macedonia": "West-Macedonië",
    Epirus: "Epirus",
    Thessalia: "Thessalië",
    "Ionia Nisia": "Ionische Eilanden",
    "Dytiki Elláda": "West-Griekenland",
    "Sterea Elláda": "Midden-Griekenland",
    Peloponnisos: "Peloponnesos",
  },
  bg: {
    Sandanski: "Сандански",
    Petrich: "Петрич",
    Hotovo: "Хотово",
    Bansko: "Банско",
    "Sveti Vlas": "Свети Влас",
    Blagoevgrad: "Благоевград",
    Burgas: "Бургас",
    Attiki: "Атика",
    "Nisia Aigaiou, Kriti": "Егейски острови, Крит",
    "Northern Greece": "Северна Гърция",
    "Kentriki Elláda": "Централна Гърция",
    "Voreio Aigaio": "Северен Егей",
    "Notio Aigaio": "Южен Егей",
    Kriti: "Крит",
    "Eastern Macedonia and Thrace": "Източна Македония и Тракия",
    "Central Macedonia": "Централна Македония",
    "Western Macedonia": "Западна Македония",
    Epirus: "Епир",
    Thessalia: "Тесалия",
    "Ionia Nisia": "Йонийски острови",
    "Dytiki Elláda": "Западна Гърция",
    "Sterea Elláda": "Средна Гърция",
    Peloponnisos: "Пелопонес",
  },
  ru: {
    Sandanski: "Сандански",
    Petrich: "Петрич",
    Hotovo: "Хотово",
    Bansko: "Банско",
    "Sveti Vlas": "Свети-Влас",
    Blagoevgrad: "Благоевград",
    Burgas: "Бургас",
    Varna: "Варна",
    "Veliko Tarnovo": "Велико-Тырново",
    Vidin: "Видин",
    Vratsa: "Враца",
    Gabrovo: "Габрово",
    Dobrich: "Добрич",
    Kardzhali: "Кырджали",
    Kyustendil: "Кюстендил",
    Lovech: "Ловеч",
    Montana: "Монтана",
    Pazardzhik: "Пазарджик",
    Pernik: "Перник",
    Pleven: "Плевен",
    Plovdiv: "Пловдив",
    Razgrad: "Разград",
    Ruse: "Русе",
    Silistra: "Силистра",
    Sliven: "Сливен",
    Smolyan: "Смолян",
    Sofia: "София",
    "Sofia (stolitsa)": "София (столица)",
    "Stara Zagora": "Стара-Загора",
    Targovishte: "Тырговиште",
    Haskovo: "Хасково",
    Shumen: "Шумен",
    Yambol: "Ямбол",
    Attiki: "Аттика",
    "Nisia Aigaiou, Kriti": "Эгейские острова, Крит",
    "Northern Greece": "Северная Греция",
    "Kentriki Elláda": "Центральная Греция",
    "Voreio Aigaio": "Северные Эгейские острова",
    "Notio Aigaio": "Южные Эгейские острова",
    Kriti: "Крит",
    "Eastern Macedonia and Thrace": "Восточная Македония и Фракия",
    "Central Macedonia": "Центральная Македония",
    "Western Macedonia": "Западная Македония",
    Epirus: "Эпир",
    Thessalia: "Фессалия",
    "Ionia Nisia": "Ионические острова",
    "Dytiki Elláda": "Западная Греция",
    "Sterea Elláda": "Средняя Греция",
    Peloponnisos: "Пелопоннес",
  },
  el: {
    Sandanski: "Σαντάνσκι",
    Petrich: "Πετρίτσι",
    Hotovo: "Χότοβο",
    Bansko: "Μπάνσκο",
    "Sveti Vlas": "Σβέτι Βλας",
    Blagoevgrad: "Μπλαγκόεβγκραντ",
    Burgas: "Μπουργκάς",
    Varna: "Βάρνα",
    "Veliko Tarnovo": "Βελίκο Τάρνοβο",
    Vidin: "Βίντιν",
    Vratsa: "Βράτσα",
    Gabrovo: "Γκάμπροβο",
    Dobrich: "Ντόμπριτς",
    Kardzhali: "Κάρτζαλι",
    Kyustendil: "Κιουστεντίλ",
    Lovech: "Λόβετς",
    Montana: "Μοντάνα",
    Pazardzhik: "Πάζαρτζικ",
    Pernik: "Πέρνικ",
    Pleven: "Πλέβεν",
    Plovdiv: "Φιλιππούπολη",
    Razgrad: "Ραζγκράντ",
    Ruse: "Ρούσε",
    Silistra: "Σιλίστρα",
    Sliven: "Σλίβεν",
    Smolyan: "Σμόλιαν",
    Sofia: "Σόφια",
    "Sofia (stolitsa)": "Σόφια (πρωτεύουσα)",
    "Stara Zagora": "Στάρα Ζαγόρα",
    Targovishte: "Ταργκόβιστε",
    Haskovo: "Χάσκοβο",
    Shumen: "Σούμεν",
    Yambol: "Γιάμπολ",
  },
  he: {
    Sandanski: "סנדנסקי",
    Petrich: "פטריץ׳",
    Hotovo: "חוטובו",
    Bansko: "בנסקו",
    "Sveti Vlas": "סבטי ולאס",
    Blagoevgrad: "בלגואבגרד",
    Burgas: "בורגס",
    Varna: "וארנה",
    "Veliko Tarnovo": "וליקו טרנובו",
    Vidin: "וידין",
    Vratsa: "וראצה",
    Gabrovo: "גברובו",
    Dobrich: "דובריץ׳",
    Kardzhali: "קרדז׳אלי",
    Kyustendil: "קיוסטנדיל",
    Lovech: "לובץ׳",
    Montana: "מונטנה",
    Pazardzhik: "פאזארדז׳יק",
    Pernik: "פרניק",
    Pleven: "פלבן",
    Plovdiv: "פלובדיב",
    Razgrad: "ראזגרד",
    Ruse: "רוסה",
    Silistra: "סיליסטרה",
    Sliven: "סליבן",
    Smolyan: "סמוליאן",
    Sofia: "סופיה",
    "Sofia (stolitsa)": "סופיה (עיר הבירה)",
    "Stara Zagora": "סטארה זאגורה",
    Targovishte: "טרגובישטה",
    Haskovo: "חאסקובו",
    Shumen: "שומן",
    Yambol: "ימבול",
    Attiki: "אטיקה",
    "Nisia Aigaiou, Kriti": "האיים האגאיים, כרתים",
    "Northern Greece": "צפון יוון",
    "Kentriki Elláda": "יוון המרכזית",
    "Voreio Aigaio": "צפון הים האגאי",
    "Notio Aigaio": "דרום הים האגאי",
    Kriti: "כרתים",
    "Eastern Macedonia and Thrace": "מזרח מקדוניה ותראקיה",
    "Central Macedonia": "מרכז מקדוניה",
    "Western Macedonia": "מערב מקדוניה",
    Epirus: "אפירוס",
    Thessalia: "תסליה",
    "Ionia Nisia": "האיים היוניים",
    "Dytiki Elláda": "מערב יוון",
    "Sterea Elláda": "מרכז יוון",
    Peloponnisos: "פלופונסוס",
  },
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
    // Same rules as every other location surface: a translated name wins, the
    // native script wins at home, and English is the fallback - not the default.
    return localizedLocationValue(localeCode, area.names?.en || "") || area.names?.en || humanizeIdentifier(value);
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
    photos_title: "Добавете снимки",
    photos_intro: "Снимките помагат на брокера да подготви оценката преди огледа.",
    photos_privacy: "Снимките остават лични. Снимки, изпратени от посетител на сайта, никога не се публикуват автоматично и никога не се появяват в търсенето. Брокерът ги преглежда заедно с вас.",
    photos_field: "Изберете снимки",
    photos_reference: "Номер на запитването",
    photos_reference_hint: "Изпратете първо заявката за оценка. Ще покажем номера тук; ако вече го имате от брокер, въведете го.",
    photos_submit: "Изпратете снимките",
    photos_pending: "Изпращане…",
    photos_success: "Снимките стигнаха до вашето запитване. Остават лични до преглед от брокер.",
    photos_failure: "Снимките не бяха изпратени.",
    photos_limits: "JPEG, PNG, WebP или AVIF. До {files} снимки, всяка до {mb} MB. Данните за местоположение се премахват при изпращането.",
  },
  en: {
    title: "Sell your property with MS Realty",
    description: "Request a broker valuation and follow-up from the MS Realty team.",
    h1: "Sell your property",
    form_unavailable: "The form is temporarily unavailable. Call or message us instead. We reply quickly.",
    photos_title: "Add photos",
    photos_intro: "Photos let the broker prepare the valuation before the visit.",
    photos_privacy: "Your photos stay private. Photos submitted by a member of the public are never published automatically and never appear in search. A broker reviews them with you.",
    photos_field: "Choose photos",
    photos_reference: "Enquiry reference",
    photos_reference_hint: "Send the valuation request first. We fill the reference in here; if a broker already gave you one, type it in.",
    photos_submit: "Send photos",
    photos_pending: "Sending…",
    photos_success: "Your photos reached your enquiry. They stay private until a broker reviews them.",
    photos_failure: "The photos were not sent.",
    photos_limits: "JPEG, PNG, WebP, or AVIF. Up to {files} photos, each up to {mb} MB. Location data is removed as they are sent.",
  },
  de: {
    title: "Verkaufen Sie Ihre Immobilie mit MS Realty",
    description: "Fordern Sie eine Maklerbewertung und Rückmeldung vom MS Realty Team an.",
    h1: "Immobilie verkaufen",
    form_unavailable: "Das Formular ist vorübergehend nicht verfügbar. Rufen Sie uns an oder schreiben Sie uns.",
    photos_title: "Fotos hinzufügen",
    photos_intro: "Fotos helfen dem Makler, die Bewertung vor dem Termin vorzubereiten.",
    photos_privacy: "Ihre Fotos bleiben privat. Von Besuchern eingesendete Fotos werden nie automatisch veröffentlicht und erscheinen nie in der Suche. Ein Makler sieht sie gemeinsam mit Ihnen durch.",
    photos_field: "Fotos auswählen",
    photos_reference: "Anfragenummer",
    photos_reference_hint: "Senden Sie zuerst die Bewertungsanfrage. Wir tragen die Nummer hier ein; falls Sie schon eine vom Makler haben, geben Sie sie ein.",
    photos_submit: "Fotos senden",
    photos_pending: "Wird gesendet…",
    photos_success: "Ihre Fotos sind bei Ihrer Anfrage angekommen. Sie bleiben privat, bis ein Makler sie prüft.",
    photos_failure: "Die Fotos wurden nicht gesendet.",
    photos_limits: "JPEG, PNG, WebP oder AVIF. Bis zu {files} Fotos, je bis {mb} MB. Standortdaten werden beim Senden entfernt.",
  },
  nl: {
    title: "Verkoop uw vastgoed met MS Realty",
    description: "Vraag een makelaarswaardering en opvolging van het MS Realty team aan.",
    h1: "Vastgoed verkopen",
    form_unavailable: "Het formulier is tijdelijk niet beschikbaar. Bel of stuur ons een bericht.",
    photos_title: "Foto's toevoegen",
    photos_intro: "Met foto's kan de makelaar de waardering voorbereiden voor het bezoek.",
    photos_privacy: "Uw foto's blijven privé. Foto's die een bezoeker instuurt worden nooit automatisch gepubliceerd en verschijnen nooit in de zoekresultaten. Een makelaar bekijkt ze samen met u.",
    photos_field: "Kies foto's",
    photos_reference: "Aanvraagnummer",
    photos_reference_hint: "Stuur eerst de waarderingsaanvraag. Wij vullen het nummer hier in; heeft u er al een van een makelaar, typ het dan in.",
    photos_submit: "Foto's versturen",
    photos_pending: "Versturen…",
    photos_success: "Uw foto's zijn bij uw aanvraag aangekomen. Ze blijven privé tot een makelaar ze bekijkt.",
    photos_failure: "De foto's zijn niet verstuurd.",
    photos_limits: "JPEG, PNG, WebP of AVIF. Maximaal {files} foto's, elk tot {mb} MB. Locatiegegevens worden bij het versturen verwijderd.",
  },
  ru: {
    title: "Продайте недвижимость с MS Realty",
    description: "Запросите брокерскую оценку и обратную связь от команды MS Realty.",
    h1: "Продайте недвижимость",
    form_unavailable: "Форма временно недоступна. Позвоните или напишите нам, мы быстро отвечаем.",
    photos_title: "Добавьте фотографии",
    photos_intro: "Фотографии помогают брокеру подготовить оценку до визита.",
    photos_privacy: "Ваши фотографии остаются приватными. Фотографии, отправленные посетителем сайта, никогда не публикуются автоматически и никогда не появляются в поиске. Брокер просматривает их вместе с вами.",
    photos_field: "Выберите фотографии",
    photos_reference: "Номер обращения",
    photos_reference_hint: "Сначала отправьте запрос на оценку. Мы подставим номер сюда; если брокер уже дал вам номер, введите его.",
    photos_submit: "Отправить фотографии",
    photos_pending: "Отправка…",
    photos_success: "Фотографии дошли до вашего обращения. Они остаются приватными до проверки брокером.",
    photos_failure: "Фотографии не отправлены.",
    photos_limits: "JPEG, PNG, WebP или AVIF. До {files} фотографий, каждая до {mb} МБ. Данные о местоположении удаляются при отправке.",
  },
  el: {
    title: "Πουλήστε το ακίνητό σας με τη MS Realty",
    description: "Ζητήστε εκτίμηση από μεσίτη και επικοινωνία από την ομάδα της MS Realty.",
    h1: "Πουλήστε το ακίνητό σας",
    form_unavailable: "Η φόρμα δεν είναι προσωρινά διαθέσιμη. Καλέστε μας ή στείλτε μήνυμα.",
    photos_title: "Προσθέστε φωτογραφίες",
    photos_intro: "Οι φωτογραφίες βοηθούν τον μεσίτη να ετοιμάσει την εκτίμηση πριν την επίσκεψη.",
    photos_privacy: "Οι φωτογραφίες σας παραμένουν ιδιωτικές. Φωτογραφίες που στέλνει επισκέπτης δεν δημοσιεύονται ποτέ αυτόματα και δεν εμφανίζονται ποτέ στην αναζήτηση. Ένας μεσίτης τις εξετάζει μαζί σας.",
    photos_field: "Επιλέξτε φωτογραφίες",
    photos_reference: "Αριθμός αιτήματος",
    photos_reference_hint: "Στείλτε πρώτα το αίτημα εκτίμησης. Συμπληρώνουμε εδώ τον αριθμό· αν σας τον έδωσε ήδη μεσίτης, γράψτε τον.",
    photos_submit: "Αποστολή φωτογραφιών",
    photos_pending: "Αποστολή…",
    photos_success: "Οι φωτογραφίες έφτασαν στο αίτημά σας. Παραμένουν ιδιωτικές μέχρι να τις εξετάσει μεσίτης.",
    photos_failure: "Οι φωτογραφίες δεν στάλθηκαν.",
    photos_limits: "JPEG, PNG, WebP ή AVIF. Έως {files} φωτογραφίες, καθεμία έως {mb} MB. Τα δεδομένα τοποθεσίας αφαιρούνται κατά την αποστολή.",
  },
  he: {
    title: "מכירת נכס עם MS Realty",
    description: "בקשו הערכת מתווך וחזרה מצוות MS Realty.",
    h1: "מכירת נכס",
    form_unavailable: "הטופס אינו זמין זמנית. התקשרו או שלחו לנו הודעה.",
    photos_title: "הוספת תמונות",
    photos_intro: "תמונות עוזרות למתווך להכין את ההערכה לפני הביקור.",
    photos_privacy: "התמונות שלכם נשארות פרטיות. תמונות שנשלחות על ידי מבקר באתר לעולם אינן מתפרסמות אוטומטית ואינן מופיעות בחיפוש. מתווך בודק אותן יחד אתכם.",
    photos_field: "בחרו תמונות",
    photos_reference: "מספר הפנייה",
    photos_reference_hint: "שלחו קודם את בקשת ההערכה. נמלא כאן את המספר; אם כבר קיבלתם אותו ממתווך, הקלידו אותו.",
    photos_submit: "שליחת תמונות",
    photos_pending: "שולח…",
    photos_success: "התמונות הגיעו לפנייה שלכם. הן נשארות פרטיות עד שמתווך יבדוק אותן.",
    photos_failure: "התמונות לא נשלחו.",
    photos_limits: "JPEG, PNG, WebP או AVIF. עד {files} תמונות, כל אחת עד {mb} MB. נתוני מיקום מוסרים בעת השליחה.",
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
    areaNotes: { sandanski: "Тук е нашият офис", bansko: "Ски курортът", blagoevgrad_district: "Цялата област", black_sea_coast: "Свети Влас и плажовете", greece: "Отвъд границата" },
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
    planTripNote: "Кажете ни кога идвате. Брокер подрежда огледите и потвърждава програмата с вас.",
    tripArrival: "Пристигане",
    tripDeparture: "Заминаване",
    tripParty: "Брой хора",
    tripAreas: "Райони",
    tripShortlist: "Избрани имоти",
    tripNote: "Какво да имаме предвид",
    tripSubmit: "Заявете пътуване за огледи",
    tripSent: "Заявката е получена. Брокер ще се свърже, за да подреди програмата.",
    tripPending: "Това е заявка. Човек потвърждава всеки оглед.",
    tripScopeRequired: "Добавете поне един район или един запазен имот.",
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
    areaNotes: { sandanski: "Where we are based", bansko: "The ski resort", blagoevgrad_district: "The whole district", black_sea_coast: "Sveti Vlas and the beaches", greece: "Across the border" },
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
    planTripNote: "Tell us when you are coming. A broker lines up the viewings and confirms the plan with you.",
    tripArrival: "Arriving",
    tripDeparture: "Leaving",
    tripParty: "People coming",
    tripAreas: "Areas",
    tripShortlist: "Saved properties",
    tripNote: "Anything we should know",
    tripSubmit: "Request a viewing trip",
    tripSent: "Request received. A broker will be in touch to line up the days.",
    tripPending: "This is a request. A person confirms every viewing.",
    tripScopeRequired: "Add at least one area or one saved property.",
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
    areaNotes: { sandanski: "Hier sitzen wir", bansko: "Das Skigebiet", blagoevgrad_district: "Der ganze Bezirk", black_sea_coast: "Sveti Vlas und die Strände", greece: "Jenseits der Grenze" },
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
    planTripNote: "Sagen Sie uns, wann Sie kommen. Ein Makler stellt die Besichtigungen zusammen und bestatigt den Plan.",
    tripArrival: "Anreise",
    tripDeparture: "Abreise",
    tripParty: "Personen",
    tripAreas: "Regionen",
    tripShortlist: "Gemerkte Objekte",
    tripNote: "Was wir wissen sollten",
    tripSubmit: "Besichtigungsreise anfragen",
    tripSent: "Anfrage erhalten. Ein Makler meldet sich, um die Tage abzustimmen.",
    tripPending: "Das ist eine Anfrage. Ein Mensch bestatigt jede Besichtigung.",
    tripScopeRequired: "Geben Sie mindestens eine Region oder ein gemerktes Objekt an.",
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
    areaNotes: { sandanski: "Hier zitten wij", bansko: "Het skigebied", blagoevgrad_district: "Het hele district", black_sea_coast: "Sveti Vlas en de stranden", greece: "Over de grens" },
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
    planTripNote: "Vertel ons wanneer u komt. Een makelaar zet de bezichtigingen op een rij en bevestigt het plan.",
    tripArrival: "Aankomst",
    tripDeparture: "Vertrek",
    tripParty: "Aantal personen",
    tripAreas: "Gebieden",
    tripShortlist: "Bewaarde woningen",
    tripNote: "Wat wij moeten weten",
    tripSubmit: "Bezichtigingsreis aanvragen",
    tripSent: "Aanvraag ontvangen. Een makelaar neemt contact op om de dagen te plannen.",
    tripPending: "Dit is een aanvraag. Een mens bevestigt elke bezichtiging.",
    tripScopeRequired: "Voeg minstens een gebied of een opgeslagen woning toe.",
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
    areaNotes: { sandanski: "Здесь наш офис", bansko: "Горнолыжный курорт", blagoevgrad_district: "Вся область", black_sea_coast: "Свети-Влас и пляжи", greece: "За границей" },
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
    planTripNote: "Скажите, когда приезжаете. Брокер соберёт просмотры и согласует программу с вами.",
    tripArrival: "Приезд",
    tripDeparture: "Отъезд",
    tripParty: "Сколько человек",
    tripAreas: "Районы",
    tripShortlist: "Сохранённые объекты",
    tripNote: "Что нам важно знать",
    tripSubmit: "Заявка на поездку с просмотрами",
    tripSent: "Заявка получена. Брокер свяжется, чтобы согласовать дни.",
    tripPending: "Это заявка. Каждый просмотр подтверждает человек.",
    tripScopeRequired: "Укажите хотя бы один район или один сохранённый объект.",
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
    areaNotes: { sandanski: "Εδώ είναι η έδρα μας", bansko: "Το χιονοδρομικό κέντρο", blagoevgrad_district: "Ολόκληρη η περιφέρεια", black_sea_coast: "Το Σβέτι Βλας και οι παραλίες", greece: "Πέρα από τα σύνορα" },
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
    planTripNote: "Πείτε μας πότε έρχεστε. Ένας μεσίτης οργανώνει τις επισκέψεις και επιβεβαιώνει το πρόγραμμα.",
    tripArrival: "Άφιξη",
    tripDeparture: "Αναχώρηση",
    tripParty: "Άτομα",
    tripAreas: "Περιοχές",
    tripShortlist: "Αποθηκευμένα ακίνητα",
    tripNote: "Τι πρέπει να ξέρουμε",
    tripSubmit: "Αίτημα για ταξίδι επισκέψεων",
    tripSent: "Το αίτημα ελήφθη. Ένας μεσίτης θα επικοινωνήσει για τις ημέρες.",
    tripPending: "Αυτό είναι αίτημα. Ένας άνθρωπος επιβεβαιώνει κάθε επίσκεψη.",
    tripScopeRequired: "Προσθέστε τουλάχιστον μία περιοχή ή ένα αποθηκευμένο ακίνητο.",
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
    areaNotes: { sandanski: "כאן נמצא המשרד שלנו", bansko: "אתר הסקי", blagoevgrad_district: "המחוז כולו", black_sea_coast: "סבטי ולאס והחופים", greece: "מעבר לגבול" },
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
    planTripNote: "ספרו לנו מתי אתם מגיעים. מתווך יארגן את הביקורים ויאשר איתכם את התוכנית.",
    tripArrival: "הגעה",
    tripDeparture: "עזיבה",
    tripParty: "מספר אנשים",
    tripAreas: "אזורים",
    tripShortlist: "נכסים שמורים",
    tripNote: "מה כדאי שנדע",
    tripSubmit: "בקשת נסיעת ביקורים",
    tripSent: "הבקשה התקבלה. מתווך ייצור קשר לתאם את הימים.",
    tripPending: "זו בקשה. אדם מאשר כל ביקור.",
    tripScopeRequired: "הוסיפו לפחות אזור אחד או נכס שמור אחד.",
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
  // The coastal property the agency sells sits around Sveti Vlas (Burgas
  // district), which is the only coastal scope the geography registry can
  // express as one filter. The agency has no office there.
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
      "Имоти за продажба и под наем в Сандански и Пирин, по Черноморието и в съседна Гърция, с местен офис и брокери, които говорят вашия език.",
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
    offices: "Сандански",
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
      "Properties for sale and rent in Sandanski and the Pirin mountains, along the Black Sea coast, and in neighbouring Greece, with a local office and brokers who speak your language.",
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
    offices: "Sandanski",
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
      "Immobilien zum Kauf und zur Miete in Sandanski und im Pirin-Gebirge, an der Schwarzmeerküste und im benachbarten Griechenland, mit einem lokalen Büro und Maklern, die Ihre Sprache sprechen.",
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
    offices: "Sandanski",
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
      "Vastgoed te koop en te huur in Sandanski en het Pirin-gebergte, aan de Zwarte Zeekust en in buurland Griekenland, met een lokaal kantoor en makelaars die uw taal spreken.",
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
    offices: "Sandanski",
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
      "Недвижимость для покупки и аренды в Сандански и горах Пирин, на черноморском побережье и в соседней Греции, с местным офисом и брокерами, говорящими на вашем языке.",
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
    offices: "Сандански",
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
      "Ακίνητα προς πώληση και ενοικίαση στο Σαντάνσκι και τον Πιρίν, στις ακτές της Μαύρης Θάλασσας και στη γειτονική Ελλάδα, με τοπικό γραφείο και μεσίτες που μιλούν τη γλώσσα σας.",
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
    offices: "Σαντάνσκι",
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
      "נכסים למכירה ולהשכרה בסנדנסקי ובהרי פירין, לאורך חוף הים השחור וביוון השכנה, עם משרד מקומי ומתווכים שמדברים בשפה שלכם.",
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
    offices: "סנדנסקי",
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

// The agency runs one office, in Sandanski (confirmed by the owner). The list
// shape stays so the contact page keeps rendering office cards, and so a second
// office would only ever need an entry here. The canonical name feeds the
// location filter; the display name is localized per public locale. Selling in
// Bansko or on the coast is not an office there.
const AGENCY_OFFICES = ["Sandanski"];

export function chromeCopyFor(localeCode) {
  return CHROME_COPY[localeCode] || CHROME_COPY.en;
}

export function leadWritesDisabledFromEnv(env = process.env) {
  return !isLeadDurableStoreEnabled(leadDurableStoreConfigFromEnv(env));
}

// Seller photo upload is its own switch. It does not depend on the durable lead
// store, because a seller who already holds an enquiry reference can send
// photos for it whether or not the intake form is currently offered.
export function sellerPhotoUploadDisabledFromEnv(env = process.env) {
  return env.MS_REALTY_SELLER_PHOTO_UPLOAD_DISABLED === "1";
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
    // Package P4: the saved shortlist gets a header counter with a compare
    // shortcut, and the footer gains the company routes P4 added. Both are
    // plain links, so they work before the client script runs.
    saved: {
      href: `${searchBase}?saved=1`,
      label: labels.savedListings,
      compare: { href: comparePath(registry, locale.code), label: p4CopyFor(locale.code).compare.h1, active: active === "compare" },
    },
    company: {
      label: copy.explore,
      links: [
        { id: "about", href: aboutPath(registry, locale.code), label: p4CopyFor(locale.code).about.h1, active: active === "about" },
        { id: "alerts", href: alertsPath(registry, locale.code), label: p4CopyFor(locale.code).alerts.h1, active: active === "alerts" },
      ],
    },
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

// Links from the listing detail "Location" section back into search: the
// reviewed location name for the list, the official geography filter for the
// map. A per-listing map needs approved coordinates, which the public view
// model does not publish yet, so the detail page links to the area map.
function listingLocationLinks(locale, view) {
  const searchPath = `/${locale.code}/${locale.route_segments?.search || "search"}`;
  const searchParams = new URLSearchParams();
  if (view.location) searchParams.set("location", view.location);
  const mapParams = new URLSearchParams({ view: "map" });
  if (view.country_code) mapParams.set("country_code", view.country_code);
  if (view.country_code === "BG" && view.district_code) mapParams.set("region_id", `BG:district:${view.district_code}`);
  return {
    search: [...searchParams.keys()].length ? `${searchPath}?${searchParams}` : searchPath,
    map: view.country_code ? `${searchPath}?${mapParams}` : null,
    // A precise pin needs approved public coordinates; until the CMS publishes
    // them the detail page offers the area map instead of an invented location.
    pin_available: Boolean(view.public_coordinates),
  };
}

export function renderListingPage({
  registry,
  listing,
  localeCode,
  translations,
  brokerContact = null,
  relatedListings = [],
  purchaseFees = null,
}) {
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
      location_links: listingLocationLinks(locale, view),
      // Package B2: the purchase cost estimator. Refuses to show a total while
      // any required fee line is unapproved, and names the lines that block it.
      cost_estimator: purchaseFeePayload({
        localeCode: locale.code,
        priceEur: view.price_on_request === true ? null : view.price_eur,
        municipality: view.municipality || null,
        document: purchaseFees,
      }),
      // Package P4: the explicit brochure action and the purchase-cost
      // disclosure. Both live under their own key so the rest of the listing
      // contract is untouched.
      extras: listingExtras({ registry, locale, view, path }),
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
  en: {
    archived: {
      title: "Archived listing | MS Realty",
      h1: "This listing is no longer active",
      notice: "We keep this address so the site history stays accurate. The listing is archived and does not appear in the active search.",
    },
    active: {
      title: "Listing under review | MS Realty",
      h1: "This listing is being reviewed",
      notice: "The listing was active when the catalogue was frozen, but its facts and publication are not approved yet.",
    },
    reference: "Reference",
    checked: "Checked on",
    contact: "Contact a broker",
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
  de: {
    archived: {
      title: "Archivierte Anzeige | MS Realty",
      h1: "Diese Anzeige ist nicht mehr aktiv",
      notice: "Wir behalten diesen Link bei, damit die Historie der Website korrekt bleibt. Die Anzeige ist archiviert und erscheint nicht in der aktiven Suche.",
    },
    active: {
      title: "Anzeige in Prüfung | MS Realty",
      h1: "Diese Anzeige wird geprüft",
      notice: "Die Anzeige war aktiv, als der Katalog festgehalten wurde, aber ihre Fakten und ihre Veröffentlichung sind noch nicht freigegeben.",
    },
    reference: "Referenz",
    checked: "Geprüft am",
    contact: "Makler kontaktieren",
  },
  nl: {
    archived: {
      title: "Gearchiveerde advertentie | MS Realty",
      h1: "Deze advertentie is niet meer actief",
      notice: "We behouden deze link zodat de geschiedenis van de site klopt. De advertentie is gearchiveerd en verschijnt niet in de actuele zoekresultaten.",
    },
    active: {
      title: "Advertentie wordt gecontroleerd | MS Realty",
      h1: "Deze advertentie wordt gecontroleerd",
      notice: "De advertentie was actief toen de catalogus werd vastgelegd, maar de feiten en de publicatie zijn nog niet goedgekeurd.",
    },
    reference: "Referentie",
    checked: "Gecontroleerd op",
    contact: "Neem contact op met makelaar",
  },
  el: {
    archived: {
      title: "Αρχειοθετημένη αγγελία | MS Realty",
      h1: "Αυτή η αγγελία δεν είναι πλέον ενεργή",
      notice: "Διατηρούμε αυτόν τον σύνδεσμο ώστε το ιστορικό του ιστότοπου να παραμένει σωστό. Η αγγελία είναι αρχειοθετημένη και δεν εμφανίζεται στην ενεργή αναζήτηση.",
    },
    active: {
      title: "Αγγελία υπό έλεγχο | MS Realty",
      h1: "Αυτή η αγγελία ελέγχεται",
      notice: "Η αγγελία ήταν ενεργή όταν κλείσαμε τον κατάλογο, αλλά τα στοιχεία και η δημοσίευσή της δεν έχουν εγκριθεί ακόμη.",
    },
    reference: "Κωδικός",
    checked: "Ελέγχθηκε στις",
    contact: "Επικοινωνία με μεσίτη",
  },
  he: {
    archived: {
      title: "מודעה בארכיון | MS Realty",
      h1: "המודעה הזו כבר אינה פעילה",
      notice: "אנחנו שומרים את הקישור הזה כדי שההיסטוריה של האתר תישאר מדויקת. המודעה נמצאת בארכיון ואינה מופיעה בחיפוש הפעיל.",
    },
    active: {
      title: "מודעה בבדיקה | MS Realty",
      h1: "המודעה הזו נמצאת בבדיקה",
      notice: "המודעה הייתה פעילה כשסגרנו את הקטלוג, אבל הפרטים שבה והפרסום שלה עדיין לא אושרו.",
    },
    reference: "מספר נכס",
    checked: "נבדק בתאריך",
    contact: "יצירת קשר עם מתווך",
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

// Package B2: approved-content payloads.
//
// Four public surfaces have no source of truth today: the about-and-team page,
// the area copy on a location page, the onboarding financing step, and the
// listing cost estimator. Each reads one of these builders. Every builder
// returns either approved content or a marked absence carrying the reason it
// is withheld, so a page can say "not published yet" instead of rendering an
// empty section that reads as a fact.
const APPROVED_CONTENT_NOTICES = {
  bg: {
    team: "Профилите на екипа още не са публикувани.",
    area_guide: "Информацията за района още не е публикувана.",
    financing: "Финансиращите партньори още не са публикувани.",
    purchase_fees: "Таблицата с разходите не е пълна, затова обща сума не се показва.",
  },
  en: {
    team: "Team profiles are not published yet.",
    area_guide: "Area information for this location is not published yet.",
    financing: "Financing options are not published yet.",
    purchase_fees: "The purchase cost table is not complete, so no total is shown.",
  },
  de: {
    team: "Die Teamprofile sind noch nicht veröffentlicht.",
    area_guide: "Die Informationen zur Region sind noch nicht veröffentlicht.",
    financing: "Die Finanzierungsoptionen sind noch nicht veröffentlicht.",
    purchase_fees: "Die Kostenübersicht ist unvollständig, daher wird keine Summe angezeigt.",
  },
  nl: {
    team: "De teamprofielen zijn nog niet gepubliceerd.",
    area_guide: "De informatie over dit gebied is nog niet gepubliceerd.",
    financing: "De financieringsopties zijn nog niet gepubliceerd.",
    purchase_fees: "Het kostenoverzicht is niet compleet, daarom wordt geen totaal getoond.",
  },
  ru: {
    team: "Профили команды ещё не опубликованы.",
    area_guide: "Информация о районе ещё не опубликована.",
    financing: "Варианты финансирования ещё не опубликованы.",
    purchase_fees: "Таблица расходов неполная, поэтому итог не показывается.",
  },
  el: {
    team: "Τα προφίλ της ομάδας δεν έχουν δημοσιευθεί ακόμη.",
    area_guide: "Οι πληροφορίες για την περιοχή δεν έχουν δημοσιευθεί ακόμη.",
    financing: "Οι επιλογές χρηματοδότησης δεν έχουν δημοσιευθεί ακόμη.",
    purchase_fees: "Ο πίνακας εξόδων δεν είναι πλήρης, επομένως δεν εμφανίζεται σύνολο.",
  },
  he: {
    team: "פרופילי הצוות טרם פורסמו.",
    area_guide: "המידע על האזור טרם פורסם.",
    financing: "אפשרויות המימון טרם פורסמו.",
    purchase_fees: "טבלת העלויות אינה מלאה, ולכן לא מוצג סכום כולל.",
  },
};

export function approvedContentNotice(localeCode, surface) {
  return (APPROVED_CONTENT_NOTICES[localeCode] || APPROVED_CONTENT_NOTICES.en)[surface];
}

function approvedFileFor(filePath, loader) {
  try {
    return readThroughCached(filePath, () => loader(filePath || undefined));
  } catch {
    // A missing or unreadable approved-content file is an absence, never a
    // reason to fail a page that has other things to say.
    return null;
  }
}

/**
 * Team profiles for the about-and-team page.
 * Returns { available: true, profiles: [...] } or a marked absence.
 */
export function teamProfilesPayload({ localeCode = "bg", sourceLocale = "bg", document = null, filePath = null, now } = {}) {
  const doc = document || approvedFileFor(filePath || DEFAULT_APPROVED_TEAM_PROFILES_PATH, readApprovedTeamProfiles);
  const profiles = doc ? publicTeamProfilesFor(doc, localeCode, { now, sourceLocale }) : [];
  const notice = approvedContentNotice(localeCode, "team");
  if (!profiles.length) {
    return { ...(doc ? teamAbsence(doc, localeCode, { now }) : { available: false, reason: "not_approved" }), notice };
  }
  return { available: true, locale: localeCode, profiles, count: profiles.length };
}

/**
 * Approved area copy for one location page, keyed by the same `location` value
 * the listings carry.
 */
export function areaGuidePayload({ localeCode = "bg", location, document = null, filePath = null, now } = {}) {
  const doc = document || approvedFileFor(filePath || DEFAULT_APPROVED_AREA_GUIDES_PATH, readApprovedAreaGuides);
  const payload = doc
    ? areaGuidePayloadFor(doc, location, localeCode, { now })
    : { available: false, reason: "not_approved", area_key: location, locale: localeCode };
  return payload.available ? payload : { ...payload, notice: approvedContentNotice(localeCode, "area_guide") };
}

/**
 * Financing routes for the onboarding financing step.
 * `buyerScope` is "eu", "non_eu", or "any".
 */
export function financingPartnersPayload({
  localeCode = "bg",
  sourceLocale = "bg",
  buyerScope = "any",
  document = null,
  filePath = null,
  now,
} = {}) {
  const doc = document || approvedFileFor(filePath || DEFAULT_APPROVED_FINANCING_PARTNERS_PATH, readApprovedFinancingPartners);
  const partners = doc ? publicFinancingPartnersFor(doc, localeCode, { buyerScope, now, sourceLocale }) : [];
  if (!partners.length) {
    return {
      ...(doc ? financingAbsence(doc, localeCode, { buyerScope, now }) : { available: false, reason: "not_approved" }),
      notice: approvedContentNotice(localeCode, "financing"),
    };
  }
  return { available: true, locale: localeCode, buyer_scope: buyerScope, partners, count: partners.length };
}

/**
 * The listing cost estimator. With a price it returns a full estimate or the
 * refusal naming every missing line; without one it returns the table state so
 * the page can render the control disabled and say why.
 */
export function purchaseFeePayload({
  localeCode = "bg",
  priceEur = null,
  municipality = null,
  buyerScope = "eu",
  document = null,
  filePath = null,
  now,
} = {}) {
  const doc = document || approvedFileFor(filePath || DEFAULT_APPROVED_PURCHASE_FEES_PATH, readApprovedPurchaseFees);
  const notice = approvedContentNotice(localeCode, "purchase_fees");
  const endpoint = "/api/purchase-fees/estimate";
  const buyerScopes = [...PURCHASE_FEE_BUYER_SCOPES];
  if (!doc) {
    return {
      available: false,
      reason: "not_approved",
      notice,
      endpoint,
      locale: localeCode,
      municipality,
      buyer_scopes: buyerScopes,
      table: [],
    };
  }
  const table = purchaseFeeTableStatus(doc, { municipality, now });
  const base = {
    endpoint,
    locale: localeCode,
    municipality,
    buyer_scope: buyerScope,
    buyer_scopes: buyerScopes,
    // Per buyer scope: which lines are required and which are still missing.
    table,
    currency: "EUR",
  };
  if (priceEur === null || priceEur === undefined || priceEur === "") {
    const scope = table.find((row) => row.buyer_scope === buyerScope);
    return scope?.available
      ? { ...base, available: true, reason: null, estimate: null, missing: [] }
      : { ...base, available: false, reason: "incomplete_fee_table", missing: scope?.missing || [], notice };
  }
  let estimate;
  try {
    estimate = purchaseFeeEstimate(doc, { priceEur, municipality, buyerScope, now });
  } catch (error) {
    return { ...base, available: false, reason: "bad_request", message: error.message, missing: [], notice };
  }
  return estimate.available
    ? { ...base, available: true, reason: null, estimate, missing: [] }
    : { ...base, available: false, reason: estimate.reason, missing: estimate.missing, estimate, notice };
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

// Sub-area chips for a location landing: the settlements (from the official
// geography registry) that the matched listings actually sit in, with counts.
function locationSubAreas(listings, locale, location) {
  const scope = PUBLIC_LOCATION_SCOPES[location];
  if (!scope?.municipality_code) return [];
  const searchPath = `/${locale.code}/${locale.route_segments?.search || "search"}`;
  const counts = new Map();
  for (const listing of listings) {
    const view = listingToPublicViewModel(listing);
    if (!view.settlement_ekatte) continue;
    const id = `BG:settlement:${view.settlement_ekatte}`;
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([id, count]) => ({ id, count, area: geographyRegistryArea(publicGeographyRegistry(), id) }))
    .filter(({ area }) => area?.names?.en)
    .sort((left, right) => right.count - left.count || left.area.names.en.localeCompare(right.area.names.en))
    .slice(0, 8)
    .map(({ id, count, area }) => ({
      id,
      count,
      label: locale.code === "bg" ? area.names.native : localizedLocationValue(locale.code, area.names.en),
      href: `${searchPath}?region_id=${encodeURIComponent(id)}`,
    }));
}

function locationSearchHref(locale, location) {
  const scope = PUBLIC_LOCATION_SCOPES[location];
  const searchPath = `/${locale.code}/${locale.route_segments?.search || "search"}`;
  const areaId = scope?.municipality_code
    ? `BG:municipality:${scope.municipality_code}`
    : scope?.settlement_ekatte
      ? `BG:settlement:${scope.settlement_ekatte}`
      : null;
  return areaId ? `${searchPath}?region_id=${encodeURIComponent(areaId)}` : `${searchPath}?location=${encodeURIComponent(location)}`;
}

export function renderLocationPage({ registry, localeCode, location, listings, areaGuides = null }) {
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
  const locationGuides = indexable ? approvedContentDocumentsForLocation(readApprovedCmsContent(), location, locale.code) : [];
  const contextGuide = locationGuides[0] || null;
  const context = contextGuide?.facts?.[0]
    ? {
        href: contextGuide.path,
        title: contextGuide.title,
        summary: contextGuide.facts[0],
      }
    : null;
  const guides = locationGuides
    .filter((doc) => doc.path !== contextGuide?.path)
    .slice(0, 3)
    .map((doc) => ({ href: doc.path, title: doc.title, summary: doc.facts?.[0] || "" }));
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
      intro: copy.description,
      sub_areas: locationSubAreas(matchedListings, locale, location),
      guides,
      seller: {
        path: sellerPath(registry, locale.code),
        label: labelsFor(locale.code).valuation,
        description: sellerCopy(locale.code).description,
      },
      search_href: locationSearchHref(locale, location),
      // Package B2: approved area copy for this location, or a marked absence.
      area_guide: areaGuidePayload({ localeCode: locale.code, location, document: areaGuides }),
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
  photoUploadDisabled = sellerPhotoUploadDisabledFromEnv(),
  photoUploadLimits = mediaUploadLimitsFromEnv(),
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
      // Photos attach to an enquiry, never to a listing, and never publish
      // themselves. The page says so and the endpoint enforces it.
      photo_upload: photoUploadDisabled
        ? null
        : {
            endpoint: `/api/seller-photos?return=${encodeURIComponent(path)}`,
            method: "POST",
            enctype: "multipart/form-data",
            field: "photo",
            reference_field: "enquiryId",
            accept: ["image/jpeg", "image/png", "image/webp", "image/avif"],
            max_files: photoUploadLimits.maxFiles,
            max_file_bytes: photoUploadLimits.maxFileBytes,
            max_request_bytes: photoUploadLimits.maxRequestBytes,
            minimum_tap_target_px: 44,
            public: false,
            searchable: false,
            published_automatically: false,
            review_required: true,
            copy: {
              title: copy.photos_title,
              intro: copy.photos_intro,
              privacy: copy.photos_privacy,
              field: copy.photos_field,
              reference: copy.photos_reference,
              reference_hint: copy.photos_reference_hint,
              submit: copy.photos_submit,
              pending: copy.photos_pending,
              success: copy.photos_success,
              failure: copy.photos_failure,
              limits: copy.photos_limits
                .replace("{files}", String(photoUploadLimits.maxFiles))
                .replace("{mb}", String(Math.max(1, Math.floor(photoUploadLimits.maxFileBytes / (1024 * 1024))))),
            },
          },
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
      // Front ends whose backend is not built yet render as clearly disabled
      // controls with a "coming soon" badge. An entry that carries a `request`
      // is live and renders a real form.
      upcoming: [
        {
          id: "viewing_trip",
          label: copy.planTrip,
          note: copy.planTripNote,
          icon: "calendar-days",
          when: "always",
          visible: true,
          // A viewing trip is a request. A broker arranges the days and
          // confirms them; software never commits the agency to a date.
          request: {
            endpoint: "/api/viewing-trips",
            method: "POST",
            confirmation: "human_required",
            label: copy.tripSubmit,
            success: copy.tripSent,
            pending: copy.tripPending,
            sending: copy.sending,
            // The server refuses a trip with neither an area nor a shortlisted
            // property. The visitor is told that by name before the post, not
            // through a generic "request failed".
            scope_required: copy.tripScopeRequired,
            payload: { locale: locale.code },
            areas: area ? [area.location] : [],
            fields: {
              arrival: copy.tripArrival,
              departure: copy.tripDeparture,
              party: copy.tripParty,
              areas: copy.tripAreas,
              shortlist: copy.tripShortlist,
              note: copy.tripNote,
            },
          },
        },
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

/* ============================================================
   Package P4: compare, about and team, saved-search management,
   plus the listing brochure and purchase-cost disclosure.
   Everything below this banner belongs to P4 and is self-contained.
   ============================================================ */

// Rows the comparison shows, in this order. `numeric` rows are right aligned
// in the stylesheet; every value is formatted on the server so the table reads
// the same with and without JavaScript.
const COMPARE_ROWS = Object.freeze([
  { id: "price", numeric: true },
  { id: "price_per_sqm", numeric: true },
  { id: "area_sqm", numeric: true },
  { id: "land_area_sqm", numeric: true },
  { id: "bedrooms", numeric: true },
  { id: "floor", numeric: true },
  { id: "offer_type", numeric: false },
  { id: "location", numeric: false },
  { id: "reference", numeric: false },
]);

const COMPARE_MAX_COLUMNS = 4;
const COMPARE_STORAGE_KEY = "ms-realty:saved-listings";
const ALERTS_STORAGE_KEY = "ms-realty:saved-searches:v1";

// The one office the agency runs, in Sandanski, as the owner confirmed. The
// street address is not published anywhere we can cite, so the card carries the
// shared agency line instead of an address nobody approved.
const P4_AGENCY_OFFICES = Object.freeze(["sandanski"]);

// Fee lines a Bulgarian purchase actually involves. No rate is stated: an
// approved fee table in the CMS supplies the values, and until then every line
// renders a marked placeholder and the total stays unavailable.
const PURCHASE_COST_LINES = Object.freeze(["transfer_tax", "notary", "agency", "company"]);

const P4_COPY = {
  bg: {
    compare: {
      title: "Сравнете запазените имоти | MS Realty",
      description: "Поставете до четири запазени имота на MS Realty един до друг и сравнете цена, площ, спални, етаж и локация.",
      h1: "Сравнете запазените имоти",
      intro: "До четири от вашите запазени имота, един до друг. Списъкът се пази в този браузър, така че никой друг не го вижда.",
      fallbackTitle: "Запазените имоти се пазят в този браузър",
      fallbackText:
        "Сравнението се съставя от имотите, които сте запазили на това устройство, затова изисква JavaScript. Може да отворите запазените имоти като списък или да споделите връзка към сравнение, която работи и без JavaScript.",
      savedLink: "Отворете запазените имоти",
      searchLink: "Разгледайте имоти",
      emptyTitle: "Още няма какво да се сравнява",
      emptyText: "Запазете два или повече имота със сърцето и те ще се появят тук един до друг.",
      limitNote: "Показваме първите {max} от {count} запазени имота.",
      unavailableNote: "Част от запазените имоти вече не са налични и не се показват.",
      identicalShow: "Покажете еднаквите редове ({count})",
      identicalHide: "Скрийте еднаквите редове ({count})",
      identicalHint: "Редовете, в които всички имоти имат една и съща стойност, са скрити, за да личат разликите.",
      remove: "Премахнете",
      removeLabel: "Премахнете {title} от запазените имоти",
      view: "Отворете имота",
      detail: "Показател",
      notStated: "Няма данни",
      addMore: "Добавете още един имот",
      columnLabel: "Имот {index}",
      tableLabel: "Сравнение на запазени имоти",
      rows: {
        price: "Цена",
        price_per_sqm: "Цена на m²",
        area_sqm: "Площ",
        land_area_sqm: "Площ на парцела",
        bedrooms: "Спални",
        floor: "Етаж",
        offer_type: "Оферта",
        location: "Локация",
        reference: "Референция",
      },
    },
    about: {
      title: "За MS Realty",
      description: "MS Realty е семейна агенция за недвижими имоти с офис в Сандански, която работи на седем езика.",
      h1: "За MS Realty",
      intro: "Семейна агенция в Сандански, която работи в Пиринския край, по Черноморието и в Северна Гърция.",
      storyTitle: "Кои сме ние",
      story: [
        "MS Realty е семейна агенция за недвижими имоти със седалище в Сандански. Продаваме и отдаваме имоти в града и Пиринския край, по Черноморието и отвъд границата в Северна Гърция.",
        "Повечето от нашите купувачи идват извън България, затова агенцията изгради работата си около една задача: покупката в чужда държава да бъде разбираема. Това означава факти за имота, проверени от брокер, ясно казани местни правила и човек, който отговаря на вашия език.",
        "Публикуваме сайта на български, английски, немски, нидерландски, руски, гръцки и иврит. Пишем първо на български и всеки превод се одобрява от човек, преди да се появи.",
      ],
      officesTitle: "Нашият офис",
      officesIntro: "Един офис в Сандански покрива всички райони, в които работим. Обадете се на общия номер и ще ви свържем с брокера, който отговаря за имота.",
      offices: {
        sandanski: { town: "Сандански", role: "Офис на агенцията", note: "Градът, полите на Пирин и област Благоевград." },
      },
      pillarsTitle: "Какво обещаваме на купувача",
      pillarsIntro: "Пет неща, към които се придържаме. Всяко от тях личи в сайта, не само тук.",
      pillars: {
        verified: {
          title: "Проверено",
          text: "Човек проверява всяка обява, преди да бъде публикувана, а страницата показва референцията и кога наличността е потвърдена за последно.",
        },
        transparent: {
          title: "Прозрачно",
          text: "Цената, референцията и източникът стоят на страницата на имота. Когато даден факт не е потвърден, го казваме, вместо да запълваме празнотата.",
        },
        fast: {
          title: "Бързо",
          text: "Запитването отива директно при брокер заедно с имота, който сте чели, така че първият отговор вече е по същество.",
        },
        multilingual: { title: "На вашия език", text: "Седем езика и брокер, който отговаря на този, на който сте писали." },
        local: { title: "Местни хора", text: "Брокери от този край, така че някой да отвори вратата, да мине по улицата и да прочете документите с вас." },
      },
      teamTitle: "Екипът",
      teamIntro: "Брокерите, с които ще работите, езиците, на които говорят, и данните за лиценза им.",
      teamEmptyTitle: "Профилите на екипа още не са публикувани",
      teamEmptyText:
        "Никой още не е одобрил профил на екипа в системата за съдържание, затова не показваме нито един, вместо да ги измисляме. Обадете се и ще ви кажем кой отговаря за имота, който гледате.",
      teamFields: "Всеки профил ще съдържа име, роля, офис, езиците на брокера, снимка и номер на лиценз.",
      contactTitle: "Говорете с брокер",
      contactText: "Един номер стига до офиса, по телефон, WhatsApp или Viber.",
      contactCta: "Свържете се с агенцията",
    },
    alerts: {
      title: "Вашите известия за имоти | MS Realty",
      description: "Запазените търсения, които сте заявили от това устройство, с критериите, честотата и канала на известията.",
      h1: "Вашите известия за имоти",
      intro: "Търсенията, които сте ни поръчали да следим. За всяко са изброени критериите, колко често пишем и къде отива известието.",
      notConnected: "Не е свързано",
      notConnectedTitle: "Тези бутони още не са свързани",
      notConnectedText:
        "Известията се създават, когато запазите търсене, но още няма начин да бъдат прочетени, спрени или изтрити от сайта. Докато това не е готово, кажете на брокер и ще променим или спрем известието вместо вас.",
      deviceNote:
        "Този списък е това, което браузърът помни за заявените от вас известия. Не се чете от агенцията и тук никога не пазим вашия имейл или телефон.",
      fallbackTitle: "Тази страница изисква JavaScript",
      fallbackText:
        "Списъкът се пази в този браузър и се чете тук, а не на сървъра. Без JavaScript пак може да създадете известие от страницата с резултати или да се обадите на брокер.",
      emptyTitle: "Няма известия от този браузър",
      emptyText: "Запазете търсене на страницата с резултати и то ще се появи тук с критериите си.",
      emptyCta: "Търсете имоти",
      criteria: "Критерии",
      frequency: "Колко често",
      channel: "Къде",
      requested: "Заявено на",
      anyCriteria: "Всякакъв имот",
      pause: "Спрете",
      resume: "Възобновете",
      remove: "Изтрийте",
      controlsNote:
        "Спирането, възобновяването и изтриването изискват услугата за известия да предостави маршрут за четене и промяна. Показани са, за да е пълна страницата, и остават неактивни, докато той не съществува.",
      openSearch: "Отворете това търсене",
      contactTitle: "Промяна на известие",
      contactText: "Кажете на брокер кое известие да спрем и ще го направим вместо вас.",
      contactCta: "Свържете се с агенцията",
      listLabel: "Запазени търсения",
    },
    listing: {
      brochureTitle: "Запазете или отпечатайте имота",
      saveAsPdf: "Запазете като PDF",
      brochureNote: "Отваря изглед за печат на една страница с проверените факти, снимките и референтния номер, готов за запазване като PDF.",
      costTitle: "Колко струва покупката",
      costIntro: "Освен цената покупката в България носи и тези разходи. Публикуваме ставка едва след като агенцията я одобри, а ред без одобрена ставка е отбелязан, вместо да бъде предположен.",
      costLines: {
        transfer_tax: {
          label: "Местен данък за прехвърляне",
          note: "Определя се от общината, в която е имотът, и се плаща при подписване на нотариалния акт.",
        },
        notary: { label: "Нотариална такса", note: "Начислява се върху стойността по акта по държавна тарифа, плюс вписването в имотния регистър." },
        agency: { label: "Комисиона на агенцията", note: "Нашето възнаграждение, договорено писмено, преди да направите оферта." },
        company: {
          label: "Българско дружество, купувачи извън ЕС",
          note: "Граждани извън ЕС не могат да притежават земя на свое име и я държат чрез българско дружество, чиято регистрация и поддръжка струват пари.",
        },
      },
      costTotal: "Общо",
      costTotalUnavailable: "Недостъпно, докато таблицата с такси не бъде одобрена",
      costNote:
        "Нито едно число тук не е прогноза. Редовете са разходите, които покупката включва; ставките идват от таблица с такси, която човек от агенцията трябва да одобри, преди да я публикуваме.",
      costCta: "Попитайте брокер за сумите",
    },
  },
  en: {
    compare: {
      title: "Compare saved properties | MS Realty",
      description: "Put up to four saved MS Realty properties side by side and compare price, area, bedrooms, floor and location.",
      h1: "Compare saved properties",
      intro: "Up to four of your saved properties, side by side. The list lives in this browser, so nobody else sees your shortlist.",
      fallbackTitle: "Your saved properties live in this browser",
      fallbackText:
        "The comparison is built from the properties you saved on this device, so it needs JavaScript. You can open your saved properties as a list instead, or share a comparison link, which works without JavaScript.",
      savedLink: "Open saved properties",
      searchLink: "Browse properties",
      emptyTitle: "Nothing to compare yet",
      emptyText: "Save two or more properties with the heart button and they appear here side by side.",
      limitNote: "Showing the first {max} of {count} saved properties.",
      unavailableNote: "Some saved properties are no longer available and are not shown.",
      identicalShow: "Show identical rows ({count})",
      identicalHide: "Hide identical rows ({count})",
      identicalHint: "Rows where every property has the same value are collapsed so the differences stay visible.",
      remove: "Remove",
      removeLabel: "Remove {title} from your saved properties",
      view: "Open property",
      detail: "Detail",
      notStated: "Not stated",
      addMore: "Add another property",
      columnLabel: "Property {index}",
      tableLabel: "Saved property comparison",
      rows: {
        price: "Price",
        price_per_sqm: "Price per m²",
        area_sqm: "Area",
        land_area_sqm: "Land area",
        bedrooms: "Bedrooms",
        floor: "Floor",
        offer_type: "Offer",
        location: "Location",
        reference: "Reference",
      },
    },
    about: {
      title: "About MS Realty",
      description: "MS Realty is a family estate agency with its office in Sandanski, working in seven languages.",
      h1: "About MS Realty",
      intro: "A family agency in Sandanski, working across the Pirin region, the Black Sea coast and northern Greece.",
      storyTitle: "Who we are",
      story: [
        "MS Realty is a family estate agency based in Sandanski. We sell and let property in the town and the surrounding Pirin region, along the Black Sea coast, and across the border in northern Greece.",
        "Most of our buyers come from outside Bulgaria, so the agency grew around one job: making a purchase in a foreign country understandable. That means property facts a broker has checked, the local rules stated plainly, and a person who answers in your language.",
        "We publish the site in Bulgarian, English, German, Dutch, Russian, Greek and Hebrew. Bulgarian is the language we write in first, and a person approves every translation before it appears.",
      ],
      officesTitle: "Our office",
      officesIntro: "One office in Sandanski covers every area we work in. Call the agency line and we will put you through to the broker who handles the property.",
      offices: {
        sandanski: { town: "Sandanski", role: "Agency office", note: "The town, the Pirin foothills and the Blagoevgrad district." },
      },
      pillarsTitle: "What we promise a buyer",
      pillarsIntro: "Five things we hold ourselves to. Each one is visible on the site, not only stated here.",
      pillars: {
        verified: {
          title: "Verified",
          text: "A person checks each listing before it is published, and the page shows the reference and when availability was last confirmed.",
        },
        transparent: {
          title: "Transparent",
          text: "Price, reference and source sit on the listing page. When a fact has not been confirmed we say so instead of filling the gap.",
        },
        fast: { title: "Fast", text: "An enquiry goes straight to a broker with the property you were reading, so the first reply already has the context." },
        multilingual: { title: "Multilingual", text: "Seven languages, and a broker who answers in the one you wrote in." },
        local: { title: "Local", text: "Brokers from the region, so someone can open the door, walk the street and read the paperwork with you." },
      },
      teamTitle: "The team",
      teamIntro: "The brokers you will deal with, the languages they work in and their licence details.",
      teamEmptyTitle: "Team profiles are not published yet",
      teamEmptyText:
        "Nobody has approved a team profile in the content system yet, so we show none rather than invent them. Call the agency and we will tell you who covers the property you are looking at.",
      teamFields: "Each profile will carry a name, a role, an office, the languages the broker works in, a photo and a licence number.",
      contactTitle: "Talk to a broker",
      contactText: "One line reaches the office, on the phone, WhatsApp or Viber.",
      contactCta: "Contact the agency",
    },
    alerts: {
      title: "Your property alerts | MS Realty",
      description: "The saved searches you asked for on this device, with their criteria, how often we write and where the alert goes.",
      h1: "Your property alerts",
      intro: "The searches you asked us to watch. Each one lists its criteria, how often we write and where the alert goes.",
      notConnected: "Not connected",
      notConnectedTitle: "These controls are not connected yet",
      notConnectedText:
        "Alerts are created when you save a search, but there is no way yet to read, pause or delete them from the website. Until that is built, ask a broker and we will change or stop an alert for you.",
      deviceNote:
        "This list is what this browser remembers about the alerts you asked for. It is not read back from the agency, and we never keep your email address or phone number here.",
      fallbackTitle: "This page needs JavaScript",
      fallbackText:
        "The list is stored in this browser, so it is read here rather than on the server. Without JavaScript you can still create an alert from the search page, or ask a broker directly.",
      emptyTitle: "No alerts from this browser",
      emptyText: "Save a search on the results page and it appears here with its criteria.",
      emptyCta: "Search properties",
      criteria: "Criteria",
      frequency: "How often",
      channel: "Where",
      requested: "Requested",
      anyCriteria: "Any property",
      pause: "Pause",
      resume: "Resume",
      remove: "Delete",
      controlsNote:
        "Pause, resume and delete need the alert service to expose a read and update route. They are shown here so the page is complete, and they stay disabled until it exists.",
      openSearch: "Open this search",
      contactTitle: "Change an alert",
      contactText: "Tell a broker which alert to pause or stop and we will do it for you.",
      contactCta: "Contact the agency",
      listLabel: "Saved searches",
    },
    listing: {
      brochureTitle: "Save or print this property",
      saveAsPdf: "Save as PDF",
      brochureNote: "Opens a one page print view with the reviewed facts, the photos and the reference number, ready to save as a PDF.",
      costTitle: "What this costs to buy",
      costIntro: "Besides the price, a Bulgarian purchase carries these costs. We publish a rate only once the agency has approved it, and a line without an approved rate is marked rather than guessed.",
      costLines: {
        transfer_tax: {
          label: "Local property transfer tax",
          note: "Set by the municipality the property sits in, and paid when the deed is signed.",
        },
        notary: { label: "Notary fee", note: "Charged on the deed value on a state scale, plus the entry in the property register." },
        agency: { label: "Agency commission", note: "Our fee, agreed in writing before you make an offer." },
        company: {
          label: "Bulgarian company, non-EU buyers",
          note: "Non-EU citizens cannot own land in their own name and hold it through a Bulgarian company, which costs money to register and to keep.",
        },
      },
      costTotal: "Total",
      costTotalUnavailable: "Unavailable until the fee table is approved",
      costNote:
        "No number here is an estimate. The lines are the costs a purchase involves; the rates come from a fee table a person at the agency has to approve before we publish it.",
      costCta: "Ask a broker for the figures",
    },
  },
  de: {
    compare: {
      title: "Gespeicherte Immobilien vergleichen | MS Realty",
      description: "Stellen Sie bis zu vier gespeicherte MS Realty Immobilien nebeneinander und vergleichen Sie Preis, Fläche, Schlafzimmer, Etage und Lage.",
      h1: "Gespeicherte Immobilien vergleichen",
      intro: "Bis zu vier Ihrer gespeicherten Immobilien, nebeneinander. Die Liste bleibt in diesem Browser, niemand sonst sieht Ihre Auswahl.",
      fallbackTitle: "Ihre gespeicherten Immobilien liegen in diesem Browser",
      fallbackText:
        "Der Vergleich entsteht aus den Immobilien, die Sie auf diesem Gerät gespeichert haben, und braucht daher JavaScript. Sie können Ihre gespeicherten Immobilien stattdessen als Liste öffnen oder einen Vergleichslink teilen, der auch ohne JavaScript funktioniert.",
      savedLink: "Gespeicherte Immobilien öffnen",
      searchLink: "Immobilien ansehen",
      emptyTitle: "Noch nichts zu vergleichen",
      emptyText: "Speichern Sie zwei oder mehr Immobilien mit dem Herz, dann erscheinen sie hier nebeneinander.",
      limitNote: "Es werden die ersten {max} von {count} gespeicherten Immobilien gezeigt.",
      unavailableNote: "Einige gespeicherte Immobilien sind nicht mehr verfügbar und werden nicht gezeigt.",
      identicalShow: "Gleiche Zeilen anzeigen ({count})",
      identicalHide: "Gleiche Zeilen ausblenden ({count})",
      identicalHint: "Zeilen, in denen alle Immobilien denselben Wert haben, sind eingeklappt, damit die Unterschiede sichtbar bleiben.",
      remove: "Entfernen",
      removeLabel: "{title} aus Ihren gespeicherten Immobilien entfernen",
      view: "Immobilie öffnen",
      detail: "Merkmal",
      notStated: "Keine Angabe",
      addMore: "Weitere Immobilie hinzufügen",
      columnLabel: "Immobilie {index}",
      tableLabel: "Vergleich gespeicherter Immobilien",
      rows: {
        price: "Preis",
        price_per_sqm: "Preis pro m²",
        area_sqm: "Fläche",
        land_area_sqm: "Grundstück",
        bedrooms: "Schlafzimmer",
        floor: "Etage",
        offer_type: "Angebot",
        location: "Lage",
        reference: "Referenz",
      },
    },
    about: {
      title: "Über MS Realty",
      description: "MS Realty ist ein Familienmaklerbüro mit Sitz in Sandanski und arbeitet in sieben Sprachen.",
      h1: "Über MS Realty",
      intro: "Ein Familienbüro in Sandanski, tätig in der Pirin-Region, an der Schwarzmeerküste und in Nordgriechenland.",
      storyTitle: "Wer wir sind",
      story: [
        "MS Realty ist ein Familienmaklerbüro mit Sitz in Sandanski. Wir verkaufen und vermieten Immobilien in der Stadt und in der Pirin-Region, an der Schwarzmeerküste und jenseits der Grenze in Nordgriechenland.",
        "Die meisten unserer Käufer kommen von außerhalb Bulgariens, deshalb ist das Büro um eine Aufgabe herum gewachsen: einen Kauf im Ausland verständlich zu machen. Das bedeutet von einem Makler geprüfte Objektangaben, klar benannte lokale Regeln und einen Menschen, der in Ihrer Sprache antwortet.",
        "Wir veröffentlichen die Website auf Bulgarisch, Englisch, Deutsch, Niederländisch, Russisch, Griechisch und Hebräisch. Wir schreiben zuerst auf Bulgarisch, und ein Mensch gibt jede Übersetzung frei, bevor sie erscheint.",
      ],
      officesTitle: "Unser Büro",
      officesIntro: "Ein Büro in Sandanski deckt alle Gebiete ab, in denen wir arbeiten. Rufen Sie die Bürolinie an, wir verbinden Sie mit dem Makler, der die Immobilie betreut.",
      offices: {
        sandanski: { town: "Sandanski", role: "Büro der Agentur", note: "Die Stadt, das Pirin-Vorland und der Bezirk Blagoevgrad." },
      },
      pillarsTitle: "Was wir einem Käufer zusagen",
      pillarsIntro: "Fünf Punkte, an denen wir uns messen lassen. Jeder ist auf der Website sichtbar, nicht nur hier benannt.",
      pillars: {
        verified: {
          title: "Geprüft",
          text: "Ein Mensch prüft jedes Objekt vor der Veröffentlichung, und die Seite zeigt die Referenz und wann die Verfügbarkeit zuletzt bestätigt wurde.",
        },
        transparent: {
          title: "Transparent",
          text: "Preis, Referenz und Quelle stehen auf der Objektseite. Ist eine Angabe nicht bestätigt, sagen wir das, statt die Lücke zu füllen.",
        },
        fast: { title: "Schnell", text: "Eine Anfrage geht direkt an einen Makler, samt der Immobilie, die Sie gelesen haben, so hat die erste Antwort schon den Zusammenhang." },
        multilingual: { title: "Mehrsprachig", text: "Sieben Sprachen und ein Makler, der in der Sprache antwortet, in der Sie geschrieben haben." },
        local: { title: "Vor Ort", text: "Makler aus der Region, damit jemand die Tür öffnet, die Straße mit Ihnen abgeht und die Unterlagen mit Ihnen liest." },
      },
      teamTitle: "Das Team",
      teamIntro: "Die Makler, mit denen Sie zu tun haben, die Sprachen, in denen sie arbeiten, und ihre Lizenzangaben.",
      teamEmptyTitle: "Team-Profile sind noch nicht veröffentlicht",
      teamEmptyText:
        "Im Redaktionssystem hat noch niemand ein Team-Profil freigegeben, deshalb zeigen wir keines, statt welche zu erfinden. Rufen Sie an, wir sagen Ihnen, wer die Immobilie betreut, die Sie ansehen.",
      teamFields: "Jedes Profil wird Name, Rolle, Büro, die Sprachen des Maklers, ein Foto und eine Lizenznummer enthalten.",
      contactTitle: "Mit einem Makler sprechen",
      contactText: "Eine Nummer erreicht das Büro, per Telefon, WhatsApp oder Viber.",
      contactCta: "Büro kontaktieren",
    },
    alerts: {
      title: "Ihre Immobilien-Benachrichtigungen | MS Realty",
      description: "Die gespeicherten Suchen, die Sie auf diesem Gerät angefordert haben, mit Kriterien, Häufigkeit und Kanal.",
      h1: "Ihre Immobilien-Benachrichtigungen",
      intro: "Die Suchen, die wir für Sie beobachten sollen. Jede zeigt ihre Kriterien, wie oft wir schreiben und wohin die Benachrichtigung geht.",
      notConnected: "Nicht angebunden",
      notConnectedTitle: "Diese Bedienelemente sind noch nicht angebunden",
      notConnectedText:
        "Benachrichtigungen entstehen, wenn Sie eine Suche speichern, aber sie lassen sich von der Website aus noch nicht lesen, pausieren oder löschen. Bis das gebaut ist, sagen Sie einem Makler Bescheid, wir ändern oder stoppen eine Benachrichtigung für Sie.",
      deviceNote:
        "Diese Liste ist das, was dieser Browser über Ihre angeforderten Benachrichtigungen weiß. Sie wird nicht vom Büro zurückgelesen, und wir speichern hier nie Ihre E-Mail-Adresse oder Telefonnummer.",
      fallbackTitle: "Diese Seite braucht JavaScript",
      fallbackText:
        "Die Liste liegt in diesem Browser und wird daher hier gelesen, nicht auf dem Server. Ohne JavaScript können Sie eine Benachrichtigung weiterhin auf der Ergebnisseite anlegen oder einen Makler fragen.",
      emptyTitle: "Keine Benachrichtigungen aus diesem Browser",
      emptyText: "Speichern Sie eine Suche auf der Ergebnisseite, dann erscheint sie hier mit ihren Kriterien.",
      emptyCta: "Immobilien suchen",
      criteria: "Kriterien",
      frequency: "Wie oft",
      channel: "Wohin",
      requested: "Angefordert am",
      anyCriteria: "Jede Immobilie",
      pause: "Pausieren",
      resume: "Fortsetzen",
      remove: "Löschen",
      controlsNote:
        "Pausieren, Fortsetzen und Löschen brauchen einen Lese- und Änderungsweg im Benachrichtigungsdienst. Sie stehen hier, damit die Seite vollständig ist, und bleiben deaktiviert, bis es ihn gibt.",
      openSearch: "Diese Suche öffnen",
      contactTitle: "Benachrichtigung ändern",
      contactText: "Sagen Sie einem Makler, welche Benachrichtigung pausiert oder gestoppt werden soll, wir erledigen das.",
      contactCta: "Büro kontaktieren",
      listLabel: "Gespeicherte Suchen",
    },
    listing: {
      brochureTitle: "Immobilie speichern oder drucken",
      saveAsPdf: "Als PDF speichern",
      brochureNote: "Öffnet eine einseitige Druckansicht mit den geprüften Angaben, den Fotos und der Referenznummer, fertig zum Speichern als PDF.",
      costTitle: "Was der Kauf kostet",
      costIntro: "Neben dem Preis bringt ein Kauf in Bulgarien diese Kosten mit sich. Eine Rate veröffentlichen wir erst, wenn das Büro sie freigegeben hat, und eine Zeile ohne freigegebene Rate wird gekennzeichnet statt geschätzt.",
      costLines: {
        transfer_tax: {
          label: "Kommunale Grunderwerbsteuer",
          note: "Wird von der Gemeinde festgelegt, in der die Immobilie liegt, und bei der Beurkundung gezahlt.",
        },
        notary: { label: "Notargebühr", note: "Wird nach staatlicher Tabelle auf den Urkundenwert berechnet, dazu die Eintragung im Grundbuch." },
        agency: { label: "Maklerprovision", note: "Unser Honorar, schriftlich vereinbart, bevor Sie ein Angebot abgeben." },
        company: {
          label: "Bulgarische Gesellschaft, Käufer außerhalb der EU",
          note: "Nicht-EU-Bürger können Land nicht auf ihren eigenen Namen besitzen und halten es über eine bulgarische Gesellschaft, deren Gründung und Führung Geld kostet.",
        },
      },
      costTotal: "Summe",
      costTotalUnavailable: "Nicht verfügbar, bis die Gebührentabelle freigegeben ist",
      costNote:
        "Keine Zahl hier ist eine Schätzung. Die Zeilen sind die Kosten, die ein Kauf mit sich bringt; die Sätze stammen aus einer Gebührentabelle, die ein Mensch im Büro freigeben muss, bevor wir sie veröffentlichen.",
      costCta: "Einen Makler nach den Beträgen fragen",
    },
  },
  nl: {
    compare: {
      title: "Bewaarde woningen vergelijken | MS Realty",
      description: "Zet tot vier bewaarde MS Realty woningen naast elkaar en vergelijk prijs, oppervlakte, slaapkamers, verdieping en locatie.",
      h1: "Bewaarde woningen vergelijken",
      intro: "Tot vier van uw bewaarde woningen, naast elkaar. De lijst blijft in deze browser, dus niemand anders ziet uw selectie.",
      fallbackTitle: "Uw bewaarde woningen staan in deze browser",
      fallbackText:
        "De vergelijking wordt opgebouwd uit de woningen die u op dit apparaat hebt bewaard en heeft daarom JavaScript nodig. U kunt uw bewaarde woningen ook als lijst openen of een vergelijkingslink delen, die wel zonder JavaScript werkt.",
      savedLink: "Bewaarde woningen openen",
      searchLink: "Woningen bekijken",
      emptyTitle: "Nog niets te vergelijken",
      emptyText: "Bewaar twee of meer woningen met het hartje, dan verschijnen ze hier naast elkaar.",
      limitNote: "De eerste {max} van {count} bewaarde woningen worden getoond.",
      unavailableNote: "Sommige bewaarde woningen zijn niet meer beschikbaar en worden niet getoond.",
      identicalShow: "Gelijke rijen tonen ({count})",
      identicalHide: "Gelijke rijen verbergen ({count})",
      identicalHint: "Rijen waarin alle woningen dezelfde waarde hebben zijn ingeklapt, zodat de verschillen zichtbaar blijven.",
      remove: "Verwijderen",
      removeLabel: "{title} uit uw bewaarde woningen verwijderen",
      view: "Woning openen",
      detail: "Kenmerk",
      notStated: "Niet vermeld",
      addMore: "Nog een woning toevoegen",
      columnLabel: "Woning {index}",
      tableLabel: "Vergelijking van bewaarde woningen",
      rows: {
        price: "Prijs",
        price_per_sqm: "Prijs per m²",
        area_sqm: "Oppervlakte",
        land_area_sqm: "Perceel",
        bedrooms: "Slaapkamers",
        floor: "Verdieping",
        offer_type: "Aanbod",
        location: "Locatie",
        reference: "Referentie",
      },
    },
    about: {
      title: "Over MS Realty",
      description: "MS Realty is een familiemakelaardij met kantoor in Sandanski, werkzaam in zeven talen.",
      h1: "Over MS Realty",
      intro: "Een familiekantoor in Sandanski, werkzaam in de Pirin-regio, aan de Zwarte Zeekust en in Noord-Griekenland.",
      storyTitle: "Wie wij zijn",
      story: [
        "MS Realty is een familiemakelaardij gevestigd in Sandanski. Wij verkopen en verhuren vastgoed in de stad en de Pirin-regio, aan de Zwarte Zeekust en over de grens in Noord-Griekenland.",
        "De meeste van onze kopers komen van buiten Bulgarije, dus het kantoor groeide rond één taak: een aankoop in het buitenland begrijpelijk maken. Dat betekent woninggegevens die een makelaar heeft gecontroleerd, lokale regels die duidelijk worden benoemd, en een mens die in uw taal antwoordt.",
        "Wij publiceren de site in het Bulgaars, Engels, Duits, Nederlands, Russisch, Grieks en Hebreeuws. Wij schrijven eerst in het Bulgaars, en een mens keurt elke vertaling goed voordat die verschijnt.",
      ],
      officesTitle: "Ons kantoor",
      officesIntro: "Eén kantoor in Sandanski dekt alle gebieden waarin wij werken. Bel het algemene nummer, dan verbinden wij u met de makelaar die de woning behandelt.",
      offices: {
        sandanski: { town: "Sandanski", role: "Kantoor van het bureau", note: "De stad, de uitlopers van de Pirin en het district Blagoevgrad." },
      },
      pillarsTitle: "Wat wij een koper beloven",
      pillarsIntro: "Vijf punten waaraan wij ons houden. Elk daarvan is op de site zichtbaar, niet alleen hier genoemd.",
      pillars: {
        verified: {
          title: "Gecontroleerd",
          text: "Een mens controleert elke woning voordat die wordt gepubliceerd, en de pagina toont de referentie en wanneer de beschikbaarheid het laatst is bevestigd.",
        },
        transparent: {
          title: "Transparant",
          text: "Prijs, referentie en bron staan op de woningpagina. Is een gegeven niet bevestigd, dan zeggen wij dat in plaats van het gat te vullen.",
        },
        fast: { title: "Snel", text: "Een aanvraag gaat rechtstreeks naar een makelaar, met de woning die u las erbij, zodat het eerste antwoord de context al heeft." },
        multilingual: { title: "Meertalig", text: "Zeven talen, en een makelaar die antwoordt in de taal waarin u schreef." },
        local: { title: "Lokaal", text: "Makelaars uit de regio, zodat iemand de deur opent, de straat met u afloopt en de papieren met u doorneemt." },
      },
      teamTitle: "Het team",
      teamIntro: "De makelaars met wie u te maken krijgt, de talen waarin zij werken en hun licentiegegevens.",
      teamEmptyTitle: "Teamprofielen zijn nog niet gepubliceerd",
      teamEmptyText:
        "Niemand heeft in het contentsysteem al een teamprofiel goedgekeurd, dus tonen wij er geen in plaats van ze te verzinnen. Bel ons en wij vertellen u wie de woning behandelt die u bekijkt.",
      teamFields: "Elk profiel krijgt een naam, een rol, een kantoor, de talen van de makelaar, een foto en een licentienummer.",
      contactTitle: "Spreek een makelaar",
      contactText: "Eén nummer bereikt het kantoor, via telefoon, WhatsApp of Viber.",
      contactCta: "Neem contact op",
    },
    alerts: {
      title: "Uw woningmeldingen | MS Realty",
      description: "De bewaarde zoekopdrachten die u op dit apparaat hebt aangevraagd, met criteria, frequentie en kanaal.",
      h1: "Uw woningmeldingen",
      intro: "De zoekopdrachten die wij voor u in de gaten houden. Elk toont de criteria, hoe vaak wij schrijven en waar de melding heen gaat.",
      notConnected: "Niet aangesloten",
      notConnectedTitle: "Deze knoppen zijn nog niet aangesloten",
      notConnectedText:
        "Meldingen ontstaan wanneer u een zoekopdracht bewaart, maar ze zijn vanaf de site nog niet te lezen, te pauzeren of te verwijderen. Zolang dat niet gebouwd is, vraagt u het een makelaar en wij passen een melding voor u aan of stoppen die.",
      deviceNote:
        "Deze lijst is wat deze browser onthoudt over de meldingen die u hebt aangevraagd. Hij wordt niet bij het kantoor opgehaald, en wij bewaren hier nooit uw e-mailadres of telefoonnummer.",
      fallbackTitle: "Deze pagina heeft JavaScript nodig",
      fallbackText:
        "De lijst staat in deze browser en wordt hier gelezen, niet op de server. Zonder JavaScript kunt u nog steeds een melding aanmaken op de resultatenpagina of een makelaar vragen.",
      emptyTitle: "Geen meldingen uit deze browser",
      emptyText: "Bewaar een zoekopdracht op de resultatenpagina, dan verschijnt die hier met de criteria.",
      emptyCta: "Woningen zoeken",
      criteria: "Criteria",
      frequency: "Hoe vaak",
      channel: "Waarheen",
      requested: "Aangevraagd op",
      anyCriteria: "Elke woning",
      pause: "Pauzeren",
      resume: "Hervatten",
      remove: "Verwijderen",
      controlsNote:
        "Pauzeren, hervatten en verwijderen vragen om een lees- en wijzigroute in de meldingsdienst. Ze staan hier zodat de pagina volledig is, en blijven uitgeschakeld tot die er is.",
      openSearch: "Deze zoekopdracht openen",
      contactTitle: "Een melding wijzigen",
      contactText: "Vertel een makelaar welke melding gepauzeerd of gestopt moet worden, dan regelen wij dat.",
      contactCta: "Neem contact op",
      listLabel: "Bewaarde zoekopdrachten",
    },
    listing: {
      brochureTitle: "Deze woning opslaan of afdrukken",
      saveAsPdf: "Opslaan als PDF",
      brochureNote: "Opent een afdrukweergave van één pagina met de gecontroleerde gegevens, de foto's en het referentienummer, klaar om als PDF te bewaren.",
      costTitle: "Wat de aankoop kost",
      costIntro: "Naast de prijs brengt een aankoop in Bulgarije deze kosten mee. Wij publiceren een tarief pas nadat het kantoor het heeft goedgekeurd, en een regel zonder goedgekeurd tarief wordt gemarkeerd in plaats van geschat.",
      costLines: {
        transfer_tax: {
          label: "Gemeentelijke overdrachtsbelasting",
          note: "Vastgesteld door de gemeente waar de woning ligt, en betaald bij het tekenen van de akte.",
        },
        notary: { label: "Notariskosten", note: "Berekend over de aktewaarde volgens een staatsschaal, plus de inschrijving in het kadaster." },
        agency: { label: "Makelaarscourtage", note: "Ons honorarium, schriftelijk afgesproken voordat u een bod doet." },
        company: {
          label: "Bulgaarse vennootschap, kopers van buiten de EU",
          note: "Burgers van buiten de EU kunnen grond niet op eigen naam bezitten en houden die via een Bulgaarse vennootschap, waarvan oprichting en instandhouding geld kosten.",
        },
      },
      costTotal: "Totaal",
      costTotalUnavailable: "Niet beschikbaar tot de tarieventabel is goedgekeurd",
      costNote:
        "Geen enkel getal hier is een schatting. De regels zijn de kosten die een aankoop met zich meebrengt; de tarieven komen uit een tarieventabel die iemand van het kantoor moet goedkeuren voordat wij die publiceren.",
      costCta: "Vraag een makelaar naar de bedragen",
    },
  },
  ru: {
    compare: {
      title: "Сравнение сохранённых объектов | MS Realty",
      description: "Поставьте до четырёх сохранённых объектов MS Realty рядом и сравните цену, площадь, спальни, этаж и расположение.",
      h1: "Сравнение сохранённых объектов",
      intro: "До четырёх ваших сохранённых объектов рядом. Список хранится в этом браузере, поэтому его больше никто не видит.",
      fallbackTitle: "Сохранённые объекты хранятся в этом браузере",
      fallbackText:
        "Сравнение строится из объектов, сохранённых на этом устройстве, поэтому нужен JavaScript. Можно открыть сохранённые объекты списком или поделиться ссылкой на сравнение, которая работает и без JavaScript.",
      savedLink: "Открыть сохранённые объекты",
      searchLink: "Смотреть объекты",
      emptyTitle: "Сравнивать пока нечего",
      emptyText: "Сохраните два или больше объектов сердечком, и они появятся здесь рядом.",
      limitNote: "Показаны первые {max} из {count} сохранённых объектов.",
      unavailableNote: "Часть сохранённых объектов больше не доступна и не показана.",
      identicalShow: "Показать одинаковые строки ({count})",
      identicalHide: "Скрыть одинаковые строки ({count})",
      identicalHint: "Строки, где у всех объектов одно и то же значение, свёрнуты, чтобы различия оставались на виду.",
      remove: "Убрать",
      removeLabel: "Убрать {title} из сохранённых объектов",
      view: "Открыть объект",
      detail: "Параметр",
      notStated: "Не указано",
      addMore: "Добавить ещё объект",
      columnLabel: "Объект {index}",
      tableLabel: "Сравнение сохранённых объектов",
      rows: {
        price: "Цена",
        price_per_sqm: "Цена за m²",
        area_sqm: "Площадь",
        land_area_sqm: "Площадь участка",
        bedrooms: "Спальни",
        floor: "Этаж",
        offer_type: "Предложение",
        location: "Расположение",
        reference: "Референс",
      },
    },
    about: {
      title: "О компании MS Realty",
      description: "MS Realty, семейное агентство недвижимости с офисом в Сандански, работает на семи языках.",
      h1: "О компании MS Realty",
      intro: "Семейное агентство в Сандански, работающее в Пиринском крае, на черноморском побережье и в Северной Греции.",
      storyTitle: "Кто мы",
      story: [
        "MS Realty, семейное агентство недвижимости со штаб-квартирой в Сандански. Мы продаём и сдаём недвижимость в городе и Пиринском крае, на черноморском побережье и за границей, в Северной Греции.",
        "Большинство наших покупателей приезжают из-за пределов Болгарии, поэтому агентство выросло вокруг одной задачи: сделать покупку в чужой стране понятной. Это значит проверенные брокером факты об объекте, прямо изложенные местные правила и человек, который отвечает на вашем языке.",
        "Мы публикуем сайт на болгарском, английском, немецком, нидерландском, русском, греческом и иврите. Сначала мы пишем по-болгарски, и каждый перевод утверждает человек, прежде чем он появится.",
      ],
      officesTitle: "Наш офис",
      officesIntro: "Один офис в Сандански покрывает все районы, где мы работаем. Позвоните на общий номер, и мы соединим вас с брокером, который ведёт объект.",
      offices: {
        sandanski: { town: "Сандански", role: "Офис агентства", note: "Город, предгорья Пирина и Благоевградская область." },
      },
      pillarsTitle: "Что мы обещаем покупателю",
      pillarsIntro: "Пять вещей, которых мы придерживаемся. Каждая видна на сайте, а не только названа здесь.",
      pillars: {
        verified: {
          title: "Проверено",
          text: "Человек проверяет каждое объявление до публикации, а страница показывает референс и когда наличие подтверждали в последний раз.",
        },
        transparent: {
          title: "Прозрачно",
          text: "Цена, референс и источник стоят на странице объекта. Если факт не подтверждён, мы так и говорим, вместо того чтобы заполнить пробел.",
        },
        fast: { title: "Быстро", text: "Запрос идёт прямо к брокеру вместе с объектом, который вы читали, поэтому первый ответ уже по делу." },
        multilingual: { title: "На вашем языке", text: "Семь языков и брокер, который отвечает на том, на котором вы написали." },
        local: { title: "Местные", text: "Брокеры из этого края, чтобы кто-то открыл дверь, прошёл с вами по улице и прочитал с вами документы." },
      },
      teamTitle: "Команда",
      teamIntro: "Брокеры, с которыми вы будете работать, языки, на которых они говорят, и данные их лицензии.",
      teamEmptyTitle: "Профили команды пока не опубликованы",
      teamEmptyText:
        "В системе контента пока никто не утвердил профиль сотрудника, поэтому мы не показываем ни одного, вместо того чтобы их придумать. Позвоните, и мы скажем, кто ведёт объект, который вы смотрите.",
      teamFields: "В каждом профиле будут имя, роль, офис, языки брокера, фотография и номер лицензии.",
      contactTitle: "Поговорить с брокером",
      contactText: "Один номер соединяет с офисом: по телефону, в WhatsApp или Viber.",
      contactCta: "Связаться с агентством",
    },
    alerts: {
      title: "Ваши подписки на объекты | MS Realty",
      description: "Сохранённые поиски, которые вы заказали с этого устройства, с критериями, частотой и каналом.",
      h1: "Ваши подписки на объекты",
      intro: "Поиски, за которыми вы просили следить. У каждого указаны критерии, как часто мы пишем и куда уходит уведомление.",
      notConnected: "Не подключено",
      notConnectedTitle: "Эти кнопки пока не подключены",
      notConnectedText:
        "Подписки создаются, когда вы сохраняете поиск, но прочитать, приостановить или удалить их с сайта пока нельзя. Пока это не сделано, скажите брокеру, и мы изменим или остановим подписку за вас.",
      deviceNote:
        "Этот список, то что браузер помнит о заказанных вами подписках. Он не читается со стороны агентства, и мы никогда не храним здесь ваш адрес почты или телефон.",
      fallbackTitle: "Этой странице нужен JavaScript",
      fallbackText:
        "Список хранится в этом браузере и читается здесь, а не на сервере. Без JavaScript вы всё равно можете создать подписку на странице результатов или обратиться к брокеру.",
      emptyTitle: "Из этого браузера подписок нет",
      emptyText: "Сохраните поиск на странице результатов, и он появится здесь со своими критериями.",
      emptyCta: "Искать объекты",
      criteria: "Критерии",
      frequency: "Как часто",
      channel: "Куда",
      requested: "Заказано",
      anyCriteria: "Любой объект",
      pause: "Приостановить",
      resume: "Возобновить",
      remove: "Удалить",
      controlsNote:
        "Приостановка, возобновление и удаление требуют, чтобы служба подписок открыла маршрут чтения и изменения. Они показаны, чтобы страница была целостной, и остаются неактивными, пока его нет.",
      openSearch: "Открыть этот поиск",
      contactTitle: "Изменить подписку",
      contactText: "Скажите брокеру, какую подписку приостановить или остановить, и мы это сделаем.",
      contactCta: "Связаться с агентством",
      listLabel: "Сохранённые поиски",
    },
    listing: {
      brochureTitle: "Сохраните или распечатайте объект",
      saveAsPdf: "Сохранить как PDF",
      brochureNote: "Открывает одностраничный вид для печати с проверенными фактами, фотографиями и референсным номером, готовый к сохранению в PDF.",
      costTitle: "Во что обойдётся покупка",
      costIntro: "Кроме цены покупка в Болгарии несёт эти расходы. Мы публикуем ставку только после того, как её утвердит агентство, а строка без утверждённой ставки помечается, а не угадывается.",
      costLines: {
        transfer_tax: {
          label: "Местный налог на переход права",
          note: "Устанавливается общиной, где находится объект, и платится при подписании нотариального акта.",
        },
        notary: { label: "Нотариальный сбор", note: "Начисляется на стоимость по акту по государственной шкале, плюс запись в реестр недвижимости." },
        agency: { label: "Комиссия агентства", note: "Наше вознаграждение, согласованное письменно до того, как вы сделаете предложение." },
        company: {
          label: "Болгарская компания, покупатели вне ЕС",
          note: "Граждане вне ЕС не могут владеть землёй на своё имя и держат её через болгарскую компанию, регистрация и содержание которой стоят денег.",
        },
      },
      costTotal: "Итого",
      costTotalUnavailable: "Недоступно, пока таблица сборов не утверждена",
      costNote:
        "Ни одно число здесь не является оценкой. Строки, это расходы, которые несёт покупка; ставки берутся из таблицы сборов, которую человек в агентстве должен утвердить до публикации.",
      costCta: "Спросить брокера о суммах",
    },
  },
  el: {
    compare: {
      title: "Σύγκριση αποθηκευμένων ακινήτων | MS Realty",
      description: "Βάλτε έως τέσσερα αποθηκευμένα ακίνητα της MS Realty δίπλα δίπλα και συγκρίνετε τιμή, εμβαδόν, υπνοδωμάτια, όροφο και τοποθεσία.",
      h1: "Σύγκριση αποθηκευμένων ακινήτων",
      intro: "Έως τέσσερα από τα αποθηκευμένα σας ακίνητα, δίπλα δίπλα. Η λίστα μένει σε αυτό το πρόγραμμα περιήγησης, οπότε δεν τη βλέπει κανείς άλλος.",
      fallbackTitle: "Τα αποθηκευμένα ακίνητα βρίσκονται σε αυτό το πρόγραμμα περιήγησης",
      fallbackText:
        "Η σύγκριση χτίζεται από τα ακίνητα που αποθηκεύσατε σε αυτή τη συσκευή, γι αυτό χρειάζεται JavaScript. Μπορείτε να ανοίξετε τα αποθηκευμένα ακίνητα ως λίστα ή να μοιραστείτε έναν σύνδεσμο σύγκρισης, που λειτουργεί και χωρίς JavaScript.",
      savedLink: "Άνοιγμα αποθηκευμένων ακινήτων",
      searchLink: "Δείτε ακίνητα",
      emptyTitle: "Δεν υπάρχει ακόμη κάτι για σύγκριση",
      emptyText: "Αποθηκεύστε δύο ή περισσότερα ακίνητα με την καρδιά και θα εμφανιστούν εδώ δίπλα δίπλα.",
      limitNote: "Εμφανίζονται τα πρώτα {max} από {count} αποθηκευμένα ακίνητα.",
      unavailableNote: "Ορισμένα αποθηκευμένα ακίνητα δεν είναι πια διαθέσιμα και δεν εμφανίζονται.",
      identicalShow: "Εμφάνιση ίδιων γραμμών ({count})",
      identicalHide: "Απόκρυψη ίδιων γραμμών ({count})",
      identicalHint: "Οι γραμμές όπου όλα τα ακίνητα έχουν την ίδια τιμή είναι κλειστές, ώστε να ξεχωρίζουν οι διαφορές.",
      remove: "Αφαίρεση",
      removeLabel: "Αφαίρεση του {title} από τα αποθηκευμένα σας ακίνητα",
      view: "Άνοιγμα ακινήτου",
      detail: "Στοιχείο",
      notStated: "Δεν αναφέρεται",
      addMore: "Προσθήκη ακόμη ενός ακινήτου",
      columnLabel: "Ακίνητο {index}",
      tableLabel: "Σύγκριση αποθηκευμένων ακινήτων",
      rows: {
        price: "Τιμή",
        price_per_sqm: "Τιμή ανά m²",
        area_sqm: "Εμβαδόν",
        land_area_sqm: "Έκταση οικοπέδου",
        bedrooms: "Υπνοδωμάτια",
        floor: "Όροφος",
        offer_type: "Προσφορά",
        location: "Τοποθεσία",
        reference: "Κωδικός",
      },
    },
    about: {
      title: "Σχετικά με τη MS Realty",
      description: "Η MS Realty είναι οικογενειακό κτηματομεσιτικό γραφείο με έδρα το Σαντάνσκι, που εργάζεται σε επτά γλώσσες.",
      h1: "Σχετικά με τη MS Realty",
      intro: "Οικογενειακό γραφείο στο Σαντάνσκι, με δραστηριότητα στην περιοχή του Πιρίν, στις ακτές της Μαύρης Θάλασσας και στη Βόρεια Ελλάδα.",
      storyTitle: "Ποιοι είμαστε",
      story: [
        "Η MS Realty είναι οικογενειακό κτηματομεσιτικό γραφείο με έδρα το Σαντάνσκι. Πουλάμε και εκμισθώνουμε ακίνητα στην πόλη και στην περιοχή του Πιρίν, στις ακτές της Μαύρης Θάλασσας και πέρα από τα σύνορα, στη Βόρεια Ελλάδα.",
        "Οι περισσότεροι αγοραστές μας έρχονται από άλλες χώρες, οπότε το γραφείο μεγάλωσε γύρω από μία δουλειά: να γίνεται κατανοητή μια αγορά σε ξένη χώρα. Αυτό σημαίνει στοιχεία ακινήτου ελεγμένα από μεσίτη, τοπικούς κανόνες που λέγονται καθαρά και έναν άνθρωπο που απαντά στη γλώσσα σας.",
        "Δημοσιεύουμε τον ιστότοπο στα βουλγαρικά, αγγλικά, γερμανικά, ολλανδικά, ρωσικά, ελληνικά και εβραϊκά. Γράφουμε πρώτα στα βουλγαρικά και κάθε μετάφραση την εγκρίνει άνθρωπος πριν εμφανιστεί.",
      ],
      officesTitle: "Το γραφείο μας",
      officesIntro: "Ένα γραφείο στο Σαντάνσκι καλύπτει όλες τις περιοχές όπου εργαζόμαστε. Καλέστε τη γραμμή του γραφείου και θα σας συνδέσουμε με τον μεσίτη που έχει το ακίνητο.",
      offices: {
        sandanski: { town: "Σαντάνσκι", role: "Γραφείο της εταιρείας", note: "Η πόλη, οι πρόποδες του Πιρίν και η περιφέρεια Μπλαγκόεβγκραντ." },
      },
      pillarsTitle: "Τι υποσχόμαστε σε έναν αγοραστή",
      pillarsIntro: "Πέντε πράγματα στα οποία δεσμευόμαστε. Το καθένα φαίνεται στον ιστότοπο, δεν δηλώνεται μόνο εδώ.",
      pillars: {
        verified: {
          title: "Ελεγμένο",
          text: "Άνθρωπος ελέγχει κάθε αγγελία πριν δημοσιευτεί, και η σελίδα δείχνει τον κωδικό και πότε επιβεβαιώθηκε τελευταία η διαθεσιμότητα.",
        },
        transparent: {
          title: "Διαφανές",
          text: "Τιμή, κωδικός και πηγή βρίσκονται στη σελίδα του ακινήτου. Όταν ένα στοιχείο δεν έχει επιβεβαιωθεί, το λέμε αντί να καλύψουμε το κενό.",
        },
        fast: { title: "Γρήγορο", text: "Το αίτημα πάει κατευθείαν σε μεσίτη μαζί με το ακίνητο που διαβάζατε, οπότε η πρώτη απάντηση έχει ήδη το πλαίσιο." },
        multilingual: { title: "Πολύγλωσσο", text: "Επτά γλώσσες και ένας μεσίτης που απαντά σε αυτήν που γράψατε." },
        local: { title: "Ντόπιοι", text: "Μεσίτες από την περιοχή, ώστε κάποιος να ανοίξει την πόρτα, να περπατήσει τον δρόμο και να διαβάσει τα χαρτιά μαζί σας." },
      },
      teamTitle: "Η ομάδα",
      teamIntro: "Οι μεσίτες με τους οποίους θα συνεργαστείτε, οι γλώσσες που μιλούν και τα στοιχεία της άδειάς τους.",
      teamEmptyTitle: "Τα προφίλ της ομάδας δεν έχουν δημοσιευτεί ακόμη",
      teamEmptyText:
        "Κανείς δεν έχει εγκρίνει ακόμη προφίλ ομάδας στο σύστημα περιεχομένου, οπότε δεν δείχνουμε κανένα αντί να τα επινοήσουμε. Καλέστε μας και θα σας πούμε ποιος έχει το ακίνητο που βλέπετε.",
      teamFields: "Κάθε προφίλ θα έχει όνομα, ρόλο, γραφείο, τις γλώσσες του μεσίτη, φωτογραφία και αριθμό άδειας.",
      contactTitle: "Μιλήστε με μεσίτη",
      contactText: "Μία γραμμή φτάνει στο γραφείο, στο τηλέφωνο, στο WhatsApp ή στο Viber.",
      contactCta: "Επικοινωνήστε με το γραφείο",
    },
    alerts: {
      title: "Οι ειδοποιήσεις ακινήτων σας | MS Realty",
      description: "Οι αποθηκευμένες αναζητήσεις που ζητήσατε από αυτή τη συσκευή, με τα κριτήρια, τη συχνότητα και το κανάλι.",
      h1: "Οι ειδοποιήσεις ακινήτων σας",
      intro: "Οι αναζητήσεις που μας ζητήσατε να παρακολουθούμε. Κάθε μία δείχνει τα κριτήριά της, πόσο συχνά γράφουμε και πού πάει η ειδοποίηση.",
      notConnected: "Χωρίς σύνδεση",
      notConnectedTitle: "Αυτά τα χειριστήρια δεν είναι ακόμη συνδεδεμένα",
      notConnectedText:
        "Οι ειδοποιήσεις δημιουργούνται όταν αποθηκεύετε μια αναζήτηση, αλλά δεν υπάρχει ακόμη τρόπος να διαβαστούν, να παύσουν ή να διαγραφούν από τον ιστότοπο. Μέχρι να γίνει αυτό, πείτε το σε μεσίτη και θα αλλάξουμε ή θα σταματήσουμε μια ειδοποίηση για εσάς.",
      deviceNote:
        "Αυτή η λίστα είναι όσα θυμάται αυτό το πρόγραμμα περιήγησης για τις ειδοποιήσεις που ζητήσατε. Δεν διαβάζεται από το γραφείο, και εδώ δεν κρατάμε ποτέ το email ή το τηλέφωνό σας.",
      fallbackTitle: "Αυτή η σελίδα χρειάζεται JavaScript",
      fallbackText:
        "Η λίστα αποθηκεύεται σε αυτό το πρόγραμμα περιήγησης και διαβάζεται εδώ, όχι στον διακομιστή. Χωρίς JavaScript μπορείτε ακόμη να δημιουργήσετε ειδοποίηση από τη σελίδα αποτελεσμάτων ή να ρωτήσετε μεσίτη.",
      emptyTitle: "Καμία ειδοποίηση από αυτό το πρόγραμμα περιήγησης",
      emptyText: "Αποθηκεύστε μια αναζήτηση στη σελίδα αποτελεσμάτων και θα εμφανιστεί εδώ με τα κριτήριά της.",
      emptyCta: "Αναζήτηση ακινήτων",
      criteria: "Κριτήρια",
      frequency: "Πόσο συχνά",
      channel: "Πού",
      requested: "Ζητήθηκε",
      anyCriteria: "Οποιοδήποτε ακίνητο",
      pause: "Παύση",
      resume: "Συνέχιση",
      remove: "Διαγραφή",
      controlsNote:
        "Η παύση, η συνέχιση και η διαγραφή χρειάζονται μια διαδρομή ανάγνωσης και αλλαγής από την υπηρεσία ειδοποιήσεων. Εμφανίζονται εδώ ώστε η σελίδα να είναι πλήρης, και μένουν ανενεργά μέχρι να υπάρξει.",
      openSearch: "Άνοιγμα αυτής της αναζήτησης",
      contactTitle: "Αλλαγή ειδοποίησης",
      contactText: "Πείτε σε μεσίτη ποια ειδοποίηση να σταματήσει και θα το κάνουμε εμείς.",
      contactCta: "Επικοινωνήστε με το γραφείο",
      listLabel: "Αποθηκευμένες αναζητήσεις",
    },
    listing: {
      brochureTitle: "Αποθηκεύστε ή εκτυπώστε το ακίνητο",
      saveAsPdf: "Αποθήκευση ως PDF",
      brochureNote: "Ανοίγει μια μονοσέλιδη προβολή εκτύπωσης με τα ελεγμένα στοιχεία, τις φωτογραφίες και τον κωδικό, έτοιμη για αποθήκευση ως PDF.",
      costTitle: "Τι κοστίζει η αγορά",
      costIntro: "Πέρα από την τιμή, μια αγορά στη Βουλγαρία φέρνει και αυτά τα έξοδα. Δημοσιεύουμε συντελεστή μόνο αφού τον εγκρίνει το γραφείο, και μια γραμμή χωρίς εγκεκριμένο συντελεστή σημειώνεται αντί να εκτιμηθεί.",
      costLines: {
        transfer_tax: {
          label: "Τοπικός φόρος μεταβίβασης",
          note: "Ορίζεται από τον δήμο όπου βρίσκεται το ακίνητο και πληρώνεται με την υπογραφή του συμβολαίου.",
        },
        notary: { label: "Συμβολαιογραφικά", note: "Υπολογίζονται στην αξία του συμβολαίου με κρατική κλίμακα, συν την εγγραφή στο κτηματολόγιο." },
        agency: { label: "Προμήθεια γραφείου", note: "Η αμοιβή μας, συμφωνημένη γραπτώς πριν κάνετε προσφορά." },
        company: {
          label: "Βουλγαρική εταιρεία, αγοραστές εκτός ΕΕ",
          note: "Πολίτες εκτός ΕΕ δεν μπορούν να έχουν γη στο όνομά τους και την κατέχουν μέσω βουλγαρικής εταιρείας, της οποίας η σύσταση και η διατήρηση κοστίζουν.",
        },
      },
      costTotal: "Σύνολο",
      costTotalUnavailable: "Μη διαθέσιμο μέχρι να εγκριθεί ο πίνακας εξόδων",
      costNote:
        "Κανένας αριθμός εδώ δεν είναι εκτίμηση. Οι γραμμές είναι τα έξοδα που φέρνει μια αγορά, και οι συντελεστές προέρχονται από πίνακα εξόδων που πρέπει να εγκρίνει άνθρωπος του γραφείου πριν τον δημοσιεύσουμε.",
      costCta: "Ρωτήστε μεσίτη για τα ποσά",
    },
  },
  he: {
    compare: {
      title: "השוואת נכסים שמורים | MS Realty",
      description: "העמידו עד ארבעה נכסים שמורים של MS Realty זה לצד זה והשוו מחיר, שטח, חדרי שינה, קומה ומיקום.",
      h1: "השוואת נכסים שמורים",
      intro: "עד ארבעה מהנכסים שלכם, זה לצד זה. הרשימה נשמרת בדפדפן הזה, כך שאף אחד אחר לא רואה אותה.",
      fallbackTitle: "הנכסים השמורים נמצאים בדפדפן הזה",
      fallbackText:
        "ההשוואה נבנית מהנכסים ששמרתם במכשיר הזה, ולכן היא זקוקה ל JavaScript. אפשר לפתוח את הנכסים השמורים כרשימה, או לשתף קישור השוואה שעובד גם בלי JavaScript.",
      savedLink: "פתחו את הנכסים השמורים",
      searchLink: "עיינו בנכסים",
      emptyTitle: "אין עדיין מה להשוות",
      emptyText: "שמרו שני נכסים או יותר בעזרת הלב והם יופיעו כאן זה לצד זה.",
      limitNote: "מוצגים {max} הנכסים הראשונים מתוך {count} שמורים.",
      unavailableNote: "חלק מהנכסים השמורים כבר אינם זמינים ואינם מוצגים.",
      identicalShow: "הצגת שורות זהות ({count})",
      identicalHide: "הסתרת שורות זהות ({count})",
      identicalHint: "שורות שבהן לכל הנכסים אותו ערך מקופלות, כדי שההבדלים יישארו גלויים.",
      remove: "הסרה",
      removeLabel: "הסירו את {title} מהנכסים השמורים",
      view: "פתחו את הנכס",
      detail: "נתון",
      notStated: "לא צוין",
      addMore: "הוסיפו נכס נוסף",
      columnLabel: "נכס {index}",
      tableLabel: "השוואת נכסים שמורים",
      rows: {
        price: "מחיר",
        price_per_sqm: "מחיר ל m²",
        area_sqm: "שטח",
        land_area_sqm: "שטח מגרש",
        bedrooms: "חדרי שינה",
        floor: "קומה",
        offer_type: "סוג עסקה",
        location: "מיקום",
        reference: "מספר נכס",
      },
    },
    about: {
      title: "אודות MS Realty",
      description: "MS Realty היא סוכנות נדלן משפחתית שמשרדה בסנדנסקי, הפועלת בשבע שפות.",
      h1: "אודות MS Realty",
      intro: "סוכנות משפחתית בסנדנסקי, הפועלת באזור פירין, לאורך חוף הים השחור ובצפון יוון.",
      storyTitle: "מי אנחנו",
      story: [
        "MS Realty היא סוכנות נדלן משפחתית שמרכזה בסנדנסקי. אנחנו מוכרים ומשכירים נכסים בעיר ובאזור פירין, לאורך חוף הים השחור ומעבר לגבול, בצפון יוון.",
        "רוב הקונים שלנו מגיעים מחוץ לבולגריה, ולכן הסוכנות גדלה סביב משימה אחת: להפוך רכישה במדינה זרה למובנת. זה אומר נתוני נכס שמתווך בדק, כללים מקומיים שנאמרים בפשטות, ואדם שעונה בשפה שלכם.",
        "אנחנו מפרסמים את האתר בבולגרית, אנגלית, גרמנית, הולנדית, רוסית, יוונית ועברית. אנחנו כותבים קודם בבולגרית, ואדם מאשר כל תרגום לפני שהוא עולה.",
      ],
      officesTitle: "המשרד שלנו",
      officesIntro: "משרד אחד בסנדנסקי מכסה את כל האזורים שבהם אנחנו פועלים. התקשרו לקו המשרד ונחבר אתכם למתווך שמטפל בנכס.",
      offices: {
        sandanski: { town: "סנדנסקי", role: "משרד הסוכנות", note: "העיר, מרגלות פירין ומחוז בלגואבגרד." },
      },
      pillarsTitle: "מה אנחנו מבטיחים לקונה",
      pillarsIntro: "חמישה דברים שאנחנו מחויבים להם. כל אחד מהם נראה באתר, לא רק נאמר כאן.",
      pillars: {
        verified: {
          title: "מאומת",
          text: "אדם בודק כל נכס לפני הפרסום, והדף מציג את מספר הנכס ואת המועד שבו הזמינות אומתה לאחרונה.",
        },
        transparent: {
          title: "שקוף",
          text: "המחיר, מספר הנכס והמקור נמצאים בדף הנכס. כשנתון לא אומת אנחנו אומרים זאת, במקום למלא את החסר.",
        },
        fast: { title: "מהיר", text: "פנייה מגיעה ישירות למתווך יחד עם הנכס שקראתם עליו, כך שהתשובה הראשונה כבר בהקשר." },
        multilingual: { title: "רב לשוני", text: "שבע שפות, ומתווך שעונה בשפה שבה כתבתם." },
        local: { title: "מקומיים", text: "מתווכים מהאזור, כדי שמישהו יפתח את הדלת, ילך אתכם ברחוב ויקרא אתכם את המסמכים." },
      },
      teamTitle: "הצוות",
      teamIntro: "המתווכים שתעבדו איתם, השפות שהם עובדים בהן ופרטי הרישיון שלהם.",
      teamEmptyTitle: "פרופילי הצוות טרם פורסמו",
      teamEmptyText:
        "אף אחד עדיין לא אישר פרופיל צוות במערכת התוכן, ולכן איננו מציגים אף אחד במקום להמציא. התקשרו ונאמר לכם מי מטפל בנכס שאתם בוחנים.",
      teamFields: "כל פרופיל יכלול שם, תפקיד, משרד, השפות של המתווך, תמונה ומספר רישיון.",
      contactTitle: "דברו עם מתווך",
      contactText: "קו אחד מגיע למשרד, בטלפון, בוואטסאפ או בוויבר.",
      contactCta: "צרו קשר עם הסוכנות",
    },
    alerts: {
      title: "התראות הנכסים שלכם | MS Realty",
      description: "החיפושים השמורים שביקשתם מהמכשיר הזה, עם הקריטריונים, התדירות והערוץ.",
      h1: "התראות הנכסים שלכם",
      intro: "החיפושים שביקשתם שנעקוב אחריהם. לכל אחד מופיעים הקריטריונים, כל כמה זמן אנחנו כותבים ולאן ההתראה נשלחת.",
      notConnected: "לא מחובר",
      notConnectedTitle: "הפקדים האלה עדיין אינם מחוברים",
      notConnectedText:
        "התראות נוצרות כששומרים חיפוש, אך עדיין אין דרך לקרוא, להשהות או למחוק אותן מהאתר. עד שזה ייבנה, אמרו למתווך ונשנה או נעצור עבורכם התראה.",
      deviceNote:
        "הרשימה הזו היא מה שהדפדפן הזה זוכר על ההתראות שביקשתם. היא אינה נקראת מהסוכנות, ואיננו שומרים כאן את כתובת הדואר או הטלפון שלכם.",
      fallbackTitle: "הדף הזה זקוק ל JavaScript",
      fallbackText:
        "הרשימה נשמרת בדפדפן הזה ולכן נקראת כאן, לא בשרת. בלי JavaScript עדיין אפשר ליצור התראה בדף התוצאות או לפנות למתווך.",
      emptyTitle: "אין התראות מהדפדפן הזה",
      emptyText: "שמרו חיפוש בדף התוצאות והוא יופיע כאן עם הקריטריונים שלו.",
      emptyCta: "חפשו נכסים",
      criteria: "קריטריונים",
      frequency: "כל כמה זמן",
      channel: "לאן",
      requested: "נתבקש בתאריך",
      anyCriteria: "כל נכס",
      pause: "השהיה",
      resume: "חידוש",
      remove: "מחיקה",
      controlsNote:
        "השהיה, חידוש ומחיקה דורשים ששירות ההתראות יחשוף נתיב קריאה ועדכון. הם מוצגים כאן כדי שהדף יהיה שלם, ונשארים מושבתים עד שיהיה כזה.",
      openSearch: "פתחו את החיפוש הזה",
      contactTitle: "שינוי התראה",
      contactText: "אמרו למתווך איזו התראה להשהות או לעצור ונטפל בזה.",
      contactCta: "צרו קשר עם הסוכנות",
      listLabel: "חיפושים שמורים",
    },
    listing: {
      brochureTitle: "שמרו או הדפיסו את הנכס",
      saveAsPdf: "שמירה כ PDF",
      brochureNote: "פותח תצוגת הדפסה של עמוד אחד עם הנתונים שנבדקו, התמונות ומספר הנכס, מוכנה לשמירה כ PDF.",
      costTitle: "כמה עולה הרכישה",
      costIntro: "מלבד המחיר, רכישה בבולגריה כרוכה בעלויות האלה. אנחנו מפרסמים שיעור רק אחרי שהסוכנות אישרה אותו, ושורה בלי שיעור מאושר מסומנת ולא מנוחשת.",
      costLines: {
        transfer_tax: {
          label: "מס העברה מקומי",
          note: "נקבע על ידי הרשות המקומית שבה נמצא הנכס, ומשולם בעת חתימת השטר.",
        },
        notary: { label: "שכר נוטריון", note: "מחושב על שווי השטר לפי טבלה ממשלתית, בתוספת הרישום בפנקס המקרקעין." },
        agency: { label: "עמלת הסוכנות", note: "שכר הטרחה שלנו, מסוכם בכתב לפני שאתם מגישים הצעה." },
        company: {
          label: "חברה בולגרית, קונים שאינם מהאיחוד האירופי",
          note: "אזרחים שאינם מהאיחוד האירופי אינם יכולים להחזיק קרקע על שמם ומחזיקים אותה דרך חברה בולגרית, שרישומה ותחזוקתה עולים כסף.",
        },
      },
      costTotal: "סך הכול",
      costTotalUnavailable: "לא זמין עד שטבלת העלויות תאושר",
      costNote:
        "אף מספר כאן אינו הערכה. השורות הן העלויות שרכישה כרוכה בהן, והשיעורים מגיעים מטבלת עלויות שאדם בסוכנות חייב לאשר לפני שנפרסם אותה.",
      costCta: "בקשו מהמתווך את הסכומים",
    },
  },
};

// Package B3 landed the saved-search self-service contract, so the alerts page
// manages a real record through its capability link. These strings sit beside
// the P4 copy rather than inside it so the two packages stay separable.
const P4_ALERTS_MANAGE_COPY = {
  bg: {
    notConnectedTitle: "Управлявайте известие през своята връзка",
    notConnectedText:
      "Когато запазите търсене, ви изпращаме лична връзка за управление. Отворете я и ще можете да спрете, възобновите, пренастроите или изтриете известието тук.",
    linkTitle: "Вашето известие",
    linkIntro: "Отворихте връзката за управление, така че промените по-долу се записват веднага.",
    linkInvalidTitle: "Тази връзка за управление не е валидна",
    linkInvalidText: "Възможно е да е изтекла или да е заменена. Запазете търсенето отново, за да получите нова, или се обадете на брокер.",
    linkExpires: "Връзката е валидна до",
    statusActive: "Активно",
    statusPaused: "Спряно",
    nextAlert: "Следващо известие",
    matchesNow: "Съвпадения сега",
    changeFrequency: "Колко често да пишем",
    changeChannel: "Къде да пишем",
    apply: "Запазете промяната",
    saving: "Запазване...",
    savedChange: "Промяната е запазена.",
    failedChange: "Промяната не бе запазена. Опитайте отново.",
    deleteConfirm: "Да изтрием ли това известие? Няма да ви пишем повече.",
    deleted: "Известието е изтрито. Няма да ви пишем повече.",
    localTitle: "Запазени в този браузър",
    localIntro: "Търсения, които сте запазили на това устройство. Отворете изпратената връзка за управление, за да промените или спрете някое от тях.",
    localControlsNote:
      "Тези бутони работят само през личната връзка за управление, изпратена при запазването. Тук те остават неактивни, защото браузърът не може да докаже кой е заявил известието.",
    channelNotRecorded: "Не е записано",
  },
  en: {
    notConnectedTitle: "Manage an alert through your own link",
    notConnectedText:
      "When you save a search we send you a personal manage link. Open it and you can pause, resume, retune or delete that alert right here.",
    linkTitle: "Your alert",
    linkIntro: "You opened the manage link, so the changes below are saved straight away.",
    linkInvalidTitle: "This manage link is not valid",
    linkInvalidText: "It may have expired or been replaced. Save the search again to get a new one, or call a broker.",
    linkExpires: "Link valid until",
    statusActive: "Active",
    statusPaused: "Paused",
    nextAlert: "Next alert",
    matchesNow: "Matches now",
    changeFrequency: "How often we write",
    changeChannel: "Where we write",
    apply: "Save this change",
    saving: "Saving...",
    savedChange: "Change saved.",
    failedChange: "That change was not saved. Try again.",
    deleteConfirm: "Delete this alert? We will not write to you again.",
    deleted: "This alert is deleted. We will not write to you again.",
    localTitle: "Saved in this browser",
    localIntro: "Searches you saved on this device. Open the manage link we sent you to change or stop one of them.",
    localControlsNote:
      "These controls work through the personal manage link sent when you saved the search. They stay disabled here because this browser cannot prove who asked for the alert.",
    channelNotRecorded: "Not recorded",
  },
  de: {
    notConnectedTitle: "Eine Benachrichtigung über Ihren eigenen Link verwalten",
    notConnectedText:
      "Wenn Sie eine Suche speichern, senden wir Ihnen einen persönlichen Verwaltungslink. Öffnen Sie ihn, dann können Sie die Benachrichtigung hier pausieren, fortsetzen, neu einstellen oder löschen.",
    linkTitle: "Ihre Benachrichtigung",
    linkIntro: "Sie haben den Verwaltungslink geöffnet, die Änderungen unten werden also sofort gespeichert.",
    linkInvalidTitle: "Dieser Verwaltungslink ist nicht gültig",
    linkInvalidText: "Er kann abgelaufen oder ersetzt worden sein. Speichern Sie die Suche erneut für einen neuen Link, oder rufen Sie einen Makler an.",
    linkExpires: "Link gültig bis",
    statusActive: "Aktiv",
    statusPaused: "Pausiert",
    nextAlert: "Nächste Benachrichtigung",
    matchesNow: "Treffer jetzt",
    changeFrequency: "Wie oft wir schreiben",
    changeChannel: "Wohin wir schreiben",
    apply: "Änderung speichern",
    saving: "Wird gespeichert...",
    savedChange: "Änderung gespeichert.",
    failedChange: "Die Änderung wurde nicht gespeichert. Versuchen Sie es erneut.",
    deleteConfirm: "Diese Benachrichtigung löschen? Wir schreiben Ihnen dann nicht mehr.",
    deleted: "Diese Benachrichtigung ist gelöscht. Wir schreiben Ihnen nicht mehr.",
    localTitle: "In diesem Browser gespeichert",
    localIntro: "Suchen, die Sie auf diesem Gerät gespeichert haben. Öffnen Sie den gesendeten Verwaltungslink, um eine davon zu ändern oder zu stoppen.",
    localControlsNote:
      "Diese Bedienelemente arbeiten über den persönlichen Verwaltungslink, den Sie beim Speichern erhalten haben. Hier bleiben sie deaktiviert, weil dieser Browser nicht nachweisen kann, wer die Benachrichtigung angefordert hat.",
    channelNotRecorded: "Nicht erfasst",
  },
  nl: {
    notConnectedTitle: "Een melding beheren via uw eigen link",
    notConnectedText:
      "Als u een zoekopdracht bewaart, sturen wij u een persoonlijke beheerlink. Open die en u kunt de melding hier pauzeren, hervatten, bijstellen of verwijderen.",
    linkTitle: "Uw melding",
    linkIntro: "U hebt de beheerlink geopend, dus de wijzigingen hieronder worden meteen bewaard.",
    linkInvalidTitle: "Deze beheerlink is niet geldig",
    linkInvalidText: "Hij kan verlopen of vervangen zijn. Bewaar de zoekopdracht opnieuw voor een nieuwe link, of bel een makelaar.",
    linkExpires: "Link geldig tot",
    statusActive: "Actief",
    statusPaused: "Gepauzeerd",
    nextAlert: "Volgende melding",
    matchesNow: "Treffers nu",
    changeFrequency: "Hoe vaak wij schrijven",
    changeChannel: "Waar wij schrijven",
    apply: "Wijziging bewaren",
    saving: "Bezig met bewaren...",
    savedChange: "Wijziging bewaard.",
    failedChange: "Die wijziging is niet bewaard. Probeer het opnieuw.",
    deleteConfirm: "Deze melding verwijderen? Wij schrijven u dan niet meer.",
    deleted: "Deze melding is verwijderd. Wij schrijven u niet meer.",
    localTitle: "Bewaard in deze browser",
    localIntro: "Zoekopdrachten die u op dit apparaat hebt bewaard. Open de toegestuurde beheerlink om er een te wijzigen of te stoppen.",
    localControlsNote:
      "Deze knoppen werken via de persoonlijke beheerlink die u bij het bewaren kreeg. Hier blijven ze uitgeschakeld omdat deze browser niet kan aantonen wie de melding heeft aangevraagd.",
    channelNotRecorded: "Niet vastgelegd",
  },
  ru: {
    notConnectedTitle: "Управляйте подпиской по своей ссылке",
    notConnectedText:
      "Когда вы сохраняете поиск, мы отправляем вам личную ссылку управления. Откройте её, и здесь можно будет приостановить, возобновить, перенастроить или удалить подписку.",
    linkTitle: "Ваша подписка",
    linkIntro: "Вы открыли ссылку управления, поэтому изменения ниже сохраняются сразу.",
    linkInvalidTitle: "Эта ссылка управления недействительна",
    linkInvalidText: "Возможно, она истекла или была заменена. Сохраните поиск заново, чтобы получить новую, или позвоните брокеру.",
    linkExpires: "Ссылка действует до",
    statusActive: "Активна",
    statusPaused: "Приостановлена",
    nextAlert: "Следующее уведомление",
    matchesNow: "Совпадений сейчас",
    changeFrequency: "Как часто мы пишем",
    changeChannel: "Куда мы пишем",
    apply: "Сохранить изменение",
    saving: "Сохранение...",
    savedChange: "Изменение сохранено.",
    failedChange: "Изменение не сохранено. Попробуйте ещё раз.",
    deleteConfirm: "Удалить эту подписку? Мы больше не будем вам писать.",
    deleted: "Подписка удалена. Мы больше не будем вам писать.",
    localTitle: "Сохранено в этом браузере",
    localIntro: "Поиски, сохранённые на этом устройстве. Откройте присланную ссылку управления, чтобы изменить или остановить любой из них.",
    localControlsNote:
      "Эти кнопки работают через личную ссылку управления, присланную при сохранении. Здесь они неактивны, потому что браузер не может подтвердить, кто заказал подписку.",
    channelNotRecorded: "Не записано",
  },
  el: {
    notConnectedTitle: "Διαχειριστείτε μια ειδοποίηση από τον δικό σας σύνδεσμο",
    notConnectedText:
      "Όταν αποθηκεύετε μια αναζήτηση, σας στέλνουμε προσωπικό σύνδεσμο διαχείρισης. Ανοίξτε τον και μπορείτε εδώ να παύσετε, να συνεχίσετε, να ρυθμίσετε ή να διαγράψετε την ειδοποίηση.",
    linkTitle: "Η ειδοποίησή σας",
    linkIntro: "Ανοίξατε τον σύνδεσμο διαχείρισης, οπότε οι αλλαγές παρακάτω αποθηκεύονται αμέσως.",
    linkInvalidTitle: "Αυτός ο σύνδεσμος διαχείρισης δεν είναι έγκυρος",
    linkInvalidText: "Μπορεί να έχει λήξει ή να αντικαταστάθηκε. Αποθηκεύστε ξανά την αναζήτηση για νέο σύνδεσμο ή καλέστε μεσίτη.",
    linkExpires: "Ο σύνδεσμος ισχύει έως",
    statusActive: "Ενεργή",
    statusPaused: "Σε παύση",
    nextAlert: "Επόμενη ειδοποίηση",
    matchesNow: "Αντιστοιχίες τώρα",
    changeFrequency: "Πόσο συχνά γράφουμε",
    changeChannel: "Πού γράφουμε",
    apply: "Αποθήκευση αλλαγής",
    saving: "Αποθήκευση...",
    savedChange: "Η αλλαγή αποθηκεύτηκε.",
    failedChange: "Η αλλαγή δεν αποθηκεύτηκε. Προσπαθήστε ξανά.",
    deleteConfirm: "Διαγραφή αυτής της ειδοποίησης; Δεν θα σας ξαναγράψουμε.",
    deleted: "Η ειδοποίηση διαγράφηκε. Δεν θα σας ξαναγράψουμε.",
    localTitle: "Αποθηκευμένα σε αυτό το πρόγραμμα περιήγησης",
    localIntro: "Αναζητήσεις που αποθηκεύσατε σε αυτή τη συσκευή. Ανοίξτε τον σύνδεσμο διαχείρισης που σας στείλαμε για να αλλάξετε ή να σταματήσετε κάποια.",
    localControlsNote:
      "Αυτά τα χειριστήρια λειτουργούν μέσω του προσωπικού συνδέσμου διαχείρισης που λάβατε κατά την αποθήκευση. Εδώ μένουν ανενεργά, γιατί αυτό το πρόγραμμα περιήγησης δεν μπορεί να αποδείξει ποιος ζήτησε την ειδοποίηση.",
    channelNotRecorded: "Δεν έχει καταγραφεί",
  },
  he: {
    notConnectedTitle: "נהלו התראה דרך הקישור האישי שלכם",
    notConnectedText:
      "כששומרים חיפוש אנחנו שולחים לכם קישור ניהול אישי. פתחו אותו ותוכלו כאן להשהות, לחדש, לכוונן או למחוק את ההתראה.",
    linkTitle: "ההתראה שלכם",
    linkIntro: "פתחתם את קישור הניהול, ולכן השינויים שלהלן נשמרים מיד.",
    linkInvalidTitle: "קישור הניהול הזה אינו תקף",
    linkInvalidText: "ייתכן שפג תוקפו או שהוחלף. שמרו את החיפוש שוב כדי לקבל קישור חדש, או התקשרו למתווך.",
    linkExpires: "הקישור בתוקף עד",
    statusActive: "פעילה",
    statusPaused: "מושהית",
    nextAlert: "ההתראה הבאה",
    matchesNow: "התאמות כעת",
    changeFrequency: "כל כמה זמן נכתוב",
    changeChannel: "לאן נכתוב",
    apply: "שמירת השינוי",
    saving: "שומר...",
    savedChange: "השינוי נשמר.",
    failedChange: "השינוי לא נשמר. נסו שוב.",
    deleteConfirm: "למחוק את ההתראה הזו? לא נכתוב לכם שוב.",
    deleted: "ההתראה נמחקה. לא נכתוב לכם שוב.",
    localTitle: "נשמרו בדפדפן הזה",
    localIntro: "חיפושים ששמרתם במכשיר הזה. פתחו את קישור הניהול ששלחנו כדי לשנות או לעצור אחד מהם.",
    localControlsNote:
      "הפקדים האלה פועלים דרך קישור הניהול האישי שנשלח בעת השמירה. כאן הם נשארים מושבתים, כי הדפדפן הזה אינו יכול להוכיח מי ביקש את ההתראה.",
    channelNotRecorded: "לא נרשם",
  },
};

// Package B2 owns the approved purchase-fee table and its line keys, so the
// listing disclosure names exactly those lines. No rate is written here: an
// unapproved line renders as a marked absence and the total stays withheld.
const P4_COSTS_COPY = {
  bg: {
    buyerLabel: "Кой купува",
    buyers: { eu: "Гражданин на ЕС или ЕИП", non_eu: "Гражданин извън ЕС" },
    missing: "Все още не е одобрено",
    lines: {
      local_transfer_tax: { label: "Местен данък за прехвърляне", note: "Определя се от общината, в която е имотът, и се плаща при подписване на нотариалния акт." },
      notary_fee: { label: "Нотариална такса", note: "Начислява се върху стойността по акта по държавна тарифа." },
      registry_entry_fee: { label: "Такса за вписване", note: "Вписване на акта в Имотния регистър." },
      agency_fee: { label: "Комисиона на агенцията", note: "Нашето възнаграждение, договорено писмено, преди да направите оферта." },
      company_route_setup: { label: "Българско дружество, купувачи извън ЕС", note: "Граждани извън ЕС не могат да притежават земя на свое име и я държат чрез българско дружество." },
    },
    linesTitle: "Какво включва",
    totalWithPrice: "Цена плюс разходи",
  },
  en: {
    buyerLabel: "Who is buying",
    buyers: { eu: "EU or EEA citizen", non_eu: "Non-EU citizen" },
    missing: "Not approved yet",
    lines: {
      local_transfer_tax: { label: "Local property transfer tax", note: "Set by the municipality the property sits in, and paid when the deed is signed." },
      notary_fee: { label: "Notary fee", note: "Charged on the deed value on a state scale." },
      registry_entry_fee: { label: "Registry entry fee", note: "Entering the deed in the property register." },
      agency_fee: { label: "Agency commission", note: "Our fee, agreed in writing before you make an offer." },
      company_route_setup: { label: "Bulgarian company, non-EU buyers", note: "Non-EU citizens cannot own land in their own name and hold it through a Bulgarian company." },
    },
    linesTitle: "What it covers",
    totalWithPrice: "Price plus costs",
  },
  de: {
    buyerLabel: "Wer kauft",
    buyers: { eu: "EU- oder EWR-Bürger", non_eu: "Nicht-EU-Bürger" },
    missing: "Noch nicht freigegeben",
    lines: {
      local_transfer_tax: { label: "Kommunale Grunderwerbsteuer", note: "Wird von der Gemeinde festgelegt, in der die Immobilie liegt, und bei der Beurkundung gezahlt." },
      notary_fee: { label: "Notargebühr", note: "Wird nach staatlicher Tabelle auf den Urkundenwert berechnet." },
      registry_entry_fee: { label: "Eintragungsgebühr", note: "Eintragung der Urkunde im Grundbuch." },
      agency_fee: { label: "Maklerprovision", note: "Unser Honorar, schriftlich vereinbart, bevor Sie ein Angebot abgeben." },
      company_route_setup: { label: "Bulgarische Gesellschaft, Käufer außerhalb der EU", note: "Nicht-EU-Bürger können Land nicht auf ihren eigenen Namen besitzen und halten es über eine bulgarische Gesellschaft." },
    },
    linesTitle: "Was enthalten ist",
    totalWithPrice: "Preis plus Kosten",
  },
  nl: {
    buyerLabel: "Wie koopt",
    buyers: { eu: "Burger van de EU of EER", non_eu: "Burger van buiten de EU" },
    missing: "Nog niet goedgekeurd",
    lines: {
      local_transfer_tax: { label: "Gemeentelijke overdrachtsbelasting", note: "Vastgesteld door de gemeente waar de woning ligt, en betaald bij het tekenen van de akte." },
      notary_fee: { label: "Notariskosten", note: "Berekend over de aktewaarde volgens een staatsschaal." },
      registry_entry_fee: { label: "Inschrijvingskosten", note: "Inschrijving van de akte in het kadaster." },
      agency_fee: { label: "Makelaarscourtage", note: "Ons honorarium, schriftelijk afgesproken voordat u een bod doet." },
      company_route_setup: { label: "Bulgaarse vennootschap, kopers van buiten de EU", note: "Burgers van buiten de EU kunnen grond niet op eigen naam bezitten en houden die via een Bulgaarse vennootschap." },
    },
    linesTitle: "Wat het omvat",
    totalWithPrice: "Prijs plus kosten",
  },
  ru: {
    buyerLabel: "Кто покупает",
    buyers: { eu: "Гражданин ЕС или ЕЭП", non_eu: "Гражданин вне ЕС" },
    missing: "Ещё не утверждено",
    lines: {
      local_transfer_tax: { label: "Местный налог на переход права", note: "Устанавливается общиной, где находится объект, и платится при подписании акта." },
      notary_fee: { label: "Нотариальный сбор", note: "Начисляется на стоимость по акту по государственной шкале." },
      registry_entry_fee: { label: "Сбор за внесение в реестр", note: "Внесение акта в реестр недвижимости." },
      agency_fee: { label: "Комиссия агентства", note: "Наше вознаграждение, согласованное письменно до того, как вы сделаете предложение." },
      company_route_setup: { label: "Болгарская компания, покупатели вне ЕС", note: "Граждане вне ЕС не могут владеть землёй на своё имя и держат её через болгарскую компанию." },
    },
    linesTitle: "Что входит",
    totalWithPrice: "Цена плюс расходы",
  },
  el: {
    buyerLabel: "Ποιος αγοράζει",
    buyers: { eu: "Πολίτης ΕΕ ή ΕΟΧ", non_eu: "Πολίτης εκτός ΕΕ" },
    missing: "Δεν έχει εγκριθεί ακόμη",
    lines: {
      local_transfer_tax: { label: "Τοπικός φόρος μεταβίβασης", note: "Ορίζεται από τον δήμο όπου βρίσκεται το ακίνητο και πληρώνεται με την υπογραφή του συμβολαίου." },
      notary_fee: { label: "Συμβολαιογραφικά", note: "Υπολογίζονται στην αξία του συμβολαίου με κρατική κλίμακα." },
      registry_entry_fee: { label: "Τέλος εγγραφής", note: "Εγγραφή του συμβολαίου στο κτηματολόγιο." },
      agency_fee: { label: "Προμήθεια γραφείου", note: "Η αμοιβή μας, συμφωνημένη γραπτώς πριν κάνετε προσφορά." },
      company_route_setup: { label: "Βουλγαρική εταιρεία, αγοραστές εκτός ΕΕ", note: "Πολίτες εκτός ΕΕ δεν μπορούν να έχουν γη στο όνομά τους και την κατέχουν μέσω βουλγαρικής εταιρείας." },
    },
    linesTitle: "Τι περιλαμβάνει",
    totalWithPrice: "Τιμή συν έξοδα",
  },
  he: {
    buyerLabel: "מי קונה",
    buyers: { eu: "אזרח האיחוד האירופי או האזור הכלכלי", non_eu: "אזרח שאינו מהאיחוד האירופי" },
    missing: "טרם אושר",
    lines: {
      local_transfer_tax: { label: "מס העברה מקומי", note: "נקבע על ידי הרשות המקומית שבה נמצא הנכס, ומשולם בעת חתימת השטר." },
      notary_fee: { label: "שכר נוטריון", note: "מחושב על שווי השטר לפי טבלה ממשלתית." },
      registry_entry_fee: { label: "אגרת רישום", note: "רישום השטר בפנקס המקרקעין." },
      agency_fee: { label: "עמלת הסוכנות", note: "שכר הטרחה שלנו, מסוכם בכתב לפני שאתם מגישים הצעה." },
      company_route_setup: { label: "חברה בולגרית, קונים שאינם מהאיחוד האירופי", note: "אזרחים שאינם מהאיחוד האירופי אינם יכולים להחזיק קרקע על שמם ומחזיקים אותה דרך חברה בולגרית." },
    },
    linesTitle: "מה כלול",
    totalWithPrice: "מחיר בתוספת עלויות",
  },
};

function p4CopyFor(localeCode) {
  return P4_COPY[localeCode] || P4_COPY.en;
}

function p4Param(params, key) {
  if (!params) return "";
  const value = typeof params.get === "function" ? params.get(key) : params[key];
  return value === null || value === undefined ? "" : String(value);
}

// The comparison reads its columns from `?ids=`, so a shared link renders the
// same table without JavaScript. The client rewrites the query from the saved
// ids in localStorage, which keeps the page free of any backend.
function compareIdsFromParams(params, max = COMPARE_MAX_COLUMNS) {
  const raw = p4Param(params, "ids");
  if (!raw) return [];
  const seen = [];
  for (const part of raw.split(",")) {
    const id = part.trim();
    if (!id || seen.includes(id) || !/^[A-Za-z0-9._:-]{1,64}$/.test(id)) continue;
    seen.push(id);
    if (seen.length >= max * 4) break;
  }
  return seen;
}

function compareValue(value, copy) {
  if (value === null || value === undefined || value === "") return copy.notStated;
  return String(value);
}

function compareColumn(registry, locale, listing, copy, labels) {
  const card = listingCard(registry, listing, locale);
  const view = listingToPublicViewModel(listing);
  const priceEur = Number(view.price_eur);
  const areaSqm = Number(view.area_sqm);
  const hasPrice = !view.price_on_request && Number.isFinite(priceEur) && priceEur > 1;
  const perSqm = hasPrice && Number.isFinite(areaSqm) && areaSqm > 0 ? Math.round(priceEur / areaSqm) : null;
  const floor =
    view.floor === null || view.floor === undefined || view.floor === ""
      ? null
      : view.total_floors === null || view.total_floors === undefined || view.total_floors === ""
        ? String(view.floor)
        : `${view.floor} / ${view.total_floors}`;
  return {
    id: card.id,
    title: card.title,
    path: card.path,
    thumbnail: card.thumbnail,
    values: {
      price: hasPrice ? startEuro(priceEur, locale.code) : labels.priceOnRequest,
      price_per_sqm: perSqm ? startEuro(perSqm, locale.code) : copy.notStated,
      area_sqm: Number.isFinite(areaSqm) && areaSqm > 0 ? `${areaSqm} m²` : copy.notStated,
      land_area_sqm: view.land_area_sqm ? `${view.land_area_sqm} m²` : copy.notStated,
      bedrooms: view.bedrooms_not_applicable ? copy.notStated : compareValue(view.bedrooms, copy),
      floor: compareValue(floor, copy),
      offer_type: card.offer_type_label || compareValue(view.offer_type, copy),
      location: compareValue(card.location, copy),
      reference: card.id,
    },
  };
}

// Compare saved listings. Everything the table needs is server-rendered from
// the ids in the query, so there is no client-side catalogue, no endpoint and
// no personal data in the URL.
export function renderComparePage({ registry, localeCode, listings = [], searchParams = null } = {}) {
  const resolved = resolvePublicLocale(registry, localeCode);
  const locale = resolved.locale;
  const path = comparePath(registry, locale.code);
  const labels = labelsFor(locale.code);
  const copy = p4CopyFor(locale.code).compare;
  const searchPathForLocale = `/${locale.code}/${locale.route_segments.search}`;
  const savedPath = `${searchPathForLocale}?saved=1`;
  const requested = compareIdsFromParams(searchParams);
  const byId = new Map();
  for (const listing of listings) {
    if (isActiveListing(listing)) byId.set(listing.id, listing);
  }
  const resolvedIds = requested.filter((id) => byId.has(id));
  const columnIds = resolvedIds.slice(0, COMPARE_MAX_COLUMNS);
  const columns = columnIds.map((id) => compareColumn(registry, locale, byId.get(id), copy, labels));
  const rows = COMPARE_ROWS.map((row) => {
    const values = columns.map((column) => column.values[row.id]);
    return {
      id: row.id,
      label: copy.rows[row.id],
      numeric: row.numeric,
      values,
      // A single column has nothing to be identical to, so nothing collapses.
      identical: columns.length > 1 && values.every((value) => value === values[0]),
    };
  });
  const identicalCount = rows.filter((row) => row.identical).length;

  return {
    kind: "compare",
    status: 200,
    requested_locale: localeCode,
    locale: locale.code,
    lang: locale.code,
    dir: locale.direction,
    path,
    canonical: path,
    // A per visitor shortlist is never an index target.
    indexable: false,
    metadata: { title: copy.title, description: copy.description, robots: "noindex,follow" },
    hreflang: [],
    chrome: publicChrome(registry, locale, {
      hreflang: resolved.available ? localeAlternatesForCompare(registry) : [],
      active: "compare",
      currentPath: path,
    }),
    body: {
      h1: copy.h1,
      intro: copy.intro,
      copy,
      state: columns.length ? "columns" : "empty",
      max_columns: COMPARE_MAX_COLUMNS,
      storage_key: COMPARE_STORAGE_KEY,
      requested_ids: requested,
      columns,
      rows,
      identical_count: identicalCount,
      // Saved ids that no longer resolve to an active listing.
      unavailable_count: Math.max(requested.length - resolvedIds.length, 0),
      over_limit: resolvedIds.length > COMPARE_MAX_COLUMNS ? resolvedIds.length : 0,
      saved: { path: savedPath, label: labels.savedListings },
      search: { path: searchPathForLocale, label: copy.searchLink },
    },
  };
}

// About and team. The team list comes from approved CMS documents; today there
// are none, so the section states that instead of showing invented people.
export function renderAboutPage({
  registry,
  localeCode,
  teamProfiles = null,
  leadWritesDisabled = leadWritesDisabledFromEnv(),
} = {}) {
  const resolved = resolvePublicLocale(registry, localeCode);
  const locale = resolved.locale;
  const path = aboutPath(registry, locale.code);
  const copy = p4CopyFor(locale.code).about;
  const chromeCopy = chromeCopyFor(locale.code);
  const hreflang = resolved.available ? hreflangForAbout(registry) : [];
  // Package B2 owns the approved team records. A profile is public only when a
  // named human approved that exact content, and its photo only when the photo
  // itself was approved, so the page never borrows a face.
  const team = teamProfiles || teamProfilesPayload({ localeCode: locale.code, sourceLocale: registry.source_locale });

  return {
    kind: "about",
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
    hreflang,
    chrome: publicChrome(registry, locale, { hreflang, active: "about", currentPath: path, leadWritesDisabled }),
    body: {
      h1: copy.h1,
      intro: copy.intro,
      copy,
      story: { title: copy.storyTitle, paragraphs: [...copy.story] },
      offices: {
        title: copy.officesTitle,
        intro: copy.officesIntro,
        line: chromeCopy.offices,
        items: P4_AGENCY_OFFICES.map((id) => ({ id, ...copy.offices[id] })),
      },
      pillars: {
        title: copy.pillarsTitle,
        intro: copy.pillarsIntro,
        items: ["verified", "transparent", "fast", "multilingual", "local"].map((id) => ({
          id,
          icon: { verified: "shield-check", transparent: "eye", fast: "send", multilingual: "languages", local: "map-pin" }[id],
          ...copy.pillars[id],
        })),
      },
      team: {
        title: copy.teamTitle,
        intro: copy.teamIntro,
        available: team.available === true,
        profiles: team.available === true ? team.profiles : [],
        // The section renders even when nobody is approved yet: the approved
        // source says why, and the page repeats that instead of inventing people.
        empty:
          team.available === true
            ? null
            : {
                title: team.notice || copy.teamEmptyTitle,
                text: copy.teamEmptyText,
                fields: copy.teamFields,
                reason: team.reason || "not_approved",
                source: "approved_team_profiles",
              },
      },
      contact: {
        title: copy.contactTitle,
        text: copy.contactText,
        label: copy.contactCta,
        path: contactPath(registry, locale.code),
        channels: {
          phone: { href: `tel:${BRAND_CONTACT.phone}`, label: BRAND_CONTACT.phone_display },
          whatsapp: { href: BRAND_CONTACT.whatsapp, label: "WhatsApp" },
          viber: { href: BRAND_CONTACT.viber, label: "Viber" },
          email: { href: `mailto:${BRAND_CONTACT.email}`, label: BRAND_CONTACT.email },
        },
      },
      search: { path: `/${locale.code}/${locale.route_segments.search}` },
      seller: { path: sellerPath(registry, locale.code) },
      start: { path: startPath(registry, locale.code) },
    },
  };
}

// Saved-search management. Package B3 mints a capability link at save time and
// serves GET and POST /api/saved-searches/manage, so a visitor holding that
// link genuinely pauses, retunes or deletes their own alert here. Without the
// link the page still lists what this browser recorded, with the controls
// disabled and the reason on screen.
export function renderAlertsPage({ registry, localeCode } = {}) {
  const resolved = resolvePublicLocale(registry, localeCode);
  const locale = resolved.locale;
  const path = alertsPath(registry, locale.code);
  const labels = labelsFor(locale.code);
  const copy = { ...p4CopyFor(locale.code).alerts, ...(P4_ALERTS_MANAGE_COPY[locale.code] || P4_ALERTS_MANAGE_COPY.en) };
  const searchPathForLocale = `/${locale.code}/${locale.route_segments.search}`;

  return {
    kind: "alerts",
    status: 200,
    requested_locale: localeCode,
    locale: locale.code,
    lang: locale.code,
    dir: locale.direction,
    path,
    canonical: path,
    indexable: false,
    metadata: { title: copy.title, description: copy.description, robots: "noindex,follow" },
    hreflang: [],
    chrome: publicChrome(registry, locale, {
      hreflang: resolved.available ? localeAlternatesForAlerts(registry) : [],
      active: "alerts",
      currentPath: path,
    }),
    body: {
      h1: copy.h1,
      intro: copy.intro,
      copy,
      storage_key: ALERTS_STORAGE_KEY,
      create: { endpoint: "/api/saved-searches", method: "POST" },
      // The live contract. The token never reaches the server render: the page
      // is noindex and the client reads the token out of the query itself.
      manage: {
        endpoint: "/api/saved-searches/manage",
        token_param: "token",
        read: "GET",
        write: "POST",
        actions: [...SAVED_SEARCH_MANAGE_ACTIONS],
        frequencies: [...SAVED_SEARCH_FREQUENCIES],
      },
      frequencies: {
        instant: labels.alertInstant,
        daily: labels.alertDaily,
        weekly: labels.alertWeekly,
      },
      channels: { email: labels.email, whatsapp: "WhatsApp", phone: labels.phone, viber: "Viber" },
      // Stored criteria are raw filter values; this dictionary lets the client
      // name the ones it knows and fall back to the raw value for the rest.
      filter_labels: {
        offer_type: Object.fromEntries(
          ["sale", "rent"].map((value) => [value, localizedListingValue(locale.code, "offer_type", value)]),
        ),
        property_type: Object.fromEntries(
          CANONICAL_PROPERTY_FAMILIES.map((family) => [family, localizedListingValue(locale.code, "property_type", family)]),
        ),
        property_family: Object.fromEntries(
          CANONICAL_PROPERTY_FAMILIES.map((family) => [family, localizedListingValue(locale.code, "property_type", family)]),
        ),
      },
      controls: [
        { id: "pause", label: copy.pause, icon: "pause" },
        { id: "resume", label: copy.resume, icon: "play" },
        { id: "delete", label: copy.remove, icon: "trash-2" },
      ],
      search: { path: searchPathForLocale, label: copy.emptyCta },
      contact: {
        title: copy.contactTitle,
        text: copy.contactText,
        label: copy.contactCta,
        path: contactPath(registry, locale.code),
        phone: { href: `tel:${BRAND_CONTACT.phone}`, label: BRAND_CONTACT.phone_display },
      },
    },
  };
}

// Listing extras. The brochure action, and the vocabulary the purchase-cost
// disclosure needs to render page.body.cost_estimator (package B2). No rate is
// stated here: an unapproved line is shown as a marked absence.
export function listingExtras({ registry, locale, view, path }) {
  const copy = p4CopyFor(locale.code).listing;
  const costs = P4_COSTS_COPY[locale.code] || P4_COSTS_COPY.en;
  return {
    brochure: {
      title: copy.brochureTitle,
      label: copy.saveAsPdf,
      note: copy.brochureNote,
      url: `${path}?print=1`,
      reference: view.id,
      pdf_status: "browser_print_ready",
    },
    costs: {
      // Renting carries none of the purchase fees, so the disclosure is a
      // buy-only surface.
      applicable: view.offer_type === "sale",
      title: copy.costTitle,
      intro: copy.costIntro,
      buyer_label: costs.buyerLabel,
      buyers: { ...costs.buyers },
      lines: { ...costs.lines },
      lines_title: costs.linesTitle,
      missing_label: costs.missing,
      total_label: copy.costTotal,
      total_with_price_label: costs.totalWithPrice,
      total_unavailable: copy.costTotalUnavailable,
      note: copy.costNote,
      cta: { label: copy.costCta, path: contactPath(registry, locale.code) },
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

