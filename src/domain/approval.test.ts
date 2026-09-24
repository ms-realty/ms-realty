import { describe, expect, it } from "vitest";
import {
  type Approval,
  canonicalJson,
  guardApprovalDecision,
  invalidateIfChanged,
  isApprovalValid,
} from "./approval";

const pending: Approval = {
  kind: "owner_instruction",
  subject: { type: "listing_version", id: "lv1", version: 3, hash: "h-price-95000" },
  state: "pending",
};
const owner = { kind: "client", id: "owner-1" } as const;

describe("approvals bound to a subject version", () => {
  it("A31: an owner approves the exact version they saw", () => {
    expect(
      guardApprovalDecision(pending, "approved", { actor: owner, currentHash: "h-price-95000" })
        .outcome,
    ).toBe("allowed");
  });

  it("A31: a changed price makes the pending approval refuse and an existing one invalid", () => {
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

  it("A66: the AI service cannot approve", () => {
    expect(
      guardApprovalDecision(pending, "approved", {
        actor: { kind: "ai_service", id: "hermes" },
        currentHash: "h-price-95000",
      }),
    ).toEqual({ outcome: "denied", code: "human_required" });
  });

  it("enforces a second reviewer when policy requires one, without inventing one", () => {
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

  it("canonical JSON is independent of key order", () => {
    expect(canonicalJson({ b: 1, a: [{ d: 2, c: null }] })).toBe(
      canonicalJson({ a: [{ c: null, d: 2 }], b: 1 }),
    );
    expect(canonicalJson({ a: 1, b: undefined })).toBe('{"a":1}');
  });
});
