import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import {
  grants,
  mergeRecords,
  operations,
  parties,
  passkeys,
  principals,
  properties,
  sessions,
  staffMemberships,
} from "@/db/schema";
import { recordActivity } from "@/server/activity";
import { recordAudit } from "@/server/audit";
import { requireAvailableStaff } from "@/server/auth/availability";
import type { Session } from "@/server/auth/sessions";
import { assertCan } from "@/server/authz";
import { hashRequest } from "@/server/crypto";
import type { Database, Executor, Transaction } from "@/server/db";
import { AppError, isAppError } from "@/server/errors";
import { recordOutboxEvent } from "@/server/jobs/outbox";
import { type OperationContext, runOperation } from "@/server/operations";
import { liveStaff, parseInput } from "@/server/work/shared";
import { isIssuedFormOperation } from "@/ui/form/server";
import {
  type DuplicateImpact,
  type DuplicatePair,
  duplicatePairSchema,
  type Hold,
  readDuplicateImpact,
  readDuplicateSource,
} from "./impact";

const envelope = {
  operationId: z.string().min(16).max(200),
  leftVersion: z.int().positive(),
  rightVersion: z.int().positive(),
  impactDigest: z.string().regex(/^[a-f0-9]{64}$/),
  reason: z.string().trim().min(10).max(1000),
  reviewed: z.literal(true),
};
export const mergeDuplicateSchema = z
  .object({
    ...envelope,
    subject: z.enum(["party", "property"]),
    left: z.uuid(),
    right: z.uuid(),
    survivor: z.uuid(),
    aliasMap: z.array(z.object({ aliasId: z.uuid(), canonicalId: z.uuid() }).strict()).length(1),
  })
  .strict()
  .refine((v) => v.left !== v.right && [v.left, v.right].includes(v.survivor))
  .refine(
    (v) =>
      v.aliasMap[0]?.aliasId === (v.survivor === v.left ? v.right : v.left) &&
      v.aliasMap[0]?.canonicalId === v.survivor,
  );
export const reverseDuplicateSchema = z.object({ ...envelope, mergeId: z.uuid() }).strict();
const receiptSchema = z.object({
  kind: z.literal("duplicate_receipt_v1"),
  action: z.enum(["merge", "reverse"]),
  mergeId: z.uuid(),
  subject: z.enum(["party", "property"]),
  left: z.uuid(),
  right: z.uuid(),
  survivor: z.uuid(),
  alias: z.uuid(),
  aliasMap: z.array(z.object({ aliasId: z.uuid(), canonicalId: z.uuid() })),
  recordedAt: z.string(),
  reviewedDigest: z.string(),
  referenceDigest: z.string(),
  preservedReferenceCount: z.number(),
  permissionChanges: z.array(z.never()),
  decisionReason: z.string(),
  reviewedVersions: z.object({ left: z.int(), right: z.int() }),
  resultingVersions: z.object({ left: z.int(), right: z.int() }),
});
const reviewSchema = z.object({
  kind: z.literal("duplicate_merge_v1"),
  operationId: z.uuid(),
  left: z.uuid(),
  right: z.uuid(),
  reviewedDigest: z.string(),
  referenceDigest: z.string(),
  postLeft: z.string(),
  postRight: z.string(),
  aliasMap: z.array(z.object({ aliasId: z.uuid(), canonicalId: z.uuid() })),
  reviewedVersions: z.object({ left: z.int(), right: z.int() }),
  resultingVersions: z.object({ left: z.int(), right: z.int() }),
});
export type DuplicateReceipt = z.infer<typeof receiptSchema>;
export const duplicateOperationScope = (
  actorId: string,
  action: "merge" | "reverse",
  pair: DuplicatePair,
  mergeId = "",
) => `duplicate:${action}:${actorId}:${pair.subject}:${pair.left}:${pair.right}:${mergeId}`;

async function authorize(db: Executor, session: Session, pair: DuplicatePair, lock = false) {
  const live = await liveStaff(db, session);
  // Consequential authority is checked independently, never through the survivor's scope.
  for (const id of [pair.left, pair.right].sort()) {
    await readDuplicateSource(db, live.actor, pair.subject, id);
    await assertCan(db, live.actor, "import.run", { type: pair.subject, id, audience: "internal" });
  }
  await requireAvailableStaff(db, live.account.id, lock);
  const impact = await readDuplicateImpact(db, live, pair, lock);
  if (impact.held.includes("restricted")) throw new AppError("not_found");
  return { live, impact };
}

