import "server-only";
import { and, asc, desc, eq, exists, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { caseParticipants, cases, contactMethods, inquiries, parties, tasks } from "@/db/schema";
import { guardInquiryTransition, inquiryMachine } from "@/domain/inquiry";
import { requireAvailableStaff } from "../auth/availability";
import type { Session } from "../auth/sessions";
import { assertCan, assertCanRead, can } from "../authz";
import { hashRequest } from "../crypto";
import type { Executor } from "../db";
import { AppError } from "../errors";
import { runOperation } from "../operations";
import {
  allow,
  commandEnvelope,
  inquiryResource,
  liveStaff,
  parseInput,
  taskResource,
  version,
} from "../work/shared";
import { bumpCase, caseEvent, caseFor, caseVisibility, liveParticipation } from "./shared";

const linkSchema = z.object({
  ...commandEnvelope,
  caseId: z.uuid(),
  expectedCaseVersion: z.number().int().positive().safe(),
});
export type LinkInquiryToExistingCaseInput = z.input<typeof linkSchema>;

/** C02: a human association preserves the original Party; it confers no participation or access. */
export async function linkInquiryToExistingCase(
  db: Executor,
  session: Session,
  raw: LinkInquiryToExistingCaseInput,
) {
  const input = parseInput(linkSchema, raw);
  const authorize = async (tx: Executor, lock: boolean) => {
    const live = await liveStaff(tx, session);
    await requireAvailableStaff(tx, live.account.id, lock);
    const query = tx.select().from(inquiries).where(eq(inquiries.id, input.id));
    const [inquiry] = await (lock ? query.for("update") : query);
    if (!inquiry) throw new AppError("not_found");
    await assertCanRead(tx, live.actor, "inquiry.read", inquiryResource(inquiry));
    await assertCan(tx, live.actor, "inquiry.respond", inquiryResource(inquiry));
    const target = await caseFor(tx, session, input.caseId, "case.transition", lock);
    // Record locks may wait past a session revocation, grant change or absence boundary.
    await liveStaff(tx, session);
    await requireAvailableStaff(tx, live.account.id);
    await assertCanRead(tx, live.actor, "inquiry.read", inquiryResource(inquiry));
    await assertCan(tx, live.actor, "inquiry.respond", inquiryResource(inquiry));
    return { inquiry, target: target.row, live };
  };
  // Receipt replay also requires current inquiry and target-case authority.
  const { live } = await authorize(db, false);
  return runOperation(
    db,
    {
      actor: live.actor,
      type: "case.link_inquiry",
      idempotencyKey: input.operationId,
      requestHash: hashRequest(input),
      expectedVersion: input.expectedVersion,
      subject: { type: "inquiry", id: input.id },
    },
    async (ctx) => {
      const { inquiry, target } = await authorize(ctx.tx, true);
      version(inquiry, input.expectedVersion);
      if (target.version !== input.expectedCaseVersion)
        throw new AppError("version_conflict", { current: { caseVersion: target.version } });
      if (
        !inquiry.partyId ||
        inquiry.ownerId !== live.account.id ||
        inquiry.caseId ||
        target.disposition !== "active"
      )
        throw new AppError("transition_denied");
      allow(inquiryMachine.check(inquiry.state, "linked_to_case"));
      allow(
        guardInquiryTransition(inquiry.state, "linked_to_case", { caseId: target.id }, live.actor),
      );
      const commitments = await ctx.tx
        .select()
        .from(tasks)
        .where(eq(tasks.inquiryId, inquiry.id))
        .orderBy(asc(tasks.id))
        .for("update");
      await authorize(ctx.tx, false);
      for (const commitment of commitments) {
        await assertCan(ctx.tx, live.actor, "task.manage", taskResource(commitment));
        await assertCan(
          ctx.tx,
          live.actor,
          "task.manage",
          taskResource({ ...commitment, caseId: target.id }),
        );
        if (commitment.caseId && commitment.caseId !== target.id)
          throw new AppError("transition_denied");
        if (commitment.caseId === target.id) continue;
        const [changed] = await ctx.tx
          .update(tasks)
          .set({ caseId: target.id, version: commitment.version + 1, updatedAt: new Date() })
          .where(and(eq(tasks.id, commitment.id), eq(tasks.version, commitment.version)))
          .returning({ id: tasks.id });
        if (!changed) throw new AppError("version_conflict");
        await caseEvent(ctx, "task", commitment.id, "task.linked_to_case", "task.manage", {
          caseId: target.id,
          inquiryId: inquiry.id,
        });
      }
      await bumpCase(ctx.tx, target.id, target.version);
      await ctx.tx
        .update(inquiries)
        .set({
          caseId: target.id,
          state: "linked_to_case",
          version: inquiry.version + 1,
          updatedAt: new Date(),
        })
        .where(and(eq(inquiries.id, inquiry.id), eq(inquiries.version, input.expectedVersion)));
      await caseEvent(ctx, "case", target.id, "case.inquiry_linked", "case.transition", {
        inquiryId: inquiry.id,
      });
      await caseEvent(ctx, "inquiry", inquiry.id, "inquiry.linked", "inquiry.respond", {
        caseId: target.id,
      });
      return {
        id: inquiry.id,
        reference: inquiry.reference,
        version: inquiry.version + 1,
        state: "linked_to_case" as const,
        caseId: target.id,
        caseReference: target.reference,
        caseVersion: target.version + 1,
        recordedAt: new Date().toISOString(),
      };
    },
  );
}

/** O03 suggestions only: an exact Party/contact route is never an identity or access decision. */
export async function listInquiryCaseCandidates(db: Executor, session: Session, id: string) {
  const live = await liveStaff(db, session);
  if (!z.uuid().safeParse(id).success) throw new AppError("not_found");
  const [inquiry] = await db.select().from(inquiries).where(eq(inquiries.id, id));
  if (!inquiry) throw new AppError("not_found");
  await assertCanRead(db, live.actor, "inquiry.read", inquiryResource(inquiry));
  if (!inquiry.partyId || inquiry.caseId) return [];
  const [route] = inquiry.contactMethodId
    ? await db
        .select({ kind: contactMethods.kind, normalizedValue: contactMethods.normalizedValue })
        .from(contactMethods)
        .where(
          and(
            eq(contactMethods.id, inquiry.contactMethodId),
            eq(contactMethods.partyId, inquiry.partyId),
          ),
        )
    : [];
  const sameParty = exists(
    db
      .select({ id: caseParticipants.id })
      .from(caseParticipants)
      .innerJoin(parties, eq(parties.id, caseParticipants.partyId))
      .where(
        and(
          eq(caseParticipants.caseId, cases.id),
          eq(caseParticipants.partyId, inquiry.partyId),
          isNull(parties.mergedIntoPartyId),
          liveParticipation(),
        ),
      ),
  );
  const sameContact = route
    ? exists(
        db
          .select({ id: caseParticipants.id })
          .from(caseParticipants)
          .innerJoin(parties, eq(parties.id, caseParticipants.partyId))
          .innerJoin(contactMethods, eq(contactMethods.partyId, caseParticipants.partyId))
          .where(
            and(
              eq(caseParticipants.caseId, cases.id),
              eq(contactMethods.kind, route.kind),
              eq(contactMethods.normalizedValue, route.normalizedValue),
              isNull(parties.mergedIntoPartyId),
              liveParticipation(),
            ),
          ),
      )
    : sql<boolean>`false`;
  const rows = await db
    .select({
      id: cases.id,
      reference: cases.reference,
      version: cases.version,
      title: cases.title,
      kind: cases.kind,
      stage: cases.stage,
      sameParty,
    })
    .from(cases)
    .where(
      and(
        await caseVisibility(db, session),
        eq(cases.disposition, "active"),
        or(sameParty, sameContact),
      ),
    )
    .orderBy(desc(cases.updatedAt), asc(cases.id))
    .limit(50);
  let canLink =
    inquiry.ownerId === live.account.id &&
    inquiryMachine.check(inquiry.state, "linked_to_case").outcome !== "denied" &&
    (await can(db, live.actor, "inquiry.respond", inquiryResource(inquiry)));
  if (canLink) {
    try {
      await requireAvailableStaff(db, live.account.id);
    } catch (error) {
      if (!(error instanceof AppError) || error.code !== "transition_denied") throw error;
      canLink = false;
    }
  }
  return Promise.all(
    rows.map(async ({ sameParty: matchedParty, ...row }) => ({
      ...row,
      matchBasis: matchedParty ? ("party" as const) : ("contact_route" as const),
      canLink:
        canLink &&
        (await can(db, live.actor, "case.transition", {
          type: "case",
          id: row.id,
          audience: "case_participants",
        })),
    })),
  );
}
