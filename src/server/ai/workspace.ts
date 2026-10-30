import "server-only";
import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import {
  generativeArtifacts,
  generativeCheckpoints,
  generativeRuns,
  generativeSessions,
} from "@/db/schema";
import type { Actor } from "@/domain/capabilities";
import {
  type ArtifactProposal,
  artifactProposalSchema,
  contextSelectionSchema,
  validateArtifactSources,
  type WorkspaceCheckpoint,
  type WorkspaceContext,
} from "@/domain/generative";
import type { Session } from "../auth/sessions";
import { hashRequest } from "../crypto";
import type { Executor } from "../db";
import { AppError } from "../errors";
import type { JobQueue } from "../jobs/queue";
import { findOperation, type OperationView, runOperation } from "../operations";
import { commandEnvelope, liveStaff, parseInput, version } from "../work/shared";
import { billingMode } from "./billing";
import { reserveAiBudget } from "./budget";
import { type WorkspaceConfig, workspaceConfig } from "./workspace-config";
import {
  assertWorkspaceSourcePinsAuthorized,
  minimizeWorkspaceText,
  resolveWorkspaceContext,
} from "./workspace-context";
import {
  materializeWorkspaceProposal,
  type materializeWorkspaceProposalSchema,
} from "./workspace-materialize";
import { workspaceProposalPolicy } from "./workspace-policy";

export type Workspace = typeof generativeSessions.$inferSelect;
export type WorkspaceRun = typeof generativeRuns.$inferSelect;
export type WorkspaceQueue = Pick<JobQueue, "send">;
export const createWorkspaceSchema = z
  .object({
    ...commandEnvelope,
    goal: z.string().trim().min(3).max(4000),
    locale: z.enum(["bg", "en", "ru"]),
    selection: contextSelectionSchema,
    constraints: z.array(z.string().trim().min(1).max(500)).max(16),
  })
  .strict();
const messageSchema = z
  .object({
    ...commandEnvelope,
    expectedGeneration: z.number().int().nonnegative().safe().optional(),
    message: z.string().trim().min(1).max(6000),
    goal: z.string().trim().min(3).max(4000).optional(),
    constraints: z.array(z.string().trim().min(1).max(500)).max(16).optional(),
  })
  .strict();
const cancelSchema = z
  .object({
    ...commandEnvelope,
    expectedGeneration: z.number().int().nonnegative().safe().optional(),
  })
  .strict();
const runSchema = z
  .object({
    ...commandEnvelope,
    reviewed: z.literal(true),
    acknowledgeUnknown: z.boolean().default(false),
  })
  .strict();

/** Model progress changes the revision; only a person's new intent changes the generation. */
function assertWorkspaceEdit(
  row: Workspace,
  input: { expectedVersion: number; expectedGeneration?: number },
) {
  if (input.expectedGeneration === undefined) return version(row, input.expectedVersion);
  if (row.generation !== input.expectedGeneration)
    throw new AppError("version_conflict", { current: { version: row.version } });
}

const evidenceErrors = new Set([
  "workspace_missing_citation",
  "workspace_invalid_citation",
  "workspace_unsupported_number",
  "workspace_unsupported_contact",
  "workspace_unsupported_currency",
  "workspace_property_facts_require_structured_view",
  "workspace_unverified_listing",
]);

/** Person-entered needs are inputs; approved property narratives remain source-bound. */
function validateReviewedArtifact(
  proposal: ArtifactProposal,
  context: WorkspaceContext,
  humanRequirements: boolean,
) {
  try {
    validateArtifactSources(proposal, context, { humanRequirements });
  } catch (error) {
    if (error instanceof Error && evidenceErrors.has(error.message))
      throw new AppError("validation_failed", {
        fieldErrors: { body: ["workspace_evidence_invalid"] },
      });
    throw error;
  }
}

