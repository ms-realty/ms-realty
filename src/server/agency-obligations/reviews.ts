import "server-only";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import {
  agencyCaseReviews,
  approvals,
  caseParticipants,
  cases,
  contentPages,
  contentPageVersions,
  parties,
  principals,
} from "@/db/schema";
import type { Session } from "../auth/sessions";
import { assertCanRead, can } from "../authz";
import { caseFor, liveParticipation, liveUser } from "../cases/shared";
import { reviewedEvidence } from "../compliance/agreement-gate";
import { invalidateContentLocales } from "../content/invalidation";
import { contentBody, readApprovedContent } from "../content/public";
import { hashRequest } from "../crypto";
import type { Executor } from "../db";
import { AppError, isAppError } from "../errors";
import { documentAccess } from "../files/access";
import { runOperation } from "../operations";
import { privacyProcessingRestricted } from "../privacy/restrictions";
import { commandEnvelope, parseInput, version } from "../work/shared";
import {
  agencyHistory,
  agencyPendingFence,
  agencyStaff,
  evidenceHistory,
  retainedAgencyTransaction,
} from "./shared";

type Review = typeof agencyCaseReviews.$inferSelect;
const authorRoles = ["buyer", "co_buyer", "tenant", "seller", "landlord"] as const;
export const caseReviewSaveSchema = z.object({
  ...commandEnvelope,
  expectedVersion: z.int().nonnegative(),
  caseId: z.uuid(),
  authorPartyId: z.uuid(),
  contentPageVersionId: z.uuid(),
  displayChoice: z.enum(["anonymous", "name"]),
  reviewed: z.literal(true),
});
export const caseReviewConsentSchema = z.object({
  ...commandEnvelope,
  expectedHash: z.string().regex(/^[a-f0-9]{64}$/),
  decision: z.enum(["granted", "refused", "withdrawn"]),
  policyVersionId: z.uuid().nullable(),
  reviewed: z.literal(true),
});
export const caseReviewDocumentConsentSchema = caseReviewConsentSchema.extend({
  documentVersionId: z.uuid().nullable(),
  sourceReference: z.string().trim().min(3).max(1000),
});
export const caseReviewVerifySchema = z.object({
  ...commandEnvelope,
  expectedHash: z.string().regex(/^[a-f0-9]{64}$/),
  note: z.string().trim().min(10).max(2000),
  reviewed: z.literal(true),
});

export function reviewBindingHash(
  row: Pick<
    Review,
    | "caseId"
    | "authorPartyId"
    | "contentPageVersionId"
    | "contentHash"
    | "displayChoice"
    | "publicName"
    | "reviewText"
    | "verificationStatement"
  >,
) {
  return hashRequest({
    caseId: row.caseId,
    authorPartyId: row.authorPartyId,
    contentPageVersionId: row.contentPageVersionId,
    contentHash: row.contentHash,
    locale: "bg",
    displayChoice: row.displayChoice,
    publicName: row.publicName,
    reviewText: row.reviewText,
    verificationStatement: row.verificationStatement,
  });
}

async function eligibleAuthor(db: Executor, caseId: string, partyId: string) {
  const [row] = await db
    .select({ record: cases, party: parties })
    .from(cases)
    .innerJoin(
      caseParticipants,
      and(
        eq(caseParticipants.caseId, cases.id),
        eq(caseParticipants.partyId, partyId),
        inArray(caseParticipants.role, [...authorRoles]),
        liveParticipation(),
      ),
    )
    .innerJoin(parties, eq(parties.id, caseParticipants.partyId))
    .where(and(eq(cases.id, caseId), isNull(parties.mergedIntoPartyId)))
    .for("share");
  if (!row || !["completed", "completion_handover", "concluded"].includes(row.record.stage))
    throw new AppError("transition_denied");
  // Never follow a canonical-party merge or recreate assent after an erasure/restriction.
  if (await privacyProcessingRestricted(db, partyId, "client_access"))
    throw new AppError("transition_denied");
  return row;
}

