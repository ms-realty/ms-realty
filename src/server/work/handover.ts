import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { activityEvents, passkeys, principals, staffMemberships, tasks } from "@/db/schema";
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

const handoverMessages = [
  "work.task.handover.request",
  "work.task.handover.accept",
  "work.task.handover.decline",
  "work.task.handover.cancel",
] as const;

async function latestHandoverEvent(db: Executor, id: string) {
  const [event] = await db
    .select({
      messageKey: activityEvents.messageKey,
      params: activityEvents.params,
      actorId: activityEvents.actorId,
      actorName: principals.displayName,
      at: activityEvents.occurredAt,
    })
    .from(activityEvents)
    .leftJoin(
      principals,
      and(
        sql`${principals.id}::text = ${activityEvents.actorId}`,
        eq(activityEvents.actorKind, "staff"),
      ),
    )
    .where(
      and(
        eq(activityEvents.recordType, "task"),
        eq(activityEvents.recordId, id),
        inArray(activityEvents.messageKey, [...handoverMessages]),
      ),
    )
    .orderBy(
      desc(
        sql`case when (${activityEvents.params}->>'taskVersion') ~ '^[0-9]{1,10}$'
          then (${activityEvents.params}->>'taskVersion')::bigint end`,
      ),
      desc(activityEvents.occurredAt),
      desc(activityEvents.id),
    )
    .limit(1);
  return event ?? null;
}

export async function readTaskHandover(db: Executor, session: Session, id: string) {
  const view = await readTask(db, session, id);
  const event = await latestHandoverEvent(db, id);
  const kind =
    event?.messageKey === "work.task.handover.decline"
      ? "declined"
      : event?.messageKey === "work.task.handover.cancel"
        ? "cancelled"
        : null;
  const params = event?.params as Record<string, unknown> | undefined;
  const latestDecision = kind
    ? {
        kind,
        actorId: event?.actorId ?? null,
        receiverId:
          typeof params?.receiverId === "string" && z.uuid().safeParse(params.receiverId).success
            ? params.receiverId
            : null,
        actorName: event?.actorName ?? null,
        reason: typeof params?.reason === "string" ? params.reason : "",
        at: event?.at.toISOString() ?? "",
      }
    : null;
  if (!(openTaskStates as readonly string[]).includes(view.task.state))
    return { ...view, receivers: [], pendingName: null, latestDecision };
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
  return { ...view, receivers, pendingName: pending?.name ?? null, latestDecision };
}

const base = {
  ...commandEnvelope,
  receiverId: z.uuid(),
};
const reason = z.string().trim().min(10).max(2000);
const schema = z.discriminatedUnion("action", [
  z.object({ ...base, action: z.literal("request"), reason, reviewed: z.literal(true) }),
  z.object({
    ...base,
    action: z.literal("accept"),
    nextAction: z.string().trim().min(3).max(500),
    dueAt: z.iso.datetime({ offset: true }),
    reason: reason.optional(),
  }),
  z.object({ ...base, action: z.literal("decline"), reason }),
  z.object({ ...base, action: z.literal("cancel"), reason }),
]);

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
        if (input.action === "accept" || input.action === "decline") {
          if (actor.actor.id !== input.receiverId) throw new AppError("forbidden");
          if (
            input.action === "accept" &&
            !(await receiverEligible(ctx.tx, input.receiverId, task, true))
          )
            throw new AppError("forbidden");
        } else {
          const request = await latestHandoverEvent(ctx.tx, task.id);
          if (
            request?.messageKey !== "work.task.handover.request" ||
            request.actorId !== actor.actor.id
          )
            throw new AppError("forbidden");
        }
      }
      const now = new Date();
      const reviewAt = input.action === "accept" ? new Date(input.dueAt) : null;
      if (reviewAt) {
        if (reviewAt <= now)
          throw new AppError("validation_failed", {
            fieldErrors: { dueAt: ["future_required"] },
          });
        if (task.dueAt && task.dueAt > now && reviewAt > task.dueAt)
          throw new AppError("validation_failed", {
            fieldErrors: { dueAt: ["after_deadline"] },
          });
      }
      await ctx.tx
        .update(tasks)
        .set({
          ...(input.action === "accept"
            ? {
                ownerId: input.receiverId,
                title: input.nextAction,
                followUpAt: reviewAt,
              }
            : {}),
          pendingOwnerId: input.action === "request" ? input.receiverId : null,
          version: sql`${tasks.version} + 1`,
          updatedAt: now,
        })
        .where(eq(tasks.id, task.id));
      await recordChange(ctx, "task", task.id, `task.handover.${input.action}`, "task.manage", {
        taskVersion: task.version + 1,
        fromOwnerId: task.ownerId,
        receiverId: input.receiverId,
        ...(input.action === "accept"
          ? {
              previousTitle: task.title,
              nextAction: input.nextAction,
              reviewAt: reviewAt?.toISOString(),
            }
          : { reason: input.reason }),
      });
      return {
        id: task.id,
        version: task.version + 1,
        recordedAt: now.toISOString(),
        ...(input.action === "accept"
          ? { nextAction: input.nextAction, reviewAt: reviewAt?.toISOString() }
          : {}),
      };
    },
  );
}
