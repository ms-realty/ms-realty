import bg from "../../../messages/staff/bg/operations.json" with { type: "json" };
import en from "../../../messages/staff/en/operations.json" with { type: "json" };
import ru from "../../../messages/staff/ru/operations.json" with { type: "json" };
export const effortCopy = (locale: string) =>
  (locale === "ru" ? ru : locale === "en" ? en : bg).taskEffort;
