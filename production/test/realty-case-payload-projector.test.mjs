import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openRealtyCase, readRealtyCaseEvents, resetRealtyCaseLedger } from "../lib/realty-cases.mjs";
import { buildRealtyCasePayloadManifest } from "../lib/realty-case-payload-reconciliation.mjs";
import { applyRealtyCasePayloadManifest, validateRealtyCasePayloadManifest } from "../lib/realty-case-payload-projector.mjs";
import { fromRoot } from "../lib/paths.mjs";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function manifest({ includeFilePath = false } = {}) {
  const filePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-payload-projector-")), "cases.jsonl");
  resetRealtyCaseLedger(filePath);
  openRealtyCase(
    {
      id: "case-projector-1",
      jurisdiction: "GR",
      caseType: "buyer_purchase",
      assetKind: "residential",
      clientRef: "contact-buyer-1",
      propertyRef: "property-1",
      executionMode: "manual",
      mandate: {
        ref: "mandate-projector-1",
        grantedByRef: "contact-buyer-1",
        signedAt: "2026-07-30T08:00:00.000Z",
        signedEvidenceRef: "evidence-signed-projector-1",
        capabilities: ["case:*"],
      },
      actor: "broker-sandanski-1",
      executorKind: "human",
    },
    { filePath, recordedAt: "2026-07-30T08:05:00.000Z" },
  );
  const result = buildRealtyCasePayloadManifest(readRealtyCaseEvents(filePath), { workspaceId: "workspace-sandanski" });
  return includeFilePath ? { filePath, manifest: result } : result;
}

function fakePayload({ failOnCreate = null, raceOnCreate = null } = {}) {
  const rows = Object.fromEntries(["realty_cases", "realty_case_events", "realty_case_mandate_versions"].map((collection) => [collection, []]));
  const calls = { begin: 0, commit: 0, rollback: 0, update: [] };
  let nextId = 1;
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

test("Payload projector writes a complete case in one transaction and is idempotent on retry", async () => {
  const source = manifest();
  const target = fakePayload();

  const first = await applyRealtyCasePayloadManifest(source, { payload: target.payload });
  assert.deepEqual(first.created, { realty_cases: 1, realty_case_events: 1, realty_case_mandate_versions: 1 });
  assert.deepEqual(first.reused, { realty_cases: 0, realty_case_events: 0, realty_case_mandate_versions: 0 });
  assert.equal(target.calls.commit, 1);
  assert.equal(target.calls.rollback, 0);
  assert.deepEqual(target.calls.transactionOptions, { accessMode: "read write", isolationLevel: "serializable" });
  assert.equal(target.rows.realty_cases.length, 1);
  assert.equal(target.rows.realty_case_events[0].case, target.rows.realty_cases[0].id);

  const retry = await applyRealtyCasePayloadManifest(source, { payload: target.payload });
  assert.deepEqual(retry.created, { realty_cases: 0, realty_case_events: 0, realty_case_mandate_versions: 0 });
  assert.deepEqual(retry.reused, { realty_cases: 1, realty_case_events: 1, realty_case_mandate_versions: 1 });
  assert.equal(target.calls.commit, 2);
});

test("Payload projector retries a concurrent unique-key race and advances a stale projection without mutable snapshots", async () => {
  const source = manifest();
  const raced = fakePayload({ raceOnCreate: "realty_cases" });

  const racedResult = await applyRealtyCasePayloadManifest(source, { payload: raced.payload });
  assert.equal(racedResult.attempts, 2);
  assert.equal(raced.calls.begin, 2);
  assert.equal(raced.calls.rollback, 1);
  assert.equal(raced.rows.realty_cases.length, 1);

  const target = fakePayload();
  await applyRealtyCasePayloadManifest(source, { payload: target.payload });
  target.rows.realty_cases[0].current_phase = "stale";
  const repaired = await applyRealtyCasePayloadManifest(source, { payload: target.payload });
  assert.equal(repaired.updated.realty_cases, 1);
  assert.equal(target.calls.update[0].data.workflow_snapshot, undefined);
  assert.equal(target.calls.update[0].data.workflow_version, undefined);
});

test("Payload projector rolls back partial writes and rejects unresolved manifest gaps before opening a transaction", async () => {
  const source = manifest();
  const target = fakePayload({ failOnCreate: "realty_case_events" });

  await assert.rejects(() => applyRealtyCasePayloadManifest(source, { payload: target.payload }), /forced realty_case_events failure/);
  assert.equal(target.calls.rollback, 1);
  assert.equal(target.rows.realty_cases.length, 0);

  const blocked = clone(source);
  blocked.reconciliation.ready_for_import = false;
  const preflightTarget = fakePayload();
  assert.throws(() => validateRealtyCasePayloadManifest(blocked), /unresolved source gaps/);
  await assert.rejects(() => applyRealtyCasePayloadManifest(blocked, { payload: preflightTarget.payload }), /unresolved source gaps/);
  assert.equal(preflightTarget.calls.begin, 0);
});

test("Payload projector detects an immutable append conflict instead of rewriting a ledger row", async () => {
  const source = manifest();
  const target = fakePayload();
  await applyRealtyCasePayloadManifest(source, { payload: target.payload });
  target.rows.realty_case_events[0].payload_digest = "different-digest";

  await assert.rejects(() => applyRealtyCasePayloadManifest(source, { payload: target.payload }), /conflicts with immutable source facts/);
  assert.equal(target.calls.rollback, 1);
  assert.equal(target.rows.realty_case_events[0].payload_digest, "different-digest");
});

test("Payload projector never regresses a case that is ahead of the source manifest", async () => {
  const source = manifest();
  const target = fakePayload();
  await applyRealtyCasePayloadManifest(source, { payload: target.payload });
  target.rows.realty_cases[0].last_event_sequence = 2;

  await assert.rejects(() => applyRealtyCasePayloadManifest(source, { payload: target.payload }), /ahead of the source manifest/);
  assert.equal(target.calls.rollback, 1);
  assert.equal(target.rows.realty_cases[0].last_event_sequence, 2);
});

test("Payload projector CLI defaults to a scoped dry run against the requested ledger", () => {
  const source = manifest({ includeFilePath: true });
  const run = spawnSync(process.execPath, [fromRoot("production", "scripts", "run-realty-case-payload-projector.mjs")], {
    cwd: fromRoot(),
    encoding: "utf8",
    env: {
      ...process.env,
      MS_REALTY_CASE_LEDGER_PATH: source.filePath,
      MS_REALTY_WORKSPACE_ID: "workspace-sandanski",
    },
  });

  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(JSON.parse(run.stdout), {
    dry_run: true,
    workspace_id: "workspace-sandanski",
    planned: { realty_cases: 1, realty_case_events: 1, realty_case_mandate_versions: 1 },
  });
});
