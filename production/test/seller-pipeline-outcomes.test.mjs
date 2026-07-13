import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { createSellerPipelineItem } from "../lib/seller-pipeline.mjs";
import {
  appendSellerPipelineOutcome,
  assertSellerPipelineOutcomes,
  buildSellerPipelineQueue,
  readSellerPipelineOutcomes,
  resetSellerPipelineOutcomes,
} from "../lib/seller-pipeline-outcomes.mjs";

function sellerPipeline(leadId) {
  return createSellerPipelineItem(
    {
      lead: {
        id: leadId,
        source: "website_seller_valuation",
        leadType: "seller",
        contact: { name: "Nikos Papadopoulos" },
        property: { location: "Sandanski", type: "house" },
      },
      original_language: "el",
      admin_locale: "en",
    },
    { createdAt: "2026-07-10T08:00:00Z", owner: "broker_international" },
  );
}

test("seller pipeline outcomes derive a forward broker workflow with idempotent milestones", () => {
  const file = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-seller-outcomes-`)}/outcomes.jsonl`;
  resetSellerPipelineOutcomes(file);
  const pipelines = [sellerPipeline("seller-lead-lifecycle")];

  assert.throws(
    () =>
      appendSellerPipelineOutcome(
        pipelines,
        { sellerPipelineId: pipelines[0].id, actor: "broker_international", action: "appraisal_completed" },
        { filePath: file, recordedAt: "2026-07-10T09:00:00Z" },
      ),
    /must be scheduled/,
  );

  const callback = appendSellerPipelineOutcome(
    pipelines,
    { id: "seller-callback", sellerPipelineId: pipelines[0].id, actor: "broker_international", action: "callback_completed" },
    { filePath: file, recordedAt: "2026-07-10T09:00:00Z" },
  );
  assert.equal(callback.idempotent, false);
  assert.equal(callback.seller_pipeline.stage, "callback_completed");
  assert.equal(callback.seller_pipeline.next_task.kind, "appraisal");

  const callbackRetry = appendSellerPipelineOutcome(
    pipelines,
    { id: "seller-callback", sellerPipelineId: pipelines[0].id, actor: "broker_international", action: "callback_completed" },
    { filePath: file, recordedAt: "2026-07-10T09:00:00Z" },
  );
  assert.equal(callbackRetry.idempotent, true);

  const scheduled = appendSellerPipelineOutcome(
    pipelines,
    {
      id: "seller-appraisal-scheduled",
      sellerPipelineId: pipelines[0].id,
      actor: "broker_international",
      action: "appraisal_scheduled",
      appraisalAt: "2026-07-11T10:00:00Z",
    },
    { filePath: file, recordedAt: "2026-07-10T10:00:00Z" },
  );
  assert.equal(scheduled.seller_pipeline.appraisal_at, "2026-07-11T10:00:00.000Z");

  const rescheduled = appendSellerPipelineOutcome(
    pipelines,
    {
      sellerPipelineId: pipelines[0].id,
      actor: "broker_international",
      action: "appraisal_scheduled",
      appraisalAt: "2026-07-12T10:00:00Z",
    },
    { filePath: file, recordedAt: "2026-07-10T11:00:00Z" },
  );
  assert.equal(rescheduled.seller_pipeline.appraisal_at, "2026-07-12T10:00:00.000Z");

  const appraisal = appendSellerPipelineOutcome(
    pipelines,
    { sellerPipelineId: pipelines[0].id, actor: "broker_international", action: "appraisal_completed" },
    { filePath: file, recordedAt: "2026-07-12T11:00:00Z" },
  );
  assert.equal(appraisal.seller_pipeline.next_task.kind, "mandate");

  const mandate = appendSellerPipelineOutcome(
    pipelines,
    { sellerPipelineId: pipelines[0].id, actor: "broker_international", action: "mandate_signed" },
    { filePath: file, recordedAt: "2026-07-13T09:00:00Z" },
  );
  assert.equal(mandate.seller_pipeline.next_task.kind, "listing_draft");

  const listingDraft = appendSellerPipelineOutcome(
    pipelines,
    { sellerPipelineId: pipelines[0].id, actor: "broker_international", action: "listing_draft_started", note: "Broker will create the CMS draft." },
    { filePath: file, recordedAt: "2026-07-13T10:00:00Z" },
  );
  assert.equal(listingDraft.seller_pipeline.status, "completed");
  assert.equal(listingDraft.seller_pipeline.checklist.draft_listing, "in_progress");

  const outcomes = readSellerPipelineOutcomes(file);
  const queue = buildSellerPipelineQueue(pipelines, outcomes, { now: "2026-07-13T11:00:00Z" });
  assert.equal(queue.rows.length, 0);
  assert.equal(queue.summary.completed, 1);
  assert.equal(assertSellerPipelineOutcomes(outcomes), true);
});

