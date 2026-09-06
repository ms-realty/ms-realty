import fs from "node:fs";
import path from "node:path";
import { loadCmsSeed } from "../lib/runtime.mjs";
import { loadLocaleRegistry } from "../lib/locales.mjs";
import { loadPayloadCmsImportRuntime } from "../lib/payload-cms-import.mjs";
import { projectListingDraftSeed } from "../lib/listing-draft-service.mjs";
import { readSourceReviewTask, runHermesSourceReview } from "../lib/hermes-source-review.mjs";
import { assertHermesDraftWorkerReport } from "../lib/hermes-draft-worker.mjs";

const args = process.argv.slice(2);
const allowed = new Set(["--read", "--listing", "--task", "--actor", "--owner", "--reason", "--report", "--confirm-task"]);
const options = {};
for (let i = 0; i < args.length; i++) {
  const key = args[i];
  if (!allowed.has(key) || Object.hasOwn(options, key)) throw new Error(`Unknown or duplicate option: ${key}`);
  if (key === "--confirm-task") options[key] = true;
  else {
    if (!args[i + 1] || args[i + 1].startsWith("--")) throw new Error(`A value is required for ${key}`);
    options[key] = args[++i];
  }
}
const filePath = process.env.MS_REALTY_TASK_LEDGER_PATH;
if (!filePath) throw new Error("Set MS_REALTY_TASK_LEDGER_PATH to the operator task ledger");
if (options["--read"]) {
  console.log(JSON.stringify(readSourceReviewTask(options["--read"], filePath), null, 2));
} else {
  const reportPath = options["--report"];
  if (!reportPath || fs.existsSync(reportPath)) throw new Error("Use a new --report path; previous evidence must be retained");
  // Payload is only a source here. Enforce read-only at the database connection.
  const dbUrl = new URL(process.env.DATABASE_URL);
  dbUrl.searchParams.set("options", "-c default_transaction_read_only=on");
  process.env.DATABASE_URL = dbUrl.toString();
  const payload = await loadPayloadCmsImportRuntime();
  try {
    const report = await runHermesSourceReview({
      loadSeed: () => projectListingDraftSeed(loadCmsSeed(), { payload, requirePayload: true }),
      registry: loadLocaleRegistry(), listingId: options["--listing"], taskId: options["--task"],
      actor: options["--actor"], owner: options["--owner"], reason: options["--reason"], humanConfirmed: options["--confirm-task"] === true,
      filePath, auditLogPath: process.env.MS_REALTY_AUDIT_LOG_PATH,
    });
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    console.log(JSON.stringify({ report: reportPath, capability: report.capability, translation_status: report.translation_status, summary: report.summary, rejected: report.rejected, operator_path: "/admin/tasks" }));
    assertHermesDraftWorkerReport(report);
  } finally {
    await payload.destroy?.();
  }
}

// The command has finished its durable writes and closed Payload. Provider or
// database transport handles can remain referenced; drain output before exiting.
await new Promise((resolve, reject) => process.stdout.write("", (error) => error ? reject(error) : resolve()));
process.exit(0);
