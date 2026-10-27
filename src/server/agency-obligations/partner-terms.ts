import "server-only";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { agencyPartnerTerms, principals } from "@/db/schema";
import { requireAvailableStaff } from "../auth/availability";
import type { Session } from "../auth/sessions";
import { assertCanRead, can } from "../authz";
import { reviewedEvidence } from "../compliance/agreement-gate";
import { hashRequest } from "../crypto";
import type { Executor } from "../db";
import { AppError, isAppError } from "../errors";
import { runOperation } from "../operations";
import { commandEnvelope, liveStaff, parseInput, version } from "../work/shared";
import {
  agencyHistory,
  agencyPendingFence,
  agencyStaff,
  counterpartyFor,
  evidenceHistory,
  retainedAgencyTransaction,
  retainedCounterpartyFor,
} from "./shared";

const optionalId = z.uuid().nullable();
const instant = z.iso.datetime({ offset: true }).nullable();
const source = z.object({
  caseId: optionalId,
  counterpartyPartyId: z.uuid(),
  relationship: z.enum(["partner", "referral"]),
  purpose: z.string().trim().min(3).max(1500),
  sourceReference: z.string().trim().min(3).max(1000),
  sourceVersion: z.string().trim().min(1).max(200),
  termsText: z
    .string()
    .min(10)
    .max(20000)
    .refine((value) => value.trim().length >= 10),
  documentVersionId: optionalId,
  acceptedReference: z.string().trim().max(1000).nullable(),
  acceptedAt: instant,
  validUntil: instant,
  unknowns: z.string().trim().max(2000),
});
const save = source.extend({
  ...commandEnvelope,
  expectedVersion: z.int().nonnegative(),
  reviewed: z.literal(true),
});
const decision = z.object({
  ...commandEnvelope,
  action: z.enum(["accept", "revoke"]),
  expectedHash: z.string().regex(/^[a-f0-9]{64}$/),
  professionalName: z.string().trim().max(200),
  note: z.string().trim().min(3).max(1500),
  reviewed: z.literal(true),
});
type Terms = typeof agencyPartnerTerms.$inferSelect;
export function partnerTermsHash(
  row: Pick<Terms, keyof z.infer<typeof source> | "documentDigest" | "ownerId">,
) {
  return hashRequest({
    caseId: row.caseId,
    ownerId: row.ownerId,
    counterpartyPartyId: row.counterpartyPartyId,
    relationship: row.relationship,
    purpose: row.purpose,
    sourceReference: row.sourceReference,
    sourceVersion: row.sourceVersion,
    termsText: row.termsText,
    documentVersionId: row.documentVersionId,
    documentDigest: row.documentDigest,
    acceptedReference: row.acceptedReference,
    acceptedAt: row.acceptedAt ? new Date(row.acceptedAt).toISOString() : null,
    validUntil: row.validUntil ? new Date(row.validUntil).toISOString() : null,
    unknowns: row.unknowns,
  });
}

