import test from "node:test";
import assert from "node:assert/strict";
import {
  geographyArea,
  geographyAreaCodePolicy,
  geographyAreas,
  geographyImportProfiles,
  loadGeographyCatalog,
  normalizeGeographySelection,
  validateGeographyCatalog,
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
  assert.equal(normalizeGeographySelection(catalog, "GR:region:EL61"), null);
});

test("catalog exposes source-attributed imports and area-code rules without treating them as addresses", () => {
  const catalog = loadGeographyCatalog();
  const bgImport = geographyImportProfiles(catalog, "BG")[0];
  const grPolicy = geographyAreaCodePolicy(catalog, "GR");

  assert.equal(bgImport.artifact_files.settlement, "ek_atte.json");
  assert.equal(catalog.coverage.BG.import_required.settlement.source_count, 5256);
  assert.equal(catalog.coverage.GR.bundled.region.count, 4);
  assert.equal(catalog.coverage.GR.import_required.postal_code.source_id, "gr-elta-postcodes");
  assert.equal(catalog.coverage.BG.import_required.postal_code.status, "official_bulk_source_not_verified");
  assert.match(grPolicy.rule, /never evidence of a property's region/);
});

test("catalog rejects a geography record without a registered source", () => {
  const catalog = loadGeographyCatalog();
  const invalid = structuredClone(catalog);
  invalid.areas[0].source_id = "unverified-source";

  assert.throws(() => validateGeographyCatalog(invalid), /Unknown source/);
});