function withMergeHolds(impact: DuplicateImpact): DuplicateImpact {
  const held = new Set<Hold>(impact.held);
  if (impact.left.mergedInto || impact.right.mergedInto) held.add("existing_merge");
  if (
    (impact.left.fields.kind && impact.left.fields.kind !== impact.right.fields.kind) ||
    (impact.left.fields.propertyType &&
      impact.left.fields.propertyType !== impact.right.fields.propertyType)
  )
    held.add("different_kind");
  // Verified conflicting contact values require separate manual identity/verification work.
  // The projection is a digest only; no contact value is transferred to a different audience.
  const refs = impact.references.filter((r) => r.table === "contact_methods");
  const values = refs.flatMap((r) => (r.verifiedContact ? [r.verifiedContact] : []));
  for (const kind of ["email", "phone"])
    if (new Set(values.filter((v) => v.kind === kind).map((v) => v.valueDigest)).size > 1)
      held.add("verified_contact_conflict");
  const result = { ...impact, held: [...held].sort() };
  return { ...result, digest: hashRequest({ ...result, digest: undefined }) };
}

export async function previewDuplicateMerge(db: Executor, session: Session, raw: unknown) {
  const pair = parseInput(duplicatePairSchema, raw);
  const live = await liveStaff(db, session);
  // A readable comparison can show an honest restricted-impact hold without revealing it.
  for (const id of [pair.left, pair.right]) {
    await readDuplicateSource(db, live.actor, pair.subject, id);
    await assertCan(db, live.actor, "import.run", { type: pair.subject, id, audience: "internal" });
  }
  return withMergeHolds(await readDuplicateImpact(db, live, pair));
}

/** Deterministic source and authority locks. No auth identifier is resolved through an alias. */
async function lockCommand(
  tx: Transaction,
  session: Session,
  pair: DuplicatePair,
  action: "merge" | "reverse",
  key: string,
) {
  const lockKey = JSON.stringify([
    session.actor.kind,
    session.actor.id,
    `duplicate.${action}`,
    key,
  ]);
  const [lock] = await tx.execute<{ locked: boolean }>(
    sql`select pg_try_advisory_xact_lock(hashtextextended(${lockKey}, 0)) as locked`,
  );
  if (!lock?.locked) throw new AppError("operation_pending");
  for (const id of [pair.left, pair.right].sort()) {
    const table = pair.subject === "party" ? parties : properties;
    await tx.select({ id: table.id }).from(table).where(eq(table.id, id)).for("update");
  }
  await tx
    .select({ id: grants.id })
    .from(grants)
    .where(eq(grants.principalId, session.account.id))
    .orderBy(asc(grants.id))
    .for("share");
  await tx
    .select({ id: passkeys.id })
    .from(passkeys)
    .where(eq(passkeys.principalId, session.account.id))
    .orderBy(asc(passkeys.id))
    .for("share");
  await tx
    .select({ id: principals.id })
    .from(principals)
    .where(eq(principals.id, session.account.id))
    .for("share");
  await tx
    .select({ id: sessions.id })
    .from(sessions)
    .where(eq(sessions.id, session.id))
    .for("share");
  await tx
    .select({ id: staffMemberships.id })
    .from(staffMemberships)
    .where(eq(staffMemberships.principalId, session.account.id))
    .for("share");
}

async function recordIdentityChange(
  ctx: OperationContext,
  pair: DuplicatePair,
  result: DuplicateReceipt,
) {
  // Separate entries retain each source's scope; no cross-party detail enters ordinary timelines.
  for (const id of [pair.left, pair.right].sort()) {
    await recordActivity(ctx.tx, {
      recordType: pair.subject,
      recordId: id,
      messageKey: `duplicate.${result.action}`,
      summary: `duplicate.${result.action}`,
      actor: ctx.actor,
      operationId: ctx.operationId,
      params: { mergeId: result.mergeId },
    });
    await recordAudit(ctx.tx, {
      action: `duplicate.${result.action}`,
      actor: ctx.actor,
      recordType: pair.subject,
      recordId: id,
      operationId: ctx.operationId,
      capability: "import.run",
      payload: {
        mergeId: result.mergeId,
        referenceDigest: result.referenceDigest,
        reviewedDigest: result.reviewedDigest,
        permissionChanges: [],
      },
    });
    await recordOutboxEvent(ctx.tx, {
      eventType: `duplicate.${result.action}`,
      subjectType: pair.subject,
      subjectId: id,
      operationId: ctx.operationId,
      payload: { mergeId: result.mergeId, audienceChanged: false },
    });
  }
}