function withIntent(
  context: WorkspaceContext,
  row: Pick<Workspace, "id" | "goal" | "constraints" | "conversation">,
): WorkspaceContext {
  const text = minimizeWorkspaceText(
    [
      row.goal,
      ...row.constraints,
      ...row.conversation.filter((x) => x.role === "user").map((x) => x.text),
    ].join("\n"),
  );
  const digest = hashRequest(text),
    key = `intent:${row.id}`;
  const sources = [
    ...context.sources.filter((s) => s.key !== key),
    {
      key,
      type: "message" as const,
      id: row.id,
      revision: digest,
      digest,
      title: "Your goal and corrections",
      audience: "internal" as const,
      text: text.slice(0, 12000),
      facts: {},
    },
  ];
  const pins = sources.map(({ key, type, id, revision, digest }) => ({
    key,
    type,
    id,
    revision,
    digest,
  }));
  const truncated = context.truncated || text.length > 12000;
  return { sources, pins, truncated, digest: hashRequest({ pins, truncated }) };
}

/** Derived arithmetic remains explicitly separate from approved property facts. */
export function workspaceEvidenceContext(
  context: WorkspaceContext,
  checkpoints: WorkspaceCheckpoint[],
  runId?: string,
): WorkspaceContext {
  const sources = [...context.sources];
  for (const checkpoint of checkpoints) {
    const tool = checkpoint.turn.tool;
    if (tool?.name !== "calculate" || checkpoint.toolResult === null) continue;
    const [first, ...rest] = tool.values;
    if (first === undefined) continue;
    let value = first;
    for (const number of rest)
      value =
        tool.operation === "add"
          ? value + number
          : tool.operation === "subtract"
            ? value - number
            : tool.operation === "multiply"
              ? value * number
              : value / number;
    if (!Number.isFinite(value)) continue;
    const text = `Calculation (${tool.operation}): ${tool.values.join(", ")} = ${value}`;
    sources.push({
      key: `calculation:${runId ?? "saved"}:${checkpoint.step}`,
      type: "calculation",
      id: String(checkpoint.step),
      revision: "1",
      digest: hashRequest({ tool, value }),
      title: "Calculated result",
      audience: "internal",
      text,
      facts: { result: String(value) },
    });
  }
  return { ...context, sources };
}

/** Owner isolation is additional to current source authorization, never a substitute for it. */
export async function workspaceForActor(db: Executor, actor: Actor, id: string, lock = false) {
  if (actor.kind !== "staff") throw new AppError("not_found");
  const q = db
    .select()
    .from(generativeSessions)
    .where(and(eq(generativeSessions.id, id), eq(generativeSessions.ownerId, actor.id)));
  const [row] = await (lock ? q.for("update") : q);
  if (!row) throw new AppError("not_found");
  const [runManifests, artifactManifests] = await Promise.all([
    db
      .select({ pins: generativeRuns.contextPins, steps: generativeRuns.steps })
      .from(generativeRuns)
      .where(eq(generativeRuns.sessionId, row.id)),
    db
      .select({ pins: generativeArtifacts.contextPins })
      .from(generativeArtifacts)
      .where(eq(generativeArtifacts.sessionId, row.id)),
  ]);
  if (runManifests.some((run) => run.steps > 0 && run.pins.length === 0))
    throw new AppError("not_found");
  await assertWorkspaceSourcePinsAuthorized(db, actor, [
    ...row.contextPins,
    ...runManifests.flatMap((run) => run.pins),
    ...artifactManifests.flatMap((artifact) => artifact.pins),
  ]);
  const context = withIntent(
    await resolveWorkspaceContext(db, actor, row.selection, { lock }),
    row,
  );
  return { workspace: row, context };
}
const outcome = (row: Workspace) => ({
  id: row.id,
  version: row.version,
  state: row.state,
  recordedAt: row.updatedAt.toISOString(),
});

