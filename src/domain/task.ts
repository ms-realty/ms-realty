// Tasks and commitments (spec §07.6, F19, A45). Waiting names what is awaited and when to
// follow up; completion records what happened and is never manufactured in bulk.
import { allowed, type Decision, defineMachine, firstDenial, need } from "./state-machine";
import type { TransitionSpec } from "./transition";

export const taskStates = ["open", "in_progress", "waiting", "done", "cancelled"] as const;
export type TaskState = (typeof taskStates)[number];

export const taskTypes = [
  "general",
  "follow_up",
  "call",
  "fact_verification",
  "document_request",
  "viewing_coordination",
  "correction",
  "publishing",
  "communication",
  "access_grant",
  "approval",
] as const;
export type TaskType = (typeof taskTypes)[number];

/** Excluded from any generic "complete all" (§07.6). */
export const highImpactTaskTypes = [
  "publishing",
  "communication",
  "access_grant",
  "approval",
] as const satisfies readonly TaskType[];

/** An internal suggestion differs from a promise made to a client. */
export const commitmentKinds = ["internal", "client_promise"] as const;
export type CommitmentKind = (typeof commitmentKinds)[number];

export const taskMachine = defineMachine<TaskState>(taskStates, {
  open: ["in_progress", "waiting", "done", "cancelled"],
  in_progress: ["open", "waiting", "done", "cancelled"],
  waiting: ["in_progress", "done", "cancelled"],
  done: [],
  cancelled: [],
});

export interface TaskEvidence {
  /** Who or what is awaited. */
  readonly waitingOn?: string;
  /** ISO 8601 follow-up instant. */
  readonly followUpAt?: string;
  /** What actually happened. */
  readonly outcomeNote?: string;
  readonly evidenceIds?: readonly string[];
  readonly evidenceRequired?: boolean;
  readonly reason?: string;
}

export function guardTaskTransition(
  _from: TaskState,
  to: TaskState,
  evidence: TaskEvidence,
): Decision {
  switch (to) {
    case "waiting":
      return firstDenial(
        need(evidence.waitingOn, "dependency_required"),
        need(evidence.followUpAt, "follow_up_required"),
      );
    case "done":
      return firstDenial(
        need(evidence.outcomeNote, "outcome_required"),
        evidence.evidenceRequired
          ? need(evidence.evidenceIds?.length, "evidence_required")
          : undefined,
      );
    case "cancelled":
      return need(evidence.reason, "reason_required");
    default:
      return allowed;
  }
}

export const taskTransitions: TransitionSpec<TaskState, TaskEvidence> = {
  recordType: "task",
  machine: taskMachine,
  capabilityFor: () => "task.manage",
  guard: (from, to, evidence) => guardTaskTransition(from, to, evidence),
};

export interface BulkCandidate {
  readonly id: string;
  readonly type: TaskType;
  readonly state: TaskState;
  readonly evidenceRequired: boolean;
}

/** Splits a selection into tasks a single bulk "done" may complete and those it may not. */
export function partitionBulkCompletion(tasks: readonly BulkCandidate[]): {
  eligible: BulkCandidate[];
  excluded: { task: BulkCandidate; code: string }[];
} {
  const eligible: BulkCandidate[] = [];
  const excluded: { task: BulkCandidate; code: string }[] = [];
  for (const task of tasks) {
    const code = (highImpactTaskTypes as readonly TaskType[]).includes(task.type)
      ? "high_impact_task"
      : task.evidenceRequired
        ? "evidence_required"
        : taskMachine.check(task.state, "done").outcome === "denied"
          ? "not_completable"
          : null;
    if (code) excluded.push({ task, code });
    else eligible.push(task);
  }
  return { eligible, excluded };
}
