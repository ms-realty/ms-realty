import { areaBases, priceBases } from "@/domain/facts";
import { isPublicLocale } from "@/domain/ids";
import { factFieldLabel } from "@/i18n/fact-labels";
import { workflowCopy } from "@/i18n/workflow-copy";
import { discoveryCopy } from "../discovery/copy";

export const ownerPreviewCopy = (locale: string) => workflowCopy(locale, "ownerPreview");

export function ownerPreviewLabel(value: string, requested: string) {
  const locale = isPublicLocale(requested) ? requested : "en";
  if (areaBases.some((basis) => basis === value)) return factFieldLabel(`area.${value}`, locale);
  const priceBasis = priceBases.find((basis) => basis === value);
  if (priceBasis && priceBasis !== "asking") return discoveryCopy(locale)[priceBasis];
  if (value === "not_supplied") return discoveryCopy(locale).not_supplied;
  if (
    ["price", "bedrooms", "rooms", "location"].includes(value) ||
    value.startsWith("area.") ||
    value.startsWith("feature.")
  )
    return factFieldLabel(value, locale);
  const labels = workflowCopy(locale, "ownerPreviewValues");
  return labels[value as keyof typeof labels] ?? factFieldLabel(value, locale);
}
