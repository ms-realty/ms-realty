import "server-only";
import { parseAbsolute } from "@internationalized/date";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import {
  caseParticipants,
  caseProcessItems,
  caseProcessReviews,
  commissionRecords,
  processItemDecisions,
  processPolicies,
  serviceAgreements,
  suspicionReports,
} from "@/db/schema";
import type { Capability } from "@/domain/capabilities";
import { recordAudit } from "../audit";
import { requireFreshAuth, type Session } from "../auth/sessions";
import { assertCanRead } from "../authz";
import { caseFor, liveParticipation } from "../cases/shared";
import { hashRequest } from "../crypto";
import type { Executor } from "../db";
import { AppError } from "../errors";
import { documentAccess } from "../files/access";
import { type OperationContext, runOperation } from "../operations";
import { commandEnvelope, liveStaff, parseInput, version } from "../work/shared";
import {
  activePolicy,
  checkReviewEvidence,
  gateDenied,
  policyDigest,
  processItemsSchema,
  proposalContext,
  reviewedEvidence,
} from "./agreement-gate";

const text = z.string().trim().min(3).max(4000);
const instant = z.iso.datetime({ offset: true });
const envelope = { operationId: commandEnvelope.operationId };
const policySchema = z.object({
  ...envelope,
  title: text.max(200),
  country: z.enum(["BG", "GR"]),
  transaction: z.enum(["sale", "rent"]),
  participantCategory: z.enum(["eu", "non_eu", "mixed", "unknown"]),
  documentVersionId: z.uuid(),
  items: processItemsSchema,
  withdrawalDays: z.int().min(0).max(365),
  timezone: z.enum(["Europe/Sofia", "Europe/Athens"]),
  expressStartRequired: z.boolean(),
  retentionDays: z.int().min(1).max(36500),
  professionalName: text.max(200),
  validUntil: instant,
});

async function qualified(db: Executor, session: Session, capability: Capability, caseId?: string) {
  const live = await liveStaff(db, session);
  requireFreshAuth(live);
  if (caseId) await caseFor(db, live, caseId);
  await assertCanRead(db, live.actor, capability, {
    type: caseId ? "case" : "process_policy",
    ...(caseId ? { id: caseId } : {}),
    audience: "internal",
  });
  return live;
}
async function audit(
  ctx: OperationContext,
  action: string,
  id: string,
  capability: Capability,
  payload: Record<string, unknown> = {},
) {
  // No suspicion note, identity evidence or due-diligence result in general activity/outbox.
  await recordAudit(ctx.tx, {
    actor: ctx.actor,
    action,
    recordType: "compliance",
    recordId: id,
    capability,
    operationId: ctx.operationId,
    payload,
  });
}
const daysAfter = (at: Date, days: number, timezone: string) =>
  parseAbsolute(at.toISOString(), timezone).add({ days }).toDate();

/** A qualified human approves a supplied operating policy, not application-provided law. */
export async function approveProcessPolicy(
  db: Executor,
  session: Session,
  raw: z.input<typeof policySchema>,
) {
  const input = parseInput(policySchema, raw);
  await qualified(db, session, "claim.approve");
  await qualified(db, session, "compliance.review");
  return runOperation(
    db,
    {
      actor: session.actor,
      type: "compliance.policy.approve",
      idempotencyKey: input.operationId,
      requestHash: hashRequest(input),
    },
    async (ctx) => {
      await qualified(ctx.tx, session, "claim.approve");
      await qualified(ctx.tx, session, "compliance.review");
      if (new Date(input.validUntil) <= new Date()) throw new AppError("validation_failed");
      await documentAccess(ctx.tx, session, input.documentVersionId);
      const evidence = await reviewedEvidence(ctx.tx, input.documentVersionId, {
        purpose: "process_policy",
      });
      const data = { ...input, documentDigest: evidence.file.sha256 as string };
      const [policy] = await ctx.tx
        .insert(processPolicies)
        .values({
          ...data,
          approvedById: session.account.id,
          validUntil: new Date(input.validUntil),
          policyHash: policyDigest(data),
        })
        .returning();
      if (!policy) throw new Error("Policy insert failed");
      await audit(ctx, "compliance.policy.approved", policy.id, "claim.approve", {
        policyHash: policy.policyHash,
        documentVersionId: input.documentVersionId,
      });
      return { id: policy.id, policyHash: policy.policyHash };
    },
  );
}

