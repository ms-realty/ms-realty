// Coverage notices are staging qualification only. Intake records intent; this worker never
// reads customer contact methods or messages, and sends only to one explicitly reviewed inbox.
import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { type externalActions, inquiries, outboxEvents } from "@/db/schema";
import { sourceLocale } from "@/domain/ids";
import { inquiryPurposes } from "@/domain/inquiry";
import type { HostOrigins } from "../config/hosts";
import { type Executor, inTransaction } from "../db";
import { enqueueMessage } from "../jobs/outbox";
import type { OutboundMessage } from "../jobs/provider";
import type { JobQueue } from "../jobs/queue";
import { assertRecoveryOpen } from "../recovery/quarantine";

export const inquiryCoverageNoticeTemplate = "inquiry.coverage-notice.v1";
export const inquiryCoverageNoticeSubject = "inquiry_coverage_notice";

/** No cached enablement: a queued notice cannot become a production send after promotion. */
export function inquiryCoverageNoticeConfig() {
  if (
    process.env.STAGING !== "true" ||
    process.env.INQUIRY_COVERAGE_NOTICE_ENABLED !== "1" ||
    process.env.INQUIRY_COVERAGE_TEST_INBOX_REVIEWED !== "true"
  )
    return null;
  const recipient = z.email().safeParse(process.env.INQUIRY_COVERAGE_TEST_INBOX);
  const origin = z.url().safeParse(process.env.STAFF_ORIGIN);
  if (!recipient.success || !origin.success) return null;
  const url = new URL(origin.data);
  if (url.protocol !== "https:" || url.origin !== origin.data) return null;
  return { recipient: recipient.data, queueUrl: `${url.origin}/${sourceLocale}/inquiries` };
}

const noticeParams = z
  .object({
    eventId: z.uuid(),
    inquiryId: z.uuid(),
    reference: z.string().regex(/^RQ-\d{4}-\d{6,}$/),
    coverageQueue: z.literal("intake"),
    queueUrl: z.url(),
  })
  .strict();
const receivedIntent = z
  .object({
    reference: noticeParams.shape.reference,
    purpose: z.enum(inquiryPurposes),
    coverageQueue: z.literal("intake"),
  })
  .strict();
const noticePayload = z
  .object({
    channel: z.literal("email"),
    recipient: z.email(),
    template: z.literal(inquiryCoverageNoticeTemplate),
    params: noticeParams,
  })
  .strict();

export function inquiryCoverageNoticeKey(eventId: string) {
  return `${inquiryCoverageNoticeTemplate}:${eventId}`;
}

export function validateInquiryCoverageNoticePayload(payload: unknown) {
  const config = inquiryCoverageNoticeConfig();
  const parsed = noticePayload.safeParse(payload);
  if (
    !config ||
    !parsed.success ||
    parsed.data.recipient !== config.recipient ||
    parsed.data.params.queueUrl !== config.queueUrl
  )
    return null;
  return parsed.data;
}

/** Fixed plaintext, identifiers and the canonical staff queue only; no free-form content. */
export function renderInquiryCoverageNotice(message: OutboundMessage, hosts: HostOrigins) {
  const p = validateInquiryCoverageNoticePayload({
    channel: message.channel,
    recipient: message.recipient,
    template: message.template,
    params: message.params,
  });
  if (
    !p ||
    message.secretParams !== null ||
    message.files !== undefined ||
    message.idempotencyKey !== inquiryCoverageNoticeKey(p.params.eventId) ||
    p.params.queueUrl !== `${hosts.staff}/${sourceLocale}/inquiries`
  )
    return null;
  return {
    subject: `MS Realty staging: ${p.params.reference}`,
    text: `MS Realty staging\n\n${p.params.reference}\n${p.params.inquiryId}\n${p.params.eventId}\n${p.params.coverageQueue}\n\n${p.params.queueUrl}`,
  };
}

