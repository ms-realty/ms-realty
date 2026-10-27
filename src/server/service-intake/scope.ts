import "server-only";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import {
  geographyPlaces,
  grants,
  passkeys,
  serviceScopeDrafts,
  serviceScopeVersions,
} from "@/db/schema";
import { type ContentReference, contentRoute } from "@/domain/inquiry-content";
import {
  emptyServiceScope,
  type OfferedService,
  type ServiceBinding,
  type ServiceRequest,
  type ServiceScope,
  serviceCaseContextSchema,
  serviceScopeDecisionIntentSchema,
  serviceScopeId,
  serviceScopeSchema,
} from "@/domain/service-scope";
import type { PublicLocale } from "@/i18n/config";
import { recordAudit } from "../audit";
import { requireAvailableStaff } from "../auth/availability";
import { staffPasskeyMinimum } from "../auth/passkeys";
import { requireFreshAuth, type Session } from "../auth/sessions";
import { assertCan } from "../authz";
import { getEnv } from "../config/env";
import { readApprovedContent } from "../content/public";
import { hashRequest } from "../crypto";
import type { Executor } from "../db";
import { AppError } from "../errors";
import { recordOutboxEvent } from "../jobs/outbox";
import { captureOperatingPolicy } from "../operating-policy/service";
import { findOperation, runOperation } from "../operations";
import { liveStaff, parseInput, version } from "../work/shared";

export const serviceScopeResource = {
  type: "settings",
  id: serviceScopeId,
  audience: "internal" as const,
};
const envelope = {
  operationId: z.string().min(16).max(200),
  expectedVersion: z.number().int().positive(),
};
const saveSchema = z.object({ ...envelope, document: serviceScopeSchema });
const saveDecisionSchema = z.object({ ...envelope, decision: serviceScopeDecisionIntentSchema });
const approveSchema = z.object({
  ...envelope,
  expectedHash: z.string().regex(/^[a-f0-9]{64}$/),
  reviewed: z.literal(true),
  note: z.string().trim().min(10).max(1500),
});
export type SaveServiceScope = z.input<typeof saveSchema>;
export type SaveServiceScopeDecision = z.input<typeof saveDecisionSchema>;
export type ApproveServiceScope = z.input<typeof approveSchema>;
async function authorize(db: Executor, session: Session) {
  const live = await liveStaff(db, session);
  await assertCan(db, live.actor, "settings.manage", serviceScopeResource);
  return live;
}
async function lock(db: Executor, exclusive = false) {
  await db.execute(
    exclusive
      ? sql`select pg_advisory_xact_lock(hashtextextended('bounded-service-scope', 0))`
      : sql`select pg_advisory_xact_lock_shared(hashtextextended('bounded-service-scope', 0))`,
  );
}
async function currentScope(db: Executor) {
  const [row] = await db
    .select()
    .from(serviceScopeVersions)
    .orderBy(desc(serviceScopeVersions.scopeVersion))
    .limit(1);
  if (!row) return null;
  const parsed = serviceScopeSchema.safeParse(row.document);
  if (!parsed.success || hashRequest(parsed.data) !== row.contentHash) return null;
  return { ...row, document: parsed.data };
}
async function draftFor(db: Executor) {
  const [row] = await db
    .select()
    .from(serviceScopeDrafts)
    .where(eq(serviceScopeDrafts.id, serviceScopeId));
  const parsed = serviceScopeSchema.safeParse(row?.document);
  return {
    version: row?.version ?? 1,
    document: parsed.success ? parsed.data : emptyServiceScope,
    contentHash: row?.contentHash ?? null,
  };
}

