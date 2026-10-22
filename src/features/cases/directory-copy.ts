import { workflowLabel } from "@/i18n/workflow-labels";
import bg from "../../../messages/staff/bg/caseDirectory.json" with { type: "json" };
import en from "../../../messages/staff/en/caseDirectory.json" with { type: "json" };
import ru from "../../../messages/staff/ru/caseDirectory.json" with { type: "json" };
import { caseCopy } from "./copy";
import { inquiryLinkCopy } from "./inquiry-link-copy";

/** Staff interface drafts; catalog placement does not grant language approval. */
export function directoryCopy(locale: string): typeof bg {
  return locale === "bg" ? bg : locale === "ru" ? ru : en;
}

/** Stage names are O03's (inquiry-link-copy.ts), so a Deal reads the same on O03 and O04; an
 * unknown value is shown as recorded. */
export function caseStageLabel(stage: string, locale: string) {
  const stages: Record<string, string> = inquiryLinkCopy(locale).stages;
  return stages[stage] ?? workflowLabel(stage, locale);
}

export function caseKindLabel(kind: string, locale: string) {
  if (kind === "service_intake") return directoryCopy(locale).serviceIntake;
  const c = caseCopy(locale);
  return kind === "buyer" || kind === "tenant" || kind === "seller" || kind === "landlord"
    ? c[kind]
    : workflowLabel(kind, locale);
}
