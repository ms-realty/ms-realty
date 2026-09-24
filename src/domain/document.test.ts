import { describe, expect, it } from "vitest";
import { documentMachine, guardDocumentTransition, isDocumentExposable } from "./document";

const reviewer = { kind: "staff", id: "rev-1" } as const;

describe("documents (§07.5, F15)", () => {
  it("A37: an interrupted upload is never labeled uploaded", () => {
    expect(
      guardDocumentTransition(
        "uploading",
        "uploaded",
        { byteSize: 1000, bytesReceived: 600, sha256: "x" },
        reviewer,
      ),
    ).toEqual({ outcome: "denied", code: "upload_incomplete" });
    expect(documentMachine.check("uploading", "selected").outcome).toBe("allowed");
  });

  it("A38: scanning, human review and professional validation stay separate", () => {
    expect(documentMachine.check("scanning", "reviewed").outcome).toBe("denied");
    expect(
      guardDocumentTransition("scanning", "ready_for_review", { scan: "infected" }, reviewer),
    ).toEqual({
      outcome: "denied",
      code: "scan_not_clean",
    });
    expect(guardDocumentTransition("ready_for_review", "reviewed", {}, reviewer)).toEqual({
      outcome: "denied",
      code: "review_type_required",
    });
  });

  it("A38: unsafe or unscanned files are not exposed", () => {
    expect(isDocumentExposable("scanning", "pending")).toBe(false);
    expect(isDocumentExposable("rejected", "infected")).toBe(false);
    expect(isDocumentExposable("ready_for_review", "clean")).toBe(true);
  });

  it("superseding needs the replacement version", () => {
    expect(guardDocumentTransition("reviewed", "superseded", {}, reviewer)).toEqual({
      outcome: "denied",
      code: "replacement_required",
    });
  });
});
