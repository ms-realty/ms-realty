// O03 inquiry triage commands (spec §07.1, §07.5, F18, A41–A44). Every command runs once per
// operation id against the version the actor saw; state changes go through the domain inquiry
// machine. Replies are never sent from here: they are approved by the human sender and queued in
// the transactional outbox, and the AI service can only leave drafts.
import "server-only";
import { and, eq, sql } from "drizzle-orm";
import {
  approvals,
  caseStageHistory,
  cases,
  contactMethods,
  inquiries,
  messages,
  partyRelationships,
  referenceSequences,
  staffAccounts,
} from "@/db/schema";
import { canonicalJson } from "@/domain/approval";
import { buyerCaseStages } from "@/domain/buyer-case";
import type { Actor, Capability } from "@/domain/capabilities";
import { formatReference } from "@/domain/ids";
import { type InquiryEvidence, type InquiryState, inquiryTransitions } from "@/domain/inquiry";
import {
  type MessageChannel,
  type MessageState,
  messageChannels,
  messageTransitions,
} from "@/domain/message";
import type { ContactMethodKind } from "@/domain/parties";
import { sellerCaseStages } from "@/domain/seller-case";
import { recordActivity } from "../activity";
import { recordAudit } from "../audit";
import { assertCan, assertCanRead, can } from "../authz";
import { sha256Hex } from "../crypto";
import type { Executor, Transaction } from "../db";
import { AppError } from "../errors";
import { enqueueMessage } from "../jobs/outbox";
import type { JobQueue } from "../jobs/queue";
import { executeTransition, tableStore } from "../transitions";
import {
  applied,
  authorize,
  bumpInquiry,
  type CommandBase,
  type CommandOptions,
  type CommandResult,
  checkVersion,
  denied,
  inquiryResource,
  invalid,
  lockInquiry,
  openInquiryStates,
  parseInstant,
  patchedStore,
  requiredText,
  requireId,
  requireStaff,
  respondingStates,
  runCommand,
  type VersionedCommand,
} from "./shared";
import { createTask, openTaskCount } from "./tasks";

export interface InquiryCommandOutcome {
  readonly inquiryId: string;
  readonly version: number;
  readonly state: InquiryState;
}

const inquiryBase = tableStore<InquiryState>(inquiries, {
  id: inquiries.id,
  version: inquiries.version,
  state: inquiries.state,
  reference: inquiries.reference,
  caseId: inquiries.caseId,
});

function inquiryStore(patch: Partial<typeof inquiries.$inferInsert> = {}) {
  return patchedStore(inquiryBase, (tx, next, expectedVersion) =>
    tx
      .update(inquiries)
      .set({ ...patch, state: next.state, version: next.version })
      .where(and(eq(inquiries.id, next.id), eq(inquiries.version, expectedVersion)))
      .returning({ id: inquiries.id }),
  );
}

const messageBase = tableStore<MessageState>(messages, {
  id: messages.id,
  version: messages.version,
  state: messages.state,
  caseId: messages.caseId,
});

function messageStore(patch: Partial<typeof messages.$inferInsert> = {}) {
  return patchedStore(messageBase, (tx, next, expectedVersion) =>
    tx
      .update(messages)
      .set({ ...patch, state: next.state, version: next.version })
      .where(and(eq(messages.id, next.id), eq(messages.version, expectedVersion)))
      .returning({ id: messages.id }),
  );
}

interface TransitionArgs {
  readonly actor: Actor;
  readonly input: VersionedCommand & { inquiryId: string };
  readonly to: InquiryState;
  readonly evidence: InquiryEvidence;
  readonly patch?: Partial<typeof inquiries.$inferInsert>;
  readonly reason?: string;
  readonly operationId: string;
  readonly now: Date;
  readonly correlationId?: string | undefined;
}

