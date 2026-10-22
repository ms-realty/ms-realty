// Catalog drafts preserve separate purposes and human review; they confer no consent or indexing approval.
import { isPublicLocale, type PublicLocale } from "@/i18n/config";
import bg from "../../../messages/bg/privacy.json" with { type: "json" };
import de from "../../../messages/de/privacy.json" with { type: "json" };
import el from "../../../messages/el/privacy.json" with { type: "json" };
import en from "../../../messages/en/privacy.json" with { type: "json" };
import he from "../../../messages/he/privacy.json" with { type: "json" };
import nl from "../../../messages/nl/privacy.json" with { type: "json" };
import ru from "../../../messages/ru/privacy.json" with { type: "json" };

const catalogs: Record<PublicLocale, typeof bg> = { bg, en, ru, de, nl, el, he };
const catalog = (locale: string) => catalogs[isPublicLocale(locale) ? locale : "en"];
export const privacyCopy = (locale: string) => catalog(locale).labels;
export const privacyLabel = (locale: string, value: string) => {
  const names: Readonly<Record<string, string>> = catalog(locale).names;
  return names[value] ?? value;
};
