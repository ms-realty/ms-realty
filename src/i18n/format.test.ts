import { describe, expect, it } from "vitest";
import { displayLocale, displayLocales, publicLocales } from "./config";
import {
  agencyYear,
  formatArea,
  formatDate,
  formatDateTime,
  formatMoney,
  formatNumber,
  formatTime,
} from "./format";

// Intl output uses no-break and narrow no-break spaces; compare with plain spaces.
const plain = (value: string) => value.replace(/[  ]/g, " ");

describe("formatting (ux-spec §19.3)", () => {
  it("formats integer minor units in the source currency without converting", () => {
    expect(plain(formatMoney("en", 9_500_000, "EUR"))).toBe("€95,000");
    expect(plain(formatMoney("de", 9_500_050, "EUR"))).toBe("95.000,50 €");
    expect(plain(formatMoney("bg", 12_000_000, "BGN"))).toMatch(/^120 000/);
    expect(() => formatMoney("en", 10.5, "EUR")).toThrow();
  });

  it("formats numbers and areas per locale", () => {
    expect(plain(formatNumber("ru", 1234567.5))).toBe("1 234 567,5");
    expect(plain(formatArea("en", 85.25))).toBe("85.3 m²");
    expect(plain(formatArea("de", 1200))).toBe("1.200 m²");
  });

  it("formats instants in the agency time zone, not the server's", () => {
    // 22:30 UTC on 31 Dec is already 1 Jan in Sofia (UTC+2).
    const instant = "2026-12-31T22:30:00Z";
    expect(formatDate("en", instant, { dateStyle: "long" })).toBe("1 January 2027");
    expect(plain(formatTime("en", instant))).toBe("00:30");
    expect(formatDate("en", instant, { dateStyle: "long", timeZone: "UTC" })).toBe(
      "31 December 2026",
    );
  });

  it("names the zone when showing a date and time people act on", () => {
    expect(plain(formatDateTime("en", "2026-07-01T09:00:00Z"))).toBe("1 Jul 2026, 12:00 EEST");
    expect(formatDateTime("en", "2026-07-01T09:00:00Z", { timeZone: "Asia/Jerusalem" })).toMatch(
      /12:00 GMT\+3|12:00 IDT/,
    );
  });

  it("formats with the route locale's regional tag, not the bare language", () => {
    // en is en-GB: day before month and a 24-hour clock, not US conventions.
    expect(formatDate("en", "2026-03-04T12:00:00Z", { dateStyle: "short" })).toBe("04/03/2026");
    expect(formatDate("he", "2026-03-04T12:00:00Z", { dateStyle: "short" })).toBe("4.3.2026");
    expect(displayLocale("he")).toBe("he-IL");
    for (const locale of publicLocales)
      expect(displayLocales[locale]).toMatch(/^[a-z]{2}-[A-Z]{2}$/);
  });

  it("rejects invalid instants instead of printing 'Invalid Date'", () => {
    expect(() => formatDate("en", "not a date")).toThrow(RangeError);
  });

  it("takes the year in the agency's zone, not the server's", () => {
    // 22:30 UTC on 31 December is already 00:30 on 1 January in Sofia.
    expect(agencyYear("2026-12-31T22:30:00Z")).toBe(2027);
    expect(agencyYear("2026-12-31T21:30:00Z")).toBe(2026);
  });

  it("keeps repeated formatting isolated by locale, currency, fraction and time zone", () => {
    for (let i = 0; i < 2; i++) {
      expect(plain(formatMoney("en", 123400, "EUR"))).toBe("€1,234");
      expect(plain(formatMoney("de", 123450, "EUR"))).toBe("1.234,50 €");
      expect(plain(formatMoney("en", 123450, "USD"))).toBe("US$1,234.50");
      expect(plain(formatMoney("en", 123450, "EUR"))).toBe("€1,234.50");
      expect(plain(formatDateTime("en", "2026-07-01T09:00:00Z"))).toBe("1 Jul 2026, 12:00 EEST");
      expect(plain(formatDateTime("en", "2026-07-01T10:00:00Z", { timeZone: "UTC" }))).toBe(
        "1 Jul 2026, 10:00 UTC",
      );
    }
  });
});
