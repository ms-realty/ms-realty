// Recognized routine intents, not executable capabilities under the draft-only policy.
export const butlerRoutineActions = [
  "acknowledgement.send",
  "reminder.send",
  "chaser.send",
  "viewing.book",
  "document.record_received",
  "task.create",
] as const;
export type ButlerRoutineAction = (typeof butlerRoutineActions)[number];

export const butlerHumanActions = [
  "contact.first",
  "price.change",
  "offer.make",
  "terms.change",
  "condition.clear",
  "condition.waive",
  "publication.publish",
  "publication.withdraw",
  "translation.index",
  "access.grant",
  "action.cancel",
  "legal.act",
  "money.act",
] as const;
export type ButlerHumanAction = (typeof butlerHumanActions)[number];

export interface ButlerEligibility {
  readonly decision: "awaiting_approval" | "blocked";
  readonly reason: string;
}

/** Server adapter evidence only. Never accept these facts from a model/request body. */
export interface ButlerEvidence {
  readonly caseId: string;
  readonly caseActive: boolean;
  /** Any legal/financial/other protected effect takes precedence over the action's label. */
  readonly protectedEffects: readonly ButlerHumanAction[];
  readonly message?: {
    readonly templateId: string;
    readonly templateAction: ButlerRoutineAction;
    readonly approvedDigest: string | null;
    readonly renderedDigest: string;
    readonly active: boolean;
    readonly recipients: readonly {
      readonly partyId: string;
      readonly currentCaseParticipant: boolean;
      readonly contactEligible: boolean;
      readonly firstContactHumanReceiptId: string | null;
    }[];
  };
  readonly viewing?: {
    /** Digest includes appointment/revision, start, end, timezone and resource identities. */
    readonly requestedSlotDigest: string;
    readonly acceptances: readonly {
      readonly side: "visitor" | "host";
      readonly receiptId: string;
      readonly partyId: string;
      readonly slotDigest: string;
      readonly current: boolean;
    }[];
    /** Resource checks remain evidence for review, never authority to book a viewing. */
    readonly resourcesCheckedAndLocked: boolean;
    readonly listingAvailable: boolean;
  };
  readonly document?: {
    readonly receivedVersionId: string;
    readonly persistedUpload: boolean;
    readonly belongsToCase: boolean;
    /** Receipt is bookkeeping, never document acceptance, condition clearance or legal review. */
    readonly receiptOnly: boolean;
  };
  readonly task?: {
    readonly internalCreationOnly: boolean;
    readonly ownerAvailable: boolean;
    readonly makesClientPromise: boolean;
  };
}

export function isButlerRoutineAction(action: string): action is ButlerRoutineAction {
  return (butlerRoutineActions as readonly string[]).includes(action);
}

export function butlerEligibility(
  action: string,
  caseId: string,
  evidence?: ButlerEvidence,
): ButlerEligibility {
  const blocked = (reason: string): ButlerEligibility => ({ decision: "blocked", reason });
  const approval = (reason: string): ButlerEligibility => ({
    decision: "awaiting_approval",
    reason,
  });
  if ((butlerHumanActions as readonly string[]).includes(action)) return approval("human_required");
  if (!isButlerRoutineAction(action)) return blocked("action_not_allowlisted");
  if (!evidence || evidence.caseId !== caseId || !evidence.caseActive)
    return blocked("case_scope_not_current");
  if (evidence.protectedEffects.length) return approval("protected_effect");

  switch (action) {
    case "acknowledgement.send":
    case "reminder.send":
    case "chaser.send": {
      const message = evidence.message;
      if (!message?.active || !message.templateId || message.templateAction !== action)
        return blocked("template_unavailable");
      if (!message.approvedDigest || message.approvedDigest !== message.renderedDigest)
        return approval("template_not_approved");
      if (
        !message.recipients.length ||
        message.recipients.some(
          (p) => !p.partyId || !p.currentCaseParticipant || !p.contactEligible,
        )
      )
        return blocked("recipient_not_eligible");
      if (message.recipients.some((p) => !p.firstContactHumanReceiptId))
        return approval("first_contact_requires_human");
      break;
    }
    case "viewing.book": {
      const viewing = evidence.viewing;
      if (!viewing?.requestedSlotDigest) return blocked("slot_not_agreed");
      const visitor = viewing.acceptances.filter((a) => a.side === "visitor" && a.current);
      const host = viewing.acceptances.filter((a) => a.side === "host" && a.current);
      if (
        visitor.length !== 1 ||
        host.length !== 1 ||
        visitor[0]?.partyId === host[0]?.partyId ||
        visitor[0]?.receiptId === host[0]?.receiptId ||
        [...visitor, ...host].some(
          (a) => !a.receiptId || !a.partyId || a.slotDigest !== viewing.requestedSlotDigest,
        )
      )
        return blocked("slot_not_agreed");
      if (!viewing.resourcesCheckedAndLocked || !viewing.listingAvailable)
        return blocked("viewing_resources_unavailable");
      break;
    }
    case "document.record_received": {
      const document = evidence.document;
      if (
        !document?.receivedVersionId ||
        !document.persistedUpload ||
        !document.belongsToCase ||
        !document.receiptOnly
      )
        return blocked("document_receipt_not_proven");
      break;
    }
    case "task.create": {
      const task = evidence.task;
      if (!task?.internalCreationOnly || !task.ownerAvailable) return blocked("task_scope_invalid");
      if (task.makesClientPromise) return approval("client_promise_requires_human");
      break;
    }
  }
  return approval("draft_only");
}

export interface ButlerReceipt {
  /** The legacy marker is retained only for stored receipt readback and reconciliation. */
  readonly policy: "owner_draft_only" | "owner_option_2_2026_10_02";
  readonly operationId: string;
  readonly action: string;
  readonly verdict: "done_automatically" | "awaiting_approval" | "blocked";
  readonly reason: string;
  readonly outcome: "applied" | "not_applied" | "unknown";
  /** Always render "Do it myself"; this routes to a separately authorized human command. */
  readonly manual: {
    readonly available: true;
    readonly requiresAuthorization: true;
    readonly requiresReconciliation: boolean;
  };
}

export function butlerReceipt(
  operationId: string,
  action: string,
  verdict: ButlerReceipt["verdict"],
  reason: string,
  outcome: ButlerReceipt["outcome"],
  policy: ButlerReceipt["policy"] = "owner_draft_only",
): ButlerReceipt {
  return {
    policy,
    operationId,
    action,
    verdict,
    reason,
    outcome,
    manual: {
      available: true,
      requiresAuthorization: true,
      requiresReconciliation: outcome === "unknown",
    },
  };
}
