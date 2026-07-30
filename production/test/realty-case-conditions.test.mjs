import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  appendRealtyCaseConditionAction,
  assertRealtyCaseConditionEvents,
  buildRealtyCaseConditionQueue,
  openRealtyCaseCondition,
  readRealtyCaseConditionEvents,
  resetRealtyCaseConditionLedger,
} from "../lib/realty-case-conditions.mjs";
import { openRealtyCase, resetRealtyCaseLedger } from "../lib/realty-cases.mjs";

function files() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-case-conditions-"));
  const caseLedgerPath = path.join(directory, "cases.jsonl");
  const filePath = path.join(directory, "conditions.jsonl");
  resetRealtyCaseLedger(caseLedgerPath);
  resetRealtyCaseConditionLedger(filePath);
  return { caseLedgerPath, filePath };
}

function mandate(capabilities = ["case:*"]) {
  return {
    ref: "mandate-ref",
    grantedByRef: "client-ref",
    signedAt: "2026-07-30T07:00:00.000Z",
    signedEvidenceRef: "evidence://mandate/signed",
    capabilities,
  };
}

function openCase(caseLedgerPath, id, { autonomous = false, capabilities = ["case:*"] } = {}) {
  return openRealtyCase(
    {
      id,
      jurisdiction: "BG",
      caseType: "buyer_purchase",
      assetKind: "residential",
      clientRef: `${id}-client`,
      propertyRef: `${id}-property`,
      executionMode: autonomous ? "autonomous" : "manual",
      assuranceRef: autonomous ? "assurance://trusted-agent/profile-1" : undefined,
      mandate: mandate(capabilities),
      actor: autonomous ? "trusted-agent-1" : "broker-bg-1",
      executorKind: autonomous ? "agent" : "human",
    },
    { filePath: caseLedgerPath, recordedAt: "2026-07-30T08:00:00.000Z" },
  );
}

function openCondition(filePath, caseLedgerPath, caseId, conditionId, overrides = {}) {
  return openRealtyCaseCondition(
    {
      caseId,
      conditionId,
      type: "title_clearance",
      dueAt: "2026-07-31T09:00:00.000Z",
      requiredEvidenceProducerRefs: ["lawyer://title-review", "registry://property-register"],
      actor: "broker-bg-1",
      executorKind: "human",
      ...overrides,
    },
    { filePath, caseLedgerPath, recordedAt: "2026-07-30T09:00:00.000Z" },
  );
}

function satisfied(filePath, caseLedgerPath, caseId, conditionId, overrides = {}) {
  return appendRealtyCaseConditionAction(
    {
      caseId,
      conditionId,
      action: "condition_satisfied",
      evidenceRefs: [
        { ref: "evidence://lawyer/title", producerRef: "lawyer://title-review" },
        { ref: "evidence://registry/title", producerRef: "registry://property-register" },
      ],
      actor: "broker-bg-1",
      executorKind: "human",
      ...overrides,
    },
    { filePath, caseLedgerPath, recordedAt: "2026-07-30T10:00:00.000Z" },
  );
}

test("conditions remain reference-only, idempotent, and isolated by case", () => {
  const { filePath, caseLedgerPath } = files();
  openCase(caseLedgerPath, "case-one");
  openCase(caseLedgerPath, "case-two");
  const first = openCondition(filePath, caseLedgerPath, "case-one", "title-check");
  const retry = openCondition(filePath, caseLedgerPath, "case-one", "title-check");
  assert.equal(first.idempotent, false);
  assert.equal(retry.idempotent, true);
  openCondition(filePath, caseLedgerPath, "case-two", "title-check", {
    requiredEvidenceProducerRefs: ["registry://case-two"],
  });

  assert.throws(
    () =>
      appendRealtyCaseConditionAction(
        {
          caseId: "case-two",
          conditionId: "title-check",
          action: "condition_satisfied",
          evidenceRefs: [{ ref: "evidence://case-one/title", producerRef: "registry://property-register" }],
          actor: "broker-bg-1",
          executorKind: "human",
        },
        { filePath, caseLedgerPath, recordedAt: "2026-07-30T10:00:00.000Z" },
      ),
    /every required producer ref/i,
  );
  const completed = satisfied(filePath, caseLedgerPath, "case-one", "title-check", {
    eventId: "condition-case-one-title-satisfied",
  });
  const retriedCompletion = satisfied(filePath, caseLedgerPath, "case-one", "title-check", {
    eventId: "condition-case-one-title-satisfied",
  });
  assert.equal(completed.condition.status, "satisfied");
  assert.equal(retriedCompletion.idempotent, true);
  assert.equal(readRealtyCaseConditionEvents(filePath).filter((event) => event.case_id === "case-one").length, 2);
  assert.throws(
    () =>
      openCondition(filePath, caseLedgerPath, "case-one", "raw-data", {
        conditionId: "raw-data",
        name: "Private Client Name",
      }),
    /raw personal or document data|not allowed/i,
  );
  assert.doesNotMatch(fs.readFileSync(filePath, "utf8"), /Private Client Name|document body/i);
  assert.equal(assertRealtyCaseConditionEvents(readRealtyCaseConditionEvents(filePath)), true);
});

