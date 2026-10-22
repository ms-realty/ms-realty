// Recovery must still work when the request's translation provider is the failing dependency.

import type { PublicLocale } from "@/i18n/config";
import bg from "../../../messages/bg/errors.json";
import de from "../../../messages/de/errors.json";
import el from "../../../messages/el/errors.json";
import en from "../../../messages/en/errors.json";
import he from "../../../messages/he/errors.json";
import nl from "../../../messages/nl/errors.json";
import ru from "../../../messages/ru/errors.json";

const catalogs = { bg, en, ru, de, nl, el, he };
export const recoveryCopy = (locale: PublicLocale) => catalogs[locale];
