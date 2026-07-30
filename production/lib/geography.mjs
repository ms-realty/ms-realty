import fs from "node:fs";
import { fromRoot } from "./paths.mjs";

export const DEFAULT_GEOGRAPHY_CATALOG_PATH = fromRoot("production", "data", "geography-catalog.json");
export const DEFAULT_GEOGRAPHY_REGISTRY_PATH = fromRoot("production", "data", "geography-registry.json");
export const DEFAULT_AREA_MAP_PATH = fromRoot("production", "data", "area-map.json");

const registryFileCache = new Map();
const registryIndexCache = new WeakMap();

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

export function validateGeographyRegistry(registry) {
  if (!registry || typeof registry !== "object") throw new Error("Geography registry must be an object");
  requiredArray(registry.source_snapshots, "registry source snapshots");
  const areas = requiredArray(registry.areas, "registry areas");
  const sourceIds = new Set();
  for (const source of registry.source_snapshots) {
    requiredText(source?.source_id, "registry source id");
    requiredText(source?.revision, `registry revision for ${source.source_id}`);
    if (!/^[a-f0-9]{64}$/.test(source.sha256 || "")) throw new Error(`Invalid registry source hash for ${source.source_id}`);
    sourceIds.add(source.source_id);
  }

  const areaById = new Map();
  for (const area of areas) {
    requiredText(area?.id, "registry area id");
    if (areaById.has(area.id)) throw new Error(`Duplicate geography registry area: ${area.id}`);
    requiredText(area.country_code, `registry country code for ${area.id}`);
    requiredText(area.level, `registry level for ${area.id}`);
    requiredText(area.official_code, `registry official code for ${area.id}`);
    requiredText(area.names?.native, `registry native name for ${area.id}`);
    requiredText(area.names?.en, `registry English name for ${area.id}`);
    if (!sourceIds.has(area.source_id)) throw new Error(`Unknown registry source for ${area.id}: ${area.source_id}`);
    areaById.set(area.id, area);
  }
  for (const area of areas) {
    if (!area.parent_id) continue;
    const parent = areaById.get(area.parent_id);
    if (!parent) throw new Error(`Unknown registry parent for ${area.id}: ${area.parent_id}`);
    if (parent.country_code !== area.country_code) throw new Error(`Cross-country registry parent for ${area.id}`);
  }
  return registry;
}

export function loadGeographyRegistry(path = DEFAULT_GEOGRAPHY_REGISTRY_PATH) {
  const stat = fs.statSync(path);
  const cached = registryFileCache.get(path);
  if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) return cached.registry;
  const registry = validateGeographyRegistry(JSON.parse(fs.readFileSync(path, "utf8")));
  registryFileCache.set(path, { mtimeMs: stat.mtimeMs, size: stat.size, registry });
  return registry;
}

export function validateAreaMap(areaMap, catalog = loadGeographyCatalog()) {
  if (!areaMap || typeof areaMap !== "object") throw new Error("Area map must be an object");
  requiredText(areaMap.source?.authority, "area-map source authority");
  requiredText(areaMap.source?.url, "area-map source URL");
  if (!/^[a-f0-9]{64}$/.test(areaMap.source?.sha256 || "")) throw new Error("Area map requires a source hash");
  const countries = requiredArray(areaMap.countries, "area-map countries");
  const catalogIds = new Set(catalog.areas.map((area) => area.id));
  const expectedCounts = { BG: 28, GR: 13 };
  const seen = new Set();
  for (const country of countries) {
    requiredText(country?.country_code, "area-map country code");
    requiredText(country?.view_box, `area-map view box for ${country.country_code}`);
    if (seen.has(country.country_code)) throw new Error(`Duplicate area-map country: ${country.country_code}`);
    seen.add(country.country_code);
    const areas = requiredArray(country.areas, `area-map areas for ${country.country_code}`);
    if (areas.length !== expectedCounts[country.country_code]) {
      throw new Error(`Area-map coverage mismatch for ${country.country_code}`);
    }
    for (const area of areas) {
      requiredText(area?.id, "area-map area id");
      requiredText(area?.path, `area-map path for ${area.id}`);
      if (!catalogIds.has(area.id)) throw new Error(`Unknown catalog area in map: ${area.id}`);
      if (area.country_code !== country.country_code) throw new Error(`Area-map country mismatch for ${area.id}`);
    }
  }
  if (seen.size !== 2 || !seen.has("BG") || !seen.has("GR")) throw new Error("Area map must cover Bulgaria and Greece");
  return areaMap;
}