const startSchema = z.object({
  ...commandEnvelope,
  proposalRevisionId: z.uuid(),
  policyId: z.uuid(),
  // A qualified human explicitly chooses the reviewed category; nationality is never inferred.
  participantCategory: z.enum(["eu", "non_eu", "mixed", "unknown"]),
  dueAt: instant,
});
export async function startCaseProcessReview(
  db: Executor,
  session: Session,
  raw: z.input<typeof startSchema>,
) {
  const input = parseInput(startSchema, raw);
  await qualified(db, session, "compliance.review", input.id);
  return runOperation(
    db,
    {
      actor: session.actor,
      type: "compliance.review.start",
      idempotencyKey: input.operationId,
      requestHash: hashRequest(input),
      expectedVersion: input.expectedVersion,
    },
    async (ctx) => {
      await qualified(ctx.tx, session, "compliance.review", input.id);
      const { row } = await caseFor(ctx.tx, session, input.id, undefined, true);
      version(row, input.expectedVersion);
      const policy = await activePolicy(ctx.tx, input.policyId);
      const context = await proposalContext(ctx.tx, input.id, input.proposalRevisionId);
      if (
        context.property.country !== policy.country ||
        (context.listing.purpose === "sale" ? "sale" : "rent") !== policy.transaction ||
        input.participantCategory !== policy.participantCategory ||
        new Date(input.dueAt) <= new Date()
      )
        throw gateDenied();
      const [existing] = await ctx.tx
        .select()
        .from(caseProcessReviews)
        .where(
          and(
            eq(caseProcessReviews.proposalRevisionId, input.proposalRevisionId),
            isNull(caseProcessReviews.invalidatedAt),
          ),
        );
      if (existing) throw new AppError("version_conflict");
      const [review] = await ctx.tx
        .insert(caseProcessReviews)
        .values({
          caseId: input.id,
          proposalRevisionId: input.proposalRevisionId,
          policyId: policy.id,
          policyHash: policy.policyHash,
          termsHash: context.revision.termsHash,
          partyIds: context.partyIds,
          responsibleId: session.account.id,
          dueAt: new Date(input.dueAt),
        })
        .returning();
      if (!review) throw new Error("Process review insert failed");
      const retainUntil = daysAfter(new Date(), policy.retentionDays, policy.timezone);
      for (const item of policy.items)
        for (const partyScope of item.category === "due_diligence" ? context.partyIds : [""]) {
          await ctx.tx
            .insert(caseProcessItems)
            .values({ reviewId: review.id, code: item.code, partyScope, retainUntil });
        }
      await audit(ctx, "compliance.review.started", review.id, "compliance.review", {
        caseId: input.id,
        policyHash: policy.policyHash,
        proposalRevisionId: input.proposalRevisionId,
      });
      return { id: review.id, caseId: input.id, version: review.version };
    },
  );
}

