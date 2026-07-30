import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  appendRealtyCaseConditionAction,
  openRealtyCaseCondition,
  resetRealtyCaseConditionLedger,
} from "../lib/realty-case-conditions.mjs";
import { buildRealtyCaseConditionPayloadManifest } from "../lib/realty-case-condition-payload-reconciliation.mjs";
import {
  applyRealtyCaseConditionPayloadManifest,
  validateRealtyCaseConditionPayloadManifest,
} from "../lib/realty-case-condition-payload-projector.mjs";
import { openRealtyCase, readRealtyCaseEvents, resetRealtyCaseLedger } from "../lib/realty-cases.mjs";
import { fromRoot } from "../lib/paths.mjs";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function source({ includePaths = false } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-condition-payload-projector-"));
  const caseLedgerPath = path.join(directory, "cases.jsonl");
  const conditionLedgerPath = path.join(directory, "conditions.jsonl");
  resetRealtyCaseLedger(caseLedgerPath);
  resetRealtyCaseConditionLedger(conditionLedgerPath);
  openRealtyCase(
    {
      id: "case-condition-projector-1",
      jurisdiction: "BG",
      caseType: "buyer_purchase",
      assetKind: "residential",
      clientRef: "client-condition-projector-1",
      propertyRef: "property-condition-projector-1",
      executionMode: "manual",
      mandate: {
        ref: "mandate-condition-projector-1",
        grantedByRef: "client-condition-projector-1",
        signedAt: "2026-07-30T08:00:00.000Z",
        signedEvidenceRef: "evidence://mandate/condition-projector-1",
        capabilities: ["case:*"],
      },
      actor: "broker-sandanski-1",
      executorKind: "human",
    },
    { filePath: caseLedgerPath, recordedAt: "2026-07-30T08:05:00.000Z" },
  );
  openRealtyCaseCondition(
    {
      caseId: "case-condition-projector-1",
      conditionId: "title-clearance",
      type: "title_clearance",
      dueAt: "2026-07-31T09:00:00.000Z",
      requiredEvidenceProducerRefs: ["lawyer://title-review", "registry://property-register"],
      actor: "broker-sandanski-1",
      executorKind: "human",
    },
    { filePath: conditionLedgerPath, caseLedgerPath, recordedAt: "2026-07-30T09:00:00.000Z" },
  );
  appendRealtyCaseConditionAction(
    {
      eventId: "condition-projector-title-satisfied",
      caseId: "case-condition-projector-1",
      conditionId: "title-clearance",
      action: "condition_satisfied",
      evidenceRefs: [
        { ref: "evidence://lawyer/title", producerRef: "lawyer://title-review" },
        { ref: "evidence://registry/title", producerRef: "registry://property-register" },
      ],
      actor: "broker-sandanski-1",
      executorKind: "human",
    },
    { filePath: conditionLedgerPath, caseLedgerPath, recordedAt: "2026-07-30T10:00:00.000Z" },
  );
  const manifest = buildRealtyCaseConditionPayloadManifest(
    fs.readFileSync(conditionLedgerPath, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse),
    { workspaceId: "workspace-sandanski" },
  );
  const caseEvent = readRealtyCaseEvents(caseLedgerPath)[0];
  return includePaths ? { caseEvent, caseLedgerPath, conditionLedgerPath, manifest } : { caseEvent, manifest };
}

function fakePayload({ failOnCreate = null, raceOnCreate = null, caseRows = [] } = {}) {
  const rows = {
    realty_cases: caseRows.map(clone),
    realty_case_conditions: [],
    realty_case_condition_events: [],
  };
  const calls = { begin: 0, commit: 0, rollback: 0, update: [] };
  let nextId = Math.max(1, ...Object.values(rows).flat().map((row) => Number(row.id) || 0)) + 1;
  let snapshot = null;
  let outsideTransactionDocument = null;
  const matches = (document, where) => Object.entries(where).every(([key, rule]) => document[key] === rule.equals);
  const payload = {
    db: {
      async beginTransaction(options) {
        calls.begin += 1;
        calls.transactionOptions = options;
        snapshot = clone(rows);
        return `transaction-${calls.begin}`;
      },
      async commitTransaction() {
        calls.commit += 1;
        snapshot = null;
      },
      async rollbackTransaction() {
        calls.rollback += 1;
        for (const key of Object.keys(rows)) rows[key] = clone(snapshot[key]);
        if (outsideTransactionDocument) rows[outsideTransactionDocument.collection].push(clone(outsideTransactionDocument.document));
        snapshot = null;
      },
    },
    async find({ collection, where }) {
      return { docs: rows[collection].filter((document) => matches(document, where)).map(clone) };
    },
    async create({ collection, data, req }) {
      assert.match(req.transactionID, /^transaction-/);
      if (collection === failOnCreate) throw new Error(`forced ${collection} failure`);
      const document = { id: nextId++, ...clone(data) };
      if (collection === raceOnCreate && !outsideTransactionDocument) {
        outsideTransactionDocument = { collection, document };
        rows[collection].push(document);
        throw new Error("duplicate key value violates unique constraint");
      }
      rows[collection].push(document);
      return clone(document);
    },
    async update({ collection, data, id, req }) {
      assert.match(req.transactionID, /^transaction-/);
      calls.update.push({ collection, data: clone(data), id });
      const document = rows[collection].find((row) => row.id === id);
      if (!document) throw new Error("missing document");
      Object.assign(document, clone(data));
      return clone(document);
    },
  };
  return { calls, payload, rows };
}

