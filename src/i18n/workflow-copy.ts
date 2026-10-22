import bg from "../../messages/bg/workflow.json" with { type: "json" };
import de from "../../messages/de/workflow.json" with { type: "json" };
import el from "../../messages/el/workflow.json" with { type: "json" };
import en from "../../messages/en/workflow.json" with { type: "json" };
import he from "../../messages/he/workflow.json" with { type: "json" };
import nl from "../../messages/nl/workflow.json" with { type: "json" };
import ru from "../../messages/ru/workflow.json" with { type: "json" };
import { isPublicLocale } from "./config";

const catalogs = { bg, en, ru, de, nl, el, he };

/** Private interface drafts. Catalog parity does not grant human language approval. */
export function workflowCopy<K extends keyof typeof en>(
  locale: string,
  section: K,
): (typeof en)[K] {
  return catalogs[isPublicLocale(locale) ? locale : "en"][section];
}