/** Locks each pending intent and commits its one effect and dispatch job together. */
export async function sweepInquiryCoverageNotices(
  db: Executor,
  queue: JobQueue,
  options: { limit?: number; now?: Date } = {},
): Promise<number> {
  await assertRecoveryOpen(db);
  const config = inquiryCoverageNoticeConfig();
  if (!config) return 0;
  return inTransaction(db, async (tx) => {
    await assertRecoveryOpen(tx);
    const events = await tx
      .select()
      .from(outboxEvents)
      .where(
        and(
          eq(outboxEvents.eventType, "inquiry.received"),
          eq(outboxEvents.subjectType, "inquiry"),
          eq(outboxEvents.state, "pending"),
        ),
      )
      .orderBy(asc(outboxEvents.createdAt), asc(outboxEvents.id))
      .limit(options.limit ?? 50)
      .for("update", { skipLocked: true });
    let count = 0;
    for (const event of events) {
      // Retain invalid source intent as cancelled evidence so it cannot starve later work.
      const cancelIntent = () =>
        tx
          .update(outboxEvents)
          .set({ state: "cancelled", completedAt: options.now ?? new Date() })
          .where(eq(outboxEvents.id, event.id));
      const intent = receivedIntent.safeParse(event.payload);
      if (!intent.success) {
        await cancelIntent();
        continue;
      }
      // Select only routing identifiers. The intent payload is never used as message content.
      const [inquiry] = await tx
        .select({
          id: inquiries.id,
          reference: inquiries.reference,
          purpose: inquiries.purpose,
        })
        .from(inquiries)
        .where(eq(inquiries.id, event.subjectId))
        .for("share");
      if (
        !inquiry ||
        inquiry.reference !== intent.data.reference ||
        inquiry.purpose !== intent.data.purpose
      ) {
        await cancelIntent();
        continue;
      }
      const params = noticeParams.parse({
        eventId: event.id,
        inquiryId: inquiry.id,
        reference: inquiry.reference,
        coverageQueue: intent.data.coverageQueue,
        queueUrl: config.queueUrl,
      });
      const action = await enqueueMessage(tx, {
        idempotencyKey: inquiryCoverageNoticeKey(event.id),
        channel: "email",
        recipient: config.recipient,
        template: inquiryCoverageNoticeTemplate,
        params,
        outboxEventId: event.id,
        subject: { type: inquiryCoverageNoticeSubject, id: inquiry.id },
      });
      // A pending event with an existing effect needs reconciliation, never an automatic replay.
      if (!action.created) throw new Error("Inquiry notice effect already exists without binding.");
      const jobId = await queue.send("outbox.dispatch", { outboxId: action.id }, { db: tx });
      if (!jobId) throw new Error("Inquiry notice dispatch job was not created.");
      await tx
        .update(outboxEvents)
        .set({ state: "dispatched", dispatchJobId: jobId, dispatchedAt: options.now ?? new Date() })
        .where(eq(outboxEvents.id, event.id));
      count += 1;
    }
    return count;
  });
}

/** The ledger guard runs before claiming an effect, including with local/test providers. */
export async function inquiryCoverageNoticeActionIsValid(
  db: Executor,
  row: typeof externalActions.$inferSelect,
): Promise<boolean> {
  const p = validateInquiryCoverageNoticePayload(row.payload);
  if (
    !p ||
    row.secretPayload !== null ||
    row.subjectType !== inquiryCoverageNoticeSubject ||
    row.subjectId !== p.params.inquiryId ||
    row.outboxEventId !== p.params.eventId ||
    row.effectKey !== inquiryCoverageNoticeKey(p.params.eventId)
  )
    return false;
  const [event] = await db
    .select({
      subjectId: outboxEvents.subjectId,
      state: outboxEvents.state,
      payload: outboxEvents.payload,
    })
    .from(outboxEvents)
    .where(
      and(
        eq(outboxEvents.id, p.params.eventId),
        eq(outboxEvents.eventType, "inquiry.received"),
        eq(outboxEvents.subjectType, "inquiry"),
      ),
    );
  const [inquiry] = await db
    .select({ reference: inquiries.reference, purpose: inquiries.purpose })
    .from(inquiries)
    .where(eq(inquiries.id, p.params.inquiryId));
  const intent = receivedIntent.safeParse(event?.payload);
  return (
    event?.subjectId === p.params.inquiryId &&
    event.state === "dispatched" &&
    intent.success &&
    inquiry?.reference === p.params.reference &&
    inquiry.purpose === intent.data.purpose &&
    intent.data.reference === p.params.reference &&
    intent.data.coverageQueue === p.params.coverageQueue
  );
}
