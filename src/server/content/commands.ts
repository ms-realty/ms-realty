// O21: immutable plaintext versions and separate human editorial, claim and release decisions.
import "server-only";
import { and, desc, eq, inArray, or, type SQL, sql } from "drizzle-orm";
import { z } from "zod";
import { approvals, contentPages, contentPageVersions } from "@/db/schema";
import { type ApprovalKind, approvalCapability } from "@/domain/approval";
import type { Capability } from "@/domain/capabilities";
import { recordActivity } from "../activity";
import { recordAudit } from "../audit";
import type { Session } from "../auth/sessions";
import { assertCan, can, resolveGrants } from "../authz";
import { hashRequest } from "../crypto";
import type { Executor } from "../db";
import { AppError } from "../errors";
import { findOperation, type OperationContext, runOperation } from "../operations";
import { commandEnvelope, liveStaff, parseInput, version } from "../work/shared";
import { approvedContent, contentBody } from "./public";

export const contentKinds = ["area", "service", "help"] as const;
const operationId = z.string().min(16).max(200);
const textInput = {
  title: z.string().trim().min(1).max(200),
  text: z.string().trim().min(1).max(50000),
  jurisdiction: z.string().trim().min(2).max(200),
  reviewScope: z.string().trim().min(3).max(1000),
};
const createSchema = z.object({
  operationId,
  kind: z.enum(contentKinds),
  slug: z.string().regex(/^[a-z\d][a-z\d-]{0,100}$/),
  ...textInput,
});
const saveSchema = z.object({ ...commandEnvelope, ...textInput });
const decideSchema = z.object({
  ...commandEnvelope,
  decision: z.enum(["claims", "editorial", "publish", "withdraw"]),
  note: z.string().trim().min(3).max(1500),
  reviewed: z.literal(true),
  expiresAt: z.iso.datetime({ offset: true }).optional(),
});
export type ContentDraft = z.input<typeof saveSchema>;
export type CreateContent = z.input<typeof createSchema>;
export type ContentDecision = z.input<typeof decideSchema>;
type Page = typeof contentPages.$inferSelect;
const readCapabilities: Capability[] = [
  "content.edit",
  "listing.review_facts",
  "claim.approve",
  "publication.release",
];
const resource = (id?: string) => ({
  type: "content_page",
  ...(id ? { id } : {}),
  locale: "bg" as const,
  audience: "internal" as const,
});

async function pageFor(
  db: Executor,
  session: Session,
  id: string,
  capability?: Capability,
  lock = false,
) {
  const live = await liveStaff(db, session);
  const query = db
    .select()
    .from(contentPages)
    .where(eq(contentPages.id, parseInput(z.uuid(), id)));
  const [page] = await (lock ? query.for("update") : query);
  if (!page || !contentKinds.some((kind) => kind === page.kind)) throw new AppError("not_found");
  const permitted = await Promise.all(
    readCapabilities.map((cap) => can(db, live.actor, cap, resource(id))),
  );
  if (!permitted.some(Boolean)) throw new AppError("not_found");
  if (capability) await assertCan(db, live.actor, capability, resource(id));
  return { live, page };
}

export async function listContent(db: Executor, session: Session) {
  const live = await liveStaff(db, session);
  const grants = await resolveGrants(db, live.actor);
  const branches = grants
    .filter((grant) => readCapabilities.includes(grant.capability))
    .flatMap(({ scope }) => {
      if (scope?.recordType && scope.recordType !== "content_page") return [];
      if (scope?.locales && !scope.locales.includes("bg")) return [];
      const terms: SQL[] = [];
      if (scope?.recordId) terms.push(eq(contentPages.id, scope.recordId));
      return [and(...terms) ?? sql`true`];
    });
  return {
    canCreate: await can(db, live.actor, "content.edit", resource()),
    rows: await db
      .select()
      .from(contentPages)
      .where(and(inArray(contentPages.kind, contentKinds), or(...branches) ?? sql`false`))
      .orderBy(desc(contentPages.updatedAt))
      .limit(100),
  };
}

export async function readContentWorkbench(db: Executor, session: Session, id: string) {
  const { live, page } = await pageFor(db, session, id);
  const versions = await db
    .select()
    .from(contentPageVersions)
    .where(eq(contentPageVersions.contentPageId, id))
    .orderBy(desc(contentPageVersions.versionNumber))
    .limit(20);
  const current = versions.find((row) => row.versionNumber === page.currentVersionNumber);
  if (!current) throw new AppError("not_found");
  const decisions = await db
    .select()
    .from(approvals)
    .where(
      and(eq(approvals.subjectType, "content_page_version"), eq(approvals.subjectId, current.id)),
    )
    .orderBy(desc(approvals.decidedAt));
  const access = Object.fromEntries(
    await Promise.all(
      readCapabilities.map(async (cap) => [cap, await can(db, live.actor, cap, resource(id))]),
    ),
  ) as Record<Capability, boolean>;
  return { page, current, versions, decisions, access };
}