const itemSchema = z.object({
  ...commandEnvelope,
  reviewId: z.uuid(),
  code: z.string().min(2).max(60),
  partyScope: z.union([z.literal(""), z.uuid()]),
  result: z.enum(["accepted", "not_applicable", "blocked"]),
  reason: text,
  evidenceVersionId: z.uuid().nullable(),
  professionalName: z.string().trim().max(200),
  validUntil: instant,
});
export async function recordProcessItem(
  db: Executor,
  session: Session,
  raw: z.input<typeof itemSchema>,
) {
  const input = parseInput(itemSchema, raw);
  await qualified(db, session, "compliance.review", input.id);
  return runOperation(
    db,
    {
      actor: session.actor,
      type: "compliance.item.review",
      idempotencyKey: input.operationId,
      requestHash: hashRequest(input),
      expectedVersion: input.expectedVersion,
    },
    async (ctx) => {
      await qualified(ctx.tx, session, "compliance.review", input.id);
      const [review] = await ctx.tx
        .select()
        .from(caseProcessReviews)
        .where(
          and(eq(caseProcessReviews.id, input.reviewId), eq(caseProcessReviews.caseId, input.id)),
        )
        .for("update");
      if (!review) throw new AppError("not_found");
      version(review, input.expectedVersion);
      const policy = await activePolicy(ctx.tx, review.policyId);
      const item = policy.items.find((i) => i.code === input.code);
      if (
        !item ||
        (item.category === "transaction"
          ? input.partyScope !== ""
          : !review.partyIds.includes(input.partyScope)) ||
        (input.result === "not_applicable" && !item.allowNotApplicable) ||
        new Date(input.validUntil) <= new Date() ||
        new Date(input.validUntil) > policy.validUntil ||
        (input.result !== "blocked" && item.professionalRequired && !input.professionalName)
      )
        throw new AppError("validation_failed");
      let digest: string | null = null;
      if (input.evidenceVersionId) {
        await documentAccess(ctx.tx, session, input.evidenceVersionId);
        digest = (
          await reviewedEvidence(ctx.tx, input.evidenceVersionId, {
            caseId: input.id,
            purpose: "case_check",
          })
        ).file.sha256;
      }
      if (input.result !== "blocked" && item.evidenceRequired && !digest) throw gateDenied();
      const [changed] = await ctx.tx
        .update(caseProcessItems)
        .set({
          result: input.result,
          reason: input.reason,
          evidenceVersionId: input.evidenceVersionId,
          evidenceDigest: digest,
          professionalName: input.professionalName || null,
          reviewedById: session.account.id,
          reviewedAt: new Date(),
          validUntil: new Date(input.validUntil),
          version: sql`${caseProcessItems.version} + 1`,
        })
        .where(
          and(
            eq(caseProcessItems.reviewId, review.id),
            eq(caseProcessItems.code, input.code),
            eq(caseProcessItems.partyScope, input.partyScope),
          ),
        )
        .returning();
      if (!changed) throw new AppError("not_found");
      await ctx.tx.insert(processItemDecisions).values({
        itemId: changed.id,
        version: changed.version,
        snapshot: {
          result: changed.result,
          reason: changed.reason,
          evidenceVersionId: changed.evidenceVersionId,
          evidenceDigest: changed.evidenceDigest,
          professionalName: changed.professionalName,
          validUntil: changed.validUntil?.toISOString(),
          reviewedAt: changed.reviewedAt?.toISOString(),
        },
        decidedById: session.account.id,
        operationId: ctx.operationId,
      });
      await ctx.tx
        .update(caseProcessReviews)
        .set({ approvedAt: null, approvedById: null, version: review.version + 1 })
        .where(eq(caseProcessReviews.id, review.id));
      await audit(ctx, "compliance.item.reviewed", changed.id, "compliance.review", {
        caseId: input.id,
        reviewId: review.id,
        evidenceVersionId: input.evidenceVersionId,
        evidenceDigest: digest,
      });
      return { id: changed.id, caseId: input.id, version: review.version + 1 };
    },
  );
}