async function transitionInquiry(tx: Transaction, args: TransitionArgs) {
  const record = applied(
    await executeTransition(tx, inquiryTransitions, inquiryStore(args.patch), {
      actor: args.actor,
      recordId: args.input.inquiryId,
      expectedVersion: args.input.expectedVersion,
      to: args.to,
      evidence: args.evidence,
      operationId: args.operationId,
      now: args.now,
      ...(args.reason ? { reason: args.reason } : {}),
      ...(args.correlationId ? { correlationId: args.correlationId } : {}),
    }),
  );
  return { inquiryId: record.id, version: record.version, state: record.state };
}

/** Reads the inquiry the actor may see; an invisible one is `not_found`. */
async function visibleInquiry(tx: Transaction, actor: Actor, inquiryId: string, now: Date) {
  const inquiry = await lockInquiry(tx, inquiryId);
  await assertCanRead(tx, actor, "inquiry.read", inquiryResource(inquiry), now);
  return inquiry;
}

interface InquiryInput extends VersionedCommand {
  readonly inquiryId: string;
}

// Ownership (F18 step 4, A43).

/** The actor takes ownership of a received (or suspected duplicate) inquiry. */
export async function claimInquiry(
  db: Executor,
  actor: Actor,
  input: InquiryInput,
  options: CommandOptions = {},
): Promise<CommandResult<InquiryCommandOutcome>> {
  requireStaff(actor);
  const now = options.now ?? new Date();
  return runCommand(db, actor, "inquiry.claim", input, async ({ tx, operationId }) => {
    await visibleInquiry(tx, actor, input.inquiryId, now);
    return transitionInquiry(tx, {
      actor,
      input,
      to: "assigned",
      evidence: { ownerId: actor.id },
      patch: { ownerStaffId: actor.id },
      operationId,
      now,
      correlationId: options.correlationId,
    });
  });
}

export interface AssignInquiryInput extends InquiryInput {
  readonly toStaffId: string;
}

/**
 * Assigns a received inquiry, or reassigns an owned one. The receiving staff member must be
 * active and able to respond, so ownership is real (A43).
 */
export async function assignInquiry(
  db: Executor,
  actor: Actor,
  input: AssignInquiryInput,
  options: CommandOptions = {},
): Promise<CommandResult<InquiryCommandOutcome>> {
  requireStaff(actor);
  const now = options.now ?? new Date();
  requireId(input.toStaffId, "toStaffId");
  return runCommand(db, actor, "inquiry.assign", input, async ({ tx, operationId }) => {
    const inquiry = await visibleInquiry(tx, actor, input.inquiryId, now);
    const [assignee] = await tx
      .select({ id: staffAccounts.id, status: staffAccounts.status })
      .from(staffAccounts)
      .where(eq(staffAccounts.id, input.toStaffId));
    const assigneeActor: Actor = { kind: "staff", id: input.toStaffId };
    if (
      assignee?.status !== "active" ||
      !(await can(tx, assigneeActor, "inquiry.respond", inquiryResource(inquiry), now))
    ) {
      throw invalid("toStaffId", "assignee_cannot_respond");
    }

    if (inquiry.state === "received" || inquiry.state === "suspected_duplicate") {
      return transitionInquiry(tx, {
        actor,
        input,
        to: "assigned",
        evidence: { ownerId: input.toStaffId },
        patch: { ownerStaffId: input.toStaffId },
        operationId,
        now,
        correlationId: options.correlationId,
      });
    }

    await assertCan(tx, actor, "inquiry.assign", inquiryResource(inquiry), now);
    checkVersion(inquiry, input.expectedVersion);
    if (!openInquiryStates.includes(inquiry.state)) throw denied("transition_not_allowed");
    if (inquiry.ownerStaffId === input.toStaffId) throw denied("no_change");
    const version = await bumpInquiry(tx, inquiry.id, input.expectedVersion, {
      ownerStaffId: input.toStaffId,
    });
    await recordInquiryEvent(tx, {
      actor,
      inquiry,
      operationId,
      now,
      correlationId: options.correlationId,
      action: "inquiry.reassign",
      capability: "inquiry.assign",
      summary: `Inquiry ${inquiry.reference} reassigned.`,
      params: { from: inquiry.ownerStaffId, to: input.toStaffId },
      payload: { expectedVersion: input.expectedVersion, newVersion: version },
    });
    return { inquiryId: inquiry.id, version, state: inquiry.state };
  });
}

