import { describe, expect, it } from "vitest";
import type { SearchCriteria } from "@/server/listings/view-models";
import { fill, matchingCopy } from "./matching-copy";
import { type MatchCard, matchingPhrases } from "./matching-phrases";

const plain = (value: string) => value.replace(/\s/g, " ");
const provenance = { sourceClass: "owner_confirmed", observedAt: "2026-10-01T00:00:00Z" };
const card = (price: number, presented = "available") =>
  ({
    reference: "MS-00200",
    title: "Двустаен апартамент",
    purpose: "sale",
    propertyType: "apartment",
    price: {
      state: "known",
      value: { amountMinor: price * 100, currency: "EUR", period: "total", basis: "asking" },
      provenance,
    },
    place: {
      country: "BG",
      district: null,
      municipality: null,
      settlement: {
        id: "place-1",
        level: "settlement",
        slug: "sandanski",
        name: "Сандански",
        nameNative: "Сандански",
        nameLatin: "Sandanski",
      },
      neighborhood: null,
      precision: "settlement",
    },
    bedrooms: { state: "known", value: 2, provenance },
    area: { state: "known", value: { value: 68, unit: "m2", basis: "living" }, provenance },
    availability: { presented },
  }) as unknown as MatchCard;
const criteria: SearchCriteria = {
  purpose: "sale",
  propertyTypes: ["apartment"],
  placeIds: ["place-1"],
  price: { currency: "EUR", max: 13_000_000 },
  rooms: { min: 3 },
};
const c = matchingCopy("bg");
const phrases = matchingPhrases("bg", c, criteria, new Map([["place-1", "Сандански"]]));

describe("O07 fact words", () => {
  it("summarises what the client wants as recorded", () => {
    expect(plain(phrases.summary())).toBe(
      "Покупка · апартамент · Сандански · до 130 000 € · поне 3 стаи",
    );
  });

  it("shows availability only as the server confirmed it, with the listing's actual status", () => {
    const confirmed = (presented: string) =>
      phrases.availability({ confirmedCriteria: ["availability"], availability: { presented } });
    expect(confirmed("available")).toBe("Наличност: Свободен");
    expect(confirmed("negotiating")).toBe("Наличност: В процес на договаряне");
    expect(confirmed("reserved_with_recorded_basis")).toBe("Наличност: Резервиран");
    expect(confirmed("confirmation_required")).toBeNull();
    expect(
      phrases.availability({ confirmedCriteria: [], availability: { presented: "available" } }),
    ).toBeNull();
    expect(phrases.unknownLine("availability")).toBe(
      "Наличност: не знаем дали имотът още се продава.",
    );
    expect(phrases.name("availability")).toBe("наличност");
  });

  it("puts the listing's own value first in a violation and never a requested value as a fact", () => {
    expect(plain(phrases.violation("price", card(135_000)))).toBe(
      "Цена: 135 000 € — над бюджета до 130 000 €.",
    );
    // The card has no room count: only what the client asked for is named.
    expect(phrases.violation("rooms", card(105_000))).toBe("Стаи: търси се поне 3 стаи.");
    expect(fill(c.check.noMatchNotChecked(1), { fact: phrases.definites(["price"], true) })).toBe(
      "Другото не е проверено докрай, защото цената вече не отговаря.",
    );
    expect(
      fill(c.next.checkNoMatch, { reference: "MS-00200", fact: phrases.definites(["price"]) }),
    ).toBe("MS-00200 не отговаря на цената. Върнете се към списъка и изберете друг имот.");
  });
});

describe("O07 copy catalogue", () => {
  const strings = (value: unknown, path = ""): [string, string][] => {
    if (typeof value === "string") return [[path, value]];
    if (typeof value === "function")
      return [1, 2, 5].map((count) => [`${path}(${count})`, String(value(count))]);
    if (Array.isArray(value))
      return value.flatMap((entry, index) => strings(entry, `${path}[${index}]`));
    if (value && typeof value === "object")
      return Object.entries(value).flatMap(([key, entry]) => strings(entry, `${path}.${key}`));
    return [];
  };

  it("never uses the model words or the old staff noun on screen", () => {
    for (const locale of ["bg", "ru", "en"]) {
      for (const [path, text] of strings(matchingCopy(locale))) {
        expect(text, `${locale}${path}`).not.toMatch(/бриф|интерес|кандидат|критери|случа[йя]/i);
        expect(text, `${locale}${path}`).not.toMatch(
          /\b(brief|interests?|candidates?|criteria|case)\b/i,
        );
      }
    }
  });

  it("gives every locale the same placeholders as the Bulgarian source", () => {
    const params = (text: string) =>
      [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
    const source = new Map(strings(matchingCopy("bg")));
    for (const locale of ["ru", "en"])
      for (const [path, text] of strings(matchingCopy(locale)))
        expect(params(text), `${locale}${path}`).toEqual(params(source.get(path) ?? ""));
  });
});
