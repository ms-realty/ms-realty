import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";
import { readAuditLog } from "../lib/audit-log.mjs";
import { requiredAdminCapability } from "../lib/admin-auth.mjs";
import { appendLead, resetLeadLedger } from "../lib/lead-ledger.mjs";
import { readLeadAssignments } from "../lib/lead-assignments.mjs";
import { readLeadPipelineOutcomes } from "../lib/lead-pipeline-outcomes.mjs";
import { readLeadSnoozes } from "../lib/lead-snoozes.mjs";

// Bulk actions take ONE approval and write ONE AUDIT ENTRY PER ENQUIRY, never
// one per batch. A refusal on one enquiry never discards the rest: the body
// carries every item's own outcome with a 207 status.

const AUTH = { authorization: "Bearer local-admin-smoke" };
const JSON_AUTH = { ...AUTH, "content-type": "application/json" };
const RECEIVED_AT = "2026-07-04T00:00:00.000Z";
const NOW = "2026-07-04T00:05:00.000Z";

function tempFile(prefix) {
  const file = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-${prefix}-`)}/${prefix}.jsonl`;
  fs.writeFileSync(file, "");
  return file;
}

function leadFixture(id, leadType) {
  return {
    id: `inbox-${id}`,
    lead: {
      id,
      source: "website_listing_detail",
      intent: "inquiry",
      leadType,
      contact: { name: "Test Person", email: `${id}@example.com` },
      intake: { complete: true, missing_fields: [], captured_fields: [] },
    },
    original_language: "en",
    admin_locale: "en",
    contact_preference: "email",
    hermes_reply_draft: { broker_approval_required: true },
    confirmation: { status: "ready", message_key: "lead_received" },
    broker_assignment: { broker_id: "broker_international", method: "rules" },
  };
}

function workspace() {
  const paths = {
    leadLedgerPath: tempFile("bulk-leads"),
    leadAssignmentLedgerPath: tempFile("bulk-assignments"),
    leadSnoozeLedgerPath: tempFile("bulk-snoozes"),
    leadPipelineOutcomeLedgerPath: tempFile("bulk-pipeline"),
    sellerPipelinePath: tempFile("bulk-seller-pipeline"),
    sellerPipelineOutcomeLedgerPath: tempFile("bulk-seller-outcomes"),
    auditLogPath: tempFile("bulk-audit"),
  };
  resetLeadLedger(paths.leadLedgerPath);
  appendLead(leadFixture("lead-bulk-1", "renter"), { filePath: paths.leadLedgerPath, receivedAt: RECEIVED_AT });
  appendLead(leadFixture("lead-bulk-2", "buyer"), { filePath: paths.leadLedgerPath, receivedAt: RECEIVED_AT });
  appendLead(leadFixture("lead-bulk-3", "seller"), { filePath: paths.leadLedgerPath, receivedAt: RECEIVED_AT });
  const app = createHttpApp({
    leadDurableStore: { leadDurableStoreEnabled: false },
    ...paths,
    receivedAt: RECEIVED_AT,
    reviewedAt: NOW,
    leadSnoozeAt: NOW,
    leadSlaGeneratedAt: NOW,
  });
  return { app, ...paths };
}

function bulk(app, body) {
  return dispatchHttp(app, { url: "/api/admin/leads/bulk", method: "POST", headers: JSON_AUTH, body: JSON.stringify(body) });
}

test("the bulk route needs operations:write", () => {
  assert.equal(requiredAdminCapability("POST", "/api/admin/leads/bulk"), "operations:write");
});

test("bulk assignment writes one audit entry per enquiry, never one per batch", async () => {
  const { app, auditLogPath, leadAssignmentLedgerPath } = workspace();
  const response = await bulk(app, {
    action: "assign",
    leadIds: ["lead-bulk-1", "lead-bulk-2"],
    brokerId: "broker_bg",
    reason: "The Bulgarian desk takes both.",
    actor: "operations_lead",
    assignmentConfirmed: true,
    bulkConfirmed: true,
  });

  assert.equal(response.status, 201);
  assert.equal(response.body.kind, "lead_bulk_action");
  assert.equal(response.body.requested, 2);
  assert.equal(response.body.applied, 2);
  assert.equal(response.body.refused, 0);
  assert.deepEqual(response.body.results.map((row) => row.status), ["applied", "applied"]);

  const assignments = readLeadAssignments(leadAssignmentLedgerPath);
  assert.deepEqual(assignments.map((row) => row.lead_id), ["lead-bulk-1", "lead-bulk-2"]);

  const audit = readAuditLog(auditLogPath).filter((row) => row.action === "lead_assigned");
  assert.equal(audit.length, 2, "one audit entry per enquiry");
  assert.deepEqual(audit.map((row) => row.metadata.lead_id), ["lead-bulk-1", "lead-bulk-2"]);
  // No batch-level audit row stands in for the individual ones.
  assert.equal(readAuditLog(auditLogPath).some((row) => row.object_type === "lead_bulk_action"), false);
});

