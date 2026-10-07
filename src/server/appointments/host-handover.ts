import "server-only";
import { and, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { appointmentResources, appointments } from "@/db/schema";
import { requireAvailableStaff } from "../auth/availability";
import { requireFreshAuth, type Session } from "../auth/sessions";
import { caseEvent } from "../cases/shared";
import { hashRequest } from "../crypto";
import type { Executor } from "../db";
import { AppError } from "../errors";
import { runOperation } from "../operations";
import { appointmentCoverageAt, ownerNeedsCoverage } from "../work/coverage-policy";
import { commandEnvelope, openAppointmentStates, parseInput, version } from "../work/shared";
import { appointmentFor, recordAppointmentVersion } from "./service";

const inputSchema = z.object({
  ...commandEnvelope,
  reason: z.string().trim().min(10).max(2000),
  reviewed: z.literal(true),
  externalBusyChecked: z.literal(true),
  propertyAccessConfirmed: z.literal(true),
});

/** Only the signed-in receiver can accept hosting. No manager can accept for another person. */
export async function acceptAppointmentHost(db: Executor, session: Session, raw: unknown) {
  const input = parseInput(inputSchema, raw);
  const { live } = await appointmentFor(db, session, input.id, true);
  if (live.account.kind !== "staff") throw new AppError("forbidden");
  requireFreshAuth(live);
  return runOperation(
    db,
    {
      actor: live.actor,
      type: "appointment.host.accept",
      idempotencyKey: input.operationId,
      requestHash: hashRequest(input),
      expectedVersion: input.expectedVersion,
    },
    async (ctx) => {
      const { row, live: receiver } = await appointmentFor(ctx.tx, session, input.id, true, true);
      if (receiver.account.kind !== "staff") throw new AppError("forbidden");
      requireFreshAuth(receiver);
      version(row, input.expectedVersion);
      if (
        !(openAppointmentStates as readonly string[]).includes(row.state) ||
        row.hostId === receiver.account.id
      )
        throw new AppError("transition_denied");
      const [coverage] = await ctx.tx
        .select({ needed: ownerNeedsCoverage(appointments.hostId, appointmentCoverageAt) })
        .from(appointments)
        .where(eq(appointments.id, row.id));
      if (
        !coverage?.needed &&
        (row.pendingHostId !== receiver.account.id || row.pendingHostVersion !== row.version)
      )
        throw new AppError("transition_denied");
      const start = row.confirmedStartsAt ?? row.proposedStartsAt;
      if (start && start.getTime() <= Date.now()) throw new AppError("transition_denied");
      const resources = await ctx.tx
        .select({
          id: appointmentResources.id,
          kind: appointmentResources.kind,
          resourceId: appointmentResources.resourceId,
          during: appointmentResources.during,
          from: sql<string>`lower(${appointmentResources.during})::text`,
          through: sql<string>`upper(${appointmentResources.during}) - interval '1 microsecond'`,
        })
        .from(appointmentResources)
        .where(
          and(
            eq(appointmentResources.appointmentId, row.id),
            eq(appointmentResources.active, true),
          ),
        );
      const booked = row.state === "confirmed" || row.state === "reschedule_requested";
      const broker = resources.find((r) => r.kind === "broker" && r.resourceId === row.hostId);
      const property = resources.find(
        (r) => r.kind === "property_access" && r.resourceId === row.propertyId,
      );
      // Inconsistent imported bookings require repair; never manufacture a missing reservation.
      if (
        booked
          ? !broker ||
            !property ||
            !row.confirmedStartsAt ||
            !row.confirmedEndsAt ||
            resources.length !== 2
          : resources.length !== 0
      )
        throw new AppError("transition_denied");
      if (
        broker &&
        property &&
        (broker.during !== property.during ||
          new Date(broker.from).getTime() > (row.confirmedStartsAt?.getTime() ?? 0) ||
          new Date(broker.through).getTime() + 1 < (row.confirmedEndsAt?.getTime() ?? Infinity))
      )
        throw new AppError("transition_denied");
      const through = broker ? new Date(broker.through) : (row.proposedEndsAt ?? undefined);
      await requireAvailableStaff(ctx.tx, receiver.account.id, true, through);
      if (broker) {
        for (const id of [broker.resourceId, receiver.account.id].sort())
          await ctx.tx.execute(
            sql`select pg_advisory_xact_lock(hashtextextended(${`appointment:broker:${id}`}, 0))`,
          );
        const [conflict] = await ctx.tx
          .select({ id: appointmentResources.id })
          .from(appointmentResources)
          .where(
            and(
              eq(appointmentResources.kind, "broker"),
              eq(appointmentResources.resourceId, receiver.account.id),
              eq(appointmentResources.active, true),
              ne(appointmentResources.appointmentId, row.id),
              sql`${appointmentResources.during} && ${broker.during}::tstzrange`,
            ),
          )
          .limit(1);
        if (conflict)
          throw new AppError("transition_denied", {
            fieldErrors: { form: ["appointment_conflict"] },
          });
        await ctx.tx
          .update(appointmentResources)
          .set({ active: false, releasedAt: new Date() })
          .where(eq(appointmentResources.id, broker.id));
        await ctx.tx.insert(appointmentResources).values({
          appointmentId: row.id,
          kind: "broker",
          resourceId: receiver.account.id,
          during: broker.during,
        });
      }
      const [changed] = await ctx.tx
        .update(appointments)
        .set({
          hostId: receiver.account.id,
          pendingHostId: null,
          pendingHostVersion: null,
          pendingHostNote: null,
          pendingHostOfferedAt: null,
          externalBusyCheckedAt: new Date(),
          externalBusyCheckedById: receiver.account.id,
          icsSequence: row.icsSequence + 1,
          version: row.version + 1,
          updatedAt: new Date(),
        })
        .where(eq(appointments.id, row.id))
        .returning();
      if (!changed) throw new Error("Appointment host acceptance failed");
      await recordAppointmentVersion(ctx.tx, changed, receiver);
      await caseEvent(
        ctx,
        "appointment",
        row.id,
        "appointment.host.accepted",
        "appointment.manage",
        {
          previousHostId: row.hostId,
          offeredByHost:
            row.pendingHostId === receiver.account.id && row.pendingHostVersion === row.version,
          receiverId: receiver.account.id,
          reason: input.reason,
          externalBusyChecked: true,
          propertyAccessConfirmed: true,
          caseId: row.caseId,
        },
      );
      return {
        id: row.id,
        reference: row.reference,
        version: changed.version,
        recordedAt: new Date().toISOString(),
      };
    },
  );
}
