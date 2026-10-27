import { isPublicLocale } from "@/i18n/config";
import { catalogCopy } from "@/i18n/copy";
import bg from "../../../messages/bg/client-workflow.json" with { type: "json" };
import de from "../../../messages/de/client-workflow.json" with { type: "json" };
import el from "../../../messages/el/client-workflow.json" with { type: "json" };
import en from "../../../messages/en/client-workflow.json" with { type: "json" };
import he from "../../../messages/he/client-workflow.json" with { type: "json" };
import nl from "../../../messages/nl/client-workflow.json" with { type: "json" };
import ru from "../../../messages/ru/client-workflow.json" with { type: "json" };

// Private interface drafts. Catalog selection grants no language approval or indexability.
const copyFor = catalogCopy({ bg, en, ru, de, nl, el, he });

export const clientWorkflowCopy = (locale: string) =>
  copyFor(isPublicLocale(locale) ? locale : "bg").overview;
export const participantResponseTitle = (locale: string) =>
  copyFor(isPublicLocale(locale) ? locale : "bg").participantResponseTitle;
export const clientLogisticsUnknown = (locale: string) =>
  copyFor(isPublicLocale(locale) ? locale : "bg").logisticsUnknown;
