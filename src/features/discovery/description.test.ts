import { describe, expect, it } from "vitest";
import { collapseAboveLines, descriptionParagraphs, estimatedLines } from "./description";

describe("description layout", () => {
  it("splits on every existing line break and keeps the words exactly", () => {
    const text = "First line.\r\nSecond line.\n\n  Third line.  \n";
    expect(descriptionParagraphs(text)).toEqual(["First line.", "Second line.", "Third line."]);
    expect(descriptionParagraphs(text).join(" ")).toBe("First line. Second line. Third line.");
  });

  it("leaves a text without line breaks as one paragraph, and an empty one as none", () => {
    expect(descriptionParagraphs("One long run of text.")).toEqual(["One long run of text."]);
    expect(descriptionParagraphs(null)).toEqual([]);
    expect(descriptionParagraphs("  \n ")).toEqual([]);
  });

  it("collapses only what is longer than about ten lines on a phone", () => {
    const short = descriptionParagraphs("x".repeat(300));
    const long = descriptionParagraphs("x".repeat(600));
    expect(estimatedLines(short)).toBeLessThanOrEqual(collapseAboveLines);
    expect(estimatedLines(long)).toBeGreaterThan(collapseAboveLines);
    // Many short paragraphs count their gaps too.
    expect(estimatedLines(Array.from({ length: 8 }, () => "Short line of text here."))).toBe(15);
  });
});
