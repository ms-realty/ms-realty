// Time words shared by the formatter, the date-time field and the time errors of every host.
// Bulgarian is the source; en and ru are product drafts, de/nl/el/he are drafts for review.
import type { PublicLocale } from "@/domain/ids";

const locales = ["bg", "en", "ru", "de", "nl", "el", "he"] as const;
type Row = readonly [string, string, string, string, string, string, string];

/** A zone in plain words, written to follow a time: «18:16 (софийско време)». */
const zoneWords: Record<string, Row> = {
  "Europe/Sofia": [
    "софийско време",
    "Sofia time",
    "по софийскому времени",
    "Ortszeit Sofia",
    "tijd in Sofia",
    "ώρα Σόφιας",
    "שעון סופיה",
  ],
  "Europe/Athens": [
    "атинско време",
    "Athens time",
    "по афинскому времени",
    "Ortszeit Athen",
    "tijd in Athene",
    "ώρα Αθήνας",
    "שעון אתונה",
  ],
};

const rows = {
  occurrence: [
    "Кой от двата часа?",
    "Which occurrence?",
    "Какое из двух времён?",
    "Welche Uhrzeit?",
    "Welke keer?",
    "Ποια από τις δύο ώρες;",
    "איזו הופעה של השעה?",
  ],
  choose: [
    "Изберете при повторен час",
    "Choose when the hour repeats",
    "Выберите при повторном часе",
    "Bei doppelter Uhrzeit auswählen",
    "Kies als het uur herhaald wordt",
    "Επιλέξτε όταν η ώρα επαναλαμβάνεται",
    "בחרו כשהשעה חוזרת",
  ],
  earlier: [
    "Първият път, преди смяната",
    "First, before the clocks change",
    "Первое, до перевода часов",
    "Erstes Mal, vor der Zeitumstellung",
    "Eerste keer, vóór de omschakeling",
    "Πρώτη φορά, πριν την αλλαγή",
    "הראשונה, לפני שינוי השעון",
  ],
  later: [
    "Вторият път, след смяната",
    "Second, after the clocks change",
    "Второе, после перевода часов",
    "Zweites Mal, nach der Zeitumstellung",
    "Tweede keer, na de omschakeling",
    "Δεύτερη φορά, μετά την αλλαγή",
    "השנייה, אחרי שינוי השעון",
  ],
  /** A wall time inside the spring-forward gap. */
  nonexistent: [
    "Този час не съществува: през тази нощ часовникът се мести с един час напред. Изберете друг час.",
    "This time doesn't exist: the clocks go forward one hour that night. Choose another time.",
    "Такого времени не будет: в эту ночь часы переводят на час вперёд. Выберите другое время.",
    "Diese Uhrzeit gibt es nicht: In dieser Nacht wird die Uhr eine Stunde vorgestellt. Bitte eine andere Uhrzeit wählen.",
    "Deze tijd bestaat niet: die nacht gaat de klok een uur vooruit. Kies een andere tijd.",
    "Αυτή η ώρα δεν υπάρχει: εκείνη τη νύχτα τα ρολόγια πάνε μία ώρα μπροστά. Επιλέξτε άλλη ώρα.",
    "השעה הזו לא קיימת: באותו לילה מקדימים את השעון בשעה. בחרו שעה אחרת.",
  ],
  /** A wall time inside the autumn repeated hour, where a commitment needs one exact instant. */
  repeated: [
    "Този час се повтаря два пъти: през тази нощ часовникът се връща с един час назад. Изберете първия или втория път.",
    "This time happens twice: the clocks go back one hour that night. Choose the first or second occurrence.",
    "Это время наступит дважды: в эту ночь часы переводят на час назад. Выберите первое или второе.",
    "Diese Uhrzeit gibt es zweimal: In dieser Nacht wird die Uhr eine Stunde zurückgestellt. Bitte das erste oder zweite Mal auswählen.",
    "Deze tijd komt twee keer voor: die nacht gaat de klok een uur terug. Kies de eerste of tweede keer.",
    "Αυτή η ώρα υπάρχει δύο φορές: εκείνη τη νύχτα τα ρολόγια γυρίζουν μία ώρα πίσω. Επιλέξτε την πρώτη ή τη δεύτερη.",
    "השעה הזו מופיעה פעמיים: באותו לילה מחזירים את השעון בשעה. בחרו בראשונה או בשנייה.",
  ],
  /** The same repeated hour where a visitor's preference takes its first occurrence. */
  repeatedFirst: [
    "През тази нощ часовникът се връща с един час назад и този час се повтаря. Ще използваме първия път, преди смяната.",
    "The clocks go back one hour that night, so this time happens twice. We'll use the first one, before the change.",
    "В эту ночь часы переводят на час назад, и это время наступит дважды. Мы возьмём первое, до перевода часов.",
    "In dieser Nacht wird die Uhr eine Stunde zurückgestellt, daher gibt es diese Uhrzeit zweimal. Wir nehmen die erste, vor der Umstellung.",
    "Die nacht gaat de klok een uur terug, dus deze tijd komt twee keer voor. We nemen de eerste, vóór de omschakeling.",
    "Εκείνη τη νύχτα τα ρολόγια γυρίζουν μία ώρα πίσω, οπότε αυτή η ώρα υπάρχει δύο φορές. Θα κρατήσουμε την πρώτη, πριν από την αλλαγή.",
    "באותו לילה מחזירים את השעון בשעה, ולכן השעה הזו מופיעה פעמיים. נשתמש בראשונה, לפני השינוי.",
  ],
  /** Not a calendar date and time at all (for example 30 February). */
  invalid: [
    "Проверете датата и часа.",
    "Check the date and time.",
    "Проверьте дату и время.",
    "Datum und Uhrzeit prüfen.",
    "Controleer datum en tijd.",
    "Ελέγξτε την ημερομηνία και την ώρα.",
    "בדקו את התאריך והשעה.",
  ],
} satisfies Record<string, Row>;

export type TimeReason = "invalid_local_time" | "nonexistent_local_time" | "ambiguous_local_time";

export function timeCopy(locale: PublicLocale) {
  const index = locales.indexOf(locale);
  return Object.fromEntries(Object.entries(rows).map(([key, row]) => [key, row[index]])) as Record<
    keyof typeof rows,
    string
  >;
}

/** The plain-language message for a rejected local time, or undefined for another reason. */
export function timeReasonMessage(locale: PublicLocale, reason: string | undefined) {
  const copy = timeCopy(locale);
  return reason === "nonexistent_local_time"
    ? copy.nonexistent
    : reason === "ambiguous_local_time"
      ? copy.repeated
      : reason === "invalid_local_time"
        ? copy.invalid
        : undefined;
}

/** The written name of a zone the agency works in, or null when it has none here. */
export function zoneWordsFor(locale: PublicLocale, timeZone: string): string | null {
  return zoneWords[timeZone]?.[locales.indexOf(locale)] ?? null;
}
