// O24/AT14: reviewed local calendars and immutable policy context, never inferred staffing.
import { z } from "zod";

export const operatingPolicyId = "00000000-0000-4000-8000-000000000024";
export const policyWeekdays = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const day = z
  .string()
  .regex(/^20\d{2}-\d{2}-\d{2}$/)
  .refine((v) => {
    const instant = new Date(`${v}T00:00:00Z`);
    return Number.isFinite(instant.getTime()) && instant.toISOString().slice(0, 10) === v;
  });
const clock = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const endClock = z.string().regex(/^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/);
const interval = z.tuple([clock, endClock]).refine(([start, end]) => start < end);
const intervals = z
  .array(interval)
  .max(8)
  .refine((rows) => rows.every((row, i) => i === 0 || (rows[i - 1]?.[1] ?? "") <= row[0]));
const optionalReference = z.string().trim().min(3).max(1500).nullable();
const optionalOwner = z.uuid().nullable();
export const serviceCalendarSchema = z
  .object({
    kind: z.literal("reviewed_calendar_v1"),
    timezone: z.literal("Europe/Sofia"),
    validFrom: day,
    validUntil: day,
    // [] is explicitly closed; null is unknown. Every weekday must be stated.
    weekly: z.object({
      mon: intervals.nullable(),
      tue: intervals.nullable(),
      wed: intervals.nullable(),
      thu: intervals.nullable(),
      fri: intervals.nullable(),
      sat: intervals.nullable(),
      sun: intervals.nullable(),
    }),
    exceptions: z
      .array(
        z.object({
          date: day,
          intervals: intervals.nullable(),
          reason: z.string().trim().min(3).max(300),
        }),
      )
      .max(400),
    sourceReference: z.string().trim().min(3).max(1500),
  })
  .superRefine((calendar, ctx) => {
    if (calendar.validFrom > calendar.validUntil)
      ctx.addIssue({ code: "custom", path: ["validUntil"], message: "invalid_calendar_bounds" });
    const seen = new Set<string>();
    for (const [i, exception] of calendar.exceptions.entries()) {
      if (
        seen.has(exception.date) ||
        exception.date < calendar.validFrom ||
        exception.date > calendar.validUntil
      )
        ctx.addIssue({
          code: "custom",
          path: ["exceptions", i],
          message: "invalid_calendar_exception",
        });
      seen.add(exception.date);
    }
  });
export type ServiceCalendar = z.infer<typeof serviceCalendarSchema>;

export const operatingPolicySchema = z.object({
  kind: z.literal("agency_operating_policy_v1"),
  serviceCalendar: serviceCalendarSchema.nullable(),
  coverage: optionalReference,
  responsibilities: z.object({
    service: optionalOwner,
    privacy: optionalOwner,
    alerts: optionalOwner,
  }),
  contactPurposes: z.object({
    service: optionalReference,
    savedSearch: optionalReference,
    marketing: optionalReference,
  }),
  retentionReference: optionalReference,
  vendorReference: optionalReference,
  processReference: optionalReference,
  alertReference: optionalReference,
  availabilityReviewDays: z.object({
    sale: z.number().int().min(1).max(14).nullable(),
    long_term_rent: z.number().int().min(1).max(7).nullable(),
  }),
});
export type OperatingPolicy = z.infer<typeof operatingPolicySchema>;
export const emptyOperatingPolicy: OperatingPolicy = {
  kind: "agency_operating_policy_v1",
  serviceCalendar: null,
  coverage: null,
  responsibilities: { service: null, privacy: null, alerts: null },
  contactPurposes: { service: null, savedSearch: null, marketing: null },
  retentionReference: null,
  vendorReference: null,
  processReference: null,
  alertReference: null,
  availabilityReviewDays: { sale: null, long_term_rent: null },
};
const approvedSnapshot = z.object({
  kind: z.literal("approved_operating_policy_v1"),
  policyId: z.uuid(),
  policyVersion: z.number().int().positive(),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  approvedAt: z.iso.datetime(),
  document: operatingPolicySchema,
});
export type ApprovedOperatingPolicySnapshot = z.infer<typeof approvedSnapshot>;
export type OperatingPolicySnapshot =
  | ApprovedOperatingPolicySnapshot
  | {
      kind: "operating_policy_unknown_v1";
      reason: "no_reviewed_policy" | "legacy_policy" | "invalid_reviewed_policy";
    };