async function setMapping(
  tx: Executor,
  pair: DuplicatePair,
  alias: string,
  survivor: string | null,
) {
  // Versions advance on both identities. All names, aliases, facts and dependent FKs stay put.
  if (pair.subject === "party") {
    for (const id of [pair.left, pair.right].sort())
      await tx
        .update(parties)
        .set({
          version: sql`${parties.version} + 1`,
          ...(id === alias ? { mergedIntoPartyId: survivor } : {}),
        })
        .where(eq(parties.id, id));
  } else {
    for (const id of [pair.left, pair.right].sort())
      await tx
        .update(properties)
        .set({
          version: sql`${properties.version} + 1`,
          ...(id === alias ? { mergedIntoPropertyId: survivor } : {}),
        })
        .where(eq(properties.id, id));
  }
}
function transactionError(error: unknown): never {
  let current: unknown = error;
  while (current && typeof current === "object") {
    if ("code" in current && ["40001", "40P01"].includes(String(current.code)))
      throw new AppError("version_conflict"); // PostgreSQL confirms the transaction rolled back.
    current = "cause" in current ? current.cause : null;
  }
  throw error;
}

/** Top-level serializable command: mapping, merge record, receipt, audit and outbox commit together. */
export async function mergeDuplicate(db: Database, session: Session, raw: unknown) {
  const input = parseInput(mergeDuplicateSchema, raw);
  const pair: DuplicatePair = { subject: input.subject, left: input.left, right: input.right };
  await authorize(db, session, pair);
  try {
    const settled = await db.transaction(
      async (tx) => {
        await lockCommand(tx, session, pair, "merge", input.operationId);
        const current = await authorize(tx, session, pair, true);
        try {
          return {
            ok: true as const,
            result: await runOperation(
              tx,
              {
                actor: current.live.actor,
                type: "duplicate.merge",
                idempotencyKey: input.operationId,
                requestHash: hashRequest(input),
                subject: { type: pair.subject, id: input.survivor },
              },
              async (ctx) => {
                const impact = withMergeHolds(current.impact);
                if (
                  impact.left.version !== input.leftVersion ||
                  impact.right.version !== input.rightVersion ||
                  impact.digest !== input.impactDigest
                )
                  throw new AppError("version_conflict");
                if (impact.held.length)
                  throw new AppError("transition_denied", { current: { held: impact.held } });
                const alias = input.survivor === input.left ? input.right : input.left;
                await setMapping(ctx.tx, pair, alias, input.survivor);
                const after = await readDuplicateImpact(ctx.tx, current.live, pair, true);
                if (after.held.length || after.referenceDigest !== impact.referenceDigest)
                  throw new AppError("version_conflict");
                const review = {
                  kind: "duplicate_merge_v1",
                  operationId: ctx.operationId,
                  left: input.left,
                  right: input.right,
                  reviewedDigest: input.impactDigest,
                  referenceDigest: after.referenceDigest,
                  postLeft: after.left.fingerprint,
                  postRight: after.right.fingerprint,
                  aliasMap: input.aliasMap,
                  reviewedVersions: { left: impact.left.version, right: impact.right.version },
                  resultingVersions: { left: after.left.version, right: after.right.version },
                };
                const [merge] = await ctx.tx
                  .insert(mergeRecords)
                  .values({
                    subject: pair.subject,
                    survivorId: input.survivor,
                    mergedId: alias,
                    reason: input.reason,
                    review,
                    decidedById: current.live.account.id,
                  })
                  .returning();
                if (!merge) throw new Error("Merge record insert failed");
                const result: DuplicateReceipt = {
                  kind: "duplicate_receipt_v1",
                  action: "merge",
                  mergeId: merge.id,
                  ...pair,
                  survivor: input.survivor,
                  alias,
                  aliasMap: input.aliasMap,
                  recordedAt: merge.createdAt.toISOString(),
                  reviewedDigest: input.impactDigest,
                  referenceDigest: after.referenceDigest,
                  preservedReferenceCount: after.references.length,
                  permissionChanges: [],
                  decisionReason: input.reason,
                  reviewedVersions: review.reviewedVersions,
                  resultingVersions: review.resultingVersions,
                };
                await recordIdentityChange(ctx, pair, result);
                return result;
              },
            ),
          };
        } catch (error) {
          if (isAppError(error)) return { ok: false as const, error };
          throw error;
        }
      },
      { isolationLevel: "serializable" },
    );
    if (!settled.ok) throw settled.error;
    return settled.result;
  } catch (error) {
    return transactionError(error);
  }
}

