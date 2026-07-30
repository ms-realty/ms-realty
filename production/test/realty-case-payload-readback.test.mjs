import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openRealtyCaseCondition, resetRealtyCaseConditionLedger } from "../lib/realty-case-conditions.mjs";
import { readRealtyCaseConditionPayloadManifest } from "../lib/realty-case-condition-payload-reconciliation.mjs";
import { readRealtyCasePayloadManifest } from "../lib/realty-case-payload-reconciliation.mjs";
import { reconcileRealtyCasePayloadReadback } from "../lib/realty-case-payload-readback.mjs";
import { openRealtyCase, resetRealtyCaseLedger } from "../lib/realty-cases.mjs";
import { fromRoot } from "../lib/paths.mjs";

const WORKSPACE_ID = "workspace-readback";
const CLIENT_SENTINEL = "client-ref-readback-sentinel";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function ledgers() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-payload-readback-"));
  const caseLedgerPath = path.join(directory, "cases.jsonl");
  const conditionLedgerPath = path.join(directory, "conditions.jsonl");
  resetRealtyCaseLedger(caseLedgerPath);
  resetRealtyCaseConditionLedger(conditionLedgerPath);
  return { caseLedgerPath, conditionLedgerPath };
}

function manifests() {
  const files = ledgers();
  openRealtyCase(
    {
      id: "case-readback-1",
      jurisdiction: "BG",
      caseType: "buyer_purchase",
      assetKind: "residential",
      clientRef: CLIENT_SENTINEL,
      propertyRef: "property-readback-1",
      executionMode: "manual",
      mandate: {
        ref: "mandate-readback-1",
        grantedByRef: CLIENT_SENTINEL,
        signedAt: "2026-07-30T08:00:00.000Z",
        signedEvidenceRef: "evidence://mandate/readback-1",
        capabilities: ["case:*"],
      },
      actor: "broker-sandanski-1",
      executorKind: "human",
    },
    { filePath: files.caseLedgerPath, recordedAt: "2026-07-30T08:05:00.000Z" },
  );
  openRealtyCaseCondition(
    {
      caseId: "case-readback-1",
      conditionId: "title-clearance",
      type: "title_clearance",
      dueAt: "2026-07-31T09:00:00.000Z",
      requiredEvidenceProducerRefs: ["lawyer://title-review"],
      actor: "broker-sandanski-1",
      executorKind: "human",
    },
    { filePath: files.conditionLedgerPath, caseLedgerPath: files.caseLedgerPath, recordedAt: "2026-07-30T09:00:00.000Z" },
  );
  return {
    caseManifest: readRealtyCasePayloadManifest({ filePath: files.caseLedgerPath, workspaceId: WORKSPACE_ID }),
    conditionManifest: readRealtyCaseConditionPayloadManifest({
      filePath: files.conditionLedgerPath,
      workspaceId: WORKSPACE_ID,
    }),
  };
}

function payloadDocuments({ caseManifest, conditionManifest }) {
  const caseDocument = { id: "case-db-1", ...clone(caseManifest.collections.realty_cases[0].data) };
  const conditionDocument = {
    id: "condition-db-1",
    ...clone(conditionManifest.collections.realty_case_conditions[0].data),
    case: caseDocument.id,
  };
  return {
    realty_cases: [caseDocument],
    realty_case_events: [
      { id: "case-event-db-1", ...clone(caseManifest.collections.realty_case_events[0].data), case: caseDocument.id },
    ],
    realty_case_mandate_versions: [
      { id: "mandate-db-1", ...clone(caseManifest.collections.realty_case_mandate_versions[0].data), case: caseDocument.id },
    ],
    realty_case_conditions: [conditionDocument],
    realty_case_condition_events: [
      {
        id: "condition-event-db-1",
        ...clone(conditionManifest.collections.realty_case_condition_events[0].data),
        case: caseDocument.id,
        condition: conditionDocument.id,
      },
    ],
  };
}

