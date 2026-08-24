import { appendAuditLog, createAuditLogEntry, readAuditLog, replaceAuditLog } from "../lib/audit-log.mjs";
import {
  auditRetentionDays,
  auditRetentionPlan,
  assertAuditRetentionPlan,
  backupAuditLog,
  defaultProtectedArtifactPaths,
} from "../lib/audit-retention.mjs";
import { DEFAULT_AUDIT_LOG_PATH } from "../lib/audit-log.mjs";
import { operatorId } from "../lib/admin-auth.mjs";
import { repoRelativePath } from "../lib/paths.mjs";

// The only thing in this repository that removes an audit row.
//
//   npm run audit:retention                      # dry run, prints the plan
//   npm run audit:retention -- --apply --actor=ivan
//
// Nothing prunes on read. The command refuses without an attributable operator,
// refuses if any protected launch-evidence or approval artifact cannot be read,
// keeps every approval-bearing action regardless of age, takes a full backup
// before the rewrite, and records the prune in the audit log it just pruned.

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const jsonOnly = args.includes("--json");
const actorArgument = args.find((argument) => argument.startsWith("--actor="))?.slice("--actor=".length);
const filePath = process.env.MS_REALTY_AUDIT_LOG_PATH || DEFAULT_AUDIT_LOG_PATH;
const now = process.env.MS_REALTY_AUDIT_RETENTION_AT || new Date().toISOString();

try {
  const retentionDays = auditRetentionDays(process.env);
  const rows = readAuditLog(filePath);
  const plan = auditRetentionPlan(rows, { now, retentionDays, artifacts: defaultProtectedArtifactPaths(process.env) });
  assertAuditRetentionPlan(plan);

  const summary = {
    kind: "ms_realty_audit_retention",
    mode: apply ? "apply" : "dry_run",
    audit_log: repoRelativePath(filePath),
    retention_days: plan.retention_days,
    cutoff: plan.cutoff,
    scanned_artifacts: plan.scanned_artifacts,
    total: plan.total,
    retained: plan.retained,
    prunable: plan.prunable,
    protected_beyond_window: plan.protected_beyond_window,
  };

  if (!apply) {
    console.log(JSON.stringify({ ...summary, protected_rows: plan.protected_rows.slice(0, 20) }, null, jsonOnly ? 0 : 2));
    if (!jsonOnly && plan.prunable) {
      console.log(`Re-run with --apply --actor=<operator-id> to remove ${plan.prunable} row(s).`);
    }
    process.exit(0);
  }

  // An accountability deletion without an accountable operator is not allowed.
  const actor = operatorId(
    actorArgument || process.env.MS_REALTY_AUDIT_RETENTION_ACTOR || "",
    "--actor / MS_REALTY_AUDIT_RETENTION_ACTOR",
  );
  if (!plan.prunable) {
    console.log(JSON.stringify({ ...summary, pruned: 0, backup_path: null }, null, jsonOnly ? 0 : 2));
    process.exit(0);
  }

  const backupPath = backupAuditLog(filePath, { now });
  replaceAuditLog(plan.retained_rows, { filePath });
  appendAuditLog(
    createAuditLogEntry(
      {
        action: "audit_log_pruned",
        actor,
        objectType: "audit_log",
        objectId: repoRelativePath(filePath),
        metadata: {
          retention_days: plan.retention_days,
          cutoff: plan.cutoff,
          pruned: plan.prunable,
          retained: plan.retained,
          protected_beyond_window: plan.protected_beyond_window,
          backup_path: repoRelativePath(backupPath),
          scanned_artifacts: plan.scanned_artifacts.length,
        },
      },
      now,
    ),
    { filePath },
  );
  console.log(
    JSON.stringify({ ...summary, pruned: plan.prunable, backup_path: repoRelativePath(backupPath) }, null, jsonOnly ? 0 : 2),
  );
} catch (error) {
  console.error(`AUDIT RETENTION REFUSED: ${error.message}`);
  process.exitCode = 1;
}
