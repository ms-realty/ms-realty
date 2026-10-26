// O24/F30: permissioned drafts and explicit human approval; no provider or launch authority.
import "server-only";
import { and, desc, eq, lte, sql } from "drizzle-orm";
import { z } from "zod";
import {
  operatingPolicyDrafts,
  operatingPolicyVersions,
  principals,
  servicePolicies,
  staffMemberships,
} from "@/db/schema";
import {
  emptyOperatingPolicy,
  type OperatingPolicySnapshot,
  operatingPolicyId,
  operatingPolicySchema,
  policyEffects,
} from "@/domain/operating-policy";
import { recordAudit } from "../audit";
import { requireFreshAuth, type Session } from "../auth/sessions";
import { assertCan } from "../authz";
import { hashRequest } from "../crypto";
import type { Executor } from "../db";
import { AppError } from "../errors";
import { recordOutboxEvent } from "../jobs/outbox";
import { findOperation, type OperationContext, runOperation } from "../operations";
import { liveStaff, parseInput, version } from "../work/shared";

export const policyResource = {
  type: "operating_policy",
  id: operatingPolicyId,
  audience: "internal" as const,
};
const envelope = {
  operationId: z.string().min(16).max(200),
  expectedVersion: z.number().int().positive(),
};
const saveSchema = z.object({ ...envelope, document: operatingPolicySchema });
const approveSchema = z.object({
  ...envelope,
  expectedHash: z.string().regex(/^[a-f0-9]{64}$/),
  reviewed: z.literal(true),
  note: z.string().trim().min(10).max(1500),
});
export type SaveOperatingPolicy = z.input<typeof saveSchema>;
export type ApproveOperatingPolicy = z.input<typeof approveSchema>;

async function authorize(db: Executor, session: Session) {
  const live = await liveStaff(db, session);
  await assertCan(db, live.actor, "settings.manage", policyResource);
  return live;
}
async function lock(db: Executor) {
  await db.execute(
    sql`select pg_advisory_xact_lock(hashtextextended('agency-operating-policy', 0))`,
  );
}
async function draftFor(db: Executor) {
  const [row] = await db
    .select()
    .from(operatingPolicyDrafts)
    .where(eq(operatingPolicyDrafts.id, operatingPolicyId));
  const parsed = operatingPolicySchema.safeParse(row?.document);
  return {
    version: row?.version ?? 1,
    document: parsed.success ? parsed.data : emptyOperatingPolicy,
    contentHash: row?.contentHash ?? null,
    updatedAt: row?.updatedAt ?? null,
  };
}
export async function readOperatingPolicy(db: Executor, session: Session) {
  await authorize(db, session);
  const [draft, history, owners] = await Promise.all([
    draftFor(db),
    db
      .select({
        id: operatingPolicyVersions.id,
        policyVersion: operatingPolicyVersions.policyVersion,
        draftRevision: operatingPolicyVersions.draftRevision,
        contentHash: operatingPolicyVersions.contentHash,
        document: operatingPolicyVersions.document,
        approvedAt: operatingPolicyVersions.approvedAt,
        approvedById: operatingPolicyVersions.approvedById,
        approvalNote: operatingPolicyVersions.approvalNote,
        operationId: operatingPolicyVersions.operationId,
      })
      .from(operatingPolicyVersions)
      .orderBy(desc(operatingPolicyVersions.policyVersion))
      .limit(12),
    db
      .select({ id: principals.id, displayName: principals.displayName })
      .from(principals)
      .innerJoin(staffMemberships, eq(principals.id, staffMemberships.principalId))
      .where(
        and(
          eq(principals.kind, "staff"),
          eq(principals.status, "active"),
          eq(staffMemberships.state, "active"),
        ),
      )
      .orderBy(principals.displayName)
      .limit(100),
  ]);
  return { draft, history, owners, effects: policyEffects(draft.document) };
}

