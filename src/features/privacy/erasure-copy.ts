// Staff drafts confer no human language, retention or provider acceptance.
import bg from "../../../messages/staff/bg/privacyErasure.json" with { type: "json" };
import en from "../../../messages/staff/en/privacyErasure.json" with { type: "json" };
import ru from "../../../messages/staff/ru/privacyErasure.json" with { type: "json" };
export const privacyErasureCopy = (locale: string) =>
  locale === "bg" ? bg : locale === "ru" ? ru : en;
