// Staff interface drafts; catalog placement grants no content or publication approval.
import bg from "../../../messages/staff/bg/dataReview.json" with { type: "json" };
import en from "../../../messages/staff/en/dataReview.json" with { type: "json" };
import ru from "../../../messages/staff/ru/dataReview.json" with { type: "json" };

export const importExecutionCopy = (locale: string): typeof en.importExecution =>
  (locale === "en" ? en : locale === "ru" ? ru : bg).importExecution;
