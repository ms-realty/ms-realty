import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  appendRealtyCaseConditionAction,
  openRealtyCaseCondition,
  readRealtyCaseConditionEvents,
  resetRealtyCaseConditionLedger,
} from "../lib/realty-case-conditions.mjs";
import {
  buildRealtyCaseConditionPayloadManifest,
  detectRealtyCaseConditionPayloadDrift,
  readRealtyCaseConditionPayloadManifest,
} from "../lib/realty-case-condition-payload-reconciliation.mjs";
import { openRealtyCase, resetRealtyCaseLedger } from "../lib/realty-cases.mjs";

function ledgers() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-condition-payload-manifest-"));
  const caseLedgerPath = path.join(directory, "cases.jsonl");
  const conditionLedgerPath = path.join(directory, "conditions.jsonl");
  resetRealtyCaseLedger(caseLedgerPath);
  resetRealtyCaseConditionLedger(conditionLedgerPath);
  return { caseLedgerPath, conditionLedgerPath };
}

function mandate() {
  return {
    ref: "mandate-condition-payload-1",
    grantedByRef: "client-condition-payload-1",
    signedAt: "2026-07-30T08:00:00.000Z",
    signedEvidenceRef: "evidence://mandate/condition-payload-1",
    capabilities: ["case:*"],
  };
}

function seededEvents({ caseLedgerPath, conditionLedgerPath }) {
  openRealtyCase(
    {
      id: "case-condition-payload-1",
      jurisdiction: "BG",
      caseType: "buyer_purchase",
      assetKind: "residential",
      clientRef: "client-condition-payload-1",
      propertyRef: "property-condition-payload-1",
      executionMode: "manual",
      mandate: mandate(),
      actor: "broker-sandanski-1",
      executorKind: "human",
    },
    { filePath: caseLedgerPath, recordedAt: "2026-07-30T08:05:00.000Z" },
  );
  openRealtyCaseCondition(
    {
      caseId: "case-condition-payload-1",
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
      eventId: "condition-payload-title-satisfied",
      caseId: "case-condition-payload-1",
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
  return readRealtyCaseConditionEvents(conditionLedgerPath);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test("condition manifest deterministically projects current state and append-only reference events", () => {
  const files = ledgers();
  const events = seededEvents(files);
  const first = buildRealtyCaseConditionPayloadManifest(events, { workspaceId: "workspace-sandanski" });
  const second = buildRealtyCaseConditionPayloadManifest(clone(events), { workspaceId: "workspace-sandanski" });
  const fromLedger = readRealtyCaseConditionPayloadManifest({
    filePath: files.conditionLedgerPath,
    workspaceId: "workspace-sandanski",
  });

  assert.deepEqual(first, second);
  assert.deepEqual(first, fromLedger);
  assert.equal(first.reconciliation.ready_for_import, true);
  assert.equal(first.collections.realty_case_conditions.length, 1);
  assert.equal(first.collections.realty_case_condition_events.length, 2);
  assert.match(first.collections.realty_case_conditions[0].manifest_id, /^mrcc_[a-f0-9]{32}$/);
  assert.equal(first.collections.realty_case_conditions[0].data.status, "satisfied");
  assert.deepEqual(
    first.collections.realty_case_conditions[0].data.evidence_refs.map((row) => row.producer_ref),
    ["lawyer://title-review", "registry://property-register"],
  );
  assert.equal(first.collections.realty_case_condition_events[1].data.sequence, 2);
  assert.equal(first.collections.realty_case_condition_events[0].references.case.match.case_id, "case-condition-payload-1");
  assert.equal(first.collections.realty_case_condition_events[0].references.condition.match.condition_id, "title-clearance");
  assert.equal(first.collections.realty_case_condition_events.every((row) => row.idempotency_key.startsWith("mrcc:")), true);
});

test("condition manifest rejects raw data and source events that violate ledger evidence rules", () => {
  const events = seededEvents(ledgers());
  const privateEvent = clone(events);
  privateEvent[0].email = "customer@example.test";
  assert.throws(
    () => buildRealtyCaseConditionPayloadManifest(privateEvent, { workspaceId: "workspace-sandanski" }),
    /private field/i,
  );

  const invalidEvidence = clone(events);
  invalidEvidence[1].evidence_refs = [{ ref: "evidence://registry/title", producer_ref: "registry://property-register" }];
  assert.throws(
    () => buildRealtyCaseConditionPayloadManifest(invalidEvidence, { workspaceId: "workspace-sandanski" }),
    /every required producer ref/i,
  );
  assert.throws(() => buildRealtyCaseConditionPayloadManifest(events), /workspaceId/i);
});

test("condition reconciliation detects changed, missing, and unexpected projection records", () => {
  const manifest = buildRealtyCaseConditionPayloadManifest(seededEvents(ledgers()), {
    workspaceId: "workspace-sandanski",
  });
  const observed = clone(manifest);
  observed.collections.realty_case_conditions[0].data.status = "blocked";
  observed.collections.realty_case_condition_events.pop();
  observed.collections.realty_case_conditions.push({
    ...clone(observed.collections.realty_case_conditions[0]),
    manifest_id: "mrcc_unexpected",
  });

  const report = detectRealtyCaseConditionPayloadDrift(manifest, observed);
  assert.equal(report.clean, false);
  assert.equal(report.changed.length, 1);
  assert.equal(report.missing.length, 1);
  assert.equal(report.unexpected.length, 1);
});
