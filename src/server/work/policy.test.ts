import { describe, expect, it } from "vitest";
import {
  dayBounds,
  firstResponseDueAt,
  officeStatus,
  policyAt,
  type ServicePolicy,
} from "./policy";

// O01 header context (F19, O24, A58): office hours and promises are read, never invented.
const hours = { mon: ["09:00", "18:00"], sat: [["10:00", "12:00"]], holidays: ["2026-12-25"] };

describe("officeStatus", () => {
  it("reads weekly hours in the policy timezone", () => {
    // Monday 2026-09-28 08:30 UTC is 11:30 in Sofia.
    expect(officeStatus(hours, "Europe/Sofia", new Date("2026-09-28T08:30:00Z"))).toBe(true);
    // 15:30 UTC is 18:30 in Sofia: closed.
    expect(officeStatus(hours, "Europe/Sofia", new Date("2026-09-28T15:30:00Z"))).toBe(false);
    // Saturday uses a list of ranges; Sunday has none and is closed.
    expect(officeStatus(hours, "Europe/Sofia", new Date("2026-09-26T08:00:00Z"))).toBe(true);
    expect(officeStatus(hours, "Europe/Sofia", new Date("2026-09-27T08:00:00Z"))).toBe(false);
  });

  it("uses the local calendar day near midnight", () => {
    // Sunday 22:30 UTC is already Monday 01:30 in Sofia: Monday hours apply.
    expect(
      officeStatus({ mon: ["00:00", "02:00"] }, "Europe/Sofia", new Date("2026-09-27T22:30:00Z")),
    ).toBe(true);
  });

  it("is closed on a listed holiday", () => {
    expect(
      officeStatus(
        { fri: ["09:00", "18:00"], holidays: ["2026-12-25"] },
        "Europe/Sofia",
        new Date("2026-12-25T10:00:00Z"),
      ),
    ).toBe(false);
  });

  it("returns null instead of guessing when hours cannot be read", () => {
    expect(officeStatus(null, "Europe/Sofia", new Date())).toBeNull();
    expect(
      officeStatus({ mon: "9-18" }, "Europe/Sofia", new Date("2026-09-28T08:30:00Z")),
    ).toBeNull();
    expect(
      officeStatus({ mon: ["9am", "6pm"] }, "Europe/Sofia", new Date("2026-09-28T08:30:00Z")),
    ).toBeNull();
    expect(officeStatus(hours, "Not/AZone", new Date())).toBeNull();
  });
});

describe("dayBounds", () => {
  it("returns the operator's local day as instants", () => {
    const { start, end } = dayBounds(new Date("2026-09-26T09:00:00Z"), "Europe/Sofia");
    expect(start.toISOString()).toBe("2026-09-25T21:00:00.000Z");
    expect(end.toISOString()).toBe("2026-09-26T21:00:00.000Z");
  });
});

describe("firstResponseDueAt", () => {
  const policy = (from: string, responsePolicy: unknown): ServicePolicy => ({
    id: from,
    effectiveFrom: new Date(from),
    timezone: "Europe/Sofia",
    serviceHours: hours,
    responsePolicy,
  });

  it("applies the policy in force when the request arrived (A58)", () => {
    const policies = [
      policy("2026-01-01T00:00:00Z", { firstResponseHours: 4 }),
      policy("2026-09-01T00:00:00Z", { firstResponseHours: 24 }),
    ];
    expect(policyAt(policies, new Date("2026-08-31T00:00:00Z"))?.id).toBe("2026-01-01T00:00:00Z");
    expect(firstResponseDueAt(policies, new Date("2026-08-31T10:00:00Z"))?.toISOString()).toBe(
      "2026-08-31T14:00:00.000Z",
    );
    expect(firstResponseDueAt(policies, new Date("2026-09-02T10:00:00Z"))?.toISOString()).toBe(
      "2026-09-03T10:00:00.000Z",
    );
  });

  it("stays unknown without a policy or with a rule it does not interpret", () => {
    expect(firstResponseDueAt([], new Date())).toBeNull();
    expect(
      firstResponseDueAt(
        [policy("2026-01-01T00:00:00Z", { acknowledge: "next_business_period" })],
        new Date("2026-02-01T00:00:00Z"),
      ),
    ).toBeNull();
  });
});