async function access(
  db: Executor,
  session: Session,
  row: Pick<Terms, "caseId" | "documentVersionId" | "counterpartyPartyId">,
  fresh = false,
  retained = false,
) {
  const context = await agencyStaff(db, session, row.caseId, row.documentVersionId, fresh);
  const party = retained
    ? await retainedCounterpartyFor(db, context.live, row)
    : await counterpartyFor(db, context.live, row.counterpartyPartyId, row.caseId);
  return { ...context, party };
}
export async function readPartnerTerms(db: Executor, session: Session, id: string, lock = false) {
  if (!z.uuid().safeParse(id).success) throw new AppError("not_found");
  const query = db.select().from(agencyPartnerTerms).where(eq(agencyPartnerTerms.id, id));
  const [row] = await (lock ? query.for("update") : query);
  if (!row) throw new AppError("not_found");
  const context = await access(db, session, row, false, true);
  let current =
    !context.party.mergedIntoPartyId &&
    row.state === "accepted" &&
    row.approvedHash === partnerTermsHash(row) &&
    Boolean(row.validUntil && row.validUntil > new Date());
  if (current) {
    try {
      await requireAvailableStaff(db, row.ownerId);
    } catch (error) {
      if (!isAppError(error)) throw error;
      current = false;
    }
  }
  if (current && row.documentVersionId) {
    try {
      await reviewedEvidence(db, row.documentVersionId, {
        digest: row.documentDigest ?? undefined,
      });
    } catch (error) {
      if (!isAppError(error)) throw error;
      current = false;
    }
  }
  if (current && row.approvedById)
    current =
      (await can(db, { kind: "staff", id: row.approvedById }, "claim.approve", context.resource)) &&
      (await can(
        db,
        { kind: "staff", id: row.approvedById },
        "compliance.review",
        context.resource,
      ));
  const history = [];
  for (const event of await evidenceHistory(db, "partner_terms", id)) {
    const snapshot = z
      .object({
        caseId: z.uuid().nullable(),
        counterpartyPartyId: z.uuid(),
        documentVersionId: z.uuid().nullable(),
      })
      .safeParse(event.snapshot);
    if (!snapshot.success) continue;
    try {
      await access(db, session, snapshot.data, false, true);
      history.push(event);
    } catch (error) {
      if (!isAppError(error) || !["not_found", "forbidden"].includes(error.code)) throw error;
    }
  }
  const [owner] = await db
    .select({ name: principals.displayName })
    .from(principals)
    .where(eq(principals.id, row.ownerId));
  return { row, ...context, current, history, ownerName: owner?.name ?? "—" };
}

export async function savePartnerTerms(db: Executor, session: Session, raw: unknown) {
  const input = parseInput(save, raw);
  await access(db, session, input, true);
  if (input.expectedVersion) await readPartnerTerms(db, session, input.id);
  return retainedAgencyTransaction(db, async (tx) => {
    // Recheck every ordinary source before runOperation can return an old success receipt.
    const context = await access(tx, session, input, true);
    const [existing] = await tx
      .select({ id: agencyPartnerTerms.id })
      .from(agencyPartnerTerms)
      .where(eq(agencyPartnerTerms.id, input.id))
      .for("update");
    const previous = existing ? (await readPartnerTerms(tx, session, input.id)).row : null;
    if (input.expectedVersion && !previous) throw new AppError("not_found");
    if (previous) await access(tx, session, previous, true);
    await agencyPendingFence(
      tx,
      context.live,
      "agency.partner.save",
      { type: "partner_terms", id: input.id },
      input.operationId,
    );
    return runOperation(
      tx,
      {
        actor: context.live.actor,
        type: "agency.partner.save",
        idempotencyKey: input.operationId,
        requestHash: hashRequest(input),
        expectedVersion: input.expectedVersion,
        subject: { type: "partner_terms", id: input.id },
      },
      async (ctx) => {
        if (previous) version(previous, input.expectedVersion);
        await requireAvailableStaff(ctx.tx, context.live.account.id, true);
        const evidence = input.documentVersionId
          ? await reviewedEvidence(ctx.tx, input.documentVersionId)
          : null;
        const data = {
          ...source.parse(input),
          ownerId: context.live.account.id,
          documentDigest: evidence?.file.sha256 ?? null,
          acceptedReference: input.acceptedReference || null,
          acceptedAt: input.acceptedAt ? new Date(input.acceptedAt) : null,
          validUntil: input.validUntil ? new Date(input.validUntil) : null,
        };
        const patch = {
          ...data,
          termsHash: partnerTermsHash(data),
          state: "draft",
          approvedHash: null,
          approvedById: null,
          approvedAt: null,
          professionalName: null,
          revokedReason: null,
        };
        const [row] = previous
          ? await ctx.tx
              .update(agencyPartnerTerms)
              .set({ ...patch, version: previous.version + 1, updatedAt: new Date() })
              .where(eq(agencyPartnerTerms.id, previous.id))
              .returning()
          : await ctx.tx
              .insert(agencyPartnerTerms)
              .values({ ...patch, id: input.id })
              .returning();
        if (!row) throw new Error("Partner terms save failed");
        await agencyHistory(ctx, "partner_terms", row, "saved");
        return { id: row.id, version: row.version, termsHash: row.termsHash };
      },
    );
  });
}

