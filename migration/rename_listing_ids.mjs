// One time rewrite of the hand maintained files that are keyed by listing id,
// for the lot number rollout: every crawl era id (MS-CRAWL-0001, and the
// accidental MS-3000) becomes the agency's lot number id (MS-00815). Retired
// cross domain twins keep their crawl era id, so they map to themselves.
//
// The map is computed from production/data/legacy-lot-id-map.json plus
// legacy-lot-id-overrides.json, never guessed. Translation batches get their
// source_hash recomputed with the real hashing function, because the hashed
// source snapshot includes the id. The run is idempotent and refuses to write
// anything while a crawl era id without a decision remains in any file.
//
// Usage:
//   node migration/rename_listing_ids.mjs [--check]
//
// The catalogue and the ledger depend on each other, so the flip is two passes:
//
//   python3 search/build_search_indexes.py   # ids flip; listing edits miss
//   node migration/rename_listing_ids.mjs    # the ledger and translations flip
//   python3 search/build_search_indexes.py   # the edits land, content is final
//   node migration/rename_listing_ids.mjs    # source_hash follows the content
//   npm run cms:build
//
// The middle minter run is the dangerous one: its catalogue carries the new ids
// while the ledger still carries the old, so every reviewed edit misses. The
// minter refuses that state rather than quietly publishing 165 listings with no
// description.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listingSourceSnapshot } from "../production/lib/content.mjs";
import { buildListingIdMap, loadListingIdentityInputs } from "../production/lib/listing-identity.mjs";
import { contentHash } from "../production/lib/translations.mjs";

export const CRAWL_ERA_TOKEN = /\bMS-(?:CRAWL-\d{4}|3000)\b/gu;

// Every hand maintained file keyed by listing id. Generated artifacts are
// rebuilt from the minter instead and are deliberately absent here.
export const KEYED_FILES = Object.freeze([
  { path: "production/data/listing-translations", kind: "translation_batches" },
  { path: "production/data/listing-edits.jsonl", kind: "jsonl" },
  { path: "production/data/location-reviews.json", kind: "json" },
  { path: "production/data/listing-publication-approval.json", kind: "publication_approval" },
  { path: "production/data/lead-ledger.jsonl", kind: "jsonl" },
  { path: "production/data/slug-history.jsonl", kind: "jsonl" },
  // Review evidence and operator ledgers that were captured by hand or from a
  // live fetch and cannot be regenerated offline.
  { path: "production/data/live-listing-audit.json", kind: "json" },
  { path: "migration/reviews/manual-live-audit", kind: "json_batches" },
  { path: "production/data/translation-tasks.jsonl", kind: "jsonl" },
  { path: "production/data/events.jsonl", kind: "jsonl" },
  { path: "production/data/viewings.jsonl", kind: "jsonl" },
  { path: "production/data/reply-outbox.jsonl", kind: "jsonl" },
  { path: "production/data/hermes-audit.jsonl", kind: "jsonl" },
  { path: "production/data/tour-approvals.jsonl", kind: "jsonl" },
  { path: "production/data/broker-contacts.jsonl", kind: "jsonl" },
  { path: "production/data/media-reviews.jsonl", kind: "jsonl" },
  { path: "production/data/saved-searches.jsonl", kind: "jsonl" },
]);

function replaceTokens(value, idMap, unmapped) {
  return String(value).replace(CRAWL_ERA_TOKEN, (token) => {
    const row = idMap.get(token);
    if (!row) {
      unmapped.add(token);
      return token;
    }
    return row.id;
  });
}

function walk(value, idMap, unmapped) {
  if (typeof value === "string") return replaceTokens(value, idMap, unmapped);
  if (Array.isArray(value)) return value.map((item) => walk(item, idMap, unmapped));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [replaceTokens(key, idMap, unmapped), walk(item, idMap, unmapped)]),
    );
  }
  return value;
}

