import { describe, expect, it } from "vitest";
import { grantsForRoles } from "./capabilities";
import {
  guardProposalTransition,
  materialChanges,
  type ProposalTerms,
  proposalApprovalContent,
  proposalStates,
  proposalTransitions,
} from "./proposal";
import { applyTransition } from "./transition";

const broker = { kind: "staff", id: "staff-1" } as const;
const terms: ProposalTerms = {
  amountMinor: 9_000_000,
  currency: "EUR",
  paymentBasis: "Bank transfer at notary deed",
  conditions: ["Subject to title review"],
  inclusions: ["Kitchen appliances"],
  partyIds: ["p1"],
  deadlineAt: "2026-10-10T15:00:00Z",
  deadlineTimezone: "Europe/Sofia",
};

describe("proposals (§07.6, F16)", () => {
  it("changing amount, conditions, parties or deadline is material; inclusions wording is not", () => {
    expect(
      materialChanges(terms, { ...terms, amountMinor: 9_100_000, partyIds: ["p1", "p2"] }),
    ).toEqual(["amountMinor", "partyIds"]);
    expect(materialChanges(terms, { ...terms, inclusions: ["Kitchen"] })).toEqual([]);
  });

  it("A40: a material change invalidates the prior approval before submission", () => {
    const approved = proposalApprovalContent(terms);
    const changed = proposalApprovalContent({ ...terms, amountMinor: 9_100_000 });
    expect(
      guardProposalTransition(
        "reviewed",
        "submitted",
        { approvedContent: approved, currentContent: changed },
        broker,
      ),
    ).toEqual({ outcome: "denied", code: "approval_invalidated_by_change" });
    expect(
      guardProposalTransition(
        "reviewed",
        "submitted",
        { approvedContent: approved, currentContent: approved },
        broker,
      ).outcome,
    ).toBe("allowed");
  });

  it("A40: expired or superseded proposals reject stale actions", () => {
    const content = proposalApprovalContent(terms);
    expect(
      guardProposalTransition(
        "awaiting_response",
        "agreed_for_next_step",
        { superseded: true, responseRecordId: "r1" },
        broker,
      ),
    ).toEqual({ outcome: "denied", code: "proposal_superseded" });
    expect(
      guardProposalTransition(
        "reviewed",
        "submitted",
        {
          approvedContent: content,
          currentContent: content,
          deadlineAt: terms.deadlineAt,
          now: "2026-10-11T00:00:00Z",
        },
        broker,
      ),
    ).toEqual({ outcome: "denied", code: "proposal_expired" });
    expect(
      guardProposalTransition(
        "awaiting_response",
        "expired",
        { deadlineAt: terms.deadlineAt, now: "2026-10-11T00:00:00Z" },
        broker,
      ).outcome,
    ).toBe("allowed");
  });

  it("'agreed for next step' is not labeled as a completed purchase", () => {
    expect(proposalStates).not.toContain("purchased");
    expect(proposalStates).toContain("agreed_for_next_step");
  });

  it("F16: an authorized client submits or responds with the portal capability, never reviews", () => {
    const client = { kind: "client", id: "client-1" } as const;
    const content = proposalApprovalContent(terms);
    const transition = (
      state: "reviewed" | "awaiting_response" | "draft",
      to: "submitted" | "declined" | "reviewed",
    ) =>
      applyTransition(
        proposalTransitions,
        { id: "pr-1", state, version: 1 },
        {
          actor: client,
          capabilities: grantsForRoles(["verified_client"]),
          expectedVersion: 1,
          to,
          evidence: {
            approvedContent: content,
            currentContent: content,
            responseRecordId: "resp-1",
          },
          operationId: "op-1",
          at: "2026-09-24T09:00:00Z",
        },
      );
    expect(transition("reviewed", "submitted").outcome).toBe("applied");
    expect(transition("awaiting_response", "declined").outcome).toBe("applied");
    expect(transition("draft", "reviewed")).toEqual({ outcome: "denied", code: "staff_required" });
  });
});
