import "server-only";
import { and, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import {
  appointmentParticipantResponses,
  appointmentParticipants,
  appointmentResources,
  appointments,
  listings,
  principals,
} from "@/db/schema";
import type { Session } from "../auth/sessions";
import { caseEvent } from "../cases/shared";
import { hashRequest } from "../crypto";
import type { Executor } from "../db";
import { AppError } from "../errors";
import { runOperation } from "../operations";
import { loadPublishedListings } from "../publication/presentation";
import { commandEnvelope, parseInput, version } from "../work/shared";
import { appointmentFor, recordAppointmentVersion } from "./service";

const schema = z
  .object({
    ...commandEnvelope,
    decision: z.enum(["accept", "decline", "alternative"]),
    note: z.string().trim().max(1500),
  })
  .refine((input) => input.decision === "accept" || input.note.length >= 3, {
    path: ["note"],
    message: "required",
  });

/** C06: one entitled participant's response, never a booking or another person's decision. */
export async function respondToProposedSlot(
  db: Executor,
  session: Session,
  raw: z.input<typeof schema>,
) {
  const input = parseInput(schema, raw);
  const { live } = await appointmentFor(db, session, input.id, true);
  if (live.account.kind !== "client") throw new AppError("not_found");
  return runOperation(
    db,
    {
      actor: live.actor,
      type: "appointment.participant.respond",
      idempotencyKey: input.operationId,
      requestHash: hashRequest(input),
      expectedVersion: input.expectedVersion,
    },
    async (ctx) => {
      const { row } = await appointmentFor(ctx.tx, live, input.id, true, true);
      version(row, input.expectedVersion);
      if (
        !["proposed", "reschedule_requested"].includes(row.state) ||
        !row.proposedVersion ||
        !row.proposedStartsAt ||
        !row.proposedEndsAt ||
        row.proposedStartsAt <= new Date() ||
        row.proposedEndsAt <= row.proposedStartsAt ||
        !row.listingId
      )
        throw new AppError("transition_denied");
      const [principal] = await ctx.tx
        .select({ partyId: principals.partyId })
        .from(principals)
        .where(eq(principals.id, live.account.id));
      const [participant] = principal?.partyId
        ? await ctx.tx
            .select()
            .from(appointmentParticipants)
            .where(
              and(
                eq(appointmentParticipants.appointmentId, row.id),
                eq(appointmentParticipants.partyId, principal.partyId),
              ),
            )
            .for("update")
        : [];
      if (!participant) throw new AppError("not_found");
      const [listing] = await ctx.tx
        .select()
        .from(listings)
        .where(eq(listings.id, row.listingId))
        .for("share");
      const [published] = await loadPublishedListings(ctx.tx, { ids: [row.listingId] }, "bg");
      if (
        !published ||
        listing?.commercialState !== "available" ||
        !listing.availabilityConfirmedAt ||
        !listing.reviewDueAt ||
        listing.reviewDueAt <= new Date() ||
        listing.freshnessState !== "current_under_policy"
      )
        throw new AppError("transition_denied");
      const during = `[${new Date(row.proposedStartsAt.getTime() - (row.proposedBufferMinutes ?? 0) * 60000).toISOString()},${new Date(row.proposedEndsAt.getTime() + (row.proposedBufferMinutes ?? 0) * 60000).toISOString()})`;
      const [conflict] = await ctx.tx
        .select({ id: appointmentResources.id })
        .from(appointmentResources)
        .where(
          and(
            eq(appointmentResources.active, true),
            ne(appointmentResources.appointmentId, row.id),
            sql`${appointmentResources.during} && ${during}::tstzrange`,
            sql`((${appointmentResources.kind} = 'broker' and ${appointmentResources.resourceId} = ${row.hostId}) or (${appointmentResources.kind} = 'property_access' and ${appointmentResources.resourceId} = ${row.propertyId}))`,
          ),
        )
        .limit(1);
      if (conflict) throw new AppError("transition_denied");
      // The immutable source snapshot already exists from the staff's proposed arrangement.
      await ctx.tx.insert(appointmentParticipantResponses).values({
        appointmentId: row.id,
        appointmentVersion: row.proposedVersion,
        participantId: participant.id,
        principalId: live.account.id,
        decision: input.decision,
        startsAt: row.proposedStartsAt,
        endsAt: row.proposedEndsAt,
        timezone: row.timezone,
        note: input.note || null,
        operationId: ctx.operationId,
      });
      await ctx.tx
        .update(appointmentParticipants)
        .set({
          acknowledgedSequence: input.decision === "accept" ? row.icsSequence : null,
          version: participant.version + 1,
        })
        .where(eq(appointmentParticipants.id, participant.id));
      const [changed] = await ctx.tx
        .update(appointments)
        .set({ version: row.version + 1, updatedAt: new Date() })
        .where(eq(appointments.id, row.id))
        .returning();
      if (!changed) throw new AppError("version_conflict");
      await recordAppointmentVersion(ctx.tx, changed, live);
      await caseEvent(
        ctx,
        "appointment",
        row.id,
        "appointment.participant.responded",
        "portal.appointment.request",
      );
      return {
        id: row.id,
        reference: row.reference,
        version: changed.version,
        decision: input.decision,
        bookingState: row.state,
        recordedAt: new Date().toISOString(),
      };
    },
  );
}

/** Own answer or staff-visible coordination; no co-participant identity/notes projected. */
export async function ownSlotResponse(db: Executor, session: Session, id: string) {
  const { row, live } = await appointmentFor(db, session, id);
  if (
    live.account.kind !== "client" ||
    !row.proposedVersion ||
    !row.proposedStartsAt ||
    !row.proposedEndsAt
  )
    return null;
  const [answer] = await db
    .select({
      decision: appointmentParticipantResponses.decision,
      at: appointmentParticipantResponses.createdAt,
    })
    .from(appointmentParticipantResponses)
    .where(
      and(
        eq(appointmentParticipantResponses.appointmentId, id),
        eq(appointmentParticipantResponses.principalId, live.account.id),
        eq(appointmentParticipantResponses.appointmentVersion, row.proposedVersion),
        eq(appointmentParticipantResponses.startsAt, row.proposedStartsAt),
        eq(appointmentParticipantResponses.endsAt, row.proposedEndsAt),
      ),
    )
    .orderBy(sql`${appointmentParticipantResponses.createdAt} desc`)
    .limit(1);
  return answer ?? null;
}

/** Current authorized appointment staff can coordinate the actual participant answers. */
export async function listSlotResponses(db: Executor, session: Session, id: string) {
  const { row, live } = await appointmentFor(db, session, id);
  if (live.account.kind !== "staff" || !row.proposedVersion) return [];
  return db
    .select({
      id: appointmentParticipantResponses.id,
      name: principals.displayName,
      decision: appointmentParticipantResponses.decision,
      note: appointmentParticipantResponses.note,
      at: appointmentParticipantResponses.createdAt,
    })
    .from(appointmentParticipantResponses)
    .innerJoin(principals, eq(principals.id, appointmentParticipantResponses.principalId))
    .where(
      and(
        eq(appointmentParticipantResponses.appointmentId, id),
        eq(appointmentParticipantResponses.appointmentVersion, row.proposedVersion),
      ),
    )
    .orderBy(sql`${appointmentParticipantResponses.createdAt} asc`)
    .limit(100);
}
