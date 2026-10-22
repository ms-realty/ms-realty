import { factFieldLabel } from "@/i18n/fact-labels";
import { workflowCopy } from "@/i18n/workflow-copy";

export const ownerPreviewCopy = (locale: string) => workflowCopy(locale, "ownerPreview");

export function ownerPreviewLabel(value: string, locale: string) {
  if (
    ["price", "bedrooms", "rooms", "location"].includes(value) ||
    value.startsWith("area.") ||
    value.startsWith("feature.")
  )
    return factFieldLabel(value, locale);
  const labels = workflowCopy(locale, "ownerPreviewValues");
  return labels[value as keyof typeof labels] ?? factFieldLabel(value, locale);
}
