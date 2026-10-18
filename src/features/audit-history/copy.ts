import bg from "../../../messages/staff/bg/auditHistory.json";
import en from "../../../messages/staff/en/auditHistory.json";
import ru from "../../../messages/staff/ru/auditHistory.json";

export function auditHistoryCopy(locale: string) {
  return locale === "bg" ? bg : locale === "ru" ? ru : en;
}
