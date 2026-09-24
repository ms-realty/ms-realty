import { describe, expect, it } from "vitest";
import { type Actor, type CapabilityGrant, grantsForRoles } from "./capabilities";
import type { InquiryEvidence, InquiryState } from "./inquiry";
import { inquiryTransitions } from "./inquiry";
import { applyTransition, type TransitionRequest } from "./transition";

const broker: Actor = { kind: "staff", id: "staff-1" };
const brokerGrants: CapabilityGrant[] = grantsForRoles(["assigned_broker"]);
const record = {
  id: "inq-1",
  reference: "RQ-2026-000001",
  state: "received" as InquiryState,
  version: 3,
};

function request(
  overrides: Partial<TransitionRequest<InquiryState, InquiryEvidence>> = {},
): TransitionRequest<InquiryState, InquiryEvidence> {
  return {
    actor: broker,
    capabilities: brokerGrants,
    expectedVersion: 3,
    to: "assigned",
    evidence: { ownerId: "staff-1" },
    operationId: "op-1",
    at: "2026-09-24T09:00:00Z",
    ...overrides,
  };
}

describe("universal transition contract (§07.7)", () => {
  it("A47: applies an evidenced transition, bumps the version and records a human-readable event", () => {
    const result = applyTransition(inquiryTransitions, record, request({ reason: "Duty broker" }));
    expect(result.outcome).toBe("applied");
    if (result.outcome !== "applied") return;
    expect(result.record).toEqual({ ...record, state: "assigned", version: 4 });
    expect(result.activity.summary).toBe(
      "Inquiry RQ-2026-000001 moved from Received to Assigned: Duty broker.",
    );
    expect(result.activity).not.toHaveProperty("evidence");
    expect(result.audit).toMatchObject({
      operationId: "op-1",
      capability: "inquiry.assign",
      fromState: "received",
      toState: "assigned",
      expectedVersion: 3,
      newVersion: 4,
      evidence: { ownerId: "staff-1" },
    });
  });

  it("A47: denies a transition without its required evidence", () => {
    expect(applyTransition(inquiryTransitions, record, request({ evidence: {} }))).toEqual({
      outcome: "denied",
      code: "owner_required",
    });
  });

  it("returns a version conflict with the current snapshot instead of last-write-wins", () => {
    expect(applyTransition(inquiryTransitions, record, request({ expectedVersion: 2 }))).toEqual({
      outcome: "version_conflict",
      current: record,
    });
  });

  it("checks capability before revealing the current snapshot", () => {
    expect(
      applyTransition(
        inquiryTransitions,
        record,
        request({ capabilities: [], expectedVersion: 2 }),
      ),
    ).toEqual({ outcome: "denied", code: "missing_capability" });
  });

  it("A66: the AI service cannot transition records even when handed staff grants", () => {
    const result = applyTransition(
      inquiryTransitions,
      record,
      request({ actor: { kind: "ai_service", id: "hermes" } }),
    );
    expect(result).toEqual({ outcome: "denied", code: "missing_capability" });
  });

  it("rejects transitions outside the table", () => {
    expect(applyTransition(inquiryTransitions, record, request({ to: "case_linked" }))).toEqual({
      outcome: "denied",
      code: "transition_not_allowed",
    });
  });
});
