import { resetTranslationLedger } from "../lib/translation-ledger.mjs";
import {
  DEFAULT_HERMES_WORKER_SMOKE_AUDIT_PATH,
  DEFAULT_HERMES_WORKER_SMOKE_LEDGER_PATH,
  DEFAULT_HERMES_WORKER_SMOKE_REPORT_PATH,
  runHermesDraftWorker,
  writeHermesDraftWorkerReport,
} from "../lib/hermes-draft-worker.mjs";

function smokeProvider(row) {
  const factLine = Object.values(row.prompt.propertyFacts || {}).filter(Boolean).join(" ");
  return {
    title: `${row.object_id} ${row.prompt.targetLocale}`,
    body: `${factLine} ${row.prompt.targetLocale} draft`,
    seo_title: `${row.object_id} ${row.prompt.targetLocale}`,
    meta_description: `${factLine} ${row.prompt.targetLocale} draft`,
    citations: row.citations,
  };
}

resetTranslationLedger(DEFAULT_HERMES_WORKER_SMOKE_LEDGER_PATH, { auditPath: DEFAULT_HERMES_WORKER_SMOKE_AUDIT_PATH });
const report = await runHermesDraftWorker({
  provider: smokeProvider,
  filePath: DEFAULT_HERMES_WORKER_SMOKE_LEDGER_PATH,
  auditPath: DEFAULT_HERMES_WORKER_SMOKE_AUDIT_PATH,
  limit: 2,
});
writeHermesDraftWorkerReport(report, DEFAULT_HERMES_WORKER_SMOKE_REPORT_PATH);
console.log(`Wrote Hermes draft worker smoke report to ${DEFAULT_HERMES_WORKER_SMOKE_REPORT_PATH}`);