// Replies (F18 step 5, §07.5, A41, A42).

const channelContactKinds: Record<MessageChannel, readonly ContactMethodKind[]> = {
  email: ["email"],
  sms: ["phone"],
  whatsapp: ["whatsapp", "phone"],
  viber: ["viber", "phone"],
  // The portal needs a client account, which an inquiry does not have yet.
  portal: [],
};

interface ReplyContent {
  readonly channel: MessageChannel;
  readonly recipientContactMethodId: string;
  readonly subject?: string;
  readonly body: string;
}

/** Validates the recipient against the inquiry's contact route and the channel. */
async function replyRecipient(
  tx: Transaction,
  inquiry: typeof inquiries.$inferSelect,
  content: ReplyContent,
) {
  if (!messageChannels.includes(content.channel)) throw invalid("channel", "invalid_channel");
  const [method] = await tx
    .select()
    .from(contactMethods)
    .where(eq(contactMethods.id, content.recipientContactMethodId));
  const belongs =
    method &&
    (method.id === inquiry.contactMethodId ||
      (inquiry.personId !== null && method.personId === inquiry.personId));
  if (!method || !belongs) {
    throw invalid("recipientContactMethodId", "not_a_contact_of_this_inquiry");
  }
  if (!channelContactKinds[content.channel].includes(method.kind)) {
    throw invalid("channel", "channel_not_supported_by_contact_method");
  }
  const recipients = [
    { contactMethodId: method.id, channel: content.channel, address: method.value },
  ];
  const subject = content.subject?.trim() || null;
  const body = content.body.trim();
  return {
    method,
    recipients,
    subject,
    body,
    contentHash: sha256Hex(
      canonicalJson({ channel: content.channel, recipients, attachments: [], subject, body }),
    ),
  };
}

export interface DraftReplyInput extends CommandBase, ReplyContent {
  readonly inquiryId: string;
}

/**
 * Saves a reply draft. The only inquiry command the AI service may use (A66): a draft is
 * proposed content and never reaches the outbox without a human sender.
 */
export async function draftReply(
  db: Executor,
  actor: Actor,
  input: DraftReplyInput,
  options: CommandOptions = {},
): Promise<CommandResult<{ messageId: string; version: number }>> {
  if (actor.kind !== "staff" && actor.kind !== "ai_service") throw new AppError("forbidden");
  const now = options.now ?? new Date();
  requiredText(input.body, "body");
  requireId(input.recipientContactMethodId, "recipientContactMethodId");
  return runCommand(db, actor, "inquiry.draft_reply", input, async ({ tx, operationId }) => {
    const inquiry = await lockInquiry(tx, input.inquiryId);
    // The AI service holds no read capability; drafting is its whole authority here.
    if (actor.kind === "staff") {
      await authorize(tx, actor, "inquiry.read", "message.draft", inquiryResource(inquiry), now);
    } else {
      await assertCanRead(tx, actor, "message.draft", inquiryResource(inquiry), now);
    }
    if (!openInquiryStates.includes(inquiry.state)) throw denied("inquiry_closed");
    const content = await replyRecipient(tx, inquiry, input);
    const [row] = await tx
      .insert(messages)
      .values({
        kind: "external",
        direction: "outbound",
        channel: input.channel,
        state: "draft",
        inquiryId: inquiry.id,
        caseId: inquiry.caseId,
        authorKind: actor.kind,
        authorId: actor.id,
        subject: content.subject,
        body: content.body,
        recipients: content.recipients,
        contentHash: content.contentHash,
        draftedByAi: actor.kind === "ai_service",
      })
      .returning({ id: messages.id, version: messages.version });
    if (!row) throw new Error("Message insert returned no row.");
    await recordInquiryEvent(tx, {
      actor,
      inquiry,
      operationId,
      now,
      correlationId: options.correlationId,
      action: "inquiry.draft_reply",
      capability: "message.draft",
      summary: `Reply draft saved for ${inquiry.reference}.`,
      params: {
        messageId: row.id,
        channel: input.channel,
        draftedByAi: actor.kind === "ai_service",
      },
      payload: { messageId: row.id },
    });
    return { messageId: row.id, version: row.version };
  });
}

