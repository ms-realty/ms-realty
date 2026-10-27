// Draft catalogs confer no human language or privacy-policy approval.

import { isPublicLocale } from "@/i18n/config";
import bg from "../../../messages/bg/privacy-export.json" with { type: "json" };
import de from "../../../messages/de/privacy-export.json" with { type: "json" };
import el from "../../../messages/el/privacy-export.json" with { type: "json" };
import en from "../../../messages/en/privacy-export.json" with { type: "json" };
import he from "../../../messages/he/privacy-export.json" with { type: "json" };
import nl from "../../../messages/nl/privacy-export.json" with { type: "json" };
import ru from "../../../messages/ru/privacy-export.json" with { type: "json" };
import staffBg from "../../../messages/staff/bg/privacyExport.json" with { type: "json" };
import staffEn from "../../../messages/staff/en/privacyExport.json" with { type: "json" };
import staffRu from "../../../messages/staff/ru/privacyExport.json" with { type: "json" };

const catalogs = { bg, de, el, en, he, nl, ru };
export function privacyExportCopy(locale: string) {
  const staff = locale === "bg" ? staffBg : locale === "ru" ? staffRu : staffEn;
  return { ...staff, ...catalogs[isPublicLocale(locale) ? locale : "en"] };
}
