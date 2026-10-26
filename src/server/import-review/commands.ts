// O28/F32, AT21/AT50/AT55: staged CSV -> sealed human subset -> one atomic transaction per
// row. Reuse the legacy import journal and canonical digest; never its privileged CLI actor.
import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { sha256Json } from "@/db/import/mapping";
import {
  importBatches,
  importRows,
  listings,
  operations,
  properties,
  referenceSequences,
  staffImportReviews,
} from "@/db/schema";
import { recordAudit } from "@/server/audit";
import type { Session } from "@/server/auth/sessions";
import { assertCan, can } from "@/server/authz";
import { sha256Hex } from "@/server/crypto";
import type { Executor, Transaction } from "@/server/db";
import { AppError, isAppError } from "@/server/errors";
import { draftSchema, emptyDraft, type ListingDraft } from "@/server/inventory/contracts";
import { recordOutboxEvent } from "@/server/jobs/outbox";
import { runOperation } from "@/server/operations";
import { nextReference } from "@/server/references";
import { parseInput, version } from "@/server/work/shared";
import {
  choiceFields,
  type ImportContext,
  type ImportFieldDiff,
  type ImportReceipt,
  type ImportSelection,
  importContextSchema,
  selectionSchema,
} from "./contracts";
import { type ColumnMapping, importFields, type PreviewRow } from "./csv";
import { checkImportPreview, importReviewer } from "./preview";

type Listing = typeof listings.$inferSelect;
type Property = typeof properties.$inferSelect;
type Review = typeof staffImportReviews.$inferSelect;
type Row = typeof importRows.$inferSelect;
interface Target {
  id: string;
  propertyId: string;
  version: number;
  propertyVersion: number;
  draft: unknown;
  commercialState: Listing["commercialState"];
  editorialState: Listing["editorialState"];
  latestRevisionNumber: number;
  approvedRevisionId: string | null;
  publicationGeneration: number;
}
interface Plan {
  kind: "staff_csv_v1";
  number: number;
  values: PreviewRow["values"];
  issues: string[];
  fields: ImportFieldDiff[];
  target: Target | null;
  proposedDraft: ListingDraft | null;
}
interface Applied {
  targetId: string;
  propertyId: string;
  version: number;
  propertyVersion: number;
  draftDigest: string;
}
interface StoredDiff {
  plan: Plan;
  receiptId?: string;
  applied?: Applied;
  reversal?: { state: "reversed" | "blocked"; code: string | null };
}
const operationKeySchema = z.string().uuid();
const commandSchema = z
  .object({
    id: z.uuid(),
    expectedVersion: z.number().int().positive(),
    operationKey: operationKeySchema,
  })
  .strict();
const snapshot = (listing: Listing, property: Property): Target => ({
  id: listing.id,
  propertyId: property.id,
  version: listing.version,
  propertyVersion: property.version,
  draft: listing.draft,
  commercialState: listing.commercialState,
  editorialState: listing.editorialState,
  latestRevisionNumber: listing.latestRevisionNumber,
  approvedRevisionId: listing.approvedRevisionId,
  publicationGeneration: listing.publicationGeneration,
});
const planOf = (row: Row) => (row.diff as StoredDiff).plan;
const amount = (value: string | null) => value?.trim().replace(",", ".") ?? "";
const supplied = (value: string | null) => value !== null && value.trim() !== "";
const resource = (listing: { id: string; propertyId: string }) => ({
  type: "listing",
  id: listing.id,
  propertyId: listing.propertyId,
  audience: "internal" as const,
});

