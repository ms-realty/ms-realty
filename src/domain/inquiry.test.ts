import { describe, expect, it } from "vitest";
import { guardInquiryTransition, inquiryMachine, inquiryStates } from "./inquiry";

describe("inquiry pipeline (§07.1)", () => {
  it("has no permanent 'new' stage: received work can only be assigned or flagged", () => {
    expect(inquiryMachine.transitions.received).toEqual(["assigned", "suspected_duplicate"]);
    expect(inquiryStates).not.toContain("new");
  });

  it("requires an owner or coverage queue to assign", () => {
    expect(guardInquiryTransition("received", "assigned", {})).toEqual({
      outcome: "denied",
      code: "owner_required",
    });
    expect(guardInquiryTransition("received", "assigned", { coverageQueue: "duty" }).outcome).toBe(
      "allowed",
    );
  });

  it("awaiting client needs the question sent and a follow-up date", () => {
    expect(
      guardInquiryTransition("assigned", "awaiting_client", { questionMessageId: "m1" }),
    ).toEqual({
      outcome: "denied",
      code: "follow_up_required",
    });
  });

  it("A43: a suspected duplicate is never merged automatically; it returns to a human decision", () => {
    expect(inquiryMachine.check("suspected_duplicate", "assigned").outcome).toBe("allowed");
    expect(inquiryMachine.check("received", "case_linked").outcome).toBe("denied");
  });

  it("A44: a simple question resolves without a case, but not while a commitment is open", () => {
    expect(
      guardInquiryTransition("assigned", "resolved_without_case", { reason: "answered" }).outcome,
    ).toBe("allowed");
    expect(
      guardInquiryTransition("assigned", "resolved_without_case", {
        reason: "answered",
        openCommitments: 1,
      }),
    ).toEqual({ outcome: "denied", code: "open_commitments" });
  });

  it("terminal dispositions cannot be left", () => {
    for (const state of ["case_linked", "resolved_without_case", "discarded"] as const) {
      expect(inquiryMachine.isTerminal(state)).toBe(true);
    }
  });
});
