import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { contactMethods, inquiries, tasks } from "@/db/schema";
import { type InquiryContactObservation, inquiryContactResults } from "@/domain/inquiry-contact";
import { requireAvailableStaff } from "../auth/availability";
import type { Session } from "../auth/sessions";
import { assertCan, assertCanRead } from "../authz";
import { hashRequest } from "../crypto";
import type { Executor } from "../db";
import { AppError, isAppError } from "../errors";
import { runOperation } from "../operations";
import {
  commandEnvelope,
  inquiryResource,
  liveStaff,
  parseInput,
  recordChange,
  version,
} from "./shared";

const instant = z.iso.datetime({ offset: true });
const contactSchema = z.object({
  ...commandEnvelope,
  contactMethodId: z.uuid(),
  expectedContactVersion: z.number().int().positive().safe(),
  result: z.enum(inquiryContactResults),
  contactedAt: instant,
  note: z.string().trim().min(10).max(2000),
  nextAction: z.string().trim().min(3).max(500),
  dueAt: instant,
  promisedToClient: z.boolean(),
  reviewed: z.literal(true),
});
export type ContactInput = z.input<typeof contactSchema>;

async function authorize(db: Executor, session: Session, id: string, lock = false) {
  const query = db.select().from(inquiries).where(eq(inquiries.id, id));
  const [row] = await (lock ? query.for("update") : query);
  if (!row) throw new AppError("not_found");
  // Refresh session, enrollment and grants after any record-lock wait, including on replay.
  const live = await liveStaff(db, session);
  await assertCanRead(db, live.actor, "inquiry.read", inquiryResource(row));
  await assertCan(db, live.actor, "inquiry.respond", inquiryResource(row));
  await assertCan(db, live.actor, "task.manage", {
    type: "task",
    ...(row.caseId ? { caseId: row.caseId } : {}),
    audience: "internal",
  });
  if (row.ownerId !== live.account.id) throw new AppError("transition_denied");
  await requireAvailableStaff(db, live.account.id, lock);
  return { row, live };
}

/** Record a human-attested contact and its next commitment. Never send or infer delivery. */
export async function recordInquiryContact(db: Executor, session: Session, raw: unknown) {
  const input = parseInput(contactSchema, raw);
  await authorize(db, session, input.id);
  // Keep the inquiry lock and current authority check around operation replay too.
  const settled = await db.transaction(async (tx) => {
    const { row, live } = await authorize(tx, session, input.id, true);
    try {
      return {
        ok: true as const,
        value: await runOperation(
          tx,
          {
            actor: live.actor,
            type: "work.inquiry.contact",
            idempotencyKey: input.operationId,
            requestHash: hashRequest(input),
            expectedVersion: input.expectedVersion,
            subject: { type: "inquiry", id: row.id },
          },
          async (ctx) => {
            version(row, input.expectedVersion);
            if (row.state !== "assigned" && row.state !== "awaiting_client")
              throw new AppError("transition_denied");
            if (!row.partyId || row.contactMethodId !== input.contactMethodId)
              throw new AppError("validation_failed", {
                fieldErrors: { contactMethodId: ["Review the inquiry's current contact."] },
              });
            const [method] = await ctx.tx
              .select()
              .from(contactMethods)
              .where(
                and(
                  eq(contactMethods.id, input.contactMethodId),
                  eq(contactMethods.partyId, row.partyId),
                ),
              )
              .for("share");
            if (!method) throw new AppError("not_found");
            await authorize(ctx.tx, session, input.id);
            if (method.version !== input.expectedContactVersion)
              throw new AppError("version_conflict", { current: { version: row.version } });
            const now = new Date();
            const contactedAt = new Date(input.contactedAt);
            const dueAt = new Date(input.dueAt);
            if (contactedAt < row.createdAt || contactedAt > now)
              throw new AppError("validation_failed", {
                fieldErrors: {
                  contactedAt: [
                    "Record when this contact actually took place, after receipt and no later than now.",
                  ],
                },
              });
            if (dueAt <= now)
              throw new AppError("validation_failed", {
                fieldErrors: { dueAt: ["Choose a future follow-up time."] },
              });
            if (input.promisedToClient && input.result !== "useful_response")
              throw new AppError("validation_failed", {
                fieldErrors: {
                  promisedToClient: ["An unanswered contact cannot establish a client promise."],
                },
              });
            const [task] = await ctx.tx
              .insert(tasks)
              .values({
                title: input.nextAction,
                type: "follow_up",
                ownerId: live.account.id,
                dueAt,
                dueTimezone: "UTC",
                promisedToClient: input.promisedToClient,
                inquiryId: row.id,
                caseId: row.caseId,
              })
              .returning();
            if (!task) throw new Error("Contact follow-up insert failed.");
            const firstResponseAt =
              input.result === "useful_response" &&
              (!row.firstResponseAt || contactedAt < row.firstResponseAt)
                ? contactedAt
                : row.firstResponseAt;
            await ctx.tx
              .update(inquiries)
              .set({
                firstResponseAt,
                // This is the new contact's next step; earlier tasks/promises stay open and visible.
                followUpAt: dueAt,
                version: sql`${inquiries.version} + 1`,
                updatedAt: now,
              })
              .where(and(eq(inquiries.id, row.id), eq(inquiries.version, row.version)));
            const observation: InquiryContactObservation = {
              schemaVersion: 1,
              result: input.result,
              contactedAt: contactedAt.toISOString(),
              note: input.note,
              contact: {
                id: method.id,
                partyId: method.partyId,
                version: method.version,
                kind: method.kind,
                value: method.value,
              },
              taskId: task.id,
              nextAction: input.nextAction,
              dueAt: dueAt.toISOString(),
              promisedToClient: input.promisedToClient,
            };
            await recordChange(
              ctx,
              "inquiry",
              row.id,
              "inquiry.contact_recorded",
              "inquiry.respond",
              observation,
            );
            await recordChange(ctx, "task", task.id, "task.created", "task.manage", {
              inquiryId: row.id,
              ownerId: live.account.id,
              promisedToClient: input.promisedToClient,
            });
            return {
              id: row.id,
              reference: row.reference,
              version: row.version + 1,
              taskId: task.id,
              firstResponseAt: firstResponseAt?.toISOString() ?? null,
              recordedAt: now.toISOString(),
            };
          },
        ),
      };
    } catch (error) {
      // runOperation persists known failures. Do not roll that receipt back with our outer lock.
      if (isAppError(error)) return { ok: false as const, error };
      throw error;
    }
  });
  if (!settled.ok) throw settled.error;
  return settled.value;
}
