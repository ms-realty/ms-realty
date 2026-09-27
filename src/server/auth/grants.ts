// O23: explicit grants are human, capability-scoped, step-up protected and receipt-backed.
import "server-only";
import { and, eq, gt, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { grants, principals, staffMemberships } from "@/db/schema";
import { type Capability, capabilities, hasCapability, rolePresets } from "@/domain/capabilities";
import { type PublicLocale, publicLocales } from "@/domain/ids";
import { recordAudit } from "../audit";
import { can, resolveGrants } from "../authz";
import { hashRequest } from "../crypto";
import type { Executor } from "../db";
import { AppError } from "../errors";
import { runOperation } from "../operations";
import { countActivePasskeys, staffPasskeyMinimum } from "./passkeys";
import { requireFreshAuth, requireLiveSession, revokeAllSessions, type Session } from "./sessions";

const scopeSchema = z
  .object({
    recordType: z.enum(["document", "listing", "property", "case"]).nullable(),
    recordId: z.uuid().nullable(),
    locales: z.array(z.enum(publicLocales)).max(7).nullable(),
    expiresAt: z.iso.datetime().nullable(),
  })
  .refine((scope) => Boolean(scope.recordId) === Boolean(scope.recordType), {
    message: "A record scope needs its type and identity.",
  });
type Scope = z.infer<typeof scopeSchema>;
function parse<T>(schema: z.ZodType<T>, input: unknown) {
  const result = schema.safeParse(input);
  if (!result.success) throw new AppError("validation_failed");
  return result.data;
}
async function liveManager(db: Executor, session: Session) {
  session = await requireLiveSession(db, session);
  requireFreshAuth(session);
  if (
    session.actor.kind !== "staff" ||
    (await countActivePasskeys(db, session.actor.id)) < staffPasskeyMinimum
  )
    throw new AppError("forbidden");
  return session;
}
async function authority(
  db: Executor,
  session: Session,
  scope: Scope,
  capability: Capability,
  creating: boolean,
) {
  await liveManager(db, session);
  if (await can(db, session.actor, "access.grant")) return;
  if (!scope.recordType || !scope.recordId) throw new AppError("forbidden");
  const owned = await resolveGrants(db, session.actor);
  for (const locale of scope.locales?.length ? scope.locales : [undefined]) {
    const context = {
      recordType: scope.recordType,
      recordId: scope.recordId,
      ...(locale ? { locale } : {}),
      now: new Date().toISOString(),
    };
    for (const needed of ["access.grant", capability] as const) {
      const permitted = owned.some(
        (grant) =>
          hasCapability(session.actor, [grant], needed, context) &&
          (!creating ||
            !grant.scope?.expiresAt ||
            (scope.expiresAt !== null && scope.expiresAt <= grant.scope.expiresAt)),
      );
      if (!permitted) throw new AppError("forbidden");
    }
  }
}
async function activeStaff(db: Executor, id: string) {
  const [person] = await db
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
  if (!person) throw new AppError("not_found");
}
async function lockStaff(db: Executor) {
  await db.execute(
    sql`select pg_advisory_xact_lock(hashtextextended('staff-capability-management', 0))`,
  );
  // Recovery also locks principals; these locks keep a concurrent recovery from removing
  // the last usable access manager while a revocation is being checked.
  await db
    .select({ id: principals.id })
    .from(principals)
    .where(eq(principals.kind, "staff"))
    .orderBy(principals.id)
    .for("update");
}
async function ensureUsableManager(db: Executor) {
  const staff = await db
    .select({ id: principals.id })
    .from(principals)
    .innerJoin(staffMemberships, eq(staffMemberships.principalId, principals.id))
    .where(
      and(
        eq(principals.kind, "staff"),
        eq(principals.status, "active"),
        eq(staffMemberships.state, "active"),
      ),
    );
  for (const person of staff)
    if (
      (await can(db, { kind: "staff", id: person.id }, "access.grant")) &&
      (await countActivePasskeys(db, person.id)) >= staffPasskeyMinimum
    )
      return;
  throw new AppError("transition_denied", {
    detail: "Keep another usable access manager before revoking this grant",
  });
}
const inputSchema = z.object({
  operationId: z.string().min(8).max(160),
  principalId: z.uuid(),
  capability: z.enum(capabilities),
  reason: z.string().trim().min(10).max(1000),
  scope: scopeSchema,
});
export async function grantStaffCapability(db: Executor, session: Session, input: unknown) {
  const value = parse(inputSchema, input);
  if (value.scope.expiresAt && new Date(value.scope.expiresAt) <= new Date())
    throw new AppError("validation_failed");
  await authority(db, session, value.scope, value.capability, true);
  await activeStaff(db, value.principalId);
  return runOperation(
    db,
    {
      actor: session.actor,
      type: "access.capability.grant",
      idempotencyKey: value.operationId,
      requestHash: hashRequest(value),
    },
    async ({ tx, operationId }) => {
      await lockStaff(tx);
      await authority(tx, session, value.scope, value.capability, true);
      await activeStaff(tx, value.principalId);
      const [grant] = await tx
        .insert(grants)
        .values({
          principalId: value.principalId,
          capability: value.capability,
          recordType: value.scope.recordType,
          recordId: value.scope.recordId,
          locales: value.scope.locales?.length ? value.scope.locales : null,
          expiresAt: value.scope.expiresAt ? new Date(value.scope.expiresAt) : null,
          reason: value.reason,
          grantedById: session.actor.id,
        })
        .returning({ id: grants.id });
      if (!grant) throw new Error("Grant insert failed");
      const revokedSessions = await revokeAllSessions(tx, { kind: "staff", id: value.principalId });
      await recordAudit(tx, {
        actor: session.actor,
        capability: "access.grant",
        action: "access.capability.granted",
        recordType: "principal",
        recordId: value.principalId,
        operationId,
        payload: {
          grantId: grant.id,
          capability: value.capability,
          scope: value.scope,
          reason: value.reason,
          revokedSessions,
        },
      });
      return { grantId: grant.id, principalId: value.principalId };
    },
  );
}
export async function revokeStaffGrant(db: Executor, session: Session, input: unknown) {
  const value = parse(
    z.object({
      operationId: z.string().min(8).max(160),
      grantId: z.uuid(),
      expectedRevision: z.int().positive(),
      reason: z.string().trim().min(10).max(1000),
    }),
    input,
  );
  const [existing] = await db.select().from(grants).where(eq(grants.id, value.grantId));
  if (!existing?.principalId) throw new AppError("not_found");
  const principalId = existing.principalId;
  const scope: Scope = {
    recordType: existing.recordType as Scope["recordType"],
    recordId: existing.recordId,
    locales: existing.locales as PublicLocale[] | null,
    expiresAt: existing.expiresAt?.toISOString() ?? null,
  };
  const affected = existing.capability
    ? [existing.capability]
    : existing.role
      ? rolePresets[existing.role]
      : [];
  for (const capability of affected) await authority(db, session, scope, capability, false);
  return runOperation(
    db,
    {
      actor: session.actor,
      type: "access.capability.revoke",
      idempotencyKey: value.operationId,
      requestHash: hashRequest(value),
    },
    async ({ tx, operationId }) => {
      await lockStaff(tx);
      for (const capability of affected) await authority(tx, session, scope, capability, false);
      const [grant] = await tx
        .select()
        .from(grants)
        .where(eq(grants.id, value.grantId))
        .for("update");
      if (!grant || grant.revokedAt || grant.version !== value.expectedRevision)
        throw new AppError("version_conflict");
      await tx
        .update(grants)
        .set({ revokedAt: new Date(), revokedById: session.actor.id, version: grant.version + 1 })
        .where(eq(grants.id, grant.id));
      await ensureUsableManager(tx);
      const revokedSessions = await revokeAllSessions(tx, {
        kind: "staff",
        id: principalId,
      });
      await recordAudit(tx, {
        actor: session.actor,
        capability: "access.grant",
        action: "access.capability.revoked",
        recordType: "principal",
        recordId: principalId,
        operationId,
        payload: { grantId: grant.id, reason: value.reason, revokedSessions },
      });
      return { grantId: grant.id, principalId };
    },
  );
}

export async function listStaffGrants(db: Executor, session: Session) {
  await liveManager(db, session);
  if (!(await can(db, session.actor, "access.grant"))) throw new AppError("forbidden");
  return db
    .select({ grant: grants, name: principals.displayName, email: principals.email })
    .from(grants)
    .innerJoin(principals, eq(principals.id, grants.principalId))
    .where(
      and(
        eq(principals.kind, "staff"),
        isNull(grants.revokedAt),
        or(isNull(grants.expiresAt), gt(grants.expiresAt, new Date())),
      ),
    )
    .orderBy(principals.displayName);
}
