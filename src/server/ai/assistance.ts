// O32 / AT51–AT54: source-bound draft evidence. No application, sending or publication effect.
import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { assistanceRuns, inquiries } from "@/db/schema";
import type { Actor } from "@/domain/capabilities";
import type { PublicLocale } from "@/domain/ids";
import { recordAudit } from "../audit";
import { countActivePasskeys, staffPasskeyMinimum } from "../auth/passkeys";
import type { Session } from "../auth/sessions";
import { assertCan, assertCanRead } from "../authz";
import { hashRequest } from "../crypto";
import type { Executor } from "../db";
import { AppError } from "../errors";
import type { JobQueue } from "../jobs/queue";
import { findOperation, runOperation } from "../operations";
import { assertRecoveryOpen } from "../recovery/quarantine";
import { commandEnvelope, inquiryResource, liveStaff, parseInput, version } from "../work/shared";
import { type AssistanceConfig, assistanceConfig } from "./config";
import {
  type AssistanceSource,
  type AssistanceTask,
  assistanceTasks,
  draftInstructions,
  draftJsonSchema,
  minimizeMessage,
  promptVersion,
  schemaVersion,
  validateDraft,
} from "./draft";
import {
  type IntakeSource,
  intakeDraftInstructions,
  intakeDraftJsonSchema,
  intakePromptVersion,
  intakeSchemaVersion,
  validateIntakeDraft,
} from "./intake-draft";
import { intakeSourceFor } from "./intake-source";
import { assessDraft, type DraftAssessor, jevDigest, prepareJevState } from "./jev";
import { type JevAssessment, jevAssessmentSchema } from "./jev-contract";
import {
  type LocaleSource,
  localeDraftInstructions,
  localeDraftJsonSchema,
  localePromptVersion,
  localeSchemaVersion,
  targetLocaleSchema,
  validateLocaleDraft,
} from "./locale-draft";
import { localeSourceFor } from "./locale-source";
import {
  type DraftGenerator,
  generateDraft,
  generateIntakeDraft,
  generateLocaleDraft,
  type IntakeDraftGenerator,
  type LocaleDraftGenerator,
} from "./provider";
import { routingDigest } from "./routing";

const requestSchema = z.discriminatedUnion("task", [
  z.object({
    ...commandEnvelope,
    task: z.literal("intake.extract"),
    listingId: z.uuid(),
    sourceReviewed: z.literal(true),
  }),
  z.object({
    ...commandEnvelope,
    task: z.enum(assistanceTasks),
    sourceReviewed: z.literal(true),
  }),
  z.object({
    ...commandEnvelope,
    task: z.literal("locale.draft"),
    targetLocale: targetLocaleSchema,
    sourceReviewed: z.literal(true),
  }),
]);
const reviewSchema = z.object({
  ...commandEnvelope,
  decision: z.enum(["accepted", "rejected"]),
  reviewed: z.literal(true),
});

async function sourceFor(db: Executor, actor: Actor, id: string, lock = false) {
  const query = db.select().from(inquiries).where(eq(inquiries.id, id));
  const [row] = await (lock ? query.for("share") : query);
  if (!row || actor.kind !== "staff") throw new AppError("not_found");
  await assertCanRead(db, actor, "inquiry.read", inquiryResource(row));
  await assertCan(db, actor, "ai.draft", inquiryResource(row));
  if ((await countActivePasskeys(db, actor.id)) < staffPasskeyMinimum)
    throw new AppError("forbidden");
  const source: AssistanceSource = {
    id: row.id,
    version: row.version,
    fields: {
      reference: row.reference,
      purpose: row.purpose,
      locale: row.preferredLocale ?? "bg",
      message: minimizeMessage(row.message ?? ""),
    },
  };
  return { source, digest: hashRequest(source) };
}

type SourcePin = Pick<
  typeof assistanceRuns.$inferSelect,
  "task" | "sourceId" | "sourceType" | "targetLocale"