export async function createWorkspace(
  db: Executor,
  session: Session,
  raw: z.input<typeof createWorkspaceSchema>,
) {
  const input = parseInput(createWorkspaceSchema, raw),
    live = await liveStaff(db, session);
  await resolveWorkspaceContext(db, live.actor, input.selection);
  return runOperation(
    db,
    {
      actor: live.actor,
      type: "workspace.create",
      idempotencyKey: input.operationId,
      requestHash: hashRequest(input),
      subject: { type: "workspace", id: input.id },
    },
    async ({ tx }) => {
      await liveStaff(tx, session);
      const context = withIntent(
        await resolveWorkspaceContext(tx, live.actor, input.selection, { lock: true }),
        {
          id: input.id,
          goal: input.goal,
          constraints: input.constraints,
          conversation: [{ role: "user", text: input.goal }],
        },
      );
      const [row] = await tx
        .insert(generativeSessions)
        .values({
          id: input.id,
          ownerId: live.actor.id,
          goal: input.goal,
          locale: input.locale,
          selection: input.selection,
          constraints: input.constraints,
          conversation: [{ role: "user", text: input.goal }],
          contextPins: context.pins,
          contextDigest: context.digest,
        })
        .returning();
      if (!row) throw new Error("workspace_insert_failed");
      return outcome(row);
    },
  );
}

export async function readWorkspace(db: Executor, session: Session, id: string) {
  const live = await liveStaff(db, session),
    current = await workspaceForActor(db, live.actor, parseInput(z.uuid(), id));
  const [artifacts, runs] = await Promise.all([
    db
      .select()
      .from(generativeArtifacts)
      .where(eq(generativeArtifacts.sessionId, id))
      .orderBy(desc(generativeArtifacts.createdAt))
      .limit(80),
    db
      .select()
      .from(generativeRuns)
      .where(eq(generativeRuns.sessionId, id))
      .orderBy(desc(generativeRuns.createdAt))
      .limit(20),
  ]);
  const latest = runs[0];
  const checkpoints = latest
    ? await db
        .select()
        .from(generativeCheckpoints)
        .where(eq(generativeCheckpoints.runId, latest.id))
        .orderBy(generativeCheckpoints.step)
        .limit(24)
    : [];
  const config = workspaceConfig();
  const expired =
    latest?.state === "running" &&
    latest.claimedAt !== null &&
    Date.now() - latest.claimedAt.getTime() > latest.budget.timeoutMs + 5000;
  const savedTool =
    checkpoints.at(-1)?.turn.next === "tool" && checkpoints.at(-1)?.toolResult === null;
  return {
    ...current,
    context: workspaceEvidenceContext(current.context, checkpoints, latest?.id),
    artifacts: artifacts.map((artifact) => ({
      ...artifact,
      operationPolicy: workspaceProposalPolicy(
        artifact.proposal,
        current.workspace.selection,
        current.context,
      ),
    })),
    runs,
    checkpoints,
    sourceChanged: current.context.digest !== current.workspace.contextDigest,
    recovery: {
      canResume: Boolean(expired),
      requiresUnknownAck: Boolean(
        (expired && !savedTool) ||
          (latest?.inferenceOutcome === "unknown" && !["queued", "running"].includes(latest.state)),
      ),
    },
    availability: { enabled: config.enabled, budget: config.budget },
  };
}

export async function listWorkspaces(db: Executor, session: Session) {
  const live = await liveStaff(db, session);
  const rows = await db
    .select()
    .from(generativeSessions)
    .where(eq(generativeSessions.ownerId, live.actor.id))
    .orderBy(desc(generativeSessions.updatedAt))
    .limit(24);
  const visible: Workspace[] = [];
  for (const row of rows) {
    try {
      const current = await workspaceForActor(db, live.actor, row.id);
      visible.push(current.workspace);
    } catch (e) {
      if (!(e instanceof AppError)) throw e;
    }
  }
  return visible;
}

