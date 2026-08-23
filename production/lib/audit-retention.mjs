import fs from "node:fs";
import path from "node:path";
import { fromRoot, repoRelativePath } from "./paths.mjs";

// Audit-log retention.
//
// The audit log is the workspace's accountability record, so this module is
// written to make an accidental deletion impossible rather than merely
// unlikely:
//
// - Retention is a window, not a cap, and it is only ever applied by the
//   explicit `npm run audit:retention -- --apply` maintenance command. Nothing
//   prunes on read.
// - The default window is 7 years (2555 days), which covers the Bulgarian
//   statutory accounting retention an agency handover is measured against. A
//   configured window below MIN_AUDIT_RETENTION_DAYS is refused outright, so a
//   typo cannot shrink the log.
// - Approval-bearing actions are never prunable at any age.
// - Every string in every launch-evidence and approval artifact is collected
//   first; an audit row whose object id, actor or object reference appears in
//   one of them is protected and named in the plan.
// - If any required artifact cannot be read, the whole plan refuses. A run that
//   cannot verify what is still referenced does not get to delete anything.

export const DEFAULT_AUDIT_RETENTION_DAYS = 2555;
export const MIN_AUDIT_RETENTION_DAYS = 365;
export const MAX_AUDIT_RETENTION_DAYS = 36500;
export const AUDIT_RETENTION_DAYS_ENV = "MS_REALTY_AUDIT_RETENTION_DAYS";

// Actions that record an approval, a legal outcome, or a launch decision.
// These are the records an auditor, a regulator, or an owner handover asks
// for, so age alone never makes them prunable.
export const NEVER_PRUNE_ACTIONS = Object.freeze([
  "broker_contact_approved",
  "consent_withdrawn",
  "deal_closed",
  "deployable_redirects_exported",
  "launch_readiness_exported",
  "listing_publication_cancelled",
  "listing_publication_executed",
  "listing_publication_scheduled",
  "live_service_provisioning_report_imported",
  "live_service_report_imported",
  "payload_runtime_report_imported",
  "production_recovery_report_imported",
  "redirect_approval_created",
  "redirect_approvals_imported",
  "seo_evidence_imported",
  "tour_approved",
  "translation_published",
  "audit_log_pruned",
]);

const NEVER_PRUNE = new Set(NEVER_PRUNE_ACTIONS);

// Required artifacts are the launch authority and the approval record. An
// optional artifact is only consulted when its path is configured.
export function defaultProtectedArtifactPaths(env = process.env) {
  const required = [
    fromRoot("production", "data", "launch-readiness.json"),
    fromRoot("production", "data", "launch-freeze.json"),
    fromRoot("production", "data", "launch-freeze-approval.json"),
    fromRoot("production", "data", "listing-publication-approval.json"),
    fromRoot("production", "data", "redirect-approvals.jsonl"),
    fromRoot("production", "data", "tour-approvals.jsonl"),
  ].map((filePath) => ({ path: filePath, required: true }));
  const optional = [env.MS_REALTY_LAUNCH_EVIDENCE_PATH, env.MS_REALTY_AUDIT_RETENTION_EXTRA_ARTIFACTS]
    .filter(Boolean)
    .flatMap((value) => String(value).split(","))
    .map((value) => value.trim())
    .filter(Boolean)
    .map((filePath) => ({ path: filePath, required: true }));
  return [...required, ...optional];
}

export function auditRetentionDays(env = process.env) {
  const raw = String(env[AUDIT_RETENTION_DAYS_ENV] ?? "").trim();
  if (!raw) return DEFAULT_AUDIT_RETENTION_DAYS;
  if (!/^\d+$/.test(raw)) throw new Error(`${AUDIT_RETENTION_DAYS_ENV} must be a whole number of days`);
  const days = Number(raw);
  if (days < MIN_AUDIT_RETENTION_DAYS) {
    throw new Error(`${AUDIT_RETENTION_DAYS_ENV} must be at least ${MIN_AUDIT_RETENTION_DAYS} days`);
  }
  if (days > MAX_AUDIT_RETENTION_DAYS) {
    throw new Error(`${AUDIT_RETENTION_DAYS_ENV} must be at most ${MAX_AUDIT_RETENTION_DAYS} days`);
  }
  return days;
}

function collectStrings(value, into) {
  if (typeof value === "string") {
    const text = value.trim();
    if (text) into.add(text);
    return into;
  }
  if (Array.isArray(value)) {
    for (const entry of value) collectStrings(entry, into);
    return into;
  }
  if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      const label = String(key).trim();
      if (label) into.add(label);
      collectStrings(nested, into);
    }
  }
  return into;
}

function parseArtifact(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  if (filePath.endsWith(".jsonl")) {
    return text
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  }
  return JSON.parse(text);
}