> & { sourceSnapshot?: unknown };
async function sourceForRun(db: Executor, actor: Actor, run: SourcePin, lock = false) {
  if (
    run.task === "intake.extract" &&
    run.sourceType === "property_fact_revision" &&
    run.targetLocale === null
  ) {
    const snapshot = parseInput(z.object({ listingId: z.uuid() }), run.sourceSnapshot);
    return intakeSourceFor(db, actor, run.sourceId, snapshot.listingId, lock);
  }
  if (
    run.task === "locale.draft" &&
    run.sourceType === "listing_revision" &&
    run.targetLocale &&
    run.targetLocale !== "bg"
  )
    return localeSourceFor(db, actor, run.sourceId, run.targetLocale, lock);
  if (
    run.sourceType !== "inquiry" ||
    !assistanceTasks.some((task) => task === run.task) ||
    run.targetLocale !== null
  )
    throw new AppError("not_found");
  return sourceFor(db, actor, run.sourceId, lock);
}
const versionsFor = (task: string) =>
  task === "intake.extract"
    ? {
        promptVersion: intakePromptVersion,
        schemaVersion: intakeSchemaVersion,
        instructions: intakeDraftInstructions,
        jsonSchema: intakeDraftJsonSchema,
      }
    : task === "locale.draft"
      ? {
          promptVersion: localePromptVersion,
          schemaVersion: localeSchemaVersion,
          instructions: localeDraftInstructions,
          jsonSchema: localeDraftJsonSchema,
        }
      : {
          promptVersion,
          schemaVersion,
          instructions: draftInstructions,
          jsonSchema: draftJsonSchema,
        };

export async function readAssistanceSource(db: Executor, session: Session, id: string) {
  const live = await liveStaff(db, session);
  return (await sourceFor(db, live.actor, parseInput(z.uuid(), id))).source;
}

/** Even the stored source snapshot is readable only through its live source authorization. */
export async function readAssistanceRun(db: Executor, session: Session, id: string) {
  const live = await liveStaff(db, session);
  const [run] = await db
    .select()
    .from(assistanceRuns)
    .where(eq(assistanceRuns.id, parseInput(z.uuid(), id)));
  if (!run) throw new AppError("not_found");
  const current = await sourceForRun(db, live.actor, run);
  return {
    run,
    sourceCurrent:
      current.digest === run.sourceDigest && current.source.version === run.sourceVersion,
  };
}

export async function listAssistanceRuns(db: Executor, session: Session, sourceId: string) {
  await readAssistanceSource(db, session, sourceId);
  return db
    .select({
      id: assistanceRuns.id,
      state: assistanceRuns.state,
      task: assistanceRuns.task,
      createdAt: assistanceRuns.createdAt,
    })
    .from(assistanceRuns)
    .where(and(eq(assistanceRuns.sourceType, "inquiry"), eq(assistanceRuns.sourceId, sourceId)))
    .orderBy(sql`${assistanceRuns.createdAt} desc`)
    .limit(20);
}

export async function listLocaleAssistanceRuns(
  db: Executor,
  session: Session,
  sourceId: string,
  targetLocale: PublicLocale,
) {
  const live = await liveStaff(db, session);
  await localeSourceFor(db, live.actor, sourceId, targetLocale);
  return db
    .select({
      id: assistanceRuns.id,
      state: assistanceRuns.state,
      createdAt: assistanceRuns.createdAt,
    })
    .from(assistanceRuns)
    .where(
      and(
        eq(assistanceRuns.sourceType, "listing_revision"),
        eq(assistanceRuns.sourceId, sourceId),
        eq(assistanceRuns.targetLocale, targetLocale),
      ),
    )
    .orderBy(sql`${assistanceRuns.createdAt} desc`)
    .limit(20);
}