test("seller pipeline can close a valuation request as lost without opening a listing task", () => {
  const file = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-seller-outcomes-`)}/outcomes.jsonl`;
  resetSellerPipelineOutcomes(file);
  const pipelines = [sellerPipeline("seller-lead-lost")];
  const closed = appendSellerPipelineOutcome(
    pipelines,
    { sellerPipelineId: pipelines[0].id, actor: "broker_international", action: "closed_lost", note: "Seller is not ready to proceed." },
    { filePath: file, recordedAt: "2026-07-10T09:00:00Z" },
  );

  assert.equal(closed.seller_pipeline.status, "closed_lost");
  assert.equal(closed.seller_pipeline.next_task.status, "closed");
  assert.equal(buildSellerPipelineQueue(pipelines, readSellerPipelineOutcomes(file)).rows.length, 0);
});

test("seller pipeline rejects out-of-order actions and keeps private notes append-only", () => {
  const file = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-seller-outcomes-`)}/outcomes.jsonl`;
  resetSellerPipelineOutcomes(file);
  const pipelines = [sellerPipeline("seller-lead-timeline")];
  const input = { sellerPipelineId: pipelines[0].id, actor: "broker_international", action: "note", note: "Called the owner." };

  assert.throws(
    () => appendSellerPipelineOutcome(pipelines, { ...input, action: "callback_completed" }, { filePath: file, recordedAt: "2026-07-10T07:59:00Z" }),
    /cannot precede the valuation request/,
  );
  appendSellerPipelineOutcome(pipelines, input, { filePath: file, recordedAt: "2026-07-10T09:00:00Z" });
  appendSellerPipelineOutcome(pipelines, input, { filePath: file, recordedAt: "2026-07-10T09:01:00Z" });
  assert.equal(readSellerPipelineOutcomes(file).length, 2);
});

test("seller pipeline milestones stay idempotent after notes and a reschedule", () => {
  const file = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-seller-outcomes-`)}/outcomes.jsonl`;
  resetSellerPipelineOutcomes(file);
  const pipelines = [sellerPipeline("seller-lead-retry")];
  const callback = { sellerPipelineId: pipelines[0].id, actor: "broker_international", action: "callback_completed" };

  appendSellerPipelineOutcome(pipelines, callback, { filePath: file, recordedAt: "2026-07-10T09:00:00Z" });
  appendSellerPipelineOutcome(pipelines, { ...callback, action: "note", note: "Seller asked for a morning slot." }, { filePath: file, recordedAt: "2026-07-10T09:01:00Z" });
  assert.equal(appendSellerPipelineOutcome(pipelines, callback, { filePath: file, recordedAt: "2026-07-10T09:02:00Z" }).idempotent, true);

  const firstSchedule = { ...callback, action: "appraisal_scheduled", appraisalAt: "2026-07-11T10:00:00Z" };
  appendSellerPipelineOutcome(pipelines, firstSchedule, { filePath: file, recordedAt: "2026-07-10T09:03:00Z" });
  appendSellerPipelineOutcome(pipelines, { ...firstSchedule, appraisalAt: "2026-07-11T14:00:00Z" }, { filePath: file, recordedAt: "2026-07-10T09:04:00Z" });
  appendSellerPipelineOutcome(pipelines, { ...callback, action: "note", note: "Appointment reconfirmed." }, { filePath: file, recordedAt: "2026-07-10T09:05:00Z" });
  const retry = appendSellerPipelineOutcome(pipelines, firstSchedule, { filePath: file, recordedAt: "2026-07-10T09:06:00Z" });

  assert.equal(retry.idempotent, true);
  assert.equal(retry.seller_pipeline.appraisal_at, "2026-07-11T14:00:00.000Z");
});
