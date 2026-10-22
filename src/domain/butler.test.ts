import { describe, expect, it } from "vitest";
import {
  type ButlerEvidence,
  type ButlerRoutineAction,
  butlerEligibility,
  butlerHumanActions,
  butlerReceipt,
  butlerRoutineActions,
} from "./butler";

function required<T>(value: T | null | undefined): T {
  if (value === undefined || value === null) throw new Error("Missing fixture evidence");
  return value;
}
const caseId = "00000000-0000-4000-8000-000000000001";
function evidence(action: ButlerRoutineAction): ButlerEvidence {
  return {
    caseId,
    caseActive: true,
    protectedEffects: [],
    message: {
      templateId: "reviewed-template-revision",
      templateAction: action,
      approvedDigest: "expected-rendering",
      renderedDigest: "expected-rendering",
      active: true,
      recipients: [
        {
          partyId: "person",
          currentCaseParticipant: true,
          contactEligible: true,
          firstContactHumanReceiptId: "human-first-contact",
        },
      ],
    },
    viewing: {
      requestedSlotDigest: "exact-slot-and-resources-revision",
      acceptances: [
        {
          side: "visitor",
          receiptId: "visitor-consent",
          partyId: "buyer",
          slotDigest: "exact-slot-and-resources-revision",
          current: true,
        },
        {
          side: "host",
          receiptId: "host-consent",
          partyId: "seller",
          slotDigest: "exact-slot-and-resources-revision",
          current: true,
        },
      ],
      resourcesCheckedAndLocked: true,
      listingAvailable: true,
    },
    document: {
      receivedVersionId: "upload-version",
      persistedUpload: true,
      belongsToCase: true,
      receiptOnly: true,
    },
    task: { internalCreationOnly: true, ownerAvailable: true, makesClientPromise: false },
  };
}