/** New service work needs a usable human and ordinary operational grants, never a UUID alone. */
async function responsible(db: Executor, id: string) {
  await requireAvailableStaff(db, id, true);
  const keys = await db
    .select({ id: passkeys.id })
    .from(passkeys)
    .where(and(eq(passkeys.principalId, id), isNull(passkeys.revokedAt)))
    .for("share");
  if (keys.length < staffPasskeyMinimum) throw new AppError("transition_denied");
  // Serialize with grant revocation while the source/acceptance decision commits.
  await db.select({ id: grants.id }).from(grants).where(eq(grants.principalId, id)).for("share");
  const actor = { kind: "staff" as const, id };
  for (const capability of [
    "inquiry.read",
    "inquiry.assign",
    "inquiry.respond",
    "case.read",
    "case.read_internal",
    "case.transition",
    "task.manage",
  ] as const) {
    const type = capability.startsWith("inquiry.")
      ? "inquiry"
      : capability === "task.manage"
        ? "task"
        : "case";
    await assertCan(db, actor, capability, { type, audience: "internal" });
  }
}
async function sourceCurrent(db: Executor, source: OfferedService["termsSource"]) {
  const content = await readApprovedContent(db, source.kind, source.slug, "bg", { lock: true });
  if (
    !content ||
    content.version.id !== source.versionId ||
    content.version.contentHash !== source.contentHash
  )
    throw new AppError("approval_stale");
}
async function validateOffering(db: Executor, offering: OfferedService) {
  await db.execute(
    sql`select pg_advisory_xact_lock_shared(hashtextextended('agency-operating-policy', 0))`,
  );
  if (Date.parse(offering.reviewExpiresAt) <= Date.now()) throw new AppError("approval_stale");
  const [region] = await db
    .select()
    .from(geographyPlaces)
    .where(eq(geographyPlaces.id, offering.regionId))
    .for("share");
  if (!region || region.version !== offering.regionVersion) throw new AppError("approval_stale");
  const policy = await captureOperatingPolicy(db);
  if (
    policy.kind !== "approved_operating_policy_v1" ||
    policy.policyId !== offering.operatingPolicy.id ||
    policy.policyVersion !== offering.operatingPolicy.version ||
    policy.contentHash !== offering.operatingPolicy.contentHash
  )
    throw new AppError("approval_stale");
  await sourceCurrent(db, offering.publicSource);
  await sourceCurrent(db, offering.termsSource);
  if (offering.fallback.kind === "manual") await sourceCurrent(db, offering.fallback.source);
  else await responsible(db, offering.fallback.principalId);
  await responsible(db, offering.ownerId);
  return region;
}
export async function readServiceScope(db: Executor, session: Session) {
  await authorize(db, session);
  const [draft, current] = await Promise.all([draftFor(db), currentScope(db)]);
  return { draft, current };
}
export async function saveServiceScope(db: Executor, session: Session, raw: SaveServiceScope) {
  const input = parseInput(saveSchema, raw);
  return saveScope(db, session, input, async () => input.document);
}
/** Resolve mutable policy/draft state only inside first execution, after exact intent replay. */
export async function saveServiceScopeDecision(
  db: Executor,
  session: Session,
  raw: SaveServiceScopeDecision,
) {
  const input = parseInput(saveDecisionSchema, raw);
  return saveScope(db, session, input, async (tx, draft) => {
    let decision: ServiceScope["decisions"][number];
    if (input.decision.state === "offered") {
      const policy = await captureOperatingPolicy(tx);
      if (policy.kind !== "approved_operating_policy_v1") throw new AppError("approval_stale");
      decision = {
        ...input.decision,
        operatingPolicy: {
          id: policy.policyId,
          version: policy.policyVersion,
          contentHash: policy.contentHash,
        },
      };
    } else decision = input.decision;
    return parseInput(serviceScopeSchema, {
      kind: "bounded_service_scope_v1",
      decisions: [
        ...draft.decisions.filter(
          (row) => row.topic !== decision.topic || row.regionId !== decision.regionId,
        ),
        decision,
      ],
    });
  });
}
async function saveScope(
  db: Executor,
  session: Session,
  input: SaveServiceScope | SaveServiceScopeDecision,
  documentFor: (tx: Executor, draft: ServiceScope) => Promise<ServiceScope>,
) {
  const live = await authorize(db, session);
  return runOperation(
    db,
    {
      actor: live.actor,
      type: "service_scope.save",
      idempotencyKey: input.operationId,
      requestHash: hashRequest(input),
      expectedVersion: input.expectedVersion,
      subject: serviceScopeResource,
    },
    async (ctx) => {
      await authorize(ctx.tx, session);
      await lock(ctx.tx, true);
      const draft = await draftFor(ctx.tx);
      version(draft, input.expectedVersion);
      const document = await documentFor(ctx.tx, draft.document);
      const revision = draft.version + 1,
        contentHash = hashRequest(document);
      await ctx.tx
        .insert(serviceScopeDrafts)
        .values({
          id: serviceScopeId,
          version: revision,
          document,
          contentHash,
          updatedById: live.account.id,
        })
        .onConflictDoUpdate({
          target: serviceScopeDrafts.id,
          set: {
            version: revision,
            document,
            contentHash,
            updatedById: live.account.id,
            updatedAt: new Date(),
          },
        });
      await recordAudit(ctx.tx, {
        actor: live.actor,
        action: "service_scope.saved",
        recordType: "settings",
        recordId: serviceScopeId,
        capability: "settings.manage",
        operationId: ctx.operationId,
        payload: { revision, contentHash },
      });
      return {
        id: serviceScopeId,
        version: revision,
        contentHash,
        recordedAt: new Date().toISOString(),
      };
    },
  );
}
export async function approveServiceScope(
  db: Executor,
  session: Session,
  raw: ApproveServiceScope,
) {
  const input = parseInput(approveSchema, raw),
    live = await authorize(db, session);
  requireFreshAuth(live);
  return runOperation(
    db,
    {
      actor: live.actor,
      type: "service_scope.approve",
      idempotencyKey: input.operationId,
      requestHash: hashRequest(input),
      expectedVersion: input.expectedVersion,
      subject: serviceScopeResource,
    },
    async (ctx) => {
      const current = await authorize(ctx.tx, session);
      requireFreshAuth(current);
      await lock(ctx.tx, true);
      const draft = await draftFor(ctx.tx);
      version(draft, input.expectedVersion);
      if (
        !draft.contentHash ||
        draft.contentHash !== input.expectedHash ||
        hashRequest(draft.document) !== input.expectedHash
      )
        throw new AppError("approval_stale");
      for (const offering of draft.document.decisions)
        if (offering.state === "offered") {
          await assertCan(ctx.tx, current.actor, "claim.approve", serviceScopeResource);
          await validateOffering(ctx.tx, offering);
        }
      const previous = await currentScope(ctx.tx);
      if (previous?.contentHash === draft.contentHash) throw new AppError("transition_denied");
      const scopeVersion = (previous?.scopeVersion ?? 0) + 1;
      const [row] = await ctx.tx
        .insert(serviceScopeVersions)
        .values({
          scopeVersion,
          draftRevision: draft.version,
          document: draft.document,
          contentHash: draft.contentHash,
          approvedById: current.account.id,
          approvalNote: input.note,
          operationId: ctx.operationId,
        })
        .returning();
      if (!row) throw new Error("Service scope insert failed");
      await recordAudit(ctx.tx, {
        actor: current.actor,
        action: "service_scope.approved",
        recordType: "settings",
        recordId: serviceScopeId,
        capability: "settings.manage",
        operationId: ctx.operationId,
        payload: { scopeVersion, contentHash: row.contentHash },
      });
      await recordOutboxEvent(ctx.tx, {
        eventType: "service_scope.approved",
        subjectType: "settings",
        subjectId: serviceScopeId,
        operationId: ctx.operationId,
        payload: { scopeVersion },
      });
      return {
        id: row.id,
        version: scopeVersion,
        contentHash: row.contentHash,
        recordedAt: row.approvedAt.toISOString(),
      };
    },
  );
}