/** Read the original signed command's receipt; absence remains unconfirmed, never permission to resend. */
export async function readWorkspaceOperation(
  db: Executor,
  session: Session,
  id: string,
  operationKey: string,
  command?: "create" | "message" | "research" | "cancel" | "artifact.revise" | "materialize",
): Promise<OperationView | null> {
  const live = await liveStaff(db, session);
  parseInput(z.uuid(), id);
  parseInput(z.string().min(16).max(200), operationKey);
  const [existing] = await db
    .select({ ownerId: generativeSessions.ownerId })
    .from(generativeSessions)
    .where(eq(generativeSessions.id, id));
  if (existing) await workspaceForActor(db, live.actor, id);
  const commands = command
    ? [command]
    : ["create", "message", "research", "cancel", "artifact.revise", "materialize"];
  for (const mode of commands) {
    if (
      !["create", "message", "research", "cancel", "artifact.revise", "materialize"].includes(mode)
    )
      throw new AppError("validation_failed");
    if (!existing && mode !== "create") continue;
    const receipt = await findOperation(db, live.actor, `workspace.${mode}`, operationKey);
    if (receipt && receipt.resultType === "workspace" && receipt.resultId === id) return receipt;
  }
  return null;
}

async function stopActive(db: Executor, row: Workspace) {
  if (!row.activeRunId) return;
  const [run] = await db
    .select()
    .from(generativeRuns)
    .where(eq(generativeRuns.id, row.activeRunId))
    .for("update");
  if (!run || !["queued", "running"].includes(run.state)) return;
  await db
    .update(generativeRuns)
    .set({
      state: "cancelled",
      actualCostMicros: ["pending", "unknown"].includes(run.inferenceOutcome)
        ? null
        : run.observedCostMicros,
      inferenceOutcome: ["pending", "unknown"].includes(run.inferenceOutcome)
        ? "unknown"
        : "settled",
      updatedAt: new Date(),
    })
    .where(eq(generativeRuns.id, run.id));
}

/** A correction fences old workers before preserving the next turn and refreshed source pins. */
export async function appendWorkspaceMessage(
  db: Executor,
  session: Session,
  raw: z.input<typeof messageSchema>,
) {
  const input = parseInput(messageSchema, raw),
    live = await liveStaff(db, session);
  await workspaceForActor(db, live.actor, input.id);
  return runOperation(
    db,
    {
      actor: live.actor,
      type: "workspace.message",
      idempotencyKey: input.operationId,
      requestHash: hashRequest(input),
      expectedVersion: input.expectedVersion,
      subject: { type: "workspace", id: input.id },
    },
    async ({ tx }) => {
      await liveStaff(tx, session);
      const { workspace: row, context } = await workspaceForActor(tx, live.actor, input.id, true);
      assertWorkspaceEdit(row, input);
      if (row.conversation.length >= 80)
        throw new AppError("validation_failed", {
          fieldErrors: { message: ["workspace_conversation_limit"] },
        });
      await stopActive(tx, row);
      const nextConversation = [
        ...row.conversation,
        { role: "user" as const, text: input.message },
      ];
      const nextContext = withIntent(context, {
        ...row,
        goal: input.goal ?? row.goal,
        constraints: input.constraints ?? row.constraints,
        conversation: nextConversation,
      });
      const [saved] = await tx
        .update(generativeSessions)
        .set({
          goal: input.goal ?? row.goal,
          constraints: input.constraints ?? row.constraints,
          conversation: nextConversation,
          questions: [],
          state: "idle",
          activeRunId: null,
          errorCode: null,
          generation: row.generation + 1,
          contextDigest: nextContext.digest,
          contextPins: nextContext.pins,
          version: row.version + 1,
          updatedAt: new Date(),
        })
        .where(eq(generativeSessions.id, row.id))
        .returning();
      if (!saved) throw new Error("workspace_update_failed");
      return outcome(saved);
    },
  );
}

