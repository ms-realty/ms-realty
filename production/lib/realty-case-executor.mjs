import { createHash } from "node:crypto";
import {
  DEFAULT_REALTY_CASE_LEDGER_PATH,
  appendRealtyCaseAction,
  deriveRealtyCases,
  readRealtyCaseEvents,
} from "./realty-cases.mjs";

export const REALTY_CASE_EXECUTOR_RESULT_ACTIONS = Object.freeze(["step_completed", "step_blocked"]);

const EVENT_PREFIX = "realty-case-executor-";
const RESULT_FIELDS = new Set([
  "action",
  "evidenceRefs",
  "evidence_refs",
  "reason",
  "reasonCode",
  "reason_code",
]);
const EVIDENCE_REF_FIELDS = new Set(["ref", "type", "producerKind", "producer_kind", "issuedAt", "issued_at", "digest"]);

function isoTimestamp(value, label) {
  const parsed = new Date(value);
  if (!value || Number.isNaN(parsed.getTime())) throw new Error(`${label} must be a valid timestamp`);
  return parsed.toISOString();
}

function requiredText(value, label, max = 160) {
  const text = String(value || "").trim();
  if (!text || text.length > max) throw new Error(`${label} is required and must be ${max} characters or fewer`);
  return text;
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function permittedActions(caseRecord, step) {
  const capabilities = new Set(caseRecord.mandate?.capabilities || []);
  return REALTY_CASE_EXECUTOR_RESULT_ACTIONS.filter(
    (action) =>
      capabilities.has("case:*") || capabilities.has(`case:${action}`) || capabilities.has(`step:${step.key}`),
  );
}

function activeAutonomousCase(caseRecord, now) {
  return (
    caseRecord.status === "active" &&
    caseRecord.execution_mode === "autonomous" &&
    Boolean(caseRecord.assurance_ref) &&
    (!caseRecord.mandate?.expires_at || Date.parse(caseRecord.mandate.expires_at) > Date.parse(now))
  );
}

function stableIntentId(caseRecord, step) {
  const revision = step.last_recorded_at || caseRecord.created_at;
  const digest = createHash("sha256")
    .update(JSON.stringify([caseRecord.id, caseRecord.workflow_version, step.key, revision]))
    .digest("hex")
    .slice(0, 24);
  return `${EVENT_PREFIX}${digest}`;
}

function currentIntent(intent, filePath, now) {
  return buildAutonomousRealtyCaseIntents(readRealtyCaseEvents(filePath), { now }).intents.find(
    (candidate) => candidate.event_id === intent.event_id,
  );
}

function assertEvidenceRefsOnly(value) {
  if (!Array.isArray(value) || !value.length) throw new Error("step_completed requires evidenceRefs");
  for (const row of value) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw new Error("Evidence results must contain references only");
    }
    if (Object.keys(row).some((key) => !EVIDENCE_REF_FIELDS.has(key))) {
      throw new Error("Evidence results must contain references only");
    }
  }
  return value;
}

function actionInput(intent, outcome, actor) {
  if (!outcome || typeof outcome !== "object" || Array.isArray(outcome)) {
    throw new Error("Executor result must be an object");
  }
  if (Object.keys(outcome).some((key) => !RESULT_FIELDS.has(key))) {
    throw new Error("Executor result contains unsupported data");
  }
  const action = String(outcome.action || "").trim();
  if (!REALTY_CASE_EXECUTOR_RESULT_ACTIONS.includes(action)) {
    throw new Error("Executor result must be step_completed or step_blocked");
  }
  if (!intent.allowed_actions.includes(action)) {
    throw new Error("Case mandate does not authorize this executor result");
  }
  const input = {
    id: intent.event_id,
    caseId: intent.case_id,
    action,
    stepKey: intent.step_key,
    actor,
    executorKind: "agent",
  };
  if (action === "step_completed") {
    if (hasOwn(outcome, "reason") || hasOwn(outcome, "reasonCode") || hasOwn(outcome, "reason_code")) {
      throw new Error("step_completed accepts evidenceRefs only");
    }
    input.evidenceRefs = assertEvidenceRefsOnly(outcome.evidenceRefs ?? outcome.evidence_refs);
  } else {
    if (hasOwn(outcome, "evidenceRefs") || hasOwn(outcome, "evidence_refs")) {
      throw new Error("step_blocked accepts a reason only");
    }
    input.reasonCode = requiredText(outcome.reasonCode ?? outcome.reason_code ?? outcome.reason, "reasonCode", 120);
  }
  return input;
}

function executorActor(value) {
  const actor = requiredText(value, "Executor actor", 80);
  if (/hermes/i.test(actor)) throw new Error("Hermes is draft-only and cannot execute realty cases");
  return actor;
}

