// O33/F31: human correction custody, reusing immutable receipts and evidence-required Tasks.
import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import {
  activityEvents,
  appointments,
  cases,
  currentPublications,
  destinationDeliveries,
  interests,
  listingSearchDocuments,
  listings,
  mediaRelations,
  operations,
  principals,
  proposalRevisions,
  proposals,
  sellerInstructions,
  tasks,
} from "@/db/schema";
import {
  correctionGroupLimit,
  correctionImpactLimit,
  correctionKeyLimit,
  correctionSnapshotLimit,
} from "@/domain/correction-limits";
import { recordAudit } from "../audit";
import { requireFreshAuth, type Session } from "../auth/sessions";
import { assertCan, assertCanRead } from "../authz";
import { currentOwnerAcknowledgment } from "../cases/owner-preview";
import { caseFor } from "../cases/shared";
import { hashRequest } from "../crypto";
import type { Executor } from "../db";
import { AppError, isAppError } from "../errors";
import { runOperation } from "../operations";
import { restrictPublication } from "../publication/commands";
import { liveStaff } from "../work/shared";

export const correctionPurpose = "material_correction";
const itemSchema = z.object({
  key: z.string(),
  kind: z.enum([
    "publication",
    "destination",
    "interest",
    "proposal",
    "appointment",
    "owner",
    "media",
    "derived",
  ]),
  recordId: z.string(),
  reference: z.string(),
  caseId: z.string().nullable(),
  state: z.string(),
  revision: z.string().nullable(),
  ready: z.boolean(),
});
export type CorrectionImpactItem = z.infer<typeof itemSchema>;
const snapshotSchema = z.object({
  taskId: z.uuid(),
  sourceRevisionId: z.uuid().nullable(),
  sourceReference: z.string(),
  disputedFact: z.string(),
  urgency: z.enum(["urgent", "normal"]),
  items: z.array(itemSchema).max(correctionSnapshotLimit),
});
async function source(db: Executor, session: Session, reference: string, lock = false) {
  const live = await liveStaff(db, session);
  const query = db.select().from(listings).where(eq(listings.reference, reference.toUpperCase()));
  const [listing] = await (lock ? query.for("update") : query);
  if (!listing) throw new AppError("not_found");
  const resource = { type: "listing", id: listing.id, propertyId: listing.propertyId };
  await assertCanRead(db, live.actor, "listing.read", resource);
  await assertCan(db, live.actor, "publication.release", resource);
  await assertCan(db, live.actor, "task.manage", { type: "task", audience: "internal" });
  return { live, listing };
}

