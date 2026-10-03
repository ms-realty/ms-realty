import { describe, expect, it } from "vitest";
import { guardInquiryTransition, inquiryMachine, inquiryStates } from "./inquiry";

const broker = { kind: "staff", id: "staff-1" } as const;
const system = { kind: "system", id: "intake" } as const;

describe("inquiry receipt and assignment (architecture §6.1)", () => {
  it("matches the architecture's states; received work is owned, never parked as 'new'", () => {
    expect([...inquiryStates]).toEqual([
      "received",
      "assigned",
      "awaiting_client",
      "linked_to_case",
      "resolved_without_case",
      "suspected_spam",
      "duplicate_candidate",
      "contact_unreachable",
    ]);
    expect(inquiryMachine.transitions.received).toEqual([
      "assigned",
      "suspected_spam",
      "duplicate_candidate",
    ]);
  });

  it("requires a named broker or the coverage queue to assign", () => {
    expect(guardInquiryTransition("received", "assigned", {}, broker)).toEqual({
      outcome: "denied",
      code: "owner_required",
    });
    expect(
      guardInquiryTransition("received", "assigned", { coverageQueue: "duty" }, system).outcome,
    ).toBe("allowed");
  });

  it("awaiting client needs the question sent and a follow-up date", () => {
    expect(
      guardInquiryTransition("assigned", "awaiting_client", { questionMessageId: "m1" }, broker),
    ).toEqual({ outcome: "denied", code: "follow_up_required" });
  });

  it("a duplicate suggestion is never merged automatically; a person confirms it", () => {
    expect(inquiryMachine.check("received", "linked_to_case").outcome).toBe("denied");
    expect(
      guardInquiryTransition("duplicate_candidate", "linked_to_case", { caseId: "c1" }, system),
    ).toEqual({ outcome: "denied", code: "human_required" });
    expect(
      guardInquiryTransition(
        "duplicate_candidate",
        "resolved_without_case",
        { reason: "same request", duplicateOfInquiryId: "i0" },
        broker,
      ).outcome,
    ).toBe("allowed");
    expect(inquiryMachine.check("duplicate_candidate", "assigned").outcome).toBe("allowed");
  });

  it("spam and unreachable contact are review states, not deletion", () => {
    for (const state of ["suspected_spam", "contact_unreachable"] as const) {
      expect(inquiryMachine.isTerminal(state)).toBe(false);
      expect(inquiryMachine.check(state, "assigned").outcome).toBe("allowed");
    }
    expect(
      guardInquiryTransition("suspected_spam", "resolved_without_case", { reason: "spam" }, system),
    ).toEqual({ outcome: "denied", code: "human_required" });
  });

  it("a question resolves without a case, but not while a commitment is open", () => {
    expect(
      guardInquiryTransition("assigned", "resolved_without_case", { reason: "answered" }, broker)
        .outcome,
    ).toBe("allowed");
    expect(
      guardInquiryTransition(
        "assigned",
        "resolved_without_case",
        { reason: "answered", openCommitments: 1 },
        broker,
      ),
    ).toEqual({ outcome: "denied", code: "open_commitments" });
  });

  it("linked and resolved are final", () => {
    for (const state of ["linked_to_case", "resolved_without_case"] as const) {
      expect(inquiryMachine.isTerminal(state)).toBe(true);
    }
  });
});
