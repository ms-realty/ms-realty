import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { appointmentResources, appointments } from "@/db/schema";
import { requireFreshAuth, type Session } from "../auth/sessions";
import { caseEvent } from "../cases/shared";
import { hashRequest } from "../crypto";
import type { Executor } from "../db";
import { AppError } from "../errors";
import { runOperation } from "../operations";
import { commandEnvelope, openAppointmentStates, parseInput, version } from "../work/shared";
import { requireHostReceiver } from "./host-receivers";
import { appointmentFor, recordAppointmentVersion } from "./service";

const schema = z.object({
  ...commandEnvelope,
  action: z.enum(["request", "cancel"]),
  receiverId: z.uuid().optional(),
  reason: z.string().trim().min(10).max(2000),
  reviewed: z.literal(true),
});

/** Only the current host offers or withdraws; this never moves a booking or accepts for anyone. */
export async function offerAppointmentHost(db: Executor, session: Session, raw: unknown) {
  const input = parseInput(schema, raw);
  const { live } = await appointmentFor(db, session, input.id, true);
  if (live.account.kind !== "staff") throw new AppError("forbidden");
  requireFreshAuth(live);
  return runOperation(
    db,
    {
      actor: live.actor,
      type: "appointment.host.handover",
      idempotencyKey: input.operationId,
      requestHash: hashRequest(input),
      expectedVersion: input.expectedVersion,
    },
    async (ctx) => {
      const { row, live: host } = await appointmentFor(ctx.tx, session, input.id, true, true);
      if (host.account.kind !== "staff" || row.hostId !== host.account.id)
        throw new AppError("forbidden");
      requireFreshAuth(host);
      version(row, input.expectedVersion);
      const at = new Date();
      if (input.action === "request") {
        const start = row.confirmedStartsAt ?? row.proposedStartsAt;
        if (
          row.pendingHostId ||
          !(openAppointmentStates as readonly string[]).includes(row.state) ||
          (start && start.getTime() <= at.getTime())
        )
          throw new AppError("transition_denied");
        if (!input.receiverId) throw new AppError("validation_failed");
        const [reservation] = await ctx.tx
          .select({
            through: sql<string>`upper(${appointmentResources.during}) - interval '1 microsecond'`,
          })
          .from(appointmentResources)
          .where(
            and(
              eq(appointmentResources.appointmentId, row.id),
              eq(appointmentResources.kind, "broker"),
              eq(appointmentResources.active, true),
            ),
          );
        await requireHostReceiver(
          ctx.tx,
          row,
          input.receiverId,
          reservation ? new Date(reservation.through) : (row.proposedEndsAt ?? undefined),
        );
      } else if (!row.pendingHostId) throw new AppError("transition_denied");
      const [changed] = await ctx.tx
        .update(appointments)
        .set({
          pendingHostId: input.action === "request" ? input.receiverId : null,
          pendingHostVersion: input.action === "request" ? row.version + 1 : null,
          pendingHostNote: input.action === "request" ? input.reason : null,
          pendingHostOfferedAt: input.action === "request" ? at : null,
          version: row.version + 1,
          updatedAt: at,
        })
        .where(eq(appointments.id, row.id))
        .returning();
      if (!changed) throw new Error("Host offer was not recorded");
      await recordAppointmentVersion(ctx.tx, changed, host);
      await caseEvent(
        ctx,
        "appointment",
        row.id,
        `appointment.host.${input.action}`,
        "appointment.manage",
        {
          caseId: row.caseId,
          previousHostId: row.hostId,
          receiverId: input.action === "request" ? input.receiverId : row.pendingHostId,
          reason: input.reason,
        },
      );
      return {
        id: row.id,
        reference: row.reference,
        version: changed.version,
        recordedAt: at.toISOString(),
      };
    },
  );
}
