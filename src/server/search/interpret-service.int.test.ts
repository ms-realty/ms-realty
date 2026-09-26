import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { geographyPlaceAliases, geographyPlaces } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { interpretSearchText, loadPlaces, resetPlaceCache } from "./interpret-service";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});

describe("search interpretation over the geography tables", () => {
  it("loads places with every alias and resolves them in visitor text", async () => {
    const [municipality] = await t.db
      .insert(geographyPlaces)
      .values({
        level: "municipality",
        countryCode: "BG",
        registryId: "BG:municipality:BLG40",
        slug: "sandanski-municipality",
        nameNative: "Сандански",
        nameLatin: "Sandanski",
      })
      .returning({ id: geographyPlaces.id });
    if (!municipality) throw new Error("municipality not inserted");
    const [town] = await t.db
      .insert(geographyPlaces)
      .values({
        level: "settlement",
        parentId: municipality.id,
        countryCode: "BG",
        registryId: "BG:settlement:65334",
        slug: "sandanski",
        nameNative: "Сандански",
        nameLatin: "Sandanski",
      })
      .returning({ id: geographyPlaces.id });
    if (!town) throw new Error("town not inserted");
    await t.db
      .insert(geographyPlaceAliases)
      .values({ placeId: town.id, kind: "local", locale: "he", name: "סנדנסקי" });

    const places = await loadPlaces(t.db);
    expect(places.find((p) => p.id === town.id)).toMatchObject({
      level: "settlement",
      parentId: municipality.id,
      names: expect.arrayContaining(["Сандански", "Sandanski", "סנדנסקי"]),
    });

    resetPlaceCache();
    const { interpretation, assistStatus } = await interpretSearchText(
      t.db,
      { text: "דירה בסנדנסקי עד 150 אלף יורו", locale: "he" },
      { env: { assist: undefined } },
    );
    expect(assistStatus).toBe("off");
    // Only the town carries the Hebrew alias.
    expect(interpretation.places).toEqual([
      expect.objectContaining({ placeId: town.id, evidence: "בסנדנסקי" }),
    ]);
    expect(interpretation.places[0]?.broader).toBeUndefined();
    expect(interpretation.price).toMatchObject({ max: 15_000_000, currency: "EUR" });

    // Both share the Latin name: the town is chosen, the municipality offered as broader.
    const latin = await interpretSearchText(
      t.db,
      { text: "flat in Sandanski", locale: "en" },
      { env: { assist: undefined } },
    );
    expect(latin.interpretation.places).toMatchObject([
      { placeId: town.id, broader: [municipality.id] },
    ]);
  });
});