async function readMergeRecord(db: Executor, id: string, lock = false) {
  if (!z.uuid().safeParse(id).success) throw new AppError("not_found");
  const query = db.select().from(mergeRecords).where(eq(mergeRecords.id, id));
  const [record] = await (lock ? query.for("update") : query);
  const parsed = reviewSchema.safeParse(record?.review);
  if (!record || !parsed.success) throw new AppError("not_found");
  return {
    record,
    review: parsed.data,
    pair: { subject: record.subject, left: parsed.data.left, right: parsed.data.right },
  };
}
function reversalHolds(
  impact: DuplicateImpact,
  merge: Awaited<ReturnType<typeof readMergeRecord>>,
) {
  const held = new Set<Hold>(impact.held);
  if (merge.record.reversedAt) held.add("already_reversed");
  if (
    impact.referenceDigest !== merge.review.referenceDigest ||
    impact.left.fingerprint !== merge.review.postLeft ||
    impact.right.fingerprint !== merge.review.postRight ||
    (impact.left.id === merge.record.mergedId
      ? impact.left.mergedInto
      : impact.right.mergedInto) !== merge.record.survivorId
  )
    held.add("changed_after_merge");
  return { ...impact, held: [...held].sort() };
}
export async function previewDuplicateReversal(db: Executor, session: Session, id: string) {
  const merge = await readMergeRecord(db, id);
  const { impact } = await authorize(db, session, merge.pair);
  return { ...merge, impact: reversalHolds(impact, merge) };
}
export async function reverseDuplicate(db: Database, session: Session, raw: unknown) {
  const input = parseInput(reverseDuplicateSchema, raw);
  const original = await readMergeRecord(db, input.mergeId);
  await authorize(db, session, original.pair);
  try {
    const settled = await db.transaction(
      async (tx) => {
        await lockCommand(tx, session, original.pair, "reverse", input.operationId);
        const merge = await readMergeRecord(tx, input.mergeId, true);
        const current = await authorize(tx, session, merge.pair, true);
        try {
          return {
            ok: true as const,
            result: await runOperation(
              tx,
              {
                actor: current.live.actor,
                type: "duplicate.reverse",
                idempotencyKey: input.operationId,
                requestHash: hashRequest(input),
                subject: { type: merge.pair.subject, id: merge.record.survivorId },
              },
              async (ctx) => {
                const impact = reversalHolds(current.impact, merge);
                if (
                  impact.left.version !== input.leftVersion ||
                  impact.right.version !== input.rightVersion ||
                  impact.digest !== input.impactDigest
                )
                  throw new AppError("version_conflict");
                if (impact.held.length)
                  throw new AppError("transition_denied", { current: { held: impact.held } });
                await setMapping(ctx.tx, merge.pair, merge.record.mergedId, null);
                const after = await readDuplicateImpact(ctx.tx, current.live, merge.pair, true);
                if (after.held.length || after.referenceDigest !== impact.referenceDigest)
                  throw new AppError("version_conflict");
                const reversedAt = new Date();
                await ctx.tx
                  .update(mergeRecords)
                  .set({
                    reversedAt,
                    reversedById: current.live.account.id,
                    review: {
                      ...merge.review,
                      reversal: {
                        operationId: ctx.operationId,
                        reason: input.reason,
                        reviewedDigest: input.impactDigest,
                        reviewedVersions: {
                          left: impact.left.version,
                          right: impact.right.version,
                        },
                        resultingVersions: { left: after.left.version, right: after.right.version },
                      },
                    },
                  })
                  .where(eq(mergeRecords.id, merge.record.id));
                const result: DuplicateReceipt = {
                  kind: "duplicate_receipt_v1",
                  action: "reverse",
                  mergeId: merge.record.id,
                  ...merge.pair,
                  survivor: merge.record.survivorId,
                  alias: merge.record.mergedId,
                  aliasMap: [],
                  recordedAt: reversedAt.toISOString(),
                  decisionReason: input.reason,
                  reviewedVersions: { left: impact.left.version, right: impact.right.version },
                  resultingVersions: { left: after.left.version, right: after.right.version },
                  reviewedDigest: input.impactDigest,
                  referenceDigest: after.referenceDigest,
                  preservedReferenceCount: after.references.length,
                  permissionChanges: [],
                };
                await recordIdentityChange(ctx, merge.pair, result);
                return result;
              },
            ),
          };
        } catch (error) {
          if (isAppError(error)) return { ok: false as const, error };
          throw error;
        }
      },
      { isolationLevel: "serializable" },
    );
    if (!settled.ok) throw settled.error;
    return settled.result;
  } catch (error) {
    return transactionError(error);
  }
}

