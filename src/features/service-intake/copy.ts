import type { PublicLocale } from "@/i18n/config";
import bg from "../../../messages/bg/discovery.json" with { type: "json" };
import de from "../../../messages/de/discovery.json" with { type: "json" };
import el from "../../../messages/el/discovery.json" with { type: "json" };
import en from "../../../messages/en/discovery.json" with { type: "json" };
import he from "../../../messages/he/discovery.json" with { type: "json" };
import nl from "../../../messages/nl/discovery.json" with { type: "json" };
import ru from "../../../messages/ru/discovery.json" with { type: "json" };
import staffBG from "../../../messages/staff/bg/operations.json" with { type: "json" };
import staffEN from "../../../messages/staff/en/operations.json" with { type: "json" };
import staffRU from "../../../messages/staff/ru/operations.json" with { type: "json" };

const publicCatalogs: Record<PublicLocale, typeof bg.serviceIntake> = {
  bg: bg.serviceIntake,
  en: en.serviceIntake,
  ru: ru.serviceIntake,
  de: de.serviceIntake,
  nl: nl.serviceIntake,
  el: el.serviceIntake,
  he: he.serviceIntake,
};
const staffCatalogs = {
  bg: staffBG.serviceIntake,
  en: staffEN.serviceIntake,
  ru: staffRU.serviceIntake,
};

export const serviceCopy = (locale: string) =>
  Object.hasOwn(publicCatalogs, locale)
    ? publicCatalogs[locale as PublicLocale]
    : publicCatalogs.bg;
export const serviceStaffCopy = (locale: string) =>
  Object.hasOwn(staffCatalogs, locale)
    ? staffCatalogs[locale as keyof typeof staffCatalogs]
    : staffCatalogs.bg;
