import type { PublicLocale } from "@/i18n/config";

const en = {
  title: "Alerts for this search",
  entry: "Get alerts for this search",
  criteria: "Search to save",
  edit: "Review or edit these filters",
  lead: "Review the search first. Then choose a verified email and give separate permission for search alerts in your account.",
  account: "Continue in your account",
  accountHint:
    "Use your existing account email. Signing in does not subscribe you. If you do not have access, contact the team.",
  manual: "Ask the team",
  manualHint:
    "Keep the search link when asking the team for help. Contacting us does not enable alerts or marketing.",
  deliveryOff:
    "Email alerts are currently unavailable. You can record or manage your preference, but delivery is not enabled.",
  deliveryBoundary:
    "Delivery depends on current consent, an eligible verified email and the agency’s approved alert service. No delivery time is promised.",
  unknown:
    "Listings with unknown facts do not match unless you explicitly include results needing confirmation.",
  source: "Search language",
  save: "Save this search preference",
  saving: "Saving preference…",
  saved: "Search preference recorded",
  savedNext:
    "Review, pause or unsubscribe in your account preferences. Recording this choice does not confirm email delivery.",
  preferences: "Manage preferences",
  check: "Check your choices",
  invalid: "The search could not be preserved. Review its filters before continuing.",
  consent:
    "I reviewed this search and the terms, and choose email alerts for it. This does not enable marketing.",
  retained: "Your choices are retained. Review the current state before trying again.",
  status: "Check this preference request",
  unconfirmed: "This change is not confirmed. Check its status before submitting another request.",
  existing:
    "A search-alert preference already exists. Review or change it in your account before creating another for the same email.",
  checkedAt: "Checked at",
};
const bg: typeof en = {
  title: "Известия за това търсене",
  entry: "Известия за това търсене",
  criteria: "Търсене за запазване",
  edit: "Преглед или промяна на филтрите",
  lead: "Първо прегледайте търсенето. След това изберете потвърден имейл и дайте отделно съгласие за известия в профила си.",
  account: "Продължете в профила си",
  accountHint:
    "Използвайте имейла на съществуващия си профил. Влизането не Ви абонира. Ако нямате достъп, свържете се с екипа.",
  manual: "Попитайте екипа",
  manualHint:
    "Запазете връзката към търсенето, когато търсите помощ. Контактът с нас не активира известия или маркетинг.",
  deliveryOff:
    "Имейл известията в момента не са достъпни. Можете да запишете или управлявате предпочитанието си, но изпращането не е активирано.",
  deliveryBoundary:
    "Изпращането зависи от текущото съгласие, потвърден имейл и одобрената услуга на агенцията. Не се обещава час на получаване.",
  unknown:
    "Имотите с неизвестни данни не съвпадат, освен ако изрично включите резултати, изискващи потвърждение.",
  source: "Език на търсенето",
  save: "Запазете предпочитанието за търсене",
  saving: "Запазване…",
  saved: "Предпочитанието за търсене е записано",
  savedNext:
    "Прегледайте, спрете или прекратете абонамента от предпочитанията в профила. Записването не потвърждава доставен имейл.",
  preferences: "Управление на предпочитанията",
  check: "Проверете избора си",
  invalid: "Търсенето не може да бъде запазено точно. Прегледайте филтрите, преди да продължите.",
  consent:
    "Прегледах търсенето и условията и избирам имейл известия за него. Това не активира маркетинг.",
  retained: "Изборът Ви е запазен. Прегледайте текущото състояние, преди да опитате отново.",
  status: "Проверете заявката за предпочитание",
  unconfirmed: "Промяната не е потвърдена. Проверете състоянието ѝ, преди да подадете нова заявка.",
  existing:
    "Вече има предпочитание за известия. Прегледайте или променете съществуващото, преди да създадете друго за същия имейл.",
  checkedAt: "Проверено на",
};
export const searchAlertCopy = (locale: string) => (locale === "bg" ? bg : en);
export const searchAlertCopyLocale = (locale: string) => (locale === "bg" ? "bg" : "en");