export interface SendReplyInput extends InquiryInput, ReplyContent {
  /** Send an existing draft (an AI draft included); the human sender approves this content. */
  readonly draftId?: string;
  readonly draftVersion?: number;
}

export interface SendReplyOutcome {
  readonly inquiryId: string;
  readonly version: number;
  readonly messageId: string;
  readonly draftId: string | null;
  readonly outboxId: string;
  readonly deliveryState: "queued";
  readonly sentBy: string;
  readonly firstResponse: boolean;
}

/**
 * Approves a reply as the human sender and queues it in the outbox with an explicit channel
 * and recipient. It never talks to a provider; delivery starts as queued (§07.5).
 */
export async function sendReply(
  db: Executor,
  actor: Actor,
  input: SendReplyInput,
  options: CommandOptions & { queue?: JobQueue } = {},
): Promise<CommandResult<SendReplyOutcome>> {
  requireStaff(actor);
  const now = options.now ?? new Date();
  requiredText(input.body, "body");
  requireId(input.recipientContactMethodId, "recipientContactMethodId");
  if (input.draftId) requireId(input.draftId, "draftId");
  if (input.draftId && typeof input.draftVersion !== "number") {
    throw invalid("draftVersion", "required");
  }
  return runCommand(db, actor, "inquiry.send_reply", input, async ({ tx, operationId }) => {
    const inquiry = await visibleInquiry(tx, actor, input.inquiryId, now);
    await assertCan(tx, actor, "inquiry.respond", inquiryResource(inquiry), now);
    await assertCan(tx, actor, "message.send_external", inquiryResource(inquiry), now);
    checkVersion(inquiry, input.expectedVersion);
    if (inquiry.state === "received") throw denied("owner_required");
    if (!respondingStates.includes(inquiry.state)) throw denied("inquiry_closed");
    const content = await replyRecipient(tx, inquiry, input);

    let messageId: string;
    let messageVersion: number;
    if (input.draftId) {
      const [draft] = await tx
        .select()
        .from(messages)
        .where(eq(messages.id, input.draftId))
        .for("update");
      if (
        !draft ||
        draft.inquiryId !== inquiry.id ||
        draft.kind !== "external" ||
        draft.direction !== "outbound"
      ) {
        throw new AppError("not_found");
      }
      // The human's final text replaces the draft; a draft someone already sent is a conflict.
      const [edited] = await tx
        .update(messages)
        .set({
          channel: input.channel,
          subject: content.subject,
          body: content.body,
          recipients: content.recipients,
          contentHash: content.contentHash,
          version: sql`${messages.version} + 1`,
        })
        .where(
          and(
            eq(messages.id, draft.id),
            eq(messages.version, input.draftVersion as number),
            eq(messages.state, "draft"),
          ),
        )
        .returning({ id: messages.id, version: messages.version });
      if (!edited) {
        throw new AppError("version_conflict", {
          current: { id: draft.id, version: draft.version, state: draft.state },
        });
      }
      messageId = edited.id;
      messageVersion = edited.version;
    } else {
      const [created] = await tx
        .insert(messages)
        .values({
          kind: "external",
          direction: "outbound",
          channel: input.channel,
          state: "draft",
          inquiryId: inquiry.id,
          caseId: inquiry.caseId,
          authorKind: actor.kind,
          authorId: actor.id,
          subject: content.subject,
          body: content.body,
          recipients: content.recipients,
          contentHash: content.contentHash,
        })
        .returning({ id: messages.id, version: messages.version });
      if (!created) throw new Error("Message insert returned no row.");
      messageId = created.id;
      messageVersion = created.version;
    }

    // The human sender's approval, bound to exactly this content and recipient.
    const [approval] = await tx
      .insert(approvals)
      .values({
        kind: "message_send",
        state: "approved",
        subjectType: "message",
        subjectId: messageId,
        subjectVersion: messageVersion,
        subjectHash: content.contentHash,
        scope: { channel: input.channel, recipients: [content.method.id] },
        requestedByKind: actor.kind,
        requestedById: actor.id,
        decidedByKind: actor.kind,
        decidedById: actor.id,
        decidedWithCapability: "message.send_external",
        decidedAt: now,
      })
      .returning({ id: approvals.id });
    if (!approval) throw new Error("Approval insert returned no row.");

    const evidence = {
      kind: "external" as const,
      contentHash: content.contentHash,
      approvedContentHash: content.contentHash,
    };
    const transition = { actor, recordId: messageId, operationId, now, evidence };
    const approved = applied(
      await executeTransition(
        tx,
        messageTransitions,
        messageStore({ approvalId: approval.id, approvedContentHash: content.contentHash }),
        { ...transition, expectedVersion: messageVersion, to: "human_approved" },
      ),
    );
    applied(
      await executeTransition(tx, messageTransitions, messageStore(), {
        ...transition,
        expectedVersion: approved.version,
        to: "queued",
      }),
    );
    const outbox = await enqueueMessage(
      tx,
      {
        idempotencyKey: `message:${messageId}`,
        channel: input.channel,
        recipient: content.method.value,
        template: "message.reply",
        params: { messageId, subject: content.subject, body: content.body },
        messageId,
      },
      options.queue,
    );

    const firstResponse = inquiry.firstResponseAt === null;
    const version = await bumpInquiry(tx, inquiry.id, input.expectedVersion, {
      ...(firstResponse ? { firstResponseAt: now } : {}),
    });
    const draftId = input.draftId ?? null;
    await recordInquiryEvent(tx, {
      actor,
      inquiry,
      operationId,
      now,
      correlationId: options.correlationId,
      action: "inquiry.send_reply",
      capability: "message.send_external",
      messageKey: "activity.inquiry.reply_queued",
      summary: `Reply to ${inquiry.reference} queued for delivery by ${input.channel}.`,
      params: { messageId, draftId, channel: input.channel, firstResponse },
      payload: {
        messageId,
        draftId,
        approvalId: approval.id,
        outboxId: outbox.id,
        channel: input.channel,
        contactMethodId: content.method.id,
        sentBy: actor.id,
        expectedVersion: input.expectedVersion,
        newVersion: version,
      },
    });
    return {
      inquiryId: inquiry.id,
      version,
      messageId,
      draftId,
      outboxId: outbox.id,
      deliveryState: "queued",
      sentBy: actor.id,
      firstResponse,
    };
  });
}

