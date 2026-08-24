// What the Settings screen's Security and Data sections render.
//
// The renderer shows the whole B6 security surface — second-factor enrolment,
// the session list and revoke, the data export form, and the audit-retention
// preview — only when this payload is present. It returns null when the
// workspace-security ledgers are not configured, which is what keeps those
// sections in their honest "not connected" treatment rather than showing
// controls that would fail.
//
// Both runtimes render the settings page and production only ever serves the
// App Router adapter, so this lives here rather than inside either dispatcher:
// an adapter that could not build the payload rendered a settings page with the
// entire security section invisible while its APIs worked perfectly.
//
// Every section is independently defensive: a ledger that cannot be read
// reports itself as absent instead of failing the whole screen.

import { canAdminAccess } from "./admin-auth.mjs";
import { adminSessionList, adminSessionStates, readAdminSessionEvents } from "./admin-sessions.mjs";
import { auditRetentionDays, auditRetentionPlan } from "./audit-retention.mjs";
import { readAuditLog } from "./audit-log.mjs";
import { operatorTwoFactorStatus, readOperatorTwoFactorEvents } from "./operator-two-factor.mjs";
import { WORKSPACE_EXPORT_DATASETS, readWorkspaceExportEvents, workspaceExportList } from "./workspace-export.mjs";

export function buildWorkspaceSecurityView(
  principal,
  {
    currentFingerprint = "",
    notice = null,
    stepUpActive = false,
    now = new Date().toISOString(),
    auditLogPath = null,
    adminSessionLedgerPath = null,
    operatorTwoFactorPath = null,
    workspaceExportLedgerPath = null,
    auditRetentionWindowDays = null,
    runtimeDataDurableOnly = false,
  } = {},
) {
  if (!principal?.id) return null;
  if (!operatorTwoFactorPath && !adminSessionLedgerPath && !workspaceExportLedgerPath) return null;
  const auditable = Boolean(auditLogPath) && !runtimeDataDurableOnly;
  const nowMs = Date.parse(now);

  let twoFactor = null;
  try {
    twoFactor = {
      ...operatorTwoFactorStatus(readOperatorTwoFactorEvents(operatorTwoFactorPath || undefined), principal.id),
      required: principal.require_two_factor === true,
      step_up_required: principal.source === "credential_registry",
      step_up_active: stepUpActive === true,
      step_up_header: "x-ms-admin-2fa",
      writable: Boolean(operatorTwoFactorPath) && auditable,
    };
  } catch {
    twoFactor = null;
  }

  let sessions = null;
  try {
    const rows = readAdminSessionEvents(adminSessionLedgerPath || undefined);
    sessions = {
      writable: Boolean(adminSessionLedgerPath) && auditable,
      can_manage_team: canAdminAccess(principal, "team:manage"),
      current_session_id: currentFingerprint
        ? adminSessionStates(rows, { now: nowMs }).get(currentFingerprint)?.session_id || null
        : null,
      rows: adminSessionList(rows, { operatorId: principal.id, currentFingerprint, now: nowMs }),
    };
  } catch {
    sessions = null;
  }

  let exports = null;
  if (canAdminAccess(principal, "data:export")) {
    try {
      exports = {
        writable: Boolean(workspaceExportLedgerPath) && auditable,
        datasets: [...WORKSPACE_EXPORT_DATASETS],
        rows: workspaceExportList(readWorkspaceExportEvents(workspaceExportLedgerPath || undefined), {
          requestedBy: principal.id,
          now: nowMs,
        }).slice(0, 5),
      };
    } catch {
      exports = null;
    }
  }

  let retention = null;
  if (canAdminAccess(principal, "activity:read")) {
    try {
      const plan = auditRetentionPlan(readAuditLog(auditLogPath || undefined), {
        now,
        retentionDays: Number(auditRetentionWindowDays) || auditRetentionDays(),
      });
      retention = {
        retention_days: plan.retention_days,
        cutoff: plan.cutoff,
        total: plan.total,
        retained: plan.retained,
        prunable: plan.prunable,
        protected_beyond_window: plan.protected_beyond_window,
        scanned_artifacts: plan.scanned_artifacts,
        applied_on_read: false,
        apply_command: "npm run audit:retention -- --apply",
        unavailable: null,
      };
    } catch (error) {
      // A retention window we cannot verify is reported as unavailable, never
      // as a number somebody might act on.
      retention = { unavailable: error.message };
    }
  }

  return {
    operator_id: principal.id,
    notice: typeof notice === "string" && /^[a-z_]{1,40}$/.test(notice) ? notice : null,
    two_factor: twoFactor,
    sessions,
    exports,
    audit_retention: retention,
  };
}