export async function listIntakeAssistanceRuns(
  db: Executor,
  session: Session,
  sourceId: string,
  listingId: string,
) {
  const live = await liveStaff(db, session);
  await intakeSourceFor(db, live.actor, sourceId, listingId);
  return db
    .select({
      id: assistanceRuns.id,
      state: assistanceRuns.state,
      createdAt: assistanceRuns.createdAt,
    })
    .from(assistanceRuns)
    .where(
      and(
        eq(assistanceRuns.sourceType, "property_fact_revision"),
        eq(assistanceRuns.sourceId, sourceId),
        sql`${assistanceRuns.sourceSnapshot}->>'listingId' = ${listingId}`,
      ),
    )
    .orderBy(sql`${assistanceRuns.createdAt} desc`)
    .limit(20);
}
export async function readIntakeAssistanceOperation(
  db: Executor,
  session: Session,
  sourceId: string,
  listingId: string,
  key: string,
) {
  const live = await liveStaff(db, session);
  await intakeSourceFor(db, live.actor, sourceId, listingId);
  const operation = await findOperation(db, live.actor, "ai.request", key);
  if (!operation) return null;
  const id =
    operation.status === "succeeded"
      ? (operation.outcome as { id?: string } | null)?.id
      : undefined;
  if (id) {
    const { run } = await readAssistanceRun(db, session, id);
    if (run.sourceId !== sourceId || (run.sourceSnapshot as IntakeSource).listingId !== listingId)
      throw new AppError("not_found");
  }
  return { status: operation.status, id };
}
export async function readLocaleAssistanceOperation(
  db: Executor,
  session: Session,
  sourceId: string,
  targetLocale: PublicLocale,
  key: string,
) {
  const live = await liveStaff(db, session);
  await localeSourceFor(db, live.actor, sourceId, targetLocale);
  const operation = await findOperation(db, live.actor, "ai.request", key);
  if (!operation) return null;
  const id =
    operation.status === "succeeded"
      ? (operation.outcome as { id?: string } | null)?.id
      : undefined;
  if (id) {
    const { run } = await readAssistanceRun(db, session, id);
    if (run.sourceId !== sourceId || run.targetLocale !== targetLocale)
      throw new AppError("not_found");
  }
  return { status: operation.status, id };
}

export async function readAssistanceOperation(
  db: Executor,
  session: Session,
  sourceId: string,
  key: string,
) {
  const live = await liveStaff(db, session);
  await sourceFor(db, live.actor, sourceId);
  const operation = await findOperation(db, live.actor, "ai.request", key);
  if (!operation) return null;
  const id =
    operation.status === "succeeded"
      ? (operation.outcome as { id?: string } | null)?.id
      : undefined;
  if (id) {
    const { run } = await readAssistanceRun(db, session, id);
    if (run.sourceId !== sourceId) throw new AppError("not_found");
  }
  return { status: operation.status, id };
}

function reservation(
  source: AssistanceSource | LocaleSource | IntakeSource,
  config: AssistanceConfig,
  task: string,
) {
  const prompt = versionsFor(task);
  // Bytes are a conservative token bound; include the schema and framing, not only user text.
  const inputTokens =
    Buffer.byteLength(
      JSON.stringify(source) + prompt.instructions + JSON.stringify(prompt.jsonSchema),
      "utf8",
    ) + 1024;
  const cost = Math.ceil(
    inputTokens * config.inputCostMicros +
      config.maxOutputTokens * config.outputCostMicros +
      (config.jev?.maxCostMicros ?? 0),
  );
  if (!Number.isSafeInteger(cost) || cost > 2_000_000_000) throw new AppError("unavailable");
  return { inputTokens, cost };
}

