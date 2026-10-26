import { z } from "zod";
import { type OperatingPolicy, operatingPolicySchema, policyWeekdays } from "./operating-policy";

const basePolicyFormFields = [
  "calendarState",
  "validFrom",
  "validUntil",
  "calendarSource",
  "exceptions",
  "coverage",
  "ownerService",
  "ownerPrivacy",
  "ownerAlerts",
  "purposeService",
  "purposeSavedSearch",
  "purposeMarketing",
  "retentionReference",
  "vendorReference",
  "processReference",
  "alertReference",
  "daysSales",
  "daysRent",
] as const;
type Weekday = (typeof policyWeekdays)[number];
export type PolicyFormField = (typeof basePolicyFormFields)[number] | Weekday | `${Weekday}State`;
export const policyFormFields: readonly PolicyFormField[] = [
  ...basePolicyFormFields,
  ...policyWeekdays.flatMap((day): PolicyFormField[] => [day, `${day}State`]),
];
export type PolicyFormValues = Record<PolicyFormField, string>;
const optional = (value: string) => value.trim() || null;
const number = (value: string) => (value.trim() === "" ? null : Number(value));
const intervals = (value: string) => value.split(",").map((entry) => entry.trim().split("-"));
export function policyFromValues(values: PolicyFormValues): OperatingPolicy {
  z.enum(["", "reviewed"]).parse(values.calendarState);
  for (const day of policyWeekdays) z.enum(["", "closed", "open"]).parse(values[`${day}State`]);
  const calendar =
    values.calendarState === "reviewed"
      ? {
          kind: "reviewed_calendar_v1",
          timezone: "Europe/Sofia",
          validFrom: values.validFrom,
          validUntil: values.validUntil,
          sourceReference: values.calendarSource,
          weekly: Object.fromEntries(
            policyWeekdays.map((day) => [
              day,
              values[`${day}State`] === "closed"
                ? []
                : values[`${day}State`] === "open"
                  ? intervals(values[day])
                  : null,
            ]),
          ),
          exceptions: values.exceptions.trim()
            ? values.exceptions
                .trim()
                .split("\n")
                .map((line) => {
                  const [date = "", windows = "", ...reason] = line
                    .split("|")
                    .map((part) => part.trim());
                  return {
                    date,
                    intervals: windows === "—" ? [] : windows === "?" ? null : intervals(windows),
                    reason: reason.join(" | "),
                  };
                })
            : [],
        }
      : null;
  return operatingPolicySchema.parse({
    kind: "agency_operating_policy_v1",
    serviceCalendar: calendar,
    coverage: optional(values.coverage),
    responsibilities: {
      service: optional(values.ownerService),
      privacy: optional(values.ownerPrivacy),
      alerts: optional(values.ownerAlerts),
    },
    contactPurposes: {
      service: optional(values.purposeService),
      savedSearch: optional(values.purposeSavedSearch),
      marketing: optional(values.purposeMarketing),
    },
    retentionReference: optional(values.retentionReference),
    vendorReference: optional(values.vendorReference),
    processReference: optional(values.processReference),
    alertReference: optional(values.alertReference),
    availabilityReviewDays: {
      sale: number(values.daysSales),
      long_term_rent: number(values.daysRent),
    },
  });
}
export function policyToValues(document: OperatingPolicy): PolicyFormValues {
  const calendar = document.serviceCalendar;
  return {
    calendarState: calendar ? "reviewed" : "",
    validFrom: calendar?.validFrom ?? "",
    validUntil: calendar?.validUntil ?? "",
    calendarSource: calendar?.sourceReference ?? "",
    exceptions:
      calendar?.exceptions
        .map(
          (row) =>
            `${row.date} | ${row.intervals === null ? "?" : !row.intervals.length ? "—" : row.intervals.map((pair) => pair.join("-")).join(",")} | ${row.reason}`,
        )
        .join("\n") ?? "",
    ...Object.fromEntries(
      policyWeekdays.flatMap((day) => {
        const windows = calendar?.weekly[day];
        return [
          [day, windows?.map((pair) => pair.join("-")).join(",") ?? ""],
          [`${day}State`, windows == null ? "" : windows.length ? "open" : "closed"],
        ];
      }),
    ),
    coverage: document.coverage ?? "",
    ownerService: document.responsibilities.service ?? "",
    ownerPrivacy: document.responsibilities.privacy ?? "",
    ownerAlerts: document.responsibilities.alerts ?? "",
    purposeService: document.contactPurposes.service ?? "",
    purposeSavedSearch: document.contactPurposes.savedSearch ?? "",
    purposeMarketing: document.contactPurposes.marketing ?? "",
    retentionReference: document.retentionReference ?? "",
    vendorReference: document.vendorReference ?? "",
    processReference: document.processReference ?? "",
    alertReference: document.alertReference ?? "",
    daysSales: document.availabilityReviewDays.sale?.toString() ?? "",
    daysRent: document.availabilityReviewDays.long_term_rent?.toString() ?? "",
  } as PolicyFormValues;
}
