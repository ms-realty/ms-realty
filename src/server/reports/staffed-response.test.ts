import { describe, expect, it } from "vitest";
import {
  emptyOperatingPolicy,
  type OperatingPolicy,
  staffedDuration,
} from "@/domain/operating-policy";
import {
  createReportStaffedDurationReader,
  maxStaffedResponses,
  summarizeStaffedResponses,
} from "./staffed-response";

function snapshot() {
  const serviceCalendar: NonNullable<OperatingPolicy["serviceCalendar"]> = {
    kind: "reviewed_calendar_v1",
    timezone: "Europe/Sofia",
    validFrom: "2026-01-01",
    validUntil: "2026-12-31",
    sourceReference: "Synthetic reviewed calendar",
    weekly: {
      mon: [
        ["09:00", "12:00"],
        ["13:00", "17:00"],
      ],
      tue: [["09:00", "17:00"]],
      wed: [["09:00", "17:00"]],
      thu: [["09:00", "17:00"]],
      fri: [["09:00", "17:00"]],
      sat: [],
      sun: [["02:00", "05:00"]],
    },
    exceptions: [],
  };
  return {
    kind: "approved_operating_policy_v1",
    policyId: "00000000-0000-4000-8000-000000000099",
    policyVersion: 1,
    contentHash: "a".repeat(64),
    approvedAt: "2026-01-01T00:00:00.000Z",
    document: { ...emptyOperatingPolicy, serviceCalendar },
  };
}

describe("O22 / F25 staffed response observations", () => {
  it.each([
    ["2026-02-02T09:30:15Z", "2026-02-05T12:30:45Z"],
    ["2026-03-27T15:47:12Z", "2026-03-30T09:16:34Z"],
    ["2026-10-23T13:04:13Z", "2026-10-26T12:09:11Z"],
    ["2026-02-07T08:30:00Z", "2026-02-07T12:20:15Z"],
    ["2026-02-02T09:30:15Z", "2026-02-02T12:30:45Z"],
    ["2026-02-02T00:00:00Z", "2026-02-02T00:00:00Z"],
  ])("preserves canonical partial/day/closed/DST duration for %s to %s", (a, b) => {
    const read = createReportStaffedDurationReader();
    const policy = snapshot(),
      start = new Date(a),
      end = new Date(b);
    expect(read(policy, start, end)).toEqual(staffedDuration(policy, start, end));
    // Repeated observations must reuse full days without changing endpoint clipping.
    expect(read(structuredClone(policy), start, end)).toEqual(staffedDuration(policy, start, end));
  });

  it("preserves unknown days, calendar bounds, legacy policy and the canonical elapsed cap", () => {
    const read = createReportStaffedDurationReader(),
      policy = snapshot();
    policy.document.serviceCalendar.exceptions.push({
      date: "2026-02-03",
      intervals: null,
      reason: "Synthetic unknown coverage",
    });
    for (const [value, a, b] of [
      [policy, "2026-02-02T08:00Z", "2026-02-05T12:00Z"],
      [policy, "2026-02-02T08:00Z", "2027-01-01T12:00Z"],
      [policy, "2026-01-01T00:00Z", "2028-01-01T00:00Z"],
      [policy, "2026-02-02T10:00Z", "2026-02-02T09:00Z"],
      [null, "2026-02-02T08:00Z", "2026-02-02T09:00Z"],
    ] as const) {
      const start = new Date(a),
        end = new Date(b);
      expect(read(value, start, end)).toEqual(staffedDuration(value, start, end));
    }
  });

  it("caches full UTC days per immutable snapshot without conflating policy versions", () => {
    const read = createReportStaffedDurationReader({ maxCalendarSlices: 3 });
    const policy = snapshot(),
      start = new Date("2026-02-02T00:00Z"),
      end = new Date("2026-02-05T00:00Z");
    const expected = staffedDuration(policy, start, end);
    expect(read(policy, start, end)).toEqual(expected);
    expect(read(structuredClone(policy), start, end)).toEqual(expected);
    const changed = structuredClone(policy);
    changed.policyVersion = 2;
    changed.document.serviceCalendar.weekly.mon = [];
    expect(read(changed, start, end)).toEqual({ status: "unknown", reason: "calculation_limit" });
  });

  it("reports known/unknown coverage, including genuine closed-hours zeroes", () => {
    const policy = snapshot();
    const rows = [
      {
        operatingPolicySnapshot: policy,
        createdAt: new Date("2026-02-07T08:00Z"),
        firstResponseAt: new Date("2026-02-07T09:00Z"),
      },
      {
        operatingPolicySnapshot: policy,
        createdAt: new Date("2026-02-02T08:00Z"),
        firstResponseAt: new Date("2026-02-02T09:00Z"),
      },
      {
        operatingPolicySnapshot: null,
        createdAt: new Date("2026-02-02T08:00Z"),
        firstResponseAt: new Date("2026-02-02T09:00Z"),
      },
    ] as const;
    expect(summarizeStaffedResponses(rows, 3)).toMatchObject({
      state: "observed",
      eligible: 3,
      known: 2,
      unknown: 1,
      medianMinutes: 30,
      unknownReasons: { no_reviewed_policy: 1 },
      smallSample: true,
    });
    expect(summarizeStaffedResponses([rows[0]], 1)).toMatchObject({
      state: "observed",
      medianMinutes: 0,
    });
    expect(summarizeStaffedResponses([rows[2]], 1)).toMatchObject({
      state: "unknown",
      known: 0,
      unknown: 1,
      medianMinutes: null,
    });
    expect(summarizeStaffedResponses([], 0)).toMatchObject({
      state: "unobserved",
      eligible: 0,
      medianMinutes: null,
    });
    expect(summarizeStaffedResponses([], null)).toMatchObject({
      state: "denied",
      known: null,
      unknown: null,
      medianMinutes: null,
    });
  });

  it("holds the entire median above the cohort or work limit instead of using a partial sample", () => {
    expect(summarizeStaffedResponses([], maxStaffedResponses + 1)).toMatchObject({
      state: "held",
      reason: "cohort_limit",
      known: null,
      unknown: null,
      medianMinutes: null,
    });
    const rows = [
      {
        operatingPolicySnapshot: snapshot(),
        createdAt: new Date("2026-02-02T08:00Z"),
        firstResponseAt: new Date("2026-02-05T09:00Z"),
      },
    ];
    expect(summarizeStaffedResponses(rows, 1, { maxCalendarSlices: 1 })).toMatchObject({
      state: "held",
      reason: "calculation_limit",
      known: null,
      unknown: null,
      medianMinutes: null,
    });
  });
});
