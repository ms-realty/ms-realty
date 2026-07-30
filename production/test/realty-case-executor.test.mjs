import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { readAuditLog } from "../lib/audit-log.mjs";
import {
  buildAutonomousRealtyCaseIntents,
  executeAutonomousRealtyCases,
  realtyCaseExecutionAuditRecords,
} from "../lib/realty-case-executor.mjs";
import {
  appendRealtyCaseAction,
  openRealtyCase,
  readRealtyCaseEvents,
  resetRealtyCaseLedger,
} from "../lib/realty-cases.mjs";
import { fromRoot } from "../lib/paths.mjs";

function files() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-case-executor-"));
  const filePath = path.join(directory, "cases.jsonl");
  resetRealtyCaseLedger(filePath);
  return { directory, filePath, auditPath: path.join(directory, "audit.jsonl") };
}

function mandate(ref, expiresAt = null) {
  return {
    ref,
    grantedByRef: "contact-ref",
    signedAt: "2026-07-30T07:00:00.000Z",
    ...(expiresAt ? { expiresAt } : {}),
    capabilities: ["case:*"],
  };
}

function openAutonomous(filePath, id, { expiresAt = null } = {}) {
  return openRealtyCase(
    {
      id,
      jurisdiction: "BG",
      caseType: "tenant_rental",
      assetKind: "residential",
      clientRef: `${id}-client-ref`,
      propertyRef: `${id}-property-ref`,
      executionMode: "autonomous",
      assuranceRef: "assurance://trusted-executor/profile-1",
      mandate: mandate(`${id}-mandate-ref`, expiresAt),
      actor: "trusted-agent-1",
      executorKind: "agent",
    },
    { filePath, recordedAt: "2026-07-30T08:00:00.000Z" },
  );
}

function completedOutcome(intent, producerKind = intent.accepted_evidence_producers[0]) {
  return {
    action: "step_completed",
    evidenceRefs: [{ ref: `evidence://${intent.case_id}/${intent.step_key}`, type: "case_step_record", producerKind }],
  };
}

test("planner emits ref-only stable intents only for active assured autonomous cases", () => {
  const { filePath } = files();
  openAutonomous(filePath, "case-eligible");
  openAutonomous(filePath, "case-expired", { expiresAt: "2026-07-30T08:30:00.000Z" });
  openAutonomous(filePath, "case-frozen");
  appendRealtyCaseAction(
    {
      caseId: "case-frozen",
      action: "case_frozen",
      authorityRef: "authority://client-pause",
      reasonCode: "client_requested_pause",
      actor: "trusted-agent-1",
      executorKind: "agent",
    },
    { filePath, recordedAt: "2026-07-30T08:10:00.000Z" },
  );
  openRealtyCase(
    {
      id: "case-manual",
      jurisdiction: "BG",
      caseType: "tenant_rental",
      assetKind: "residential",
      clientRef: "manual-client-ref",
      executionMode: "manual",
      mandate: mandate("manual-mandate-ref"),
      actor: "broker-bg",
      executorKind: "human",
    },
    { filePath, recordedAt: "2026-07-30T08:00:00.000Z" },
  );
  openRealtyCase(
    {
      id: "case-unassured",
      jurisdiction: "BG",
      caseType: "tenant_rental",
      assetKind: "residential",
      clientRef: "unassured-client-ref",
      executionMode: "autonomous",
      mandate: mandate("unassured-mandate-ref"),
      actor: "broker-bg",
      executorKind: "human",
    },
    { filePath, recordedAt: "2026-07-30T08:00:00.000Z" },
  );

  const plan = buildAutonomousRealtyCaseIntents(readRealtyCaseEvents(filePath), { now: "2026-07-30T09:00:00.000Z" });
  assert.equal(plan.summary.eligible_cases, 1);
  assert.equal(plan.intents.every((intent) => intent.case_id === "case-eligible"), true);
  assert.equal(plan.intents.every((intent) => intent.id === intent.event_id), true);
  assert.equal(plan.intents.every((intent) => !Object.hasOwn(intent, "client_ref") && !Object.hasOwn(intent, "property_ref")), true);
  assert.deepEqual(
    plan.intents.map((intent) => intent.id),
    buildAutonomousRealtyCaseIntents(readRealtyCaseEvents(filePath), { now: "2026-07-30T09:00:00.000Z" }).intents.map(
      (intent) => intent.id,
    ),
  );
});

