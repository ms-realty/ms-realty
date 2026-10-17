// Durably claim before external I/O; hold current recipient/authority fences for the handoff.
import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import {
  approvals,
  cases,
  externalActions,
  grants,
  messageAttempts,
  messages,
  passkeys,
  principals,
  staffMemberships,
} from "@/db/schema";
import { canonicalJson } from "@/domain/approval";
import type { ExternalActionState } from "@/domain/external-action";
import { maxDeliveryAttempts, providerIdempotencyWindowMs } from "@/domain/message";
import { senderAddress } from "../appointments/calendar-contract";
import { currentCalendar } from "../appointments/email-calendar";
import { countActivePasskeys, staffPasskeyMinimum } from "../auth/passkeys";
import { can } from "../authz";
import { hashRequest } from "../crypto";
import type { Database, Executor } from "../db";
import { AppError } from "../errors";
import { fileServices } from "../files/config";
import type { FileStorage } from "../files/storage";
import type { MessageProvider, ProviderResult } from "../jobs/provider";
import { assertRecoveryOpen } from "../recovery/quarantine";
import { eligibleCaseRecipient } from "./email";
import {
  caseEmailConfig,
  caseEmailTemplate,
  type EmailConfig,
  emailContent,
  validateCaseEmail,
} from "./email-contract";
import { currentEmailFiles, loadEmailFiles } from "./email-files";