export async function readOperatingPolicyVersion(db: Executor, session: Session, number: number) {
  await authorize(db, session);
  parseInput(z.number().int().positive().safe(), number);
  const [row] = await db
    .select()
    .from(operatingPolicyVersions)
    .where(eq(operatingPolicyVersions.policyVersion, number))
    .limit(1);
  if (!row) throw new AppError("not_found");
  return row;
}

/** Intake binds a value, never a pointer to mutable settings. Legacy policies are unreviewed. */
export async function captureOperatingPolicy(
  db: Executor,
  at: Date = new Date(),
  projectionId?: string,
): Promise<OperatingPolicySnapshot> {
  const [row] = await db
    .select()
    .from(operatingPolicyVersions)
    .where(
      and(
        lte(operatingPolicyVersions.approvedAt, at),
        projectionId ? eq(operatingPolicyVersions.servicePolicyId, projectionId) : undefined,
      ),
    )
    .orderBy(desc(operatingPolicyVersions.policyVersion))
    .limit(1);
  if (!row)
    return {
      kind: "operating_policy_unknown_v1",
      reason: projectionId ? "legacy_policy" : "no_reviewed_policy",
    };
  const parsed = operatingPolicySchema.safeParse(row.document);
  if (!parsed.success || hashRequest(parsed.data) !== row.contentHash)
    return { kind: "operating_policy_unknown_v1", reason: "invalid_reviewed_policy" };
  return {
    kind: "approved_operating_policy_v1",
    policyId: row.id,
    policyVersion: row.policyVersion,
    contentHash: row.contentHash,
    approvedAt: row.approvedAt.toISOString(),
    document: parsed.data,
  };
}

async function history(
  ctx: OperationContext,
  event: "draft_saved" | "approved",
  version: number,
  contentHash: string,
  policyVersion?: number,
) {
  await recordAudit(ctx.tx, {
    actor: ctx.actor,
    action: `operating_policy.${event}`,
    recordType: policyResource.type,
    recordId: operatingPolicyId,
    capability: "settings.manage",
    operationId: ctx.operationId,
    payload: { revision: version, contentHash, ...(policyVersion ? { policyVersion } : {}) },
  });
  await recordOutboxEvent(ctx.tx, {
    eventType: `operating_policy.${event}`,
    subjectType: policyResource.type,
    subjectId: operatingPolicyId,
    operationId: ctx.operationId,
    payload: { revision: version, ...(policyVersion ? { policyVersion } : {}) },
  });
}

export async function saveOperatingPolicy(
  db: Executor,
  session: Session,
  raw: SaveOperatingPolicy,
) {
  const input = parseInput(saveSchema, raw),
    live = await authorize(db, session);
  return runOperation(
    db,
    {
      actor: live.actor,
      type: "operating_policy.save",
      idempotencyKey: input.operationId,
      requestHash: hashRequest(input),
      expectedVersion: input.expectedVersion,
      subject: policyResource,
    },
    async (ctx) => {
      await authorize(ctx.tx, session);
      await lock(ctx.tx);
      const draft = await draftFor(ctx.tx);
      version(draft, input.expectedVersion);
      const contentHash = hashRequest(input.document),
        revision = draft.version + 1;
      await ctx.tx
        .insert(operatingPolicyDrafts)
        .values({
          id: operatingPolicyId,
          version: revision,
          document: input.document,
          contentHash,
          updatedById: live.account.id,
        })
        .onConflictDoUpdate({
          target: operatingPolicyDrafts.id,
          set: {
            document: input.document,
            contentHash,
            version: revision,
            updatedById: live.account.id,
            updatedAt: new Date(),
          },
        });
      await history(ctx, "draft_saved", revision, contentHash);
      return {
        id: operatingPolicyId,
        version: revision,
        contentHash,
        recordedAt: new Date().toISOString(),
      };
    },
  );
}