export async function cancelWorkspace(
  db: Executor,
  session: Session,
  raw: z.input<typeof cancelSchema>,
) {
  const input = parseInput(cancelSchema, raw),
    live = await liveStaff(db, session);
  await workspaceForActor(db, live.actor, input.id);
  return runOperation(
    db,
    {
      actor: live.actor,
      type: "workspace.cancel",
      idempotencyKey: input.operationId,
      requestHash: hashRequest(input),
      expectedVersion: input.expectedVersion,
      subject: { type: "workspace", id: input.id },
    },
    async ({ tx }) => {
      await liveStaff(tx, session);
      const { workspace: row } = await workspaceForActor(tx, live.actor, input.id, true);
      assertWorkspaceEdit(row, input);
      await stopActive(tx, row);
      const [saved] = await tx
        .update(generativeSessions)
        .set({
          state: "cancelled",
          activeRunId: null,
          generation: row.generation + 1,
          version: row.version + 1,
          updatedAt: new Date(),
        })
        .where(eq(generativeSessions.id, row.id))
        .returning();
      if (!saved) throw new Error("workspace_update_failed");
      return outcome(saved);
    },
  );
}

export async function requestWorkspaceRun(
  db: Executor,
  session: Session,
  raw: z.input<typeof runSchema>,
  deps: { queue: WorkspaceQueue; config?: WorkspaceConfig },
) {
  const input = parseInput(runSchema, raw),
    live = await liveStaff(db, session),
    config = deps.config ?? workspaceConfig();
  await workspaceForActor(db, live.actor, input.id);
  return runOperation(
    db,
    {
      actor: live.actor,
      type: "workspace.research",
      idempotencyKey: input.operationId,
      requestHash: hashRequest(input),
      expectedVersion: input.expectedVersion,
      subject: { type: "workspace", id: input.id },
    },
    async ({ tx }) => {
      await liveStaff(tx, session);
      const { workspace: row, context } = await workspaceForActor(tx, live.actor, input.id, true);
      version(row, input.expectedVersion);
      if (!config.enabled)
        throw new AppError("unavailable", { fieldErrors: { form: ["workspace_disabled"] } });
      const [previous] = await tx
        .select()
        .from(generativeRuns)
        .where(eq(generativeRuns.sessionId, row.id))
        .orderBy(desc(generativeRuns.createdAt))
        .limit(1)
        .for("update");
      if (
        previous &&
        previous.inferenceOutcome === "unknown" &&
        !["queued", "running"].includes(previous.state) &&
        !input.acknowledgeUnknown
      )
        throw new AppError("outcome_unknown");
      if (previous && (["queued", "running"].includes(previous.state) || previous.claimId)) {
        const expired =
          previous.claimedAt &&
          Date.now() - previous.claimedAt.getTime() > previous.budget.timeoutMs + 5000;
        if (previous.state === "running" && !expired) throw new AppError("rate_limited");
        const [checkpoint] = await tx
          .select()
          .from(generativeCheckpoints)
          .where(
            and(
              eq(generativeCheckpoints.runId, previous.id),
              eq(generativeCheckpoints.step, previous.steps),
            ),
          )
          .limit(1);
        const pendingTool = checkpoint?.turn.next === "tool" && checkpoint.toolResult === null;
        if (
          (previous.state === "queued" || pendingTool) &&
          previous.contextDigest === context.digest &&
          previous.policyDigest === config.policyDigest &&
          previous.generation === row.generation
        ) {
          const phase = pendingTool ? ("tool" as const) : ("plan" as const);
          await tx
            .update(generativeRuns)
            .set({
              state: "queued",
              inferenceOutcome: "not_started",
              claimId: null,
              claimedAt: null,
            })
            .where(eq(generativeRuns.id, previous.id));
          await deps.queue.send(
            "ai.workspace.step",
            { runId: previous.id, generation: previous.generation, step: previous.steps, phase },
            { db: tx, singletonKey: `${previous.id}:${previous.steps}:${phase}` },
          );
          const [saved] = await tx
            .update(generativeSessions)
            .set({
              state: "queued",
              activeRunId: previous.id,
              errorCode: null,
              version: row.version + 1,
              updatedAt: new Date(),
            })
            .where(eq(generativeSessions.id, row.id))
            .returning();
          if (!saved) throw new Error("workspace_update_failed");
          return { ...outcome(saved), runId: previous.id };
        }
        // A saved tool only reads or prepares a draft; abandoning it has known provider cost.
        // Source/policy drift requires a new reviewed run, not an unknown inference charge.
        const unknownInference =
          previous.inferenceOutcome === "unknown" || (previous.claimId !== null && !pendingTool);
        if (unknownInference && !input.acknowledgeUnknown) throw new AppError("outcome_unknown");
        await tx
          .update(generativeRuns)
          .set({
            state: unknownInference ? "unknown_provider" : "stale",
            claimId: null,
            claimedAt: null,
            actualCostMicros: unknownInference ? null : previous.observedCostMicros,
            inferenceOutcome: unknownInference ? "unknown" : "settled",
          })
          .where(eq(generativeRuns.id, previous.id));
      }
      await reserveAiBudget(
        tx,
        live.actor.id,
        config.budget.maxCostMicros,
        config.generation.dailyLimitMicros,
        billingMode(config.generation),
      );
      const generation = row.generation + 1;
      const [run] = await tx
        .insert(generativeRuns)
        .values({
          sessionId: row.id,
          requestedById: live.actor.id,
          generation,
          policyDigest: config.policyDigest,
          budget: config.budget,
          contextDigest: context.digest,
          reservedCostMicros: config.budget.maxCostMicros,
          observedCostMicros: billingMode(config.generation) === "chatgpt_subscription" ? null : 0,
          billingMode: billingMode(config.generation),
          contextPins: context.pins,
        })
        .returning();
      if (!run) throw new Error("workspace_run_insert_failed");
      const job = await deps.queue.send(
        "ai.workspace.step",
        { runId: run.id, generation, step: 0, phase: "plan" },
        { db: tx, singletonKey: `${run.id}:0:plan` },
      );
      if (!job) throw new AppError("unavailable");
      const [saved] = await tx
        .update(generativeSessions)
        .set({
          generation,
          activeRunId: run.id,
          contextDigest: context.digest,
          contextPins: context.pins,
          state: "queued",
          errorCode: null,
          version: row.version + 1,
          updatedAt: new Date(),
        })
        .where(eq(generativeSessions.id, row.id))
        .returning();
      if (!saved) throw new Error("workspace_update_failed");
      return { ...outcome(saved), runId: run.id };
    },
  );
}

