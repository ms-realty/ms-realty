import { isPublicLocale, type PublicLocale } from "@/i18n/config";
import { catalogCopy } from "@/i18n/copy";
import bg from "../../../messages/bg/search-alert.json" with { type: "json" };
import de from "../../../messages/de/search-alert.json" with { type: "json" };
import el from "../../../messages/el/search-alert.json" with { type: "json" };
import en from "../../../messages/en/search-alert.json" with { type: "json" };
import he from "../../../messages/he/search-alert.json" with { type: "json" };
import nl from "../../../messages/nl/search-alert.json" with { type: "json" };
import ru from "../../../messages/ru/search-alert.json" with { type: "json" };

const copyFor = catalogCopy({ bg, en, ru, de, nl, el, he });
export const searchAlertCopyLocale = (locale: string): PublicLocale =>
  isPublicLocale(locale) ? locale : "en";
export const searchAlertCopy = (locale: string) => copyFor(searchAlertCopyLocale(locale));

// The status view of one owned preference request, in the validated page locale.
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
