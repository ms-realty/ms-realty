import { describe, expect, it } from "vitest";
import { grantsForRoles } from "./capabilities";
import {
  caseStageTransitions,
  demandMachine,
  demandStages,
  guardDemandStage,
  guardDisposition,
  guardSupplyStage,
  isAccountablyOwned,
  serviceIntakeMachine,
  stagesByKind,
  supplyStages,
} from "./case";
import { applyTransition } from "./transition";

const broker = { kind: "staff", id: "staff-1" } as const;

describe("buyer and tenant cases (architecture §6.2)", () => {
  it("follow the architecture's stage sequence; tenants use the same foundation", () => {
    expect([...demandStages]).toEqual([
      "needs_agreed",
      "evaluating",
      "viewing",
      "proposal_preparation",
      "proposal_active",
      "coordination",
      "completed",
    ]);
    expect(stagesByKind.tenant).toBe(stagesByKind.buyer);
    // Paused and closed are a separate disposition, not stages.
    expect(demandStages).not.toContain("paused" as never);
  });

  it("AT15: moving back to evaluating is allowed from any active stage and needs a reason", () => {
    for (const from of [
      "viewing",
      "proposal_preparation",
      "proposal_active",
      "coordination",
    ] as const) {
      expect(demandMachine.check(from, "evaluating").outcome).toBe("allowed");
    }
    expect(guardDemandStage("coordination", "evaluating", {}, broker)).toEqual({
      outcome: "denied",
      code: "reason_required",
    });
  });

  it("evaluating needs an acknowledged brief, a broker and an interest or sourcing task", () => {
    expect(
      guardDemandStage("needs_agreed", "evaluating", { responsibleBrokerId: "b1" }, broker),
    ).toEqual({ outcome: "denied", code: "acknowledged_brief_required" });
    expect(
      guardDemandStage(
        "needs_agreed",
        "evaluating",
        { acknowledgedBriefRevisionId: "br1", responsibleBrokerId: "b1", reviewedInterestCount: 5 },
        broker,
      ).outcome,
    ).toBe("allowed");
  });

  it("AT35: completion is a human-recorded outcome with evidence and remaining obligations", () => {
    expect(
      guardDemandStage("coordination", "completed", { completionEvidenceIds: ["d1"] }, broker),
    ).toEqual({ outcome: "denied", code: "obligations_not_reviewed" });
    expect(
      guardDemandStage(
        "coordination",
        "completed",
        { completionEvidenceIds: ["d1"], remainingObligations: [] },
        { kind: "system", id: "timer" },
      ),
    ).toEqual({ outcome: "denied", code: "human_required" });
    // Coordination starts from a proposal agreed for the next step, not from a completed sale.
    expect(guardDemandStage("proposal_active", "coordination", {}, broker)).toEqual({
      outcome: "denied",
      code: "agreed_proposal_required",
    });
  });
});

describe("seller and landlord cases (architecture §6.3)", () => {
  it("follow the architecture's stage sequence", () => {
    expect([...supplyStages]).toEqual([
      "request_received",
      "scope_authority_review",
      "assessment",
      "instructions_agreed",
      "preparing",
      "marketing",
      "proposal_coordination",
      "completion_handover",
    ]);
    expect(stagesByKind.landlord).toBe(stagesByKind.seller);
  });

  it("AT18: intake does not infer ownership; assessment needs reviewed authority", () => {
    expect(guardSupplyStage("scope_authority_review", "assessment", {}, broker)).toEqual({
      outcome: "denied",
      code: "reviewed_authority_required",
    });
    expect(
      guardSupplyStage("scope_authority_review", "assessment", { authorityReviewed: true }, broker)
        .outcome,
    ).toBe("allowed");
  });

  it("AT18: instructions need a SellerInstruction; marketing needs the preview acknowledgment", () => {
    expect(guardSupplyStage("assessment", "instructions_agreed", {}, broker)).toEqual({
      outcome: "denied",
      code: "seller_instruction_required",
    });
    expect(guardSupplyStage("preparing", "marketing", {}, broker)).toEqual({
      outcome: "denied",
      code: "preview_acknowledgment_required",
    });
  });
});

describe("service intake (architecture §3.2)", () => {
  it("is a bounded consultation with no booking or statement stages", () => {
    expect([...serviceIntakeMachine.states]).toEqual([
      "request_received",
      "consultation",
      "concluded",
    ]);
    expect(stagesByKind.service_intake).not.toContain("confirmed" as never);
  });
});

describe("case disposition (architecture §6.2, §6.6)", () => {
  it("a pause has a reason, a dependency and a review date", () => {
    expect(guardDisposition("active", "paused", { reason: "Travelling" }, broker)).toEqual({
      outcome: "denied",
      code: "dependency_required",
    });
    expect(
      guardDisposition(
        "active",
        "paused",
        { reason: "Travelling", waitingOn: "client return", reviewAt: "2026-10-15T09:00:00Z" },
        broker,
      ).outcome,
    ).toBe("allowed");
  });

  it("closure records an outcome and a disposition for every open commitment", () => {
    expect(guardDisposition("active", "closed", { outcome: "Bought elsewhere" }, broker)).toEqual({
      outcome: "denied",
      code: "obligations_not_reviewed",
    });
    expect(
      guardDisposition(
        "active",
        "closed",
        {
          outcome: "Bought elsewhere",
          openCommitmentIds: ["t1", "t2"],
          commitmentDispositions: { t1: "done" },
        },
        broker,
      ),
    ).toEqual({ outcome: "denied", code: "commitment_disposition_required" });
    expect(guardDisposition("closed", "active", {}, broker)).toEqual({
      outcome: "denied",
      code: "reason_required",
    });
  });

  it("every active case has an accountable broker and a next action or a dated dependency", () => {
    const base = {
      disposition: "active",
      ownerId: "b1",
      nextAction: null,
      waitingOn: null,
      reviewAt: null,
    } as const;
    expect(isAccountablyOwned(base)).toBe(false);
    expect(isAccountablyOwned({ ...base, nextAction: "Send shortlist" })).toBe(true);
    expect(
      isAccountablyOwned({ ...base, waitingOn: "mortgage offer", reviewAt: "2026-10-01" }),
    ).toBe(true);
    expect(isAccountablyOwned({ ...base, ownerId: null, nextAction: "x" })).toBe(false);
    expect(isAccountablyOwned({ ...base, disposition: "closed" })).toBe(true);
  });

  it("the stage contract picks the kind's pipeline", () => {
    const record = { id: "c1", state: "request_received" as const, version: 1 };
    const result = applyTransition(caseStageTransitions("landlord"), record, {
      actor: broker,
      capabilities: grantsForRoles(["assigned_broker"]),
      expectedVersion: 1,
      to: "scope_authority_review",
      evidence: { responsibleBrokerId: "staff-1" },
      operationId: "op-1",
      at: "2026-09-26T09:00:00Z",
    });
    expect(result.outcome).toBe("applied");
    expect(
      applyTransition(
        caseStageTransitions("buyer"),
        { ...record, state: "needs_agreed" },
        {
          actor: broker,
          capabilities: grantsForRoles(["assigned_broker"]),
          expectedVersion: 1,
          to: "scope_authority_review",
          evidence: {},
          operationId: "op-2",
          at: "2026-09-26T09:00:00Z",
        },
      ),
    ).toEqual({ outcome: "denied", code: "transition_not_allowed" });
  });
});
