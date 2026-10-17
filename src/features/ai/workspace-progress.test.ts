import { describe, expect, it } from "vitest";
import { projectWorkspaceProgress, workspaceProgressSchema } from "./workspace-progress";
import type { WorkspaceView } from "./workspace-types";

function view(actualCostMicros: number | null = null): WorkspaceView {
  return {
    workspace: {
      state: "running",
      goal: "Private working goal",
      conversation: [{ text: "Private correction" }],
      errorCode: "provider-private-detail",
    },
    runs: [
      {
        state: "running",
        steps: 2,
        budget: { maxSteps: 8, maxCostMicros: 25000, maxTotalTokens: 10000 },
        reservedCostMicros: 25000,
        actualCostMicros,
        claimId: "private-worker-claim",
      },
    ],
    availability: { enabled: true, budget: { maxSteps: 6, maxCostMicros: 15000 } },
    recovery: { canResume: true, requiresUnknownAck: true },
    sourceChanged: true,
    context: { sources: [{ text: "Private approved source" }] },
    checkpoints: [{ turn: { message: "Private checkpoint", tool: { query: "Private query" } } }],
    artifacts: [{ proposal: { body: "Private draft" } }],
  } as unknown as WorkspaceView;
}

describe("F29 isolated progress projection", () => {
  it.each([null, 0, 1500])("preserves the recorded cost %s and server recovery flags", (cost) => {
    const progress = projectWorkspaceProgress(view(cost));
    expect(progress).toEqual({
      state: "running",
      steps: 2,
      maxSteps: 8,
      reservedCostMicros: 25000,
      actualCostMicros: cost,
      hasRun: true,
      recovery: { canResume: true, requiresUnknownAck: true },
      sourceChanged: true,
    });
    expect(workspaceProgressSchema.safeParse(progress).success).toBe(true);
    expect(JSON.stringify(progress)).not.toMatch(/Private|private|provider/);
  });

  it("keeps an unstarted workspace distinct from a run with unknown cost", () => {
    const current = view();
    current.runs = [];
    expect(projectWorkspaceProgress(current)).toMatchObject({
      steps: 0,
      maxSteps: 6,
      reservedCostMicros: 15000,
      actualCostMicros: null,
      hasRun: false,
    });
  });

  it("rejects malformed or expanded progress responses", () => {
    const progress = projectWorkspaceProgress(view());
    for (const response of [
      { ...progress, state: "invented-state" },
      { ...progress, actualCostMicros: -1 },
      { ...progress, recovery: { canResume: "yes", requiresUnknownAck: false } },
      { ...progress, checkpoints: ["private text"] },
    ]) {
      expect(workspaceProgressSchema.safeParse(response).success).toBe(false);
    }
  });
});
