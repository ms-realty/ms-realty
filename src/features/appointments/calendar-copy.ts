import bg from "../../../messages/staff/bg/calendar.json" with { type: "json" };
import en from "../../../messages/staff/en/calendar.json" with { type: "json" };
import ru from "../../../messages/staff/ru/calendar.json" with { type: "json" };

/** Staff interface drafts; catalog placement does not grant language approval. */
export function calendarCopy(locale: string): typeof bg {
  return locale === "ru" ? ru : locale === "en" ? en : bg;
}
