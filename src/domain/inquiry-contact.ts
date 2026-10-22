// O03 / AT14: a human's observed contact is separate from delivery telemetry and auto-receipts.
import { z } from "zod";
import { contactMethodKinds } from "./parties";

export const inquiryContactResults = ["unanswered", "useful_response"] as const;
export const inquiryContactSchema = z.object({
  schemaVersion: z.literal(1),
  result: z.enum(inquiryContactResults),
  contactedAt: z.iso.datetime({ offset: true }),
  note: z.string().min(10).max(2000),
  contact: z.object({
    id: z.uuid(),
    partyId: z.uuid(),
    version: z.number().int().positive(),
    kind: z.enum(contactMethodKinds),
    value: z.string().min(1),
  }),
  taskId: z.uuid(),
  nextAction: z.string().min(3).max(500),
  dueAt: z.iso.datetime({ offset: true }),
  promisedToClient: z.boolean(),
});
export type InquiryContactObservation = z.infer<typeof inquiryContactSchema>;

/** Only a contact event's known, typed fields may enter the private business timeline. */
export function readInquiryContact(messageKey: string, params: unknown) {
  if (messageKey !== "work.inquiry.contact_recorded") return null;
  const result = inquiryContactSchema.safeParse(params);
  return result.success ? result.data : null;
}