export async function reviseWorkspaceArtifact(
  db: Executor,
  session: Session,
  input: {
    sessionId: string;
    id: string;
    expectedVersion: number;
    operationId: string;
    proposal: unknown;
  },
) {
  const proposal = parseInput(artifactProposalSchema, input.proposal),
    live = await liveStaff(db, session);
  await workspaceForActor(db, live.actor, input.sessionId);
  return runOperation(
    db,
    {
      actor: live.actor,
      type: "workspace.artifact.revise",
      idempotencyKey: input.operationId,
      requestHash: hashRequest({ ...input, proposal }),
      expectedVersion: input.expectedVersion,
      subject: { type: "workspace", id: input.sessionId },
    },
    async ({ tx }) => {
      await liveStaff(tx, session);
      const { workspace: row, context } = await workspaceForActor(
        tx,
        live.actor,
        input.sessionId,
        true,
      );
      const [artifact] = await tx
        .select()
        .from(generativeArtifacts)
        .where(and(eq(generativeArtifacts.id, input.id), eq(generativeArtifacts.sessionId, row.id)))
        .for("update");
      if (!artifact) throw new AppError("not_found");
      version(artifact, input.expectedVersion);
      if (artifact.state !== "draft") throw new AppError("transition_denied");
      const checkpoints = artifact.runId
        ? await tx
            .select()
            .from(generativeCheckpoints)
            .where(eq(generativeCheckpoints.runId, artifact.runId))
            .orderBy(generativeCheckpoints.step)
        : [];
      validateReviewedArtifact(
        proposal,
        workspaceEvidenceContext(context, checkpoints, artifact.runId ?? undefined),
        true,
      );
      const [saved] = await tx
        .insert(generativeArtifacts)
        .values({
          id: randomUUID(),
          sessionId: row.id,
          runId: artifact.runId,
          proposal,
          contextDigest: context.digest,
          contextPins: context.pins,
          replacesId: artifact.id,
        })
        .returning();
      await tx
        .update(generativeArtifacts)
        .set({ state: "superseded", version: artifact.version + 1, updatedAt: new Date() })
        .where(eq(generativeArtifacts.id, artifact.id));
      if (!saved) throw new Error("workspace_artifact_insert_failed");
      return {
        id: row.id,
        artifactId: saved.id,
        version: saved.version,
        state: saved.state,
        recordedAt: saved.createdAt.toISOString(),
      };
    },
  );
}

