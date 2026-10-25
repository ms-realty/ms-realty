// Staff interface drafts; catalog placement does not grant content/language approval.
import bg from "../../../messages/staff/bg/dataReview.json" with { type: "json" };
import en from "../../../messages/staff/en/dataReview.json" with { type: "json" };
import ru from "../../../messages/staff/ru/dataReview.json" with { type: "json" };

type Copy = typeof en.contentLocales;
export const contentLocaleCopy = (locale: string): Copy =>
  (locale === "bg" ? bg : locale === "ru" ? ru : en).contentLocales;
export function contentLocaleState(state: string, locale: string) {
  const copy = contentLocaleCopy(locale);
  return state === "stale"
    ? copy.staleState
    : Object.hasOwn(copy, state)
      ? copy[state as keyof Copy]
      : copy.missing;
}