async function planRow(
  db: Executor,
  session: Session,
  row: PreviewRow,
  context: ImportContext,
  digest: string,
): Promise<Plan> {
  const issues = row.issues.map((issue) => `${issue.code}:${issue.field ?? issue.column ?? "row"}`);
  const reference = row.values.reference ?? "";
  if (
    !/^MS-\d{5,10}$/u.test(reference) ||
    !Number.isSafeInteger(Number(reference.slice(3))) ||
    Number(reference.slice(3)) < 1 ||
    Number(reference.slice(3)) > 2147483647
  )
    issues.push("reference_format");
  const [listing] = await db.select().from(listings).where(eq(listings.reference, reference));
  let target: Target | null = null;
  let original: ListingDraft | null = null;
  let property: Property | undefined;
  if (listing) {
    if (
      !(await can(db, session.actor, "listing.read", resource(listing))) ||
      !(await can(db, session.actor, "listing.edit", resource(listing)))
    ) {
      return {
        kind: "staff_csv_v1",
        number: row.number,
        values: row.values,
        issues: [...issues, "target_unavailable"],
        fields: [],
        target: null,
        proposedDraft: null,
      };
    }
    [property] = await db.select().from(properties).where(eq(properties.id, listing.propertyId));
    if (!property) throw new AppError("not_found");
    target = snapshot(listing, property);
    const parsed = draftSchema.safeParse(listing.draft);
    // Do not flatten historical/mixed/unsupported source facts into an empty working draft.
    if (!parsed.success || sha256Json(parsed.data) !== sha256Json(listing.draft))
      issues.push("draft_manual");
    else original = parsed.data;
    if (supplied(row.values.location) && row.values.location !== property.settlement)
      issues.push("location_manual");
    if (supplied(row.values.price) && context.purpose !== listing.purpose)
      issues.push("purpose_manual");
  } else {
    if (!(await can(db, session.actor, "listing.edit"))) issues.push("target_unavailable");
    if (!supplied(row.values.location) || (row.values.location?.length ?? 0) > 150)
      issues.push("location_required");
  }
  if (
    supplied(row.values.price) &&
    (row.values.currency !== "EUR" || Number(amount(row.values.price)) <= 0)
  )
    issues.push("price_eur_positive");
  if (supplied(row.values.area) && Number(amount(row.values.area)) <= 0)
    issues.push("area_positive");
  const proposed = {
    ...(original ?? emptyDraft),
    sourceClass: "source_supplied" as const,
    sourceLanguage: context.sourceLanguage,
  };
  // Unmapped and blank cells never erase recorded facts. The original cells stay in the plan.
  proposed.title = row.values.title ?? "";
  for (const field of ["price", "area", "bedrooms"] as const) {
    if (supplied(row.values[field])) {
      proposed[field] = amount(row.values[field]);
      proposed[`${field}State`] = "known";
    }
  }
  if (supplied(row.values.area)) proposed.areaBasis = context.areaBasis;
  proposed.sourceReference = supplied(row.values.sourceUrl)
    ? (row.values.sourceUrl as string)
    : original?.sourceReference || `csv:${digest}#row=${row.number}`;
  const checked = draftSchema.safeParse(proposed);
  if (!checked.success) issues.push("draft_limits");
  const candidate = checked.success ? checked.data : null;
  const display = (draft: ListingDraft | null, field: string): string | null => {
    if (!draft) return null;
    if (field === "sourceUrl") return draft.sourceReference;
    if (field === "price") return `${draft.priceState}: ${draft.price || "—"} EUR`;
    if (field === "area") return `${draft.areaState}: ${draft.area || "—"} m² (${draft.areaBasis})`;
    if (field === "bedrooms") return `${draft.bedroomsState}: ${draft.bedrooms || "—"}`;
    return draft.title;
  };
  const fields = importFields.map((field): ImportFieldDiff => {
    const current =
      field === "reference"
        ? (listing?.reference ?? null)
        : field === "location"
          ? (property?.settlement ?? null)
          : field === "currency"
            ? original
              ? "EUR"
              : null
            : display(original, field);
    const proposed =
      field === "reference"
        ? reference
        : field === "location"
          ? row.values.location
          : field === "currency"
            ? row.values.currency
            : display(candidate, field);
    return {
      field,
      current,
      incoming: row.values[field],
      proposed,
      decision:
        !!original &&
        choiceFields.includes(field as (typeof choiceFields)[number]) &&
        supplied(row.values[field]) &&
        current !== proposed,
    };
  });
  return {
    kind: "staff_csv_v1",
    number: row.number,
    values: row.values,
    issues,
    fields,
    target,
    proposedDraft: candidate,
  };
}

