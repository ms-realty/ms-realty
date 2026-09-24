import { describe, expect, it } from "vitest";
import {
  clientDeliveryLabel,
  guardMessageTransition,
  messageMachine,
  switchComposer,
} from "./message";

const broker = { kind: "staff", id: "staff-1" } as const;
const hermes = { kind: "ai_service", id: "hermes" } as const;

describe("messages (§07.5, F17)", () => {
  it("A41: switching composer mode never carries internal note text into a customer message", () => {
    const { active, kept } = switchComposer(
      { kind: "internal_note", body: "Seller may accept less" },
      "external",
    );
    expect(active).toEqual({ kind: "external", body: "" });
    expect(kept.body).toBe("Seller may accept less");
  });

  it("A41: an internal note cannot enter the send pipeline", () => {
    expect(
      guardMessageTransition(
        "draft",
        "human_approved",
        { kind: "internal_note", contentHash: "h" },
        broker,
      ),
    ).toEqual({ outcome: "denied", code: "internal_note_not_sendable" });
  });

  it("A66: AI drafts; only a human approves, and approval binds the exact content", () => {
    expect(
      guardMessageTransition(
        "draft",
        "human_approved",
        { kind: "external", contentHash: "h" },
        hermes,
      ),
    ).toEqual({
      outcome: "denied",
      code: "human_required",
    });
    expect(
      guardMessageTransition(
        "human_approved",
        "queued",
        { kind: "external", contentHash: "h2", approvedContentHash: "h1" },
        broker,
      ),
    ).toEqual({ outcome: "denied", code: "approval_does_not_match_content" });
  });

  it("A42: provider accepted, delivered and outcome unknown are distinct and source-supported", () => {
    expect(messageMachine.check("queued", "delivered").outcome).toBe("denied");
    expect(
      guardMessageTransition("queued", "provider_accepted", { kind: "external" }, broker),
    ).toEqual({
      outcome: "denied",
      code: "provider_reference_required",
    });
    expect(guardMessageTransition("delivered", "read", { kind: "external" }, broker)).toEqual({
      outcome: "denied",
      code: "read_receipts_unsupported",
    });
    expect(clientDeliveryLabel.provider_accepted).not.toMatch(/^Delivered/);
    expect(clientDeliveryLabel.outcome_unknown).toBe("Delivery is not yet confirmed");
  });

  it("A42: an unknown outcome is reconciled before retry; retries stop on duplicate risk", () => {
    expect(messageMachine.check("outcome_unknown", "queued").outcome).toBe("denied");
    const retry = {
      kind: "external",
      contentHash: "h",
      approvedContentHash: "h",
      attempts: 1,
    } as const;
    expect(guardMessageTransition("failed", "queued", retry, broker)).toEqual({
      outcome: "denied",
      code: "duplicate_risk_unresolved",
    });
    expect(
      guardMessageTransition("failed", "queued", { ...retry, duplicateRiskResolved: true }, broker)
        .outcome,
    ).toBe("allowed");
    expect(
      guardMessageTransition(
        "failed",
        "queued",
        { ...retry, attempts: 3, duplicateRiskResolved: true },
        broker,
      ),
    ).toEqual({ outcome: "denied", code: "retry_limit_reached" });
  });
});
