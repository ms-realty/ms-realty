import { describe, expect, it } from "vitest";
import { currencyCodes, publicLocales } from "@/domain/ids";
import { decimalToMinor, minorToDecimal } from "@/domain/money";
import { formatExactMoney, formatMoneyInput, parseMoneyInput } from "./money";

describe("exact proposal money notation", () => {
  it.each([
    ["bg", "123\u00a0456\u00a0789,01"],
    ["en", "123,456,789.01"],
    ["ru", "123\u00a0456\u00a0789,01"],
    ["de", "123.456.789,01"],
    ["nl", "123.456.789,01"],
    ["el", "123.456.789,01"],
    ["he", "123,456,789.01"],
  ] as const)("formats and reads %s grouping and decimals", (locale, entry) => {
    expect(formatMoneyInput(locale, 12345678901, "EUR")).toBe(entry);
    expect(parseMoneyInput(locale, entry, "EUR")).toBe(12345678901);
    expect(formatExactMoney(locale, 12345678901, "EUR")).toContain(entry);
    expect(formatExactMoney(locale, 12345678901, "EUR")).toContain("EUR");
  });

  it.each(publicLocales)("retains every minor digit in %s and every source currency", (locale) => {
    for (const currency of currencyCodes)
      for (const minor of [
        0,
        1,
        10,
        100,
        100001,
        999999999999999,
        Number.MAX_SAFE_INTEGER - 1,
        Number.MAX_SAFE_INTEGER,
      ]) {
        const entry = formatMoneyInput(locale, minor, currency);
        expect(parseMoneyInput(locale, entry, currency)).toBe(minor);
        expect(decimalToMinor(minorToDecimal(minor, currency), currency)).toBe(minor);
        expect(formatExactMoney(locale, minor, currency)).toContain(currency);
      }
  });

  it("uses locale meaning without inferring ambiguous separators or rounding fractions", () => {
    expect(parseMoneyInput("en", "1,234", "EUR")).toBe(123400);
    expect(parseMoneyInput("de", "1.234", "EUR")).toBe(123400);
    expect(parseMoneyInput("bg", "12 345,67", "BGN")).toBe(1234567);
    expect(parseMoneyInput("ru", "12\u202f345,67", "USD")).toBe(1234567);
    for (const entry of ["1,23", "1.001", "12,34,567", "1e3", "-10", "+10", "€10", "", "1."])
      expect(Number.isNaN(parseMoneyInput("en", entry, "EUR"))).toBe(true);
    for (const entry of ["1.23", "1,001", "12.34.567", "1,234.56", "1 23,00", "1,,00"])
      expect(Number.isNaN(parseMoneyInput("de", entry, "EUR"))).toBe(true);
    expect(Number.isNaN(parseMoneyInput("en", "90,071,992,547,409.92", "EUR"))).toBe(true);
    expect(Number.isNaN(parseMoneyInput("en", "0".repeat(129), "EUR"))).toBe(true);
  });

  it("keeps canonical decimal interchange independent of locale notation", () => {
    expect(minorToDecimal(Number.MAX_SAFE_INTEGER, "EUR")).toBe("90071992547409.91");
    expect(formatMoneyInput("en", Number.MAX_SAFE_INTEGER - 1, "EUR")).toBe(
      "90,071,992,547,409.90",
    );
    expect(decimalToMinor("90071992547409.91", "EUR")).toBe(Number.MAX_SAFE_INTEGER);
    expect(decimalToMinor("0.01", "BGN")).toBe(1);
    for (const entry of ["1,23", "10.001", "1e2", "-1", "1.", "90071992547409.92"])
      expect(Number.isNaN(decimalToMinor(entry, "EUR"))).toBe(true);
  });
});
