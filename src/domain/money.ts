import { type CurrencyCode, currencyMinorDigits } from "./ids";

/** Canonical decimal notation is an interchange value, never a floating-point amount. */
export function decimalToMinor(value: string, currency: CurrencyCode): number {
  if (value.length > 32 || !/^\d+(?:\.\d+)?$/.test(value)) return Number.NaN;
  const [whole = "", fraction = ""] = value.split(".");
  const digits = currencyMinorDigits[currency];
  if (fraction.length > digits) return Number.NaN;
  const minor = BigInt(whole + fraction.padEnd(digits, "0"));
  return minor <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(minor) : Number.NaN;
}

export function minorToDecimal(amountMinor: number, currency: CurrencyCode): string {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0)
    throw new RangeError("Money must be non-negative integer minor units");
  const digits = currencyMinorDigits[currency];
  const value = String(amountMinor).padStart(digits + 1, "0");
  return digits ? `${value.slice(0, -digits)}.${value.slice(-digits)}` : value;
}
