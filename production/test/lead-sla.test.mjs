import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { assertLeadSlaReport, buildLeadSlaReport } from "../lib/lead-sla.mjs";
import { fromRoot } from "../lib/paths.mjs";

const leads = [
  {
    lead_id: "lead-answered",
    source: "website_listing_detail",
    assigned_broker: "broker_international",
    sla_due_at: "2026-07-04T00:15:00.000Z",
    manager_escalation_due_at: "2026-07-04T01:00:00.000Z",
  },
  {
    lead_id: "lead-missed",
    source: "website_seller_valuation",
    assigned_broker: "broker_international",
    sla_due_at: "2026-07-04T00:15:00.000Z",
    manager_escalation_due_at: "2026-07-04T01:00:00.000Z",
  },
];

test("lead SLA report suppresses replied leads and escalates missed manager deadlines", () => {
  const report = buildLeadSlaReport({
    leads,
    replies: [{ lead_id: "lead-answered", broker_approved: true }],
    generatedAt: "2026-07-04T01:30:00Z",
  });

  assert.equal(assertLeadSlaReport(report), true);
  assert.equal(report.summary.broker_replied, 1);
  assert.equal(report.summary.manager_escalation_required, 1);
  assert.equal(report.rows.find((row) => row.lead_id === "lead-answered").status, "broker_replied");
  assert.equal(report.rows.find((row) => row.lead_id === "lead-missed").manager_escalation.status, "open");
});

test("lead SLA report creates broker reminders before manager escalation", () => {
  const report = buildLeadSlaReport({ leads: [leads[1]], replies: [], generatedAt: "2026-07-04T00:30:00Z" });

  assert.equal(report.summary.reminder_required, 1);
  assert.equal(report.rows[0].reminder_task.status, "open");
  assert.equal(report.rows[0].manager_escalation, null);
});

test("generated lead SLA report is valid when present", () => {
  const file = fromRoot("production", "data", "lead-sla-report.json");
  if (!fs.existsSync(file)) return;
  assert.equal(assertLeadSlaReport(JSON.parse(fs.readFileSync(file, "utf8"))), true);
});
