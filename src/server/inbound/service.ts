import "server-only";
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gt, inArray, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  approvals,
  caseParticipants,
  inboundEmails,
  inboxEvents,
  messages,
  parties,
} from "@/db/schema";
import { recordAudit } from "../audit";
import type { Session } from "../auth/sessions";
import { assertCan, can } from "../authz";
import { emailContent } from "../cases/email-contract";
import { bumpCase, caseEvent, caseFor, liveParticipation } from "../cases/shared";
import { hashRequest } from "../crypto";
import type { Executor } from "../db";
import { AppError } from "../errors";
import type { ReceivingProvider } from "../jobs/resend-receiving";
import { runOperation } from "../operations";
import { liveStaff, parseInput, version } from "../work/shared";

async function triageStaff(db: Executor, session: Session) {
  const live = await liveStaff(db, session);
  // Global intake and confidential-case authority are both necessary to inspect unmatched mail.
  for (const capability of ["inquiry.assign", "case.read_internal", "message.draft"] as const)
    if (!(await can(db, live.actor, capability))) throw new AppError("not_found");
  return live;
}
async function candidate(db: Executor, recipients: string[], replyDomain: string) {
  if (!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(replyDomain)) return null;
  const addresses = recipients.filter((a) =>
    new RegExp(`^m-[a-f0-9]{40}@${replyDomain.replaceAll(".", "\\.")}$`).test(a),
  );
  if (!addresses.length) return null;
  const rows = await db
    .select({ message: messages, approval: approvals })
    .from(messages)
    .innerJoin(approvals, eq(messages.approvalId, approvals.id))
    .where(
      and(
        eq(messages.direction, "outbound"),
        eq(messages.channel, "email"),
        eq(approvals.kind, "message_send"),
        inArray(sql<string>`${approvals.scope}->'content'->>'replyTo'`, addresses),
      ),
    )
    .limit(2);
  if (rows.length !== 1) return null;
  const row = rows[0];
  if (!row) return null;
  const parsed = emailContent.safeParse(
    (row.approval.scope as { content?: unknown } | null)?.content,
  );
  if (
    !parsed.success ||
    !row.message.caseId ||
    parsed.data.caseId !== row.message.caseId ||
    parsed.data.messageId !== row.message.id ||
    hashRequest(parsed.data) !== row.approval.subjectHash ||
    row.message.approvedDigest !== row.approval.subjectHash
  )
    return null;
  return { messageId: row.message.id, caseId: row.message.caseId };
}
export async function retrieveInboundEmail(
  db: Executor,
  provider: ReceivingProvider,
  eventId: string,
  replyDomain: string,
) {
  const [event] = await db.select().from(inboxEvents).where(eq(inboxEvents.id, eventId));
  const source = z.object({ emailId: z.uuid() }).safeParse(event?.payload);
  if (
    !event?.signatureVerified ||
    event.provider !== provider.name ||
    event.eventType !== "email.received" ||
    !source.success
  )
    throw new AppError("validation_failed");
  if (event.state !== "received") return;
  const mail = await provider.retrieve(source.data.emailId);
  if (mail.id !== source.data.emailId) throw new AppError("validation_failed");
  const digest = hashRequest(mail);
  await db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(inboxEvents)
      .where(eq(inboxEvents.id, eventId))
      .for("update");
    if (current?.state !== "received") return;
    if (
      !current.signatureVerified ||
      current.provider !== event.provider ||
      current.eventType !== event.eventType ||
      hashRequest(current.payload) !== hashRequest(event.payload)
    )
      throw new AppError("version_conflict");
    const hint = await candidate(tx, mail.recipients, replyDomain);
    const [inserted] = await tx
      .insert(inboundEmails)
      .values({
        provider: provider.name,
        providerEmailId: mail.id,
        inboxEventId: eventId,
        sourceDigest: digest,
        sender: mail.from,
        senderAddress: mail.senderAddress,
        recipients: mail.recipients,
        subject: mail.subject,
        body: mail.text,
        htmlOmitted: mail.htmlOmitted,
        attachments: mail.attachments,
        authentication: mail.authentication,
        receivedAt: new Date(mail.receivedAt),
        originatingMessageId: hint?.messageId,
        suggestedCaseId: hint?.caseId,
      })
      .onConflictDoNothing({ target: [inboundEmails.provider, inboundEmails.providerEmailId] })
      .returning();
    const existing =
      inserted ??
      (
        await tx
          .select()
          .from(inboundEmails)
          .where(
            and(
              eq(inboundEmails.provider, provider.name),
              eq(inboundEmails.providerEmailId, mail.id),
            ),
          )
      )[0];
    if (!existing || existing.sourceDigest !== digest) throw new AppError("version_conflict");
    await tx
      .update(inboxEvents)
      .set({ state: "processed", processedAt: new Date(), errorCode: null })
      .where(eq(inboxEvents.id, eventId));
  });
}
export async function sweepInboundEmails(
  db: Executor,
  provider: ReceivingProvider,
  replyDomain: string,
  afterId?: string,
) {
  const rows = await db
    .select({ id: inboxEvents.id })
    .from(inboxEvents)
    .where(
      and(
        eq(inboxEvents.provider, provider.name),
        eq(inboxEvents.eventType, "email.received"),
        eq(inboxEvents.state, "received"),
        eq(inboxEvents.signatureVerified, true),
        afterId ? gt(inboxEvents.id, afterId) : undefined,
      ),
    )
    .orderBy(asc(inboxEvents.id))
    .limit(10);
  for (const { id } of rows) {
    try {
      await retrieveInboundEmail(db, provider, id, replyDomain);
    } catch {
      // Retain the signed receipt for a later read; never log raw provider text or tokens.
      await db
        .update(inboxEvents)
        .set({ errorCode: "inbound_fetch_needs_review" })
        .where(and(eq(inboxEvents.id, id), eq(inboxEvents.state, "received")));
    }
  }
  return { nextCursor: rows.length === 10 ? rows.at(-1)?.id : null };
}
export async function listInboundEmails(
  db: Executor,
  session: Session,
  query: { state?: string; after?: string } = {},
) {
  await triageStaff(db, session);
  const state = z.enum(["triage", "assigned", "rejected"]).safeParse(query.state ?? "triage");
  if (!state.success || (query.after && !z.uuid().safeParse(query.after).success))
    throw new AppError("not_found");
  const [anchor] = query.after
    ? await db.select().from(inboundEmails).where(eq(inboundEmails.id, query.after))
    : [];
  if (query.after && !anchor) throw new AppError("not_found");
  const records = await db
    .select()
    .from(inboundEmails)
    .where(
      and(
        eq(inboundEmails.state, state.data),
        anchor
          ? or(
              lt(inboundEmails.receivedAt, anchor.receivedAt),
              and(eq(inboundEmails.receivedAt, anchor.receivedAt), lt(inboundEmails.id, anchor.id)),
            )
          : undefined,
      ),
    )
    .orderBy(desc(inboundEmails.receivedAt), desc(inboundEmails.id))
    .limit(51);
  const waiting = await db
    .select({
      id: inboxEvents.id,
      errorCode: inboxEvents.errorCode,
      receivedAt: inboxEvents.receivedAt,
    })
    .from(inboxEvents)
    .where(
      and(
        eq(inboxEvents.eventType, "email.received"),
        eq(inboxEvents.state, "received"),
        eq(inboxEvents.signatureVerified, true),
      ),
    )
    .orderBy(desc(inboxEvents.receivedAt))
    .limit(50);
  return {
    records: records.slice(0, 50),
    waiting,
    state: state.data,
    next: records.length > 50 ? records[49]?.id : null,
  };
}
export async function readInboundEmail(db: Executor, session: Session, id: string) {
  await triageStaff(db, session);
  if (!z.uuid().safeParse(id).success) throw new AppError("not_found");
  const [row] = await db.select().from(inboundEmails).where(eq(inboundEmails.id, id));
  if (!row) throw new AppError("not_found");
  return row;
}
export async function reviewInboundEmail(db: Executor, session: Session, raw: unknown) {
  const input = parseInput(
    z.object({
      operationId: z.string().min(16).max(160),
      id: z.uuid(),
      expectedVersion: z.int().positive(),
      decision: z.enum(["assign", "reject"]),
      caseId: z.uuid().optional(),
      caseVersion: z.int().positive().optional(),
      partyId: z.uuid().optional(),
      reviewed: z.literal(true),
      reason: z.string().trim().min(10).max(500),
    }),
    raw,
  );
  const live = await triageStaff(db, session);
  return runOperation(
    db,
    {
      actor: live.actor,
      type: "inbound.email.review",
      idempotencyKey: input.operationId,
      requestHash: hashRequest(input),
    },
    async (ctx) => {
      await triageStaff(ctx.tx, session);
      // Case first, then inbound record: matches other Case commands and avoids inversion.
      const context =
        input.decision === "assign" && input.caseId
          ? await caseFor(ctx.tx, session, input.caseId, "message.draft", true)
          : null;
      if (context) {
        await assertCan(ctx.tx, live.actor, "case.read_internal", context.resource);
        if (!input.caseVersion) throw new AppError("validation_failed");
        version(context.row, input.caseVersion);
      }
      const [row] = await ctx.tx
        .select()
        .from(inboundEmails)
        .where(eq(inboundEmails.id, input.id))
        .for("update");
      if (!row) throw new AppError("not_found");
      version(row, input.expectedVersion);
      if (row.state !== "triage") throw new AppError("transition_denied");
      let messageId: string | null = null;
      if (input.decision === "assign") {
        if (!context || !input.partyId || !row.body?.trim())
          throw new AppError("validation_failed");
        const [party] = await ctx.tx
          .select()
          .from(parties)
          .where(eq(parties.id, input.partyId))
          .for("share");
        const participants = await ctx.tx
          .select({ id: caseParticipants.id })
          .from(caseParticipants)
          .where(
            and(
              eq(caseParticipants.caseId, context.row.id),
              eq(caseParticipants.partyId, input.partyId),
              liveParticipation(),
            ),
          )
          .for("share");
        if (!party || party.mergedIntoPartyId || !participants.length)
          throw new AppError("transition_denied");
        messageId = randomUUID();
        await ctx.tx.insert(messages).values({
          id: messageId,
          caseId: context.row.id,
          kind: "case_message",
          direction: "inbound",
          channel: "email",
          audience: "internal",
          state: "delivered",
          authorKind: "visitor",
          authorId: `inbound:${row.id}`,
          subject: row.subject,
          body: row.body,
          recipients: [],
          attachments: [],
          payloadDigest: hashRequest({
            sourceDigest: row.sourceDigest,
            caseId: context.row.id,
            partyId: input.partyId,
            audience: "internal",
          }),
        });
        await bumpCase(ctx.tx, context.row.id, context.row.version);
        await caseEvent(
          ctx,
          "case",
          context.row.id,
          "case.email_received_reviewed",
          "message.draft",
          { inboundId: row.id, messageId },
        );
      }
      await ctx.tx
        .update(inboundEmails)
        .set({
          state: input.decision === "assign" ? "assigned" : "rejected",
          caseId: context?.row.id ?? null,
          senderPartyId: input.decision === "assign" ? input.partyId : null,
          messageId,
          decidedById: live.actor.id,
          decidedAt: new Date(),
          decisionNote: input.reason,
          version: row.version + 1,
        })
        .where(eq(inboundEmails.id, row.id));
      await recordAudit(ctx.tx, {
        actor: live.actor,
        action: `inbound.email.${input.decision}`,
        recordType: "inbound_email",
        recordId: row.id,
        operationId: ctx.operationId,
        payload: { caseId: context?.row.id ?? null, messageId },
      });
      return {
        id: row.id,
        state: input.decision === "assign" ? "assigned" : "rejected",
        messageId,
      };
    },
  );
}

// Case-scoped read never exposes unmatched intake, attachment content or authentication hints.
export async function readCaseInboundEmails(db: Executor, session: Session, id: string) {
  const context = await caseFor(db, session, id);
  if (
    context.live.account.kind !== "staff" ||
    !(await can(db, context.live.actor, "case.read_internal", context.resource))
  )
    return [];
  return db
    .select({
      id: inboundEmails.id,
      subject: inboundEmails.subject,
      body: inboundEmails.body,
      sender: inboundEmails.sender,
      receivedAt: inboundEmails.receivedAt,
      participant: parties.displayName,
    })
    .from(inboundEmails)
    .innerJoin(parties, eq(parties.id, inboundEmails.senderPartyId))
    .where(and(eq(inboundEmails.caseId, id), eq(inboundEmails.state, "assigned")))
    .orderBy(desc(inboundEmails.receivedAt))
    .limit(50);
}
