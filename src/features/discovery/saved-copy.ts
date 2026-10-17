import type { PublicLocale } from "@/i18n/config";

// Interface translations only; public listing content still requires an approved locale manifest.
const locales = ["bg", "en", "ru", "de", "nl", "el", "he"] as const;
type Row = readonly [string, string, string, string, string, string, string];
const rows = {
  choose: [
    "Изберете 2 или 3 имота за сравнение. Останалите остават запазени.",
    "Choose 2 or 3 properties to compare. The others stay saved.",
    "Выберите 2 или 3 объекта для сравнения. Остальные останутся сохранёнными.",
    "Wählen Sie 2 oder 3 Immobilien zum Vergleich. Die anderen bleiben gespeichert.",
    "Kies 2 of 3 woningen om te vergelijken. De andere blijven opgeslagen.",
    "Επιλέξτε 2 ή 3 ακίνητα για σύγκριση. Τα υπόλοιπα παραμένουν αποθηκευμένα.",
    "בחרו 2 או 3 נכסים להשוואה. האחרים יישארו שמורים.",
  ],
  selected: [
    "Избрани за сравнение",
    "Selected for comparison",
    "Выбрано для сравнения",
    "Zum Vergleich ausgewählt",
    "Geselecteerd voor vergelijking",
    "Επιλεγμένα για σύγκριση",
    "נבחרו להשוואה",
  ],
  select: [
    "Избери за сравнение",
    "Select for comparison",
    "Выбрать для сравнения",
    "Zum Vergleich auswählen",
    "Selecteren voor vergelijking",
    "Επιλογή για σύγκριση",
    "בחירה להשוואה",
  ],
  compareSelected: [
    "Сравни избраните",
    "Compare selected properties",
    "Сравнить выбранные",
    "Ausgewählte vergleichen",
    "Geselecteerde woningen vergelijken",
    "Σύγκριση επιλεγμένων",
    "השוואת הנכסים שנבחרו",
  ],
  loading: [
    "Проверяваме текущите данни за имота…",
    "Checking current property details…",
    "Проверяем текущие данные объекта…",
    "Aktuelle Immobiliendaten werden geprüft…",
    "Actuele woninggegevens controleren…",
    "Έλεγχος τρεχόντων στοιχείων ακινήτου…",
    "בודקים את פרטי הנכס העדכניים…",
  ],
  loadFailed: [
    "Данните не се заредиха. Имотът остава запазен; наличността му не е потвърдена.",
    "Details could not load. This property stays saved; its availability is unconfirmed.",
    "Данные не загрузились. Объект сохранён; доступность не подтверждена.",
    "Die Daten konnten nicht geladen werden. Die Immobilie bleibt gespeichert; ihre Verfügbarkeit ist unbestätigt.",
    "De gegevens konden niet laden. De woning blijft opgeslagen; de beschikbaarheid is onbevestigd.",
    "Τα στοιχεία δεν φορτώθηκαν. Το ακίνητο παραμένει αποθηκευμένο· η διαθεσιμότητα δεν έχει επιβεβαιωθεί.",
    "הפרטים לא נטענו. הנכס נשאר שמור; זמינותו לא אושרה.",
  ],
  retry: [
    "Опитай отново",
    "Try again",
    "Повторить",
    "Erneut versuchen",
    "Opnieuw proberen",
    "Δοκιμή ξανά",
    "ניסיון נוסף",
  ],
  undo: [
    "Възстанови",
    "Undo removal",
    "Отменить удаление",
    "Entfernen rückgängig machen",
    "Verwijderen ongedaan maken",
    "Αναίρεση αφαίρεσης",
    "ביטול ההסרה",
  ],
  removed: [
    "Премахнат от запазените",
    "Removed from saved properties",
    "Удалён из сохранённых",
    "Aus gespeicherten Immobilien entfernt",
    "Verwijderd uit opgeslagen woningen",
    "Αφαιρέθηκε από τα αποθηκευμένα",
    "הוסר מהנכסים השמורים",
  ],
  unavailable: [
    "Остава в запазените. Премахнете го от избора, за да сравните достъпните имоти.",
    "It stays saved. Deselect it to compare the available properties.",
    "Объект остаётся сохранённым. Снимите выбор, чтобы сравнить доступные объекты.",
    "Die Immobilie bleibt gespeichert. Heben Sie die Auswahl auf, um verfügbare Immobilien zu vergleichen.",
    "De woning blijft opgeslagen. Deselecteer deze om beschikbare woningen te vergelijken.",
    "Παραμένει αποθηκευμένο. Αποεπιλέξτε το για να συγκρίνετε τα διαθέσιμα ακίνητα.",
    "הנכס נשאר שמור. בטלו את בחירתו כדי להשוות נכסים זמינים.",
  ],
  storageUnreadable: [
    "Запазените имоти в браузъра не могат да бъдат прочетени. Това не означава, че списъкът ви е празен.",
    "Browser saves could not be read. This does not mean your saved list is empty.",
    "Не удалось прочитать сохранённые объекты. Это не означает, что список пуст.",
    "Gespeicherte Immobilien konnten nicht gelesen werden. Ihre Liste ist deshalb nicht unbedingt leer.",
    "Opgeslagen woningen konden niet worden gelezen. Dit betekent niet dat uw lijst leeg is.",
    "Δεν ήταν δυνατή η ανάγνωση των αποθηκευμένων. Αυτό δεν σημαίνει ότι η λίστα είναι κενή.",
    "לא ניתן לקרוא את הנכסים השמורים בדפדפן. אין פירוש הדבר שהרשימה ריקה.",
  ],
  saveLimit: [
    "Можете да запазите до 50 имота в този браузър.",
    "You can save up to 50 properties in this browser.",
    "В этом браузере можно сохранить до 50 объектов.",
    "In diesem Browser können Sie bis zu 50 Immobilien speichern.",
    "U kunt maximaal 50 woningen in deze browser opslaan.",
    "Μπορείτε να αποθηκεύσετε έως 50 ακίνητα σε αυτόν τον περιηγητή.",
    "אפשר לשמור עד 50 נכסים בדפדפן זה.",
  ],
} satisfies Record<string, Row>;

export function savedCopy(locale: PublicLocale) {
  const index = locales.indexOf(locale);
  return Object.fromEntries(Object.entries(rows).map(([key, row]) => [key, row[index]])) as {
    [K in keyof typeof rows]: string;
  };
}
