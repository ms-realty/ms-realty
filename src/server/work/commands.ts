import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { inquiries, tasks } from "@/db/schema";
import { guardInquiryTransition, inquiryMachine, inquiryTransitions } from "@/domain/inquiry";
import { guardTaskTransition, highImpactTaskTypes, taskMachine } from "@/domain/task";
import type { Session } from "../auth/sessions";
import { assertCan, assertCanRead } from "../authz";
import { hashRequest } from "../crypto";
import type { Executor } from "../db";
import { AppError } from "../errors";
import { findOperation, runOperation } from "../operations";
import {
  allow,
  commandEnvelope,
  inquiryResource,
  liveStaff,
  openTaskStates,
  parseInput,
  recordChange,
  taskResource,
  version,
} from "./shared";

const instant = z.iso.datetime({ offset: true });
const acceptSchema = z.object({
  ...commandEnvelope,
  nextAction: z.string().trim().min(3).max(500),
  dueAt: instant,
});
export type AcceptInput = z.input<typeof acceptSchema>;
const triageSchema = z.object({
  ...commandEnvelope,
  state: z.enum([
    "suspected_spam",
    "duplicate_candidate",
    "contact_unreachable",
    "resolved_without_case",
  ]),
  reason: z.string().trim().min(3).max(1500),
  duplicateOfInquiryId: z.uuid().optional(),
});
export type TriageInput = z.input<typeof triageSchema>;
const taskSchema = z.object({
  ...commandEnvelope,
  state: z.enum(["in_progress", "waiting", "done", "cancelled"]),
  note: z.string().trim().max(1500),
  followUpAt: instant.optional(),
});
export type TaskInput = z.input<typeof taskSchema>;

async function inquiryFor(
  db: Executor,
  session: Session,
  id: string,
  capability: "inquiry.assign" | "inquiry.respond",
  lock = false,
) {
  const live = await liveStaff(db, session);
  const query = db.select().from(inquiries).where(eq(inquiries.id, id));
  const [row] = await (lock ? query.for("update") : query);
  if (!row) throw new AppError("not_found");
  await assertCanRead(db, live.actor, "inquiry.read", inquiryResource(row));
  await assertCan(db, live.actor, capability, inquiryResource(row));
  return { row, live };
}

/** A named broker accepts responsibility and records the first follow-up atomically. */
export async function acceptInquiry(db: Executor, session: Session, raw: AcceptInput) {
  const input = parseInput(acceptSchema, raw);
  const { live } = await inquiryFor(db, session, input.id, "inquiry.assign");
  // Reauthorize before operation replay as well as inside the business transaction.
  const authorizeOwner = async (tx: Executor, row: typeof inquiries.$inferSelect) => {
    await assertCan(tx, live.actor, "inquiry.respond", inquiryResource(row));
    await assertCan(tx, live.actor, "task.manage", {
      type: "task",
      ...(row.caseId ? { caseId: row.caseId } : {}),
      audience: "internal",
    });
  };
  const { row: initial } = await inquiryFor(db, session, input.id, "inquiry.assign");
  await authorizeOwner(db, initial);
  return runOperation(
    db,
    {
      actor: live.actor,
      type: "work.inquiry.accept",
      idempotencyKey: input.operationId,
      requestHash: hashRequest(input),
      expectedVersion: input.expectedVersion,
    },
    async (ctx) => {
      const { row } = await inquiryFor(ctx.tx, session, input.id, "inquiry.assign", true);
      await authorizeOwner(ctx.tx, row);
      version(row, input.expectedVersion);
      // Taking over assigned work requires an explicit acceptance; existing promises stay intact.
      if (row.state !== "assigned" || row.ownerId === live.account.id)
        allow(inquiryMachine.check(row.state, "assigned"));
      allow(
        guardInquiryTransition(row.state, "assigned", { ownerId: live.account.id }, live.actor),
      );
      const dueAt = new Date(input.dueAt);
      if (dueAt.getTime() <= Date.now())
        throw new AppError("validation_failed", {
          fieldErrors: { dueAt: ["Choose a future follow-up time."] },
        });
      const [task] = await ctx.tx
        .insert(tasks)
        .values({
          title: input.nextAction,
          type: "follow_up",
          ownerId: live.account.id,
          dueAt,
          dueTimezone: "UTC",
          inquiryId: row.id,
          caseId: row.caseId,
        })
        .returning();
      if (!task) throw new Error("Follow-up task insert failed.");
      await ctx.tx
        .update(inquiries)
        .set({
          state: "assigned",
          ownerId: live.account.id,
          coverageQueue: null,
          followUpAt: dueAt,
          version: sql`${inquiries.version} + 1`,
          updatedAt: new Date(),
        })
        .where(and(eq(inquiries.id, row.id), eq(inquiries.version, input.expectedVersion)));
      await recordChange(ctx, "inquiry", row.id, "inquiry.accepted", "inquiry.assign", {
        ownerId: live.account.id,
        previousOwnerId: row.ownerId,
        taskId: task.id,
      });
      await recordChange(ctx, "task", task.id, "task.created", "task.manage", {
        inquiryId: row.id,
        ownerId: live.account.id,
      });
      return {
        id: row.id,
        reference: row.reference,
        version: row.version + 1,
        state: "assigned",
        ownerId: live.account.id,
        taskId: task.id,
        recordedAt: new Date().toISOString(),
      };
    },
  );
}

