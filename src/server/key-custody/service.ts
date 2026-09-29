import "server-only";
import { and, asc, desc, eq, getTableColumns, gt, inArray, lt } from "drizzle-orm";
import { z } from "zod";
import {
  keyCustodyEvents,
  keySets,
  operations,
  principals,
  properties,
  staffMemberships,
} from "@/db/schema";
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

export const custodyStates = ["stored", "checked_out", "lost", "returned_to_owner"] as const;
export type CustodyState = (typeof custodyStates)[number];
export function custodyTransitions(state: string): CustodyState[] {
  switch (state) {
    case "stored":
      return ["checked_out", "returned_to_owner", "lost"];
    case "checked_out":
      return ["stored", "returned_to_owner", "lost"];
    case "lost":
      return ["stored", "returned_to_owner"];
    default:
      return [];
  }
}
const common = {
  operationId: z.string().min(16).max(200),
  note: z.string().trim().min(10).max(2000),
  reviewed: z.literal(true),
};
export async function custodyOperator(db: Executor, session: Session) {
  const live = await liveStaff(db, session);
  if (!(await can(db, live.actor, "key.manage"))) throw new AppError("not_found");
  return live;
}
async function eligibleHolder(db: Executor, id: string) {
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
    )
    .for("share");
  return Boolean(row && (await countActivePasskeys(db, id)) >= 2);
}
export async function custodyHolders(db: Executor, session: Session) {
  await custodyOperator(db, session);
  const rows = await db
    .select({ id: principals.id, name: principals.displayName, email: principals.email })
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
  const result = [];
  for (const row of rows) if (await eligibleHolder(db, row.id)) result.push(row);
  return result;
}
async function recordCustody(
  db: Executor,
  session: Session,
  row: typeof keySets.$inferSelect,
  operationId: string,
  note: string,
  action = "key.custody_recorded",
) {
  await db.insert(keyCustodyEvents).values({
    keySetId: row.id,
    version: row.version,
    state: row.state,
    storageLabel: row.storageLabel,
    holderId: row.holderId,
    dueAt: row.dueAt,
    note,
    recordedById: session.actor.id,
    operationId,
  });
  await recordAudit(db, {
    actor: session.actor,
    action,
    capability: "key.manage",
    recordType: "key_set",
    recordId: row.id,
    operationId,
    payload: { version: row.version, state: row.state, contentHash: hashRequest(row) },
  });
  return { id: row.id, reference: row.reference, version: row.version, state: row.state };
}
export async function receiveKeys(db: Executor, session: Session, raw: unknown) {
  const input = parseInput(
    z.object({
      ...common,
      propertyReference: z.string().trim().min(3).max(80),
      keyTag: z
        .string()
        .trim()
        .min(2)
        .max(80)
        .transform((s) => s.toUpperCase()),
      quantity: z.int().min(1).max(50),
      sourceReference: z.string().trim().min(3).max(250),
      storageLabel: z.string().trim().min(2).max(150),
    }),
    raw,
  );
  const live = await custodyOperator(db, session);
  return runOperation(
    db,
    {
      actor: live.actor,
      type: "key.receive",
      idempotencyKey: input.operationId,
      requestHash: hashRequest(input),
    },
    async (ctx) => {
      await custodyOperator(ctx.tx, session);
      const [property] = await ctx.tx
        .select({ id: properties.id, merged: properties.mergedIntoPropertyId })
        .from(properties)
        .where(eq(properties.reference, input.propertyReference))
        .for("share");
      if (!property || property.merged)
        throw new AppError("validation_failed", {
          fieldErrors: { propertyReference: ["Choose a current property reference"] },
        });
      const [row] = await ctx.tx
        .insert(keySets)
        .values({
          reference: await nextReference(ctx.tx, "key_set"),
          propertyId: property.id,
          keyTag: input.keyTag,
          quantity: input.quantity,
          sourceReference: input.sourceReference,
          storageLabel: input.storageLabel,
        })
        .onConflictDoNothing({ target: keySets.keyTag })
        .returning();
      if (!row)
        throw new AppError("validation_failed", {
          fieldErrors: { keyTag: ["This tag is already registered"] },
        });
      return recordCustody(ctx.tx, live, row, ctx.operationId, input.note);
    },
  );
}
export async function moveKeys(db: Executor, session: Session, raw: unknown) {
  const input = parseInput(
    z.object({
      ...common,
      id: z.uuid(),
      expectedVersion: z.int().positive(),
      state: z.enum(custodyStates),
      holderId: z.string().max(36).default(""),
      dueAt: z.string().max(40).default(""),
      storageLabel: z.string().trim().max(150).default(""),
    }),
    raw,
  );
  const live = await custodyOperator(db, session);
  return runOperation(
    db,
    {
      actor: live.actor,
      type: "key.move",
      idempotencyKey: input.operationId,
      requestHash: hashRequest(input),
      expectedVersion: input.expectedVersion,
    },
    async (ctx) => {
      const [row] = await ctx.tx
        .select()
        .from(keySets)
        .where(eq(keySets.id, input.id))
        .for("update");
      await custodyOperator(ctx.tx, session);
      if (!row) throw new AppError("not_found");
      version(row, input.expectedVersion);
      if (!custodyTransitions(row.state).includes(input.state))
        throw new AppError("transition_denied");
      const checkedOut = input.state === "checked_out";
      if (
        checkedOut &&
        (!z.uuid().safeParse(input.holderId).success ||
          !(await eligibleHolder(ctx.tx, input.holderId)))
      )
        throw new AppError("validation_failed", {
          fieldErrors: { holderId: ["Choose a current staff holder with two passkeys"] },
        });
      if (
        checkedOut &&
        (!z.iso.datetime().safeParse(input.dueAt).success ||
          new Date(input.dueAt).getTime() <= Date.now())
      )
        throw new AppError("validation_failed", {
          fieldErrors: { dueAt: ["Choose a future due-back time"] },
        });
      if (input.state === "stored" && input.storageLabel.length < 2)
        throw new AppError("validation_failed", {
          fieldErrors: { storageLabel: ["Record the actual storage label"] },
        });
      const [changed] = await ctx.tx
        .update(keySets)
        .set({
          state: input.state,
          holderId: checkedOut ? input.holderId : null,
          dueAt: checkedOut ? new Date(input.dueAt) : null,
          storageLabel: input.state === "stored" ? input.storageLabel : null,
          version: row.version + 1,
          updatedAt: new Date(),
        })
        .where(eq(keySets.id, row.id))
        .returning();
      if (!changed) throw new Error("No custody revision");
      return recordCustody(ctx.tx, live, changed, ctx.operationId, input.note);
    },
  );
}
export async function amendKeyDeadline(db: Executor, session: Session, raw: unknown) {
  const input = parseInput(
    z.object({
      ...common,
      id: z.uuid(),
      expectedVersion: z.int().positive(),
      dueAt: z.iso.datetime(),
    }),
    raw,
  );
  const live = await custodyOperator(db, session);
  return runOperation(
    db,
    {
      actor: live.actor,
      type: "key.amend_deadline",
      idempotencyKey: input.operationId,
      requestHash: hashRequest(input),
      expectedVersion: input.expectedVersion,
    },
    async (ctx) => {
      const [row] = await ctx.tx
        .select()
        .from(keySets)
        .where(eq(keySets.id, input.id))
        .for("update");
      await custodyOperator(ctx.tx, session);
      if (!row) throw new AppError("not_found");
      version(row, input.expectedVersion);
      if (
        row.state !== "checked_out" ||
        !row.holderId ||
        !(await eligibleHolder(ctx.tx, row.holderId))
      )
        throw new AppError("transition_denied");
      const dueAt = new Date(input.dueAt);
      if (dueAt.getTime() <= Date.now() || dueAt.getTime() === row.dueAt?.getTime())
        throw new AppError("validation_failed", {
          fieldErrors: { dueAt: ["Choose a different future due-back time"] },
        });
      const [changed] = await ctx.tx
        .update(keySets)
        .set({
          dueAt,
          version: row.version + 1,
          updatedAt: new Date(),
        })
        .where(eq(keySets.id, row.id))
        .returning();
      if (!changed) throw new Error("No custody revision");
      return recordCustody(
        ctx.tx,
        live,
        changed,
        ctx.operationId,
        input.note,
        "key.deadline_amended",
      );
    },
  );
}
export async function listKeys(db: Executor, session: Session, state?: string, after?: string) {
  await custodyOperator(db, session);
  const filter = z.enum(custodyStates).safeParse(state),
    cursor = z.uuid().safeParse(after);
  const rows = await db
    .select({
      key: keySets,
      propertyReference: properties.reference,
      holderName: principals.displayName,
    })
    .from(keySets)
    .innerJoin(properties, eq(properties.id, keySets.propertyId))
    .leftJoin(principals, eq(principals.id, keySets.holderId))
    .where(
      and(
        filter.success
          ? eq(keySets.state, filter.data)
          : state === "overdue"
            ? and(eq(keySets.state, "checked_out"), lt(keySets.dueAt, new Date()))
            : undefined,
        cursor.success ? gt(keySets.id, cursor.data) : undefined,
      ),
    )
    .orderBy(asc(keySets.id))
    .limit(51);
  return { rows: rows.slice(0, 50), next: rows.length > 50 ? rows[49]?.key.id : undefined };
}
export async function readKeys(db: Executor, session: Session, id: string, before?: string) {
  await custodyOperator(db, session);
  if (!z.uuid().safeParse(id).success) throw new AppError("not_found");
  const [view] = await db
    .select({ row: keySets, propertyReference: properties.reference })
    .from(keySets)
    .innerJoin(properties, eq(properties.id, keySets.propertyId))
    .where(eq(keySets.id, id));
  if (!view) throw new AppError("not_found");
  const cursor =
    before && /^[1-9]\d*$/.test(before) && Number.isSafeInteger(Number(before))
      ? Number(before)
      : undefined;
  const events = await db
    .select({ ...getTableColumns(keyCustodyEvents), operationType: operations.operationType })
    .from(keyCustodyEvents)
    .innerJoin(operations, eq(operations.id, keyCustodyEvents.operationId))
    .where(
      and(
        eq(keyCustodyEvents.keySetId, id),
        cursor ? lt(keyCustodyEvents.version, cursor) : undefined,
      ),
    )
    .orderBy(desc(keyCustodyEvents.version))
    .limit(51);
  const ids = [
    ...new Set(
      [view.row.holderId, ...events.flatMap((e) => [e.holderId, e.recordedById])].filter(
        (id): id is string => Boolean(id),
      ),
    ),
  ];
  const names = ids.length
    ? await db
        .select({ id: principals.id, name: principals.displayName })
        .from(principals)
        .where(inArray(principals.id, ids))
    : [];
  return {
    ...view,
    events: events.slice(0, 50),
    next: events.length > 50 ? events[49]?.version : undefined,
    names,
  };
}