export interface RecordFirstResponseInput extends InquiryInput {
  /** How the contact happened outside the composer, e.g. a phone call. */
  readonly channel: "phone" | "email" | "whatsapp" | "viber" | "in_person";
  /** `attempted` (a missed call, no answer) is recorded but is not a response (F19). */
  readonly outcome: "reached" | "attempted";
  readonly note: string;
}

export async function recordFirstResponse(
  db: Executor,
  actor: Actor,
  input: RecordFirstResponseInput,
  options: CommandOptions = {},
): Promise<CommandResult<InquiryCommandOutcome & { firstResponseAt: string | null }>> {
  requireStaff(actor);
  const now = options.now ?? new Date();
  const note = requiredText(input.note, "note");
  if (input.outcome !== "reached" && input.outcome !== "attempted") {
    throw invalid("outcome", "invalid_outcome");
  }
  return runCommand(db, actor, "inquiry.record_contact", input, async ({ tx, operationId }) => {
    const inquiry = await visibleInquiry(tx, actor, input.inquiryId, now);
    await assertCan(tx, actor, "inquiry.respond", inquiryResource(inquiry), now);
    checkVersion(inquiry, input.expectedVersion);
    if (inquiry.state === "received") throw denied("owner_required");
    if (!respondingStates.includes(inquiry.state)) throw denied("inquiry_closed");
    const reached = input.outcome === "reached";
    const setsFirst = reached && inquiry.firstResponseAt === null;
    const version = await bumpInquiry(tx, inquiry.id, input.expectedVersion, {
      ...(setsFirst ? { firstResponseAt: now } : {}),
    });
    await recordInquiryEvent(tx, {
      actor,
      inquiry,
      operationId,
      now,
      correlationId: options.correlationId,
      action: reached ? "inquiry.contact_made" : "inquiry.contact_attempted",
      capability: "inquiry.respond",
      summary: reached
        ? `Client reached by ${input.channel} for ${inquiry.reference}.`
        : `Contact attempted by ${input.channel} for ${inquiry.reference}; no response yet.`,
      params: { channel: input.channel, outcome: input.outcome, note },
      payload: {
        expectedVersion: input.expectedVersion,
        newVersion: version,
        firstResponse: setsFirst,
      },
    });
    const firstResponseAt = setsFirst ? now : inquiry.firstResponseAt;
    return {
      inquiryId: inquiry.id,
      version,
      state: inquiry.state,
      firstResponseAt: firstResponseAt?.toISOString() ?? null,
    };
  });
}

