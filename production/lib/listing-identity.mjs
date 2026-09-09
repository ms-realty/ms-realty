import fs from "node:fs";
import { fromRoot } from "./paths.mjs";

// The agency's lot number is the listing id: MS- plus the number zero padded
// to five digits, with the legacy sub lot suffix kept when the old site had
// one (lot 567 and 567-1 are two different houses in Hotovo).
export const LISTING_ID_PATTERN = /^MS-\d{5}(?:-\d{1,3})?$/u;
// The crawl era reference a record carried before the lot number rollout.
// MS-3000 is the one accident the old slug heuristic produced; it stays a
// migration id so the URL that was live under it keeps redirecting.
export const MIGRATION_ID_PATTERN = /^MS-(?:CRAWL-)?\d{4}$/u;
// New lots allocated by the CMS or by the identity rollout start here so they
// can never collide with a number the agency issued on the old site.
export const NEW_LOT_NUMBER_FLOOR = 1000;

export const DEFAULT_LEGACY_LOT_ID_MAP_PATH = fromRoot("production", "data", "legacy-lot-id-map.json");
export const DEFAULT_LEGACY_LOT_ID_OVERRIDES_PATH = fromRoot("production", "data", "legacy-lot-id-overrides.json");

const SURVIVING_DOMAIN = "makler-realty.com";
const RETIRED_DOMAIN = "makler-realty.ru";
const OVERRIDE_ACTIONS = new Set(["assign_legacy", "keep", "assign_new", "reassign_new"]);

function text(value) {
  return String(value ?? "").trim();
}

export function formatListingId(lotNumber, lotSuffix = null) {
  const number = Number(lotNumber);
  if (!Number.isInteger(number) || number < 1 || number > 99999) {
    throw new Error(`Listing lot number must be an integer between 1 and 99999, got ${lotNumber}`);
  }
  const suffix = text(lotSuffix);
  if (suffix && !/^\d{1,3}$/u.test(suffix)) throw new Error(`Listing lot suffix must be one to three digits, got ${lotSuffix}`);
  return `MS-${String(number).padStart(5, "0")}${suffix ? `-${suffix}` : ""}`;
}

export function parseListingId(value) {
  const match = text(value).toUpperCase().match(/^MS-(\d{5})(?:-(\d{1,3}))?$/u);
  if (!match) return null;
  return { lot_number: Number(match[1]), lot_suffix: match[2] || null };
}

export function parseLegacyLotId(value) {
  const match = text(value).match(/^0*(\d{1,7})(?:-(\d{1,3}))?$/u);
  if (!match || Number(match[1]) < 1) return null;
  return { lot_number: Number(match[1]), lot_suffix: match[2] || null };
}

function uniq(values) {
  return [...new Set(values.filter(Boolean))];
}

// Every stored spelling a typed reference can legitimately hit. The id and the
// migration id are compared verbatim (upper cased); the lot forms are compared
// after the MS- prefix and leading zeros are normalised away, so 662, MS-662,
// ms-00662 and MS-00662 all name the same lot.
export function exactReferenceCandidates(value) {
  const raw = text(value).toUpperCase();
  if (!raw) return null;
  const crawl = raw.match(/^(?:MS-)?CRAWL-(\d{1,4})$/u);
  if (crawl) {
    const id = `MS-CRAWL-${crawl[1].padStart(4, "0")}`;
    return { ids: uniq([id, raw]), migration_ids: uniq([id, raw]), legacy_lot_ids: [] };
  }
  const lot = parseLegacyLotId(raw.replace(/^MS-/u, ""));
  if (!lot) return { ids: [raw], migration_ids: [raw], legacy_lot_ids: [] };
  const lotKey = lot.lot_suffix ? `${lot.lot_number}-${lot.lot_suffix}` : String(lot.lot_number);
  return {
    ids: uniq([formatListingId(lot.lot_number, lot.lot_suffix), raw]),
    migration_ids: uniq([raw, `MS-${lotKey}`]),
    legacy_lot_ids: uniq([lotKey, raw.replace(/^MS-/u, "")]),
  };
}

export function matchesListingReference(record, value) {
  const candidates = exactReferenceCandidates(value);
  if (!candidates || !record) return false;
  const id = text(record.id).toUpperCase();
  const migrationId = text(record.migration_id).toUpperCase();
  const legacyLotId = text(record.legacy_lot_id).toUpperCase();
  return (
    (id && candidates.ids.includes(id)) ||
    (migrationId && candidates.migration_ids.includes(migrationId)) ||
    (legacyLotId && candidates.legacy_lot_ids.includes(legacyLotId))
  );
}

function domainOfUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./u, "");
  } catch {
    throw new Error(`Legacy identity URL is not absolute: ${url}`);
  }
}

export function loadListingIdentityInputs({
  mapPath = DEFAULT_LEGACY_LOT_ID_MAP_PATH,
  overridesPath = DEFAULT_LEGACY_LOT_ID_OVERRIDES_PATH,
} = {}) {
  return {
    map: JSON.parse(fs.readFileSync(mapPath, "utf8")),
    overrides: JSON.parse(fs.readFileSync(overridesPath, "utf8")),
  };
}

function identityRows(map, overrides) {
  const rows = new Map();
  for (const record of map.records || []) {
    const migrationId = text(record.new_reference);
    if (!migrationId) throw new Error("Legacy lot id map record has no new_reference");
    if (rows.has(migrationId)) throw new Error(`Legacy lot id map repeats ${migrationId}`);
    rows.set(migrationId, {
      migration_id: migrationId,
      legacy_url: text(record.legacy_url),
      legacy_domain: text(record.legacy_domain) || domainOfUrl(record.legacy_url),
      legacy_lot_id: text(record.legacy_lot_id) || null,
      legacy_post_id: text(record.legacy_post_id) || null,
      override: null,
    });
  }
  for (const unresolved of map.review?.unresolved || []) {
    const migrationId = text(unresolved.new_reference);
    if (rows.has(migrationId)) continue;
    rows.set(migrationId, {
      migration_id: migrationId,
      legacy_url: text(unresolved.legacy_url),
      legacy_domain: domainOfUrl(unresolved.legacy_url),
      legacy_lot_id: null,
      legacy_post_id: null,
      override: null,
    });
  }
  for (const [migrationId, override] of Object.entries(overrides || {})) {
    const row = rows.get(migrationId);
    if (!row) throw new Error(`Legacy lot id override names an unknown record: ${migrationId}`);
    if (!OVERRIDE_ACTIONS.has(override?.action)) throw new Error(`Legacy lot id override ${migrationId} has an unknown action`);
    row.override = override;
  }
  return rows;
}

function crawlOrder(left, right) {
  return left.migration_id.localeCompare(right.migration_id);
}