const agreementSchema = z.object({
  ...envelope,
  id: z.uuid(),
  partyId: z.uuid(),
  policyId: z.uuid(),
  documentVersionId: z.uuid(),
  channel: z.enum(["on_premises", "distance", "off_premises"]),
  signedAt: instant,
  withdrawalInformedAt: instant.nullable(),
  expressStartRequestedAt: instant.nullable(),
  expressStartEvidenceVersionId: z.uuid().nullable(),
  commissionBasis: text,
  commissionPayerPartyId: z.uuid(),
  validUntil: instant,
});
export async function recordServiceAgreement(
  db: Executor,
  session: Session,
  raw: z.input<typeof agreementSchema>,
) {
  const input = parseInput(agreementSchema, raw);
  await qualified(db, session, "compliance.review", input.id);
  return runOperation(
    db,
    {
      actor: session.actor,
      type: "compliance.agreement.record",
      idempotencyKey: input.operationId,
      requestHash: hashRequest(input),
    },
    async (ctx) => {
      await qualified(ctx.tx, session, "compliance.review", input.id);
      const { row: record } = await caseFor(ctx.tx, session, input.id, undefined, true);
      // A new service commitment must reopen the relationship explicitly, preserving
      // its closeout history and starting a fresh retention interval at the next closure.
      if (record.disposition === "closed") throw new AppError("transition_denied");
      const policy = await activePolicy(ctx.tx, input.policyId);
      const participants = await ctx.tx
        .select()
        .from(caseParticipants)
        .where(
          and(
            eq(caseParticipants.caseId, input.id),
            liveParticipation(),
            inArray(caseParticipants.partyId, [input.partyId, input.commissionPayerPartyId]),
          ),
        )
        .for("share");
      if (
        ![input.partyId, input.commissionPayerPartyId].every((id) =>
          participants.some((p) => p.partyId === id),
        ) ||
        new Date(input.signedAt) > new Date() ||
        new Date(input.validUntil) <= new Date() ||
        (input.withdrawalInformedAt &&
          new Date(input.withdrawalInformedAt) > new Date(input.signedAt)) ||
        (input.expressStartRequestedAt &&
          (new Date(input.expressStartRequestedAt) > new Date() ||
            !input.expressStartEvidenceVersionId)) ||
        (input.channel !== "on_premises" &&
          policy.withdrawalDays > 0 &&
          !input.withdrawalInformedAt)
      )
        throw new AppError("validation_failed");
      await documentAccess(ctx.tx, session, input.documentVersionId);
      const doc = await reviewedEvidence(ctx.tx, input.documentVersionId, {
        caseId: input.id,
        purpose: "service_agreement",
      });
      let startDigest: string | null = null;
      if (input.expressStartEvidenceVersionId) {
        await documentAccess(ctx.tx, session, input.expressStartEvidenceVersionId);
        startDigest = (
          await reviewedEvidence(ctx.tx, input.expressStartEvidenceVersionId, {
            caseId: input.id,
            purpose: "express_start",
          })
        ).file.sha256;
      }
      const [agreement] = await ctx.tx
        .insert(serviceAgreements)
        .values({
          caseId: input.id,
          partyId: input.partyId,
          policyId: input.policyId,
          documentVersionId: input.documentVersionId,
          documentDigest: doc.file.sha256 as string,
          channel: input.channel,
          signedAt: new Date(input.signedAt),
          withdrawalInformedAt: input.withdrawalInformedAt
            ? new Date(input.withdrawalInformedAt)
            : null,
          withdrawalDeadlineAt:
            input.channel === "on_premises" || policy.withdrawalDays === 0
              ? null
              : daysAfter(new Date(input.signedAt), policy.withdrawalDays, policy.timezone),
          expressStartRequestedAt: input.expressStartRequestedAt
            ? new Date(input.expressStartRequestedAt)
            : null,
          expressStartEvidenceVersionId: input.expressStartEvidenceVersionId,
          expressStartEvidenceDigest: startDigest,
          commissionBasis: input.commissionBasis,
          commissionPayerPartyId: input.commissionPayerPartyId,
          reviewedById: session.account.id,
          validUntil: new Date(input.validUntil),
          operationId: ctx.operationId,
        })
        .returning();
      if (!agreement) throw new Error("Agreement insert failed");
      await audit(ctx, "compliance.agreement.recorded", agreement.id, "compliance.review", {
        caseId: input.id,
        documentVersionId: input.documentVersionId,
        documentDigest: doc.file.sha256,
      });
      return { id: agreement.id, caseId: input.id };
    },
  );
}

const reviewSchema = z.object({ ...commandEnvelope, reviewId: z.uuid() });
export async function approveCaseProcess(
  db: Executor,
  session: Session,
  raw: z.input<typeof reviewSchema>,
) {
  const input = parseInput(reviewSchema, raw);
  await qualified(db, session, "compliance.review", input.id);
  return runOperation(
    db,
    {
      actor: session.actor,
      type: "compliance.review.approve",
      idempotencyKey: input.operationId,
      requestHash: hashRequest(input),
      expectedVersion: input.expectedVersion,
    },
    async (ctx) => {
      await qualified(ctx.tx, session, "compliance.review", input.id);
      const [review] = await ctx.tx
        .select()
        .from(caseProcessReviews)
        .where(
          and(eq(caseProcessReviews.id, input.reviewId), eq(caseProcessReviews.caseId, input.id)),
        )
        .for("update");
      if (!review) throw new AppError("not_found");
      version(review, input.expectedVersion);
      await checkReviewEvidence(ctx.tx, review);
      await ctx.tx
        .update(caseProcessReviews)
        .set({
          approvedAt: new Date(),
          approvedById: session.account.id,
          version: review.version + 1,
        })
        .where(eq(caseProcessReviews.id, review.id));
      await audit(ctx, "compliance.review.approved", review.id, "compliance.review", {
        caseId: input.id,
        proposalRevisionId: review.proposalRevisionId,
        termsHash: review.termsHash,
        policyHash: review.policyHash,
      });
      return { id: review.id, caseId: input.id, version: review.version + 1 };
    },
  );
}

