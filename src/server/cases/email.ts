// Exact human-reviewed Case correspondence. No transport effect occurs while drafting.
import "server-only";
import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import {
  approvals,
  caseParticipants,
  contactMethods,
  externalActions,
  messages,
  parties,
  subscriptions,
} from "@/db/schema";
import { publicLocales } from "@/domain/ids";
import { calendarSnapshot, senderAddress } from "../appointments/calendar-contract";
import { currentCalendar, freezeCalendar } from "../appointments/email-calendar";
import { listAppointments } from "../appointments/service";
import type { Session } from "../auth/sessions";
import { assertCan, can } from "../authz";
import { getEnv } from "../config/env";
import { hashRequest, keyedHash } from "../crypto";
import type { Executor } from "../db";
import { AppError } from "../errors";
import { enqueueMessage } from "../jobs/outbox";
import { runOperation } from "../operations";
import { consentPolicyKey, consentTerms } from "../privacy/preferences";
import { commandEnvelope, parseInput, version } from "../work/shared";
import {
  caseEmailConfig,
  caseEmailTemplate,
  type EmailConfig,
  emailContent,
  emailRecipient,
} from "./email-contract";
import { currentEmailFiles, freezeEmailFiles, listEmailFiles } from "./email-files";
import { emailFile } from "./email-files-contract";
import { bumpCase, caseEvent, caseFor, liveParticipation } from "./shared";

export async function eligibleCaseRecipient(
  db: Executor,
  caseId: string,
  subscriptionId: string,
  lock = false,
) {
  const sq = db.select().from(subscriptions).where(eq(subscriptions.id, subscriptionId));
  const [subscription] = await (lock ? sq.for("update") : sq);
  if (
    subscription?.purpose !== "service_updates" ||
    subscription.state !== "active" ||
    !subscription.verifiedAt ||
    !subscription.policyVersion
  )
    return null;
  const locale = z.enum(publicLocales).safeParse(subscription.policyVersion.split(":").at(-1));
  const terms = locale.success
    ? await consentTerms(db, "service_updates", locale.data, lock)
    : null;
  if (!terms || consentPolicyKey(terms) !== subscription.policyVersion) return null;
  const cq = db
    .select()
    .from(contactMethods)
    .where(eq(contactMethods.id, subscription.contactMethodId));
  const [contact] = await (lock ? cq.for("share") : cq);
  const pq = db.select().from(parties).where(eq(parties.id, subscription.partyId));
  const [party] = await (lock ? pq.for("share") : pq);
  const aq = db
    .select()
    .from(caseParticipants)
    .where(
      and(
        eq(caseParticipants.caseId, caseId),
        eq(caseParticipants.partyId, subscription.partyId),
        liveParticipation(),
      ),
    );
  const participants = await (lock ? aq.for("share") : aq);
  if (
    !party ||
    party.mergedIntoPartyId ||
    !participants.length ||
    !contact ||
    contact.kind !== "email" ||
    contact.verification !== "verified" ||
    !contact.verifiedAt ||
    contact.lastFailureAt ||
    contact.partyId !== party.id ||
    !z.email().safeParse(contact.value).success
  )
    return null;
  return {
    subscriptionId,
    subscriptionVersion: subscription.version,
    partyId: party.id,
    contactId: contact.id,
    contactVersion: contact.version,
    address: contact.value,
    policyVersion: subscription.policyVersion,
  };
}
const draftShape = z
  .object({
    ...commandEnvelope,
    subscriptionId: z.uuid().optional(),
    subscriptionIds: z
      .array(z.uuid())
      .min(1)
      .max(10)
      .refine((ids) => new Set(ids).size === ids.length)
      .optional(),
    appointmentId: z.uuid().optional(),
    documentVersionIds: z
      .array(z.uuid())
      .max(5)
      .refine((ids) => new Set(ids).size === ids.length)
      .default([]),
    subject: emailContent.shape.subject,
    body: emailContent.shape.body,
  })
  .refine((value) => Boolean(value.subscriptionId) !== Boolean(value.subscriptionIds), {
    path: ["subscriptionIds"],
    message: "Choose one to ten distinct recipients",
  });
