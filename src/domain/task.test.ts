import { describe, expect, it } from "vitest";
import { guardTaskTransition, partitionBulkCompletion } from "./task";

describe("tasks (§07.6, F19)", () => {
  it("waiting names a dependency and a follow-up date", () => {
    expect(guardTaskTransition("open", "waiting", { waitingOn: "Owner: floor plan" })).toEqual({
      outcome: "denied",
      code: "follow_up_required",
    });
    expect(
      guardTaskTransition("open", "waiting", {
        waitingOn: "Owner: floor plan",
        followUpAt: "2026-09-30T09:00:00Z",
      }).outcome,
    ).toBe("allowed");
  });

  it("A45: completion records what happened, with evidence when required", () => {
    expect(guardTaskTransition("in_progress", "done", {})).toEqual({
      outcome: "denied",
      code: "outcome_required",
    });
    expect(
      guardTaskTransition("in_progress", "done", { outcomeNote: "Called", evidenceRequired: true }),
    ).toEqual({
      outcome: "denied",
      code: "evidence_required",
    });
  });

  it("bulk completion excludes high-impact tasks and those needing evidence", () => {
    const { eligible, excluded } = partitionBulkCompletion([
      { id: "t1", type: "general", state: "open", evidenceRequired: false },
      { id: "t2", type: "publishing", state: "open", evidenceRequired: false },
      { id: "t3", type: "communication", state: "open", evidenceRequired: false },
      { id: "t4", type: "access_grant", state: "open", evidenceRequired: false },
      { id: "t5", type: "follow_up", state: "open", evidenceRequired: true },
      { id: "t6", type: "general", state: "done", evidenceRequired: false },
    ]);
    expect(eligible.map((t) => t.id)).toEqual(["t1"]);
    expect(excluded.map(({ task, code }) => [task.id, code])).toEqual([
      ["t2", "high_impact_task"],
      ["t3", "high_impact_task"],
      ["t4", "high_impact_task"],
      ["t5", "evidence_required"],
      ["t6", "not_completable"],
    ]);
  });
});
