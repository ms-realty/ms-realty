import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { operations, principals } from "@/db/schema";
import { recordAudit } from "../audit";
import { hashRequest } from "../crypto";
import type { Executor } from "../db";
import { AppError } from "../errors";
import { runOperation } from "../operations";
import { countActivePasskeys, staffPasskeyMinimum } from "./passkeys";
import { requireLiveSession, type Session } from "./sessions";

export const profileOperation = "staff.profile.update";
export type ProfileValues = { displayName: string };
export const profileName = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .refine((name) => !/[\p{Cc}\p{Zl}\p{Zp}]/u.test(name));
const inputSchema = z
  .object({
    displayName: profileName,
    operationId: z.string().min(16).max(200),
    expectedVersion: z.number().int().positive().safe(),
  })
  .strict();
const savedSchema = z.object({
  principalId: z.uuid(),
  version: z.number().int().positive(),
  displayName: z.string(),
});

async function currentProfileSession(db: Executor, session: Session) {
  const live = await requireLiveSession(db, session);
  if (live.account.kind !== "staff") throw new AppError("not_found");
  const passkeys = await countActivePasskeys(db, live.account.id);
  if (passkeys < staffPasskeyMinimum) throw new AppError("forbidden");
  return { live, passkeys };
}

export async function readStaffProfile(db: Executor, session: Session) {
  const { live, passkeys } = await currentProfileSession(db, session);
  const [profile] = await db
    .select({
      id: principals.id,
      displayName: principals.displayName,
      email: principals.email,
      version: principals.version,
    })
    .from(principals)
    .where(eq(principals.id, live.account.id));
  if (!profile) throw new AppError("not_found");
  return { ...profile, passkeys };
}

/** Only the current staff principal's display name can change. Email and authority are absent. */
export async function saveStaffProfile(db: Executor, session: Session, raw: unknown) {
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success)
    throw new AppError("validation_failed", { fieldErrors: { displayName: ["invalid_name"] } });
  const input = parsed.data;
  const { live } = await currentProfileSession(db, session);
  return runOperation(
    db,
    {
      actor: live.actor,
      type: profileOperation,
      idempotencyKey: input.operationId,
      requestHash: hashRequest({ ...input, principalId: live.account.id }),
      expectedVersion: input.expectedVersion,
      subject: { type: "principal", id: live.account.id },
    },
    async ({ tx, operationId }) => {
      const [before] = await tx
        .select()
        .from(principals)
        .where(eq(principals.id, live.account.id))
        .for("update");
      const { live: current } = await currentProfileSession(tx, live);
      if (before?.kind !== "staff" || before.status !== "active") throw new AppError("not_found");
      if (before.version !== input.expectedVersion)
        throw new AppError("version_conflict", {
          current: { revision: before.version, values: { displayName: before.displayName } },
        });
      const [saved] = await tx
        .update(principals)
        .set({ displayName: input.displayName, version: sql`${principals.version} + 1` })
        .where(
          and(eq(principals.id, current.account.id), eq(principals.version, input.expectedVersion)),
        )
        .returning({
          principalId: principals.id,
          version: principals.version,
          displayName: principals.displayName,
        });
      if (!saved) throw new AppError("version_conflict");
      await recordAudit(tx, {
        actor: current.actor,
        action: profileOperation,
        recordType: "principal",
        recordId: saved.principalId,
        operationId,
        payload: {
          fields: ["displayName"],
          beforeVersion: before.version,
          afterVersion: saved.version,
        },
      });
      return saved;
    },
  );
}

/** Read-only reconciliation is bound to the live caller and this exact submitted operation. */
export async function readStaffProfileOperation(db: Executor, session: Session, key: string) {
  if (!key || key.length > 200) throw new AppError("not_found");
  const { live } = await currentProfileSession(db, session);
  const [operation] = await db
    .select({
      id: operations.id,
      status: operations.status,
      outcome: operations.outcome,
      completedAt: operations.completedAt,
    })
    .from(operations)
    .where(
      and(
        eq(operations.actorKind, "staff"),
        eq(operations.actorId, live.account.id),
        eq(operations.operationType, profileOperation),
        eq(operations.idempotencyKey, key),
      ),
    );
  if (!operation) return null;
  const saved = savedSchema.safeParse(operation.outcome);
  if (
    operation.status === "succeeded" &&
    (!saved.success || saved.data.principalId !== live.account.id || !operation.completedAt)
  )
    throw new AppError("outcome_unknown");
  return {
    id: operation.id,
    status: operation.status,
    completedAt: operation.completedAt,
    saved: saved.success ? saved.data : null,
  };
}