function projectedCase({ caseEvent }) {
  return { id: 1, workspace_id: "workspace-sandanski", case_id: caseEvent.case_id };
}

test("Condition Payload projector writes reference-only state and immutable events in one transaction", async () => {
  const input = source();
  const target = fakePayload({ caseRows: [projectedCase(input)] });

  const first = await applyRealtyCaseConditionPayloadManifest(input.manifest, { payload: target.payload });
  assert.deepEqual(first.created, { realty_case_conditions: 1, realty_case_condition_events: 2 });
  assert.deepEqual(first.reused, { realty_case_conditions: 0, realty_case_condition_events: 0 });
  assert.equal(target.calls.commit, 1);
  assert.equal(target.calls.rollback, 0);
  assert.deepEqual(target.calls.transactionOptions, { accessMode: "read write", isolationLevel: "serializable" });
  assert.equal(target.rows.realty_case_conditions.length, 1);
  assert.equal(target.rows.realty_case_condition_events.length, 2);
  assert.equal(target.rows.realty_case_condition_events[0].case, target.rows.realty_cases[0].id);
  assert.equal(target.rows.realty_case_condition_events[0].condition, target.rows.realty_case_conditions[0].id);

  const retry = await applyRealtyCaseConditionPayloadManifest(input.manifest, { payload: target.payload });
  assert.deepEqual(retry.created, { realty_case_conditions: 0, realty_case_condition_events: 0 });
  assert.deepEqual(retry.reused, { realty_case_conditions: 1, realty_case_condition_events: 2 });
});

test("Condition Payload projector requires its parent case and rolls back partial writes", async () => {
  const input = source();
  const missingParent = fakePayload();
  await assert.rejects(
    () => applyRealtyCaseConditionPayloadManifest(input.manifest, { payload: missingParent.payload }),
    /requires an existing projected Payload case/,
  );
  assert.equal(missingParent.calls.rollback, 1);

  const partial = fakePayload({ caseRows: [projectedCase(input)], failOnCreate: "realty_case_condition_events" });
  await assert.rejects(
    () => applyRealtyCaseConditionPayloadManifest(input.manifest, { payload: partial.payload }),
    /forced realty_case_condition_events failure/,
  );
  assert.equal(partial.calls.rollback, 1);
  assert.equal(partial.rows.realty_case_conditions.length, 0);
});

test("Condition Payload projector retries races, repairs mutable state, and rejects immutable history conflicts", async () => {
  const input = source();
  const raced = fakePayload({ caseRows: [projectedCase(input)], raceOnCreate: "realty_case_conditions" });
  const racedResult = await applyRealtyCaseConditionPayloadManifest(input.manifest, { payload: raced.payload });
  assert.equal(racedResult.attempts, 2);
  assert.equal(raced.calls.begin, 2);
  assert.equal(raced.calls.rollback, 1);
  assert.equal(raced.rows.realty_case_conditions.length, 1);

  const target = fakePayload({ caseRows: [projectedCase(input)] });
  await applyRealtyCaseConditionPayloadManifest(input.manifest, { payload: target.payload });
  target.rows.realty_case_conditions[0].status = "blocked";
  const repaired = await applyRealtyCaseConditionPayloadManifest(input.manifest, { payload: target.payload });
  assert.equal(repaired.updated.realty_case_conditions, 1);
  assert.equal(target.calls.update[0].data.condition_type, undefined);
  assert.equal(target.calls.update[0].data.required_evidence_producer_refs, undefined);

  target.rows.realty_case_condition_events[0].payload_digest = "different-digest";
  await assert.rejects(
    () => applyRealtyCaseConditionPayloadManifest(input.manifest, { payload: target.payload }),
    /conflicts with immutable source facts/,
  );
  assert.equal(target.calls.rollback, 1);
});

test("Condition Payload projector refuses ahead projections and manifest gaps before a transaction starts", async () => {
  const input = source();
  const target = fakePayload({ caseRows: [projectedCase(input)] });
  await applyRealtyCaseConditionPayloadManifest(input.manifest, { payload: target.payload });
  target.rows.realty_case_conditions[0].last_event_sequence = 3;
  await assert.rejects(
    () => applyRealtyCaseConditionPayloadManifest(input.manifest, { payload: target.payload }),
    /ahead of the source manifest/,
  );

  const blocked = clone(input.manifest);
  blocked.reconciliation.ready_for_import = false;
  const preflightTarget = fakePayload({ caseRows: [projectedCase(input)] });
  assert.throws(() => validateRealtyCaseConditionPayloadManifest(blocked), /unresolved source gaps/);
  await assert.rejects(
    () => applyRealtyCaseConditionPayloadManifest(blocked, { payload: preflightTarget.payload }),
    /unresolved source gaps/,
  );
  assert.equal(preflightTarget.calls.begin, 0);
});

test("Condition Payload projector CLI defaults to a scoped dry run", () => {
  const input = source({ includePaths: true });
  const run = spawnSync(process.execPath, [fromRoot("production", "scripts", "run-realty-case-condition-payload-projector.mjs")], {
    cwd: fromRoot(),
    encoding: "utf8",
    env: {
      ...process.env,
      MS_REALTY_CASE_CONDITION_LEDGER_PATH: input.conditionLedgerPath,
      MS_REALTY_WORKSPACE_ID: "workspace-sandanski",
    },
  });

  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(JSON.parse(run.stdout), {
    dry_run: true,
    workspace_id: "workspace-sandanski",
    planned: { realty_case_conditions: 1, realty_case_condition_events: 2 },
  });
});