test("conditions enforce mandate authority, chronology, expiry, and human waive or reopen", () => {
  const { filePath, caseLedgerPath } = files();
  openCase(caseLedgerPath, "case-autonomous", { autonomous: true });
  openCondition(filePath, caseLedgerPath, "case-autonomous", "finance-check", {
    actor: "trusted-agent-1",
    executorKind: "agent",
    dueAt: "2026-07-30T09:10:00.000Z",
  });
  assert.throws(
    () =>
      appendRealtyCaseConditionAction(
        {
          caseId: "case-autonomous",
          conditionId: "finance-check",
          action: "condition_expired",
          actor: "trusted-agent-1",
          executorKind: "agent",
        },
        { filePath, caseLedgerPath, recordedAt: "2026-07-30T09:05:00.000Z" },
      ),
    /cannot expire before/i,
  );
  appendRealtyCaseConditionAction(
    {
      caseId: "case-autonomous",
      conditionId: "finance-check",
      action: "condition_blocked",
      reasonCode: "awaiting_bank_confirmation",
      actor: "trusted-agent-1",
      executorKind: "agent",
    },
    { filePath, caseLedgerPath, recordedAt: "2026-07-30T09:06:00.000Z" },
  );
  assert.throws(
    () =>
      appendRealtyCaseConditionAction(
        {
          caseId: "case-autonomous",
          conditionId: "finance-check",
          action: "condition_expired",
          actor: "trusted-agent-1",
          executorKind: "agent",
        },
        { filePath, caseLedgerPath, recordedAt: "2026-07-30T09:04:00.000Z" },
      ),
    /chronological/i,
  );
  appendRealtyCaseConditionAction(
    {
      caseId: "case-autonomous",
      conditionId: "finance-check",
      action: "condition_expired",
      actor: "trusted-agent-1",
      executorKind: "agent",
    },
    { filePath, caseLedgerPath, recordedAt: "2026-07-30T09:10:00.000Z" },
  );
  assert.throws(
    () =>
      appendRealtyCaseConditionAction(
        {
          caseId: "case-autonomous",
          conditionId: "finance-check",
          action: "condition_waived",
          authorityRef: "authority://client/waiver",
          reasonCode: "client_waived_finance_condition",
          actor: "trusted-agent-1",
          executorKind: "agent",
        },
        { filePath, caseLedgerPath, recordedAt: "2026-07-30T09:11:00.000Z" },
      ),
    /human executor/i,
  );
  const waived = appendRealtyCaseConditionAction(
    {
      caseId: "case-autonomous",
      conditionId: "finance-check",
      action: "condition_waived",
      authorityRef: "authority://client/waiver",
      reasonCode: "client_waived_finance_condition",
      actor: "broker-bg-1",
      executorKind: "human",
    },
    { filePath, caseLedgerPath, recordedAt: "2026-07-30T09:11:00.000Z" },
  );
  assert.equal(waived.condition.status, "waived");
  const reopened = appendRealtyCaseConditionAction(
    {
      caseId: "case-autonomous",
      conditionId: "finance-check",
      action: "condition_reopened",
      authorityRef: "authority://client/reopen",
      reasonCode: "finance_route_changed",
      dueAt: "2026-08-01T09:00:00.000Z",
      actor: "broker-bg-1",
      executorKind: "human",
    },
    { filePath, caseLedgerPath, recordedAt: "2026-07-30T09:12:00.000Z" },
  );
  assert.equal(reopened.condition.status, "open");
  assert.equal(reopened.condition.due_at, "2026-08-01T09:00:00.000Z");

  openCase(caseLedgerPath, "case-unapproved", { capabilities: ["case:open"] });
  assert.throws(
    () => openCondition(filePath, caseLedgerPath, "case-unapproved", "blocked-by-mandate"),
    /mandate does not authorize/i,
  );
});

test("condition queue is deterministic and summarizes due and overdue work", () => {
  const { filePath, caseLedgerPath } = files();
  openCase(caseLedgerPath, "case-queue-one");
  openCase(caseLedgerPath, "case-queue-two");
  openCondition(filePath, caseLedgerPath, "case-queue-one", "overdue", { dueAt: "2026-07-30T10:00:00.000Z" });
  openCondition(filePath, caseLedgerPath, "case-queue-two", "future", { dueAt: "2026-08-02T10:00:00.000Z" });
  appendRealtyCaseConditionAction(
    {
      caseId: "case-queue-two",
      conditionId: "future",
      action: "condition_blocked",
      reasonCode: "awaiting_registry_reply",
      actor: "broker-bg-1",
      executorKind: "human",
    },
    { filePath, caseLedgerPath, recordedAt: "2026-07-30T09:30:00.000Z" },
  );
  const queue = buildRealtyCaseConditionQueue(readRealtyCaseConditionEvents(filePath), {
    now: "2026-07-31T10:00:00.000Z",
  });
  assert.deepEqual(
    queue.rows.map((row) => [row.case_id, row.id, row.status, row.due_state]),
    [
      ["case-queue-one", "overdue", "open", "overdue"],
      ["case-queue-two", "future", "blocked", "due"],
    ],
  );
  assert.deepEqual(queue.summary, {
    total: 2,
    open: 1,
    blocked: 1,
    expired: 0,
    satisfied: 0,
    waived: 0,
    unresolved: 2,
    due: 1,
    overdue: 1,
  });
});