export async function readDuplicateReceipt(db: Executor, session: Session, id: string) {
  const live = await liveStaff(db, session);
  if (!z.uuid().safeParse(id).success) throw new AppError("not_found");
  const [operation] = await db
    .select()
    .from(operations)
    .where(
      and(
        eq(operations.id, id),
        eq(operations.actorKind, "staff"),
        eq(operations.actorId, live.actor.id),
        inArray(operations.operationType, ["duplicate.merge", "duplicate.reverse"]),
        eq(operations.status, "succeeded"),
      ),
    );
  const parsed = receiptSchema.safeParse(operation?.outcome);
  if (!operation || !parsed.success) throw new AppError("not_found");
  const receipt = parsed.data;
  const merge = await readMergeRecord(db, receipt.mergeId);
  if (
    receipt.subject !== merge.pair.subject ||
    receipt.left !== merge.pair.left ||
    receipt.right !== merge.pair.right
  )
    throw new AppError("not_found");
  const current = await authorize(db, live, merge.pair);
  return {
    operationId: operation.id,
    receipt,
    ...merge,
    impact: reversalHolds(current.impact, merge),
  };
}

/** Exact-key reconciliation never executes a command or treats an in-flight transaction as absent. */
export async function duplicateOperationStatus(
  db: Executor,
  session: Session,
  raw: unknown,
  action: "merge" | "reverse",
  key: string,
  mergeId = "",
) {
  const pair = parseInput(duplicatePairSchema, raw);
  const { live } = await authorize(db, session, pair);
  if (!isIssuedFormOperation(duplicateOperationScope(live.account.id, action, pair, mergeId), key))
    throw new AppError("not_found");
  return db.transaction(async (tx) => {
    const lockKey = JSON.stringify([live.actor.kind, live.actor.id, `duplicate.${action}`, key]);
    const [lock] = await tx.execute<{ locked: boolean }>(
      sql`select pg_try_advisory_xact_lock(hashtextextended(${lockKey}, 0)) as locked`,
    );
    if (!lock?.locked) return { state: "unknown" as const };
    const [operation] = await tx
      .select()
      .from(operations)
      .where(
        and(
          eq(operations.actorKind, live.actor.kind),
          eq(operations.actorId, live.actor.id),
          eq(operations.operationType, `duplicate.${action}`),
          eq(operations.idempotencyKey, key),
        ),
      );
    if (!operation) return { state: "absent" as const };
    if (operation.status === "succeeded") {
      const current = await readDuplicateReceipt(tx, live, operation.id);
      if (
        current.receipt.subject !== pair.subject ||
        current.receipt.left !== pair.left ||
        current.receipt.right !== pair.right ||
        (mergeId && current.receipt.mergeId !== mergeId)
      )
        throw new AppError("not_found");
      return { state: "succeeded" as const, id: operation.id };
    }
    return { state: operation.status === "failed" ? ("failed" as const) : ("unknown" as const) };
  });
}
