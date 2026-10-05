import type { PublicLocale } from "@/i18n/config";
import { catalogCopy } from "@/i18n/copy";
import bg from "../../../messages/bg/intent.json";
import de from "../../../messages/de/intent.json";
import el from "../../../messages/el/intent.json";
import en from "../../../messages/en/intent.json";
import he from "../../../messages/he/intent.json";
import nl from "../../../messages/nl/intent.json";
import ru from "../../../messages/ru/intent.json";

// Reviewed-intent search and advanced filter labels (messages/<locale>/intent.json).
const catalog = catalogCopy<typeof bg>({ bg, en, ru, de, nl, el, he });

export type IntentCopy = Readonly<typeof bg>;
export const intentCopy = (locale: PublicLocale): IntentCopy => catalog(locale);
