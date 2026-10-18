import bg from "../../../messages/staff/bg/operations.json";
import en from "../../../messages/staff/en/operations.json";
import ru from "../../../messages/staff/ru/operations.json";

export function operationsCopy(locale: string) {
  return locale === "bg" ? bg : locale === "ru" ? ru : en;
}