test("executor records accepted evidence, exposes audit repair records, and preserves stable retry ids", async () => {
  const { filePath } = files();
  openAutonomous(filePath, "case-progress");
  const planned = buildAutonomousRealtyCaseIntents(readRealtyCaseEvents(filePath), { now: "2026-07-30T09:00:00.000Z" });
  const target = planned.intents[0];
  const outcome = completedOutcome(target);
  const execution = await executeAutonomousRealtyCases({
    filePath,
    actor: "trusted-executor-1",
    now: "2026-07-30T09:00:00.000Z",
    executor: (intent) => (intent.id === target.id ? outcome : null),
  });
  assert.equal(execution.recorded, 1);
  assert.equal(execution.results.find((row) => row.status === "recorded").event.id, target.event_id);
  assert.equal(realtyCaseExecutionAuditRecords(readRealtyCaseEvents(filePath))[0].input.objectId, target.event_id);

  const retry = appendRealtyCaseAction(
    {
      id: target.event_id,
      caseId: target.case_id,
      action: outcome.action,
      stepKey: target.step_key,
      evidenceRefs: outcome.evidenceRefs,
      actor: "trusted-executor-1",
      executorKind: "agent",
    },
    { filePath, recordedAt: "2026-07-30T09:01:00.000Z" },
  );
  assert.equal(retry.idempotent, true);
  assert.equal(readRealtyCaseEvents(filePath).filter((event) => event.id === target.event_id).length, 1);
});

test("executor rejects missing, invalid, and not-applicable results before recording a case action", async () => {
  const { filePath } = files();
  openAutonomous(filePath, "case-invalid-result");
  const target = buildAutonomousRealtyCaseIntents(readRealtyCaseEvents(filePath), {
    now: "2026-07-30T09:00:00.000Z",
  }).intents[0];
  const run = (outcome) =>
    executeAutonomousRealtyCases({
      filePath,
      actor: "trusted-executor-1",
      now: "2026-07-30T09:00:00.000Z",
      executor: (intent) => (intent.id === target.id ? outcome : null),
    });

  await assert.rejects(run({ action: "step_completed" }), /requires evidenceRefs/);
  await assert.rejects(run(completedOutcome(target, "bank")), /accepted producer/);
  await assert.rejects(run({ action: "step_not_applicable", reasonCode: "optional" }), /step_completed or step_blocked/);
  assert.equal(readRealtyCaseEvents(filePath).length, 1);
});

test("executor drops a planned result when the case is frozen before the result is applied", async () => {
  const { filePath } = files();
  openAutonomous(filePath, "case-freeze-after-plan");
  let froze = false;
  const execution = await executeAutonomousRealtyCases({
    filePath,
    actor: "trusted-executor-1",
    now: "2026-07-30T09:00:00.000Z",
    executor: (intent) => {
      if (!froze) {
        froze = true;
        appendRealtyCaseAction(
          {
            caseId: intent.case_id,
            action: "case_frozen",
            authorityRef: "authority://emergency-freeze",
            reasonCode: "operator_hold",
            actor: "trusted-agent-1",
            executorKind: "agent",
          },
          { filePath, recordedAt: "2026-07-30T09:00:00.000Z" },
        );
      }
      return completedOutcome(intent);
    },
  });
  assert.equal(execution.recorded, 0);
  assert.equal(execution.results.some((row) => row.status === "skipped_eligibility_changed"), true);
  assert.equal(readRealtyCaseEvents(filePath).some((event) => event.action === "step_completed"), false);
});

test("executor CLI plans by default and applies only an explicit trusted result source", () => {
  const { directory, filePath, auditPath } = files();
  openAutonomous(filePath, "case-cli");
  const run = (env) =>
    spawnSync(process.execPath, [fromRoot("production", "scripts", "run-realty-case-executor.mjs")], {
      cwd: fromRoot(),
      encoding: "utf8",
      env: { ...process.env, MS_REALTY_CASE_LEDGER_PATH: filePath, MS_REALTY_CASE_EXECUTOR_AT: "2026-07-30T09:00:00.000Z", ...env },
    });
  const dryRun = run({});
  assert.equal(dryRun.status, 0, dryRun.stderr);
  assert.equal(JSON.parse(dryRun.stdout).dry_run, true);
  assert.equal(readRealtyCaseEvents(filePath).length, 1);

  const intent = buildAutonomousRealtyCaseIntents(readRealtyCaseEvents(filePath), {
    now: "2026-07-30T09:00:00.000Z",
  }).intents[0];
  const sourcePath = path.join(directory, "trusted-results.json");
  fs.writeFileSync(
    sourcePath,
    JSON.stringify({ source_ref: "trusted-executor://run-1", results: [{ intent_id: intent.id, ...completedOutcome(intent) }] }),
  );
  const applied = run({
    MS_REALTY_CASE_EXECUTOR_APPLY: "1",
    MS_REALTY_CASE_EXECUTOR_RESULTS_PATH: sourcePath,
    MS_REALTY_CASE_EXECUTOR_ACTOR: "trusted-executor-1",
    MS_REALTY_AUDIT_LOG_PATH: auditPath,
  });
  assert.equal(applied.status, 0, applied.stderr);
  assert.equal(JSON.parse(applied.stdout).recorded, 1);
  assert.equal(readAuditLog(auditPath).length, 1);
});
