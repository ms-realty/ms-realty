// O23 / UX18: explicit absence and return retain commitments and identity authority.
import "server-only";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { principals, staffMemberships } from "@/db/schema";
import { recordAudit } from "../audit";
import { hashRequest } from "../crypto";
import type { Executor } from "../db";
import { AppError } from "../errors";
import { runOperation } from "../operations";
import { agencyCoverageQueue } from "../work/coverage-policy";
import { parseInput } from "../work/shared";
import { ensureUsableManager, lockStaff, offboardingOperator, retainedWork } from "./grants";
import type { Session } from "./sessions";

export async function readStaffAbsence(db: Executor, session: Session, id: string) {
  await offboardingOperator(db, session);
  id = parseInput(z.uuid(), id);
  const [person] = await db
    .select({
      id: principals.id,
      name: principals.displayName,
      email: principals.email,
      state: staffMemberships.state,
      version: staffMemberships.version,
      absenceFrom: staffMemberships.absenceFrom,
      reviewAt: staffMemberships.absenceReviewAt,
    })
    .from(principals)
    .innerJoin(staffMemberships, eq(staffMemberships.principalId, principals.id))
    .where(and(eq(principals.id, id), eq(principals.kind, "staff")));
  if (!person) throw new AppError("not_found");
  return { person, retained: await retainedWork(db, id) };
}

const schema = z.object({
  operationId: z.string().min(16).max(200),
  principalId: z.uuid(),
  expectedRevision: z.int().positive(),
  action: z.enum(["schedule", "return"]),
  startsAt: z.iso.datetime({ offset: true }).nullable(),
  reviewAt: z.iso.datetime({ offset: true }).nullable(),
  reason: z.string().trim().min(10).max(1000),
  reviewed: z.literal(true),
});
export async function changeStaffAbsence(db: Executor, session: Session, raw: unknown) {
  const input = parseInput(schema, raw);
  const live = await offboardingOperator(db, session);
  return runOperation(
    db,
    {
      actor: live.actor,
      type: "access.staff.absence",
      idempotencyKey: input.operationId,
      requestHash: hashRequest(input),
      expectedVersion: input.expectedRevision,
    },
    async ({ tx, operationId }) => {
      await lockStaff(tx);
      await offboardingOperator(tx, session);
      const [membership] = await tx
        .select()
        .from(staffMemberships)
        .where(eq(staffMemberships.principalId, input.principalId))
        .for("update");
      if (!membership) throw new AppError("not_found");
      if (membership.version !== input.expectedRevision) throw new AppError("version_conflict");
      if (membership.state !== "active") throw new AppError("transition_denied");
      const now = new Date();
      let absenceFrom: Date | null = null,
        absenceReviewAt: Date | null = null;
      if (input.action === "schedule") {
        if (membership.absenceFrom) throw new AppError("transition_denied");
        absenceFrom = input.startsAt ? new Date(input.startsAt) : now;
        absenceReviewAt = input.reviewAt ? new Date(input.reviewAt) : null;
        if (absenceFrom < now || !absenceReviewAt || absenceReviewAt <= absenceFrom)
          throw new AppError("validation_failed");
      } else if (!membership.absenceFrom || input.startsAt || input.reviewAt)
        throw new AppError("transition_denied");
      await tx
        .update(staffMemberships)
        .set({ absenceFrom, absenceReviewAt, version: membership.version + 1, updatedAt: now })
        .where(eq(staffMemberships.id, membership.id));
      await ensureUsableManager(tx);
      const retained = await retainedWork(tx, input.principalId);
      await recordAudit(tx, {
        actor: live.actor,
        capability: "access.grant",
        action: `access.staff.absence.${input.action}`,
        recordType: "principal",
        recordId: input.principalId,
        operationId,
        payload: {
          reason: input.reason,
          previousFrom: membership.absenceFrom?.toISOString() ?? null,
          absenceFrom: absenceFrom?.toISOString() ?? null,
          reviewAt: absenceReviewAt?.toISOString() ?? null,
          retained,
          coverageQueue: agencyCoverageQueue,
        },
      });
      return {
        principalId: input.principalId,
        action: input.action,
        absenceFrom: absenceFrom?.toISOString() ?? null,
        reviewAt: absenceReviewAt?.toISOString() ?? null,
        coverageQueue: agencyCoverageQueue,
        retained,
      };
    },
  );
}