// Assigns every crawl era record its lot number, its id and, for the cross
// domain twins, the record it retires into. Pure over the two identity inputs
// so the minter, the seed builder and the one time rename agree by construction.
export function assignListingIdentities({ map, overrides }) {
  const rows = identityRows(map, overrides);
  const ordered = [...rows.values()].sort(crawlOrder);

  // Fresh numbers go out in crawl id order from the floor; a pair of
  // reassignments that shared one legacy number on the two domains is one lot
  // and draws one number (MS-CRAWL-0026 and MS-CRAWL-0125).
  let next = NEW_LOT_NUMBER_FLOOR;
  for (const row of ordered) {
    const action = row.override?.action;
    if (action !== "assign_new" && action !== "reassign_new") continue;
    if (row.lot_number) continue;
    row.lot_number = next;
    row.lot_suffix = null;
    if (action === "reassign_new" && row.legacy_lot_id) {
      for (const partner of ordered) {
        if (
          partner !== row &&
          !partner.lot_number &&
          partner.override?.action === "reassign_new" &&
          partner.legacy_lot_id === row.legacy_lot_id &&
          partner.legacy_domain !== row.legacy_domain
        ) {
          partner.lot_number = next;
          partner.lot_suffix = null;
        }
      }
    }
    next += 1;
  }

  for (const row of ordered) {
    const action = row.override?.action;
    if (action === "assign_new" || action === "reassign_new") {
      // assign_new lost its wtf_pid with the deleted post; reassign_new keeps
      // the number the team remembers as a searchable alias.
      if (action === "assign_new") row.legacy_lot_id = null;
      continue;
    }
    if (action === "assign_legacy") {
      const number = Number(row.override.lot_number);
      if (!Number.isInteger(number) || number < 1) throw new Error(`Legacy lot id override ${row.migration_id} needs a lot number`);
      row.lot_number = number;
      row.lot_suffix = null;
      row.legacy_lot_id = row.legacy_lot_id || String(number);
      continue;
    }
    const parsed = parseLegacyLotId(row.legacy_lot_id);
    if (!parsed) throw new Error(`Legacy lot id is missing or malformed for ${row.migration_id}: ${row.legacy_lot_id}`);
    if (action === "keep" && Number(row.override.lot_number) !== parsed.lot_number) {
      throw new Error(`Legacy lot id override ${row.migration_id} keeps ${row.override.lot_number} but the map says ${row.legacy_lot_id}`);
    }
    row.lot_number = parsed.lot_number;
    row.lot_suffix = parsed.lot_suffix;
  }

  const byLot = new Map();
  for (const row of ordered) {
    const key = formatListingId(row.lot_number, row.lot_suffix);
    if (!byLot.has(key)) byLot.set(key, []);
    byLot.get(key).push(row);
  }
  for (const [lotId, group] of byLot) {
    if (group.length === 1) {
      const [row] = group;
      row.id = lotId;
      row.merged_into = null;
      row.legacy_urls = [{ domain: row.legacy_domain, url: row.legacy_url }];
      continue;
    }
    const survivor = group.find((row) => row.legacy_domain === SURVIVING_DOMAIN);
    const retired = group.find((row) => row.legacy_domain === RETIRED_DOMAIN);
    if (group.length !== 2 || !survivor || !retired) {
      throw new Error(`Lot ${lotId} is claimed by ${group.map((row) => row.migration_id).join(", ")}; one public id must equal one lot`);
    }
    survivor.id = lotId;
    survivor.merged_into = null;
    survivor.legacy_urls = [
      { domain: survivor.legacy_domain, url: survivor.legacy_url },
      { domain: retired.legacy_domain, url: retired.legacy_url },
    ];
    // The retired twin keeps its crawl era id: it is not public, so it
    // consumes no lot number and the id stays resolvable for the old URL.
    retired.id = retired.migration_id;
    retired.merged_into = lotId;
    retired.legacy_urls = [{ domain: retired.legacy_domain, url: retired.legacy_url }];
  }

  return ordered.map((row) => ({
    migration_id: row.migration_id,
    id: row.id,
    lot_number: row.lot_number,
    lot_suffix: row.lot_suffix,
    legacy_lot_id: row.legacy_lot_id,
    legacy_post_id: row.legacy_post_id,
    legacy_domain: row.legacy_domain,
    legacy_url: row.legacy_url,
    legacy_urls: row.legacy_urls,
    merged_into: row.merged_into,
    retired: Boolean(row.merged_into),
  }));
}

export function assertListingIdentityRows(rows) {
  const ids = new Map();
  const migrationIds = new Map();
  const problems = [];
  for (const row of rows) {
    const id = text(row.id);
    const migrationId = text(row.migration_id);
    if (!id) problems.push(`${migrationId || "unknown"}: missing id`);
    else if (row.merged_into ? id !== migrationId || !MIGRATION_ID_PATTERN.test(id) : !LISTING_ID_PATTERN.test(id)) {
      problems.push(`${id}: malformed id`);
    }
    if (!Number.isInteger(row.lot_number) || row.lot_number < 1) problems.push(`${id || migrationId}: missing lot number`);
    if (!migrationId || !MIGRATION_ID_PATTERN.test(migrationId)) problems.push(`${id || migrationId}: malformed migration id`);
    if (id) ids.set(id, (ids.get(id) || 0) + 1);
    if (migrationId) migrationIds.set(migrationId, (migrationIds.get(migrationId) || 0) + 1);
  }
  for (const [id, count] of ids) if (count > 1) problems.push(`${id}: duplicate id`);
  for (const [id, count] of migrationIds) if (count > 1) problems.push(`${id}: duplicate migration id`);
  const publicIds = new Set(rows.filter((row) => !row.merged_into).map((row) => text(row.id)));
  for (const row of rows) {
    if (row.merged_into && !publicIds.has(text(row.merged_into))) problems.push(`${row.id}: merged into unknown listing ${row.merged_into}`);
  }
  if (problems.length) throw new Error(`Listing identity is invalid: ${problems.join("; ")}`);
  return rows;
}

// Old id to identity row, for the one time rewrite of hand maintained files.
export function buildListingIdMap(inputs = loadListingIdentityInputs()) {
  const rows = assertListingIdentityRows(assignListingIdentities(inputs));
  return new Map(rows.map((row) => [row.migration_id, row]));
}
