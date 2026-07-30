import test from "node:test";
import assert from "node:assert/strict";
import {
  geographyArea,
  geographyAreaCodePolicy,
  geographyAreas,
  geographyImportProfiles,
  geographyRegistryAncestors,
  geographyRegistryArea,
  loadAreaMap,
  loadGeographyCatalog,
  loadGeographyRegistry,
  normalizeGeographySelection,
  searchGeographyRegistry,
  validateGeographyCatalog,
  validateGeographyRegistry,
} from "../lib/geography.mjs";

test("catalog bundles every Bulgarian district with its official code", () => {
  const catalog = loadGeographyCatalog();
  const districts = geographyAreas(catalog, { countryCode: "BG", level: "district" });

  assert.equal(districts.length, 28);
  assert.deepEqual(geographyArea(catalog, "BG:district:BLG"), {
    id: "BG:district:BLG",
    country_code: "BG",
    level: "district",
    official_code: "BLG",
    nuts3: "BG413",
    names: { native: "Благоевград", en: "Blagoevgrad" },
    source_id: "bg-nsi-ekatte",
  });
  assert.equal(geographyArea(catalog, "BG:district:SFO").official_code, "SFO");
  assert.equal(geographyArea(catalog, "BG:district:SOF").official_code, "SOF");
});

test("Northern Greece is explicit and preserves its NUTS hierarchy", () => {
  const catalog = loadGeographyCatalog();
  const regions = geographyAreas(catalog, { parentId: "GR:NUTS1:EL5", level: "region" });

  assert.deepEqual(
    regions.map((area) => area.official_code),
    ["EL51", "EL52", "EL53", "EL54"],
  );
  assert.deepEqual(normalizeGeographySelection(catalog, "GR:region:EL52"), {
    geography_id: "GR:region:EL52",
    country_code: "GR",
    level: "region",
    official_code: "EL52",
    parent_id: "GR:NUTS1:EL5",
    source_id: "eu-nuts-2024",
  });
  assert.equal(geographyAreas(catalog, { countryCode: "GR", level: "region" }).length, 13);
  assert.deepEqual(normalizeGeographySelection(catalog, "GR:region:EL61"), {
    geography_id: "GR:region:EL61",
    country_code: "GR",
    level: "region",
    official_code: "EL61",
    parent_id: "GR:NUTS1:EL6",
    source_id: "eu-nuts-2024",
  });
});

test("catalog exposes source-attributed imports and area-code rules without treating them as addresses", () => {
  const catalog = loadGeographyCatalog();
  const bgImport = geographyImportProfiles(catalog, "BG")[0];
  const grPolicy = geographyAreaCodePolicy(catalog, "GR");

  assert.equal(bgImport.artifact_files.settlement, "ek_atte.json");
  assert.equal(catalog.coverage.BG.bundled.settlement.count, 5256);
  assert.equal(catalog.coverage.GR.bundled.region.count, 13);
  assert.equal(catalog.coverage.GR.import_required.postal_code.source_id, "gr-elta-postcodes");
  assert.equal(catalog.coverage.BG.import_required.postal_code.status, "official_bulk_source_not_verified");
  assert.equal(catalog.registry.area_count, 26775);
  assert.match(grPolicy.rule, /never evidence of a property's region/);
});

test("official registry contains complete Bulgarian and Greek hierarchy snapshots", () => {
  const registry = loadGeographyRegistry();

  assert.equal(registry.coverage.BG.counts.municipality, 265);
  assert.equal(registry.coverage.BG.counts.settlement, 5256);
  assert.equal(registry.coverage.GR.counts.region, 13);
  assert.equal(registry.coverage.GR.counts.municipality, 333);
  assert.equal(registry.coverage.GR.counts.settlement, 13586);
  assert.equal(registry.coverage.GR.active_market_nuts1[0], "EL5");
  assert.equal(geographyRegistryArea(registry, "BG:settlement:65334").names.en, "Sandanski");
  assert.equal(geographyRegistryArea(registry, "GR:settlement:EL52:0701010001").names.en, "Thessaloniki");
  assert.deepEqual(
    geographyRegistryAncestors(registry, "BG:settlement:65334").map((area) => area.level),
    ["NUTS1", "NUTS2", "district", "municipality", "settlement"],
  );
});

test("official area map covers every Bulgarian district and Greek region without listing pins", () => {
  const areaMap = loadAreaMap();
  const bulgaria = areaMap.countries.find((country) => country.country_code === "BG");
  const greece = areaMap.countries.find((country) => country.country_code === "GR");

  assert.equal(areaMap.source.authority, "Eurostat GISCO");
  assert.equal(areaMap.source.dataset, "NUTS 2024");
  assert.equal(bulgaria.areas.length, 28);
  assert.equal(greece.areas.length, 13);
  assert.equal(bulgaria.areas.every((area) => area.level === "district" && area.path.startsWith("M")), true);
  assert.equal(greece.areas.every((area) => area.level === "region" && area.path.startsWith("M")), true);
});

test("registry search ranks bilingual exact settlements and supports regional ancestry", () => {
  const registry = loadGeographyRegistry();
  const unrestricted = searchGeographyRegistry(registry, {
    query: "Sandanski",
    countryCode: "BG",
    levels: [],
    limit: 2,
  });
  const sandanski = searchGeographyRegistry(registry, {
    query: "Сандански",
    countryCode: "BG",
    levels: "settlement",
  });
  const thessaloniki = searchGeographyRegistry(registry, {
    query: "Thessaloniki",
    countryCode: "GR",
  });
  const centralMacedoniaMunicipalities = searchGeographyRegistry(registry, {
    countryCode: "GR",
    levels: "municipality",
    ancestorId: "GR:region:EL52",
    limit: 50,
  });

  assert.equal(unrestricted[0].id, "BG:settlement:65334");
  assert.equal(sandanski[0].official_code, "65334");
  assert.equal(thessaloniki[0].level, "settlement");
  assert.equal(thessaloniki[0].official_code, "0701010001");
  assert.equal(centralMacedoniaMunicipalities.length, 39);
  assert.equal(centralMacedoniaMunicipalities.every((area) => area.nuts2 === "EL52"), true);
});

test("catalog rejects a geography record without a registered source", () => {
  const catalog = loadGeographyCatalog();
  const invalid = structuredClone(catalog);
  invalid.areas[0].source_id = "unverified-source";

  assert.throws(() => validateGeographyCatalog(invalid), /Unknown source/);
});

test("registry rejects orphaned hierarchy records", () => {
  const registry = structuredClone(loadGeographyRegistry());
  registry.areas.find((area) => area.parent_id).parent_id = "missing-parent";

  assert.throws(() => validateGeographyRegistry(registry), /Unknown registry parent/);
});