// Waiting and outcomes (F18 steps 5–7).

export interface MarkAwaitingClientInput extends InquiryInput {
  /** The sent message that asked the client a specific question. */
  readonly questionMessageId: string;
  /** ISO instant of the agreed follow-up. */
  readonly followUpAt: string;
}

export async function markAwaitingClient(
  db: Executor,
  actor: Actor,
  input: MarkAwaitingClientInput,
  options: CommandOptions = {},
): Promise<CommandResult<InquiryCommandOutcome>> {
  requireStaff(actor);
  const now = options.now ?? new Date();
  const followUpAt = parseInstant(input.followUpAt, "followUpAt");
  if (followUpAt <= now) throw invalid("followUpAt", "must_be_in_future");
  requireId(input.questionMessageId, "questionMessageId");
  return runCommand(db, actor, "inquiry.await_client", input, async ({ tx, operationId }) => {
    await visibleInquiry(tx, actor, input.inquiryId, now);
    const [question] = await tx
      .select({ id: messages.id, state: messages.state })
      .from(messages)
      .where(
        and(
          eq(messages.id, input.questionMessageId),
          eq(messages.inquiryId, input.inquiryId),
          eq(messages.kind, "external"),
          eq(messages.direction, "outbound"),
        ),
      );
    if (!question || question.state === "draft" || question.state === "human_approved") {
      throw invalid("questionMessageId", "question_not_sent");
    }
    return transitionInquiry(tx, {
      actor,
      input,
      to: "awaiting_client",
      evidence: { questionMessageId: question.id, followUpAt: followUpAt.toISOString() },
      patch: { followUpAt },
      operationId,
      now,
      correlationId: options.correlationId,
    });
  });
}

export interface ResolveWithoutCaseInput extends InquiryInput {
  readonly reason: string;
}

/** Resolves a simple request without inventing a case; open commitments block it (A44). */
export async function resolveWithoutCase(
  db: Executor,
  actor: Actor,
  input: ResolveWithoutCaseInput,
  options: CommandOptions = {},
): Promise<CommandResult<InquiryCommandOutcome>> {
  requireStaff(actor);
  const now = options.now ?? new Date();
  return runCommand(db, actor, "inquiry.resolve", input, async ({ tx, operationId }) => {
    await visibleInquiry(tx, actor, input.inquiryId, now);
    const reason = input.reason?.trim() || undefined;
    return transitionInquiry(tx, {
      actor,
      input,
      to: "resolved_without_case",
      evidence: {
        ...(reason ? { reason } : {}),
        openCommitments: await openTaskCount(tx, input.inquiryId),
      },
      patch: { dispositionReason: reason ?? null },
      ...(reason ? { reason } : {}),
      operationId,
      now,
      correlationId: options.correlationId,
    });
  });
}

