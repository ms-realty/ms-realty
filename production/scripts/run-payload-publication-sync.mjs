// Projects the publication state recorded in the committed CMS seed onto the
// Payload/Postgres rows the production runtime reads.
//
// The committed seed is the approved source of truth, so this step is not
// gated on an environment flag: the seed's recorded owner approvals ARE the
// authority. The guard is the projector's own fail-closed contract - it
// publishes only what the seed AND the signed operator approval both name, it
// never invents an approval, and it never touches content.

import { appendAuditLog, createAuditLogEntry } from "../lib/audit-log.mjs";
import { loadApprovedLaunchFreeze } from "../lib/launch-freeze.mjs";
import { operatorPublishedListingApproval } from "../lib/listing-publication-approval.mjs";
import {
  applyListingPublicationSync,
  assertPublicationSchema,
  buildListingPublicationSyncPlan,
  payloadPublicationSchemaFields,
  publicationSyncAuditRecords,
  readPublicationRows,
  seedListingRecords,
} from "../lib/listing-publication-projection.mjs";
import { loadPayloadCmsImportRuntime } from "../lib/payload-cms-import.mjs";
import { assertCmsSeed } from "../lib/cms-seed.mjs";
import { loadCmsSeed } from "../lib/runtime.mjs";

function parseArgs(argv = process.argv.slice(2)) {
  const options = { dryRun: false, help: false };
  for (const arg of argv) {
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function printHelp() {
  console.log("Usage: node production/scripts/run-payload-publication-sync.mjs [--dry-run]");
  console.log("Applies the publication state the committed CMS seed records to the matching Payload listing rows.");
  console.log("It writes publication state only: cms_status, workflow.publish_approved(_at/_by), the Payload version");
  console.log("status, and the source-locale translation's approval fields. Content is never touched.");
  console.log("--dry-run prints the full plan and writes nothing.");
}

// Everything the run refused or skipped, in plain language, so an operator can
// see what was left alone and why.
function refusalLines(plan) {
  const grouped = new Map();
  for (const entry of plan.entries) {
    if (entry.action !== "refuse" && entry.action !== "skip") continue;
    const rows = grouped.get(entry.reason) || [];
    rows.push(entry.detail ? `${entry.listing_id} (${entry.detail})` : entry.listing_id);
    grouped.set(entry.reason, rows);
  }
  return [...grouped.entries()].map(([reason, ids]) => ({ reason, listings: ids.length, sample: ids.slice(0, 10) }));
}

async function main() {
  const options = parseArgs();
  if (options.help) {
    printHelp();
    return 0;
  }

  // Fail-closed on the seed and on the freeze-bound approval before any
  // database connection is opened.
  const seed = loadCmsSeed();
  assertCmsSeed(seed);

  const freeze = loadApprovedLaunchFreeze();
  const approval = operatorPublishedListingApproval(freeze);
  if (!approval) {
    console.error(
      "PUBLICATION SYNC REFUSED: the committed listing publication approval did not validate against the approved launch freeze, so no publication state was applied.",
    );
    return 1;
  }

  const seedRecords = seedListingRecords(seed);
  const payload = await loadPayloadCmsImportRuntime();
  try {
    assertPublicationSchema(payloadPublicationSchemaFields(payload));
    const rows = await readPublicationRows(payload);
    const plan = buildListingPublicationSyncPlan({ ...rows, seedRecords, approval });

    const report = {
      kind: "payload_publication_sync",
      dry_run: options.dryRun,
      approval: plan.approval,
      summary: plan.summary,
      refusals: refusalLines(plan),
      database_listings: rows.currentListings.length,
      status: "pending",
    };

    if (options.dryRun) {
      console.log(JSON.stringify({ ...report, status: "dry_run_ready", entries: plan.entries }, null, 2));
      return 0;
    }

    if (plan.idempotent) {
      console.log(JSON.stringify({ ...report, status: "already_in_sync" }, null, 2));
      return 0;
    }

    const auditRecords = publicationSyncAuditRecords(plan);
    const result = await applyListingPublicationSync({ payload, plan, seedRecords, approval });
    if (result.status !== "committed") {
      console.error(
        `PUBLICATION SYNC FAILED: the database did not carry the owner's publication state after the writes (${result.verification.still_pending.length} listings still pending); nothing was committed.`,
      );
      console.log(JSON.stringify({ ...report, ...result, status: "verification_failed" }, null, 2));
      return 1;
    }

    for (const record of auditRecords) appendAuditLog(createAuditLogEntry(record.input, record.recordedAt));

    console.log(
      JSON.stringify({ ...report, status: "committed", applied: result.applied.length, audit_entries: auditRecords.length }, null, 2),
    );
    return 0;
  } finally {
    await payload.destroy?.();
  }
}

let exitCode = 0;
try {
  exitCode = await main();
} catch (error) {
  console.error(`PUBLICATION SYNC FAILED: ${error.message}`);
  exitCode = 1;
}
process.exit(exitCode);
