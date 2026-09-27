import { describe, expect, it } from "vitest";
import { calendarFile, inServiceHours, sofiaInstant } from "./time";

describe("Europe/Sofia wall times and ICS", () => {
  it("rejects nonexistent spring time and incorrect seasonal offsets; distinguishes both autumn occurrences", () => {
    expect(sofiaInstant("2027-03-28T03:30+02:00")).toBeNull();
    expect(sofiaInstant("2027-07-01T10:00+02:00")).toBeNull();
    expect(sofiaInstant("2027-10-31T03:30+03:00")?.toISOString()).toBe("2027-10-31T00:30:00.000Z");
    expect(sofiaInstant("2027-10-31T03:30+02:00")?.toISOString()).toBe("2027-10-31T01:30:00.000Z");
    expect(sofiaInstant("2027-02-30T10:00+02:00")).toBeNull();
  });
  it("evaluates approved weekly hours in Sofia, failing closed for unknown policy", () => {
    const start = new Date("2027-01-15T10:00:00+02:00"),
      end = new Date("2027-01-15T11:00:00+02:00");
    expect(inServiceHours(start, end, { fri: ["09:00", "18:00"] })).toBe(true);
    expect(inServiceHours(start, end, { fri: ["11:00", "18:00"] })).toBe(false);
    expect(inServiceHours(start, end, {})).toBe(false);
  });
  it("keeps stable identity, increments committed sequence and escapes CRLF injection", () => {
    const input = {
      uid: "fixed@agency",
      sequence: 2,
      reference: "AP-1\r\nATTENDEE:evil",
      start: new Date("2027-01-15T08:00:00Z"),
      end: new Date("2027-01-15T09:00:00Z"),
      updatedAt: new Date("2027-01-01T00:00:00Z"),
      cancelled: true,
    };
    const ics = calendarFile(input);
    expect(ics).toContain("UID:fixed@agency\r\nSEQUENCE:2");
    expect(ics).toContain("METHOD:CANCEL");
    expect(ics).toContain("DTSTART:20270115T080000Z");
    expect(ics).not.toContain("\r\nATTENDEE:");
  });
});