function jsonText(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function rewriteJsonl(source, idMap, unmapped) {
  return source
    .split("\n")
    .map((line) => (line.trim() ? JSON.stringify(walk(JSON.parse(line), idMap, unmapped)) : line))
    .join("\n");
}

// The translation catalog hashes listingSourceSnapshot(listing), and that
// snapshot starts with the id, so every row needs the hash of its listing
// under the new id. Only the id moves; the rest of the snapshot is what the
// minter already produced for the same crawl row.
function sourceHashesByNewId(listings, idMap) {
  const hashes = new Map();
  for (const listing of listings) {
    const row = idMap.get(listing.id);
    const id = row ? row.id : listing.id;
    hashes.set(id, contentHash(listingSourceSnapshot({ ...listing, id })));
  }
  return hashes;
}

function rewriteTranslationBatch(rows, idMap, unmapped, hashes, missingListings) {
  if (!Array.isArray(rows)) throw new Error("Translation batch must be a JSON array");
  return rows.map((record) => {
    const rewritten = walk(record, idMap, unmapped);
    const hash = hashes.get(rewritten.listing_id);
    if (!hash) {
      missingListings.add(String(rewritten.listing_id));
      return rewritten;
    }
    return { ...rewritten, source_hash: hash };
  });
}

function batchFiles(directory, pattern) {
  if (!fs.existsSync(directory)) return [];
  return fs
    .readdirSync(directory)
    .filter((name) => pattern.test(name))
    .sort()
    .map((name) => path.join(directory, name));
}

function plannedWrite(filePath, before, after) {
  return after === before ? null : { path: filePath, before, after };
}

export function planListingIdRewrite({ root, idMap, listings }) {
  const unmapped = new Set();
  const missingListings = new Set();
  const hashes = sourceHashesByNewId(listings, idMap);
  const writes = [];
  const seen = [];
  for (const entry of KEYED_FILES) {
    const target = path.join(root, entry.path);
    if (entry.kind === "translation_batches") {
      for (const filePath of batchFiles(target, /^batch-\d{3,}\.json$/u)) {
        const before = fs.readFileSync(filePath, "utf8");
        const after = jsonText(rewriteTranslationBatch(JSON.parse(before), idMap, unmapped, hashes, missingListings));
        seen.push(filePath);
        writes.push(plannedWrite(filePath, before, after));
      }
      continue;
    }
    if (entry.kind === "json_batches") {
      for (const filePath of batchFiles(target, /^batch-\d{3,}\.json$/u)) {
        const before = fs.readFileSync(filePath, "utf8");
        const after = jsonText(walk(JSON.parse(before), idMap, unmapped));
        seen.push(filePath);
        writes.push(plannedWrite(filePath, before, after));
      }
      continue;
    }
    if (!fs.existsSync(target)) continue;
    const before = fs.readFileSync(target, "utf8");
    seen.push(target);
    if (entry.kind === "jsonl") {
      writes.push(plannedWrite(target, before, rewriteJsonl(before, idMap, unmapped)));
    } else if (entry.kind === "publication_approval") {
      const approval = walk(JSON.parse(before), idMap, unmapped);
      if (Array.isArray(approval.listing_ids)) approval.listing_ids = [...approval.listing_ids].sort();
      writes.push(plannedWrite(target, before, jsonText(approval)));
    } else {
      writes.push(plannedWrite(target, before, jsonText(walk(JSON.parse(before), idMap, unmapped))));
    }
  }
  if (unmapped.size) {
    throw new Error(`Refusing to rename: no lot number decision for ${[...unmapped].sort().join(", ")}`);
  }
  if (missingListings.size) {
    throw new Error(`Refusing to rename: translation rows name listings absent from listings.json: ${[...missingListings].sort().join(", ")}`);
  }
  return { files: seen, writes: writes.filter(Boolean) };
}

export function rewriteListingIds({
  root,
  check = false,
  identityInputs = null,
  listingsPath = path.join(root, "search", "data", "listings.json"),
} = {}) {
  const inputs =
    identityInputs ||
    loadListingIdentityInputs({
      mapPath: path.join(root, "production", "data", "legacy-lot-id-map.json"),
      overridesPath: path.join(root, "production", "data", "legacy-lot-id-overrides.json"),
    });
  const idMap = buildListingIdMap(inputs);
  const listings = JSON.parse(fs.readFileSync(listingsPath, "utf8"));
  const plan = planListingIdRewrite({ root, idMap, listings });
  if (!check) {
    for (const write of plan.writes) fs.writeFileSync(write.path, write.after);
  }
  return {
    check,
    scanned: plan.files.length,
    changed: plan.writes.map((write) => path.relative(root, write.path)),
    public_ids: [...idMap.values()].filter((row) => !row.retired).length,
    retired_ids: [...idMap.values()].filter((row) => row.retired).length,
  };
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const result = rewriteListingIds({ root, check: process.argv.includes("--check") });
  console.log(
    `${result.check ? "Would rewrite" : "Rewrote"} ${result.changed.length} of ${result.scanned} keyed files ` +
      `(${result.public_ids} public ids, ${result.retired_ids} retired twins)`,
  );
  for (const file of result.changed) console.log(`  ${file}`);
}
