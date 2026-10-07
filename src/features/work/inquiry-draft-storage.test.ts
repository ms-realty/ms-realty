// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FormState } from "@/ui/form/contract";
import {
  claimInquiryDraftOwner,
  ownsInquiryDrafts,
  readInquiryDraft,
  releaseInquiryDraftOwner,
  retainInquiryDraft,
} from "./inquiry-draft-storage";

const owner = { id: "synthetic-session", expiresAt: Number.MAX_SAFE_INTEGER };
const initial: FormState<{ note: string; reviewed: string }> = {
  operationId: `${"a".repeat(43)}.${"a".repeat(32)}`,
  expectedRevision: 2,
  responseId: "initial",
  outcome: { kind: "idle" },
  values: { note: "", reviewed: "" },
};
const key = "msr.inquiry-draft.one:contact";
const stored = {
  ownerId: owner.id,
  revision: 2,
  values: { note: "Synthetic private draft", reviewed: "yes" },
};

beforeEach(() => {
  releaseInquiryDraftOwner();
  sessionStorage.clear();
  claimInquiryDraftOwner(owner);
});
afterEach(() => {
  vi.restoreAllMocks();
  releaseInquiryDraftOwner();
  sessionStorage.clear();
});

describe("O02 private draft storage boundary", () => {
  it.each([
    ["corrupt JSON", "{unfinished"],
    ["oversized entry", JSON.stringify(stored).padEnd(32_001)],
    [
      "oversized field",
      JSON.stringify({ ...stored, values: { ...stored.values, note: "x".repeat(4_001) } }),
    ],
    ["invalid revision", JSON.stringify({ ...stored, revision: -1 })],
    ["missing field", JSON.stringify({ ...stored, values: { note: "Missing review field" } })],
    ["foreign owner", JSON.stringify({ ...stored, ownerId: "another-session" })],
    [
      "invalid operation reference",
      JSON.stringify({ ...stored, operation: { id: "untrusted", revision: 2 } }),
    ],
    [
      "invalid recovery flag",
      JSON.stringify({
        ...stored,
        operation: { id: initial.operationId, revision: 2, preserveOnSuccess: "yes" },
      }),
    ],
  ])("ignores %s without restoring unsafe private input", (_reason, value) => {
    sessionStorage.setItem(key, value);
    expect(readInquiryDraft(owner, "one", "contact", initial)).toBeNull();
  });

  it("accepts entries at the storage and field limits", () => {
    const note = "x".repeat(4_000);
    sessionStorage.setItem(
      key,
      JSON.stringify({ ...stored, values: { ...stored.values, note } }).padEnd(32_000),
    );
    expect(readInquiryDraft(owner, "one", "contact", initial)?.values.note).toBe(note);
  });

  it("removes private entries with a corrupt owner marker while preserving other preferences", () => {
    sessionStorage.setItem(key, JSON.stringify(stored));
    sessionStorage.setItem("msr.inquiry-draft.owner", "{corrupt");
    sessionStorage.setItem("other-feature", "retained");
    expect(claimInquiryDraftOwner(owner)).toBe(true);
    expect(sessionStorage.getItem(key)).toBeNull();
    expect(sessionStorage.getItem("other-feature")).toBe("retained");
  });

  it.each(["getItem", "setItem"] as const)(
    "retains memory and the leave guard when %s throws, then releases them on sign-out",
    (method) => {
      vi.spyOn(Storage.prototype, method).mockImplementation(() => {
        throw new Error("Storage denied");
      });
      const snapshot = {
        state: initial,
        values: { ...initial.values, note: "Memory-only synthetic draft" },
        pending: false,
      };
      expect(retainInquiryDraft(owner, "one", "contact", initial, snapshot)).toBe(false);
      expect(readInquiryDraft(owner, "one", "contact", initial)?.values.note).toBe(
        snapshot.values.note,
      );
      const before = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(before);
      expect(before.defaultPrevented).toBe(true);
      releaseInquiryDraftOwner();
      expect(ownsInquiryDrafts(owner)).toBe(false);
      expect(readInquiryDraft(owner, "one", "contact", initial)).toBeNull();
      expect(retainInquiryDraft(owner, "one", "contact", initial, snapshot)).toBe(false);
      const after = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(after);
      expect(after.defaultPrevented).toBe(false);
    },
  );

  it("releases memory even if removing browser storage is denied", () => {
    retainInquiryDraft(owner, "one", "contact", initial, {
      state: initial,
      values: stored.values,
      pending: false,
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("Removal denied");
    });
    expect(() => releaseInquiryDraftOwner()).not.toThrow();
    expect(ownsInquiryDrafts(owner)).toBe(false);
    expect(readInquiryDraft(owner, "one", "contact", initial)).toBeNull();
  });
});
