import { describe, expect, it } from "vitest";
import { createListingSchema, draftSchema, emptyDraft } from "./contracts";

const draft = { ...emptyDraft, sourceReference: "synthetic-source-record" };

describe("O11/O12 listing title contract", () => {
  it.each(["\n", "\r", "\r\n", "\n\n", "\v", "\f", "\u0085", "\u2028", "\u2029"])(
    "stores a single-line title when the input contains %j",
    (lineBreak) => {
      const parsed = draftSchema.parse({
        ...draft,
        title: `  Двустаен${lineBreak}апартамент в Сандански  `,
        description: "Първи ред.\nВтори ред.",
      });
      expect(parsed.title).toBe("Двустаен апартамент в Сандански");
      expect(parsed.description).toBe("Първи ред.\nВтори ред.");
    },
  );

  it("uses the same title guard when creating a listing", () => {
    const parsed = createListingSchema.parse({
      propertyType: "apartment",
      purpose: "sale",
      country: "BG",
      region: "Благоевград",
      settlement: "Сандански",
      exactAddress: "",
      draft: { ...draft, title: "Двустаен\r\nапартамент" },
    });
    expect(parsed.draft.title).toBe("Двустаен апартамент");
  });

  it("enforces the title length limit on the normalized value", () => {
    const title = `${"а".repeat(90)}\r\n${"б".repeat(89)}`;
    expect(draftSchema.parse({ ...draft, title }).title).toHaveLength(180);
    const invalid = draftSchema.safeParse({ ...draft, title: `${title}в` });
    expect(invalid.success).toBe(false);
    if (!invalid.success) expect(invalid.error.issues[0]?.path).toEqual(["title"]);
  });
});
