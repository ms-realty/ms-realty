import type { PublicLocale } from "@/i18n/config";
import { workflowCopy } from "@/i18n/workflow-copy";

// Compact labels retain full accessible names; interface drafts only.
export const journeyTabLabels = {
  bg: workflowCopy("bg", "journeyTabs"),
  en: workflowCopy("en", "journeyTabs"),
  ru: workflowCopy("ru", "journeyTabs"),
  de: workflowCopy("de", "journeyTabs"),
  nl: workflowCopy("nl", "journeyTabs"),
  el: workflowCopy("el", "journeyTabs"),
  he: workflowCopy("he", "journeyTabs"),
} satisfies Record<
  PublicLocale,
  Record<"overview" | "properties" | "appointments" | "messages" | "account", string>
>;