export interface LinkToCaseInput extends InquiryInput {
  readonly caseId: string;
}

/** Links the inquiry to an existing active case without creating another person (§07.1). */
export async function linkToCase(
  db: Executor,
  actor: Actor,
  input: LinkToCaseInput,
  options: CommandOptions = {},
): Promise<CommandResult<InquiryCommandOutcome & { caseId: string }>> {
  requireStaff(actor);
  const now = options.now ?? new Date();
  requireId(input.caseId, "caseId");
  return runCommand(db, actor, "inquiry.link_case", input, async ({ tx, operationId }) => {
    const inquiry = await visibleInquiry(tx, actor, input.inquiryId, now);
    const [target] = await tx
      .select({ id: cases.id, reference: cases.reference, stage: cases.stage })
      .from(cases)
      .where(eq(cases.id, input.caseId));
    if (!target) throw new AppError("not_found");
    await assertCanRead(tx, actor, "case.read", { type: "case", id: target.id }, now);
    if (["closed", "completed", "completion_handover"].includes(target.stage)) {
      throw invalid("caseId", "case_not_active");
    }
    const result = await transitionInquiry(tx, {
      actor,
      input,
      to: "case_linked",
      evidence: { caseId: target.id },
      patch: { caseId: target.id },
      operationId,
      now,
      correlationId: options.correlationId,
    });
    await recordActivity(tx, {
      recordType: "case",
      recordId: target.id,
      reference: target.reference,
      messageKey: "activity.case.inquiry_linked",
      params: { inquiryId: inquiry.id, inquiryReference: inquiry.reference },
      summary: `Inquiry ${inquiry.reference} linked to case ${target.reference}.`,
      actor,
      operationId,
      at: now,
    });
    return { ...result, caseId: target.id };
  });
}

export interface CreateCaseFromInquiryInput extends InquiryInput {
  readonly title: string;
  readonly nextAction: {
    readonly title: string;
    readonly dueAt: string;
    readonly dueTimezone?: string;
  };
}

export interface CreateCaseOutcome extends InquiryCommandOutcome {
  readonly caseId: string;
  readonly caseReference: string;
  readonly caseStage: string;
  readonly taskId: string;
}

/**
 * Creates a case in the initial stage of its pipeline (seller for selling/letting requests,
 * buyer otherwise), relates the inquiry's person, sets its next action and links the inquiry.
 */
