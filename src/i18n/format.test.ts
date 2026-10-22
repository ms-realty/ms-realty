import { describe, expect, it } from "vitest";
import { displayLocale, displayLocales, publicLocales } from "./config";
import {
  agencyYear,
  formatArea,
  formatDate,
  formatDateTime,
  formatDateTimeRange,
  formatExactArea,
  formatMoney,
  formatNumber,
  formatTime,
  timeZoneLabel,
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
    const now = "2026-06-01T00:00:00Z";
    expect(formatDate("en", instant, { now })).toBe("1 January 2027");
    expect(plain(formatTime("en", instant))).toBe("00:30");
    expect(formatDate("en", instant, { now, timeZone: "UTC" })).toBe("31 December");
  });

  it("keeps number and area rounding separate across every locale and later values", () => {
    for (const locale of publicLocales) {
      for (const value of [85.256, -1200.78, 0, 99.99]) {
        expect(formatNumber(locale, value)).toBe(
          new Intl.NumberFormat(displayLocale(locale)).format(value),
        );
        expect(formatArea(locale, value)).toBe(
          `${new Intl.NumberFormat(displayLocale(locale), { maximumFractionDigits: 1 }).format(value)}\u00a0m²`,
        );
      }
    }
  });

  it("preserves caller options, inherited values, changed options and invalid-option errors", () => {
    const options = { maximumFractionDigits: 1 };
    expect(formatNumber("en", 85.256, options)).toBe("85.3");
    options.maximumFractionDigits = 2;
    expect(formatNumber("en", 85.256, options)).toBe("85.26");
    expect(formatNumber("en", 85.256, Object.create({ maximumFractionDigits: 0 }))).toBe("85");
    expect(() => formatNumber("en", 1, { maximumFractionDigits: Infinity })).toThrow(RangeError);
    expect(formatNumber("en", 85.256)).toBe("85.256");
  });

  it("preserves source area precision independently of rounded area and subsequent facts", () => {
    for (const locale of publicLocales)
      for (const value of [
        85.25678901234566, 0.00001234567890123456, 1_200_000.789123, -85.25, 0,
      ]) {
        const expected = `${new Intl.NumberFormat(displayLocale(locale), { maximumFractionDigits: 20 }).format(value)}\u00a0m²`;
        expect(formatExactArea(locale, value)).toBe(expected);
        formatArea(locale, value);
        expect(formatExactArea(locale, value)).toBe(expected);
      }
  });

  // Output differs slightly between ICU builds (Node, Chromium, WebKit: "at" or a comma, narrow
  // or regular spaces), so these compare meaning rather than whole strings (ux-spec §19.3).
  const forbidden =
    /UTC|GMT|EES?T|Гринуич|Europe\/|Asia\/|\d{4}-\d{2}-\d{2}|T\d{2}:\d{2}|[+-]0\d:?00/;

  it("prints one human date-time in every locale, never a zone id, offset or ISO text", () => {
    const instant = "2026-10-15T15:16:00Z";
    const now = "2026-10-14T09:00:00Z";
    const expected: Record<string, RegExp[]> = {
      bg: [/чт/, /15 октомври/, /18:16/],
      en: [/Thu/, /15 October/, /18:16/],
      ru: [/чт/, /15 октября/, /18:16/],
      de: [/Do/, /15\. Oktober/, /18:16/],
      nl: [/do/, /15 oktober/, /18:16/],
      el: [/Πέμ/, /15 Οκτωβρίου/, /6:16/],
      he: [/ה׳/, /15 באוקטובר/, /18:16/],
    };
    for (const locale of publicLocales) {
      const text = plain(formatDateTime(locale, instant, { now }));
      for (const part of expected[locale] ?? []) expect(text).toMatch(part);
      expect(text).not.toMatch(forbidden);
      expect(text).not.toMatch(/2026/);
    }
  });

  it("shows the year only when it is not the year of reading, in the zone shown", () => {
    const instant = "2026-12-31T22:30:00Z"; // 00:30 on 1 January 2027 in Sofia
    expect(plain(formatDateTime("en", instant, { now: "2027-01-10T12:00:00Z" }))).not.toMatch(
      /2027/,
    );
    expect(plain(formatDateTime("en", instant, { now: "2026-12-31T21:00:00Z" }))).toMatch(
      /1 January 2027.*00:30/,
    );
    expect(formatDate("bg", "2025-03-04T12:00:00Z", { now: "2026-10-14T09:00:00Z" })).toMatch(
      /4 март 2025/,
    );
  });

  it("follows Sofia across both daylight-saving changes", () => {
    // 2026-03-29: 03:00 EET becomes 04:00 EEST.
    expect(formatTime("bg", "2026-03-29T00:59:00Z")).toBe("02:59");
    expect(formatTime("bg", "2026-03-29T01:00:00Z")).toBe("04:00");
    // 2026-10-25: 04:00 EEST becomes 03:00 EET; both 03:30s read 03:30 on the wall clock.
    expect(formatTime("bg", "2026-10-25T00:30:00Z")).toBe("03:30");
    expect(formatTime("bg", "2026-10-25T01:30:00Z")).toBe("03:30");
    expect(formatTime("bg", "2026-10-25T02:00:00Z")).toBe("04:00");
    expect(formatDate("ru", "2026-10-24T22:30:00Z", { now: "2026-10-01T00:00:00Z" })).toBe(
      "25 октября",
    );
  });

  it("names the zone in words once, for a reader who could be elsewhere", () => {
    const now = "2026-10-14T09:00:00Z";
    const instant = "2026-10-17T07:00:00Z"; // Saturday 10:00 in Sofia
    expect(plain(formatDateTime("en", instant, { now, zoneLabel: true }))).toMatch(
      /^Sat.*17 October.*10:00 \(Sofia time\)$/,
    );
    expect(formatDateTime("bg", instant, { now, zoneLabel: true })).toMatch(
      /10:00 \(софийско време\)$/,
    );
    expect(formatDateTime("ru", instant, { now, zoneLabel: true })).toMatch(
      /10:00 \(по софийскому времени\)$/,
    );
    expect(formatDateTime("de", instant, { now, zoneLabel: true })).toMatch(/\(Ortszeit Sofia\)$/);
    expect(formatDateTime("he", instant, { now, zoneLabel: true })).toMatch(/\(שעון סופיה\)$/);
    expect(formatDateTime("en", instant, { now })).not.toMatch(/Sofia/);
    // A viewer reading a time kept in another zone gets that zone's wall time and its name.
    const elsewhere = plain(
      formatDateTime("en", instant, { now, timeZone: "Asia/Jerusalem", zoneLabel: true }),
    );
    expect(elsewhere).toMatch(/10:00 \(Israel/);
    expect(elsewhere).not.toMatch(forbidden);
    expect(
      plain(formatTime("en", instant, { timeZone: "Europe/London", zoneLabel: true })),
    ).toMatch(/^08:00 \(\D+\)$/);
    for (const locale of publicLocales) {
      expect(timeZoneLabel(locale, "UTC")).not.toMatch(forbidden);
      expect(timeZoneLabel(locale, "Europe/Athens")).not.toMatch(forbidden);
    }
  });

  it("formats an appointment interval with its date and zone once", () => {
    const now = "2026-10-14T09:00:00Z";
    const text = plain(
      formatDateTimeRange("en", "2026-10-17T07:00:00Z", "2026-10-17T08:00:00Z", {
        now,
        zoneLabel: true,
      }),
    );
    expect(text).toMatch(/^Sat.*17 October.*10:00\s?–\s?11:00 \(Sofia time\)$/);
    expect(text.match(/October/g)).toHaveLength(1);
    expect(text.match(/Sofia/g)).toHaveLength(1);
    const overnight = plain(
      formatDateTimeRange("bg", "2026-10-17T19:00:00Z", "2026-10-18T07:00:00Z", { now }),
    );
    expect(overnight).toMatch(/17 октомври.*22:00.*18 октомври.*10:00/);
  });

  it("formats with the route locale's regional tag, not the bare language", () => {
    // en is en-GB: day before month and a 24-hour clock, not US conventions.
    const now = "2026-01-01T00:00:00Z";
    expect(formatDate("en", "2026-03-04T12:00:00Z", { now })).toBe("4 March");
    expect(plain(formatTime("en", "2026-03-04T15:05:00Z"))).toBe("17:05");
    expect(formatDate("he", "2026-03-04T12:00:00Z", { now })).toMatch(/4 במרץ/);
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
      const now = "2026-01-01T00:00:00Z";
      expect(plain(formatDateTime("en", "2026-07-01T09:00:00Z", { now }))).toMatch(/12:00$/);
      expect(plain(formatDateTime("en", "2026-07-01T10:00:00Z", { now, timeZone: "UTC" }))).toMatch(
        /10:00$/,
      );
      expect(plain(formatDateTime("en", "2026-07-01T10:00:00Z", { timeZone: "UTC" }))).not.toMatch(
        /UTC/,
      );
    }
  });
});
