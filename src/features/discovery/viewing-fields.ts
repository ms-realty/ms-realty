// Form field mapping for P13 viewing preferences. The schema itself is the domain contract.
export const viewingWindowFields = [
  {
    start: "viewingStart1",
    end: "viewingEnd1",
    startChoice: "viewingStartChoice1",
    endChoice: "viewingEndChoice1",
  },
  {
    start: "viewingStart2",
    end: "viewingEnd2",
    startChoice: "viewingStartChoice2",
    endChoice: "viewingEndChoice2",
  },
  {
    start: "viewingStart3",
    end: "viewingEnd3",
    startChoice: "viewingStartChoice3",
    endChoice: "viewingEndChoice3",
  },
] as const;
export const emptyViewingValues = {
  viewingFormat: "",
  viewingTimezone: "Europe/Sofia",
  viewingAccessNeeds: "",
  viewingStart1: "",
  viewingEnd1: "",
  viewingStartChoice1: "",
  viewingEndChoice1: "",
  viewingStart2: "",
  viewingEnd2: "",
  viewingStartChoice2: "",
  viewingEndChoice2: "",
  viewingStart3: "",
  viewingEnd3: "",
  viewingStartChoice3: "",
  viewingEndChoice3: "",
};
export function viewingPreferencesFromFields(values: typeof emptyViewingValues) {
  return {
    version: 1 as const,
    provenance: "self_declared" as const,
    format: values.viewingFormat || undefined,
    timezone: values.viewingTimezone,
    // Keep empty earlier slots while a later slot is filled so errors target the original field.
    windows: viewingWindowFields
      .slice(
        0,
        viewingWindowFields.reduce(
          (last, fields, index) =>
            values[fields.start] ||
            values[fields.end] ||
            values[fields.startChoice] ||
            values[fields.endChoice]
              ? index + 1
              : last,
          0,
        ),
      )
      .map((fields) => ({
        startsAtLocal: values[fields.start],
        endsAtLocal: values[fields.end],
        startOccurrence: values[fields.startChoice] || undefined,
        endOccurrence: values[fields.endChoice] || undefined,
      })),
    accessNeeds: values.viewingAccessNeeds || undefined,
  };
}
export function viewingErrorField(path: string) {
  if (path === "viewingPreferences.timezone") return "viewingTimezone";
  if (path === "viewingPreferences.format") return "viewingFormat";
  if (path === "viewingPreferences.accessNeeds") return "viewingAccessNeeds";
  const match =
    /^viewingPreferences\.windows\.(\d+)\.(startsAtLocal|endsAtLocal|startOccurrence|endOccurrence)$/.exec(
      path,
    );
  const fields = match ? viewingWindowFields[Number(match[1])] : undefined;
  if (fields)
    return fields[
      (
        {
          startsAtLocal: "start",
          endsAtLocal: "end",
          startOccurrence: "startChoice",
          endOccurrence: "endChoice",
        } as const
      )[match?.[2] as "startsAtLocal"]
    ];
  return "viewingTimezone";
}

/** Field labels for error summaries and the review list. */
export function viewingFieldLabels(copy: {
  start: string;
  end: string;
  clockChoice: string;
  format: string;
  timezone: string;
  accessNeeds: string;
}) {
  const labels = {
    viewingFormat: copy.format,
    viewingTimezone: copy.timezone,
    viewingAccessNeeds: copy.accessNeeds,
  } as Record<keyof typeof emptyViewingValues, string>;
  viewingWindowFields.forEach((fields, index) => {
    labels[fields.start] = `${copy.start} ${index + 1}`;
    labels[fields.end] = `${copy.end} ${index + 1}`;
    labels[fields.startChoice] = `${copy.clockChoice} ${index + 1}`;
    labels[fields.endChoice] = `${copy.clockChoice} ${index + 1}`;
  });
  return labels;
}
