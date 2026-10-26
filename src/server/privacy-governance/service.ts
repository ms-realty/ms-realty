// O26/F30: live scoped privacy/settings authority, exact review, attributed append-only history.
import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import {
  principals,
  privacyGovernanceRecords,
  privacyGovernanceRevisions,
  staffMemberships,
} from "@/db/schema";
import {
  type GovernanceDocument,
  governanceDocumentSchema,
  governanceIssues,
  governanceKinds,
  privacyGovernanceId,
} from "@/domain/privacy-governance";
import { recordAudit } from "../audit";
import { countActivePasskeys, staffPasskeyMinimum } from "../auth/passkeys";
import { requireFreshAuth, type Session } from "../auth/sessions";
import { assertCan, staffWhoCan } from "../authz";
import { hashRequest } from "../crypto";
import type { Executor } from "../db";
import { AppError } from "../errors";
import { recordOutboxEvent } from "../jobs/outbox";
import { findOperation, type OperationContext, runOperation } from "../operations";
import { liveStaff, parseInput, version } from "../work/shared";

export const governanceResource = {
  type: "settings",
  id: privacyGovernanceId,
  audience: "internal" as const,
};
const envelope = {
  id: z.uuid(),
  operationId: z.string().min(16).max(200),
  expectedVersion: z.number().int().positive().safe(),
};
const saveSchema = z.object({ ...envelope, document: governanceDocumentSchema });
const reviewSchema = z.object({
  ...envelope,
  expectedHash: z.string().regex(/^[a-f0-9]{64}$/),
  reviewed: z.literal(true),
  note: z.string().trim().min(10).max(1500),
});
export type SaveGovernance = z.input<typeof saveSchema>;
export type ReviewGovernance = z.input<typeof reviewSchema>;

