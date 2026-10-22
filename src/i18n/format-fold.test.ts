import { describe, expect, it } from "vitest";
import { formatDateTime, formatDateTimeRange } from "./format";

describe("M-050 repeated-hour instant display", () => {
  it("distinguishes the two instants with the same Sofia clock time in words", () => {
    const first = formatDateTime("en", "2026-10-25T00:30:00Z");
    const second = formatDateTime("en", "2026-10-25T01:30:00Z");
    expect(first).toMatch(/03:30.*First, before the clocks change/);
    expect(second).toMatch(/03:30.*Second, after the clocks change/);
    expect(first).not.toBe(second);
  });
  it("keeps both occurrences visible in an interval and names its zone once", () => {
    const interval = formatDateTimeRange("en", "2026-10-25T00:15:00Z", "2026-10-25T01:45:00Z", {
      zoneLabel: true,
    });
    expect(interval).toMatch(
      /03:15.*First, before the clocks change.*03:45.*Second, after the clocks change/,
    );
    expect(interval.match(/Sofia time/g)).toHaveLength(1);
    expect(interval).not.toMatch(/Europe\/|UTC|GMT/);
  });
});