async function owned(db: Executor, session: Session, id: string, lock = false) {
  const live = await importReviewer(db, session);
  const query = db
    .select()
    .from(staffImportReviews)
    .where(and(eq(staffImportReviews.id, id), eq(staffImportReviews.createdById, live.account.id)));
  const [review] = await (lock ? query.for("update") : query);
  if (!review) throw new AppError("not_found");
  return { live, review };
}
async function rowsFor(db: Executor, review: Review) {
  return db
    .select()
    .from(importRows)
    .where(eq(importRows.batchId, review.batchId))
    .orderBy(asc(importRows.rowNumber));
}
function integrity(review: Review, batch: typeof importBatches.$inferSelect, rows: Row[]) {
  if (
    sha256Hex(review.sourceText) !== review.sourceSha256 ||
    batch.sourceSha256 !== review.sourceSha256 ||
    sha256Json(rows.map(planOf)) !== review.planDigest
  )
    throw new AppError("version_conflict");
  if (
    review.selection !== null &&
    sha256Json({ planDigest: review.planDigest, selection: review.selection }) !==
      review.selectionDigest
  )
    throw new AppError("version_conflict");
}
async function checkedRows(db: Executor, review: Review) {
  const [batch] = await db.select().from(importBatches).where(eq(importBatches.id, review.batchId));
  if (!batch) throw new AppError("not_found");
  const rows = await rowsFor(db, review);
  integrity(review, batch, rows);
  return { batch, rows };
}
async function targetGrant(db: Executor, session: Session, plan: Plan) {
  await assertCan(
    db,
    session.actor,
    "listing.edit",
    plan.target ? resource({ id: plan.target.id, propertyId: plan.target.propertyId }) : undefined,
  );
  if (plan.target)
    await assertCan(
      db,
      session.actor,
      "listing.read",
      resource({ id: plan.target.id, propertyId: plan.target.propertyId }),
    );
}

/** Durable dry run: only import metadata, operation receipt and audit are written. */
export async function prepareStaffImport(
  db: Executor,
  session: Session,
  input: { token: string; mapping: ColumnMapping; context: unknown; operationKey: string },
) {
  const context = parseInput(importContextSchema, input.context);
  const operationKey = parseInput(operationKeySchema, input.operationKey);
  const source = await checkImportPreview(db, session, input.token, input.mapping);
  const live = await importReviewer(db, session);
  const result = await runOperation(
    db,
    {
      actor: live.actor,
      type: "staff_import.prepare",
      idempotencyKey: operationKey,
      requestHash: sha256Json({ digest: source.digest, mapping: input.mapping, context }),
    },
    async ({ tx, operationId }) => {
      const current = await importReviewer(tx, session);
      const plans: Plan[] = [];
      for (const row of source.rows)
        plans.push(await planRow(tx, current, row, context, source.digest));
      const [batch] = await tx
        .insert(importBatches)
        .values({
          reference: await nextReference(tx, "import_batch"),
          source: source.filename,
          scope: "O28 reviewed listing working drafts; no approval/publication",
          mode: "dry_run",
          state: "validated",
          sourceSha256: source.digest,
          fieldMapping: input.mapping,
          rowCount: plans.length,
          createdById: current.account.id,
        })
        .returning();
      if (!batch) throw new Error("Import batch insert failed");
      const [review] = await tx
        .insert(staffImportReviews)
        .values({
          batchId: batch.id,
          createdById: current.account.id,
          operationKey,
          sourceText: source.documentSource,
          sourceSha256: source.digest,
          delimiter: source.delimiter,
          context,
          planDigest: sha256Json(plans),
        })
        .returning();
      if (!review) throw new Error("Staff import insert failed");
      await tx.insert(importRows).values(
        plans.map((plan) => ({
          batchId: batch.id,
          rowNumber: plan.number,
          sourceKey: plan.values.reference ?? "",
          classification: plan.issues.length
            ? ("blocked" as const)
            : plan.target
              ? plan.fields.some((field) => field.decision)
                ? ("update_proposal" as const)
                : ("no_change" as const)
              : ("create" as const),
          targetType: "listing",
          targetId: plan.target?.id ?? null,
          diff: { plan },
          issues: plan.issues,
        })),
      );
      await recordAudit(tx, {
        actor: current.actor,
        action: "staff_import.prepared",
        capability: "import.run",
        recordType: "import_batch",
        recordId: batch.id,
        operationId,
        payload: { sourceDigest: source.digest, planDigest: review.planDigest, rows: plans.length },
      });
      return { id: review.id };
    },
  );
  return readStaffImport(db, session, result.outcome.id);
}