// The status view of one owned preference request. Unlike the bg/en strings above (shown in a
// lang="en" island outside Bulgarian), these exist in every public locale and carry its lang.
const locales = ["bg", "en", "ru", "de", "nl", "el", "he"] as const;
type Row = readonly [string, string, string, string, string, string, string];
const statusRows = {
  recordedRequest: [
    "Заявката за предпочитание за търсене е записана.",
    "This search-preference request was recorded.",
    "Запрос на уведомления по этому поиску записан.",
    "Diese Anfrage für Suchbenachrichtigungen wurde gespeichert.",
    "Dit verzoek voor zoekmeldingen is vastgelegd.",
    "Το αίτημα για ειδοποιήσεις αναζήτησης καταγράφηκε.",
    "הבקשה להתראות על החיפוש נרשמה.",
  ],
  currentPreference: [
    "Текущо запазено търсене",
    "Current saved search",
    "Текущий сохранённый поиск",
    "Aktuell gespeicherte Suche",
    "Huidige opgeslagen zoekopdracht",
    "Τρέχουσα αποθηκευμένη αναζήτηση",
    "החיפוש השמור הנוכחי",
  ],
  currentState: [
    "Текущо състояние на абонамента",
    "Current subscription state",
    "Текущее состояние подписки",
    "Aktueller Status des Abonnements",
    "Huidige status van het abonnement",
    "Τρέχουσα κατάσταση συνδρομής",
    "המצב הנוכחי של המינוי",
  ],
  historicalNote: [
    "По-долу е текущото запазено предпочитание. То може да е променено или прекратено след тази заявка; показаното не е копие на първоначалната заявка.",
    "The details below show the current saved preference. It may have been edited or withdrawn since this request; they are not a snapshot of the original request.",
    "Ниже показана текущая сохранённая настройка. После этого запроса её могли изменить или отменить; это не копия исходного запроса.",
    "Unten steht die aktuell gespeicherte Einstellung. Sie kann seit dieser Anfrage geändert oder beendet worden sein; die Angaben sind keine Kopie der ursprünglichen Anfrage.",
    "Hieronder staat de huidige opgeslagen voorkeur. Die kan na dit verzoek zijn gewijzigd of ingetrokken; dit is geen kopie van het oorspronkelijke verzoek.",
    "Παρακάτω εμφανίζεται η τρέχουσα αποθηκευμένη προτίμηση. Μπορεί να έχει αλλάξει ή να έχει ανακληθεί μετά από αυτό το αίτημα· δεν είναι αντίγραφο του αρχικού αιτήματος.",
    "למטה מוצגת ההעדפה השמורה הנוכחית. ייתכן שהיא שונתה או בוטלה מאז הבקשה הזו; זה אינו העתק של הבקשה המקורית.",
  ],
  savedCriteriaUnavailable: [
    "Данните за запазеното търсене не са достъпни тук. Проверете предпочитанията в профила си.",
    "The saved search details are unavailable here. Check your account preferences.",
    "Данные сохранённого поиска здесь недоступны. Проверьте настройки в своём профиле.",
    "Die Angaben zur gespeicherten Suche sind hier nicht verfügbar. Prüfen Sie die Einstellungen in Ihrem Konto.",
    "De gegevens van de opgeslagen zoekopdracht zijn hier niet beschikbaar. Controleer de voorkeuren in uw account.",
    "Τα στοιχεία της αποθηκευμένης αναζήτησης δεν είναι διαθέσιμα εδώ. Ελέγξτε τις προτιμήσεις στον λογαριασμό σας.",
    "פרטי החיפוש השמור אינם זמינים כאן. בדקו את ההעדפות בחשבון שלכם.",
  ],
} satisfies Record<string, Row>;
export function searchAlertStatusCopy(locale: PublicLocale) {
  const index = locales.indexOf(locale);
  return Object.fromEntries(
    Object.entries(statusRows).map(([key, row]) => [key, row[index]]),
  ) as Record<keyof typeof statusRows, string>;
}
