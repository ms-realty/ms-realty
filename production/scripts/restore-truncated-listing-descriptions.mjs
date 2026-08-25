import {
  appendListingEdit,
  applyListingEdits,
  createListingEdit,
  readListingEdits,
} from "../lib/listing-edits.mjs";
import { loadLegacyContentCaptures, restoredDescriptionFor } from "../lib/legacy-content-capture.mjs";
import { loadCmsSeed } from "../lib/runtime.mjs";
import { latestTranslationTasks, readTranslationLedger } from "../lib/translation-ledger.mjs";

// The repair is an ordinary ledger edit so the runtime, the search import and
// the admin queues all see it, and so the change carries a source hash and
// marks the affected translations stale. A fixed timestamp and a stable id keep
// the run idempotent.
const RESTORED_AT = "2026-08-25T00:00:00.000Z";
const EDITOR = "legacy_content_restore";

const ledgerPath = process.env.MS_REALTY_LISTING_EDIT_LEDGER_PATH || undefined;
const captures = loadLegacyContentCaptures();
const translationTasks = latestTranslationTasks(readTranslationLedger());
const seed = applyListingEdits(loadCmsSeed(), readListingEdits(ledgerPath));

let restored = 0;
let alreadyRestored = 0;
for (const record of seed.records.filter((entry) => entry.collection === "listings")) {
  const description = restoredDescriptionFor(record, captures);
  if (!description) continue;
  const { edit } = createListingEdit(
    seed,
    {
      id: `listing-description-restore-${record.id}`,
      listingId: record.id,
      editor: EDITOR,
      patch: { description },
    },
    translationTasks,
    RESTORED_AT,
  );
  const persisted = appendListingEdit(
    {
      ...edit,
      review_source: "legacy_wordpress_content_capture",
      review_notes: `Description completed from the 20260729-legacy-content-review capture of ${record.source_url}; the stored copy was an exact prefix cut at the import cap.`,
    },
    ledgerPath ? { filePath: ledgerPath } : {},
  );
  if (persisted.idempotent) alreadyRestored += 1;
  else restored += 1;
}

console.log(`Restored ${restored} truncated listing descriptions (${alreadyRestored} already in the ledger)`);
