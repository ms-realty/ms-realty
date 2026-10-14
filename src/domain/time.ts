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

const localMinute = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/** The minute an instant shows on a wall clock in `timeZone`, as a `datetime-local` value. */
export function localInputValue(
  instant: Date | string | null | undefined,
  timeZone: string,
): string {
  if (instant === null || instant === undefined || instant === "") return "";
  const ms = instant instanceof Date ? instant.getTime() : Date.parse(instant);
  if (!Number.isFinite(ms)) return "";
  return new Date(wallClockAsUtc(ms, timeZone)).toISOString().slice(0, 16);
}

export type LocalInputReason =
  | "invalid_local_time"
  | "nonexistent_local_time"
  | "ambiguous_local_time";

export type LocalInput =
  | {
      readonly ok: true;
      /** The UTC instant to store. */
      readonly instant: string;
      /** The zone's offset at that instant, such as "+03:00". */
      readonly offset: string;
      /** The wall time occurs twice; its first occurrence was taken. */
      readonly repeated: boolean;
    }
  | { readonly ok: false; readonly reason: LocalInputReason };

/**
 * Reads a `datetime-local` value (YYYY-MM-DDTHH:mm) as a wall time in `timeZone`. A time in
 * the spring-forward gap is rejected. A repeated autumn time is rejected where one exact
 * instant is committed (`"reject"`); a visitor's viewing preference takes its first
 * occurrence (`"first"`) and says so, instead of asking the visitor to choose.
 */
export function readLocalInput(
  value: string,
  timeZone: string,
  repeated: "reject" | "first" = "reject",
): LocalInput {
  const wall = Date.parse(`${value}:00Z`);
  if (
    !localMinute.test(value) ||
    !Number.isFinite(wall) ||
    new Date(wall).toISOString().slice(0, 16) !== value
  )
    return { ok: false, reason: "invalid_local_time" };
  const resolved = resolveLocalTime(value, timeZone);
  if (resolved.outcome === "nonexistent") return { ok: false, reason: "nonexistent_local_time" };
  if (resolved.outcome === "ambiguous" && repeated === "reject")
    return { ok: false, reason: "ambiguous_local_time" };
  const instant = resolved.outcome === "resolved" ? resolved.instant : resolved.candidates[0];
  const minutes = Math.abs(wall - Date.parse(instant)) / 60_000;
  const offset = `${wall < Date.parse(instant) ? "-" : "+"}${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  return { ok: true, instant, offset, repeated: resolved.outcome === "ambiguous" };
}