function fakePayload(documents) {
  const calls = [];
  const transactions = { begin: [], committed: [], rolledBack: [] };
  const payload = {
    calls,
    db: {
      beginTransaction: async (options) => {
        transactions.begin.push(options);
        return "readback-tx";
      },
      commitTransaction: async (transactionId) => transactions.committed.push(transactionId),
      rollbackTransaction: async (transactionId) => transactions.rolledBack.push(transactionId),
    },
    find: async (args) => {
      calls.push(args);
      return { docs: clone(documents[args.collection] || []) };
    },
    transactions,
  };
  return payload;
}

async function reconcile(documents, source = manifests()) {
  const payload = fakePayload(documents);
  const result = await reconcileRealtyCasePayloadReadback({ ...source, payload, workspaceId: WORKSPACE_ID });
  return { payload, result };
}

test("Payload read-back uses one workspace-scoped read-only snapshot and returns sanitized counts", async () => {
  const source = manifests();
  const { payload, result } = await reconcile(payloadDocuments(source), source);

  assert.deepEqual(result, {
    kind: "realty_case_payload_readback",
    workspace_id: WORKSPACE_ID,
    clean: true,
    case: { missing: 0, changed: 0, unexpected: 0, source_gaps: 0 },
    conditions: { missing: 0, changed: 0, unexpected: 0, source_gaps: 0 },
    scanned: {
      realty_cases: 1,
      realty_case_events: 1,
      realty_case_mandate_versions: 1,
      realty_case_conditions: 1,
      realty_case_condition_events: 1,
    },
  });
  assert.equal(JSON.stringify(result).includes(CLIENT_SENTINEL), false);
  assert.deepEqual(payload.transactions.begin, [{ accessMode: "read only", isolationLevel: "repeatable read" }]);
  assert.deepEqual(payload.transactions.committed, ["readback-tx"]);
  assert.deepEqual(payload.transactions.rolledBack, []);
  assert.equal(payload.calls.length, 5);
  for (const call of payload.calls) {
    assert.equal(call.depth, 0);
    assert.equal(call.overrideAccess, true);
    assert.equal(call.pagination, false);
    assert.deepEqual(call.where, { workspace_id: { equals: WORKSPACE_ID } });
    assert.equal(call.req.payload, payload);
    assert.equal(call.req.transactionID, "readback-tx");
    assert.equal(call.select.id, true);
  }
});

test("Payload read-back counts changed fields, broken relationships, missing rows, and unexpected rows", async () => {
  const source = manifests();
  const documents = payloadDocuments(source);
  documents.realty_cases[0].status = "frozen";
  documents.realty_case_events = [];
  documents.realty_case_condition_events[0].condition = "missing-condition-db-id";
  documents.realty_cases.push({ ...clone(documents.realty_cases[0]), id: "case-db-unexpected", case_id: "case-unexpected" });

  const { result } = await reconcile(documents, source);

  assert.equal(result.clean, false);
  assert.deepEqual(result.case, { missing: 1, changed: 1, unexpected: 1, source_gaps: 0 });
  assert.deepEqual(result.conditions, { missing: 0, changed: 1, unexpected: 0, source_gaps: 0 });
  assert.equal(JSON.stringify(result).includes("case-unexpected"), false);
});

test("Payload read-back CLI fails closed without exposing configuration values", () => {
  const result = spawnSync(process.execPath, [fromRoot("production", "scripts", "run-realty-case-payload-readback.mjs")], {
    cwd: fromRoot(),
    encoding: "utf8",
    env: {
      ...process.env,
      NODE_ENV: "development",
      MS_REALTY_WORKSPACE_ID: WORKSPACE_ID,
      MS_REALTY_CASE_READBACK_DATABASE_URL: "postgresql://reader:readback-password@db.example.test:5432/realty",
      PAYLOAD_SECRET: "payload-readback-secret-sentinel",
    },
  });

  assert.equal(result.status, 2);
  assert.deepEqual(JSON.parse(result.stdout), { kind: "realty_case_payload_readback", status: "failed" });
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, /readback-password|payload-readback-secret-sentinel/);
});
