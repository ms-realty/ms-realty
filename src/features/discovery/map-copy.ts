import type { PublicLocale } from "@/i18n/config";
import { catalogCopy } from "@/i18n/copy";
import bg from "../../../messages/bg/map.json" with { type: "json" };
import de from "../../../messages/de/map.json" with { type: "json" };
import el from "../../../messages/el/map.json" with { type: "json" };
import en from "../../../messages/en/map.json" with { type: "json" };
import he from "../../../messages/he/map.json" with { type: "json" };
import nl from "../../../messages/nl/map.json" with { type: "json" };
import ru from "../../../messages/ru/map.json" with { type: "json" };

const copyFor = catalogCopy({ bg, en, ru, de, nl, el, he });

type MapFields = Omit<typeof bg, "listingTitle" | "listingPrecision">;
export function mapCopy(locale: PublicLocale, scope: "search" | "listing" = "search"): MapFields {
  const { listingTitle, listingPrecision, ...copy } = copyFor(locale);
  return scope === "listing" ? { ...copy, title: listingTitle, precision: listingPrecision } : copy;
}
export type MapCopy = ReturnType<typeof mapCopy>;
