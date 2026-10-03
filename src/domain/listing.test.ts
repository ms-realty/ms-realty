import { describe, expect, it } from "vitest";
import type { Actor } from "./capabilities";
import {
  assessFreshness,
  availabilityReviewIntervalDays,
  commercialStates,
  editorialStates,
  freshnessStates,
  guardCommercialTransition,
  guardEditorialTransition,
  presentedAvailability,
} from "./listing";

const broker: Actor = { kind: "staff", id: "staff-1" };
const timer: Actor = { kind: "system", id: "freshness-timer" };

describe("listing lifecycle dimensions (architecture §7.1)", () => {
  it("match the architecture's state lists", () => {
    expect([...commercialStates]).toEqual([
      "available",
      "confirmation_required",
      "negotiating",
      "reserved_with_recorded_basis",
      "sold",
      "let",
      "withdrawn",
    ]);
    expect([...editorialStates]).toEqual([
      "draft",
      "needs_facts",
      "in_review",
      "approved_revision",
      "changes_requested",
    ]);
    expect([...freshnessStates]).toEqual([
      "current_under_policy",
      "review_due",
      "conflicting",
      "unknown",
    ]);
  });

  it("commercial transitions need a reason; a reservation needs its recorded basis", () => {
    expect(
      guardCommercialTransition("available", "negotiating", { purpose: "sale" }, broker),
    ).toEqual({ outcome: "denied", code: "reason_required" });
    expect(
      guardCommercialTransition(
        "negotiating",
        "reserved_with_recorded_basis",
        { purpose: "sale", reason: "Deposit" },
        broker,
      ),
    ).toEqual({ outcome: "denied", code: "reservation_basis_required" });
  });

  it("sold is only for a sale and let only for a rental, both with evidence", () => {
    expect(
      guardCommercialTransition(
        "negotiating",
        "let",
        { purpose: "sale", reason: "x", evidenceIds: ["d1"] },
        broker,
      ),
    ).toEqual({ outcome: "denied", code: "purpose_mismatch" });
    expect(
      guardCommercialTransition("negotiating", "sold", { purpose: "sale", reason: "x" }, broker),
    ).toEqual({ outcome: "denied", code: "evidence_required" });
  });

  it("a timer cannot prove availability", () => {
    expect(
      guardCommercialTransition(
        "confirmation_required",
        "available",
        { purpose: "sale", reason: "Checked" },
        timer,
      ),
    ).toEqual({ outcome: "denied", code: "human_required" });
  });

  it("AT19: draft edits never alter an approved revision; approval binds a submitted revision", () => {
    expect(
      guardEditorialTransition("draft", "in_review", { missingRequiredFacts: 0 }, broker),
    ).toEqual({
      outcome: "denied",
      code: "revision_required",
    });
    expect(
      guardEditorialTransition(
        "draft",
        "in_review",
        { revisionId: "r2", missingRequiredFacts: 2 },
        broker,
      ),
    ).toEqual({ outcome: "denied", code: "required_facts_missing" });
    expect(
      guardEditorialTransition("in_review", "approved_revision", { revisionId: "r2" }, broker),
    ).toEqual({ outcome: "denied", code: "approval_required" });
  });
});

describe("availability freshness (architecture §7.1)", () => {
  it("defaults to 14 days for sale and 7 days for long-term rent", () => {
    expect(availabilityReviewIntervalDays).toEqual({ sale: 14, long_term_rent: 7 });
    const confirmed = "2026-09-01T09:00:00.000Z";
    expect(
      assessFreshness({ purpose: "sale", lastConfirmedAt: confirmed, now: "2026-09-14T09:00:00Z" }),
    ).toEqual({ state: "current_under_policy", reviewDueAt: "2026-09-15T09:00:00.000Z" });
    expect(
      assessFreshness({ purpose: "sale", lastConfirmedAt: confirmed, now: "2026-09-15T09:00:00Z" })
        .state,
    ).toBe("review_due");
    expect(
      assessFreshness({
        purpose: "long_term_rent",
        lastConfirmedAt: confirmed,
        now: "2026-09-08T09:00:00Z",
      }).state,
    ).toBe("review_due");
  });

  it("never-confirmed is unknown and a recorded conflict is conflicting", () => {
    expect(assessFreshness({ purpose: "sale", now: "2026-09-01T00:00:00Z" }).state).toBe("unknown");
    expect(
      assessFreshness({
        purpose: "sale",
        lastConfirmedAt: "2026-09-01T00:00:00Z",
        conflicting: true,
        now: "2026-09-02T00:00:00Z",
      }).state,
    ).toBe("conflicting");
  });

  it("published is not available: an expired confirmation reads as confirmation required", () => {
    expect(presentedAvailability("available", "review_due")).toBe("confirmation_required");
    expect(presentedAvailability("available", "current_under_policy")).toBe("available");
    expect(presentedAvailability("sold", "unknown")).toBe("sold");
  });
});
