import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import {
  appendLeadAssignment,
  applyLeadAssignments,
  assertLeadAssignments,
  createLeadAssignment,
  readLeadAssignments,
  resetLeadAssignments,
} from "../lib/lead-assignments.mjs";

function fixture() {
  return [{ lead_id: "lead-1", assigned_broker: "broker_bg", assignment_method: "rules" }];
}

test("human-confirmed lead assignment overrides rule ownership without mutating the lead ledger", () => {
  const file = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-lead-assignments-`)}/assignments.jsonl`;
  resetLeadAssignments(file);
  const assignment = createLeadAssignment(
    fixture(),
    {
      leadId: "lead-1",
      brokerId: "broker_international",
      actor: "sales_manager",
      reason: "Buyer needs English and Hebrew support.",
      assignmentConfirmed: true,
    },
    "2026-07-19T12:00:00Z",
  );
  const persisted = appendLeadAssignment(assignment, { filePath: file });
  const retry = appendLeadAssignment(assignment, { filePath: file });
  const rows = readLeadAssignments(file);
  const [lead] = applyLeadAssignments(fixture(), rows);

  assert.equal(persisted.idempotent, false);
  assert.equal(retry.idempotent, true);
  assert.equal(assertLeadAssignments(rows), true);
  assert.equal(lead.assigned_broker, "broker_international");
  assert.equal(lead.assignment_method, "manual_override");
  assert.equal(lead.broker_assignment.previous_broker_id, "broker_bg");
  assert.equal(fs.readFileSync(file, "utf8").includes("Buyer needs English"), true);
});

test("lead assignment rejects unknown leads, brokers, and unconfirmed changes", () => {
  assert.throws(
    () => createLeadAssignment(fixture(), { leadId: "missing", brokerId: "broker_bg", actor: "manager", reason: "Manual routing", assignmentConfirmed: true }),
    /Known leadId/,
  );
  assert.throws(
    () => createLeadAssignment(fixture(), { leadId: "lead-1", brokerId: "missing", actor: "manager", reason: "Manual routing", assignmentConfirmed: true }),
    /Known brokerId/,
  );
  assert.throws(
    () => createLeadAssignment(fixture(), { leadId: "lead-1", brokerId: "broker_ru", actor: "manager", reason: "Manual routing" }),
    /explicit human confirmation/,
  );
});
