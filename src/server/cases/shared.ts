import "server-only";
import { and, eq, gt, isNull, lte, or, type SQL, sql } from "drizzle-orm";
import { z } from "zod";
import { caseParticipants, cases } from "@/db/schema";
import type { Capability } from "@/domain/capabilities";
import { recordActivity } from "../activity";
import { recordAudit } from "../audit";
import { requireLiveSession, type Session } from "../auth/sessions";
import { assertCan, assertCanRead, resolveGrants } from "../authz";
import type { Executor } from "../db";
import { AppError } from "../errors";
import { recordOutboxEvent } from "../jobs/outbox";
import type { OperationContext } from "../operations";
import { liveStaff } from "../work/shared";

export async function liveUser(db: Executor, session: Session) {
  const current = await requireLiveSession(db, session);
  return current.account.kind === "staff" ? liveStaff(db, current) : current;
}
export const liveParticipation = (now = new Date()) =>
  and(
    isNull(caseParticipants.revokedAt),
    lte(caseParticipants.validFrom, now),
    or(isNull(caseParticipants.expiresAt), gt(caseParticipants.expiresAt, now)),
  );
export async function caseVisibility(db: Executor, session: Session): Promise<SQL> {
  const current = await liveUser(db, session);
  const capability = current.account.kind === "staff" ? "case.read" : "portal.case.read";
  const grants = await resolveGrants(db, current.actor);
  const clauses = grants
    .filter((g) => g.capability === capability)
    .flatMap(({ scope }) => {
      if (scope?.locales || (scope?.recordType && scope.recordType !== "case")) return [];
      return [scope?.recordId ? eq(cases.id, scope.recordId) : sql`true`];
    });
  return or(...clauses) ?? sql`false`;
}

export async function caseFor(
  db: Executor,
  session: Session,
  id: string,
  capability?: Capability,
  lock = false,
) {
  if (!z.uuid().safeParse(id).success) throw new AppError("not_found");
  const live = await liveUser(db, session);
  const query = db.select().from(cases).where(eq(cases.id, id));
  const [row] = await (lock ? query.for("update") : query);
  if (!row) throw new AppError("not_found");
  const resource = { type: "case", id, audience: "case_participants" as const };
  await assertCanRead(
    db,
    live.actor,
    live.account.kind === "staff" ? "case.read" : "portal.case.read",
    resource,
  );
  if (capability) await assertCan(db, live.actor, capability, resource);
  return { row, live, resource };
}

export async function caseEvent(
  ctx: OperationContext,
  type: string,
  id: string,
  action: string,
  capability: Capability,
  params: Record<string, unknown> = {},
  audience: "internal" | "participants" = "internal",
) {
  await recordActivity(ctx.tx, {
    recordType: type,
    recordId: id,
    messageKey: action,
    summary: action,
    params,
    audience,
    actor: ctx.actor,
    operationId: ctx.operationId,
  });
  await recordAudit(ctx.tx, {
    action,
    recordType: type,
    recordId: id,
    capability,
    actor: ctx.actor,
    operationId: ctx.operationId,
    payload: params,
  });
  await recordOutboxEvent(ctx.tx, {
    eventType: action,
    subjectType: type,
    subjectId: id,
    operationId: ctx.operationId,
  });
}

export async function bumpCase(
  db: Executor,
  id: string,
  expectedVersion: number,
  patch: Partial<typeof cases.$inferInsert> = {},
) {
  const changed = await db
    .update(cases)
    .set({ ...patch, version: sql`${cases.version} + 1`, updatedAt: new Date() })
    .where(and(eq(cases.id, id), eq(cases.version, expectedVersion)))
    .returning({ id: cases.id });
  if (!changed.length) throw new AppError("version_conflict");
}
