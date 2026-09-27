import { describe, expect, it } from "vitest";
import { checkExecution, externalActionMachine } from "./external-action";
import { guardPrivacyRequestTransition } from "./privacy";
import { evidenceCounts, type ReleaseEvidenceRecord } from "./release-evidence";
import {
  guardSellerInstructionTransition,
  permitsPublication,
  type SellerInstructionContent,
} from "./seller-instruction";
import { checkSendEligibility } from "./subscription";

const broker = { kind: "staff", id: "staff-1" } as const;

const instruction: SellerInstructionContent = {
  commercialTerms: {
    price: { amountMinor: 9_500_000, currency: "EUR", period: "total", basis: "asking" },
  },
  disclosure: { publicPrecision: "settlement", showOwnerName: false },
  mediaUsageRights: { granted: true, scope: "Website gallery" },
  representationScope: "sale",
  exclusivity: "exclusive",
  commissionTerms: "3% of the achieved price, as signed",
  publicationPermission: true,
};

describe("seller instructions (architecture §6.3)", () => {
  it("AT18: agreement is recorded by staff with evidence and brokerage terms", () => {
    expect(
      guardSellerInstructionTransition("draft", "agreed", { content: instruction }, broker),
    ).toEqual({ outcome: "denied", code: "agreement_evidence_required" });
    expect(
      guardSellerInstructionTransition(
        "draft",
        "agreed",
        { content: { ...instruction, commissionTerms: null }, evidenceDocumentIds: ["d1"] },
        broker,
      ),
    ).toEqual({ outcome: "denied", code: "commission_terms_required" });
    expect(
      guardSellerInstructionTransition(
        "draft",
        "agreed",
        { content: instruction, evidenceDocumentIds: ["d1"] },
        { kind: "client", id: "owner-1" },
      ),
    ).toEqual({ outcome: "denied", code: "human_required" });
  });

  it("supports publication only while agreed, unexpired and permitting it", () => {
    const now = "2026-09-26T09:00:00Z";
    expect(permitsPublication({ state: "agreed", content: instruction }, now)).toBe(true);
    expect(permitsPublication({ state: "draft", content: instruction }, now)).toBe(false);
    expect(
      permitsPublication(
        { state: "agreed", content: { ...instruction, publicationPermission: false } },
        now,
      ),
    ).toBe(false);
    expect(
      permitsPublication(
        { state: "agreed", content: { ...instruction, expiresAt: "2026-09-01T00:00:00Z" } },
        now,
      ),
    ).toBe(false);
  });
});

describe("subscriptions (architecture §8.4)", () => {
  it("AT44: withdrawn consent stops queued work; purposes never merge", () => {
    const alerts = {
      purpose: "search_alerts",
      state: "active",
      verifiedAt: "2026-09-01T00:00:00Z",
    } as const;
    expect(checkSendEligibility(alerts, "search_alerts").outcome).toBe("allowed");
    expect(checkSendEligibility(alerts, "marketing")).toEqual({
      outcome: "denied",
      code: "purpose_mismatch",
    });
    expect(checkSendEligibility({ ...alerts, state: "withdrawn" }, "search_alerts")).toEqual({
      outcome: "denied",
      code: "subscription_not_active",
    });
    expect(checkSendEligibility({ ...alerts, verifiedAt: null }, "search_alerts")).toEqual({
      outcome: "denied",
      code: "channel_not_verified",
    });
  });
});

describe("external actions (architecture §15)", () => {
  it("AT51: a stale generation or revoked actor prevents a queued consequential action", () => {
    expect(
      checkExecution({ sourceGeneration: 2, currentGeneration: 3, actorStillAuthorized: true }),
    ).toEqual({ outcome: "denied", code: "generation_superseded" });
    expect(
      checkExecution({ sourceGeneration: 3, currentGeneration: 3, actorStillAuthorized: false }),
    ).toEqual({ outcome: "denied", code: "actor_revoked" });
    expect(
      checkExecution({
        sourceGeneration: null,
        currentGeneration: null,
        actorStillAuthorized: true,
      }).outcome,
    ).toBe("allowed");
  });

  it("AT47: an unknown outcome suspends resend until reconciled", () => {
    expect(externalActionMachine.check("outcome_unknown", "queued").outcome).toBe("denied");
    expect(externalActionMachine.check("outcome_unknown", "failed").outcome).toBe("allowed");
  });
});

describe("privacy requests (architecture §8.4)", () => {
  it("work starts after verification with a responsible person; completion records legal hold", () => {
    expect(guardPrivacyRequestTransition("verifying", "in_progress", {}, broker)).toEqual({
      outcome: "denied",
      code: "verification_required",
    });
    expect(
      guardPrivacyRequestTransition(
        "in_progress",
        "completed",
        { completionEvidence: "Export delivered" },
        broker,
      ),
    ).toEqual({ outcome: "denied", code: "legal_hold_disposition_required" });
  });
});

describe("release evidence (architecture §20.1)", () => {
  const evidence: ReleaseEvidenceRecord = {
    schemaVersion: 1,
    environment: "staging",
    releaseSha: "abc123",
    digests: { web: "sha256:1" },
    policyRevision: "policy-7",
    observedAt: "2026-09-26T08:00:00Z",
    source: "smoke-check",
    reviewer: null,
    assertions: [{ id: "AT01", passed: true }],
    redactionStatus: "no_personal_data",
  };
  const release = {
    environment: "staging",
    releaseSha: "abc123",
    policyRevision: "policy-7",
  } as const;
  const day = 86_400_000;

  it("counts only for the same release, environment and policy, fresh and passing", () => {
    expect(evidenceCounts(evidence, release, "2026-09-26T09:00:00Z", day)).toBe(true);
    expect(
      evidenceCounts(evidence, { ...release, releaseSha: "def456" }, "2026-09-26T09:00:00Z", day),
    ).toBe(false);
    expect(
      evidenceCounts(
        evidence,
        { ...release, environment: "production" },
        "2026-09-26T09:00:00Z",
        day,
      ),
    ).toBe(false);
    expect(evidenceCounts(evidence, release, "2026-09-28T09:00:00Z", day)).toBe(false);
    expect(
      evidenceCounts(
        { ...evidence, assertions: [{ id: "AT01", passed: false }] },
        release,
        "2026-09-26T09:00:00Z",
        day,
      ),
    ).toBe(false);
  });
});
