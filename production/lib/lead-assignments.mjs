import fs from "node:fs";
import path from "node:path";
import { DEFAULT_BROKER_PROFILES } from "./leads.mjs";
import { fromRoot } from "./paths.mjs";

export const DEFAULT_LEAD_ASSIGNMENT_LEDGER_PATH = fromRoot("production", "data", "lead-assignments.jsonl");

function confirmed(value) {
  return value === true || value === "true" || value === "on" || value === "1";
}

function stableText(value, field, max) {
  const text = String(value || "").trim();
  if (!text) throw new Error(`${field} is required`);
  if (text.length > max) throw new Error(`${field} must be ${max} characters or fewer`);
  return text;
}

function currentBroker(lead = {}) {
  return lead.broker_assignment?.broker_id || lead.assigned_broker || null;
}

export function resetLeadAssignments(filePath = DEFAULT_LEAD_ASSIGNMENT_LEDGER_PATH) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "");
}

export function readLeadAssignments(filePath = DEFAULT_LEAD_ASSIGNMENT_LEDGER_PATH) {
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export function createLeadAssignment(
  leads,
  input,
  assignedAt = new Date().toISOString(),
  brokerProfiles = DEFAULT_BROKER_PROFILES,
) {
  const leadId = stableText(input.leadId || input.lead_id, "Lead id", 160);
  const lead = leads.find((candidate) => candidate.lead_id === leadId);
  if (!lead) throw new Error("Known leadId is required");
  const brokerId = stableText(input.brokerId || input.broker_id, "Broker id", 80);
  if (!brokerProfiles.some((profile) => profile.id === brokerId)) throw new Error("Known brokerId is required");
  const actor = stableText(input.actor || input.assignedBy || input.assigned_by, "Assignment actor", 80);
  const reason = stableText(input.reason, "Assignment reason", 500);
  if (!confirmed(input.assignmentConfirmed ?? input.assignment_confirmed)) {
    throw new Error("Lead assignment requires explicit human confirmation");
  }
  if (!Number.isFinite(Date.parse(assignedAt))) throw new Error("assignedAt must be an ISO timestamp");

  return {
    assigned_at: assignedAt,
    lead_id: leadId,
    previous_broker_id: currentBroker(lead),
    broker_id: brokerId,
    assignment_method: "manual_override",
    assigned_by: actor,
    reason,
    human_confirmed: true,
  };
}

function sameIntent(left, right) {
  return (
    left.lead_id === right.lead_id &&
    left.broker_id === right.broker_id &&
    left.assigned_by === right.assigned_by &&
    left.reason === right.reason
  );
}

export function appendLeadAssignment(assignment, { filePath = DEFAULT_LEAD_ASSIGNMENT_LEDGER_PATH } = {}) {
  const rows = readLeadAssignments(filePath);
  const existing = rows.find((row) => sameIntent(row, assignment));
  if (existing) return { ...existing, idempotent: true };

  const baseId = `lead-assignment-${assignment.lead_id}`;
  let id = baseId;
  let suffix = 2;
  while (rows.some((row) => row.id === id)) {
    id = `${baseId}-${suffix}`;
    suffix += 1;
  }
  const persisted = { ...assignment, id };
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(persisted)}\n`);
  return { ...persisted, idempotent: false };
}

export function applyLeadAssignments(leads, assignments = []) {
  const latestByLead = new Map(assignments.map((assignment) => [assignment.lead_id, assignment]));
  return leads.map((lead) => {
    const assignment = latestByLead.get(lead.lead_id);
    const brokerId = assignment?.broker_id || currentBroker(lead);
    if (!brokerId) return lead;
    return {
      ...lead,
      assigned_broker: brokerId,
      assignment_method: assignment?.assignment_method || lead.assignment_method || lead.broker_assignment?.method || "rules",
      broker_assignment: {
        ...(lead.broker_assignment || {}),
        status: "assigned",
        broker_id: brokerId,
        method: assignment?.assignment_method || lead.assignment_method || lead.broker_assignment?.method || "rules",
        ...(assignment
          ? {
              assigned_at: assignment.assigned_at,
              assigned_by: assignment.assigned_by,
              previous_broker_id: assignment.previous_broker_id,
            }
          : {}),
      },
    };
  });
}

export function assertLeadAssignments(rows) {
  const ids = new Set();
  for (const row of rows) {
    if (
      !row.id ||
      !row.assigned_at ||
      !row.lead_id ||
      !row.broker_id ||
      !row.assigned_by ||
      !row.reason ||
      row.assignment_method !== "manual_override" ||
      row.human_confirmed !== true
    ) {
      throw new Error("Lead assignment row is missing audit data");
    }
    if (ids.has(row.id)) throw new Error("Lead assignment ids must be unique");
    ids.add(row.id);
    if (["contact", "email", "message", "phone", "whatsapp"].some((field) => field in row)) {
      throw new Error("Lead assignments must not contain private contact data");
    }
  }
  return true;
}
