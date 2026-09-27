import { describe, expect, it } from "vitest";
import {
  type Approval,
  approvalCapability,
  canonicalJson,
  guardApprovalDecision,
  invalidateIfChanged,
  isApprovalValid,
} from "./approval";

const pending: Approval = {
  kind: "owner_acknowledgment",
  subject: { type: "listing_revision", id: "lr1", version: 3, hash: "h-price-95000" },
  state: "pending",
};
const owner = { kind: "client", id: "owner-1" } as const;

describe("approvals bound to a subject revision (architecture §7.2)", () => {
  it("AT18: an owner acknowledges the exact revision they saw", () => {
    expect(
      guardApprovalDecision(pending, "approved", { actor: owner, currentHash: "h-price-95000" })
        .outcome,
    ).toBe("allowed");
  });

  it("AT23: a changed price makes the pending approval refuse and an existing one invalid", () => {
    expect(
      guardApprovalDecision(pending, "approved", { actor: owner, currentHash: "h-price-99000" }),
    ).toEqual({
      outcome: "denied",
      code: "subject_changed",
    });
    const approved: Approval = { ...pending, state: "approved" };
    expect(isApprovalValid(approved, "h-price-99000")).toBe(false);
    expect(invalidateIfChanged(approved, "h-price-99000").state).toBe("invalidated");
    expect(invalidateIfChanged(approved, "h-price-95000")).toBe(approved);
  });

  it("AT52: the AI service cannot approve", () => {
    expect(
      guardApprovalDecision(pending, "approved", {
        actor: { kind: "ai_service", id: "hermes" },
        currentHash: "h-price-95000",
      }),
    ).toEqual({ outcome: "denied", code: "human_required" });
  });

  it("AT22: enforces a second reviewer only when policy requires one, without inventing one", () => {
    const factual: Approval = { ...pending, kind: "factual" };
    expect(
      guardApprovalDecision(factual, "approved", {
        actor: { kind: "staff", id: "editor-1" },
        currentHash: "h-price-95000",
        authorId: "editor-1",
        independentReviewRequired: true,
      }),
    ).toEqual({ outcome: "denied", code: "independent_review_required" });
    // An unknown author cannot prove the reviewer is a second person.
    expect(
      guardApprovalDecision(factual, "approved", {
        actor: { kind: "staff", id: "editor-1" },
        currentHash: "h-price-95000",
        independentReviewRequired: true,
      }),
    ).toEqual({ outcome: "denied", code: "author_unknown" });
    expect(
      guardApprovalDecision(factual, "approved", {
        actor: { kind: "staff", id: "reviewer-2" },
        currentHash: "h-price-95000",
        authorId: "editor-1",
        independentReviewRequired: true,
      }).outcome,
    ).toBe("allowed");
  });

  it("AT22: same-person editing and review is allowed and recorded as a separate decision", () => {
    const editorial: Approval = { ...pending, kind: "editorial" };
    expect(
      guardApprovalDecision(editorial, "approved", {
        actor: { kind: "staff", id: "editor-1" },
        currentHash: "h-price-95000",
        authorId: "editor-1",
      }).outcome,
    ).toBe("allowed");
    // A language approval is never factual, legal or publishing authority.
    expect(approvalCapability.language).toBe("translation.review");
    expect(approvalCapability.publication).toBe("publication.release");
    expect(approvalCapability.legal_process_claim).toBe("claim.approve");
  });

  it("an expiring approval fails closed without a clock and lapses at expiry", () => {
    const approved = { ...pending, state: "approved" as const, expiresAt: "2026-10-01T00:00:00Z" };
    expect(isApprovalValid(approved, "h-price-95000", "2026-09-30T00:00:00Z")).toBe(true);
    expect(isApprovalValid(approved, "h-price-95000", "2026-10-01T00:00:00Z")).toBe(false);
    expect(isApprovalValid(approved, "h-price-95000")).toBe(false);
  });

  it("canonical JSON is independent of key order", () => {
    expect(canonicalJson({ b: 1, a: [{ d: 2, c: null }] })).toBe(
      canonicalJson({ a: [{ c: null, d: 2 }], b: 1 }),
    );
    expect(canonicalJson({ a: 1, b: undefined })).toBe('{"a":1}');
  });
});