/** Full impact is bounded, then individually authorized. Hidden relationship labels never escape. */
async function impact(
  db: Executor,
  session: Session,
  listing: typeof listings.$inferSelect,
  originalRevisionId: string | null,
) {
  const [
    pointers,
    deliveries,
    interestRows,
    proposalRows,
    appointmentRows,
    ownerRows,
    media,
    searchRows,
  ] = await Promise.all([
    db
      .select()
      .from(currentPublications)
      .where(eq(currentPublications.listingId, listing.id))
      .limit(correctionGroupLimit + 1),
    db
      .select()
      .from(destinationDeliveries)
      .where(eq(destinationDeliveries.listingId, listing.id))
      .orderBy(desc(destinationDeliveries.generation), desc(destinationDeliveries.createdAt))
      .limit(correctionGroupLimit + 1),
    db
      .select({
        id: interests.id,
        caseId: interests.caseId,
        state: interests.state,
        revision: interests.listingRevisionId,
      })
      .from(interests)
      .where(eq(interests.listingId, listing.id))
      .limit(correctionGroupLimit + 1),
    db
      .select({
        id: proposals.id,
        caseId: proposals.caseId,
        reference: proposals.reference,
        state: proposalRevisions.state,
        revision: proposalRevisions.sourceListingRevisionId,
        number: proposalRevisions.revisionNumber,
      })
      .from(proposals)
      .innerJoin(
        proposalRevisions,
        and(
          eq(proposalRevisions.proposalId, proposals.id),
          eq(proposalRevisions.revisionNumber, proposals.activeRevisionNumber),
        ),
      )
      .where(eq(proposals.listingId, listing.id))
      .limit(correctionGroupLimit + 1),
    db
      .select({
        id: appointments.id,
        caseId: appointments.caseId,
        reference: appointments.reference,
        state: appointments.state,
        version: appointments.version,
      })
      .from(appointments)
      .innerJoin(interests, eq(interests.id, appointments.interestId))
      .where(eq(interests.listingId, listing.id))
      .limit(correctionGroupLimit + 1),
    db
      .selectDistinct({ id: sellerInstructions.caseId })
      .from(sellerInstructions)
      .where(eq(sellerInstructions.listingId, listing.id))
      .limit(correctionGroupLimit + 1),
    db
      .select({
        id: mediaRelations.id,
        assetId: mediaRelations.mediaAssetId,
        hidden: mediaRelations.hidden,
        removedAt: mediaRelations.removedAt,
      })
      .from(mediaRelations)
      .where(eq(mediaRelations.listingId, listing.id))
      .limit(correctionGroupLimit + 1),
    db
      .select({ locale: listingSearchDocuments.locale })
      .from(listingSearchDocuments)
      .where(eq(listingSearchDocuments.listingId, listing.id)),
  ]);
  if (
    [pointers, deliveries, interestRows, proposalRows, appointmentRows, ownerRows, media].some(
      (rows) => rows.length > correctionGroupLimit,
    )
  )
    throw new AppError("transition_denied");
  const caseIds = [
    ...new Set([
      ...interestRows.map((row) => row.caseId),
      ...proposalRows.map((row) => row.caseId),
      ...appointmentRows.flatMap((row) => row.caseId ?? []),
      ...ownerRows.flatMap((row) => row.id ?? []),
    ]),
  ];
  const related = caseIds.length
    ? await db
        .select({ id: cases.id, reference: cases.reference, ownerId: cases.ownerId })
        .from(cases)
        .where(inArray(cases.id, caseIds))
    : [];
  for (const record of related) await caseFor(db, session, record.id, "case.read_internal");
  for (const row of proposalRows)
    await assertCanRead(db, session.actor, "proposal.manage", {
      type: "proposal",
      id: row.id,
      caseId: row.caseId,
      audience: "case_participants",
    });
  for (const row of appointmentRows)
    await assertCanRead(db, session.actor, "appointment.manage", {
      type: "appointment",
      id: row.id,
      caseId: row.caseId ?? undefined,
      audience: "case_participants",
    });
  const items: CorrectionImpactItem[] = [];
  for (const row of pointers)
    items.push({
      key: `publication:${row.id}`,
      kind: "publication",
      recordId: row.id,
      reference: `${row.locale} · ${row.destination}`,
      caseId: null,
      state: row.state,
      revision: row.manifestId,
      ready:
        row.state !== "active" ||
        (row.generation === listing.publicationGeneration &&
          listing.approvedRevisionId !== originalRevisionId),
    });
  const destinations = new Set<string>();
  for (const row of deliveries) {
    const key = `destination:${row.locale}:${row.destination}`;
    if (destinations.has(key)) continue;
    destinations.add(key);
    items.push({
      key,
      kind: "destination",
      recordId: row.id,
      reference: `${row.locale} · ${row.destination}`,
      caseId: null,
      state: row.state,
      revision: String(row.generation),
      ready: ["verified", "withdrawn"].includes(row.state) && Boolean(row.verifiedAt),
    });
  }
  for (const row of interestRows)
    items.push({
      key: `interest:${row.id}`,
      kind: "interest",
      recordId: row.id,
      reference: related.find((record) => record.id === row.caseId)?.reference ?? listing.reference,
      caseId: row.caseId,
      state: row.state,
      revision: row.revision,
      ready: true,
    });
  for (const row of proposalRows)
    items.push({
      key: `proposal:${row.id}`,
      kind: "proposal",
      recordId: row.id,
      reference: row.reference,
      caseId: row.caseId,
      state: row.state,
      revision: `${row.number}:${row.revision}`,
      ready:
        ["declined", "withdrawn", "expired", "superseded"].includes(row.state) ||
        Boolean(
          row.revision &&
            row.revision === listing.approvedRevisionId &&
            row.revision !== originalRevisionId,
        ),
    });
  for (const row of appointmentRows)
    items.push({
      key: `appointment:${row.id}`,
      kind: "appointment",
      recordId: row.id,
      reference: row.reference,
      caseId: row.caseId,
      state: row.state,
      revision: String(row.version),
      ready: true,
    });
  for (const row of ownerRows) {
    if (!row.id) continue;
    let acknowledged = false;
    try {
      acknowledged =
        listing.approvedRevisionId !== originalRevisionId &&
        Boolean(await currentOwnerAcknowledgment(db, row.id));
    } catch (error) {
      if (
        !isAppError(error) ||
        !["not_found", "forbidden", "transition_denied", "approval_stale"].includes(error.code)
      )
        throw error;
    }
    items.push({
      key: `owner:${row.id}`,
      kind: "owner",
      recordId: row.id,
      reference: related.find((record) => record.id === row.id)?.reference ?? listing.reference,
      caseId: row.id,
      state: acknowledged ? "acknowledged" : "review_required",
      revision: listing.approvedRevisionId,
      ready: acknowledged,
    });
  }
  for (const row of media)
    items.push({
      key: `media:${row.id}`,
      kind: "media",
      recordId: row.id,
      reference: listing.reference,
      caseId: null,
      state: row.removedAt ? "removed" : row.hidden ? "hidden" : "recorded",
      revision: row.assetId,
      ready: true,
    });
  items.push({
    key: `derived:${listing.id}`,
    kind: "derived",
    recordId: listing.id,
    reference: listing.reference,
    caseId: null,
    state: searchRows.length ? "current_projection" : "restricted_projection",
    revision: listing.approvedRevisionId,
    ready: !pointers.some((row) => row.state === "active")
      ? searchRows.length === 0
      : listing.approvedRevisionId !== originalRevisionId,
  });
  return items.sort((a, b) => a.key.localeCompare(b.key));
}

