import { describe, expect, it } from "vitest";
import {
  emptyOperatingPolicy,
  type OperatingPolicy,
  operatingPolicySchema,
  policyEffects,
  readOperatingPolicySnapshot,
  staffedDuration,
} from "./operating-policy";
import { policyFromValues, policyToValues } from "./operating-policy-form";

const calendar = (): NonNullable<OperatingPolicy["serviceCalendar"]> => ({
  kind: "reviewed_calendar_v1",
  timezone: "Europe/Sofia",
  validFrom: "2026-01-01",
  validUntil: "2026-12-31",
  sourceReference: "Synthetic reviewed calendar only",
  weekly: {
    mon: [
      ["09:00", "12:00"],
      ["13:00", "17:00"],
    ],
    tue: [],
    wed: null,
    thu: [],
    fri: [],
    sat: [],
    sun: [],
  },
  exceptions: [],
});
const snapshot = (
  document: OperatingPolicy = { ...emptyOperatingPolicy, serviceCalendar: calendar() },
) => ({
  kind: "approved_operating_policy_v1",
  policyId: "00000000-0000-4000-8000-000000000099",
  policyVersion: 1,
  contentHash: "a".repeat(64),
  approvedAt: "2026-01-01T00:00:00.000Z",
  document,
});
describe("O24/AT14 immutable reviewed staffed-time policy", () => {
  it("keeps unknown policy, missing day and out-of-bounds interval distinct from zero", () => {
    expect(
      staffedDuration(null, new Date("2026-02-02T08:00Z"), new Date("2026-02-02T09:00Z")),
    ).toEqual({ status: "unknown", reason: "no_reviewed_policy" });
    expect(
      staffedDuration(snapshot(), new Date("2026-02-04T08:00Z"), new Date("2026-02-04T09:00Z")),
    ).toEqual({ status: "unknown", reason: "unknown_day" });
    expect(
      staffedDuration(snapshot(), new Date("2027-01-01T08:00Z"), new Date("2027-01-01T09:00Z")),
    ).toEqual({ status: "unknown", reason: "outside_reviewed_calendar" });
    expect(
      staffedDuration(snapshot(), new Date("2026-02-03T08:00Z"), new Date("2026-02-03T09:00Z")),
    ).toMatchObject({ status: "known", milliseconds: 0 });
  });
  it("excludes closed intervals and clips exact fractional boundaries", () => {
    expect(
      staffedDuration(
        snapshot(),
        new Date("2026-02-02T09:30:15Z"),
        new Date("2026-02-02T12:30:45Z"),
      ),
    ).toMatchObject({ status: "known", milliseconds: 2 * 3600000 + 30000, policyVersion: 1 });
    const value = snapshot();
    value.document.serviceCalendar?.exceptions.push({
      date: "2026-02-02",
      intervals: [],
      reason: "Synthetic closure",
    });
    expect(
      staffedDuration(value, new Date("2026-02-02T08:00Z"), new Date("2026-02-02T16:00Z")),
    ).toMatchObject({ status: "known", milliseconds: 0 });
  });
  it("counts real elapsed staffed time through the spring gap and autumn fold", () => {
    const value = snapshot();
    if (value.document.serviceCalendar)
      value.document.serviceCalendar.weekly.sun = [["02:00", "05:00"]];
    expect(
      staffedDuration(value, new Date("2026-03-29T00:00Z"), new Date("2026-03-29T02:00Z")),
    ).toMatchObject({ status: "known", milliseconds: 2 * 3600000 });
    expect(
      staffedDuration(value, new Date("2026-10-24T23:00Z"), new Date("2026-10-25T03:00Z")),
    ).toMatchObject({ status: "known", milliseconds: 4 * 3600000 });
    if (value.document.serviceCalendar)
      value.document.serviceCalendar.weekly.sun = [["00:00", "24:00"]];
    expect(
      staffedDuration(value, new Date("2026-03-28T22:00Z"), new Date("2026-03-29T21:00Z")),
    ).toMatchObject({ status: "known", milliseconds: 23 * 3600000 });
  });
  it("rejects malformed bounds, duplicate exceptions, overlapping and overnight intervals", () => {
    const value = calendar();
    for (const hours of [
      [["09:00", "08:00"]],
      [
        ["09:00", "12:00"],
        ["11:00", "13:00"],
      ],
      [["23:00", "01:00"]],
    ])
      expect(
        operatingPolicySchema.safeParse({
          ...emptyOperatingPolicy,
          serviceCalendar: { ...value, weekly: { ...value.weekly, mon: hours } },
        }).success,
      ).toBe(false);
    expect(
      operatingPolicySchema.safeParse({
        ...emptyOperatingPolicy,
        serviceCalendar: { ...value, validUntil: "2026-02-30" },
      }).success,
    ).toBe(false);
    const exception = { date: "2026-02-02", intervals: [], reason: "Synthetic closure" };
    expect(
      operatingPolicySchema.safeParse({
        ...emptyOperatingPolicy,
        serviceCalendar: { ...value, exceptions: [exception, exception] },
      }).success,
    ).toBe(false);
    expect(
      readOperatingPolicySnapshot({
        ...snapshot(),
        document: { ...emptyOperatingPolicy, serviceCalendar: { ...value, timezone: "UTC" } },
      }),
    ).toBeNull();
  });
  it("bounds computation and rejects reversed/invalid ranges without a promise", () => {
    expect(
      staffedDuration(snapshot(), new Date("2026-02-02T10:00Z"), new Date("2026-02-02T09:00Z")),
    ).toMatchObject({ status: "unknown", reason: "invalid_interval" });
    expect(staffedDuration(snapshot(), new Date("invalid"), new Date())).toMatchObject({
      status: "unknown",
      reason: "invalid_interval",
    });
    expect(
      staffedDuration(snapshot(), new Date("2026-01-01T00:00Z"), new Date("2028-01-01T00:00Z")),
    ).toMatchObject({ status: "unknown", reason: "interval_too_large" });
    expect(policyEffects(emptyOperatingPolicy)).toEqual({
      staffedTiming: false,
      coverage: false,
      serviceContact: false,
      savedSearch: false,
      marketing: false,
    });
  });
  it("round-trips native controls with unknowns and closed days without inventing defaults", () => {
    expect(policyFromValues(policyToValues(emptyOperatingPolicy))).toEqual(emptyOperatingPolicy);
    const document = { ...emptyOperatingPolicy, serviceCalendar: calendar() };
    document.serviceCalendar.exceptions.push({
      date: "2026-02-02",
      intervals: null,
      reason: "Synthetic coverage unknown",
    });
    expect(policyFromValues(policyToValues(document))).toEqual(document);
  });
});
