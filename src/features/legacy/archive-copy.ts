import type { PublicLocale } from "@/domain/ids";
import { catalogCopy } from "@/i18n/copy";
import bg from "../../../messages/bg/legacy-archive.json" with { type: "json" };
import de from "../../../messages/de/legacy-archive.json" with { type: "json" };
import el from "../../../messages/el/legacy-archive.json" with { type: "json" };
import en from "../../../messages/en/legacy-archive.json" with { type: "json" };
import he from "../../../messages/he/legacy-archive.json" with { type: "json" };
import nl from "../../../messages/nl/legacy-archive.json" with { type: "json" };
import ru from "../../../messages/ru/legacy-archive.json" with { type: "json" };

// Interface copy only: the captured title, prose, fields and media keep their
// recorded language. Catalog selection grants no source translation approval.
const copyFor = catalogCopy({ bg, en, ru, de, nl, el, he });
export const archiveCopy = (locale: PublicLocale) => copyFor(locale);
