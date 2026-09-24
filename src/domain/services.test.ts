import { describe, expect, it } from "vitest";
import { guardReservationTransition, staysOverlap } from "./reservation";
import { guardServiceRequestTransition } from "./service-request";

const coordinator = { kind: "staff", id: "coord-1" } as const;
const hermes = { kind: "ai_service", id: "hermes" } as const;

describe("service requests (F28)", () => {
  it("A63: every waiting state names its dependency", () => {
    expect(
      guardServiceRequestTransition(
        "triaged",
        "awaiting_access",
        { followUpAt: "2026-10-01T09:00:00Z" },
        coordinator,
      ),
    ).toEqual({
      outcome: "denied",
      code: "dependency_required",
    });
  });

  it("AI may not triage; spending needs an approval before work is scheduled", () => {
    expect(
      guardServiceRequestTransition("received", "triaged", { responsibleStaffId: "c1" }, hermes),
    ).toEqual({
      outcome: "denied",
      code: "human_required",
    });
    expect(
      guardServiceRequestTransition(
        "triaged",
        "scheduled",
        { scheduledAt: "2026-10-02T09:00:00Z", estimatedCostMinor: 12_000 },
        coordinator,
      ),
    ).toEqual({ outcome: "denied", code: "spending_approval_required" });
  });
});

describe("reservations (F27)", () => {
  const dates = { checkIn: "2026-10-10", checkOut: "2026-10-14" };
  const base = {
    dates,
    quote: { version: 2, expiresAt: "2026-10-01T00:00:00Z" },
    now: "2026-09-25T00:00:00Z",
    acceptedTermsVersion: "terms-3",
  };

  it("A61: confirmation needs provider-confirmed payment when payment applies", () => {
    expect(
      guardReservationTransition(
        "payment_pending",
        "confirmed",
        { ...base, payment: "pending" },
        coordinator,
      ),
    ).toEqual({
      outcome: "denied",
      code: "payment_not_confirmed",
    });
    expect(
      guardReservationTransition(
        "payment_pending",
        "confirmed",
        { ...base, payment: "confirmed_by_provider" },
        coordinator,
      ).outcome,
    ).toBe("allowed");
  });

  it("A62: a concurrent booking for overlapping dates is a conflict", () => {
    expect(
      guardReservationTransition(
        "awaiting_confirmation",
        "confirmed",
        {
          ...base,
          payment: "not_required",
          holdingReservations: [{ checkIn: "2026-10-13", checkOut: "2026-10-15" }],
        },
        coordinator,
      ),
    ).toEqual({ outcome: "denied", code: "availability_conflict" });
    expect(staysOverlap(dates, { checkIn: "2026-10-14", checkOut: "2026-10-16" })).toBe(false);
  });

  it("A62: an expired quote cannot be confirmed; cancellation shows the applicable terms", () => {
    expect(
      guardReservationTransition(
        "awaiting_confirmation",
        "confirmed",
        { ...base, payment: "not_required", now: "2026-10-02T00:00:00Z" },
        coordinator,
      ),
    ).toEqual({ outcome: "denied", code: "quote_expired" });
    expect(
      guardReservationTransition(
        "confirmed",
        "cancelled",
        { reason: "Guest request" },
        coordinator,
      ),
    ).toEqual({
      outcome: "denied",
      code: "cancellation_terms_not_shown",
    });
  });
});
