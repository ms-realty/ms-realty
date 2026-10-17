import "server-only";
import { z } from "zod";
import { calendarFile } from "./time";

export const calendarSnapshot = z
  .object({
    kind: z.literal("appointment_calendar"),
    appointmentId: z.uuid(),
    appointmentVersion: z.int().positive(),
    caseId: z.uuid(),
    reference: z.string().min(1).max(100),
    uid: z
      .string()
      .min(1)
      .max(200)
      .regex(/^[a-zA-Z0-9._@-]+$/),
    sequence: z.int().nonnegative(),
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    cancelled: z.boolean(),
    organizer: z.email(),
  })
  .strict();
export type CalendarSnapshot = z.infer<typeof calendarSnapshot>;
export function senderAddress(from: string): string | null {
  const value = from.trim();
  const raw = value.match(/^[^<>\r\n]+<([^<>\r\n]+)>$/)?.[1] ?? value;
  const parsed = z.email().safeParse(raw);
  return parsed.success ? parsed.data.toLowerCase() : null;
}
export function calendarEmailFile(value: CalendarSnapshot, recipient: string) {
  const checked = calendarSnapshot.parse(value);
  return calendarFile({
    uid: checked.uid,
    sequence: checked.sequence,
    reference: checked.reference,
    start: new Date(checked.startsAt),
    end: new Date(checked.endsAt),
    updatedAt: new Date(checked.updatedAt),
    cancelled: checked.cancelled,
    invitation: { organizer: checked.organizer, attendee: z.email().parse(recipient) },
  });
}
