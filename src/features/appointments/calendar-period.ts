export const calendarZones = [
  "Europe/Sofia",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Moscow",
  "America/New_York",
  "Asia/Jerusalem",
  "UTC",
] as const;
export type CalendarZone = (typeof calendarZones)[number];
export type CalendarView = "agenda" | "day" | "week";
export type CalendarScope = "team" | "mine";
export type CalendarSearch = Record<string, string | string[] | undefined>;
export type CalendarQuery = {
  date: string;
  view: CalendarView;
  zone: CalendarZone;
  scope: CalendarScope;
  page: number;
  requestPage: number;
};

const dayFormats = new Map<string, Intl.DateTimeFormat>();
export function calendarDay(at: Date, zone: string) {
  let formatter = dayFormats.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    dayFormats.set(zone, formatter);
  }
  const parts = Object.fromEntries(formatter.formatToParts(at).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function validCalendarDay(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^(20\d{2})-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(new Date(`${value}T12:00:00Z`).getTime()) &&
    new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value
  );
}
export function shiftCalendarDay(day: string, amount: number) {
  const at = new Date(`${day}T12:00:00Z`);
  at.setUTCDate(at.getUTCDate() + amount);
  return at.toISOString().slice(0, 10);
}

/** Find the actual start of a civil day, including a DST-shortened or repeated day. */
function dayBoundary(day: string, zone: CalendarZone) {
  const nominal = new Date(`${day}T00:00:00Z`).getTime();
  let lower = nominal - 36 * 3600000;
  let upper = nominal + 36 * 3600000;
  while (lower < upper) {
    const middle = Math.floor((lower + upper) / 2);
    if (calendarDay(new Date(middle), zone) < day) lower = middle + 1;
    else upper = middle;
  }
  return new Date(lower);
}

export function calendarPeriod(query: CalendarQuery) {
  const weekday = new Date(`${query.date}T12:00:00Z`).getUTCDay();
  const first =
    query.view === "week" ? shiftCalendarDay(query.date, -((weekday + 6) % 7)) : query.date;
  const length = query.view === "day" ? 1 : 7;
  const days = Array.from({ length }, (_, index) => shiftCalendarDay(first, index));
  return {
    days,
    first,
    last: days[days.length - 1] as string,
    start: dayBoundary(first, query.zone),
    end: dayBoundary(shiftCalendarDay(first, length), query.zone),
  };
}

export function parseCalendarQuery(raw: CalendarSearch = {}, now = new Date()) {
  let adjusted = false;
  const pick = <T extends string>(name: string, values: readonly T[], fallback: T): T => {
    const value = raw[name];
    if (value === undefined) return fallback;
    if (typeof value === "string" && values.includes(value as T)) return value as T;
    adjusted = true;
    return fallback;
  };
  const zone = pick("zone", calendarZones, "Europe/Sofia");
  const page = (name: string) => {
    const value = raw[name];
    if (value === undefined) return 1;
    if (typeof value === "string" && /^[1-9]\d{0,3}$/.test(value)) return Number(value);
    adjusted = true;
    return 1;
  };
  const date = validCalendarDay(raw.date) ? raw.date : calendarDay(now, zone);
  if (raw.date !== undefined && !validCalendarDay(raw.date)) adjusted = true;
  const query: CalendarQuery = {
    date,
    zone,
    view: pick("view", ["agenda", "day", "week"], "agenda"),
    scope: pick("scope", ["team", "mine"], "team"),
    page: page("page"),
    requestPage: page("requestPage"),
  };
  return { query, adjusted };
}

export function calendarHref(
  locale: string,
  query: CalendarQuery,
  changes: Partial<CalendarQuery> = {},
) {
  const selected = { ...query, ...changes };
  const params = new URLSearchParams({
    date: selected.date,
    view: selected.view,
    zone: selected.zone,
    scope: selected.scope,
  });
  if (selected.page > 1) params.set("page", String(selected.page));
  if (selected.requestPage > 1) params.set("requestPage", String(selected.requestPage));
  return `/${locale}/calendar?${params}`;
}