// Every string that appears anywhere in a protected artifact. Broad on purpose:
// an over-protective retention plan keeps a record it did not have to; an
// under-protective one destroys evidence.
export function collectProtectedAuditReferences(artifacts = defaultProtectedArtifactPaths()) {
  const references = new Set();
  const scanned = [];
  for (const artifact of artifacts) {
    const filePath = typeof artifact === "string" ? artifact : artifact.path;
    const required = typeof artifact === "string" ? true : artifact.required !== false;
    if (!fs.existsSync(filePath)) {
      if (required) {
        throw new Error(
          `Audit retention cannot verify protected references: ${repoRelativePath(filePath)} is missing. ` +
            "Restore the artifact or remove it from the protected set before pruning.",
        );
      }
      continue;
    }
    let parsed;
    try {
      parsed = parseArtifact(filePath);
    } catch (error) {
      throw new Error(`Audit retention cannot read ${repoRelativePath(filePath)}: ${error.message}`);
    }
    collectStrings(parsed, references);
    scanned.push(repoRelativePath(filePath));
  }
  return { references, scanned };
}

function protectionFor(row, { cutoff, references }) {
  const recordedAt = Date.parse(String(row?.recorded_at || ""));
  if (!Number.isFinite(recordedAt)) return "unparsable_timestamp";
  if (recordedAt >= cutoff) return "inside_retention_window";
  if (NEVER_PRUNE.has(row.action)) return "approval_record";
  const objectId = String(row.object_id || "").trim();
  if (objectId && references.has(objectId)) return "referenced_by_launch_evidence";
  const objectRef = objectId ? `${row.object_type}:${objectId}` : "";
  if (objectRef && references.has(objectRef)) return "referenced_by_launch_evidence";
  for (const value of Object.values(row.metadata || {})) {
    if (typeof value === "string" && value.trim() && references.has(value.trim())) return "referenced_by_launch_evidence";
  }
  return null;
}

export function auditRetentionPlan(
  rows = [],
  { now = new Date().toISOString(), retentionDays = DEFAULT_AUDIT_RETENTION_DAYS, artifacts, references, scanned } = {},
) {
  const nowMs = typeof now === "number" ? now : Date.parse(now);
  if (!Number.isFinite(nowMs)) throw new Error("Audit retention needs a valid current timestamp");
  const days = Number(retentionDays);
  if (!Number.isInteger(days) || days < MIN_AUDIT_RETENTION_DAYS) {
    throw new Error(`Audit retention window must be at least ${MIN_AUDIT_RETENTION_DAYS} days`);
  }
  const collected = references ? { references, scanned: scanned || [] } : collectProtectedAuditReferences(artifacts);
  const cutoff = nowMs - days * 24 * 60 * 60 * 1000;
  const retain = [];
  const prunable = [];
  const protectedRows = [];
  for (const row of rows) {
    const protection = protectionFor(row, { cutoff, references: collected.references });
    if (protection) {
      retain.push(row);
      if (protection !== "inside_retention_window") {
        protectedRows.push({
          recorded_at: row.recorded_at,
          action: row.action,
          object_type: row.object_type,
          object_id: row.object_id,
          protected_by: protection,
        });
      }
      continue;
    }
    prunable.push(row);
  }
  return {
    kind: "ms_realty_audit_retention_plan",
    generated_at: new Date(nowMs).toISOString(),
    retention_days: days,
    cutoff: new Date(cutoff).toISOString(),
    scanned_artifacts: collected.scanned,
    total: rows.length,
    retained: retain.length,
    prunable: prunable.length,
    protected_beyond_window: protectedRows.length,
    protected_rows: protectedRows,
    retained_rows: retain,
    prunable_rows: prunable,
  };
}

// Writes a full copy of the ledger before anything is removed. The backup is
// the last line of defence and the command refuses to proceed without it.
export function backupAuditLog(filePath, { directory, now = new Date().toISOString() } = {}) {
  if (!fs.existsSync(filePath)) throw new Error(`Audit log ${repoRelativePath(filePath)} does not exist`);
  const outputDir = directory || path.join(path.dirname(filePath), "audit-log-backups");
  fs.mkdirSync(outputDir, { recursive: true, mode: 0o700 });
  const stamp = String(now).replace(/[:.]/g, "-");
  const backupPath = path.join(outputDir, `${path.basename(filePath, ".jsonl")}-${stamp}.jsonl`);
  if (fs.existsSync(backupPath)) throw new Error(`Audit log backup ${repoRelativePath(backupPath)} already exists`);
  fs.copyFileSync(filePath, backupPath);
  fs.chmodSync(backupPath, 0o600);
  return backupPath;
}

export function assertAuditRetentionPlan(plan) {
  if (plan?.kind !== "ms_realty_audit_retention_plan") throw new Error("Not an audit retention plan");
  if (plan.retained + plan.prunable !== plan.total) throw new Error("Audit retention plan does not account for every row");
  if (plan.retained_rows.length !== plan.retained || plan.prunable_rows.length !== plan.prunable) {
    throw new Error("Audit retention plan row counts disagree with its own summary");
  }
  if (plan.retention_days < MIN_AUDIT_RETENTION_DAYS) throw new Error("Audit retention window is below the enforced minimum");
  return true;
}
