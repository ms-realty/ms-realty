import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { inquiries, operations, parties, principals, tasks } from "@/db/schema";
import { requireAvailableStaff } from "@/server/auth/availability";
import type { Session } from "@/server/auth/sessions";
import { assertCan, assertCanRead } from "@/server/authz";
import { hashRequest } from "@/server/crypto";
import type { Executor } from "@/server/db";
import { AppError, isAppError } from "@/server/errors";
import { runOperation } from "@/server/operations";
import { readContact } from "@/server/work/queries";
import {
  inquiryResource,
  liveStaff,
  parseInput,
  recordChange,
  taskResource,
} from "@/server/work/shared";
import { isIssuedFormOperation } from "@/ui/form/server";

const pairSchema = z
  .object({ left: z.uuid(), right: z.uuid() })
  .strict()
  .refine((pair) => pair.left !== pair.right);
export const deferContactReviewSchema = z
  .object({
    operationId: z.string().min(16).max(200),
    left: z.uuid(),
    right: z.uuid(),
    leftVersion: z.number().int().positive(),
    rightVersion: z.number().int().positive(),
    inquiryId: z.uuid(),
    nextStep: z.string().trim().min(10).max(500),
    reviewed: z.literal(true),
  })
  .strict()
  .refine((pair) => pair.left !== pair.right);

/** Only contacts already reached through this person's currently authorized inquiries. */
export async function readContactPair(db: Executor, session: Session, raw: unknown) {
  const parsed = pairSchema.safeParse(raw);
  if (!parsed.success) throw new AppError("not_found");
  const pair = parsed.data;
  const left = await readContact(db, session, pair.left);
  const right = await readContact(db, session, pair.right);
  return { left, right };
}

export async function contactReviewOwner(db: Executor, session: Session) {
  const live = await liveStaff(db, session);
  const [person] = await db
    .select({ name: principals.displayName })
    .from(principals)
    .where(eq(principals.id, live.account.id));
  return person?.name ?? "—";
}

/** Record an unresolved comparison as owned verification work. This command has no merge authority. */
export async function deferContactReview(db: Executor, session: Session, raw: unknown) {
  const input = parseInput(deferContactReviewSchema, raw);
  const authorize = async (tx: Executor, lock = false) => {
    const live = await liveStaff(tx, session);
    const pair = await readContactPair(tx, live, { left: input.left, right: input.right });
    const query = tx.select().from(inquiries).where(eq(inquiries.id, input.inquiryId));
    const [inquiry] = await (lock ? query.for("share") : query);
    if (!inquiry || inquiry.partyId !== input.left) throw new AppError("not_found");
    await assertCanRead(tx, live.actor, "inquiry.read", inquiryResource(inquiry));
    await assertCan(tx, live.actor, "task.manage", {
      type: "task",
      ...(inquiry.caseId ? { caseId: inquiry.caseId } : {}),
      audience: "internal",
    });
    await requireAvailableStaff(tx, live.account.id, lock);
    return { live, pair, inquiry };
  };
  await authorize(db);
  // Hold the two source records in stable UUID order; replay still rechecks current visibility.
  const settled = await db.transaction(async (tx) => {
    for (const id of [input.left, input.right].sort())
      await tx.select({ id: parties.id }).from(parties).where(eq(parties.id, id)).for("share");
    const current = await authorize(tx, true);
    try {
      return {
        ok: true as const,
        result: await runOperation(
          tx,
          {
            actor: current.live.actor,
            type: "work.contact_review.defer",
            idempotencyKey: input.operationId,
            requestHash: hashRequest(input),
            subject: { type: "inquiry", id: current.inquiry.id },
          },
          async (ctx) => {
            if (
              current.pair.left.party.version !== input.leftVersion ||
              current.pair.right.party.version !== input.rightVersion
            )
              throw new AppError("version_conflict");
            if (
              current.pair.left.party.mergedIntoPartyId ||
              current.pair.right.party.mergedIntoPartyId
            )
              throw new AppError("transition_denied");
            const [task] = await ctx.tx
              .insert(tasks)
              .values({
                title: input.nextStep,
                purpose:
                  "Contact comparison remains unresolved. Keep both records separate while verifying identity and the affected relationships.",
                type: "fact_verification",
                ownerId: current.live.account.id,
                inquiryId: current.inquiry.id,
                caseId: current.inquiry.caseId,
              })
              .returning();
            if (!task) throw new Error("Contact review task insert failed");
            await recordChange(ctx, "task", task.id, "contact_review.deferred", "task.manage", {
              left: input.left,
              right: input.right,
              leftVersion: input.leftVersion,
              rightVersion: input.rightVersion,
              ownerId: current.live.account.id,
              inquiryId: current.inquiry.id,
              identityConfirmed: false,
            });
            return {
              taskId: task.id,
              left: input.left,
              right: input.right,
              ownerId: current.live.account.id,
              inquiryId: current.inquiry.id,
              nextStep: task.title,
              recordedAt: task.createdAt.toISOString(),
            };
          },
        ),
      };
    } catch (error) {
      if (isAppError(error)) return { ok: false as const, error };
      throw error;
    }
  });
  if (!settled.ok) throw settled.error;
  return settled.result;
}