/** The same fail-closed gate serves the page, review, intake and Case qualification. */
export async function bindServiceRequest(
  db: Executor,
  request: ServiceRequest,
  reference: ContentReference,
  locale: PublicLocale,
): Promise<ServiceBinding> {
  return db.transaction(async (tx) => {
    await lock(tx);
    const current = await currentScope(tx);
    const offering = current?.document.decisions.find(
      (row) => row.topic === request.topic && row.regionId === request.regionId,
    );
    if (!current || current.id !== request.scopeVersionId || offering?.state !== "offered")
      throw new AppError("version_conflict", { current: { reason: "service_scope_changed" } });
    try {
      await validateOffering(tx, offering);
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      throw new AppError("version_conflict", { current: { reason: "service_scope_changed" } });
    }
    const content = await readApprovedContent(tx, "service", offering.publicSource.slug, locale, {
      lock: true,
    });
    if (
      !content ||
      reference.kind !== "service" ||
      reference.slug !== offering.publicSource.slug ||
      reference.versionId !== content.version.id
    )
      throw new AppError("version_conflict", { current: { reason: "content_changed" } });
    return {
      kind: "bounded_service_binding_v1",
      scopeVersionId: current.id,
      scopeVersion: current.scopeVersion,
      scopeHash: current.contentHash,
      offering,
      responsibleId: offering.ownerId,
      sourceUrl: `${getEnv().canonicalOrigin}/${locale}${contentRoute(reference)}`,
      observedSource: {
        kind: "service",
        slug: offering.publicSource.slug,
        versionId: content.version.id,
        contentHash: content.version.contentHash,
        locale,
      },
    };
  });
}
export async function serviceCaseCoverage(db: Executor, value: unknown) {
  const parsed = serviceCaseContextSchema.safeParse(value);
  if (!parsed.success) return { current: false, context: null };
  const { request, binding } = parsed.data;
  if (!binding.observedSource) return { current: false, context: parsed.data };
  try {
    const current = await bindServiceRequest(
      db,
      request,
      binding.observedSource,
      binding.observedSource.locale,
    );
    return {
      current:
        current.scopeHash === binding.scopeHash &&
        current.observedSource?.contentHash === binding.observedSource.contentHash,
      context: parsed.data,
    };
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
    return { current: false, context: parsed.data };
  }
}
export async function publicServiceOfferings(
  db: Executor,
  slug?: string,
  locale: PublicLocale = "bg",
) {
  return db.transaction(async (tx) => {
    await lock(tx);
    const current = await currentScope(tx);
    if (!current) return [];
    const rows = [];
    for (const offering of current.document.decisions) {
      if (offering.state !== "offered" || (slug && offering.publicSource.slug !== slug)) continue;
      try {
        const region = await validateOffering(tx, offering);
        const content = await readApprovedContent(
          tx,
          "service",
          offering.publicSource.slug,
          locale,
          { lock: true },
        );
        if (content)
          rows.push({
            topic: offering.topic,
            regionId: region.id,
            regionName: locale === "bg" ? region.nameNative : region.nameLatin,
            scopeVersionId: current.id,
            contentReference: {
              kind: "service" as const,
              slug: offering.publicSource.slug,
              versionId: content.version.id,
            },
          });
      } catch (error) {
        if (!(error instanceof AppError)) throw error;
      }
    }
    return rows;
  });
}
export async function readServiceScopeOperation(
  db: Executor,
  session: Session,
  command: "save" | "approve",
  operationId: string,
) {
  const live = await authorize(db, session);
  return findOperation(db, live.actor, `service_scope.${command}`, operationId);
}
