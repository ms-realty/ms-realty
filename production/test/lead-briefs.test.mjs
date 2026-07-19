import test from "node:test";
import assert from "node:assert/strict";
import { assertLeadBriefs, buildLeadBriefs } from "../lib/lead-briefs.mjs";

const leads = [
  {
    lead_id: "lead-escalated",
    lead_type: "foreign_buyer",
    listing_reference: "MS-CRAWL-0001",
    original_language: "de",
    admin_locale: "en",
    assigned_broker: "broker_international",
    contact_preference: "whatsapp",
    intake_completion: { complete: true, missing_fields: [] },
    requirements: { locations: ["Sandanski"], budget_max_eur: 180000, timeline: "Six months" },
  },
  {
    lead_id: "lead-unqualified",
    lead_type: "buyer",
    original_language: "bg",
    admin_locale: "bg",
    assigned_broker: "broker_bg",
    contact_preference: "phone",
    intake_completion: { complete: false, missing_fields: ["budget_max_eur", "timeline"] },
  },
];

test("lead briefs turn workflow evidence into an explainable next action", () => {
  const report = buildLeadBriefs({
    leads,
    leadSla: {
      rows: [
        { lead_id: "lead-escalated", status: "manager_escalation_required", manager_escalation_due_at: "2026-07-19T09:00:00Z" },
        { lead_id: "lead-unqualified", status: "customer_reply_sent" },
      ],
    },
    leadMatching: {
      rows: [{ lead_id: "lead-escalated", match_count: 4, broker_task: { status: "open", owner: "broker_international" } }],
    },
    leadPipelineQueue: {
      states: [
        { lead_id: "lead-escalated", status: "open", requirements: leads[0].requirements, next_action: "book_viewing", assigned_broker: "broker_international" },
        { lead_id: "lead-unqualified", status: "open", requirements: null, next_action: "qualify", assigned_broker: "broker_bg" },
      ],
      rows: [],
    },
    replyDeliveryQueue: { states: [] },
    communicationThreads: [
      { lead_id: "lead-escalated", event_count: 2 },
      { lead_id: "lead-unqualified", event_count: 1 },
    ],
  });
  assert.equal(assertLeadBriefs(report, leads), true);
  assert.deepEqual(report.rows.map((row) => row.lead_id), ["lead-escalated", "lead-unqualified"]);
  assert.equal(report.rows[0].priority, "critical");
  assert.equal(report.rows[0].next_action.code, "manager_review_and_reply");
  assert.equal(report.rows[0].readiness_score, 100);
  assert.equal(report.rows[1].next_action.code, "qualify_requirements");
  assert.equal(report.rows[1].readiness_band, "incomplete");
  assert.equal(report.rows.every((row) => row.decision_source === "deterministic_workflow"), true);
});

test("failed delivery outranks other work and closed journeys do not create fake tasks", () => {
  const report = buildLeadBriefs({
    leads,
    leadSla: { rows: leads.map((lead) => ({ lead_id: lead.lead_id, status: "customer_reply_sent" })) },
    leadPipelineQueue: {
      states: [
        { lead_id: "lead-escalated", status: "open", requirements: leads[0].requirements, next_action: "book_viewing", assigned_broker: "broker_international" },
        { lead_id: "lead-unqualified", status: "closed", assigned_broker: "broker_bg" },
      ],
      rows: [],
    },
    replyDeliveryQueue: {
      states: [{ lead_id: "lead-escalated", status: "failed", last_recorded_at: "2026-07-19T10:00:00Z" }],
    },
  });
  assert.equal(report.rows.find((row) => row.lead_id === "lead-escalated").next_action.code, "requeue_failed_reply");
  assert.equal(report.rows.find((row) => row.lead_id === "lead-unqualified").next_action.code, "journey_complete");
});