describe("Butler draft-only eligibility", () => {
  it.each(butlerRoutineActions)("%s still needs a human with complete evidence", (action) => {
    expect(butlerEligibility(action, caseId, evidence(action))).toEqual({
      decision: "awaiting_approval",
      reason: "draft_only",
    });
    expect(butlerEligibility(action, caseId)).toMatchObject({ decision: "blocked" });
    expect(butlerEligibility(action, "different-case", evidence(action))).toMatchObject({
      decision: "blocked",
    });
    expect(
      butlerEligibility(action, caseId, { ...evidence(action), caseActive: false }),
    ).toMatchObject({ decision: "blocked" });
  });
  it.each(butlerHumanActions)(
    "%s requires a human even with otherwise complete evidence",
    (action) => {
      expect(butlerEligibility(action, caseId, evidence("task.create"))).toEqual({
        decision: "awaiting_approval",
        reason: "human_required",
      });
    },
  );
  it.each([
    "message.send",
    "task.cancel",
    "viewing.cancel",
    "translation.approve",
    "unknown",
    "__proto__",
  ])("denies unlisted %s", (action) => {
    expect(butlerEligibility(action, caseId, evidence("task.create"))).toMatchObject({
      decision: "blocked",
    });
  });
  it.each(butlerRoutineActions)("a protected side effect cannot hide behind %s", (action) => {
    for (const effect of butlerHumanActions)
      expect(
        butlerEligibility(action, caseId, { ...evidence(action), protectedEffects: [effect] }),
      ).toMatchObject({ decision: "awaiting_approval" });
  });

  it.each(["acknowledgement.send", "reminder.send", "chaser.send"] as const)(
    "%s never becomes freeform/first contact or reaches a revoked participant",
    (action) => {
      const proof = evidence(action);
      const message = required(proof.message);
      const recipient = required(message.recipients[0]);
      const decide = (change: Partial<NonNullable<ButlerEvidence["message"]>>) =>
        butlerEligibility(action, caseId, { ...proof, message: { ...message, ...change } });
      expect(decide({ approvedDigest: null })).toMatchObject({ decision: "awaiting_approval" });
      expect(decide({ renderedDigest: "model-edited-text" })).toMatchObject({
        decision: "awaiting_approval",
      });
      expect(decide({ templateAction: "task.create" })).toMatchObject({ decision: "blocked" });
      expect(decide({ active: false })).toMatchObject({ decision: "blocked" });
      expect(decide({ recipients: [] })).toMatchObject({ decision: "blocked" });
      expect(
        decide({ recipients: [{ ...recipient, currentCaseParticipant: false }] }),
      ).toMatchObject({ decision: "blocked" });
      expect(decide({ recipients: [{ ...recipient, contactEligible: false }] })).toMatchObject({
        decision: "blocked",
      });
      expect(
        decide({ recipients: [{ ...recipient, firstContactHumanReceiptId: null }] }),
      ).toMatchObject({ decision: "awaiting_approval" });
      expect(
        decide({
          recipients: [
            recipient,
            { ...recipient, partyId: "other", currentCaseParticipant: false },
          ],
        }),
      ).toMatchObject({ decision: "blocked" });
    },
  );
  it("requires independent, current acceptance by both sides of the exact revision and slot", () => {
    const proof = evidence("viewing.book");
    const viewing = required(proof.viewing);
    const visitor = required(viewing.acceptances[0]);
    const host = required(viewing.acceptances[1]);
    const decide = (acceptances: typeof viewing.acceptances) =>
      butlerEligibility("viewing.book", caseId, { ...proof, viewing: { ...viewing, acceptances } });
    for (const acceptances of [
      [],
      [visitor],
      [visitor, { ...host, current: false }],
      [visitor, { ...host, slotDigest: "old-slot" }],
      [visitor, { ...host, partyId: visitor.partyId }],
      [visitor, { ...host, receiptId: visitor.receiptId }],
      [visitor, host, visitor],
    ])
      expect(decide(acceptances)).toMatchObject({ decision: "blocked", reason: "slot_not_agreed" });
    for (const change of [{ resourcesCheckedAndLocked: false }, { listingAvailable: false }])
      expect(
        butlerEligibility("viewing.book", caseId, { ...proof, viewing: { ...viewing, ...change } }),
      ).toMatchObject({ decision: "blocked" });
  });
  it("document receipt never substitutes for purpose/condition/legal acceptance", () => {
    const proof = evidence("document.record_received");
    for (const change of [
      { persistedUpload: false },
      { belongsToCase: false },
      { receiptOnly: false },
      { receivedVersionId: "" },
    ])
      expect(
        butlerEligibility("document.record_received", caseId, {
          ...proof,
          document: { ...required(proof.document), ...change },
        }),
      ).toMatchObject({ decision: "blocked" });
  });
  it("invalid task scope and client promises cannot bypass human review", () => {
    const proof = evidence("task.create");
    expect(
      butlerEligibility("task.create", caseId, {
        ...proof,
        task: { ...required(proof.task), internalCreationOnly: false },
      }),
    ).toMatchObject({ decision: "blocked" });
    expect(
      butlerEligibility("task.create", caseId, {
        ...proof,
        task: { ...required(proof.task), ownerAvailable: false },
      }),
    ).toMatchObject({ decision: "blocked" });
    expect(
      butlerEligibility("task.create", caseId, {
        ...proof,
        task: { ...required(proof.task), makesClientPromise: true },
      }),
    ).toMatchObject({ decision: "awaiting_approval" });
  });
  it.each(["done_automatically", "awaiting_approval", "blocked"] as const)(
    "%s retains the independent manual path",
    (verdict) => {
      expect(butlerReceipt("op", "task.create", verdict, "reason", "not_applied").manual).toEqual({
        available: true,
        requiresAuthorization: true,
        requiresReconciliation: false,
      });
      expect(
        butlerReceipt("op", "task.create", "blocked", "outcome_unknown", "unknown").manual
          .requiresReconciliation,
      ).toBe(true);
    },
  );
  it("uses draft-only for new receipts and retains a historical policy only when explicit", () => {
    expect(
      butlerReceipt("op", "task.create", "awaiting_approval", "draft_only", "not_applied").policy,
    ).toBe("owner_draft_only");
    expect(
      butlerReceipt(
        "old-op",
        "task.create",
        "done_automatically",
        "reconciled_applied",
        "applied",
        "owner_option_2_2026_10_02",
      ).policy,
    ).toBe("owner_option_2_2026_10_02");
  });
});