const revokeSchema = z.object({
  ...envelope,
  id: z.uuid(),
  targetId: z.uuid(),
  kind: z.enum(["agreement", "policy", "review"]),
  reason: text,
});
export async function revokeCaseEvidence(
  db: Executor,
  session: Session,
  raw: z.input<typeof revokeSchema>,
) {
  const input = parseInput(revokeSchema, raw);
  await qualified(db, session, "compliance.review", input.id);
  if (input.kind === "policy") await qualified(db, session, "claim.approve");
  return runOperation(
    db,
    {
      actor: session.actor,
      type: "compliance.evidence.revoke",
      idempotencyKey: input.operationId,
      requestHash: hashRequest(input),
    },
    async (ctx) => {
      await qualified(ctx.tx, session, "compliance.review", input.id);
      let changed: { id: string }[];
      if (input.kind === "policy") {
        await qualified(ctx.tx, session, "claim.approve");
        changed = await ctx.tx
          .update(processPolicies)
          .set({ revokedAt: new Date(), revocationReason: input.reason })
          .where(and(eq(processPolicies.id, input.targetId), isNull(processPolicies.revokedAt)))
          .returning({ id: processPolicies.id });
      } else if (input.kind === "agreement")
        changed = await ctx.tx
          .update(serviceAgreements)
          .set({ revokedAt: new Date(), revocationReason: input.reason })
          .where(
            and(
              eq(serviceAgreements.id, input.targetId),
              eq(serviceAgreements.caseId, input.id),
              isNull(serviceAgreements.revokedAt),
            ),
          )
          .returning({ id: serviceAgreements.id });
      else
        changed = await ctx.tx
          .update(caseProcessReviews)
          .set({
            invalidatedAt: new Date(),
            invalidationReason: input.reason,
            version: sql`${caseProcessReviews.version} + 1`,
          })
          .where(
            and(
              eq(caseProcessReviews.id, input.targetId),
              eq(caseProcessReviews.caseId, input.id),
              isNull(caseProcessReviews.invalidatedAt),
            ),
          )
          .returning({ id: caseProcessReviews.id });
      if (!changed.length) throw new AppError("version_conflict");
      await audit(ctx, "compliance.evidence.revoked", input.targetId, "compliance.review", {
        caseId: input.id,
        kind: input.kind,
        reason: input.reason,
      });
      return { id: input.targetId, caseId: input.id };
    },
  );
}

const suspicionSchema = z.object({
  ...envelope,
  id: z.uuid(),
  partyId: z.uuid(),
  policyId: z.uuid(),
  note: text,
  externalReference: z.string().trim().max(300),
  reportedAt: instant.nullable(),
});
export async function recordSuspicion(
  db: Executor,
  session: Session,
  raw: z.input<typeof suspicionSchema>,
) {
  const input = parseInput(suspicionSchema, raw);
  await qualified(db, session, "compliance.suspicion", input.id);
  return runOperation(
    db,
    {
      actor: session.actor,
      type: "compliance.suspicion.record",
      idempotencyKey: input.operationId,
      requestHash: hashRequest(input),
    },
    async (ctx) => {
      await qualified(ctx.tx, session, "compliance.suspicion", input.id);
      const policy = await activePolicy(ctx.tx, input.policyId);
      const [participant] = await ctx.tx
        .select({ id: caseParticipants.id })
        .from(caseParticipants)
        .where(
          and(eq(caseParticipants.caseId, input.id), eq(caseParticipants.partyId, input.partyId)),
        )
        .limit(1);
      const reviews = await ctx.tx
        .select({ partyIds: caseProcessReviews.partyIds })
        .from(caseProcessReviews)
        .where(eq(caseProcessReviews.caseId, input.id));
      if (!participant && !reviews.some((review) => review.partyIds.includes(input.partyId)))
        throw new AppError("not_found");
      if (input.reportedAt && (new Date(input.reportedAt) > new Date() || !input.externalReference))
        throw new AppError("validation_failed");
      const [report] = await ctx.tx
        .insert(suspicionReports)
        .values({
          caseId: input.id,
          partyId: input.partyId,
          policyId: input.policyId,
          note: input.note,
          externalReference: input.externalReference || null,
          reportedAt: input.reportedAt ? new Date(input.reportedAt) : null,
          recordedById: session.account.id,
          retainUntil: daysAfter(new Date(), policy.retentionDays, policy.timezone),
          operationId: ctx.operationId,
        })
        .returning({ id: suspicionReports.id });
      if (!report) throw new Error("Restricted record insert failed");
      // Details stay exclusively in the restricted record. No customer message is sent.
      await audit(ctx, "restricted_record.created", report.id, "compliance.suspicion");
      return { id: report.id, caseId: input.id };
    },
  );
}