const outcomeSchema = z.object({
  taskId: z.uuid(),
  left: z.uuid(),
  right: z.uuid(),
  ownerId: z.uuid(),
  inquiryId: z.uuid(),
  nextStep: z.string(),
  recordedAt: z.string(),
});
/** Exact own operation read, with both contacts and the resulting task reauthorized. */
export async function readDeferredContactReview(db: Executor, session: Session, id: string) {
  const live = await liveStaff(db, session);
  if (!z.uuid().safeParse(id).success) throw new AppError("not_found");
  const [receipt] = await db
    .select()
    .from(operations)
    .where(
      and(
        eq(operations.id, id),
        eq(operations.actorKind, "staff"),
        eq(operations.actorId, live.actor.id),
        eq(operations.operationType, "work.contact_review.defer"),
        eq(operations.status, "succeeded"),
      ),
    );
  const parsed = outcomeSchema.safeParse(receipt?.outcome);
  if (!receipt || !parsed.success) throw new AppError("not_found");
  const pair = await readContactPair(db, live, {
    left: parsed.data.left,
    right: parsed.data.right,
  });
  const [task] = await db.select().from(tasks).where(eq(tasks.id, parsed.data.taskId));
  if (!task) throw new AppError("not_found");
  await assertCanRead(db, live.actor, "task.manage", taskResource(task));
  const [owner] = await db
    .select({ name: principals.displayName })
    .from(principals)
    .where(eq(principals.id, task.ownerId ?? parsed.data.ownerId));
  return { pair, task, ownerName: owner?.name ?? null, receipt: parsed.data };
}

/** Read one submitted key without rerunning the command or inventing a successful task. */
export async function contactReviewStatus(
  db: Executor,
  session: Session,
  pair: { left: string; right: string },
  key: string,
) {
  const live = await liveStaff(db, session);
  await readContactPair(db, live, pair);
  if (!isIssuedFormOperation(`contact-review:${live.account.id}:${pair.left}:${pair.right}`, key))
    throw new AppError("not_found");
  return db.transaction(async (tx) => {
    const lockKey = JSON.stringify([
      live.actor.kind,
      live.actor.id,
      "work.contact_review.defer",
      key,
    ]);
    const [lock] = await tx.execute<{ locked: boolean }>(
      sql`select pg_try_advisory_xact_lock(hashtextextended(${lockKey}, 0)) as locked`,
    );
    if (!lock?.locked) return { state: "unknown" as const };
    const [receipt] = await tx
      .select()
      .from(operations)
      .where(
        and(
          eq(operations.actorKind, "staff"),
          eq(operations.actorId, live.actor.id),
          eq(operations.operationType, "work.contact_review.defer"),
          eq(operations.idempotencyKey, key),
        ),
      );
    if (!receipt) return { state: "absent" as const };
    if (receipt.status === "succeeded") {
      const current = await readDeferredContactReview(tx, live, receipt.id);
      if (current.receipt.left !== pair.left || current.receipt.right !== pair.right)
        throw new AppError("not_found");
      return { state: "succeeded" as const, id: receipt.id };
    }
    return { state: receipt.status === "failed" ? ("failed" as const) : ("unknown" as const) };
  });
}
