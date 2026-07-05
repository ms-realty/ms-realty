import fs from "node:fs";
import path from "node:path";
import { DEFAULT_LEAD_LEDGER_PATH, readLeadLedger } from "./lead-ledger.mjs";
import { DEFAULT_REPLY_OUTBOX_PATH, readReplyOutbox } from "./lead-replies.mjs";
import { fromRoot } from "./paths.mjs";

export const DEFAULT_LEAD_SLA_REPORT = fromRoot("production", "data", "lead-sla-report.json");

function due(now, isoString) {
  return Date.parse(now) >= Date.parse(isoString);
}

export function buildLeadSlaReport({
  leads = readLeadLedger(DEFAULT_LEAD_LEDGER_PATH),
  replies = readReplyOutbox(DEFAULT_REPLY_OUTBOX_PATH),
  generatedAt = new Date().toISOString(),
} = {}) {
  const replied = new Set(replies.filter((reply) => reply.broker_approved === true).map((reply) => reply.lead_id));
  const rows = leads.map((lead) => {
    const brokerReplied = replied.has(lead.lead_id);
    const status = brokerReplied
      ? "broker_replied"
      : due(generatedAt, lead.manager_escalation_due_at)
        ? "manager_escalation_required"
        : due(generatedAt, lead.sla_due_at)
          ? "reminder_required"
          : "pending";
    return {
      lead_id: lead.lead_id,
      source: lead.source,
      assigned_broker: lead.assigned_broker,
      sla_due_at: lead.sla_due_at,
      manager_escalation_due_at: lead.manager_escalation_due_at,
      status,
      reminder_task:
        status === "reminder_required"
          ? { id: `sla-reminder-${lead.lead_id}`, owner: lead.assigned_broker, status: "open" }
          : null,
      manager_escalation:
        status === "manager_escalation_required"
          ? { id: `manager-escalation-${lead.lead_id}`, owner: "manager", status: "open" }
          : null,
    };
  });

  return {
    generated_at: generatedAt,
    summary: {
      total_leads: rows.length,
      broker_replied: rows.filter((row) => row.status === "broker_replied").length,
      reminder_required: rows.filter((row) => row.status === "reminder_required").length,
      manager_escalation_required: rows.filter((row) => row.status === "manager_escalation_required").length,
      pending: rows.filter((row) => row.status === "pending").length,
    },
    rows,
  };
}

export function assertLeadSlaReport(report) {
  if (!report.rows.length) throw new Error("Lead SLA report must contain lead rows");
  if (report.summary.total_leads !== report.rows.length) throw new Error("Lead SLA summary must match rows");
  for (const row of report.rows) {
    if (!row.lead_id || !row.sla_due_at || !row.manager_escalation_due_at) {
      throw new Error("Lead SLA rows must preserve due timestamps");
    }
    if (row.status === "reminder_required" && row.reminder_task?.status !== "open") {
      throw new Error("Missed SLA rows must create an open reminder task");
    }
    if (row.status === "manager_escalation_required" && row.manager_escalation?.status !== "open") {
      throw new Error("Escalated SLA rows must create an open manager escalation");
    }
  }
  return true;
}

export function writeLeadSlaReport(report, filePath = DEFAULT_LEAD_SLA_REPORT) {
  assertLeadSlaReport(report);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(report, null, 2)}\n`);
  return filePath;
}
