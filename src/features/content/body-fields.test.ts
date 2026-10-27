import { describe, expect, it } from "vitest";
import { type ContentBody, contentBody } from "@/domain/content-body";
import { contentBodyValues, emptyBlock, readCompositionFields } from "./body-fields";
import { contentDraftInput } from "./body-input";

describe("O21 native block authoring seam", () => {
  it("round-trips every supported block without flattening titles, items, links or multiline text", () => {
    const body: ContentBody = contentBody.parse({
      format: "blocks",
      title: "Synthetic",
      blocks: [
        { type: "heading", text: "Heading" },
        { type: "paragraph", text: "First line\nSecond line" },
        { type: "step", title: "First step", text: "Exact step." },
        { type: "list", items: ["First", "Second"] },
        { type: "callout", title: "Boundary", text: "Exact boundary." },
        { type: "link", text: "Source page", href: "/bg/help/synthetic" },
      ],
    });
    const values = contentBodyValues(body);
    expect(contentDraftInput(values)).toEqual({
      blocks: "blocks" in body ? body.blocks : [],
      text: undefined,
    });
    expect(
      contentDraftInput(contentBodyValues({ title: "Legacy", paragraphs: ["One", "Two"] })),
    ).toEqual({ text: "One\n\nTwo" });
  });

  it("reads named native fields before a stale hidden snapshot, preserving reading order", () => {
    const data = new FormData();
    for (const [index, row] of [
      { ...emptyBlock(), type: "heading", text: "Native heading" },
      { ...emptyBlock(), type: "step", title: "Native step", text: "Native details" },
      emptyBlock(),
    ].entries())
      for (const [key, value] of Object.entries(row)) data.set(`bodyBlocks.${index}.${key}`, value);
    const composition = readCompositionFields(data, "stale hidden snapshot");
    expect(
      contentDraftInput({ bodyFormat: "blocks", composition, text: "Unused old paragraphs" }),
    ).toEqual({
      blocks: [
        { type: "heading", text: "Native heading" },
        { type: "step", title: "Native step", text: "Native details" },
      ],
      text: undefined,
    });
  });

  it("rejects forged overflow, unknown modes, unsafe destinations and malformed snapshots", () => {
    const data = new FormData();
    data.set("bodyBlocks.0.type", "paragraph");
    data.set("bodyBlocks.0.text", "Exact");
    data.set("bodyBlocks.30.type", "paragraph");
    data.set("bodyBlocks.30.text", "Must not disappear");
    const invalid = [
      { bodyFormat: "blocks", composition: readCompositionFields(data, "[]"), text: "" },
      { bodyFormat: "html", composition: "[]", text: "" },
      { bodyFormat: "blocks", composition: "not JSON", text: "" },
      {
        bodyFormat: "blocks",
        composition: JSON.stringify([
          { ...emptyBlock(), type: "link", text: "Unsafe", href: "javascript:alert(1)" },
        ]),
        text: "",
      },
    ];
    for (const values of invalid)
      expect(() => contentDraftInput(values)).toThrow(
        expect.objectContaining({ code: "validation_failed" }),
      );
  });
});
