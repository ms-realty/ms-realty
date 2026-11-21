// Send-time recheck for deal notices. The outbox claims a notice only when the recipient is
// still eligible, still entitled to the Deal and the notice still describes the current record;
// otherwise it is cancelled with a reason and no provider call happens.
import "server-only";
import { and, asc, eq, or, sql } from "drizzle-orm";
import { serviceNotificationEnabled } from "@/config/tenant";
import { appointments, cases, externalActions } from "@/db/schema";
import { getEnv } from "../config/env";
import type { HostOrigins } from "../config/hosts";
import type { Database, Executor } from "../db";
import type { MessageProvider } from "../jobs/provider";
import { dealNoticeSubject, dealNoticeTemplate } from "./events";
import { inquiryAcknowledgementSubject, inquiryAcknowledgementTemplate } from "./inquiry";
import { resolveClientRecipient, resolveStaffRecipient } from "./notify";
import { dealNoticePayload, validDealNoticeParams } from "./template";

export function isDealNotice(row: { subjectType: string | null; payload: unknown }) {
  return (
    row.subjectType === dealNoticeSubject ||
    (row.payload as { template?: unknown } | null)?.template === dealNoticeTemplate
  );
}

/** Null when the notice may be sent now; otherwise the reason it must be cancelled. */
export async function dealNoticeBlocker(
  db: Executor,
  row: typeof externalActions.$inferSelect,
  hosts: HostOrigins = getEnv().hosts,
): Promise<string | null> {
  const parsed = dealNoticePayload.safeParse(row.payload);
  if (
    !parsed.success ||
    row.kind !== "email_send" ||
    row.subjectType !== dealNoticeSubject ||
    row.secretPayload !== null ||
    row.subjectId !== parsed.data.params.caseId ||
    !validDealNoticeParams(parsed.data.params, hosts)
  )
    return "deal_notice_invalid";
  const p = parsed.data.params;
  if (!serviceNotificationEnabled(p.event)) return "deal_notice_disabled";
  const [record] = await db
    .select({ ownerId: cases.ownerId })
    .from(cases)
    .where(eq(cases.id, p.caseId))
    .for("share");
  if (!record) return "deal_notice_invalid";
  if (p.recipient.kind === "client") {
    const found = await resolveClientRecipient(db, p.caseId, p.recipient.partyId);
    if (found.reason) return `deal_notice_${found.reason}`;
    if (
      found.principal.id !== p.recipient.principalId ||
      found.basis !== p.recipient.basis ||
      found.choice?.subscriptionId !== p.recipient.subscriptionId ||
      found.choice?.subscriptionVersion !== p.recipient.subscriptionVersion ||
      found.contactId !== p.recipient.contactId ||
      found.contactVersion !== p.recipient.contactVersion ||
      found.address !== parsed.data.recipient
    )
      return "deal_notice_recipient_changed";
  } else {
    if (record.ownerId !== p.recipient.principalId) return "deal_notice_recipient_changed";
    const found = await resolveStaffRecipient(db, p.recipient.principalId);
    if (found.reason) return `deal_notice_${found.reason}`;
    if (found.principal.email !== parsed.data.recipient) return "deal_notice_recipient_changed";
  }
  if (p.calendar) {
    // A later change (a new time, a cancellation) carries a higher SEQUENCE and its own notice.
    const [appointment] = await db
      .select({ sequence: appointments.icsSequence, uid: appointments.icsUid })
      .from(appointments)
      .where(eq(appointments.id, p.subject.id))
      .for("share");
    if (appointment?.uid !== p.calendar.uid || appointment.sequence !== p.calendar.sequence)
      return "deal_notice_superseded";
  }
  return null;
}

/** Dispatches queued deal notices only, oldest first: the prompt path after a change. */
export async function dispatchDealNotices(
  db: Database,
  provider: MessageProvider,
  limit = 50,
): Promise<number> {
  const { dispatchMessage } = await import("../jobs/outbox");
  const rows = await db
    .select({ id: externalActions.id })
    .from(externalActions)
    .where(
      and(
        eq(externalActions.kind, "email_send"),
        eq(externalActions.state, "queued"),
        or(
          and(
            eq(externalActions.subjectType, dealNoticeSubject),
            sql`${externalActions.payload}->>'template' = ${dealNoticeTemplate}`,
          ),
          and(
            eq(externalActions.subjectType, inquiryAcknowledgementSubject),
            sql`${externalActions.payload}->>'template' = ${inquiryAcknowledgementTemplate}`,
          ),
        ),
      ),
    )
    .orderBy(asc(externalActions.createdAt), asc(externalActions.id))
    .limit(limit);
  for (const { id } of rows) await dispatchMessage(db, provider, id);
  return rows.length;
}
