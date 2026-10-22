// Locale formatting (ux-spec §19.3). Display formats follow the route locale's regional tag
// (displayLocales); the source fact never changes. Dates are instants shown in an explicit time
// zone (agency default Europe/Sofia), never the server's or the browser's, and never as a raw
// zone id, "UTC", an offset or ISO text: the machine value belongs in `<time dateTime>`.
import { type CurrencyCode, currencyMinorDigits, type PublicLocale } from "@/domain/ids";
import { localInputValue, resolveLocalTime } from "@/domain/time";
import { agencyTimeZone, displayLocale } from "./config";
import { timeCopy, zoneWordsFor } from "./time-copy";

type Instant = Date | string | number;

// Catalogue cards repeatedly use the same immutable formatter configuration. Cache only
// formatters, never values or rendered customer data; bound caller-supplied time-zone keys.
const moneyFormats = new Map<string, Intl.NumberFormat>();
const numberFormats = new Map<string, Intl.NumberFormat>();
const dateTimeFormats = new Map<string, Intl.DateTimeFormat>();
function reuse<T>(cache: Map<string, T>, key: string, create: () => T): T {
  const existing = cache.get(key);
  if (existing) return existing;
  const value = create();
  if (cache.size >= 128) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, value);
  return value;
}

function toDate(value: Instant): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new RangeError(`Invalid instant: ${String(value)}`);
  return date;
}

/** Formats integer minor units in their source currency; never converts between currencies. */
export function formatMoney(
  locale: PublicLocale,
  amountMinor: number,
  currency: CurrencyCode,
): string {
  if (!Number.isSafeInteger(amountMinor)) {
    throw new RangeError(`Money must be integer minor units: ${amountMinor}`);
  }
  const digits = currencyMinorDigits[currency];
  const whole = amountMinor % 10 ** digits === 0;
  return reuse(
    moneyFormats,
    JSON.stringify([locale, currency, whole]),
    () =>
      new Intl.NumberFormat(displayLocale(locale), {
        style: "currency",
        currency,
        minimumFractionDigits: whole ? 0 : digits,
        maximumFractionDigits: digits,
      }),
  ).format(amountMinor / 10 ** digits);
}

/** The calendar year in the agency's time zone, not the server's (e.g. for the footer). */
export function agencyYear(at: Instant = new Date()): number {
  return yearIn(toDate(at), agencyTimeZone);
}

export function formatNumber(
  locale: PublicLocale,
  value: number,
  options?: Intl.NumberFormatOptions,
): string {
  // Explicit caller options retain Intl's complete behavior, including inherited/getter
  // values and validation. Only the fixed application-owned configurations are reused.
  if (options !== undefined)
    return new Intl.NumberFormat(displayLocale(locale), options).format(value);
  return reuse(
    numberFormats,
    JSON.stringify([locale, "number"]),
    () => new Intl.NumberFormat(displayLocale(locale)),
  ).format(value);
}

/** Square metres; the unit symbol is the same in every supported locale. */
export function formatArea(locale: PublicLocale, squareMetres: number): string {
  const formatted = reuse(
    numberFormats,
    JSON.stringify([locale, "area"]),
    () => new Intl.NumberFormat(displayLocale(locale), { maximumFractionDigits: 1 }),
  ).format(squareMetres);
  return `${formatted}\u00a0m²`;
}

/** Public source facts retain the existing 20-digit configuration, separate from rounded area. */
export function formatExactArea(locale: PublicLocale, squareMetres: number): string {
  const formatted = reuse(
    numberFormats,
    JSON.stringify([locale, "exact-area"]),
    () => new Intl.NumberFormat(displayLocale(locale), { maximumFractionDigits: 20 }),
  ).format(squareMetres);
  return `${formatted}\u00a0m²`;
}

export interface ZonedOptions {
  /** IANA zone the instant is read in; defaults to the agency's. It is never printed raw. */
  readonly timeZone?: string;
}

export interface InstantOptions extends ZonedOptions {
  /** Contact observations can be entered and read back to the second. */
  readonly seconds?: boolean;
  /**
   * Adds the zone in words, «(софийско време)», for a reader who could be somewhere else:
   * visitors and clients reading an appointment or a deadline, or staff reading a time kept in a
   * zone other than the agency's. Staff read agency times without it.
   */
  readonly zoneLabel?: boolean;
  /** When the text is read: an instant in the same calendar year omits the year (default now). */
  readonly now?: Instant;
}

const datePart = { day: "numeric", month: "long" } as const;
const timePart = { hour: "2-digit", minute: "2-digit" } as const;

function dateTimeFormat(
  locale: PublicLocale,
  timeZone: string,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  return reuse(
    dateTimeFormats,
    JSON.stringify([locale, timeZone, options]),
    () => new Intl.DateTimeFormat(displayLocale(locale), { ...options, timeZone }),
  );
}