export async function readStaffImport(
  db: Executor,
  session: Session,
  id: string,
): Promise<ImportReceipt> {
  parseInput(z.uuid(), id);
  const { live, review } = await owned(db, session, id);
  const { batch, rows } = await checkedRows(db, review);
  const selection = (review.selection ?? []) as ImportSelection[];
  for (const row of rows) {
    const diff = row.diff as StoredDiff;
    if (diff.plan.target) await targetGrant(db, live, diff.plan);
    else if (diff.applied) {
      const target = resource({ id: diff.applied.targetId, propertyId: diff.applied.propertyId });
      await assertCan(db, live.actor, "listing.read", target);
      await assertCan(db, live.actor, "listing.edit", target);
    }
  }
  const selectedRows = rows.filter((row) =>
    selection.some((item) => item.number === row.rowNumber),
  );
  const pending = selectedRows.filter((row) => row.outcome === "pending").length;
  return {
    id: review.id,
    operationKey: review.operationKey,
    version: review.version,
    reference: batch.reference,
    filename: batch.source,
    digest: review.sourceSha256,
    planDigest: review.planDigest,
    selectionDigest: review.selectionDigest,
    context: review.context as ImportContext,
    mapping: batch.fieldMapping as ColumnMapping,
    state: review.cancelledAt
      ? "cancelled"
      : !review.reviewedAt
        ? "review"
        : !pending
          ? selectedRows.some((row) => row.outcome === "failed")
            ? "partial"
            : "completed"
          : selectedRows.some((row) => row.outcome !== "pending" || row.errorCode !== null)
            ? "partial"
            : "ready",
    rows: rows.map((row) => {
      const diff = row.diff as StoredDiff,
        selected = selection.find((item) => item.number === row.rowNumber);
      return {
        number: row.rowNumber,
        reference: row.sourceKey,
        classification: row.classification,
        issues: diff.plan.issues,
        values: diff.plan.values,
        fields: diff.plan.fields,
        targetVersion: diff.plan.target?.version ?? null,
        resultVersion: diff.applied?.version ?? null,
        receiptId: diff.receiptId ?? null,
        outcome: row.outcome,
        errorCode: row.errorCode,
        selected: !!selected,
        choices: selected?.choices ?? {},
        reversal: diff.reversal?.state ?? null,
        reversalCode: diff.reversal?.code ?? null,
      };
    }),
  };
}

function validateSelection(rows: Row[], selection: ImportSelection[]) {
  for (const selected of selection) {
    const row = rows.find((row) => row.rowNumber === selected.number),
      plan = row ? planOf(row) : null;
    if (!row || !plan || plan.issues.length || !plan.proposedDraft)
      throw new AppError("validation_failed");
    const required = plan.fields.filter((field) => field.decision).map((field) => field.field);
    if (
      required.some((field) => !selected.choices[field as (typeof choiceFields)[number]]) ||
      Object.keys(selected.choices).some(
        (field) => !required.includes(field as (typeof choiceFields)[number]),
      )
    )
      throw new AppError("validation_failed");
  }
}

export async function sealStaffImport(
  db: Executor,
  session: Session,
  input: {
    id: string;
    expectedVersion: number;
    operationKey: string;
    digest: string;
    planDigest: string;
    selection: unknown;
  },
) {
  const command = parseInput(commandSchema, {
    id: input.id,
    expectedVersion: input.expectedVersion,
    operationKey: input.operationKey,
  });
  const selection = parseInput(selectionSchema, input.selection).sort(
    (a, b) => a.number - b.number,
  );
  if (new Set(selection.map((row) => row.number)).size !== selection.length)
    throw new AppError("validation_failed");
  const { live, review: initial } = await owned(db, session, command.id);
  // Input correction creates no failed logical command. Once accepted, payload changes
  // conflict under the original operation key instead of mutating the reviewed subset.
  if (!initial.reviewedAt) validateSelection((await checkedRows(db, initial)).rows, selection);
  await runOperation(
    db,
    {
      actor: live.actor,
      type: "staff_import.review",
      idempotencyKey: `${command.operationKey}:review`,
      requestHash: sha256Json(input),
      expectedVersion: command.expectedVersion,
    },
    async ({ tx, operationId }) => {
      const { live: current, review } = await owned(tx, session, command.id, true);
      version(review, command.expectedVersion);
      if (
        review.operationKey !== command.operationKey ||
        review.reviewedAt ||
        review.cancelledAt ||
        review.sourceSha256 !== input.digest ||
        review.planDigest !== input.planDigest
      )
        throw new AppError("version_conflict");
      const { rows } = await checkedRows(tx, review);
      validateSelection(rows, selection);
      for (const selected of selection) {
        const row = rows.find((row) => row.rowNumber === selected.number),
          plan = row ? planOf(row) : null;
        if (!row || !plan || plan.issues.length || !plan.proposedDraft)
          throw new AppError("validation_failed");
        await targetGrant(tx, current, plan);
        await checkTarget(tx, current, plan);
      }
      const selectionDigest = sha256Json({ planDigest: review.planDigest, selection });
      await tx
        .update(staffImportReviews)
        .set({ selection, selectionDigest, reviewedAt: new Date(), version: review.version + 1 })
        .where(eq(staffImportReviews.id, review.id));
      await tx
        .update(importBatches)
        .set({ mode: "apply" })
        .where(eq(importBatches.id, review.batchId));
      await recordAudit(tx, {
        actor: current.actor,
        action: "staff_import.reviewed",
        capability: "import.run",
        recordType: "import_batch",
        recordId: review.batchId,
        operationId,
        payload: { sourceDigest: review.sourceSha256, selectionDigest, selection },
      });
      return { id: review.id };
    },
  );
  return readStaffImport(db, session, command.id);
}