export async function readCorrectionWorkspace(db: Executor, session: Session, reference: string) {
  const { live, listing } = await source(db, session, reference);
  const [task] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.listingId, listing.id), eq(tasks.purpose, correctionPurpose)))
    .orderBy(desc(tasks.createdAt))
    .limit(1);
  const [receipt] = task
    ? await db
        .select()
        .from(operations)
        .where(
          and(
            eq(operations.operationType, "inventory.correction.open"),
            eq(operations.resultId, listing.id),
            eq(operations.status, "succeeded"),
            sql`${operations.outcome}->>'taskId' = ${task.id}`,
          ),
        )
        .limit(1)
    : [];
  const opened = snapshotSchema.safeParse(receipt?.outcome);
  if (opened.success) {
    for (const caseId of new Set(opened.data.items.flatMap((item) => item.caseId ?? [])))
      await caseFor(db, live, caseId, "case.read_internal");
    for (const item of opened.data.items)
      if (item.kind === "proposal" || item.kind === "appointment")
        await assertCanRead(
          db,
          live.actor,
          item.kind === "proposal" ? "proposal.manage" : "appointment.manage",
          {
            type: item.kind,
            id: item.recordId,
            caseId: item.caseId ?? undefined,
            audience: "case_participants",
          },
        );
  }
  const original =
    opened.success && task?.state !== "done"
      ? opened.data.sourceRevisionId
      : listing.approvedRevisionId;
  const current = await impact(db, live, listing, original);
  const combined = new Map(current.map((item) => [item.key, item]));
  if (opened.success && task?.state !== "done")
    for (const item of opened.data.items)
      if (!combined.has(item.key))
        combined.set(item.key, { ...item, state: "source_missing", ready: false });
  const items = [...combined.values()].sort((a, b) => a.key.localeCompare(b.key));
  const digest = hashRequest({
    listingVersion: listing.version,
    generation: listing.publicationGeneration,
    items,
  });
  const [owner] = task?.ownerId
    ? await db
        .select({ name: principals.displayName })
        .from(principals)
        .where(eq(principals.id, task.ownerId))
    : [];
  const [lastReconciliation] = task
    ? await db
        .select({ outcome: operations.outcome, at: operations.completedAt })
        .from(operations)
        .where(
          and(
            eq(operations.operationType, "inventory.correction.reconcile"),
            eq(operations.resultId, listing.id),
            eq(operations.status, "succeeded"),
            sql`${operations.outcome}->>'taskId' = ${task.id}`,
          ),
        )
        .orderBy(desc(operations.completedAt))
        .limit(1)
    : [];
  const reviewed = z
    .object({
      impactHash: z.string(),
      items: z.array(
        z.object({
          key: z.string(),
          state: z.enum(["verified", "unresolved"]),
          evidence: z.string(),
        }),
      ),
    })
    .safeParse(lastReconciliation?.outcome);
  return {
    listing,
    task: task ?? null,
    opened: opened.success ? opened.data : null,
    items,
    digest,
    ownerName: owner?.name ?? null,
    reconciliation: reviewed.success
      ? { ...reviewed.data, at: lastReconciliation?.at ?? null }
      : null,
  };
}

