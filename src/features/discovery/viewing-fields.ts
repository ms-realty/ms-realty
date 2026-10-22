// Form field mapping for P13 viewing preferences. The schema itself is the domain contract.
// Visitors enter wall times on the agency's clock (M-065): they never type a zone name or pick
// a daylight-saving occurrence. A time in the repeated autumn hour takes its first occurrence,
// recorded explicitly so the stored preference and its review say what was understood.
import { resolveLocalTime } from "@/domain/time";
import { agencyTimeZone } from "@/i18n/config";

export const viewingWindowFields = [
  { start: "viewingStart1", end: "viewingEnd1" },
  { start: "viewingStart2", end: "viewingEnd2" },
  { start: "viewingStart3", end: "viewingEnd3" },
] as const;
export const emptyViewingValues = {
  viewingFormat: "",
  viewingAccessNeeds: "",
  viewingStart1: "",
  viewingEnd1: "",
  viewingStart2: "",
  viewingEnd2: "",
  viewingStart3: "",
  viewingEnd3: "",
};

/** "earlier" only for a wall time that happens twice; malformed input is left to the schema. */
function firstOccurrence(local: string) {
  try {
    return resolveLocalTime(local, agencyTimeZone).outcome === "ambiguous"
      ? ("earlier" as const)
      : undefined;
  } catch {
    return undefined;
  }
}

export function viewingPreferencesFromFields(values: typeof emptyViewingValues) {
  return {
    version: 1 as const,
    provenance: "self_declared" as const,
    format: values.viewingFormat || undefined,
    timezone: agencyTimeZone,
    // Keep empty earlier slots while a later slot is filled so errors target the original field.
    windows: viewingWindowFields
      .slice(
        0,
        viewingWindowFields.reduce(
          (last, fields, index) => (values[fields.start] || values[fields.end] ? index + 1 : last),
          0,
        ),
      )
      .map((fields) => ({
        startsAtLocal: values[fields.start],
        endsAtLocal: values[fields.end],
        startOccurrence: firstOccurrence(values[fields.start]),
        endOccurrence: firstOccurrence(values[fields.end]),
      })),
    accessNeeds: values.viewingAccessNeeds || undefined,
  };
}

export function viewingErrorField(path: string) {
  if (path === "viewingPreferences.format") return "viewingFormat";
  if (path === "viewingPreferences.accessNeeds") return "viewingAccessNeeds";
  const match =
    /^viewingPreferences\.windows\.(\d+)\.(startsAtLocal|endsAtLocal|startOccurrence|endOccurrence)$/.exec(
      path,
    );
  const fields = match ? viewingWindowFields[Number(match[1])] : undefined;
  if (fields) return /^start/.test(match?.[2] ?? "") ? fields.start : fields.end;
  // The zone is the agency's and not a visitor field; anything else belongs to the first window.
  return viewingWindowFields[0].start;
}

/** Field labels for error summaries and the review list. */
export function viewingFieldLabels(copy: {
  start: string;
  end: string;
  format: string;
  accessNeeds: string;
}) {
  const labels = {
    viewingFormat: copy.format,
    viewingAccessNeeds: copy.accessNeeds,
  } as Record<keyof typeof emptyViewingValues, string>;
  viewingWindowFields.forEach((fields, index) => {
    labels[fields.start] = `${copy.start} ${index + 1}`;
    labels[fields.end] = `${copy.end} ${index + 1}`;
  });
  return labels;
}
