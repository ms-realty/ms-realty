import { isPublicLocale } from "@/i18n/config";
import { catalogCopy } from "@/i18n/copy";
import bg from "../../../messages/bg/account-saves.json" with { type: "json" };
import de from "../../../messages/de/account-saves.json" with { type: "json" };
import el from "../../../messages/el/account-saves.json" with { type: "json" };
import en from "../../../messages/en/account-saves.json" with { type: "json" };
import he from "../../../messages/he/account-saves.json" with { type: "json" };
import nl from "../../../messages/nl/account-saves.json" with { type: "json" };
import ru from "../../../messages/ru/account-saves.json" with { type: "json" };

// Private interface drafts. Catalog selection grants no language approval or indexability.
const copyFor = catalogCopy({ bg, en, ru, de, nl, el, he });

export const accountSavesCopy = (locale: string) => copyFor(isPublicLocale(locale) ? locale : "bg");
