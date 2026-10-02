import { describe, expect, it } from "vitest";
import {
  checkLogicalSend,
  clientDeliveryLabel,
  guardMessageTransition,
  guardRetry,
  messageMachine,
  messageStates,
  switchComposer,
} from "./message";

const broker = { kind: "staff", id: "staff-1" } as const;
const hermes = { kind: "ai_service", id: "hermes" } as const;
const caseMessage = { kind: "case_message" } as const;

describe("messages (architecture §9)", () => {
  it("matches the architecture's states; there is no unconditional read state", () => {
    expect([...messageStates]).toEqual([
      "draft",
      "approved",
      "queued",
      "attempting",
      "provider_accepted",
      "delivered",
      "bounced",
      "failed",
      "outcome_unknown",
    ]);
  });

  it("switching composer mode never carries internal note text into a client message", () => {
    const { active, kept } = switchComposer(
      { kind: "internal_note", body: "Seller may accept less" },
      "case_message",
    );
    expect(active).toEqual({ kind: "case_message", body: "" });
    expect(kept.body).toBe("Seller may accept less");
  });

  it("an internal note cannot enter the send pipeline", () => {
    expect(
      guardMessageTransition(
        "draft",
        "approved",
        { kind: "internal_note", payloadDigest: "h" },
        broker,
      ),
    ).toEqual({ outcome: "denied", code: "internal_note_not_sendable" });
  });

  it("AT52: Butler drafts; only a human approves, and approval binds the exact payload", () => {
    expect(
      guardMessageTransition("draft", "approved", { ...caseMessage, payloadDigest: "h" }, hermes),
    ).toEqual({ outcome: "denied", code: "human_required" });
    expect(
      guardMessageTransition(
        "approved",
        "queued",
        { ...caseMessage, payloadDigest: "h2", approvedDigest: "h1" },
        broker,
      ),
    ).toEqual({ outcome: "denied", code: "approval_does_not_match_payload" });
  });

  it("AT46: one logical send is bound to one payload; a changed payload is refused", () => {
    const sent = { logicalSendId: "send-1", payloadDigest: "h1" };
    expect(checkLogicalSend(sent, sent)).toEqual({ outcome: "allowed", replay: true });
    expect(checkLogicalSend(sent, { ...sent, payloadDigest: "h2" })).toEqual({
      outcome: "denied",
      code: "payload_changed",
    });
    expect(checkLogicalSend(null, sent).outcome).toBe("allowed");
  });

  it("provider accepted, delivered and bounced are distinct and never regress", () => {
    expect(messageMachine.check("queued", "delivered").outcome).toBe("denied");
    expect(guardMessageTransition("attempting", "provider_accepted", caseMessage, broker)).toEqual({
      outcome: "denied",
      code: "provider_reference_required",
    });
    // A late bounce is kept; nothing moves from bounced back to delivered.
    expect(messageMachine.check("delivered", "bounced").outcome).toBe("allowed");
    expect(messageMachine.check("bounced", "delivered").outcome).toBe("denied");
    expect(clientDeliveryLabel.provider_accepted).not.toMatch(/^Delivered/);
    expect(clientDeliveryLabel.outcome_unknown).toBe("Delivery is not yet confirmed");
  });

  it("AT47: an unknown outcome is reconciled, never resent; replay past the 24 h window is refused", () => {
    expect(messageMachine.check("outcome_unknown", "queued").outcome).toBe("denied");
    const retry = {
      ...caseMessage,
      attempts: 1,
      duplicateRiskResolved: true,
      firstAttemptAt: "2026-09-24T09:00:00Z",
    };
    expect(guardRetry({ ...retry, now: "2026-09-24T20:00:00Z" }).outcome).toBe("allowed");
    expect(guardRetry({ ...retry, now: "2026-09-25T09:00:00Z" })).toEqual({
      outcome: "denied",
      code: "idempotency_window_passed",
    });
    expect(
      guardRetry({ ...retry, duplicateRiskResolved: false, now: "2026-09-24T10:00:00Z" }),
    ).toEqual({ outcome: "denied", code: "duplicate_risk_unresolved" });
    expect(guardRetry({ ...retry, attempts: 3, now: "2026-09-24T10:00:00Z" })).toEqual({
      outcome: "denied",
      code: "retry_limit_reached",
    });
  });
});
