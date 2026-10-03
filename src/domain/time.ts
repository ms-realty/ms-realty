// Local wall-clock times for appointments and deadlines (architecture §4.2). Instants are
// stored in UTC with the IANA zone that controls them. A local time that does not exist in the
// zone (spring-forward gap) is rejected; one that occurs twice (fall-back) needs a choice.

export type LocalTimeResolution =
  | { readonly outcome: "resolved"; readonly instant: string }
  | { readonly outcome: "nonexistent" }
  | { readonly outcome: "ambiguous"; readonly candidates: readonly [string, string] };

const localPattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

function wallClockAsUtc(instantMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instantMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
}

/**
 * Resolves `local` (YYYY-MM-DDTHH:mm[:ss], no offset) in `timeZone`. Pass `choose` only after
 * the person picked which occurrence of an ambiguous time they meant.
 */
export function resolveLocalTime(
  local: string,
  timeZone: string,
  choose?: "earlier" | "later",
): LocalTimeResolution {
  const match = localPattern.exec(local);
  if (!match) throw new Error(`Not a local date-time: ${local}`);
  const [, y, mo, d, h, mi, s] = match.map(Number) as number[];
  const wall = Date.UTC(y as number, (mo as number) - 1, d, h, mi, s || 0);
  const offsets = new Set(
    [wall - 86_400_000, wall + 86_400_000].map((t) => wallClockAsUtc(t, timeZone) - t),
  );
  const instants = [...offsets]
    .map((offset) => wall - offset)
    .filter((t) => wallClockAsUtc(t, timeZone) === wall)
    .sort((a, b) => a - b)
    .map((t) => new Date(t).toISOString());
  if (instants.length === 0) return { outcome: "nonexistent" };
  const [earlier, later] = instants as [string, string | undefined];
  if (later === undefined) return { outcome: "resolved", instant: earlier };
  if (choose) return { outcome: "resolved", instant: choose === "earlier" ? earlier : later };
  return { outcome: "ambiguous", candidates: [earlier, later] };
}
