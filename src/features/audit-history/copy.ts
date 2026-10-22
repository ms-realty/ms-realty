import bg from "../../../messages/staff/bg/auditHistory.json" with { type: "json" };
import en from "../../../messages/staff/en/auditHistory.json" with { type: "json" };
import ru from "../../../messages/staff/ru/auditHistory.json" with { type: "json" };

export function auditHistoryCopy(locale: string) {
  return locale === "bg" ? bg : locale === "ru" ? ru : en;
}
