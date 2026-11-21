// Viewing changes → deal notices. The appointment service calls this in the same transaction
// as the change; the notice carries the viewing time and, once confirmed, its calendar entry.
import "server-only";
import { and, eq, isNotNull } from "drizzle-orm";
import { appointmentParticipants, type appointments } from "@/db/schema";
import type { Actor } from "@/domain/capabilities";
import type { Executor } from "../db";
import { notifyDealUpdate } from "./notify";

type Appointment = typeof appointments.$inferSelect;
export type ViewingChange =
  | "proposed"
  | "confirmed"
  | "cancelled"
  | "declined"
  | "reschedule_requested"
  | "client_confirmed"
  | "completed"
  | "no_show";

function slot(start: Date | null, end: Date | null) {
  return start && end ? { startsAt: start, endsAt: end } : null;
}

export async function notifyViewingChange(
  db: Executor,
  change: ViewingChange,
  previous: Appointment,
  current: Appointment,
  actor: Actor,
) {
  if (current.purpose !== "viewing" || !current.caseId) return [];
  const participants = await db
    .select({ partyId: appointmentParticipants.partyId })
    .from(appointmentParticipants)
    .where(
      and(
        eq(appointmentParticipants.appointmentId, current.id),
        isNotNull(appointmentParticipants.partyId),
      ),
    );
  const partyIds = participants.flatMap((row) => (row.partyId ? [row.partyId] : []));
  const subject = { type: "appointment" as const, id: current.id, reference: current.reference };
  const base = { caseId: current.caseId, subject, actor, partyIds };
  const confirmed = slot(current.confirmedStartsAt, current.confirmedEndsAt);
  const calendar = {
    uid: current.icsUid,
    sequence: current.icsSequence,
    updatedAt: current.updatedAt,
  };
  const versionKey = `appointment:${current.id}:v${current.version}`;
  if (actor.kind === "client") {
    if (change === "client_confirmed") {
      const time = confirmed ?? slot(current.proposedStartsAt, current.proposedEndsAt);
      if (!time) return [];
      return notifyDealUpdate(db, {
        ...base,
        event: "client.viewing_confirmed",
        eventKey: `appointment:${current.id}:client-confirmed:${actor.id}:${time.startsAt.toISOString()}`,
        time,
      });
    }
    if (change === "cancelled")
      return notifyDealUpdate(db, {
        ...base,
        event: "client.viewing_cancelled",
        eventKey: versionKey,
      });
    if (change === "reschedule_requested")
      return notifyDealUpdate(db, {
        ...base,
        event: "client.viewing_new_time",
        eventKey: versionKey,
      });
    return [];
  }
  if (change === "proposed") {
    const time = slot(current.proposedStartsAt, current.proposedEndsAt);
    if (!time) return [];
    return notifyDealUpdate(db, { ...base, event: "viewing.proposed", eventKey: versionKey, time });
  }
  if (change === "confirmed" && confirmed) {
    const before = slot(previous.confirmedStartsAt, previous.confirmedEndsAt);
    const moved =
      before &&
      (before.startsAt.getTime() !== confirmed.startsAt.getTime() ||
        before.endsAt.getTime() !== confirmed.endsAt.getTime());
    return notifyDealUpdate(db, {
      ...base,
      event: moved ? "viewing.moved" : "viewing.confirmed",
      eventKey: versionKey,
      time: confirmed,
      calendar: { ...calendar, cancelled: false },
    });
  }
  if (change === "cancelled" || change === "declined") {
    const before = slot(previous.confirmedStartsAt, previous.confirmedEndsAt);
    const time = before ?? slot(previous.proposedStartsAt, previous.proposedEndsAt);
    return notifyDealUpdate(db, {
      ...base,
      event: "viewing.cancelled",
      eventKey: versionKey,
      time,
      // Only an arrangement that was confirmed is in the client's calendar to remove.
      calendar: before ? { ...calendar, cancelled: true } : null,
    });
  }
  return [];
}
