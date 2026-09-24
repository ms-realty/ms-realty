import { describe, expect, it } from "vitest";
import { buyerCaseMachine, buyerCaseStages, guardBuyerCaseTransition } from "./buyer-case";
import type { Actor } from "./capabilities";
import { guardRentalCaseTransition, rentalCaseStages } from "./rental-case";
import { guardSellerCaseTransition } from "./seller-case";

const broker: Actor = { kind: "staff", id: "staff-1" };
const hermes: Actor = { kind: "ai_service", id: "hermes" };

describe("buyer case (§07.2)", () => {
  it("A47: entering needs agreed requires an acknowledged brief, broker and contact route", () => {
    expect(
      guardBuyerCaseTransition(
        "closed",
        "needs_agreed",
        { reason: "New search", acknowledgedBriefId: "b1" },
        broker,
      ),
    ).toEqual({ outcome: "denied", code: "responsible_broker_required" });
  });

  it("A47: viewing requires an appointment workflow", () => {
    expect(guardBuyerCaseTransition("evaluating", "viewing", {}, broker)).toEqual({
      outcome: "denied",
      code: "appointment_required",
    });
    expect(
      guardBuyerCaseTransition("evaluating", "viewing", { appointmentId: "a1" }, broker).outcome,
    ).toBe("allowed");
  });

  it("A47: completion is recorded only by a human with evidence", () => {
    expect(
      guardBuyerCaseTransition(
        "coordination",
        "completed",
        { completionEvidenceIds: ["d1"] },
        hermes,
      ),
    ).toEqual({
      outcome: "denied",
      code: "human_required",
    });
    expect(guardBuyerCaseTransition("coordination", "completed", {}, broker)).toEqual({
      outcome: "denied",
      code: "completion_evidence_required",
    });
  });

  it("A48: pausing or closing needs a reason and an explicit review of remaining obligations", () => {
    expect(
      guardBuyerCaseTransition("evaluating", "closed", { reason: "Client paused search" }, broker),
    ).toEqual({
      outcome: "denied",
      code: "obligations_not_reviewed",
    });
    expect(
      guardBuyerCaseTransition(
        "evaluating",
        "closed",
        { reason: "Client paused search", outstandingObligations: ["task-7"] },
        broker,
      ).outcome,
    ).toBe("allowed");
  });

  it("A48: a closed case can be reopened, a completed one becomes a new linked service", () => {
    expect(buyerCaseMachine.check("closed", "needs_agreed").outcome).toBe("allowed");
    expect(buyerCaseMachine.isTerminal("completed")).toBe(true);
  });

  it("a failed proposal returns the buyer to evaluating instead of closing the case", () => {
    expect(buyerCaseMachine.check("failed", "evaluating").outcome).toBe("allowed");
  });
});

describe("seller case (§07.3)", () => {
  it("A29: self-declared ownership does not confirm scope and authority", () => {
    expect(
      guardSellerCaseTransition(
        "request_received",
        "scope_authority_confirmed",
        { responsibleBrokerId: "s1", authorityState: "self_declared" },
        broker,
      ),
    ).toEqual({ outcome: "denied", code: "reviewed_authority_required" });
    expect(
      guardSellerCaseTransition(
        "request_received",
        "scope_authority_confirmed",
        { responsibleBrokerId: "s1", authorityState: "reviewed" },
        broker,
      ).outcome,
    ).toBe("allowed");
  });

  it("A30: instructions need a service agreement and recorded publication permissions", () => {
    expect(
      guardSellerCaseTransition(
        "assessment",
        "instructions_agreed",
        { serviceAgreementId: "sa1" },
        broker,
      ),
    ).toEqual({ outcome: "denied", code: "publication_permissions_required" });
  });

  it("A31: marketing starts only with the owner's approval of the exact preview", () => {
    expect(guardSellerCaseTransition("preparing", "marketing", {}, broker)).toEqual({
      outcome: "denied",
      code: "owner_approval_required",
    });
  });
});

describe("rental case (F26)", () => {
  it("uses rental stage labels, not buyer/seller vocabulary (dispositions aside)", () => {
    const shared = rentalCaseStages.filter((stage) =>
      (buyerCaseStages as readonly string[]).includes(stage),
    );
    expect(shared).toEqual(["paused", "closed"]);
  });

  it("A60: a viewing precedes application document collection", () => {
    expect(
      guardRentalCaseTransition(
        "viewing_arranged",
        "application_review",
        { applicationChecklistId: "c1" },
        broker,
      ),
    ).toEqual({ outcome: "denied", code: "viewing_required_before_application" });
  });

  it("A60: only a human declines an application, with a policy reason", () => {
    expect(
      guardRentalCaseTransition(
        "application_review",
        "application_declined",
        { declineReasonCode: "r1" },
        hermes,
      ),
    ).toEqual({ outcome: "denied", code: "human_required" });
  });

  it("a tenancy starts only with an inventory record and start evidence", () => {
    expect(
      guardRentalCaseTransition(
        "handover",
        "tenancy_started",
        { startEvidenceIds: ["e1"] },
        broker,
      ),
    ).toEqual({
      outcome: "denied",
      code: "inventory_record_required",
    });
  });
});