export function loadAreaMap(path = DEFAULT_AREA_MAP_PATH) {
  return validateAreaMap(JSON.parse(fs.readFileSync(path, "utf8")));
}

function searchableGeographyText(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/\p{Mark}/gu, "")
    .toLocaleLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim();
}

function registryIndex(registry) {
  const cached = registryIndexCache.get(registry);
  if (cached) return cached;
  validateGeographyRegistry(registry);
  const byId = new Map(registry.areas.map((area) => [area.id, area]));
  const searchRows = registry.areas.map((area) => ({
    area,
    names: [area.names.native, area.names.en, area.official_name_native, area.official_code]
      .filter(Boolean)
      .map(searchableGeographyText),
  }));
  const index = { byId, searchRows };
  registryIndexCache.set(registry, index);
  return index;
}

export function geographyRegistryArea(registry, areaId) {
  return registryIndex(registry).byId.get(areaId) || null;
}

export function geographyRegistryAncestors(registry, areaId) {
  const { byId } = registryIndex(registry);
  const ancestors = [];
  let current = byId.get(areaId) || null;
  while (current) {
    ancestors.unshift(current);
    current = current.parent_id ? byId.get(current.parent_id) || null : null;
  }
  return ancestors;
}

function hasRegistryAncestor(byId, area, ancestorId) {
  let current = area;
  while (current?.parent_id) {
    if (current.parent_id === ancestorId) return true;
    current = byId.get(current.parent_id);
  }
  return false;
}

const GEOGRAPHY_LEVEL_RANK = new Map(
  ["settlement", "municipality", "municipal_district", "community", "municipal_unit", "regional_unit", "district", "region", "NUTS2", "NUTS1"].map(
    (level, index) => [level, index],
  ),
);

export function searchGeographyRegistry(
  registry,
  { query = "", countryCode, levels, parentId, ancestorId, limit = 20 } = {},
) {
  const { byId, searchRows } = registryIndex(registry);
  const normalizedQuery = searchableGeographyText(query);
  const tokens = normalizedQuery.split(" ").filter(Boolean);
  const normalizedLevels = (Array.isArray(levels) ? levels : [levels]).filter(Boolean);
  const allowedLevels = normalizedLevels.length ? new Set(normalizedLevels) : null;
  const maximum = Math.max(1, Math.min(Number(limit) || 20, 50));

  return searchRows
    .filter(({ area, names }) => {
      if (countryCode && area.country_code !== countryCode) return false;
      if (allowedLevels && !allowedLevels.has(area.level)) return false;
      if (parentId && area.parent_id !== parentId) return false;
      if (ancestorId && area.id !== ancestorId && !hasRegistryAncestor(byId, area, ancestorId)) return false;
      return !tokens.length || tokens.every((token) => names.some((name) => name.includes(token)));
    })
    .map(({ area, names }) => {
      const exact = normalizedQuery && names.some((name) => name === normalizedQuery);
      const prefix = normalizedQuery && names.some((name) => name.startsWith(normalizedQuery));
      return {
        area,
        score: exact ? 0 : prefix ? 1 : 2,
        levelRank: GEOGRAPHY_LEVEL_RANK.get(area.level) ?? 99,
        population: Number(area.population_2021) || 0,
      };
    })
    .sort(
      (left, right) =>
        left.score - right.score ||
        left.levelRank - right.levelRank ||
        right.population - left.population ||
        left.area.names.en.localeCompare(right.area.names.en),
    )
    .slice(0, maximum)
    .map(({ area }) => area);
}

export function geographySuggestionsPayload(registry, options = {}) {
  const results = searchGeographyRegistry(registry, options).map((area) => ({
    id: area.id,
    country_code: area.country_code,
    level: area.level,
    official_code: area.official_code,
    names: area.names,
    parent_id: area.parent_id || null,
    nuts1: area.nuts1 || null,
    nuts2: area.nuts2 || null,
    active_market: area.country_code === "BG" || area.nuts1 === "EL5" || area.official_code === "EL5",
    context: geographyRegistryAncestors(registry, area.id)
      .slice(0, -1)
      .map((ancestor) => ({
        id: ancestor.id,
        level: ancestor.level,
        official_code: ancestor.official_code,
        names: ancestor.names,
      })),
  }));
  return {
    kind: "geography_suggestions",
    query: String(options.query || ""),
    returned: results.length,
    results,
  };
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
