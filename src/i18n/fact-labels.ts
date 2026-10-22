import { discoveryCopy } from "@/features/discovery/copy";
import { intentCopy } from "@/features/discovery/intent-copy";
import { defaultLocale, isPublicLocale } from "./config";
import { workflowCopy } from "./workflow-copy";

/** Only catalogued fact keys get a meaning; unknown keys remain available in technical details. */
export function factFieldLabel(key: string, requested: string): string {
  const locale = isPublicLocale(requested) ? requested : defaultLocale;
  const copy = discoveryCopy(locale);
  const extra = intentCopy(locale);
  const labels: Record<string, string> = {
    price: extra.amount,
    bedrooms: copy.bedrooms,
    rooms: extra.rooms,
    area: copy.area,
    location: extra.locations,
    propertyType: copy.propertyType,
    purpose: copy.purpose,
    "area.living": copy.living,
    "area.usable": copy.usable,
    "area.built": copy.built,
    "area.gross_floor": copy.gross_floor,
    "area.total": copy.total,
    "area.land": copy.land,
    "feature.lift": extra.lift,
    "feature.parking": extra.parking,
    "feature.garden": extra.garden,
    "feature.pool": extra.pool,
    "feature.furnished": extra.furnished,
    "feature.step_free_access": workflowCopy(locale, "factLabels").stepFree,
  };
  return (
    (Object.hasOwn(labels, key) ? labels[key] : undefined) ??
    workflowCopy(locale, "factLabels").additional
  );
}
