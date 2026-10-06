import { describe, expect, it } from "vitest";
import type { FactState } from "@/domain/facts";
import { draftSchema } from "./contracts";
import {
  type WorkingDraftFact,
  type WorkingDraftRevision,
  workingDraftFrom,
} from "./working-draft";

const sourceUrl = "https://legacy.example.test/listings/MS-00815";
const eur = (amountMinor: number) => ({
  amountMinor,
  currency: "EUR",
  period: "total",
  basis: "asking",
});
function revision(
  price: unknown = { state: "known", value: eur(9_500_003) },
): WorkingDraftRevision {
  return {
    terms: { purpose: "sale", facts: { price } },
    sourceCopy: {
      locale: "bg",
      text: {
        title: "Двустаен апартамент",
        description: "Точният записан текст.",
        origin: "legacy_translation_draft",
        humanReviewed: false,
        sourceUrl,
      },
      legacySource: { locale: "ru", title: "Квартира", description: "Исходный текст." },
    },
  };
}
function fact(
  fieldKey: string,
  value: unknown,
  patch: Partial<WorkingDraftFact> = {},
): WorkingDraftFact {
  return {
    fieldKey,
    state: "known",
    value,
    unit: null,
    basis: null,
    sourceClass: "legacy_import",
    sourceReference: sourceUrl,
    sourceLanguage: null,
    ...patch,
  };
}
const area = (value: number, basis = "usable") => ({ value, unit: "m2", basis });

