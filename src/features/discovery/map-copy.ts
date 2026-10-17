import type { PublicLocale } from "@/i18n/config";

const copies = {
  bg: [
    "Покажи карта",
    "Скрий картата",
    "Зареждане на картата…",
    "Картата не е достъпна. Използвайте списъка или опитайте отново.",
    "Опитай отново",
    "Показани са центрове на райони или населени места, не адреси на имотите. Картата обхваща само тази страница с резултати.",
    "Карта на резултатите",
    "Няма публикувани местоположения за тази страница.",
    "Картата изисква JavaScript. Всички имоти са достъпни в списъка.",
    "Към списъка",
    "Отвори имота",
  ],
  en: [
    "Show map",
    "Hide map",
    "Loading map…",
    "The map is unavailable. Use the list or try again.",
    "Try again",
    "Markers show area or settlement centres, not property addresses. The map covers only this page of results.",
    "Map of results",
    "No published map locations on this page.",
    "The map needs JavaScript. All properties are available in the list.",
    "Go to list",
    "Open property",
  ],
  ru: [
    "Показать карту",
    "Скрыть карту",
    "Загрузка карты…",
    "Карта недоступна. Используйте список или повторите попытку.",
    "Повторить",
    "Отметки показывают центры районов или населённых пунктов, а не адреса объектов. На карте только текущая страница результатов.",
    "Карта результатов",
    "На этой странице нет опубликованных местоположений.",
    "Для карты нужен JavaScript. Все объекты доступны в списке.",
    "К списку",
    "Открыть объект",
  ],
  nl: [
    "Kaart tonen",
    "Kaart verbergen",
    "Kaart laden…",
    "De kaart is niet beschikbaar. Gebruik de lijst of probeer het opnieuw.",
    "Opnieuw proberen",
    "Markeringen tonen gebieds- of plaatscentra, geen adressen van woningen. De kaart omvat alleen deze resultatenpagina.",
    "Kaart met resultaten",
    "Geen gepubliceerde kaartlocaties op deze pagina.",
    "De kaart vereist JavaScript. Alle woningen staan in de lijst.",
    "Naar de lijst",
    "Woning openen",
  ],
  de: [
    "Karte anzeigen",
    "Karte ausblenden",
    "Karte wird geladen…",
    "Die Karte ist nicht verfügbar. Nutzen Sie die Liste oder versuchen Sie es erneut.",
    "Erneut versuchen",
    "Markierungen zeigen Gebiets- oder Ortszentren, keine Immobilienadressen. Die Karte umfasst nur diese Ergebnisseite.",
    "Karte der Ergebnisse",
    "Keine veröffentlichten Kartenpositionen auf dieser Seite.",
    "Die Karte benötigt JavaScript. Alle Immobilien sind in der Liste verfügbar.",
    "Zur Liste",
    "Immobilie öffnen",
  ],
  he: [
    "הצגת מפה",
    "הסתרת המפה",
    "המפה נטענת…",
    "המפה אינה זמינה. השתמשו ברשימה או נסו שוב.",
    "ניסיון נוסף",
    "הסמנים מציגים מרכזי אזורים או יישובים, ולא כתובות נכסים. המפה כוללת רק את עמוד התוצאות הזה.",
    "מפת התוצאות",
    "אין מיקומים שפורסמו למפה בעמוד זה.",
    "המפה דורשת JavaScript. כל הנכסים זמינים ברשימה.",
    "מעבר לרשימה",
    "פתיחת הנכס",
  ],
  el: [
    "Εμφάνιση χάρτη",
    "Απόκρυψη χάρτη",
    "Φόρτωση χάρτη…",
    "Ο χάρτης δεν είναι διαθέσιμος. Χρησιμοποιήστε τη λίστα ή δοκιμάστε ξανά.",
    "Δοκιμάστε ξανά",
    "Οι δείκτες δείχνουν κέντρα περιοχών ή οικισμών, όχι διευθύνσεις ακινήτων. Ο χάρτης καλύπτει μόνο αυτή τη σελίδα αποτελεσμάτων.",
    "Χάρτης αποτελεσμάτων",
    "Δεν υπάρχουν δημοσιευμένες θέσεις σε αυτή τη σελίδα.",
    "Ο χάρτης απαιτεί JavaScript. Όλα τα ακίνητα είναι διαθέσιμα στη λίστα.",
    "Στη λίστα",
    "Άνοιγμα ακινήτου",
  ],
} as const satisfies Record<PublicLocale, readonly string[]>;
export function mapCopy(locale: PublicLocale, scope: "search" | "listing" = "search") {
  const [show, hide, loading, error, retry, precision, title, empty, noScript, list, open] =
    copies[locale];
  const controls = {
    bg: ["Приближи", "Отдалечи", "Затвори"],
    en: ["Zoom in", "Zoom out", "Close"],
    ru: ["Приблизить", "Отдалить", "Закрыть"],
    de: ["Vergrößern", "Verkleinern", "Schließen"],
    nl: ["Inzoomen", "Uitzoomen", "Sluiten"],
    el: ["Μεγέθυνση", "Σμίκρυνση", "Κλείσιμο"],
    he: ["התקרבות", "התרחקות", "סגירה"],
  } as const;
  const [zoomIn, zoomOut, close] = controls[locale];
  const detail = {
    bg: [
      "Район на имота",
      "Показан е центърът на района или населеното място, не адресът на имота.",
    ],
    en: [
      "Property area",
      "The marker shows the area or settlement centre, not the property address.",
    ],
    ru: [
      "Район объекта",
      "Отметка показывает центр района или населённого пункта, а не адрес объекта.",
    ],
    de: [
      "Lagegebiet",
      "Die Markierung zeigt das Gebiets- oder Ortszentrum, nicht die Immobilienadresse.",
    ],
    nl: [
      "Omgeving van de woning",
      "De markering toont het gebieds- of plaatscentrum, niet het adres van de woning.",
    ],
    el: [
      "Περιοχή ακινήτου",
      "Ο δείκτης δείχνει το κέντρο της περιοχής ή του οικισμού, όχι τη διεύθυνση του ακινήτου.",
    ],
    he: ["אזור הנכס", "הסמן מציג את מרכז האזור או היישוב, ולא את כתובת הנכס."],
  } as const;

  return {
    zoomIn,
    zoomOut,
    close,
    show: show,
    hide: hide,
    loading: loading,
    error: error,
    retry: retry,
    precision: scope === "listing" ? detail[locale][1] : precision,
    title: scope === "listing" ? detail[locale][0] : title,
    empty: empty,
    noScript: noScript,
    list: list,
    open: open,
  };
}
export type MapCopy = ReturnType<typeof mapCopy>;
