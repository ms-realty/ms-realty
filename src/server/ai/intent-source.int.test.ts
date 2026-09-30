import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { geographyPlaceAliases, geographyPlaces } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { interpretIntent } from "./intent";
import { intentPlaces } from "./intent-source";

let t: TestDatabase;
const bg = "00000000-0000-4000-8000-000000000001";
const gr = "00000000-0000-4000-8000-000000000002";
const town = "00000000-0000-4000-8000-000000000003";

beforeAll(async () => {
  t = await createTestDatabase();
  await t.db.insert(geographyPlaces).values([
    {
      id: bg,
      level: "country",
      countryCode: "BG",
      slug: "bg",
      nameNative: "България",
      nameLatin: "Bulgaria",
    },
    {
      id: gr,
      level: "country",
      countryCode: "GR",
      slug: "gr",
      nameNative: "Ελλάδα",
      nameLatin: "Greece",
    },
    {
      id: town,
      level: "settlement",
      parentId: gr,
      countryCode: "GR",
      slug: "synthetic-town",
      nameNative: "Θεσσαλονίκη",
      nameLatin: "Thessaloniki",
    },
  ]);
  // Alias fan-out must not consume the place budget and silently remove later towns.
  await t.db.execute(sql`
    insert into ${geographyPlaceAliases} (place_id, kind, name)
    select ${bg}::uuid, 'legacy_spelling', 'synthetic-alias-' || n::text
    from generate_series(1, 20001) n
  `);
  await t.db.insert(geographyPlaceAliases).values([
    { placeId: town, kind: "official", name: "Thessaloniki" },
    { placeId: town, kind: "local", name: "Салоники" },
    { placeId: town, kind: "legacy_spelling", name: "Салоники" },
  ]);
}, 30000);

afterAll(async () => {
  await t?.drop();
});

it("F02 retains complete place identities and aliases beyond 20,000 joined rows", async () => {
  const places = await intentPlaces(t.db);
  expect(places.map((place) => place.id)).toEqual([bg, gr, town]);
  expect(places[0]?.names).toContain("synthetic-alias-20001");
  expect(places[2]).toEqual({
    id: town,
    level: "settlement",
    parentId: gr,
    countryCode: "GR",
    names: ["Θεσσαλονίκη", "Thessaloniki", "Салоники"],
  });
  expect(
    interpretIntent("buy in Салоники", { locale: "en", places }).places.map((p) => p.placeId),
  ).toContain(town);
});

it("F29 re-reads current taxonomy names before confirming an interpretation", async () => {
  await t.db.delete(geographyPlaceAliases).where(eq(geographyPlaceAliases.placeId, town));
  await t.db
    .update(geographyPlaces)
    .set({ nameLatin: "Synthetic revised name" })
    .where(eq(geographyPlaces.id, town));
  const places = await intentPlaces(t.db);
  expect(places.find((place) => place.id === town)?.names).toEqual([
    "Θεσσαλονίκη",
    "Synthetic revised name",
  ]);
  expect(interpretIntent("buy in Салоники", { locale: "en", places }).places).toEqual([]);
});

it("an oversized place registry refuses interpretation instead of returning a partial taxonomy", async () => {
  await t.db.execute(sql`
    insert into ${geographyPlaces} (level, country_code, slug, name_native, name_latin)
    select 'settlement', 'BG', 'synthetic-extra-' || n::text,
      'Synthetic native ' || n::text, 'Synthetic Latin ' || n::text
    from generate_series(1, 20001) n
  `);
  await expect(intentPlaces(t.db)).rejects.toMatchObject({ code: "unavailable" });
}, 30000);
