// Locale formatting (spec §18.2). Display formats follow the locale; the source fact never
// changes. Dates are instants shown in an explicit time zone (agency default Europe/Sofia).
import { type CurrencyCode, currencyMinorDigits, type PublicLocale } from "@/domain/ids";
import { agencyTimeZone } from "./config";

type Instant = Date | string | number;

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
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: whole ? 0 : digits,
    maximumFractionDigits: digits,
  }).format(amountMinor / 10 ** digits);
}

/** The calendar year in the agency's time zone, not the server's (e.g. for the footer). */
export function agencyYear(at: Instant = new Date()): number {
  return Number(
    new Intl.DateTimeFormat("en", { year: "numeric", timeZone: agencyTimeZone }).format(toDate(at)),
  );
}

export function formatNumber(
  locale: PublicLocale,
  value: number,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(locale, options).format(value);
}

/** Square metres; the unit symbol is the same in every supported locale. */
export function formatArea(locale: PublicLocale, squareMetres: number): string {
  return `${formatNumber(locale, squareMetres, { maximumFractionDigits: 1 })}\u00a0m²`;
}

export interface ZonedOptions {
  /** IANA zone; defaults to the agency's. Always explicit, never the server's zone. */
  readonly timeZone?: string;
}

export function formatDate(
  locale: PublicLocale,
  instant: Instant,
  {
    timeZone = agencyTimeZone,
    dateStyle = "medium",
  }: ZonedOptions & {
    dateStyle?: Intl.DateTimeFormatOptions["dateStyle"];
  } = {},
): string {
  return new Intl.DateTimeFormat(locale, { dateStyle, timeZone }).format(toDate(instant));
}

export function formatTime(
  locale: PublicLocale,
  instant: Instant,
  { timeZone = agencyTimeZone }: ZonedOptions = {},
): string {
  return new Intl.DateTimeFormat(locale, { timeStyle: "short", timeZone }).format(toDate(instant));
}

/** Date and time with the zone named, for appointments and deadlines people act on. */
export function formatDateTime(
  locale: PublicLocale,
  instant: Instant,
  { timeZone = agencyTimeZone }: ZonedOptions = {},
): string {
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
    timeZoneName: "short",
  }).format(toDate(instant));
}
