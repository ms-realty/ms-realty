import fs from "node:fs";
import { pathToFileURL } from "node:url";
import {
  appendListingEdit,
  applyListingEdits,
  createListingEdit,
  readListingEdits,
} from "../lib/listing-edits.mjs";
import { fromRoot } from "../lib/paths.mjs";
import { loadCmsSeed } from "../lib/runtime.mjs";
import { latestTranslationTasks, readTranslationLedger } from "../lib/translation-ledger.mjs";

// Turns the reviewed rows of production/data/legacy-area-map.json into ordinary
// listing edits, so the recovered areas reach the runtime, the admin queues and
// the search import the same way a broker's own correction does, and survive the
// next `npm run cms:build`.
//
// The area map is a proposal, not an approval. Only rows the extractor could
// resolve without a judgement call (a plot has one area field, so its legacy
// number can only mean that field) are applied unattended. Everything else waits
// for a decision in production/data/legacy-area-overrides.json, keyed by listing
// reference:
//
//   { "MS-CRAWL-0007": {
//       "action": "assign",                 // or "skip"
//       "target_field": "usable_area_sqm",  // which of the family's area fields
//       "area_sqm": 59.21,                  // omit to take the extractor's value
//       "reviewer": "…", "reason": "…" } }
//
// The edit lands as `entered_pending_review`, the state the fact model uses for
// a figure the source stated and no broker has confirmed. The public page
// therefore publishes it with source provenance rather than as verified fact.
const AREA_MAP_PATH = process.env.MS_REALTY_LEGACY_AREA_MAP_PATH || fromRoot("production", "data", "legacy-area-map.json");
const OVERRIDES_PATH = process.env.MS_REALTY_LEGACY_AREA_OVERRIDES_PATH || fromRoot("production", "data", "legacy-area-overrides.json");
const RESTORED_AT = "2026-09-03T00:00:00.000Z";
const EDITOR = "legacy_area_restore";

const ledgerPath = process.env.MS_REALTY_LISTING_EDIT_LEDGER_PATH || undefined;

function readJson(path, fallback) {
  if (!fs.existsSync(path)) return fallback;
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

// Number(null) is 0, so an absent area would otherwise read as a valid zero.
function areaValue(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

/** The field and value to write, or null when this row still needs a human. */
export function resolveAreaProposal(record, override) {
  if (override?.action === "skip") return null;
  if (override?.action === "assign") {
    const field = String(override.target_field || record.target_field || "").trim();
    const value = areaValue(override.area_sqm ?? record.proposed_sqm);
    return field && value !== null ? { field, value, decided_by: "override" } : null;
  }
  if (override) return null;
  if (record.status !== "ready" || !record.target_field) return null;
  const value = areaValue(record.proposed_sqm);
  return value === null ? null : { field: record.target_field, value, decided_by: "extractor" };
}

function run({ apply }) {
  const areaMap = readJson(AREA_MAP_PATH, null);
  if (!areaMap) {
    throw new Error(`Missing ${AREA_MAP_PATH}. Run migration/extract_legacy_areas.py first.`);
  }
  const overrides = readJson(OVERRIDES_PATH, {});
  const translationTasks = latestTranslationTasks(readTranslationLedger());
  const seed = applyListingEdits(loadCmsSeed(), readListingEdits(ledgerPath));

  const planned = [];
  const skipped = [];
  for (const record of areaMap.records) {
    const proposal = resolveAreaProposal(record, overrides[record.new_reference]);
    if (!proposal) {
      skipped.push({ listing_id: record.new_reference, reasons: record.review_reasons });
      continue;
    }
    const { edit } = createListingEdit(
      seed,
      {
        id: `legacy-area-${record.new_reference}`,
        listingId: record.new_reference,
        editor: EDITOR,
        propertyPatch: { [proposal.field]: proposal.value },
      },
      translationTasks,
      RESTORED_AT,
    );
    planned.push({
      edit: {
        ...edit,
        review_source: "legacy_wordpress_postmeta",
        review_notes:
          `${proposal.field}=${proposal.value} recovered from ${record.source_meta_key}='${record.area.raw ?? record.total_area.raw}' ` +
          `on ${record.legacy_domain} post ${record.legacy_post_id}; field chosen by ${proposal.decided_by}.`,
      },
      summary: `${record.new_reference} ${proposal.field}=${proposal.value} (${proposal.decided_by})`,
    });
  }

  if (!apply) {
    for (const row of planned) console.log(`would apply  ${row.summary}`);
    console.log(
      `\nDry run: ${planned.length} listing edits ready, ${skipped.length} listings held for review.` +
        `\nRe-run with --apply to write them to the listing edit ledger.`,
    );
    return { planned, skipped, applied: 0 };
  }

  let applied = 0;
  let alreadyApplied = 0;
  for (const row of planned) {
    const persisted = appendListingEdit(row.edit, ledgerPath ? { filePath: ledgerPath } : {});
    if (persisted.idempotent) alreadyApplied += 1;
    else applied += 1;
  }
  console.log(
    `Applied ${applied} legacy area facts (${alreadyApplied} already in the ledger, ${skipped.length} held for review)`,
  );
  return { planned, skipped, applied };
}

// Importable for tests: nothing runs, and nothing is written, unless this file
// is the entry point.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run({ apply: process.argv.includes("--apply") });
}
