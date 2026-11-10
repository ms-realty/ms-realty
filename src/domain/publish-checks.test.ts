import { describe, expect, it } from "vitest";
import { framesInlandAsCoast, type PublishCheckInput, publishChecks } from "./publish-checks";

const ready: PublishCheckInput = {
  propertyType: "apartment",
  commercialState: "confirmation_required",
  title: "Двустаен апартамент в Сандански",
  description: "Светъл двустаен апартамент в центъра на Сандански. ".repeat(6),
  priceState: "known",
  locationKnown: true,
  bedroomsState: "known",
  photos: { ready: 3, notReady: 0 },
  placeNames: ["Сандански", "Sandanski"],
  texts: ["Двустаен апартамент в Сандански", "Светъл двустаен апартамент в центъра."],
};

describe("publish checks (ADR 0012)", () => {
  it("passes a complete imported listing with nothing to warn about", () => {
    expect(publishChecks(ready)).toEqual({ blockers: [], warnings: [] });
  });

  it("blocks without a title or description in the source language", () => {
    expect(publishChecks({ ...ready, title: "  " }).blockers).toEqual(["title_missing"]);
    expect(publishChecks({ ...ready, description: "" }).blockers).toEqual(["description_missing"]);
  });

  it("accepts a stated price or price on request, and blocks anything else", () => {
    expect(publishChecks({ ...ready, priceState: "withheld" }).blockers).toEqual([]);
    for (const priceState of ["unknown", "conflicting", "not_supplied", null] as const)
      expect(publishChecks({ ...ready, priceState }).blockers).toEqual(["price_undecided"]);
  });

  it("asks for the rent period when only a rent amount was recorded, never guessing it", () => {
    const rent = { ...ready, priceState: "unknown" as const, rentAmountWithoutPeriod: true };
    expect(publishChecks(rent).blockers).toEqual(["rent_period_unconfirmed"]);
    expect(publishChecks({ ...rent, rentPeriodConfirmed: true }).blockers).toEqual([]);
  });

  it("blocks without a location", () => {
    expect(publishChecks({ ...ready, locationKnown: false }).blockers).toEqual([
      "location_missing",
    ]);
  });

  it("blocks sold, let and withdrawn listings but not ones still on the market", () => {
    for (const commercialState of ["sold", "let", "withdrawn"] as const)
      expect(publishChecks({ ...ready, commercialState }).blockers).toEqual(["not_available"]);
    for (const commercialState of [
      "available",
      "confirmation_required",
      "negotiating",
      "reserved_with_recorded_basis",
    ] as const)
      expect(publishChecks({ ...ready, commercialState }).blockers).toEqual([]);
  });

  it("warns about missing or unprocessed photos without blocking", () => {
    const none = publishChecks({ ...ready, photos: { ready: 0, notReady: 0 } });
    expect(none).toEqual({ blockers: [], warnings: ["no_photos"] });
    const pending = publishChecks({ ...ready, photos: { ready: 0, notReady: 4 } });
    expect(pending.warnings).toEqual(["no_photos", "photos_not_ready"]);
    const legacy = publishChecks({ ...ready, photos: { ready: 0, notReady: 0, notCopied: 12 } });
    expect(legacy.blockers).toEqual([]);
    expect(legacy.warnings).toEqual(["no_photos", "photos_not_copied"]);
  });

  it("warns about a very short description", () => {
    expect(publishChecks({ ...ready, description: "Апартамент." }).warnings).toEqual([
      "short_description",
    ]);
  });

  it("warns about unknown bedrooms only for dwellings", () => {
    expect(publishChecks({ ...ready, bedroomsState: "unknown" }).warnings).toEqual([
      "bedrooms_unknown",
    ]);
    expect(publishChecks({ ...ready, bedroomsState: null }).warnings).toEqual(["bedrooms_unknown"]);
    expect(publishChecks({ ...ready, propertyType: "plot", bedroomsState: null }).warnings).toEqual(
      [],
    );
  });

  it("warns when copy frames inland Sandanski as a sea or beach place", () => {
    expect(framesInlandAsCoast(["Сандански"], ["Апартамент близо до морето"])).toBe(true);
    expect(framesInlandAsCoast(["Sandanski"], ["A short walk to the beach"])).toBe(true);
    expect(framesInlandAsCoast(["Сандански"], ["Квартира у моря, пляж рядом"])).toBe(true);
    expect(framesInlandAsCoast([], ["Sandanski, the coastal gem"])).toBe(true);
    // Inland wording, and coast wording for a real coast place, are not flagged.
    expect(framesInlandAsCoast(["Сандански"], ["Минерални извори и планина"])).toBe(false);
    expect(framesInlandAsCoast(["Несебър"], ["На първа линия до плажа"])).toBe(false);
    expect(publishChecks({ ...ready, texts: ["Sandanski flat with sea views"] }).warnings).toEqual([
      "inland_framed_as_coast",
    ]);
  });
});
