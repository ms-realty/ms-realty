import "server-only";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
  approvals,
  listingRevisions,
  listings,
  localizedRevisions,
  propertyFactRevisions,
  propertyFacts,
} from "@/db/schema";
import { canonicalJson } from "@/domain/approval";
import type { Actor } from "@/domain/capabilities";
import { type PublicLocale, publicLocales } from "@/domain/ids";
import { guardLocaleTransition, localeMachine } from "@/domain/localized-revision";
import { recordActivity } from "../activity";
import { recordAudit } from "../audit";
import { assertCan } from "../authz";
import { hashRequest, sha256Hex } from "../crypto";
import type { Executor } from "../db";
import { AppError } from "../errors";
import { runOperation } from "../operations";
import { localizedRevisionDigest } from "../publication/commands";

const envelope = z.object({
  reference: z.string().min(1),
  sourceRevisionId: z.uuid(),
  locale: z.enum(publicLocales).refine((l) => l !== "bg"),
  operationId: z.uuid(),
  expectedRevision: z.number().int().nonnegative(),
});
type Command = z.infer<typeof envelope> & { actor: Actor };
const copySchema = z.object({
  title: z.string().trim().min(1).max(180),
  description: z.string().trim().min(1).max(12000),
});
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new AppError("validation_failed", {
      fieldErrors: Object.fromEntries(
        result.error.issues.map((i) => [i.path.join("."), [i.message]]),
      ),
    });
  return result.data;
}
async function source(
  db: Executor,
  actor: Actor,
  reference: string,
  locale: PublicLocale,
  capability: "listing.read" | "translation.draft" | "translation.review",
  lock = false,
) {
  if (actor.kind !== "staff") throw new AppError("forbidden");
  const query = db
    .select()
    .from(listings)
    .where(eq(listings.reference, reference.trim().toUpperCase()));
  const [listing] = await (lock ? query.for("update") : query);
  if (!listing) throw new AppError("not_found");
  await assertCan(db, actor, capability, {
    type: "listing",
    id: listing.id,
    propertyId: listing.propertyId,
    locale,
  });
  if (!listing.approvedRevisionId) throw new AppError("transition_denied");
  const [revision] = await db
    .select()
    .from(listingRevisions)
    .where(eq(listingRevisions.id, listing.approvedRevisionId));
  if (!revision) throw new AppError("not_found");
  const [facts] = await db
    .select()
    .from(propertyFactRevisions)
    .where(eq(propertyFactRevisions.id, revision.factRevisionId));
  if (!facts) throw new AppError("not_found");
  const sourceFacts = await db
    .select()
    .from(propertyFacts)
    .where(eq(propertyFacts.factRevisionId, facts.id));
  const protectedFactsDigest = sha256Hex(
    canonicalJson({
      reference: listing.reference,
      sourceRevisionId: revision.id,
      sourceDigest: revision.contentDigest,
      factDigest: facts.contentDigest,
      terms: revision.terms,
    }),
  );
  return { listing, revision, sourceFacts, protectedFactsDigest };
}
export async function translationWorkbench(
  db: Executor,
  actor: Actor,
  reference: string,
  locale: PublicLocale,
) {
  if (locale === "bg") throw new AppError("validation_failed");
  const base = await source(db, actor, reference, locale, "listing.read");
  const [translation] = await db
    .select()
    .from(localizedRevisions)
    .where(
      and(
        eq(localizedRevisions.sourceRevisionId, base.revision.id),
        eq(localizedRevisions.locale, locale),
      ),
    );
  return { ...base, translation: translation ?? null };
}
async function history(
  db: Executor,
  actor: Actor,
  operationId: string,
  action: string,
  id: string,
  reference: string,
  locale: PublicLocale,
  payload: Record<string, unknown>,
) {
  await recordActivity(db, {
    recordType: "localized_revision",
    recordId: id,
    reference,
    actor,
    operationId,
    messageKey: `activity.${action}`,
    params: { locale },
    summary: `${action} (${locale})`,
  });
  await recordAudit(db, {
    recordType: "localized_revision",
    recordId: id,
    actor,
    operationId,
    action,
    capability:
      action === "translation.approve" || action === "translation.reject"
        ? "translation.review"
        : "translation.draft",
    payload: { locale, ...payload },
  });
}
export async function saveTranslation(
  db: Executor,
  command: Command & { title: string; description: string },
) {
  const common = parse(envelope, command),
    copy = parse(copySchema, command);
  await source(db, command.actor, common.reference, common.locale, "translation.draft");
  return runOperation(
    db,
    {
      actor: command.actor,
      type: "translation.save",
      idempotencyKey: common.operationId,
      requestHash: hashRequest({ ...common, ...copy }),
    },
    async ({ tx, operationId }) => {
      const base = await source(
        tx,
        command.actor,
        common.reference,
        common.locale,
        "translation.draft",
        true,
      );
      if (base.revision.id !== common.sourceRevisionId) throw new AppError("version_conflict");
      const [existing] = await tx
        .select()
        .from(localizedRevisions)
        .where(
          and(
            eq(localizedRevisions.sourceRevisionId, common.sourceRevisionId),
            eq(localizedRevisions.locale, common.locale),
          ),
        )
        .for("update");
      if ((existing?.version ?? 0) !== common.expectedRevision)
        throw new AppError("version_conflict");
      if (existing && ["approved_for_source", "stale"].includes(existing.state))
        throw new AppError("transition_denied");
      const values = {
        title: copy.title,
        body: { description: copy.description },
        state: "draft" as const,
        draftedByAi: false,
        approvalId: null,
        reviewedFacts: null,
        reviewedById: null,
        reviewedAt: null,
        rejectionReason: null,
      };
      const [saved] = existing
        ? await tx
            .update(localizedRevisions)
            .set({ ...values, version: existing.version + 1 })
            .where(eq(localizedRevisions.id, existing.id))
            .returning()
        : await tx
            .insert(localizedRevisions)
            .values({
              ...values,
              listingId: base.listing.id,
              sourceRevisionId: base.revision.id,
              locale: common.locale,
            })
            .returning();
      if (!saved) throw new Error("Translation save failed");
      await history(
        tx,
        command.actor,
        operationId,
        "translation.save",
        saved.id,
        base.listing.reference,
        common.locale,
        { sourceRevisionId: base.revision.id, digest: localizedRevisionDigest(saved) },
      );
      return {
        reference: base.listing.reference,
        translationId: saved.id,
        version: saved.version,
        locale: common.locale,
      };
    },
  );
}
export async function decideTranslation(
  db: Executor,
  command: Command & {
    intent: "submit" | "approve" | "reject";
    protectedFactsDigest?: string;
    note: string;
  },
) {
  const common = parse(envelope, command);
  const decision = parse(
    z.object({
      intent: z.enum(["submit", "approve", "reject"]),
      protectedFactsDigest: z.string().optional(),
      note: z.string().trim().min(5).max(2000),
    }),
    command,
  );
  const capability = decision.intent === "submit" ? "translation.draft" : "translation.review";
  await source(db, command.actor, common.reference, common.locale, capability);
  return runOperation(
    db,
    {
      actor: command.actor,
      type: `translation.${decision.intent}`,
      idempotencyKey: common.operationId,
      requestHash: hashRequest({ ...common, ...decision }),
    },
    async ({ tx, operationId }) => {
      const base = await source(
        tx,
        command.actor,
        common.reference,
        common.locale,
        capability,
        true,
      );
      const [row] = await tx
        .select()
        .from(localizedRevisions)
        .where(
          and(
            eq(localizedRevisions.sourceRevisionId, common.sourceRevisionId),
            eq(localizedRevisions.locale, common.locale),
          ),
        )
        .for("update");
      if (!row) throw new AppError("not_found");
      if (row.version !== common.expectedRevision || base.revision.id !== common.sourceRevisionId)
        throw new AppError("version_conflict");
      const state =
        decision.intent === "submit"
          ? "reviewing"
          : decision.intent === "approve"
            ? "approved_for_source"
            : "rejected";
      const transition = guardLocaleTransition(
        row.state,
        state,
        {
          sourceRevisionId: row.sourceRevisionId,
          currentSourceRevisionId: base.revision.id,
          protectedFactsChecked: decision.protectedFactsDigest === base.protectedFactsDigest,
          reason: decision.note,
        },
        command.actor,
      );
      if (
        localeMachine.check(row.state, state).outcome !== "allowed" ||
        transition.outcome !== "allowed"
      )
        throw new AppError("transition_denied");
      const version = row.version + 1,
        now = new Date();
      let approvalId: string | null = null;
      if (state === "approved_for_source") {
        const [approval] = await tx
          .insert(approvals)
          .values({
            kind: "language",
            state: "approved",
            subjectType: "localized_revision",
            subjectId: row.id,
            subjectVersion: version,
            subjectHash: localizedRevisionDigest(row),
            scope: { locale: common.locale, sourceRevisionId: base.revision.id },
            evidence: { protectedFactsDigest: base.protectedFactsDigest },
            requestedByKind: "staff",
            requestedById: command.actor.id,
            decidedByKind: "staff",
            decidedById: command.actor.id,
            decidedWithCapability: "translation.review",
            decidedAt: now,
            decisionNote: decision.note,
          })
          .returning();
        if (!approval) throw new Error("Language approval failed");
        approvalId = approval.id;
      }
      await tx
        .update(localizedRevisions)
        .set({
          state,
          version,
          approvalId,
          reviewedById: state === "approved_for_source" ? command.actor.id : null,
          reviewedAt: state === "approved_for_source" ? now : null,
          reviewedFacts:
            state === "approved_for_source"
              ? { protectedFactsDigest: base.protectedFactsDigest }
              : null,
          rejectionReason: state === "rejected" ? decision.note : null,
        })
        .where(eq(localizedRevisions.id, row.id));
      await history(
        tx,
        command.actor,
        operationId,
        `translation.${decision.intent}`,
        row.id,
        base.listing.reference,
        common.locale,
        { sourceRevisionId: base.revision.id, approvalId, note: decision.note },
      );
      return {
        reference: base.listing.reference,
        translationId: row.id,
        version,
        locale: common.locale,
        state,
      };
    },
  );
}