export async function materializeWorkspaceArtifact(
  db: Executor,
  session: Session,
  raw: {
    sessionId: string;
    id: string;
    operationId: string;
    expectedVersion: number;
    reviewed: true;
    command: Omit<z.input<typeof materializeWorkspaceProposalSchema>, "operationId" | "proposal">;
  },
) {
  const live = await liveStaff(db, session);
  await workspaceForActor(db, live.actor, raw.sessionId);
  if (raw.reviewed !== true) throw new AppError("validation_failed");
  return runOperation(
    db,
    {
      actor: live.actor,
      type: "workspace.materialize",
      idempotencyKey: raw.operationId,
      requestHash: hashRequest(raw),
      expectedVersion: raw.expectedVersion,
      subject: { type: "workspace", id: raw.sessionId },
    },
    async (ctx) => {
      const { workspace: row, context } = await workspaceForActor(
        ctx.tx,
        live.actor,
        raw.sessionId,
        true,
      );
      const [artifact] = await ctx.tx
        .select()
        .from(generativeArtifacts)
        .where(and(eq(generativeArtifacts.id, raw.id), eq(generativeArtifacts.sessionId, row.id)))
        .for("update");
      if (!artifact) throw new AppError("not_found");
      version(artifact, raw.expectedVersion);
      if (artifact.state !== "draft") throw new AppError("transition_denied");
      if (artifact.contextDigest !== context.digest) throw new AppError("version_conflict");
      const parent = raw.command.parent;
      if (
        parent &&
        (parent.type === "case"
          ? parent.id !== row.selection.caseId
          : parent.id !== row.selection.inquiryId)
      )
        throw new AppError("validation_failed");
      const proposal = parseInput(artifactProposalSchema, artifact.proposal);
      const checkpoints = artifact.runId
        ? await ctx.tx
            .select()
            .from(generativeCheckpoints)
            .where(eq(generativeCheckpoints.runId, artifact.runId))
            .orderBy(generativeCheckpoints.step)
        : [];
      validateReviewedArtifact(
        proposal,
        workspaceEvidenceContext(context, checkpoints, artifact.runId ?? undefined),
        artifact.replacesId !== null,
      );
      const result = await materializeWorkspaceProposal(ctx.tx, session, {
        ...raw.command,
        operationId: `${raw.operationId.slice(0, 170)}:domain`,
        proposal,
      });
      await ctx.tx
        .update(generativeArtifacts)
        .set({
          state: "materialized",
          materializedById: live.actor.id,
          receiptId: ctx.operationId,
          result: result.outcome,
          version: artifact.version + 1,
          updatedAt: new Date(),
        })
        .where(eq(generativeArtifacts.id, artifact.id));
      return {
        id: row.id,
        artifactId: artifact.id,
        receiptId: ctx.operationId,
        result: result.outcome,
        recordedAt: new Date().toISOString(),
      };
    },
  );
}
