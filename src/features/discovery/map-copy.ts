import type { PublicLocale } from "@/i18n/config";
import { catalogCopy } from "@/i18n/copy";
import bg from "../../../messages/bg/map.json";
import de from "../../../messages/de/map.json";
import el from "../../../messages/el/map.json";
import en from "../../../messages/en/map.json";
import he from "../../../messages/he/map.json";
import nl from "../../../messages/nl/map.json";
import ru from "../../../messages/ru/map.json";

// Public map labels (messages/<locale>/map.json). A listing page names one property area and
// says that its marker is the area centre, not the address.
const catalog = catalogCopy<typeof bg>({ bg, en, ru, de, nl, el, he });

export function mapCopy(locale: PublicLocale, scope: "search" | "listing" = "search") {
  const { listingTitle, listingPrecision, ...copy } = catalog(locale);
  return scope === "listing" ? { ...copy, title: listingTitle, precision: listingPrecision } : copy;
}
export type MapCopy = ReturnType<typeof mapCopy>;
