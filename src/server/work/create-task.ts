import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { inquiries, tasks } from "@/db/schema";
import { taskTypes } from "@/domain/task";
import { requireAvailableStaff } from "../auth/availability";
import type { Session } from "../auth/sessions";
import { assertCan, assertCanRead } from "../authz";
import { bumpCase, caseFor } from "../cases/shared";
import { hashRequest } from "../crypto";
import type { Executor } from "../db";
import { AppError } from "../errors";
import { runOperation } from "../operations";
import { inquiryResource, liveStaff, parseInput, recordChange, version } from "./shared";

export const taskParentSchema = z
  .object({
    type: z.enum(["case", "inquiry"]),
    id: z.uuid(),
    expectedVersion: z.number().int().positive().safe(),
  })
  .strict();

export const createTaskSchema = z
  .object({
    operationId: z.string().min(16).max(200),
    parent: taskParentSchema.nullable(),
    title: z.string().trim().min(3).max(180),
    purpose: z.string().trim().min(3).max(6000),
    type: z.enum(taskTypes).default("general"),
  })
  .strict();
export type CreateTaskInput = z.input<typeof createTaskSchema>;

/** A person creates accountable internal work; creation never performs the named action. */
export async function createTask(db: Executor, session: Session, raw: CreateTaskInput) {
  const input = parseInput(createTaskSchema, raw);
  const authorize = async (tx: Executor, lock = false) => {
    const live = await liveStaff(tx, session);
    await requireAvailableStaff(tx, live.account.id, lock);
    const parent = input.parent;
    if (!parent) {
      await assertCan(tx, live.actor, "task.manage", { type: "task", audience: "internal" });
      return { live, caseId: null, inquiryId: null, parentRow: null };
    }
    if (parent.type === "case") {
      const { row } = await caseFor(tx, live, parent.id, "task.manage", lock);
      return { live, caseId: row.id, inquiryId: null, parentRow: row };
    }
    const query = tx.select().from(inquiries).where(eq(inquiries.id, parent.id));
    const [row] = await (lock ? query.for("update") : query);
    if (!row) throw new AppError("not_found");
    await assertCanRead(tx, live.actor, "inquiry.read", inquiryResource(row));
    if (row.caseId) await caseFor(tx, live, row.caseId);
    await assertCan(tx, live.actor, "task.manage", {
      type: "task",
      ...(row.caseId ? { caseId: row.caseId } : {}),
      audience: "internal",
    });
    return { live, caseId: row.caseId, inquiryId: row.id, parentRow: row };
  };
  // Authorization precedes even a successful receipt replay. Version checks belong only
  // inside the callback: the first successful call deliberately changes its parent version.
  const { live } = await authorize(db);
  return runOperation(
    db,
    {
      actor: live.actor,
      type: "work.task.create",
      idempotencyKey: input.operationId,
      requestHash: hashRequest(input),
      ...(input.parent ? { expectedVersion: input.parent.expectedVersion } : {}),
    },
    async (ctx) => {
      const current = await authorize(ctx.tx, true);
      if (input.parent && current.parentRow) {
        version(current.parentRow, input.parent.expectedVersion);
        if ("disposition" in current.parentRow && current.parentRow.disposition !== "active")
          throw new AppError("transition_denied");
      }
      const [task] = await ctx.tx
        .insert(tasks)
        .values({
          title: input.title,
          purpose: input.purpose,
          type: input.type,
          ownerId: current.live.account.id,
          caseId: current.caseId,
          inquiryId: current.inquiryId,
        })
        .returning();
      if (!task) throw new Error("Task insert failed");
      if (input.parent?.type === "case")
        await bumpCase(ctx.tx, input.parent.id, input.parent.expectedVersion);
      if (input.parent?.type === "inquiry") {
        const changed = await ctx.tx
          .update(inquiries)
          .set({ version: sql`${inquiries.version} + 1`, updatedAt: new Date() })
          .where(
            and(
              eq(inquiries.id, input.parent.id),
              eq(inquiries.version, input.parent.expectedVersion),
            ),
          )
          .returning({ id: inquiries.id });
        if (!changed.length) throw new AppError("version_conflict");
      }
      await recordChange(ctx, "task", task.id, "task.created", "task.manage", {
        ownerId: current.live.account.id,
        caseId: current.caseId,
        inquiryId: current.inquiryId,
      });
      return {
        type: "task" as const,
        id: task.id,
        version: task.version,
        state: task.state,
        ownerId: task.ownerId,
        ...(input.parent ? { parentVersion: input.parent.expectedVersion + 1 } : {}),
        recordedAt: task.createdAt.toISOString(),
      };
    },
  );
}