const commissionSchema = z.object({
  ...envelope,
  id: z.uuid(),
  agreementId: z.uuid(),
  amountMinor: z.int().nonnegative().safe(),
  invoiceReference: text.max(300),
});
export async function recordCommission(
  db: Executor,
  session: Session,
  raw: z.input<typeof commissionSchema>,
) {
  const input = parseInput(commissionSchema, raw);
  await qualified(db, session, "compliance.review", input.id);
  return runOperation(
    db,
    {
      actor: session.actor,
      type: "compliance.commission.record",
      idempotencyKey: input.operationId,
      requestHash: hashRequest(input),
    },
    async (ctx) => {
      await qualified(ctx.tx, session, "compliance.review", input.id);
      const [agreement] = await ctx.tx
        .select()
        .from(serviceAgreements)
        .where(
          and(
            eq(serviceAgreements.id, input.agreementId),
            eq(serviceAgreements.caseId, input.id),
            isNull(serviceAgreements.revokedAt),
          ),
        );
      if (!agreement) throw new AppError("not_found");
      const [row] = await ctx.tx
        .insert(commissionRecords)
        .values({
          caseId: input.id,
          agreementId: agreement.id,
          amountMinor: input.amountMinor,
          invoiceReference: input.invoiceReference,
          recordedById: session.account.id,
          operationId: ctx.operationId,
        })
        .returning({ id: commissionRecords.id });
      if (!row) throw new Error("Commission record insert failed");
      await audit(ctx, "compliance.commission.recorded", row.id, "compliance.review", {
        caseId: input.id,
        agreementId: agreement.id,
      });
      return { id: row.id, caseId: input.id };
    },
  );
}

export async function caseProcessWorkbench(db: Executor, session: Session, caseId: string) {
  await qualified(db, session, "compliance.review", caseId);
  const { row } = await caseFor(db, session, caseId);
  const reviews = await db
    .select()
    .from(caseProcessReviews)
    .where(eq(caseProcessReviews.caseId, caseId));
  return {
    record: row,
    policies: await db
      .select()
      .from(processPolicies)
      .where(isNull(processPolicies.revokedAt))
      .orderBy(desc(processPolicies.createdAt))
      .limit(100),
    reviews,
    items: reviews.length
      ? await db
          .select()
          .from(caseProcessItems)
          .where(
            inArray(
              caseProcessItems.reviewId,
              reviews.map((r) => r.id),
            ),
          )
      : [],
    agreements: await db
      .select()
      .from(serviceAgreements)
      .where(eq(serviceAgreements.caseId, caseId)),
    participants: await db
      .select()
      .from(caseParticipants)
      .where(and(eq(caseParticipants.caseId, caseId), liveParticipation())),
    commissions: await db
      .select()
      .from(commissionRecords)
      .where(eq(commissionRecords.caseId, caseId)),
  };
}

/** A separately authorized projection: never add these records to a normal Case read. */
export async function restrictedCaseRegister(db: Executor, session: Session, caseId: string) {
  await qualified(db, session, "compliance.suspicion", caseId);
  const { row } = await caseFor(db, session, caseId);
  const participants = await db
    .select({ partyId: caseParticipants.partyId })
    .from(caseParticipants)
    .where(eq(caseParticipants.caseId, caseId));
  const reviews = await db
    .select({ partyIds: caseProcessReviews.partyIds })
    .from(caseProcessReviews)
    .where(eq(caseProcessReviews.caseId, caseId));
  return {
    record: row,
    partyIds: [
      ...new Set([...participants.map((p) => p.partyId), ...reviews.flatMap((r) => r.partyIds)]),
    ],
    policies: await db
      .select()
      .from(processPolicies)
      .where(isNull(processPolicies.revokedAt))
      .orderBy(desc(processPolicies.createdAt))
      .limit(100),
    reports: await db
      .select()
      .from(suspicionReports)
      .where(eq(suspicionReports.caseId, caseId))
      .orderBy(desc(suspicionReports.createdAt)),
  };
}
