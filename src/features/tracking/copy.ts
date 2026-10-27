import type { PublicLocale } from "@/i18n/config";
import bg from "../../../messages/bg/tracking.json" with { type: "json" };
import de from "../../../messages/de/tracking.json" with { type: "json" };
import el from "../../../messages/el/tracking.json" with { type: "json" };
import en from "../../../messages/en/tracking.json" with { type: "json" };
import he from "../../../messages/he/tracking.json" with { type: "json" };
import nl from "../../../messages/nl/tracking.json" with { type: "json" };
import ru from "../../../messages/ru/tracking.json" with { type: "json" };

// Interface drafts; catalog migration grants no human approval or indexability.
export const trackingCopy: Record<PublicLocale, typeof en> = { bg, en, ru, de, nl, el, he };
