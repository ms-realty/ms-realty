import { describe, expect, it } from "vitest";
import { alertPeriod } from "./schedule";

describe("subscriber-local alert buckets", () => {
  it("uses the subscriber date across opposite sides of midnight", () => {
    const at = new Date("2026-09-27T22:30:00Z");
    expect(alertPeriod(at, "Europe/Sofia", "daily")).toBe("day:2026-09-28");
    expect(alertPeriod(at, "America/New_York", "daily")).toBe("day:2026-09-27");
  });
  it("does not turn repeated DST hours into another digest", () => {
    expect(alertPeriod(new Date("2026-10-25T00:30:00Z"), "Europe/Sofia", "daily")).toBe(
      alertPeriod(new Date("2026-10-25T01:30:00Z"), "Europe/Sofia", "daily"),
    );
    expect(alertPeriod(new Date("2026-03-29T00:30:00Z"), "Europe/Sofia", "daily")).toBe(
      alertPeriod(new Date("2026-03-29T01:30:00Z"), "Europe/Sofia", "daily"),
    );
  });
  it("supports Monday-starting calendar weeks through year boundaries", () => {
    expect(alertPeriod(new Date("2027-01-01T12:00:00Z"), "Europe/Sofia", "weekly")).toBe(
      "week:2026-12-28",
    );
    expect(alertPeriod(new Date("2027-01-03T22:00:00Z"), "Europe/Sofia", "weekly")).toBe(
      "week:2027-01-04",
    );
  });
  it("fails closed on malformed times and zones", () => {
    expect(() => alertPeriod(new Date("invalid"), "Europe/Sofia", "daily")).toThrow();
    expect(() => alertPeriod(new Date(), "not/a-zone", "daily")).toThrow();
  });
});
