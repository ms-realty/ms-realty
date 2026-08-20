import { loadLocaleRegistry } from "../lib/locales.mjs";
import { loadPayloadCmsImportRuntime, runPayloadCmsImport } from "../lib/payload-cms-import.mjs";
import { loadCmsSeed } from "../lib/runtime.mjs";

function parseArgs(argv = process.argv.slice(2)) {
  const options = { dryRun: false, overwriteExisting: false, skipIfInitialized: false };
  for (const arg of argv) {
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--overwrite-existing") options.overwriteExisting = true;
    else if (arg === "--skip-if-initialized") options.skipIfInitialized = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function printHelp() {
  console.log("Usage: node production/scripts/run-payload-cms-import.mjs [--dry-run] [--overwrite-existing] [--skip-if-initialized]");
  console.log("Imports the canonical CMS seed into Payload through the Local API without exposing secrets.");
  console.log("--overwrite-existing replaces conflicting latest drafts; it never publishes or changes the current published version.");
  console.log("--skip-if-initialized leaves an existing listing collection untouched.");
}

async function main() {
  const options = parseArgs();
  if (options.help) {
    printHelp();
    return;
  }
  const payload = await loadPayloadCmsImportRuntime();
  try {
    if (options.skipIfInitialized) {
      const existing = await payload.find({ collection: "listings", depth: 0, draft: true, limit: 1, overrideAccess: true });
      if (Number(existing.totalDocs || existing.docs?.length || 0) > 0) {
        console.log(JSON.stringify({ kind: "payload_cms_import", status: "skipped_initialized" }));
        return;
      }
    }
    const report = await runPayloadCmsImport({
      dryRun: options.dryRun,
      overwriteExisting: options.overwriteExisting,
      payload,
      registry: loadLocaleRegistry(),
      seed: loadCmsSeed(),
    });
    console.log(JSON.stringify(report, null, 2));
    if (!["committed", "dry_run_ready"].includes(report.status)) process.exitCode = 1;
  } finally {
    await payload.destroy?.();
  }
}

let exitCode = 0;
try {
  await main();
} catch (error) {
  console.error(`PAYLOAD CMS IMPORT FAILED: ${error.message}`);
  exitCode = 1;
}
process.exit(process.exitCode || exitCode);
