import fs from "node:fs";
import { appendAuditLog, createAuditLogEntry, readAuditLog } from "../lib/audit-log.mjs";
import {
  buildAutonomousRealtyCaseIntents,
  executeAutonomousRealtyCases,
  realtyCaseExecutionAuditRecords,
} from "../lib/realty-case-executor.mjs";
import { readRealtyCaseEvents } from "../lib/realty-cases.mjs";
import {
  assertRealtyCasePayloadAuthorityConfig,
  readRealtyCaseEventsFromPayload,
  realtyCasePayloadAuthorityConfigFromEnv,
} from "../lib/realty-case-payload-authority.mjs";
import { realtyCaseRequestProjectionConfigFromEnv } from "../lib/realty-case-request-projection.mjs";

const filePath = process.env.MS_REALTY_CASE_LEDGER_PATH || undefined;
const auditLogPath = process.env.MS_REALTY_AUDIT_LOG_PATH || undefined;
const now = process.env.MS_REALTY_CASE_EXECUTOR_AT || new Date().toISOString();
const apply = process.env.MS_REALTY_CASE_EXECUTOR_APPLY === "1";

function requiredText(value, label, max = 240) {
  const text = String(value || "").trim();
  if (!text || text.length > max) throw new Error(`${label} is required and must be ${max} characters or fewer`);
  return text;
}

function trustedResultSource(sourcePath) {
  const source = JSON.parse(fs.readFileSync(requiredText(sourcePath, "MS_REALTY_CASE_EXECUTOR_RESULTS_PATH"), "utf8"));
  if (!source || typeof source !== "object" || Array.isArray(source) || !Array.isArray(source.results)) {
    throw new Error("Trusted executor result source must contain a results array");
  }
  const outcomes = new Map();
  for (const row of source.results) {
    if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error("Trusted executor result is invalid");
    const intentId = requiredText(row.intent_id, "Trusted executor result intent_id");
    if (outcomes.has(intentId)) throw new Error("Trusted executor result intent_id must be unique");
    const { intent_id: _intentId, ...outcome } = row;
    outcomes.set(intentId, outcome);
  }
  return { source_ref: requiredText(source.source_ref, "Trusted executor result source_ref"), outcomes };
}

try {
  const authorityConfig = {
    ...realtyCaseRequestProjectionConfigFromEnv(process.env),
    ...realtyCasePayloadAuthorityConfigFromEnv(process.env),
  };
  const payloadAuthority = assertRealtyCasePayloadAuthorityConfig(authorityConfig);
  const currentEvents = () =>
    payloadAuthority
      ? readRealtyCaseEventsFromPayload({ workspaceId: authorityConfig.realtyCaseWorkspaceId })
      : Promise.resolve(readRealtyCaseEvents(filePath));
  const plan = buildAutonomousRealtyCaseIntents(await currentEvents(), { now });
  if (!apply) {
    console.log(JSON.stringify({ kind: plan.kind, dry_run: true, generated_at: plan.generated_at, summary: plan.summary, intents: plan.intents }));
  } else {
    const source = trustedResultSource(process.env.MS_REALTY_CASE_EXECUTOR_RESULTS_PATH);
    const execution = await executeAutonomousRealtyCases({
      executor: (intent) => source.outcomes.get(intent.id) || null,
      actor: requiredText(process.env.MS_REALTY_CASE_EXECUTOR_ACTOR, "MS_REALTY_CASE_EXECUTOR_ACTOR", 80),
      filePath,
      now,
      payloadAuthority,
      workspaceId: authorityConfig.realtyCaseWorkspaceId,
    });
    const audited = new Set(
      readAuditLog(auditLogPath).map((row) => `${row.action}:${row.object_id}`),
    );
    let repairedAudits = 0;
    for (const record of realtyCaseExecutionAuditRecords(await currentEvents())) {
      const key = `${record.input.action}:${record.input.objectId}`;
      if (audited.has(key)) continue;
      appendAuditLog(createAuditLogEntry(record.input, record.recordedAt), { filePath: auditLogPath });
      audited.add(key);
      repairedAudits += 1;
    }
    console.log(
      JSON.stringify({
        kind: execution.kind,
        dry_run: false,
        source_ref: source.source_ref,
        executed_at: execution.executed_at,
        planned: execution.planned,
        recorded: execution.recorded,
        idempotent: execution.idempotent,
        skipped: execution.skipped,
        repaired_audits: repairedAudits,
        remaining: execution.remaining.summary,
      }),
    );
  }
} catch (error) {
  console.error(`REALTY CASE EXECUTOR FAILED: ${error.message}`);
  process.exitCode = 1;
}
