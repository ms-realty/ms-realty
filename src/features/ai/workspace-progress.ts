import { z } from "zod";
import { workspaceStates } from "@/domain/generative";
import type { WorkspaceView } from "./workspace-types";

/** A progress read carries no source, conversation, checkpoint, tool or draft contents. */
const progressFields = {
  state: z.enum(workspaceStates),
  steps: z.int().nonnegative(),
  maxSteps: z.int().nonnegative(),
  hasRun: z.boolean(),
  recovery: z.object({ canResume: z.boolean(), requiresUnknownAck: z.boolean() }).strict(),
  sourceChanged: z.boolean(),
};
export const workspaceProgressSchema = z.discriminatedUnion("billingMode", [
  z
    .object({
      ...progressFields,
      billingMode: z.literal("metered_usd"),
      reservedCostMicros: z.int().nonnegative(),
      actualCostMicros: z.int().nonnegative().nullable(),
    })
    .strict(),
  z
    .object({
      ...progressFields,
      billingMode: z.literal("chatgpt_subscription"),
      reservedCostMicros: z.null(),
      actualCostMicros: z.null(),
    })
    .strict(),
]);

export type WorkspaceProgressView = z.infer<typeof workspaceProgressSchema>;

export function projectWorkspaceProgress(view: WorkspaceView): WorkspaceProgressView {
  const run = view.runs[0];
  return workspaceProgressSchema.parse({
    state: view.workspace.state,
    steps: run?.steps ?? 0,
    maxSteps: run?.budget.maxSteps ?? view.availability.budget.maxSteps,
    billingMode: run ? run.billingMode : (view.availability.budget.billingMode ?? "metered_usd"),
    reservedCostMicros: run ? run.reservedCostMicros : view.availability.budget.maxCostMicros,
    actualCostMicros: run?.actualCostMicros ?? null,
    hasRun: Boolean(run),
    recovery: {
      canResume: view.recovery?.canResume ?? false,
      requiresUnknownAck: view.recovery?.requiresUnknownAck ?? false,
    },
    sourceChanged: Boolean(view.sourceChanged),
  });
}
