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

const localInputPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/;

/** An instant on the zone's wall clock; minute controls retain their existing precision. */
export function localInputValue(
  instant: Date | string | null | undefined,
  timeZone: string,
  precision: "minute" | "second" = "minute",
): string {
  if (instant === null || instant === undefined || instant === "") return "";
  const ms = instant instanceof Date ? instant.getTime() : Date.parse(instant);
  if (!Number.isFinite(ms)) return "";
  return new Date(wallClockAsUtc(ms, timeZone))
    .toISOString()
    .slice(0, precision === "second" ? 19 : 16);
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
      /** The wall time occurs twice and an occurrence was selected. */
      readonly repeated: boolean;
    }
  | { readonly ok: false; readonly reason: LocalInputReason };

/**
 * Reads a `datetime-local` value (YYYY-MM-DDTHH:mm[:ss]) as a wall time in `timeZone`. A time in
 * the spring-forward gap is rejected. A repeated autumn time is rejected where one exact
 * instant is committed (`"reject"`); a visitor's viewing preference takes its first
 * occurrence (`"first"`) and says so, instead of asking the visitor to choose.
 */
export function readLocalInput(
  value: string,
  timeZone: string,
  repeated: "reject" | "first" | "earlier" | "later" = "reject",
): LocalInput {
  const wall = Date.parse(`${value}${value.length === 16 ? ":00" : ""}Z`);
  if (
    !localInputPattern.test(value) ||
    !Number.isFinite(wall) ||
    new Date(wall).toISOString().slice(0, value.length) !== value
  )
    return { ok: false, reason: "invalid_local_time" };
  const resolved = resolveLocalTime(value, timeZone);
  if (resolved.outcome === "nonexistent") return { ok: false, reason: "nonexistent_local_time" };
  if (resolved.outcome === "ambiguous" && repeated === "reject")
    return { ok: false, reason: "ambiguous_local_time" };
  const instant =
    resolved.outcome === "resolved"
      ? resolved.instant
      : resolved.candidates[repeated === "later" ? 1 : 0];
  const minutes = Math.abs(wall - Date.parse(instant)) / 60_000;
  const offset = `${wall < Date.parse(instant) ? "-" : "+"}${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  return { ok: true, instant, offset, repeated: resolved.outcome === "ambiguous" };
}

const explicitInstant =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;

/** A recorded instant can prefill a wall-time control without losing seconds or its fold. */
export function isInstantInput(value: string): boolean {
  if (!explicitInstant.test(value) || !Number.isFinite(Date.parse(value))) return false;
  const wall = value.replace(/(?:Z|[+-]\d{2}:\d{2})$/, "");
  const utcWall = Date.parse(`${wall}Z`);
  const canonical = `${wall.length === 16 ? `${wall}:00` : wall.split(".")[0]}.${(wall.split(".")[1] ?? "").padEnd(3, "0")}Z`;
  return Number.isFinite(utcWall) && new Date(utcWall).toISOString() === canonical;
}

/** Reads the native wall time and its explicit autumn choice. Never guesses an occurrence. */
export function readDateTimeEntry(
  value: string,
  timeZone: string,
  occurrence = "",
  original = "",
): LocalInput {
  if (isInstantInput(value)) {
    const local = localInputValue(value, timeZone, "second");
    const first = readLocalInput(local, timeZone, "earlier");
    if (!first.ok) return first;
    const later = readLocalInput(local, timeZone, "later");
    const originalSecond = Math.floor(Date.parse(value) / 1000);
    const resolved =
      later.ok && Math.floor(Date.parse(later.instant) / 1000) === originalSecond ? later : first;
    return { ...resolved, instant: new Date(value).toISOString() };
  }
  if (occurrence && occurrence !== "earlier" && occurrence !== "later")
    return { ok: false, reason: "invalid_local_time" };
  const read = readLocalInput(
    value,
    timeZone,
    occurrence === "earlier" || occurrence === "later" ? occurrence : "reject",
  );
  if (!read.ok) return read;
  const precision = value.length === 19 ? "second" : "minute";
  const unit = precision === "second" ? 1000 : 60_000;
  // An unchanged prefill keeps finer precision. An edited second or occurrence never keeps it.
  if (
    isInstantInput(original) &&
    localInputValue(original, timeZone, precision) === value &&
    Math.floor(Date.parse(original) / unit) === Math.floor(Date.parse(read.instant) / unit)
  )
    return { ...read, instant: new Date(original).toISOString() };
  return read;
}

/** Offset form for appointment/proposal contracts, whose zone remains Europe/Sofia. */
export function offsetInputValue(value: string, timeZone: string): string {
  const read = readDateTimeEntry(value, timeZone);
  return read.ok && Date.parse(read.instant) % 60_000 === 0
    ? `${localInputValue(read.instant, timeZone)}${read.offset}`
    : "";
}
