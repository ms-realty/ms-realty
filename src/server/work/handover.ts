import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { passkeys, principals, staffMemberships, tasks } from "@/db/schema";
import { availableStaff } from "../auth/availability";
import { countActivePasskeys, staffPasskeyMinimum } from "../auth/passkeys";
import { requireFreshAuth, type Session } from "../auth/sessions";
import { assertCanRead, can, staffWhoCan } from "../authz";
import { hashRequest } from "../crypto";
import type { Executor } from "../db";
import { AppError } from "../errors";
import { runOperation } from "../operations";
import { readTask } from "./queries";
import {
  commandEnvelope,
  liveStaff,
  openTaskStates,
  parseInput,
  recordChange,
  type Task,
  taskResource,
  version,
} from "./shared";

async function receiverEligible(db: Executor, id: string, task: Task, lock = false) {
  const query = db
    .select({ id: principals.id, absenceFrom: staffMemberships.absenceFrom })
    .from(principals)
    .innerJoin(staffMemberships, eq(staffMemberships.principalId, principals.id))
    .where(
      and(
        eq(principals.id, id),
        eq(principals.kind, "staff"),
        eq(principals.status, "active"),
        eq(staffMemberships.state, "active"),
      ),
    );
  const [row] = await (lock ? query.for("share") : query);
  return Boolean(
    row &&
      (!row.absenceFrom || row.absenceFrom.getTime() > Date.now()) &&
      (await countActivePasskeys(db, id)) >= staffPasskeyMinimum &&
      (await can(db, { kind: "staff", id }, "task.manage", taskResource(task))),
  );
}

export async function readTaskHandover(db: Executor, session: Session, id: string) {
  const view = await readTask(db, session, id);
  if (!(openTaskStates as readonly string[]).includes(view.task.state))
    return { ...view, receivers: [], pendingName: null };
  const people = await db
    .select({ id: principals.id, name: principals.displayName })
    .from(principals)
    .innerJoin(staffMemberships, eq(staffMemberships.principalId, principals.id))
    .where(
      and(
        eq(principals.kind, "staff"),
        eq(principals.status, "active"),
        eq(staffMemberships.state, "active"),
        availableStaff(),
        sql`(select count(*) from ${passkeys}
          where ${passkeys.principalId} = ${principals.id}
            and ${passkeys.revokedAt} is null) >= ${staffPasskeyMinimum}`,
      ),
    )
    .orderBy(asc(principals.displayName), asc(principals.id));
  const candidates = people.filter((person) => person.id !== view.task.ownerId);
  const eligible = await staffWhoCan(
    db,
    candidates.map((person) => person.id),
    ["task.manage"],
    taskResource(view.task),
  );
  const receivers = candidates.filter((person) => eligible.has(person.id));
  const [pending] = view.task.pendingOwnerId
    ? await db
        .select({ name: principals.displayName })
        .from(principals)
        .where(eq(principals.id, view.task.pendingOwnerId))
    : [];
  return { ...view, receivers, pendingName: pending?.name ?? null };
}

const schema = z.object({
  ...commandEnvelope,
  action: z.enum(["request", "accept", "cancel"]),
  receiverId: z.uuid(),
  reason: z.string().trim().min(10).max(2000),
  reviewed: z.literal(true),
});

/** A request changes only the pending receiver. Ownership changes on that receiver's acceptance. */
export async function handoverTask(db: Executor, session: Session, raw: unknown) {
  const input = parseInput(schema, raw);
  const live = await liveStaff(db, session);
  requireFreshAuth(live);
  await readTask(db, live, input.id);
  return runOperation(
    db,
    {
      actor: live.actor,
      type: "work.task.handover",
      idempotencyKey: input.operationId,
      requestHash: hashRequest(input),
      expectedVersion: input.expectedVersion,
    },
    async (ctx) => {
      const actor = await liveStaff(ctx.tx, session);
      requireFreshAuth(actor);
      const [task] = await ctx.tx.select().from(tasks).where(eq(tasks.id, input.id)).for("update");
      if (!task) throw new AppError("not_found");
      await assertCanRead(ctx.tx, actor.actor, "task.manage", taskResource(task));
      version(task, input.expectedVersion);
      if (!(openTaskStates as readonly string[]).includes(task.state))
        throw new AppError("transition_denied");
      if (input.action === "request") {
        if (task.pendingOwnerId || input.receiverId === task.ownerId)
          throw new AppError("transition_denied");
        if (!(await receiverEligible(ctx.tx, input.receiverId, task, true)))
          throw new AppError("forbidden");
      } else {
        if (task.pendingOwnerId !== input.receiverId) throw new AppError("version_conflict");
        if (
          input.action === "accept" &&
          (actor.actor.id !== input.receiverId ||
            !(await receiverEligible(ctx.tx, input.receiverId, task, true)))
        )
          throw new AppError("forbidden");
      }
      await ctx.tx
        .update(tasks)
        .set({
          ...(input.action === "accept" ? { ownerId: input.receiverId } : {}),
          pendingOwnerId: input.action === "request" ? input.receiverId : null,
          version: sql`${tasks.version} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(tasks.id, task.id));
      await recordChange(ctx, "task", task.id, `task.handover.${input.action}`, "task.manage", {
        fromOwnerId: task.ownerId,
        receiverId: input.receiverId,
        reason: input.reason,
      });
      return { id: task.id, version: task.version + 1, recordedAt: new Date().toISOString() };
    },
  );
}
