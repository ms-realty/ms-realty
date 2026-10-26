// O22/F25: record what a person reports, with an auditable correction path.
import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { taskEffortEntries, tasks } from "@/db/schema";
import type { Session } from "../auth/sessions";
import { assertCanRead } from "../authz";
import { hashRequest } from "../crypto";
import type { Executor } from "../db";
import { AppError } from "../errors";
import { findOperation, runOperation } from "../operations";
import {
  commandEnvelope,
  liveStaff,
  parseInput,
  recordChange,
  taskResource,
  version,
} from "./shared";

export const effortCategories = ["correction", "reentry"] as const;
export const effortReasons = ["facts", "language", "duplicate_entry", "routing", "other"] as const;
const envelope = { ...commandEnvelope, action: z.enum(["record", "void"]) };
export const effortSchema = z.discriminatedUnion("action", [
  z
    .object({
      ...envelope,
      action: z.literal("record"),
      category: z.enum(effortCategories),
      minutes: z.int().min(1).max(480),
      reason: z.enum(effortReasons),
    })
    .strict(),
  z
    .object({
      ...envelope,
      action: z.literal("void"),
      entryId: z.uuid(),
      reason: z.literal("entry_mistake"),
    })
    .strict(),
]);
export const effortScope = (actorId: string, id: string, action: "record" | "void") =>
  `task.effort:${actorId}:${id}:${action}`;
const operationType = (action: "record" | "void") => `work.task.effort.${action}`;

export async function effortTask(db: Executor, session: Session, id: string, lock = false) {
  const live = await liveStaff(db, session);
  if (!z.uuid().safeParse(id).success) throw new AppError("not_found");
  const q = db.select().from(tasks).where(eq(tasks.id, id));
  const [row] = await (lock ? q.for("update") : q);
  if (!row) throw new AppError("not_found");
  await assertCanRead(db, live.actor, "task.manage", taskResource(row));
  return { live, row };
}

export async function recordTaskEffort(
  db: Executor,
  session: Session,
  raw: z.input<typeof effortSchema>,
) {
  const input = parseInput(effortSchema, raw);
  const { live } = await effortTask(db, session, input.id);
  return runOperation(
    db,
    {
      actor: live.actor,
      type: operationType(input.action),
      idempotencyKey: input.operationId,
      requestHash: hashRequest(input),
      expectedVersion: input.expectedVersion,
      subject: { type: "task", id: input.id },
    },
    async (ctx) => {
      const { row } = await effortTask(ctx.tx, session, input.id, true);
      version(row, input.expectedVersion);
      if (input.action === "void") {
        const [original] = await ctx.tx
          .select()
          .from(taskEffortEntries)
          .where(and(eq(taskEffortEntries.id, input.entryId), eq(taskEffortEntries.taskId, row.id)))
          .for("update");
        if (!original || original.action !== "record") throw new AppError("not_found");
        const [already] = await ctx.tx
          .select({ id: taskEffortEntries.id })
          .from(taskEffortEntries)
          .where(eq(taskEffortEntries.voidsId, original.id));
        if (already) throw new AppError("version_conflict");
      }
      const [entry] = await ctx.tx
        .insert(taskEffortEntries)
        .values({
          taskId: row.id,
          actorId: live.account.id,
          operationId: ctx.operationId,
          action: input.action,
          category: input.action === "record" ? input.category : null,
          minutes: input.action === "record" ? input.minutes : null,
          reason: input.reason,
          voidsId: input.action === "void" ? input.entryId : null,
        })
        .returning();
      if (!entry) throw new AppError("outcome_unknown");
      await recordChange(ctx, "task", row.id, `task.effort.${input.action}`, "task.manage", {
        entryId: entry.id,
        category: entry.category,
        minutes: entry.minutes,
        reason: entry.reason,
        voidsId: entry.voidsId,
      });
      return {
        type: "task_effort",
        id: entry.id,
        taskId: row.id,
        action: entry.action,
        minutes: entry.minutes,
        recordedAt: entry.createdAt.toISOString(),
      };
    },
  );
}

export async function readTaskEffort(db: Executor, session: Session, id: string) {
  return db.transaction(
    async (tx) => {
      const { row } = await effortTask(tx, session, id);
      const rows = await tx
        .select()
        .from(taskEffortEntries)
        .where(eq(taskEffortEntries.taskId, id))
        .orderBy(asc(taskEffortEntries.createdAt), asc(taskEffortEntries.id))
        .limit(1001);
      if (rows.length > 1000) throw new AppError("validation_failed");
      const voided = new Set(rows.flatMap((r) => (r.voidsId ? [r.voidsId] : [])));
      return {
        task: row,
        entries: rows
          .filter((r) => r.action === "record")
          .map((r) => ({ ...r, voided: voided.has(r.id) })),
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

export async function readEffortOperation(
  db: Executor,
  session: Session,
  id: string,
  action: "record" | "void",
  key: string,
) {
  return db.transaction(async (tx) => {
    const { live } = await effortTask(tx, session, id);
    const type = operationType(action);
    const lockKey = JSON.stringify([live.actor.kind, live.actor.id, type, key]);
    const [lock] = await tx.execute<{ locked: boolean }>(
      sql`select pg_try_advisory_xact_lock(hashtextextended(${lockKey}, 0)) as locked`,
    );
    if (!lock?.locked) return { state: "pending" as const };
    const result = await findOperation(tx, live.actor, type, key);
    if (!result) return { state: "absent" as const };
    if (
      result.status === "succeeded" &&
      (result.outcome as { taskId?: string } | null)?.taskId !== id
    )
      throw new AppError("not_found");
    if (result.status !== "succeeded" && (result.resultType !== "task" || result.resultId !== id))
      throw new AppError("not_found");
    return { state: result.status, operationId: result.operationId };
  });
}
