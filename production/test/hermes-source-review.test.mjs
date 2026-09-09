import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { sourceReviewSnapshot, sourceReviewSelection, runHermesSourceReview, readSourceReviewTask } from "../lib/hermes-source-review.mjs";
import { assertHermesDraftWorkerReport, providerRequestBody } from "../lib/hermes-draft-worker.mjs";
import { approvedPublicSeedFixture } from "./approved-public-seed.fixture.mjs";
import { contentHash } from "../lib/translations.mjs";
import { loadLocaleRegistry } from "../lib/locales.mjs";
import { readTaskEvents, buildTaskQueue, appendTaskAction } from "../lib/tasks.mjs";
import { renderAdminTaskQueuePayload } from "../lib/admin-payloads.mjs";
import { renderReactAdminBody } from "../lib/react-admin-site.mjs";

const registry = loadLocaleRegistry();
const AT = "2026-09-06T12:00:00.000Z";
function fixture() {
  const seed = approvedPublicSeedFixture();
  const record = seed.records.find((row) => row.id === "MS-00815");
  record.source_url = "https://makler-realty.com/listing/fixture-land/";
  record.facts.description = "Земеделска земя с площ 8 000 кв.м. Категория 6.";
  record.facts.price_eur = 9000;
  record.facts.area_sqm = null;
  const copy = { title: "Земя", description: record.facts.description, seo_title: "Земя", meta_description: "Пример за тест." };
  const translation = {
    ...copy, listing: record.id, locale: record.source_locale, source_locale: record.source_locale,
    status: "published", translation_state: "published", human_approved: true, public_indexable: true,
    reviewer: "Fixture reviewer", approved_at: "2026-09-01T00:00:00Z", content_origin: "human",
    publication_authorized_by: "Fixture publisher", publication_authorized_at: "2026-09-01T00:00:00Z", published_at: "2026-09-01T00:00:00Z",
    source_hash: contentHash(record.facts), translated_hash: contentHash(copy),
  };
  record.translations = [translation];
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "msr-source-review-"));
  return { seed, record, translation, args: {
    loadSeed: async () => seed, registry, listingId: record.id, taskId: "source-review-fixture", actor: "Fixture operator", owner: "Fixture broker",
    reason: "Review the source wording", humanConfirmed: true, filePath: path.join(directory, "task-events.jsonl"), auditLogPath: path.join(directory, "audit-log.jsonl"),
    provider: async () => ({ selected_passage_ids: ["passage-2"] }),
    providerMetadata: { mode: "self_hosted", model: "fixture-model", endpoint: "http://fixture/v1/chat/completions" }, now: () => AT,
  } };
}

test("source selection creates a durable unapproved operator task and existing admin readback", async () => {
  const { args, seed } = fixture();
  const before = JSON.stringify(seed);
  const report = await runHermesSourceReview(args);
  assert.deepEqual(report.summary, { attempted: 1, persisted: 1, rejected: 0 });
  assert.equal(assertHermesDraftWorkerReport(report), true);
  assert.equal(report.capability, "source_review");
  assert.equal(report.translation_status, "not_validated");
  assert.equal(report.output.passages[0].quote, "Земеделска земя с площ 8 000 кв.м. Категория 6.");
  assert.equal(report.output.source.facts.price_eur, 9000);
  assert.equal(report.output.source.facts.area_sqm, null);
  assert.equal(report.output.translation_performed, false);
  assert.equal(report.output.human_approved, false);
  const task = readSourceReviewTask(args.taskId, args.filePath);
  assert.equal(task.status, "open");
  assert.match(task.note, /Price \(EUR\): 9000/);
  assert.match(task.note, /Area \(m²\): unknown/);
  const queue = buildTaskQueue({ events: readTaskEvents(args.filePath), now: AT });
  const html = renderReactAdminBody(renderAdminTaskQueuePayload(registry, "en", queue));
  assert.match(html, /Source review draft/);
  assert.match(html, /Human review pending; no translation performed/);
  assert.throws(() => appendTaskAction({ taskId: args.taskId, action: "task_completed", actor: args.actor, note: "Reviewed" }, { filePath: args.filePath, recordedAt: AT }), /explicit human confirmation/);
  assert.equal(JSON.stringify(seed), before);
  await assert.rejects(runHermesSourceReview(args), /already exists/);
  assert.equal(readTaskEvents(args.filePath).length, 1);
});