export async function createCaseFromInquiry(
  db: Executor,
  actor: Actor,
  input: CreateCaseFromInquiryInput,
  options: CommandOptions = {},
): Promise<CommandResult<CreateCaseOutcome>> {
  requireStaff(actor);
  const now = options.now ?? new Date();
  const title = requiredText(input.title, "title");
  const actionTitle = requiredText(input.nextAction?.title, "nextAction.title");
  const dueAt = parseInstant(input.nextAction?.dueAt, "nextAction.dueAt");
  return runCommand(db, actor, "inquiry.create_case", input, async ({ tx, operationId }) => {
    const inquiry = await visibleInquiry(tx, actor, input.inquiryId, now);
    await assertCan(tx, actor, "case.transition", { type: "case" }, now);
    await assertCan(tx, actor, "task.manage", inquiryResource(inquiry), now);
    checkVersion(inquiry, input.expectedVersion);

    const kind = inquiry.purpose === "selling_letting" ? "seller" : "buyer";
    const stage = kind === "seller" ? sellerCaseStages[0] : buyerCaseStages[0];
    const year = now.getUTCFullYear();
    const [sequence] = await tx
      .insert(referenceSequences)
      .values({ kind: "case", year, lastValue: 1 })
      .onConflictDoUpdate({
        target: [referenceSequences.kind, referenceSequences.year],
        set: { lastValue: sql`${referenceSequences.lastValue} + 1` },
      })
      .returning({ lastValue: referenceSequences.lastValue });
    if (!sequence) throw new Error("Reference sequence returned no row.");
    const reference = formatReference("case", year, sequence.lastValue);
    const ownerStaffId = inquiry.ownerStaffId ?? actor.id;
    const [created] = await tx
      .insert(cases)
      .values({
        reference,
        kind,
        stage,
        title,
        ownerStaffId,
        nextActionSummary: actionTitle,
        nextActionDueAt: dueAt,
      })
      .returning({ id: cases.id });
    if (!created) throw new Error("Case insert returned no row.");
    await tx.insert(caseStageHistory).values({
      caseId: created.id,
      toStage: stage,
      reason: `Created from inquiry ${inquiry.reference}`,
      evidence: { inquiryId: inquiry.id },
      actorKind: actor.kind,
      actorId: actor.id,
      operationId,
      occurredAt: now,
    });
    if (inquiry.personId) {
      await tx.insert(partyRelationships).values({
        personId: inquiry.personId,
        role: kind,
        caseId: created.id,
        validFrom: now,
      });
    }
    await recordActivity(tx, {
      recordType: "case",
      recordId: created.id,
      reference,
      messageKey: "activity.case.created",
      params: { inquiryId: inquiry.id, inquiryReference: inquiry.reference, kind, stage },
      summary: `Case ${reference} opened from inquiry ${inquiry.reference}.`,
      actor,
      operationId,
      at: now,
    });
    await recordAudit(tx, {
      action: "case.create",
      actor,
      capability: "case.transition",
      recordType: "case",
      recordId: created.id,
      operationId,
      ...(options.correlationId ? { correlationId: options.correlationId } : {}),
      payload: { kind, stage, inquiryId: inquiry.id, ownerStaffId },
      at: now,
    });
    const taskId = await createTask(
      { tx, actor, operationId, now, correlationId: options.correlationId },
      {
        title: actionTitle,
        dueAt,
        dueTimezone: input.nextAction.dueTimezone ?? null,
        commitment: "internal",
        ownerStaffId,
        caseId: created.id,
        listingId: inquiry.listingId,
        parent: { type: "case", id: created.id, reference },
      },
    );
    const result = await transitionInquiry(tx, {
      actor,
      input,
      to: "case_linked",
      evidence: { caseId: created.id },
      patch: { caseId: created.id },
      operationId,
      now,
      correlationId: options.correlationId,
    });
    return { ...result, caseId: created.id, caseReference: reference, caseStage: stage, taskId };
  });
}

interface InquiryEvent {
  readonly actor: Actor;
  readonly inquiry: { id: string; reference: string };
  readonly operationId: string;
  readonly now: Date;
  readonly correlationId?: string | undefined;
  readonly action: string;
  readonly capability: Capability;
  readonly messageKey?: string;
  readonly summary: string;
  readonly params: Record<string, unknown>;
  readonly payload: Record<string, unknown>;
}

/** Timeline entry and audit record for an inquiry change that is not a state transition. */
async function recordInquiryEvent(tx: Transaction, event: InquiryEvent): Promise<void> {
  await recordActivity(tx, {
    recordType: "inquiry",
    recordId: event.inquiry.id,
    reference: event.inquiry.reference,
    messageKey: event.messageKey ?? `activity.${event.action}`,
    params: event.params,
    summary: event.summary,
    actor: event.actor,
    operationId: event.operationId,
    at: event.now,
  });
  await recordAudit(tx, {
    action: event.action,
    actor: event.actor,
    capability: event.capability,
    recordType: "inquiry",
    recordId: event.inquiry.id,
    operationId: event.operationId,
    ...(event.correlationId ? { correlationId: event.correlationId } : {}),
    payload: event.payload,
    at: event.now,
  });
}