function chosenDraft(plan: Plan, selected: ImportSelection): ListingDraft {
  if (!plan.proposedDraft) throw new AppError("validation_failed");
  const draft = { ...plan.proposedDraft };
  const before = plan.target?.draft as ListingDraft | undefined;
  if (before) {
    if (!Object.values(selected.choices).includes("source")) return { ...before };
    // Preserve each existing field unless the reviewed change explicitly uses the source.
    for (const field of choiceFields) {
      if (selected.choices[field] === "source") continue;
      if (field === "sourceUrl") draft.sourceReference = before.sourceReference;
      else if (field === "title") draft.title = before.title;
      else {
        draft[field] = before[field];
        draft[`${field}State`] = before[`${field}State`];
        if (field === "area") draft.areaBasis = before.areaBasis;
      }
    }
    // One source language/class cannot relabel facts retained from a different source.
    draft.sourceClass = "source_supplied";
  }
  return draft;
}
async function checkTarget(tx: Transaction, session: Session, plan: Plan) {
  await targetGrant(tx, session, plan);
  if (!plan.target) {
    const [exists] = await tx
      .select({ id: listings.id })
      .from(listings)
      .where(eq(listings.reference, plan.values.reference ?? ""));
    if (exists) throw new AppError("version_conflict");
    return null;
  }
  const [listing] = await tx
    .select()
    .from(listings)
    .where(eq(listings.id, plan.target.id))
    .for("update");
  const [property] = await tx
    .select()
    .from(properties)
    .where(eq(properties.id, plan.target.propertyId))
    .for("update");
  if (!listing || !property || sha256Json(snapshot(listing, property)) !== sha256Json(plan.target))
    throw new AppError("version_conflict");
  return { listing, property };
}
async function changeLog(
  tx: Transaction,
  session: Session,
  review: Review,
  row: Row,
  operationId: string,
  action: string,
  payload: Record<string, unknown>,
) {
  await recordAudit(tx, {
    actor: session.actor,
    action,
    capability: "import.run",
    recordType: "import_batch",
    recordId: review.batchId,
    operationId,
    payload: {
      row: row.rowNumber,
      sourceDigest: review.sourceSha256,
      selectionDigest: review.selectionDigest,
      ...payload,
    },
  });
  await recordOutboxEvent(tx, {
    eventType: action,
    subjectType: "import_batch",
    subjectId: review.batchId,
    operationId,
    payload: { rowId: row.id, targetId: row.targetId },
  });
}
async function batchProgress(tx: Transaction, review: Review) {
  const rows = (await rowsFor(tx, review)).filter((row) =>
    (review.selection as ImportSelection[]).some((item) => item.number === row.rowNumber),
  );
  const pending = rows.some((row) => row.outcome === "pending"),
    failed = rows.some((row) => row.outcome === "failed");
  await tx
    .update(importBatches)
    .set({
      state: pending
        ? rows.some((row) => row.outcome !== "pending")
          ? "partially_completed"
          : "applying"
        : failed
          ? "partially_completed"
          : "completed",
      startedAt: sql`coalesce(${importBatches.startedAt}, now())`,
      finishedAt: pending ? null : new Date(),
    })
    .where(eq(importBatches.id, review.batchId));
}

/** Bounded request, per-row commits. A transport loss is reconciled by reading the same id;
 * an identical resume only visits pending rows of this sealed subset. No external work runs. */