const openSchema = z.object({
  operationId: z.string().min(16).max(200),
  expectedVersion: z.int().positive(),
  impactHash: z.string().length(64),
  sourceReference: z.string().trim().min(1).max(1000),
  disputedFact: z.string().trim().min(3).max(2000),
  urgency: z.enum(["urgent", "normal"]),
  reviewed: z.literal(true),
});
export async function openMaterialCorrection(
  db: Executor,
  session: Session,
  reference: string,
  raw: z.input<typeof openSchema>,
) {
  const parsed = openSchema.safeParse(raw);
  if (!parsed.success) throw new AppError("validation_failed");
  const input = parsed.data;
  const { live, listing } = await source(db, session, reference);
  requireFreshAuth(live);
  // An old successful receipt carries the original impact; reauthorize it before replay too.
  await readCorrectionWorkspace(db, live, reference);
  return runOperation(
    db,
    {
      actor: live.actor,
      type: "inventory.correction.open",
      idempotencyKey: input.operationId,
      requestHash: hashRequest({ reference, input }),
      expectedVersion: input.expectedVersion,
      subject: { type: "listing", id: listing.id },
    },
    async (ctx) => {
      const current = await source(ctx.tx, live, reference, true);
      const before = await readCorrectionWorkspace(ctx.tx, live, reference);
      if (current.listing.version !== input.expectedVersion || before.digest !== input.impactHash)
        throw new AppError("version_conflict");
      if (before.task && before.task.state !== "done") throw new AppError("transition_denied");
      await restrictPublication(ctx.tx, {
        actor: live.actor,
        operationId: `${ctx.operationId}:restrict`,
        expectedRevision: current.listing.publicationGeneration,
        reference,
        reason: input.disputedFact,
      });
      const [task] = await ctx.tx
        .insert(tasks)
        .values({
          title: `${reference}: ${input.disputedFact.slice(0, 120)}`,
          purpose: correctionPurpose,
          type: "correction",
          ownerId: live.account.id,
          listingId: listing.id,
          propertyId: listing.propertyId,
          evidenceRequired: true,
        })
        .returning();
      if (!task) throw new Error("Correction task insert failed");
      await recordAudit(ctx.tx, {
        actor: live.actor,
        operationId: ctx.operationId,
        action: "inventory.correction.opened",
        recordType: "listing",
        recordId: listing.id,
        capability: "publication.release",
        payload: {
          taskId: task.id,
          sourceReference: input.sourceReference,
          disputedFact: input.disputedFact,
          urgency: input.urgency,
          impactHash: input.impactHash,
        },
      });
      return {
        taskId: task.id,
        sourceRevisionId: current.listing.approvedRevisionId,
        sourceReference: input.sourceReference,
        disputedFact: input.disputedFact,
        urgency: input.urgency,
        items: before.items,
      };
    },
  );
}

