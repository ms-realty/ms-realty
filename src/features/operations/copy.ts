import bg from "../../../messages/staff/bg/operations.json" with { type: "json" };
import en from "../../../messages/staff/en/operations.json" with { type: "json" };
import ru from "../../../messages/staff/ru/operations.json" with { type: "json" };

export function operationsCopy(locale: string) {
  return locale === "bg" ? bg : locale === "ru" ? ru : en;
}