export async function requestAssistance(
  db: Executor,
  session: Session,
  raw: z.input<typeof requestSchema>,
  deps: { queue: Pick<JobQueue, "send">; config?: AssistanceConfig },
) {
  const input = parseInput(requestSchema, raw);
  const live = await liveStaff(db, session);
  const pin: SourcePin = {
    task: input.task,
    sourceId: input.id,
    sourceType:
      input.task === "locale.draft"
        ? "listing_revision"
        : input.task === "intake.extract"
          ? "property_fact_revision"
          : "inquiry",
    ...(input.task === "intake.extract" ? { sourceSnapshot: { listingId: input.listingId } } : {}),
    targetLocale: input.task === "locale.draft" ? input.targetLocale : null,
  };
  await sourceForRun(db, live.actor, pin);
  const config = deps.config ?? assistanceConfig();
  return runOperation(
    db,
    {
      actor: live.actor,
      type: "ai.request",
      idempotencyKey: input.operationId,
      requestHash: hashRequest(input),
      expectedVersion: input.expectedVersion,
    },
    async (ctx) => {
      await liveStaff(ctx.tx, session);
      const { source, digest } = await sourceForRun(ctx.tx, live.actor, pin, true);
      if (source.id !== input.id) throw new AppError("version_conflict");
      version(source, input.expectedVersion);
      if (!config.enabled || !config.model)
        throw new AppError("unavailable", { fieldErrors: { form: ["assistance_disabled"] } });
      // One global reservation lock enforces the provider-wide UTC daily ceiling under concurrency.
      await ctx.tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended('hermes:daily-budget', 0))`,
      );
      const busy = await ctx.tx
        .select({ id: assistanceRuns.id })
        .from(assistanceRuns)
        .where(
          and(
            eq(assistanceRuns.requestedById, live.actor.id),
            inArray(assistanceRuns.state, ["queued", "running"]),
          ),
        )
        .limit(1);
      if (busy.length)
        throw new AppError("rate_limited", { fieldErrors: { form: ["assistance_in_progress"] } });
      const [usage] = await ctx.tx.execute<{ used: string }>(
        sql`select coalesce(sum(coalesce(actual_cost_micros, reserved_cost_micros)), 0)::text as used from assistance_runs where created_at >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC'`,
      );
      const reserved = reservation(source, config, input.task);
      const prompt = versionsFor(input.task);
      if (Number(usage?.used ?? 0) + reserved.cost > config.dailyLimitMicros)
        throw new AppError("rate_limited", {
          fieldErrors: { form: ["assistance_budget_exhausted"] },
        });
      const [run] = await ctx.tx
        .insert(assistanceRuns)
        .values({
          requestedById: live.actor.id,
          task: input.task,
          sourceType: pin.sourceType,
          targetLocale: pin.targetLocale,
          sourceId: source.id,
          sourceVersion: source.version,
          sourceDigest: digest,
          sourceSnapshot: source,
          promptVersion: prompt.promptVersion,
          schemaVersion: prompt.schemaVersion,
          model: config.model,
          reservedCostMicros: reserved.cost,
          validation: {
            inputTokenBound: reserved.inputTokens,
            inputCostMicros: config.inputCostMicros,
            outputCostMicros: config.outputCostMicros,
            maxOutputTokens: config.maxOutputTokens,
            provider: config.provider ?? "openai",
            routingDigest: routingDigest(config.routing),
            jevDigest: jevDigest(config.jev),
            jevReservedCostMicros: config.jev?.maxCostMicros ?? 0,
          },
        })
        .returning();
      if (!run) throw new Error("Assistance insert failed");
      const jobId = await deps.queue.send(
        "ai.draft",
        { runId: run.id },
        { db: ctx.tx, singletonKey: run.id },
      );
      if (!jobId) throw new AppError("unavailable");
      await ctx.tx.update(assistanceRuns).set({ jobId }).where(eq(assistanceRuns.id, run.id));
      await recordAudit(ctx.tx, {
        action: "ai.requested",
        actor: live.actor,
        capability: "ai.draft",
        recordType: "assistance",
        recordId: run.id,
        operationId: ctx.operationId,
        payload: {
          sourceId: source.id,
          sourceVersion: source.version,
          sourceDigest: digest,
          task: input.task,
        },
      });
      return { id: run.id, state: run.state, recordedAt: run.createdAt.toISOString() };
    },
  );
}