export async function approveOperatingPolicy(
  db: Executor,
  session: Session,
  raw: ApproveOperatingPolicy,
) {
  const input = parseInput(approveSchema, raw),
    live = await authorize(db, session);
  requireFreshAuth(live);
  return runOperation(
    db,
    {
      actor: live.actor,
      type: "operating_policy.approve",
      idempotencyKey: input.operationId,
      requestHash: hashRequest(input),
      expectedVersion: input.expectedVersion,
      subject: policyResource,
    },
    async (ctx) => {
      const current = await authorize(ctx.tx, session);
      requireFreshAuth(current);
      await lock(ctx.tx);
      const draft = await draftFor(ctx.tx);
      version(draft, input.expectedVersion);
      if (
        !draft.contentHash ||
        draft.contentHash !== input.expectedHash ||
        hashRequest(draft.document) !== input.expectedHash
      )
        throw new AppError("approval_stale");
      for (const owner of new Set(
        Object.values(draft.document.responsibilities).filter((id): id is string => id !== null),
      )) {
        const [active] = await ctx.tx
          .select({ id: principals.id })
          .from(principals)
          .innerJoin(staffMemberships, eq(principals.id, staffMemberships.principalId))
          .where(
            and(
              eq(principals.id, owner),
              eq(principals.kind, "staff"),
              eq(principals.status, "active"),
              eq(staffMemberships.state, "active"),
            ),
          )
          .for("share");
        if (!active)
          throw new AppError("validation_failed", {
            fieldErrors: { responsibilities: ["active_staff_required"] },
          });
      }
      const [previous] = await ctx.tx
        .select()
        .from(operatingPolicyVersions)
        .orderBy(desc(operatingPolicyVersions.policyVersion))
        .limit(1);
      if (previous?.contentHash === draft.contentHash) throw new AppError("transition_denied");
      const now = new Date(),
        number = (previous?.policyVersion ?? 0) + 1;
      const [projection] = await ctx.tx
        .insert(servicePolicies)
        .values({
          effectiveFrom: now,
          timezone: "Europe/Sofia",
          serviceHours: draft.document.serviceCalendar ?? { kind: "unknown_calendar_v1" },
          coverage: { statement: draft.document.coverage },
          responsePolicy: {
            kind: "no_public_response_promise_v1",
            publicPromise: null,
          },
          availabilityReviewDays: draft.document.availabilityReviewDays,
          approvedById: current.account.id,
        })
        .returning({ id: servicePolicies.id });
      if (!projection) throw new Error("Policy projection insert failed");
      const [approved] = await ctx.tx
        .insert(operatingPolicyVersions)
        .values({
          policyVersion: number,
          draftRevision: draft.version,
          document: draft.document,
          contentHash: draft.contentHash,
          approvedById: current.account.id,
          approvedAt: now,
          approvalNote: input.note,
          operationId: ctx.operationId,
          servicePolicyId: projection.id,
        })
        .returning({ id: operatingPolicyVersions.id });
      if (!approved) throw new Error("Policy edition insert failed");
      // Approval is a separate consequential revision; stale browser forms cannot approve again.
      await ctx.tx
        .update(operatingPolicyDrafts)
        .set({ version: draft.version + 1, updatedAt: now })
        .where(eq(operatingPolicyDrafts.id, operatingPolicyId));
      await history(ctx, "approved", draft.version + 1, draft.contentHash, number);
      return {
        id: operatingPolicyId,
        version: draft.version + 1,
        policyId: approved.id,
        policyVersion: number,
        contentHash: draft.contentHash,
        effects: policyEffects(draft.document),
        recordedAt: now.toISOString(),
      };
    },
  );
}

export async function readOperatingPolicyOperation(
  db: Executor,
  session: Session,
  command: "save" | "approve",
  operationId: string,
) {
  const live = await authorize(db, session);
  return findOperation(
    db,
    live.actor,
    `operating_policy.${command}`,
    parseInput(z.string().min(16).max(200), operationId),
  );
}
