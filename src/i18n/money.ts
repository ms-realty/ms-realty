import { type CurrencyCode, currencyMinorDigits, type PublicLocale } from "@/domain/ids";
import { decimalToMinor, minorToDecimal } from "@/domain/money";
import { displayLocale } from "./config";

function separators(locale: PublicLocale) {
  const parts = new Intl.NumberFormat(displayLocale(locale)).formatToParts(12345.6);
  return {
    group: parts.find((part) => part.type === "group")?.value ?? "",
    decimal: parts.find((part) => part.type === "decimal")?.value ?? ".",
  };
}

/** Reads only the route locale's notation. A separator never guesses another meaning. */
export function parseMoneyInput(locale: PublicLocale, value: string, currency: CurrencyCode) {
  if (value.length > 128) return Number.NaN;
  const { group, decimal } = separators(locale);
  const normalized = /\s/u.test(group)
    ? value.trim().replace(/[ \u00a0\u202f]/gu, group)
    : value.trim();
  const [whole = "", fraction, ...extra] = normalized.split(decimal);
  if (extra.length || (fraction !== undefined && !/^\d+$/.test(fraction))) return Number.NaN;
  const groups = group ? whole.split(group) : [whole];
  if (
    !/^\d+$/.test(groups[0] ?? "") ||
    (groups.length > 1 &&
      ((groups[0]?.length ?? 0) > 3 || groups.slice(1).some((part) => !/^\d{3}$/.test(part))))
  )
    return Number.NaN;
  return decimalToMinor(groups.join("") + (fraction === undefined ? "" : `.${fraction}`), currency);
}

function exactParts(
  locale: PublicLocale,
  amountMinor: number,
  currency: CurrencyCode,
  currencyDisplay: boolean,
) {
  const [whole = "", fraction = ""] = minorToDecimal(amountMinor, currency).split(".");
  const digits = currencyMinorDigits[currency];
  return new Intl.NumberFormat(displayLocale(locale), {
    ...(currencyDisplay ? { style: "currency", currency, currencyDisplay: "code" } : {}),
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
    .formatToParts(BigInt(whole))
    .map((part) => (part.type === "fraction" ? fraction : part.value))
    .join("");
}

/** Grouped entry text with every minor digit retained, including amounts beyond safe decimals. */
export function formatMoneyInput(
  locale: PublicLocale,
  amountMinor: number,
  currency: CurrencyCode,
) {
  return exactParts(locale, amountMinor, currency, false);
}

/** Proposal terms include the unambiguous ISO currency and never convert the source amount. */
export function formatExactMoney(
  locale: PublicLocale,
  amountMinor: number,
  currency: CurrencyCode,
) {
  return exactParts(locale, amountMinor, currency, true);
}