export function buildAutonomousRealtyCaseIntents(events = [], { now = new Date().toISOString() } = {}) {
  const generatedAt = isoTimestamp(now, "now");
  const cases = deriveRealtyCases(events);
  const intents = [];
  const eligibleCases = new Set();

  for (const caseRecord of cases) {
    if (!activeAutonomousCase(caseRecord, generatedAt)) continue;
    for (const step of caseRecord.steps) {
      if (step.phase !== caseRecord.current_phase || step.status !== "pending") continue;
      const allowedActions = permittedActions(caseRecord, step);
      if (!allowedActions.length) continue;
      eligibleCases.add(caseRecord.id);
      const eventId = stableIntentId(caseRecord, step);
      intents.push({
        id: eventId,
        event_id: eventId,
        case_id: caseRecord.id,
        step_key: step.key,
        current_phase: caseRecord.current_phase,
        jurisdiction: caseRecord.jurisdiction,
        case_type: caseRecord.case_type,
        asset_kind: caseRecord.asset_kind,
        workflow_version: caseRecord.workflow_version,
        assurance_ref: caseRecord.assurance_ref,
        mandate_ref: caseRecord.mandate.ref,
        allowed_actions: allowedActions,
        accepted_evidence_producers: [...step.evidence_producers],
      });
    }
  }

  intents.sort((left, right) => left.case_id.localeCompare(right.case_id) || left.step_key.localeCompare(right.step_key));
  return {
    kind: "realty_case_execution_intents",
    generated_at: generatedAt,
    intents,
    summary: {
      total_cases: cases.length,
      eligible_cases: eligibleCases.size,
      planned_steps: intents.length,
      excluded_cases: cases.length - eligibleCases.size,
    },
  };
}

export async function executeAutonomousRealtyCases({
  executor,
  actor,
  filePath = DEFAULT_REALTY_CASE_LEDGER_PATH,
  now = new Date().toISOString(),
} = {}) {
  if (typeof executor !== "function") throw new Error("A trusted executor result callback is required");
  const recordedAt = isoTimestamp(now, "now");
  const executorId = executorActor(actor);
  const plan = buildAutonomousRealtyCaseIntents(readRealtyCaseEvents(filePath), { now: recordedAt });
  const results = [];

  for (const plannedIntent of plan.intents) {
    const beforeResult = currentIntent(plannedIntent, filePath, recordedAt);
    if (!beforeResult) {
      results.push({ intent_id: plannedIntent.id, status: "skipped_stale_plan" });
      continue;
    }
    const outcome = await executor(beforeResult);
    if (outcome == null) {
      results.push({ intent_id: beforeResult.id, status: "skipped_no_result" });
      continue;
    }
    const input = actionInput(beforeResult, outcome, executorId);
    if (!currentIntent(beforeResult, filePath, recordedAt)) {
      results.push({ intent_id: beforeResult.id, status: "skipped_eligibility_changed" });
      continue;
    }
    const appended = appendRealtyCaseAction(input, { filePath, recordedAt });
    results.push({
      intent_id: beforeResult.id,
      status: appended.idempotent ? "idempotent" : "recorded",
      event: appended.event,
    });
  }

  const remaining = buildAutonomousRealtyCaseIntents(readRealtyCaseEvents(filePath), { now: recordedAt });
  return {
    kind: "realty_case_execution",
    executed_at: recordedAt,
    actor: executorId,
    planned: plan.intents.length,
    recorded: results.filter((row) => row.status === "recorded").length,
    idempotent: results.filter((row) => row.status === "idempotent").length,
    skipped: results.filter((row) => row.status.startsWith("skipped_")).length,
    results,
    remaining,
  };
}

export function realtyCaseExecutionAuditRecords(events = []) {
  const cases = new Map(deriveRealtyCases(events).map((caseRecord) => [caseRecord.id, caseRecord]));
  return events
    .filter((event) => event.executor_kind === "agent" && String(event.id || "").startsWith(EVENT_PREFIX))
    .map((event) => {
      const caseRecord = cases.get(event.case_id);
      return {
        recordedAt: event.recorded_at,
        input: {
          action: "realty_case_action_recorded",
          actor: event.actor,
          objectType: "realty_case_event",
          objectId: event.id,
          metadata: {
            case_id: event.case_id,
            case_action: event.action,
            step_key: event.step_key,
            execution_mode: caseRecord?.execution_mode || null,
            executor_kind: event.executor_kind,
            case_status: caseRecord?.status || null,
            progress_percent: caseRecord?.progress_percent ?? null,
          },
        },
      };
    });
}