const reconcileSchema = z.object({
  operationId: z.string().min(16).max(200),
  expectedVersion: z.int().positive(),
  impactHash: z.string().length(64),
  followUpAt: z.iso.datetime({ offset: true }).optional(),
  reviewed: z.literal(true),
  items: z
    .array(
      z.object({
        key: z.string().max(correctionKeyLimit),
        state: z.enum(["verified", "unresolved"]),
        evidence: z.string().trim().min(3).max(1500),
      }),
    )
    .max(correctionImpactLimit),
});
export async function reconcileMaterialCorrection(
  db: Executor,
  session: Session,
  reference: string,
  raw: z.input<typeof reconcileSchema>,
) {
  const parsed = reconcileSchema.safeParse(raw);
  if (!parsed.success) throw new AppError("validation_failed");
  const input = parsed.data;
  const { live, listing } = await source(db, session, reference);
  requireFreshAuth(live);
  await readCorrectionWorkspace(db, live, reference);
  return runOperation(
    db,
    {
      actor: live.actor,
      type: "inventory.correction.reconcile",
      idempotencyKey: input.operationId,
      requestHash: hashRequest({ reference, input }),
      expectedVersion: input.expectedVersion,
      subject: { type: "listing", id: listing.id },
    },
    async (ctx) => {
      await source(ctx.tx, live, reference, true);
      const view = await readCorrectionWorkspace(ctx.tx, live, reference);
      if (!view.task || !view.opened || view.task.state === "done")
        throw new AppError("transition_denied");
      const [lockedTask] = await ctx.tx
        .select({ id: tasks.id, version: tasks.version })
        .from(tasks)
        .where(eq(tasks.id, view.task.id))
        .for("update");
      if (
        lockedTask?.version !== input.expectedVersion ||
        view.task.version !== input.expectedVersion ||
        view.digest !== input.impactHash
      )
        throw new AppError("version_conflict");
      if (
        new Set(input.items.map((item) => item.key)).size !== input.items.length ||
        input.items.length !== view.items.length
      )
        throw new AppError("validation_failed");
      for (const item of view.items) {
        const disposition = input.items.find((candidate) => candidate.key === item.key);
        if (!disposition || (disposition.state === "verified" && !item.ready))
          throw new AppError("transition_denied");
      }
      const unresolved = input.items.filter((item) => item.state === "unresolved");
      if (unresolved.length && (!input.followUpAt || Date.parse(input.followUpAt) <= Date.now()))
        throw new AppError("validation_failed");
      await ctx.tx
        .update(tasks)
        .set({
          state: unresolved.length ? "waiting" : "done",
          ownerId: live.account.id,
          version: view.task.version + 1,
          updatedAt: new Date(),
          waitingOn: unresolved.length ? unresolved.map((item) => item.key).join(", ") : null,
          followUpAt: unresolved.length ? new Date(input.followUpAt as string) : null,
          outcomeNote: unresolved.length
            ? null
            : "Human reconciliation recorded for every current impact item",
          completedAt: unresolved.length ? null : new Date(),
          completedById: unresolved.length ? null : live.account.id,
          evidenceIds: [ctx.operationId],
        })
        .where(and(eq(tasks.id, view.task.id), eq(tasks.version, input.expectedVersion)));
      await recordAudit(ctx.tx, {
        actor: live.actor,
        operationId: ctx.operationId,
        action: "inventory.correction.reconciled",
        recordType: "listing",
        recordId: listing.id,
        capability: "publication.release",
        payload: {
          taskId: view.task.id,
          impactHash: view.digest,
          items: input.items,
          unresolvedOwnerId: unresolved.length ? live.account.id : null,
        },
      });
      await ctx.tx.insert(activityEvents).values({
        recordType: "listing",
        recordId: listing.id,
        reference,
        messageKey: "inventory.correction.reconciled",
        summary: "Human correction reconciliation recorded",
        actorKind: "staff",
        actorId: live.account.id,
        operationId: ctx.operationId,
        params: { taskId: view.task.id, unresolved: unresolved.length },
        audience: "internal",
      });
      return {
        taskId: view.task.id,
        impactHash: view.digest,
        state: unresolved.length ? "waiting" : "done",
        version: view.task.version + 1,
        items: input.items,
        ownerId: live.account.id,
      };
    },
  );
}