function contentOf(row: typeof messages.$inferSelect, config: EmailConfig) {
  const recipients = z.array(emailRecipient).length(1).parse(row.recipients);
  const attached = z.array(z.union([calendarSnapshot, emailFile])).parse(row.attachments);
  const calendars = attached.filter((item) => !("kind" in item && item.kind === "document"));
  if (calendars.length > 1) throw new AppError("validation_failed");
  const documents = attached.filter(
    (item): item is z.infer<typeof emailFile> => "kind" in item && item.kind === "document",
  );
  return emailContent.parse({
    messageId: row.id,
    caseId: row.caseId,
    subject: row.subject,
    body: row.body,
    recipient: recipients[0],
    ...(calendars[0] ? { calendar: calendars[0] } : {}),
    ...(documents.length ? { documents } : {}),
    from: config.from,
    replyTo: `m-${keyedHash(getEnv().authSecret, `case-email:${row.id}`).slice(0, 40)}@${config.replyDomain}`,
  });
}
export async function draftCaseEmail(
  db: Executor,
  session: Session,
  raw: unknown,
  organizer = senderAddress(process.env.EMAIL_FROM ?? ""),
) {
  const input = parseInput(draftShape, raw);
  if (session.account.kind !== "staff") throw new AppError("not_found");
  const { live } = await caseFor(db, session, input.id, "message.draft");
  return runOperation(
    db,
    {
      actor: live.actor,
      type: "case.email.draft",
      idempotencyKey: input.operationId,
      requestHash: hashRequest(input),
    },
    async (ctx) => {
      const { row } = await caseFor(ctx.tx, session, input.id, "message.draft", true);
      version(row, input.expectedVersion);
      const messageIds: string[] = [];
      const addresses = new Set<string>();
      for (const subscriptionId of input.subscriptionIds ?? [input.subscriptionId as string]) {
        const recipient = await eligibleCaseRecipient(ctx.tx, row.id, subscriptionId, true);
        if (!recipient) throw new AppError("transition_denied");
        const address = recipient.address.toLowerCase();
        if (addresses.has(address))
          throw new AppError("validation_failed", {
            fieldErrors: { subscriptionIds: ["Choose each email address once"] },
          });
        addresses.add(address);
        const calendar = input.appointmentId
          ? await freezeCalendar(
              ctx.tx,
              session,
              row.id,
              input.appointmentId,
              recipient.partyId,
              organizer,
            )
          : null;
        const documents = await freezeEmailFiles(
          ctx.tx,
          live.actor,
          row.id,
          recipient.partyId,
          input.documentVersionIds,
        );
        const id = randomUUID();
        await ctx.tx.insert(messages).values({
          id,
          caseId: row.id,
          kind: "case_message",
          direction: "outbound",
          channel: "email",
          audience: "case_participants",
          state: "draft",
          authorKind: "staff",
          authorId: live.actor.id,
          subject: input.subject,
          body: input.body,
          recipients: [recipient],
          attachments: [...(calendar ? [calendar] : []), ...documents],
          payloadDigest: hashRequest({
            subject: input.subject,
            body: input.body,
            recipient,
            ...(calendar ? { calendar } : {}),
            ...(documents.length ? { documents } : {}),
          }),
        });
        messageIds.push(id);
        await caseEvent(ctx, "case", row.id, "case.email_drafted", "message.draft", {
          messageId: id,
        });
      }
      await bumpCase(ctx.tx, row.id, row.version);
      return {
        id: row.id,
        messageId: messageIds[0] as string,
        messageIds,
        reference: row.reference,
        version: row.version + 1,
        recordedAt: new Date().toISOString(),
      };
    },
  );
}
export async function caseEmailWorkbench(
  db: Executor,
  session: Session,
  id: string,
  config = caseEmailConfig(),
) {
  if (session.account.kind !== "staff") throw new AppError("not_found");
  const { row, live, resource } = await caseFor(db, session, id, "message.draft");
  const candidates = await db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .innerJoin(caseParticipants, eq(caseParticipants.partyId, subscriptions.partyId))
    .where(
      and(
        eq(caseParticipants.caseId, id),
        liveParticipation(),
        eq(subscriptions.purpose, "service_updates"),
      ),
    );
  const recipients: z.infer<typeof emailRecipient>[] = [];
  for (const candidate of candidates) {
    if (recipients.some((r) => r.subscriptionId === candidate.id)) continue;
    const r = await eligibleCaseRecipient(db, id, candidate.id);
    if (r) recipients.push(r);
  }
  const drafts = await db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.caseId, id),
        eq(messages.channel, "email"),
        eq(messages.direction, "outbound"),
      ),
    )
    // Multi-recipient drafts share one transaction timestamp; keep their order stable.
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(50);
  const items = [];
  for (const message of drafts) {
    let content = null;
    let approvedAt: Date | null = null;
    if (message.state === "draft" && config) {
      try {
        content = contentOf(message, config);
      } catch {
        /* Invalid historical draft is not sendable. */
      }
    } else if (message.approvalId) {
      const [approval] = await db
        .select()
        .from(approvals)
        .where(eq(approvals.id, message.approvalId));
      const parsed = emailContent.safeParse(
        (approval?.scope as { content?: unknown } | null)?.content,
      );
      if (parsed.success) {
        content = parsed.data;
        approvedAt = approval?.decidedAt ?? null;
      }
    }
    const [delivery] = await db
      .select()
      .from(externalActions)
      .where(
        and(eq(externalActions.subjectType, "message"), eq(externalActions.subjectId, message.id)),
      )
      .limit(1);
    items.push({
      message,
      content,
      approvedAt,
      reviewHash: message.state === "draft" && content ? hashRequest(content) : null,
      delivery,
    });
  }
  return {
    record: row,
    calendarOptions: (await listAppointments(db, session, id)).filter(
      (a) =>
        ["confirmed", "reschedule_requested", "cancelled"].includes(a.state) && a.confirmedStartsAt,
    ),
    recipients,
    documentOptions: await listEmailFiles(
      db,
      live.actor,
      id,
      recipients.map((r) => r.partyId),
    ),
    items,
    enabled: Boolean(config),
    canSend: await can(db, live.actor, "message.send_external", resource),
  };
}
export async function approveCaseEmail(
  db: Executor,
  session: Session,
  raw: unknown,
  config = caseEmailConfig(),
) {
  const input = parseInput(
    z.object({
      ...commandEnvelope,
      messageId: z.uuid(),
      messageVersion: z.int().positive(),
      reviewHash: z.string().regex(/^[a-f0-9]{64}$/),
      reviewed: z.literal(true),
    }),
    raw,
  );
  if (session.account.kind !== "staff") throw new AppError("not_found");
  if (!config) throw new AppError("unavailable");
  const { live } = await caseFor(db, session, input.id, "message.send_external");
  return runOperation(
    db,
    {
      actor: live.actor,
      type: "case.email.approve",
      idempotencyKey: input.operationId,
      requestHash: hashRequest(input),
    },
    async (ctx) => {
      const { row } = await caseFor(ctx.tx, session, input.id, "message.send_external", true);
      version(row, input.expectedVersion);
      const [message] = await ctx.tx
        .select()
        .from(messages)
        .where(
          and(
            eq(messages.id, input.messageId),
            eq(messages.caseId, row.id),
            eq(messages.channel, "email"),
          ),
        )
        .for("update");
      if (message?.state !== "draft") throw new AppError("transition_denied");
      version(message, input.messageVersion);
      const content = contentOf(message, config),
        digest = hashRequest(content);
      if (digest !== input.reviewHash) throw new AppError("version_conflict");
      const current = await eligibleCaseRecipient(
        ctx.tx,
        row.id,
        content.recipient.subscriptionId,
        true,
      );
      if (!current || hashRequest(current) !== hashRequest(content.recipient))
        throw new AppError("version_conflict");
      if (
        !(await currentEmailFiles(
          ctx.tx,
          live.actor,
          row.id,
          current.partyId,
          content.documents ?? [],
        ))
      )
        throw new AppError("version_conflict");
      if (content.calendar) {
        await assertCan(ctx.tx, live.actor, "appointment.manage", {
          type: "appointment",
          id: content.calendar.appointmentId,
          caseId: row.id,
          audience: "case_participants",
        });
        if (
          content.calendar.organizer !== senderAddress(config.from) ||
          !(await currentCalendar(ctx.tx, content.calendar, current.partyId))
        )
          throw new AppError("version_conflict");
      }
      const [approval] = await ctx.tx
        .insert(approvals)
        .values({
          kind: "message_send",
          state: "approved",
          subjectType: "message",
          subjectId: message.id,
          subjectVersion: message.version,
          subjectHash: digest,
          scope: { channel: "email", content },
          requestedByKind: "staff",
          requestedById: message.authorId,
          decidedByKind: "staff",
          decidedById: live.actor.id,
          decidedWithCapability: "message.send_external",
          decidedAt: new Date(),
          decisionNote: "Human reviewed exact email recipient and content",
        })
        .returning();
      if (!approval) throw new Error("No message approval");
      const logicalSendId = `case-email:${message.id}`;
      await ctx.tx
        .update(messages)
        .set({
          state: "queued",
          payloadDigest: digest,
          approvedDigest: digest,
          approvalId: approval.id,
          logicalSendId,
          version: message.version + 1,
          updatedAt: new Date(),
        })
        .where(eq(messages.id, message.id));
      const action = await enqueueMessage(ctx.tx, {
        idempotencyKey: logicalSendId,
        messageId: message.id,
        channel: "email",
        recipient: content.recipient.address,
        template: caseEmailTemplate,
        params: content,
      });
      await bumpCase(ctx.tx, row.id, row.version);
      await caseEvent(ctx, "case", row.id, "case.email_queued", "message.send_external", {
        messageId: message.id,
        actionId: action.id,
      });
      return {
        id: row.id,
        messageId: message.id,
        actionId: action.id,
        reference: row.reference,
        version: row.version + 1,
        recordedAt: new Date().toISOString(),
      };
    },
  );
}
