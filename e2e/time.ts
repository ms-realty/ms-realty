import type { Locator } from "@playwright/test";

/** Test inputs start from an explicit instant, independently of the application's reader. */
export function agencyWallTime(instant: Date | string, precision: "minute" | "second" = "minute") {
  if (typeof instant === "string" && !/(?:Z|[+-]\d{2}:\d{2})$/.test(instant))
    throw new Error("An explicit test instant is required");
  const date = instant instanceof Date ? instant : new Date(instant);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Sofia",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const part = (name: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === name)?.value;
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}${precision === "second" ? `:${part("second")}` : ""}`;
}

/** Use the same person-visible choice with or without hydration when an hour repeats. */
export async function fillAgencyInstant(
  input: Locator,
  instant: Date | string,
  precision: "minute" | "second" = "minute",
) {
  const date = instant instanceof Date ? instant : new Date(instant);
  const value = agencyWallTime(instant, precision);
  // Native inputs omit zero seconds; Playwright requires that canonical form.
  await input.fill(precision === "second" && value.endsWith(":00") ? value.slice(0, -3) : value);
  const wall = agencyWallTime(date, "second");
  const occurrence =
    agencyWallTime(new Date(date.getTime() - 3_600_000), "second") === wall
      ? "later"
      : agencyWallTime(new Date(date.getTime() + 3_600_000), "second") === wall
        ? "earlier"
        : "";
  if (!occurrence) return;
  // The choice appears only once the entered time is in the repeated hour (after hydration;
  // without JavaScript the server asks for it after the first post).
  await input.locator("xpath=..").locator('select[name$="Occurrence"]').selectOption(occurrence);
}