export async function executeStaffImport(
  db: Executor,
  session: Session,
  input: { id: string; expectedVersion: number; operationKey: string },
  options: { limit?: number; beforeCommit?: (rowNumber: number) => Promise<void> } = {},
) {
  const command = parseInput(commandSchema, input);
  const { review } = await owned(db, session, command.id);
  version(review, command.expectedVersion);
  if (review.operationKey !== command.operationKey || !review.reviewedAt)
    throw new AppError("version_conflict");
  const { rows } = await checkedRows(db, review);
  const selection = review.selection as ImportSelection[];
  const pending = rows
    .filter(
      (row) => row.outcome === "pending" && selection.some((item) => item.number === row.rowNumber),
    )
    .slice(0, Math.max(1, Math.min(options.limit ?? 10, 10)));
  for (const row of pending) {
    try {
      await db.transaction(async (tx) => {
        const { live, review: current } = await owned(tx, session, command.id, true);
        version(current, command.expectedVersion);
        if (current.cancelledAt) return;
        const { rows: currentRows } = await checkedRows(tx, current);
        const currentRow = currentRows.find((item) => item.id === row.id);
        if (currentRow?.outcome !== "pending") return;
        const plan = planOf(currentRow),
          selected = (current.selection as ImportSelection[]).find(
            (item) => item.number === row.rowNumber,
          );
        if (!selected || plan.issues.length) throw new AppError("validation_failed");
        // The current grant check precedes even an idempotent replay.
        await targetGrant(tx, live, plan);
        try {
          await runOperation(
            tx,
            {
              actor: live.actor,
              type: "staff_import.row",
              idempotencyKey: `${current.operationKey}:${row.rowNumber}`,
              requestHash: sha256Json({ selectionDigest: current.selectionDigest, plan }),
              subject: { type: "import_batch", id: current.batchId },
            },
            async ({ tx: rowTx, operationId }) => {
              const target = await checkTarget(rowTx, live, plan),
                draft = chosenDraft(plan, selected);
              let applied: Applied | undefined;
              if (target && sha256Json(draft) === sha256Json(target.listing.draft)) {
                await changeLog(
                  rowTx,
                  live,
                  current,
                  currentRow,
                  operationId,
                  "staff_import.row.unchanged",
                  {},
                );
              } else {
                let listing: Listing, property: Property;
                if (target) {
                  property = target.property;
                  const [saved] = await rowTx
                    .update(listings)
                    .set({ draft, version: target.listing.version + 1 })
                    .where(eq(listings.id, target.listing.id))
                    .returning();
                  if (!saved) throw new Error("Import draft update failed");
                  listing = saved;
                } else {
                  const context = current.context as ImportContext;
                  const [createdProperty] = await rowTx
                    .insert(properties)
                    .values({
                      reference: await nextReference(rowTx, "property"),
                      propertyType: context.propertyType,
                      country: context.country,
                      region: context.region,
                      settlement: plan.values.location as string,
                      publicPrecision: "settlement",
                    })
                    .returning();
                  if (!createdProperty) throw new Error("Import property insert failed");
                  property = createdProperty;
                  const [created] = await rowTx
                    .insert(listings)
                    .values({
                      reference: plan.values.reference as string,
                      propertyId: property.id,
                      purpose: context.purpose,
                      draft,
                    })
                    .returning();
                  if (!created) throw new Error("Import listing insert failed");
                  listing = created;
                  await rowTx
                    .insert(referenceSequences)
                    .values({
                      kind: "listing",
                      year: 0,
                      lastValue: Number(listing.reference.slice(3)),
                    })
                    .onConflictDoUpdate({
                      target: [referenceSequences.kind, referenceSequences.year],
                      set: {
                        lastValue: sql`greatest(${referenceSequences.lastValue}, excluded.last_value)`,
                      },
                    });
                }
                applied = {
                  targetId: listing.id,
                  propertyId: property.id,
                  version: listing.version,
                  propertyVersion: property.version,
                  draftDigest: sha256Json(draft),
                };
                await changeLog(
                  rowTx,
                  live,
                  current,
                  { ...currentRow, targetId: listing.id },
                  operationId,
                  "staff_import.row.applied",
                  {
                    targetId: listing.id,
                    targetVersion: listing.version,
                    choices: selected.choices,
                  },
                );
              }
              await rowTx
                .update(importRows)
                .set({
                  outcome: applied ? "applied" : "skipped",
                  appliedAt: applied ? new Date() : null,
                  targetId: applied?.targetId ?? currentRow.targetId,
                  diff: { plan, receiptId: operationId, ...(applied ? { applied } : {}) },
                  errorCode: null,
                })
                .where(eq(importRows.id, currentRow.id));
              if (options.beforeCommit) await options.beforeCommit(row.rowNumber);
              return { row: row.rowNumber, outcome: applied ? "applied" : "skipped" };
            },
          );
        } catch (error) {
          if (
            !isAppError(error) ||
            error.retryable ||
            error.outcome === "unknown" ||
            ["unauthenticated", "forbidden", "not_found"].includes(error.code)
          )
            throw error;
          const [failed] = await tx
            .select({ id: operations.id })
            .from(operations)
            .where(
              and(
                eq(operations.actorId, live.actor.id),
                eq(operations.operationType, "staff_import.row"),
                eq(operations.idempotencyKey, `${current.operationKey}:${row.rowNumber}`),
              ),
            );
          if (!failed) throw error;
          await tx
            .update(importRows)
            .set({ outcome: "failed", errorCode: error.code, diff: { plan, receiptId: failed.id } })
            .where(eq(importRows.id, row.id));
          await changeLog(tx, live, current, currentRow, failed.id, "staff_import.row.failed", {
            reason: error.code,
          });
        }
        await batchProgress(tx, current);
      });
    } catch (error) {
      if (isAppError(error) && ["unauthenticated", "forbidden", "not_found"].includes(error.code))
        throw error;
      // An interrupted request reconciles by the durable row result. If COMMIT succeeded
      // despite a lost acknowledgement, its applied outcome wins over this pending marker.
      await db.transaction(async (tx) => {
        const { live, review: current } = await owned(tx, session, command.id, true);
        if (current.cancelledAt) return;
        const [interrupted] = await tx
          .update(importRows)
          .set({ errorCode: "unavailable" })
          .where(and(eq(importRows.id, row.id), eq(importRows.outcome, "pending")))
          .returning({ id: importRows.id });
        if (interrupted)
          await recordAudit(tx, {
            actor: live.actor,
            action: "staff_import.row.interrupted",
            capability: "import.run",
            recordType: "import_batch",
            recordId: current.batchId,
            payload: {
              operationKey: current.operationKey,
              row: row.rowNumber,
              reason: "unavailable",
            },
          });
      });
      break;
    }
  }
  return readStaffImport(db, session, command.id);
}