export async function triageInquiry(db: Executor, session: Session, raw: TriageInput) {
  const input = parseInput(triageSchema, raw);
  const capability = inquiryTransitions.capabilityFor("assigned", input.state, session.actor) as
    | "inquiry.assign"
    | "inquiry.respond";
  const { live } = await inquiryFor(db, session, input.id, capability);
  return runOperation(
    db,
    {
      actor: live.actor,
      type: "work.inquiry.triage",
      idempotencyKey: input.operationId,
      requestHash: hashRequest(input),
      expectedVersion: input.expectedVersion,
    },
    async (ctx) => {
      const { row } = await inquiryFor(ctx.tx, session, input.id, capability, true);
      version(row, input.expectedVersion);
      allow(inquiryMachine.check(row.state, input.state));
      if (input.state === "duplicate_candidate") {
        if (!input.duplicateOfInquiryId || input.duplicateOfInquiryId === row.id)
          throw new AppError("validation_failed", {
            fieldErrors: { duplicateOfInquiryId: ["Choose a different inquiry you can access."] },
          });
        const [target] = await ctx.tx
          .select()
          .from(inquiries)
          .where(eq(inquiries.id, input.duplicateOfInquiryId));
        if (!target) throw new AppError("not_found");
        await assertCanRead(ctx.tx, live.actor, "inquiry.read", inquiryResource(target));
      }
      const commitments = await ctx.tx
        .select({ id: tasks.id })
        .from(tasks)
        .where(and(eq(tasks.inquiryId, row.id), inArray(tasks.state, [...openTaskStates])))
        .limit(1);
      allow(
        guardInquiryTransition(
          row.state,
          input.state,
          {
            reason: input.reason,
            openCommitments: commitments.length,
            duplicateOfInquiryId:
              input.duplicateOfInquiryId ?? row.duplicateOfInquiryId ?? undefined,
          },
          live.actor,
        ),
      );
      await ctx.tx
        .update(inquiries)
        .set({
          state: input.state,
          dispositionReason: input.reason,
          ...(input.state === "duplicate_candidate"
            ? { duplicateOfInquiryId: input.duplicateOfInquiryId }
            : {}),
          version: sql`${inquiries.version} + 1`,
          updatedAt: new Date(),
        })
        .where(and(eq(inquiries.id, row.id), eq(inquiries.version, input.expectedVersion)));
      await recordChange(ctx, "inquiry", row.id, "inquiry.triaged", capability, {
        from: row.state,
        to: input.state,
      });
      return {
        id: row.id,
        reference: row.reference,
        version: row.version + 1,
        state: input.state,
        recordedAt: new Date().toISOString(),
      };
    },
  );
}

