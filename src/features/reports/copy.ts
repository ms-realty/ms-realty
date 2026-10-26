// Staff interface drafts; catalog placement does not grant language approval.
import bg from "../../../messages/staff/bg/operations.json" with { type: "json" };
import en from "../../../messages/staff/en/operations.json" with { type: "json" };
import ru from "../../../messages/staff/ru/operations.json" with { type: "json" };

export const reportsCopy = (locale: string): typeof en.businessReports =>
  (locale === "bg" ? bg : locale === "ru" ? ru : en).businessReports;