export async function readContentOperation(
  db: Executor,
  session: Session,
  kind: "create" | "save" | "decide",
  key: string,
  id?: string,
) {
  const live = await liveStaff(db, session);
  if (id) await pageFor(db, session, id);
  else await assertCan(db, live.actor, "content.edit", resource());
  const operation = await findOperation(db, live.actor, `content.${kind}`, key);
  const outcome = operation?.outcome as { id?: string } | null;
  if (operation?.status === "succeeded" && outcome?.id) await pageFor(db, session, outcome.id);
  return operation
    ? { status: operation.status, id: operation.status === "succeeded" ? outcome?.id : undefined }
    : null;
}

function bodyOf(input: { title: string; text: string }) {
  return parseInput(contentBody, {
    title: input.title,
    paragraphs: input.text
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean),
  });
}
async function history(
  ctx: OperationContext,
  page: Page,
  action: string,
  capability: Capability,
  extra: Record<string, unknown> = {},
) {
  await recordActivity(ctx.tx, {
    recordType: "content_page",
    recordId: page.id,
    actor: ctx.actor,
    operationId: ctx.operationId,
    messageKey: `content.${action}`,
    summary: `Content ${action}`,
    params: { version: page.currentVersionNumber, ...extra },
  });
  await recordAudit(ctx.tx, {
    recordType: "content_page",
    recordId: page.id,
    actor: ctx.actor,
    capability,
    operationId: ctx.operationId,
    action: `content.${action}`,
    payload: { version: page.currentVersionNumber, ...extra },
  });
}

export async function createContent(db: Executor, session: Session, raw: CreateContent) {
  const input = parseInput(createSchema, raw),
    body = bodyOf(input);
  const live = await liveStaff(db, session);
  await assertCan(db, live.actor, "content.edit", resource());
  return runOperation(
    db,
    {
      actor: live.actor,
      type: "content.create",
      idempotencyKey: input.operationId,
      requestHash: hashRequest(input),
    },
    async (ctx) => {
      await liveStaff(ctx.tx, session);
      await assertCan(ctx.tx, live.actor, "content.edit", resource());
      await ctx.tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`content:${input.kind}:${input.slug}`}, 0))`,
      );
      const duplicate = await ctx.tx
        .select({ id: contentPages.id })
        .from(contentPages)
        .where(and(eq(contentPages.kind, input.kind), eq(contentPages.slug, input.slug)))
        .limit(1);
      if (duplicate.length)
        throw new AppError("validation_failed", { fieldErrors: { slug: ["already_exists"] } });
      const [page] = await ctx.tx
        .insert(contentPages)
        .values({ kind: input.kind, slug: input.slug, currentVersionNumber: 1 })
        .returning();
      if (!page) throw new Error("Content page insert failed");
      await ctx.tx.insert(contentPageVersions).values({
        contentPageId: page.id,
        versionNumber: 1,
        sourceLocale: "bg",
        body,
        contentHash: hashRequest(body),
        jurisdiction: input.jurisdiction,
        reviewScope: input.reviewScope,
        createdById: live.actor.id,
      });
      await history(ctx, page, "created", "content.edit");
      return { id: page.id, version: page.version, recordedAt: page.createdAt.toISOString() };
    },
  );
}

export async function saveContent(db: Executor, session: Session, raw: ContentDraft) {
  const input = parseInput(saveSchema, raw),
    body = bodyOf(input);
  const { live } = await pageFor(db, session, input.id, "content.edit");
  return runOperation(
    db,
    {
      actor: live.actor,
      type: "content.save",
      idempotencyKey: input.operationId,
      requestHash: hashRequest(input),
      expectedVersion: input.expectedVersion,
    },
    async (ctx) => {
      const { page } = await pageFor(ctx.tx, session, input.id, "content.edit", true);
      version(page, input.expectedVersion);
      const number = page.currentVersionNumber + 1;
      await ctx.tx.insert(contentPageVersions).values({
        contentPageId: page.id,
        versionNumber: number,
        sourceLocale: "bg",
        body,
        contentHash: hashRequest(body),
        jurisdiction: input.jurisdiction,
        reviewScope: input.reviewScope,
        createdById: live.actor.id,
      });
      await ctx.tx
        .update(contentPages)
        .set({
          currentVersionNumber: number,
          editorialState: "draft",
          version: sql`${contentPages.version} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(contentPages.id, page.id));
      await history(ctx, { ...page, currentVersionNumber: number }, "draft_saved", "content.edit");
      return { id: page.id, version: page.version + 1, recordedAt: new Date().toISOString() };
    },
  );
}