async function currentWording(db: Executor, versionId: string, lock = false) {
  const query = db
    .select({ page: contentPages, content: contentPageVersions })
    .from(contentPageVersions)
    .innerJoin(contentPages, eq(contentPages.id, contentPageVersions.contentPageId))
    .where(eq(contentPageVersions.id, versionId));
  const [row] = await (lock ? query.for("share") : query);
  if (
    row?.page.kind !== "review" ||
    row.content.sourceLocale !== "bg" ||
    row.page.currentVersionNumber !== row.content.versionNumber ||
    row.content.contentHash !== hashRequest(row.content.body)
  )
    throw new AppError("approval_stale");
  const body = parseInput(contentBody, row.content.body);
  if (
    body.paragraphs.length !== 2 ||
    body.placeId ||
    /[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:\+?\d[\s().-]*){7,}/i.test(
      [body.title, ...body.paragraphs].join("\n").replaceAll("+359879696870", ""),
    )
  )
    throw new AppError("validation_failed");
  return { ...row, body };
}

/** Withdrawal uses existing origin and locale restriction primitives, preserving immutable editions. */
async function restrictReviewContent(db: Executor, row: Review) {
  const [content] = await db
    .select()
    .from(contentPageVersions)
    .where(eq(contentPageVersions.id, row.contentPageVersionId));
  if (!content) return;
  await db
    .update(contentPages)
    .set({
      publicationState: "withdrawn",
      version: sql`${contentPages.version} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(contentPages.id, content.contentPageId));
  await invalidateContentLocales(db, content.contentPageId);
  await db
    .update(approvals)
    .set({
      state: "invalidated",
      invalidatedAt: new Date(),
      invalidationReason: "review_consent_or_wording_changed",
    })
    .where(
      and(
        eq(approvals.subjectType, "content_page_version"),
        eq(approvals.subjectId, content.id),
        eq(approvals.state, "approved"),
      ),
    );
}

async function rawReview(db: Executor, id: string, lock = false) {
  if (!z.uuid().safeParse(id).success) throw new AppError("not_found");
  const query = db.select().from(agencyCaseReviews).where(eq(agencyCaseReviews.id, id));
  const [row] = await (lock ? query.for("update") : query);
  if (!row) throw new AppError("not_found");
  return row;
}
async function authorAccess(db: Executor, session: Session, row: Review) {
  const live = await liveUser(db, session);
  const [person] = await db
    .select({ partyId: principals.partyId })
    .from(principals)
    .where(eq(principals.id, live.account.id));
  if (live.account.kind !== "client" || person?.partyId !== row.authorPartyId)
    throw new AppError("not_found");
  return live;
}
export async function readCaseReview(db: Executor, session: Session, id: string) {
  const row = await rawReview(db, id);
  if (session.account.kind === "client") {
    await authorAccess(db, session, row);
    // The author sees only their prepared wording, never Case/other-party evidence.
    return {
      row: {
        id: row.id,
        version: row.version,
        publicName: row.publicName,
        displayChoice: row.displayChoice,
        reviewText: row.reviewText,
        verificationStatement: row.verificationStatement,
        bindingHash: row.bindingHash,
        consentState: row.consentState,
        contentPageVersionId: row.contentPageVersionId,
      },
      history: [],
    };
  }
  await agencyStaff(db, session, row.caseId, row.consentDocumentVersionId);
  const history = [];
  for (const event of await evidenceHistory(db, "case_review", id)) {
    const snapshot = z
      .object({ caseId: z.uuid(), consentDocumentVersionId: z.uuid().nullable() })
      .safeParse(event.snapshot);
    if (!snapshot.success) continue;
    try {
      await agencyStaff(db, session, snapshot.data.caseId, snapshot.data.consentDocumentVersionId);
      history.push(event);
    } catch (error) {
      if (!isAppError(error) || !["not_found", "forbidden"].includes(error.code)) throw error;
    }
  }
  const [verifier] = row.verifiedById
    ? await db
        .select({ name: principals.displayName })
        .from(principals)
        .where(eq(principals.id, row.verifiedById))
    : [];
  return { row, history, verifierName: verifier?.name ?? null };
}
export async function reviewConsentPolicy(
  db: Executor,
  locale: "bg" | "en" | "ru" | "de" | "nl" | "el" | "he" = "bg",
) {
  return readApprovedContent(db, "help", "review-publication-consent", locale);
}

export async function saveCaseReview(db: Executor, session: Session, raw: unknown) {
  const input = parseInput(caseReviewSaveSchema, raw);
  await agencyStaff(db, session, input.caseId, null, true);
  if (input.expectedVersion) await readCaseReview(db, session, input.id);
  return retainedAgencyTransaction(db, async (tx) => {
    const { live } = await agencyStaff(tx, session, input.caseId, null, true);
    const [existing] = await tx
      .select({ id: agencyCaseReviews.id })
      .from(agencyCaseReviews)
      .where(eq(agencyCaseReviews.id, input.id))
      .for("update");
    const previous = existing ? await rawReview(tx, input.id) : null;
    if (input.expectedVersion && !previous) throw new AppError("not_found");
    if (previous) await agencyStaff(tx, live, previous.caseId, previous.consentDocumentVersionId);
    const { page, content, body } = await currentWording(tx, input.contentPageVersionId, true);
    await assertCanRead(tx, live.actor, "content.edit", {
      type: "content_page",
      id: page.id,
      locale: "bg",
      audience: "internal",
    });
    await agencyPendingFence(
      tx,
      live,
      "agency.review.save",
      { type: "case_review", id: input.id },
      input.operationId,
    );
    return runOperation(
      tx,
      {
        actor: live.actor,
        type: "agency.review.save",
        idempotencyKey: input.operationId,
        requestHash: hashRequest(input),
        expectedVersion: input.expectedVersion,
        subject: { type: "case_review", id: input.id },
      },
      async (ctx) => {
        if (previous) version(previous, input.expectedVersion);
        await eligibleAuthor(ctx.tx, input.caseId, input.authorPartyId);
        if (input.displayChoice === "anonymous" && !["Отзив", "Review"].includes(body.title))
          throw new AppError("validation_failed");
        const data = {
          caseId: input.caseId,
          authorPartyId: input.authorPartyId,
          ownerId: live.account.id,
          contentPageVersionId: content.id,
          contentHash: content.contentHash,
          displayChoice: input.displayChoice,
          publicName: body.title,
          reviewText: body.paragraphs[0] as string,
          verificationStatement: body.paragraphs[1] as string,
        };
        if (previous) await restrictReviewContent(ctx.tx, previous);
        const patch = {
          ...data,
          bindingHash: reviewBindingHash(data),
          consentState: "unknown",
          consentHash: null,
          consentSource: null,
          consentDocumentVersionId: null,
          consentDocumentDigest: null,
          consentPolicyVersionId: null,
          consentPolicyHash: null,
          consentById: null,
          consentAt: null,
          consentReference: null,
          verifiedHash: null,
          verifiedById: null,
          verifiedAt: null,
          verificationNote: null,
        };
        const [changed] = previous
          ? await ctx.tx
              .update(agencyCaseReviews)
              .set({ ...patch, version: previous.version + 1, updatedAt: new Date() })
              .where(eq(agencyCaseReviews.id, previous.id))
              .returning()
          : await ctx.tx
              .insert(agencyCaseReviews)
              .values({ ...patch, id: input.id })
              .returning();
        if (!changed) throw new Error("Review save failed");
        await agencyHistory(ctx, "case_review", changed, "prepared");
        return { id: changed.id, version: changed.version, bindingHash: changed.bindingHash };
      },
    );
  });
}

/** Native author assent, refusal and withdrawal are distinct from service/marketing consent. */
export async function decideReviewConsent(
  db: Executor,
  session: Session,
  raw: unknown,
  external = false,
) {
  const input = parseInput(
    external ? caseReviewDocumentConsentSchema : caseReviewConsentSchema,
    raw,
  );
  const row = await rawReview(db, input.id);
  if (external) await agencyStaff(db, session, row.caseId, row.consentDocumentVersionId, true);
  else await authorAccess(db, session, row);
  return retainedAgencyTransaction(db, async (tx) => {
    const current = await rawReview(tx, input.id, true);
    const live = external
      ? (await agencyStaff(tx, session, current.caseId, current.consentDocumentVersionId, true))
          .live
      : await authorAccess(tx, session, current);
    // Negative decisions intentionally do not require policy, current Case access or completion.
    let policy: Awaited<ReturnType<typeof reviewConsentPolicy>> = null;
    let evidence: Awaited<ReturnType<typeof reviewedEvidence>> | null = null;
    if (input.decision === "granted") {
      await eligibleAuthor(tx, current.caseId, current.authorPartyId);
      await currentWording(tx, current.contentPageVersionId, true);
      if (input.expectedHash !== current.bindingHash) throw new AppError("approval_stale");
      if (external) {
        const supplied = caseReviewDocumentConsentSchema.parse(input);
        if (!supplied.documentVersionId) throw new AppError("transition_denied");
        await documentAccess(tx, live, supplied.documentVersionId);
        evidence = await reviewedEvidence(tx, supplied.documentVersionId, {
          caseId: current.caseId,
          purpose: "review_consent",
        });
      } else {
        await caseFor(tx, live, current.caseId);
        policy = await reviewConsentPolicy(tx);
        if (!policy || policy.version.id !== input.policyVersionId)
          throw new AppError("approval_stale");
      }
    }
    await agencyPendingFence(
      tx,
      live,
      external ? "agency.review.consent.document" : "agency.review.consent.client",
      { type: "case_review", id: current.id },
      input.operationId,
    );
    return runOperation(
      tx,
      {
        actor: live.actor,
        type: external ? "agency.review.consent.document" : "agency.review.consent.client",
        idempotencyKey: input.operationId,
        requestHash: hashRequest(input),
        expectedVersion: input.expectedVersion,
        subject: { type: "case_review", id: current.id },
      },
      async (ctx) => {
        version(current, input.expectedVersion);
        if (input.expectedHash !== current.bindingHash) throw new AppError("approval_stale");
        if (input.decision !== "granted") await restrictReviewContent(ctx.tx, current);
        const supplied = external ? caseReviewDocumentConsentSchema.parse(input) : null;
        const [changed] = await ctx.tx
          .update(agencyCaseReviews)
          .set({
            consentState: input.decision,
            consentHash: input.decision === "granted" ? current.bindingHash : null,
            consentSource: external ? "document" : "client",
            consentById: live.account.id,
            consentAt: new Date(),
            consentDocumentVersionId: evidence?.file.id ?? null,
            consentDocumentDigest: evidence?.file.sha256 ?? null,
            consentPolicyVersionId: policy?.version.id ?? null,
            consentPolicyHash: policy?.version.contentHash ?? null,
            consentReference: supplied?.sourceReference ?? null,
            verifiedHash: null,
            verifiedById: null,
            verifiedAt: null,
            verificationNote: null,
            version: current.version + 1,
            updatedAt: new Date(),
          })
          .where(eq(agencyCaseReviews.id, current.id))
          .returning();
        if (!changed) throw new Error("Review consent failed");
        await agencyHistory(ctx, "case_review", changed, `consent_${input.decision}`);
        return { id: changed.id, version: changed.version, consentState: changed.consentState };
      },
    );
  });
}

async function currentConsent(db: Executor, row: Review) {
  if (
    row.bindingHash !== reviewBindingHash(row) ||
    row.consentState !== "granted" ||
    row.consentHash !== row.bindingHash
  )
    throw new AppError("approval_stale");
  await eligibleAuthor(db, row.caseId, row.authorPartyId);
  await currentWording(db, row.contentPageVersionId, true);
  if (row.consentSource === "document" && row.consentDocumentVersionId)
    await reviewedEvidence(db, row.consentDocumentVersionId, {
      caseId: row.caseId,
      purpose: "review_consent",
      digest: row.consentDocumentDigest ?? undefined,
    });
  else if (row.consentSource === "client") {
    const policy = await reviewConsentPolicy(db);
    if (
      !policy ||
      policy.version.id !== row.consentPolicyVersionId ||
      policy.version.contentHash !== row.consentPolicyHash
    )
      throw new AppError("approval_stale");
    const [person] = row.consentById
      ? await db.select().from(principals).where(eq(principals.id, row.consentById))
      : [];
    if (person?.partyId !== row.authorPartyId || person.kind !== "client")
      throw new AppError("approval_stale");
  } else throw new AppError("approval_stale");
}

export async function verifyCaseReview(db: Executor, session: Session, raw: unknown) {
  const input = parseInput(caseReviewVerifySchema, raw);
  await readCaseReview(db, session, input.id);
  return retainedAgencyTransaction(db, async (tx) => {
    const row = await rawReview(tx, input.id, true);
    const { live, resource } = await agencyStaff(
      tx,
      session,
      row.caseId,
      row.consentDocumentVersionId,
      true,
    );
    await assertCanRead(tx, live.actor, "claim.approve", resource);
    await currentConsent(tx, row);
    await agencyPendingFence(
      tx,
      live,
      "agency.review.verify",
      { type: "case_review", id: row.id },
      input.operationId,
    );
    return runOperation(
      tx,
      {
        actor: live.actor,
        type: "agency.review.verify",
        idempotencyKey: input.operationId,
        requestHash: hashRequest(input),
        expectedVersion: input.expectedVersion,
        subject: { type: "case_review", id: row.id },
      },
      async (ctx) => {
        version(row, input.expectedVersion);
        if (input.expectedHash !== row.bindingHash) throw new AppError("approval_stale");
        const [changed] = await ctx.tx
          .update(agencyCaseReviews)
          .set({
            verifiedHash: row.bindingHash,
            verifiedById: live.account.id,
            verifiedAt: new Date(),
            verificationNote: input.note,
            version: row.version + 1,
            updatedAt: new Date(),
          })
          .where(eq(agencyCaseReviews.id, row.id))
          .returning();
        if (!changed) throw new Error("Review verification failed");
        await agencyHistory(ctx, "case_review", changed, "verified");
        return { id: row.id, version: changed.version, bindingHash: row.bindingHash };
      },
    );
  });
}

/** Read and CMS publish share this live gate. It returns no private evidence to the public. */
export async function reviewDisplayEligible(db: Executor, contentVersionId: string, locale = "bg") {
  if (locale !== "bg") return false; // A translation needs its own exact wording assent.
  const rows = await db
    .select()
    .from(agencyCaseReviews)
    .where(eq(agencyCaseReviews.contentPageVersionId, contentVersionId));
  if (rows.length !== 1) return false;
  const row = rows[0] as Review;
  if (
    !row.verifiedHash ||
    row.verifiedHash !== row.bindingHash ||
    !row.verifiedById ||
    !row.verifiedAt ||
    row.verifiedAt > new Date()
  )
    return false;
  try {
    await currentConsent(db, row);
    const actor = { kind: "staff" as const, id: row.verifiedById };
    return (
      (await can(db, actor, "claim.approve", {
        type: "case",
        id: row.caseId,
        audience: "internal",
      })) &&
      (await can(db, actor, "compliance.review", {
        type: "case",
        id: row.caseId,
        audience: "internal",
      }))
    );
  } catch (error) {
    if (!isAppError(error)) throw error;
    return false;
  }
}

export async function listCaseReviews(db: Executor, session: Session, caseId?: string) {
  const live = await liveUser(db, session);
  const [person] = await db
    .select({ partyId: principals.partyId })
    .from(principals)
    .where(eq(principals.id, live.account.id));
  const found = await db
    .select({ id: agencyCaseReviews.id })
    .from(agencyCaseReviews)
    .where(
      and(
        caseId ? eq(agencyCaseReviews.caseId, caseId) : undefined,
        live.account.kind === "client"
          ? eq(
              agencyCaseReviews.authorPartyId,
              person?.partyId ?? "00000000-0000-0000-0000-000000000000",
            )
          : undefined,
      ),
    )
    .orderBy(desc(agencyCaseReviews.updatedAt));
  const visible = [];
  for (const row of found) {
    try {
      visible.push(await readCaseReview(db, live, row.id));
    } catch (error) {
      if (!isAppError(error) || !["not_found", "forbidden"].includes(error.code)) throw error;
    }
    if (visible.length === 50) break;
  }
  return visible;
}
