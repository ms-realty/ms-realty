import fs from "node:fs";
import { fromRoot } from "./paths.mjs";

export const DEFAULT_GEOGRAPHY_CATALOG_PATH = fromRoot("production", "data", "geography-catalog.json");

function requiredText(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Geography catalog requires ${label}`);
  return value;
}

function requiredArray(value, label) {
  if (!Array.isArray(value)) throw new Error(`Geography catalog requires ${label}`);
  return value;
}

function countryByCode(catalog, countryCode) {
  return catalog.countries.find((country) => country.code === countryCode) || null;
}

export function validateGeographyCatalog(catalog) {
  if (!catalog || typeof catalog !== "object") throw new Error("Geography catalog must be an object");
  requiredArray(catalog.sources, "sources");
  requiredArray(catalog.countries, "countries");
  requiredArray(catalog.areas, "areas");

  const sourceIds = new Set();
  for (const source of catalog.sources) {
    requiredText(source?.id, "source id");
    if (sourceIds.has(source.id)) throw new Error(`Duplicate geography source: ${source.id}`);
    sourceIds.add(source.id);
    requiredText(source.authority, `authority for ${source.id}`);
    requiredText(source.url, `URL for ${source.id}`);
  }

  const countryCodes = new Set();
  for (const country of catalog.countries) {
    requiredText(country?.code, "country code");
    if (countryCodes.has(country.code)) throw new Error(`Duplicate geography country: ${country.code}`);
    countryCodes.add(country.code);
    requiredText(country.names?.native, `native country name for ${country.code}`);
    requiredText(country.names?.en, `English country name for ${country.code}`);
    requiredArray(country.hierarchy, `hierarchy for ${country.code}`);
    if (!sourceIds.has(country.registry_source_id)) throw new Error(`Unknown registry source for ${country.code}: ${country.registry_source_id}`);
  }

  const areaIds = new Set();
  for (const area of catalog.areas) {
    requiredText(area?.id, "area id");
    if (areaIds.has(area.id)) throw new Error(`Duplicate geography area: ${area.id}`);
    areaIds.add(area.id);
    requiredText(area.country_code, `country code for ${area.id}`);
    const country = countryByCode(catalog, area.country_code);
    if (!country) throw new Error(`Unknown country for ${area.id}: ${area.country_code}`);
    requiredText(area.level, `level for ${area.id}`);
    if (!country.hierarchy.includes(area.level)) throw new Error(`Unsupported ${area.level} level for ${area.country_code}`);
    requiredText(area.official_code, `official code for ${area.id}`);
    requiredText(area.names?.native, `native name for ${area.id}`);
    requiredText(area.names?.en, `English name for ${area.id}`);
    if (!sourceIds.has(area.source_id)) throw new Error(`Unknown source for ${area.id}: ${area.source_id}`);
  }

  for (const area of catalog.areas) {
    if (!area.parent_id) continue;
    const parent = catalog.areas.find((candidate) => candidate.id === area.parent_id);
    if (!parent) throw new Error(`Unknown parent area for ${area.id}: ${area.parent_id}`);
    if (parent.country_code !== area.country_code) throw new Error(`Cross-country parent for ${area.id}`);
  }

  for (const profile of requiredArray(catalog.import_profiles, "import profiles")) {
    requiredText(profile?.id, "import profile id");
    if (!countryCodes.has(profile.country_code)) throw new Error(`Unknown import-profile country: ${profile.country_code}`);
    if (!sourceIds.has(profile.source_id)) throw new Error(`Unknown import-profile source: ${profile.source_id}`);
  }

  for (const policy of requiredArray(catalog.area_code_policies, "area-code policies")) {
    if (!countryCodes.has(policy?.country_code)) throw new Error(`Unknown area-code country: ${policy?.country_code}`);
    requiredText(policy.type, `area-code type for ${policy.country_code}`);
    requiredText(policy.country_calling_code, `country calling code for ${policy.country_code}`);
    if (!sourceIds.has(policy.source_id)) throw new Error(`Unknown area-code source: ${policy.source_id}`);
  }

  return catalog;
}

export function loadGeographyCatalog(path = DEFAULT_GEOGRAPHY_CATALOG_PATH) {
  return validateGeographyCatalog(JSON.parse(fs.readFileSync(path, "utf8")));
}

export function geographyCountry(catalog, countryCode) {
  return countryByCode(validateGeographyCatalog(catalog), countryCode);
}

export function geographyArea(catalog, areaId) {
  return validateGeographyCatalog(catalog).areas.find((area) => area.id === areaId) || null;
}

export function geographyAreas(catalog, { countryCode, level, parentId } = {}) {
  return validateGeographyCatalog(catalog).areas.filter((area) => {
    if (countryCode && area.country_code !== countryCode) return false;
    if (level && area.level !== level) return false;
    if (parentId && area.parent_id !== parentId) return false;
    return true;
  });
}

export function geographyImportProfiles(catalog, countryCode) {
  return validateGeographyCatalog(catalog).import_profiles.filter((profile) => !countryCode || profile.country_code === countryCode);
}

export function geographyAreaCodePolicy(catalog, countryCode) {
  return validateGeographyCatalog(catalog).area_code_policies.find((policy) => policy.country_code === countryCode) || null;
}

export function normalizeGeographySelection(catalog, areaId) {
  const area = geographyArea(catalog, areaId);
  if (!area) return null;
  return {
    geography_id: area.id,
    country_code: area.country_code,
    level: area.level,
    official_code: area.official_code,
    parent_id: area.parent_id || null,
    source_id: area.source_id,
  };
}
