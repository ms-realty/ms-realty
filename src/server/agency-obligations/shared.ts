import "server-only";
import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { agencyEvidenceHistory, caseParticipants, operations, parties } from "@/db/schema";
import { recordAudit } from "../audit";
import { requireFreshAuth, type Session } from "../auth/sessions";
import { assertCanRead } from "../authz";
import { caseFor, liveParticipation } from "../cases/shared";
import type { Executor, Transaction } from "../db";
import { AppError, isAppError } from "../errors";
import { documentAccess } from "../files/access";
import type { OperationContext } from "../operations";
import { readContact } from "../work/queries";
import { liveStaff } from "../work/shared";

export async function agencyStaff(
  db: Executor,
  session: Session,
  caseId?: string | null,
  documentVersionId?: string | null,
  fresh = false,
) {
  const live = await liveStaff(db, session);
  if (fresh) requireFreshAuth(live);
  if (caseId) await caseFor(db, live, caseId);
  const file = documentVersionId ? await documentAccess(db, live, documentVersionId) : null;
  if (file?.document.caseId) await caseFor(db, live, file.document.caseId);
  const resource = caseId
    ? { type: "case", id: caseId, audience: "internal" as const }
    : {
        type: "document",
        id: file?.document.id,
        audience: "internal" as const,
      };
  await assertCanRead(db, live.actor, "compliance.review", resource);
  return { live, resource, file };
}

/** No invented partner Case: a standing counterparty can use its ordinary contact path. */
export async function counterpartyFor(
  db: Executor,
  session: Session,
  partyId: string,
  caseId?: string | null,
) {
  if (caseId) {
    await caseFor(db, session, caseId);
    const [link] = await db
      .select({ id: caseParticipants.id })
      .from(caseParticipants)
      .where(
        and(
          eq(caseParticipants.caseId, caseId),
          eq(caseParticipants.partyId, partyId),
          liveParticipation(),
        ),
      );
    if (link) {
      const [party] = await db.select().from(parties).where(eq(parties.id, partyId));
      if (party && !party.mergedIntoPartyId) return party;
      throw new AppError("not_found");
    }
  }
  const { party } = await readContact(db, session, partyId);
  if (party.mergedIntoPartyId) throw new AppError("not_found");
  return party;
}

/** A persisted original binding can preserve historical evidence, never positive use. No
 * canonical-party lookup or new customer scope is conferred by an identity merge. */
export async function retainedCounterpartyFor(
  db: Executor,
  session: Session,
  source: {
    counterpartyPartyId: string;
    caseId: string | null;
    documentVersionId: string | null;
  },
) {
  try {
    return await counterpartyFor(db, session, source.counterpartyPartyId, source.caseId);
  } catch (error) {
    if (!isAppError(error) || error.code !== "not_found") throw error;
    const [original] = await db
      .select()
      .from(parties)
      .where(eq(parties.id, source.counterpartyPartyId));
    if (!original?.mergedIntoPartyId) throw error;
    if (source.caseId) {
      await caseFor(db, session, source.caseId);
      return original;
    }
    if (source.documentVersionId) {
      await documentAccess(db, session, source.documentVersionId);
      return original;
    }
    // This only works while an original inquiry/contact path is still currently readable.
    // A text-only standing record without that bridge requires a B04 merge hold.
    return (await readContact(db, session, source.counterpartyPartyId)).party;
  }
}

export async function agencyHistory<T extends { id: string }>(
  ctx: OperationContext,
  recordType: "partner_terms" | "case_review",
  row: T,
  action: string,
) {
  await ctx.tx.insert(agencyEvidenceHistory).values({
    recordType,
    recordId: row.id,
    snapshot: JSON.parse(JSON.stringify(row)),
    actorKind: ctx.actor.kind,
    actorId: ctx.actor.id,
    action,
    operationId: ctx.operationId,
  });
  await recordAudit(ctx.tx, {
    actor: ctx.actor,
    action: `agency.${recordType}.${action}`,
    recordType,
    recordId: row.id,
    operationId: ctx.operationId,
    payload: {},
  });
}

export async function evidenceHistory(
  db: Executor,
  type: "partner_terms" | "case_review",
  id: string,
) {
  return db
    .select()
    .from(agencyEvidenceHistory)
    .where(and(eq(agencyEvidenceHistory.recordType, type), eq(agencyEvidenceHistory.recordId, id)))
    .orderBy(desc(agencyEvidenceHistory.createdAt), desc(agencyEvidenceHistory.id))
    .limit(50);
}

/** A changed key cannot bypass a still unresolved consequential command on this record. */
export async function agencyPendingFence(
  db: Executor,
  session: Session,
  type: string,
  subject: { type: string; id: string },
  key: string,
) {
  const lockKey = `agency-command:${session.actor.kind}:${session.actor.id}:${type}:${subject.type}:${subject.id}`;
  const [lock] = await db.execute<{ locked: boolean }>(
    sql`select pg_try_advisory_xact_lock(hashtextextended(${lockKey}, 0)) as locked`,
  );
  if (!lock?.locked) throw new AppError("operation_pending");
  const [unresolved] = await db
    .select({ status: operations.status, key: operations.idempotencyKey })
    .from(operations)
    .where(
      and(
        eq(operations.actorKind, session.actor.kind),
        eq(operations.actorId, session.actor.id),
        eq(operations.operationType, type),
        eq(operations.resultType, subject.type),
        eq(operations.resultId, subject.id),
        ne(operations.idempotencyKey, key),
        inArray(operations.status, ["in_progress", "outcome_unknown"]),
      ),
    );
  if (unresolved)
    throw new AppError(
      unresolved.status === "outcome_unknown" ? "outcome_unknown" : "operation_pending",
      { current: { operationKey: unresolved.key } },
    );
}

/** runOperation persists known failures in its savepoint. Commit that receipt before
 * rethrowing; an outer transaction must not silently erase the reconciliation result. */
export async function retainedAgencyTransaction<T>(
  db: Executor,
  fn: (tx: Transaction) => Promise<T>,
): Promise<T> {
  const settled = await db.transaction(async (tx) => {
    try {
      return { ok: true as const, value: await fn(tx) };
    } catch (error) {
      if (!isAppError(error)) throw error;
      return { ok: false as const, error };
    }
  });
  if (!settled.ok) throw settled.error;
  return settled.value;
}
