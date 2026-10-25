// O21 / F08 / F24 / AT22 / AT23: exact human-reviewed target editions of a BG source.
import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import {
  approvals,
  contentLocaleEditions,
  contentLocaleVersions,
  contentPageVersions,
} from "@/db/schema";
import { type ApprovalKind, approvalCapability } from "@/domain/approval";
import type { Capability } from "@/domain/capabilities";
import { type PublicLocale, publicLocales } from "@/i18n/config";
import type { Session } from "../auth/sessions";
import { can } from "../authz";
import { hashRequest } from "../crypto";
import type { Executor } from "../db";
import { AppError } from "../errors";
import { findOperation, runOperation } from "../operations";
import { parseInput, version } from "../work/shared";
import {
  contentBodyOf,
  contentEditionAccess,
  contentPageFor,
  contentResource,
  recordContentHistory,
} from "./commands";
import {
  approvedLocaleContent,
  contentBody,
  contentDecisionValid,
  readApprovedContent,
} from "./public";

export const contentTargetLocales = publicLocales.filter((locale) => locale !== "bg") as Exclude<
  PublicLocale,
  "bg"
>[];
const localeSchema = z.enum(["en", "ru", "de", "nl", "el", "he"]);
const binding = {
  id: z.uuid(),
  locale: localeSchema,
  operationId: z.string().min(16).max(200),
  expectedVersion: z.number().int().positive().safe(),
  sourceExpectedVersion: z.number().int().positive().safe(),
  sourceVersionId: z.uuid(),
  sourceVersionHash: z.string().regex(/^[a-f0-9]{64}$/),
};
const saveSchema = z.object({
  ...binding,
  title: z.string().trim().min(1).max(200),
  text: z.string().trim().min(1).max(50000),
});
export const contentLocaleDecisions = [
  "request_review",
  "claims",
  "language",
  "editorial",
  "publish",
  "reject",
  "withdraw",
] as const;
const decideSchema = z.object({
  ...binding,
  decision: z.enum(contentLocaleDecisions),
  note: z.string().trim().min(3).max(1500),
  reviewed: z.literal(true),
  expiresAt: z.iso.datetime({ offset: true }).optional(),
});
export type ContentLocaleDraft = z.input<typeof saveSchema>;
export type ContentLocaleDecision = z.input<typeof decideSchema>;
type Target = z.infer<typeof localeSchema>;

async function editionFor(db: Executor, id: string, locale: Target, lock = false) {
  const query = db
    .select()
    .from(contentLocaleEditions)
    .where(
      and(eq(contentLocaleEditions.contentPageId, id), eq(contentLocaleEditions.locale, locale)),
    );
  const [edition] = await (lock ? query.for("update") : query);
  return edition ?? null;
}

export async function readContentLocaleWorkbench(
  db: Executor,
  session: Session,
  id: string,
  rawLocale: string,
) {
  const locale = parseInput(localeSchema, rawLocale);
  const { live, page } = await contentPageFor(db, session, id, undefined, false, locale);
  const edition = await editionFor(db, id, locale);
  const [current] = edition
    ? await db
        .select()
        .from(contentLocaleVersions)
        .where(
          and(
            eq(contentLocaleVersions.editionId, edition.id),
            eq(contentLocaleVersions.versionNumber, edition.currentVersionNumber),
          ),
        )
    : [];
  const source = await readApprovedContent(db, page.kind, page.slug, "bg");
  const sourceReady = Boolean(source && page.currentVersionNumber === page.publishedVersionNumber);
  const sourceCurrent = Boolean(
    sourceReady &&
      current?.sourceVersionId === source?.version.id &&
      current?.sourceVersionHash === source?.version.contentHash,
  );
  const [boundSource] = current
    ? await db
        .select()
        .from(contentPageVersions)
        .where(
          and(
            eq(contentPageVersions.contentPageId, page.id),
            eq(contentPageVersions.id, current.sourceVersionId),
          ),
        )
    : [];
  const decisions = current
    ? await db
        .select()
        .from(approvals)
        .where(
          and(
            eq(approvals.subjectType, "content_locale_version"),
            eq(approvals.subjectId, current.id),
          ),
        )
        .orderBy(desc(approvals.decidedAt))
    : [];
  const capabilities: Capability[] = [
    "content.edit",
    "claim.approve",
    "translation.review",
    "listing.review_facts",
    "publication.release",
  ];
  const access = Object.fromEntries(
    await Promise.all(
      capabilities.map(async (capability) => [
        capability,
        await can(db, live.actor, capability, contentResource(id, locale)),
      ]),
    ),
  ) as Record<Capability, boolean>;
  return {
    page,
    edition,
    current: current ?? null,
    source,
    sourceReady,
    sourceCurrent,
    boundSource:
      boundSource?.sourceLocale === "bg" &&
      boundSource.contentHash === current?.sourceVersionHash &&
      hashRequest(boundSource.body) === boundSource.contentHash
        ? boundSource
        : null,
    decisions,
    access,
    localeEditions: await contentEditionAccess(db, live.actor, id),
  };
}

