import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import {
  calendarEmailFile,
  calendarSnapshot,
  senderAddress,
} from "../appointments/calendar-contract";
import type { OutboundMessage } from "../jobs/provider";
import { emailFiles } from "./email-files-contract";

export const caseEmailTemplate = "case.reviewed-email.v1";
export const emailRecipient = z
  .object({
    subscriptionId: z.uuid(),
    subscriptionVersion: z.int().positive(),
    partyId: z.uuid(),
    contactId: z.uuid(),
    contactVersion: z.int().positive(),
    address: z.email(),
    policyVersion: z.string().min(1),
  })
  .strict();
export const emailContent = z
  .object({
    messageId: z.uuid(),
    caseId: z.uuid(),
    subject: z
      .string()
      .min(1)
      .max(200)
      .regex(/^[^\r\n]+$/),
    body: z.string().min(1).max(10000),
    recipient: emailRecipient,
    from: z
      .string()
      .min(1)
      .max(300)
      .regex(/^[^\r\n]+$/),
    replyTo: z.email(),
    calendar: calendarSnapshot.optional(),
    documents: emailFiles.optional(),
  })
  .strict();
export type EmailContent = z.infer<typeof emailContent>;
export type EmailConfig = { from: string; replyDomain: string };
export function caseEmailConfig(): EmailConfig | null {
  if (process.env.CASE_EMAIL_ENABLED !== "1") return null;
  const from = process.env.EMAIL_FROM ?? "",
    replyDomain = process.env.CASE_REPLY_DOMAIN ?? "";
  if (
    !from ||
    /[\r\n]/.test(from) ||
    !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(replyDomain)
  )
    return null;
  return { from, replyDomain };
}
export function validateCaseEmail(message: OutboundMessage, config: EmailConfig | null) {
  if (!config || message.channel !== "email" || message.template !== caseEmailTemplate) return null;
  const parsed = emailContent.safeParse(message.params);
  if (!parsed.success) return null;
  const p = parsed.data;
  if (
    p.from !== config.from ||
    p.recipient.address !== message.recipient ||
    !new RegExp(`^m-[a-f0-9]{40}@${config.replyDomain.replaceAll(".", "\\.")}$`).test(p.replyTo)
  )
    return null;
  if (
    p.calendar &&
    (p.calendar.caseId !== p.caseId || p.calendar.organizer !== senderAddress(p.from))
  )
    return null;
  return p;
}
export function renderCaseEmail(message: OutboundMessage, config: EmailConfig | null) {
  const p = validateCaseEmail(message, config);
  if (!p) return null;
  const files = p.documents ?? [];
  if (files.length !== (message.files?.length ?? 0)) return null;
  const attachments = [];
  for (const [index, file] of files.entries()) {
    const materialized = message.files?.[index];
    if (
      !materialized ||
      materialized.versionId !== file.versionId ||
      materialized.bytes.length !== file.byteSize ||
      createHash("sha256").update(materialized.bytes).digest("hex") !== file.sha256
    )
      return null;
    attachments.push({
      filename: file.fileName,
      content: Buffer.from(materialized.bytes).toString("base64"),
      content_type: file.contentType,
    });
  }
  if (p.calendar)
    attachments.push({
      filename: "appointment.ics",
      content: Buffer.from(calendarEmailFile(p.calendar, p.recipient.address)).toString("base64"),
      content_type: `text/calendar; charset=utf-8; method=${p.calendar.cancelled ? "CANCEL" : "REQUEST"}`,
    });
  return {
    subject: p.subject,
    text: p.body,
    reply_to: p.replyTo,
    ...(attachments.length ? { attachments } : {}),
  };
}