async function taskFor(db: Executor, session: Session, id: string, lock = false) {
  const live = await liveStaff(db, session);
  const query = db.select().from(tasks).where(eq(tasks.id, id));
  const [row] = await (lock ? query.for("update") : query);
  if (!row) throw new AppError("not_found");
  await assertCanRead(db, live.actor, "task.manage", taskResource(row));
  return { row, live };
}

export async function changeTask(db: Executor, session: Session, raw: TaskInput) {
  const input = parseInput(taskSchema, raw);
  const { live } = await taskFor(db, session, input.id);
  return runOperation(
    db,
    {
      actor: live.actor,
      type: "work.task.change",
      idempotencyKey: input.operationId,
      requestHash: hashRequest(input),
      expectedVersion: input.expectedVersion,
    },
    async (ctx) => {
      const { row } = await taskFor(ctx.tx, session, input.id, true);
      version(row, input.expectedVersion);
      allow(taskMachine.check(row.state, input.state));
      // Completing regulated work needs its owning module's evidence, not a generic note.
      if (
        input.state === "done" &&
        (row.evidenceRequired || (highImpactTaskTypes as readonly string[]).includes(row.type))
      )
        throw new AppError("transition_denied");
      if (input.state === "done" && row.dependsOnTaskId) {
        const [dependency] = await ctx.tx
          .select({ state: tasks.state })
          .from(tasks)
          .where(eq(tasks.id, row.dependsOnTaskId));
        if (dependency?.state !== "done") throw new AppError("transition_denied");
      }
      allow(
        guardTaskTransition(row.state, input.state, {
          outcomeNote: input.note,
          reason: input.note,
          waitingOn: input.note,
          followUpAt: input.followUpAt,
          evidenceRequired: row.evidenceRequired,
        }),
      );
      if (
        input.state === "waiting" &&
        (!input.followUpAt || new Date(input.followUpAt).getTime() <= Date.now())
      )
        throw new AppError("validation_failed", {
          fieldErrors: { followUpAt: ["Choose a future review time."] },
        });
      await ctx.tx
        .update(tasks)
        .set({
          state: input.state,
          waitingOn: input.state === "waiting" ? input.note : null,
          followUpAt: input.state === "waiting" ? new Date(input.followUpAt as string) : null,
          ...(input.state === "done"
            ? { outcomeNote: input.note, completedAt: new Date(), completedById: live.account.id }
            : {}),
          ...(input.state === "cancelled" ? { cancelReason: input.note } : {}),
          version: sql`${tasks.version} + 1`,
          updatedAt: new Date(),
        })
        .where(and(eq(tasks.id, row.id), eq(tasks.version, input.expectedVersion)));
      await recordChange(ctx, "task", row.id, "task.changed", "task.manage", {
        from: row.state,
        to: input.state,
      });
      return {
        id: row.id,
        version: row.version + 1,
        state: input.state,
        recordedAt: new Date().toISOString(),
      };
    },
  );
}

/** Reconciliation exposes only this actor's receipt after current record authorization. */
export async function readWorkOperation(
  db: Executor,
  session: Session,
  type: "work.inquiry.accept" | "work.inquiry.triage" | "work.task.change",
  id: string,
  key: string,
) {
  if (!z.uuid().safeParse(id).success || key.length > 200) throw new AppError("not_found");
  const live = await liveStaff(db, session);
  if (type === "work.task.change") await taskFor(db, session, id);
  else {
    const [row] = await db.select().from(inquiries).where(eq(inquiries.id, id));
    if (!row) throw new AppError("not_found");
    await assertCanRead(db, live.actor, "inquiry.read", inquiryResource(row));
  }
  const operation = await findOperation(db, live.actor, type, key);
  // A key from a different record must not disclose that record's receipt.
  if (operation?.status === "succeeded" && (operation.outcome as { id?: string })?.id !== id)
    throw new AppError("not_found");
  return operation ? { status: operation.status } : null;
}