export async function cancelStaffImport(
  db: Executor,
  session: Session,
  input: { id: string; expectedVersion: number; operationKey: string },
) {
  const command = parseInput(commandSchema, input);
  await db.transaction(async (tx) => {
    const { live, review } = await owned(tx, session, command.id, true);
    if (review.operationKey !== command.operationKey) throw new AppError("version_conflict");
    if (review.cancelledAt) return;
    version(review, command.expectedVersion);
    await tx
      .update(staffImportReviews)
      .set({ cancelledAt: new Date(), version: review.version + 1 })
      .where(eq(staffImportReviews.id, review.id));
    await tx
      .update(importBatches)
      .set({ state: "cancelled", finishedAt: new Date() })
      .where(eq(importBatches.id, review.batchId));
    await recordAudit(tx, {
      actor: live.actor,
      action: "staff_import.cancelled",
      capability: "import.run",
      recordType: "import_batch",
      recordId: review.batchId,
      payload: { operationKey: review.operationKey, stops: "unstarted_rows_only" },
    });
  });
  return readStaffImport(db, session, command.id);
}

/** Check every actual FK, including future schema additions, while parents are locked. */
async function hasDependants(
  tx: Transaction,
  table: "listings" | "properties",
  id: string,
  ownListing?: string,
) {
  const references = await tx.execute<{ tableName: string; columnName: string }>(
    sql`select c.conrelid::regclass::text as "tableName", a.attname as "columnName" from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1] where c.contype='f' and c.confrelid=${table}::regclass`,
  );
  for (const reference of references) {
    const relation = sql.join(
      reference.tableName
        .replaceAll('"', "")
        .split(".")
        .map((name) => sql.identifier(name)),
      sql`.`,
    );
    const excluded =
      table === "properties" && reference.tableName === "listings" && ownListing
        ? sql`and id <> ${ownListing}::uuid`
        : sql``;
    const [found] = await tx.execute<{ present: boolean }>(
      sql`select exists(select 1 from ${relation} where ${sql.identifier(reference.columnName)}=${id}::uuid ${excluded}) as present`,
    );
    if (found?.present) return true;
  }
  return false;
}

