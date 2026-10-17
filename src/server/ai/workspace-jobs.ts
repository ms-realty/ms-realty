import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import {
  generativeArtifacts,
  generativeCheckpoints,
  generativeRuns,
  generativeSessions,
} from "@/db/schema";
import { type PlannerInput, type WorkspaceState, workspaceProtocol } from "@/domain/generative";
import { countActivePasskeys, staffPasskeyMinimum } from "../auth/passkeys";
import type { Executor } from "../db";
import { AppError } from "../errors";
import type { JobPayloads } from "../jobs/queue";
import { assertRecoveryOpen } from "../recovery/quarantine";
import {
  type WorkspaceQueue,
  type WorkspaceRun,
  workspaceEvidenceContext,
  workspaceForActor,
} from "./workspace";
import { type WorkspaceConfig, workspaceConfig } from "./workspace-config";
import { minimizeWorkspaceText } from "./workspace-context";
import { executeWorkspaceTool, validatePlannerTurn } from "./workspace-planner";
import { generateWorkspaceTurn, workspaceInstructions } from "./workspace-provider";

export type WorkspaceJob = JobPayloads["ai.workspace.step"];
export interface WorkspaceJobDependencies {
  queue: WorkspaceQueue;
  config?: WorkspaceConfig;
  planTurn?: typeof generateWorkspaceTurn;
  executeTool?: typeof executeWorkspaceTool;
}
const safeCode = (error: unknown) =>
  error instanceof AppError
    ? "workspace_access_changed"
    : error instanceof Error && /^workspace_[a-z_]{1,70}$/.test(error.message)
      ? error.message
      : "workspace_step_failed";

/** All mutators lock the workspace before its run, including failure settlement. */
async function lockedRun(db: Executor, id: string) {
  const [seed] = await db.select().from(generativeRuns).where(eq(generativeRuns.id, id));
  if (!seed) return;
  await db
    .select({ id: generativeSessions.id })
    .from(generativeSessions)
    .where(eq(generativeSessions.id, seed.sessionId))
    .for("update");
  const [run] = await db
    .select()
    .from(generativeRuns)
    .where(eq(generativeRuns.id, id))
    .for("update");
  return run;
}

