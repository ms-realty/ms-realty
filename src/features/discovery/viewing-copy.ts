import type { PublicLocale } from "@/i18n/config";
import { timeCopy } from "@/i18n/time-copy";

// Interface copy only; this does not approve listing translations or promise a service slot.
const locales = ["bg", "en", "ru", "de", "nl", "el", "he"] as const;
type Row = readonly [string, string, string, string, string, string, string];
const rows = {
  title: [
    "Предпочитания за оглед",
    "Viewing preferences",
    "Пожелания к просмотру",
    "Besichtigungswünsche",
    "Bezichtigingsvoorkeuren",
    "Προτιμήσεις επίσκεψης",
    "העדפות לביקור",
  ],
  note: [
    "Това е заявка, не резервация. Брокерът трябва да провери възможностите и да потвърди уговорката.",
    "This is a request, not a booking. A broker must check availability and confirm the arrangement.",
    "Это запрос, а не бронирование. Брокер проверит возможность и подтвердит договорённость.",
    "Dies ist eine Anfrage, keine Buchung. Ein Makler muss Verfügbarkeit und Termin bestätigen.",
    "Dit is een verzoek, geen boeking. Een makelaar moet beschikbaarheid en afspraak bevestigen.",
    "Αυτό είναι αίτημα, όχι κράτηση. Ο μεσίτης πρέπει να ελέγξει τη διαθεσιμότητα και να επιβεβαιώσει.",
    "זו בקשה, לא הזמנה. מתווך צריך לבדוק זמינות ולאשר את התיאום.",
  ],
  format: [
    "Предпочитан формат",
    "Preferred format",
    "Предпочтительный формат",
    "Gewünschte Form",
    "Gewenste vorm",
    "Προτιμώμενη μορφή",
    "מתכונת מועדפת",
  ],
  inPerson: ["На място", "In person", "Лично", "Vor Ort", "Ter plaatse", "Διά ζώσης", "במקום"],
  noPreference: [
    "Нямам предпочитание",
    "No preference",
    "Нет предпочтений",
    "Keine Präferenz",
    "Geen voorkeur",
    "Χωρίς προτίμηση",
    "אין העדפה",
  ],
  timezone: [
    "Часова зона",
    "Time zone",
    "Часовой пояс",
    "Zeitzone",
    "Tijdzone",
    "Ζώνη ώρας",
    "אזור זמן",
  ],
  window: [
    "Предпочитан интервал",
    "Preferred window",
    "Желаемый интервал",
    "Gewünschter Zeitraum",
    "Voorkeursperiode",
    "Προτιμώμενο διάστημα",
    "טווח מועדף",
  ],
  start: [
    "От дата и час",
    "From date and time",
    "С даты и времени",
    "Ab Datum und Uhrzeit",
    "Vanaf datum en tijd",
    "Από ημερομηνία και ώρα",
    "מתאריך ושעה",
  ],
  end: [
    "До дата и час",
    "Until date and time",
    "До даты и времени",
    "Bis Datum und Uhrzeit",
    "Tot datum en tijd",
    "Έως ημερομηνία και ώρα",
    "עד תאריך ושעה",
  ],
  extraWindows: [
    "Още предпочитани интервали (до 3)",
    "More preferred windows (up to 3)",
    "Дополнительные интервалы (до 3)",
    "Weitere Zeiträume (bis zu 3)",
    "Meer voorkeursperioden (maximaal 3)",
    "Περισσότερα διαστήματα (έως 3)",
    "טווחים מועדפים נוספים (עד 3)",
  ],
  accessNeeds: [
    "Практически нужди за достъп",
    "Practical access needs",
    "Практические потребности доступа",
    "Praktische Zugangsbedürfnisse",
    "Praktische toegangsbehoeften",
    "Πρακτικές ανάγκες πρόσβασης",
    "צורכי נגישות מעשיים",
  ],
  accessHint: [
    "По желание; например достъп без стъпала. Не включвайте медицински данни, адреси или кодове за достъп. Бележката е само за екипа по заявката и няма да е в публичната разписка.",
    "Optional; for example, step-free access. Do not include medical details, addresses or access codes. This note is for the request team and will not appear in the public receipt.",
    "Необязательно; например, доступ без ступеней. Не указывайте медицинские сведения, адреса или коды. Заметку увидит команда запроса; в публичной квитанции её не будет.",
    "Optional, z. B. stufenloser Zugang. Keine medizinischen Angaben, Adressen oder Zugangscodes. Die Notiz ist nur für das Anfrage-Team, nicht für die öffentliche Bestätigung.",
    "Optioneel, bijvoorbeeld drempelloze toegang. Geen medische gegevens, adressen of toegangscodes. Alleen voor het aanvraagteam, niet op de openbare ontvangstbevestiging.",
    "Προαιρετικό, π.χ. πρόσβαση χωρίς σκαλοπάτια. Χωρίς ιατρικά στοιχεία, διευθύνσεις ή κωδικούς. Μόνο για την ομάδα αιτήματος, όχι στη δημόσια απόδειξη.",
    "רשות, למשל גישה ללא מדרגות. אין לכלול מידע רפואי, כתובות או קודי כניסה. ההערה מיועדת לצוות המטפל ולא תופיע באישור הציבורי.",
  ],
  invalidTime: [
    "Проверете датата и часа.",
    "Check the date and time.",
    "Проверьте дату и время.",
    "Datum und Uhrzeit prüfen.",
    "Controleer datum en tijd.",
    "Ελέγξτε την ημερομηνία και την ώρα.",
    "בדקו את התאריך והשעה.",
  ],
  pastTime: [
    "Този час вече е минал. Изберете бъдещ час.",
    "This time has already passed. Choose a future time.",
    "Это время уже прошло. Выберите время в будущем.",
    "Diese Uhrzeit liegt in der Vergangenheit. Bitte eine zukünftige Uhrzeit wählen.",
    "Deze tijd is al voorbij. Kies een tijd in de toekomst.",
    "Αυτή η ώρα έχει ήδη περάσει. Επιλέξτε μελλοντική ώρα.",
    "השעה הזו כבר עברה. בחרו שעה עתידית.",
  ],
  endBeforeStart: [
    "Краят трябва да е след началото.",
    "The end must be after the start.",
    "Окончание должно быть позже начала.",
    "Das Ende muss nach dem Beginn liegen.",
    "Het einde moet na het begin liggen.",
    "Η λήξη πρέπει να είναι μετά την έναρξη.",
    "הסיום חייב להיות אחרי ההתחלה.",
  ],
  unavailable: [
    "Няма текущи одобрени публични данни за този имот на избрания език. Статусът на уговорката е показан отделно.",
    "No current approved public property details are available in this language. The arrangement status is shown separately.",
    "Нет актуальных одобренных публичных данных об объекте на этом языке. Статус договорённости показан отдельно.",
    "Keine aktuellen freigegebenen öffentlichen Immobiliendaten in dieser Sprache. Der Terminstatus wird separat angezeigt.",
    "Geen actuele goedgekeurde openbare woninggegevens in deze taal. De afspraakstatus wordt apart getoond.",
    "Δεν υπάρχουν τρέχοντα εγκεκριμένα δημόσια στοιχεία σε αυτή τη γλώσσα. Η κατάσταση συνάντησης εμφανίζεται χωριστά.",
    "אין פרטי נכס ציבוריים מאושרים ועדכניים בשפה זו. מצב התיאום מוצג בנפרד.",
  ],
} satisfies Record<string, Row>;
export function viewingCopy(locale: PublicLocale) {
  const index = locales.indexOf(locale);
  return Object.fromEntries(Object.entries(rows).map(([key, row]) => [key, row[index]])) as Record<
    keyof typeof rows,
    string
  >;
}

/** The plain reason for a rejected window time (viewing-preferences and intake issue codes). */
export function viewingTimeMessage(locale: PublicLocale, reason: string | undefined) {
  const c = viewingCopy(locale);
  return reason === "past_time"
    ? c.pastTime
    : reason === "end_before_start"
      ? c.endBeforeStart
      : reason === "nonexistent"
        ? timeCopy(locale).nonexistent
        : c.invalidTime;
}