for (const response of [
  { selected_passage_ids: ["invented"] }, { selected_passage_ids: [] },
  { selected_passage_ids: ["passage-1", "passage-1"] },
  { selected_passage_ids: ["passage-1"], body: "Residential land, grade B, 1 acre" },
  { selected_passage_ids: ["passage-1"], facts: { price_eur: 8000, area_sqm: 9000 } },
  { selected_passage_ids: ["passage-1"], citations: ["https://invented.example"] },
  { selected_passage_ids: [9000] }, null,
]) {
  test(`rejects invented or malformed selection ${JSON.stringify(response)}`, async () => {
    const { args } = fixture();
    const report = await runHermesSourceReview({ ...args, provider: async () => response });
    assert.equal(report.summary.persisted, 0);
    assert.equal(readTaskEvents(args.filePath).length, 0);
    assert.throws(() => assertHermesDraftWorkerReport(report), /persist at least one/);
  });
}

for (const mutate of [
  (f) => { f.translation.human_approved = false; },
  (f) => { f.translation.source_hash = "stale"; },
  (f) => { f.translation.translated_hash = "stale"; },
  (f) => { f.translation.reviewer = ""; },
  (f) => { f.translation.published_at = "2027-01-01T00:00:00Z"; },
  (f) => { f.record.workflow.publish_approved = false; f.record.cms_status = "draft"; },
  (f) => { f.record.facts.listing_status = "private"; },
]) {
  test("unapproved, private or stale source is refused before provider access", async () => {
    const f = fixture(); mutate(f); let calls = 0;
    await assert.rejects(runHermesSourceReview({ ...f.args, provider: async () => { calls++; return { selected_passage_ids: ["passage-1"] }; } }), /approved|source/i);
    assert.equal(calls, 0);
    assert.equal(readTaskEvents(f.args.filePath).length, 0);
  });
}

test("changed source or withdrawn approval after the model call cannot create a task", async () => {
  const f = fixture();
  const report = await runHermesSourceReview({ ...f.args, provider: async () => { f.translation.human_approved = false; return { selected_passage_ids: ["passage-2"] }; } });
  assert.equal(report.summary.rejected, 1);
  assert.equal(readTaskEvents(f.args.filePath).length, 0);
});

test("operator confirmation and reason are required before a provider call", async () => {
  const { args } = fixture();
  await assert.rejects(runHermesSourceReview({ ...args, humanConfirmed: false }), /explicit human confirmation/);
  await assert.rejects(runHermesSourceReview({ ...args, reason: "" }), /reason/);
});

test("selection request cannot write narrative and source-review proof cannot claim translation", async () => {
  const { args, seed } = fixture();
  const snapshot = sourceReviewSnapshot({ seed, registry, listingId: args.listingId, now: AT });
  assert.equal(sourceReviewSelection(snapshot, { selected_passage_ids: ["passage-1"] }).quote, "Земя");
  const body = providerRequestBody({ prompt: { role: "source_review_selection", passages: snapshot.passages } }, "fixture-model");
  assert.equal(body.tool_choice, "none");
  assert.equal(body.temperature, 0);
  assert.match(body.messages[0].content, /Do not translate/);
  assert.throws(() => providerRequestBody({ prompt: { role: "source_review_selection" } }, "fixture", { providerMode: "openrouter" }), /private Hermes/);
  const report = await runHermesSourceReview(args);
  assert.throws(() => assertHermesDraftWorkerReport({ ...report, translation_status: "passed" }), /cannot prove translation/);
  assert.throws(() => assertHermesDraftWorkerReport({ ...report, persisted: [{ ...report.persisted[0], human_approved: true }] }), /unapproved/);
});