async function updateSessionState(
  db: Executor,
  run: WorkspaceRun,
  state: WorkspaceState,
  errorCode: string | null = null,
) {
  await db
    .update(generativeSessions)
    .set({
      state,
      errorCode,
      activeRunId: ["queued", "running"].includes(state) ? run.id : null,
      version: sql`${generativeSessions.version} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(generativeSessions.id, run.sessionId),
        eq(generativeSessions.activeRunId, run.id),
        eq(generativeSessions.generation, run.generation),
      ),
    );
}

/** One durable inference or one saved read-only tool. Duplicate queue deliveries do no work. */
export async function processWorkspaceStep(
  db: Executor,
  job: WorkspaceJob,
  deps: WorkspaceJobDependencies,
) {
  await assertRecoveryOpen(db);
  const config = deps.config ?? workspaceConfig();
  let claim:
    | { run: WorkspaceRun; claimId: string; input: PlannerInput; context: PlannerInput["context"] }
    | undefined;
  let charge: number | null = 0;
  let tokens = { input: 0, output: 0 };
  try {
    claim = await db.transaction(async (tx) => {
      const run = await lockedRun(tx, job.runId);
      if (run?.state !== "queued" || run.generation !== job.generation || run.steps !== job.step)
        return;
      const actor = { kind: "staff" as const, id: run.requestedById };
      if ((await countActivePasskeys(tx, actor.id)) < staffPasskeyMinimum)
        throw new AppError("forbidden");
      const { workspace, context } = await workspaceForActor(tx, actor, run.sessionId, true);
      if (workspace.activeRunId !== run.id || workspace.generation !== run.generation) return;
      const checkpoints = await tx
        .select()
        .from(generativeCheckpoints)
        .where(eq(generativeCheckpoints.runId, run.id))
        .orderBy(generativeCheckpoints.step);
      const last = checkpoints.at(-1);
      if (
        job.phase === "tool" &&
        (!last || last.step !== job.step || last.toolResult !== null || !last.turn.tool)
      )
        return;
      if (job.phase === "plan" && last && last.turn.next === "tool" && last.toolResult === null)
        return;
      let failure: WorkspaceState | null = null,
        code: string | null = null;
      if (!config.enabled || config.policyDigest !== run.policyDigest) {
        failure = "failed";
        code = "workspace_configuration_changed";
      } else if (context.digest !== run.contextDigest) {
        failure = "stale";
        code = "workspace_source_changed";
      } else if (
        run.createdAt.toISOString().slice(0, 10) !== new Date().toISOString().slice(0, 10)
      ) {
        failure = "budget_exhausted";
        code = "workspace_budget_period_changed";
      } else if (run.startedAt && Date.now() - run.startedAt.getTime() >= run.budget.maxElapsedMs) {
        failure = "budget_exhausted";
        code = "workspace_elapsed_budget";
      } else if (job.phase === "plan" && run.steps >= run.budget.maxSteps) {
        failure = "budget_exhausted";
        code = "workspace_step_budget";
      }
      const evidence = workspaceEvidenceContext(context, checkpoints, run.id);
      const input: PlannerInput = {
        protocol: workspaceProtocol,
        goal: minimizeWorkspaceText(workspace.goal),
        constraints: workspace.constraints.map(minimizeWorkspaceText),
        locale: workspace.locale as PlannerInput["locale"],
        conversation: workspace.conversation.map((x) => ({
          ...x,
          text: minimizeWorkspaceText(x.text),
        })),
        decisions: workspace.decisions,
        plan: workspace.plan,
        context: evidence,
        checkpoints: checkpoints.map((x) => ({
          step: x.step,
          turn: x.turn,
          toolResult: x.toolResult,
        })),
        remainingSteps: run.budget.maxSteps - run.steps,
      };
      if (job.phase === "plan") {
        const bytes = new TextEncoder().encode(JSON.stringify(input)).byteLength;
        const tokenBound =
          bytes + new TextEncoder().encode(workspaceInstructions).byteLength + 2048;
        const reserve = Math.ceil(
          tokenBound * config.generation.inputCostMicros +
            config.generation.maxOutputTokens * config.generation.outputCostMicros,
        );
        if (bytes > run.budget.maxInputBytes) {
          failure = "budget_exhausted";
          code = "workspace_input_oversize";
        } else if (
          run.inputTokens + run.outputTokens + tokenBound + config.generation.maxOutputTokens >
          run.budget.maxTotalTokens
        ) {
          failure = "budget_exhausted";
          code = "workspace_token_budget";
        } else if (run.observedCostMicros + reserve > run.reservedCostMicros) {
          failure = "budget_exhausted";
          code = "workspace_cost_budget";
        }
      }
      if (failure) {
        await tx
          .update(generativeRuns)
          .set({ state: failure, errorCode: code, actualCostMicros: run.observedCostMicros })
          .where(eq(generativeRuns.id, run.id));
        await updateSessionState(tx, run, failure, code);
        return;
      }
      const claimId = randomUUID();
      await tx
        .update(generativeRuns)
        .set({
          state: "running",
          claimId,
          claimedAt: new Date(),
          startedAt: run.startedAt ?? new Date(),
          version: run.version + 1,
        })
        .where(eq(generativeRuns.id, run.id));
      await updateSessionState(tx, run, "running");
      return { run, claimId, input, context: evidence };
    });
    if (!claim) return;
    const { run, claimId } = claim;
    if (job.phase === "plan") {
      // The reservation remains charged if the transport outcome or bill cannot be established.
      charge = null;
      const generated = await (deps.planTurn ?? generateWorkspaceTurn)(claim.input, config);
      const amount =
        config.generation.provider === "openrouter"
          ? generated.actualCostMicros
          : Math.ceil(
              generated.inputTokens * config.generation.inputCostMicros +
                generated.outputTokens * config.generation.outputCostMicros,
            );
      if (
        typeof amount !== "number" ||
        !Number.isSafeInteger(amount) ||
        amount < 0 ||
        amount > 2_000_000_000
      )
        throw new Error("workspace_provider_cost_unknown");
      charge = amount;
      tokens = { input: generated.inputTokens, output: generated.outputTokens };
      const tokenBound =
        new TextEncoder().encode(JSON.stringify(claim.input)).byteLength +
        new TextEncoder().encode(workspaceInstructions).byteLength +
        2048;
      if (
        !Number.isSafeInteger(tokens.input) ||
        tokens.input < 0 ||
        tokens.input > tokenBound ||
        !Number.isSafeInteger(tokens.output) ||
        tokens.output < 0 ||
        tokens.output > config.generation.maxOutputTokens
      )
        throw new Error("workspace_usage_limit");
      if (run.observedCostMicros + amount > run.reservedCostMicros)
        throw new Error("workspace_cost_budget");
      const turn = validatePlannerTurn(generated.output, claim.context);
      await db.transaction(async (tx) => {
        const latest = await lockedRun(tx, run.id);
        if (!latest || latest.claimId !== claimId) return;
        const { workspace, context } = await workspaceForActor(
          tx,
          { kind: "staff", id: run.requestedById },
          run.sessionId,
          true,
        );
        const total = latest.observedCostMicros + amount;
        if (
          workspace.activeRunId !== run.id ||
          workspace.generation !== run.generation ||
          latest.state === "cancelled"
        ) {
          await tx
            .update(generativeRuns)
            .set({
              state: "cancelled",
              observedCostMicros: total,
              actualCostMicros: total,
              inputTokens: latest.inputTokens + tokens.input,
              outputTokens: latest.outputTokens + tokens.output,
              claimId: null,
              claimedAt: null,
            })
            .where(eq(generativeRuns.id, run.id));
          return;
        }
        if (context.digest !== run.contextDigest) throw new Error("workspace_source_changed");
        if (
          latest.startedAt &&
          Date.now() - latest.startedAt.getTime() >= latest.budget.maxElapsedMs
        )
          throw new Error("workspace_elapsed_budget");
        if (
          latest.inputTokens + latest.outputTokens + tokens.input + tokens.output >
          latest.budget.maxTotalTokens
        )
          throw new Error("workspace_token_budget");
        const step = run.steps + 1;
        await tx.insert(generativeCheckpoints).values({
          runId: run.id,
          step,
          turn,
          costMicros: amount,
          toolResult: turn.tool ? null : { prepared: true, businessEffects: 0 },
        });
        const state =
          turn.next === "tool"
            ? "queued"
            : turn.next === "clarify"
              ? "waiting_input"
              : turn.next === "review"
                ? "review"
                : "completed";
        await tx
          .update(generativeRuns)
          .set({
            steps: step,
            state,
            observedCostMicros: total,
            actualCostMicros: state === "queued" ? null : total,
            inputTokens: latest.inputTokens + tokens.input,
            outputTokens: latest.outputTokens + tokens.output,
            claimId: null,
            claimedAt: null,
          })
          .where(eq(generativeRuns.id, run.id));
        await tx
          .update(generativeSessions)
          .set({
            state,
            activeRunId: state === "queued" ? run.id : null,
            plan: turn.plan,
            questions: turn.questions,
            decisions: turn.decisions,
            conversation: [...workspace.conversation, { role: "assistant", text: turn.message }],
            version: workspace.version + 1,
            updatedAt: new Date(),
          })
          .where(eq(generativeSessions.id, workspace.id));
        if (state === "queued") {
          const queued = await deps.queue.send(
            "ai.workspace.step",
            { runId: run.id, generation: run.generation, step, phase: "tool" },
            { db: tx, singletonKey: `${run.id}:${step}:tool` },
          );
          if (!queued) throw new Error("workspace_queue_unavailable");
        }
      });
      return;
    }
    const checkpoint = claim.input.checkpoints.at(-1);
    if (!checkpoint?.turn.tool) throw new Error("workspace_checkpoint_missing");
    const tool = checkpoint.turn.tool;
    let prepared: Awaited<ReturnType<typeof executeWorkspaceTool>> | undefined;
    for (let attempt = 0; attempt <= run.budget.readRetries; attempt++) {
      try {
        prepared = await (deps.executeTool ?? executeWorkspaceTool)(tool, claim.context);
        break;
      } catch (error) {
        const retryable =
          typeof error === "object" &&
          error !== null &&
          "retryable" in error &&
          error.retryable === true;
        if (!retryable || attempt === run.budget.readRetries) {
          prepared = { result: { ok: false, error: safeCode(error) } };
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 25 * 2 ** attempt));
      }
    }
    if (!prepared) throw new Error("workspace_tool_failed");
    const result = prepared;
    await db.transaction(async (tx) => {
      const latest = await lockedRun(tx, run.id);
      if (!latest || latest.claimId !== claimId) return;
      const { workspace, context } = await workspaceForActor(
        tx,
        { kind: "staff", id: run.requestedById },
        run.sessionId,
        true,
      );
      if (
        workspace.activeRunId !== run.id ||
        workspace.generation !== run.generation ||
        latest.state === "cancelled"
      ) {
        await tx
          .update(generativeRuns)
          .set({
            state: "cancelled",
            actualCostMicros: latest.observedCostMicros,
            claimId: null,
            claimedAt: null,
          })
          .where(eq(generativeRuns.id, run.id));
        return;
      }
      if (context.digest !== run.contextDigest) throw new Error("workspace_source_changed");
      if (latest.startedAt && Date.now() - latest.startedAt.getTime() >= latest.budget.maxElapsedMs)
        throw new Error("workspace_elapsed_budget");
      const [saved] = await tx
        .update(generativeCheckpoints)
        .set({ toolResult: result.result })
        .where(
          and(
            eq(generativeCheckpoints.runId, run.id),
            eq(generativeCheckpoints.step, job.step),
            isNull(generativeCheckpoints.toolResult),
          ),
        )
        .returning();
      if (!saved) return;
      if (result.artifact)
        await tx.insert(generativeArtifacts).values({
          sessionId: workspace.id,
          runId: run.id,
          proposal: result.artifact,
          contextPins: context.pins,
          contextDigest: context.digest,
        });
      await tx
        .update(generativeRuns)
        .set({ state: "queued", claimId: null, claimedAt: null })
        .where(eq(generativeRuns.id, run.id));
      await updateSessionState(tx, run, "queued");
      const queued = await deps.queue.send(
        "ai.workspace.step",
        { runId: run.id, generation: run.generation, step: run.steps, phase: "plan" },
        { db: tx, singletonKey: `${run.id}:${run.steps}:plan` },
      );
      if (!queued) throw new Error("workspace_queue_unavailable");
    });
  } catch (error) {
    const code = safeCode(error);
    await db.transaction(async (tx) => {
      const run = await lockedRun(tx, job.runId);
      if (!run || (claim ? run.claimId !== claim.claimId : run.state !== "queued")) return;
      const sum = charge === null ? null : run.observedCostMicros + charge;
      const total = sum !== null && Number.isSafeInteger(sum) && sum <= 2_000_000_000 ? sum : null;
      const state: WorkspaceState =
        run.state === "cancelled"
          ? "cancelled"
          : code === "workspace_source_changed" || code === "workspace_access_changed"
            ? "stale"
            : charge === null
              ? "unknown_provider"
              : code.includes("budget") || code === "workspace_input_oversize"
                ? "budget_exhausted"
                : "failed";
      await tx
        .update(generativeRuns)
        .set({
          state,
          errorCode: code,
          actualCostMicros: total,
          observedCostMicros: total ?? run.observedCostMicros,
          inputTokens:
            run.inputTokens +
            (Number.isSafeInteger(tokens.input) && tokens.input >= 0 && tokens.input <= 1_000_000
              ? tokens.input
              : 0),
          outputTokens:
            run.outputTokens +
            (Number.isSafeInteger(tokens.output) && tokens.output >= 0 && tokens.output <= 1_000_000
              ? tokens.output
              : 0),
          claimId: null,
          claimedAt: null,
        })
        .where(eq(generativeRuns.id, run.id));
      await updateSessionState(tx, run, state, code);
    });
  }
}