function yearIn(date: Date, timeZone: string): number {
  return Number(dateTimeFormat("en", timeZone, { year: "numeric" }).format(date));
}

function yearUnlessCurrent(dates: readonly Date[], now: Instant | undefined, timeZone: string) {
  const current = yearIn(now === undefined ? new Date() : toDate(now), timeZone);
  return dates.some((date) => yearIn(date, timeZone) !== current)
    ? ({ year: "numeric" } as const)
    : {};
}

function named(locale: PublicLocale, text: string, timeZone: string, zoneLabel: boolean) {
  return zoneLabel ? `${text} (${timeZoneLabel(locale, timeZone)})` : text;
}

function occurrenceWords(locale: PublicLocale, date: Date, timeZone: string) {
  const local = resolveLocalTime(localInputValue(date, timeZone), timeZone);
  if (local.outcome !== "ambiguous") return "";
  return timeCopy(locale)[
    Math.floor(date.getTime() / 60_000) === Math.floor(Date.parse(local.candidates[0]) / 60_000)
      ? "earlier"
      : "later"
  ];
}

/**
 * A zone in plain words: «софийско време», "Sofia time". A zone the agency does not work in
 * uses the runtime's generic name ("Israel Time"); an offset such as "GMT+3" is never shown.
 */
export function timeZoneLabel(locale: PublicLocale, timeZone: string = agencyTimeZone): string {
  const written = zoneWordsFor(locale, timeZone);
  if (written) return written;
  for (const timeZoneName of ["longGeneric", "long"] as const) {
    const name = new Intl.DateTimeFormat(displayLocale(locale), { timeZone, timeZoneName })
      .formatToParts(new Date())
      .find((part) => part.type === "timeZoneName")?.value;
    if (name && !/\d/.test(name)) return name;
  }
  return timeZone.split("/").at(-1)?.replaceAll("_", " ") ?? timeZone;
}

/** A calendar day: «15 октомври», with the year when it is not the current one. */
export function formatDate(
  locale: PublicLocale,
  instant: Instant,
  { timeZone = agencyTimeZone, now }: Omit<InstantOptions, "zoneLabel"> = {},
): string {
  const date = toDate(instant);
  return dateTimeFormat(locale, timeZone, {
    ...datePart,
    ...yearUnlessCurrent([date], now, timeZone),
  }).format(date);
}

/** A time of day: «18:16». */
export function formatTime(
  locale: PublicLocale,
  instant: Instant,
  { timeZone = agencyTimeZone, zoneLabel = false, seconds = false }: InstantOptions = {},
): string {
  const text = dateTimeFormat(locale, timeZone, {
    ...timePart,
    ...(seconds ? { second: "2-digit" } : {}),
  }).format(toDate(instant));
  return named(locale, text, timeZone, zoneLabel);
}

/** «чт, 15 октомври в 18:16»: the one date-and-time format of every host. */
export function formatDateTime(
  locale: PublicLocale,
  instant: Instant,
  { timeZone = agencyTimeZone, zoneLabel = false, now, seconds = false }: InstantOptions = {},
): string {
  const date = toDate(instant);
  const text = dateTimeFormat(locale, timeZone, {
    weekday: "short",
    ...datePart,
    ...yearUnlessCurrent([date], now, timeZone),
    ...timePart,
    ...(seconds ? ({ second: "2-digit" } as const) : {}),
  }).format(date);
  const occurrence = occurrenceWords(locale, date, timeZone);
  return named(locale, occurrence ? `${text} · ${occurrence}` : text, timeZone, zoneLabel);
}

/** An interval such as a viewing, «сб, 17 октомври, 10:00 – 11:00», naming its zone once. */
export function formatDateTimeRange(
  locale: PublicLocale,
  start: Instant,
  end: Instant,
  { timeZone = agencyTimeZone, zoneLabel = false, now, seconds = false }: InstantOptions = {},
): string {
  const from = toDate(start);
  const to = toDate(end);
  const text = dateTimeFormat(locale, timeZone, {
    weekday: "short",
    ...datePart,
    ...yearUnlessCurrent([from, to], now, timeZone),
    ...timePart,
    ...(seconds ? ({ second: "2-digit" } as const) : {}),
  }).formatRange(from, to);
  const first = occurrenceWords(locale, from, timeZone),
    last = occurrenceWords(locale, to, timeZone);
  const resolved =
    first || last
      ? first === last
        ? `${text} · ${first}`
        : `${formatDateTime(locale, from, { timeZone, now, seconds })} – ${formatDateTime(locale, to, { timeZone, now, seconds })}`
      : text;
  return named(locale, resolved, timeZone, zoneLabel);
}
