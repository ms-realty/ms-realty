import { describe, expect, it } from "vitest";
import { numbersIn, translationChecks, withoutLegacySuffix } from "./translation-checks";

const source = {
  title: "Двустаен апартамент в Сандански",
  description:
    "Светъл двустаен апартамент от 68 кв.м. в центъра на Сандански, на 2-ри етаж. Цена 95 000 евро.",
};
const english = {
  locale: "en" as const,
  title: "Two-room flat in Sandanski",
  description:
    "A bright two-room flat of 68 sq.m. in the centre of Sandanski, on the 2nd floor. Price 95,000 euro.",
  source,
  figures: [95_000, 68, 2, 815],
  placeNames: ["Сандански", "Sandanski"],
};

describe("translation checks (ADR 0012)", () => {
  it("passes a faithful translation", () => {
    expect(translationChecks(english)).toEqual({
      blockers: [],
      warnings: [],
      unexpectedNumbers: [],
    });
  });

  it("reads grouped numbers as one figure", () => {
    expect([...numbersIn("95 000, 95.000 and 95,000 for 68 m2")]).toEqual([95_000, 68, 2]);
  });

  it("blocks a translation whose figures disagree with the listing", () => {
    const wrong = translationChecks({ ...english, description: `${english.description} 59,000` });
    expect(wrong.blockers).toEqual(["numbers_differ"]);
    expect(wrong.unexpectedNumbers).toEqual([59_000]);
  });

  it("blocks empty text and text copied from the source", () => {
    expect(translationChecks({ ...english, description: " " }).blockers).toContain("empty");
    expect(translationChecks({ ...english, title: source.title }).blockers).toEqual([
      "same_as_source",
    ]);
  });

  it("blocks Sandanski framed as a sea or beach place in any language", () => {
    for (const [locale, description] of [
      ["en", "Flat in Sandanski, 68 m2, close to the beach."],
      ["de", "Wohnung in Sandanski, 68 m2, nahe am Strand."],
      ["el", "Διαμέρισμα στο Σαντάνσκι, 68 m2, κοντά στη θάλασσα."],
    ] as const)
      expect(
        translationChecks({ ...english, locale, description: `${description} ${"x ".repeat(20)}` })
          .blockers,
      ).toContain("inland_framed_as_coast");
  });

  it("reads coast words only in their own language", () => {
    // Dutch "meer" means "more"; it is the German word for sea.
    const dutch = {
      ...english,
      locale: "nl" as const,
      title: "Appartement in Sandanski",
      description:
        "Een licht appartement van 68 m2 in Sandanski, op de 2e verdieping. Neem voor meer informatie contact op. Prijs 95.000 euro.",
    };
    expect(translationChecks(dutch).blockers).toEqual([]);
    expect(
      translationChecks({ ...dutch, description: `${dutch.description} Dicht bij de zee.` })
        .blockers,
    ).toEqual(["inland_framed_as_coast"]);
  });

  it("blocks an implausible length and warns about an unusual one", () => {
    expect(translationChecks({ ...english, description: "Flat 68." }).blockers).toEqual([
      "length_implausible",
    ]);
    expect(
      translationChecks({ ...english, description: english.description.slice(0, 40) }).warnings,
    ).toContain("length_unusual");
  });

  it("warns when the place the source names is missing", () => {
    expect(
      translationChecks({
        ...english,
        title: "Two-room flat",
        description: english.description.replaceAll("Sandanski", "town"),
      }).warnings,
    ).toEqual(["place_name_missing"]);
  });

  it("recognises the old site's title endings from the tenant profile", () => {
    expect(
      withoutLegacySuffix(
        "Продажба на тристаен апартамент в Паралия Офринио, Гърция - Недвижими имоти в България. Агенция в Сандански",
        "bg",
      ),
    ).toBe("Продажба на тристаен апартамент в Паралия Офринио, Гърция");
    expect(withoutLegacySuffix("Flat - real estate in Sandanski", "en")).toBe("Flat");
    expect(withoutLegacySuffix("Двустаен апартамент в гр.Сандански", "bg")).toBeNull();
    expect(withoutLegacySuffix("Wohnung – Immobilien in Sandanski", "de")).toBe("Wohnung");
  });
});