async function checkedSource(
  db: Executor,
  page: Awaited<ReturnType<typeof contentPageFor>>["page"],
  input: z.infer<typeof saveSchema> | z.infer<typeof decideSchema>,
) {
  version(page, input.sourceExpectedVersion);
  const source = await readApprovedContent(db, page.kind, page.slug, "bg");
  if (
    !source ||
    page.currentVersionNumber !== page.publishedVersionNumber ||
    source.version.id !== input.sourceVersionId ||
    source.version.contentHash !== input.sourceVersionHash
  )
    throw new AppError("approval_stale");
  return source;
}

export async function saveContentLocale(db: Executor, session: Session, raw: ContentLocaleDraft) {
  const input = parseInput(saveSchema, raw);
  const { live } = await contentPageFor(db, session, input.id, "content.edit", false, input.locale);
  return runOperation(
    db,
    {
      actor: live.actor,
      type: `content.locale.save.${input.locale}`,
      idempotencyKey: input.operationId,
      requestHash: hashRequest(input),
      expectedVersion: input.expectedVersion,
      subject: { type: "content_page", id: input.id },
    },
    async (ctx) => {
      const { page } = await contentPageFor(
        ctx.tx,
        session,
        input.id,
        "content.edit",
        true,
        input.locale,
      );
      const source = await checkedSource(ctx.tx, page, input);
      let edition = await editionFor(ctx.tx, page.id, input.locale, true);
      if ((edition?.version ?? 1) !== input.expectedVersion) throw new AppError("version_conflict");
      if (!edition) {
        const [inserted] = await ctx.tx
          .insert(contentLocaleEditions)
          .values({ contentPageId: page.id, locale: input.locale })
          .returning();
        edition = inserted ?? null;
      }
      if (!edition) throw new Error("Locale edition insert failed");
      const body = contentBodyOf({ ...input, placeId: source.placeId });
      const number = edition.currentVersionNumber + 1;
      await ctx.tx.insert(contentLocaleVersions).values({
        editionId: edition.id,
        versionNumber: number,
        sourceVersionId: source.version.id,
        sourceVersionHash: source.version.contentHash,
        body,
        contentHash: hashRequest(body),
        jurisdiction: source.jurisdiction,
        reviewScope: source.reviewScope,
        createdById: live.actor.id,
      });
      const recordedAt = new Date();
      await ctx.tx
        .update(contentLocaleEditions)
        .set({
          currentVersionNumber: number,
          reviewState: "draft",
          version: sql`${contentLocaleEditions.version} + 1`,
          updatedAt: recordedAt,
        })
        .where(eq(contentLocaleEditions.id, edition.id));
      await recordContentHistory(ctx, page, "locale_draft_saved", "content.edit", {
        locale: input.locale,
        editionVersion: number,
        sourceVersionId: source.version.id,
        sourceVersionHash: source.version.contentHash,
      });
      return {
        id: page.id,
        locale: input.locale,
        version: edition.version + 1,
        editionVersion: number,
        reviewState: "draft",
        recordedAt: recordedAt.toISOString(),
      };
    },
  );
}

