// Staff interface drafts; these labels do not approve public content or translations.
import bg from "../../../messages/staff/bg/dataReview.json" with { type: "json" };
import en from "../../../messages/staff/en/dataReview.json" with { type: "json" };
import ru from "../../../messages/staff/ru/dataReview.json" with { type: "json" };
export const contentBodyCopy = (locale: string): typeof en.contentBody =>
  (locale === "bg" ? bg : locale === "ru" ? ru : en).contentBody;
