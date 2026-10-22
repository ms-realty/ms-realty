import "server-only";
import { and, asc, desc, eq, gt, inArray, lt } from "drizzle-orm";
import { z } from "zod";
import { complaintReviews, complaints, principals, staffMemberships } from "@/db/schema";
import { recordAudit } from "../audit";
import { countActivePasskeys } from "../auth/passkeys";
import type { Session } from "../auth/sessions";
import { can } from "../authz";
import { hashRequest } from "../crypto";
import type { Executor } from "../db";
import { AppError } from "../errors";
import { runOperation } from "../operations";
import { nextReference } from "../references";
import { liveStaff, parseInput, version } from "../work/shared";
export const complaintStates = ["open", "reviewing", "waiting", "resolved"] as const;
export const complaintChannels = ["email", "phone", "in_person", "website", "other"] as const;
const common = {
  operationId: z.string().min(16).max(200),
  ownerId: z.uuid(),
  dueAt: z.iso.datetime(),
  reviewed: z.literal(true),
};
export async function complaintOperator(db: Executor, session: Session) {
  const live = await liveStaff(db, session);
  if (!(await can(db, live.actor, "complaint.manage"))) throw new AppError("not_found");
  return live;
}
export async function complaintOwners(db: Executor, session: Session) {
  await complaintOperator(db, session);
  const rows = await db
    .select({ id: principals.id, name: principals.displayName })
    .from(principals)
    .innerJoin(staffMemberships, eq(staffMemberships.principalId, principals.id))
    .where(
      and(
        eq(principals.kind, "staff"),
        eq(principals.status, "active"),
        eq(staffMemberships.state, "active"),
      ),
    )
    .orderBy(asc(principals.id));
  const owners = [];
  for (const row of rows) if (await eligibleOwner(db, row.id)) owners.push(row);
  return owners;
}
async function eligibleOwner(db: Executor, id: string) {
  const [row] = await db
    .select({ id: principals.id })
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
  return Boolean(
    row &&
      (await can(db, { kind: "staff", id }, "complaint.manage")) &&
      (await countActivePasskeys(db, id)) >= 2,
  );
}
async function recordReview(
  db: Executor,
  session: Session,
  row: typeof complaints.$inferSelect,
  operationId: string,
  note: string,
) {
  await db.insert(complaintReviews).values({
    complaintId: row.id,
    version: row.version,
    state: row.state,
    ownerId: row.ownerId,
    dueAt: row.dueAt,
    note,
    outcome: row.outcome,
    reviewedById: session.actor.id,
    operationId,
  });
  await recordAudit(db, {
    actor: session.actor,
    action: "complaint.recorded",
    capability: "complaint.manage",
    recordType: "complaint",
    recordId: row.id,
    operationId,
    payload: {
      version: row.version,
      state: row.state,
      ownerId: row.ownerId,
      dueAt: row.dueAt.toISOString(),
      contentHash: hashRequest(row),
    },
  });
  return { id: row.id, reference: row.reference, version: row.version, state: row.state };
}
export async function createComplaint(db: Executor, session: Session, raw: unknown) {
  const input = parseInput(
    z.object({
      ...common,
      channel: z.enum(complaintChannels),
      sourceReference: z.string().trim().min(3).max(250),
      description: z.string().trim().min(10).max(4000),
      receivedAt: z.iso.datetime(),
    }),
    raw,
  );
  const live = await complaintOperator(db, session);
  return runOperation(
    db,
    {
      actor: live.actor,
      type: "complaint.create",
      idempotencyKey: input.operationId,
      requestHash: hashRequest(input),
    },
    async (ctx) => {
      await complaintOperator(ctx.tx, session);
      if (!(await eligibleOwner(ctx.tx, input.ownerId)))
        throw new AppError("validation_failed", {
          fieldErrors: { ownerId: ["Choose a current authorized owner"] },
        });
      if (
        new Date(input.receivedAt).getTime() > Date.now() ||
        new Date(input.dueAt) < new Date(input.receivedAt)
      )
        throw new AppError("validation_failed", {
          fieldErrors: { dueAt: ["Check received and due instants"] },
        });
      const [row] = await ctx.tx
        .insert(complaints)
        .values({
          reference: await nextReference(ctx.tx, "complaint"),
          channel: input.channel,
          sourceReference: input.sourceReference,
          description: input.description,
          receivedAt: new Date(input.receivedAt),
          dueAt: new Date(input.dueAt),
          ownerId: input.ownerId,
        })
        .returning();
      if (!row) throw new Error("No complaint");
      return recordReview(ctx.tx, live, row, ctx.operationId, "received");
    },
  );
}
export async function reviewComplaint(db: Executor, session: Session, raw: unknown) {
  const input = parseInput(
    z.object({
      ...common,
      id: z.uuid(),
      expectedVersion: z.int().positive(),
      state: z.enum(complaintStates),
      note: z.string().trim().min(10).max(4000),
      outcome: z.string().trim().max(4000),
    }),
    raw,
  );
  const live = await complaintOperator(db, session);
  return runOperation(
    db,
    {
      actor: live.actor,
      type: "complaint.review",
      idempotencyKey: input.operationId,
      requestHash: hashRequest(input),
      expectedVersion: input.expectedVersion,
    },
    async (ctx) => {
      const [row] = await ctx.tx
        .select()
        .from(complaints)
        .where(eq(complaints.id, input.id))
        .for("update");
      await complaintOperator(ctx.tx, session);
      if (!row) throw new AppError("not_found");
      version(row, input.expectedVersion);
      if (!(await eligibleOwner(ctx.tx, input.ownerId)))
        throw new AppError("validation_failed", {
          fieldErrors: { ownerId: ["Choose a current authorized owner"] },
        });
      if (new Date(input.dueAt) < row.receivedAt)
        throw new AppError("validation_failed", {
          fieldErrors: { dueAt: ["Due date precedes receipt"] },
        });
      if (input.state === "resolved" && input.outcome.length < 10)
        throw new AppError("validation_failed", {
          fieldErrors: { outcome: ["Record the reviewed outcome"] },
        });
      if (row.state === "resolved" && !["resolved", "open"].includes(input.state))
        throw new AppError("transition_denied");
      const [changed] = await ctx.tx
        .update(complaints)
        .set({
          ownerId: input.ownerId,
          dueAt: new Date(input.dueAt),
          state: input.state,
          outcome: input.outcome,
          resolvedAt: input.state === "resolved" ? (row.resolvedAt ?? new Date()) : null,
          version: row.version + 1,
          updatedAt: new Date(),
        })
        .where(eq(complaints.id, row.id))
        .returning();
      if (!changed) throw new Error("No complaint revision");
      return recordReview(ctx.tx, live, changed, ctx.operationId, input.note);
    },
  );
}
export async function readComplaint(db: Executor, session: Session, id: string, before?: string) {
  await complaintOperator(db, session);
  if (!z.uuid().safeParse(id).success) throw new AppError("not_found");
  const [row] = await db.select().from(complaints).where(eq(complaints.id, id));
  if (!row) throw new AppError("not_found");
  const cursor =
    before && /^[1-9]\d*$/.test(before) && Number.isSafeInteger(Number(before))
      ? Number(before)
      : undefined;
  const reviews = await db
    .select()
    .from(complaintReviews)
    .where(
      and(
        eq(complaintReviews.complaintId, id),
        cursor ? lt(complaintReviews.version, cursor) : undefined,
      ),
    )
    .orderBy(desc(complaintReviews.version))
    .limit(51);
  const names = await db
    .select({ id: principals.id, name: principals.displayName })
    .from(principals)
    .where(
      inArray(principals.id, [
        ...new Set([row.ownerId, ...reviews.flatMap((r) => [r.ownerId, r.reviewedById])]),
      ]),
    );
  return {
    row,
    reviews: reviews.slice(0, 50),
    next: reviews.length > 50 ? reviews[49]?.version : undefined,
    names,
  };
}
export async function listComplaints(
  db: Executor,
  session: Session,
  state?: string,
  after?: string,
) {
  await complaintOperator(db, session);
  const filter = z.enum(complaintStates).safeParse(state),
    cursor = z.uuid().safeParse(after);
  const rows = await db
    .select()
    .from(complaints)
    .where(
      and(
        filter.success ? eq(complaints.state, filter.data) : undefined,
        cursor.success ? gt(complaints.id, cursor.data) : undefined,
      ),
    )
    .orderBy(asc(complaints.id))
    .limit(51);
  const names = rows.length
    ? await db
        .select({ id: principals.id, name: principals.displayName })
        .from(principals)
        .where(inArray(principals.id, [...new Set(rows.map((r) => r.ownerId))]))
    : [];
  return { rows: rows.slice(0, 50), next: rows.length > 50 ? rows[49]?.id : undefined, names };
}