export async function authorizeGovernance(db: Executor, session: Session) {
  const live = await liveStaff(db, session);
  requireFreshAuth(live);
  await assertCan(db, live.actor, "settings.manage", governanceResource);
  await assertCan(db, live.actor, "privacy.manage", governanceResource);
  return live;
}
async function activeStaff(db: Executor, id: string) {
  const [row] = await db
    .select({ id: principals.id })
    .from(principals)
    .innerJoin(staffMemberships, eq(principals.id, staffMemberships.principalId))
    .where(
      and(
        eq(principals.id, id),
        eq(principals.kind, "staff"),
        eq(principals.status, "active"),
        eq(staffMemberships.state, "active"),
      ),
    )
    .for("share");
  return Boolean(row);
}
export async function governanceOwners(db: Executor, session: Session) {
  await authorizeGovernance(db, session);
  const people = await db
    .select({ id: principals.id, displayName: principals.displayName })
    .from(principals)
    .innerJoin(staffMemberships, eq(principals.id, staffMemberships.principalId))
    .where(
      and(
        eq(principals.kind, "staff"),
        eq(principals.status, "active"),
        eq(staffMemberships.state, "active"),
      ),
    )
    .orderBy(principals.displayName);
  const usablePeople = (
    await Promise.all(
      people.map(async (person) =>
        (await countActivePasskeys(db, person.id)) >= staffPasskeyMinimum ? person : null,
      ),
    )
  ).filter((person): person is NonNullable<typeof person> => person !== null);
  const ids = new Set(usablePeople.map((person) => person.id)),
    owners = await staffWhoCan(
      db,
      [...ids],
      ["settings.manage", "privacy.manage"],
      governanceResource,
    ),
    reviewers = await staffWhoCan(
      db,
      [...ids],
      ["settings.manage", "privacy.manage", "claim.approve"],
      governanceResource,
    );
  return {
    owners: usablePeople.filter((person) => owners.has(person.id)),
    reviewers: usablePeople.filter((person) => reviewers.has(person.id)),
  };
}
async function allocatedOwner(db: Executor, id: string, qualified = false) {
  return (
    (await activeStaff(db, id)) &&
    (await countActivePasskeys(db, id)) >= staffPasskeyMinimum &&
    (
      await staffWhoCan(
        db,
        [id],
        qualified
          ? ["settings.manage", "privacy.manage", "claim.approve"]
          : ["settings.manage", "privacy.manage"],
        governanceResource,
      )
    ).has(id)
  );
}
function documentOf(row: { document: unknown; contentHash: string; kind?: string }) {
  const parsed = governanceDocumentSchema.safeParse(row.document);
  if (
    !parsed.success ||
    hashRequest(parsed.data) !== row.contentHash ||
    (row.kind && parsed.data.kind !== row.kind)
  )
    throw new AppError("outcome_unknown");
  return parsed.data;
}
async function findRecord(db: Executor, id: string) {
  const [row] = await db
    .select()
    .from(privacyGovernanceRecords)
    .where(eq(privacyGovernanceRecords.id, id));
  return row;
}
async function latestReview(db: Executor, id: string) {
  const [review] = await db
    .select()
    .from(privacyGovernanceRevisions)
    .where(
      and(
        eq(privacyGovernanceRevisions.recordId, id),
        eq(privacyGovernanceRevisions.action, "reviewed"),
      ),
    )
    .orderBy(desc(privacyGovernanceRevisions.recordVersion))
    .limit(1);
  return review;
}
async function namedPeople(db: Executor, documents: GovernanceDocument[]) {
  const ids = [
    ...new Set(
      documents
        .flatMap((document) => [
          document.ownerId,
          document.kind === "incident" ? document.determinationById : null,
        ])
        .filter((id): id is string => id !== null),
    ),
  ];
  return ids.length
    ? db
        .select({ id: principals.id, displayName: principals.displayName })
        .from(principals)
        .where(inArray(principals.id, ids))
    : [];
}
async function liveIssues(db: Executor, document: GovernanceDocument) {
  const issues = governanceIssues(document);
  if (document.ownerId && !(await allocatedOwner(db, document.ownerId))) issues.push("ownerId");
  if (
    document.kind === "incident" &&
    document.determinationById &&
    !(await allocatedOwner(db, document.determinationById, true))
  )
    issues.push("determinationById");
  if (document.kind === "processor" && document.processingRecordId) {
    const linked = await findRecord(db, document.processingRecordId);
    const review = linked && (await latestReview(db, linked.id));
    const source = linked && documentOf(linked);
    if (
      !linked ||
      !review ||
      review.recordVersion !== linked.version ||
      source?.kind !== "processing" ||
      source.lifecycle !== "active" ||
      governanceIssues(source).length ||
      (source.ownerId && !(await allocatedOwner(db, source.ownerId)))
    )
      issues.push("processingRecordId");
  }
  return [...new Set(issues)];
}
export async function listGovernance(
  db: Executor,
  session: Session,
  raw: { kind?: string; page?: number } = {},
) {
  await authorizeGovernance(db, session);
  const input = parseInput(
    z.object({
      kind: z.enum(governanceKinds).optional(),
      page: z.number().int().min(1).max(2500).default(1),
    }),
    raw,
  );
  const rows = await db
    .select()
    .from(privacyGovernanceRecords)
    .where(input.kind ? eq(privacyGovernanceRecords.kind, input.kind) : undefined)
    .orderBy(desc(privacyGovernanceRecords.createdAt), desc(privacyGovernanceRecords.id))
    .limit(41)
    .offset((input.page - 1) * 40);
  const items = await Promise.all(
    rows.slice(0, 40).map(async (row) => {
      const document = documentOf(row),
        review = await latestReview(db, row.id);
      return {
        id: row.id,
        version: row.version,
        document,
        issues: await liveIssues(db, document),
        reviewed: review?.recordVersion === row.version,
        updatedAt: row.updatedAt,
      };
    }),
  );
  return {
    items,
    people: await namedPeople(
      db,
      items.map((item) => item.document),
    ),
    page: input.page,
    more: rows.length > 40,
  };
}
export async function readGovernance(
  db: Executor,
  session: Session,
  id: string,
  raw: { historyPage?: number } = {},
) {
  await authorizeGovernance(db, session);
  parseInput(z.uuid(), id);
  const { historyPage } = parseInput(
    z.object({ historyPage: z.number().int().min(1).max(10000).default(1) }),
    raw,
  );
  const row = await findRecord(db, id);
  if (!row) throw new AppError("not_found");
  const document = documentOf(row),
    review = await latestReview(db, id);
  const history = await db
    .select({
      id: privacyGovernanceRevisions.id,
      recordVersion: privacyGovernanceRevisions.recordVersion,
      action: privacyGovernanceRevisions.action,
      contentHash: privacyGovernanceRevisions.contentHash,
      actorId: privacyGovernanceRevisions.actorId,
      actorName: principals.displayName,
      recordedAt: privacyGovernanceRevisions.recordedAt,
      note: privacyGovernanceRevisions.note,
      operationId: privacyGovernanceRevisions.operationId,
    })
    .from(privacyGovernanceRevisions)
    .innerJoin(principals, eq(principals.id, privacyGovernanceRevisions.actorId))
    .where(eq(privacyGovernanceRevisions.recordId, id))
    .orderBy(desc(privacyGovernanceRevisions.recordVersion))
    .limit(41)
    .offset((historyPage - 1) * 40);
  const reviewedDocument = review ? documentOf(review) : null;
  return {
    ...row,
    document,
    issues: await liveIssues(db, document),
    history: history.slice(0, 40),
    historyPage,
    historyMore: history.length > 40,
    reviewed: review?.recordVersion === row.version,
    latestReview: review ? { ...review, document: documentOf(review) } : null,
    people: await namedPeople(db, [document, ...(reviewedDocument ? [reviewedDocument] : [])]),
  };
}
export async function readGovernanceRevision(
  db: Executor,
  session: Session,
  id: string,
  revision: number,
) {
  await authorizeGovernance(db, session);
  parseInput(z.uuid(), id);
  parseInput(z.number().int().positive().safe(), revision);
  const [row] = await db
    .select()
    .from(privacyGovernanceRevisions)
    .where(
      and(
        eq(privacyGovernanceRevisions.recordId, id),
        eq(privacyGovernanceRevisions.recordVersion, revision),
      ),
    )
    .limit(1);
  if (!row) throw new AppError("not_found");
  const document = documentOf(row);
  const [actor] = await db
    .select({ name: principals.displayName })
    .from(principals)
    .where(eq(principals.id, row.actorId));
  return {
    ...row,
    document,
    actorName: actor?.name ?? row.actorId,
    people: await namedPeople(db, [document]),
  };
}
async function lock(db: Executor, id: string) {
  await db.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`privacy-governance:${id}`}, 0))`,
  );
}
async function recordRevision(
  ctx: OperationContext,
  input: {
    id: string;
    version: number;
    document: GovernanceDocument;
    contentHash: string;
    action: "saved" | "reviewed";
    note?: string;
  },
) {
  await ctx.tx.insert(privacyGovernanceRevisions).values({
    recordId: input.id,
    recordVersion: input.version,
    document: input.document,
    contentHash: input.contentHash,
    action: input.action,
    note: input.note ?? null,
    actorId: ctx.actor.id,
    operationId: ctx.operationId,
  });
  const payload = {
    revision: input.version,
    contentHash: input.contentHash,
    kind: input.document.kind,
  };
  await recordAudit(ctx.tx, {
    actor: ctx.actor,
    action: `privacy_governance.${input.action}`,
    recordType: "privacy_governance",
    recordId: input.id,
    capability: "privacy.manage",
    operationId: ctx.operationId,
    payload,
  });
  await recordOutboxEvent(ctx.tx, {
    eventType: `privacy_governance.${input.action}`,
    subjectType: "privacy_governance",
    subjectId: input.id,
    operationId: ctx.operationId,
    payload,
  });
}
export async function saveGovernance(db: Executor, session: Session, raw: SaveGovernance) {
  const input = parseInput(saveSchema, raw),
    live = await authorizeGovernance(db, session);
  return runOperation(
    db,
    {
      actor: live.actor,
      type: "privacy_governance.save",
      idempotencyKey: input.operationId,
      requestHash: hashRequest(input),
      expectedVersion: input.expectedVersion,
      subject: { type: "privacy_governance", id: input.id },
    },
    async (ctx) => {
      await lock(ctx.tx, input.id);
      const current = await authorizeGovernance(ctx.tx, session);
      const row = await findRecord(ctx.tx, input.id);
      version(row ?? { version: 1 }, input.expectedVersion);
      if (row && row.kind !== input.document.kind) throw new AppError("transition_denied");
      if (input.document.ownerId && !(await activeStaff(ctx.tx, input.document.ownerId)))
        throw new AppError("validation_failed", {
          fieldErrors: { ownerId: ["active_staff_required"] },
        });
      const contentHash = hashRequest(input.document),
        revision = input.expectedVersion + 1,
        now = new Date();
      const values = {
        version: revision,
        document: input.document,
        contentHash,
        updatedById: current.account.id,
        updatedAt: now,
      };
      if (row)
        await ctx.tx
          .update(privacyGovernanceRecords)
          .set(values)
          .where(eq(privacyGovernanceRecords.id, input.id));
      else
        await ctx.tx
          .insert(privacyGovernanceRecords)
          .values({ ...values, id: input.id, kind: input.document.kind });
      await recordRevision(ctx, {
        id: input.id,
        version: revision,
        document: input.document,
        contentHash,
        action: "saved",
      });
      return { id: input.id, version: revision, contentHash, recordedAt: now.toISOString() };
    },
  );
}
export async function reviewGovernance(db: Executor, session: Session, raw: ReviewGovernance) {
  const input = parseInput(reviewSchema, raw),
    live = await authorizeGovernance(db, session);
  // The current record is checked before replay too; qualification never survives revocation.
  const preliminary = await findRecord(db, input.id);
  if (!preliminary) throw new AppError("not_found");
  if (preliminary.kind === "incident")
    await assertCan(db, live.actor, "claim.approve", governanceResource);
  return runOperation(
    db,
    {
      actor: live.actor,
      type: "privacy_governance.review",
      idempotencyKey: input.operationId,
      requestHash: hashRequest(input),
      expectedVersion: input.expectedVersion,
      subject: { type: "privacy_governance", id: input.id },
    },
    async (ctx) => {
      await lock(ctx.tx, input.id);
      const current = await authorizeGovernance(ctx.tx, session);
      const row = await findRecord(ctx.tx, input.id);
      if (!row) throw new AppError("not_found");
      version(row, input.expectedVersion);
      const document = documentOf(row);
      if (row.contentHash !== input.expectedHash) throw new AppError("approval_stale");
      if (document.kind === "incident")
        await assertCan(ctx.tx, current.actor, "claim.approve", governanceResource);
      const issues = await liveIssues(ctx.tx, document);
      if (issues.length)
        throw new AppError("validation_failed", {
          fieldErrors: Object.fromEntries(issues.map((key) => [key, ["review_evidence_required"]])),
        });
      // Reviewed processing is a dependency: its concurrent change must settle before this review.
      if (document.kind === "processor" && document.processingRecordId) {
        await lock(ctx.tx, document.processingRecordId);
        if ((await liveIssues(ctx.tx, document)).length) throw new AppError("approval_stale");
      }
      const latest = await latestReview(ctx.tx, input.id);
      if (latest?.recordVersion === row.version) throw new AppError("transition_denied");
      const revision = row.version + 1,
        now = new Date();
      await ctx.tx
        .update(privacyGovernanceRecords)
        .set({ version: revision, updatedById: current.account.id, updatedAt: now })
        .where(eq(privacyGovernanceRecords.id, input.id));
      await recordRevision(ctx, {
        id: input.id,
        version: revision,
        document,
        contentHash: row.contentHash,
        action: "reviewed",
        note: input.note,
      });
      return {
        id: input.id,
        version: revision,
        contentHash: row.contentHash,
        recordedAt: now.toISOString(),
      };
    },
  );
}
export async function readGovernanceOperation(
  db: Executor,
  session: Session,
  id: string,
  command: "save" | "review",
  operationId: string,
) {
  const live = await authorizeGovernance(db, session);
  parseInput(z.uuid(), id);
  parseInput(z.enum(["save", "review"]), command);
  parseInput(z.string().min(16).max(200), operationId);
  const row = await findRecord(db, id);
  if (command === "review" && row?.kind === "incident")
    await assertCan(db, live.actor, "claim.approve", governanceResource);
  const receipt = await findOperation(db, live.actor, `privacy_governance.${command}`, operationId);
  return receipt?.resultType === "privacy_governance" && receipt.resultId === id ? receipt : null;
}
