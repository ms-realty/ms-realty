import { describe, expect, it } from "vitest";
import { type LocaleSource, validateLocaleDraft } from "./locale-draft";

const source: LocaleSource = {
  id: "synthetic",
  version: 1,
  listingId: "synthetic",
  reference: "MS-123",
  targetLocale: "en",
  sourceUrl: "https://example.test/bg/properties/MS-123/ms-123",
  fields: {
    title: "Синтетичен апартамент MS-123",
    description: "2 спални, 68 m². Цена 95000 EUR.",
  },
  protectedFacts: {},
  protectedFactsDigest: "synthetic",
};
const good = {
  title: "Synthetic apartment MS-123",
  description: "2 bedrooms, 68 m². Price 95000 EUR.",
  citations: [{ field: "description", quote: "2 спални" }],
  warnings: ["Synthetic only"],
};
describe("locale.draft deterministic evidence checks", () => {
  it("preserves the exact protected lexical numbers and source quotes", () => {
    expect(validateLocaleDraft(good, source)).toEqual(good);
  });
  it("rejects invented/missing numbers, identifiers, URLs and fabricated quotes", () => {
    for (const description of [
      "3 bedrooms, 68 m². Price 95000 EUR.",
      "2 bedrooms. Price 95000 EUR.",
    ])
      expect(() => validateLocaleDraft({ ...good, description }, source)).toThrow(
        "protected_number_changed",
      );
    expect(() =>
      validateLocaleDraft({ ...good, title: "Synthetic apartment 123" }, source),
    ).toThrow("protected_identifier_changed");
    expect(() =>
      validateLocaleDraft(
        { ...good, description: `${good.description} https://evil.test` },
        source,
      ),
    ).toThrow("protected_identifier_changed");
    expect(() =>
      validateLocaleDraft(
        { ...good, citations: [{ field: "description", quote: "sea view" }] },
        source,
      ),
    ).toThrow("invalid_source_pointer");
  });
});
