import type { PublicLocale } from "@/i18n/config";
import { catalogCopy } from "@/i18n/copy";
import bg from "../../../messages/bg/discovery.json" with { type: "json" };
import de from "../../../messages/de/discovery.json" with { type: "json" };
import el from "../../../messages/el/discovery.json" with { type: "json" };
import en from "../../../messages/en/discovery.json" with { type: "json" };
import he from "../../../messages/he/discovery.json" with { type: "json" };
import nl from "../../../messages/nl/discovery.json" with { type: "json" };
import ru from "../../../messages/ru/discovery.json" with { type: "json" };

// Interface copy only (messages/<locale>/discovery.json). Listing prose always comes from an
// approved locale manifest. The catalogs are unreviewed drafts (messages/_status.json).
const catalog = catalogCopy<typeof bg>({ bg, en, ru, de, nl, el, he });

export type DiscoveryCopy = Readonly<typeof bg>;
export function discoveryCopy(locale: PublicLocale): DiscoveryCopy {
  return catalog(locale);
}