test("a partial failure returns 207 with per-item outcomes and keeps the successes", async () => {
  const { app, leadSnoozeLedgerPath, auditLogPath } = workspace();
  const response = await bulk(app, {
    action: "snooze",
    leadIds: ["lead-bulk-1", "lead-does-not-exist", "lead-bulk-2"],
    until: "2026-07-20T09:00:00.000Z",
    reason: "Waiting for the notary slot.",
    actor: "operations_lead",
    bulkConfirmed: true,
  });

  assert.equal(response.status, 207);
  assert.equal(response.body.requested, 3);
  assert.equal(response.body.applied, 2);
  assert.equal(response.body.refused, 1);
  const refused = response.body.results.find((row) => row.status === "refused");
  assert.equal(refused.lead_id, "lead-does-not-exist");
  assert.match(refused.message, /known leadId/);
  // The two that could be deferred were deferred; the batch did not roll back.
  assert.deepEqual(readLeadSnoozes(leadSnoozeLedgerPath).map((row) => row.lead_id), ["lead-bulk-1", "lead-bulk-2"]);
  assert.equal(readAuditLog(auditLogPath).filter((row) => row.action === "lead_snoozed").length, 2);
});

test("a retried batch is idempotent and reports unchanged rather than applied", async () => {
  const { app, leadAssignmentLedgerPath } = workspace();
  const body = {
    action: "assign",
    leadIds: ["lead-bulk-1"],
    brokerId: "broker_bg",
    reason: "The Bulgarian desk takes it.",
    actor: "operations_lead",
    assignmentConfirmed: true,
    bulkConfirmed: true,
  };
  assert.equal((await bulk(app, body)).status, 201);
  const retried = await bulk(app, body);
  assert.equal(retried.status, 200);
  assert.equal(retried.body.applied, 0);
  assert.equal(retried.body.unchanged, 1);
  assert.equal(readLeadAssignments(leadAssignmentLedgerPath).length, 1);
});

test("mark handled records a note on the pipeline the enquiry belongs to", async () => {
  const { app, leadPipelineOutcomeLedgerPath, auditLogPath } = workspace();
  const response = await bulk(app, {
    action: "handle",
    leadIds: ["lead-bulk-1", "lead-bulk-3"],
    reason: "Handled on the phone this morning.",
    actor: "operations_lead",
    bulkConfirmed: true,
  });

  // The renter goes onto the buyer/renter pipeline through its own single-item
  // path. The seller has no seller pipeline row here, so that item is refused
  // with the reason instead of being silently dropped.
  assert.equal(response.status, 207);
  const applied = response.body.results.find((row) => row.status === "applied");
  assert.equal(applied.lead_id, "lead-bulk-1");
  const refused = response.body.results.find((row) => row.status === "refused");
  assert.equal(refused.lead_id, "lead-bulk-3");
  assert.match(refused.message, /buyer or renter leadId/);

  const outcomes = readLeadPipelineOutcomes(leadPipelineOutcomeLedgerPath);
  assert.deepEqual(outcomes.map((row) => [row.lead_id, row.action]), [["lead-bulk-1", "note"]]);
  assert.equal(outcomes[0].note, "Handled on the phone this morning.");
  assert.equal(readAuditLog(auditLogPath).filter((row) => row.action === "lead_pipeline_outcome_recorded").length, 1);
});

test("the batch refuses without one explicit human confirmation, and refuses an unknown action", async () => {
  const { app, leadAssignmentLedgerPath } = workspace();
  const unconfirmed = await bulk(app, {
    action: "assign",
    leadIds: ["lead-bulk-1"],
    brokerId: "broker_bg",
    reason: "x",
    actor: "operations_lead",
    assignmentConfirmed: true,
  });
  assert.equal(unconfirmed.status, 400);
  assert.match(unconfirmed.body.message, /one explicit human confirmation/);

  for (const [body, pattern] of [
    [{ action: "delete", leadIds: ["lead-bulk-1"], bulkConfirmed: true }, /assign, snooze, or handle/],
    [{ action: "assign", leadIds: [], bulkConfirmed: true }, /at least one leadId/],
    [{ action: "assign", leadIds: Array.from({ length: 101 }, (unused, index) => `lead-${index}`), bulkConfirmed: true }, /100 enquiries or fewer/],
  ]) {
    const refused = await bulk(app, body);
    assert.equal(refused.status, 400, JSON.stringify(body.action));
    assert.match(refused.body.message, pattern);
  }
  assert.equal(readLeadAssignments(leadAssignmentLedgerPath).length, 0);
});

test("the bulk route refuses an unauthenticated caller", async () => {
  const { app } = workspace();
  const response = await dispatchHttp(app, {
    url: "/api/admin/leads/bulk",
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "assign", leadIds: ["lead-bulk-1"], bulkConfirmed: true }),
  });
  assert.equal(response.status, 401);
});
