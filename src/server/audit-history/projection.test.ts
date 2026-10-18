import { describe, expect, it } from "vitest";
import { projectRecordedChange, safeRecordedText } from "./projection";

describe("O26L recorded listing history projection", () => {
  it("keeps the recorded working version and never fills in missing reasons or old values", () => {
    expect(projectRecordedChange("listing.draft.saved", { newVersion: 3 })).toEqual({
      kind: "working",
      action: "draftSaved",
      fields: [{ key: "version", value: 3 }],
      reason: null,
      reasonDecision: null,
    });
  });
  it("does not turn an activation action or an unknown event into proof of publication", () => {
    expect(projectRecordedChange("publication.activate", {}).kind).toBe("publication");
    expect(projectRecordedChange("unknown.action", { published: true }).kind).toBe("other");
  });
  it("keeps only allowed field shapes and removes contacts and credentials from recorded text", () => {
    const projected = projectRecordedChange("listing.draft.saved", {
      newVersion: "secret@example.test",
      reason: "Checked source. Contact secret@example.test or +359 888 123 456; token=secret-value",
      token: "RAW_SECRET",
      contact: { name: "PRIVATE_CONTACT" },
      old: { price: "PRIVATE_OLD" },
    });
    expect(projected.fields).toEqual([]);
    expect(projected.reason).toContain("Checked source.");
    expect(JSON.stringify(projected)).not.toMatch(
      /secret@example|888 123|secret-value|RAW_SECRET|PRIVATE_/,
    );
    expect(safeRecordedText("Bearer abc.def.ghi")).not.toContain("abc.def.ghi");
  });
});