export function contentLocaleDecisionCapability(
  decision: ContentLocaleDecision["decision"],
): Capability {
  return decision === "request_review"
    ? "content.edit"
    : decision === "claims"
      ? "claim.approve"
      : decision === "language" || decision === "reject"
        ? "translation.review"
        : decision === "editorial"
          ? "listing.review_facts"
          : "publication.release";
}

export async function decideContentLocale(
  db: Executor,
  session: Session,
  raw: ContentLocaleDecision,
) {
  const input = parseInput(decideSchema, raw);
  const capability = contentLocaleDecisionCapability(input.decision);
  const { live } = await contentPageFor(db, session, input.id, capability, false, input.locale);
  return runOperation(
    db,
    {
      actor: live.actor,
      type: `content.locale.decide.${input.locale}`,
      idempotencyKey: input.operationId,
      requestHash: hashRequest(input),
      expectedVersion: input.expectedVersion,
      subject: { type: "content_page", id: input.id },
    },
    async (ctx) => {
      const { page } = await contentPageFor(
        ctx.tx,
        session,
        input.id,
        capability,
        true,
        input.locale,
      );
      const edition = await editionFor(ctx.tx, page.id, input.locale, true);
      if (!edition) throw new AppError("not_found");
      version(edition, input.expectedVersion);
      const recordedAt = new Date();
      if (input.decision === "withdraw") {
        await ctx.tx
          .update(contentLocaleEditions)
          .set({
            publicationState: "withdrawn",
            version: sql`${contentLocaleEditions.version} + 1`,
            updatedAt: recordedAt,
          })
          .where(eq(contentLocaleEditions.id, edition.id));
        await recordContentHistory(ctx, page, "locale_withdrawn", capability, {
          locale: input.locale,
          reason: input.note,
        });
        return {
          id: page.id,
          locale: input.locale,
          version: edition.version + 1,
          editionVersion: edition.currentVersionNumber,
          reviewState: edition.reviewState,
          recordedAt: recordedAt.toISOString(),
        };
      }
      const source = await checkedSource(ctx.tx, page, input);
      const [current] = await ctx.tx
        .select()
        .from(contentLocaleVersions)
        .where(
          and(
            eq(contentLocaleVersions.editionId, edition.id),
            eq(contentLocaleVersions.versionNumber, edition.currentVersionNumber),
          ),
        );
      if (
        !current ||
        current.sourceVersionId !== source.version.id ||
        current.sourceVersionHash !== source.version.contentHash ||
        current.contentHash !== hashRequest(current.body)
      )
        throw new AppError("approval_stale");
      const body = parseInput(contentBody, current.body);
      if ((body.placeId ?? null) !== source.placeId) throw new AppError("approval_stale");
      let reviewState = edition.reviewState;
      if (input.decision === "request_review") {
        if (edition.reviewState !== "draft") throw new AppError("approval_stale");
        reviewState = "in_review";
      } else {
        if (input.decision !== "reject" && edition.reviewState !== "in_review")
          throw new AppError("approval_stale");
        const kind: ApprovalKind =
          input.decision === "claims"
            ? "legal_process_claim"
            : input.decision === "language" || input.decision === "reject"
              ? "language"
              : input.decision === "editorial"
                ? "editorial"
                : "publication";
        const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
        if (input.decision !== "reject" && (!expiresAt || expiresAt <= recordedAt))
          throw new AppError("validation_failed", {
            fieldErrors: { expiresAt: ["future_review_expiry_required"] },
          });
        await ctx.tx.insert(approvals).values({
          kind,
          state: input.decision === "reject" ? "rejected" : "approved",
          subjectType: "content_locale_version",
          subjectId: current.id,
          subjectVersion: current.versionNumber,
          subjectHash: current.contentHash,
          scope: {
            locale: input.locale,
            destination: "public_web",
            sourceVersionId: source.version.id,
            sourceVersionHash: source.version.contentHash,
            jurisdiction: current.jurisdiction,
            reviewScope: current.reviewScope,
          },
          evidence: {
            operatorNote: input.note,
            sourceVersionId: source.version.id,
            sourceVersionHash: source.version.contentHash,
          },
          requestedByKind: "staff",
          requestedById: live.actor.id,
          decidedByKind: "staff",
          decidedById: live.actor.id,
          decidedWithCapability: approvalCapability[kind],
          decidedAt: recordedAt,
          decisionNote: input.note,
          expiresAt,
        });
        if (input.decision === "reject") {
          reviewState = "rejected";
          await ctx.tx
            .update(approvals)
            .set({
              state: "invalidated",
              invalidatedAt: recordedAt,
              invalidationReason: "locale_revision_rejected",
            })
            .where(
              and(
                eq(approvals.subjectType, "content_locale_version"),
                eq(approvals.subjectId, current.id),
                eq(approvals.state, "approved"),
              ),
            );
        } else if (input.decision === "publish") {
          const decisions = await ctx.tx
            .select()
            .from(approvals)
            .where(
              and(
                eq(approvals.subjectType, "content_locale_version"),
                eq(approvals.subjectId, current.id),
              ),
            );
          if (!approvedLocaleContent(source, current, decisions, input.locale, recordedAt))
            throw new AppError("publication_ineligible");
          reviewState = "approved";
        }
      }
      await ctx.tx
        .update(contentLocaleEditions)
        .set({
          reviewState,
          version: sql`${contentLocaleEditions.version} + 1`,
          updatedAt: recordedAt,
          ...(input.decision === "publish"
            ? { publicationState: "active" as const, publishedVersionNumber: current.versionNumber }
            : {}),
          ...(input.decision === "reject" &&
          edition.publishedVersionNumber === current.versionNumber
            ? { publicationState: "withdrawn" as const }
            : {}),
        })
        .where(eq(contentLocaleEditions.id, edition.id));
      await recordContentHistory(ctx, page, `locale_${input.decision}`, capability, {
        locale: input.locale,
        editionVersion: current.versionNumber,
        contentHash: current.contentHash,
        sourceVersionId: source.version.id,
        sourceVersionHash: source.version.contentHash,
        reviewState,
      });
      return {
        id: page.id,
        locale: input.locale,
        version: edition.version + 1,
        editionVersion: current.versionNumber,
        reviewState,
        recordedAt: recordedAt.toISOString(),
      };
    },
  );
}