export async function decideContent(db: Executor, session: Session, raw: ContentDecision) {
  const input = parseInput(decideSchema, raw);
  const kind: ApprovalKind =
    input.decision === "claims"
      ? "legal_process_claim"
      : input.decision === "editorial"
        ? "editorial"
        : "publication";
  const capability = approvalCapability[kind];
  const { live } = await pageFor(db, session, input.id, capability);
  return runOperation(
    db,
    {
      actor: live.actor,
      type: "content.decide",
      idempotencyKey: input.operationId,
      requestHash: hashRequest(input),
      expectedVersion: input.expectedVersion,
    },
    async (ctx) => {
      const { page } = await pageFor(ctx.tx, session, input.id, capability, true);
      version(page, input.expectedVersion);
      if (input.decision === "withdraw") {
        await ctx.tx
          .update(contentPages)
          .set({
            publicationState: "withdrawn",
            version: sql`${contentPages.version} + 1`,
            updatedAt: new Date(),
          })
          .where(eq(contentPages.id, page.id));
        await history(ctx, page, "withdrawn", capability, { reason: input.note });
        return { id: page.id, version: page.version + 1, recordedAt: new Date().toISOString() };
      }
      const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
      if (!expiresAt || expiresAt <= new Date())
        throw new AppError("validation_failed", {
          fieldErrors: { expiresAt: ["future_review_expiry_required"] },
        });
      const [current] = await ctx.tx
        .select()
        .from(contentPageVersions)
        .where(
          and(
            eq(contentPageVersions.contentPageId, page.id),
            eq(contentPageVersions.versionNumber, page.currentVersionNumber),
          ),
        );
      if (!current) throw new AppError("not_found");
      let candidate = current;
      if (input.decision === "claims") {
        // ReviewedAt belongs to the immutable reviewed edition; draft content is not rewritten.
        const [reviewed] = await ctx.tx
          .insert(contentPageVersions)
          .values({
            contentPageId: page.id,
            versionNumber: page.currentVersionNumber + 1,
            contentHash: current.contentHash,
            sourceLocale: current.sourceLocale,
            body: current.body,
            jurisdiction: current.jurisdiction,
            reviewScope: current.reviewScope,
            reviewedAt: new Date(),
            createdById: live.actor.id,
          })
          .returning();
        if (!reviewed) throw new Error("Reviewed content edition insert failed");
        candidate = reviewed;
      } else if (!candidate.reviewedAt) throw new AppError("approval_stale");
      await ctx.tx.insert(approvals).values({
        kind,
        state: "approved",
        subjectType: "content_page_version",
        subjectId: candidate.id,
        subjectVersion: candidate.versionNumber,
        subjectHash: candidate.contentHash,
        scope: {
          locale: "bg",
          destination: "public_web",
          jurisdiction: candidate.jurisdiction,
          reviewScope: candidate.reviewScope,
        },
        evidence: { reviewedAt: candidate.reviewedAt?.toISOString(), operatorNote: input.note },
        requestedByKind: "staff",
        requestedById: live.actor.id,
        decidedByKind: "staff",
        decidedById: live.actor.id,
        decidedWithCapability: capability,
        decidedAt: new Date(),
        decisionNote: input.note,
        expiresAt,
      });
      if (input.decision === "publish") {
        const decisions = await ctx.tx
          .select()
          .from(approvals)
          .where(
            and(
              eq(approvals.subjectType, "content_page_version"),
              eq(approvals.subjectId, candidate.id),
            ),
          );
        if (!approvedContent(candidate, decisions, "bg"))
          throw new AppError("publication_ineligible");
      }
      await ctx.tx
        .update(contentPages)
        .set({
          currentVersionNumber: candidate.versionNumber,
          editorialState: input.decision === "claims" ? "in_review" : "approved_revision",
          ...(input.decision === "publish"
            ? {
                publicationState: "active" as const,
                publishedVersionNumber: candidate.versionNumber,
              }
            : {}),
          version: sql`${contentPages.version} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(contentPages.id, page.id));
      await history(
        ctx,
        { ...page, currentVersionNumber: candidate.versionNumber },
        input.decision,
        capability,
        { contentHash: candidate.contentHash, approvalKind: kind },
      );
      return { id: page.id, version: page.version + 1, recordedAt: new Date().toISOString() };
    },
  );
}
