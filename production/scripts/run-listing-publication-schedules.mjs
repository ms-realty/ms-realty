import { appendAuditLog, createAuditLogEntry, readAuditLog } from "../lib/audit-log.mjs";
import { applyListingEdits, readListingEdits } from "../lib/listing-edits.mjs";
import {
  executeDueListingPublicationSchedules,
  listingPublicationExecutionAuditRecords,
  readListingPublicationSchedules,
} from "../lib/listing-publication-schedules.mjs";
import { loadCmsSeed } from "../lib/runtime.mjs";
import { latestTranslationTasks, readTranslationLedger } from "../lib/translation-ledger.mjs";

const scheduleFilePath = process.env.MS_REALTY_LISTING_PUBLICATION_SCHEDULE_PATH || undefined;
const listingEditFilePath = process.env.MS_REALTY_LISTING_EDIT_LEDGER_PATH || undefined;
const translationLedgerPath = process.env.MS_REALTY_TRANSLATION_LEDGER_PATH || undefined;
const auditLogPath = process.env.MS_REALTY_AUDIT_LOG_PATH || undefined;
const executor = process.env.MS_REALTY_LISTING_PUBLICATION_EXECUTOR || "listing_publication_scheduler";
const now = process.env.MS_REALTY_LISTING_PUBLICATION_AT || new Date().toISOString();

try {
  const seed = applyListingEdits(loadCmsSeed(), readListingEdits(listingEditFilePath));
  const result = executeDueListingPublicationSchedules({
    seed,
    schedules: readListingPublicationSchedules(scheduleFilePath),
    translationTasks: latestTranslationTasks(readTranslationLedger(translationLedgerPath)),
    executor,
    now,
    scheduleFilePath,
    listingEditFilePath,
    translationLedgerPath,
  });
  const audits = readAuditLog(auditLogPath);
  let repairedAudits = 0;
  for (const record of listingPublicationExecutionAuditRecords(result.queue)) {
    if (audits.some((row) => row.action === record.input.action && row.object_id === record.input.objectId)) continue;
    appendAuditLog(createAuditLogEntry(record.input, record.recordedAt), { filePath: auditLogPath });
    repairedAudits += 1;
  }
  console.log(
    JSON.stringify({
      kind: result.kind,
      executed_at: result.executed_at,
      executor: result.executor,
      due: result.due,
      executed: result.executed,
      repaired_audits: repairedAudits,
      remaining_due: result.queue.summary.due,
    }),
  );
} catch (error) {
  console.error(`LISTING PUBLICATION SCHEDULER FAILED: ${error.message}`);
  process.exitCode = 1;
}