/** Reversal preserves the source, row receipt, prior draft and identities. Creates become
 * withdrawn empty shells; later edits, revisions or dependencies block automatic reversal. */
export async function reverseStaffImport(
  db: Executor,
  session: Session,
  input: { id: string; expectedVersion: number; operationKey: string },
) {
  const command = parseInput(commandSchema, input);
  const { review } = await owned(db, session, command.id);
  version(review, command.expectedVersion);
  if (review.operationKey !== command.operationKey || !review.reviewedAt)
    throw new AppError("version_conflict");
  const { rows } = await checkedRows(db, review);
  for (const row of rows
    .filter((row) => row.outcome === "applied" && !(row.diff as StoredDiff).reversal)
    .slice(0, 10)) {
    await db.transaction(async (tx) => {
      const { live, review: current } = await owned(tx, session, command.id, true);
      version(current, command.expectedVersion);
      const { rows: currentRows } = await checkedRows(tx, current);
      const currentRow = currentRows.find((item) => item.id === row.id);
      if (!currentRow) throw new AppError("not_found");
      const diff = currentRow.diff as StoredDiff;
      if (diff.reversal || !diff.applied) return;
      const applied = diff.applied;
      await assertCan(
        tx,
        live.actor,
        "listing.edit",
        resource({ id: applied.targetId, propertyId: applied.propertyId }),
      );
      await assertCan(
        tx,
        live.actor,
        "listing.read",
        resource({ id: applied.targetId, propertyId: applied.propertyId }),
      );
      await runOperation(
        tx,
        {
          actor: live.actor,
          type: "staff_import.reverse",
          idempotencyKey: `${current.operationKey}:${row.rowNumber}:reverse`,
          requestHash: sha256Json({ selectionDigest: current.selectionDigest, applied }),
          subject: { type: "import_batch", id: current.batchId },
        },
        async ({ tx: rowTx, operationId }) => {
          const [listing] = await rowTx
            .select()
            .from(listings)
            .where(eq(listings.id, applied.targetId))
            .for("update");
          const [property] = await rowTx
            .select()
            .from(properties)
            .where(eq(properties.id, applied.propertyId))
            .for("update");
          let code: string | null =
            !listing ||
            !property ||
            listing.version !== applied.version ||
            property.version !== applied.propertyVersion ||
            sha256Json(listing.draft) !== applied.draftDigest
              ? "target_changed"
              : null;
          if (
            !code &&
            listing &&
            (listing.latestRevisionNumber !== (diff.plan.target?.latestRevisionNumber ?? 0) ||
              listing.approvedRevisionId !== (diff.plan.target?.approvedRevisionId ?? null) ||
              listing.publicationGeneration !== (diff.plan.target?.publicationGeneration ?? 0))
          )
            code = "target_changed";
          if (
            !code &&
            !diff.plan.target &&
            ((await hasDependants(rowTx, "listings", applied.targetId)) ||
              (await hasDependants(rowTx, "properties", applied.propertyId, applied.targetId)))
          )
            code = "dependent_records";
          if (!code && listing)
            await rowTx
              .update(listings)
              .set({
                draft: diff.plan.target?.draft ?? {},
                ...(diff.plan.target ? {} : { commercialState: "withdrawn" as const }),
                version: listing.version + 1,
              })
              .where(eq(listings.id, listing.id));
          const reversal = { state: code ? ("blocked" as const) : ("reversed" as const), code };
          await rowTx
            .update(importRows)
            .set({ diff: { ...diff, reversal } })
            .where(eq(importRows.id, currentRow.id));
          await changeLog(
            rowTx,
            live,
            current,
            currentRow,
            operationId,
            code ? "staff_import.reversal.blocked" : "staff_import.row.reversed",
            { targetId: applied.targetId, reason: code },
          );
          return reversal;
        },
      );
    });
  }
  return readStaffImport(db, session, command.id);
}

export async function recentStaffImports(db: Executor, session: Session) {
  const live = await importReviewer(db, session);
  return db
    .select({
      id: staffImportReviews.id,
      operationKey: staffImportReviews.operationKey,
      reference: importBatches.reference,
    })
    .from(staffImportReviews)
    .innerJoin(importBatches, eq(importBatches.id, staffImportReviews.batchId))
    .where(eq(staffImportReviews.createdById, live.account.id))
    .orderBy(sql`${staffImportReviews.createdAt} desc`)
    .limit(10);
}
