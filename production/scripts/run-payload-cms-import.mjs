import { loadLocaleRegistry } from "../lib/locales.mjs";
import { loadPayloadCmsImportRuntime, runPayloadCmsImport } from "../lib/payload-cms-import.mjs";
import { loadCmsSeed } from "../lib/runtime.mjs";

function parseArgs(argv = process.argv.slice(2)) {
  const options = { dryRun: false, overwriteExisting: false };
  for (const arg of argv) {
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--overwrite-existing") options.overwriteExisting = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function printHelp() {
  console.log("Usage: node production/scripts/run-payload-cms-import.mjs [--dry-run] [--overwrite-existing]");
  console.log("Imports the canonical CMS seed into Payload through the Local API without exposing secrets.");
}

async function main() {
  const options = parseArgs();
  if (options.help) {
    printHelp();
    return;
  }
  const payload = await loadPayloadCmsImportRuntime();
  try {
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