describe("workingDraftFrom", () => {
  it("projects imported source copy and exact facts without replacing original evidence language", () => {
    const input = revision();
    const draft = workingDraftFrom(input, [
      fact("area.usable", area(74.5), { unit: "m2", basis: "usable" }),
      fact("bedrooms", 2),
    ]);
    expect(draft).toEqual({
      title: "Двустаен апартамент",
      description: "Точният записан текст.",
      brokerNote: "",
      priceState: "known",
      price: "95000.03",
      areaState: "known",
      area: "74.5",
      areaBasis: "usable",
      bedroomsState: "known",
      bedrooms: "2",
      sourceReference: sourceUrl,
      sourceClass: "legacy_import",
      sourceLanguage: "ru",
    });
    expect(draftSchema.safeParse(draft).success).toBe(true);
    expect(input.sourceCopy).toMatchObject({ text: { humanReviewed: false } });
  });

  it.each([
    [0, "0.00"],
    [1, "0.01"],
    [10, "0.10"],
    [101, "1.01"],
    [Number.MAX_SAFE_INTEGER, "90071992547409.91"],
  ])("formats minor units %s exactly as %s", (amountMinor, expected) => {
    const draft = workingDraftFrom(revision({ state: "known", value: eur(amountMinor) }), []);
    expect(draft.price).toBe(expected);
    const [whole = "", fraction = ""] = draft.price.split(".");
    expect(BigInt(whole) * 100n + BigInt(fraction)).toBe(BigInt(amountMinor));
  });

  it("preserves every conflict candidate and a recorded zero bedroom count", () => {
    const draft = workingDraftFrom(
      revision({ state: "conflicting", value: [eur(101), eur(110)] }),
      [
        fact("area.usable", [area(74.5), area(75.25)], { state: "conflicting" }),
        fact("bedrooms", [0, 2], { state: "conflicting" }),
      ],
    );
    expect(draft).toMatchObject({
      priceState: "conflicting",
      price: "1.01|1.10",
      areaState: "conflicting",
      area: "74.5|75.25",
      areaBasis: "usable",
      bedroomsState: "conflicting",
      bedrooms: "0|2",
    });
  });

  it.each<FactState>(["unknown", "not_supplied", "not_applicable", "withheld"])(
    "preserves absent state %s without displaying a stale value",
    (state) => {
      const draft = workingDraftFrom(revision({ state, value: eur(1) }), [
        fact("area.land", area(80, "land"), { state }),
        fact("bedrooms", 0, { state }),
      ]);
      expect(draft).toMatchObject({
        priceState: state,
        areaState: state,
        bedroomsState: state,
        price: "",
        area: "",
        bedrooms: "",
        areaBasis: "land",
      });
    },
  );

  it.each([
    eur(-1),
    eur(1.5),
    eur(Number.MAX_SAFE_INTEGER + 1),
    { ...eur(100), currency: "BGN" },
    { ...eur(100), period: "year" },
    { ...eur(100), period: "month" },
    { amountMinor: 100, currency: "EUR" },
  ])("keeps an invalid or unrepresentable price unknown: %j", (value) => {
    expect(workingDraftFrom(revision({ state: "known", value }), [])).toMatchObject({
      priceState: "unknown",
      price: "",
    });
  });

  it("never drops an invalid conflict candidate or promotes a single candidate to a fact", () => {
    expect(
      workingDraftFrom(revision({ state: "conflicting", value: [eur(1), eur(-1)] }), []),
    ).toMatchObject({ priceState: "unknown", price: "" });
    expect(workingDraftFrom(revision({ state: "conflicting", value: [eur(1)] }), [])).toMatchObject(
      { priceState: "unknown", price: "" },
    );
    expect(
      workingDraftFrom(revision({ state: "known", value: [eur(1), eur(2)] }), []),
    ).toMatchObject({ priceState: "unknown", price: "" });
  });

  it("requires a broker choice for multiple area bases and does not use rooms as bedrooms", () => {
    expect(
      workingDraftFrom(revision(), [
        fact("area.living", area(70, "living")),
        fact("area.usable", area(80)),
        fact("rooms", 3),
      ]),
    ).toMatchObject({
      areaState: "unknown",
      area: "",
      areaBasis: "",
      bedroomsState: "unknown",
      bedrooms: "",
    });
  });

  it.each([
    area(74.555),
    area(0),
    { ...area(74), unit: "ft2" },
    { ...area(74), basis: "living" },
    74,
  ])("does not round, change units, or substitute area basis: %j", (value) => {
    expect(workingDraftFrom(revision(), [fact("area.usable", value)])).toMatchObject({
      areaState: "unknown",
      area: "",
      areaBasis: "usable",
    });
  });

  it("does not expose a price with an unconfirmed period or an unclassified area", () => {
    expect(
      workingDraftFrom(
        {
          terms: { facts: { "price.amount_without_period": { state: "known", value: eur(100) } } },
          sourceCopy: {},
        },
        [fact("area", 75, { state: "unknown" }), fact("bedrooms", 1.5)],
      ),
    ).toMatchObject({
      priceState: "unknown",
      price: "",
      areaState: "unknown",
      area: "",
      areaBasis: "",
      bedroomsState: "unknown",
      bedrooms: "",
    });
  });

  it("keeps missing evidence blank and fails Save validation", () => {
    const draft = workingDraftFrom(null, []);
    expect(Object.values(draft).every((value) => value === "" || value === "unknown")).toBe(true);
    expect(draftSchema.safeParse(draft).success).toBe(false);
    expect(workingDraftFrom({ terms: {}, sourceCopy: { locale: "bg", text: null } }, [])).toEqual(
      draft,
    );
  });

  it("uses only the explicit legacy source URL and original source language as fallback", () => {
    const draft = workingDraftFrom(revision(), []);
    expect(draft).toMatchObject({
      sourceReference: sourceUrl,
      sourceClass: "",
      sourceLanguage: "ru",
    });
    expect(
      workingDraftFrom(
        {
          terms: {},
          sourceCopy: {
            locale: "bg",
            text: {
              title: "BG draft",
              origin: "legacy_translation_draft",
              sourceUrl,
            },
          },
        },
        [],
      ),
    ).toMatchObject({ sourceReference: sourceUrl, sourceLanguage: "" });
    expect(
      workingDraftFrom(
        {
          terms: {},
          sourceCopy: {
            locale: "bg",
            text: {
              origin: "legacy_source",
              sourceUrl,
            },
          },
        },
        [],
      ),
    ).toMatchObject({ sourceLanguage: "bg" });
  });

  it("keeps price provenance and fills its language only from the same explicit source", () => {
    const draft = workingDraftFrom(
      revision({
        state: "known",
        value: eur(101),
        sourceReference: "document-price-1",
        sourceClass: "document_reviewed",
      }),
      [
        fact("bedrooms", 2, {
          sourceReference: "document-price-1",
          sourceClass: "document_reviewed",
        }),
        fact("area.usable", area(75), {
          sourceReference: "document-price-1",
          sourceClass: "document_reviewed",
          sourceLanguage: "en",
        }),
      ],
    );
    expect(draft).toMatchObject({
      sourceReference: "document-price-1",
      sourceClass: "document_reviewed",
      sourceLanguage: "en",
    });
    expect(
      workingDraftFrom(
        revision({
          state: "known",
          value: eur(101),
          sourceReference: "document-price-1",
          sourceClass: "document_reviewed",
        }),
        [
          fact("bedrooms", 2, {
            sourceReference: "document-price-1",
            sourceClass: "document_reviewed",
          }),
        ],
      ),
    ).toMatchObject({ sourceLanguage: "" });
  });

  it.each([
    { sourceReference: "different-document" },
    { sourceClass: "owner_confirmed" as const },
    { sourceLanguage: "ru" },
  ])("requires a broker provenance choice for mixed recorded evidence: %j", (patch) => {
    const draft = workingDraftFrom(
      revision({
        state: "known",
        value: eur(101),
        sourceReference: sourceUrl,
        sourceClass: "document_reviewed",
        sourceLanguage: "en",
      }),
      [
        fact("area.usable", area(75), {
          sourceClass: "document_reviewed",
          sourceLanguage: "en",
          ...patch,
        }),
        fact("bedrooms", 2, {
          sourceClass: "document_reviewed",
          sourceLanguage: "en",
        }),
      ],
    );
    expect(draft).toMatchObject({
      price: "1.01",
      area: "75",
      bedrooms: "2",
      sourceReference: "",
      sourceClass: "",
      sourceLanguage: "",
    });
    expect(draftSchema.safeParse(draft).success).toBe(false);
  });

  it("preserves an unsupported recorded evidence language for broker correction", () => {
    const draft = workingDraftFrom(revision(), [
      fact("area.usable", area(75), { sourceLanguage: "fr" }),
    ]);
    expect(draft.sourceLanguage).toBe("fr");
    expect(draftSchema.safeParse(draft).success).toBe(false);
  });

  it("reads frozen immutable input and returns independent editable fields", () => {
    const input = revision({ state: "conflicting", value: [eur(101), eur(110)] });
    const facts = [fact("area.usable", area(75)), fact("bedrooms", 0)];
    const before = structuredClone({ input, facts });
    function freeze(value: unknown) {
      if (value && typeof value === "object") {
        Object.freeze(value);
        for (const nested of Object.values(value)) freeze(nested);
      }
    }
    freeze(input);
    freeze(facts);
    const draft = workingDraftFrom(input, facts);
    draft.title = "Broker edit";
    draft.price = "9.99";
    expect({ input, facts }).toEqual(before);
  });
});
