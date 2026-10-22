import { defaultLocale, displayLocale, isPublicLocale } from "@/i18n/config";

/** Show exact USD micro-units as money without rounding through a floating-point amount. */
export function assistanceCost(value: string | number, requested: string): string {
  if (
    (typeof value === "number" && (!Number.isSafeInteger(value) || value < 0)) ||
    !/^\d+$/.test(String(value))
  )
    return "—";
  const locale = displayLocale(isPublicLocale(requested) ? requested : defaultLocale);
  const amount = BigInt(value);
  const fraction = (amount % 1_000_000n).toString().padStart(6, "0");
  const digits = Math.max(2, fraction.replace(/0+$/, "").length);
  const formattedFraction = new Intl.NumberFormat(locale, {
    useGrouping: false,
    minimumIntegerDigits: digits,
  }).format(Number(fraction.slice(0, digits)));
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
    .formatToParts(amount / 1_000_000n)
    .map((part) => (part.type === "fraction" ? formattedFraction : part.value))
    .join("");
}