type Action = typeof externalActions.$inferSelect;
async function current(db: Executor, row: Action, config: EmailConfig) {
  if (row.kind !== "email_send" || row.subjectType !== "message" || !row.subjectId) return null;
  const [hint] = await db
    .select({ caseId: messages.caseId })
    .from(messages)
    .where(eq(messages.id, row.subjectId));
  if (!hint?.caseId) return null;
  await db.select({ id: cases.id }).from(cases).where(eq(cases.id, hint.caseId)).for("update");
  const [message] = await db.select().from(messages).where(eq(messages.id, row.subjectId));
  if (
    message?.channel !== "email" ||
    message.kind !== "case_message" ||
    message.direction !== "outbound" ||
    message.audience !== "case_participants" ||
    !message.caseId ||
    !message.approvalId
  )
    return null;
  if (message.caseId !== hint.caseId) return null;
  const [approval] = await db
    .select()
    .from(approvals)
    .where(eq(approvals.id, message.approvalId))
    .for("share");
  if (
    approval?.kind !== "message_send" ||
    approval.state !== "approved" ||
    approval.subjectType !== "message" ||
    approval.subjectId !== message.id ||
    approval.subjectVersion !== message.version - 1 ||
    approval.decidedWithCapability !== "message.send_external" ||
    approval.decidedByKind !== "staff" ||
    !approval.decidedById
  )
    return null;
  const scope = (approval.scope ?? {}) as { content?: unknown };
  const parsed = emailContent.safeParse(scope.content);
  if (!parsed.success) return null;
  const content = parsed.data,
    digest = hashRequest(content);
  if (
    content.caseId !== message.caseId ||
    content.messageId !== message.id ||
    content.from !== config.from ||
    !content.replyTo.endsWith(`@${config.replyDomain}`) ||
    message.subject !== content.subject ||
    message.body !== content.body ||
    canonicalJson(message.recipients) !== canonicalJson([content.recipient]) ||
    canonicalJson(message.attachments) !==
      canonicalJson([
        ...(content.calendar ? [content.calendar] : []),
        ...(content.documents ?? []),
      ]) ||
    message.payloadDigest !== digest ||
    message.approvedDigest !== digest ||
    approval.subjectHash !== digest ||
    row.effectKey !== message.logicalSendId
  )
    return null;
  const payload = {
    channel: "email",
    recipient: content.recipient.address,
    template: caseEmailTemplate,
    params: content,
  };
  if (
    row.payloadDigest !== hashRequest(payload) ||
    canonicalJson(row.payload) !== canonicalJson(payload)
  )
    return null;
  if (
    !validateCaseEmail(
      {
        outboxId: row.id,
        idempotencyKey: row.effectKey,
        channel: "email",
        recipient: content.recipient.address,
        template: caseEmailTemplate,
        params: content,
        secretParams: null,
      },
      config,
    )
  )
    return null;
  const recipient = await eligibleCaseRecipient(
    db,
    message.caseId,
    content.recipient.subscriptionId,
    true,
  );
  if (!recipient || hashRequest(recipient) !== hashRequest(content.recipient)) return null;
  const actor = { kind: "staff" as const, id: approval.decidedById };
  await db
    .select({ id: principals.id })
    .from(principals)
    .where(eq(principals.id, actor.id))
    .for("share");
  await db
    .select({ id: staffMemberships.id })
    .from(staffMemberships)
    .where(eq(staffMemberships.principalId, actor.id))
    .for("share");
  await db
    .select({ id: grants.id })
    .from(grants)
    .where(eq(grants.principalId, actor.id))
    .orderBy(grants.id)
    .for("share");
  await db
    .select({ id: passkeys.id })
    .from(passkeys)
    .where(and(eq(passkeys.principalId, actor.id), isNull(passkeys.revokedAt)))
    .orderBy(passkeys.id)
    .for("share");
  if (
    !(await can(db, actor, "case.read", {
      type: "case",
      id: message.caseId,
      audience: "case_participants",
    })) ||
    !(await can(db, actor, "message.send_external", {
      type: "case",
      id: message.caseId,
      audience: "case_participants",
    })) ||
    (await countActivePasskeys(db, actor.id)) < staffPasskeyMinimum
  )
    return null;
  if (
    content.calendar &&
    (content.calendar.organizer !== senderAddress(config.from) ||
      !(await can(db, actor, "appointment.manage", {
        type: "appointment",
        id: content.calendar.appointmentId,
        caseId: message.caseId,
        audience: "case_participants",
      })) ||
      !(await currentCalendar(db, content.calendar, content.recipient.partyId)))
  )
    return null;
  if (
    !(await currentEmailFiles(
      db,
      actor,
      message.caseId,
      recipient.partyId,
      content.documents ?? [],
    ))
  )
    return null;
  return content;
}
async function cancel(db: Executor, row: Action, code: string) {
  await db
    .update(externalActions)
    .set({
      state: "cancelled",
      lastErrorCode: code,
      secretPayload: null,
      updatedAt: new Date(),
      version: sql`${externalActions.version}+1`,
    })
    .where(
      and(eq(externalActions.id, row.id), sql`${externalActions.state} in ('queued','attempting')`),
    );
  if (row.subjectId)
    await db
      .update(messages)
      .set({ state: "failed", updatedAt: new Date() })
      .where(eq(messages.id, row.subjectId));
  await db
    .update(messageAttempts)
    .set({ state: "failed", errorCode: code, failedAt: new Date() })
    .where(
      and(eq(messageAttempts.externalActionId, row.id), eq(messageAttempts.state, "attempting")),
    );
  return "cancelled" as const;
}
async function load(db: Executor, id: string) {
  const [row] = await db.select().from(externalActions).where(eq(externalActions.id, id));
  if (!row) throw new AppError("not_found");
  return row;
}
export async function dispatchCaseEmail(
  db: Database,
  provider: MessageProvider,
  id: string,
  options: { config?: EmailConfig | null; now?: Date; storage?: FileStorage } = {},
) {
  await assertRecoveryOpen(db);
  const config = options.config === undefined ? caseEmailConfig() : options.config,
    now = options.now ?? new Date();
  if (!config) return (await load(db, id)).state;
  const claimed = await db.transaction(async (tx) => {
    const hint = await load(tx, id);
    const payload = await current(tx, hint, config);
    const [row] = await tx
      .select()
      .from(externalActions)
      .where(eq(externalActions.id, id))
      .for("update");
    if (!row) throw new AppError("not_found");
    if (row.state !== "queued") return { row, claimed: false };
    if (row.version !== hint.version) return { row, claimed: false };
    if (!payload || canonicalJson(row.payload) !== canonicalJson(hint.payload))
      return {
        row: { ...row, state: await cancel(tx, row, "case_email_eligibility_changed") },
        claimed: false,
      };
    if (row.attempts >= maxDeliveryAttempts)
      return {
        row: { ...row, state: await cancel(tx, row, "attempt_limit_reached") },
        claimed: false,
      };
    if (
      row.firstAttemptAt &&
      now.getTime() - row.firstAttemptAt.getTime() >= providerIdempotencyWindowMs
    )
      return {
        row: { ...row, state: await cancel(tx, row, "retry_window_expired") },
        claimed: false,
      };
    const [updated] = await tx
      .update(externalActions)
      .set({
        state: "attempting",
        attempts: row.attempts + 1,
        provider: provider.name,
        firstAttemptAt: row.firstAttemptAt ?? now,
        lastAttemptAt: now,
        secretPayload: null,
        version: row.version + 1,
        updatedAt: now,
      })
      .where(eq(externalActions.id, id))
      .returning();
    if (!updated) throw new Error("No claimed action");
    await tx.insert(messageAttempts).values({
      messageId: payload.messageId,
      recipient: payload.recipient.address,
      attemptNumber: updated.attempts,
      externalActionId: id,
      provider: provider.name,
      providerIdempotencyKey: row.effectKey,
      state: "attempting",
      attemptedAt: now,
    });
    await tx
      .update(messages)
      .set({ state: "attempting", updatedAt: now })
      .where(eq(messages.id, payload.messageId));
    return { row: updated, claimed: true };
  });
  if (!claimed.claimed) return claimed.row.state;
  return db.transaction(async (tx) => {
    const content = await current(tx, claimed.row, config);
    const [row] = await tx
      .select()
      .from(externalActions)
      .where(eq(externalActions.id, id))
      .for("update");
    if (!row) throw new AppError("not_found");
    if (row.state !== "attempting" || row.version !== claimed.row.version) return row.state;
    if (!content) return cancel(tx, row, "case_email_eligibility_changed");
    let files: { versionId: string; bytes: Buffer }[] = [];
    if (content.documents?.length) {
      const [approval] = await tx
        .select({ decidedById: approvals.decidedById })
        .from(messages)
        .innerJoin(approvals, eq(approvals.id, messages.approvalId))
        .where(eq(messages.id, content.messageId));
      if (!approval?.decidedById) return cancel(tx, row, "case_email_eligibility_changed");
      try {
        files = await loadEmailFiles(
          tx,
          options.storage ?? fileServices().storage,
          { kind: "staff", id: approval.decidedById },
          content.caseId,
          content.recipient.partyId,
          content.documents,
        );
      } catch {
        // No provider call has occurred. A missing/changed file is not an unknown send.
        return cancel(tx, row, "case_email_attachment_unavailable");
      }
      if (!(await current(tx, row, config)))
        return cancel(tx, row, "case_email_eligibility_changed");
    }
    let result: ProviderResult | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      result = await Promise.race([
        provider.send({
          outboxId: id,
          idempotencyKey: row.effectKey,
          channel: "email",
          recipient: content.recipient.address,
          template: caseEmailTemplate,
          params: content,
          files,
          secretParams: null,
        }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("Provider timeout")), 16000);
        }),
      ]);
    } catch {
      /* A thrown provider call is ambiguous. Never replay it. */
    } finally {
      clearTimeout(timer);
    }
    const state: ExternalActionState = !result
      ? "outcome_unknown"
      : result.status === "accepted"
        ? "acknowledged"
        : result.retryable && row.attempts < maxDeliveryAttempts
          ? "queued"
          : "failed";
    const msgState = state === "acknowledged" ? "provider_accepted" : state;
    const code = !result
      ? "provider_unreachable"
      : result.status === "rejected"
        ? result.code
        : null;
    await tx
      .update(externalActions)
      .set({
        state,
        providerReference: result?.status === "accepted" ? result.providerMessageId : null,
        acknowledgedAt: state === "acknowledged" ? now : null,
        failedAt: state === "failed" ? now : null,
        lastErrorCode: code,
        version: row.version + 1,
        updatedAt: now,
      })
      .where(eq(externalActions.id, id));
    await tx
      .update(messageAttempts)
      .set({
        state: msgState === "queued" ? "failed" : msgState,
        errorCode: code,
        providerReference: result?.status === "accepted" ? result.providerMessageId : null,
        acceptedAt: state === "acknowledged" ? now : null,
        failedAt: result?.status === "rejected" ? now : null,
      })
      .where(
        and(
          eq(messageAttempts.externalActionId, id),
          eq(messageAttempts.attemptNumber, row.attempts),
        ),
      );
    await tx
      .update(messages)
      .set({ state: msgState, updatedAt: now })
      .where(eq(messages.id, content.messageId));
    return state;
  });
}
