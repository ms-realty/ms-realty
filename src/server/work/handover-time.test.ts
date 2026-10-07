import { describe, expect, it } from "vitest";
import { handoverReviewInput, handoverReviewInstant } from "./handover-time";

describe("agency-zone handover review time", () => {
  it("converts ordinary summer and winter wall times without shifting the readback", () => {
    const summer = handoverReviewInstant("2026-07-15T10:00");
    const winter = handoverReviewInstant("2026-01-15T10:00");
    expect(summer).toBe("2026-07-15T07:00:00.000Z");
    expect(winter).toBe("2026-01-15T08:00:00.000Z");
    expect(handoverReviewInput(new Date(summer))).toBe("2026-07-15T10:00");
    expect(handoverReviewInput(new Date(winter))).toBe("2026-01-15T10:00");
  });

  it("rejects a missing spring hour and an ambiguous autumn hour", () => {
    expect(() => handoverReviewInstant("2026-03-29T03:30")).toThrowError(
      expect.objectContaining({
        code: "validation_failed",
        fieldErrors: { dueAt: ["invalid_local_time"] },
      }),
    );
    expect(() => handoverReviewInstant("2026-10-25T03:30")).toThrowError(
      expect.objectContaining({
        code: "validation_failed",
        fieldErrors: { dueAt: ["ambiguous_local_time"] },
      }),
    );
  });
});
