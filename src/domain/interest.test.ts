import { describe, expect, it } from "vitest";
import {
  guardInterestTransition,
  type InterestState,
  interestMachine,
  interestStates,
  isJudgedAgainstStaleRevision,
} from "./interest";

const broker = { kind: "staff", id: "staff-1" } as const;
const client = { kind: "client", id: "client-1" } as const;

describe("interests (architecture §6.2)", () => {
  it("match the architecture's states", () => {
    expect([...interestStates]).toEqual([
      "suggested",
      "shortlisted",
      "viewing_requested",
      "viewed",
      "proposal",
      "declined",
      "unavailable",
    ]);
  });

  it("AT15: one buyer, five listings: declining one leaves the others untouched", () => {
    const interests = new Map<string, InterestState>(
      ["l1", "l2", "l3", "l4", "l5"].map((id) => [id, "shortlisted"]),
    );
    const decision = guardInterestTransition(
      "shortlisted",
      "declined",
      { reason: "Too far from school" },
      client,
    );
    expect(decision.outcome).toBe("allowed");
    interests.set("l2", "declined");
    expect([...interests.values()].filter((s) => s === "shortlisted")).toHaveLength(4);
    // A declined interest can be reconsidered; it is never deleted.
    expect(interestMachine.check("declined", "shortlisted").outcome).toBe("allowed");
  });

  it("feedback needs a reason; viewed needs a completed appointment", () => {
    expect(guardInterestTransition("shortlisted", "declined", {}, client)).toEqual({
      outcome: "denied",
      code: "reason_required",
    });
    expect(
      guardInterestTransition("viewing_requested", "viewed", { appointmentId: "a1" }, broker),
    ).toEqual({ outcome: "denied", code: "viewing_not_completed" });
  });

  it("a client shortlists or declines; the rest is staff work", () => {
    expect(
      guardInterestTransition("shortlisted", "proposal", { proposalRevisionId: "p1" }, client),
    ).toEqual({ outcome: "denied", code: "staff_required" });
  });

  it("a withdrawn listing makes the interest unavailable with its reason, not closed", () => {
    expect(guardInterestTransition("viewed", "unavailable", {}, broker)).toEqual({
      outcome: "denied",
      code: "listing_change_required",
    });
    expect(interestMachine.isTerminal("unavailable")).toBe(false);
  });

  it("a new listing revision marks earlier judgments stale without rewriting them", () => {
    const interest = { listingId: "l1", state: "proposal", listingRevisionId: "rev-1" } as const;
    expect(isJudgedAgainstStaleRevision(interest, "rev-2")).toBe(true);
    expect(isJudgedAgainstStaleRevision(interest, "rev-1")).toBe(false);
  });
});