/** Queue entry point. One attempt; unknown provider cost keeps its reservation. */
export async function processAssistanceRun(
  db: Executor,
  runId: string,
  deps: {
    config?: AssistanceConfig;
    generate?: DraftGenerator;
    generateLocale?: LocaleDraftGenerator;
    generateIntake?: IntakeDraftGenerator;
    assess?: DraftAssessor;
  } = {},
): Promise<void> {
  await assertRecoveryOpen(db);
  const [run] = await db
    .update(assistanceRuns)
    .set({ state: "running", updatedAt: new Date(), version: sql`${assistanceRuns.version} + 1` })
    .where(
      and(eq(assistanceRuns.id, parseInput(z.uuid(), runId)), eq(assistanceRuns.state, "queued")),
    )
    .returning();
  if (!run) return;
  const config = deps.config ?? assistanceConfig();
  const actor: Actor = { kind: "staff", id: run.requestedById };
  let started = false;
  let actualCostMicros: number | null = null;
  let generationCostMicros: number | null = null;
  let assessment: JevAssessment | null = null;
  let inputTokens = 0;
  let outputTokens = 0;
  let state = "failed";
  const prompt = versionsFor(run.task);
  try {
    if (
      !config.enabled ||
      config.model !== run.model ||
      run.promptVersion !== prompt.promptVersion ||
      run.schemaVersion !== prompt.schemaVersion
    )
      throw new Error("configuration_changed");
    if (run.createdAt.toISOString().slice(0, 10) !== new Date().toISOString().slice(0, 10))
      throw new Error("budget_period_changed");
    const pinned = run.validation as {
      inputTokenBound: number;
      inputCostMicros: number;
      outputCostMicros: number;
      maxOutputTokens: number;
      provider?: string;
      routingDigest?: string | null;
      jevDigest?: string | null;
    };
    if (
      pinned.inputCostMicros !== config.inputCostMicros ||
      pinned.outputCostMicros !== config.outputCostMicros ||
      pinned.maxOutputTokens !== config.maxOutputTokens ||
      (pinned.provider ?? "openai") !== (config.provider ?? "openai") ||
      (pinned.routingDigest ?? null) !== routingDigest(config.routing) ||
      (pinned.jevDigest ?? null) !== jevDigest(config.jev)
    )
      throw new Error("configuration_changed");
    const current = await sourceForRun(db, actor, run);
    if (current.digest !== run.sourceDigest || current.source.version !== run.sourceVersion) {
      state = "stale";
      throw new Error("source_changed");
    }
    started = true;
    const generated =
      run.task === "intake.extract"
        ? await (deps.generateIntake ?? generateIntakeDraft)(current.source as IntakeSource, config)
        : run.task === "locale.draft"
          ? await (deps.generateLocale ?? generateLocaleDraft)(
              current.source as LocaleSource,
              config,
            )
          : await (deps.generate ?? generateDraft)(
              run.task as AssistanceTask,
              current.source as AssistanceSource,
              config,
            );
    inputTokens = generated.inputTokens;
    outputTokens = generated.outputTokens;
    const cost =
      config.provider === "openrouter"
        ? generated.actualCostMicros
        : Math.ceil(inputTokens * config.inputCostMicros + outputTokens * config.outputCostMicros);
    if (typeof cost !== "number" || !Number.isSafeInteger(cost) || cost < 0 || cost > 2_000_000_000)
      throw new Error("provider_cost_unknown");
    actualCostMicros = cost;
    generationCostMicros = cost;
    if (cost > run.reservedCostMicros - (config.jev?.maxCostMicros ?? 0))
      throw new Error("cost_limit_exceeded");
    if (
      !Number.isSafeInteger(inputTokens) ||
      inputTokens < 0 ||
      !Number.isSafeInteger(outputTokens) ||
      outputTokens < 0 ||
      inputTokens > pinned.inputTokenBound ||
      outputTokens > config.maxOutputTokens
    )
      throw new Error("usage_limit_exceeded");
    const output =
      run.task === "intake.extract"
        ? validateIntakeDraft(generated.output, current.source as IntakeSource)
        : run.task === "locale.draft"
          ? validateLocaleDraft(generated.output, current.source as LocaleSource)
          : validateDraft(generated.output, current.source as AssistanceSource);
    if (config.jev) {
      const latest = await sourceForRun(db, actor, run);
      if (latest.digest !== run.sourceDigest || latest.source.version !== run.sourceVersion) {
        state = "stale";
        throw new Error("source_changed");
      }
      const assessmentInput = prepareJevState({
        task: run.task,
        source: latest.source,
        draft: output,
      });
      // A second call with unknown outcome must not release its reserved cost merely because
      // the first call returned a known bill. No automatic retry of either provider call.
      actualCostMicros = null;
      assessment = jevAssessmentSchema.parse(
        await (deps.assess ?? assessDraft)(assessmentInput, config),
      );
      actualCostMicros = cost + assessment.costMicros;
      if (actualCostMicros > 2_000_000_000) {
        actualCostMicros = null;
        throw new Error("provider_cost_unknown");
      }
      if (
        assessment.policyDigest !== jevDigest(config.jev) ||
        !config.jev.snapshots.includes(assessment.model)
      )
        throw new Error("configuration_changed");
      if (assessment.costMicros > config.jev.maxCostMicros) throw new Error("cost_limit_exceeded");
    }
    await db.transaction(async (tx) => {
      const latest = await sourceForRun(tx, actor, run, true);
      if (latest.digest !== run.sourceDigest || latest.source.version !== run.sourceVersion) {
        state = "stale";
        throw new Error("source_changed");
      }
      await tx
        .update(assistanceRuns)
        .set({
          state: "draft",
          output,
          inputTokens,
          outputTokens,
          actualCostMicros,
          generatedAt: new Date(),
          updatedAt: new Date(),
          version: sql`${assistanceRuns.version} + 1`,
          validation: {
            ...pinned,
            sourcePointers: "checked",
            protectedNumbers: "checked",
            factualApproval: "human_required",
            routing: generated.routing ?? null,
            assessment,
            generationCostMicros,
          },
        })
        .where(and(eq(assistanceRuns.id, run.id), eq(assistanceRuns.state, "running")));
    });
  } catch (error) {
    const code =
      error instanceof AppError
        ? "source_access_changed"
        : error instanceof Error && /^[a-z_0-9]+$/.test(error.message)
          ? error.message
          : "generation_failed";
    await db
      .update(assistanceRuns)
      .set({
        state,
        errorCode: code,
        actualCostMicros: started ? actualCostMicros : 0,
        validation: {
          ...(run.validation as Record<string, unknown>),
          assessment,
          generationCostMicros,
        },
        inputTokens:
          Number.isSafeInteger(inputTokens) && inputTokens >= 0 && inputTokens <= 1_000_000
            ? inputTokens
            : 0,
        outputTokens:
          Number.isSafeInteger(outputTokens) && outputTokens >= 0 && outputTokens <= 1_000_000
            ? outputTokens
            : 0,
        updatedAt: new Date(),
        version: sql`${assistanceRuns.version} + 1`,
      })
      .where(and(eq(assistanceRuns.id, run.id), eq(assistanceRuns.state, "running")));
    throw new Error(code);
  }
}

