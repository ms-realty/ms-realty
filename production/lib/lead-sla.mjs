import fs from "node:fs";
import path from "node:path";
import { DEFAULT_LEAD_LEDGER_PATH, readLeadLedger } from "./lead-ledger.mjs";
import { DEFAULT_REPLY_OUTBOX_PATH, readReplyOutbox } from "./lead-replies.mjs";
import { leadSnoozeDeferrals } from "./lead-snoozes.mjs";
import {
  DEFAULT_REPLY_DELIVERY_OUTCOME_LEDGER_PATH,
  deriveReplyDeliveryStates,
  readReplyDeliveryOutcomes,
} from "./reply-delivery-outcomes.mjs";
import { fromRoot } from "./paths.mjs";

export const DEFAULT_LEAD_SLA_REPORT = fromRoot("production", "data", "lead-sla-report.json");

function due(now, isoString) {
  return Date.parse(now) >= Date.parse(isoString);
}

// A snooze DEFERS the clock, it never restarts it: both due timestamps move
// out by exactly the snoozed window, so the escalation still happens.
function deferred(isoString, deferredMs) {
  if (!deferredMs) return isoString;
  const time = Date.parse(isoString);
  if (!Number.isFinite(time)) return isoString;
  return new Date(time + deferredMs).toISOString();
}

export function buildLeadSlaReport({
  leads = readLeadLedger(DEFAULT_LEAD_LEDGER_PATH),
  replies = readReplyOutbox(DEFAULT_REPLY_OUTBOX_PATH),
  replyDeliveryOutcomes = readReplyDeliveryOutcomes(DEFAULT_REPLY_DELIVERY_OUTCOME_LEDGER_PATH),
  replyDeliveryStates = null,
  snoozes = [],
  generatedAt = new Date().toISOString(),
} = {}) {
  const deliveries = replyDeliveryStates || deriveReplyDeliveryStates(replies, replyDeliveryOutcomes);
  const replied = new Set(deliveries.filter((delivery) => delivery.status === "sent").map((delivery) => delivery.lead_id));
  const snoozeStates = leadSnoozeDeferrals(snoozes, { now: generatedAt });
  const rows = leads.map((lead) => {
    const brokerReplied = replied.has(lead.lead_id);
    const snooze = snoozeStates.get(lead.lead_id) || null;
    const deferredMs = snooze?.deferred_ms || 0;
    const slaDueAt = deferred(lead.sla_due_at, deferredMs);
    const escalationDueAt = deferred(lead.manager_escalation_due_at, deferredMs);
    const status = brokerReplied
      ? "customer_reply_sent"
      : due(generatedAt, escalationDueAt)
        ? "manager_escalation_required"
        : due(generatedAt, slaDueAt)
          ? "reminder_required"
          : "pending";
    return {
      lead_id: lead.lead_id,
      source: lead.source,
      assigned_broker: lead.assigned_broker,
      sla_due_at: slaDueAt,
      manager_escalation_due_at: escalationDueAt,
      original_sla_due_at: lead.sla_due_at,
      original_manager_escalation_due_at: lead.manager_escalation_due_at,
      snooze: snooze
        ? {
            status: snooze.status,
            until: snooze.until,
            reason: snooze.reason,
            actor: snooze.actor,
            deferred_minutes: snooze.deferred_minutes,
          }
        : null,
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
      customer_reply_sent: rows.filter((row) => row.status === "customer_reply_sent").length,
      reminder_required: rows.filter((row) => row.status === "reminder_required").length,
      manager_escalation_required: rows.filter((row) => row.status === "manager_escalation_required").length,
      pending: rows.filter((row) => row.status === "pending").length,
      snoozed: rows.filter((row) => row.snooze?.status === "active").length,
    },
    rows,
  };
}

export function assertLeadSlaReport(report) {
  if (!report.rows.length) throw new Error("Lead SLA report must contain lead rows");
  if (report.summary.total_leads !== report.rows.length) throw new Error("Lead SLA summary must match rows");
  const allowedStatuses = new Set(["customer_reply_sent", "reminder_required", "manager_escalation_required", "pending"]);
  for (const status of allowedStatuses) {
    if (report.summary[status] !== report.rows.filter((row) => row.status === status).length) {
      throw new Error(`Lead SLA summary must match ${status} rows`);
    }
  }
  for (const row of report.rows) {
    if (!allowedStatuses.has(row.status)) throw new Error(`Lead SLA row has unknown status ${row.status}`);
    if (!row.lead_id || !row.sla_due_at || !row.manager_escalation_due_at) {
      throw new Error("Lead SLA rows must preserve due timestamps");
    }
    if (row.status === "reminder_required" && row.reminder_task?.status !== "open") {
      throw new Error("Missed SLA rows must create an open reminder task");
    }
    if (row.status === "manager_escalation_required" && row.manager_escalation?.status !== "open") {
      throw new Error("Escalated SLA rows must create an open manager escalation");
    }
    // A deferral may only move a clock forward. A snooze that pulled either
    // due time earlier would silently drop the escalation it was meant to
    // postpone, so the report refuses to be built.
    if (row.original_sla_due_at && Date.parse(row.sla_due_at) < Date.parse(row.original_sla_due_at)) {
      throw new Error("A snooze may only defer the reminder clock, never move it earlier");
    }
    if (
      row.original_manager_escalation_due_at &&
      Date.parse(row.manager_escalation_due_at) < Date.parse(row.original_manager_escalation_due_at)
    ) {
      throw new Error("A snooze may only defer the manager escalation, never move it earlier");
    }
    if (row.snooze && !["active", "expired", "restored", "never_snoozed"].includes(row.snooze.status)) {
      throw new Error(`Lead SLA row has unknown snooze status ${row.snooze.status}`);
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
