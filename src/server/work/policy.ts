// Service policy readings for the work surfaces (spec F19, O24, A58). Nothing is guessed: an
// unconfigured or unreadable policy yields null, never an assumed opening time or promise.
import "server-only";
import { fromDate, toCalendarDate, toZoned } from "@internationalized/date";
import { asc } from "drizzle-orm";
import { servicePolicies } from "@/db/schema";
import type { Executor } from "../db";
import { AppError } from "../errors";
import type { OfficeStatus } from "./types";

export interface ServicePolicy {
  readonly id: string;
  readonly effectiveFrom: Date;
  readonly timezone: string;
  readonly serviceHours: unknown;
  readonly responsePolicy: unknown;
}

export async function loadServicePolicies(db: Executor): Promise<ServicePolicy[]> {
  return db
    .select({
      id: servicePolicies.id,
      effectiveFrom: servicePolicies.effectiveFrom,
      timezone: servicePolicies.timezone,
      serviceHours: servicePolicies.serviceHours,
      responsePolicy: servicePolicies.responsePolicy,
    })
    .from(servicePolicies)
    .orderBy(asc(servicePolicies.effectiveFrom));
}

/** The policy in force at `at`; a promise keeps the version it was made under (A58). */
export function policyAt(policies: readonly ServicePolicy[], at: Date): ServicePolicy | null {
  let found: ServicePolicy | null = null;
  for (const policy of policies) if (policy.effectiveFrom <= at) found = policy;
  return found;
}

export function assertTimeZone(timeZone: string): void {
  try {
    new Intl.DateTimeFormat("en", { timeZone });
  } catch {
    throw new AppError("validation_failed", { fieldErrors: { timeZone: ["invalid_time_zone"] } });
  }
}

/** Start and end (exclusive) of the calendar day containing `now` in `timeZone`. */
export function dayBounds(now: Date, timeZone: string): { start: Date; end: Date } {
  const day = toCalendarDate(fromDate(now, timeZone));
  return {
    start: toZoned(day, timeZone).toDate(),
    end: toZoned(day.add({ days: 1 }), timeZone).toDate(),
  };
}

const weekdays = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const clock = /^([01]\d|2[0-4]):([0-5]\d)$/;

function minutesOf(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = clock.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/**
 * Whether the office is open at `now` under `serviceHours`, shaped as
 * `{ mon: ["09:00", "18:00"] | [["09:00", "12:00"], ["13:00", "18:00"]], …, holidays: ["2026-12-25"] }`.
 * A missing weekday is closed; any value that cannot be read makes the answer unknown (null).
 */
export function officeStatus(serviceHours: unknown, timezone: string, now: Date): boolean | null {
  if (!serviceHours || typeof serviceHours !== "object" || Array.isArray(serviceHours)) return null;
  const hours = serviceHours as Record<string, unknown>;
  let local: ReturnType<typeof fromDate>;
  try {
    local = fromDate(now, timezone);
  } catch {
    return null;
  }
  const holidays = hours.holidays;
  if (holidays !== undefined && !Array.isArray(holidays)) return null;
  if (holidays?.includes(toCalendarDate(local).toString())) return false;

  const day = hours[weekdays[dayIndex(local)] as string];
  if (day === undefined || day === null) return false;
  if (!Array.isArray(day)) return null;
  const ranges = Array.isArray(day[0]) ? day : [day];
  const minute = local.hour * 60 + local.minute;
  let open = false;
  for (const range of ranges) {
    if (!Array.isArray(range) || range.length !== 2) return null;
    const from = minutesOf(range[0]);
    const to = minutesOf(range[1]);
    if (from === null || to === null) return null;
    if (minute >= from && minute < to) open = true;
  }
  return open;
}

/** 0 = Sunday, of the local calendar date. */
function dayIndex(local: ReturnType<typeof fromDate>): number {
  return new Date(Date.UTC(local.year, local.month - 1, local.day)).getUTCDay();
}

export function officeAt(policies: readonly ServicePolicy[], now: Date): OfficeStatus | null {
  const policy = policyAt(policies, now);
  if (!policy) return null;
  const open = officeStatus(policy.serviceHours, policy.timezone, now);
  return open === null ? null : { open, timezone: policy.timezone };
}

/**
 * First-response promise under `responsePolicy.firstResponseHours`. Other rule shapes (such as
 * "next business period") are not interpreted here, so the promise stays unknown (null).
 */
export function firstResponseDueAt(
  policies: readonly ServicePolicy[],
  receivedAt: Date,
): Date | null {
  const policy = policyAt(policies, receivedAt);
  const rules = policy?.responsePolicy as { firstResponseHours?: unknown } | null | undefined;
  const hours = rules?.firstResponseHours;
  if (typeof hours !== "number" || !Number.isFinite(hours) || hours <= 0) return null;
  return new Date(receivedAt.getTime() + hours * 3_600_000);
}
