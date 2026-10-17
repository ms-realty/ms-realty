// Only application-generated calendar content can enter a reviewed Case email.
import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { appointmentParticipants, appointments, messages } from "@/db/schema";
import type { Session } from "../auth/sessions";
import { hashRequest } from "../crypto";
import type { Executor } from "../db";
import { AppError } from "../errors";
import { type CalendarSnapshot, calendarSnapshot } from "./calendar-contract";
import { appointmentFor } from "./service";

function snapshot(row: typeof appointments.$inferSelect, organizer: string) {
  if (
    !row.caseId ||
    !row.confirmedStartsAt ||
    !row.confirmedEndsAt ||
    !["confirmed", "reschedule_requested", "cancelled"].includes(row.state)
  )
    return null;
  const parsed = calendarSnapshot.safeParse({
    kind: "appointment_calendar",
    appointmentId: row.id,
    appointmentVersion: row.version,
    caseId: row.caseId,
    reference: row.reference,
    uid: row.icsUid,
    sequence: row.icsSequence,
    startsAt: row.confirmedStartsAt.toISOString(),
    endsAt: row.confirmedEndsAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    cancelled: row.state === "cancelled",
    organizer,
  });
  return parsed.success ? parsed.data : null;
}
async function hasParticipant(db: Executor, id: string, partyId: string, lock: boolean) {
  const query = db
    .select({ id: appointmentParticipants.id })
    .from(appointmentParticipants)
    .where(
      and(
        eq(appointmentParticipants.appointmentId, id),
        eq(appointmentParticipants.partyId, partyId),
      ),
    );
  return (await (lock ? query.for("share") : query)).length > 0;
}
export async function freezeCalendar(
  db: Executor,
  session: Session,
  caseId: string,
  id: string,
  partyId: string,
  organizer: string | null,
) {
  if (!organizer) throw new AppError("unavailable");
  const { row } = await appointmentFor(db, session, id, true, true);
  const value = snapshot(row, organizer);
  if (!value || row.caseId !== caseId || !(await hasParticipant(db, id, partyId, true)))
    throw new AppError("transition_denied");
  // Changing the organizer of an established UID requires a separate explicit migration.
  const previous = await db
    .select({ attachments: messages.attachments })
    .from(messages)
    .where(
      and(eq(messages.caseId, caseId), sql`${messages.attachments}->0->>'appointmentId' = ${id}`),
    )
    .limit(1);
  if (previous.length) {
    const prior = calendarSnapshot.array().length(1).safeParse(previous[0]?.attachments);
    if (!prior.success || prior.data[0]?.organizer !== organizer)
      throw new AppError("transition_denied");
  }
  return value;
}
export async function currentCalendar(db: Executor, value: CalendarSnapshot, partyId: string) {
  const [row] = await db
    .select()
    .from(appointments)
    .where(eq(appointments.id, value.appointmentId))
    .for("update");
  if (!row || !(await hasParticipant(db, row.id, partyId, true))) return false;
  const current = snapshot(row, value.organizer);
  return Boolean(current && hashRequest(current) === hashRequest(value));
}
