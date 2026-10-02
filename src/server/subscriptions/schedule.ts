import type { AlertFrequency } from "@/domain/subscription";

/** Calendar buckets, not 24/168-hour durations: DST never creates an extra digest. */
export function alertPeriod(now: Date, timezone: string, frequency: AlertFrequency): string {
  if (!Number.isFinite(now.getTime())) throw new Error("Invalid alert instant");
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (kind: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === kind)?.value;
  const date = `${part("year")}-${part("month")}-${part("day")}`;
  if (frequency === "daily") return `day:${date}`;
  // Interpret the already-local calendar date in UTC only for calendar arithmetic.
  const monday = new Date(`${date}T00:00:00Z`);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  return `week:${monday.toISOString().slice(0, 10)}`;
}