export async function decidePartnerTerms(db: Executor, session: Session, raw: unknown) {
  const input = parseInput(decision, raw);
  await readPartnerTerms(db, session, input.id);
  return retainedAgencyTransaction(db, async (tx) => {
    const { row } = await readPartnerTerms(tx, session, input.id, true);
    const context = await access(tx, session, row, true, input.action === "revoke");
    await assertCanRead(tx, context.live.actor, "claim.approve", context.resource);
    if (input.action === "accept") await requireAvailableStaff(tx, row.ownerId, true);
    if (input.action === "accept" && row.documentVersionId)
      await reviewedEvidence(tx, row.documentVersionId, {
        digest: row.documentDigest ?? undefined,
      });
    await agencyPendingFence(
      tx,
      context.live,
      "agency.partner.decide",
      { type: "partner_terms", id: row.id },
      input.operationId,
    );
    // A stored approval is still private after a source/grant changes.
    return runOperation(
      tx,
      {
        actor: context.live.actor,
        type: "agency.partner.decide",
        idempotencyKey: input.operationId,
        requestHash: hashRequest(input),
        expectedVersion: input.expectedVersion,
        subject: { type: "partner_terms", id: row.id },
      },
      async (ctx) => {
        version(row, input.expectedVersion);
        if (input.expectedHash !== row.termsHash || row.termsHash !== partnerTermsHash(row))
          throw new AppError("approval_stale");
        if (input.action === "accept") {
          if (
            !row.acceptedReference ||
            !row.acceptedAt ||
            row.acceptedAt > new Date() ||
            !row.validUntil ||
            row.validUntil <= new Date() ||
            row.unknowns ||
            input.professionalName.length < 3
          )
            throw new AppError("transition_denied");
          if (row.documentVersionId)
            await reviewedEvidence(ctx.tx, row.documentVersionId, {
              digest: row.documentDigest ?? undefined,
            });
        }
        const [changed] = await ctx.tx
          .update(agencyPartnerTerms)
          .set({
            state: input.action === "accept" ? "accepted" : "revoked",
            approvedHash: input.action === "accept" ? row.termsHash : null,
            approvedById: context.live.account.id,
            approvedAt: new Date(),
            professionalName: input.professionalName || row.professionalName,
            revokedReason: input.action === "revoke" ? input.note : null,
            version: row.version + 1,
            updatedAt: new Date(),
          })
          .where(eq(agencyPartnerTerms.id, row.id))
          .returning();
        if (!changed) throw new Error("Partner decision failed");
        await agencyHistory(
          ctx,
          "partner_terms",
          { ...changed, decisionNote: input.note },
          input.action,
        );
        return { id: row.id, version: changed.version, termsHash: row.termsHash };
      },
    );
  });
}

export async function listPartnerTerms(db: Executor, session: Session, caseId?: string) {
  if (caseId) await agencyStaff(db, session, caseId);
  else await liveStaff(db, session);
  const candidates = await db
    .select({ id: agencyPartnerTerms.id })
    .from(agencyPartnerTerms)
    .where(caseId ? eq(agencyPartnerTerms.caseId, caseId) : undefined)
    .orderBy(desc(agencyPartnerTerms.updatedAt), desc(agencyPartnerTerms.id));
  const visible = [];
  for (const row of candidates) {
    try {
      visible.push(await readPartnerTerms(db, session, row.id));
    } catch (error) {
      if (!isAppError(error) || !["not_found", "forbidden"].includes(error.code)) throw error;
    }
    if (visible.length === 50) break;
  }
  return visible;
}