export function readOperatingPolicySnapshot(
  value: unknown,
): ApprovedOperatingPolicySnapshot | null {
  const parsed = approvedSnapshot.safeParse(value);
  return parsed.success ? parsed.data : null;
}

const hourMs = 3600000;
const formatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Sofia",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
  weekday: "short",
});
export type StaffedDuration =
  | { status: "known"; milliseconds: number; policyId: string; policyVersion: number }
  | {
      status: "unknown";
      reason:
        | "no_reviewed_policy"
        | "calendar_unknown"
        | "outside_reviewed_calendar"
        | "unknown_day"
        | "invalid_interval"
        | "interval_too_large";
    };

/** UTC-hour slices preserve elapsed time through Sofia's skipped/repeated DST hours.
 * Local intervals are half-open; closed days count zero and unknown days never count zero.
 * The bounded reader does not turn a duration into a public SLA or a legal deadline. */
export function staffedDuration(value: unknown, start: Date, end: Date): StaffedDuration {
  const snapshot = readOperatingPolicySnapshot(value);
  if (!snapshot) return { status: "unknown", reason: "no_reviewed_policy" };
  const result = calendarStaffedDuration(snapshot.document.serviceCalendar, start, end);
  return result.status === "known"
    ? { ...result, policyId: snapshot.policyId, policyVersion: snapshot.policyVersion }
    : result;
}

export function calendarStaffedDuration(
  value: unknown,
  start: Date,
  end: Date,
): { status: "known"; milliseconds: number } | Extract<StaffedDuration, { status: "unknown" }> {
  const parsed = serviceCalendarSchema.safeParse(value);
  if (!parsed.success) return { status: "unknown", reason: "calendar_unknown" };
  const calendar = parsed.data;
  const from = start.getTime(),
    until = end.getTime();
  if (!Number.isFinite(from) || !Number.isFinite(until) || from > until)
    return { status: "unknown", reason: "invalid_interval" };
  if (until - from > 366 * 24 * hourMs) return { status: "unknown", reason: "interval_too_large" };
  const parts = (instant: number) =>
    Object.fromEntries(
      formatter.formatToParts(new Date(instant)).map(({ type, value }) => [type, value]),
    );
  const localDate = (p: Record<string, string>) => `${p.year}-${p.month}-${p.day}`;
  if (
    localDate(parts(from)) < calendar.validFrom ||
    localDate(parts(Math.max(from, until - 1))) > calendar.validUntil
  )
    return { status: "unknown", reason: "outside_reviewed_calendar" };
  let milliseconds = 0;
  const exceptions = new Map(
    calendar.exceptions.map((exception) => [exception.date, exception.intervals]),
  );
  for (let hour = Math.floor(from / hourMs) * hourMs; hour < until; hour += hourMs) {
    const p = parts(hour),
      date = localDate(p),
      weekday = p.weekday?.toLowerCase() as (typeof policyWeekdays)[number];
    const windows = exceptions.has(date) ? exceptions.get(date) : calendar.weekly[weekday];
    if (!windows) return { status: "unknown", reason: "unknown_day" };
    const localHour = Number(p.hour) * hourMs;
    for (const [first, last] of windows) {
      const clockMs = (time: string) =>
        Number(time.slice(0, 2)) * hourMs + Number(time.slice(3)) * 60000;
      const a = hour + Math.max(0, clockMs(first) - localHour),
        b = hour + Math.min(hourMs, clockMs(last) - localHour);
      milliseconds += Math.max(0, Math.min(until, b) - Math.max(from, a));
    }
  }
  return { status: "known", milliseconds };
}

export function policyEffects(document: OperatingPolicy) {
  return {
    staffedTiming:
      document.serviceCalendar !== null &&
      policyWeekdays.every((day) => document.serviceCalendar?.weekly[day] !== null),
    coverage: document.coverage !== null && document.responsibilities.service !== null,
    serviceContact:
      document.contactPurposes.service !== null &&
      document.retentionReference !== null &&
      document.vendorReference !== null &&
      document.responsibilities.privacy !== null,
    savedSearch:
      document.contactPurposes.savedSearch !== null &&
      document.alertReference !== null &&
      document.responsibilities.alerts !== null,
    marketing: document.contactPurposes.marketing !== null,
  };
}
