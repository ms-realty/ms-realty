import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  appendLeadPipelineOutcome,
  assertLeadPipelineOutcomes,
  buildLeadPipelineQueue,
  deriveLeadPipelineStates,
  readLeadPipelineOutcomes,
} from "../lib/lead-pipeline-outcomes.mjs";

function lead(id, type) {
  return {
    lead_id: id,
    lead_type: type,
    listing_reference: `listing-${id}`,
    original_language: "en",
    admin_locale: "en",
    assigned_broker: "broker_en",
    received_at: "2026-07-18T10:00:00.000Z",
    sla_due_at: "2026-07-18T10:15:00.000Z",
  };
}

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-lead-pipeline-"));
  return {
    filePath: path.join(directory, "outcomes.jsonl"),
    context: { leads: [lead("buyer-1", "buyer"), lead("renter-1", "renter")], viewings: [], viewingFollowUps: [], deals: [] },
  };
}

function qualifyInput(leadId, extra = {}) {
  return {
    leadId,
    actor: "broker_en",
    action: "qualify",
    budgetMinEur: 90000,
    budgetMaxEur: 140000,
    locations: "Sandanski, Petrich",
    propertyTypes: "apartment, house",
    bedroomsMin: 2,
    timeline: "Within three months",
    financeStatus: "cash",
    nextFollowUpAt: "2026-07-19T10:00:00.000Z",
    ...extra,
  };
}

test("buyer pipeline combines attributed milestones with real viewing and deal evidence", () => {
  const { filePath, context } = fixture();
  const qualified = appendLeadPipelineOutcome(context, qualifyInput("buyer-1"), {
    filePath,
    recordedAt: "2026-07-18T10:05:00.000Z",
  });
  assert.equal(qualified.lead_pipeline.stage, "qualified");
  assert.equal(qualified.lead_pipeline.requirements.budget_max_eur, 140000);

  context.viewings.push({
    id: "viewing-buyer-1",
    lead_id: "buyer-1",
    broker: "broker_en",
    booked_at: "2026-07-18T10:10:00.000Z",
    starts_at: "2026-07-20T10:00:00.000Z",
  });
  assert.equal(deriveLeadPipelineStates({ ...context, outcomes: readLeadPipelineOutcomes(filePath) }).find((row) => row.lead_id === "buyer-1").stage, "viewing_booked");

  context.viewingFollowUps.push({
    id: "viewing-follow-up-buyer-1",
    viewing_id: "viewing-buyer-1",
    lead_id: "buyer-1",
    actor: "broker_en",
    task: "follow_up",
    action: "complete",
    recorded_at: "2026-07-20T11:00:00.000Z",
  });
  const offer = appendLeadPipelineOutcome(
    context,
    { leadId: "buyer-1", actor: "broker_en", action: "offer_submitted", offerAmountEur: 128000 },
    { filePath, recordedAt: "2026-07-20T11:05:00.000Z" },
  );
  assert.equal(offer.lead_pipeline.stage, "offer");
  appendLeadPipelineOutcome(context, { leadId: "buyer-1", actor: "broker_en", action: "due_diligence_started" }, { filePath, recordedAt: "2026-07-20T12:00:00.000Z" });
  appendLeadPipelineOutcome(context, { leadId: "buyer-1", actor: "broker_en", action: "contract_signed" }, { filePath, recordedAt: "2026-07-21T12:00:00.000Z" });
  context.deals.push({ lead_id: "buyer-1", closed_at: "2026-07-22T12:00:00.000Z" });
  const closed = buildLeadPipelineQueue({ ...context, outcomes: readLeadPipelineOutcomes(filePath) }, { now: "2026-07-23T00:00:00.000Z" });
  assert.equal(closed.states.find((row) => row.lead_id === "buyer-1").stage, "closed");
  assert.equal(closed.summary.closed, 1);
  assert.equal(assertLeadPipelineOutcomes(readLeadPipelineOutcomes(filePath)), true);
});

test("renter pipeline supports qualification, viewing, application, lease, and close", () => {
  const { filePath, context } = fixture();
  appendLeadPipelineOutcome(
    context,
    qualifyInput("renter-1", { budgetMinEur: 500, budgetMaxEur: 900, financeStatus: "not_applicable" }),
    { filePath, recordedAt: "2026-07-18T10:05:00.000Z" },
  );
  context.viewings.push({
    id: "viewing-renter-1",
    lead_id: "renter-1",
    broker: "broker_en",
    booked_at: "2026-07-18T10:10:00.000Z",
    starts_at: "2026-07-20T10:00:00.000Z",
  });
  const applied = appendLeadPipelineOutcome(
    context,
    { leadId: "renter-1", actor: "broker_en", action: "application_submitted" },
    { filePath, recordedAt: "2026-07-18T10:15:00.000Z" },
  );
  assert.equal(applied.lead_pipeline.stage, "application");
  const leased = appendLeadPipelineOutcome(
    context,
    { leadId: "renter-1", actor: "broker_en", action: "lease_signed" },
    { filePath, recordedAt: "2026-07-18T10:20:00.000Z" },
  );
  assert.equal(leased.lead_pipeline.stage, "lease");
});

test("lost leads can be reopened while invalid jumps, stale timing, and private fields are rejected", () => {
  const { filePath, context } = fixture();
  assert.throws(
    () => appendLeadPipelineOutcome(context, { leadId: "buyer-1", actor: "broker_en", action: "offer_submitted", offerAmountEur: 100000 }, { filePath, recordedAt: "2026-07-18T10:05:00.000Z" }),
    /requires viewed stage/,
  );
  const lost = appendLeadPipelineOutcome(
    context,
    { id: "lost-buyer-1", leadId: "buyer-1", actor: "broker_en", action: "lost", note: "Budget no longer available." },
    { filePath, recordedAt: "2026-07-18T10:05:00.000Z" },
  );
  assert.equal(lost.lead_pipeline.status, "lost");
  const retry = appendLeadPipelineOutcome(
    context,
    { id: "lost-buyer-1", leadId: "buyer-1", actor: "broker_en", action: "lost", note: "Budget no longer available." },
    { filePath, recordedAt: "2026-07-18T10:06:00.000Z" },
  );
  assert.equal(retry.idempotent, true);
  const reopened = appendLeadPipelineOutcome(context, { leadId: "buyer-1", actor: "broker_en", action: "reopen" }, { filePath, recordedAt: "2026-07-18T10:07:00.000Z" });
  assert.equal(reopened.lead_pipeline.stage, "new");
  assert.throws(
    () => appendLeadPipelineOutcome(context, qualifyInput("buyer-1"), { filePath, recordedAt: "2026-07-18T10:06:00.000Z" }),
    /chronological order/,
  );
  assert.throws(
    () => assertLeadPipelineOutcomes([{ ...readLeadPipelineOutcomes(filePath)[0], id: "unsafe", email: "private@example.test" }]),
    /must not contain customer contact/,
  );
});