export async function readContentLocaleOperation(
  db: Executor,
  session: Session,
  id: string,
  rawLocale: string,
  kind: "save" | "decide",
  key: string,
) {
  const locale = parseInput(localeSchema, rawLocale);
  const { live } = await contentPageFor(db, session, id, undefined, false, locale);
  const operation = await findOperation(db, live.actor, `content.locale.${kind}.${locale}`, key);
  const outcome = operation?.outcome as {
    id?: string;
    locale?: string;
    recordedAt?: string;
    reviewState?: string;
    editionVersion?: number;
  } | null;
  if (
    operation &&
    ((operation.resultId && operation.resultId !== id) ||
      (operation.status === "succeeded" && (outcome?.id !== id || outcome.locale !== locale)))
  )
    throw new AppError("not_found");
  return operation
    ? {
        status: operation.status,
        operationId: operation.operationId,
        outcome: operation.status === "succeeded" ? outcome : null,
      }
    : null;
}

export function reviewedContentLocaleKinds(
  workbench: Awaited<ReturnType<typeof readContentLocaleWorkbench>>,
  locale: PublicLocale,
  now = new Date(),
) {
  const { source, current, sourceCurrent, decisions } = workbench;
  if (!source || !current || !sourceCurrent) return [];
  return (["legal_process_claim", "language", "editorial", "publication"] as const).filter((kind) =>
    decisions.some((decision) =>
      contentDecisionValid(decision, kind, current, locale, now, {
        id: source.version.id,
        contentHash: source.version.contentHash,
      }),
    ),
  );
}