/** Acceptance records only a human review. It never creates a message, task or publication. */
export async function reviewAssistance(
  db: Executor,
  session: Session,
  raw: z.input<typeof reviewSchema>,
) {
  const input = parseInput(reviewSchema, raw);
  const live = await liveStaff(db, session);
  await readAssistanceRun(db, session, input.id);
  return runOperation(
    db,
    {
      actor: live.actor,
      type: "ai.review",
      idempotencyKey: input.operationId,
      requestHash: hashRequest(input),
      expectedVersion: input.expectedVersion,
    },
    async (ctx) => {
      await liveStaff(ctx.tx, session);
      const [run] = await ctx.tx
        .select()
        .from(assistanceRuns)
        .where(eq(assistanceRuns.id, input.id))
        .for("update");
      if (!run) throw new AppError("not_found");
      const current = await sourceForRun(ctx.tx, live.actor, run, true);
      version(run, input.expectedVersion);
      if (current.digest !== run.sourceDigest || current.source.version !== run.sourceVersion)
        throw new AppError("approval_stale");
      if (run.state !== "draft") throw new AppError("transition_denied");
      const reviewedAt = new Date();
      await ctx.tx
        .update(assistanceRuns)
        .set({
          state: input.decision,
          reviewedById: live.actor.id,
          reviewedAt,
          updatedAt: reviewedAt,
          version: sql`${assistanceRuns.version} + 1`,
        })
        .where(eq(assistanceRuns.id, run.id));
      await recordAudit(ctx.tx, {
        action: `ai.${input.decision}`,
        actor: live.actor,
        capability: "ai.draft",
        recordType: "assistance",
        recordId: run.id,
        operationId: ctx.operationId,
        payload: { sourceDigest: run.sourceDigest, sourceVersion: run.sourceVersion },
      });
      return { id: run.id, state: input.decision, recordedAt: reviewedAt.toISOString() };
    },
  );
}
