import type { PublicLocale } from "@/i18n/config";
import { catalogCopy } from "@/i18n/copy";
import bg from "../../../messages/bg/intent.json" with { type: "json" };
import de from "../../../messages/de/intent.json" with { type: "json" };
import el from "../../../messages/el/intent.json" with { type: "json" };
import en from "../../../messages/en/intent.json" with { type: "json" };
import he from "../../../messages/he/intent.json" with { type: "json" };
import nl from "../../../messages/nl/intent.json" with { type: "json" };
import ru from "../../../messages/ru/intent.json" with { type: "json" };

// Reviewed-intent search and advanced filter labels (messages/<locale>/intent.json).
const catalog = catalogCopy<typeof bg>({ bg, en, ru, de, nl, el, he });

export type IntentCopy = Readonly<typeof bg>;
export const intentCopy = (locale: PublicLocale): IntentCopy => catalog(locale);
